// Kamera-Scanner fuer Login-QR-Codes des Vereins: Datenblatt eines Mitglieds
// oder Anmeldebon vom Bondrucker (Oktober 2026). Dieselbe Bibliothek wie der
// Scanner im Inventar (@zxing/browser). Liefert den rohen Text; was er
// bedeutet, entscheidet das Backend (/api/auth/qr-login).
// Gleiche Datei in Kasse, Kueche und Inventar.
import { useEffect, useRef, useState } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';

export function QrScanner({ onCode, onClose }: { onCode: (text: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let controls: IScannerControls | null = null;
    let fertig = false;
    const leser = new BrowserQRCodeReader();
    leser.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current!,
      (ergebnis, _fehler, c) => {
        if (ergebnis && !fertig) {
          fertig = true;
          c.stop();
          onCode(ergebnis.getText());
        }
      },
    ).then((c) => {
      controls = c;
      if (fertig) c.stop();
    }).catch((e) => {
      setFehler(e?.name === 'NotAllowedError'
        ? 'Kamera nicht erlaubt - bitte im Browser zulassen.'
        : 'Keine Kamera gefunden.');
    });
    return () => { fertig = true; controls?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="text-white text-lg font-semibold mb-1">Mit QR-Code anmelden</div>
      <div className="text-gray-300 text-sm mb-4 text-center">Datenblatt oder Anmeldebon vor die Kamera halten</div>
      {fehler ? (
        <div className="bg-red-600 text-white rounded-lg p-4 mb-4 max-w-sm text-center">{fehler}</div>
      ) : (
        <video ref={videoRef} className="w-full max-w-sm aspect-square object-cover rounded-xl border-4 border-white/70" muted playsInline />
      )}
      <button onClick={onClose} className="mt-4 px-6 py-3 rounded-lg bg-white/20 text-white font-semibold">
        Abbrechen
      </button>
    </div>
  );
}
