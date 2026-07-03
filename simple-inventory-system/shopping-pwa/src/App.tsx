import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getStoredToken, userFromToken, login, logout, handleCallback, clearToken, type User,
} from './auth'
import {
  getEvents, getShoppingList, setPurchased, flushOutbox, outboxCount, AuthError, WS_URL,
  type EventSummary, type ShoppingItem, type ShoppingList,
} from './api'

// ---- Helpers --------------------------------------------------------------
const chf = (n: number) =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF' }).format(n || 0)

const prettySlug = (slug: string) =>
  slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

const qty = (n: number) => {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

const storeOf = (i: ShoppingItem) => i.recommendation || i.supplier || 'Ohne Laden-Zuordnung'

// ---- App ------------------------------------------------------------------
export default function App() {
  const [token, setToken] = useState<string | null>(getStoredToken())
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(outboxCount())

  // OIDC-Callback + Token-Validierung
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (code) {
      setAuthLoading(true)
      handleCallback(code).then((t) => {
        window.history.replaceState({}, '', '/')
        if (t) { setToken(t); setUser(userFromToken(t)) }
        setAuthLoading(false)
      })
      return
    }
    const stored = getStoredToken()
    if (stored) {
      const u = userFromToken(stored)
      if (u) { setUser(u) } else { clearToken(); setToken(null) }
    }
  }, [])

  const onAuthError = useCallback(() => {
    clearToken(); setToken(null); setUser(null)
  }, [])

  // Online/Offline: Outbox nachsenden
  useEffect(() => {
    const goOnline = async () => {
      setOnline(true)
      if (token) {
        try { await flushOutbox(token) } catch (e) { if (e instanceof AuthError) onAuthError() }
        setPending(outboxCount())
      }
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [token, onAuthError])

  if (authLoading) return <Splash text="Anmeldung läuft…" />
  if (!token || !user) return <LoginScreen />

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header
        user={user}
        online={online}
        pending={pending}
        onBack={slug ? () => setSlug(null) : undefined}
        title={slug ? prettySlug(slug) : 'Einkaufslisten'}
      />
      {!online && <OfflineBanner pending={pending} />}
      <main className="max-w-2xl mx-auto p-4 pb-24">
        {slug ? (
          <ListView
            slug={slug}
            token={token}
            onAuthError={onAuthError}
            onPendingChange={setPending}
          />
        ) : (
          <EventsView token={token} onAuthError={onAuthError} onOpen={setSlug} />
        )}
      </main>
    </div>
  )
}

// ---- Screens --------------------------------------------------------------
function Splash({ text }: { text: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">
      {text}
    </div>
  )
}

function LoginScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-cart-600 text-white p-6 text-center">
      <div className="text-6xl mb-4">🛒</div>
      <h1 className="text-2xl font-bold mb-1">Einkauf · FWV Raura</h1>
      <p className="text-cart-100 mb-8">Einkaufslisten für Vereins-Events</p>
      <button
        onClick={() => login()}
        className="bg-white text-cart-700 font-semibold px-8 py-3 rounded-xl shadow-lg active:scale-95 transition"
      >
        Mit FWV-Konto anmelden
      </button>
    </div>
  )
}

function Header({ user, title, online, pending, onBack }: {
  user: User; title: string; online: boolean; pending: number; onBack?: () => void
}) {
  return (
    <header className="sticky top-0 z-10 bg-cart-600 text-white shadow safe-area-inset-top">
      <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="text-white/90 text-2xl leading-none -ml-1" aria-label="Zurück">‹</button>
        )}
        <h1 className="font-semibold text-lg flex-1 truncate">{title}</h1>
        <span
          className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-cart-200' : 'bg-yellow-300'}`}
          title={online ? 'Online' : 'Offline'}
        />
        {pending > 0 && (
          <span className="text-xs bg-yellow-300 text-yellow-900 rounded-full px-2 py-0.5 font-medium">
            {pending} offen
          </span>
        )}
        <button onClick={() => logout()} className="text-white/80 text-sm" title={user.email}>Abmelden</button>
      </div>
    </header>
  )
}

function OfflineBanner({ pending }: { pending: number }) {
  return (
    <div className="bg-yellow-100 text-yellow-900 text-sm text-center py-1.5 px-4">
      Offline – Abhaken wird gemerkt{pending > 0 ? ` (${pending} noch nicht gesendet)` : ''} und später gesendet.
    </div>
  )
}

// ---- Events-Liste ---------------------------------------------------------
function EventsView({ token, onAuthError, onOpen }: {
  token: string; onAuthError: () => void; onOpen: (slug: string) => void
}) {
  const [events, setEvents] = useState<EventSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getEvents(token)
      .then(setEvents)
      .catch((e) => { if (e instanceof AuthError) onAuthError(); else setError('Konnte Events nicht laden.') })
  }, [token, onAuthError])

  if (error) return <p className="text-red-600 py-8 text-center">{error}</p>
  if (!events) return <p className="text-gray-400 py-8 text-center">Lädt…</p>
  if (events.length === 0) return <p className="text-gray-500 py-8 text-center">Noch keine Events mit Einkaufsliste.</p>

  return (
    <ul className="space-y-3">
      {events.map((e) => {
        const done = e.item_count > 0 && e.purchased_count >= e.item_count
        return (
          <li key={e.slug}>
            <button
              onClick={() => onOpen(e.slug)}
              className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 p-4 active:scale-[0.99] transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-lg">{prettySlug(e.slug)}</span>
                {done && <span className="text-cart-600 text-sm font-medium">✓ komplett</span>}
              </div>
              <div className="text-sm text-gray-500 mt-1">
                {e.recipe_count} Rezepte · {e.item_count} Zutaten
                {e.item_count > 0 && ` · ${e.purchased_count}/${e.item_count} gekauft`}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- Einkaufsliste eines Events ------------------------------------------
function ListView({ slug, token, onAuthError, onPendingChange }: {
  slug: string; token: string; onAuthError: () => void; onPendingChange: (n: number) => void
}) {
  const [list, setList] = useState<ShoppingList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showStocked, setShowStocked] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const load = useCallback(async () => {
    try {
      setList(await getShoppingList(slug, token))
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
      else setError('Einkaufsliste konnte nicht geladen werden.')
    }
  }, [slug, token, onAuthError])

  useEffect(() => { load() }, [load])

  // Live-Sync: Backend broadcastet shopping_status_updated / stock_updated
  useEffect(() => {
    let closed = false
    let reconnect: ReturnType<typeof setTimeout>
    const connect = () => {
      if (closed) return
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`)
      wsRef.current = ws
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data)
          if ((msg.type === 'shopping_status_updated' && msg.event_slug === slug) || msg.type === 'stock_updated') {
            load()
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => { if (!closed) reconnect = setTimeout(connect, 3000) }
      ws.onerror = () => ws.close()
    }
    connect()
    return () => { closed = true; clearTimeout(reconnect); wsRef.current?.close() }
  }, [slug, token, load])

  const toggle = async (item: ShoppingItem) => {
    if (!list) return
    const next = !item.purchased
    // Optimistisch
    setList({ ...list, items: list.items.map((i) => i.item_id === item.item_id ? { ...i, purchased: next } : i) })
    try {
      const sentNow = await setPurchased(slug, item.item_id, next, token)
      if (!sentNow) onPendingChange(outboxCount())
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return }
      // Rollback bei echtem Fehler
      setList((cur) => cur && { ...cur, items: cur.items.map((i) => i.item_id === item.item_id ? { ...i, purchased: item.purchased } : i) })
    }
  }

  if (error) return <p className="text-red-600 py-8 text-center">{error}</p>
  if (!list) return <p className="text-gray-400 py-8 text-center">Lädt…</p>

  const toBuy = list.items.filter((i) => i.to_buy > 0)
  const stocked = list.items.filter((i) => i.to_buy <= 0)
  const boughtCount = toBuy.filter((i) => i.purchased).length
  const progress = toBuy.length ? Math.round((boughtCount / toBuy.length) * 100) : 100

  // Gruppieren nach Laden
  const groups = new Map<string, ShoppingItem[]>()
  for (const i of toBuy) {
    const k = storeOf(i)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(i)
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))

  return (
    <div>
      {/* Fortschritt + Kosten */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>{boughtCount} / {toBuy.length} gekauft</span>
          <span>offen: <strong className="text-gray-900">{chf(list.estimated_open_cost)}</strong></span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-cart-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="text-xs text-gray-400 mt-2">geschätzt gesamt {chf(list.estimated_total_cost)}</div>
      </div>

      {toBuy.length === 0 && (
        <p className="text-gray-500 py-8 text-center">Alles im Lager – nichts einzukaufen. 🎉</p>
      )}

      {sortedGroups.map(([store, items]) => (
        <section key={store} className="mb-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 px-1">
            🏬 {store}
          </h2>
          <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {items
              .slice()
              .sort((a, b) => Number(a.purchased) - Number(b.purchased) || a.item_name.localeCompare(b.item_name, 'de'))
              .map((i) => (
                <li key={i.item_id}>
                  <button
                    onClick={() => toggle(i)}
                    className="w-full flex items-center gap-3 p-3 text-left active:bg-gray-50"
                  >
                    <span className={`w-6 h-6 flex-shrink-0 rounded-md border-2 flex items-center justify-center text-sm
                      ${i.purchased ? 'bg-cart-600 border-cart-600 text-white' : 'border-gray-300'}`}>
                      {i.purchased ? '✓' : ''}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`font-medium ${i.purchased ? 'line-through text-gray-400' : ''}`}>
                        {i.item_name}
                      </span>
                      {i.note && <span className="block text-xs text-gray-400 truncate">{i.note}</span>}
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className={`font-semibold ${i.purchased ? 'text-gray-300' : 'text-gray-700'}`}>
                        {qty(i.to_buy)} {i.unit}
                      </span>
                      {i.estimated_cost > 0 && (
                        <span className="block text-xs text-gray-400">{chf(i.estimated_cost)}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {stocked.length > 0 && (
        <div className="mt-4">
          <button
            onClick={() => setShowStocked((s) => !s)}
            className="text-sm text-gray-500 underline"
          >
            {showStocked ? 'Ausblenden' : `${stocked.length} Positionen genug im Lager anzeigen`}
          </button>
          {showStocked && (
            <ul className="mt-2 bg-white rounded-xl border border-gray-100 divide-y divide-gray-100 text-sm text-gray-500">
              {stocked.map((i) => (
                <li key={i.item_id} className="flex justify-between p-3">
                  <span>{i.item_name}</span>
                  <span>{qty(i.needed)} / {qty(i.in_stock)} {i.unit} im Lager</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
