use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde_json::Value;

const SERVICE_NAME: &str = "ch.fwvraura.vorstand.desktop";

#[tauri::command]
pub fn save_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, "jwt_token").map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn load_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, "jwt_token").map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn clear_token() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, "jwt_token").map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn check_token_expiry(token: String) -> Result<bool, String> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return Err("Invalid JWT format".into());
    }

    let payload = BASE64
        .decode(add_padding(parts[1]))
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let claims: Value =
        serde_json::from_slice(&payload).map_err(|e| format!("JSON parse error: {}", e))?;

    let exp = claims["exp"]
        .as_i64()
        .ok_or("Missing exp claim")?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;

    Ok(now < exp)
}

fn add_padding(input: &str) -> String {
    let remainder = input.len() % 4;
    if remainder == 0 {
        input.to_string()
    } else {
        format!("{}{}", input, "=".repeat(4 - remainder))
    }
}
