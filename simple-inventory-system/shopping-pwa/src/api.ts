// API-Client zum Inventar-Backend + Offline-Outbox fürs Abhaken.

export const API_URL = import.meta.env.VITE_API_URL || 'https://inventar.fwv-raura.ch/api'
export const WS_URL = import.meta.env.VITE_WS_URL || 'wss://inventar.fwv-raura.ch/ws'
// Basis für Bild-URLs (Belege): API_URL ohne "/api" -> Origin des Inventar-Backends.
export const MEDIA_ORIGIN = API_URL.replace(/\/api\/?$/, '')

export interface EventSummary {
  slug: string
  recipe_count: number
  item_count: number
  purchased_count: number
  updated_at: string | null
}

export interface ShoppingItem {
  item_id: number
  item_name: string
  unit: string
  needed: number
  in_stock: number
  to_buy: number
  purchase_price: number
  supplier: string | null
  estimated_cost: number
  purchased: boolean
  purchased_by: string | null
  purchased_at: string | null
  recommendation: string | null
  note: string | null
  actual_price: number | null
  actual_quantity: number | null
  paid_by: string | null
  restocked: boolean
}

export interface Receipt {
  id: number
  image_url: string
  amount: number | null
  paid_by: string | null
  note: string | null
  uploaded_by: string | null
  created_at: string
}

export interface ShoppingList {
  event_slug: string
  items: ShoppingItem[]
  total_items: number
  total_to_buy: number
  total_purchased: number
  estimated_total_cost: number
  estimated_open_cost: number
  actual_total_cost: number
  by_payer: { email: string; amount: number }[]
}

function authHeaders(token: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
}

export class AuthError extends Error {}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) throw new AuthError('Nicht angemeldet')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function getEvents(token: string): Promise<EventSummary[]> {
  const res = await fetch(`${API_URL}/events`, { headers: authHeaders(token) })
  return handle<EventSummary[]>(res)
}

export async function getShoppingList(slug: string, token: string): Promise<ShoppingList> {
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/shopping-list`, {
    headers: authHeaders(token),
  })
  return handle<ShoppingList>(res)
}

// ---- Offline-Outbox -------------------------------------------------------
// Abhaken funktioniert offline: die Änderung wird lokal gemerkt und beim
// nächsten Online-Moment nachgesendet.

interface OutboxOp {
  slug: string
  itemId: number
  purchased: boolean
  ts: number
}

const OUTBOX_KEY = 'einkauf_outbox'

function readOutbox(): OutboxOp[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') } catch { return [] }
}
function writeOutbox(ops: OutboxOp[]): void {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops))
}
export function outboxCount(): number {
  return readOutbox().length
}

function enqueue(op: OutboxOp): void {
  const ops = readOutbox().filter((o) => !(o.slug === op.slug && o.itemId === op.itemId))
  ops.push(op)
  writeOutbox(ops)
}

async function sendPatch(slug: string, itemId: number, purchased: boolean, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/shopping-list/${itemId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ purchased }),
  })
  if (res.status === 401 || res.status === 403) throw new AuthError('Nicht angemeldet')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/**
 * Abhaken/Enthaken einer Position. Bei Netzfehler wird die Änderung in die
 * Outbox gelegt und später via flushOutbox() nachgesendet.
 * Rückgabe: true = sofort gesendet, false = offline gemerkt.
 */
export async function setPurchased(
  slug: string, itemId: number, purchased: boolean, token: string
): Promise<boolean> {
  try {
    await sendPatch(slug, itemId, purchased, token)
    return true
  } catch (e) {
    if (e instanceof AuthError) throw e
    enqueue({ slug, itemId, purchased, ts: Date.now() })
    return false
  }
}

/** Sendet alle gemerkten Offline-Änderungen nach. Gibt Anzahl gesendeter Ops zurück. */
export async function flushOutbox(token: string): Promise<number> {
  let ops = readOutbox()
  if (ops.length === 0) return 0
  let sent = 0
  for (const op of ops) {
    try {
      await sendPatch(op.slug, op.itemId, op.purchased, token)
      sent++
    } catch (e) {
      if (e instanceof AuthError) throw e
      break // weiter offline -> Rest bleibt in der Outbox
    }
  }
  ops = readOutbox().slice(sent)
  writeOutbox(ops)
  return sent
}

// ---- Detail-Bearbeitung (Ist-Preis / Menge / Zahler / Notiz) --------------
// Online-Aktion (kein Outbox-Queueing — Detaildaten werden bewusst online erfasst).
export async function patchItem(
  slug: string, itemId: number,
  body: Partial<{ purchased: boolean; actual_price: number | null; actual_quantity: number | null; paid_by: string | null; note: string | null }>,
  token: string
): Promise<void> {
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/shopping-list/${itemId}`, {
    method: 'PATCH', headers: authHeaders(token), body: JSON.stringify(body),
  })
  if (res.status === 401 || res.status === 403) throw new AuthError('Nicht angemeldet')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ---- Belege ---------------------------------------------------------------
export async function getReceipts(slug: string, token: string): Promise<Receipt[]> {
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/receipts`, { headers: authHeaders(token) })
  return handle<Receipt[]>(res)
}

export async function uploadReceipt(
  slug: string, file: File, amount: string, paidBy: string, note: string, token: string
): Promise<Receipt> {
  const fd = new FormData()
  fd.append('image', file)
  if (amount) fd.append('amount', amount)
  if (paidBy) fd.append('paid_by', paidBy)
  if (note) fd.append('note', note)
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/receipts`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd,
  })
  return handle<Receipt>(res)
}

export async function deleteReceipt(slug: string, id: number, token: string): Promise<void> {
  const res = await fetch(`${API_URL}/events/${encodeURIComponent(slug)}/receipts/${id}`, {
    method: 'DELETE', headers: authHeaders(token),
  })
  if (res.status === 401 || res.status === 403) throw new AuthError('Nicht angemeldet')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
