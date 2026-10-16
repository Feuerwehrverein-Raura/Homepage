// Anmeldeseite im Stil der Mitglieder-App (flutter/mitglieder, login_screen):
// dunkelroter Grund, Logo, "Feuerwehrverein Raura", weisse Karte mit den
// Reitern "Mitglied" (Vereinskonto/Authentik) und "QR-Code" (Datenblatt,
// Anmeldebon, Kassen-QR aus den Zugaengen). Reihenfolge und Startreiter wie
// in der App (Mitglied zuerst).
// Gleiche Datei in Kasse und Kueche, nur das Logo unterscheidet sich.
import { useState } from 'react';

export function Anmeldeseite({ logo, logoAlt, laeuft, fehler, onKonto, onQr }: {
  logo: string;
  logoAlt: string;
  laeuft: boolean;
  fehler: string | null;
  onKonto: () => void;
  onQr: () => void;
}) {
  const [reiter, setReiter] = useState<'mitglied' | 'qr'>('mitglied');
  const reiterKnopf = (r: 'mitglied' | 'qr', text: string) => (
    <button onClick={() => setReiter(r)} className="flex-1 pt-4 font-semibold text-base">
      <span className={`inline-block pb-3 border-b-4 rounded-sm ${
        reiter === r ? 'text-red-700 border-red-700' : 'text-gray-600 border-transparent'
      }`}>
        {text}
      </span>
    </button>
  );
  return (
    <div className="min-h-screen bg-[#7f1d1d] flex flex-col items-center justify-center px-6 py-10">
      <img src={logo} alt={logoAlt} className="h-56 max-w-full object-contain mb-4" />
      <h1 className="text-white text-2xl font-bold mb-8 text-center">Feuerwehrverein Raura</h1>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex border-b border-gray-200">
          {reiterKnopf('mitglied', 'Mitglied')}
          {reiterKnopf('qr', 'QR-Code')}
        </div>
        <div className="p-6 text-center">
          {reiter === 'mitglied' ? (
            <>
              <p className="text-gray-600 mb-5">
                Melde dich mit deinem Vereinskonto an — gleiche Angaben wie auf der Website.
              </p>
              <button onClick={onKonto}
                className="w-full py-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-lg touch-manipulation">
                ⇥ Mit Vereinskonto anmelden
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-5">
                Kassen-QR aus «Zugänge» in der App, dein Datenblatt oder ein Anmeldebon vom Bondrucker.
              </p>
              <button onClick={onQr} disabled={laeuft}
                className="w-full py-4 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-lg touch-manipulation disabled:opacity-50">
                {laeuft ? 'Anmeldung läuft…' : '📷 QR-Code scannen'}
              </button>
            </>
          )}
          {fehler && <div className="mt-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">{fehler}</div>}
        </div>
      </div>
    </div>
  );
}
