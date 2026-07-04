// PKCE-OIDC gegen die bestehende Authentik-App "inventory-system".
// Dasselbe Muster wie das Inventar-Frontend -> das access_token gilt am Inventar-Backend.

const AUTHENTIK_URL = import.meta.env.VITE_AUTHENTIK_URL || 'https://auth.fwv-raura.ch'
const CLIENT_ID = import.meta.env.VITE_AUTHENTIK_CLIENT_ID || 'inventory-system'
const REDIRECT_URI = window.location.origin + '/auth/callback'
const TOKEN_KEY = 'einkauf_token'

export interface User {
  name: string
  email: string
  groups: string[]
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(new Uint8Array(digest))
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** Liest Claims aus dem JWT; null wenn abgelaufen/ungültig. */
export function userFromToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    const name = payload.name
      || (payload.given_name && payload.family_name ? `${payload.given_name} ${payload.family_name}` : null)
      || payload.given_name
      || payload.preferred_username
      || 'Mitglied'
    return { name, email: payload.email || '', groups: payload.groups || [] }
  } catch {
    return null
  }
}

/** Startet den Login-Redirect zu Authentik (PKCE). */
export async function login(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  sessionStorage.setItem('einkauf_code_verifier', verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  window.location.href = `${AUTHENTIK_URL}/application/o/authorize/?${params}`
}

/** Tauscht den Authorization-Code gegen ein access_token; speichert es. */
export async function handleCallback(code: string): Promise<string | null> {
  const verifier = sessionStorage.getItem('einkauf_code_verifier')
  if (!verifier) return null
  const res = await fetch(`${AUTHENTIK_URL}/application/o/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })
  sessionStorage.removeItem('einkauf_code_verifier')
  if (!res.ok) return null
  const data = await res.json()
  const token: string = data.access_token
  localStorage.setItem(TOKEN_KEY, token)
  return token
}

export function logout(): void {
  clearToken()
  window.location.href = `${AUTHENTIK_URL}/application/o/inventory-system/end-session/`
}
