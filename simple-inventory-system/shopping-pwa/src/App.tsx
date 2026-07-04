import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import {
  getStoredToken, userFromToken, login, logout, handleCallback, clearToken, type User,
} from './auth'
import { BrowserMultiFormatReader } from '@zxing/browser'
import {
  getEvents, getShoppingList, setPurchased, patchItem, flushOutbox, outboxCount, AuthError, WS_URL,
  getReceipts, uploadReceipt, deleteReceipt, restock, lookupBarcode, MEDIA_ORIGIN,
  setShareToken, createShare, getMeta, putMeta, getVapidKey, subscribePush,
  type EventSummary, type ShoppingItem, type ShoppingList, type Receipt, type EventMeta,
} from './api'
import { InstallPrompt } from './InstallPrompt';

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

const shortName = (email: string) =>
  email.split('@')[0].split(/[._]/).filter(Boolean).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') || email

// VAPID-Public-Key (base64url) -> Uint8Array für PushManager.subscribe
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

const daysUntil = (dateStr: string | null): number | null => {
  if (!dateStr) return null
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

const deadlineLabel = (dateStr: string): string => {
  const d = daysUntil(dateStr)
  const date = new Date(dateStr).toLocaleDateString('de-CH')
  if (d === null) return date
  if (d < 0) return `${date} (vorbei)`
  if (d === 0) return `${date} (heute)`
  if (d === 1) return `${date} (morgen)`
  return `${date} (in ${d} Tg.)`
}

// ---- App ------------------------------------------------------------------
export default function App() {
  const [token, setToken] = useState<string | null>(getStoredToken())
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(outboxCount())
  // Teilen-Modus: geöffnet über ?share=<token>&event=<slug> — ohne Login.
  const [share] = useState<{ slug: string } | null>(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('share'); const e = p.get('event')
    if (s && e) { setShareToken(s); return { slug: e } }
    return null
  })
  const [shareError, setShareError] = useState(false)

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

  // Teilen-Modus geht vor dem Login-Gate: geteilte Liste direkt anzeigen.
  if (share) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <Header user={{ name: 'Geteilte Liste', email: '', groups: [] }} title={prettySlug(share.slug)}
          online={online} pending={0} guest />
        {!online && <OfflineBanner pending={0} />}
        <main className="max-w-2xl mx-auto p-4 pb-24">
          {shareError
            ? <p className="text-red-600 py-10 text-center">Link ungültig oder abgelaufen.</p>
            : <ListView slug={share.slug} token="" userEmail="" guest
                onAuthError={() => setShareError(true)} onPendingChange={setPending} />}
        </main>
      </div>
    )
  }

  if (authLoading) return <Splash text="Anmeldung läuft…" />
  if (!token || !user) return <LoginScreen />

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <InstallPrompt appName="Einkauf" />
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
            userEmail={user.email}
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

function Header({ user, title, online, pending, onBack, guest }: {
  user: User; title: string; online: boolean; pending: number; onBack?: () => void; guest?: boolean
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
        {guest
          ? <span className="text-xs bg-white/20 rounded-full px-2 py-0.5">🔗 geteilt</span>
          : <button onClick={() => logout()} className="text-white/80 text-sm" title={user.email}>Abmelden</button>}
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
              {e.deadline && (
                <span className={`inline-block mt-2 text-xs rounded-full px-2 py-0.5 ${(daysUntil(e.deadline) ?? 99) <= 2 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                  ⏰ {deadlineLabel(e.deadline)}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ---- Einkaufsliste eines Events ------------------------------------------
function ListView({ slug, token, userEmail, guest, onAuthError, onPendingChange }: {
  slug: string; token: string; userEmail: string; guest?: boolean
  onAuthError: () => void; onPendingChange: (n: number) => void
}) {
  const [list, setList] = useState<ShoppingList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showStocked, setShowStocked] = useState(false)
  const [detail, setDetail] = useState<ShoppingItem | null>(null)
  const [showReceipts, setShowReceipts] = useState(false)
  const [receiptsVersion, setReceiptsVersion] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [restockBusy, setRestockBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [meta, setMeta] = useState<EventMeta | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => { getMeta(slug, token).then(setMeta).catch(() => {}) }, [slug, token])

  const load = useCallback(async () => {
    try {
      setList(await getShoppingList(slug, token))
    } catch (e) {
      if (e instanceof AuthError) onAuthError()
      else setError('Einkaufsliste konnte nicht geladen werden.')
    }
  }, [slug, token, onAuthError])

  useEffect(() => { load() }, [load])

  // Live-Sync: Backend broadcastet shopping_status_updated / stock_updated / receipt_updated
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
          if ((msg.type === 'shopping_status_updated' && msg.event_slug === slug) || msg.type === 'stock_updated') load()
          if (msg.type === 'receipt_updated' && msg.event_slug === slug) setReceiptsVersion((v) => v + 1)
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

  // Toast automatisch ausblenden
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const doRestock = async () => {
    setRestockBusy(true)
    try {
      const r = await restock(slug, token)
      setToast(r.restocked > 0 ? `${r.restocked} Positionen ins Lager gebucht ✓` : 'Nichts einzubuchen')
      await load()
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return }
      setToast('Einbuchen fehlgeschlagen')
    } finally { setRestockBusy(false) }
  }

  const shareLink = async () => {
    try {
      const r = await createShare(slug, token)
      const url = `${window.location.origin}/?share=${r.token}&event=${encodeURIComponent(slug)}`
      if (navigator.share) await navigator.share({ title: `Einkauf ${prettySlug(slug)}`, url })
      else { await navigator.clipboard.writeText(url); setToast('Link kopiert') }
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return }
      if ((e as any)?.name !== 'AbortError') setToast('Teilen fehlgeschlagen')
    }
  }

  const enablePush = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setToast('Push nicht unterstützt'); return }
      const key = await getVapidKey(token)
      if (!key) { setToast('Push (noch) nicht konfiguriert'); return }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setToast('Benachrichtigungen abgelehnt'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as unknown as BufferSource })
      await subscribePush(sub.toJSON(), token)
      setToast('Erinnerungen aktiviert 🔔')
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return }
      setToast('Push fehlgeschlagen')
    }
  }

  const changeDeadline = async (value: string) => {
    setMeta((m) => ({ deadline: value || null, budget: m?.budget ?? null }))
    try { await putMeta(slug, { deadline: value || null }, token) }
    catch (e) { if (e instanceof AuthError) onAuthError() }
  }

  if (error) return <p className="text-red-600 py-8 text-center">{error}</p>
  if (!list) return <p className="text-gray-400 py-8 text-center">Lädt…</p>

  const toBuy = list.items.filter((i) => i.to_buy > 0)
  const stocked = list.items.filter((i) => i.to_buy <= 0)
  const restockable = list.items.filter((i) => i.purchased && !i.restocked).length
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
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>geschätzt gesamt {chf(list.estimated_total_cost)}</span>
          {list.actual_total_cost > 0 && <span>tatsächlich <strong className="text-gray-600">{chf(list.actual_total_cost)}</strong></span>}
        </div>
        {list.by_payer.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {list.by_payer.map((p) => (
              <span key={p.email} className="text-xs bg-cart-50 text-cart-700 rounded-full px-2 py-1">
                {shortName(p.email)}: {chf(p.amount)}
              </span>
            ))}
          </div>
        )}
        {meta?.deadline && (
          <div className={`text-xs mt-2 ${(daysUntil(meta.deadline) ?? 99) <= 2 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            ⏰ Deadline {deadlineLabel(meta.deadline)}
          </div>
        )}
      </div>

      {!guest && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={shareLink} className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 active:bg-gray-50">🔗 Teilen</button>
          <button onClick={enablePush} className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 active:bg-gray-50">🔔 Erinnerung</button>
          <label className="text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-gray-500">Deadline</span>
            <input type="date" value={meta?.deadline ? meta.deadline.slice(0, 10) : ''}
              onChange={(e) => changeDeadline(e.target.value)} className="outline-none bg-transparent" />
          </label>
        </div>
      )}

      {restockable > 0 && (
        <button onClick={doRestock} disabled={restockBusy}
          className="w-full mb-4 bg-cart-100 text-cart-800 rounded-xl p-3 font-medium flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99]">
          📦 {restockBusy ? 'Bucht ein…' : `${restockable} gekaufte Positionen ins Lager einbuchen`}
        </button>
      )}

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
                <li key={i.item_id} className="flex items-stretch">
                  <button onClick={() => toggle(i)} aria-label="Abhaken" className="pl-3 pr-1 flex items-center active:bg-gray-50">
                    <span className={`w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm
                      ${i.purchased ? 'bg-cart-600 border-cart-600 text-white' : 'border-gray-300'}`}>
                      {i.purchased ? '✓' : ''}
                    </span>
                  </button>
                  <button onClick={() => setDetail(i)} className="flex-1 min-w-0 flex items-center gap-3 py-3 pr-3 text-left active:bg-gray-50">
                    <span className="flex-1 min-w-0">
                      <span className={`font-medium ${i.purchased ? 'line-through text-gray-400' : ''}`}>{i.item_name}</span>
                      {(i.note || i.paid_by) && (
                        <span className="block text-xs text-gray-400 truncate">
                          {i.paid_by ? `bezahlt: ${shortName(i.paid_by)}` : ''}{i.paid_by && i.note ? ' · ' : ''}{i.note || ''}
                        </span>
                      )}
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className={`font-semibold ${i.purchased ? 'text-gray-300' : 'text-gray-700'}`}>
                        {qty(i.to_buy)} {i.unit}
                      </span>
                      <span className="block text-xs text-gray-400">
                        {i.actual_price != null ? chf(i.actual_price) : (i.estimated_cost > 0 ? `~${chf(i.estimated_cost)}` : '')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {/* Belege */}
      <div className="mt-2 mb-4">
        <button onClick={() => setShowReceipts((s) => !s)} className="text-sm text-cart-700 font-medium">
          🧾 Belege {showReceipts ? 'ausblenden' : 'anzeigen'}
        </button>
        {showReceipts && (
          <ReceiptsPanel
            slug={slug} token={token} userEmail={userEmail} version={receiptsVersion}
            onAuthError={onAuthError} onChange={() => setReceiptsVersion((v) => v + 1)}
          />
        )}
      </div>

      {stocked.length > 0 && (
        <div className="mt-2">
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

      {detail && (
        <DetailSheet
          item={detail} slug={slug} token={token} userEmail={userEmail}
          onClose={() => setDetail(null)}
          onSaved={() => { setDetail(null); load() }}
          onAuthError={onAuthError}
        />
      )}

      {/* Barcode-Scan (Artikel in der Liste finden) */}
      <button onClick={() => setScanning(true)} aria-label="Barcode scannen"
        className="fixed bottom-5 right-5 z-20 bg-cart-600 text-white shadow-lg rounded-full px-5 py-3 font-medium flex items-center gap-2 active:scale-95">
        📷 Scan
      </button>
      {scanning && (
        <Scanner
          token={token}
          onFound={(id) => {
            setScanning(false)
            const it = list.items.find((i) => i.item_id === id)
            if (it) setDetail(it); else setToast('Artikel nicht in dieser Liste')
          }}
          onClose={() => setScanning(false)}
        />
      )}
      {toast && (
        <div className="fixed bottom-24 inset-x-0 z-30 flex justify-center px-4 pointer-events-none">
          <span className="bg-gray-900 text-white text-sm rounded-full px-4 py-2 shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  )
}

// ---- Barcode-Scanner (zxing) ---------------------------------------------
function Scanner({ token, onFound, onClose }: {
  token: string; onFound: (itemId: number) => void; onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const foundRef = useRef(onFound)
  foundRef.current = onFound
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const reader = new BrowserMultiFormatReader()
    const stop = () => {
      const v = videoRef.current
      if (v && v.srcObject) {
        (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
        v.srcObject = null
      }
    }
    ;(async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (devices.length === 0) { setMsg('Keine Kamera gefunden'); return }
        const back = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1]
        await reader.decodeFromVideoDevice(back.deviceId, videoRef.current!, async (result) => {
          if (cancelled || !result) return
          cancelled = true
          const code = result.getText()
          stop()
          try {
            const item = await lookupBarcode(code, token)
            if (item) foundRef.current(item.id)
            else setMsg(`Kein Artikel für „${code}"`)
          } catch { setMsg('Suche fehlgeschlagen') }
        })
      } catch {
        setMsg('Kamera nicht verfügbar')
      }
    })()
    return () => { cancelled = true; stop() }
  }, [token])

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      <div className="flex justify-between items-center p-4 text-white safe-area-inset-top">
        <span className="font-medium">Barcode scannen</span>
        <button onClick={onClose} className="text-3xl leading-none" aria-label="Schliessen">×</button>
      </div>
      <div className="flex-1 relative">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 h-28 border-2 border-white/70 rounded-xl" />
      </div>
      {msg && (
        <div className="bg-white text-center text-sm py-3 text-gray-700">
          {msg} · <button onClick={onClose} className="text-cart-700 font-medium">Schliessen</button>
        </div>
      )}
    </div>
  )
}

// ---- Detail-Sheet (Ist-Preis / Zahler / Notiz einer Position) -------------
function DetailSheet({ item, slug, token, userEmail, onClose, onSaved, onAuthError }: {
  item: ShoppingItem; slug: string; token: string; userEmail: string
  onClose: () => void; onSaved: () => void; onAuthError: () => void
}) {
  const [purchased, setPurchasedState] = useState(item.purchased)
  const [price, setPrice] = useState(item.actual_price != null ? String(item.actual_price) : '')
  const [paidBy, setPaidBy] = useState(item.paid_by || '')
  const [note, setNote] = useState(item.note || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await patchItem(slug, item.item_id, {
        purchased,
        actual_price: price === '' ? null : Number(price),
        paid_by: paidBy || null,
        note: note || null,
      }, token)
      onSaved()
    } catch (e) {
      if (e instanceof AuthError) { onAuthError(); return }
      setErr('Speichern fehlgeschlagen.')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-t-2xl p-5 pb-8 safe-area-inset-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-lg truncate">{item.item_name}</h3>
          <button onClick={onClose} className="text-gray-400 text-3xl leading-none -mt-1" aria-label="Schliessen">×</button>
        </div>
        <p className="text-sm text-gray-500 mb-3">Benötigt: {qty(item.to_buy)} {item.unit} · geschätzt {chf(item.estimated_cost)}</p>

        <label className="flex items-center gap-3 py-3 border-t border-gray-100">
          <input type="checkbox" checked={purchased} onChange={(e) => setPurchasedState(e.target.checked)} className="w-5 h-5 accent-cart-600" />
          <span className="font-medium">Gekauft</span>
        </label>

        <div className="grid grid-cols-2 gap-3 py-1">
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Bezahlt (CHF)</span>
            <input type="number" inputMode="decimal" step="0.05" value={price} onChange={(e) => setPrice(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2" placeholder="0.00" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-500 mb-1">Wer hat ausgelegt</span>
            <div className="flex gap-1">
              <input value={paidBy} onChange={(e) => setPaidBy(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 min-w-0" placeholder="Name/E-Mail" />
              <button type="button" onClick={() => setPaidBy(userEmail)} className="text-xs text-cart-700 px-2 whitespace-nowrap">ich</button>
            </div>
          </label>
        </div>

        <label className="text-sm block py-2">
          <span className="block text-gray-500 mb-1">Notiz</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2" placeholder="z.B. Marke, Ersatzprodukt…" />
        </label>

        {err && <p className="text-red-600 text-sm py-1">{err}</p>}
        <button onClick={save} disabled={busy}
          className="w-full bg-cart-600 text-white font-semibold py-3 rounded-xl mt-3 disabled:opacity-50 active:scale-[0.99]">
          {busy ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </div>
  )
}

// ---- Belege-Panel (Kassenzettel-Fotos) ------------------------------------
function ReceiptsPanel({ slug, token, userEmail, version, onAuthError, onChange }: {
  slug: string; token: string; userEmail: string; version: number; onAuthError: () => void; onChange: () => void
}) {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try { setReceipts(await getReceipts(slug, token)) }
    catch (e) { if (e instanceof AuthError) onAuthError() }
  }, [slug, token, onAuthError])
  useEffect(() => { load() }, [load, version])

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      await uploadReceipt(slug, file, amount, userEmail, '', token)
      setAmount(''); if (fileRef.current) fileRef.current.value = ''
      onChange(); await load()
    } catch (err) {
      if (err instanceof AuthError) onAuthError()
    } finally { setBusy(false) }
  }

  const remove = async (id: number) => {
    try { await deleteReceipt(slug, id, token); onChange(); await load() }
    catch (e) { if (e instanceof AuthError) onAuthError() }
  }

  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex gap-2 items-end mb-3">
        <label className="text-sm flex-1">
          <span className="block text-gray-500 mb-1">Betrag (CHF)</span>
          <input type="number" inputMode="decimal" step="0.05" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2" placeholder="optional" />
        </label>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="bg-cart-600 text-white font-medium px-4 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">
          {busy ? '…' : '📷 Beleg'}
        </button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
      </div>
      {!receipts ? <p className="text-sm text-gray-400">Lädt…</p>
        : receipts.length === 0 ? <p className="text-sm text-gray-400">Noch keine Belege.</p>
        : (
          <ul className="grid grid-cols-3 gap-2">
            {receipts.map((r) => (
              <li key={r.id} className="relative">
                <a href={`${MEDIA_ORIGIN}${r.image_url}`} target="_blank" rel="noreferrer">
                  <img src={`${MEDIA_ORIGIN}${r.image_url}`} alt="Beleg" className="w-full h-24 object-cover rounded-lg border border-gray-100" />
                </a>
                {r.amount != null && <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 text-white rounded px-1">{chf(r.amount)}</span>}
                <button onClick={() => remove(r.id)} aria-label="Beleg löschen"
                  className="absolute top-1 right-1 bg-white/90 rounded-full w-6 h-6 text-gray-600 text-sm shadow">×</button>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}
