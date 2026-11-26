/* SiDaW Player v2 — core player, EQ, radio, lyrics, timer, queue, mini-player */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const audio = $('#audio');

  const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const EQ_PRESETS = {
    'Плоский': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Поп': [3, 2, 0, -1, -1, 1, 2, 3, 3, 2],
    'Рок': [5, 4, 2, -1, -2, 1, 3, 4, 4, 3],
    'Джаз': [3, 2, 1, 2, -1, -2, 0, 1, 3, 4],
    'Классика': [4, 3, 2, 0, -2, -2, 0, 2, 4, 4],
    'Электроника': [6, 5, 3, 0, -2, 1, 3, 5, 6, 5],
    'Вокал': [0, 0, -1, -2, 2, 4, 4, 2, 0, 0],
    'Бас+': [8, 7, 5, 2, 0, -1, -2, -2, -1, 0],
    'Ночной': [4, 3, 1, 0, -1, -2, -3, -3, -2, -1],
  };

  const DEMO_TRACKS = [
    { id: 't1', title: 'Утренний свет', artist: 'Aurora Fields', album: 'Morning Light', src: 'assets/audio/morning-light.wav', cover: 'assets/covers/morning-light.svg', duration: 46.8, quality: 'WAV · 22 кГц', gradient: 'linear-gradient(115deg, rgba(58,42,105,.95), rgba(24,28,45,.95) 55%, rgba(30,48,46,.95))' },
    { id: 't2', title: 'Неоновый дождь', artist: 'Luna Wave', album: 'Neon Rain', src: 'assets/audio/neon-rain.wav', cover: 'assets/covers/neon-rain.svg', duration: 40.9, quality: 'WAV · 22 кГц', gradient: 'linear-gradient(115deg, rgba(43,29,107,.95), rgba(31,35,71,.95) 55%, rgba(15,70,83,.95))' },
    { id: 't3', title: 'Полночный город', artist: 'Night Atlas', album: 'Midnight City', src: 'assets/audio/midnight-city.wav', cover: 'assets/covers/midnight-city.svg', duration: 53.3, quality: 'WAV · 22 кГц', gradient: 'linear-gradient(115deg, rgba(19,29,74,.95), rgba(33,42,80,.95) 55%, rgba(75,48,85,.95))' },
    { id: 't4', title: 'Тёплый ветер', artist: 'Solar Drift', album: 'Warm Wind', src: 'assets/audio/warm-wind.wav', cover: 'assets/covers/warm-wind.svg', duration: 36.9, quality: 'WAV · 22 кГц', gradient: 'linear-gradient(115deg, rgba(13,80,86,.95), rgba(23,116,101,.95) 55%, rgba(87,119,63,.95))' },
  ];

  const DEMO_LYRICS = {
    t1: '[0:00] Первый свет на краю окна\n[0:07] Тише шума, просыпается день\n[0:15] Мы собираем осколки тепла\n[0:24] И не спешим уходить\n[0:33] Утро дышит нам в след',
    t2: '[0:00] Дождь по стеклу, неоновый след\n[0:09] Город шепчет на языке огней\n[0:18] Мы идём на свет, сквозь шум и дым\n[0:28] Неоновый дождь, неоновый дождь\n[0:36] Останься здесь, пока не стих',
    t3: '[0:00] Полночь, пустые улицы спят\n[0:10] Только окна смотрят вниз\n[0:21] Город держит нас в своих руках\n[0:31] И не отпускает вспять\n[0:42] До рассвета, до рассвета',
    t4: '[0:00] Тёплый ветер тронул край занавески\n[0:09] Где-то за горизонтом лето\n[0:19] Мы несем с собой этот свет\n[0:29] И каждый миг — как новая песня',
  };

  const DATA_KEY = 'sidaw:data:v2';
  const FILE_DB = 'sidaw-player-files';
  const FILE_STORE = 'audio';
  const DEMO_IDS = new Set(DEMO_TRACKS.map((t) => t.id));
  const state = {
    tracks: [...DEMO_TRACKS], queue: [...DEMO_TRACKS], currentId: DEMO_TRACKS[0].id,
    playing: false, shuffle: false, repeat: 0, view: 'all', top: 'home', query: '',
    favorites: new Set(), playlists: [], counts: {}, lyrics: {},
    volume: 72, muted: false, crossfade: 0, layout: 'list',
    eq: { enabled: false, bands: [...EQ_PRESETS['Плоский']], preamp: 0, preset: 'Плоский' },
    sleep: { endAt: 0, remaining: 0, untilEnd: false, min: 0 },
    mediaKeys: true, scrobble: true,
    streamSource: 'spotify', streamData: null,
  };

  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  };
  const trackById = (id) => state.tracks.find((t) => t.id === id);
  const current = () => trackById(state.currentId);
  const currentIndex = () => state.queue.findIndex((t) => t.id === state.currentId);
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Fisher–Yates: равномерная перестановка без смещения, которого у sort(random - 0.5) не избежать.
  function shuffleArray(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  window.SiDaWToast = toast;

  let savedTracksRaw = [];
  let libraryRestored = false;

  function loadData() {
    try {
      const d = JSON.parse(localStorage.getItem(DATA_KEY) || 'null');
      if (!d) return;
      savedTracksRaw = Array.isArray(d.tracks) ? d.tracks : [];
      state.favorites = new Set(d.favorites || []);
      state.playlists = Array.isArray(d.playlists) && d.playlists.length ? d.playlists : [
        { id: 'p1', name: 'Спокойный фокус', color: '#8f7bff', ids: ['t1', 't3'] },
        { id: 'p2', name: 'Вечерний вайб', color: '#64ddc0', ids: ['t2', 't4'] },
      ];
      state.counts = d.counts || {};
      state.lyrics = d.lyrics || {};
      state.volume = typeof d.volume === 'number' ? d.volume : 72;
      state.crossfade = d.crossfade || 0;
      state.layout = d.layout || 'list';
      state.mediaKeys = d.mediaKeys !== false;
      state.scrobble = d.scrobble !== false;
      if (d.eq) {
        state.eq.enabled = !!d.eq.enabled;
        state.eq.bands = Array.isArray(d.eq.bands) && d.eq.bands.length === BANDS.length ? d.eq.bands : [...EQ_PRESETS['Плоский']];
        state.eq.preamp = d.eq.preamp || 0;
        state.eq.preset = d.eq.preset || 'Плоский';
      }
    } catch (_) { fallbackPlaylists(); }
  }
  function fallbackPlaylists() {
    state.playlists = [
      { id: 'p1', name: 'Спокойный фокус', color: '#8f7bff', ids: ['t1', 't3'] },
      { id: 'p2', name: 'Вечерний вайб', color: '#64ddc0', ids: ['t2', 't4'] },
    ];
  }
  function serializeTrack(t) {
    const copy = { ...t };
    // blob: URL живёт только до перезагрузки; сам файл лежит в IndexedDB под blobId.
    if (t.local) { delete copy.src; copy.blobId = t.blobId || t.id; }
    return copy;
  }
  function saveData() {
    const tracks = libraryRestored
      ? state.tracks.filter((t) => !DEMO_IDS.has(t.id)).map(serializeTrack)
      : savedTracksRaw; // не перетираем медиатеку, пока она не восстановлена
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify({
        favorites: [...state.favorites], playlists: state.playlists, counts: state.counts, lyrics: state.lyrics,
        volume: state.volume, crossfade: state.crossfade, layout: state.layout, mediaKeys: state.mediaKeys,
        scrobble: state.scrobble, eq: state.eq, tracks,
      }));
    } catch (_) { /* приватный режим или переполненное хранилище — работаем в памяти */ }
  }

  let dbPromise;
  function openFileDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) return reject(new Error('IndexedDB недоступен'));
        const req = indexedDB.open(FILE_DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('Не удалось открыть хранилище файлов'));
      }).catch((err) => { dbPromise = null; throw err; });
    }
    return dbPromise;
  }
  async function putAudioFile(id, blob) {
    const db = await openFileDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(FILE_STORE, 'readwrite');
      tx.objectStore(FILE_STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Не удалось сохранить файл'));
    });
  }
  async function getAudioFile(id) {
    const db = await openFileDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Не удалось прочитать файл'));
    });
  }
  async function restoreLibrary() {
    for (const t of savedTracksRaw) {
      if (!t || !t.id || DEMO_IDS.has(t.id)) continue;
      if (t.local) {
        try {
          const blob = await getAudioFile(t.blobId || t.id);
          if (!blob) continue;
          t.src = URL.createObjectURL(blob);
        } catch (_) { continue; } // без доступа к IndexedDB файл просто не восстановится
      } else if (!t.src) continue;
      state.tracks.push(t);
    }
    state.queue = state.tracks.slice();
    if (!trackById(state.currentId)) state.currentId = state.tracks[0]?.id || DEMO_TRACKS[0].id;
    libraryRestored = true;
  }

  loadData();
  if (!state.playlists.length) fallbackPlaylists();

  /* ---------- audio engine ---------- */
  let ctx, sourceNode, preampNode, filters = [], analyser, masterGain;
  let freqData;
  function initGraph() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      sourceNode = ctx.createMediaElementSource(audio);
      preampNode = ctx.createGain();
      filters = BANDS.map((freq, i) => {
        const f = ctx.createBiquadFilter();
        f.type = 'peaking'; f.frequency.value = freq; f.Q.value = 1.1;
        f.gain.value = state.eq.enabled ? state.eq.bands[i] : 0;
        return f;
      });
      analyser = ctx.createAnalyser(); analyser.fftSize = 128; analyser.smoothingTimeConstant = .82;
      freqData = new Uint8Array(analyser.frequencyBinCount);
      masterGain = ctx.createGain();
      masterGain.gain.value = state.muted ? 0 : state.volume / 100;
      sourceNode.connect(preampNode);
      let node = preampNode;
      filters.forEach((f) => { node.connect(f); node = f; });
      node.connect(analyser); analyser.connect(masterGain); masterGain.connect(ctx.destination);
      audio.volume = 1;
      applyEq();
    } catch (_) { ctx = null; }
  }
  function output(nodeValue) {
    if (masterGain) masterGain.gain.value = nodeValue;
    else audio.volume = nodeValue;
  }
  function currentOutput() { return masterGain ? masterGain.gain.value : audio.volume; }
  function applyVolume(persist = true) {
    if (!crossfading) output(state.muted ? 0 : state.volume / 100);
    if (persist) saveData();
    $('#volumeBar').value = state.volume;
    $('#volumeBar').style.setProperty('--pct', `${state.volume}%`);
    $('#volumeValue').textContent = state.volume;
    document.body.classList.toggle('muted', state.muted);
  }
  let crossfading = false;
  let fadeToken = 0;
  let crossfadeStarted = false;
  function fadeTo(target, seconds) {
    const token = ++fadeToken;
    if (!ctx && !masterGain) { output(target); crossfading = false; return; }
    const from = currentOutput();
    if (seconds <= 0 || Math.abs(target - from) < .001) { output(target); crossfading = false; return; }
    crossfading = true;
    const start = performance.now();
    const step = (now) => {
      if (token !== fadeToken) return;
      const p = Math.min(1, (now - start) / (seconds * 1000));
      output(from + (target - from) * p);
      if (p < 1) requestAnimationFrame(step);
      else crossfading = false;
    };
    requestAnimationFrame(step);
  }
  function applyEq() {
    if (!ctx) return;
    preampNode.gain.value = state.eq.enabled ? Math.pow(10, state.eq.preamp / 20) : 1;
    filters.forEach((f, i) => { f.gain.value = state.eq.enabled ? state.eq.bands[i] : 0; });
    drawEqCurve();
  }

  /* ---------- library views ---------- */
  function visibleTracks() {
    let list = state.tracks.slice();
    if (state.view === 'favorites') list = list.filter((t) => state.favorites.has(t.id));
    else if (state.view === 'recent') list = list.reverse().slice(0, 8);
    else if (state.view === 'most') list = list.sort((a, b) => (state.counts[b.id] || 0) - (state.counts[a.id] || 0)).slice(0, 8);
    else if (state.view.startsWith('playlist:')) {
      const pl = state.playlists.find((p) => p.id === state.view.slice(9));
      list = pl ? pl.ids.map(trackById).filter(Boolean) : [];
    }
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q));
    }
    return list;
  }
  function viewInfo() {
    if (state.view === 'favorites') return { title: 'Любимое', section: 'Любимые треки', sub: 'Отмеченные вами композиции' };
    if (state.view === 'recent') return { title: 'Недавние', section: 'Недавно добавленные', sub: 'Последние треки в медиатеке' };
    if (state.view === 'most') return { title: 'Часто слушаете', section: 'Часто слушаете', sub: 'Подборка по истории прослушиваний' };
    if (state.view.startsWith('playlist:')) {
      const pl = state.playlists.find((p) => p.id === state.view.slice(9));
      return { title: pl ? pl.name : 'Плейлист', section: pl ? pl.name : 'Плейлист', sub: pl ? `${pl.ids.length} треков` : '' };
    }
    return { title: 'Главная', section: 'Все треки', sub: 'Ваша коллекция' };
  }

  function rowHtml(t, i, list) {
    const active = t.id === state.currentId;
    const liked = state.favorites.has(t.id);
    return `<div class="track-row${active ? ' active' : ''}" data-id="${escapeHtml(t.id)}" title="Клик — play · ПКМ — меню">
      <div class="track-index"><span class="num">${i + 1}</span><span class="eq${state.playing && active ? ' playing' : ''}"><i></i><i></i><i></i><i></i></span></div>
      <div class="track-main"><img class="cover track-cover" src="${escapeHtml(t.cover || '')}" alt="" /><div class="track-text"><strong>${escapeHtml(t.title)}${t.source ? `<span class="source-chip">${escapeHtml(t.source)}</span>` : ''}</strong><span>${escapeHtml(t.artist)}</span></div></div>
      <div class="track-album">${escapeHtml(t.album || '—')}</div>
      <button class="track-heart${liked ? ' liked' : ''}" data-like="${t.id}" aria-label="Любимое"><svg><use href="#i-heart"/></svg></button>
      <div class="track-duration">${formatTime(t.duration || 0)}</div>
    </div>`;
  }

  function renderTracks() {
    const list = visibleTracks();
    const info = viewInfo();
    $('#viewTitle').textContent = info.title;
    $('#sectionTitle').textContent = info.section;
    $('#sectionSub').textContent = state.query ? `Поиск: «${state.query}»` : info.sub;
    $('#emptyState').hidden = list.length > 0;
    $('#trackList').innerHTML = list.map(rowHtml).join('');
    $('#trackGrid').innerHTML = list.map((t) => `<div class="grid-card" data-id="${escapeHtml(t.id)}"><img src="${escapeHtml(t.cover || '')}" alt="" /><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></div>`).join('');
    $('#countAll').textContent = state.tracks.length;
    $('#countFavorites').textContent = state.favorites.size;
    const total = state.tracks.reduce((s, t) => s + (t.duration || 0), 0);
    $('#libraryStat').textContent = `${state.tracks.length} треков · ${Math.round(total / 60)} мин`;
    $$('.view-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.layout === state.layout));
    $('#trackTable').hidden = state.layout !== 'list';
    $('#trackGrid').hidden = state.layout !== 'grid';
  }

  function renderPlaylistNav() {
    const wrap = $('#playlistNav');
    $$('.nav-item[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
    wrap.innerHTML = state.playlists.map((pl) => `<button class="nav-item${state.view === `playlist:${pl.id}` ? ' active' : ''}" data-playlist="${pl.id}">
      <span class="playlist-dot" style="background:${pl.color}"></span><span>${escapeHtml(pl.name)}</span><span class="nav-count">${pl.ids.length}</span></button>`).join('');
    wrap.querySelectorAll('[data-playlist]').forEach((b) => b.addEventListener('click', () => { state.view = `playlist:${b.dataset.playlist}`; renderAll(); }));
  }

  function renderCurrent() {
    const t = current();
    if (!t) return;
    $('#heroCover img').src = t.cover;
    $('#heroTitle').textContent = t.title;
    $('#heroArtist').textContent = t.artist;
    $('#heroAlbum').textContent = t.album || '—';
    $('#heroQuality').textContent = t.quality || 'Аудио';
    $('#heroSources').textContent = t.source ? `${t.source} · поток` : 'Локальная медиатека';
    $('#playerCover img').src = t.cover;
    $('#playerTitle').textContent = t.title;
    $('#playerArtist').textContent = t.artist;
    $('#miniCover').src = t.cover;
    $('#miniTitle').textContent = t.title;
    $('#miniArtist').textContent = t.artist;
    $('#hero').style.background = t.gradient || '';
    document.title = `${t.title} — ${t.artist} · SiDaW Player`;
    ['#heroHeart', '#playerHeart'].forEach((s) => $(s).classList.toggle('liked', state.favorites.has(t.id)));
    setupMediaSession();
    renderQueue();
    renderLyrics();
  }

  function renderPlayState() {
    document.body.classList.toggle('playing', state.playing);
    $('#heroPlayLabel').textContent = state.playing ? 'Пауза' : 'Слушать';
    $('#vizStatus').textContent = state.playing ? 'в эфире' : 'ожидание';
    $('#btnShuffle').classList.toggle('on', state.shuffle);
    $('#btnRepeat').classList.toggle('on', state.repeat > 0);
    $('#btnRepeat').classList.toggle('repeat-one-on', state.repeat === 2);
    $('#btnRepeat').title = ['Повтор выключен', 'Повтор списка', 'Повтор одного'][state.repeat];
  }

  function queueItem(t, isCurrent, draggable) {
    return `<div class="queue-item${isCurrent ? ' current' : ''}" data-id="${escapeHtml(t.id)}" ${draggable ? 'draggable="true"' : ''}>
      <img src="${escapeHtml(t.cover || '')}" alt="" /><div class="q-text"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}</span></div>
      <span class="q-duration">${formatTime(t.duration || 0)}</span></div>`;
  }
  function renderQueue() {
    const idx = currentIndex();
    const upcoming = idx >= 0 ? state.queue.slice(idx) : [];
    $('#queueCurrent').innerHTML = upcoming.length ? queueItem(upcoming[0], true, false) : '';
    $('#queueNext').innerHTML = upcoming.slice(1).map((t) => queueItem(t, false, true)).join('');
    $('#queueNextLabel').textContent = `Далее · ${Math.max(0, upcoming.length - 1)}`;
    $$('.queue-item').forEach((el) => el.addEventListener('click', () => playTrack(el.dataset.id)));
    bindQueueDrag();
  }
  function bindQueueDrag() {
    let dragId = null;
    $$('#queueNext .queue-item').forEach((el) => {
      el.addEventListener('dragstart', () => { dragId = el.dataset.id; el.classList.add('dragging'); });
      el.addEventListener('dragend', () => { el.classList.remove('dragging'); $$('.drop-target').forEach((x) => x.classList.remove('drop-target')); });
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-target'); });
      el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop-target');
        if (!dragId || dragId === el.dataset.id) return;
        const from = state.queue.findIndex((t) => t.id === dragId);
        const to = state.queue.findIndex((t) => t.id === el.dataset.id);
        if (from < 0 || to < 0) return;
        const [item] = state.queue.splice(from, 1);
        state.queue.splice(to, 0, item);
        renderQueue();
        toast('Порядок очереди обновлён');
      });
    });
  }

  function renderLyrics() {
    const t = current();
    if (!t) return;
    $('#lyricsTrackName').textContent = t.title;
    const raw = state.lyrics[t.id] || DEMO_LYRICS[t.id] || 'Текст для этого трека ещё не добавлен. Нажмите «Редактировать», чтобы вставить свои строки.\n\nФормат: [00:12] строка песни';
    const lines = raw.split('\n').map((line) => {
      const m = line.match(/^\[(\d+):(\d+)\]\s*(.*)$/);
      return m ? { time: Number(m[1]) * 60 + Number(m[2]), text: m[3] } : { time: null, text: line };
    });
    $('#lyricsText').innerHTML = lines.map((l) => `<p data-time="${l.time === null ? '' : l.time}">${escapeHtml(l.text) || '&nbsp;'}</p>`).join('');
    highlightLyrics();
  }
  function highlightLyrics() {
    const time = audio.currentTime || 0;
    let active = null;
    $$('#lyricsText p').forEach((p) => {
      if (p.dataset.time !== '' && Number(p.dataset.time) <= time) active = p;
    });
    $$('#lyricsText p').forEach((p) => p.classList.toggle('active', p === active));
    if (active && $('#lyricsView').hidden === false) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderQuickCards() {
    const cards = [
      ...state.playlists.map((pl) => ({ title: pl.name, sub: `${pl.ids.length} треков`, icon: 'i-list', bg: pl.color, view: `playlist:${pl.id}` })),
      { title: 'Любимое', sub: `${state.favorites.size} треков`, icon: 'i-heart', bg: '#ff7d97', view: 'favorites' },
    ];
    $('#quickCards').innerHTML = cards.map((c) => `<div class="media-card" data-view="${c.view}" style="background:linear-gradient(135deg, ${c.bg}44, rgba(0,0,0,.12))">
      <div class="card-glow"></div><svg class="card-icon"><use href="#${c.icon}"/></svg><strong>${escapeHtml(c.title)}</strong><span>${c.sub}</span></div>`).join('');
    $$('#quickCards .media-card').forEach((el) => el.addEventListener('click', () => { state.view = el.dataset.view; renderAll(); }));
  }
  function renderRadioCards() {
    const t = current();
    const cards = [
      { title: 'Радио по текущему', sub: t ? `Похоже на «${t.title}»` : 'Выберите трек', icon: 'i-radio', act: 'radio' },
      { title: 'Перемешать медиатеку', sub: `${state.tracks.length} треков в случайном порядке`, icon: 'i-shuffle', act: 'shuffle' },
      { title: 'Часто слушаете', sub: 'На основе вашей истории', icon: 'i-sparkle', act: 'most' },
    ];
    $('#radioCards').innerHTML = cards.map((c) => `<div class="media-card" data-act="${c.act}"><div class="card-glow"></div><svg class="card-icon"><use href="#${c.icon}"/></svg><strong>${c.title}</strong><span>${escapeHtml(c.sub)}</span></div>`).join('');
    $$('#radioCards .media-card').forEach((el) => el.addEventListener('click', () => {
      if (el.dataset.act === 'radio' && current()) startRadio(current());
      if (el.dataset.act === 'shuffle') $('#btnShuffleAll').click();
      if (el.dataset.act === 'most') { state.view = 'most'; renderAll(); }
    }));
  }
  function renderAll() {
    renderPlaylistNav();
    window.SiDaWStreams?.renderSourceNav();
    renderQuickCards();
    renderRadioCards();
    renderTracks();
    renderCurrent();
    renderPlayState();
    renderStreamTabs();
    applyVolume(false);
  }

  /* ---------- playback ---------- */
  function playTrack(id, list) {
    if (list) state.queue = list.slice();
    if (!state.queue.some((t) => t.id === id)) state.queue = state.tracks.slice();
    state.currentId = id;
    crossfadeStarted = false;
    const t = current();
    audio.src = t.src;
    audio.load();
    audio.play().then(() => {
      state.counts[id] = (state.counts[id] || 0) + 1;
      saveData();
    }).catch(() => toast('Не удалось воспроизвести этот источник'));
    fadeTo(state.muted ? 0 : state.volume / 100, .35);
    renderCurrent(); renderTracks(); renderRadioCards();
  }
  function togglePlay() {
    if (!audio.src) { playTrack(state.currentId); return; }
    if (audio.paused) audio.play().catch(() => toast('Не удалось воспроизвести файл'));
    else audio.pause();
  }
  function nextTrack(auto = false) {
    const idx = currentIndex();
    if (state.repeat === 2 && auto) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let next;
    if (state.shuffle && state.queue.length > 1) {
      do { next = Math.floor(Math.random() * state.queue.length); } while (next === idx);
    } else {
      next = idx + 1;
      if (next >= state.queue.length) {
        if (state.repeat === 1 || !auto) next = 0;
        else { audio.pause(); state.playing = false; renderPlayState(); return; }
      }
    }
    playTrack(state.queue[next].id);
  }
  function prevTrack() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    const idx = currentIndex();
    const prev = idx <= 0 ? state.queue.length - 1 : idx - 1;
    if (state.queue[prev]) playTrack(state.queue[prev].id);
  }
  function startRadio(seed) {
    const others = state.tracks.filter((t) => t.id !== seed.id);
    const similar = others.filter((t) => t.artist === seed.artist || t.album === seed.album);
    const rest = shuffleArray(others.filter((t) => !similar.includes(t)));
    const list = [seed, ...shuffleArray(similar), ...rest];
    state.shuffle = false;
    playTrack(seed.id, list);
    renderPlayState();
    toast(`Радио: ${list.length} треков, основа — «${seed.title}»`);
  }
  function toggleLike(id) {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast('Удалено из любимого'); }
    else { state.favorites.add(id); toast('Добавлено в любимое'); }
    saveData(); renderTracks(); renderCurrent(); renderQuickCards();
  }
  function generatedCover(seed) {
    let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${h},68%,52%)"/><stop offset="1" stop-color="hsl(${(h + 65) % 360},60%,26%)"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="410" cy="190" r="150" fill="#fff" opacity=".11"/><circle cx="190" cy="430" r="220" fill="#000" opacity=".1"/><path d="M0 400c120-90 210 40 330-30s190-30 270 20v210H0z" fill="#000" opacity=".16"/></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }
  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus|webm)$/i.test(f.name));
    if (!files.length) { toast('Аудиофайлы не найдены'); return; }
    let notSaved = false;
    await Promise.all(files.map(async (file) => {
      const base = file.name.replace(/\.[^.]+$/, '');
      const parts = base.split(/\s+[-–—]\s+/);
      const id = 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const t = {
        id, blobId: id,
        title: parts.length > 1 ? parts.slice(1).join(' - ') : base,
        artist: parts.length > 1 ? parts[0] : 'Локальный файл', album: 'Мои файлы',
        src: URL.createObjectURL(file), cover: generatedCover(base), duration: 0,
        quality: (file.name.split('.').pop() || 'file').toUpperCase(), local: true,
        gradient: 'linear-gradient(115deg, rgba(42,45,80,.95), rgba(25,29,42,.95) 55%, rgba(35,58,58,.95))',
      };
      state.tracks.push(t);
      const probe = new Audio(); probe.preload = 'metadata'; probe.src = t.src;
      probe.onloadedmetadata = () => {
        if (isFinite(probe.duration)) { t.duration = probe.duration; saveData(); renderTracks(); renderQueue(); }
      };
      try { await putAudioFile(id, file); } catch (_) { notSaved = true; }
    }));
    saveData();
    state.view = 'all'; state.query = ''; $('#searchInput').value = '';
    renderAll();
    toast(`Добавлено треков: ${files.length}`);
    if (notSaved) toast('Некоторые файлы доступны только до перезагрузки: хранилище браузера недоступно');
  }

  /* ---------- streaming search ---------- */
  function renderStreamTabs() {
    const tabs = window.SiDaWStreams?.SOURCES || [];
    $('#sourceTabs').innerHTML = tabs.map((s) => `<button data-source="${s.id}" class="${state.streamSource === s.id ? 'active' : ''}">${s.name}${window.SiDaWStreams.isConfigured(s.id) ? ' •' : ''}</button>`).join('');
    $$('#sourceTabs button').forEach((b) => b.addEventListener('click', () => {
      state.streamSource = b.dataset.source;
      renderStreamTabs();
      if (state.query.length >= 2) doStreamSearch();
      else { streamToken++; renderStreamResults(); }
    }));
  }
  function renderStreamResults() {
    const box = $('#streamList');
    const data = state.streamData;
    if (!state.query || state.query.length < 2) {
      $('#streamSub').textContent = 'Введите запрос, чтобы найти музыку у подключённых источников';
      box.innerHTML = '<div class="stream-note">Начните вводить название трека или исполнителя выше.</div>';
      return;
    }
    if (!data || data.source !== state.streamSource || data.query !== state.query) {
      box.innerHTML = '<div class="stream-note">Ищем…</div>';
      return;
    }
    if (!data.ok) {
      $('#streamSub').textContent = 'Ответ источника';
      box.innerHTML = `<div class="stream-note">${escapeHtml(data.error || 'Источник недоступен')}<br><button class="ghost-btn" id="streamGuideInline">Как получить доступ</button></div>`;
      $('#streamGuideInline')?.addEventListener('click', () => window.SiDaWStreams.openGuide(state.streamSource));
      return;
    }
    $('#streamSub').textContent = data.note || `Найдено у ${data.sourceName}: ${data.tracks.length}`;
    box.innerHTML = data.tracks.map((t) => `<div class="stream-item" data-id="${escapeHtml(t.id)}">
      <img src="${escapeHtml(t.cover || generatedCover(t.title))}" alt="" />
      <div class="st-text"><strong>${escapeHtml(t.title)}</strong><span>${escapeHtml(t.artist)}${t.preview ? ' · 30 сек' : ''}</span></div>
      <button class="ghost-btn tiny" data-act="play">Слушать</button><button class="ghost-btn tiny" data-act="add">+</button></div>`).join('') || '<div class="stream-note">Ничего не найдено</div>';
    $$('.stream-item').forEach((el) => el.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const t = data.tracks.find((x) => x.id === el.dataset.id);
      if (!t) return;
      if (act === 'add') {
        if (!state.tracks.some((x) => x.id === `${t.source}-${t.id}`)) {
          state.tracks.push({ id: `${t.source}-${t.id}`, title: t.title, artist: t.artist, album: t.album || t.source,
            src: t.streamUrl, cover: t.cover || generatedCover(t.title), duration: t.duration || 30,
            quality: t.preview ? 'Превью 30 сек' : 'Поток', source: t.source, gradient: 'linear-gradient(115deg, rgba(30,60,80,.95), rgba(20,24,38,.95))' });
          saveData();
          toast('Трек добавлен в медиатеку');
        } else toast('Уже в медиатеке');
        renderAll();
        return;
      }
      const localId = `${t.source}-${t.id}`;
      let local = trackById(localId);
      if (!local) {
        local = { id: localId, title: t.title, artist: t.artist, album: t.album || t.source, src: t.streamUrl,
          cover: t.cover || generatedCover(t.title), duration: t.duration || 30, quality: t.preview ? 'Превью 30 сек' : 'Поток',
          source: t.source, gradient: 'linear-gradient(115deg, rgba(30,60,80,.95), rgba(20,24,38,.95))' };
        state.tracks.push(local);
        saveData();
      }
      playTrack(local.id, [local, ...state.tracks.filter((x) => x.id !== local.id)]);
    }));
  }
  let streamTimer;
  let streamToken = 0;
  function doStreamSearch() {
    clearTimeout(streamTimer);
    const token = ++streamToken;
    streamTimer = setTimeout(async () => {
      const q = state.query;
      const source = state.streamSource;
      state.streamData = { source, query: q, ok: false, error: 'Ищем…' };
      renderStreamResults();
      let data;
      try {
        data = await window.SiDaWStreams.search(source, q);
      } catch (err) {
        if (token !== streamToken) return;
        state.streamData = { source, query: q, ok: false, error: err.message };
        renderStreamResults();
        return;
      }
      if (token !== streamToken) return; // устаревший ответ не должен перезаписать свежий поиск
      state.streamData = Object.assign({ source, query: q }, data);
      renderStreamResults();
    }, 420);
  }

  /* ---------- sleep timer ---------- */
  function setSleep(value) {
    if (value === 'off') { state.sleep = { endAt: 0, remaining: 0, untilEnd: false, min: 0 }; toast('Таймер сна выключен'); }
    else if (value === 'end') { state.sleep = { endAt: 0, remaining: 0, untilEnd: true, min: 'end' }; toast('Пауза в конце текущего трека'); }
    else {
      const min = Number(value);
      state.sleep = { endAt: Date.now() + min * 60000, remaining: min * 60, untilEnd: false, min };
      toast(`Таймер сна: ${min} мин`);
    }
    updateSleepUi();
    $('#sleepPopover').hidden = true;
  }
  function updateSleepUi() {
    const s = state.sleep;
    let text = 'Не активен';
    if (s.untilEnd) text = 'До конца трека';
    else if (s.endAt) {
      const left = Math.max(0, Math.floor((s.endAt - Date.now()) / 1000));
      text = `${Math.ceil(left / 60)} мин осталось`;
      if (left <= 0) { audio.pause(); setSleep('off'); toast('Таймер сна: воспроизведение остановлено'); }
    }
    $('#sleepStatus').textContent = text;
    $('#btnSleep').classList.toggle('sleep-active', !!(s.endAt || s.untilEnd));
    $$('#sleepChips button, #sleepPopover button[data-min]').forEach((b) => b.classList.toggle('active', b.dataset.min === String(state.sleep.min ?? '')));
  }
  setInterval(updateSleepUi, 1000);

  /* ---------- media session ---------- */
  function setupMediaSession() {
    if (!('mediaSession' in navigator) || !state.mediaKeys) return;
    const t = current();
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album || '', artwork: [{ src: t.cover, sizes: '600x600', type: 'image/svg+xml' }],
      });
      navigator.mediaSession.setActionHandler('play', togglePlay);
      navigator.mediaSession.setActionHandler('pause', togglePlay);
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(false));
      navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
      navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
      navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
    } catch (_) {}
  }

  /* ---------- visualizer ---------- */
  const canvas = $('#visualizer');
  const cctx = canvas.getContext('2d');
  function drawVisualizer() {
    const w = canvas.width, h = canvas.height;
    cctx.clearRect(0, 0, w, h);
    const bars = 56, gap = 3, bw = (w - gap * (bars - 1)) / bars;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9b8cff';
    const grad = cctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, accent); grad.addColorStop(.6, accent); grad.addColorStop(1, '#64ddc0');
    cctx.fillStyle = grad;
    if (analyser && state.playing) analyser.getByteFrequencyData(freqData);
    const time = performance.now() / 620;
    for (let i = 0; i < bars; i++) {
      let v;
      if (analyser && state.playing) {
        const idx = Math.floor(Math.pow(i / bars, 1.55) * (freqData.length * .78));
        v = Math.min(1, (freqData[idx] || 0) / 210);
      } else v = .06 + .045 * (1 + Math.sin(time + i * .42)) * (1 - i / bars * .5);
      const bh = Math.max(4, v * h * .94);
      cctx.globalAlpha = state.playing ? .95 : .35;
      cctx.beginPath();
      cctx.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(bw / 2, 4));
      cctx.fill();
    }
    cctx.globalAlpha = 1;
    requestAnimationFrame(drawVisualizer);
  }

  function drawEqCurve() {
    const c = $('#eqCurve'); if (!c) return;
    const ctx2 = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx2.clearRect(0, 0, w, h);
    ctx2.strokeStyle = 'rgba(128,128,150,.18)'; ctx2.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx2.beginPath(); ctx2.moveTo(0, h * i / 4); ctx2.lineTo(w, h * i / 4); ctx2.stroke(); }
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#9b8cff';
    ctx2.strokeStyle = accent; ctx2.lineWidth = 2; ctx2.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const pos = x / w * (BANDS.length - 1);
      let v = 0;
      BANDS.forEach((_, i) => {
        const d = pos - i;
        v += (state.eq.enabled ? state.eq.bands[i] : 0) * Math.exp(-d * d * 1.6);
      });
      const y = h / 2 - (v / 12) * (h * .42);
      if (x === 0) ctx2.moveTo(x, y); else ctx2.lineTo(x, y);
    }
    ctx2.stroke();
  }

  /* ---------- context menu ---------- */
  const menu = $('#contextMenu');
  let menuTarget = null;
  function showMenu(x, y, id) {
    menuTarget = id;
    const t = trackById(id);
    if (!t) return;
    menu.innerHTML = `<div class="menu-title">${escapeHtml(t.title)}</div>
      <button data-act="play"><svg><use href="#i-play"/></svg>Воспроизвести сейчас</button>
      <button data-act="like"><svg><use href="#i-heart"/></svg>${state.favorites.has(id) ? 'Убрать из любимого' : 'Добавить в любимое'}</button>
      <button data-act="radio"><svg><use href="#i-radio"/></svg>Радио по этому треку</button>
      <div class="menu-sep"></div><div class="menu-title small">Добавить в плейлист</div>
      ${state.playlists.map((p) => `<button data-act="pl" data-pl="${p.id}"><span class="playlist-dot" style="background:${p.color}"></span>${escapeHtml(p.name)}</button>`).join('')}`;
    menu.style.left = Math.min(x, innerWidth - 230) + 'px';
    menu.style.top = Math.min(y, innerHeight - 290) + 'px';
    menu.classList.add('show');
  }
  const hideMenu = () => menu.classList.remove('show');
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b || !menuTarget) return;
    const id = menuTarget;
    if (b.dataset.act === 'play') playTrack(id, visibleTracks());
    if (b.dataset.act === 'like') toggleLike(id);
    if (b.dataset.act === 'radio' && trackById(id)) startRadio(trackById(id));
    if (b.dataset.act === 'pl') {
      const pl = state.playlists.find((p) => p.id === b.dataset.pl);
      if (pl && !pl.ids.includes(id)) { pl.ids.push(id); saveData(); renderAll(); toast(`Добавлено в «${pl.name}»`); }
      else toast('Трек уже в плейлисте');
    }
    hideMenu();
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) hideMenu(); });

  /* ---------- settings drawer ---------- */
  function openSettings(tab) {
    $('#settingsDrawer').hidden = false;
    $('#settingsScrim').hidden = false;
    requestAnimationFrame(() => $('#settingsDrawer').classList.add('open'));
    if (tab) $$('.drawer-tabs button').find((b) => b.dataset.settings === tab)?.click();
  }
  function closeSettings() {
    $('#settingsDrawer').classList.remove('open');
    $('#settingsScrim').hidden = true;
    setTimeout(() => { $('#settingsDrawer').hidden = true; }, 300);
  }
  function buildEqUi() {
    $('#eqBands').innerHTML = BANDS.map((f, i) => `<div class="eq-band"><output data-out="${i}">0</output><input type="range" data-band="${i}" min="-12" max="12" step="1" value="${state.eq.bands[i]}" /><label>${f >= 1000 ? `${f / 1000}k` : f}</label></div>`).join('');
    $$('#eqBands input').forEach((input) => input.addEventListener('input', () => {
      const i = Number(input.dataset.band);
      state.eq.bands[i] = Number(input.value);
      state.eq.preset = 'custom';
      $(`#eqBands output[data-out="${i}"]`).textContent = input.value;
      applyEq(); saveData(); renderEqPresetChips();
    }));
    $('#eqPresets').innerHTML = Object.keys(EQ_PRESETS).map((name) => `<button data-preset="${name}">${name}</button>`).join('');
    $$('#eqPresets button').forEach((b) => b.addEventListener('click', () => {
      state.eq.bands = [...EQ_PRESETS[b.dataset.preset]];
      state.eq.preset = b.dataset.preset;
      state.eq.enabled = true;
      $('#eqEnabled').checked = true;
      renderEqBands(); applyEq(); saveData(); renderEqPresetChips();
      toast(`Пресет: ${b.dataset.preset}`);
    }));
    renderEqPresetChips();
  }
  function renderEqBands() {
    $$('#eqBands input').forEach((input) => {
      input.value = state.eq.bands[Number(input.dataset.band)];
      $(`#eqBands output[data-out="${input.dataset.band}"]`).textContent = input.value;
    });
  }
  function renderEqPresetChips() {
    $$('#eqPresets button').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.eq.preset));
    $('#preampRange').value = state.eq.preamp;
    $('#preampValue').textContent = state.eq.preamp;
  }

  /* ---------- mini player ---------- */
  function toggleMini(force) {
    const on = typeof force === 'boolean' ? force : !document.body.classList.contains('mini-mode');
    document.body.classList.toggle('mini-mode', on);
    $('#miniPlayer').hidden = !on;
    if (window.desktopControls?.setMini) window.desktopControls.setMini(on);
  }

  /* ---------- events ---------- */
  function bindEvents() {
    $$('.nav-item[data-view]').forEach((btn) => btn.addEventListener('click', () => { state.view = btn.dataset.view; renderAll(); }));
    $$('.topnav-item').forEach((btn) => btn.addEventListener('click', () => {
      state.top = btn.dataset.top;
      $$('.topnav-item').forEach((b) => b.classList.toggle('active', b === btn));
      if (state.top === 'search') { $('#searchInput').focus(); $('#streamResults').scrollIntoView({ behavior: 'smooth' }); }
      if (state.top === 'library') $('#trackTable').scrollIntoView({ behavior: 'smooth' });
      if (state.top === 'home') $('#mainScroll').scrollTo({ top: 0, behavior: 'smooth' });
    }));
    $$('.view-toggle button').forEach((b) => b.addEventListener('click', () => { state.layout = b.dataset.layout; saveData(); renderTracks(); }));
    $('#searchInput').addEventListener('input', (e) => {
      state.query = e.target.value.trim();
      renderTracks();
      renderStreamResults();
      if (state.query.length >= 2) { $('#streamResults').hidden = false; doStreamSearch(); }
      else { streamToken++; $('#streamResults').hidden = true; state.streamData = null; }
    });
    $('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.query.length >= 2) { $('#streamResults').hidden = false; doStreamSearch(); } });
    $('#btnAddMusic').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('#btnAddPlaylist').addEventListener('click', () => {
      const n = state.playlists.filter((p) => p.name.startsWith('Новый плейлист')).length + 1;
      const pl = { id: 'p' + Date.now(), name: `Новый плейлист ${n}`, color: '#f2a86b', ids: [] };
      state.playlists.push(pl); state.view = `playlist:${pl.id}`; saveData(); renderAll();
      toast('Плейлист создан — ПКМ по треку, чтобы добавить');
    });
    $('#btnSavePlaylist').addEventListener('click', () => {
      const list = visibleTracks();
      const pl = { id: 'p' + Date.now(), name: `Подборка ${new Date().toLocaleDateString('ru-RU')}`, color: '#8fd0ff', ids: list.map((t) => t.id) };
      state.playlists.push(pl); saveData(); renderAll(); toast(`Сохранено треков: ${list.length}`);
    });

    $('#btnPlay').addEventListener('click', togglePlay);
    $('#heroPlay').addEventListener('click', togglePlay);
    $('#btnNext').addEventListener('click', () => nextTrack(false));
    $('#btnPrev').addEventListener('click', prevTrack);
    $('#btnShuffle').addEventListener('click', () => { state.shuffle = !state.shuffle; renderPlayState(); toast(state.shuffle ? 'Перемешивание включено' : 'Перемешивание выключено'); });
    $('#btnRepeat').addEventListener('click', () => { state.repeat = (state.repeat + 1) % 3; renderPlayState(); toast(['Повтор выключен', 'Повтор списка', 'Повтор одного'][state.repeat]); });
    ['#heroHeart', '#playerHeart'].forEach((s) => $(s).addEventListener('click', () => toggleLike(state.currentId)));
    $('#btnPlayAll').addEventListener('click', () => { const l = visibleTracks(); if (l.length) playTrack(l[0].id, l); });
    $('#btnShuffleAll').addEventListener('click', () => {
      const l = visibleTracks(); if (!l.length) return;
      state.shuffle = true; const s = shuffleArray(l); playTrack(s[0].id, s); renderPlayState(); toast('Перемешанная подборка');
    });
    $('#btnRadioHero').addEventListener('click', () => current() && startRadio(current()));

    $('#seekBar').addEventListener('input', (e) => {
      if (!isFinite(audio.duration)) return;
      audio.currentTime = (e.target.value / 1000) * audio.duration;
      e.target.style.setProperty('--pct', e.target.value / 10 + '%');
      $('#timeCurrent').textContent = formatTime(audio.currentTime);
    });
    $('#volumeBar').addEventListener('input', (e) => {
      state.volume = Number(e.target.value); state.muted = false; applyVolume();
    });
    $('#btnMute').addEventListener('click', () => { state.muted = !state.muted; applyVolume(); toast(state.muted ? 'Звук выключен' : 'Звук включён'); });

    $('#btnQueue').addEventListener('click', () => { $('#app').classList.toggle('queue-open'); $('#btnQueue').classList.toggle('on', $('#app').classList.contains('queue-open')); });
    $('#btnCloseQueue').addEventListener('click', () => { $('#app').classList.remove('queue-open'); $('#btnQueue').classList.remove('on'); });
    $$('.queue-tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.queue-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $('#queueView').hidden = b.dataset.side !== 'queue';
      $('#lyricsView').hidden = b.dataset.side !== 'lyrics';
    }));
    $('#btnLyrics').addEventListener('click', () => {
      $('#app').classList.add('queue-open'); $('#btnQueue').classList.add('on');
      $$('.queue-tabs button').forEach((x) => x.classList.toggle('active', x.dataset.side === 'lyrics'));
      $('#queueView').hidden = true; $('#lyricsView').hidden = false;
    });
    $('#btnEditLyrics').addEventListener('click', () => {
      const t = current(); if (!t) return;
      $('#lyricsEditor').value = state.lyrics[t.id] || DEMO_LYRICS[t.id] || '';
      $('#lyricsEditor').hidden = false; $('#btnSaveLyrics').hidden = false; $('#lyricsText').hidden = true;
    });
    $('#btnSaveLyrics').addEventListener('click', () => {
      const t = current(); if (!t) return;
      state.lyrics[t.id] = $('#lyricsEditor').value; saveData();
      $('#lyricsEditor').hidden = true; $('#btnSaveLyrics').hidden = true; $('#lyricsText').hidden = false;
      renderLyrics(); toast('Текст сохранён');
    });

    $('#btnSleep').addEventListener('click', (e) => { e.stopPropagation(); $('#sleepPopover').hidden = !$('#sleepPopover').hidden; updateSleepUi(); });
    $$('#sleepPopover button[data-min], #sleepChips button[data-min]').forEach((b) => b.addEventListener('click', () => setSleep(b.dataset.min)));
    document.addEventListener('click', (e) => { if (!e.target.closest('#sleepPopover') && e.target.id !== 'btnSleep') $('#sleepPopover').hidden = true; });

    $('#btnSettings').addEventListener('click', () => openSettings());
    $('#btnTheme').addEventListener('click', () => openSettings('appearance'));
    $('#btnEq').addEventListener('click', () => openSettings('audio'));
    $('#btnSources').addEventListener('click', () => openSettings('sources'));
    $('#btnCloseSettings').addEventListener('click', closeSettings);
    $('#settingsScrim').addEventListener('click', closeSettings);
    $$('.drawer-tabs button').forEach((b) => b.addEventListener('click', () => {
      $$('.drawer-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.settings-page').forEach((p) => { p.hidden = p.dataset.page !== b.dataset.settings; });
      if (b.dataset.settings === 'audio') drawEqCurve();
    }));

    $('#eqEnabled').addEventListener('change', (e) => { state.eq.enabled = e.target.checked; applyEq(); saveData(); drawEqCurve(); });
    $('#preampRange').addEventListener('input', (e) => { state.eq.preamp = Number(e.target.value); $('#preampValue').textContent = state.eq.preamp; applyEq(); saveData(); });
    $('#crossfadeRange').addEventListener('input', (e) => { state.crossfade = Number(e.target.value); $('#crossfadeValue').textContent = state.crossfade; saveData(); });
    $('#mediaKeysEnabled').addEventListener('change', (e) => { state.mediaKeys = e.target.checked; saveData(); setupMediaSession(); });
    $('#scrobbleEnabled').addEventListener('change', (e) => { state.scrobble = e.target.checked; saveData(); });

    $('#btnMini').addEventListener('click', () => toggleMini(true));
    $('#miniExpand').addEventListener('click', () => toggleMini(false));
    $('#miniPlay').addEventListener('click', togglePlay);
    $('#miniPrev').addEventListener('click', prevTrack);
    $('#miniNext').addEventListener('click', () => nextTrack(false));

    $('#trackList').addEventListener('click', (e) => {
      const like = e.target.closest('[data-like]');
      if (like) { e.stopPropagation(); toggleLike(like.dataset.like); return; }
      const row = e.target.closest('.track-row'); if (row) playTrack(row.dataset.id, visibleTracks());
    });
    $('#trackGrid').addEventListener('click', (e) => { const c = e.target.closest('.grid-card'); if (c) playTrack(c.dataset.id, visibleTracks()); });
    $$('#trackList, #trackGrid').forEach((el) => el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-id]'); if (!row) return;
      e.preventDefault(); showMenu(e.clientX, e.clientY, row.dataset.id);
    }));

    audio.addEventListener('play', () => { initGraph(); audioCtxResume(); state.playing = true; renderPlayState(); renderTracks(); });
    audio.addEventListener('pause', () => { state.playing = false; renderPlayState(); renderTracks(); });
    audio.addEventListener('ended', () => {
      if (state.sleep.untilEnd) { audio.pause(); setSleep('off'); toast('Таймер сна: пауза в конце трека'); return; }
      if (state.crossfade > 0) fadeTo(0, .25);
      nextTrack(true);
    });
    audio.addEventListener('loadedmetadata', () => { $('#timeTotal').textContent = formatTime(audio.duration); });
    audio.addEventListener('timeupdate', () => {
      const pct = audio.duration ? (audio.currentTime / audio.duration) * 1000 : 0;
      $('#seekBar').value = pct; $('#seekBar').style.setProperty('--pct', pct / 10 + '%');
      $('#timeCurrent').textContent = formatTime(audio.currentTime);
      highlightLyrics();
      if (state.crossfade > 0 && audio.duration && state.playing && !crossfadeStarted) {
        const left = audio.duration - audio.currentTime;
        if (left <= state.crossfade && left > .1) {
          crossfadeStarted = true;
          fadeTo(0, Math.min(left, state.crossfade));
        }
      }
    });
    audio.addEventListener('error', () => { if (audio.src) toast('Файл не удалось загрузить'); });

    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
    window.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
    window.addEventListener('drop', (e) => {
      e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (e.key === 'Escape') { hideMenu(); closeSettings(); $('#guideModal').hidden = true; if (typing) document.activeElement.blur(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#searchInput').focus(); return; }
      if (typing) return;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'arrowright': audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5); break;
        case 'arrowleft': audio.currentTime = Math.max(0, audio.currentTime - 5); break;
        case 'arrowup': { const v = Math.min(100, state.volume + 5); $('#volumeBar').value = v; $('#volumeBar').dispatchEvent(new Event('input')); break; }
        case 'arrowdown': { const v = Math.max(0, state.volume - 5); $('#volumeBar').value = v; $('#volumeBar').dispatchEvent(new Event('input')); break; }
        case 'n': nextTrack(false); break;
        case 'p': prevTrack(); break;
        case 'm': $('#btnMute').click(); break;
        case 'f': toggleLike(state.currentId); break;
        case 'q': $('#btnQueue').click(); break;
        case 'l': $('#btnLyrics').click(); break;
        case 'e': openSettings('audio'); break;
        case '/': e.preventDefault(); $('#searchInput').focus(); break;
      }
    });

    const desktop = !!window.desktopControls?.available;
    if (desktop) document.body.classList.add('desktop');
    $('#btnMaximize').addEventListener('click', () => {
      if (desktop) window.desktopControls.toggleMaximize();
      else if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => toast('Полноэкранный режим недоступен'));
    });
    $('#btnMinimize').addEventListener('click', () => desktop ? window.desktopControls.minimize() : toast('Сворачивание доступно в десктопной сборке'));
    $('#btnClose').addEventListener('click', () => desktop ? window.desktopControls.close() : toast('Это прототип — окно остаётся открытым'));
  }
  function audioCtxResume() { try { ctx?.resume?.(); } catch (_) {} }

  /* ---------- init ---------- */
  async function init() {
    const hour = new Date().getHours();
    $('#greeting').textContent = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
    window.SiDaWTheme?.init();
    window.SiDaWStreams?.init();
    buildEqUi();
    $('#eqEnabled').checked = state.eq.enabled;
    $('#crossfadeRange').value = state.crossfade;
    $('#crossfadeValue').textContent = state.crossfade;
    $('#scrobbleEnabled').checked = state.scrobble;
    $('#mediaKeysEnabled').checked = state.mediaKeys;
    try { await restoreLibrary(); } catch (_) { /* медиатека останется в состоянии по умолчанию */ }
    audio.src = current().src;
    audio.load();
    applyVolume(false);
    renderAll();
    bindEvents();
    updateSleepUi();
    drawVisualizer();
    drawEqCurve();
  }
  init();
})();
