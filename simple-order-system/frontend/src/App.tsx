import { useState, useEffect, useCallback, useRef } from 'react';

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
    <div className="bg-red-600 text-white px-4 py-2 text-center text-sm font-medium">
      {!isOnline
        ? '⚠️ Keine Internetverbindung'
        : '⚠️ Server nicht erreichbar - Bestellungen werden nicht verarbeitet'}
    </div>
  );
}

// Environment variables
const API_URL = import.meta.env.VITE_API_URL || '/api';
const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
const AUTHENTIK_URL = 'https://auth.fwv-raura.ch';
const AUTH_CLIENT_ID = 'order-system';
const AUTH_CALLBACK_URI = 'https://fwv-raura.ch/auth-callback.html';

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

interface OrderItem {
  id: number;
  item_name: string;
  quantity: number;
  price: string;
  paid?: boolean;
  paid_at?: string;
  completed?: boolean;
  completed_at?: string;
}

interface OpenOrder {
  id: number;
  table_number: number;
  total: string;
  created_at: string;
  status: 'pending' | 'paid' | 'completed';
  items: OrderItem[];
  paid_amount?: string;
}

type OrderType = 'bar' | 'tisch';

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>('bar');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OpenOrder | null>(null);
  const [view, setView] = useState<'order' | 'tables' | 'inventory' | 'history' | 'settings'>('order');
  const [allOpenOrders, setAllOpenOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem('order_token'));
  const [user, setUser] = useState<User | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '', category: 'Sonstiges', printer_station: 'bar' });
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [statsData, setStatsData] = useState<any>(null);
  const [pendingOrder, setPendingOrder] = useState<{ id: number; total: number; tableNumber?: number } | null>(null);
  const [cashPayment, setCashPayment] = useState<{ orderId: number; total: number; received: string } | null>(null);
  const [cardPayment, setCardPayment] = useState<{ orderId: number; total: number } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [orderConfirmation, setOrderConfirmation] = useState<{
    orderId: number;
    orderType: 'bar' | 'tisch';
    tableNumber?: number;
    total: number;
    message?: string;
  } | null>(null);

  // Split payment states
  const [splitPaymentOrder, setSplitPaymentOrder] = useState<OpenOrder | null>(null);
  const [splitPaymentMode, setSplitPaymentMode] = useState<'full' | 'split' | 'items'>('full');
  const [splitAmount, setSplitAmount] = useState<string>('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<'cash' | 'card' | 'twint'>('cash');

  // TWINT payment states
  const [twintQrUrl, setTwintQrUrl] = useState<string | null>(null);
  const [twintPayment, setTwintPayment] = useState<{ orderId: number; total: number } | null>(null);

  // WebSocket state
  const wsRef = useRef<WebSocket | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // PWA Install prompt
  useEffect(() => {
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

  // Check session token on mount (Authentik OIDC via auth-callback.html)
  useEffect(() => {
    // Check for token in URL (cross-domain redirect from auth-callback.html)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('token')) {
      const urlToken = urlParams.get('token')!;
      localStorage.setItem('order_token', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const storedToken = urlParams.has('token') ? urlParams.get('token')! : localStorage.getItem('order_token');
    if (storedToken) {
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          localStorage.removeItem('order_token');
          setToken(null);
        } else {
          setUser({
            name: payload.name || payload.vorname || payload.preferred_username || 'User',
            email: payload.email || '',
            groups: payload.groups || ['admin'],
          });
        }
      } catch {
        localStorage.removeItem('order_token');
        setToken(null);
      }
    }
    setSessionChecked(true);
  }, []);

  // Fetch items and TWINT QR after login
  useEffect(() => {
    if (token) {
      fetchItems();
      fetchTwintQr();
    }
  }, [token]);

  const authHeaders = (): HeadersInit => token ? { 'Authorization': `Bearer ${token}` } : {};

  const fetchTwintQr = async () => {
    try {
      const res = await fetch(`${API_URL}/twint-qr`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setTwintQrUrl(data.url || '/twint-qr.png');
      } else {
        // Fallback to local QR code in public folder
        setTwintQrUrl('/twint-qr.png');
      }
    } catch (error) {
      console.error('Failed to fetch TWINT QR:', error);
      // Fallback to local QR code
      setTwintQrUrl('/twint-qr.png');
    }
  };

  const redirectToLogin = () => {
    localStorage.removeItem('order_token');
    const state = encodeURIComponent(window.location.origin + '/');
    window.location.href = `${AUTHENTIK_URL}/application/o/authorize/?client_id=${AUTH_CLIENT_ID}&redirect_uri=${encodeURIComponent(AUTH_CALLBACK_URI)}&response_type=code&scope=openid%20profile%20email&state=${state}`;
  };

  const logout = () => {
    localStorage.removeItem('order_token');
    setToken(null);
    setUser(null);
    // Invalidate Authentik session via OIDC end-session (no redirect URI to avoid re-login loop)
    window.location.href = `${AUTHENTIK_URL}/application/o/order-system/end-session/`;
  };

  const fetchItems = async () => {
    try {
      const res = await fetch(`${API_URL}/items`, { headers: authHeaders() });
      const data = await res.json();
      // Parse price as float since API returns it as string
      setItems(data.map((item: any) => ({
        ...item,
        price: parseFloat(item.price) || 0
      })));
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const fetchHistory = async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/orders/history?limit=50`, { headers: authHeaders() }),
        fetch(`${API_URL}/stats/daily`, { headers: authHeaders() })
      ]);
      const history = await historyRes.json();
      const stats = await statsRes.json();
      setHistoryData(history);
      setStatsData(stats);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const fetchOpenOrders = async (tableNum: string) => {
    if (!tableNum) {
      setOpenOrders([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/orders/open/${tableNum}`, { headers: authHeaders() });
      const data = await res.json();
      setOpenOrders(data);
    } catch (error) {
      console.error('Failed to fetch open orders:', error);
      setOpenOrders([]);
    }
  };

  // Fetch open orders when table number changes
  useEffect(() => {
    if (orderType === 'tisch' && tableNumber) {
      fetchOpenOrders(tableNumber);
    } else {
      setOpenOrders([]);
      setSelectedOrder(null);
    }
  }, [tableNumber, orderType]);

  // Fetch all open orders for tables view
  const fetchAllOpenOrders = async () => {
    try {
      const res = await fetch(`${API_URL}/orders`, { headers: authHeaders() });
      const data = await res.json();
      // Filter only table orders (table_number > 0)
      const tableOrders = data.filter((o: any) => o.table_number > 0);
      setAllOpenOrders(tableOrders);
    } catch (error) {
      console.error('Failed to fetch all orders:', error);
      setAllOpenOrders([]);
    }
  };

  // Cancel/Stornieren individual order item
  const cancelOrderItem = async (orderId: number, itemId: number) => {
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/items/${itemId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        // Refresh the table orders
        fetchAllOpenOrders();
      } else {
        const error = await res.json();
        alert(error.error || 'Fehler beim Stornieren');
      }
    } catch (error) {
      console.error('Failed to cancel item:', error);
      alert('Fehler beim Stornieren des Artikels');
    }
  };

  useEffect(() => {
    if (view === 'tables') {
      fetchAllOpenOrders();
    }
  }, [view]);

  useEffect(() => {
    if (view === 'history' && user) {
      fetchHistory();
    }
  }, [view, user]);

  // WebSocket connection for real-time order updates
  useEffect(() => {
    if (!token) return;

    const connectWebSocket = () => {
      const ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'new_order' || data.type === 'order_updated') {
          // Refresh all open orders for Tische view
          fetchAllOpenOrders();
          // Refresh table-specific orders if applicable
          if (orderType === 'tisch' && tableNumber) {
            fetchOpenOrders(tableNumber);
          }
        } else if (data.type === 'order_completed') {
          // Remove completed order from lists
          setAllOpenOrders(prev => prev.filter(o => o.id !== parseInt(data.order_id)));
          setOpenOrders(prev => prev.filter(o => o.id !== parseInt(data.order_id)));
          if (selectedOrder?.id === parseInt(data.order_id)) {
            setSelectedOrder(null);
          }
        } else if (data.type === 'items_completed') {
          // Update items as completed in allOpenOrders
          setAllOpenOrders(prev => prev.map(order => {
            if (order.id !== parseInt(data.order_id)) return order;
            return {
              ...order,
              items: order.items.map(item =>
                data.item_ids?.includes(item.id) ? { ...item, completed: true } : item
              )
            };
          }));
          setOpenOrders(prev => prev.map(order => {
            if (order.id !== parseInt(data.order_id)) return order;
            return {
              ...order,
              items: order.items.map(item =>
                data.item_ids?.includes(item.id) ? { ...item, completed: true } : item
              )
            };
          }));
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [token]);

  // Auto-refresh Tische view every 15 seconds as fallback
  useEffect(() => {
    if (view !== 'tables' || !token) return;
    const interval = setInterval(fetchAllOpenOrders, 15000);
    return () => clearInterval(interval);
  }, [view, token]);

  const addToCart = (item: Item) => {
    setCart(prevCart => {
      const existing = prevCart.find(c => c.id === item.id && !c.customPrice);
      if (existing) {
        return prevCart.map(c =>
          c.id === item.id && !c.customPrice ? { ...c, quantity: c.quantity + 1 } : c
        );
      } else {
        return [...prevCart, { ...item, quantity: 1, notes: '' }];
      }
    });
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
      printer_station: customItem.printer_station,
      quantity: 1,
      notes: '',
      customPrice: price,
    };

    setCart([...cart, newItem]);
    setCustomItem({ name: '', price: '', category: 'Sonstiges', printer_station: 'bar' });
    setShowCustomItem(false);
  };

  const updateQuantity = (id: number, customPrice: number | undefined, quantity: number) => {
    if (quantity <= 0) {
      setCart(prevCart => prevCart.filter(c => !(c.id === id && c.customPrice === customPrice)));
    } else {
      setCart(prevCart => prevCart.map(c =>
        c.id === id && c.customPrice === customPrice ? { ...c, quantity } : c
      ));
    }
  };

  const updateNotes = (id: number, customPrice: number | undefined, notes: string) => {
    setCart(prevCart => prevCart.map(c =>
      c.id === id && c.customPrice === customPrice ? { ...c, notes } : c
    ));
  };

  const handlePayment = async (method: 'bar' | 'sumup') => {
    if (!pendingOrder) return;

    if (method === 'bar') {
      // Open cash payment modal
      setCashPayment({ orderId: pendingOrder.id, total: pendingOrder.total, received: '' });
      setPendingOrder(null);
      return;
    }

    // SumUp 3G+ Manual Card Payment
    setCardPayment({ orderId: pendingOrder.id, total: pendingOrder.total });
    setPendingOrder(null);
  };

  const confirmCardPayment = async () => {
    if (!cardPayment) return;

    try {
      // Mark order as paid via API
      await fetch(`${API_URL}/orders/${cardPayment.orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: 'paid', payment_method: 'card' }),
      });

      setOrderConfirmation({
        orderId: cardPayment.orderId,
        orderType: 'bar',
        total: cardPayment.total,
        message: 'Kartenzahlung bestätigt'
      });
    } catch (error) {
      console.error('Error marking order as paid:', error);
      setOrderConfirmation({
        orderId: cardPayment.orderId,
        orderType: 'bar',
        total: cardPayment.total,
        message: 'Kartenzahlung erfasst'
      });
    }

    setCardPayment(null);
    setCart([]);
    setTableNumber('');
  };

  const confirmCashPayment = async () => {
    if (!cashPayment) return;

    try {
      // Mark order as paid via API
      await fetch(`${API_URL}/orders/${cashPayment.orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: 'paid', payment_method: 'cash' }),
      });

      const received = parseFloat(cashPayment.received) || cashPayment.total;
      const change = received - cashPayment.total;
      setOrderConfirmation({
        orderId: cashPayment.orderId,
        orderType: 'bar',
        total: cashPayment.total,
        message: change > 0 ? `Barzahlung - Wechselgeld: CHF ${change.toFixed(2)}` : 'Barzahlung bestätigt'
      });
    } catch (error) {
      console.error('Error marking order as paid:', error);
      setOrderConfirmation({
        orderId: cashPayment.orderId,
        orderType: 'bar',
        total: cashPayment.total,
        message: 'Barzahlung erfasst'
      });
    }

    setCashPayment(null);
  };

  // Open split payment modal for an order
  const openSplitPayment = (order: OpenOrder) => {
    setSplitPaymentOrder(order);
    setSplitPaymentMode('full');
    setSplitAmount('');
    setSelectedItemIds([]);
    setSplitPaymentMethod('cash');
  };

  // Close split payment modal
  const closeSplitPayment = () => {
    setSplitPaymentOrder(null);
    setSplitPaymentMode('full');
    setSplitAmount('');
    setSelectedItemIds([]);
  };

  // Calculate unpaid total for an order
  const getUnpaidTotal = (order: OpenOrder): number => {
    if (!order.items) return parseFloat(order.total);
    const unpaidItems = order.items.filter(item => !item.paid);
    return unpaidItems.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
  };

  // Calculate total for selected items (unit-based selection with "itemId-unitIndex" keys)
  const getSelectedItemsTotal = (order: OpenOrder): number => {
    if (!order.items) return 0;
    let total = 0;
    selectedItemIds.forEach(key => {
      const [itemId] = key.split('-');
      const item = order.items?.find(i => i.id === parseInt(itemId));
      if (item) total += parseFloat(item.price);
    });
    return total;
  };

  // Process split payment
  const processSplitPayment = async () => {
    if (!splitPaymentOrder) return;

    try {
      let response;
      let amount: number;
      let message: string;

      if (splitPaymentMode === 'full') {
        // Pay full remaining amount
        amount = getUnpaidTotal(splitPaymentOrder);
        response = await fetch(`${API_URL}/orders/${splitPaymentOrder.id}/split-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            payment_method: splitPaymentMethod,
            description: 'Vollständige Bezahlung'
          }),
        });
        message = 'Vollständig bezahlt';
      } else if (splitPaymentMode === 'split') {
        // Pay custom amount
        amount = parseFloat(splitAmount) || 0;
        if (amount <= 0) {
          alert('Bitte einen gültigen Betrag eingeben');
          return;
        }
        response = await fetch(`${API_URL}/orders/${splitPaymentOrder.id}/split-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            payment_method: splitPaymentMethod,
            description: `Teilzahlung CHF ${amount.toFixed(2)}`
          }),
        });
        message = `Teilzahlung: CHF ${amount.toFixed(2)}`;
      } else {
        // Pay selected items (unit-based) - use split-payment with calculated amount
        if (selectedItemIds.length === 0) {
          alert('Bitte mindestens einen Artikel auswählen');
          return;
        }
        amount = getSelectedItemsTotal(splitPaymentOrder);

        // Create description with item counts
        const itemCounts: { [name: string]: number } = {};
        selectedItemIds.forEach(key => {
          const [itemId] = key.split('-');
          const item = splitPaymentOrder.items?.find(i => i.id === parseInt(itemId));
          if (item) {
            itemCounts[item.item_name] = (itemCounts[item.item_name] || 0) + 1;
          }
        });
        const itemDesc = Object.entries(itemCounts).map(([name, count]) => `${count}x ${name}`).join(', ');

        response = await fetch(`${API_URL}/orders/${splitPaymentOrder.id}/split-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            payment_method: splitPaymentMethod,
            description: itemDesc
          }),
        });
        message = `${selectedItemIds.length} Artikel bezahlt`;
      }

      if (!response.ok) {
        const error = await response.json();
        alert(`Fehler: ${error.error || 'Zahlung fehlgeschlagen'}`);
        return;
      }

      const result = await response.json();

      setOrderConfirmation({
        orderId: splitPaymentOrder.id,
        orderType: 'tisch',
        tableNumber: splitPaymentOrder.table_number,
        total: amount,
        message: result.all_paid ? `${message} - Bestellung abgeschlossen` : message
      });

      closeSplitPayment();

      // Refresh open orders
      if (tableNumber) {
        fetchOpenOrders(tableNumber);
      }
    } catch (error) {
      console.error('Split payment error:', error);
      alert('Fehler bei der Bezahlung');
    }
  };

  // Toggle item selection for per-item payment
  const toggleItemSelection = (itemId: number) => {
    setSelectedItemIds(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const getTableNumber = (): number => {
    switch (orderType) {
      case 'bar': return 0;
      case 'tisch': return parseInt(tableNumber) || 0;
      default: return 0;
    }
  };

  const submitOrder = async () => {
    if (cart.length === 0) {
      alert('Bitte Artikel auswählen!');
      return;
    }

    if (orderType === 'tisch' && !tableNumber) {
      alert('Bitte Tischnummer eingeben!');
      return;
    }

    const tableNum = getTableNumber();

    setLoading(true);
    try {
      // If adding to existing order
      if (selectedOrder) {
        const res = await fetch(`${API_URL}/orders/${selectedOrder.id}/items`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
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

        if (!res.ok) {
          const error = await res.json();
          alert(`Fehler: ${error.error || 'Konnte nicht hinzufügen'}`);
          setLoading(false);
          return;
        }

        const result = await res.json();
        setOrderConfirmation({
          orderId: selectedOrder.id,
          orderType: 'tisch',
          tableNumber: parseInt(tableNumber),
          total: parseFloat(result.total),
          message: 'Artikel hinzugefügt'
        });
        setCart([]);
        setSelectedOrder(null);
        fetchOpenOrders(tableNumber);
      } else {
        // Create new order
        const orderRes = await fetch(`${API_URL}/orders`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            table_number: tableNum,
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

        // Show payment modal (include table number for "pay later" option)
        const currentTableNum = orderType === 'tisch' ? parseInt(tableNumber) : undefined;
        setPendingOrder({ id: order.id, total, tableNumber: currentTableNum });
        setCart([]);
        if (orderType === 'tisch') {
          setTableNumber('');
        }
      }
    } catch (error) {
      alert('Fehler beim Senden der Bestellung');
    } finally {
      setLoading(false);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.customPrice || item.price) * item.quantity, 0);
  const categories = [...new Set(items.map(i => i.category))];

  const showInventoryView = view === 'inventory';
  const showHistoryView = view === 'history';

  // Redirect to Authentik if not authenticated
  if (sessionChecked && !token) {
    redirectToLogin();
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Weiterleitung zur Anmeldung...</div>
      </div>
    );
  }

  // Show loading while checking session
  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500 text-lg">Laden...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Offline Warning Banner */}
      <OfflineBanner apiUrl={API_URL} />

      {/* Order Confirmation Modal */}
      {orderConfirmation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center animate-in zoom-in-95 duration-200">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {orderConfirmation.orderType === 'bar'
                ? `Bestellung #${orderConfirmation.orderId}`
                : `Tisch ${orderConfirmation.tableNumber}`}
            </h2>
            <p className="text-3xl font-bold text-fwv-red mb-2">
              CHF {orderConfirmation.total.toFixed(2)}
            </p>
            {orderConfirmation.message && (
              <p className="text-gray-600 mb-4">{orderConfirmation.message}</p>
            )}
            <button
              onClick={() => setOrderConfirmation(null)}
              className="w-full bg-fwv-red hover:bg-red-700 text-white font-bold py-4 rounded-xl text-lg touch-manipulation"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-fwv-red text-white p-2 sm:p-4 shadow-lg">
        <div className="max-w-7xl mx-auto">
          {/* Top row: Logo and user info */}
          <div className="flex justify-between items-center mb-2 sm:mb-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <img
                src="/logo.png"
                alt="FWV Raura"
                className="h-8 w-8 sm:h-12 sm:w-12 rounded-full bg-white p-0.5 sm:p-1"
              />
              <h1 className="text-lg sm:text-2xl font-bold">Kasse</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Install Button */}
              {installPrompt && !isInstalled && (
                <button
                  onClick={handleInstallClick}
                  className="px-2 py-1 sm:px-3 sm:py-1.5 rounded bg-green-600 hover:bg-green-700 text-xs sm:text-sm min-h-[36px] sm:min-h-[40px] touch-manipulation flex items-center gap-1"
                >
                  📲 <span className="hidden sm:inline">Installieren</span>
                </button>
              )}
              {user && <span className="text-xs sm:text-sm">Hallo, {user.name}</span>}
              <button
                onClick={logout}
                className="px-2 py-1 sm:px-4 sm:py-2 rounded bg-red-800 text-xs sm:text-base min-h-[36px] sm:min-h-[40px] touch-manipulation"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Navigation row */}
          <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1 -mx-2 px-2 sm:mx-0 sm:px-0">
            <button
              onClick={() => setView('order')}
              className={`px-4 py-3 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base whitespace-nowrap min-h-[48px] sm:min-h-[52px] touch-manipulation flex-shrink-0 font-medium ${
                view === 'order' ? 'bg-white text-fwv-red font-bold' : 'bg-red-700 active:bg-red-800'
              }`}
            >
              🛒 Kasse
            </button>
            <button
              onClick={() => setView('tables')}
              className={`px-4 py-3 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base whitespace-nowrap min-h-[48px] sm:min-h-[52px] touch-manipulation flex-shrink-0 font-medium ${
                view === 'tables' ? 'bg-white text-fwv-red font-bold' : 'bg-red-700 active:bg-red-800'
              }`}
            >
              🪑 Tische {allOpenOrders.length > 0 && `(${new Set(allOpenOrders.map(o => o.table_number)).size})`}
            </button>
            <button
              onClick={() => setView('inventory')}
              className={`px-4 py-3 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base whitespace-nowrap min-h-[48px] sm:min-h-[52px] touch-manipulation flex-shrink-0 font-medium ${
                view === 'inventory' ? 'bg-white text-fwv-red font-bold' : 'bg-red-700 active:bg-red-800'
              }`}
            >
              📦 Artikel
            </button>
            <button
              onClick={() => setView('history')}
              className={`px-4 py-3 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base whitespace-nowrap min-h-[48px] sm:min-h-[52px] touch-manipulation flex-shrink-0 font-medium ${
                view === 'history' ? 'bg-white text-fwv-red font-bold' : 'bg-red-700 active:bg-red-800'
              }`}
            >
              📊 History
            </button>
            <button
              onClick={() => setView('settings')}
              className={`px-4 py-3 sm:px-6 sm:py-3 rounded-lg text-sm sm:text-base whitespace-nowrap min-h-[48px] sm:min-h-[52px] touch-manipulation flex-shrink-0 font-medium ${
                view === 'settings' ? 'bg-white text-fwv-red font-bold' : 'bg-red-700 active:bg-red-800'
              }`}
            >
              ⚙️ Einstellungen
            </button>
          </div>
        </div>
      </div>

      {view === 'settings' ? (
        <SettingsView token={token} />
      ) : showHistoryView ? (
        <HistoryView data={historyData} stats={statsData} onRefresh={fetchHistory} token={token} />
      ) : showInventoryView ? (
        <InventoryView items={items} onUpdate={fetchItems} token={token} />
      ) : view === 'tables' ? (
        /* Tables View */
        <div className="max-w-7xl mx-auto p-2 sm:p-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">Offene Tische</h2>
                <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} title={wsConnected ? 'Live-Updates aktiv' : 'Keine Verbindung'} />
              </div>
              <button
                onClick={fetchAllOpenOrders}
                className="bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded text-sm"
              >
                🔄 Aktualisieren
              </button>
            </div>

            {allOpenOrders.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Keine offenen Tischbestellungen
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Group by table number */}
                {[...new Set(allOpenOrders.map(o => o.table_number))].sort((a, b) => a - b).map(tableNum => {
                  const tableOrders = allOpenOrders.filter(o => o.table_number === tableNum);
                  const totalAmount = tableOrders.reduce((sum, o) => sum + parseFloat(o.total), 0);
                  const allItems = tableOrders.flatMap(o => o.items || []);
                  const paidItems = allItems.filter(i => i.paid);
                  const unpaidItems = allItems.filter(i => !i.paid);
                  const unpaidAmount = unpaidItems.reduce((sum, i) => sum + parseFloat(i.price) * i.quantity, 0);
                  const completedCount = allItems.filter(i => i.completed).length;
                  const allKitchenDone = allItems.length > 0 && completedCount === allItems.length;

                  return (
                    <div key={tableNum} className={`border-2 rounded-xl overflow-hidden ${allKitchenDone ? 'border-green-400' : 'border-gray-200'}`}>
                      <div className={`${allKitchenDone ? 'bg-green-600' : 'bg-fwv-red'} text-white p-3`}>
                        <div className="flex justify-between items-center">
                          <span className="text-2xl font-bold">Tisch {tableNum}</span>
                          <span className="text-lg font-semibold">
                            CHF {unpaidAmount.toFixed(2)}
                          </span>
                        </div>
                        {allKitchenDone ? (
                          <div className="text-sm font-medium mt-1">
                            Küche fertig - bereit zum Servieren/Bezahlen
                          </div>
                        ) : completedCount > 0 ? (
                          <div className="text-sm opacity-80 mt-1">
                            Küche: {completedCount}/{allItems.length} fertig
                          </div>
                        ) : null}
                        {paidItems.length > 0 && (
                          <div className="text-sm opacity-80 mt-1">
                            ({paidItems.length} Artikel bereits bezahlt)
                          </div>
                        )}
                      </div>

                      <div className="p-3 max-h-48 overflow-y-auto">
                        {tableOrders.map(order => {
                          const completedItems = order.items?.filter(i => i.completed) || [];
                          const totalItems = order.items?.length || 0;
                          return (
                          <div key={order.id} className="mb-2 pb-2 border-b last:border-0">
                            <div className="text-xs text-gray-500 mb-1 flex items-center gap-2">
                              <span>#{order.id} - {new Date(order.created_at).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}</span>
                              {completedItems.length > 0 && (
                                <span className="bg-green-600 text-white px-1.5 py-0.5 rounded text-xs">
                                  ✓ {completedItems.length}/{totalItems}
                                </span>
                              )}
                            </div>
                            {order.items?.map(item => (
                              <div
                                key={item.id}
                                className={`text-sm flex justify-between items-center rounded px-2 py-1 mb-1 ${
                                  item.paid
                                    ? 'bg-green-100 text-green-700 line-through'
                                    : item.completed
                                      ? 'bg-yellow-100 text-yellow-800 font-medium'
                                      : 'bg-red-100 text-red-800 font-medium'
                                }`}
                              >
                                <span className="flex-1">
                                  {item.completed && !item.paid && '✓ '}
                                  {item.quantity}x {item.item_name}
                                </span>
                                <span className="mr-2">CHF {(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                                {!item.paid && !item.completed && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`"${item.quantity}x ${item.item_name}" wirklich stornieren?`)) {
                                        cancelOrderItem(order.id, item.id);
                                      }
                                    }}
                                    className="text-red-600 hover:text-red-800 hover:bg-red-200 rounded p-1 text-xs font-bold"
                                    title="Artikel stornieren"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )})}
                      </div>

                      {unpaidAmount > 0 && (
                        <div className="p-3 bg-gray-50 border-t">
                          <button
                            onClick={() => {
                              // Open split payment for first order of this table
                              const firstOrder = tableOrders[0];
                              // Combine all items from all orders for this table
                              const combinedOrder: OpenOrder = {
                                ...firstOrder,
                                items: allItems,
                                total: totalAmount.toString()
                              };
                              openSplitPayment(combinedOrder);
                            }}
                            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg font-bold text-lg touch-manipulation"
                          >
                            💳 Bezahlen
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      <select
                        value={customItem.printer_station}
                        onChange={(e) => setCustomItem({ ...customItem, printer_station: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded text-sm bg-white"
                      >
                        <option value="bar">Bar</option>
                        <option value="kitchen">Küche</option>
                      </select>
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                      {items
                        .filter(i => i.category === category)
                        .map(item => (
                          <button
                            key={item.id}
                            onClick={() => addToCart(item)}
                            className="bg-red-50 hover:bg-red-100 active:bg-red-200 border-2 border-fwv-red p-3 sm:p-4 rounded-lg text-left transition touch-manipulation min-h-[70px] sm:min-h-[80px]"
                          >
                            <div className="font-semibold text-sm sm:text-base line-clamp-2">{item.name}</div>
                            <div className="text-fwv-red font-bold text-base sm:text-lg mt-1">
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
                  </div>
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="lg:col-span-1 order-1 lg:order-2">
              <div className="bg-white rounded-lg shadow p-3 sm:p-4 lg:sticky lg:top-4">
                <h2 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4">Bestellung</h2>

                {/* Order Type Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Bestellart
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setOrderType('bar'); setTableNumber(''); setSelectedOrder(null); }}
                      className={`py-3 rounded-lg font-semibold text-sm sm:text-base transition touch-manipulation ${
                        orderType === 'bar'
                          ? 'bg-fwv-red text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      🍺 Bar
                    </button>
                    <button
                      onClick={() => { setOrderType('tisch'); setSelectedOrder(null); }}
                      className={`py-3 rounded-lg font-semibold text-sm sm:text-base transition touch-manipulation ${
                        orderType === 'tisch'
                          ? 'bg-fwv-red text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      🪑 Tisch
                    </button>
                  </div>
                </div>

                {/* Table number input (only for Tisch) */}
                {orderType === 'tisch' && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tischnummer
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={tableNumber}
                      onChange={(e) => setTableNumber(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-xl font-semibold text-center focus:border-fwv-red focus:outline-none"
                      placeholder="Tisch..."
                    />
                  </div>
                )}

                {/* Open orders for this table */}
                {orderType === 'tisch' && tableNumber && openOrders.length > 0 && (
                  <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
                    <label className="block text-sm font-medium text-yellow-800 mb-2">
                      Offene Bestellungen für Tisch {tableNumber}
                    </label>
                    <div className="space-y-2">
                      {openOrders.map(order => {
                        const unpaidTotal = getUnpaidTotal(order);
                        const totalAmount = parseFloat(order.total);
                        const hasPaidItems = order.items?.some(i => i.paid);
                        return (
                          <div key={order.id} className="bg-yellow-100 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                              className={`w-full text-left p-2 transition ${
                                selectedOrder?.id === order.id
                                  ? 'bg-yellow-400 text-yellow-900'
                                  : 'hover:bg-yellow-200 text-yellow-800'
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-semibold">#{order.id}</span>
                                <div className="text-right">
                                  {hasPaidItems && (
                                    <div className="text-xs text-green-700 line-through">
                                      CHF {totalAmount.toFixed(2)}
                                    </div>
                                  )}
                                  <span className="font-bold">
                                    {hasPaidItems ? `Offen: CHF ${unpaidTotal.toFixed(2)}` : `CHF ${totalAmount.toFixed(2)}`}
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs mt-1">
                                {order.items && order.items[0]?.item_name
                                  ? order.items.map(i => (
                                      <span key={i.id} className={i.paid ? 'line-through text-green-700' : ''}>
                                        {i.quantity}x {i.item_name}
                                        {i.paid && ' ✓'}
                                      </span>
                                    )).reduce((prev, curr, idx) => idx === 0 ? [curr] : [...prev, ', ', curr], [] as any)
                                  : 'Keine Artikel'}
                              </div>
                            </button>
                            {unpaidTotal > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSplitPayment(order);
                                }}
                                className="w-full py-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition touch-manipulation"
                              >
                                💳 Bezahlen
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {selectedOrder && (
                      <p className="text-xs text-yellow-700 mt-2">
                        Artikel werden zu Bestellung #{selectedOrder.id} hinzugefügt
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-3 mb-3 sm:mb-4 max-h-[40vh] sm:max-h-96 overflow-y-auto">
                  {cart.map((item, index) => (
                    <div key={`${item.id}-${item.customPrice}-${index}`} className="border-b pb-3">
                      <div className="flex justify-between items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-base truncate">
                            {item.name}
                            {item.customPrice && <span className="text-blue-600 ml-1">*</span>}
                          </div>
                          <div className="text-sm text-gray-600">
                            CHF {(item.customPrice || item.price).toFixed(2)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.customPrice, item.quantity - 1)}
                            className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-200 rounded-lg hover:bg-gray-300 active:bg-gray-400 text-xl font-bold touch-manipulation flex items-center justify-center"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-bold text-lg">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.customPrice, item.quantity + 1)}
                            className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-200 rounded-lg hover:bg-gray-300 active:bg-gray-400 text-xl font-bold touch-manipulation flex items-center justify-center"
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
                        className="w-full mt-2 px-3 py-2 text-base border border-gray-300 rounded-lg"
                      />
                    </div>
                  ))}
                </div>

                {cart.length === 0 && (
                  <div className="text-center text-gray-400 py-4 text-sm">
                    Warenkorb ist leer
                  </div>
                )}

                <div className="border-t-2 pt-4">
                  <div className="flex justify-between text-xl sm:text-2xl font-bold mb-4">
                    <span>Total:</span>
                    <span className="text-green-600">CHF {total.toFixed(2)}</span>
                  </div>

                  <button
                    onClick={submitOrder}
                    disabled={loading || cart.length === 0 || (orderType === 'tisch' && !tableNumber)}
                    className={`w-full font-bold py-4 rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition text-lg sm:text-xl touch-manipulation min-h-[56px] ${
                      selectedOrder
                        ? 'bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-yellow-900'
                        : 'bg-green-600 hover:bg-green-700 active:bg-green-800 text-white'
                    }`}
                  >
                    {loading ? 'Sende...' : selectedOrder ? `➕ Zu #${selectedOrder.id} hinzufügen` : '✅ Bestellung senden'}
                  </button>

                  {cart.length > 0 && (
                    <button
                      onClick={() => setCart([])}
                      className="w-full mt-3 bg-red-100 hover:bg-red-200 active:bg-red-300 text-red-700 font-semibold py-3 rounded-lg transition touch-manipulation min-h-[48px]"
                    >
                      🗑️ Warenkorb leeren
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {pendingOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-2xl font-bold text-center mb-2">
              {pendingOrder.tableNumber ? `Tisch ${pendingOrder.tableNumber}` : `Bestellung #${pendingOrder.id}`}
            </h2>
            <p className="text-3xl font-bold text-center text-green-600 mb-6">
              CHF {pendingOrder.total.toFixed(2)}
            </p>

            <div className="space-y-3">
              {/* Pay Later option for table orders */}
              {pendingOrder.tableNumber && (
                <button
                  onClick={() => {
                    setOrderConfirmation({
                      orderId: pendingOrder.id,
                      orderType: 'tisch',
                      tableNumber: pendingOrder.tableNumber,
                      total: pendingOrder.total,
                      message: 'Bestellung gesendet - Bezahlung später'
                    });
                    setPendingOrder(null);
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-yellow-900 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 touch-manipulation"
                >
                  🪑 Später bezahlen (Tisch offen lassen)
                </button>
              )}

              <button
                onClick={() => handlePayment('sumup')}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 touch-manipulation disabled:bg-gray-400"
              >
                💳 SumUp 3G Terminal
              </button>

              <button
                onClick={() => handlePayment('bar')}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 touch-manipulation disabled:bg-gray-400"
              >
                💵 Barzahlung
              </button>

              {/* TWINT option - only show if QR code is configured */}
              {twintQrUrl && (
                <button
                  onClick={() => {
                    setTwintPayment({ orderId: pendingOrder.id, total: pendingOrder.total });
                    setPendingOrder(null);
                  }}
                  disabled={loading}
                  className="w-full bg-black hover:bg-gray-800 active:bg-gray-900 text-white py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 touch-manipulation disabled:bg-gray-400"
                >
                  <img src="https://www.twint.ch/content/uploads/2021/05/twint-logo-quer-weiss.png" alt="TWINT" className="h-6" />
                  TWINT
                </button>
              )}
            </div>

            <button
              onClick={() => setPendingOrder(null)}
              className="w-full mt-4 text-gray-500 hover:text-gray-700 py-2 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* TWINT Payment Modal */}
      {twintPayment && twintQrUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h2 className="text-2xl font-bold text-center mb-2">TWINT Zahlung</h2>
            <p className="text-sm text-gray-600 text-center mb-2">Bestellung #{twintPayment.orderId}</p>
            <p className="text-3xl font-bold text-center text-green-600 mb-4">
              CHF {twintPayment.total.toFixed(2)}
            </p>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-center text-sm text-gray-600 mb-3">
                Scannen Sie den QR-Code mit der TWINT App:
              </p>
              <img
                src={twintQrUrl}
                alt="TWINT QR Code"
                className="w-48 mx-auto border-2 border-gray-200 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <button
                onClick={async () => {
                  // Mark as paid with TWINT
                  try {
                    await fetch(`${API_URL}/orders/${twintPayment.orderId}/status`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ status: 'paid', payment_method: 'twint' }),
                    });
                    setOrderConfirmation({
                      orderId: twintPayment.orderId,
                      orderType: 'bar',
                      total: twintPayment.total,
                      message: 'TWINT Zahlung erhalten'
                    });
                    setTwintPayment(null);
                  } catch (error) {
                    alert('Fehler beim Abschliessen der Zahlung');
                  }
                }}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold text-lg"
              >
                ✓ Zahlung erhalten
              </button>
              <button
                onClick={() => setTwintPayment(null)}
                className="w-full text-gray-500 hover:text-gray-700 py-2 text-sm"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {cashPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-center mb-2">Barzahlung</h2>
            <p className="text-sm text-gray-600 text-center mb-4">Bestellung #{cashPayment.orderId}</p>

            <div className="bg-gray-100 rounded-xl p-4 mb-3">
              <div className="flex justify-between items-center text-lg">
                <span>Betrag:</span>
                <span className="font-bold text-green-600">CHF {cashPayment.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Display for entered amount */}
            <div className="bg-gray-50 border-2 border-gray-300 rounded-xl p-3 mb-3">
              <div className="text-sm text-gray-600 mb-1">Erhalten (CHF)</div>
              <div className="text-3xl font-bold text-center text-gray-800 min-h-[40px]">
                {cashPayment.received || '0.00'}
              </div>
            </div>

            {/* Change calculation - shown above keypad when applicable */}
            {cashPayment.received && parseFloat(cashPayment.received) >= cashPayment.total && (
              <div className="bg-green-100 border-2 border-green-500 rounded-xl p-3 mb-3">
                <div className="flex justify-between items-center text-lg">
                  <span className="font-semibold">Wechselgeld:</span>
                  <span className="font-bold text-green-700 text-2xl">
                    CHF {(parseFloat(cashPayment.received) - cashPayment.total).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {cashPayment.received && parseFloat(cashPayment.received) > 0 && parseFloat(cashPayment.received) < cashPayment.total && (
              <div className="bg-red-100 border-2 border-red-400 rounded-xl p-3 mb-3">
                <div className="flex justify-between items-center text-lg">
                  <span className="font-semibold text-red-700">Fehlbetrag:</span>
                  <span className="font-bold text-red-700">
                    CHF {(cashPayment.total - parseFloat(cashPayment.received)).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {['7', '8', '9', '10'].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === '10') {
                      setCashPayment({ ...cashPayment, received: '10' });
                    } else {
                      const current = cashPayment.received === '0' ? '' : cashPayment.received;
                      setCashPayment({ ...cashPayment, received: current + key });
                    }
                  }}
                  className={`py-4 rounded-xl font-bold text-xl touch-manipulation ${
                    key === '10' ? 'bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-800' : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {key}
                </button>
              ))}
              {['4', '5', '6', '20'].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === '20') {
                      setCashPayment({ ...cashPayment, received: '20' });
                    } else {
                      const current = cashPayment.received === '0' ? '' : cashPayment.received;
                      setCashPayment({ ...cashPayment, received: current + key });
                    }
                  }}
                  className={`py-4 rounded-xl font-bold text-xl touch-manipulation ${
                    key === '20' ? 'bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-800' : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {key}
                </button>
              ))}
              {['1', '2', '3', '50'].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === '50') {
                      setCashPayment({ ...cashPayment, received: '50' });
                    } else {
                      const current = cashPayment.received === '0' ? '' : cashPayment.received;
                      setCashPayment({ ...cashPayment, received: current + key });
                    }
                  }}
                  className={`py-4 rounded-xl font-bold text-xl touch-manipulation ${
                    key === '50' ? 'bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-800' : 'bg-gray-100 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {key}
                </button>
              ))}
              <button
                onClick={() => {
                  const current = cashPayment.received === '0' ? '' : cashPayment.received;
                  setCashPayment({ ...cashPayment, received: current + '0' });
                }}
                className="py-4 rounded-xl font-bold text-xl touch-manipulation bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
              >
                0
              </button>
              <button
                onClick={() => {
                  if (!cashPayment.received.includes('.')) {
                    setCashPayment({ ...cashPayment, received: (cashPayment.received || '0') + '.' });
                  }
                }}
                className="py-4 rounded-xl font-bold text-xl touch-manipulation bg-gray-100 hover:bg-gray-200 active:bg-gray-300"
              >
                .
              </button>
              <button
                onClick={() => {
                  setCashPayment({ ...cashPayment, received: cashPayment.received.slice(0, -1) || '' });
                }}
                className="py-4 rounded-xl font-bold text-xl touch-manipulation bg-yellow-100 hover:bg-yellow-200 active:bg-yellow-300"
              >
                ←
              </button>
              <button
                onClick={() => setCashPayment({ ...cashPayment, received: '100' })}
                className="py-4 rounded-xl font-bold text-xl touch-manipulation bg-blue-100 hover:bg-blue-200 active:bg-blue-300 text-blue-800"
              >
                100
              </button>
            </div>

            {/* Passend button */}
            <button
              onClick={() => setCashPayment({ ...cashPayment, received: cashPayment.total.toFixed(2) })}
              className="w-full bg-gray-200 hover:bg-gray-300 active:bg-gray-400 py-3 rounded-xl font-medium mb-3 touch-manipulation"
            >
              Passend ({cashPayment.total.toFixed(2)})
            </button>

            <button
              onClick={confirmCashPayment}
              disabled={!cashPayment.received || parseFloat(cashPayment.received) < cashPayment.total}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-4 rounded-xl font-bold text-lg touch-manipulation disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Bezahlung abschliessen
            </button>

            <button
              onClick={() => setCashPayment(null)}
              className="w-full mt-3 text-gray-500 hover:text-gray-700 py-2 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Card Payment Modal (SumUp 3G+ Manual) */}
      {cardPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-center mb-2">💳 Kartenzahlung</h2>
            <p className="text-sm text-gray-600 text-center mb-4">Bestellung #{cardPayment.orderId}</p>

            <div className="bg-blue-50 border-4 border-blue-500 rounded-2xl p-6 mb-6">
              <div className="text-center">
                <div className="text-sm text-blue-600 mb-2 font-medium">Betrag am SumUp 3G+ eingeben:</div>
                <div className="text-6xl font-bold text-blue-700">
                  {cardPayment.total.toFixed(2)}
                </div>
                <div className="text-2xl text-blue-600 mt-1">CHF</div>
              </div>
            </div>

            <div className="bg-gray-100 rounded-xl p-4 mb-4 text-sm text-gray-600">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">1️⃣</span>
                <span>Betrag am SumUp 3G+ eintippen</span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">2️⃣</span>
                <span>Kunde hält Karte ans Terminal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">3️⃣</span>
                <span>Nach erfolgreicher Zahlung hier bestätigen</span>
              </div>
            </div>

            <button
              onClick={confirmCardPayment}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white py-4 rounded-xl font-bold text-lg touch-manipulation"
            >
              ✅ Zahlung erhalten
            </button>

            <button
              onClick={() => setCardPayment(null)}
              className="w-full mt-3 text-gray-500 hover:text-gray-700 py-2 text-sm"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Split Payment Modal */}
      {splitPaymentOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-center mb-2">💳 Bezahlen</h2>
              <p className="text-sm text-gray-600 text-center mb-1">
                Tisch {splitPaymentOrder.table_number} - Bestellung #{splitPaymentOrder.id}
              </p>
              <p className="text-lg font-bold text-center text-fwv-red mb-4">
                Offen: CHF {getUnpaidTotal(splitPaymentOrder).toFixed(2)}
              </p>

              {/* Payment Mode Tabs */}
              <div className="grid grid-cols-3 gap-1 mb-4 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => { setSplitPaymentMode('full'); setSelectedItemIds([]); setSplitAmount(''); }}
                  className={`py-2 px-2 rounded-md text-sm font-medium transition ${
                    splitPaymentMode === 'full'
                      ? 'bg-white shadow text-fwv-red'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Alles
                </button>
                <button
                  onClick={() => { setSplitPaymentMode('split'); setSelectedItemIds([]); }}
                  className={`py-2 px-2 rounded-md text-sm font-medium transition ${
                    splitPaymentMode === 'split'
                      ? 'bg-white shadow text-fwv-red'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Betrag
                </button>
                <button
                  onClick={() => { setSplitPaymentMode('items'); setSplitAmount(''); }}
                  className={`py-2 px-2 rounded-md text-sm font-medium transition ${
                    splitPaymentMode === 'items'
                      ? 'bg-white shadow text-fwv-red'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Artikel
                </button>
              </div>

              {/* Full Payment Mode */}
              {splitPaymentMode === 'full' && (
                <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 mb-4 text-center">
                  <div className="text-sm text-green-700 mb-1">Gesamtbetrag bezahlen</div>
                  <div className="text-4xl font-bold text-green-700">
                    CHF {getUnpaidTotal(splitPaymentOrder).toFixed(2)}
                  </div>
                </div>
              )}

              {/* Split Amount Mode */}
              {splitPaymentMode === 'split' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Betrag eingeben (max. CHF {getUnpaidTotal(splitPaymentOrder).toFixed(2)})
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.05"
                    min="0.05"
                    max={getUnpaidTotal(splitPaymentOrder)}
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg text-2xl font-bold text-center focus:border-fwv-red focus:outline-none"
                    placeholder="0.00"
                  />
                  <div className="flex gap-2 mt-2">
                    {[10, 20, 50].map(amount => (
                      <button
                        key={amount}
                        onClick={() => setSplitAmount(Math.min(amount, getUnpaidTotal(splitPaymentOrder)).toFixed(2))}
                        className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                      >
                        {amount}.-
                      </button>
                    ))}
                    <button
                      onClick={() => setSplitAmount((getUnpaidTotal(splitPaymentOrder) / 2).toFixed(2))}
                      className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
                    >
                      ½
                    </button>
                  </div>
                </div>
              )}

              {/* Per-Item Mode */}
              {splitPaymentMode === 'items' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Artikel auswählen (einzeln anklicken)
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {/* Expand items by quantity so each unit can be selected individually */}
                    {splitPaymentOrder.items?.filter(item => !item.paid).flatMap(item => {
                      // Create array of individual units for this item
                      return Array.from({ length: item.quantity }, (_, idx) => {
                        const unitKey = `${item.id}-${idx}`;
                        const isSelected = selectedItemIds.includes(unitKey);
                        return (
                          <button
                            key={unitKey}
                            onClick={() => {
                              setSelectedItemIds(prev =>
                                prev.includes(unitKey)
                                  ? prev.filter(id => id !== unitKey)
                                  : [...prev, unitKey]
                              );
                            }}
                            className={`w-full text-left p-3 rounded-lg border-2 transition ${
                              isSelected
                                ? 'bg-green-100 border-green-500'
                                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-medium">
                                {isSelected ? '✓ ' : ''}1x {item.item_name}
                              </span>
                              <span className="font-bold">
                                CHF {parseFloat(item.price).toFixed(2)}
                              </span>
                            </div>
                          </button>
                        );
                      });
                    })}
                  </div>
                  {selectedItemIds.length > 0 && (
                    <div className="mt-3 p-3 bg-green-50 rounded-lg text-center">
                      <span className="text-sm text-green-700">Ausgewählt: {selectedItemIds.length} Artikel = </span>
                      <span className="font-bold text-green-700">
                        CHF {(() => {
                          // Calculate total from selected unit keys
                          let total = 0;
                          selectedItemIds.forEach(key => {
                            const [itemId] = key.split('-');
                            const item = splitPaymentOrder.items?.find(i => i.id === parseInt(itemId));
                            if (item) total += parseFloat(item.price);
                          });
                          return total.toFixed(2);
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Payment Method Selection */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Zahlungsart
                </label>
                <div className={`grid gap-2 ${twintQrUrl ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <button
                    onClick={() => setSplitPaymentMethod('cash')}
                    className={`py-3 rounded-lg font-semibold transition ${
                      splitPaymentMethod === 'cash'
                        ? 'bg-fwv-red text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    💵 Bar
                  </button>
                  <button
                    onClick={() => setSplitPaymentMethod('card')}
                    className={`py-3 rounded-lg font-semibold transition ${
                      splitPaymentMethod === 'card'
                        ? 'bg-fwv-red text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    💳 Karte
                  </button>
                  {twintQrUrl && (
                    <button
                      onClick={() => setSplitPaymentMethod('twint')}
                      className={`py-3 rounded-lg font-semibold transition ${
                        splitPaymentMethod === 'twint'
                          ? 'bg-black text-white'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                      }`}
                    >
                      TWINT
                    </button>
                  )}
                </div>
              </div>

              {/* TWINT QR Code - shown when TWINT is selected */}
              {splitPaymentMethod === 'twint' && twintQrUrl && (
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <p className="text-center text-sm text-gray-600 mb-3">
                    QR-Code mit TWINT App scannen:
                  </p>
                  <img
                    src={twintQrUrl}
                    alt="TWINT QR Code"
                    className="w-48 mx-auto border-2 border-gray-200 rounded-lg"
                  />
                </div>
              )}

              {/* Confirm Button */}
              <button
                onClick={processSplitPayment}
                disabled={
                  (splitPaymentMode === 'split' && (!splitAmount || parseFloat(splitAmount) <= 0)) ||
                  (splitPaymentMode === 'items' && selectedItemIds.length === 0)
                }
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-bold text-lg touch-manipulation"
              >
                {splitPaymentMode === 'full' && `CHF ${getUnpaidTotal(splitPaymentOrder).toFixed(2)} bezahlen`}
                {splitPaymentMode === 'split' && splitAmount && `CHF ${parseFloat(splitAmount).toFixed(2)} bezahlen`}
                {splitPaymentMode === 'split' && !splitAmount && 'Betrag eingeben'}
                {splitPaymentMode === 'items' && selectedItemIds.length > 0 && `CHF ${getSelectedItemsTotal(splitPaymentOrder).toFixed(2)} bezahlen`}
                {splitPaymentMode === 'items' && selectedItemIds.length === 0 && 'Artikel auswählen'}
              </button>

              <button
                onClick={closeSplitPayment}
                className="w-full mt-3 text-gray-500 hover:text-gray-700 py-2 text-sm"
              >
                Abbrechen
              </button>
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

function HistoryView({ data, stats, onRefresh, token }: { data: any[]; stats: any; onRefresh: () => void; token: string | null }) {
  const [sendingReport, setSendingReport] = useState(false);

  const sendReport = async () => {
    if (!token) {
      alert('Bitte einloggen um den Bericht zu senden');
      return;
    }

    setSendingReport(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${API_URL}/stats/send-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const result = await res.json();
      if (res.ok) {
        alert(`Tagesbericht wurde an ${result.sentTo} gesendet!`);
      } else {
        alert(`Fehler: ${result.error || 'Unbekannter Fehler'}`);
      }
    } catch (error) {
      console.error('Send report error:', error);
      alert('Fehler beim Senden des Berichts');
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-4">
      {/* Daily Stats */}
      {stats && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">Tagesstatistik ({stats.date})</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <button
                onClick={sendReport}
                disabled={sendingReport}
                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
              >
                {sendingReport ? 'Sende...' : 'Per E-Mail senden'}
              </button>
              <button
                onClick={onRefresh}
                className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Aktualisieren
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-blue-600">
                {stats.summary?.total_orders || 0}
              </div>
              <div className="text-sm text-gray-600">Bestellungen</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-green-600">
                CHF {parseFloat(stats.summary?.total_revenue || 0).toFixed(2)}
              </div>
              <div className="text-sm text-gray-600">Umsatz</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-yellow-600">
                {stats.summary?.completed_orders || 0}
              </div>
              <div className="text-sm text-gray-600">Abgeschlossen</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl sm:text-3xl font-bold text-purple-600">
                {stats.summary?.paid_orders || 0}
              </div>
              <div className="text-sm text-gray-600">Bezahlt</div>
            </div>
          </div>

          {/* Top Items */}
          {stats.top_items && stats.top_items.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Meistverkaufte Artikel</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {stats.top_items.slice(0, 5).map((item: any, index: number) => (
                  <div key={index} className="bg-gray-50 p-2 rounded text-sm">
                    <div className="font-semibold truncate">{item.name}</div>
                    <div className="text-gray-600">{item.total_sold}x verkauft</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order History */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-4">Bestellhistorie</h2>

        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-sm">#</th>
                <th className="px-3 py-2 text-left text-sm">Tisch</th>
                <th className="px-3 py-2 text-left text-sm">Zeit</th>
                <th className="px-3 py-2 text-left text-sm">Artikel</th>
                <th className="px-3 py-2 text-left text-sm">Total</th>
                <th className="px-3 py-2 text-left text-sm">Zahlung</th>
                <th className="px-3 py-2 text-left text-sm">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((order: any) => (
                <tr key={order.id} className="border-t hover:bg-gray-50">
                  <td className="px-3 py-2 text-sm font-mono">{order.id}</td>
                  <td className="px-3 py-2 text-sm">{order.table_number}</td>
                  <td className="px-3 py-2 text-sm">
                    {new Date(order.created_at).toLocaleString('de-CH')}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {order.items && order.items[0]?.id ? (
                      <span className="text-xs">
                        {order.items.map((item: any) => `${item.quantity}x ${item.item_name}`).join(', ')}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm font-semibold">
                    CHF {parseFloat(order.total).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {order.payment_method ? (
                      <span className={`px-2 py-1 rounded text-xs ${
                        order.payment_method === 'cash' ? 'bg-green-100 text-green-800' :
                        order.payment_method === 'card' ? 'bg-blue-100 text-blue-800' :
                        order.payment_method === 'sumup' ? 'bg-blue-100 text-blue-800' :
                        order.payment_method === 'twint' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.payment_method === 'cash' ? 'Bar' :
                         order.payment_method === 'card' ? 'Karte' :
                         order.payment_method === 'sumup' ? 'SumUp' :
                         order.payment_method === 'twint' ? 'TWINT' : order.payment_method}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.status === 'paid' ? 'bg-green-100 text-green-800' :
                      order.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.status === 'paid' ? 'Bezahlt' :
                       order.status === 'completed' ? 'Abgeschlossen' : 'Offen'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            Keine Bestellungen vorhanden.
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsView({ token }: { token: string | null }) {
  const [settings, setSettings] = useState({
    printer_bar_ip: '',
    printer_bar_port: '9100',
    printer_kitchen_ip: '',
    printer_kitchen_port: '9100',
    twint_qr_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || '/api';

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/settings`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          ...data
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        alert('Einstellungen gespeichert!');
      } else {
        alert('Fehler beim Speichern');
      }
    } catch (error) {
      alert('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const testPrinter = async (station: 'bar' | 'kitchen') => {
    const ip = station === 'bar' ? settings.printer_bar_ip : settings.printer_kitchen_ip;
    const port = station === 'bar' ? settings.printer_bar_port : settings.printer_kitchen_port;

    if (!ip) {
      alert('Bitte IP-Adresse eingeben');
      return;
    }

    setTesting(station);
    try {
      const res = await fetch(`${API_URL}/settings/test-printer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ station, ip, port }),
      });

      const result = await res.json();
      if (res.ok) {
        alert(`Testdruck erfolgreich an ${ip} gesendet`);
      } else {
        alert(`Fehler: ${result.error}`);
      }
    } catch (error) {
      alert('Verbindung zum Server fehlgeschlagen');
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-center text-gray-500">Lade Einstellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-bold mb-6">Einstellungen</h2>

        {/* Printer Settings */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            🖨️ Bondrucker (Epson TM-T20III)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar Printer */}
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3">Bar / Getränke</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">IP-Adresse</label>
                  <input
                    type="text"
                    placeholder="z.B. 192.168.1.100"
                    value={settings.printer_bar_ip}
                    onChange={(e) => setSettings({ ...settings, printer_bar_ip: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Port</label>
                  <input
                    type="text"
                    placeholder="9100"
                    value={settings.printer_bar_port}
                    onChange={(e) => setSettings({ ...settings, printer_bar_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => testPrinter('bar')}
                  disabled={testing === 'bar' || !settings.printer_bar_ip}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:bg-gray-400"
                >
                  {testing === 'bar' ? 'Teste...' : 'Testdruck'}
                </button>
              </div>
            </div>

            {/* Kitchen Printer */}
            <div className="border rounded-lg p-4">
              <h4 className="font-semibold mb-3">Küche / Essen</h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">IP-Adresse</label>
                  <input
                    type="text"
                    placeholder="z.B. 192.168.1.101"
                    value={settings.printer_kitchen_ip}
                    onChange={(e) => setSettings({ ...settings, printer_kitchen_ip: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Port</label>
                  <input
                    type="text"
                    placeholder="9100"
                    value={settings.printer_kitchen_port}
                    onChange={(e) => setSettings({ ...settings, printer_kitchen_port: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => testPrinter('kitchen')}
                  disabled={testing === 'kitchen' || !settings.printer_kitchen_ip}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg disabled:bg-gray-400"
                >
                  {testing === 'kitchen' ? 'Teste...' : 'Testdruck'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p><strong>Hinweis:</strong> Die Epson TM-T20III Drucker müssen im selben Netzwerk sein und auf Port 9100 (Standard) erreichbar sein.</p>
          </div>
        </div>

        {/* TWINT/RaiseNow QR Code Settings */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            💳 TWINT Zahlung (RaiseNow)
          </h3>

          <div className="border rounded-lg p-4">
            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm text-gray-600 mb-2">QR-Code Bild hochladen</label>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;

                      const formData = new FormData();
                      formData.append('qrcode', file);

                      try {
                        setSaving(true);
                        const res = await fetch(`${API_URL}/settings/upload-twint-qr`, {
                          method: 'POST',
                          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                          body: formData,
                        });

                        const result = await res.json();
                        if (res.ok && result.url) {
                          setSettings(prev => ({ ...prev, twint_qr_url: result.url }));
                          alert('QR-Code erfolgreich hochgeladen!');
                        } else {
                          alert(result.error || 'Upload fehlgeschlagen');
                        }
                      } catch (error) {
                        alert('Upload fehlgeschlagen');
                      } finally {
                        setSaving(false);
                        e.target.value = ''; // Reset file input
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Bild wird automatisch zu Nextcloud hochgeladen und verlinkt.
                </p>
              </div>

              {/* Or manual URL */}
              <div className="border-t pt-4">
                <label className="block text-sm text-gray-600 mb-1">Oder URL manuell eingeben:</label>
                <input
                  type="text"
                  placeholder="https://example.com/twint-qr.png"
                  value={settings.twint_qr_url || ''}
                  onChange={(e) => setSettings({ ...settings, twint_qr_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Preview */}
              {settings.twint_qr_url && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Vorschau:</p>
                  <img
                    src={settings.twint_qr_url}
                    alt="TWINT QR Code"
                    className="max-w-[200px] mx-auto border rounded"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p><strong>Tipp:</strong> Den QR-Code kannst du im RaiseNow Dashboard generieren und hier hochladen.</p>
          </div>
        </div>

        {/* Save Button */}
        <div className="border-t pt-4">
          <button
            onClick={saveSettings}
            disabled={saving}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold disabled:bg-gray-400"
          >
            {saving ? 'Speichere...' : 'Einstellungen speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
