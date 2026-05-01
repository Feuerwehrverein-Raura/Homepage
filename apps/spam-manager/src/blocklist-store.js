const fs = require('fs');
const path = require('path');

class BlocklistStore {
    constructor(filePath) {
        this.filePath = filePath || '/app/data/blocklist.json';
        this.ensureFile();
    }

    ensureFile() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify({ entries: [] }, null, 2));
        }
    }

    load() {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    }

    save(data) {
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    }

    addEntry(entry) {
        const data = this.load();
        const newEntry = {
            id: Date.now().toString(),
            type: entry.type,
            value: entry.value,
            blockedBy: entry.blockedBy,
            blockedAt: new Date().toISOString(),
            reportUid: entry.reportUid || null,
            mailcowPolicyId: entry.mailcowPolicyId || null
        };
        data.entries.push(newEntry);
        this.save(data);
        return newEntry;
    }

    removeEntry(id) {
        const data = this.load();
        data.entries = data.entries.filter(e => e.id !== id);
        this.save(data);
    }

    getAll() {
        return this.load().entries;
    }

    getBlockedIps() {
        return this.getAll().filter(e => e.type === 'ip').map(e => e.value);
    }
}

module.exports = BlocklistStore;
