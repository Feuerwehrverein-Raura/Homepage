import { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://order.fwv-raura.ch/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://order.fwv-raura.ch/ws';

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

// Audio for notification sound - use HTML Audio for better Android compatibility
let notificationAudio: HTMLAudioElement | null = null;

// Base64 encoded beep sound (two-tone notification)
const BEEP_SOUND_BASE64 = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2PlpqWkIl+dGlkXl1XV1dZXWRteoiYqLK2sa2jlYV1ZVVJQTs4Ojs/RExVXWp3hZKdpamonZKGe3BnYV1aWVlaXWFla3F2fIGGi46QkY+LhX13b2hhWlRQTUtLTE5TWl9mbXR6gIWJjY+Pjo2LiYeEgX57eHVycG5samhnaGlrbW9xc3V3eXp7fH1+f4CAgICAgH9/fn59fXx7enl4d3Z1dHNycXBvbm1sa2ppaGdmZWVkZGRkZGVlZmdnaGlqa2xtbm9wcXJzdHV2d3h5ent8fX5/gIGCg4SFhoeIiYqLjI2Oj5CRkpOUlZaXmJmam5ydnp+goaKjpKWmp6ipqqusra6vsLGys7S1tre4ubq7vL2+v8DBwsPExcbHyMnKy8zNzs/Q0dLT1NXW19jZ2tvc3d7f4OHi4+Tl5ufo6err7O3u7/Dx8vP09fb3+Pn6+/z9/v8AAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyAhIiMkJSYnKCkqKywtLi8wMTIzNDU2Nzg5Ojs8PT4/QEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==';

function initAudio() {
  if (!notificationAudio) {
    notificationAudio = new Audio(BEEP_SOUND_BASE64);
    notificationAudio.volume = 0.5;
    // Preload
    notificationAudio.load();
  }
}

function playBeep() {
  console.log('playBeep called');

  // Try HTML Audio first (better Android compatibility)
  try {
    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      const playPromise = notificationAudio.play();
      if (playPromise) {
        playPromise.catch(e => console.error('Audio play error:', e));
      }
      console.log('Playing via HTML Audio');
      return;
    }
  } catch (e) {
    console.error('HTML Audio error:', e);
  }

  // Fallback to Web Audio API
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 880;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    console.log('Playing via Web Audio API');
  } catch (e) {
    console.error('Web Audio API error:', e);
  }
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<string>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Enable sound - must be triggered by user interaction
  const enableSound = useCallback(async () => {
    console.log('Enabling sound...');
    try {
      // Initialize HTML Audio element (requires user interaction)
      initAudio();

      // Test beep to confirm audio works
      playBeep();
      setSoundEnabled(true);
      localStorage.setItem('kitchenSoundEnabled', 'true');
      console.log('Sound enabled successfully');
    } catch (error) {
      console.error('Sound enable error:', error);
      alert('Fehler beim Aktivieren des Tons: ' + (error as Error).message);
    }
  }, []);

  // Request notification permission
  const requestNotificationPermission = useCallback(async () => {
    console.log('Button clicked - requesting permissions');

    // First enable sound
    await enableSound();

    try {
      if ('Notification' in window) {
        console.log('Requesting notification permission...');
        const permission = await Notification.requestPermission();
        console.log('Permission result:', permission);
        setNotificationsEnabled(permission === 'granted');
        if (permission === 'denied') {
          alert('Browser-Benachrichtigungen blockiert - Ton funktioniert trotzdem!');
        }
      } else {
        console.log('Notification API not available, using audio only');
      }
    } catch (error) {
      console.error('Notification permission error:', error);
    }
  }, [enableSound]);

  useEffect(() => {
    fetchOrders();
    connectWebSocket();

    // Check existing notification permission
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }

    // Check if sound was previously enabled (but still need user interaction to resume)
    const savedSoundEnabled = localStorage.getItem('kitchenSoundEnabled');
    if (savedSoundEnabled === 'true') {
      // We'll show a smaller "resume" button instead of the full enable button
      // But we can't auto-resume audio - need user interaction
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

  const playNotification = useCallback((order: Order) => {
    // Visual flash - always happens
    document.body.style.backgroundColor = '#fef3c7';
    setTimeout(() => {
      document.body.style.backgroundColor = '';
    }, 500);

    // Play sound only if sound is enabled
    if (soundEnabled) {
      playBeep();
    }

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
  }, [soundEnabled, notificationsEnabled]);

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
            {!soundEnabled ? (
              <button
                onClick={requestNotificationPermission}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-bold text-lg flex items-center gap-2 animate-pulse"
              >
                <span className="text-2xl">🔊</span>
                <span>TON AKTIVIEREN</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <span>🔊</span> Ton aktiv
                </span>
                {notificationsEnabled && (
                  <span className="text-green-400 text-sm flex items-center gap-1">
                    <span>🔔</span> Push aktiv
                  </span>
                )}
              </div>
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
