'use strict';
/* Podcast — app pessoal de podcast (Tauri 2). Tudo local; sincroniza pelo Google Drive (appDataFolder). */

// ---------------------------------------------------------------- utilidades
const T = window.__TAURI__;
const inv = (c, a) => T.core.invoke(c, a);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TD = new TextDecoder();
const b64d = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const b64e = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function http(method, url, headers, body) {
  const bytes = body == null ? null : (typeof body === 'string' ? new TextEncoder().encode(body) : body);
  const r = await inv('http_req', { method, url, headers: headers || {}, body: bytes ? b64e(bytes) : null });
  return { status: r.status, text: TD.decode(b64d(r.body)), headers: r.headers || {} };
}
async function getText(url) { const r = await http('GET', url, { Accept: '*/*' }); if (r.status >= 400) throw new Error('erro ' + r.status); return r.text; }
async function getJSON(url) { return JSON.parse(await getText(url)); }
const now = () => Date.now();
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const rid = () => Math.random().toString(36).slice(2, 10);
const fmtT = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fmtD = s => { s = Math.round((s || 0) / 60); if (!s) return ''; const h = Math.floor(s / 60), m = s % 60; return h ? h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '') : m + ' min'; };
const fmtH = sec => { const m = Math.round(sec / 60); const h = Math.floor(m / 60); return h ? h + ' h ' + String(m % 60).padStart(2, '0') : m + ' min'; };
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtDate = ms => { if (!ms) return ''; const d = new Date(ms), t = new Date(); const diff = Math.floor((new Date(t.toDateString()) - new Date(d.toDateString())) / 864e5); if (diff === 0) return 'Hoje'; if (diff === 1) return 'Ontem'; return d.getDate() + ' ' + MES[d.getMonth()] + (d.getFullYear() !== t.getFullYear() ? ' ' + d.getFullYear() : ''); };
const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const COLORS = ['#4FB3BF', '#F2C14E', '#E07A5F', '#7BC47F', '#B48EE0', '#3D8BD9', '#E26D9A', '#D98E4A', '#A7B86A'];
const colorOf = s => COLORS[parseInt(hash(s || 'x'), 36) % COLORS.length];
const initials = s => (s || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const stripHtml = h => { const d = new DOMParser().parseFromString('<div>' + (h || '') + '</div>', 'text/html'); return (d.body.textContent || '').replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim(); };
let toastT;
function toast(m, ms) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2600); }
function modal(html) { $('#mbox').innerHTML = html; $('#modal').classList.add('show'); }
function closeModal() { $('#modal').classList.remove('show'); }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
async function copy(text) { try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; } }
const openUrl = url => inv('plugin:opener|open_url', { url }).catch(() => window.open(url, '_blank'));

// ---------------------------------------------------------------- ícones
const I = {
  play: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  search: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  plus: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>',
  down: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  dl: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7BC47F" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Baixado"><path d="m5 12 5 5L20 7"/></svg>',
  more: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  arch: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M6 7v12h12V7M10 11h4"/></svg>',
  snip: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
  dn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  r15: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  f30: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  prevc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg>',
  nextc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>',
  folder: c => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
  smart: c => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h10M4 12h7M4 18h10M17 9l2 2 3-4"/></svg>`,
  tab: {
    home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z"/></svg>',
    lib: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    disc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/></svg>',
    stats: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>',
    set: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>'
  }
};
const LOGO = s => `<svg width="${s}" height="${s}" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="23" fill="#14161B"/><circle cx="40" cy="50" r="21" fill="var(--acc)"/><path d="M35.5 41.5 L49 50 L35.5 58.5 Z" fill="#14161B" stroke="#14161B" stroke-width="2.5" stroke-linejoin="round"/><path d="M65.2 30.3 A32 32 0 0 1 65.2 69.7" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linecap="round"/><path d="M77.3 26.7 A44 44 0 0 1 77.3 73.3" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linecap="round" opacity="0.5"/></svg>`;

// ---------------------------------------------------------------- dados
const DEV = localStorage.getItem('pc:dev') || (() => { const d = 'd' + rid(); localStorage.setItem('pc:dev', d); return d; })();
const DEF = {
  subs: {}, eps: {}, prog: {}, inbox: [], queue: [], archived: {}, snips: [], snipGone: {}, gone: {}, stats: {}, cur: null,
  lists: { inboxT: 0, queueT: 0, smartT: 0, setT: 0 },
  smart: [
    { id: 's1', name: 'Curtos para o trajeto', max: 25, unplayed: true, dl: false, folder: '' },
    { id: 's2', name: 'Começados e esquecidos', started: true, days: 14 },
    { id: 's3', name: 'Novos da semana', unplayed: true, recent: 7 }
  ],
  set: { speed: 1, back: 15, fwd: 30, cont: true, resume5: true, inbox: true, archDays: 14, delPlayed: true, keep: 3, refreshStart: true, stats: true, accent: '#F5B544', country: 'br', tab: 'home' }
};
function load() {
  let j = null; try { j = JSON.parse(localStorage.getItem('pc:db') || 'null'); } catch (e) { }
  const d = JSON.parse(JSON.stringify(DEF));
  if (j) { Object.assign(d, j); d.set = Object.assign({}, DEF.set, j.set || {}); d.lists = Object.assign({}, DEF.lists, j.lists || {}); }
  return d;
}
let db = load();
let DL = (() => { try { return JSON.parse(localStorage.getItem('pc:dl') || '{}'); } catch (e) { return {}; } })(); // downloads deste aparelho
const saveDL = () => localStorage.setItem('pc:dl', JSON.stringify(DL));
let saveT;
function save(noSync) {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { localStorage.setItem('pc:db', JSON.stringify(db)); } catch (e) { toast('Sem espaço para salvar os dados'); } }, 300);
  if (!noSync) GD.schedule();
  if (NP) { clearTimeout(save.w); save.w = setTimeout(pushWidget, 2000); }
}
const touch = k => { db.lists[k] = now(); if (k === 'queueT' && NP && db.cur) { clearTimeout(touch.q); touch.q = setTimeout(syncNativeQueue, 300); } };
const sub = url => db.subs[url];
const ep = id => db.eps[id];
const subOf = id => { const e = ep(id); return e && sub(e.feed); };
const isDone = id => !!(db.prog[id] && db.prog[id].done);
const posOf = id => (db.prog[id] && !db.prog[id].done && db.prog[id].pos) || 0;
const fileName = e => e.id + ((e.url.split('?')[0].match(/\.(mp3|m4a|aac|ogg|opus|mp4|wav)$/i) || ['.mp3'])[0]).toLowerCase();

// ---------------------------------------------------------------- RSS
const kids = (el, name) => el ? Array.from(el.children).filter(c => c.nodeName === name) : [];
const kid = (el, name) => kids(el, name)[0];
const ktext = (el, name) => { const k = kid(el, name); return k ? k.textContent.trim() : ''; };
function parseDur(s) { if (!s) return 0; s = s.trim(); if (/^\d+$/.test(s)) return +s; const p = s.split(':').map(Number); return p.reduce((a, x) => a * 60 + (x || 0), 0); }
function parseFeed(xml) {
  const d = new DOMParser().parseFromString(xml, 'text/xml');
  const ch = d.getElementsByTagName('channel')[0];
  if (!ch || d.getElementsByTagName('parsererror').length) throw new Error('Esse endereço não é um feed de podcast válido');
  const img = (kid(ch, 'itunes:image') && kid(ch, 'itunes:image').getAttribute('href')) || ktext(kid(ch, 'image'), 'url');
  const cat = kid(ch, 'itunes:category');
  const podroll = kids(kid(ch, 'podcast:podroll'), 'podcast:remoteItem').map(r => r.getAttribute('feedUrl')).filter(Boolean);
  const items = kids(ch, 'item').map(it => {
    const enc = kid(it, 'enclosure');
    const trs = kids(it, 'podcast:transcript').map(t => ({ url: t.getAttribute('url'), type: (t.getAttribute('type') || '').toLowerCase() })).filter(t => t.url);
    const chp = kid(it, 'podcast:chapters');
    const desc = ktext(it, 'content:encoded') || ktext(it, 'description') || ktext(it, 'itunes:summary');
    const iimg = kid(it, 'itunes:image');
    return {
      title: ktext(it, 'title'), guid: ktext(it, 'guid'), url: enc ? enc.getAttribute('url') : '', type: enc ? enc.getAttribute('type') : '',
      date: Date.parse(ktext(it, 'pubDate')) || 0, dur: parseDur(ktext(it, 'itunes:duration')),
      desc: stripHtml(desc).slice(0, 1500), img: iimg ? iimg.getAttribute('href') : '', link: ktext(it, 'link'),
      chapters: chp ? chp.getAttribute('url') : '', transcripts: trs
    };
  }).filter(x => x.url);
  return {
    title: ktext(ch, 'title'), author: ktext(ch, 'itunes:author') || ktext(ch, 'managingEditor'), image: img,
    desc: stripHtml(ktext(ch, 'description') || ktext(ch, 'itunes:summary')).slice(0, 800), cat: cat ? cat.getAttribute('text') : '',
    link: ktext(ch, 'link'), podroll, items,
    self: ktext(ch, 'itunes:new-feed-url') || ((kids(ch, 'atom:link').find(l => l.getAttribute('rel') === 'self') || { getAttribute: () => '' }).getAttribute('href') || '')
  };
}
const epId = (feed, key) => hash(feed) + '-' + hash(key);
function mergeItems(url, f, s) {
  const ids = [];
  for (const it of f.items.slice(0, 200)) {
    const id = epId(url, it.guid || it.url);
    db.eps[id] = Object.assign(db.eps[id] || {}, it, { id, feed: url });
    ids.push(id);
  }
  ids.sort((a, b) => db.eps[b].date - db.eps[a].date);
  if (s) {
    const keep = new Set([...ids.slice(0, 200), ...db.queue, ...db.inbox, db.cur]);
    (s.eps || []).forEach(id => { if (!keep.has(id) && !db.prog[id]) delete db.eps[id]; });
    s.eps = ids;
  }
  return ids;
}
const PREV = {}; // prévias de podcasts que você ainda não segue
async function fetchFeed(url) { return parseFeed(await getText(url)); }
async function refreshFeed(url, initial) {
  const s = sub(url); if (!s || s.local) return 0;
  const f = await fetchFeed(url);
  Object.assign(s, { title: f.title || s.title, author: f.author || s.author, image: f.image || s.image, desc: f.desc, cat: s.cat || f.cat, podroll: f.podroll, link: f.link });
  const ids = mergeItems(url, f, s);
  const last = s.lastDate || 0;
  let n = 0;
  if (!initial) for (const id of ids) { if (db.eps[id].date > last && !db.archived[id] && !db.prog[id]) { route(id, s); n++; } }
  s.lastDate = Math.max(last, ...ids.map(id => db.eps[id].date), 0);
  s.fetched = now();
  return n;
}
function route(id, s) {
  const dest = s.ps && s.ps.dest || (db.set.inbox ? 'inbox' : 'queue');
  if (dest === 'inbox') { if (!db.inbox.includes(id)) { db.inbox.unshift(id); touch('inboxT'); } }
  else if (dest === 'queue') { if (!db.queue.includes(id)) { db.queue.push(id); touch('queueT'); } }
  if (s.ps && s.ps.autodl && dest !== 'archive') download(id, true);
}
let refreshing = false;
async function refreshAll(manual) {
  if (refreshing) return; refreshing = true; if (manual) toast('Atualizando feeds…');
  let n = 0, err = 0;
  const urls = Object.keys(db.subs);
  for (let i = 0; i < urls.length; i += 4) {
    const r = await Promise.allSettled(urls.slice(i, i + 4).map(u => refreshFeed(u)));
    r.forEach(x => { if (x.status === 'fulfilled') n += x.value; else err++; });
  }
  // arquiva da caixa de entrada o que passou do prazo
  if (db.set.archDays) { const lim = now() - db.set.archDays * 864e5; const before = db.inbox.length; db.inbox = db.inbox.filter(id => ep(id) && ep(id).date > lim); if (db.inbox.length !== before) touch('inboxT'); }
  refreshing = false; save(); render();
  if (manual || n) toast(n ? n + (n > 1 ? ' episódios novos' : ' episódio novo') : 'Tudo em dia' + (err ? ' · ' + err + ' feed(s) com erro' : ''));
}
async function subscribe(url, meta) {
  url = url.trim();
  if (sub(url)) { go('show', url); return; }
  toast('Seguindo…');
  try {
    const f = PREV[url] || await fetchFeed(url);
    db.subs[url] = Object.assign({ url, title: f.title, author: f.author, image: f.image, desc: f.desc, cat: f.cat, podroll: f.podroll, ps: {}, t: now(), seenAt: now(), folder: '' }, meta || {});
    mergeItems(url, f, db.subs[url]);
    db.subs[url].lastDate = Math.max(0, ...db.subs[url].eps.map(id => db.eps[id].date));
    const newest = db.subs[url].eps[0]; if (newest && !db.inbox.includes(newest)) { db.inbox.unshift(newest); touch('inboxT'); }
    delete db.gone[url]; delete PREV[url];
    save(); render(); toast('Seguindo ' + (f.title || 'podcast'));
  } catch (e) { toast('Não consegui seguir: ' + e.message, 4000); }
}
function unsubscribe(url) {
  const s = sub(url); if (!s) return;
  (s.eps || []).forEach(id => { if (DL[id]) delDownload(id, true); });
  db.inbox = db.inbox.filter(id => ep(id) && ep(id).feed !== url); db.queue = db.queue.filter(id => ep(id) && ep(id).feed !== url);
  touch('inboxT'); touch('queueT');
  db.gone[url] = now(); delete db.subs[url]; save(); go('lib'); toast('Você deixou de seguir');
}

// ---------------------------------------------------------------- downloads
const DLING = {};
async function download(id, quiet) {
  const e = ep(id); if (!e || DL[id] || DLING[id]) return;
  DLING[id] = true; if (!quiet) toast('Baixando…'); render();
  try { await inv('download_episode', { url: e.url, name: fileName(e) }); DL[id] = now(); saveDL(); if (!quiet) toast('Episódio baixado'); pruneDownloads(e.feed); }
  catch (err) { toast('Erro ao baixar: ' + err, 4000); }
  delete DLING[id]; render();
}
async function delDownload(id, quiet) { const e = ep(id); if (!e) { delete DL[id]; saveDL(); return; } try { await inv('delete_download', { name: fileName(e) }); } catch (x) { } delete DL[id]; saveDL(); if (!quiet) { toast('Download apagado'); render(); } }
function pruneDownloads(feed) {
  const keep = db.set.keep; if (!keep) return;
  const mine = Object.keys(DL).filter(id => ep(id) && ep(id).feed === feed && id !== db.cur && !db.queue.includes(id)).sort((a, b) => ep(b).date - ep(a).date);
  mine.slice(keep).forEach(id => delDownload(id, true));
}

// ---------------------------------------------------------------- player
// No Android, o áudio toca num player nativo (notificação, tela bloqueada, cápsula, fone e widgets).
const NP = (window.PodNative && typeof window.PodNative.available === 'function') ? window.PodNative : null;
class NativeAudio extends EventTarget {
  constructor() { super(); this.st = { id: '', pos: 0, dur: 0, playing: false, speed: 1 }; setInterval(() => this.poll(), 500); window.__podEvt = () => this.poll(); }
  poll() {
    let s; try { s = JSON.parse(NP.state() || '{}'); } catch (e) { return; }
    const was = this.st; this.st = Object.assign({ id: '', pos: 0, dur: 0, playing: false, speed: 1 }, s);
    let done = []; try { done = JSON.parse(NP.takeDone() || '[]'); } catch (e) { }
    done.forEach(onNativeDone);
    if (s.id && s.id !== db.cur && db.eps[s.id]) onNativeSwitch(s.id);
    if (!!s.playing !== !!was.playing) this.dispatchEvent(new Event(s.playing ? 'play' : 'pause'));
    if (s.dur && !was.dur) this.dispatchEvent(new Event('loadedmetadata'));
    if (s.playing || s.pos !== was.pos) this.dispatchEvent(new Event('timeupdate'));
    if (s.error && s.error !== was.error) this.dispatchEvent(new Event('error'));
    if (++this.n % 10 === 0 || !this.n) ingestListen();
  }
  get paused() { return !this.st.playing; }
  get currentTime() { return (this.st.pos || 0) / 1000; }
  set currentTime(v) { this.st.pos = v * 1000; NP.seekTo(v * 1000); }
  get duration() { return (this.st.dur || 0) / 1000; }
  get playbackRate() { return this.st.speed || 1; }
  set playbackRate(v) { this.st.speed = v; NP.setSpeed(v); }
  set defaultPlaybackRate(v) { }
  get src() { return this.st.id ? 'nativo' : ''; }
  set src(v) { }
  play() { NP.play(); this.st.playing = true; this.dispatchEvent(new Event('play')); return Promise.resolve(); }
  pause() { NP.pause(); this.st.playing = false; this.dispatchEvent(new Event('pause')); }
  removeAttribute() { NP.stop(); this.st = { id: '', pos: 0, dur: 0, playing: false, speed: 1 }; }
  load() { }
}
NativeAudio.prototype.n = 0;
const A = NP ? new NativeAudio() : $('#audio');
async function nativeItem(id) {
  const e = ep(id); let url = e.url;
  if (DL[id]) { try { const p = await inv('download_path', { name: fileName(e) }); if (p) url = 'file://' + p; } catch (x) { } }
  return { id, url, title: e.title, artist: feedTitle(e.feed), art: epImg(e) };
}
async function syncNativeQueue() { if (!NP) return; const ids = db.set.cont ? db.queue.slice(0, 15) : []; NP.setQueue(JSON.stringify(await Promise.all(ids.map(nativeItem)))); }
function onNativeDone(id) {
  if (!ep(id)) return;
  db.prog[id] = { pos: 0, dur: (ep(id).dur || 0), t: now(), done: true };
  statDone(); if (db.set.delPlayed && DL[id]) delDownload(id, true);
  if (db.queue.includes(id)) { db.queue = db.queue.filter(x => x !== id); db.lists.queueT = now(); }
  if (sleep === 'end') { sleep = null; NP.pauseAtEnd(false); }
  save(); render();
}
function onNativeSwitch(id) {
  db.cur = id;
  if (db.queue.includes(id)) { db.queue = db.queue.filter(x => x !== id); db.lists.queueT = now(); }
  if (db.inbox.includes(id)) { db.inbox = db.inbox.filter(x => x !== id); db.lists.inboxT = now(); }
  loadExtras(id); save(); render();
}
function ingestListen() {
  if (!NP) return; let L = {}; try { L = JSON.parse(NP.takeListen() || '{}'); } catch (e) { return; }
  if (!db.set.stats) return;
  for (const [k, v] of Object.entries(L)) {
    const [id, day, hour] = k.split('|'); const e = ep(id); if (!e) continue;
    const st = db.stats[DEV] || (db.stats[DEV] = { t: 0, days: {} });
    const dd = st.days[day] || (st.days[day] = { s: 0, m: 0, e: 0, h: Array(24).fill(0), f: {} });
    dd.s += v[0]; dd.m += v[1]; dd.h[+hour] += v[0]; dd.f[e.feed] = (dd.f[e.feed] || 0) + v[0]; st.t = now();
  }
  if (Object.keys(L).length) save(true);
}
function pushWidget() {
  if (!NP) return;
  try {
    const p0 = period; period = 'Semana'; const a = aggStats(); period = p0;
    const nx = ep(db.inbox[0]) || ep(db.queue[0]);
    NP.setWidgetInfo(JSON.stringify({ week: fmtH(a.s), saved: a.m > a.s ? fmtH(a.m - a.s) + ' economizadas' : '', inbox: db.inbox.length, next: nx ? nx.title : '' }));
  } catch (e) { }
}
function podAction() {
  if (!NP) return; const a = NP.takeAction(); if (!a) return;
  closeModal();
  if (a === 'continuar') { const id = db.cur || Object.keys(db.prog).filter(x => ep(x) && !db.prog[x].done && db.prog[x].pos > 5).sort((x, y) => db.prog[y].t - db.prog[x].t)[0]; if (id) { play(id); go('player'); } else go('home'); }
  else if (a === 'player') go(db.cur ? 'player' : 'home');
  else if (a === 'inbox') go('home');
  else if (a === 'snip') { if (db.cur) { saveSnip(); go('player'); } else toast('Nada tocando para salvar'); }
  else if (a === 'search') { go('disc'); setTimeout(() => $('#q') && $('#q').focus(), 100); }
}
window.__podAction = podAction;
const X = {}; // capítulos e transcrições carregados {id:{ch:[],tr:[],loading}}
let pendingSeek = null, sleep = null, lastSave = 0, ptab = 'ch';
const speedFor = e => { const s = e && sub(e.feed); return (s && s.ps && s.ps.speed) || db.set.speed || 1; };
async function play(id, at) {
  const e = ep(id); if (!e) return;
  if (NP) {
    if (db.cur !== id || !A.src) {
      if (db.cur && db.cur !== id) savePos();
      db.cur = id;
      const pr = db.prog[id]; let start = at != null ? at : posOf(id);
      if (at == null && db.set.resume5 && pr && pr.pos && now() - (pr.t || 0) > 60000) start = Math.max(0, start - 5);
      const s = sub(e.feed); const intro = (s && s.ps && s.ps.intro) || 0; if (start < intro) start = intro;
      if (db.inbox.includes(id)) { db.inbox = db.inbox.filter(x => x !== id); db.lists.inboxT = now(); }
      if (db.queue.includes(id)) { db.queue = db.queue.filter(x => x !== id); db.lists.queueT = now(); }
      const items = [await nativeItem(id), ...(db.set.cont ? await Promise.all(db.queue.slice(0, 15).map(nativeItem)) : [])];
      NP.load(JSON.stringify({ items, startMs: Math.round(start * 1000), speed: speedFor(e), play: true }));
      A.st = { id, pos: start * 1000, dur: (e.dur || 0) * 1000, playing: true, speed: speedFor(e) };
      loadExtras(id); save();
    } else { if (at != null) A.currentTime = at; NP.setSpeed(speedFor(e)); A.play(); }
    render(); return;
  }
  if (db.cur !== id || !A.src) {
    if (db.cur && db.cur !== id) savePos();
    db.cur = id;
    let src = e.url;
    if (DL[id]) { try { const p = await inv('download_path', { name: fileName(e) }); if (p) src = T.core.convertFileSrc(p); else { delete DL[id]; saveDL(); } } catch (x) { } }
    A.src = src;
    const pr = db.prog[id]; let start = at != null ? at : posOf(id);
    if (at == null && db.set.resume5 && pr && pr.pos && now() - (pr.t || 0) > 60000) start = Math.max(0, start - 5);
    const s = sub(e.feed); const intro = (s && s.ps && s.ps.intro) || 0; if (start < intro) start = intro;
    pendingSeek = start;
    if (db.inbox.includes(id)) { db.inbox = db.inbox.filter(x => x !== id); touch('inboxT'); }
    if (db.queue.includes(id)) { db.queue = db.queue.filter(x => x !== id); touch('queueT'); }
    loadExtras(id); setMedia(e); save();
  } else if (at != null) { A.currentTime = at; }
  A.playbackRate = speedFor(e); A.defaultPlaybackRate = A.playbackRate;
  try { await A.play(); } catch (err) { if (err.name !== 'AbortError') toast('Não consegui tocar: ' + err.message, 4000); }
  render();
}
function toggle() { if (!db.cur) return; if (A.paused) play(db.cur); else A.pause(); }
function skip(sec) { if (!db.cur) return; A.currentTime = Math.max(0, Math.min((A.duration || 1e9) - 1, A.currentTime + sec)); updBar(); }
function savePos() { if (!db.cur || !isFinite(A.currentTime)) return; const p = db.prog[db.cur] || {}; db.prog[db.cur] = { pos: A.currentTime, dur: A.duration || p.dur || 0, t: now(), done: false }; save(); }
let finishing = null;
function finish() {
  const id = db.cur; if (!id) return;
  if (NP) {
    if (finishing === id) return; finishing = id; setTimeout(() => { if (finishing === id) finishing = null; }, 4000);
    db.prog[id] = { pos: 0, dur: A.duration || 0, t: now(), done: true };
    statDone(); if (db.set.delPlayed && DL[id]) delDownload(id, true);
    if (sleep === 'end') { sleep = null; NP.pauseAtEnd(false); A.pause(); save(); render(); toast('Timer de sono: boa noite'); return; }
    NP.next(); save(); render(); return;
  }
  db.prog[id] = { pos: 0, dur: A.duration || 0, t: now(), done: true };
  statDone(); if (db.set.delPlayed && DL[id]) delDownload(id, true);
  if (sleep === 'end') { sleep = null; A.pause(); db.cur = null; A.removeAttribute('src'); save(); render(); toast('Timer de sono: boa noite'); return; }
  const next = db.set.cont && db.queue[0];
  if (next) play(next); else { A.pause(); db.cur = null; A.removeAttribute('src'); A.load(); save(); render(); }
}
A.addEventListener('loadedmetadata', () => { if (pendingSeek != null) { try { A.currentTime = pendingSeek; } catch (e) { } pendingSeek = null; } A.playbackRate = speedFor(ep(db.cur)); updBar(); });
A.addEventListener('timeupdate', () => {
  const e = ep(db.cur); if (!e) return;
  const s = sub(e.feed), outro = (s && s.ps && s.ps.outro) || 0;
  if (outro && A.duration && A.duration - A.currentTime <= outro && A.currentTime > 30) { finish(); return; }
  if (now() - lastSave > 5000) { lastSave = now(); savePos(); }
  updBar(); updLive();
});
A.addEventListener('ended', finish);
A.addEventListener('play', () => { renderBar(); if (view === 'player') updPlayBtn(); });
A.addEventListener('pause', () => { savePos(); renderBar(); if (view === 'player') updPlayBtn(); });
A.addEventListener('error', () => { if (db.cur) toast('Erro ao carregar o áudio. Verifique a internet ou baixe o episódio.', 4000); });
function setMedia(e) {
  if (NP || !('mediaSession' in navigator)) return;
  const s = sub(e.feed) || PREV[e.feed] || {};
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: e.title, artist: s.title || '', album: s.author || '', artwork: [{ src: e.img || s.image || '', sizes: '512x512' }] });
    navigator.mediaSession.setActionHandler('play', () => play(db.cur));
    navigator.mediaSession.setActionHandler('pause', () => A.pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => skip(-db.set.back));
    navigator.mediaSession.setActionHandler('seekforward', () => skip(db.set.fwd));
    navigator.mediaSession.setActionHandler('previoustrack', () => skip(-db.set.back));
    navigator.mediaSession.setActionHandler('nexttrack', () => skip(db.set.fwd));
  } catch (x) { }
}
// timer de sono + estatísticas (1 tique por segundo)
let tick = 0;
setInterval(() => {
  if (typeof sleep === 'number' && now() >= sleep) { sleep = null; A.pause(); toast('Timer de sono: boa noite'); }
  if (NP || A.paused || !db.cur || !db.set.stats) return;
  const e = ep(db.cur); if (!e) return;
  const d = new Date(), k = dayKey(d);
  const st = db.stats[DEV] || (db.stats[DEV] = { t: 0, days: {} });
  const dd = st.days[k] || (st.days[k] = { s: 0, m: 0, e: 0, h: Array(24).fill(0), f: {} });
  dd.s += 1; dd.m += A.playbackRate || 1; dd.h[d.getHours()] += 1; dd.f[e.feed] = (dd.f[e.feed] || 0) + 1; st.t = now();
  if (++tick % 15 === 0) save(true);
}, 1000);
function statDone() { const k = dayKey(new Date()); const st = db.stats[DEV] || (db.stats[DEV] = { t: 0, days: {} }); const dd = st.days[k] || (st.days[k] = { s: 0, m: 0, e: 0, h: Array(24).fill(0), f: {} }); dd.e++; st.t = now(); }

// capítulos e transcrições
async function loadExtras(id) {
  const e = ep(id); if (!e || X[id]) return;
  const x = X[id] = { ch: [], tr: [], loading: true };
  const jobs = [];
  if (e.chapters) jobs.push(getJSON(e.chapters).then(j => { x.ch = (j.chapters || []).filter(c => c.toc !== false && c.title).map(c => ({ at: +c.startTime || 0, t: c.title })); }).catch(() => { }));
  const pick = (e.transcripts || []).sort((a, b) => trRank(a.type) - trRank(b.type))[0];
  if (pick) jobs.push(getText(pick.url).then(t => { x.tr = parseTranscript(t, pick.type); }).catch(() => { }));
  await Promise.all(jobs); x.loading = false;
  if (view === 'player' && db.cur === id) render();
}
const trRank = t => t.includes('vtt') ? 0 : t.includes('srt') ? 1 : t.includes('json') ? 2 : 3;
const tsec = s => { const m = s.trim().replace(',', '.').split(':').map(Number); return m.reduce((a, x) => a * 60 + x, 0); };
function parseTranscript(text, type) {
  let cues = [];
  if (type.includes('json') || /^\s*\{/.test(text)) {
    try { const j = JSON.parse(text); cues = (j.segments || []).map(s => ({ at: +s.startTime || 0, t: s.body || '', who: s.speaker || '' })); } catch (e) { }
  } else if (type.includes('html') && !text.includes('-->')) {
    cues = stripHtml(text).split(/\n+/).filter(Boolean).map((t, i) => ({ at: -1, t, who: '' }));
    return cues;
  } else {
    for (const b of text.replace(/\r/g, '').split(/\n\n+/)) {
      const lines = b.split('\n'); const i = lines.findIndex(l => l.includes('-->')); if (i < 0) continue;
      let t = lines.slice(i + 1).join(' ').trim(); let who = '';
      const v = t.match(/<v\s+([^>]+)>/); if (v) who = v[1];
      t = t.replace(/<[^>]+>/g, '').trim(); if (!t) continue;
      cues.push({ at: tsec(lines[i].split('-->')[0]), t, who });
    }
  }
  // junta pedaços curtos em frases
  const out = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    if (last && last.who === c.who && !/[.!?…]$/.test(last.t) && c.at - last.at < 25) last.t += ' ' + c.t;
    else out.push({ ...c });
  }
  return out;
}
function curIdx(list) { const t = A.currentTime; let i = -1; for (let k = 0; k < list.length; k++) { if (list[k].at >= 0 && list[k].at <= t + 0.3) i = k; else if (list[k].at > t) break; } return i; }
function saveSnip() {
  const id = db.cur; if (!id) return;
  const at = A.currentTime, x = X[id];
  let q = '';
  if (x && x.tr.length) q = x.tr.filter(c => c.at >= at - 25 && c.at <= at + 3).map(c => c.t).join(' ').slice(0, 400);
  db.snips.unshift({ id: rid(), ep: id, feed: ep(id).feed, at, q, created: now() });
  save(); toast('Momento salvo em ' + fmtT(at)); if (view === 'player' || view === 'home') render();
}
function snipsMarkdown() {
  let md = '# Momentos salvos\n\n';
  for (const s of db.snips) {
    const e = ep(s.ep), p = sub(s.feed);
    md += '## ' + (p ? p.title : 'Podcast') + ' — ' + (e ? e.title : '') + '\n\n';
    if (s.q) md += '> ' + s.q + '\n\n';
    md += '- Momento: ' + fmtT(s.at) + (e ? ' · [ouvir](' + e.url + '#t=' + Math.floor(s.at) + ')' : '') + '\n- Salvo em: ' + new Date(s.created).toLocaleString('pt-BR') + '\n\n';
  }
  return md;
}

// ---------------------------------------------------------------- navegação
let view = 'home', arg = null;
const TABS = [['home', 'Início'], ['lib', 'Biblioteca'], ['disc', 'Descobrir'], ['stats', 'Estatísticas'], ['set', 'Ajustes']];
function go(v, a, replace) {
  const h = '#/' + v + (a != null ? '/' + encodeURIComponent(a) : '');
  if (replace) history.replaceState(null, '', h); else if (location.hash !== h) history.pushState(null, '', h);
  setRoute();
}
function setRoute() {
  const m = location.hash.match(/^#\/([a-z]+)(?:\/(.*))?$/);
  const nv = m ? m[1] : (db.set.tab || 'home'); const na = m && m[2] != null ? decodeURIComponent(m[2]) : null;
  const changed = nv !== view || na !== arg; if (changed) showMore = 40; view = nv; arg = na; render(); if (changed) $('#main').scrollTop = 0;
  if (view === 'disc') discLoad();
}
window.addEventListener('popstate', setRoute);
const activeTab = () => view === 'show' || view === 'smart' || view === 'folder' ? 'lib' : view === 'player' ? null : view;

// ---------------------------------------------------------------- componentes
function cov(img, title, size, rad, fs) {
  return `<span class="cov" style="width:${size};height:${size};${rad ? 'border-radius:' + rad + ';' : ''}background:${colorOf(title)};font-size:${fs || 13}px"><span>${esc(initials(title))}</span>${img ? `<img src="${esc(img)}" loading="lazy" alt="" onerror="this.remove()">` : ''}</span>`;
}
const epImg = e => e.img || (sub(e.feed) || PREV[e.feed] || {}).image || '';
const feedTitle = url => (sub(url) || PREV[url] || {}).title || '';
function epRow(id, opts = {}) {
  const e = ep(id); if (!e) return '';
  const pr = db.prog[id]; const pct = pr && pr.dur && !pr.done ? Math.min(100, pr.pos / pr.dur * 100) : 0;
  const meta = [opts.showFeed !== false ? feedTitle(e.feed) : fmtDate(e.date), fmtD(e.dur), isDone(id) ? 'ouvido' : ''].filter(Boolean).join(' · ');
  return `<div class="ep">
    ${opts.handle || ''}
    <button class="tile" style="flex-direction:row;gap:12px;flex:1;min-width:0;align-items:center" data-a="epinfo" data-x="${id}">
      ${cov(epImg(e), feedTitle(e.feed), '46px', '12px', 11)}
      <span class="meta"><span class="t ell">${esc(e.title)}</span><span class="m ell">${esc(meta)}</span>${pct ? `<span class="prog"><i style="width:${pct}%"></i></span>` : ''}</span>
    </button>
    ${DL[id] ? I.ok : DLING[id] ? '<span class="spin"></span>' : ''}
    ${opts.tail || `<button class="ib ghost" aria-label="Tocar" data-a="play" data-x="${id}">${db.cur === id && !A.paused ? I.pause : I.play}</button>`}
  </div>`;
}
function bar() {
  const e = ep(db.cur); if (!e || view === 'player') return '';
  const playing = !A.paused;
  return `<div class="bar">
    <button class="open" data-a="go" data-x="player">${cov(epImg(e), feedTitle(e.feed), '46px', '12px', 11)}
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="ell" style="font-size:13px;font-weight:600">${esc(e.title)}</span><span class="mut ell" style="font-size:12px" id="barsub">${esc(feedTitle(e.feed))}</span></span></button>
    <div class="wo" style="flex:2 1 360px;flex-direction:column;gap:4px;align-items:center">
      <div class="row" style="gap:8px"><button class="ib ghost" data-a="skip" data-x="-1" aria-label="Voltar" style="font-size:11px;font-weight:700">−${db.set.back}</button>
      <button class="pp" data-a="toggle" aria-label="${playing ? 'Pausar' : 'Tocar'}">${playing ? I.pause : I.play}</button>
      <button class="ib ghost" data-a="skip" data-x="1" aria-label="Avançar" style="font-size:11px;font-weight:700">+${db.set.fwd}</button></div>
      <div class="row mut" style="width:100%;gap:10px;font-size:11px"><span id="bt1">0:00</span><div class="scrub" data-a="seek" style="flex:1;height:14px"><span class="trk" style="height:4px;background:#2C313B"></span><span class="fill" id="bfill" style="height:4px"></span></div><span id="bt2">0:00</span></div>
    </div>
    <div class="wo" style="flex:1 1 200px;justify-content:flex-end;gap:2px">
      <button class="ib ghost" data-a="speed" aria-label="Velocidade" style="width:auto;padding:0 12px;font-weight:700;font-size:13px">${String(A.playbackRate || 1).replace('.', ',')}×</button>
      <button class="ib ghost" data-a="snip" aria-label="Salvar momento">${I.snip}</button>
      <button class="ib ghost" data-a="sleep" aria-label="Timer de sono">${I.moon}</button>
    </div>
    <button class="pp mo" data-a="toggle" aria-label="${playing ? 'Pausar' : 'Tocar'}">${playing ? I.pause : I.play}</button>
    <span class="barprog mo" id="bprog"></span>
  </div>`;
}
function updBar() {
  const d = A.duration || (db.prog[db.cur] || {}).dur || 0, t = A.currentTime || 0, p = d ? t / d * 100 : 0;
  const f = $('#bfill'); if (f) f.style.width = p + '%';
  const b = $('#bprog'); if (b) b.style.width = p + '%';
  const t1 = $('#bt1'); if (t1) t1.textContent = fmtT(t);
  const t2 = $('#bt2'); if (t2) t2.textContent = fmtT(d);
  const pf = $('#pfill'); if (pf) { pf.style.width = p + '%'; $('#pknob').style.left = p + '%'; $('#pt1').textContent = fmtT(t); $('#pt2').textContent = '−' + fmtT(d - t) + ' a ' + String(A.playbackRate).replace('.', ',') + '×'; }
}
let lastCue = -2, lastCh = -2;
function updLive() {
  if (view !== 'player') return;
  const x = X[db.cur]; if (!x) return;
  if (ptab === 'tr' && x.tr.length) { const i = curIdx(x.tr); if (i !== lastCue) { lastCue = i; document.querySelectorAll('.cue.cur').forEach(c => c.classList.remove('cur')); const el = document.querySelector('.cue[data-i="' + i + '"]'); if (el) { el.classList.add('cur'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } } }
  if (x.ch.length) { const i = curIdx(x.ch); if (i !== lastCh) { lastCh = i; document.querySelectorAll('.chap.cur').forEach(c => c.classList.remove('cur')); const el = document.querySelector('.chap[data-i="' + i + '"]'); if (el) el.classList.add('cur'); const l = $('#chlabel'); if (l && x.ch[i]) l.textContent = 'Capítulo ' + (i + 1) + ' · ' + x.ch[i].t; } }
}
function updPlayBtn() { const b = $('#bigplay'); if (b) { b.innerHTML = A.paused ? I.play : I.pause; b.setAttribute('aria-label', A.paused ? 'Tocar' : 'Pausar'); } }
function renderBar() { $('#bar').innerHTML = bar(); updBar(); }

// ---------------------------------------------------------------- telas
const V = {};
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
V.home = () => {
  const d = new Date();
  const hasSubs = Object.keys(db.subs).length > 0;
  const cont = db.cur ? db.cur : Object.keys(db.prog).filter(id => ep(id) && !db.prog[id].done && db.prog[id].pos > 5).sort((a, b) => db.prog[b].t - db.prog[a].t)[0];
  const ce = ep(cont);
  const qTotal = db.queue.reduce((a, id) => a + Math.max(0, ((ep(id) || {}).dur || 0) - posOf(id)), 0);
  return `<div class="page">
    <header class="row" style="gap:8px"><div style="flex:1;display:flex;flex-direction:column;gap:2px"><span class="mut" style="font-size:13px">${DIAS[d.getDay()]}, ${d.getDate()} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][d.getMonth()]}</span><h1>${greet()}</h1></div>
      <button class="ib" data-a="refresh" aria-label="Atualizar feeds">${refreshing ? '<span class="spin"></span>' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3M4 4v4h4M20 20v-4h-4"/></svg>'}</button>
      <button class="ib" data-a="go" data-x="disc" aria-label="Buscar">${I.search}</button></header>
    ${!hasSubs ? `<div class="card" style="display:flex;flex-direction:column;gap:12px;padding:22px"><h2 style="font-size:22px">Comece seguindo seus podcasts</h2><p class="mut" style="line-height:1.5">Busque pelo nome, cole o link RSS ou traga suas inscrições de outro app com um arquivo OPML.</p><div class="wrapchips"><button class="btn pri" data-a="go" data-x="disc">Buscar podcasts</button><button class="btn" data-a="opmlImport">Importar XML / OPML</button>${GD.on() ? '' : '<button class="btn" data-a="go" data-x="set">Entrar com Google</button>'}</div></div>` : ''}
    ${ce ? `<button class="hero" data-a="playgo" data-x="${cont}">${cov(epImg(ce), feedTitle(ce.feed), '96px', '18px', 18)}
      <span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px"><span class="lbl" style="color:#8FD8E0">Continuar</span><span class="clamp2" style="font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.25">${esc(ce.title)}</span>
      <span style="font-size:12px;color:#A9C6C9">${esc(feedTitle(ce.feed))}${ce.dur ? ' · faltam ' + fmtD(ce.dur - posOf(cont)) : ''}</span>
      <span class="prog" style="background:#24494B"><i style="width:${ce.dur ? Math.min(100, posOf(cont) / ce.dur * 100) : 0}%"></i></span></span>
      <span class="pp" style="width:52px;height:52px;border-radius:26px" aria-hidden="true">${I.play}</span></button>` : ''}
    <div class="two">
      <section><div class="sect"><h2>Caixa de entrada <span class="mut" style="font-weight:500">· ${db.inbox.length}</span></h2>${db.inbox.length ? '<button class="link" data-a="inboxClear">Arquivar tudo</button>' : ''}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
        ${db.inbox.slice(0, 30).map(id => { const e = ep(id); if (!e) return ''; return `<div class="card inbox-card"><button class="tile" style="flex-direction:row;gap:12px;align-items:center" data-a="epinfo" data-x="${id}">${cov(epImg(e), feedTitle(e.feed), '48px', '12px', 12)}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span class="ell" style="font-size:14px;font-weight:600">${esc(e.title)}</span><span class="mut ell" style="font-size:12px">${esc([feedTitle(e.feed), fmtDate(e.date), fmtD(e.dur)].filter(Boolean).join(' · '))}</span></span></button>
          <div class="acts"><button class="btn pri" data-a="toQueue" data-x="${id}">+ Fila</button><button class="btn" data-a="toNext" data-x="${id}">Tocar a seguir</button><button class="btn" style="flex:0 0 48px;padding:0" data-a="archive" data-x="${id}" aria-label="Arquivar">${I.arch}</button></div></div>`; }).join('')}
        ${!db.inbox.length ? `<div class="card empty"><b>Tudo em dia</b><span class="mut" style="font-size:13px">Episódios novos dos podcasts que você segue aparecem aqui.</span></div>` : ''}
        </div></section>
      <section><div class="sect"><h2>Fila <span class="mut" style="font-weight:500">· ${qTotal ? fmtH(qTotal) : db.queue.length}</span></h2></div>
        ${db.queue.map((id, i) => epRow(id, { tail: `<span class="row" style="gap:0"><button class="ib ghost" style="width:34px" data-a="qUp" data-x="${i}" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>${I.up}</button><button class="ib ghost" style="width:34px" data-a="qDown" data-x="${i}" aria-label="Descer" ${i === db.queue.length - 1 ? 'disabled' : ''}>${I.dn}</button><button class="ib ghost" style="width:34px" data-a="qDel" data-x="${i}" aria-label="Tirar da fila">${I.x}</button><button class="ib ghost" data-a="play" data-x="${id}" aria-label="Tocar">${I.play}</button></span>` })).join('')}
        ${!db.queue.length ? `<div class="card empty"><span class="mut" style="font-size:13px">A fila está vazia. Use “+ Fila” na caixa de entrada ou em qualquer episódio.</span></div>` : ''}
      </section>
    </div>
    ${db.snips.length ? `<section><div class="sect"><h2>Momentos salvos</h2><button class="link" data-a="snipExport">Exportar</button></div><div class="hscroll">${db.snips.slice(0, 12).map(s => snipCard(s)).join('')}</div></section>` : ''}
  </div>`;
};
function snipCard(s, tint) {
  const e = ep(s.ep);
  return `<button class="card" style="flex:0 0 260px;display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:20px;text-align:left;color:var(--tx)${tint ? ';background:#12292A;border-color:#1F3A3B' : ''}" data-a="snipPlay" data-x="${s.id}">
    <span class="row" style="gap:8px;width:100%">${cov(e ? epImg(e) : '', feedTitle(s.feed), '28px', '8px', 9)}<span class="mut ell" style="font-size:12px;flex:1">${esc(feedTitle(s.feed))}</span><span style="font-size:12px;color:var(--acc);font-weight:600">${fmtT(s.at)}</span></span>
    <span style="font-size:14px;line-height:1.45">${s.q ? '“' + esc(s.q) + '”' : esc(e ? e.title : 'Momento salvo')}</span></button>`;
}

let libFilter = 'pod', libFolder = '';
V.lib = () => {
  const subs = Object.values(db.subs).sort((a, b) => (b.lastDate || 0) - (a.lastDate || 0));
  const folders = [...new Set(subs.map(s => s.folder).filter(Boolean))].sort();
  const F = [['pod', 'Podcasts'], ['new', 'Novos'], ['prog', 'Em andamento'], ['dl', 'Baixados'], ['done', 'Ouvidos']];
  let list = '';
  if (libFilter === 'pod') {
    const shown = libFolder ? subs.filter(s => s.folder === libFolder) : subs;
    list = `<section><div class="sect"><h2>${libFolder ? esc(libFolder) : 'Inscrições'} <span class="mut" style="font-weight:500">· ${shown.length}</span></h2>${libFolder ? '<button class="link" data-a="folderAll">Ver todas</button>' : ''}</div>
      <div class="subs">${shown.map(s => { const n = (s.eps || []).filter(id => ep(id) && ep(id).date > (s.seenAt || 0) && !db.prog[id]).length; return `<button class="tile" data-a="go" data-x="show" data-y="${esc(s.url)}"><span style="position:relative">${cov(s.image, s.title, '100%', '14px', 16).replace('width:100%;height:100%', 'width:100%;aspect-ratio:1')}${n ? `<span class="nb">${n}</span>` : ''}</span><span class="ell" style="font-size:12px;font-weight:500">${esc(s.title)}</span></button>`; }).join('')}</div>
      ${!subs.length ? '<div class="card empty"><span class="mut">Você ainda não segue nenhum podcast.</span><button class="btn pri" data-a="go" data-x="disc">Descobrir</button></div>' : ''}</section>`;
  } else {
    const all = Object.keys(db.eps).filter(id => sub(ep(id).feed));
    const pick = { new: id => !db.prog[id] && ep(id).date > now() - 14 * 864e5, prog: id => posOf(id) > 5, dl: id => DL[id], done: id => isDone(id) }[libFilter];
    const ids = all.filter(pick).sort((a, b) => libFilter === 'prog' ? db.prog[b].t - db.prog[a].t : ep(b).date - ep(a).date).slice(0, 80);
    list = `<section>${ids.map(id => epRow(id)).join('') || '<div class="card empty"><span class="mut">Nada por aqui.</span></div>'}</section>`;
  }
  return `<div class="page">
    <header class="row" style="gap:8px"><h1 style="flex:1">Biblioteca</h1><button class="ib" data-a="addRss" aria-label="Adicionar por link RSS">${I.plus}</button></header>
    <div class="chips">${F.map(([k, t]) => `<button class="chip ${libFilter === k ? 'on' : ''}" data-a="libF" data-x="${k}">${t}</button>`).join('')}</div>
    ${libFilter === 'pod' && folders.length ? `<section><div class="sect"><h2>Pastas</h2></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">${folders.map(f => { const ss = subs.filter(s => s.folder === f); return `<button class="card" style="padding:12px;display:flex;flex-direction:column;gap:10px;color:var(--tx);text-align:left${libFolder === f ? ';border-color:var(--acc)' : ''}" data-a="folder" data-x="${esc(f)}"><span style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:100%">${[0, 1, 2, 3].map(i => ss[i] ? cov(ss[i].image, ss[i].title, '100%', '8px', 10).replace('width:100%;height:100%', 'width:100%;aspect-ratio:1') : '<span style="aspect-ratio:1;border-radius:8px;background:#1D2027;display:block"></span>').join('')}</span><span class="row" style="justify-content:space-between;width:100%;font-size:14px;font-weight:600">${esc(f)}<span class="mut" style="font-weight:500">${ss.length}</span></span></button>`; }).join('')}</div></section>` : ''}
    ${libFilter === 'pod' ? `<section><div class="sect"><h2>Playlists inteligentes</h2><button class="link" data-a="smartNew">Criar regra</button></div><div class="card" style="padding:4px 16px">${db.smart.map((p, i) => `<button class="row" style="width:100%;background:none;border:0;border-top:${i ? '1px solid #22252D' : '0'};padding:12px 0;color:var(--tx);text-align:left" data-a="go" data-x="smart" data-y="${p.id}"><span style="width:40px;height:40px;border-radius:12px;background:#1D2027;display:flex;align-items:center;justify-content:center;flex-shrink:0">${I.smart(COLORS[i % COLORS.length])}</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span style="font-size:14px;font-weight:600">${esc(p.name)}</span><span class="mut ell" style="font-size:12px">${esc(ruleText(p))}</span></span><span class="mut" style="font-size:13px">${smartIds(p).length}</span></button>`).join('')}</div></section>` : ''}
    ${list}
  </div>`;
};
function ruleText(p) { return [p.folder ? 'pasta ' + p.folder : '', p.max ? 'até ' + p.max + ' min' : '', p.unplayed ? 'não ouvidos' : '', p.started ? 'começados' : '', p.days ? 'parados há ' + p.days + '+ dias' : '', p.recent ? 'últimos ' + p.recent + ' dias' : '', p.dl ? 'baixados' : ''].filter(Boolean).join(' · ') || 'todos os episódios'; }
function smartIds(p) {
  return Object.keys(db.eps).filter(id => { const e = ep(id), s = sub(e.feed); if (!s) return false;
    if (p.folder && s.folder !== p.folder) return false; if (p.max && e.dur && e.dur > p.max * 60) return false; if (p.max && !e.dur) return false;
    if (p.unplayed && db.prog[id]) return false; if (p.started && !(posOf(id) > 5)) return false;
    if (p.days && !(db.prog[id] && now() - db.prog[id].t > p.days * 864e5)) return false;
    if (p.recent && e.date < now() - p.recent * 864e5) return false; if (p.dl && !DL[id]) return false; return true;
  }).sort((a, b) => ep(b).date - ep(a).date).slice(0, 100);
}
V.smart = () => {
  const p = db.smart.find(x => x.id === arg); if (!p) return V.lib();
  const ids = smartIds(p);
  return `<div class="page" style="gap:20px"><button class="ib" data-a="back" aria-label="Voltar">${I.back}</button>
    <div><h1>${esc(p.name)}</h1><p class="mut" style="margin-top:6px">${esc(ruleText(p))} · ${ids.length} episódios</p></div>
    <div class="wrapchips"><button class="btn pri" data-a="smartPlay" data-x="${p.id}" ${ids.length ? '' : 'disabled'}>Tocar tudo</button><button class="btn" data-a="smartEdit" data-x="${p.id}">Editar regra</button><button class="btn" data-a="smartDel" data-x="${p.id}">Apagar</button></div>
    <section>${ids.map(id => epRow(id)).join('') || '<div class="card empty"><span class="mut">Nenhum episódio combina com essa regra agora.</span></div>'}</section></div>`;
};
let showMore = 40;
V.show = () => {
  const url = arg; const s = sub(url); const p = s || PREV[url];
  if (!p) { loadPreview(url); return `<div class="page"><button class="ib" data-a="back" aria-label="Voltar">${I.back}</button><div class="card empty"><span class="spin"></span><span class="mut">Carregando o podcast…</span></div></div>`; }
  if (s && s.seenAt < now() - 1000) { s.seenAt = now(); save(true); }
  const ids = s ? (s.eps || []) : p.ids;
  const ps = (s && s.ps) || {};
  const speedOpts = [['', 'Padrão (' + String(db.set.speed).replace('.', ',') + '×)'], ...[0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3].map(v => [v, String(v).replace('.', ',') + '×'])];
  const secs = [0, 10, 15, 20, 30, 45, 60, 90, 120].map(v => [v, v ? v + ' s' : 'Não']);
  const opt = (list, val) => list.map(([v, t]) => `<option value="${v}" ${String(val ?? '') === String(v) ? 'selected' : ''}>${t}</option>`).join('');
  return `<div class="page" style="gap:24px">
    <button class="ib" data-a="back" aria-label="Voltar">${I.back}</button>
    <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end">${cov(p.image, p.title, '140px', '24px', 28)}
      <div style="flex:1 1 240px;display:flex;flex-direction:column;gap:8px"><h1>${esc(p.title)}</h1><span class="mut">${esc([p.author, p.cat].filter(Boolean).join(' · '))}</span>
        <div class="wrapchips" style="margin-top:6px">${s ? `<button class="btn light" data-a="unsub" data-x="${esc(url)}">Seguindo</button><button class="btn" data-a="setFolder" data-x="${esc(url)}">${s.folder ? 'Pasta: ' + esc(s.folder) : 'Pôr numa pasta'}</button><button class="btn" data-a="refreshOne" data-x="${esc(url)}">Atualizar</button>` : `<button class="btn pri" data-a="sub" data-x="${esc(url)}">Seguir</button>`}</div></div></div>
    ${p.desc ? `<p class="mut" style="font-size:14px;line-height:1.55;max-width:760px;white-space:pre-line">${esc(p.desc)}</p>` : ''}
    <div class="two">
      ${s ? `<section><div class="sect"><h2>Ajustes deste podcast</h2></div><div class="setg">
        <div class="setr"><span class="tx"><b>Velocidade</b></span><select class="sel" data-c="ps" data-k="speed" data-x="${esc(url)}">${opt(speedOpts, ps.speed || '')}</select></div>
        <div class="setr"><span class="tx"><b>Pular início</b><small>Vinheta e propaganda do começo</small></span><select class="sel" data-c="ps" data-k="intro" data-x="${esc(url)}">${opt(secs, ps.intro || 0)}</select></div>
        <div class="setr"><span class="tx"><b>Pular final</b><small>Créditos e chamadas do fim</small></span><select class="sel" data-c="ps" data-k="outro" data-x="${esc(url)}">${opt(secs, ps.outro || 0)}</select></div>
        <div class="setr"><span class="tx"><b>Baixar episódios novos</b></span><button class="sw ${ps.autodl ? 'on' : ''}" role="switch" aria-checked="${!!ps.autodl}" aria-label="Baixar episódios novos" data-a="psToggle" data-x="${esc(url)}" data-y="autodl"><span></span></button></div>
      </div>
      <div style="margin-top:14px;display:flex;flex-direction:column;gap:8px"><span class="lbl">Episódios novos vão para</span><div class="seg">${[['', 'Padrão'], ['inbox', 'Caixa de entrada'], ['queue', 'Fila'], ['archive', 'Arquivo']].map(([k, t]) => `<button class="${(ps.dest || '') === k ? 'on' : ''}" data-a="psDest" data-x="${esc(url)}" data-y="${k}">${t}</button>`).join('')}</div></div></section>` : ''}
      <section><div class="sect"><h2>Episódios <span class="mut" style="font-weight:500">· ${ids.length}</span></h2></div>
        ${ids.slice(0, showMore).map(id => epRow(id, { showFeed: false })).join('')}
        ${ids.length > showMore ? '<button class="btn" style="width:100%;margin-top:10px" data-a="more">Ver mais episódios</button>' : ''}</section>
    </div></div>`;
};
async function loadPreview(url) {
  if (PREV[url] && PREV[url].loading) return;
  PREV[url] = { loading: true };
  try { const f = await fetchFeed(url); const ids = mergeItems(url, f, null); PREV[url] = Object.assign(f, { ids, url }); }
  catch (e) { delete PREV[url]; toast('Não consegui abrir: ' + e.message, 4000); }
  if (view === 'show' && arg === url) render();
}

// ---- descobrir
const GENRES = [[1318, 'Tecnologia', '#4FB3BF'], [1533, 'Ciência', '#7BC47F'], [1487, 'História', '#E07A5F'], [1321, 'Negócios', '#B48EE0'], [1304, 'Educação', '#F2C14E'], [1303, 'Comédia', '#E26D9A'], [1489, 'Notícias', '#A1A7B3'], [1324, 'Sociedade e cultura', '#D98E4A'], [1488, 'True crime', '#C9A26B'], [1545, 'Esportes', '#3D8BD9'], [1512, 'Saúde e bem-estar', '#9CCB86'], [1483, 'Ficção', '#C3A6E6'], [1502, 'Lazer', '#8FB8DE']];
const CATMAP = { 'technology': 1318, 'tecnologia': 1318, 'science': 1533, 'ciência': 1533, 'ciencia': 1533, 'history': 1487, 'história': 1487, 'historia': 1487, 'business': 1321, 'negócios': 1321, 'education': 1304, 'educação': 1304, 'comedy': 1303, 'comédia': 1303, 'news': 1489, 'notícias': 1489, 'society & culture': 1324, 'true crime': 1488, 'sports': 1545, 'esportes': 1545, 'health & fitness': 1512, 'fiction': 1483, 'leisure': 1502, 'games': 1502 };
const D = { q: '', res: null, loading: false, genre: null, top: {}, forYou: null, fyLoading: false };
async function itunesSearch(q) {
  const j = await getJSON('https://itunes.apple.com/search?media=podcast&limit=30&country=' + db.set.country + '&term=' + encodeURIComponent(q));
  return (j.results || []).filter(r => r.feedUrl).map(r => ({ feed: r.feedUrl, title: r.collectionName, author: r.artistName, image: r.artworkUrl600 || r.artworkUrl100, cat: r.primaryGenreName, gid: (r.genreIds || [])[0] }));
}
async function topChart(gid) {
  if (D.top[gid]) return D.top[gid];
  let list = [];
  try {
    const j = await getJSON('https://itunes.apple.com/' + db.set.country + '/rss/toppodcasts/limit=25/genre=' + gid + '/json');
    list = ((j.feed && j.feed.entry) || []).map(e => ({ itunesId: e.id && e.id.attributes && e.id.attributes['im:id'], title: e['im:name'] && e['im:name'].label, author: e['im:artist'] && e['im:artist'].label, image: e['im:image'] && e['im:image'][e['im:image'].length - 1].label }));
  } catch (e) { }
  if (!list.length) { try { const j = await getJSON('https://rss.applemarketingtools.com/api/v2/' + db.set.country + '/podcasts/top/25/podcasts.json'); list = ((j.feed && j.feed.results) || []).map(r => ({ itunesId: r.id, title: r.name, author: r.artistName, image: (r.artworkUrl100 || '').replace('100x100', '600x600') })); } catch (e) { } }
  D.top[gid] = list; return list;
}
async function feedFromItunes(id) { const j = await getJSON('https://itunes.apple.com/lookup?id=' + id); const r = (j.results || [])[0]; if (!r || !r.feedUrl) throw new Error('feed não encontrado'); return r.feedUrl; }
function genreWeights() {
  const w = {}; const subs = Object.values(db.subs);
  const listen = {}; for (const dev of Object.values(db.stats)) for (const d of Object.values(dev.days || {})) for (const [f, s] of Object.entries(d.f || {})) listen[f] = (listen[f] || 0) + s;
  for (const s of subs) { const g = s.gid || CATMAP[(s.cat || '').toLowerCase()]; if (!g) continue; w[g] = (w[g] || 0) + 1 + (listen[s.url] || 0) / 1800; }
  return Object.entries(w).sort((a, b) => b[1] - a[1]);
}
async function discLoad() {
  if (D.forYou || D.fyLoading) return;
  const gw = genreWeights(); if (!gw.length) return;
  D.fyLoading = true;
  const following = new Set(Object.values(db.subs).map(s => (s.title || '').toLowerCase()));
  const out = [];
  for (const [gid] of gw.slice(0, 2)) { const l = await topChart(gid); l.filter(x => !following.has((x.title || '').toLowerCase())).slice(0, 6).forEach(x => out.push(Object.assign({ why: (GENRES.find(g => g[0] == gid) || [0, ''])[1] }, x))); }
  const top = Object.values(db.subs).map(s => [s, Object.values(db.stats).reduce((a, d) => a + Object.values(d.days || {}).reduce((b, x) => b + ((x.f || {})[s.url] || 0), 0), 0)]).sort((a, b) => b[1] - a[1])[0];
  D.forYou = { list: out.slice(0, 8), because: top && top[1] > 0 ? top[0].title : (GENRES.find(g => g[0] == gw[0][0]) || [0, ''])[1] };
  D.fyLoading = false; if (view === 'disc') render();
}
const resultCard = r => `<div class="ep"><button class="tile" style="flex-direction:row;gap:12px;flex:1;min-width:0;align-items:center" data-a="${r.feed ? 'preview' : 'previewIt'}" data-x="${esc(r.feed || r.itunesId)}">${cov(r.image, r.title, '54px', '12px', 12)}<span class="meta"><span class="t ell" style="font-weight:600">${esc(r.title)}</span><span class="m ell">${esc([r.author, r.cat].filter(Boolean).join(' · '))}</span></span></button>${r.feed && sub(r.feed) ? '<span class="mut" style="font-size:12px">Seguindo</span>' : `<button class="ib ghost" style="border:1px solid var(--ln2)" aria-label="Seguir" data-a="${r.feed ? 'sub' : 'subIt'}" data-x="${esc(r.feed || r.itunesId)}" data-y="${r.gid || ''}">${I.plus}</button>`}</div>`;
V.disc = () => {
  const podroll = [...new Set(Object.values(db.subs).flatMap(s => (s.podroll || []).map(u => u + '|' + s.title)))].filter(x => !sub(x.split('|')[0])).slice(0, 6);
  return `<div class="page">
    <h1>Descobrir</h1>
    <label class="search">${I.search}<span style="position:absolute;width:1px;height:1px;overflow:hidden">Buscar</span><input type="search" id="q" placeholder="Nome do podcast, pessoa, tema ou link RSS" value="${esc(D.q)}" data-k="search" enterkeyhint="search"></label>
    ${D.loading ? '<div class="row mut"><span class="spin"></span> Buscando…</div>' : ''}
    ${D.res ? `<section><div class="sect"><h2>Resultados</h2><button class="link" data-a="clearSearch">Limpar</button></div>${D.res.map(resultCard).join('') || '<p class="mut">Nada encontrado.</p>'}</section>` : ''}
    ${D.forYou && D.forYou.list.length ? `<section style="border-radius:26px;background:#1A1610;border:1px solid #2B2416;padding:20px;display:flex;flex-direction:column;gap:16px"><div style="display:flex;flex-direction:column;gap:6px"><span class="lbl" style="color:var(--acc)">Para você</span><h2 style="font-size:22px">Porque você ouve ${esc(D.forYou.because)}</h2><span style="font-size:13px;color:#B7AE9C">Baseado nas categorias que você mais ouve</span></div>
      <div class="subs">${D.forYou.list.map(r => `<button class="tile" data-a="previewIt" data-x="${esc(r.itunesId)}">${cov(r.image, r.title, '100%', '14px', 15).replace('width:100%;height:100%', 'width:100%;aspect-ratio:1')}<span class="ell" style="font-size:13px;font-weight:600">${esc(r.title)}</span><span class="ell" style="font-size:11px;color:#B7AE9C">${esc(r.why)}</span></button>`).join('')}</div></section>` : D.fyLoading ? '<div class="row mut"><span class="spin"></span> Montando sugestões…</div>' : ''}
    <section><div class="sect"><h2>Categorias</h2></div><div class="wrapchips">${GENRES.map(([id, t, c]) => `<button class="chip ${D.genre == id ? 'on' : ''}" data-a="genre" data-x="${id}"><span style="width:8px;height:8px;border-radius:4px;background:${c}"></span>${t}</button>`).join('')}</div></section>
    ${D.genre ? `<section><div class="sect"><h2>Em alta em ${esc((GENRES.find(g => g[0] == D.genre) || [0, ''])[1])}</h2></div>${D.top[D.genre] ? D.top[D.genre].map((r, i) => `<div class="row"><span style="width:24px;font-weight:700;font-size:16px;color:#7D8491">${i + 1}</span><div style="flex:1;min-width:0">${resultCard(r)}</div></div>`).join('') || '<p class="mut">Não consegui carregar o ranking agora.</p>' : '<div class="row mut"><span class="spin"></span> Carregando…</div>'}</section>` : ''}
    ${podroll.length ? `<section><div class="sect"><h2>Indicados pelos criadores</h2></div><div style="display:flex;flex-direction:column;gap:8px">${podroll.map(x => { const [u, by] = x.split('|'); return `<button class="card row" style="padding:12px;border-radius:18px;color:var(--tx);text-align:left" data-a="preview" data-x="${esc(u)}"><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px"><span class="ell" style="font-size:13px;font-weight:600">${esc(u.replace(/^https?:\/\//, ''))}</span><span class="mut" style="font-size:12px">indicado por ${esc(by)}</span></span>${I.back.replace('m15 6-6 6 6 6', 'm9 6 6 6-6 6')}</button>`; }).join('')}</div></section>` : ''}
  </div>`;
};
async function doSearch(q) {
  q = q.trim(); D.q = q; if (!q) { D.res = null; render(); return; }
  if (/^https?:\/\//i.test(q)) { go('show', q); return; }
  D.loading = true; render();
  try { D.res = await itunesSearch(q); } catch (e) { toast('Erro na busca: ' + e.message); D.res = []; }
  D.loading = false; render();
}

// ---- estatísticas
let period = 'Semana';
function aggStats() {
  const lim = { Semana: 7, 'Mês': 30, Ano: 365, Tudo: 1e5 }[period];
  const from = dayKey(new Date(now() - (lim - 1) * 864e5));
  const prevFrom = dayKey(new Date(now() - (2 * lim - 1) * 864e5));
  const A2 = { s: 0, m: 0, e: 0, prev: 0, f: {}, heat: Array.from({ length: 7 }, () => Array(12).fill(0)), days: {} };
  for (const dev of Object.values(db.stats)) for (const [k, d] of Object.entries(dev.days || {})) {
    A2.days[k] = (A2.days[k] || 0) + d.s;
    if (k >= from) { A2.s += d.s; A2.m += d.m; A2.e += d.e; for (const [f, s] of Object.entries(d.f || {})) A2.f[f] = (A2.f[f] || 0) + s; const dow = (new Date(k + 'T12:00').getDay() + 6) % 7; (d.h || []).forEach((v, h) => A2.heat[dow][h >> 1] += v); }
    else if (k >= prevFrom && lim < 1e5) A2.prev += d.s;
  }
  let streak = 0; for (let i = 0; ; i++) { const k = dayKey(new Date(now() - i * 864e5)); if ((A2.days[k] || 0) >= 60) streak++; else if (i > 0) break; if (i > 3650) break; }
  A2.streak = streak; A2.snips = db.snips.filter(s => dayKey(new Date(s.created)) >= from).length;
  return A2;
}
V.stats = () => {
  const a = aggStats();
  const saved = Math.max(0, a.m - a.s);
  const top = Object.entries(a.f).sort((x, y) => y[1] - x[1]);
  const maxF = top[0] ? top[0][1] : 1;
  const people = {}; top.forEach(([f, s]) => { const au = (sub(f) || {}).author || 'Desconhecido'; people[au] = (people[au] || 0) + s; });
  const cats = {}; top.forEach(([f, s]) => { const c = (sub(f) || {}).cat || 'Outros'; cats[c] = (cats[c] || 0) + s; });
  const catList = Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 5); const catTot = catList.reduce((x, c) => x + c[1], 0) || 1;
  const hmax = Math.max(1, ...a.heat.flat());
  const lv = v => v === 0 ? '#1A1D23' : v / hmax > 0.75 ? 'var(--acc)' : v / hmax > 0.4 ? '#B08236' : v / hmax > 0.15 ? '#6E5428' : '#3A3020';
  let best = [0, 0, 0]; a.heat.forEach((r, d) => r.forEach((v, b) => { if (v > best[0]) best = [v, d, b]; }));
  const delta = period !== 'Tudo' && a.prev ? Math.round((a.s - a.prev) / a.prev * 100) : null;
  const dec = new Date().getMonth() === 11;
  return `<div class="page">
    <h1>Estatísticas</h1>
    <div class="seg" style="max-width:460px">${['Semana', 'Mês', 'Ano', 'Tudo'].map(p => `<button class="${p === period ? 'on' : ''}" data-a="period" data-x="${p}">${p}</button>`).join('')}</div>
    ${!a.s ? '<div class="card empty"><b>Ainda sem dados</b><span class="mut" style="font-size:13px">Ouça alguns episódios e suas estatísticas aparecem aqui.</span></div>' : `
    <div class="bento">
      <div class="card span2" style="display:flex;flex-direction:column;gap:4px;padding:20px"><span class="mut" style="font-size:13px">Tempo ouvindo</span><span style="font-size:44px;font-weight:700;letter-spacing:-.04em">${fmtH(a.s)}</span>${delta != null ? `<span style="font-size:13px;color:${delta >= 0 ? 'var(--ok)' : 'var(--mut)'}">${delta >= 0 ? '+' : ''}${delta}% que o período anterior</span>` : ''}</div>
      <div class="card span2" style="display:flex;flex-direction:column;gap:6px;padding:20px"><span class="mut" style="font-size:13px">Tempo economizado com a velocidade</span><span style="font-size:34px;font-weight:700;letter-spacing:-.03em;color:var(--acc)">${fmtH(saved)}</span><span class="mut" style="font-size:12px">Você ouviu ${fmtH(a.m)} de áudio em ${fmtH(a.s)}</span></div>
      <div class="card"><b style="font-size:24px">${a.e}</b><div class="mut" style="font-size:12px">episódios concluídos</div></div>
      <div class="card"><b style="font-size:24px">${a.streak}</b><div class="mut" style="font-size:12px">dias seguidos</div></div>
      <div class="card"><b style="font-size:24px">${a.snips}</b><div class="mut" style="font-size:12px">momentos salvos</div></div>
      <div class="card"><b style="font-size:24px">${top.length}</b><div class="mut" style="font-size:12px">podcasts diferentes</div></div>
    </div>
    <div class="two">
      <section class="card" style="padding:18px"><div class="sect"><h2 style="font-size:16px">Quando você ouve</h2><span class="mut" style="font-size:12px">dia × horário</span></div>
        <div style="display:flex;flex-direction:column;gap:3px">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => `<div class="heat"><span class="mut" style="font-size:10px">${d}</span>${a.heat[i].map(v => `<span class="c" style="background:${lv(v)}"></span>`).join('')}</div>`).join('')}
        <div class="heat" style="margin-top:4px"><span></span><span class="mut" style="font-size:9px;grid-column:span 3">0h</span><span class="mut" style="font-size:9px;grid-column:span 3">6h</span><span class="mut" style="font-size:9px;grid-column:span 3">12h</span><span class="mut" style="font-size:9px;grid-column:span 3">18h</span></div></div>
        <p class="mut" style="font-size:12px;margin-top:12px">Seu horário forte: ${['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'][best[1]]}, entre ${best[2] * 2}h e ${best[2] * 2 + 2}h.</p></section>
      <section><div class="sect"><h2 style="font-size:16px">O que você ouviu</h2></div><div style="display:flex;flex-direction:column;gap:14px">${top.slice(0, 6).map(([f, s]) => { const p = sub(f) || { title: 'Podcast removido' }; return `<div class="row">${cov(p.image, p.title, '42px', '12px', 10)}<div style="flex:1;display:flex;flex-direction:column;gap:6px;min-width:0"><div class="row" style="justify-content:space-between;font-size:13px"><b class="ell" style="font-weight:600">${esc(p.title)}</b><span class="mut">${fmtH(s)}</span></div><div style="height:6px;border-radius:3px;background:#1D2027"><div style="height:6px;border-radius:3px;width:${s / maxF * 100}%;background:${colorOf(p.title)}"></div></div></div></div>`; }).join('')}</div>
        <div class="sect" style="margin-top:26px"><h2 style="font-size:16px">De quem você ouviu</h2></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">${Object.entries(people).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n, s]) => `<div class="card row" style="padding:10px;border-radius:16px;gap:10px"><span style="width:34px;height:34px;border-radius:17px;background:${colorOf(n)};color:#0C0D10;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0">${esc(initials(n))}</span><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span class="ell" style="font-size:13px;font-weight:600">${esc(n)}</span><span class="mut" style="font-size:11px">${fmtH(s)}</span></span></div>`).join('')}</div></section>
    </div>
    <section class="card" style="display:flex;flex-direction:column;gap:12px"><h2 style="font-size:16px">Por categoria</h2><div class="bars">${catList.map(([c, s]) => `<div style="width:${s / catTot * 100}%;background:${colorOf(c)}"></div>`).join('')}</div><div class="wrapchips" style="font-size:12px;color:#C7CCD6;gap:14px">${catList.map(([c, s]) => `<span class="row" style="gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${colorOf(c)}"></span>${esc(c)} · ${Math.round(s / catTot * 100)}%</span>`).join('')}</div></section>`}
    <section style="border-radius:26px;background:#17131F;border:1px solid #2A2238;padding:22px;display:flex;flex-direction:column;gap:8px"><span class="lbl" style="color:#C3A6E6">Retrospectiva ${new Date().getFullYear()}</span><h2 style="font-size:22px">Seu ano em podcasts</h2>${dec ? `<button class="btn pri" style="align-self:flex-start" data-a="wrapped">Ver minha retrospectiva</button>` : `<p style="font-size:13px;color:#B9AFC9;line-height:1.5">Disponível em dezembro: seus programas do ano, quem você mais ouviu e quanto tempo economizou. Tudo calculado no aparelho.</p>`}</section>
    <p class="mut" style="font-size:12px">As estatísticas ficam nos seus aparelhos e no seu Google Drive. Você pode desligar em Ajustes.</p>
  </div>`;
};

// ---- ajustes
const row = (t, sub2, ctl) => `<div class="setr"><span class="tx"><b>${t}</b>${sub2 ? `<small>${sub2}</small>` : ''}</span>${ctl}</div>`;
const sw = (k, label) => `<button class="sw ${db.set[k] ? 'on' : ''}" role="switch" aria-checked="${!!db.set[k]}" aria-label="${esc(label)}" data-a="setToggle" data-x="${k}"><span></span></button>`;
const sel = (k, opts) => `<select class="sel" data-c="set" data-k="${k}">${opts.map(([v, t]) => `<option value="${v}" ${String(db.set[k]) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
const act = (label, a, x) => `<button class="btn sm" data-a="${a}" ${x != null ? `data-x="${x}"` : ''}>${label}</button>`;
let dlSize = null;
V.set = () => {
  if (dlSize == null) inv('downloads_size').then(n => { dlSize = n; if (view === 'set') render(); }).catch(() => { dlSize = 0; });
  const g = GD.on();
  const groups = [
    ['Conta e sincronização', [
      g ? row('Google Drive', esc(GD.email || 'Conectado') + (GD.last ? ' · sincronizado ' + fmtDate(GD.last) + ' às ' + new Date(GD.last).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + (GD.err ? '<br><span style="color:#E07A5F">' + esc(GD.err) + '</span>' : ''), act(GD.busy ? 'Sincronizando…' : 'Sincronizar', 'gdSync')) : row('Entrar com Google', GD.ready() ? 'Guarda inscrições, fila, progresso, momentos e estatísticas numa pasta privada do app no seu Drive. É assim que o celular e o PC ficam iguais.' : 'O acesso do Google ainda não foi configurado nesta versão (veja o README do projeto).', GD.ready() ? act('Entrar', 'gdLogin') : ''),
      g ? row('Sair da conta', 'Os dados continuam neste aparelho', act('Sair', 'gdLogout')) : ''
    ]],
    ['Reprodução', [
      row('Velocidade padrão', 'Cada podcast pode ter a sua', sel('speed', [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3].map(v => [v, String(v).replace('.', ',') + '×']))),
      row('Voltar', '', sel('back', [5, 10, 15, 30].map(v => [v, v + ' s']))),
      row('Avançar', '', sel('fwd', [10, 15, 30, 45, 60].map(v => [v, v + ' s']))),
      row('Reprodução contínua', 'Toca o próximo da fila ao terminar', sw('cont', 'Reprodução contínua')),
      row('Voltar 5 s ao retomar', 'Depois de pausas maiores que 1 minuto', sw('resume5', 'Voltar 5 s ao retomar'))
    ]],
    ['Caixa de entrada e fila', [
      row('Usar caixa de entrada', 'Desligado, os episódios novos vão direto para a fila', sw('inbox', 'Usar caixa de entrada')),
      row('Arquivar da caixa de entrada', 'Episódios esquecidos saem sozinhos', sel('archDays', [[0, 'Nunca'], [7, 'Após 7 dias'], [14, 'Após 14 dias'], [30, 'Após 30 dias']]))
    ]],
    ['Downloads', [
      row('Apagar depois de ouvido', '', sw('delPlayed', 'Apagar depois de ouvido')),
      row('Manter por podcast', 'Downloads mais antigos são apagados', sel('keep', [[0, 'Todos'], [1, 'Último'], [3, 'Últimos 3'], [5, 'Últimos 5'], [10, 'Últimos 10']])),
      row('Espaço usado', dlSize == null ? '…' : (dlSize / 1048576).toFixed(0) + ' MB', act('Apagar todos', 'dlClear'))
    ]],
    ['Biblioteca e feeds', [
      row('Atualizar ao abrir', '', sw('refreshStart', 'Atualizar ao abrir')),
      row('Atualizar agora', Object.keys(db.subs).length + ' podcasts', act('Atualizar', 'refresh')),
      row('Importar XML / OPML', 'Inscrições de outro app ou o XML (RSS) de um podcast', act('Importar', 'opmlImport')),
      row('Exportar OPML', 'Backup das inscrições', act('Exportar', 'opmlExport')),
      row('País das buscas e rankings', '', sel('country', [['br', 'Brasil'], ['pt', 'Portugal'], ['us', 'Estados Unidos']]))
    ]],
    ['Momentos', [
      row('Exportar momentos', db.snips.length + ' salvos · Markdown, pronto para o Obsidian', act('Exportar', 'snipExport'))
    ]],
    ['Aparência', [
      row('Cor de destaque', '', `<span class="row" style="gap:8px">${['#F5B544', '#C8F169', '#4FB3BF', '#B48EE0', '#E26D9A'].map(c => `<button aria-label="Cor ${c}" data-a="accent" data-x="${c}" style="width:30px;height:30px;border-radius:15px;background:${c};border:${db.set.accent === c ? '3px solid #F3F4F6' : '0'}"></button>`).join('')}</span>`),
      row('Aba inicial', '', sel('tab', TABS.map(([k, t]) => [k, t])))
    ]],
    ['Privacidade', [
      row('Registrar estatísticas', 'Usadas pela aba Estatísticas e pelas sugestões', sw('stats', 'Registrar estatísticas')),
      row('Apagar estatísticas', '', act('Apagar', 'statsClear')),
      row('Apagar todos os dados', 'Inscrições, fila, histórico e ajustes deste aparelho', act('Apagar tudo', 'wipe'))
    ]],
    ['Em breve', [
      row('Cortar silêncio e realçar voz', 'Precisam de processamento de áudio nativo; chegam numa próxima versão', ''),
      row('Transcrição gerada no aparelho', 'Por enquanto, só quando o podcast publica a transcrição', '')
    ]]
  ];
  return `<div class="page"><h1>Ajustes</h1><div class="sets">${groups.map(([t, rows]) => `<section style="display:flex;flex-direction:column;gap:8px"><h2 class="lbl" style="padding:0 4px">${t}</h2><div class="setg">${rows.join('')}</div></section>`).join('')}</div>
    <p class="mut" style="font-size:12px;text-align:center">Podcast ${esc(window.BUILD.v)} · <button class="link" data-a="url" data-x="https://github.com/rafaelpalvador/podcast-app/releases">novidades e downloads</button></p></div>`;
};

// ---- player
V.player = () => {
  const e = ep(db.cur);
  if (!e) return `<div class="page"><button class="ib" data-a="back" aria-label="Voltar">${I.down}</button><div class="card empty"><span class="mut">Nada tocando agora.</span></div></div>`;
  const x = X[db.cur] || { ch: [], tr: [], loading: true };
  const d = A.duration || e.dur || 0;
  const ci = curIdx(x.ch);
  const tabs = [['ch', 'Capítulos'], ['tr', 'Transcrição'], ['sn', 'Momentos'], ['nt', 'Notas']];
  const mySnips = db.snips.filter(s => s.ep === db.cur);
  const sp = String(A.playbackRate || 1).replace('.', ',');
  let body = '';
  if (ptab === 'ch') body = x.ch.length ? x.ch.map((c, i) => `<button class="chap ${i === ci ? 'cur' : ''}" data-i="${i}" data-a="seekTo" data-x="${c.at}"><span style="font-size:12px;width:52px;color:#A9C6C9">${fmtT(c.at)}</span><span style="flex:1">${esc(c.t)}</span></button>`).join('') : `<p style="color:#A9C6C9;font-size:14px">${x.loading ? 'Carregando…' : 'Este episódio não tem capítulos.'}</p>`;
  if (ptab === 'tr') body = x.tr.length ? `<span style="font-size:12px;color:#A9C6C9">Toque numa frase para pular até ela</span>` + x.tr.map((c, i) => `<p class="cue" data-i="${i}" ${c.at >= 0 ? `data-a="seekTo" data-x="${c.at}"` : ''}>${c.who ? `<small>${esc(c.who)}</small>` : ''}${esc(c.t)}</p>`).join('') : `<p style="color:#A9C6C9;font-size:14px">${x.loading ? 'Carregando…' : 'Este podcast não publica transcrição.'}</p>`;
  if (ptab === 'sn') body = (mySnips.map(s => snipCard(s, true).replace('flex:0 0 260px', 'width:100%')).join('') || '') + `<p style="font-size:12px;color:#A9C6C9">Salve um trecho com o botão abaixo do player. Os momentos podem ser exportados em Markdown.</p>`;
  if (ptab === 'nt') body = `<p style="font-size:14px;line-height:1.6;color:#D4E3E4;white-space:pre-line">${esc(e.desc || 'Sem descrição.')}</p>${e.link ? `<button class="btn sm" data-a="url" data-x="${esc(e.link)}">Abrir página do episódio</button>` : ''}`;
  return `<div class="page" style="gap:20px">
    <header class="row" style="justify-content:space-between"><button class="ib" style="background:#15302F" data-a="back" aria-label="Fechar player">${I.down}</button><span class="lbl" style="color:#8FD8E0">${db.queue.length ? db.queue.length + ' na fila' : 'Tocando'}</span><button class="ib" style="background:#15302F" data-a="epinfo" data-x="${db.cur}" aria-label="Mais opções">${I.more}</button></header>
    <div class="pl"><div class="plL">
      ${cov(epImg(e), feedTitle(e.feed), '100%', '30px', 44).replace('width:100%;height:100%', 'width:100%;max-width:340px;aspect-ratio:1;align-self:center')}
      <div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:13px;color:#8FD8E0;font-weight:600" id="chlabel">${ci >= 0 ? 'Capítulo ' + (ci + 1) + ' · ' + esc(x.ch[ci].t) : ''}</span><h1 style="font-size:23px;line-height:1.2">${esc(e.title)}</h1><button class="link" style="text-align:left;color:#A9C6C9;font-size:14px" data-a="go" data-x="show" data-y="${esc(e.feed)}">${esc(feedTitle(e.feed))}</button></div>
      <div style="display:flex;flex-direction:column;gap:6px"><div class="scrub" data-a="seek"><span class="trk"></span><span class="fill" id="pfill"></span>${d ? x.ch.map(c => `<span class="mk" style="left:${c.at / d * 100}%"></span>`).join('') : ''}<span class="knob" id="pknob"></span></div>
        <div class="row" style="justify-content:space-between;font-size:12px;color:#A9C6C9"><span id="pt1">0:00</span><span id="pt2"></span></div></div>
      <div class="ctrl"><button class="ib ghost" data-a="chap" data-x="-1" aria-label="Capítulo anterior" ${x.ch.length ? '' : 'disabled'}>${I.prevc}</button><button class="ib ghost skip" data-a="skip" data-x="-1" aria-label="Voltar">${I.r15}${db.set.back}</button>
        <button class="big" id="bigplay" data-a="toggle" aria-label="${A.paused ? 'Tocar' : 'Pausar'}">${A.paused ? I.play : I.pause}</button>
        <button class="ib ghost skip" data-a="skip" data-x="1" aria-label="Avançar">${I.f30}${db.set.fwd}</button><button class="ib ghost" data-a="chap" data-x="1" aria-label="Próximo capítulo" ${x.ch.length ? '' : 'disabled'}>${I.nextc}</button></div>
      <div class="wrapchips"><button class="pill" data-a="speed">${sp}×</button><button class="pill ${sleep ? 'on' : ''}" data-a="sleep">${I.moon.replace('width="18" height="18"', 'width="14" height="14"')} ${sleep === 'end' ? 'Fim do episódio' : typeof sleep === 'number' ? Math.ceil((sleep - now()) / 60000) + ' min' : 'Timer'}</button><button class="pill" data-a="download" data-x="${db.cur}">${DL[db.cur] ? 'Baixado' : DLING[db.cur] ? 'Baixando…' : 'Baixar'}</button></div>
      <button class="btn" style="height:52px;border-radius:26px;border-color:#2E5A5C;background:#12292A;font-size:15px" data-a="snip">${I.snip} Salvar este momento</button>
    </div>
    <div class="plR"><div class="ptabs">${tabs.map(([k, t]) => `<button class="${ptab === k ? 'on' : ''}" data-a="ptab" data-x="${k}">${t}</button>`).join('')}</div><div style="display:flex;flex-direction:column;gap:12px">${body}</div></div></div></div>`;
};

// ---------------------------------------------------------------- render
function render() {
  document.documentElement.style.setProperty('--acc', db.set.accent);
  const v = V[view] ? view : 'home';
  $('#main').innerHTML = V[v]();
  $('#main').classList.toggle('tint', v === 'player');
  const at = activeTab();
  $('#side').innerHTML = `<div class="row" style="padding:0 10px 24px;gap:10px">${LOGO(34)}<b style="font-size:20px;letter-spacing:-.03em">Podcast</b></div>
    ${TABS.map(([k, t]) => `<button class="sb ${at === k ? 'on' : ''}" data-a="go" data-x="${k}">${t}${k === 'home' && db.inbox.length ? `<span class="badge">${db.inbox.length}</span>` : ''}</button>`).join('')}
    ${(() => { const fs = [...new Set(Object.values(db.subs).map(s => s.folder).filter(Boolean))].sort(); return fs.length ? '<span class="lbl" style="padding:24px 12px 8px">Pastas</span>' + fs.map(f => `<button class="sb" data-a="folder" data-x="${esc(f)}">${I.folder(colorOf(f))}<span class="ell">${esc(f)}</span></button>`).join('') : ''; })()}
    <span class="lbl" style="padding:20px 12px 8px">Playlists inteligentes</span>
    ${db.smart.map((p, i) => `<button class="sb" data-a="go" data-x="smart" data-y="${p.id}">${I.smart(COLORS[i % COLORS.length])}<span class="ell">${esc(p.name)}</span></button>`).join('')}
    <button class="card row" style="margin-top:auto;padding:12px;border-radius:16px;color:var(--tx);text-align:left;gap:10px" data-a="go" data-x="set"><span style="width:10px;height:10px;border-radius:5px;background:${GD.on() ? (GD.err ? '#E07A5F' : 'var(--ok)') : '#555'}"></span><span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:12px;font-weight:600">${GD.on() ? 'Google Drive' : 'Sem sincronização'}</span><span class="mut ell" style="font-size:11px">${GD.on() ? (GD.busy ? 'Sincronizando…' : GD.last ? 'Sincronizado ' + fmtDate(GD.last).toLowerCase() : 'Conectado') : 'Entrar com Google'}</span></span></button>`;
  $('#tabbar').innerHTML = TABS.map(([k, t]) => `<button class="tb ${at === k ? 'on' : ''}" data-a="go" data-x="${k}"><span class="tbi">${I.tab[k]}${k === 'home' && db.inbox.length ? '<span class="dot"></span>' : ''}</span>${t}</button>`).join('');
  renderBar();
  if (v === 'player') { updBar(); lastCue = -2; lastCh = -2; updLive(); }
}

// ---------------------------------------------------------------- ações
function moveQ(i, d) { const j = i + d; if (j < 0 || j >= db.queue.length) return; [db.queue[i], db.queue[j]] = [db.queue[j], db.queue[i]]; touch('queueT'); save(); render(); }
function epInfo(id) {
  const e = ep(id); if (!e) return;
  const inQ = db.queue.includes(id);
  modal(`<div class="row">${cov(epImg(e), feedTitle(e.feed), '56px', '14px', 12)}<div style="flex:1;min-width:0"><b style="font-size:16px;line-height:1.3;display:block">${esc(e.title)}</b><span class="mut" style="font-size:12px">${esc([feedTitle(e.feed), fmtDate(e.date), fmtD(e.dur)].filter(Boolean).join(' · '))}</span></div></div>
    <div class="wrapchips"><button class="btn pri" data-a="playgo" data-x="${id}">${I.play} Tocar</button>
    ${inQ ? `<button class="btn" data-a="qRemove" data-x="${id}">Tirar da fila</button>` : `<button class="btn" data-a="toQueue" data-x="${id}">+ Fila</button><button class="btn" data-a="toNext" data-x="${id}">Tocar a seguir</button>`}
    ${DL[id] ? `<button class="btn" data-a="dlDel" data-x="${id}">Apagar download</button>` : `<button class="btn" data-a="download" data-x="${id}">${I.dl} Baixar</button>`}
    <button class="btn" data-a="markDone" data-x="${id}">${isDone(id) ? 'Marcar como não ouvido' : 'Marcar como ouvido'}</button></div>
    ${e.desc ? `<p class="mut" style="font-size:14px;line-height:1.55;white-space:pre-line">${esc(e.desc)}</p>` : ''}
    <button class="btn" data-a="close">Fechar</button>`);
}
const ACT = {
  go: (x, b) => { closeModal(); go(x, b.dataset.y != null ? b.dataset.y : null); },
  back: () => { if (history.length > 1) history.back(); else go('home'); },
  close: closeModal,
  url: x => openUrl(x),
  play: x => play(x),
  playgo: x => { closeModal(); play(x); go('player'); },
  toggle,
  skip: x => skip(+x > 0 ? db.set.fwd : -db.set.back),
  seek: (x, b, ev) => { const r = b.getBoundingClientRect(); const d = A.duration || 0; if (d) { A.currentTime = Math.max(0, Math.min(d - 1, (ev.clientX - r.left) / r.width * d)); updBar(); } },
  seekTo: x => { if (+x >= 0) { A.currentTime = +x; if (A.paused) play(db.cur); updBar(); } },
  chap: x => { const c = (X[db.cur] || {}).ch || []; if (!c.length) return; const i = curIdx(c); const j = Math.max(0, Math.min(c.length - 1, i + (+x))); if (+x < 0 && A.currentTime - c[Math.max(i, 0)].at > 3) A.currentTime = c[Math.max(i, 0)].at; else A.currentTime = c[j].at; },
  speed: () => { const L = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.7, 2, 2.5, 3]; const cur = A.playbackRate || 1; const n = L.find(v => v > cur + 0.001) || L[0]; A.playbackRate = n; const s = subOf(db.cur); if (s) { s.ps = s.ps || {}; s.ps.speed = n; s.t = now(); save(); } render(); toast('Velocidade ' + String(n).replace('.', ',') + '×' + (s ? ' para ' + s.title : '')); },
  sleep: () => modal(`<h2>Timer de sono</h2><div class="wrapchips">${[5, 10, 15, 30, 45, 60].map(m => `<button class="btn" data-a="sleepSet" data-x="${m}">${m} min</button>`).join('')}<button class="btn" data-a="sleepSet" data-x="end">Fim do episódio</button>${sleep ? '<button class="btn" data-a="sleepSet" data-x="off">Desligar</button>' : ''}</div><button class="btn" data-a="close">Fechar</button>`),
  sleepSet: x => { sleep = x === 'off' ? null : x === 'end' ? 'end' : now() + x * 60000; if (NP) { NP.pauseAtEnd(sleep === 'end'); NP.sleepIn(typeof sleep === 'number' ? x * 60000 : 0); } closeModal(); render(); toast(sleep ? 'Timer de sono ligado' : 'Timer desligado'); },
  snip: saveSnip,
  snipPlay: x => { const s = db.snips.find(y => y.id === x); if (s) { play(s.ep, Math.max(0, s.at - 20)); go('player'); } },
  snipExport: async () => { if (!db.snips.length) { toast('Nenhum momento salvo ainda'); return; } const md = snipsMarkdown(); const okc = await copy(md); try { const p = await inv('save_text', { name: 'momentos-podcast.md', text: md }); toast('Salvo em ' + p + (okc ? ' e copiado' : ''), 5000); } catch (e) { toast(okc ? 'Momentos copiados em Markdown' : 'Não consegui exportar: ' + e, 4000); } },
  ptab: x => { ptab = x; render(); },
  download: x => download(x),
  dlDel: x => { closeModal(); delDownload(x); },
  markDone: x => { closeModal(); if (isDone(x)) delete db.prog[x]; else { db.prog[x] = { pos: 0, dur: (ep(x) || {}).dur || 0, t: now(), done: true }; db.inbox = db.inbox.filter(y => y !== x); db.queue = db.queue.filter(y => y !== x); touch('inboxT'); touch('queueT'); } save(); render(); },
  toQueue: x => { closeModal(); db.inbox = db.inbox.filter(y => y !== x); if (!db.queue.includes(x)) db.queue.push(x); touch('inboxT'); touch('queueT'); save(); render(); toast('Adicionado à fila'); },
  toNext: x => { closeModal(); db.inbox = db.inbox.filter(y => y !== x); db.queue = [x, ...db.queue.filter(y => y !== x)]; touch('inboxT'); touch('queueT'); save(); render(); toast('Toca a seguir'); },
  archive: x => { db.inbox = db.inbox.filter(y => y !== x); db.archived[x] = now(); touch('inboxT'); save(); render(); },
  inboxClear: () => { db.inbox.forEach(x => db.archived[x] = now()); db.inbox = []; touch('inboxT'); save(); render(); toast('Caixa de entrada arquivada'); },
  qUp: x => moveQ(+x, -1), qDown: x => moveQ(+x, 1),
  qDel: x => { db.queue.splice(+x, 1); touch('queueT'); save(); render(); },
  qRemove: x => { closeModal(); db.queue = db.queue.filter(y => y !== x); touch('queueT'); save(); render(); },
  epinfo: x => epInfo(x),
  refresh: () => refreshAll(true),
  refreshOne: async x => { toast('Atualizando…'); try { const n = await refreshFeed(x); save(); render(); toast(n ? n + ' novo(s)' : 'Tudo em dia'); } catch (e) { toast('Erro: ' + e.message); } },
  sub: (x, b) => subscribe(x, b.dataset.y ? { gid: +b.dataset.y } : null),
  subIt: async x => { try { await subscribe(await feedFromItunes(x)); } catch (e) { toast('Não consegui seguir: ' + e.message); } },
  preview: x => go('show', x),
  previewIt: async x => { toast('Abrindo…'); try { go('show', await feedFromItunes(x)); } catch (e) { toast('Não consegui abrir: ' + e.message); } },
  unsub: x => modal(`<h2>Deixar de seguir?</h2><p class="mut">${esc((sub(x) || {}).title)} sai da biblioteca, da fila e da caixa de entrada. Os downloads são apagados.</p><div class="wrapchips"><button class="btn pri" data-a="unsubYes" data-x="${esc(x)}">Deixar de seguir</button><button class="btn" data-a="close">Cancelar</button></div>`),
  unsubYes: x => { closeModal(); unsubscribe(x); },
  setFolder: x => { const s = sub(x); const fs = [...new Set(Object.values(db.subs).map(y => y.folder).filter(Boolean))]; modal(`<h2>Pasta</h2><input class="txt" id="fname" list="flist" placeholder="Ex.: Tecnologia" value="${esc(s.folder || '')}"><datalist id="flist">${fs.map(f => `<option value="${esc(f)}">`).join('')}</datalist><div class="wrapchips">${fs.map(f => `<button class="chip" data-a="fpick" data-x="${esc(f)}">${esc(f)}</button>`).join('')}</div><div class="wrapchips"><button class="btn pri" data-a="folderSave" data-x="${esc(x)}">Salvar</button>${s.folder ? `<button class="btn" data-a="folderSave" data-x="${esc(x)}" data-y="none">Tirar da pasta</button>` : ''}<button class="btn" data-a="close">Cancelar</button></div>`); },
  fpick: x => { $('#fname').value = x; },
  folderSave: (x, b) => { const s = sub(x); s.folder = b.dataset.y === 'none' ? '' : $('#fname').value.trim(); s.t = now(); closeModal(); save(); render(); },
  folder: x => { libFilter = 'pod'; libFolder = libFolder === x && view === 'lib' ? '' : x; go('lib'); render(); },
  folderAll: () => { libFolder = ''; render(); },
  libF: x => { libFilter = x; render(); },
  psToggle: (x, b) => { const s = sub(x); s.ps = s.ps || {}; s.ps[b.dataset.y] = !s.ps[b.dataset.y]; s.t = now(); save(); render(); },
  psDest: (x, b) => { const s = sub(x); s.ps = s.ps || {}; s.ps.dest = b.dataset.y || null; s.t = now(); save(); render(); },
  more: () => { showMore += 40; render(); },
  addRss: () => modal(`<h2>Adicionar por link</h2><p class="mut" style="font-size:13px">Cole o endereço RSS do podcast.</p><input class="txt" id="rssurl" placeholder="https://…" inputmode="url"><div class="wrapchips"><button class="btn pri" data-a="rssGo">Abrir</button><button class="btn" data-a="opmlImport">Importar arquivo XML</button><button class="btn" data-a="close">Cancelar</button></div>`),
  rssGo: () => { const u = $('#rssurl').value.trim(); if (!/^https?:\/\//.test(u)) { toast('Cole um link que comece com http'); return; } closeModal(); go('show', u); },
  genre: async x => { D.genre = D.genre == x ? null : +x; render(); if (D.genre) { await topChart(D.genre); render(); } },
  clearSearch: () => { D.q = ''; D.res = null; render(); },
  period: x => { period = x; render(); },
  wrapped: () => { const save0 = period; period = 'Ano'; const a = aggStats(); period = save0; const top = Object.entries(a.f).sort((x, y) => y[1] - x[1]).slice(0, 5); modal(`<span class="lbl" style="color:#C3A6E6">Retrospectiva ${new Date().getFullYear()}</span><h2 style="font-size:26px">${fmtH(a.s)} ouvindo podcasts</h2><p class="mut">${a.e} episódios concluídos · ${fmtH(Math.max(0, a.m - a.s))} economizadas · ${db.snips.length} momentos salvos</p><div style="display:flex;flex-direction:column;gap:10px">${top.map(([f, s], i) => `<div class="row"><b style="width:20px">${i + 1}</b>${cov((sub(f) || {}).image, (sub(f) || {}).title, '40px', '10px', 10)}<span style="flex:1" class="ell">${esc((sub(f) || {}).title || '')}</span><span class="mut">${fmtH(s)}</span></div>`).join('')}</div><button class="btn" data-a="close">Fechar</button>`); },
  setToggle: x => { db.set[x] = !db.set[x]; touch('setT'); if (NP && x === 'cont') syncNativeQueue(); save(); render(); },
  accent: x => { db.set.accent = x; touch('setT'); save(); render(); },
  dlClear: async () => { for (const id of Object.keys(DL)) await delDownload(id, true); dlSize = null; render(); toast('Downloads apagados'); },
  statsClear: () => { db.stats = {}; save(); render(); toast('Estatísticas apagadas'); },
  wipe: () => modal(`<h2>Apagar todos os dados?</h2><p class="mut">Isso apaga tudo deste aparelho. Se você usa o Google Drive, os dados de lá continuam e voltam ao entrar de novo.</p><div class="wrapchips"><button class="btn pri" data-a="wipeYes">Apagar tudo</button><button class="btn" data-a="close">Cancelar</button></div>`),
  wipeYes: async () => { await ACT.dlClear(); localStorage.removeItem('pc:db'); localStorage.removeItem('pc:gd'); location.hash = ''; location.reload(); },
  opmlImport: () => modal(`<h2>Importar XML de podcasts</h2><p class="mut" style="font-size:13px;line-height:1.5">Aceita a <b>lista de inscrições</b> exportada de outro app (OPML / XML do AntennaPod, Pocket Casts, Podcast Addict, Apple Podcasts…) e também o <b>XML (RSS) de um podcast</b>. Pode escolher vários arquivos de uma vez ou colar o conteúdo.</p><input type="file" multiple accept=".opml,.xml,.rss,text/xml,application/xml,application/rss+xml,text/x-opml" id="opmlfile" class="txt" style="padding:8px;height:auto"><textarea class="txt" id="opmltext" placeholder="…ou cole o XML aqui"></textarea><div class="wrapchips"><button class="btn pri" data-a="opmlGo">Importar</button><button class="btn" data-a="close">Cancelar</button></div>`),
  opmlGo: async () => { const fs = Array.from($('#opmlfile').files || []); const texts = fs.length ? await Promise.all(fs.map(f => f.text())) : [$('#opmltext').value]; closeModal(); for (const t of texts) await importXml(t); },
  opmlExport: async () => { const x = exportOpml(); const okc = await copy(x); try { const p = await inv('save_text', { name: 'podcasts.opml', text: x }); toast('Salvo em ' + p, 5000); } catch (e) { toast(okc ? 'OPML copiado' : 'Não consegui exportar: ' + e); } },
  smartPlay: x => { const p = db.smart.find(y => y.id === x); const ids = smartIds(p); if (!ids.length) return; db.queue = ids.slice(1); touch('queueT'); play(ids[0]); go('player'); },
  smartNew: () => smartEditor(null),
  smartEdit: x => smartEditor(db.smart.find(y => y.id === x)),
  smartDel: x => { db.smart = db.smart.filter(y => y.id !== x); touch('smartT'); save(); go('lib'); },
  smartSave: x => { const p = x ? db.smart.find(y => y.id === x) : { id: rid() }; Object.assign(p, { name: $('#sm_name').value.trim() || 'Minha playlist', max: +$('#sm_max').value || 0, folder: $('#sm_folder').value, unplayed: $('#sm_un').checked, started: $('#sm_st').checked, dl: $('#sm_dl').checked, recent: +$('#sm_rec').value || 0, days: 0 }); if (!x) db.smart.push(p); touch('smartT'); closeModal(); save(); render(); },
  gdLogin: () => GD.login(), gdLogout: () => GD.logout(), gdSync: () => GD.sync(true)
};
function smartEditor(p) {
  p = p || { name: '', max: 0, folder: '', unplayed: true };
  const fs = [...new Set(Object.values(db.subs).map(s => s.folder).filter(Boolean))];
  const ck = (id, l, v) => `<label class="row" style="gap:10px;font-size:14px"><input type="checkbox" id="${id}" ${v ? 'checked' : ''} style="width:20px;height:20px">${l}</label>`;
  modal(`<h2>${p.id ? 'Editar' : 'Nova'} playlist inteligente</h2><input class="txt" id="sm_name" placeholder="Nome" value="${esc(p.name)}">
    <label class="row" style="justify-content:space-between;font-size:14px">Duração máxima <select class="sel" id="sm_max">${[[0, 'Qualquer'], [15, '15 min'], [25, '25 min'], [40, '40 min'], [60, '1 hora']].map(([v, t]) => `<option value="${v}" ${p.max == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="row" style="justify-content:space-between;font-size:14px">Publicados nos últimos <select class="sel" id="sm_rec">${[[0, 'Qualquer data'], [3, '3 dias'], [7, '7 dias'], [30, '30 dias']].map(([v, t]) => `<option value="${v}" ${p.recent == v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="row" style="justify-content:space-between;font-size:14px">Pasta <select class="sel" id="sm_folder"><option value="">Todas</option>${fs.map(f => `<option ${p.folder === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    ${ck('sm_un', 'Só não ouvidos', p.unplayed)}${ck('sm_st', 'Só começados', p.started)}${ck('sm_dl', 'Só baixados', p.dl)}
    <div class="wrapchips"><button class="btn pri" data-a="smartSave" data-x="${p.id || ''}">Salvar</button><button class="btn" data-a="close">Cancelar</button></div>`);
}
document.addEventListener('click', ev => { const b = ev.target.closest('[data-a]'); if (!b || b.disabled) return; const f = ACT[b.dataset.a]; if (f) { ev.preventDefault(); f(b.dataset.x, b, ev); } });
document.addEventListener('change', ev => {
  const el = ev.target; const c = el.dataset.c; if (!c) return;
  if (c === 'set') { const k = el.dataset.k; const v = el.value; db.set[k] = isNaN(+v) || v === '' ? v : +v; touch('setT'); if (NP && (k === 'back' || k === 'fwd')) NP.setSkip(db.set.back * 1000, db.set.fwd * 1000); if (NP && k === 'cont') syncNativeQueue(); if (k === 'speed' && db.cur && !((subOf(db.cur) || {}).ps || {}).speed) A.playbackRate = +v; if (k === 'country') { D.top = {}; D.forYou = null; } save(); render(); }
  if (c === 'ps') { const s = sub(el.dataset.x); s.ps = s.ps || {}; s.ps[el.dataset.k] = el.value === '' ? null : +el.value; s.t = now(); if (el.dataset.k === 'speed' && db.cur && ep(db.cur).feed === s.url) A.playbackRate = speedFor(ep(db.cur)); save(); }
});
document.addEventListener('keydown', ev => {
  if (ev.target.dataset && ev.target.dataset.k === 'search' && ev.key === 'Enter') { ev.preventDefault(); doSearch(ev.target.value); ev.target.blur(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
  if (ev.key === ' ') { ev.preventDefault(); toggle(); } else if (ev.key === 'ArrowLeft') skip(-db.set.back); else if (ev.key === 'ArrowRight') skip(db.set.fwd);
  else if (ev.key === 'k' && ev.ctrlKey) { ev.preventDefault(); go('disc'); setTimeout(() => $('#q') && $('#q').focus(), 50); }
  else if (ev.key === 'Escape') closeModal();
});

// ---------------------------------------------------------------- OPML
async function importXml(text) {
  text = (text || '').trim(); if (!text) { toast('Nenhum conteúdo para importar'); return; }
  if (/<outline[\s>]/i.test(text) && !/<channel[\s>]/i.test(text)) return importOpml(text);
  if (!/<channel[\s>]/i.test(text)) { toast('Esse arquivo não parece um XML de podcast nem uma lista OPML', 4000); return; }
  let f; try { f = parseFeed(text); } catch (e) { toast(e.message, 4000); return; }
  if (f.self && /^https?:\/\//.test(f.self)) { await subscribe(f.self); return; }
  // sem endereço online no arquivo: entra como podcast local (os episódios continuam tocando pela internet)
  const url = 'arquivo:' + hash(f.title + (f.items[0] ? f.items[0].url : ''));
  if (sub(url)) { toast('Esse podcast já está na biblioteca'); go('show', url); return; }
  db.subs[url] = { url, local: true, title: f.title || 'Podcast importado', author: f.author, image: f.image, desc: f.desc, cat: f.cat, podroll: f.podroll, ps: {}, t: now(), seenAt: now(), folder: '' };
  mergeItems(url, f, db.subs[url]);
  db.subs[url].lastDate = Math.max(0, ...db.subs[url].eps.map(id => db.eps[id].date));
  delete db.gone[url]; save(); go('show', url);
  toast(f.items.length + ' episódios importados de ' + (f.title || 'arquivo XML') + ' (sem endereço online: não atualiza sozinho)', 5000);
}
async function importOpml(text) {
  let urls = [];
  try { const d = new DOMParser().parseFromString(text, 'text/xml'); urls = Array.from(d.getElementsByTagName('outline')).map(o => o.getAttribute('xmlUrl') || o.getAttribute('xmlurl')).filter(Boolean); } catch (e) { }
  urls = [...new Set(urls)].filter(u => !sub(u));
  if (!urls.length) { toast('Nenhum podcast novo encontrado nesse OPML'); return; }
  toast('Importando ' + urls.length + ' podcasts…', 4000);
  let ok = 0;
  for (let i = 0; i < urls.length; i += 4) {
    await Promise.allSettled(urls.slice(i, i + 4).map(async u => { const f = await fetchFeed(u); db.subs[u] = { url: u, title: f.title, author: f.author, image: f.image, desc: f.desc, cat: f.cat, podroll: f.podroll, ps: {}, t: now(), seenAt: now(), folder: '' }; mergeItems(u, f, db.subs[u]); db.subs[u].lastDate = Math.max(0, ...db.subs[u].eps.map(id => db.eps[id].date)); ok++; }));
    save(); render();
  }
  toast(ok + ' de ' + urls.length + ' podcasts importados', 4000);
}
function exportOpml() {
  const x = s => esc(s);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Podcast — inscrições</title></head><body>\n' + Object.values(db.subs).filter(s => !s.local).map(s => `  <outline type="rss" text="${x(s.title)}" title="${x(s.title)}" xmlUrl="${x(s.url)}"/>`).join('\n') + '\n</body></opml>\n';
}

// ---------------------------------------------------------------- Google Drive (pasta privada do app)
const GD = (() => {
  const K = 'pc:gd';
  let st = {}; try { st = JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) { }
  const persist = () => localStorage.setItem(K, JSON.stringify({ tok: st.tok, email: st.email, last: st.last, fid: st.fid }));
  const client = () => { try { const c = JSON.parse(localStorage.getItem('pc:gclient') || 'null'); if (c && c.id) return c; } catch (e) { } return window.GOOGLE || {}; };
  const form = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  const b64u = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const api = {
    get email() { return st.email; }, get last() { return st.last; }, get err() { return st.err; }, get busy() { return st.busy; },
    on: () => !!st.tok, ready: () => !!client().id
  };
  async function login() {
    const c = client(); if (!c.id) { toast('Acesso do Google não configurado'); return; }
    const ver = b64u(crypto.getRandomValues(new Uint8Array(48))), chal = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)))), state = b64u(crypto.getRandomValues(new Uint8Array(12)));
    const port = await inv('oauth_listen'), redir = 'http://127.0.0.1:' + port;
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + form({ client_id: c.id, redirect_uri: redir, response_type: 'code', scope: 'openid email https://www.googleapis.com/auth/drive.appdata', code_challenge: chal, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', state });
    try { await openUrl(url); } catch (e) { toast('Não consegui abrir o navegador'); return; }
    toast('Entre na sua conta Google no navegador e volte para cá', 5000);
    let got = null; for (let i = 0; i < 600 && !got; i++) { await new Promise(r => setTimeout(r, 1000)); try { got = await inv('oauth_poll'); } catch (e) { } }
    if (!got) { toast('O login não terminou (tempo esgotado)'); return; }
    const q = new URLSearchParams(got.split('?')[1] || ''); if (q.get('error')) { toast('Login cancelado'); return; } if (q.get('state') !== state) { toast('Resposta de login inválida'); return; }
    const r = await http('POST', 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, form({ code: q.get('code'), client_id: c.id, client_secret: c.secret || '', redirect_uri: redir, grant_type: 'authorization_code', code_verifier: ver }));
    const j = JSON.parse(r.text || '{}'); if (!j.refresh_token) { toast('O Google não autorizou: ' + (j.error_description || j.error || r.status), 5000); return; }
    st.tok = { rt: j.refresh_token, at: j.access_token, exp: now() + (j.expires_in - 60) * 1000 };
    try { const pl = JSON.parse(atob(j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); st.email = pl.email || ''; } catch (e) { }
    st.fid = null; persist(); render(); toast('Conectado como ' + (st.email || 'sua conta Google')); sync(true);
  }
  function logout() { st = {}; persist(); render(); toast('Você saiu da conta Google'); }
  async function token(force) {
    if (!st.tok) throw new Error('entre na sua conta de novo');
    if (!force && st.tok.at && now() < st.tok.exp) return st.tok.at;
    const c = client();
    const r = await http('POST', 'https://oauth2.googleapis.com/token', { 'Content-Type': 'application/x-www-form-urlencoded' }, form({ refresh_token: st.tok.rt, client_id: c.id, client_secret: c.secret || '', grant_type: 'refresh_token' }));
    const j = JSON.parse(r.text || '{}');
    if (!j.access_token) { if (j.error === 'invalid_grant') { st.tok = null; persist(); render(); throw new Error('o acesso expirou, entre de novo'); } throw new Error('sem conexão (' + (j.error || r.status) + ')'); }
    st.tok.at = j.access_token; st.tok.exp = now() + (j.expires_in - 60) * 1000; persist(); return st.tok.at;
  }
  async function call(method, url, headers, body) {
    let t = await token(); let r = await http(method, url, Object.assign({ Authorization: 'Bearer ' + t }, headers || {}), body);
    if (r.status === 401) { t = await token(true); r = await http(method, url, Object.assign({ Authorization: 'Bearer ' + t }, headers || {}), body); }
    return r;
  }
  const NAME = 'podcast-dados.json';
  async function fileId() {
    if (st.fid) return st.fid;
    const r = await call('GET', 'https://www.googleapis.com/drive/v3/files?' + form({ spaces: 'appDataFolder', q: "name='" + NAME + "'", fields: 'files(id)' }));
    if (r.status !== 200) throw new Error('Drive respondeu ' + r.status);
    const f = (JSON.parse(r.text).files || [])[0]; st.fid = f ? f.id : null; persist(); return st.fid;
  }
  function merge(R) {
    if (!R || !R.subs) return;
    for (const [u, s] of Object.entries(R.gone || {})) db.gone[u] = Math.max(db.gone[u] || 0, s);
    for (const [u, s] of Object.entries(R.subs)) { const m = db.subs[u]; if (!m || (s.t || 0) > (m.t || 0)) db.subs[u] = Object.assign({}, m || {}, s, { eps: (m && m.eps) || s.eps || [] }); }
    for (const [u, t] of Object.entries(db.gone)) if (db.subs[u] && (db.subs[u].t || 0) < t) delete db.subs[u];
    for (const [id, e] of Object.entries(R.eps || {})) if (!db.eps[id]) db.eps[id] = e;
    for (const s of Object.values(db.subs)) if (!s.eps || !s.eps.length) s.eps = Object.values(db.eps).filter(e => e.feed === s.url).sort((a, b) => b.date - a.date).map(e => e.id);
    for (const [id, p] of Object.entries(R.prog || {})) if (!db.prog[id] || (p.t || 0) > (db.prog[id].t || 0)) db.prog[id] = p;
    Object.assign(db.archived, R.archived || {});
    const L = R.lists || {};
    if ((L.inboxT || 0) > db.lists.inboxT) { db.inbox = R.inbox || []; db.lists.inboxT = L.inboxT; }
    if ((L.queueT || 0) > db.lists.queueT) { db.queue = (R.queue || []).filter(id => id !== db.cur); db.lists.queueT = L.queueT; }
    if ((L.smartT || 0) > db.lists.smartT) { db.smart = R.smart || db.smart; db.lists.smartT = L.smartT; }
    if ((L.setT || 0) > db.lists.setT) { db.set = Object.assign({}, db.set, R.set || {}); db.lists.setT = L.setT; }
    Object.assign(db.snipGone, R.snipGone || {});
    const ids = new Set(db.snips.map(s => s.id)); (R.snips || []).forEach(s => { if (!ids.has(s.id)) db.snips.push(s); });
    db.snips = db.snips.filter(s => !db.snipGone[s.id]).sort((a, b) => b.created - a.created);
    for (const [dev, s] of Object.entries(R.stats || {})) if (dev !== DEV && (!db.stats[dev] || (s.t || 0) > (db.stats[dev].t || 0))) db.stats[dev] = s;
  }
  async function sync(manual) {
    if (!st.tok || st.busy) return; st.busy = true; st.err = ''; if (view === 'set') render();
    try {
      const id = await fileId();
      if (id) { const r = await call('GET', 'https://www.googleapis.com/drive/v3/files/' + id + '?alt=media'); if (r.status === 200) merge(JSON.parse(r.text || '{}')); else if (r.status === 404) { st.fid = null; } }
      const payload = JSON.stringify(Object.assign({}, db, { cur: null, v: 1 }));
      if (st.fid) { const r = await call('PATCH', 'https://www.googleapis.com/upload/drive/v3/files/' + st.fid + '?uploadType=media', { 'Content-Type': 'application/json' }, payload); if (r.status >= 300) throw new Error('envio falhou (' + r.status + ')'); }
      else {
        const bd = 'pcb' + rid();
        const body = '--' + bd + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: NAME, parents: ['appDataFolder'] }) + '\r\n--' + bd + '\r\nContent-Type: application/json\r\n\r\n' + payload + '\r\n--' + bd + '--';
        const r = await call('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { 'Content-Type': 'multipart/related; boundary=' + bd }, body);
        if (r.status >= 300) throw new Error('envio falhou (' + r.status + ')'); st.fid = JSON.parse(r.text).id;
      }
      st.last = now(); persist(); localStorage.setItem('pc:db', JSON.stringify(db)); if (manual) toast('Sincronizado');
    } catch (e) { st.err = 'Erro: ' + e.message; if (manual) toast('Sincronização: ' + e.message, 4000); }
    st.busy = false; render();
  }
  let sT;
  const schedule = () => { if (!st.tok) return; clearTimeout(sT); sT = setTimeout(() => sync(false), 45000); };
  return Object.assign(api, { login, logout, sync, schedule });
})();

// ---------------------------------------------------------------- início
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && NP) { A.poll(); ingestListen(); podAction(); render(); } if (document.visibilityState === 'hidden') { savePos(); localStorage.setItem('pc:db', JSON.stringify(db)); if (GD.on()) GD.sync(false); } });
window.addEventListener('beforeunload', () => { savePos(); localStorage.setItem('pc:db', JSON.stringify(db)); });
(async function start() {
  if (!location.hash) history.replaceState(null, '', '#/' + (db.set.tab || 'home'));
  setRoute();
  if (NP) {
    NP.setSkip(db.set.back * 1000, db.set.fwd * 1000);
    A.poll(); ingestListen();
    if (NP.alive()) { if (A.st.id && ep(A.st.id)) db.cur = A.st.id; }
    else if (db.cur && ep(db.cur)) { const e = ep(db.cur); NP.load(JSON.stringify({ items: [await nativeItem(db.cur)], startMs: Math.round(posOf(db.cur) * 1000), speed: speedFor(e), play: false })); A.st = { id: db.cur, pos: posOf(db.cur) * 1000, dur: (e.dur || 0) * 1000, playing: false, speed: speedFor(e) }; }
    if (db.cur) loadExtras(db.cur);
    render(); podAction(); pushWidget();
  } else if (db.cur && ep(db.cur)) { // prepara o último episódio sem tocar
    const e = ep(db.cur); A.src = e.url; pendingSeek = posOf(db.cur); setMedia(e); loadExtras(db.cur);
    if (DL[db.cur]) inv('download_path', { name: fileName(e) }).then(p => { if (p && A.paused) { A.src = T.core.convertFileSrc(p); pendingSeek = posOf(db.cur); } }).catch(() => { });
    renderBar();
  }
  if (GD.on()) await GD.sync(false);
  if (db.set.refreshStart && Object.keys(db.subs).length) refreshAll(false);
  setInterval(() => { if (Object.keys(db.subs).length) refreshAll(false); }, 2 * 3600 * 1000);
})();
