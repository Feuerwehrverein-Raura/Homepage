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

// Base64 encoded beep sound (two-tone notification) - proper WAV format
const BEEP_SOUND_BASE64 = 'data:audio/wav;base64,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rL/N19za08a1oYpzXEg3KyMiJjA+UWd+laq9zNbb2tPHtqKMdF5JOCwkIiYvPlBmfJOpvMvV2trTx7ejjXZfSzktJSMmLz1PZHuSqLvK1drZ08i4pI53YUw7LiUjJi89TmN6kaa5ydTZ2dPIuKWPeGJNPC8mIyYvPE5ieY+luMjT2dnTyLmmkHpjTz0wJyQmLzxNYXeOpLfH0tjY08m6p5J7ZVA+MSgkJy47TGB2jaK1xdHX2NPJuqiTfGZRQDIpJScuO0tfdYuhtMTQ19jTybuplH5oU0EzKiYnLjpKXnSKn7PDz9bX08q7qpV/aVRCNComJy46Sl1yiZ6yws7V19PKvKqWgGpWQzUrJyguOUlccYedsMHN1NbTyr2rl4FsV0U2LCcoLjlIW3CGm6/AzNTW08q9rJiDbVhGNy0oKC45SFpvhZquvsvT1dPLvq2ZhG5aRzguKCguOEdZboOZrL3K0tXSy76umoVvW0g5LykpLjhGWG2Cl6u8ydHU0su/rpuGcVxKOzAqKS44RldsgZaqu8jQ1NLLv6+ch3JdSzwxKiouN0VXa4CVqLrH0NPSy7+wnYlzX0w9MisqLjdFVml/lKe4xs/T0svAsZ6KdWBNPjMsKi43RFVofZKmt8XO0tHLwLGfi3ZhTz8zLSsuN0RUZ3yRpbbEzdLRy8GyoIx3Y1BANC0rLjZDU2Z7kKO1w8zR0cvBs6GNeGRRQTUuLC42Q1Nleo6is8LL0dDLwbOijnllU0M2LywvNkJSZHmNobLAy9DQy8K0o495ZlRENzAtLzZCUWR4jKCxv8rP0MvCtKOQfGhVRTgwLS82QVBjdouesL7Jz8/LwrWkkX1pVkY5MS4vNkFQYnWKna+9yM7Py8K1pZJ+aldHOjIuLzZBT2F0iJytvMfNz8vDtqaTf2tZSDszLzA2QE9gc4ebrLvGzc7Lw7amlIBtWko8NC8wNkBOX3KGmau6xczOy8O3p5WCbltLPjQwMDZATV5xhZiqucTLzcvDt6iWg29cTD81MTE2P01dcISXqbjDys3Kw7ipl4RwXk1ANjExNj9MXW+Clqe3wsrMysO4qZiFcV9OQTcyMTY/TFxugZSmtcHJzMrDuKqZhnNgT0I4MjI2P0tbbYCTpbTAyMvKw7mrmod0YVFDOTMyNj5LWmx/kqSzv8fLycO5q5qIdWJSRDo0MzY+SlprfpGjsr7GysnDuaybiXZkU0U7NDM2PkpZan2QobG9xsrJw7qsnIp3ZVRGOzUzNj5JWGl8j6CwvMXJycO6rZ2LeGZVRzw2NDc+SVhpe42fr7vEyMjDuq2ejHlnVkg9NzQ3PklXaHqMnq66w8jIw7uuno16aFdJPjc1Nz5IVmd5i52sucLHyMO7rp+Oe2lZSj84NTc9SFZmeIqcq7jCx8fDu6+gj31rWktAOTY3PUhVZXeJm6q3wcbHw7uvoZB+bFtMQTo2OD1HVGR2iJmptsDFxsO7sKGQf21cTUI6Nzg9R1RkdYeYqLW/xcbDu7CikYBuXU9DOzc4PUdTY3SGl6e0vsTGw7yxopKBb15QRDw4OT1GU2JzhZams73DxcK8saOTgnBfUUU9OTk9RlJhcoSVpbK8w8XCvLGklINxYVJGPTk5PkZSYXGDlKSxu8LEwryypJWEcmJTRz46Oj5GUWBwgpOjsLrBxMK8sqWVhHNjVEg/Ojo+RlFfcIGSoa+6wMPCvLKlloV0ZFVJQDs6PkVRX2+AkaCuucDDwbyyppeGdWVWSkE8Oz5FUF5uf5Cfrbi/wsG8s6aYh3ZmV0tCPDs+RVBdbX6Onqy3vsLBvLOnmIh3Z1hMQj08PkVQXWx9jZ2rtr3BwLyzp5mJeGhZTUM+PD9FT1xrfIycqrW9wMC8s6iainlpWk5EPjw/RU9ca3uLm6m0vMDAvLSomot6altPRT89P0VPW2p6ipqos7u/v7u0qZuMe2tcUEZAPT9FTltpeYmZp7K6v7+7tKmcjHxsXVFHQD4/RU5aaXiImKaxub6/u7SpnI19bV5SSEE+QEVOWmh3h5elsLm9vru0qp2Ofm5fU0lCP0BFTllnd4aWpK+4vb67tKqdj39vYVRJQ0BARU1ZZ3aFlaOut7y9u7Sqno+AcGJVSkNAQUVNWGZ1hZSirba7vbq0q56QgXFjVktEQUFFTVhldISToay1u7y6tKufkYJyZFdMRUFBRU1YZXODkqCstLq8urSrn5KCc2VYTUZCQkVNV2RzgpGfq7S5u7q0q6CSg3RmWU5GQkJGTVdjcoGQnqqzubu5tKygk4R1Z1pPR0NDRk1XY3GAj52psri6ubSsoZOFdmdbUEhEQ0ZNVmJwf46cqLG3urm0rKGUhndoW1FJRENGTFZicH6Nm6ewt7m5tKyilYZ4aVxSSkVERkxWYW99jJqmr7a5uLSsopWHeWpdU0pGREdMVWFufYuZpa+1uLi0raKWiHlrXlNLRkVHTFVgbnyKmKSutLi4tK2jlol6bF9UTEdFR0xVYG17iZejrbS3t7Sto5eJe21gVU1HRkdMVWBseoiWoqyzt7ezraOXinxuYVZOSEZITFVfbHqIlaGrsra2s62kmIt9b2JXTklHSE1UX2t5h5SgqrG1trOtpJiLfnBjWE9KR0hNVF5reIaTn6mxtbazraSZjH5xZFlQSkhJTVReaneFkp6osLS1s62kmY1/cmVaUUtISU1UXmp3hJGdqK+0tbKtpZqNgHJmW1JMSUlNVF1pdoORnaeus7SyraWajoFzZ1xTTElKTVRdaHWDkJymrrK0sq2lm4+BdGhcU01KSk1UXWh1go+bpa2ys7KtpZuPgnVoXVROSkpNVF1odIGOmqSssbOxraWbkIN2aV5VT0tLTlRcZ3OAjZmjq7Cysa2lnJCEd2pfVk9MS05UXGdzgIyYoqqwsrGtppyRhHdrYFdQTExOVFxmcn+Ll6Kqr7GwrKackYV4bGFYUU1MTlRcZnJ+i5ahqa6xsKymnZKGeW1iWFFNTE9UW2VxfYqWoKiusLCspp2ShnpuY1lSTk1PVFtlcH2JlZ+nrbCvrKadk4d7bmNaU09NT1RbZXB8iJSepqyvr6ymnZOHe29kW1RPTk9UW2Rve4eTnaarr6+spp6TiHxwZVxUUE5QVFtkb3uHkpylq66uq6aelIl9cWZdVVFPUFRbZG56hpGcpKqtrqumnpSJfXJnXVZRT1BUW2NueYWRm6Opra2rpp6Vin5yaF5XUlBRVFtjbXmEkJqiqaytq6aelYp/c2hfWFNQUVRbY214hI+Zoqisraumn5WLf3RpYFhTUVFVW2NteIOOmKGnq6yqpp+Wi4B1amFZVFFSVVtjbHeCjZigpqqsqqafloyBdWthWlVSUlVbYmx3go2Xn6aqq6qln5aMgXZsYltVUlJVW2JrdoGMlp6lqauppZ+XjYJ3bGNbVlNTVVtia3WAi5WepKmqqaWfl42CeG1kXFdUU1ZbYmt1gIqUnaSoqqmln5eNg3huZV1XVFRWW2JqdH+KlJyjp6mopZ+XjoR5b2VeWFVUVltianR/iZOboqepqKWfl46Eem9mXllVVVZbYWp0foiSm6GmqKiln5iPhXpwZ19ZVlVXW2Fqc32IkZqhpainpJ+Yj4V7cWhgWldWV1thaXN9h5GZoKWnp6SfmI+Ge3FoYVtXVldbYWlyfIaQmJ+kpqakn5iQhnxyaWFbWFZYW2FpcnyGj5ieo6ampJ+YkId9c2piXFhXWFthaXF7hY6XnqOlpqOfmJCHfXRrY11ZV1hcYWhxe4SOlp2ipaWjn5iRh350a2ReWlhZXGFocXqEjZWcoaSlo5+ZkYh+dWxkXlpYWVxhaHB6g4yVnKGkpKOfmZGIf3VtZV9bWVlcYWhweYOMlJugo6SinpmRiX92bWZgW1laXGFocHmCi5Oan6Ojop6ZkYmAd25mYFxaWl1haHB4gYqTmZ+io6KemZKJgHdvZ2FdW1tdYWhveIGKkpmeoaKhnpmSioF4b2hiXVtbXWFob3eAiZGYnaGioZ6ZkoqBeXBpYl5cW11iZ293gIiQl52goaGemZKKgnlxaWNfXFxeYmdvd3+IkJecoKGgnZmSi4J6cWpkX11cXmJnbnZ/h4+Wm5+goJ2ZkouDenJrZGBdXV5iZ252foePlZueoKCdmZKLg3tza2VhXl1fYmdudn6GjpWanp+fnZiTi4R7c2xmYV5eX2JnbnV9ho2UmZ2fn5yYk4yEfHRtZmJfXl9iZ250fYWNk5mdnp6cmJOMhHx0bWdiYF9gY2dtdX2EjJOYnJ6enJiTjIV9dW5oY2BfYGNnbXR8hIuSl5udnZyYk4yFfXZuaGRhYGBjZ210fIOLkZebnZ2bmJOMhX52b2lkYWBhY2htdHuDipGWmpydm5iTjYZ+d3BqZWJhYWRobXR7goqQlZmcnJuYk42Gf3dwamZiYWJkaG1ze4KJj5WZm5ual5ONhn94cWtmY2JiZGhtc3qBiI+UmJubmpeTjYZ/eHJsZ2RiYmRobXN6gYiOlJiam5qXk42HgHlybGhkY2NlaG1zeoGHjpOXmZqZl5ONh4B5c21oZWNjZWhtc3mAh42SlpmamZaTjYeAenNtaWVkZGVobXN5gIaMkpaYmZmWko2HgXp0bmlmZGRmaW1yeX+GjJGVmJmYlpKNiIF7dG9qZ2VkZmltcnh/hYuRlZeYmJaSjYiBe3Vva2hlZWZpbXJ4f4WLkJSXmJeVko2Ignt1cGtoZmVnaW1yeH6Eio+TlpeXlZKNiIJ8dnBsaGZmZ2ltcnh+hIqPk5aXl5WSjYiCfHZxbGlnZmdqbXJ4foSJjpKVlpaVko2Ig313cW1qZ2doam1yd32DiY6SlJaWlJGNiIN9d3JuamhnaGpucnd9g4iNkZSVlZSRjYiDfXhzbmtpaGhqbnJ3fYKIjZCTlZWUkY2Jg354c29raWhpa25yd3yCh4yQk5SUk5GNiYN+eXRvbGppaWtucnd8goeLj5KUlJORjYmEfnl0cGxqaWprbnJ3fIGGi4+Sk5STkI2JhH95dXBta2pqbG5yd3yBhoqOkZOTkpCNiYR/enVxbmtqamxvcnd7gIWKjpCSk5KQjYmEf3p2cW5sa2tsb3J2e4CFiY2QkpKRj42JhH97dnJvbGtrbW9ydnuAhYmNj5GSkY+MiYSAe3Zyb21sbG1vcnZ7gISIjI+RkZGPjImEgHt3c3BtbGxtb3N2en+EiIuOkJGQj4yJhYB8d3Nwbm1tbnBzdnt/g4eLjo+QkI6MiYWAfHh0cW9tbW5wc3Z6f4OHio2PkI+OjIiFgXx4dHFvbm5ucHN2en6Dh4qNjo+PjouIhYF9eXVycG5ub3Bzdnp+goaJjI6Pjo2LiIWBfXl1cnBvb29xc3Z6foKGiYyNjo6Ni4iFgX15dnNxb29wcXN2en6ChYiLjY6OjYuIhYF9enZzcXBvcHF0d3p+gYWIi4yNjYyKiIWBfnp3dHJwcHBydHd6fYGEiIqMjY2MioiFgX56d3RycXBxcnR3en2BhIeJi4yMi4qIhYJ+e3h1c3FxcXJ0d3p9gIOFiImKioqJh4WCfnt4dXNycXJzdXd6fYCDhYeJioqJiIeEgn98eXd1c3Jyc3V3en2Ag4WHiImJiYiGhIJ/fHp4dnV0dHV2eHp9f4KEhoiJiYmIhoSCf3x6eHZ1dHR1dnh6fH+BhIaHiIiIh4aEgn99e3h3dnV1dXd4enx/gYOFh4iIiIeGhIJ/fXt5d3Z1dXZ3eHp8f4GDhYaHiIeHhYSCgH17eXh2dnZ2d3l6fH+Bg4SGh4eHhoWDgoB9e3p4d3Z2d3h5enx+gIKEhYaHhoaFg4KAfnx6eXd3d3d4eXt8foCChIWGhoaFhIOBgH58enl4d3d3eHl7fH6AgoOEhYaGhYSDgYB+fHt5eHh4eHl6e3x+gIGDhIWFhYWEg4GAfnx7enl4eHh5ent9foCBgoOEhYWEg4KBgH59e3p5eXl5eXp7fX5/gYKDhISEhIOCgYB+fXx7enl5eXp6fH1+f4GCg4OEhIODgoGAfn18e3p6enp6e3x9fn+AgYKDg4ODgoKBgH59fHt7enp6e3t8fX5/gIGBgoKCgoGAf39+fXx8fHt7e3x8fX5/f4CBgYGBgYCAf35+fXx8fHx8fH1+fn9/gICAgICAgH9/fn5+fX19fX19fn5/f39/gIB/f39/fn5+fn5+fn5+fn9/f39/f39/f39+fn5+fn5+fn5+f39/f39/f39/f35+fn5+fn5+fn4=';

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
