// DEUTSCH: Arbeitsplan zeichnen — gemeinsam fuer Eventseite und Vorstand.
//
// Der Plan wird im Backend gebaut (GET /events/:id/arbeitsplan), damit
// Website, Vorstand und die Apps dieselbe Tabelle zeigen. Hier wird nichts
// gerechnet, nur abgezeichnet: pro Tag eine Tabelle, Spalten = Bereiche,
// Zeilen = Zeitfenster. Eine Zelle null heisst "keine Schicht" (schwarz),
// sonst die eingeteilten Helfer und je ein Strich pro offenem Platz.

async function ladeArbeitsplan(apiBase, eventId) {
    const response = await fetch(`${apiBase}/events/${eventId}/arbeitsplan`);
    if (!response.ok) throw new Error(`Server antwortet ${response.status}`);
    return response.json();
}

function zeichneArbeitsplan(plan) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    if (!plan || !plan.tage || plan.tage.length === 0) {
        return '<div class="text-center py-8 text-gray-500"><p>Keine Schichten für dieses Event vorhanden.</p></div>';
    }

    let html = `
        <div class="arbeitsplan-header text-center mb-6">
            <div class="text-lg font-semibold">${esc(plan.verein)}</div>
            <div class="text-2xl font-bold underline mt-2">${esc(plan.titel)}</div>
        </div>
    `;

    plan.tage.forEach(tag => {
        html += `<div class="mt-6 mb-4"><h3 class="text-lg font-bold underline">${esc(tag.bezeichnung)}</h3></div>`;
        html += '<div class="overflow-x-auto"><table class="w-full border-collapse text-sm">';
        html += '<thead><tr class="border-b-2 border-black">';
        html += '<th class="px-3 py-2 text-left font-bold border border-gray-400 bg-gray-50 w-32">Zeit</th>';
        plan.bereiche.forEach(bereich => {
            html += `<th class="px-3 py-2 text-left font-bold border border-gray-400 bg-gray-50">${esc(bereich)}</th>`;
        });
        html += '</tr></thead><tbody>';

        tag.zeilen.forEach(zeile => {
            html += '<tr class="border-b border-gray-300">';
            html += `<td class="px-3 py-2 border border-gray-400 font-medium align-top">${esc(zeile.zeit)}</td>`;
            zeile.zellen.forEach(zelle => {
                if (!zelle) {
                    html += '<td class="px-3 py-2 border border-gray-400 align-top bg-gray-900"></td>';
                    return;
                }
                html += '<td class="px-3 py-2 border border-gray-400 align-top bg-white">';
                zelle.besetzt.forEach(name => { html += `<div>-${esc(name)}</div>`; });
                for (let i = 0; i < zelle.offen; i++) html += '<div class="text-gray-400">-</div>';
                html += '</td>';
            });
            html += '</tr>';
        });

        html += '</tbody></table></div>';
    });

    return html;
}
