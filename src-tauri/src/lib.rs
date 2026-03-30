use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct SidecarProcess(Mutex<Option<Child>>);

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
    // native addons in node_modules resolve correctly
    let sidecar_dir = resource_dir.join("sidecar-bundle");
    let child = Command::new("node")
        .arg(&sidecar_script)
        .current_dir(&sidecar_dir)
        .env("NODE_PATH", sidecar_dir.join("node_modules"))
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit())
        .spawn()?;

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
