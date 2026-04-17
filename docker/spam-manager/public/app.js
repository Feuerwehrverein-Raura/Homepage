const AUTHENTIK_URL = 'https://auth.fwv-raura.ch';
const AUTHENTIK_APP_SLUG = 'spam-manager';
let currentTab = 'reports';

// === AUTH ===

function getToken() {
    return localStorage.getItem('auth_token');
}

function checkAuth() {
    const token = getToken();
    if (!token) {
        redirectToLogin();
        return false;
    }
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('auth_token');
            redirectToLogin();
            return false;
        }
        document.getElementById('user-name').textContent = payload.name || payload.email || '';
    } catch (e) {
        redirectToLogin();
        return false;
    }
    return true;
}

function redirectToLogin() {
    const clientId = new URLSearchParams(window.location.search).get('client_id') || AUTHENTIK_APP_SLUG;
    const redirectUri = encodeURIComponent(window.location.origin + '/auth-callback.html');
    const state = encodeURIComponent('/');
    window.location.href = `${AUTHENTIK_URL}/application/o/authorize/?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=openid+profile+email+groups&state=${state}`;
}

function logout() {
    localStorage.removeItem('auth_token');
    window.location.href = `${AUTHENTIK_URL}/application/o/${AUTHENTIK_APP_SLUG}/end-session/`;
}

async function apiCall(url, options = {}) {
    const token = getToken();
    if (!token) { redirectToLogin(); return null; }
    const res = await fetch(url, {
        ...options,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers }
    });
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('auth_token');
        redirectToLogin();
        return null;
    }
    return res;
}

// === TABS ===

function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('border-fire-700', 'text-fire-700');
        b.classList.add('border-transparent', 'text-gray-500');
    });
    document.getElementById(`tab-${tab}`).classList.remove('border-transparent', 'text-gray-500');
    document.getElementById(`tab-${tab}`).classList.add('border-fire-700', 'text-fire-700');

    document.getElementById('panel-reports').classList.toggle('hidden', tab !== 'reports');
    document.getElementById('panel-blocklist').classList.toggle('hidden', tab !== 'blocklist');
    document.getElementById('panel-dmarc').classList.toggle('hidden', tab !== 'dmarc');

    if (tab === 'reports') loadReports();
    if (tab === 'blocklist') loadBlocklist();
    if (tab === 'dmarc') loadDmarc();
}

// === REPORTS ===

async function loadReports() {
    show('reports-loading'); hide('reports-table'); hide('reports-empty');
    const res = await apiCall('/api/reports');
    if (!res) return;
    const reports = await res.json();
    hide('reports-loading');

    document.getElementById('reports-count').textContent = reports.length || '';

    if (reports.length === 0) {
        show('reports-empty');
        return;
    }

    const html = `
        <div class="bg-white rounded-lg shadow overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Absender</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Betreff</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Server-IPs</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auth</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gemeldet von</th>
                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${reports.map(r => reportRow(r)).join('')}
                </tbody>
            </table>
        </div>`;

    document.getElementById('reports-table').innerHTML = html;
    show('reports-table');
}

function reportRow(r) {
    const date = r.date ? formatDate(r.date) : '-';
    const from = escHtml(r.from?.address || 'unknown');
    const domain = escHtml(r.senderDomain || '');
    const subject = escHtml(r.subject || '');
    const ips = (r.serverIps || []).map(ip => `<span class="inline-block bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded mr-1">${escHtml(ip)}</span>`).join('') || '<span class="text-gray-400 text-xs">-</span>';
    const auth = authBadges(r);
    const forwarder = r.forwardedBy ? escHtml(r.forwardedBy) : '<span class="text-gray-400">-</span>';

    return `<tr class="hover:bg-gray-50 cursor-pointer" onclick="showDetail(${r.uid})">
        <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">${date}</td>
        <td class="px-4 py-3 text-sm">
            <div class="font-medium text-gray-900">${from}</div>
            <div class="text-xs text-gray-400">${domain}</div>
        </td>
        <td class="px-4 py-3 text-sm text-gray-700 max-w-xs truncate">${subject}</td>
        <td class="px-4 py-3 text-sm">${ips}</td>
        <td class="px-4 py-3 text-sm whitespace-nowrap">${auth}</td>
        <td class="px-4 py-3 text-sm text-gray-600">${forwarder}</td>
        <td class="px-4 py-3 text-sm text-right whitespace-nowrap" onclick="event.stopPropagation()">
            <button onclick="blockEmail('${escAttr(r.from?.address)}', ${r.uid})" class="text-xs bg-red-50 text-red-700 hover:bg-red-100 px-2 py-1 rounded mr-1" title="E-Mail sperren">E-Mail</button>
            <button onclick="blockDomain('${escAttr(domain)}', ${r.uid})" class="text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 px-2 py-1 rounded mr-1" title="Domain sperren">Domain</button>
            ${(r.serverIps || []).length > 0 ? `<button onclick="blockIp('${escAttr(r.serverIps[0])}', ${r.uid})" class="text-xs bg-purple-50 text-purple-700 hover:bg-purple-100 px-2 py-1 rounded mr-1" title="IP sperren">IP</button>` : ''}
            <button onclick="deleteReport(${r.uid})" class="text-xs bg-gray-50 text-gray-600 hover:bg-gray-100 px-2 py-1 rounded" title="Löschen">&#10005;</button>
        </td>
    </tr>`;
}

function authBadges(r) {
    const badge = (label, val) => {
        const colors = { pass: 'bg-green-100 text-green-700', fail: 'bg-red-100 text-red-700', unknown: 'bg-gray-100 text-gray-500' };
        const cls = colors[val] || colors.unknown;
        return `<span class="inline-block ${cls} text-xs px-1.5 py-0.5 rounded mr-0.5">${label}</span>`;
    };
    return badge('SPF', r.spf) + badge('DKIM', r.dkim) + badge('DMARC', r.dmarc);
}

async function showDetail(uid) {
    const res = await apiCall(`/api/reports/${uid}`);
    if (!res) return;
    const r = await res.json();

    document.getElementById('modal-title').textContent = r.subject || '(kein Betreff)';

    const headersHtml = r.fullHeaders ? Object.entries(r.fullHeaders)
        .map(([k, v]) => `<tr><td class="pr-3 py-1 text-xs font-mono text-gray-500 align-top whitespace-nowrap">${escHtml(k)}</td><td class="py-1 text-xs font-mono text-gray-700 break-all">${escHtml(String(v).substring(0, 500))}</td></tr>`)
        .join('') : '';

    document.getElementById('modal-content').innerHTML = `
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div><span class="text-xs text-gray-500">Von:</span><div class="font-medium">${escHtml(r.from?.address || '')}</div></div>
            <div><span class="text-xs text-gray-500">Datum:</span><div>${r.date ? formatDate(r.date) : '-'}</div></div>
            <div><span class="text-xs text-gray-500">Return-Path:</span><div class="text-sm font-mono">${escHtml(r.returnPath || '-')}</div></div>
            <div><span class="text-xs text-gray-500">Server-IPs:</span><div>${(r.serverIps || []).map(ip => `<span class="inline-block bg-gray-100 px-2 py-0.5 rounded text-sm font-mono mr-1">${escHtml(ip)}</span>`).join('') || '-'}</div></div>
        </div>
        <div class="flex gap-2 mb-4">${authBadges(r)}</div>
        <details class="mb-4">
            <summary class="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">Alle Headers anzeigen</summary>
            <div class="mt-2 bg-gray-50 rounded p-3 max-h-64 overflow-y-auto"><table>${headersHtml}</table></div>
        </details>
        <div>
            <h3 class="text-sm font-medium text-gray-600 mb-2">Textvorschau</h3>
            <pre class="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">${escHtml(r.textBody || r.textPreview || '(kein Text)')}</pre>
        </div>
        <div class="flex gap-2 mt-4 pt-4 border-t">
            <button onclick="blockEmail('${escAttr(r.from?.address)}', ${r.uid}); closeModal();" class="bg-red-600 text-white text-sm px-4 py-2 rounded hover:bg-red-700">E-Mail sperren</button>
            <button onclick="blockDomain('${escAttr(r.senderDomain)}', ${r.uid}); closeModal();" class="bg-orange-600 text-white text-sm px-4 py-2 rounded hover:bg-orange-700">Domain sperren</button>
            ${(r.serverIps || []).length > 0 ? `<button onclick="blockIp('${escAttr(r.serverIps[0])}', ${r.uid}); closeModal();" class="bg-purple-600 text-white text-sm px-4 py-2 rounded hover:bg-purple-700">IP sperren</button>` : ''}
            <button onclick="deleteReport(${r.uid}); closeModal();" class="ml-auto bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded hover:bg-gray-300">Löschen</button>
        </div>`;

    show('detail-modal');
}

function closeModal() { hide('detail-modal'); }

// === BLOCKING ===

async function blockEmail(email, reportUid) {
    if (!email || !confirm(`E-Mail-Adresse sperren?\n\n${email}`)) return;
    const res = await apiCall('/api/block/email', { method: 'POST', body: JSON.stringify({ email, reportUid }) });
    if (res && res.ok) { showToast(`${email} gesperrt`, 'success'); loadReports(); }
    else showToast('Fehler beim Sperren', 'error');
}

async function blockDomain(domain, reportUid) {
    if (!domain || !confirm(`Gesamte Domain sperren?\n\nAlle E-Mails von @${domain} werden blockiert.`)) return;
    const res = await apiCall('/api/block/domain', { method: 'POST', body: JSON.stringify({ domain, reportUid }) });
    if (res && res.ok) { showToast(`@${domain} gesperrt`, 'success'); loadReports(); }
    else showToast('Fehler beim Sperren', 'error');
}

async function blockIp(ip, reportUid) {
    if (!ip || !confirm(`Server-IP sperren?\n\n${ip}`)) return;
    const res = await apiCall('/api/block/ip', { method: 'POST', body: JSON.stringify({ ip, reportUid }) });
    if (res && res.ok) { showToast(`IP ${ip} gesperrt`, 'success'); loadReports(); }
    else showToast('Fehler beim Sperren', 'error');
}

async function deleteReport(uid) {
    if (!confirm('Spam-Meldung aus dem Postfach löschen?')) return;
    const res = await apiCall(`/api/reports/${uid}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Meldung gelöscht', 'success'); loadReports(); }
    else showToast('Fehler beim Löschen', 'error');
}

// === BLOCKLIST ===

async function loadBlocklist() {
    show('blocklist-loading'); hide('blocklist-table'); hide('blocklist-empty');
    const res = await apiCall('/api/blocklist');
    if (!res) return;
    const data = await res.json();
    hide('blocklist-loading');

    const entries = data.local || [];
    document.getElementById('blocklist-count').textContent = entries.length || '';

    if (entries.length === 0) {
        show('blocklist-empty');
        return;
    }

    const typeLabels = { email: 'E-Mail', domain: 'Domain', ip: 'Server-IP' };
    const typeColors = { email: 'bg-red-100 text-red-700', domain: 'bg-orange-100 text-orange-700', ip: 'bg-purple-100 text-purple-700' };

    const html = `
        <div class="bg-white rounded-lg shadow overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Typ</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Wert</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gesperrt von</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aktion</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${entries.map(e => `
                        <tr class="hover:bg-gray-50">
                            <td class="px-4 py-3"><span class="inline-block ${typeColors[e.type] || 'bg-gray-100'} text-xs px-2 py-1 rounded font-medium">${typeLabels[e.type] || e.type}</span></td>
                            <td class="px-4 py-3 text-sm font-mono">${escHtml(e.value)}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${escHtml(e.blockedBy || '-')}</td>
                            <td class="px-4 py-3 text-sm text-gray-600">${formatDate(e.blockedAt)}</td>
                            <td class="px-4 py-3 text-right"><button onclick="unblock('${e.id}')" class="text-xs bg-green-50 text-green-700 hover:bg-green-100 px-3 py-1 rounded">Entsperren</button></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;

    document.getElementById('blocklist-table').innerHTML = html;
    show('blocklist-table');
}

async function unblock(id) {
    if (!confirm('Sperre aufheben?')) return;
    const res = await apiCall(`/api/block/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showToast('Sperre aufgehoben', 'success'); loadBlocklist(); }
    else showToast('Fehler beim Entsperren', 'error');
}

// === DMARC ===

async function loadDmarc() {
    show('dmarc-loading'); hide('dmarc-stats'); hide('dmarc-table'); hide('dmarc-empty');
    const res = await apiCall('/api/dmarc/stats');
    if (!res) return;
    const stats = await res.json();
    hide('dmarc-loading');

    if (stats.reportCount === 0) {
        show('dmarc-empty');
        return;
    }

    const passColor = stats.passRate >= 90 ? 'text-green-600' : stats.passRate >= 70 ? 'text-yellow-600' : 'text-red-600';
    const passBg = stats.passRate >= 90 ? 'bg-green-50 border-green-200' : stats.passRate >= 70 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200';

    const statsHtml = `
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="${passBg} border rounded-lg p-4 text-center">
                <div class="text-3xl font-bold ${passColor}">${stats.passRate}%</div>
                <div class="text-sm text-gray-600 mt-1">DMARC Pass-Rate</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold text-gray-800">${stats.totalMessages}</div>
                <div class="text-sm text-gray-600 mt-1">Nachrichten total</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold text-green-600">${stats.passMessages}</div>
                <div class="text-sm text-gray-600 mt-1">Bestanden</div>
            </div>
            <div class="bg-white border border-gray-200 rounded-lg p-4 text-center">
                <div class="text-3xl font-bold text-red-600">${stats.failMessages}</div>
                <div class="text-sm text-gray-600 mt-1">Fehlgeschlagen</div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <!-- Quell-IPs -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-4 py-3 border-b">
                    <h3 class="font-medium text-gray-800">Quell-IPs</h3>
                    <p class="text-xs text-gray-500">Server die als fwv-raura.ch senden</p>
                </div>
                <div class="divide-y max-h-80 overflow-y-auto">
                    ${stats.sourceIps.map(ip => `
                        <div class="px-4 py-2 flex items-center justify-between">
                            <span class="font-mono text-sm">${escHtml(ip.ip)}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-500">${ip.total} Mails</span>
                                ${ip.fail > 0
                                    ? `<span class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">${ip.fail} fail</span>`
                                    : `<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">pass</span>`
                                }
                            </div>
                        </div>
                    `).join('') || '<div class="px-4 py-3 text-sm text-gray-400">Keine Daten</div>'}
                </div>
            </div>

            <!-- Reporting-Organisationen -->
            <div class="bg-white rounded-lg shadow">
                <div class="px-4 py-3 border-b">
                    <h3 class="font-medium text-gray-800">Report-Absender</h3>
                    <p class="text-xs text-gray-500">Wer hat DMARC-Reports geschickt</p>
                </div>
                <div class="divide-y max-h-80 overflow-y-auto">
                    ${stats.organizations.map(org => `
                        <div class="px-4 py-2 flex items-center justify-between">
                            <span class="text-sm">${escHtml(org.name)}</span>
                            <div class="flex items-center gap-2">
                                <span class="text-xs text-gray-500">${org.total} Mails</span>
                                ${org.fail > 0
                                    ? `<span class="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded">${org.fail} fail</span>`
                                    : `<span class="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">alles pass</span>`
                                }
                            </div>
                        </div>
                    `).join('') || '<div class="px-4 py-3 text-sm text-gray-400">Keine Daten</div>'}
                </div>
            </div>
        </div>`;

    document.getElementById('dmarc-stats').innerHTML = statsHtml;
    show('dmarc-stats');

    // Load detailed reports table
    const reportsRes = await apiCall('/api/dmarc/reports');
    if (!reportsRes) return;
    const reports = await reportsRes.json();

    if (reports.length > 0) {
        const tableHtml = `
            <h3 class="text-lg font-medium text-gray-800 mb-3">Einzelne Reports (${reports.length})</h3>
            <div class="bg-white rounded-lg shadow overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zeitraum</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Organisation</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Policy</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Einträge</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${reports.map(r => dmarcReportRow(r)).join('')}
                    </tbody>
                </table>
            </div>`;
        document.getElementById('dmarc-table').innerHTML = tableHtml;
        show('dmarc-table');
    }
}

function dmarcReportRow(r) {
    const begin = r.dateBegin ? formatDate(r.dateBegin) : '-';
    const end = r.dateEnd ? formatDate(r.dateEnd) : '-';
    const totalMsgs = r.records.reduce((sum, rec) => sum + rec.count, 0);
    const failMsgs = r.records.reduce((sum, rec) => sum + ((rec.dkim !== 'pass' && rec.spf !== 'pass') ? rec.count : 0), 0);

    const recordDetails = r.records.map(rec => {
        const pass = rec.dkim === 'pass' || rec.spf === 'pass';
        const cls = pass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        return `<div class="inline-flex items-center gap-1 mr-2 mb-1">
            <span class="font-mono text-xs">${escHtml(rec.sourceIp)}</span>
            <span class="${cls} text-xs px-1.5 py-0.5 rounded">${rec.count}x ${rec.disposition}</span>
            <span class="text-xs text-gray-400">SPF:${rec.spf} DKIM:${rec.dkim}</span>
        </div>`;
    }).join('');

    return `<tr class="hover:bg-gray-50">
        <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
            <div>${begin}</div>
            <div class="text-xs text-gray-400">bis ${end}</div>
        </td>
        <td class="px-4 py-3 text-sm">
            <div class="font-medium text-gray-900">${escHtml(r.orgName)}</div>
            <div class="text-xs text-gray-400">${escHtml(r.email || '')}</div>
        </td>
        <td class="px-4 py-3 text-sm">
            <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">${escHtml(r.policy)}</span>
        </td>
        <td class="px-4 py-3 text-sm">
            <span class="font-medium">${totalMsgs}</span>
            ${failMsgs > 0 ? `<span class="text-red-600 text-xs ml-1">(${failMsgs} fail)</span>` : ''}
        </td>
        <td class="px-4 py-3 text-sm">${recordDetails}</td>
    </tr>`;
}

// === HELPERS ===

function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

function escAttr(s) {
    return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const colors = type === 'success' ? 'bg-green-600' : 'bg-red-600';
    const toast = document.createElement('div');
    toast.className = `toast ${colors} text-white px-4 py-2 rounded-lg shadow-lg text-sm`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// === INIT ===

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

if (checkAuth()) {
    loadReports();
}
