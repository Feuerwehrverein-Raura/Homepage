import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://order.fwv-raura.ch/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://order.fwv-raura.ch';

interface OrderItem {
  id: number;
  item_name: string;
  quantity: number;
  notes: string;
  printer_station: string;
}

interface Order {
  id: number;
  table_number: number;
  created_at: string;
  items: OrderItem[];
}

// Audio context for notification sound
let audioContext: AudioContext | null = null;

function playBeep() {
  try {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880; // A5 note
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    // Play a second beep
    setTimeout(() => {
      const osc2 = audioContext!.createOscillator();
      const gain2 = audioContext!.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext!.destination);
      osc2.frequency.value = 1100;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext!.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext!.currentTime + 0.5);
      osc2.start(audioContext!.currentTime);
      osc2.stop(audioContext!.currentTime + 0.5);
    }, 200);
  } catch (e) {
    console.error('Audio error:', e);
  }
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<string>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    console.log('Button clicked - requesting permissions');
    try {
      // Initialize audio context on user interaction (required by browsers)
      if (!audioContext) {
        audioContext = new AudioContext();
        console.log('AudioContext created');
      }
      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('AudioContext resumed');
      }

      if ('Notification' in window) {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('Permission result:', permission);
        setNotificationsEnabled(permission === 'granted');
        if (permission === 'granted') {
          // Test beep to confirm audio works
          playBeep();
        } else if (permission === 'denied') {
          alert('Benachrichtigungen wurden blockiert. Bitte in den Browser-Einstellungen erlauben.');
        } else {
          // Permission was dismissed or is 'default'
          alert('Bitte erlaube Benachrichtigungen im Browser-Dialog.');
        }
      } else {
        console.log('Notification API not available, using audio only');
        // No notification API, but audio should work
        setNotificationsEnabled(true);
        playBeep();
        alert('Browser unterstützt keine Benachrichtigungen - Audio aktiviert.');
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      alert('Fehler beim Aktivieren: ' + (error as Error).message);
      // Still enable audio notifications
      setNotificationsEnabled(true);
      playBeep();
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    connectWebSocket();

    // Check existing notification permission
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await fetch(`${API_URL}/orders`);
      const data = await res.json();
      setOrders(data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const connectWebSocket = () => {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'new_order') {
        setOrders(prev => [data.order, ...prev]);
        // Play sound and show notification
        playNotification(data.order);
      } else if (data.type === 'order_completed') {
        setOrders(prev => prev.filter(o => o.id !== data.order_id));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...');
      setTimeout(connectWebSocket, 3000);
    };

    wsRef.current = ws;
  };

  const playNotification = (order: Order) => {
    // Visual flash
    document.body.style.backgroundColor = '#fef3c7';
    setTimeout(() => {
      document.body.style.backgroundColor = '';
    }, 500);

    // Play sound
    playBeep();

    // Browser notification
    if (notificationsEnabled && 'Notification' in window) {
      const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const title = order.table_number === 0
        ? `Neue Bestellung #${order.id}`
        : `Neue Bestellung - Tisch ${order.table_number}`;
      new Notification(title, {
        body: `${itemCount} Artikel`,
        icon: '/logo-192.png',
        tag: `order-${order.id}`,
        requireInteraction: true
      });
    }
  };

  const completeOrder = async (orderId: number) => {
    try {
      await fetch(`${API_URL}/orders/${orderId}/complete`, {
        method: 'PATCH',
      });
      setOrders(orders.filter(o => o.id !== orderId));
    } catch (error) {
      console.error('Failed to complete order:', error);
    }
  };

  const filterOrders = (order: Order) => {
    if (station === 'all') return true;
    return order.items.some(item => item.printer_station === station);
  };

  const filteredOrders = orders.filter(filterOrders);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-3xl font-bold">Kitchen Display</h1>
          
          <div className="flex gap-2">
            <button
              onClick={() => setStation('all')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'all' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setStation('bar')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'bar' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setStation('kitchen')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'kitchen' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Küche
            </button>
          </div>

          <div className="flex items-center gap-4">
            {!notificationsEnabled && (
              <button
                onClick={requestNotificationPermission}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded font-semibold text-sm flex items-center gap-2"
              >
                <span>🔔</span>
                <span>Benachrichtigungen aktivieren</span>
              </button>
            )}
            {notificationsEnabled && (
              <span className="text-green-400 text-sm flex items-center gap-1">
                <span>🔔</span> Aktiv
              </span>
            )}
            <div className="text-xl font-bold">
              {filteredOrders.length} offene Bestellung{filteredOrders.length !== 1 ? 'en' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="max-w-7xl mx-auto p-6">
        {filteredOrders.length === 0 ? (
          <div className="text-center text-gray-400 text-2xl mt-20">
            Keine offenen Bestellungen
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredOrders.map(order => (
              <OrderCard 
                key={order.id} 
                order={order} 
                station={station}
                onComplete={() => completeOrder(order.id)} 
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ 
  order, 
  station,
  onComplete 
}: { 
  order: Order; 
  station: string;
  onComplete: () => void;
}) {
  const timeAgo = (dateString: string) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Jetzt';
    if (diffMins === 1) return '1 Min';
    return `${diffMins} Min`;
  };

  const filteredItems = station === 'all' 
    ? order.items 
    : order.items.filter(item => item.printer_station === station);

  if (filteredItems.length === 0) return null;

  const time = timeAgo(order.created_at);
  const isUrgent = new Date().getTime() - new Date(order.created_at).getTime() > 10 * 60 * 1000;

  return (
    <div className={`bg-gray-800 rounded-lg p-6 shadow-xl border-4 ${
      isUrgent ? 'border-red-500' : 'border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className={`text-3xl font-bold ${order.table_number === 0 ? 'text-yellow-400' : 'text-blue-400'}`}>
            {order.table_number === 0 ? `Bestellung #${order.id}` : `Tisch ${order.table_number}`}
          </div>
          <div className={`text-sm font-semibold ${
            isUrgent ? 'text-red-400' : 'text-gray-400'
          }`}>
            vor {time}
          </div>
        </div>
        {order.table_number !== 0 && (
          <div className="text-sm text-gray-500">
            #{order.id}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-3 mb-6">
        {filteredItems.map(item => (
          <div key={item.id} className="bg-gray-700 rounded p-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <span className="text-2xl font-bold text-yellow-400 mr-2">
                  {item.quantity}×
                </span>
                <span className="text-xl font-semibold">
                  {item.item_name || '(Unbekannter Artikel)'}
                </span>
              </div>
              <div className="text-xs bg-gray-600 px-2 py-1 rounded">
                {item.printer_station}
              </div>
            </div>
            {item.notes && (
              <div className={`mt-2 p-3 rounded-lg border-2 ${
                item.notes.toLowerCase().includes('allergi') ||
                item.notes.toLowerCase().includes('laktose') ||
                item.notes.toLowerCase().includes('gluten') ||
                item.notes.toLowerCase().includes('nuss') ||
                item.notes.toLowerCase().includes('vegan')
                  ? 'bg-red-900 border-red-500 text-red-100'
                  : 'bg-yellow-900 border-yellow-500 text-yellow-100'
              }`}>
                <span className="text-lg font-bold">
                  {item.notes.toLowerCase().includes('allergi') ||
                   item.notes.toLowerCase().includes('laktose') ||
                   item.notes.toLowerCase().includes('gluten') ||
                   item.notes.toLowerCase().includes('nuss') ||
                   item.notes.toLowerCase().includes('vegan')
                    ? '⚠️ '
                    : '📝 '}
                  {item.notes}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Complete Button */}
      <button
        onClick={onComplete}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition text-lg"
      >
        ✓ Erledigt
      </button>
    </div>
  );
}

export default App;
