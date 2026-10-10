// DEUTSCH: Arbeitsplan zeichnen — gemeinsam fuer Eventseite und Vorstand.
//
// Der Plan wird im Backend gebaut (GET /events/:id/arbeitsplan), damit
// Website, Vorstand und die Apps dieselbe Tabelle zeigen. Hier wird nichts
// gerechnet, nur abgezeichnet: pro Tag eine Tabelle, Spalten = Bereiche,
// Zeilen = Zeitfenster. Eine Zelle null heisst "keine Schicht" (schwarz),
// sonst die eingeteilten Helfer und je ein Strich pro offenem Platz.
//
// Auf dem Handy ist die Tabelle zu breit — man muesste seitlich scrollen.
// Dort (unter md) zeigt dieselbe Funktion eine Liste: pro Zeitfenster eine
// Karte mit nur den Bereichen, die dann wirklich eine Schicht haben.

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
        html += zeichneTagAlsListe(tag, plan.bereiche, esc);
        html += '<div class="hidden md:block overflow-x-auto"><table class="w-full border-collapse text-sm">';
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

// Handy-Ansicht eines Tages: Zeitfenster als Karten, leere Bereiche weg.
function zeichneTagAlsListe(tag, bereiche, esc) {
    let html = '<div class="md:hidden space-y-3">';
    tag.zeilen.forEach(zeile => {
        const schichten = zeile.zellen
            .map((zelle, i) => zelle && { bereich: bereiche[i], ...zelle })
            .filter(Boolean);
        if (schichten.length === 0) return;

        html += '<div class="arbeitsplan-karte border border-gray-300 rounded-lg p-3">';
        html += `<div class="font-bold mb-2">${esc(zeile.zeit.replace('-', '–'))} Uhr</div>`;
        schichten.forEach(s => {
            const frei = s.offen > 0
                ? `<span class="text-orange-600">${s.offen} ${s.offen === 1 ? 'Platz' : 'Plätze'} frei</span>`
                : '';
            const namen = s.besetzt.length > 0
                ? s.besetzt.map(esc).join(', ')
                : '<span class="text-gray-400">noch niemand</span>';
            html += '<div class="mb-2 last:mb-0">';
            html += `<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">${esc(s.bereich)}</div>`;
            html += `<div>${namen}${frei ? ` · ${frei}` : ''}</div>`;
            html += '</div>';
        });
        html += '</div>';
    });
    return html + '</div>';
}
