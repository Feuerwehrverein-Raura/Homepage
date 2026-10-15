// Tippt in Chrome auf Android (per adb forward tcp:9444) auf das erste Element zu einem CSS-Selektor.
// Aufruf: node --experimental-websocket chrome-tipp.mjs <url-teil> <selektor>
// Vorher: adb forward tcp:9444 localabstract:chrome_devtools_remote
const [, , urlTeil, selektor] = process.argv;
const ziele = await (await fetch('http://127.0.0.1:9444/json')).json();
const seite = ziele.find(t => t.type === 'page' && t.url.includes(urlTeil));
if (!seite) { console.log('Seite nicht gefunden'); process.exit(1); }
const ws = new WebSocket(seite.webSocketDebuggerUrl);
let n = 0; const offen = new Map();
const cdp = (method, params = {}) => new Promise(r => { const id = ++n; offen.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && offen.has(m.id)) { offen.get(m.id)(m); offen.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const r = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => { const el = document.querySelector(${JSON.stringify(selektor)}); if (!el) return null; el.scrollIntoView({block:'center', behavior:'instant'}); return true; })()` });
await new Promise(r => setTimeout(r, 1500));
const r2 = await cdp('Runtime.evaluate', { returnByValue: true, expression: `(() => { const b = document.querySelector(${JSON.stringify(selektor)}).getBoundingClientRect(); return {x: b.left + b.width/2, y: b.top + b.height/2, h: innerHeight}; })()` });
Object.assign(r.result.result, { value: r.result.result.value && r2.result.result.value });
const p = r.result.result.value; console.log(JSON.stringify(p));
if (!p) process.exit(1);
await new Promise(r => setTimeout(r, 700));
for (const type of ['touchStart', 'touchEnd'])
  await cdp('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y }] });
console.log('getippt'); ws.close();
