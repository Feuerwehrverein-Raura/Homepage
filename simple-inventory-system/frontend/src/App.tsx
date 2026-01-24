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
  category_name?: string;
  location_name?: string;
  ean_code?: string;
  custom_barcode?: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  purchase_price?: number;
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

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
            const code = result.getText();
            stopScanner();

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

      {/* Tabs */}
      <nav className="bg-white shadow overflow-x-auto">
        <div className="container mx-auto flex min-w-max">
          {(['items', 'scanner', 'add', 'low-stock', 'reports'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t !== 'scanner') stopScanner(); }}
              className={`flex-1 py-3 px-4 text-center font-medium whitespace-nowrap text-sm sm:text-base ${
                tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'
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

      {/* Content */}
      <main className="container mx-auto p-2 sm:p-4">
        {/* Items Tab */}
        {tab === 'items' && (
          <div>
            <input
              type="text"
              placeholder="Suchen (Name, Barcode...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-3 border rounded-lg mb-4 text-base"
            />
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`bg-white p-3 sm:p-4 rounded-lg shadow cursor-pointer active:bg-gray-50 touch-manipulation ${
                    item.quantity <= item.min_quantity ? 'border-l-4 border-red-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        {item.category_name} • {item.location_name}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {item.custom_barcode || item.ean_code || '-'}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={`text-xl sm:text-2xl font-bold ${
                        item.quantity <= item.min_quantity ? 'text-red-500' : 'text-green-600'
                      }`}>
                        {item.quantity}
                      </span>
                      <span className="text-xs sm:text-sm text-gray-500 ml-1">{item.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-center text-gray-500 py-8">
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
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-semibold mb-4">Artikel mit niedrigem Bestand</h2>
            {items.filter(i => i.quantity <= i.min_quantity).map(item => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-white p-3 sm:p-4 rounded-lg shadow border-l-4 border-red-500 cursor-pointer active:bg-gray-50 touch-manipulation"
              >
                <div className="flex justify-between items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-sm sm:text-base truncate">{item.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{item.location_name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-xl sm:text-2xl font-bold text-red-500">{item.quantity}</span>
                    <span className="text-gray-400 text-sm"> / {item.min_quantity}</span>
                  </div>
                </div>
              </div>
            ))}
            {items.filter(i => i.quantity <= i.min_quantity).length === 0 && (
              <p className="text-center text-gray-500 py-8">Alle Artikel ausreichend vorhanden ✓</p>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {tab === 'reports' && (
          <ReportsView items={items} onRefresh={fetchItems} />
        )}
      </main>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          token={token}
          user={user}
          onLogin={login}
          onClose={() => setSelectedItem(null)}
          onUpdate={fetchItems}
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
        onSuccess();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler beim Speichern');
      }
    } catch (error) {
      alert('Fehler beim Speichern');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
      <h2 className="text-base sm:text-lg font-semibold">Neuen Artikel anlegen</h2>

      <input
        type="text"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="w-full p-3 border rounded-lg text-base"
      />

      <textarea
        placeholder="Beschreibung"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full p-3 border rounded-lg text-base"
        rows={2}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <div className="flex gap-2">
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="flex-1 p-3 border rounded-lg text-base"
            >
              <option value="">Kategorie wählen</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowNewCategory(!showNewCategory)}
              className="px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
            >+</button>
          </div>
          {showNewCategory && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Neue Kategorie"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1 p-2 border rounded-lg text-sm"
              />
              <button type="button" onClick={createCategory} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">Erstellen</button>
            </div>
          )}
        </div>

        <div>
          <div className="flex gap-2">
            <select
              value={form.location_id}
              onChange={(e) => setForm({ ...form, location_id: e.target.value })}
              className="flex-1 p-3 border rounded-lg text-base"
            >
              <option value="">Lagerort wählen</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setShowNewLocation(!showNewLocation)}
              className="px-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold"
            >+</button>
          </div>
          {showNewLocation && (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                placeholder="Neuer Lagerort"
                value={newLocation}
                onChange={(e) => setNewLocation(e.target.value)}
                className="flex-1 p-2 border rounded-lg text-sm"
              />
              <button type="button" onClick={createLocation} className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm">Erstellen</button>
            </div>
          )}
        </div>
      </div>

      <input
        type="text"
        placeholder="EAN-Code (optional, sonst wird eigener generiert)"
        value={form.ean_code}
        onChange={(e) => setForm({ ...form, ean_code: e.target.value })}
        className="w-full p-3 border rounded-lg text-base"
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Menge</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="w-full p-3 border rounded-lg text-base"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Min. Bestand</label>
          <input
            type="number"
            inputMode="numeric"
            value={form.min_quantity}
            onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
            className="w-full p-3 border rounded-lg text-base"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Einheit</label>
          <input
            type="text"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            className="w-full p-3 border rounded-lg text-base"
          />
        </div>
      </div>

      {/* Sellable Section for POS */}
      <div className="border-t pt-4 mt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.sellable}
            onChange={(e) => setForm({ ...form, sellable: e.target.checked })}
            className="w-5 h-5 rounded"
          />
          <span className="font-medium">In Kasse verkaufen</span>
        </label>

        {form.sellable && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Verkaufspreis (CHF)</label>
              <input
                type="number"
                step="0.05"
                placeholder="z.B. 5.00"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                className="w-full p-3 border rounded-lg text-base"
                required={form.sellable}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Verkaufskategorie</label>
              <input
                type="text"
                placeholder="z.B. Getränke"
                value={form.sale_category}
                onChange={(e) => setForm({ ...form, sale_category: e.target.value })}
                className="w-full p-3 border rounded-lg text-base"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Drucker</label>
              <select
                value={form.printer_station}
                onChange={(e) => setForm({ ...form, printer_station: e.target.value })}
                className="w-full p-3 border rounded-lg text-base"
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
        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-3 rounded-lg font-semibold touch-manipulation"
      >
        Artikel anlegen
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

      {/* Full Inventory List (for print) */}
      <div className="bg-white p-4 rounded-lg shadow print:shadow-none">
        <h3 className="font-semibold mb-3">Vollständige Inventarliste</h3>
        <p className="text-sm text-gray-500 mb-4">
          Stand: {new Date().toLocaleString('de-CH')}
        </p>

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[600px] text-sm">
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

// Item Detail Modal
function ItemDetailModal({ item, token, user, onLogin, onClose, onUpdate }: {
  item: Item;
  token: string | null;
  user: User | null;
  onLogin: () => void;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [quantity, setQuantity] = useState(1);

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
        onUpdate();
        onClose();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler');
      }
    } catch (error) {
      alert('Fehler beim Aktualisieren');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg sm:text-xl font-bold pr-4">{item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="space-y-2 mb-6">
          {item.description && <p className="text-gray-600 text-sm">{item.description}</p>}
          <p className="text-xs sm:text-sm text-gray-500">Kategorie: {item.category_name || '-'}</p>
          <p className="text-xs sm:text-sm text-gray-500">Lagerort: {item.location_name || '-'}</p>
          <p className="text-xs sm:text-sm text-gray-500">Barcode: {item.custom_barcode || item.ean_code || '-'}</p>
          {item.custom_barcode && (
            <img
              src={`${API_URL}/barcode/generate/${item.custom_barcode}`}
              alt="Barcode"
              className="h-12 sm:h-16"
            />
          )}
        </div>

        <div className="text-center mb-6">
          <span className="text-4xl sm:text-5xl font-bold text-blue-600">{item.quantity}</span>
          <span className="text-lg sm:text-xl text-gray-500 ml-2">{item.unit}</span>
          <p className="text-xs sm:text-sm text-gray-400">Min: {item.min_quantity}</p>
        </div>

        {user ? (
          <>
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-full text-xl font-bold touch-manipulation"
              >
                -
              </button>
              <span className="text-2xl font-bold w-12 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 bg-gray-200 hover:bg-gray-300 active:bg-gray-400 rounded-full text-xl font-bold touch-manipulation"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <button
                onClick={() => updateStock('out')}
                className="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white py-3 rounded-lg font-semibold touch-manipulation"
              >
                - Ausgang
              </button>
              <button
                onClick={() => updateStock('in')}
                className="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white py-3 rounded-lg font-semibold touch-manipulation"
              >
                + Eingang
              </button>
            </div>
          </>
        ) : (
          <div className="text-center text-gray-500 py-4">
            <button onClick={onLogin} className="text-blue-600 underline">
              Anmelden
            </button>
            {' '}um Bestand zu ändern
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
