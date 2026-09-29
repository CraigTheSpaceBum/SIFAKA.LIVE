(function () {
  const KEY = 'sifaka_theme_v1';
  const root = document.documentElement;
  const THEMES = ["dark","midnight","light","cyberpunk","synthwave","matrix","ocean","arctic","forest","emerald","ruby","crimson","violet","lavender","amethyst","sunset","solar","amber","copper","rose","bubblegum","coffee","slate","mono","terminal","nord","dracula","hacker","toxic","deepsea"];

  function normalize(theme) {
    const val = String(theme || '').trim().toLowerCase();
    return THEMES.includes(val) ? val : 'dark';
  }

  function applyTheme(theme, persist = true) {
    const t = normalize(theme);
    if (t === 'dark') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    if (persist) {
      try { localStorage.setItem(KEY, t); } catch (_) {}
    }
    return t;
  }

  function currentTheme() {
    return normalize(root.getAttribute('data-theme') || 'dark');
  }

  function cycleTheme() {
    const cur = currentTheme();
    const idx = THEMES.indexOf(cur);
    const next = THEMES[(idx + 1) % THEMES.length];
    return applyTheme(next, true);
  }

  window.SifakaTheme = {
    apply: applyTheme,
    current: currentTheme,
    cycle: cycleTheme,
    list: () => [...THEMES]
  };

  window.setSifakaTheme = applyTheme;

  document.addEventListener('DOMContentLoaded', () => {
    let saved = 'dark';
    try { saved = localStorage.getItem(KEY) || 'dark'; } catch (_) {}
    applyTheme(saved, false);
  });
})();