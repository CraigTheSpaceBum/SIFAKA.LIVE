(function () {
  const KEY = 'sifaka_theme_v1';
  const root = document.documentElement;
  const THEMES = ["dark","cyberpunk","ocean","arctic","forest","emerald","ruby","crimson","violet","lavender","amethyst","sunset","solar","amber","copper","rose","bubblegum","coffee","slate","mono","terminal","nord","dracula","hacker","toxic","deepsea","halloween","christmas"];

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
  window.previewSifakaTheme = function (theme) { return applyTheme(theme, false); };

  const WEEKDAY_THEMES = ["lavender", "slate", "ocean", "forest", "violet", "ruby", "sunset"];
  const TRANSITION_MS = 1900;
  let rolloverTimer = null;
  let transitionTimer = null;
  let lastDailyDateKey = "";

  function localDateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  }

  function dailyThemeForDate(date = new Date()) {
    if (date.getMonth() === 9 && date.getDate() === 31) return "halloween";
    if (date.getMonth() === 11 && date.getDate() === 25) return "christmas";
    return WEEKDAY_THEMES[date.getDay()] || "dark";
  }

  function syncThemePicker(theme) {
    const picker = document.getElementById("settingsThemeSelect");
    if (picker && Array.from(picker.options).some(option => option.value === theme)) {
      picker.value = theme;
    }
  }

  function setDailyTheme(animate = false) {
    const now = new Date();
    const dateKey = localDateKey(now);
    const nextTheme = dailyThemeForDate(now);
    const current = currentTheme();
    lastDailyDateKey = dateKey;

    if (current !== nextTheme) {
      if (animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        root.setAttribute("data-theme-transitioning", "true");
        // Force the transition styles to resolve before changing the palette.
        void root.offsetWidth;
        if (transitionTimer !== null) window.clearTimeout(transitionTimer);
        transitionTimer = window.setTimeout(() => {
          root.removeAttribute("data-theme-transitioning");
          transitionTimer = null;
        }, TRANSITION_MS + 100);
      }
      applyTheme(nextTheme, false);
    }
    syncThemePicker(nextTheme);
    return nextTheme;
  }

  function scheduleNextMidnight() {
    if (rolloverTimer !== null) window.clearTimeout(rolloverTimer);
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50);
    const delay = Math.max(50, nextMidnight.getTime() - now.getTime());
    rolloverTimer = window.setTimeout(() => {
      setDailyTheme(true);
      scheduleNextMidnight();
    }, delay);
  }

  function checkForMissedMidnight() {
    const currentDateKey = localDateKey(new Date());
    if (currentDateKey !== lastDailyDateKey) {
      setDailyTheme(true);
      scheduleNextMidnight();
    }
  }

  window.SifakaTheme = {
    apply: applyTheme,
    current: currentTheme,
    cycle: cycleTheme,
    list: () => [...THEMES],
    daily: dailyThemeForDate
  };

  window.setSifakaTheme = applyTheme;
  window.previewSifakaTheme = function (theme) { return applyTheme(theme, false); };

  document.addEventListener('DOMContentLoaded', () => {
    setDailyTheme(false);
    scheduleNextMidnight();
    window.addEventListener('focus', checkForMissedMidnight);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForMissedMidnight();
    });
  });
})();