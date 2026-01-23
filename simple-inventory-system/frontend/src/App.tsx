import { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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

type Tab = 'items' | 'scanner' | 'add' | 'low-stock';

function App() {
  const [tab, setTab] = useState<Tab>('items');
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('inventory_token'));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_authMode, setAuthMode] = useState<{ local: boolean } | null>(null);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [scanResult, setScanResult] = useState<Item | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);

  // Fetch auth mode
  useEffect(() => {
    fetch(`${API_URL}/auth/mode`)
      .then(res => res.json())
      .then(data => setAuthMode(data))
      .catch(console.error);
  }, []);

  // Fetch data
  useEffect(() => {
    fetchItems();
    fetchCategories();
    fetchLocations();
  }, [search]);

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

  // Login
  const handleLogin = async (password: string) => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        localStorage.setItem('inventory_token', data.token);
      } else {
        alert('Login fehlgeschlagen');
      }
    } catch (error) {
      alert('Login fehlgeschlagen');
    }
  };

  // Barcode Scanner
  const startScanner = async () => {
    setIsScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      codeReaderRef.current = new BrowserMultiFormatReader();
      const videoInputDevices = await BrowserMultiFormatReader.listVideoInputDevices();

      if (videoInputDevices.length === 0) {
        setScanError('Keine Kamera gefunden');
        setIsScanning(false);
        return;
      }

      // Prefer back camera
      const backCamera = videoInputDevices.find(d => d.label.toLowerCase().includes('back')) || videoInputDevices[0];

      await codeReaderRef.current.decodeFromVideoDevice(
        backCamera.deviceId,
        videoRef.current!,
        async (result) => {
          if (result) {
            const code = result.getText();
            stopScanner();

            // Lookup item
            try {
              const res = await fetch(`${API_URL}/items/barcode/${code}`);
              if (res.ok) {
                const item = await res.json();
                setScanResult(item);
              } else {
                setScanError(`Artikel nicht gefunden: ${code}`);
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
      // Stop the video stream
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

  // Render
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-blue-600 text-white p-4 shadow-lg">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold">Lagerverwaltung</h1>
          {token ? (
            <button
              onClick={() => { setToken(null); localStorage.removeItem('inventory_token'); }}
              className="text-sm bg-blue-700 px-3 py-1 rounded"
            >
              Abmelden
            </button>
          ) : (
            <button
              onClick={() => {
                const pw = prompt('Admin-Passwort:');
                if (pw) handleLogin(pw);
              }}
              className="text-sm bg-blue-700 px-3 py-1 rounded"
            >
              Anmelden
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-white shadow">
        <div className="container mx-auto flex">
          {(['items', 'scanner', 'add', 'low-stock'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); if (t !== 'scanner') stopScanner(); }}
              className={`flex-1 py-3 text-center font-medium ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
            >
              {t === 'items' && 'Artikel'}
              {t === 'scanner' && 'Scanner'}
              {t === 'add' && 'Hinzufügen'}
              {t === 'low-stock' && 'Nachbestellen'}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="container mx-auto p-4">
        {/* Items Tab */}
        {tab === 'items' && (
          <div>
            <input
              type="text"
              placeholder="Suchen (Name, Barcode...)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full p-3 border rounded-lg mb-4"
            />
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`bg-white p-4 rounded-lg shadow cursor-pointer ${item.quantity <= item.min_quantity ? 'border-l-4 border-red-500' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{item.name}</h3>
                      <p className="text-sm text-gray-500">
                        {item.category_name} • {item.location_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.custom_barcode || item.ean_code || '-'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-bold ${item.quantity <= item.min_quantity ? 'text-red-500' : 'text-green-600'}`}>
                        {item.quantity}
                      </span>
                      <span className="text-sm text-gray-500 ml-1">{item.unit}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scanner Tab */}
        {tab === 'scanner' && (
          <div className="space-y-4">
            {!isScanning && !scanResult && (
              <button
                onClick={startScanner}
                className="w-full bg-blue-600 text-white py-4 rounded-lg text-lg font-semibold"
              >
                Scanner starten
              </button>
            )}

            {isScanning && (
              <div className="relative">
                <video ref={videoRef} className="w-full rounded-lg" />
                <button
                  onClick={stopScanner}
                  className="absolute top-2 right-2 bg-red-500 text-white px-4 py-2 rounded"
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
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-2">{scanResult.name}</h2>
                <p className="text-gray-500 mb-4">{scanResult.custom_barcode || scanResult.ean_code}</p>

                <div className="text-center mb-6">
                  <span className="text-5xl font-bold text-blue-600">{scanResult.quantity}</span>
                  <span className="text-xl text-gray-500 ml-2">{scanResult.unit}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => updateStock(scanResult.id, 'out')}
                    className="bg-red-500 text-white py-4 rounded-lg text-lg font-semibold"
                  >
                    - Ausgang
                  </button>
                  <button
                    onClick={() => updateStock(scanResult.id, 'in')}
                    className="bg-green-500 text-white py-4 rounded-lg text-lg font-semibold"
                  >
                    + Eingang
                  </button>
                </div>

                <button
                  onClick={() => { setScanResult(null); startScanner(); }}
                  className="w-full mt-4 bg-gray-200 py-3 rounded-lg"
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
                    const code = (e.target as HTMLInputElement).value;
                    try {
                      const res = await fetch(`${API_URL}/items/barcode/${code}`);
                      if (res.ok) {
                        setScanResult(await res.json());
                        setScanError(null);
                      } else {
                        setScanError(`Artikel nicht gefunden: ${code}`);
                      }
                    } catch (error) {
                      setScanError('Fehler beim Suchen');
                    }
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
                className="w-full p-3 border rounded-lg"
              />
              <p className="text-sm text-gray-500 mt-1">
                USB-Barcode-Scanner werden automatisch erkannt
              </p>
            </div>
          </div>
        )}

        {/* Add Item Tab */}
        {tab === 'add' && token && (
          <AddItemForm
            categories={categories}
            locations={locations}
            token={token}
            onSuccess={() => { fetchItems(); setTab('items'); }}
          />
        )}

        {tab === 'add' && !token && (
          <div className="text-center py-8 text-gray-500">
            Bitte zuerst einloggen um Artikel hinzuzufügen
          </div>
        )}

        {/* Low Stock Tab */}
        {tab === 'low-stock' && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold mb-4">Artikel mit niedrigem Bestand</h2>
            {items.filter(i => i.quantity <= i.min_quantity).map(item => (
              <div key={item.id} className="bg-white p-4 rounded-lg shadow border-l-4 border-red-500">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <p className="text-sm text-gray-500">{item.location_name}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-red-500">{item.quantity}</span>
                    <span className="text-gray-400"> / {item.min_quantity}</span>
                  </div>
                </div>
              </div>
            ))}
            {items.filter(i => i.quantity <= i.min_quantity).length === 0 && (
              <p className="text-center text-gray-500 py-8">Alle Artikel ausreichend vorhanden</p>
            )}
          </div>
        )}
      </main>

      {/* Item Detail Modal */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          token={token}
          onClose={() => setSelectedItem(null)}
          onUpdate={fetchItems}
        />
      )}
    </div>
  );
}

// Add Item Form Component
function AddItemForm({ categories, locations, token, onSuccess }: {
  categories: Category[];
  locations: Location[];
  token: string;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    category_id: '',
    location_id: '',
    ean_code: '',
    quantity: '0',
    min_quantity: '0',
    unit: 'Stück'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/items`, {
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
          min_quantity: parseInt(form.min_quantity)
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
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow space-y-4">
      <h2 className="text-lg font-semibold">Neuen Artikel anlegen</h2>

      <input
        type="text"
        placeholder="Name *"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="w-full p-3 border rounded-lg"
      />

      <textarea
        placeholder="Beschreibung"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        className="w-full p-3 border rounded-lg"
        rows={2}
      />

      <div className="grid grid-cols-2 gap-4">
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          className="p-3 border rounded-lg"
        >
          <option value="">Kategorie wählen</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select
          value={form.location_id}
          onChange={(e) => setForm({ ...form, location_id: e.target.value })}
          className="p-3 border rounded-lg"
        >
          <option value="">Lagerort wählen</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <input
        type="text"
        placeholder="EAN-Code (optional, sonst wird eigener generiert)"
        value={form.ean_code}
        onChange={(e) => setForm({ ...form, ean_code: e.target.value })}
        className="w-full p-3 border rounded-lg"
      />

      <div className="grid grid-cols-3 gap-4">
        <input
          type="number"
          placeholder="Menge"
          value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          className="p-3 border rounded-lg"
        />
        <input
          type="number"
          placeholder="Min. Bestand"
          value={form.min_quantity}
          onChange={(e) => setForm({ ...form, min_quantity: e.target.value })}
          className="p-3 border rounded-lg"
        />
        <input
          type="text"
          placeholder="Einheit"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
          className="p-3 border rounded-lg"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold"
      >
        Artikel anlegen
      </button>
    </form>
  );
}

// Item Detail Modal
function ItemDetailModal({ item, token, onClose, onUpdate }: {
  item: Item;
  token: string | null;
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/items/${item.id}/stock`, {
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
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xl font-bold">{item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="space-y-2 mb-6">
          <p className="text-gray-600">{item.description}</p>
          <p className="text-sm text-gray-500">Kategorie: {item.category_name || '-'}</p>
          <p className="text-sm text-gray-500">Lagerort: {item.location_name || '-'}</p>
          <p className="text-sm text-gray-500">Barcode: {item.custom_barcode || item.ean_code || '-'}</p>
          {item.custom_barcode && (
            <img
              src={`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/barcode/generate/${item.custom_barcode}`}
              alt="Barcode"
              className="h-16"
            />
          )}
        </div>

        <div className="text-center mb-6">
          <span className="text-5xl font-bold text-blue-600">{item.quantity}</span>
          <span className="text-xl text-gray-500 ml-2">{item.unit}</span>
          <p className="text-sm text-gray-400">Min: {item.min_quantity}</p>
        </div>

        {token && (
          <>
            <div className="flex items-center justify-center gap-4 mb-4">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 bg-gray-200 rounded-full text-xl">-</button>
              <span className="text-2xl font-bold w-16 text-center">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 bg-gray-200 rounded-full text-xl">+</button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => updateStock('out')}
                className="bg-red-500 text-white py-3 rounded-lg font-semibold"
              >
                - Ausgang
              </button>
              <button
                onClick={() => updateStock('in')}
                className="bg-green-500 text-white py-3 rounded-lg font-semibold"
              >
                + Eingang
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
