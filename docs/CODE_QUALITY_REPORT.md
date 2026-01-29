# Code Quality Report - FWV Raura Homepage

**Erstellt:** 2026-01-29
**Analysiert von:** Claude Code

---

## Inhaltsverzeichnis

1. [Projekt-Übersicht](#1-projekt-übersicht)
2. [Sicherheitsprobleme](#2-sicherheitsprobleme)
3. [Code-Duplikation](#3-code-duplikation)
4. [Hardcoded Values](#4-hardcoded-values)
5. [Error-Handling](#5-error-handling)
6. [TypeScript Issues](#6-typescript-issues)
7. [Inkonsistenzen](#7-inkonsistenzen)
8. [Empfohlene Massnahmen](#8-empfohlene-massnahmen)

---

## 1. Projekt-Übersicht

### Architektur

```
Homepage/
├── docker/                    # Haupt-Backend-Services
│   ├── backend-members/       # Mitgliederverwaltung (Node.js/JS)
│   ├── backend-events/        # Veranstaltungen (Node.js/JS)
│   ├── backend-dispatch/      # Versand/Email (Node.js/JS)
│   ├── backend-accounting/    # Buchhaltung (Node.js/JS)
│   ├── frontend-website/      # Statische Website (HTML/JS)
│   ├── shared/                # Gemeinsame Middleware
│   └── postgres/              # Datenbank-Init
├── simple-order-system/       # Bestellsystem (TypeScript)
│   ├── backend/
│   ├── frontend/
│   └── kitchen-display/
├── simple-inventory-system/   # Inventar (TypeScript)
│   ├── backend/
│   └── frontend/
└── api/                       # Legacy API (Node.js/JS + SQLite)
```

### Technologie-Stack

| Komponente | Sprache | Framework | Datenbank |
|------------|---------|-----------|-----------|
| docker/backend-* | JavaScript | Express | PostgreSQL |
| simple-order-system | TypeScript | Express | PostgreSQL |
| simple-inventory-system | TypeScript | Express | PostgreSQL |
| api/ (Legacy) | JavaScript | Express | SQLite |
| Frontends | TypeScript | React/Vite | - |

---

## 2. Sicherheitsprobleme

### 2.1 Hardcoded Secrets (KRITISCH)

#### Default JWT Secrets

| Datei | Zeile | Problem |
|-------|-------|---------|
| `simple-inventory-system/backend/src/auth.ts` | 15 | `JWT_SECRET \|\| 'local-inventory-system-secret'` |
| `simple-order-system/backend/src/auth.ts` | 16 | `JWT_SECRET \|\| 'local-order-system-secret'` |
| `docker/backend-dispatch/src/auth-middleware.js` | 114 | `JWT_SECRET \|\| 'fwv-raura-secret-key'` |
| `docker/backend-events/src/auth-middleware.js` | 115 | `JWT_SECRET \|\| 'fwv-raura-secret-key'` |
| `docker/backend-members/src/auth-middleware.js` | 119, 154 | `JWT_SECRET \|\| 'fwv-raura-secret-key'` |
| `docker/backend-members/src/index.js` | 224, 305 | `JWT_SECRET \|\| 'fwv-raura-secret-key'` |

#### Default Passwörter

| Datei | Zeile | Problem |
|-------|-------|---------|
| `simple-inventory-system/backend/src/auth.ts` | 14 | `ADMIN_PASSWORD \|\| 'fwv2026'` |
| `simple-order-system/backend/src/auth.ts` | 15 | `ADMIN_PASSWORD \|\| 'fwv2026'` |

**Empfehlung:** Alle Default-Werte entfernen und Fehler werfen wenn ENV fehlt:
```typescript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable required');
```

### 2.2 JWT Verification Fallback (KRITISCH)

**Datei:** `simple-order-system/backend/src/auth.ts:64-73`

```typescript
// PROBLEM: Fallback zu jwt.decode() ohne Verifikation!
try {
  // First try local verification...
} catch {
  // Falls alles fehlschlägt, Token ohne Verifikation decodieren
  const decoded = jwt.decode(token);  // <- Keine Signaturprüfung!
  if (decoded) {
    req.user = decoded;
    next();
  }
}
```

**Risiko:** Angreifer können beliebige JWT-Tokens erstellen.

**Fix:** Fallback komplett entfernen oder nur in explizitem Development-Mode.

### 2.3 API Keys in Query Parameters

**Dateien:** `api/src/routes/*.js`

**Problem:** API-Keys werden in URLs übergeben:
```
/api/endpoint?apiKey=secret123
```

**Risiko:** Keys erscheinen in:
- Server-Logs
- Browser-History
- Referrer-Headers

**Fix:** Nur Header-basierte API-Keys akzeptieren:
```javascript
const apiKey = req.headers['x-api-key'];
```

### 2.4 "Fail Open" IP Whitelist

**Datei:** `simple-order-system/backend/src/index.ts:1083`

```typescript
} catch (error) {
  console.error('IP whitelist check error:', error);
  next();  // <- Erlaubt Zugriff bei Fehler!
}
```

**Fix:** Bei Fehler Zugriff verweigern ("fail closed"):
```typescript
} catch (error) {
  console.error('IP whitelist check error:', error);
  return res.status(503).json({ error: 'Service temporarily unavailable' });
}
```

### 2.5 Hardcoded Telefonnummern

**Dateien:**
- `docker/frontend-website/scripts/config.js:24-42`
- `scripts/config.js:24-42`

```javascript
const boardMembers = [
  { role: 'Präsident', phone: '+41 61 813 03 16' },
  // ...
];
```

**Empfehlung:** Aus Datenbank laden oder als ENV-Variable.

---

## 3. Code-Duplikation

### 3.1 Auth-Middleware (90%+ identisch)

**5 Dateien mit fast identischem Code:**

| Datei | Zeilen |
|-------|--------|
| `docker/shared/auth-middleware.js` | 143 |
| `docker/backend-dispatch/src/auth-middleware.js` | 143 |
| `docker/backend-events/src/auth-middleware.js` | 144 |
| `docker/backend-members/src/auth-middleware.js` | 181 |
| (Plus TypeScript-Varianten in Order/Inventory) | ~200 |

**Identische Funktionen:**
- `requireRole()`
- `requireApiKey()`
- `authenticateToken()`
- JWKS-Client-Konfiguration

**Unterschiede nur in:**
- Zeile 14-18: JWKS Endpoint URLs
- Members hat zusätzlich `authenticateVorstand()`

**Lösung:** Alle auf `docker/shared/auth-middleware.js` verweisen:
```javascript
// In jedem Backend:
const { authenticateToken, requireRole } = require('../shared/auth-middleware');
```

### 3.2 PKCE OAuth Implementation (100% identisch)

**Dateien:**
- `simple-order-system/frontend/src/App.tsx:4-21`
- `simple-inventory-system/frontend/src/App.tsx:5-22`

```typescript
// Beide Dateien haben identischen Code:
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(digest));
}
```

**Lösung:** In gemeinsame Utility-Datei extrahieren.

### 3.3 WebSocket Broadcast (100% identisch)

**Dateien:**
- `simple-inventory-system/backend/src/index.ts:172-178`
- `simple-order-system/backend/src/index.ts:185-191`

```typescript
function broadcast(data: any) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(data));
    }
  });
}
```

### 3.4 Transaction Pattern (100% identisch)

**Beide TypeScript-Backends verwenden:**
```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // ... queries
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

**Lösung:** Wrapper-Funktion erstellen:
```typescript
async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### 3.5 OTP Generation (2 Implementierungen)

**Dateien:**
- `api/src/utils/otp.js` - In-Memory Storage
- `api/src/utils/otp-sqlite.js` - SQLite Storage

Beide existieren parallel, unklar welche wo verwendet wird.

---

## 4. Hardcoded Values

### 4.1 Magic Numbers - Timeouts

| Datei | Zeile | Wert | Bedeutung |
|-------|-------|------|-----------|
| `api/src/utils/otp.js` | 7 | `5 * 60 * 1000` | OTP Expiry (5 min) |
| `api/src/utils/otp-sqlite.js` | 76 | `10 * 60 * 1000` | Cleanup Interval |
| `api/src/server.js` | 27 | `15 * 60 * 1000` | Rate Limit Window |
| `api/src/utils/backup.js` | 59 | `24 * 60 * 60 * 1000` | Backup Max Age |
| `simple-order-system/kitchen-display/src/App.tsx` | 224 | `3000` | WebSocket Reconnect |
| `simple-order-system/kitchen-display/src/App.tsx` | 237 | `500` | Visual Flash Duration |
| `simple-order-system/kitchen-display/src/App.tsx` | 403 | `10 * 60 * 1000` | Urgent Order Threshold |
| `**/auth.ts` | ~21 | `600000` | JWKS Cache (10 min) |

**Empfehlung:** Konstanten-Datei erstellen:
```typescript
export const TIMEOUTS = {
  OTP_EXPIRY_MS: 5 * 60 * 1000,
  JWKS_CACHE_MS: 10 * 60 * 1000,
  WS_RECONNECT_MS: 3000,
  URGENT_ORDER_MS: 10 * 60 * 1000,
};
```

### 4.2 Magic Numbers - Frequenzen

| Datei | Zeile | Wert | Bedeutung |
|-------|-------|------|-----------|
| `kitchen-display/src/App.tsx` | 79 | `880` | Audio Freq 1 (Hz) |
| `kitchen-display/src/App.tsx` | 91 | `1100` | Audio Freq 2 (Hz) |
| `kitchen-display/src/App.tsx` | 103 | `1320` | Audio Freq 3 (Hz) |

### 4.3 Hardcoded URLs

| Datei | URL | Verwendung |
|-------|-----|------------|
| `docker/backend-members/src/index.js:941` | `http://api-dispatch:3000` | Dispatch API |
| `docker/backend-dispatch/src/index.js:712` | `http://localhost:${PORT}` | Self-Reference |
| `docker/backend-events/src/index.js:26` | `http://api-dispatch:3000` | Dispatch API |

**Alle sollten ENV-Variablen sein.**

### 4.4 Hardcoded Ports

| Datei | Port |
|-------|------|
| `simple-inventory-system/frontend/vite.config.ts` | 8082 |
| `simple-order-system/frontend/vite.config.ts` | 5173 |
| `simple-order-system/kitchen-display/vite.config.ts` | 5174 |

---

## 5. Error-Handling

### 5.1 Leere Catch-Blöcke

| Datei | Zeile | Code |
|-------|-------|------|
| `scripts/send-letter-via-pingen.js` | 165 | `} catch {` |
| `api/src/utils/otp.js` | 71-72 | `} catch (e) { // Ignore }` |
| `docker/backend-dispatch/src/auth-middleware.js` | 126 | `} catch (e) { // Not valid }` |
| `docker/backend-events/src/auth-middleware.js` | 126 | `} catch (e) { // Not valid }` |
| `docker/backend-members/src/auth-middleware.js` | 130 | `} catch (e) { // Not valid }` |

### 5.2 Inkonsistente Error-Responses

**Order System (gut):**
```javascript
res.status(403).json({
  error: 'Zugriff verweigert',
  message: 'Diese IP-Adresse ist nicht freigeschaltet...',
  ip: ip
});
```

**Inventory System (generisch):**
```javascript
res.status(500).json({ error: 'Database error' });
```

**Main API (gemischt):**
```javascript
res.status(400).json({ error: 'Fehlende Pflichtfelder' });
```

**Empfehlung:** Standard-Format einführen:
```typescript
interface ApiError {
  error: string;        // Machine-readable: 'INVALID_TOKEN'
  message: string;      // Human-readable: 'Token ungültig'
  status: number;       // HTTP Status: 401
  details?: any;        // Optional: zusätzliche Infos
}
```

### 5.3 Unhandled Promise Rejections

**Datei:** `simple-order-system/backend/src/auth.ts:205-218`

`optionalAuth()` hat potentielle unhandled rejection.

---

## 6. TypeScript Issues

### 6.1 `any` Types

| Datei | Zeile | Variable |
|-------|-------|----------|
| `simple-inventory-system/frontend/src/App.tsx` | 81 | `lookupResult: any` |
| `simple-inventory-system/frontend/src/App.tsx` | 82 | `prefillData: any` |
| `simple-order-system/frontend/src/App.tsx` | 73 | `historyData: any[]` |
| `simple-order-system/frontend/src/App.tsx` | 74 | `statsData: any` |
| `simple-order-system/frontend/src/App.tsx` | 78 | `installPrompt: any` |

### 6.2 Unsafe Type Assertions

| Datei | Zeile | Code |
|-------|-------|------|
| `simple-inventory-system/backend/src/auth.ts` | 66 | `jwt.decode(token) as any` |
| `simple-order-system/backend/src/auth.ts` | ~70 | `jwt.decode(token) as any` |

### 6.3 Möglicherweise ungenutzte Variablen

| Datei | Variable |
|-------|----------|
| `simple-order-system/frontend/src/App.tsx` | `historyData`, `statsData` |
| `simple-inventory-system/frontend/src/App.tsx` | `publicItemCode` |

---

## 7. Inkonsistenzen

### 7.1 Sprach-Mix in Messages

- Deutsch: `"E-Mail-Adresse ist erforderlich"`
- Englisch: `"Invalid token"`
- Mit Emoji: `"🔥 Feuerwehrverein Raura"`

### 7.2 Naming Conventions

| Inkonsistenz | Beispiele |
|--------------|-----------|
| ENV Variables | `DISPATCH_API` vs `DISPATCH_API_URL` |
| Timeout Constants | `OTP_EXPIRY` vs `OTP_EXPIRY_MINUTES` |
| Table Names | `order_items` vs `items` |

### 7.3 Module Systems

| System | Type |
|--------|------|
| docker/backend-* | CommonJS (`require`) |
| simple-order-system | ES Modules (`import`) |
| simple-inventory-system | ES Modules (`import`) |
| api/ | CommonJS (`require`) |

### 7.4 Datenbank-Strategien

| System | Datenbank |
|--------|-----------|
| docker/* | Shared PostgreSQL |
| simple-order-system | Separate PostgreSQL |
| simple-inventory-system | Separate PostgreSQL |
| api/ (Legacy) | SQLite |

---

## 8. Empfohlene Massnahmen

### Priorität KRITISCH

1. **Hardcoded Secrets entfernen**
   - Alle Default-JWT-Secrets entfernen
   - Fehler werfen wenn ENV fehlt
   - Betroffene Dateien: 8

2. **JWT-Fallback fixen**
   - `jwt.decode()` Fallback entfernen
   - Datei: `simple-order-system/backend/src/auth.ts`

### Priorität HOCH

3. **Auth-Middleware konsolidieren**
   - Single Source of Truth: `docker/shared/auth-middleware.js`
   - Alle 4 Backends darauf umstellen
   - Ersparnis: ~500 Zeilen duplizierter Code

4. **PKCE-Code extrahieren**
   - Gemeinsame Utility für beide Frontends
   - Ersparnis: ~40 Zeilen

### Priorität MITTEL

5. **Error-Handling standardisieren**
   - Leere Catch-Blöcke füllen
   - Einheitliches Error-Response-Format

6. **Konstanten extrahieren**
   - Timeouts in Konstanten-Datei
   - URLs als ENV-Variablen

### Priorität NIEDRIG

7. **TypeScript verbessern**
   - `any` Types durch konkrete Typen ersetzen
   - Ungenutzte Variablen entfernen

8. **Legacy API modernisieren**
   - SQLite → PostgreSQL Migration
   - CommonJS → ES Modules

---

## Anhang: Datei-Inventar

### Backend-Services

| Pfad | Zeilen | Sprache |
|------|--------|---------|
| `docker/backend-members/src/index.js` | ~3500 | JavaScript |
| `docker/backend-events/src/index.js` | ~800 | JavaScript |
| `docker/backend-dispatch/src/index.js` | ~900 | JavaScript |
| `docker/backend-accounting/src/index.js` | ~600 | JavaScript |
| `simple-order-system/backend/src/index.ts` | ~1300 | TypeScript |
| `simple-inventory-system/backend/src/index.ts` | ~1500 | TypeScript |
| `api/src/server.js` | ~200 | JavaScript |

### Frontend-Komponenten

| Pfad | Zeilen | Framework |
|------|--------|-----------|
| `docker/frontend-website/vorstand.html` | ~5700 | Vanilla JS |
| `docker/frontend-website/index.html` | ~1200 | Vanilla JS |
| `simple-order-system/frontend/src/App.tsx` | ~2000 | React |
| `simple-order-system/kitchen-display/src/App.tsx` | ~480 | React |
| `simple-inventory-system/frontend/src/App.tsx` | ~2500 | React |

---

*Dieser Report wurde automatisch generiert und sollte regelmässig aktualisiert werden.*
