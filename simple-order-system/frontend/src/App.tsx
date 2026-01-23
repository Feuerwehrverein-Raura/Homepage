import { useState, useEffect, useCallback } from 'react';

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

// Environment variables
const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTHENTIK_URL = import.meta.env.VITE_AUTHENTIK_URL || 'https://auth.fwv-raura.ch';
const CLIENT_ID = import.meta.env.VITE_AUTHENTIK_CLIENT_ID || 'order-system';
const REDIRECT_URI = window.location.origin + '/auth/callback';

interface Item {
  id: number;
  name: string;
  price: number;
  category: string;
  printer_station: string;
}

interface CartItem extends Item {
  quantity: number;
  notes: string;
  customPrice?: number;
}

interface User {
  name: string;
  email: string;
  groups: string[];
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<string>('');
  const [view, setView] = useState<'order' | 'inventory'>('order');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('order_token'));
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '', category: 'Sonstiges' });

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

  // Fetch items on mount (no auth required for viewing)
  useEffect(() => {
    fetchItems();
  }, []);

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
        localStorage.setItem('order_token', data.access_token);
        setToken(data.access_token);
        sessionStorage.removeItem('code_verifier');

        // Parse user info from token
        const payload = JSON.parse(atob(data.access_token.split('.')[1]));
        setUser({
          name: payload.name || payload.preferred_username || 'User',
          email: payload.email || '',
          groups: payload.groups || [],
        });

        // Clear URL params
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        console.error('Token exchange failed');
        localStorage.removeItem('order_token');
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
        localStorage.removeItem('order_token');
        setToken(null);
        setUser(null);
      } else {
        setUser({
          name: payload.name || payload.preferred_username || 'User',
          email: payload.email || '',
          groups: payload.groups || [],
        });
      }
    } catch (error) {
      console.error('Token validation error:', error);
      localStorage.removeItem('order_token');
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
    localStorage.removeItem('order_token');
    setToken(null);
    setUser(null);
    setView('order');
  };

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_URL}/items`);
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const addToCart = (item: Item) => {
    const existing = cart.find(c => c.id === item.id && !c.customPrice);
    if (existing) {
      setCart(cart.map(c =>
        c.id === item.id && !c.customPrice ? { ...c, quantity: c.quantity + 1 } : c
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1, notes: '' }]);
    }
  };

  const addCustomItemToCart = () => {
    if (!customItem.name || !customItem.price) return;

    const price = parseFloat(customItem.price);
    if (isNaN(price) || price <= 0) return;

    const newItem: CartItem = {
      id: Date.now(),
      name: customItem.name,
      price: price,
      category: customItem.category,
      printer_station: 'bar',
      quantity: 1,
      notes: '',
      customPrice: price,
    };

    setCart([...cart, newItem]);
    setCustomItem({ name: '', price: '', category: 'Sonstiges' });
    setShowCustomItem(false);
  };

  const updateQuantity = (id: number, customPrice: number | undefined, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(c => !(c.id === id && c.customPrice === customPrice)));
    } else {
      setCart(cart.map(c =>
        c.id === id && c.customPrice === customPrice ? { ...c, quantity } : c
      ));
    }
  };

  const updateNotes = (id: number, customPrice: number | undefined, notes: string) => {
    setCart(cart.map(c =>
      c.id === id && c.customPrice === customPrice ? { ...c, notes } : c
    ));
  };

  const pollPaymentStatus = async (paymentId: number) => {
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
      attempts++;

      try {
        const res = await fetch(`${API_URL}/payments/${paymentId}`);
        const data = await res.json();

        if (data.status === 'completed' || data.status === 'PAID') {
          clearInterval(interval);
          alert('✅ Zahlung erfolgreich abgeschlossen!');
          setCart([]);
          setTableNumber('');
          setLoading(false);
        } else if (data.status === 'failed' || data.status === 'FAILED') {
          clearInterval(interval);
          alert('❌ Zahlung fehlgeschlagen. Bitte erneut versuchen.');
          setLoading(false);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          alert('⏱️ Timeout: Zahlung dauert zu lange. Bitte Status prüfen.');
          setLoading(false);
        }
      } catch (error) {
        console.error('Payment status check error:', error);
      }
    }, 2000);
  };

  const submitOrder = async () => {
    if (!tableNumber || cart.length === 0) {
      alert('Bitte Tischnummer eingeben und Artikel auswählen!');
      return;
    }

    setLoading(true);
    try {
      const orderRes = await fetch(`${API_URL}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          table_number: parseInt(tableNumber),
          items: cart.map(c => ({
            id: c.customPrice ? null : c.id,
            quantity: c.quantity,
            price: c.customPrice || c.price,
            notes: c.notes,
            item_name: c.name,
            printer_station: c.printer_station,
            is_custom: !!c.customPrice,
          })),
        }),
      });

      const order = await orderRes.json();

      const paymentMethod = confirm(
        `Bestellung erfolgreich erstellt!\n\n` +
        `Gesamtsumme: CHF ${total.toFixed(2)}\n\n` +
        `Zahlungsmethode wählen:\n` +
        `OK = Online bezahlen (SumUp/TWINT)\n` +
        `Abbrechen = Bar bezahlen`
      );

      if (paymentMethod) {
        const provider = prompt(
          'Zahlungsanbieter wählen:\n\n' +
          '1 = SumUp Terminal (3G)\n' +
          '2 = SumUp Online (Karte)\n' +
          '3 = TWINT (via RaiseNow)\n\n' +
          'Bitte Nummer eingeben:'
        );

        if (provider === '1' || provider === '2' || provider === '3') {
          const selectedProvider =
            provider === '1' ? 'sumup-terminal' :
            provider === '2' ? 'sumup' :
            'twint';

          const paymentRes = await fetch(`${API_URL}/payments/create`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              orderId: order.id,
              provider: selectedProvider,
            }),
          });

          if (!paymentRes.ok) {
            const error = await paymentRes.json();
            alert(`Fehler: ${error.message || 'Zahlung konnte nicht erstellt werden'}`);
            setLoading(false);
            return;
          }

          const payment = await paymentRes.json();

          if (selectedProvider === 'sumup-terminal') {
            alert(
              `💳 Zahlung an SumUp 3G Terminal gesendet!\n\n` +
              `Betrag: CHF ${total.toFixed(2)}\n\n` +
              `Bitte Karte ans Terminal halten.`
            );
            pollPaymentStatus(payment.id);
          } else if (payment.qr_code_url && selectedProvider === 'twint') {
            alert(
              `TWINT QR-Code bereit!\n\n` +
              `Bitte scannen Sie den QR-Code mit Ihrer TWINT App.\n\n` +
              `Der QR-Code wird in einem neuen Fenster geöffnet.`
            );
            window.open(payment.qr_code_url, '_blank');
          } else if (payment.payment_url) {
            alert(
              `Zahlung wird in neuem Fenster geöffnet.\n\n` +
              `Bitte schließen Sie die Zahlung ab.`
            );
            window.open(payment.payment_url, '_blank');
          }
        }
      }

      setCart([]);
      setTableNumber('');
      alert('Bestellung erfolgreich gesendet!');
    } catch (error) {
      alert('Fehler beim Senden der Bestellung');
    } finally {
      setLoading(false);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.customPrice || item.price) * item.quantity, 0);
  const categories = [...new Set(items.map(i => i.category))];

  // Show inventory view only if authenticated
  const showInventoryView = view === 'inventory' && user;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-fwv-red text-white p-3 sm:p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold">🔥 Kasse - FWV Raura</h1>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            {user && <span className="text-sm hidden sm:inline">Hallo, {user.name}</span>}
            <button
              onClick={() => setView('order')}
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm sm:text-base ${
                view === 'order' ? 'bg-white text-fwv-red' : 'bg-red-700'
              }`}
            >
              Kasse
            </button>
            {user ? (
              <>
                <button
                  onClick={() => setView('inventory')}
                  className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm sm:text-base ${
                    view === 'inventory' ? 'bg-white text-fwv-red' : 'bg-red-700'
                  }`}
                >
                  Artikel
                </button>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 rounded bg-red-800 text-sm sm:text-base"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={login}
                disabled={authLoading}
                className="px-3 py-1.5 sm:px-4 sm:py-2 rounded bg-red-700 hover:bg-red-800 text-sm sm:text-base"
              >
                {authLoading ? '...' : 'Admin Login'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showInventoryView ? (
        <InventoryView items={items} onUpdate={fetchItems} token={token} />
      ) : (
        <div className="max-w-7xl mx-auto p-2 sm:p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Menu */}
            <div className="lg:col-span-2 order-2 lg:order-1">
              <div className="bg-white rounded-lg shadow p-3 sm:p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg sm:text-xl font-bold">Menü</h2>
                  <button
                    onClick={() => setShowCustomItem(!showCustomItem)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm"
                  >
                    + Sonderposten
                  </button>
                </div>

                {/* Custom Item Form */}
                {showCustomItem && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="font-semibold mb-2">Sonderposten hinzufügen</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="Bezeichnung"
                        value={customItem.name}
                        onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <input
                        type="number"
                        step="0.05"
                        placeholder="Preis (CHF)"
                        value={customItem.price}
                        onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <button
                        onClick={addCustomItemToCart}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
                      >
                        Hinzufügen
                      </button>
                    </div>
                  </div>
                )}

                {categories.map(category => (
                  <div key={category} className="mb-4 sm:mb-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-2">
                      {category}
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {items
                        .filter(i => i.category === category)
                        .map(item => (
                          <button
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="bg-red-50 hover:bg-red-100 active:bg-red-200 border-2 border-fwv-red p-2 sm:p-3 rounded-lg text-left transition touch-manipulation"
                          >
                            <div className="font-semibold text-sm sm:text-base truncate">{item.name}</div>
                            <div className="text-fwv-red font-bold text-sm sm:text-base">
                              CHF {item.price.toFixed(2)}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    Keine Artikel vorhanden.
                    {!user && ' Melden Sie sich als Admin an, um Artikel hinzuzufügen.'}
                  </div>
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="lg:col-span-1 order-1 lg:order-2">
              <div className="bg-white rounded-lg shadow p-3 sm:p-4 lg:sticky lg:top-4">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Bestellung</h2>

                <div className="mb-3 sm:mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tischnummer
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-lg"
                    placeholder="Tisch..."
                  />
                </div>

                <div className="space-y-2 mb-3 sm:mb-4 max-h-60 sm:max-h-96 overflow-y-auto">
                  {cart.map((item, index) => (
                    <div key={`${item.id}-${item.customPrice}-${index}`} className="border-b pb-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm sm:text-base truncate">
                            {item.name}
                            {item.customPrice && <span className="text-blue-600 ml-1">*</span>}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">
                            CHF {(item.customPrice || item.price).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.customPrice, item.quantity - 1)}
                            className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 active:bg-gray-400 text-lg font-bold touch-manipulation"
                          >
                            -
                          </button>
                          <span className="w-6 sm:w-8 text-center font-bold text-sm sm:text-base">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.customPrice, item.quantity + 1)}
                            className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 active:bg-gray-400 text-lg font-bold touch-manipulation"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateNotes(item.id, item.customPrice, e.target.value)}
                        placeholder="Notiz..."
                        className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  ))}
                </div>

                {cart.length === 0 && (
                  <div className="text-center text-gray-400 py-4 text-sm">
                    Warenkorb ist leer
                  </div>
                )}

                <div className="border-t pt-3 sm:pt-4">
                  <div className="flex justify-between text-lg sm:text-xl font-bold mb-3 sm:mb-4">
                    <span>Total:</span>
                    <span>CHF {total.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={submitOrder}
                    disabled={loading || cart.length === 0 || !tableNumber}
                    className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold py-3 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition text-base sm:text-lg touch-manipulation"
                  >
                    {loading ? 'Sende...' : 'Bestellung senden'}
                  </button>

                  {cart.length > 0 && (
                    <button
                      onClick={() => setCart([])}
                      className="w-full mt-2 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700 font-semibold py-2 rounded-lg transition touch-manipulation"
                    >
                      Warenkorb leeren
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InventoryView({ items, onUpdate, token }: { items: Item[]; onUpdate: () => void; token: string | null }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    price: '',
    category: '',
    printer_station: 'bar',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Fehler: ${error.error || 'Artikel konnte nicht erstellt werden'}`);
        return;
      }

      setFormData({ name: '', price: '', category: '', printer_station: 'bar' });
      setShowForm(false);
      onUpdate();
      alert('Artikel erfolgreich erstellt!');
    } catch (error) {
      alert('Fehler beim Erstellen des Artikels');
    }
  };

  const deleteItem = async (id: number) => {
    if (!confirm('Artikel wirklich löschen?')) return;

    try {
      const res = await fetch(`${API_URL}/items/${id}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });

      if (res.ok) {
        onUpdate();
      } else {
        alert('Fehler beim Löschen');
      }
    } catch (error) {
      alert('Fehler beim Löschen');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold">Artikelverwaltung</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg w-full sm:w-auto"
          >
            {showForm ? 'Abbrechen' : '+ Neuer Artikel'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <input
                type="text"
                placeholder="Artikelname"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
                required
              />
              <input
                type="number"
                step="0.05"
                placeholder="Preis (CHF)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
                required
              />
              <input
                type="text"
                placeholder="Kategorie (z.B. Getränke, Essen)"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
                required
              />
              <select
                value={formData.printer_station}
                onChange={(e) => setFormData({ ...formData, printer_station: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
              >
                <option value="bar">Bar (Getränke)</option>
                <option value="kitchen">Küche (Essen)</option>
              </select>
            </div>
            <button
              type="submit"
              className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg w-full sm:w-auto"
            >
              Artikel erstellen
            </button>
          </form>
        )}

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[500px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 sm:px-4 py-2 text-left text-sm">Name</th>
                <th className="px-3 sm:px-4 py-2 text-left text-sm">Kategorie</th>
                <th className="px-3 sm:px-4 py-2 text-left text-sm">Preis</th>
                <th className="px-3 sm:px-4 py-2 text-left text-sm">Drucker</th>
                <th className="px-3 sm:px-4 py-2 text-left text-sm">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t">
                  <td className="px-3 sm:px-4 py-2 text-sm">{item.name}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm">{item.category}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm">CHF {item.price.toFixed(2)}</td>
                  <td className="px-3 sm:px-4 py-2 text-sm">{item.printer_station}</td>
                  <td className="px-3 sm:px-4 py-2">
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {items.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Keine Artikel vorhanden. Klicken Sie auf "Neuer Artikel" um einen hinzuzufügen.
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
