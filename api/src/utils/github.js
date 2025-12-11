const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;

/**
 * Get file content from GitHub
 * @param {string} path - File path in repository
 */
async function getFile(path) {
    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path
        });

        const content = Buffer.from(data.content, 'base64').toString('utf8');
        return { content, sha: data.sha };
    } catch (error) {
        if (error.status === 404) {
            return null;
        }
        throw error;
    }
}

/**
 * Update or create file in GitHub
 * @param {string} path - File path in repository
 * @param {string} content - File content
 * @param {string} message - Commit message
 * @param {string} sha - File SHA (for updates)
 */
async function updateFile(path, content, message, sha) {
    const contentBase64 = Buffer.from(content).toString('base64');

    const params = {
        owner,
        repo,
        path,
        message,
        content: contentBase64
    };

    if (sha) {
        params.sha = sha;
    }

    const { data } = await octokit.repos.createOrUpdateFileContents(params);
    return data;
}

/**
 * Load JSON file from GitHub
 */
async function loadJSON(path) {
    const file = await getFile(path);
    if (!file) {
        return { data: null, sha: null };
    }
    return { data: JSON.parse(file.content), sha: file.sha };
}

/**
 * Save JSON file to GitHub
 */
async function saveJSON(path, data, message, sha) {
    const content = JSON.stringify(data, null, 2);
    return await updateFile(path, content, message, sha);
}

module.exports = {
    getFile,
    updateFile,
    loadJSON,
    saveJSON
};
