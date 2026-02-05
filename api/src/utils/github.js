/**
 * github.js - GitHub API Wrapper für Datei-Operationen
 *
 * Verwendet Octokit für GitHub REST API Aufrufe.
 * Ermöglicht das Lesen und Schreiben von JSON-Dateien
 * direkt im GitHub Repository.
 *
 * Konfiguration über Umgebungsvariablen:
 * - GITHUB_TOKEN: Personal Access Token mit repo-Rechten
 * - GITHUB_OWNER: Repository-Besitzer (z.B. 'feuerwehrverein-raura')
 * - GITHUB_REPO: Repository-Name (z.B. 'Homepage')
 */
const { Octokit } = require('@octokit/rest');

// Octokit-Instanz mit Authentifizierung
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

// Repository-Koordinaten aus Umgebungsvariablen
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

/**
 * Liest Datei-Inhalt aus GitHub Repository
 *
 * @param {string} path - Dateipfad im Repository (z.B. 'mitglieder_data.json')
 * @returns {Promise<{content: string, sha: string}|null>}
 *          Inhalt + SHA für Updates, oder null wenn nicht gefunden
 */
async function getFile(path) {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path
        });

        // GitHub liefert Base64-kodierten Inhalt
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return { content, sha: data.sha };  // SHA wird für Updates benötigt
    } catch (error) {
        if (error.status === 404) {
            return null;  // Datei existiert nicht
        }
        throw error;
    }
}

/**
 * Erstellt oder aktualisiert eine Datei im GitHub Repository
 *
 * @param {string} path - Dateipfad im Repository
 * @param {string} content - Neuer Datei-Inhalt
 * @param {string} message - Commit-Nachricht
 * @param {string} [sha] - SHA der bestehenden Datei (für Updates erforderlich)
 * @returns {Promise<Object>} GitHub API Response mit Commit-Details
 */
async function updateFile(path, content, message, sha) {
    // Inhalt muss Base64-kodiert sein
    const contentBase64 = Buffer.from(content).toString('base64');

    const params = {
        owner,
        repo,
        path,
        message,
        content: contentBase64
    };

    // SHA nur bei Updates hinzufügen (Konflikt-Erkennung)
    if (sha) {
        params.sha = sha;
    }

    const { data } = await octokit.repos.createOrUpdateFileContents(params);
    return data;
}

/**
 * Lädt JSON-Datei aus GitHub und parst sie
 *
 * @param {string} path - Dateipfad im Repository
 * @returns {Promise<{data: Object|null, sha: string|null}>}
 */
async function loadJSON(path) {
    const file = await getFile(path);
    if (!file) {
        return { data: null, sha: null };
    }
    return { data: JSON.parse(file.content), sha: file.sha };
}

/**
 * Speichert Objekt als JSON-Datei in GitHub
 *
 * @param {string} path - Dateipfad im Repository
 * @param {Object} data - Zu speicherndes Objekt
 * @param {string} message - Commit-Nachricht
 * @param {string} [sha] - SHA für Update
 * @returns {Promise<Object>} GitHub API Response
 */
async function saveJSON(path, data, message, sha) {
    const content = JSON.stringify(data, null, 2);  // Pretty-Print
    return await updateFile(path, content, message, sha);
}

module.exports = {
    getFile,
    updateFile,
    loadJSON,
    saveJSON
};
