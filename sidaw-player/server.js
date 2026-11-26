/* SiDaW Player — local static server + streaming API adapters (Node.js, no dependencies) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
  '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};

function sendJson(res, obj, code = 200) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

function readCreds(req) {
  try {
    const raw = req.headers['x-sidaw-creds'];
    if (!raw) return {};
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
  } catch (_) { return {}; }
}

async function spotifyToken(creds) {
  if (!creds.clientId || !creds.clientSecret) throw new Error('Укажите Spotify Client ID и Client Secret в настройках источников.');
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Spotify не принял ключи (HTTP ${res.status}). Проверьте Client ID и Secret.`);
  const data = await res.json();
  return data.access_token;
}

async function searchSpotify(q, creds) {
  const token = await spotifyToken(creds);
  const u = new URL('https://api.spotify.com/v1/search');
  u.searchParams.set('q', q); u.searchParams.set('type', 'track'); u.searchParams.set('limit', '20');
  const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Ошибка поиска Spotify: HTTP ${res.status}`);
  const data = await res.json();
  const tracks = (data.tracks?.items || []).map((t) => ({
    id: t.id, title: t.name, artist: t.artists?.map((a) => a.name).join(', ') || '—',
    album: t.album?.name || '', cover: t.album?.images?.[0]?.url || t.album?.images?.[1]?.url || '',
    duration: Math.round((t.duration_ms || 30000) / 1000),
    streamUrl: t.preview_url || '',
    preview: !!t.preview_url,
  })).filter((t) => t.streamUrl);
  return {
    ok: true, sourceName: 'Spotify', tracks,
    note: tracks.length ? 'Spotify Web API: доступны 30-секундные превью. Полные треки — Premium + Web Playback SDK.' : 'У этих треков нет preview_url — Spotify не разрешает их превью.',
  };
}

async function soundcloudStreamUrl(trackId, clientId) {
  const u = new URL(`https://api-v2.soundcloud.com/tracks/${encodeURIComponent(trackId)}`);
  u.searchParams.set('client_id', clientId);
  const r = await fetch(u);
  if (!r.ok) return '';
  const t = await r.json();
  const progressive = (t.media?.transcodings || []).find((x) => x.format?.protocol === 'progressive');
  if (!progressive) return '';
  const su = new URL(progressive.url);
  su.searchParams.set('client_id', clientId);
  const sr = await fetch(su);
  if (!sr.ok) return '';
  const stream = await sr.json();
  return stream.url || '';
}

async function searchSoundCloud(q, creds) {
  if (!creds.clientId) throw new Error('Укажите SoundCloud Client ID в настройках источников. О регистрации новых приложений см. инструкцию.');
  const u = new URL('https://api-v2.soundcloud.com/search/tracks');
  u.searchParams.set('q', q); u.searchParams.set('client_id', creds.clientId); u.searchParams.set('limit', '18');
  const res = await fetch(u);
  if (!res.ok) throw new Error(`SoundCloud ответил HTTP ${res.status}. Возможно, client_id недействителен.`);
  const data = await res.json();
  const items = data.collection || [];
  const tracks = await Promise.all(items.map(async (t) => ({
    id: String(t.id), title: t.title, artist: t.user?.username || '—', album: t.label?.name || 'SoundCloud',
    cover: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
    duration: Math.round((t.duration || 0) / 1000),
    streamUrl: await soundcloudStreamUrl(t.id, creds.clientId).catch(() => ''),
    preview: false,
  })));
  const playable = tracks.filter((t) => t.streamUrl);
  return {
    ok: true, sourceName: 'SoundCloud', tracks: playable,
    note: playable.length ? `Найдено ${items.length}, доступно для потокового воспроизведения: ${playable.length}.` : 'Треки найдены, но их потоки закрыты автором или ключом.',
  };
}

function searchVk() {
  throw new Error('VK отключил публичный audio API в 2016 году: сторонние приложения не могут получать ссылки на аудио. Легального способа подключить VK Музыку нет — используйте официальное приложение. Подробнее: https://vk.com/dev.php?method=audio_api');
}
function searchYandex() {
  throw new Error('У Яндекс Музыки нет официального публичного API для сторонних приложений. Мы не используем неофициальные эндпоинты: это нарушает условия сервиса. Если у вас есть корпоративный договор — подключите его через свой бэкенд.');
}

const ADAPTERS = { spotify: searchSpotify, soundcloud: searchSoundCloud, vk: searchVk, yandex: searchYandex };

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  let file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Не найдено. Запустите сервер через: npm run web-server');
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      if (m) {
        const start = Number(m[1]);
        const end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
        res.writeHead(206, {
          'Content-Type': type, 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1,
        });
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === '/api/search') {
    const source = String(u.searchParams.get('source') || '');
    const q = String(u.searchParams.get('q') || '').trim();
    if (!q) return sendJson(res, { ok: false, error: 'Пустой запрос' });
    const adapter = ADAPTERS[source];
    if (!adapter) return sendJson(res, { ok: false, error: 'Неизвестный источник' });
    try {
      const result = await adapter(q, readCreds(req));
      return sendJson(res, Object.assign({ source }, result));
    } catch (err) {
      return sendJson(res, { ok: false, source, error: err.message || String(err) });
    }
  }
  if (u.pathname === '/api/status') {
    return sendJson(res, { ok: true, service: 'SiDaW Player API', adapters: Object.keys(ADAPTERS) });
  }
  return serveStatic(req, res, u.pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SiDaW Player running at http://localhost:${PORT}`);
  console.log(`API status: http://localhost:${PORT}/api/status`);
});
