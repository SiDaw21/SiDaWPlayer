/* SiDaW Player — fully customisable themes */
(function (global) {
  'use strict';
  const KEY = 'sidaw:theme:v2';

  const PRESETS = {
    night:    { name: 'SiDaW Night', accent: '#9b8cff', mode: 'dark',  bg: 'radial-gradient(900px 500px at 72% -10%, rgba(112,88,255,.12), transparent 70%), #0a0c11', radius: 16, scale: 100, density: 'cozy' },
    aurora:   { name: 'Aurora',      accent: '#4fd6c0', mode: 'dark',  bg: 'radial-gradient(900px 500px at 70% -10%, rgba(79,214,192,.14), transparent 70%), #08110f', radius: 20, scale: 100, density: 'cozy' },
    sunset:   { name: 'Sunset',      accent: '#ff9a6b', mode: 'dark',  bg: 'radial-gradient(900px 500px at 75% -10%, rgba(255,120,90,.15), transparent 70%), #130b0c', radius: 18, scale: 100, density: 'cozy' },
    paper:    { name: 'Paper',       accent: '#6d63e8', mode: 'light', bg: 'linear-gradient(135deg,#f6f5ff,#eef1f8)', radius: 14, scale: 100, density: 'cozy' },
    graphite: { name: 'Graphite',    accent: '#b8c0cc', mode: 'dark',  bg: 'linear-gradient(160deg,#191b20,#0a0b0e)', radius: 8,  scale: 95,  density: 'compact' },
  };

  function defaults() {
    return { preset: 'night', accent: PRESETS.night.accent, mode: 'dark', bg: PRESETS.night.bg, radius: 16, scale: 100, density: 'cozy', showVisualizer: true };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      return saved && typeof saved === 'object' ? Object.assign(defaults(), saved) : defaults();
    } catch (_) { return defaults(); }
  }

  let state = load();
  let onChange = () => {};

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full, 16);
    if (isNaN(n)) return [155, 140, 255];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function darken(hex, amount = 0.22) {
    const [r, g, b] = hexToRgb(hex);
    const f = (v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
  }

  function apply() {
    const root = document.documentElement;
    const [r, g, b] = hexToRgb(state.accent);
    root.style.setProperty('--accent', state.accent);
    root.style.setProperty('--accent-2', darken(state.accent));
    root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
    root.style.setProperty('--radius', `${state.radius}px`);
    root.style.setProperty('--scale', String(state.scale / 100));
    root.style.setProperty('--row-h', state.density === 'compact' ? '44px' : state.density === 'spacious' ? '68px' : '56px');
    const bg = String(state.bg || '').trim();
    root.style.setProperty('--bg-image', /^(https?:|data:)/i.test(bg)
      ? `linear-gradient(rgba(8,10,16,.62),rgba(8,10,16,.86)), url("${bg.replace(/"/g, '%22')}")`
      : bg || 'none');
    document.body.dataset.mode = state.mode === 'light' ? 'light' : 'dark';
    document.body.dataset.density = state.density;
    document.body.classList.toggle('hide-visualizer', !state.showVisualizer);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    onChange(state);
  }

  function syncUI() {
    const $ = (s) => document.querySelector(s);
    if (!$('#themePreset')) return;
    $('#themePreset').value = state.preset;
    $('#themeMode').value = state.mode;
    $('#accentColor').value = state.accent;
    $('#bgValue').value = state.bg;
    $('#radiusRange').value = state.radius;
    $('#radiusValue').textContent = state.radius;
    $('#scaleRange').value = state.scale;
    $('#scaleValue').textContent = state.scale;
    $('#densitySelect').value = state.density;
    $('#showVisualizer').checked = !!state.showVisualizer;
    document.querySelectorAll('#presetSwatches button').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.preset));
    document.querySelector('.hero-visual').style.display = state.showVisualizer ? '' : 'none';
  }

  function set(partial) {
    Object.assign(state, partial);
    state.preset = partial.preset || 'custom';
    apply();
    syncUI();
  }

  function init() {
    const $ = (s) => document.querySelector(s);
    const swatches = $('#presetSwatches');
    swatches.innerHTML = Object.entries(PRESETS).map(([id, p]) =>
      `<button data-preset="${id}" title="${p.name}" style="background:${p.accent}"></button>`).join('');
    swatches.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-preset]');
      if (!b) return;
      const p = PRESETS[b.dataset.preset];
      set({ preset: b.dataset.preset, accent: p.accent, mode: p.mode, bg: p.bg, radius: p.radius, scale: p.scale, density: p.density });
    });
    $('#themePreset').addEventListener('change', (e) => {
      const p = PRESETS[e.target.value];
      if (!p) { set({ preset: 'custom' }); return; }
      set({ preset: e.target.value, accent: p.accent, mode: p.mode, bg: p.bg, radius: p.radius, scale: p.scale, density: p.density });
    });
    $('#themeMode').addEventListener('change', (e) => set({ mode: e.target.value }));
    $('#accentColor').addEventListener('input', (e) => set({ accent: e.target.value }));
    $('#bgValue').addEventListener('change', (e) => set({ bg: e.target.value }));
    $('#radiusRange').addEventListener('input', (e) => set({ radius: Number(e.target.value) }));
    $('#scaleRange').addEventListener('input', (e) => set({ scale: Number(e.target.value) }));
    $('#densitySelect').addEventListener('change', (e) => set({ density: e.target.value }));
    $('#showVisualizer').addEventListener('change', (e) => set({ showVisualizer: e.target.checked }));
    $('#btnResetTheme').addEventListener('click', () => { state = defaults(); apply(); syncUI(); });
    apply();
    syncUI();
  }

  global.SiDaWTheme = {
    init, apply, syncUI, set, presets: PRESETS,
    get state() { return state; },
    onChange(fn) { onChange = fn; },
  };
})(window);
