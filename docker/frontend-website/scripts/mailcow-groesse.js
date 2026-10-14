// DEUTSCH: Speichergroessen der Mailcow-Postfaecher (vorstand.html, E-Mail).
//
// Mailcow liefert quota und quota_used beim Lesen (GET /mailcow/mailboxes,
// /mailcow/quota) in BYTES, erwartet beim Schreiben (POST/PUT) aber quota in
// MEGABYTES. quota 0 heisst "kein Limit". Gleiche Umrechnung wie in der
// Vorstand-App (flutter/fwv_vorstand/lib/src/email/mailcow_dienst.dart).

const MAILCOW_MB = 1024 * 1024;

// DEUTSCH: Bytes lesbar machen: "1.5 GB", "320 MB", "12 KB", "0 B".
function mailcowGroesse(bytes) {
    const b = Math.max(0, Number(bytes) || 0);
    if (b >= 1024 * MAILCOW_MB) {
        const gb = b / (1024 * MAILCOW_MB);
        return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
    }
    if (b >= MAILCOW_MB) return `${Math.round(b / MAILCOW_MB)} MB`;
    if (b >= 1024) return `${Math.round(b / 1024)} KB`;
    return `${Math.round(b)} B`;
}

// DEUTSCH: "72 MB / 1.0 GB" bzw. "72 MB / unbegrenzt" bei quota 0.
function mailcowBelegung(belegtBytes, quotaBytes) {
    const q = Number(quotaBytes) || 0;
    return `${mailcowGroesse(belegtBytes)} / ${q > 0 ? mailcowGroesse(q) : 'unbegrenzt'}`;
}

// DEUTSCH: Quota in Bytes (Lesen) -> ganze MB fuers Formular (0 = unbegrenzt).
function mailcowBytesZuMb(bytes) {
    return Math.round(Math.max(0, Number(bytes) || 0) / MAILCOW_MB);
}

// DEUTSCH: Eingabe im Formular (MB) -> Wert fuers Schreiben (MB, ganze Zahl).
// Leer oder ungueltig -> null (Aufrufer entscheidet), negativ -> 0.
function mailcowMbAusEingabe(text) {
    const s = String(text ?? '').trim();
    if (!/^-?\d+$/.test(s)) return null;
    return Math.max(0, parseInt(s, 10));
}
