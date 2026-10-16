// QR-Anmeldung fuer die Website (Oktober 2026): Datenblatt eines Mitglieds
// oder Anmeldebon vom Bondrucker mit der Kamera scannen und bei api-members
// einloesen. Liefert das Mitglieder-Token (Datenblatt 8 h, Bon 7 Tage).
//
//   const token = await qrAnmeldung('https://api.fwv-raura.ch');  // null = abgebrochen
//
// Erkennung: eingebauter BarcodeDetector (Chrome/Android), sonst jsQR
// (muss als <script> geladen sein). Fehler werden als Error geworfen, mit
// einem Text, den man so anzeigen kann.
(function () {
    // Was steckt im Code? Datenblatt-Token, JSON vom Datenblatt oder Bon-Adresse.
    function lesen(roh) {
        const text = String(roh || '').trim();
        if (text.startsWith('fwv-member-')) return { pfad: 'qr-login', body: { token: text } };
        try {
            const u = new URL(text);
            const code = u.searchParams.get('code');
            if (/(^|\.)fwv-raura\.ch$/.test(u.hostname) && u.pathname.endsWith('/anmelden.html') && code) {
                return { pfad: 'code-login', body: { code } };
            }
        } catch (_) { /* keine Adresse */ }
        try {
            const j = JSON.parse(text);
            if (j && j.type === 'fwv-member-login' && typeof j.token === 'string') {
                return { pfad: 'qr-login', body: { token: j.token } };
            }
        } catch (_) { /* kein JSON */ }
        return null;
    }

    // Kamera-Overlay; loest mit dem Text des ersten QR-Codes auf oder mit null.
    function scannen() {
        return new Promise((resolve, reject) => {
            const huelle = document.createElement('div');
            huelle.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;color:#fff;font-family:system-ui,sans-serif';
            const titel = document.createElement('div');
            titel.textContent = 'Datenblatt oder Anmeldebon vor die Kamera halten';
            titel.style.cssText = 'margin-bottom:12px;text-align:center';
            const video = document.createElement('video');
            video.setAttribute('playsinline', '');
            video.muted = true;
            video.style.cssText = 'width:100%;max-width:360px;aspect-ratio:1;object-fit:cover;border-radius:12px;border:4px solid rgba(255,255,255,.7)';
            const abbrechen = document.createElement('button');
            abbrechen.textContent = 'Abbrechen';
            abbrechen.style.cssText = 'margin-top:16px;padding:12px 24px;border-radius:8px;border:0;background:rgba(255,255,255,.2);color:#fff;font-weight:600;font-size:16px';
            huelle.append(titel, video, abbrechen);
            document.body.appendChild(huelle);

            let strom = null;
            let aus = false;
            const ende = (wert, fehler) => {
                if (aus) return;
                aus = true;
                if (strom) strom.getTracks().forEach((t) => t.stop());
                huelle.remove();
                if (fehler) reject(fehler); else resolve(wert);
            };
            abbrechen.onclick = () => ende(null);

            const detektor = ('BarcodeDetector' in window) ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
            if (!detektor && typeof window.jsQR !== 'function') {
                ende(null, new Error('QR-Leser nicht geladen.'));
                return;
            }
            const leinwand = document.createElement('canvas');
            const ctx = leinwand.getContext('2d', { willReadFrequently: true });

            const runde = async () => {
                if (aus) return;
                try {
                    if (video.readyState >= 2) {
                        if (detektor) {
                            const treffer = await detektor.detect(video);
                            if (treffer.length) return ende(treffer[0].rawValue);
                        } else {
                            leinwand.width = video.videoWidth;
                            leinwand.height = video.videoHeight;
                            ctx.drawImage(video, 0, 0);
                            const bild = ctx.getImageData(0, 0, leinwand.width, leinwand.height);
                            const code = window.jsQR(bild.data, bild.width, bild.height);
                            if (code && code.data) return ende(code.data);
                        }
                    }
                } catch (_) { /* naechste Runde */ }
                setTimeout(runde, 200);
            };

            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then((s) => { strom = s; video.srcObject = s; return video.play(); })
                .then(runde)
                .catch((e) => ende(null, new Error(e && e.name === 'NotAllowedError'
                    ? 'Kamera nicht erlaubt - bitte im Browser zulassen.' : 'Keine Kamera gefunden.')));
        });
    }

    // Scannen und einloesen. null = abgebrochen.
    async function qrAnmeldung(apiBase) {
        const roh = await scannen();
        if (roh === null) return null;
        const c = lesen(roh);
        if (!c) throw new Error('Das ist kein Login-Code des Vereins.');
        const res = await fetch(`${apiBase}/auth/member/${c.pfad}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(c.body)
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.token) {
            throw new Error(d.error || (c.pfad === 'code-login'
                ? 'Dieser Bon ist schon benutzt oder abgelaufen.'
                : 'Dieser Code ist ungültig oder gesperrt.'));
        }
        return d.token;
    }

    window.qrAnmeldung = qrAnmeldung;
    window.qrAnmeldungLesen = lesen;
})();
