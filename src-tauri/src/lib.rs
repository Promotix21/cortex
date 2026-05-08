use std::net::TcpStream;
use std::process::{Command, Child};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

struct SidecarProcess(Mutex<Option<Child>>);

/// Resolve the user's full login-shell environment.
/// On Linux/macOS, it uses the login shell to restore the full environment.
/// On Windows, it returns the current process environment as it is usually sufficient.
fn resolve_shell_env() -> std::collections::HashMap<String, String> {
    let mut env_map = std::collections::HashMap::new();

    #[cfg(not(windows))]
    {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
        let output = Command::new(&shell)
            .args(["-lc", "env"])
            .output()
            .ok();

        if let Some(out) = output {
            let env_str = String::from_utf8_lossy(&out.stdout);
            for line in env_str.lines() {
                if let Some((key, val)) = line.split_once('=') {
                    if !matches!(key, "_" | "SHLVL" | "PWD" | "OLDPWD") {
                        env_map.insert(key.to_string(), val.to_string());
                    }
                }
            }
        }
    }

    #[cfg(windows)]
    {
        for (key, val) in std::env::vars() {
            env_map.insert(key, val);
        }
    }

    env_map
}

/// Kill any process currently holding port 4700.
fn kill_orphan_sidecar() {
    #[cfg(not(windows))]
    {
        // Use fuser on Linux/macOS
        let _ = Command::new("fuser")
            .args(["-k", "-TERM", "4700/tcp"])
            .output();
    }

    #[cfg(windows)]
    {
        // On Windows, use netstat to find PID and taskkill to kill it
        let output = Command::new("cmd")
            .args(["/C", "netstat -ano | findstr :4700"])
            .output()
            .ok();

        if let Some(out) = output {
            let res = String::from_utf8_lossy(&out.stdout);
            for line in res.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pid) = parts.last() {
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", pid])
                        .output();
                }
            }
        }
    }

    // Give the OS a moment to release the port
    std::thread::sleep(Duration::from_millis(500));
}

fn spawn_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // Kill any orphaned sidecar from a previous session before spawning a new one.
    kill_orphan_sidecar();

    let resource_dir = app.path().resource_dir()?;
    let sidecar_script = resource_dir.join("sidecar-bundle").join("dist").join("index.js");

    if !sidecar_script.exists() {
        eprintln!(
            "[cortex] Sidecar not found at {} — the app will not work without it",
            sidecar_script.display()
        );
        return Ok(());
    }

    let sidecar_dir = resource_dir.join("sidecar-bundle");
    let shell_env = resolve_shell_env();

    // Use "node" on Unix, "node.exe" on Windows
    let node_cmd = if cfg!(windows) { "node.exe" } else { "node" };

    let mut cmd = Command::new(node_cmd);
    cmd.arg(&sidecar_script)
        .current_dir(&sidecar_dir)
        .env_clear()
        .envs(&shell_env)
        .env("NODE_PATH", sidecar_dir.join("node_modules"))
        .env("TERM", "xterm-256color")
        .env("COLORTERM", "truecolor")
        .env("FORCE_COLOR", "3")
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    #[cfg(windows)]
    {
        // On Windows, Command::new doesn't automatically look in PATH if it's cleared
        // but we are setting envs(&shell_env) which should contain PATH.
        // We also want to hide the console window for the sidecar process.
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    if let Some(path) = shell_env.get("PATH") {
        println!("[cortex] Sidecar PATH: {path}");
    }

    let child = cmd.spawn()?;


    println!(
        "[cortex] Sidecar spawned (pid {}) from {}",
        child.id(),
        sidecar_script.display()
    );
    app.state::<SidecarProcess>()
        .0
        .lock()
        .unwrap()
        .replace(child);

    // Wait for the sidecar to bind port 4700 before returning — this
    // prevents the WebView from starting its health-check loop before
    // Node is ready, eliminating the race-condition "Connection refused" screen.
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        // Check both IPv4 and IPv6 — sidecar listens dual-stack on ::
        let ready = TcpStream::connect("127.0.0.1:4700").is_ok()
            || TcpStream::connect("[::1]:4700").is_ok();
        if ready {
            println!("[cortex] Sidecar ready on port 4700");
            break;
        }
        if Instant::now() >= deadline {
            eprintln!("[cortex] Sidecar did not bind port 4700 within 30s — continuing anyway");
            break;
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    Ok(())
}

fn kill_sidecar(state: &SidecarProcess) {
    if let Some(mut child) = state.0.lock().unwrap().take() {
        let pid = child.id();
        let _ = child.kill();
        let _ = child.wait();
        println!("[cortex] Sidecar (pid {pid}) terminated");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarProcess(Mutex::new(None)))
        .setup(|app| {
            // In release builds, spawn the sidecar Express server.
            // In debug (tauri dev), the sidecar is started separately.
            if cfg!(not(debug_assertions)) {
                if let Err(e) = spawn_sidecar(app) {
                    eprintln!("[cortex] Failed to spawn sidecar: {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                kill_sidecar(window.app_handle().state::<SidecarProcess>().inner());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
