use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarProcess(Mutex<Option<Child>>);

/// Resolve the user's full login-shell environment so the sidecar
/// (and PTYs it spawns) inherit TERM, COLORTERM, LANG, PATH, etc.
/// Desktop-launched apps have a minimal environment — this restores it.
fn resolve_shell_env() -> std::collections::HashMap<String, String> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".into());
    let output = Command::new(&shell)
        .args(["-lc", "env"])
        .output()
        .ok();

    let mut env_map = std::collections::HashMap::new();
    if let Some(out) = output {
        let env_str = String::from_utf8_lossy(&out.stdout);
        for line in env_str.lines() {
            if let Some((key, val)) = line.split_once('=') {
                // Skip vars that would interfere with the sidecar process itself
                if !matches!(key, "_" | "SHLVL" | "PWD" | "OLDPWD") {
                    env_map.insert(key.to_string(), val.to_string());
                }
            }
        }
    }
    env_map
}

fn spawn_sidecar(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = app.path().resource_dir()?;
    let sidecar_script = resource_dir.join("sidecar-bundle").join("dist").join("index.js");

    if !sidecar_script.exists() {
        eprintln!(
            "[cortex] Sidecar not found at {} — the app will not work without it",
            sidecar_script.display()
        );
        return Ok(());
    }

    // Spawn node with the sidecar script; set CWD to sidecar dir so
    // native addons in node_modules resolve correctly.
    // Desktop-launched apps have a minimal environment, so we resolve
    // the user's full login-shell env and pass it to the sidecar.
    // This ensures PTYs spawned by the sidecar have TERM, COLORTERM,
    // LANG, PATH, etc. — making Claude Code render colors properly.
    let sidecar_dir = resource_dir.join("sidecar-bundle");
    let shell_env = resolve_shell_env();

    let mut cmd = Command::new("node");
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
