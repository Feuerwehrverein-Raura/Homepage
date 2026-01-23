import { useState, useEffect } from 'react';

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
}

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tableNumber, setTableNumber] = useState<string>('');
  const [view, setView] = useState<'order' | 'inventory'>('order');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await fetch('/api/items');
      const data = await res.json();
      setItems(data);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const addToCart = (item: Item) => {
    const existing = cart.find(c => c.id === item.id);
    if (existing) {
      setCart(cart.map(c => 
        c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
      ));
    } else {
      setCart([...cart, { ...item, quantity: 1, notes: '' }]);
    }
  };

  const updateQuantity = (id: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(cart.filter(c => c.id !== id));
    } else {
      setCart(cart.map(c => c.id === id ? { ...c, quantity } : c));
    }
  };

  const updateNotes = (id: number, notes: string) => {
    setCart(cart.map(c => c.id === id ? { ...c, notes } : c));
  };

  const pollPaymentStatus = async (paymentId: number) => {
    let attempts = 0;
    const maxAttempts = 60; // 2 Minuten (60 * 2 Sekunden)
    
    const interval = setInterval(async () => {
      attempts++;
      
      try {
        const res = await fetch(`/api/payments/${paymentId}`);
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
    }, 2000); // Check alle 2 Sekunden
  };

  const submitOrder = async () => {
    if (!tableNumber || cart.length === 0) {
      alert('Bitte Tischnummer eingeben und Artikel auswählen!');
      return;
    }

    setLoading(true);
    try {
      // Create order
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_number: parseInt(tableNumber),
          items: cart.map(c => ({
            id: c.id,
            quantity: c.quantity,
            price: c.price,
            notes: c.notes,
            item_name: c.name,
            printer_station: c.printer_station,
          })),
        }),
      });
      
      const order = await orderRes.json();
      
      // Show payment options
      const paymentMethod = confirm(
        `Bestellung erfolgreich erstellt!\n\n` +
        `Gesamtsumme: CHF ${total.toFixed(2)}\n\n` +
        `Zahlungsmethode wählen:\n` +
        `OK = Online bezahlen (SumUp/TWINT)\n` +
        `Abbrechen = Bar bezahlen`
      );
      
      if (paymentMethod) {
        // Show provider selection
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
          
          // Create payment
          const paymentRes = await fetch('/api/payments/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            // Poll for payment status
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

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  const categories = [...new Set(items.map(i => i.category))];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-fwv-red text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">🔥 Order System - FWV Raura</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView('order')}
              className={`px-4 py-2 rounded ${
                view === 'order' ? 'bg-white text-fwv-red' : 'bg-red-700'
              }`}
            >
              Bestellung
            </button>
            <button
              onClick={() => setView('inventory')}
              className={`px-4 py-2 rounded ${
                view === 'inventory' ? 'bg-white text-fwv-red' : 'bg-red-700'
              }`}
            >
              Inventar
            </button>
          </div>
        </div>
      </div>

      {view === 'order' ? (
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Menu */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow p-4">
                <h2 className="text-xl font-bold mb-4">Menü</h2>
                
                {categories.map(category => (
                  <div key={category} className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-2">
                      {category}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {items
                        .filter(i => i.category === category)
                        .map(item => (
                          <button
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="bg-red-50 hover:bg-red-100 border-2 border-fwv-red p-4 rounded-lg text-left transition"
                          >
                            <div className="font-semibold">{item.name}</div>
                            <div className="text-fwv-red font-bold">
                              CHF {item.price.toFixed(2)}
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Cart */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow p-4 sticky top-4">
                <h2 className="text-xl font-bold mb-4">Bestellung</h2>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tischnummer
                  </label>
                  <input
                    type="number"
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Tisch..."
                  />
                </div>

                <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
                  {cart.map(item => (
                    <div key={item.id} className="border-b pb-2">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold">{item.name}</div>
                          <div className="text-sm text-gray-600">
                            CHF {item.price.toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-bold">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={(e) => updateNotes(item.id, e.target.value)}
                        placeholder="Notiz..."
                        className="w-full mt-1 px-2 py-1 text-sm border border-gray-300 rounded"
                      />
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-xl font-bold mb-4">
                    <span>Total:</span>
                    <span>CHF {total.toFixed(2)}</span>
                  </div>
                  
                  <button
                    onClick={submitOrder}
                    disabled={loading || cart.length === 0 || !tableNumber}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition"
                  >
                    {loading ? 'Sende...' : 'Bestellung senden'}
                  </button>
                  
                  {cart.length > 0 && (
                    <button
                      onClick={() => setCart([])}
                      className="w-full mt-2 bg-red-100 hover:bg-red-200 text-red-700 font-semibold py-2 rounded-lg transition"
                    >
                      Warenkorb leeren
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <InventoryView items={items} onUpdate={fetchItems} />
      )}
    </div>
  );
}

function InventoryView({ items, onUpdate }: { items: Item[]; onUpdate: () => void }) {
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
      await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          price: parseFloat(formData.price),
        }),
      });
      setFormData({ name: '', price: '', category: '', printer_station: 'bar' });
      setShowForm(false);
      onUpdate();
    } catch (error) {
      alert('Fehler beim Erstellen des Artikels');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Inventar</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
          >
            {showForm ? 'Abbrechen' : 'Neuer Artikel'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
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
                step="0.01"
                placeholder="Preis (CHF)"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded"
                required
              />
              <input
                type="text"
                placeholder="Kategorie"
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
                <option value="bar">Bar</option>
                <option value="kitchen">Küche</option>
              </select>
            </div>
            <button
              type="submit"
              className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg"
            >
              Artikel erstellen
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Kategorie</th>
                <th className="px-4 py-2 text-left">Preis</th>
                <th className="px-4 py-2 text-left">Drucker</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-2">{item.name}</td>
                  <td className="px-4 py-2">{item.category}</td>
                  <td className="px-4 py-2">CHF {item.price.toFixed(2)}</td>
                  <td className="px-4 py-2">{item.printer_station}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
