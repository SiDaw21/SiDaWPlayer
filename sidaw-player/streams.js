/* SiDaW Player — streaming source adapters, credentials UI and guide */
(function (global) {
  'use strict';
  const KEY = 'sidaw:creds:v2';

  const SOURCES = [
    {
      id: 'spotify', name: 'Spotify', short: 'S', color: '#1db954',
      fields: [
        { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Скопируйте из developer.spotify.com/dashboard' },
        { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Не публикуйте этот ключ' },
      ],
      note: 'Web API отдаёт метаданные и 30-секундные превью (preview_url). Полное воспроизведение требует Premium и Web Playback SDK.',
      guide: 'https://developer.spotify.com/documentation/web-api',
    },
    {
      id: 'soundcloud', name: 'SoundCloud', short: 'SC', color: '#ff5500',
      fields: [{ key: 'clientId', label: 'Client ID', type: 'text', placeholder: ' client_id вашего приложения' }],
      note: 'Публичный поиск доступен с client_id существующего приложения. Поток может быть недоступен для отдельных треков.',
      guide: 'https://developers.soundcloud.com/docs/api/reference',
    },
    {
      id: 'vk', name: 'VK Музыка', short: 'VK', color: '#0077ff',
      fields: [{ key: 'token', label: 'Access token', type: 'password', placeholder: 'Токен с правами на аудио' }],
      note: 'Публичный audio API VK отключён с 2016 года. Интеграция вернёт понятную ошибку — легального способа тянуть аудио нет.',
      guide: 'https://vk.com/dev.php?method=audio_api',
    },
    {
      id: 'yandex', name: 'Яндекс Музыка', short: 'Я', color: '#ffcc00',
      fields: [{ key: 'token', label: 'Токен / OAuth', type: 'password', placeholder: 'Если он есть у вашего приложения' }],
      note: 'Официального публичного API для сторонних приложений у Яндекс Музыки нет. Неофициальные библиотеки нарушают условия сервиса.',
      guide: 'https://yandex.ru/dev/',
    },
  ];

  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; }
    catch (_) { return {}; }
  }
  function saveCreds(c) {
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {}
  }
  const creds = loadCreds();
  function isConfigured(id) {
    const c = creds[id] || {};
    return Object.values(c).some((v) => String(v || '').trim().length > 0);
  }

  function renderSourceNav() {
    const nav = document.getElementById('sourceNav');
    if (!nav) return;
    nav.innerHTML = SOURCES.map((s) => `<div class="source-item${isConfigured(s.id) ? ' connected' : ''}" data-source="${s.id}">
      <span class="dot"></span><span class="src-name">${s.name}</span><span class="src-state">${isConfigured(s.id) ? 'готов' : 'нет ключа'}</span></div>`).join('');
  }

  function renderSourceCards() {
    const wrap = document.getElementById('sourceCards');
    if (!wrap) return;
    wrap.innerHTML = SOURCES.map((s) => {
      const c = creds[s.id] || {};
      return `<div class="source-card" data-source="${s.id}">
        <div class="sc-head"><div class="sc-logo" style="background:${s.color}">${s.short}</div><strong>${s.name}</strong>
          <span class="sc-status ${isConfigured(s.id) ? 'on' : 'off'}">${isConfigured(s.id) ? 'настроено' : 'не подключено'}</span></div>
        ${s.fields.map((f) => `<label class="field"><span>${f.label}</span><input type="${f.type}" data-key="${f.key}" value="${String(c[f.key] || '').replace(/"/g, '&quot;')}" placeholder="${f.placeholder}" /></label>`).join('')}
        <p class="sc-note">${s.note}</p>
        <div class="sc-actions"><button class="ghost-btn tiny" data-act="save">Сохранить</button><button class="ghost-btn tiny" data-act="guide">Инструкция</button></div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('.source-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const id = card.dataset.source;
        if (btn.dataset.act === 'guide') { openGuide(id); return; }
        card.querySelectorAll('input[data-key]').forEach((input) => {
          creds[id] = creds[id] || {};
          creds[id][input.dataset.key] = input.value.trim();
        });
        saveCreds(creds);
        renderSourceCards();
        renderSourceNav();
        if (global.SiDaWToast) global.SiDaWToast(`Настройки «${SOURCES.find((s) => s.id === id).name}» сохранены`);
      });
    });
  }

  async function search(source, query) {
    const cred = creds[source] || {};
    const headers = { 'X-SiDaw-Creds': btoa(unescape(encodeURIComponent(JSON.stringify(cred)))) };
    const url = `/api/search?source=${encodeURIComponent(source)}&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch (_) { throw new Error('Нужен локальный сервер приложения: npm run web-server. Обычный статический сервер не умеет запрашивать API.'); }
    if (!data.ok) throw new Error(data.error || 'Источник недоступен');
    // Сервер возвращает источник один раз для всего ответа; трекам он нужен и в медиатеке.
    return Object.assign({}, data, {
      tracks: (data.tracks || []).map((t) => Object.assign({ source }, t)),
    });
  }

  const GUIDE = `
    <h3>Краткая правда о подключении</h3>
    <p>Стриминговые сервисы не разрешают сторонним приложениям просто «тянуть» музыку из аккаунта. Для легального доступа нужны официальные ключи, а в нескольких случаях — подписка. Ниже — что реально можно сделать.</p>

    <h3>Spotify — поиск и 30-секундные превью</h3>
    <ol>
      <li>Войдите в <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">Developer Dashboard</a> и нажмите <b>Create app</b>.</li>
      <li>В настройках приложения скопируйте <b>Client ID</b> и <b>Client Secret</b>.</li>
      <li>Вставьте их в карточку Spotify в настройках SiDaW Player и сохраните.</li>
      <li>Поиск вернёт треки с <code>preview_url</code> — это законные 30-секундные фрагменты, они играют прямо в плеере.</li>
    </ol>
    <p>Полные треки доступны только через <b>Spotify Web Playback SDK</b> и аккаунт <b>Premium</b>: это отдельный OAuth-поток и отдельный плеер внутри приложения. В прототипе реализован поиск и превью.</p>

    <h3>SoundCloud — только если у вас уже есть client_id</h3>
    <ol>
      <li>Проверьте, есть ли у вас зарегистрированное приложение в <a href="https://soundcloud.com/you/apps" target="_blank" rel="noopener">SoundCloud Apps</a>.</li>
      <li>Скопируйте <b>client_id</b> и вставьте в настройки.</li>
      <li>Поиск использует публичный каталог. Для части треков поток доступен, для части — нет (автор закрыл скачивание).</li>
    </ol>
    <p>Регистрация новых приложений в SoundCloud давно ограничена. Если ключа нет — используйте встроенный плеер SoundCloud или oEmbed, а не «обходные» API.</p>

    <h3>VK Музыка — официального API нет</h3>
    <p>VK <a href="https://vk.com/dev.php?method=audio_api" target="_blank" rel="noopener">отключил публичный audio API ещё в 2016 году</a>: методы поиска и получения ссылок на mp3 доступны только самому сайту и официальным клиентам. Любые «токены» не изменят это ограничение. В SiDaW Player карточка VK нужна только для того, чтобы показать честный ответ сервиса. Слушайте VK Музыку в официальном приложении.</p>

    <h3>Яндекс Музыка — официального публичного API нет</h3>
    <p>У Яндекс Музыки нет публичного API для сторонних разработчиков. Существующие «неофициальные» библиотеки используют внутренние эндпоинты, что нарушает условия использования и ломается без предупреждения. Мы сознательно не встраиваем такие обходы. Если у вашей организации есть отдельный договор с Яндексом — подключите его через свой бэкенд и тот же адаптер.</p>

    <h3>Как подключить свой источник позже</h3>
    <p>Адаптер — это одна функция в <code>server.js</code>: она получает запрос, токен и возвращает список треков с полем <code>streamUrl</code>. Добавьте туда официальный API вашего сервиса, и он появится во вкладках поиска без изменения интерфейса.</p>
  `;

  function openGuide(sourceId) {
    const body = document.getElementById('guideBody');
    if (!body) return;
    body.innerHTML = GUIDE;
    if (sourceId) {
      const s = SOURCES.find((x) => x.id === sourceId);
      if (s) body.insertAdjacentHTML('afterbegin', `<p style="color:var(--accent)">Открыта инструкция для: <b>${s.name}</b></p>`);
    }
    document.getElementById('guideModal').hidden = false;
  }

  function init() {
    document.getElementById('btnGuideOpen')?.addEventListener('click', () => openGuide());
    document.getElementById('btnStreamGuide')?.addEventListener('click', () => openGuide());
    document.getElementById('btnCloseGuide')?.addEventListener('click', () => { document.getElementById('guideModal').hidden = true; });
    document.getElementById('btnGuideDone')?.addEventListener('click', () => { document.getElementById('guideModal').hidden = true; });
    document.getElementById('guideModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'guideModal') e.target.hidden = true;
    });
    renderSourceNav();
    renderSourceCards();
  }

  global.SiDaWStreams = { SOURCES, init, search, openGuide, renderSourceNav, renderSourceCards, isConfigured, get creds() { return creds; } };
})(window);
