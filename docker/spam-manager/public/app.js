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

    if (tab === 'reports') loadReports();
    if (tab === 'blocklist') loadBlocklist();
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
