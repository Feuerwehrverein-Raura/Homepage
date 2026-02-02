import { useState, useEffect, useRef, useCallback } from 'react';

// Offline Banner Component
function OfflineBanner({ apiUrl }: { apiUrl: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [backendReachable, setBackendReachable] = useState(true);
  const checkIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check backend connectivity periodically
    const checkBackend = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${apiUrl}/health`, {
          method: 'GET',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        setBackendReachable(res.ok);
      } catch {
        setBackendReachable(false);
      }
    };

    checkBackend();
    checkIntervalRef.current = window.setInterval(checkBackend, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [apiUrl]);

  if (isOnline && backendReachable) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-3 text-center text-lg font-bold">
      {!isOnline
        ? '⚠️ KEINE INTERNETVERBINDUNG'
        : '⚠️ SERVER NICHT ERREICHBAR - BESTELLUNGEN WERDEN NICHT EMPFANGEN'}
    </div>
  );
}

const API_URL = import.meta.env.VITE_API_URL || 'https://order.fwv-raura.ch/api';
const WS_URL = import.meta.env.VITE_WS_URL || 'wss://order.fwv-raura.ch/ws';

interface OrderItem {
  id: number;
  item_name: string;
  quantity: number;
  notes: string;
  printer_station: string;
  completed?: boolean;
  completed_at?: string;
}

interface Order {
  id: number;
  table_number: number;
  created_at: string;
  items: OrderItem[];
}

// Web Audio API context for reliable sound generation
let audioContext: AudioContext | null = null;

function initAudio() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      console.log('AudioContext created, state:', audioContext.state);
    } catch (e) {
      console.error('Failed to create AudioContext:', e);
    }
  }
  // Resume if suspended (required after user interaction on mobile)
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      console.log('AudioContext resumed, state:', audioContext?.state);
    }).catch(e => {
      console.error('Failed to resume AudioContext:', e);
    });
  }
}

function playBeep() {
  console.log('playBeep called, audioContext state:', audioContext?.state);

  if (!audioContext) {
    console.log('No audioContext, initializing...');
    initAudio();
  }

  if (!audioContext) {
    console.error('AudioContext not available');
    return;
  }

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      console.log('AudioContext resumed before playing');
      actuallyPlaySound();
    });
  } else {
    actuallyPlaySound();
  }
}

function actuallyPlaySound() {
  if (!audioContext) return;

  try {
    const now = audioContext.currentTime;

    // Create a pleasant three-tone notification sound
    // First tone - 880 Hz (A5)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.frequency.value = 880;
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Second tone - 1100 Hz
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.frequency.value = 1100;
    osc2.type = 'sine';
    gain2.gain.setValueAtTime(0.3, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.24);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.24);

    // Third tone - 1320 Hz (E6)
    const osc3 = audioContext.createOscillator();
    const gain3 = audioContext.createGain();
    osc3.connect(gain3);
    gain3.connect(audioContext.destination);
    osc3.frequency.value = 1320;
    osc3.type = 'sine';
    gain3.gain.setValueAtTime(0.3, now + 0.24);
    gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc3.start(now + 0.24);
    osc3.stop(now + 0.4);

    console.log('Sound played via Web Audio API oscillators');
  } catch (e) {
    console.error('Error playing sound:', e);
  }
}

function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [station, setStation] = useState<string>('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [cleaningMode, setCleaningMode] = useState(false);
  const [cleaningTimer, setCleaningTimer] = useState(30);
  const wsRef = useRef<WebSocket | null>(null);
  const playNotificationRef = useRef<(order: Order) => void>(() => {});

  // Start cleaning mode - 30 seconds of no touch response
  const startCleaning = useCallback(() => {
    setCleaningMode(true);
    setCleaningTimer(30);
  }, []);

  // Cleaning mode countdown timer
  useEffect(() => {
    if (!cleaningMode) return;

    if (cleaningTimer <= 0) {
      setCleaningMode(false);
      setCleaningTimer(30);
      return;
    }

    const interval = setInterval(() => {
      setCleaningTimer(prev => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [cleaningMode, cleaningTimer]);

  // Enable sound - must be triggered by user interaction
  const enableSound = useCallback(async () => {
    console.log('Enabling sound...');
    try {
      // Initialize Web Audio API (requires user interaction on mobile)
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
        // Play sound and show notification - use ref to get latest callback
        playNotificationRef.current(data.order);
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
    console.log('playNotification called, soundEnabled:', soundEnabled);

    // Visual flash - always happens
    document.body.style.backgroundColor = '#fef3c7';
    setTimeout(() => {
      document.body.style.backgroundColor = '';
    }, 500);

    // Play sound only if sound is enabled
    if (soundEnabled) {
      console.log('Sound is enabled, calling playBeep');
      playBeep();
    } else {
      console.log('Sound is NOT enabled, skipping playBeep');
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

  // Keep ref updated with latest callback
  useEffect(() => {
    playNotificationRef.current = playNotification;
  }, [playNotification]);

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

  // Mark individual items as completed
  const completeItems = async (orderId: number, itemIds: number[]) => {
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/items/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_ids: itemIds }),
      });
      if (res.ok) {
        // Update local state
        setOrders(prev => prev.map(order => {
          if (order.id !== orderId) return order;
          return {
            ...order,
            items: order.items.map(item =>
              itemIds.includes(item.id) ? { ...item, completed: true } : item
            )
          };
        }));
      }
    } catch (error) {
      console.error('Failed to complete items:', error);
    }
  };

  const filterOrders = (order: Order) => {
    if (station === 'all') return true;
    return order.items.some(item => item.printer_station === station);
  };

  const filteredOrders = orders.filter(filterOrders);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Offline Warning Banner */}
      <OfflineBanner apiUrl={API_URL} />

      {/* Header - Red like website */}
      <div className="bg-fwv-red p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src="/logo-192.png" alt="Logo" className="w-12 h-12 rounded-full bg-white p-1" />
            <h1 className="text-3xl font-bold text-white">Küche</h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStation('all')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'all'
                  ? 'bg-white text-fwv-red'
                  : 'bg-fwv-red-hover text-white hover:bg-red-800'
              }`}
            >
              Alle
            </button>
            <button
              onClick={() => setStation('bar')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'bar'
                  ? 'bg-white text-fwv-red'
                  : 'bg-fwv-red-hover text-white hover:bg-red-800'
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setStation('kitchen')}
              className={`px-4 py-2 rounded font-semibold ${
                station === 'kitchen'
                  ? 'bg-white text-fwv-red'
                  : 'bg-fwv-red-hover text-white hover:bg-red-800'
              }`}
            >
              Küche
            </button>
          </div>

          <div className="flex items-center gap-4">
            {/* Putzen Button */}
            <button
              onClick={startCleaning}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold flex items-center gap-2"
            >
              <span>🧽</span>
              <span>Putzen</span>
            </button>

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
                onItemComplete={(itemIds) => completeItems(order.id, itemIds)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cleaning Mode Overlay - blocks all touch inputs */}
      {cleaningMode && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 flex flex-col items-center justify-center z-50"
          style={{ touchAction: 'none' }}
          onTouchStart={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-white text-center">
            <div className="text-6xl mb-8">🧽</div>
            <h2 className="text-4xl font-bold mb-4">Bildschirm putzen</h2>
            <p className="text-2xl text-gray-300 mb-8">Touch-Eingaben deaktiviert</p>
            <div className="text-9xl font-bold text-blue-400 tabular-nums">
              {cleaningTimer}
            </div>
            <p className="text-xl text-gray-400 mt-4">Sekunden verbleibend</p>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  station,
  onComplete,
  onItemComplete
}: {
  order: Order;
  station: string;
  onComplete: () => void;
  onItemComplete: (itemIds: number[]) => void;
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

  const completedCount = filteredItems.filter(i => i.completed).length;
  const allCompleted = completedCount === filteredItems.length;
  const uncompletedItems = filteredItems.filter(i => !i.completed);

  return (
    <div className={`bg-gray-800 rounded-lg p-6 shadow-xl border-4 ${
      allCompleted ? 'border-green-500' : isUrgent ? 'border-red-500' : 'border-gray-700'
    }`}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className={`text-3xl font-bold ${order.table_number === 0 ? 'text-yellow-400' : 'text-fwv-red'}`}>
            {order.table_number === 0 ? `Bestellung #${order.id}` : `Tisch ${order.table_number}`}
          </div>
          <div className={`text-sm font-semibold ${
            isUrgent ? 'text-red-400' : 'text-gray-400'
          }`}>
            vor {time}
            {completedCount > 0 && (
              <span className="ml-2 text-green-400">
                ({completedCount}/{filteredItems.length} erledigt)
              </span>
            )}
          </div>
        </div>
        {order.table_number !== 0 && (
          <div className="text-sm text-gray-500">
            #{order.id}
          </div>
        )}
      </div>

      {/* Items - clickable to mark individual items as complete */}
      <div className="space-y-3 mb-6">
        {filteredItems.map(item => (
          <div
            key={item.id}
            onClick={() => !item.completed && onItemComplete([item.id])}
            className={`rounded p-3 transition cursor-pointer ${
              item.completed
                ? 'bg-green-900 border-2 border-green-600 opacity-60'
                : 'bg-gray-700 hover:bg-gray-600 active:bg-green-800'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <span className={`text-2xl font-bold mr-2 ${item.completed ? 'text-green-400' : 'text-yellow-400'}`}>
                  {item.completed ? '✓' : `${item.quantity}×`}
                </span>
                <span className={`text-xl font-semibold ${item.completed ? 'line-through text-gray-400' : ''}`}>
                  {item.completed ? '' : `${item.quantity}× `}{item.item_name || '(Unbekannter Artikel)'}
                </span>
              </div>
              <div className="text-xs bg-gray-600 px-2 py-1 rounded">
                {item.printer_station}
              </div>
            </div>
            {item.notes && !item.completed && (
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

      {/* Complete Button - marks all remaining as done, or closes order if all done */}
      <button
        onClick={() => {
          if (allCompleted) {
            onComplete();
          } else {
            onItemComplete(uncompletedItems.map(i => i.id));
          }
        }}
        className={`w-full font-bold py-3 rounded-lg transition text-lg ${
          allCompleted
            ? 'bg-blue-600 hover:bg-blue-700 text-white'
            : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      >
        {allCompleted ? '📤 Bestellung abschliessen' : `✓ Alle erledigt (${uncompletedItems.length})`}
      </button>
    </div>
  );
}

export default App;
