import { invoke } from "@tauri-apps/api/core";

/**
 * Oeffnet eine Datei (PDF, XLSX, Anhang, ...) im Standard-Programm des Systems.
 *
 * Nutzt den Rust-Command `open_file` (schreibt eine Temp-Datei + OS-Open), weil
 * ein `<a download>`-Klick im Tauri-Webview nicht zuverlaessig funktioniert
 * (Vorschau/PDF-Download taten scheinbar "nichts").
 */
export async function openFile(blob: Blob, filename: string): Promise<void> {
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  await invoke("open_file", { data: bytes, filename });
}
