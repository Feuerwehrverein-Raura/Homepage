import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Prueft beim App-Start ob ein Update verfuegbar ist. Bei Treffer wird der User
 * per confirm() gefragt; bei Zustimmung wird das Update geladen, installiert
 * und die App neu gestartet.
 *
 * Voraussetzung: tauri.conf.json hat einen gueltigen pubkey + endpoints,
 * und das CI-Release publiziert latest.json + signierte Bundles auf GitHub.
 *
 * Fehler werden geloggt aber nicht propagiert — die App startet auch wenn
 * der Update-Check fehlschlaegt (Offline, GitHub down, etc.).
 */
export async function checkForUpdates(silent = false): Promise<void> {
    try {
        const update = await check();
        if (!update) {
            if (!silent) console.log("[Updater] Schon auf neustem Stand.");
            return;
        }
        const yes = confirm(
            `Update verfügbar: ${update.version}` +
            (update.body ? `\n\n${update.body}` : "") +
            `\n\nJetzt installieren?`
        );
        if (!yes) return;

        let downloaded = 0;
        let total = 0;
        await update.downloadAndInstall((event) => {
            if (event.event === "Started") total = event.data.contentLength || 0;
            else if (event.event === "Progress") downloaded += event.data.chunkLength;
            else if (event.event === "Finished") console.log("[Updater] Download fertig.");
        });
        console.log(`[Updater] ${downloaded}/${total} bytes geladen, starte neu`);
        await relaunch();
    } catch (err) {
        console.error("[Updater] failed:", err);
        if (!silent) alert("Update-Check fehlgeschlagen: " + (err as Error).message);
    }
}
