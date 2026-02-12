const axios = require('axios');

class MailcowService {
    constructor(apiUrl, apiKey) {
        this.apiUrl = apiUrl || 'https://mail.test.juroct.net';
        this.apiKey = apiKey;
    }

    async api(method, endpoint, data = null) {
        const config = {
            method,
            url: `${this.apiUrl}/api/v1${endpoint}`,
            headers: {
                'X-API-Key': this.apiKey,
                'Content-Type': 'application/json'
            }
        };
        if (data) config.data = data;
        return axios(config);
    }

    async blockSenderEmail(email) {
        return this.api('POST', '/add/domain-policy', {
            domain: 'fwv-raura.ch',
            object_from: email,
            object_list: 'bl'
        });
    }

    async blockSenderDomain(domain) {
        return this.api('POST', '/add/domain-policy', {
            domain: 'fwv-raura.ch',
            object_from: `@${domain}`,
            object_list: 'bl'
        });
    }

    async getBlacklist() {
        const response = await this.api('GET', '/get/policy/domain/fwv-raura.ch');
        const data = Array.isArray(response.data) ? response.data : [];
        return data.filter(p => p.object_list === 'bl');
    }

    async removeBlacklistEntry(prefid) {
        return this.api('POST', '/delete/domain-policy', [prefid]);
    }
}

module.exports = MailcowService;
