// Arbeitsplan nach dem Versand geaendert: alle Eingeteilten bekommen den
// neuen Plan mit einer Liste der Aenderungen (Stefan, 02.11.2026).
//
// Statt an jeder Stelle, die Anmeldungen oder Schichten aendert (Vorstand,
// Organisator, App, Website - rund ein Dutzend Wege), eine Meldung
// einzubauen, vergleicht ein Taktgeber (index.js arbeitsplanUpdateTick) den
// aktuellen Plan mit dem zuletzt verschickten Stand (events.
// arbeitsplan_stand_json). So faellt jede Aenderung auf, egal woher.
//
// Gebuendelt: verschickt wird erst, wenn sich der Plan eine Weile nicht mehr
// geaendert hat - 60 Minuten, am Tag vor und am Tag des Anlasses 10 Minuten.
// Per Post nur, wenn der Anlass noch mindestens 5 Tage entfernt ist; sonst
// bekommt der Organisator eine Liste, wen er anrufen soll.
//
// Hier nur reine Funktionen ohne Datenbank (test/arbeitsplan-update.test.js).

const crypto = require('crypto');

const BRIEF_MINDESTENS_TAGE = 5;

/** Plan (arbeitsplan.js buildArbeitsplan) -> { "Tag Zeit Bereich": [Namen] }. */
function planSchichten(plan) {
    const stand = {};
    for (const tag of (plan && plan.tage) || []) {
        for (const zeile of tag.zeilen || []) {
            (zeile.zellen || []).forEach((zelle, i) => {
                if (!zelle) return;
                const schluessel = `${tag.bezeichnung} ${zeile.zeit} ${plan.bereiche[i]}`;
                stand[schluessel] = [...(zelle.besetzt || [])].sort((a, b) => a.localeCompare(b, 'de'));
            });
        }
    }
    return stand;
}

/** Fingerabdruck eines Stands (Reihenfolge der Schluessel egal). */
function standHash(stand) {
    const sortiert = Object.keys(stand || {}).sort().map(k => [k, stand[k]]);
    return crypto.createHash('sha256').update(JSON.stringify(sortiert)).digest('hex');
}

/** Aenderungen zwischen zwei Staenden, fuer Menschen lesbar. */
function planVergleich(alt, neu) {
    const zeilen = [];
    const schluessel = [...new Set([...Object.keys(alt || {}), ...Object.keys(neu || {})])].sort();
    for (const k of schluessel) {
        const vorher = (alt || {})[k];
        const jetzt = (neu || {})[k];
        if (!vorher) { zeilen.push(`Neue Schicht: ${k}${jetzt.length ? ` (${jetzt.join(', ')})` : ''}`); continue; }
        if (!jetzt) { zeilen.push(`Schicht entfällt: ${k}`); continue; }
        const dazu = jetzt.filter(n => !vorher.includes(n));
        const weg = vorher.filter(n => !jetzt.includes(n));
        if (!dazu.length && !weg.length) continue;
        const teile = [];
        if (dazu.length) teile.push(`neu ${dazu.join(', ')}`);
        if (weg.length) teile.push(`nicht mehr ${weg.join(', ')}`);
        zeilen.push(`${k}: ${teile.join('; ')}`);
    }
    return zeilen;
}

/** Tage bis zum Anlass (Kalendertage, Ortszeit-Datum "YYYY-MM-DD"). */
function tageBis(startDatum, jetzt = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startDatum || ''));
    if (!m) return Infinity;
    const start = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const heute = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate());
    return Math.round((start - heute) / 86400000);
}

/** Ruhezeit vor dem Versand: 10 Minuten am Tag vor / am Tag des Anlasses, sonst 60. */
function wartezeitMinuten(startDatum, jetzt = new Date()) {
    return tageBis(startDatum, jetzt) <= 1 ? 10 : 60;
}

/** Lohnt ein Brief noch (kommt erst nach 2-3 Tagen an)? */
function briefNochSinnvoll(startDatum, jetzt = new Date()) {
    return tageBis(startDatum, jetzt) >= BRIEF_MINDESTENS_TAGE;
}

/** Was der Taktgeber mit einem Anlass tun soll. */
function naechsterSchritt({ standJson, neuStand, neuSeit, aktuell, startDatum, jetzt = new Date() }) {
    const hash = standHash(aktuell);
    if (!standJson) return { art: 'anfangen', hash };           // vor dieser Funktion verschickt
    if (standHash(standJson) === hash) return { art: neuStand ? 'zuruecksetzen' : 'nichts', hash };
    if (neuStand !== hash) return { art: 'merken', hash };       // aendert sich noch
    const ruhe = (jetzt - new Date(neuSeit)) / 60000;
    if (ruhe >= wartezeitMinuten(startDatum, jetzt)) return { art: 'versenden', hash };
    return { art: 'warten', hash };
}

module.exports = {
    BRIEF_MINDESTENS_TAGE, planSchichten, standHash, planVergleich, tageBis, wartezeitMinuten,
    briefNochSinnvoll, naechsterSchritt
};
