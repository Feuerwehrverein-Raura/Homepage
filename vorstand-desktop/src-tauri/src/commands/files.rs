use std::io::Write;

/// Schreibt die uebergebenen Bytes in eine Temp-Datei und oeffnet sie im
/// Standard-Programm des Betriebssystems (z.B. PDF-Viewer). Zuverlaessiger als
/// ein `<a download>`-Klick, der im Tauri-Webview nicht funktioniert.
#[tauri::command]
pub fn open_file(data: Vec<u8>, filename: String) -> Result<(), String> {
    let safe: String = filename
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '.' || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let safe = if safe.is_empty() { "datei".to_string() } else { safe };

    let mut path = std::env::temp_dir();
    path.push(format!("fwv_{}", safe));

    let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(&data).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;

    open::that(&path).map_err(|e| e.to_string())?;
    Ok(())
}
