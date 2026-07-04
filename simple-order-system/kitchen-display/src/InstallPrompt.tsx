import { useEffect, useState } from 'react';

// Einheitlicher Installations-Aufruf für alle FWV-PWAs.
// - Android/Desktop: fängt `beforeinstallprompt` und zeigt einen Installieren-Button.
// - iOS Safari: kein beforeinstallprompt -> zeigt den "Zum Home-Bildschirm"-Hinweis.
// - Bereits installiert (standalone) oder weggeklickt: zeigt nichts.
type BeforeInstallPromptEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
function isIos(): boolean {
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function InstallPrompt({ appName = 'App' }: { appName?: string }) {
  const dismissKey = 'fwv-install-dismissed';
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [hidden, setHidden] = useState(
    () => isStandalone() || localStorage.getItem(dismissKey) === '1'
  );

  useEffect(() => {
    if (hidden) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setIosHint(false);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIos() && !isStandalone()) setIosHint(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [hidden]);

  if (hidden || (!prompt && !iosHint)) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey, '1');
    setHidden(true);
  };
  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
    setHidden(true);
  };

  return (
    <div
      role="dialog"
      aria-label={`${appName} installieren`}
      className="fixed bottom-4 inset-x-0 z-[9999] px-4 pointer-events-none"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-black/10">
        <img src="/logo-192.png" alt="" className="h-11 w-11 rounded-xl" />
        <div className="min-w-0 flex-1 text-sm leading-tight">
          <div className="font-semibold text-gray-900">{appName} installieren</div>
          {prompt ? (
            <div className="text-gray-500">Als App auf dem Startbildschirm — schneller Zugriff, Vollbild.</div>
          ) : (
            <div className="text-gray-500">
              In Safari unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm"</b>.
            </div>
          )}
        </div>
        {prompt && (
          <button
            onClick={install}
            className="shrink-0 rounded-xl bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Installieren
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Schließen"
          className="shrink-0 rounded-lg p-1 text-xl leading-none text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>
    </div>
  );
}
