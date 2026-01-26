import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

// OAuth2 PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTHENTIK_URL = import.meta.env.VITE_AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const CLIENT_ID = import.meta.env.VITE_AUTHENTIK_CLIENT_ID || 'inventory-system';
const REDIRECT_URI = window.location.origin + '/auth/callback';

interface Item {
  id: number;
  name: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  location_id?: number;
  location_name?: string;
  ean_code?: string;
  custom_barcode?: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  purchase_price?: number;
  image_url?: string;
  sellable?: boolean;
  sale_price?: number;
  sale_category?: string;
  printer_station?: string;
}

interface Category {
  id: number;
  name: string;
}

interface Location {
  id: number;
  name: string;
}

interface User {
  name: string;
  email: string;
  groups: string[];
}

type Tab = 'items' | 'scanner' | 'add' | 'low-stock' | 'reports';

function App() {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('inventory_token'));
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [scanResult, setScanResult] = useState<Item | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lookupResult, setLookupResult] = useState<any | null>(null); // External barcode lookup result
  const [prefillData, setPrefillData] = useState<any | null>(null); // Prefill data for new item form
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [publicItemCode, setPublicItemCode] = useState<string | null>(null); // For public QR code scans

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // PWA Install prompt
  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // Check for /item/:code URL path (QR code scans from external devices)
  useEffect(() => {
    const path = window.location.pathname;
    const itemMatch = path.match(/^\/item\/([A-Z0-9]+)$/i);

    if (itemMatch) {
      setPublicItemCode(itemMatch[1]);
    }
  }, []);

  // Check for OAuth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      handleOAuthCallback(code);
    } else if (token) {
      validateToken();
    }
  }, []);

  // Fetch data on mount
  useEffect(() => {
    fetchItems();
    fetchCategories();
    fetchLocations();
  }, []);

  // Fetch items when search changes
  useEffect(() => {
    fetchItems();
  }, [search]);

  const handleOAuthCallback = async (code: string) => {
    setAuthLoading(true);
    const verifier = sessionStorage.getItem('code_verifier');
    if (!verifier) {
      console.error('No code verifier found');
      setAuthLoading(false);
      return;
    }

    try {
      const response = await fetch(`${AUTHENTIK_URL}/application/o/token/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: CLIENT_ID,
          code: code,
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('inventory_token', data.access_token);
        setToken(data.access_token);
        sessionStorage.removeItem('code_verifier');

        const payload = JSON.parse(atob(data.access_token.split('.')[1]));
        // Build display name from available fields
        const displayName = payload.name
          || (payload.given_name && payload.family_name ? `${payload.given_name} ${payload.family_name}` : null)
          || payload.given_name
          || payload.preferred_username
          || 'User';
        setUser({
          name: displayName,
          email: payload.email || '',
          groups: payload.groups || [],
        });

        window.history.replaceState({}, '', window.location.pathname);
      } else {
        console.error('Token exchange failed');
        localStorage.removeItem('inventory_token');
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
    }
    setAuthLoading(false);
  };

  const validateToken = useCallback(() => {
    if (!token) return;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));

      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('inventory_token');
        setToken(null);
        setUser(null);
      } else {
        // Build display name from available fields
        const displayName = payload.name
          || (payload.given_name && payload.family_name ? `${payload.given_name} ${payload.family_name}` : null)
          || payload.given_name
          || payload.preferred_username
          || 'User';
        setUser({
          name: displayName,
          email: payload.email || '',
          groups: payload.groups || [],
        });
      }
    } catch (error) {
      console.error('Token validation error:', error);
      localStorage.removeItem('inventory_token');
      setToken(null);
    }
  }, [token]);

  const login = async () => {
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);
    sessionStorage.setItem('code_verifier', verifier);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email',
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `${AUTHENTIK_URL}/application/o/authorize/?${params}`;
  };

  const logout = () => {
    localStorage.removeItem('inventory_token');
    setToken(null);
    setUser(null);
  };

  const fetchItems = async () => {
    try {
      const url = search ? `${API_URL}/items?search=${encodeURIComponent(search)}` : `${API_URL}/items`;
      const res = await fetch(url);
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`);
      setCategories(await res.json());
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch(`${API_URL}/locations`);
      setLocations(await res.json());
    } catch (error) {
      console.error('Error fetching locations:', error);
    }
  };

  // Barcode Scanner
  const startScanner = async () => {
    setIsScanning(true);
    setScanResult(null);
    setScanError(null);
    setLookupResult(null);

    try {
      codeReaderRef.current = new BrowserMultiFormatReader();
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        setScanError('Keine Kamera gefunden');
        setIsScanning(false);
        return;
      }

      const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back')) || videoInputDevices[0];

      await codeReaderRef.current.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        async (result) => {
          if (result) {
            const scannedValue = result.getText();
            stopScanner();

            // Check if this is a QR code URL from our inventory system
            const urlPattern = /^https?:\/\/inventar\.fwv-raura\.ch\/item\/([A-Z0-9]+)$/i;
            const match = scannedValue.match(urlPattern);

            // Extract barcode from URL or use raw scanned value
            const code = match ? match[1] : scannedValue;

            try {
              // Use the lookup endpoint that searches local + external databases
              const res = await fetch(`${API_URL}/barcode/lookup/${code}`);
              if (res.ok) {
                const data = await res.json();
                if (data.source === 'local' && data.found) {
                  // Found in local database
                  setScanResult(data.item);
                } else if (data.found) {
                  // Found in external database - show option to create
                  setLookupResult(data);
                } else {
                  // Not found anywhere
                  setLookupResult({ source: 'none', found: false, ean_code: code });
                }
              } else {
                setScanError(`Fehler beim Suchen: ${code}`);
              }
            } catch (error) {
              setScanError('Fehler beim Suchen');
            }
          }
        }
      );
    } catch (error) {
      setScanError('Scanner konnte nicht gestartet werden');
      setIsScanning(false);
    }
  };

  const stopScanner = () => {
    if (codeReaderRef.current) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      codeReaderRef.current = null;
    }
    setIsScanning(false);
  };

  // Stock update
  const updateStock = async (itemId: number, type: 'in' | 'out', quantity: number = 1) => {
    if (!token) {
      alert('Bitte zuerst einloggen');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/items/${itemId}/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type, quantity, reason: `${type === 'in' ? 'Eingang' : 'Ausgang'} via App` })
      });

      if (res.ok) {
        fetchItems();
        if (scanResult?.id === itemId) {
          const data = await res.json();
          setScanResult({ ...scanResult, quantity: data.new_quantity });
        }
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler');
      }
    } catch (error) {
      alert('Fehler beim Aktualisieren');
    }
  };

  // Render public item view if accessed via /item/:code URL
  if (publicItemCode) {
    return (
      <PublicItemView
        code={publicItemCode}
        onNavigateToApp={() => {
          window.history.pushState({}, '', '/');
          setPublicItemCode(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white p-3 sm:p-4 shadow-lg">
        <div className="container mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="FWV Raura"
              className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-white p-1"
            />
            <h1 className="text-lg sm:text-xl font-bold">Lagerverwaltung</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Install Button */}
            {installPrompt && !isInstalled && (
              <button
                onClick={handleInstallClick}
                className="text-sm bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded flex items-center gap-1"
              >
                📲 Installieren
              </button>
            )}
            {user && <span className="text-sm hidden sm:inline">Hallo, {user.name}</span>}
            {user ? (
              <button
                onClick={logout}
                className="text-sm bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded"
              >
                Abmelden
              </button>
            ) : (
              <button
                onClick={login}
                disabled={authLoading}
                className="text-sm bg-blue-700 hover:bg-blue-800 px-3 py-1.5 rounded"
              >
                {authLoading ? '...' : 'Anmelden'}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Desktop Tabs - hidden on mobile */}
      <nav className="bg-white shadow hidden sm:block">
        <div className="container mx-auto flex">
          {(['items', 'scanner', 'add', 'low-stock', 'reports'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t !== 'scanner') stopScanner(); }}
              className={`flex-1 py-3 px-4 text-center font-medium whitespace-nowrap text-base ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'items' && '📋 Artikel'}
              {t === 'scanner' && '📷 Scanner'}
              {t === 'add' && '➕ Neu'}
              {t === 'low-stock' && '⚠️ Niedrig'}
              {t === 'reports' && '📊 Berichte'}
            </button>
          ))}
        </div>
      </nav>

      {/* Content - add bottom padding on mobile for nav */}
      <main className="container mx-auto p-3 sm:p-4 pb-24 sm:pb-4">
        {/* Items Tab */}
        {tab === 'items' && (
          <div>
            <input
              type="text"
              placeholder="Suchen (Name, Barcode...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-4 border-2 rounded-xl mb-4 text-lg"
            />
            <div className="space-y-3">
              {items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`bg-white p-4 rounded-xl shadow-md cursor-pointer active:bg-gray-50 touch-manipulation ${
                    item.quantity <= item.min_quantity ? 'border-l-4 border-red-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Item image or placeholder */}
                      {item.image_url ? (
                        <img
                          src={item.image_url.startsWith('http') ? item.image_url : `${API_URL}${item.image_url}`}
                          alt=""
                          className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl text-gray-300">📦</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                        <p className="text-sm text-gray-500 truncate">
                          {item.category_name || '-'} • {item.location_name || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-2xl sm:text-3xl font-bold ${
                        item.quantity <= item.min_quantity ? 'text-red-500' : 'text-green-600'
                      }`}>
                        {item.quantity}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">{item.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center text-gray-500 py-12 text-lg">
                  Keine Artikel gefunden
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scanner Tab */}
        {tab === 'scanner' && (
          <div className="space-y-4">
            {!isScanning && !scanResult && !lookupResult && (
              <button
                onClick={startScanner}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-4 rounded-lg text-lg font-semibold touch-manipulation"
              >
                📷 Scanner starten
              </button>
            )}

            {isScanning && (
              <div className="relative">
                <video ref={videoRef} className="w-full rounded-lg" />
                <button
                  onClick={stopScanner}
                  className="absolute top-2 right-2 bg-red-500 text-white px-4 py-2 rounded touch-manipulation"
                >
                  Stopp
                </button>
              </div>
            )}

            {scanError && (
              <div className="bg-red-100 text-red-700 p-4 rounded-lg">
                {scanError}
                <button
                  onClick={() => { setScanError(null); startScanner(); }}
                  className="block mt-2 text-sm underline"
                >
                  Erneut scannen
                </button>
              </div>
            )}

            {scanResult && (
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg">
                <h2 className="text-lg sm:text-xl font-bold mb-2">{scanResult.name}</h2>
                <p className="text-gray-500 mb-4 text-sm">{scanResult.custom_barcode || scanResult.ean_code}</p>

                <div className="text-center mb-6">
                  <span className="text-4xl sm:text-5xl font-bold text-blue-600">{scanResult.quantity}</span>
                  <span className="text-lg sm:text-xl text-gray-500 ml-2">{scanResult.unit}</span>
                </div>

                {user ? (
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <button
                      onClick={() => updateStock(scanResult.id, 'out')}
                      className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold touch-manipulation"
                    >
                      - Ausgang
                    </button>
                    <button
                      onClick={() => updateStock(scanResult.id, 'in')}
                      className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-3 sm:py-4 rounded-lg text-base sm:text-lg font-semibold touch-manipulation"
                    >
                      + Eingang
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-4">
                    <button onClick={login} className="text-blue-600 underline">
                      Anmelden
                    </button>
                    {' '}um Bestand zu ändern
                  </div>
                )}

                <button
                  onClick={() => { setScanResult(null); startScanner(); }}
                  className="w-full mt-4 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 py-3 rounded-lg touch-manipulation"
                >
                  Nächsten scannen
                </button>
              </div>
            )}

            {/* External Lookup Result */}
            {lookupResult && (
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-lg">
                {lookupResult.found ? (
                  <>
                    <div className="flex items-start gap-4 mb-4">
                      {lookupResult.product?.image_url && (
                        <img
                          src={lookupResult.product.image_url}
                          alt={lookupResult.product.name}
                          className="w-20 h-20 object-contain rounded bg-gray-100"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-xl font-bold">{lookupResult.product?.name || 'Unbekannt'}</h2>
                        {lookupResult.product?.brand && (
                          <p className="text-gray-600">{lookupResult.product.brand}</p>
                        )}
                        {lookupResult.product?.category && (
                          <p className="text-sm text-gray-500">{lookupResult.product.category}</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg mb-4">
                      <p className="text-sm text-blue-700">
                        <span className="font-semibold">Quelle:</span>{' '}
                        {lookupResult.source === 'openfoodfacts' ? 'Open Food Facts' :
                         lookupResult.source === 'opengtindb' ? 'OpenGTINDB' : lookupResult.source}
                      </p>
                      <p className="text-sm text-blue-700">
                        <span className="font-semibold">EAN:</span> {lookupResult.product?.ean_code}
                      </p>
                    </div>

                    {lookupResult.product?.description && (
                      <p className="text-sm text-gray-600 mb-4 line-clamp-3">{lookupResult.product.description}</p>
                    )}

                    <p className="text-sm text-gray-500 mb-4">
                      Dieser Artikel ist noch nicht in deinem Inventar. Möchtest du ihn anlegen?
                    </p>

                    <button
                      onClick={() => {
                        setPrefillData({
                          name: lookupResult.product?.name || '',
                          description: lookupResult.product?.description || '',
                          ean_code: lookupResult.product?.ean_code || ''
                        });
                        setLookupResult(null);
                        setTab('add');
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-3 rounded-lg text-lg font-semibold touch-manipulation"
                    >
                      + Artikel anlegen
                    </button>
                  </>
                ) : (
                  <div className="text-center">
                    <div className="text-5xl mb-4">🔍</div>
                    <h2 className="text-lg font-semibold mb-2">Barcode nicht gefunden</h2>
                    <p className="text-gray-500 mb-4">
                      Der Barcode <span className="font-mono bg-gray-100 px-2 py-1 rounded">{lookupResult.ean_code}</span> wurde weder lokal noch in externen Datenbanken gefunden.
                    </p>
                    <button
                      onClick={() => {
                        setPrefillData({
                          name: '',
                          description: '',
                          ean_code: lookupResult.ean_code || ''
                        });
                        setLookupResult(null);
                        setTab('add');
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-3 rounded-lg font-semibold touch-manipulation mb-3"
                    >
                      Manuell anlegen
                    </button>
                  </div>
                )}

                <button
                  onClick={() => { setLookupResult(null); startScanner(); }}
                  className="w-full mt-3 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 py-3 rounded-lg touch-manipulation"
                >
                  Nächsten scannen
                </button>
              </div>
            )}

            {/* Manual barcode input */}
            <div className="mt-6">
              <input
                type="text"
                placeholder="Barcode manuell eingeben..."
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    const code = (e.target as HTMLInputElement).value.trim();
                    if (!code) return;

                    setScanResult(null);
                    setScanError(null);
                    setLookupResult(null);

                    try {
                      // Use the new lookup endpoint that searches local + external databases
                      const res = await fetch(`${API_URL}/barcode/lookup/${code}`);
                      if (res.ok) {
                        const data = await res.json();
                        if (data.source === 'local' && data.found) {
                          // Found in local database
                          setScanResult(data.item);
                        } else if (data.found) {
                          // Found in external database - show option to create
                          setLookupResult(data);
                        } else {
                          // Not found anywhere
                          setLookupResult({ source: 'none', found: false, ean_code: code });
                        }
                      } else {
                        setScanError(`Fehler beim Suchen: ${code}`);
                      }
                    } catch (error) {
                      setScanError('Fehler beim Suchen');
                    }
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-full p-3 border rounded-lg text-base"
              />
              <p className="text-xs sm:text-sm text-gray-500 mt-1">
                USB-Barcode-Scanner werden automatisch erkannt
              </p>
            </div>
          </div>
        )}

        {/* Add Item Tab */}
        {tab === 'add' && user && (
          <AddItemForm
            categories={categories}
            locations={locations}
            token={token!}
            prefillData={prefillData}
            onSuccess={() => { fetchItems(); setPrefillData(null); setTab('items'); }}
            onCategoryAdded={fetchCategories}
            onLocationAdded={fetchLocations}
          />
        )}

        {tab === 'add' && !user && (
          <div className="text-center py-8 text-gray-500">
            <button onClick={login} className="text-blue-600 underline">
              Anmelden
            </button>
            {' '}um Artikel hinzuzufügen
          </div>
        )}

        {/* Low Stock Tab */}
        {tab === 'low-stock' && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4">⚠️ Artikel mit niedrigem Bestand</h2>
            {items.filter(i => i.quantity <= i.min_quantity).map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-white p-4 rounded-xl shadow-md border-l-4 border-red-500 cursor-pointer active:bg-gray-50 touch-manipulation"
              >
                <div className="flex justify-between items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Item image or placeholder */}
                    {item.image_url ? (
                      <img
                        src={item.image_url.startsWith('http') ? item.image_url : `${API_URL}${item.image_url}`}
                        alt=""
                        className="w-14 h-14 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-2xl">⚠️</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base sm:text-lg truncate">{item.name}</h3>
                      <p className="text-sm text-gray-500 truncate">
                        {item.category_name || '-'} • {item.location_name || '-'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-2xl sm:text-3xl font-bold text-red-500">{item.quantity}</span>
                    <span className="text-sm text-gray-400 ml-1">/ {item.min_quantity}</span>
                    <p className="text-xs text-gray-400">{item.unit}</p>
                  </div>
                </div>
              </div>
            ))}
            {items.filter(i => i.quantity <= i.min_quantity).length === 0 && (
              <div className="text-center text-gray-500 py-12 text-lg">
                Alle Artikel ausreichend vorhanden ✓
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {tab === 'reports' && (
          <ReportsView items={items} onRefresh={fetchItems} />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-200 sm:hidden z-40 safe-area-inset-bottom shadow-lg">
        <div className="flex justify-around">
          {([
            { id: 'items', icon: '📋', label: 'Artikel' },
            { id: 'scanner', icon: '📷', label: 'Scan' },
            { id: 'add', icon: '➕', label: 'Neu' },
            { id: 'low-stock', icon: '⚠️', label: 'Niedrig' },
            { id: 'reports', icon: '📊', label: 'Berichte' },
          ] as { id: Tab; icon: string; label: string }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id !== 'scanner') stopScanner(); }}
              className={`flex-1 py-4 flex flex-col items-center gap-1 touch-manipulation ${
                tab === t.id ? 'text-blue-600 bg-blue-50' : 'text-gray-500 active:bg-gray-100'
              }`}
            >
              <span className="text-2xl">{t.icon}</span>
              <span className="text-sm font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          token={token}
          user={user}
          onLogin={login}
          onClose={() => setSelectedItem(null)}
          onUpdate={fetchItems}
          categories={categories}
          locations={locations}
        />
      )}
    </div>
  );
}

// Add Item Form Component
function AddItemForm({ categories, locations, token, prefillData, onSuccess, onCategoryAdded, onLocationAdded }: {
  categories: Category[];
  locations: Location[];
  token: string;
  prefillData?: { name?: string; description?: string; ean_code?: string } | null;
  onSuccess: () => void;
  onCategoryAdded?: () => void;
  onLocationAdded?: () => void;
}) {
  const [form, setForm] = useState({
    name: prefillData?.name || '',
    description: prefillData?.description || '',
    category_id: '',
    location_id: '',
    ean_code: prefillData?.ean_code || '',
    quantity: '0',
    min_quantity: '0',
    unit: 'Stück',
    sellable: false,
    sale_price: '',
    sale_category: '',
    printer_station: 'bar'
  });
  const [newCategory, setNewCategory] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const createCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      const res = await fetch(`${API_URL}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newCategory.trim() })
      });
      if (res.ok) {
        const cat = await res.json();
        setForm({ ...form, category_id: cat.id.toString() });
        setNewCategory('');
        setShowNewCategory(false);
        onCategoryAdded?.();
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler');
      }
    } catch { alert('Fehler beim Erstellen'); }
  };

  const createLocation = async () => {
    if (!newLocation.trim()) return;
    try {
      const res = await fetch(`${API_URL}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newLocation.trim() })
      });
      if (res.ok) {
        const loc = await res.json();
        setForm({ ...form, location_id: loc.id.toString() });
        setNewLocation('');
        setShowNewLocation(false);
        onLocationAdded?.();
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler');
      }
    } catch { alert('Fehler beim Erstellen'); }
  };

  // Update form when prefillData changes
  useEffect(() => {
    if (prefillData) {
      setForm(prev => ({
        ...prev,
        name: prefillData.name || prev.name,
        description: prefillData.description || prev.description,
        ean_code: prefillData.ean_code || prev.ean_code
      }));
    }
  }, [prefillData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const res = await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...form,
          category_id: form.category_id || null,
          location_id: form.location_id || null,
          quantity: parseInt(form.quantity),
          min_quantity: parseInt(form.min_quantity),
          sellable: form.sellable,
          sale_price: form.sellable && form.sale_price ? parseFloat(form.sale_price) : null,
          sale_category: form.sellable ? form.sale_category : null,
          printer_station: form.sellable ? form.printer_station : null
        })
      });

      if (res.ok) {
        const newItem = await res.json();

        // Upload image if selected
        if (selectedImage && newItem.id) {
          const formData = new FormData();
          formData.append('image', selectedImage);

          await fetch(`${API_URL}/items/${newItem.id}/image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
          });
        }

        clearImage();
        onSuccess();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler beim Speichern');
      }
    } catch (error) {
      alert('Fehler beim Speichern');
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
      <h2 className="text-lg font-semibold">Neuen Artikel anlegen</h2>

      {/* Image Upload Section */}
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-4">
        {imagePreview ? (
          <div className="relative">
            <img
              src={imagePreview}
              alt="Vorschau"
              className="w-full h-40 object-contain rounded-lg bg-gray-50"
            />
            <button
              type="button"
              onClick={clearImage}
              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full text-sm w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="text-center py-4">
            <span className="text-4xl text-gray-300">📷</span>
            <p className="text-sm text-gray-500 mt-2">Artikelbild (optional)</p>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <input
            type="file"
            ref={cameraInputRef}
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
          />
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2 touch-manipulation"
          >
            📷 Foto aufnehmen
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-gray-200 hover:bg-gray-300 py-3 px-4 rounded-lg text-base flex items-center justify-center gap-2 touch-manipulation"
          >
            📁 Datei wählen
          </button>
        </div>
      </div>

      <input
        type="text"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="w-full p-4 border-2 rounded-xl text-lg"
      />

      <textarea
        placeholder="Beschreibung"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full p-4 border-2 rounded-xl text-lg"
        rows={2}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <div className="flex gap-2">
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="flex-1 p-4 border-2 rounded-xl text-lg"
            >
              <option value="">Kategorie wählen</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCategory(!showNewCategory)}
              className="px-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xl touch-manipulation"
            >+</button>
          </div>
          {showNewCategory && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Neue Kategorie"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 p-3 border-2 rounded-lg text-base"
              />
              <button type="button" onClick={createCategory} className="px-4 py-3 bg-green-600 text-white rounded-lg text-base touch-manipulation">Erstellen</button>
            </div>
          )}
        </div>

        <div>
          <div className="flex gap-2">
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              className="flex-1 p-4 border-2 rounded-xl text-lg"
            >
              <option value="">Lagerort wählen</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowNewLocation(!showNewLocation)}
              className="px-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold text-xl touch-manipulation"
            >+</button>
          </div>
          {showNewLocation && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Neuer Lagerort"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                className="flex-1 p-3 border-2 rounded-lg text-base"
              />
              <button type="button" onClick={createLocation} className="px-4 py-3 bg-green-600 text-white rounded-lg text-base touch-manipulation">Erstellen</button>
            </div>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="EAN-Code (optional, sonst wird eigener generiert)"
        value={form.ean_code}
        onChange={(e) => setForm({ ...form, ean_code: e.target.value })}
        className="w-full p-4 border-2 rounded-xl text-lg"
      />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-500 mb-1">Menge</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="w-full p-4 border-2 rounded-xl text-lg text-center"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Min. Bestand</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.min_quantity}
            onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
            className="w-full p-4 border-2 rounded-xl text-lg text-center"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Einheit</label>
          <input
            type="text"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="w-full p-4 border-2 rounded-xl text-lg text-center"
          />
        </div>
      </div>

      {/* Sellable Section for POS */}
      <div className="border-t-2 pt-4 mt-4">
        <label className="flex items-center gap-3 cursor-pointer p-3 bg-gray-50 rounded-xl touch-manipulation">
          <input
            type="checkbox"
            checked={form.sellable}
            onChange={(e) => setForm({ ...form, sellable: e.target.checked })}
            className="w-6 h-6 rounded"
          />
          <span className="font-medium text-lg">🛒 In Kasse verkaufen</span>
        </label>

        {form.sellable && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Verkaufspreis (CHF)</label>
              <input
                type="number"
                step="0.05"
                inputMode="decimal"
                placeholder="z.B. 5.00"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                className="w-full p-4 border-2 rounded-xl text-lg"
                required={form.sellable}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Verkaufskategorie</label>
              <input
                type="text"
                placeholder="z.B. Getränke"
                value={form.sale_category}
                onChange={(e) => setForm({ ...form, sale_category: e.target.value })}
                className="w-full p-4 border-2 rounded-xl text-lg"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Drucker</label>
              <select
                value={form.printer_station}
                onChange={(e) => setForm({ ...form, printer_station: e.target.value })}
                className="w-full p-4 border-2 rounded-xl text-lg"
              >
                <option value="bar">Bar (Getränke)</option>
                <option value="kitchen">Küche (Essen)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white py-4 rounded-xl font-semibold text-lg touch-manipulation"
      >
        {submitting ? '⏳ Wird gespeichert...' : '✓ Artikel anlegen'}
      </button>
    </form>
  );
}

// Reports View Component
function ReportsView({ items, onRefresh }: { items: Item[]; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = () => {
    setLoading(true);
    onRefresh();
    setTimeout(() => setLoading(false), 500);
  };

  const downloadCSV = () => {
    window.open(`${API_URL}/reports/inventory-list?format=csv`, '_blank');
  };

  // Calculate summary from local items
  const totalItems = items.length;
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockItems = items.filter(item => item.quantity <= item.min_quantity).length;
  const totalValue = items.reduce((sum, item) => sum + (item.quantity * (item.purchase_price || 0)), 0);

  return (
    <div className="space-y-4">
      {/* Quick Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl sm:text-3xl font-bold text-blue-600">{totalItems}</div>
          <div className="text-sm text-gray-500">Artikel</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl sm:text-3xl font-bold text-green-600">{totalUnits}</div>
          <div className="text-sm text-gray-500">Einheiten</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl sm:text-3xl font-bold text-red-500">{lowStockItems}</div>
          <div className="text-sm text-gray-500">Niedrig</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-2xl sm:text-3xl font-bold text-purple-600">
            CHF {totalValue.toFixed(0)}
          </div>
          <div className="text-sm text-gray-500">Wert (EK)</div>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="font-semibold mb-3">Inventarliste exportieren</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={downloadCSV}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center gap-2"
          >
            📥 CSV Download
          </button>
          <button
            onClick={() => window.print()}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded flex items-center gap-2"
          >
            🖨️ Drucken
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded flex items-center gap-2"
          >
            🔄 Aktualisieren
          </button>
        </div>
      </div>

      {/* Full Inventory List - Cards on mobile, Table on desktop */}
      <div className="bg-white p-4 rounded-lg shadow print:shadow-none">
        <h3 className="font-semibold mb-3">Vollständige Inventarliste</h3>
        <p className="text-sm text-gray-500 mb-4">
          Stand: {new Date().toLocaleString('de-CH')}
        </p>

        {/* Mobile Card View */}
        <div className="sm:hidden space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`p-3 rounded-lg border ${item.quantity <= item.min_quantity ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{item.name}</h4>
                  <p className="text-xs text-gray-500">{item.category_name || '-'} • {item.location_name || '-'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`text-lg font-bold ${item.quantity <= item.min_quantity ? 'text-red-600' : 'text-green-600'}`}>
                    {item.quantity}
                  </span>
                  <span className="text-xs text-gray-500 ml-1">{item.unit}</span>
                  <p className="text-xs text-gray-400">Min: {item.min_quantity}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-left">Kategorie</th>
                <th className="px-2 py-2 text-left">Lagerort</th>
                <th className="px-2 py-2 text-right">Bestand</th>
                <th className="px-2 py-2 text-right">Min</th>
                <th className="px-2 py-2 text-left">Barcode</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className={`border-t ${item.quantity <= item.min_quantity ? 'bg-red-50' : ''}`}>
                  <td className="px-2 py-2 font-medium">{item.name}</td>
                  <td className="px-2 py-2 text-gray-600">{item.category_name || '-'}</td>
                  <td className="px-2 py-2 text-gray-600">{item.location_name || '-'}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${
                    item.quantity <= item.min_quantity ? 'text-red-600' : ''
                  }`}>
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-500">{item.min_quantity}</td>
                  <td className="px-2 py-2 text-gray-500 font-mono text-xs">
                    {item.custom_barcode || item.ean_code || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <p className="text-center text-gray-500 py-8">Keine Artikel vorhanden</p>
        )}
      </div>
    </div>
  );
}

// Item Detail Modal with Edit and Image functionality
function ItemDetailModal({ item, token, user, onLogin, onClose, onUpdate, categories, locations }: {
  item: Item;
  token: string | null;
  user: User | null;
  onLogin: () => void;
  onClose: () => void;
  onUpdate: () => void;
  categories: Category[];
  locations: Location[];
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'stock' | 'edit'>('details');
  const [quantity, setQuantity] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentItem, setCurrentItem] = useState(item);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: item.name,
    description: item.description || '',
    category_id: item.category_id?.toString() || '',
    location_id: item.location_id?.toString() || '',
    ean_code: item.ean_code || '',
    min_quantity: item.min_quantity.toString(),
    unit: item.unit,
    sellable: item.sellable || false,
    sale_price: item.sale_price?.toString() || '',
    sale_category: item.sale_category || '',
    printer_station: item.printer_station || 'bar'
  });

  const updateStock = async (type: 'in' | 'out') => {
    if (!token) {
      alert('Bitte zuerst einloggen');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/items/${item.id}/stock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type, quantity, reason: `${type === 'in' ? 'Eingang' : 'Ausgang'} via App` })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentItem(prev => ({ ...prev, quantity: data.new_quantity }));
        onUpdate();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler');
      }
    } catch (error) {
      alert('Fehler beim Aktualisieren');
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!token) {
      alert('Bitte zuerst einloggen');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch(`${API_URL}/items/${item.id}/image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentItem(prev => ({ ...prev, image_url: data.image_url }));
        onUpdate();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler beim Hochladen');
      }
    } catch (error) {
      alert('Fehler beim Hochladen');
    }
    setUploading(false);
  };

  const handleDeleteImage = async () => {
    if (!token || !confirm('Bild wirklich löschen?')) return;

    try {
      const res = await fetch(`${API_URL}/items/${item.id}/image`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        setCurrentItem(prev => ({ ...prev, image_url: undefined }));
        onUpdate();
      } else {
        alert('Fehler beim Löschen');
      }
    } catch (error) {
      alert('Fehler beim Löschen');
    }
  };

  const handleDeleteItem = async () => {
    if (!token || !confirm(`Artikel "${currentItem.name}" wirklich löschen?`)) return;

    try {
      const res = await fetch(`${API_URL}/items/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        onClose();
        onUpdate();
      } else {
        alert('Fehler beim Löschen des Artikels');
      }
    } catch (error) {
      alert('Fehler beim Löschen des Artikels');
    }
  };

  const handleSaveEdit = async () => {
    if (!token) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/items/${item.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...editForm,
          category_id: editForm.category_id || null,
          location_id: editForm.location_id || null,
          min_quantity: parseInt(editForm.min_quantity),
          sellable: editForm.sellable,
          sale_price: editForm.sellable && editForm.sale_price ? parseFloat(editForm.sale_price) : null,
          sale_category: editForm.sellable ? editForm.sale_category : null,
          printer_station: editForm.sellable ? editForm.printer_station : null
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setCurrentItem(updated);
        onUpdate();
        setActiveTab('details');
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler beim Speichern');
      }
    } catch (error) {
      alert('Fehler beim Speichern');
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-start p-4 border-b">
          <h2 className="text-lg sm:text-xl font-bold pr-4 truncate">{currentItem.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0">&times;</button>
        </div>

        {/* Tabs */}
        {user && (
          <div className="flex border-b">
            {[
              { id: 'details', label: '📋 Details' },
              { id: 'stock', label: '📦 Bestand' },
              { id: 'edit', label: '✏️ Bearbeiten' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'details' | 'stock' | 'edit')}
                className={`flex-1 py-2 text-sm font-medium ${
                  activeTab === tab.id ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Image */}
              <div className="relative">
                {currentItem.image_url ? (
                  <div className="relative">
                    <img
                      src={currentItem.image_url.startsWith('http') ? currentItem.image_url : `${API_URL}${currentItem.image_url}`}
                      alt={currentItem.name}
                      className="w-full h-48 object-contain bg-gray-100 rounded-lg"
                    />
                    {user && (
                      <button
                        onClick={handleDeleteImage}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full text-xs"
                        title="Bild löschen"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400 text-4xl">📷</span>
                  </div>
                )}

                {/* Upload buttons */}
                {user && (
                  <div className="flex gap-2 mt-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                    />
                    <input
                      type="file"
                      ref={cameraInputRef}
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                    />
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-1"
                    >
                      📷 {uploading ? '...' : 'Foto'}
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 py-2 px-3 rounded-lg text-sm flex items-center justify-center gap-1"
                    >
                      📁 {uploading ? '...' : 'Datei'}
                    </button>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="space-y-2">
                {currentItem.description && <p className="text-gray-600 text-sm">{currentItem.description}</p>}
                <p className="text-sm text-gray-500">Kategorie: {currentItem.category_name || '-'}</p>
                <p className="text-sm text-gray-500">Lagerort: {currentItem.location_name || '-'}</p>
                <p className="text-sm text-gray-500">Barcode: {currentItem.custom_barcode || currentItem.ean_code || '-'}</p>
                {(currentItem.custom_barcode || currentItem.ean_code) && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <div className="flex flex-wrap items-start gap-4">
                      {/* QR Code */}
                      {currentItem.custom_barcode && (
                        <div className="text-center">
                          <img
                            src={`${API_URL}/qrcode/generate/${currentItem.custom_barcode}?size=100&logoSize=18`}
                            alt="QR Code"
                            className="h-24 w-24"
                          />
                          <p className="text-xs text-gray-400 mt-1">QR-Code</p>
                        </div>
                      )}
                      {/* Barcode */}
                      <div className="text-center">
                        <img
                          src={`${API_URL}/barcode/generate/${currentItem.custom_barcode || currentItem.ean_code}`}
                          alt="Barcode"
                          className="h-12"
                        />
                        <p className="text-xs text-gray-400 mt-1">Barcode</p>
                      </div>
                    </div>
                    {/* Print Button */}
                    {currentItem.custom_barcode && (
                      <button
                        onClick={() => window.open(`${API_URL}/qrcode/label/${currentItem.custom_barcode}`, '_blank')}
                        className="mt-3 w-full bg-gray-200 hover:bg-gray-300 py-2 px-4 rounded-lg text-sm flex items-center justify-center gap-2"
                      >
                        🏷️ QR-Etikett drucken
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Quick stock display */}
              <div className="text-center py-4 bg-gray-50 rounded-lg">
                <span className={`text-4xl font-bold ${currentItem.quantity <= currentItem.min_quantity ? 'text-red-500' : 'text-blue-600'}`}>
                  {currentItem.quantity}
                </span>
                <span className="text-xl text-gray-500 ml-2">{currentItem.unit}</span>
                <p className="text-sm text-gray-400">Min: {currentItem.min_quantity}</p>
              </div>
            </div>
          )}

          {/* Stock Tab */}
          {activeTab === 'stock' && user && (
            <div className="space-y-4">
              <div className="text-center py-4">
                <span className="text-5xl font-bold text-blue-600">{currentItem.quantity}</span>
                <span className="text-xl text-gray-500 ml-2">{currentItem.unit}</span>
              </div>

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-12 h-12 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-full text-2xl font-bold touch-manipulation"
                >
                  -
                </button>
                <span className="text-3xl font-bold w-16 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-12 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-full text-2xl font-bold touch-manipulation"
                >
                  +
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateStock('out')}
                  className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-4 rounded-lg text-lg font-semibold touch-manipulation"
                >
                  - Ausgang
                </button>
                <button
                  onClick={() => updateStock('in')}
                  className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-4 rounded-lg text-lg font-semibold touch-manipulation"
                >
                  + Eingang
                </button>
              </div>
            </div>
          )}

          {/* Edit Tab */}
          {activeTab === 'edit' && user && (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Name *"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
                className="w-full p-3 border rounded-lg"
              />

              <textarea
                placeholder="Beschreibung"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                className="w-full p-3 border rounded-lg"
                rows={2}
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={editForm.category_id}
                  onChange={(e) => setEditForm({ ...editForm, category_id: e.target.value })}
                  className="p-3 border rounded-lg"
                >
                  <option value="">Kategorie</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                <select
                  value={editForm.location_id}
                  onChange={(e) => setEditForm({ ...editForm, location_id: e.target.value })}
                  className="p-3 border rounded-lg"
                >
                  <option value="">Lagerort</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              <input
                type="text"
                placeholder="EAN-Code"
                value={editForm.ean_code}
                onChange={(e) => setEditForm({ ...editForm, ean_code: e.target.value })}
                className="w-full p-3 border rounded-lg"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Min. Bestand</label>
                  <input
                    type="number"
                    value={editForm.min_quantity}
                    onChange={(e) => setEditForm({ ...editForm, min_quantity: e.target.value })}
                    className="w-full p-3 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Einheit</label>
                  <input
                    type="text"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    className="w-full p-3 border rounded-lg"
                  />
                </div>
              </div>

              {/* Sellable Section */}
              <div className="border-t pt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.sellable}
                    onChange={(e) => setEditForm({ ...editForm, sellable: e.target.checked })}
                    className="w-5 h-5"
                  />
                  <span className="font-medium">In Kasse verkaufen</span>
                </label>

                {editForm.sellable && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <input
                      type="number"
                      step="0.05"
                      placeholder="Preis CHF"
                      value={editForm.sale_price}
                      onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                      className="p-2 border rounded-lg text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Kategorie"
                      value={editForm.sale_category}
                      onChange={(e) => setEditForm({ ...editForm, sale_category: e.target.value })}
                      className="p-2 border rounded-lg text-sm"
                    />
                    <select
                      value={editForm.printer_station}
                      onChange={(e) => setEditForm({ ...editForm, printer_station: e.target.value })}
                      className="p-2 border rounded-lg text-sm"
                    >
                      <option value="bar">Bar</option>
                      <option value="kitchen">Küche</option>
                    </select>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold mt-4"
              >
                {saving ? 'Speichern...' : '💾 Speichern'}
              </button>

              <button
                onClick={handleDeleteItem}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-semibold mt-2"
              >
                🗑️ Artikel löschen
              </button>
            </div>
          )}

          {/* Not logged in */}
          {!user && (
            <div className="text-center text-gray-500 py-8">
              <button onClick={onLogin} className="text-blue-600 underline">
                Anmelden
              </button>
              {' '}um Artikel zu bearbeiten
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ========================================
// PUBLIC ITEM VIEW (for external QR code scans)
// ========================================

function PublicItemView({ code, onNavigateToApp }: { code: string; onNavigateToApp: () => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchItem() {
      try {
        const res = await fetch(`${API_URL}/public/item/${code}`);
        if (res.ok) {
          setItem(await res.json());
        } else if (res.status === 404) {
          setError('Artikel nicht gefunden');
        } else {
          setError('Fehler beim Laden');
        }
      } catch {
        setError('Netzwerkfehler');
      }
      setLoading(false);
    }
    fetchItem();
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">Lädt...</p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2 text-gray-800">{error || 'Artikel nicht gefunden'}</h1>
          <p className="text-gray-500 mb-6 font-mono">{code}</p>
          <button
            onClick={onNavigateToApp}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold w-full"
          >
            📱 Zur Inventar-App
          </button>
        </div>
      </div>
    );
  }

  const isLowStock = item.quantity <= item.min_quantity;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex items-center gap-3">
          <img src="/logo.png" alt="FWV Raura" className="h-10 w-10 rounded-full bg-white p-1" />
          <h1 className="text-lg font-bold">Lagerverwaltung</h1>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto p-4 max-w-lg">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Image */}
          {item.image_url && (
            <div className="bg-gray-100 p-4">
              <img
                src={item.image_url.startsWith('http') ? item.image_url : `${API_URL}${item.image_url}`}
                alt={item.name}
                className="w-full h-48 object-contain"
              />
            </div>
          )}

          {/* Details */}
          <div className="p-6">
            <h1 className="text-2xl font-bold mb-2 text-gray-800">{item.name}</h1>

            {item.description && (
              <p className="text-gray-600 mb-4">{item.description}</p>
            )}

            {/* Stock Display */}
            <div className={`text-center p-4 rounded-lg mb-4 ${isLowStock ? 'bg-red-50' : 'bg-green-50'}`}>
              <span className={`text-4xl font-bold ${isLowStock ? 'text-red-600' : 'text-green-600'}`}>
                {item.quantity}
              </span>
              <span className="text-xl text-gray-500 ml-2">{item.unit}</span>
              {isLowStock && (
                <p className="text-red-600 text-sm mt-1">Bestand niedrig!</p>
              )}
            </div>

            {/* Info Table */}
            <div className="space-y-3 border-t pt-4">
              {item.category_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Kategorie:</span>
                  <span className="font-medium text-gray-800">{item.category_name}</span>
                </div>
              )}
              {item.location_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Lagerort:</span>
                  <span className="font-medium text-gray-800">{item.location_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Barcode:</span>
                <span className="font-mono text-gray-800">{item.custom_barcode || item.ean_code || '-'}</span>
              </div>
            </div>

            {/* QR Code and Barcode */}
            {(item.custom_barcode || item.ean_code) && (
              <div className="mt-6 border-t pt-6">
                <div className="flex justify-center items-start gap-6">
                  {/* QR Code */}
                  {item.custom_barcode && (
                    <div className="text-center">
                      <img
                        src={`${API_URL}/qrcode/generate/${item.custom_barcode}?size=140`}
                        alt="QR Code"
                      />
                      <p className="text-xs text-gray-400 mt-1">QR-Code</p>
                    </div>
                  )}
                  {/* Barcode */}
                  <div className="text-center">
                    <img
                      src={`${API_URL}/barcode/generate/${item.custom_barcode || item.ean_code}`}
                      alt="Barcode"
                      className="h-16"
                    />
                    <p className="text-xs text-gray-400 mt-1">Barcode</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4">
          <button
            onClick={onNavigateToApp}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg font-semibold text-lg"
          >
            📱 Inventar-App öffnen
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          Feuerwehrverein Raura - Lagerverwaltung
        </p>
      </main>
    </div>
  );
}

export default App;
