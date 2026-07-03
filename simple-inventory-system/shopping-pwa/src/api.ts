// API-Client zum Inventar-Backend + Offline-Outbox fürs Abhaken.

export const API_URL = import.meta.env.VITE_API_URL || 'https://inventar.fwv-raura.ch/api'
export const WS_URL = import.meta.env.VITE_WS_URL || 'wss://inventar.fwv-raura.ch/ws'

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
}

export interface ShoppingList {
  event_slug: string
  items: ShoppingItem[]
  total_items: number
  total_to_buy: number
  total_purchased: number
  estimated_total_cost: number
  estimated_open_cost: number
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
