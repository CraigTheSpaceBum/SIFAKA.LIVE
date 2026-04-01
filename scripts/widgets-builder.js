(function () {
  const STORAGE_KEY = 'sifaka_widget_builder_v1';
  const NADDR_RE = /naddr1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const ADDRESS_RE = /30311:[0-9a-f]{64}:[^\s?#]+/i;
  const NPUB_RE = /npub1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const NPROFILE_RE = /nprofile1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const HEX_PUBKEY_RE = /\b[0-9a-f]{64}\b/i;
  const NIP05_RE = /\b[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
  const PROFILE_SEARCH_DEBOUNCE_MS = 220;
  const NAME_TAG_THEMES = new Set(['retro-night', 'sunset-pop', 'emerald-glow', 'rose-bloom', 'ice-blue', 'midnight-gold', 'ocean-flare', 'candy-neon', 'graphite-ember']);
  const NAME_TAG_FONTS = new Set(['arcade', 'broadcast', 'grotesk', 'mono', 'orbitron', 'oswald', 'syne']);
  const NAME_TAG_AVATAR_SIDES = new Set(['left', 'right', 'none']);
  const ZAP_THEMES = new Set(['amber-burst', 'violet-night', 'mint-pop', 'glacier', 'rose-spark', 'graphite-ember']);
  const ZAP_FONTS = new Set(['broadcast', 'grotesk', 'mono', 'orbitron', 'oswald', 'syne', 'arcade']);
  const ZAP_EFFECTS = new Set(['slide', 'fade', 'pop', 'none']);
  const DEFAULT_NAME_TAG_OPTIONS = Object.freeze({
    theme: 'retro-night',
    font: 'arcade',
    avatarSide: 'left',
    identityOverride: '',
    subtext: ''
  });
  const DEFAULT_ZAP_OPTIONS = Object.freeze({
    theme: 'amber-burst',
    font: 'broadcast',
    effect: 'slide',
    motionMs: 450
  });
  const ZAP_TEST_PREVIEW_SENDER = 'npub1826v365he5ty69lk3xgvzqrwy8587vdfrxnsz0k09khzustf8r7s6j7t95';
  const ZAP_TEST_PREVIEW_SATS = 210;
  const ZAP_TEST_PREVIEW_NOTE = 'This is a test zap preview.';

  const WIDGET_CONFIG = {
    'name-tag': {
      name: 'Name Tag',
      sourceMode: 'profile',
      queryParam: 'profile',
      usesStreamSelect: false,
      usesRelayOverride: false,
      showsStatus: false,
      supportsProfileSearch: true,
      builderDescription: 'Paste a profile URL, npub, hex pubkey, or nip-05 to build a lower-third name tag overlay.',
      sourceLabel: 'Profile URL / npub / nip-05',
      sourcePlaceholder: 'npub1... or craig@sifaka.live',
      emptyHint: 'Paste a profile URL, npub, hex pubkey, or nip-05 to generate this name tag URL.'
    },
    'zap-alerts': {
      name: 'Zap Alerts',
      sourceMode: 'stream',
      queryParam: 'stream',
      usesStreamSelect: true,
      usesRelayOverride: true,
      showsStatus: true,
      supportsProfileSearch: false,
      builderDescription: 'Use one of your own live events or paste any public live stream reference to generate zap alert overlays.',
      sourceLabel: 'Live URL / Nostr Address',
      sourcePlaceholder: 'https://sifaka.live/naddr1... or 30311:pubkey:d-tag',
      emptyHint: 'Paste a live page URL or choose one of your streams to generate zap alert URLs.'
    },
    'stream-chat': {
      name: 'Stream Chat',
      sourceMode: 'stream',
      queryParam: 'stream',
      usesStreamSelect: true,
      usesRelayOverride: true,
      showsStatus: true,
      supportsProfileSearch: false,
      builderDescription: 'Use one of your own live events or paste any public live stream reference to generate a chat overlay URL.',
      sourceLabel: 'Live URL / Nostr Address',
      sourcePlaceholder: 'https://sifaka.live/naddr1... or 30311:pubkey:d-tag',
      emptyHint: 'Paste a live page URL or choose one of your streams to generate a stream chat URL.'
    },
    'viewer-counter': {
      name: 'Viewer Counter',
      sourceMode: 'stream',
      queryParam: 'stream',
      usesStreamSelect: true,
      usesRelayOverride: true,
      showsStatus: true,
      supportsProfileSearch: false,
      builderDescription: 'Use one of your own live events or paste any public live stream reference to generate a live viewer counter.',
      sourceLabel: 'Live URL / Nostr Address',
      sourcePlaceholder: 'https://sifaka.live/naddr1... or 30311:pubkey:d-tag',
      emptyHint: 'Paste a live page URL or choose one of your streams to generate a viewer counter URL.'
    }
  };

  const WIDGET_KINDS = Object.keys(WIDGET_CONFIG);
  const builderState = {
    activeKind: '',
    streamSource: '',
    profileSource: '',
    relays: '',
    nameTagTheme: DEFAULT_NAME_TAG_OPTIONS.theme,
    nameTagFont: DEFAULT_NAME_TAG_OPTIONS.font,
    nameTagAvatarSide: DEFAULT_NAME_TAG_OPTIONS.avatarSide,
    nameTagIdentityOverride: DEFAULT_NAME_TAG_OPTIONS.identityOverride,
    nameTagSubtext: DEFAULT_NAME_TAG_OPTIONS.subtext,
    zapTheme: DEFAULT_ZAP_OPTIONS.theme,
    zapFont: DEFAULT_ZAP_OPTIONS.font,
    zapEffect: DEFAULT_ZAP_OPTIONS.effect,
    zapMotionMs: DEFAULT_ZAP_OPTIONS.motionMs,
    zapPreviewName: '',
    streams: [],
    selectedStreamAddress: '',
    profileSearchTimer: null,
    profileSearchRequestId: 0
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function cleanValue(value) {
    return String(value || '').trim();
  }

  function normalizeChoice(value, allowedValues, fallback) {
    const clean = cleanValue(value).toLowerCase();
    return allowedValues.has(clean) ? clean : fallback;
  }

  function normalizeNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.round(parsed);
    return Math.min(max, Math.max(min, rounded));
  }

  function sanitizeNameTagText(value, maxLength = 120) {
    return String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, maxLength);
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shortHex(value) {
    const raw = cleanValue(value);
    if (!raw || raw.length < 16) return raw || 'Anonymous';
    return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
  }

  function formatCount(value) {
    const num = Number(value || 0) || 0;
    return num.toLocaleString();
  }

  function contextBridge() {
    return window.__SIFAKA_CONTEXT && typeof window.__SIFAKA_CONTEXT === 'object'
      ? window.__SIFAKA_CONTEXT
      : null;
  }

  function normalizeNip05Token(value) {
    const raw = cleanValue(value).toLowerCase();
    if (!raw) return '';
    const candidate = raw.startsWith('@') ? raw.slice(1) : raw;
    return /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(candidate) ? candidate : '';
  }

  function currentNameTagOptions() {
    return {
      theme: normalizeChoice(builderState.nameTagTheme, NAME_TAG_THEMES, DEFAULT_NAME_TAG_OPTIONS.theme),
      font: normalizeChoice(builderState.nameTagFont, NAME_TAG_FONTS, DEFAULT_NAME_TAG_OPTIONS.font),
      avatarSide: normalizeChoice(builderState.nameTagAvatarSide, NAME_TAG_AVATAR_SIDES, DEFAULT_NAME_TAG_OPTIONS.avatarSide),
      identityOverride: sanitizeNameTagText(builderState.nameTagIdentityOverride),
      subtext: sanitizeNameTagText(builderState.nameTagSubtext)
    };
  }

  function writeNameTagOptionsToState(options = {}) {
    const next = {
      ...currentNameTagOptions(),
      ...options
    };
    builderState.nameTagTheme = normalizeChoice(next.theme, NAME_TAG_THEMES, DEFAULT_NAME_TAG_OPTIONS.theme);
    builderState.nameTagFont = normalizeChoice(next.font, NAME_TAG_FONTS, DEFAULT_NAME_TAG_OPTIONS.font);
    builderState.nameTagAvatarSide = normalizeChoice(next.avatarSide, NAME_TAG_AVATAR_SIDES, DEFAULT_NAME_TAG_OPTIONS.avatarSide);
    builderState.nameTagIdentityOverride = sanitizeNameTagText(next.identityOverride);
    builderState.nameTagSubtext = sanitizeNameTagText(next.subtext);
  }

  function currentZapOptions() {
    return {
      theme: normalizeChoice(builderState.zapTheme, ZAP_THEMES, DEFAULT_ZAP_OPTIONS.theme),
      font: normalizeChoice(builderState.zapFont, ZAP_FONTS, DEFAULT_ZAP_OPTIONS.font),
      effect: normalizeChoice(builderState.zapEffect, ZAP_EFFECTS, DEFAULT_ZAP_OPTIONS.effect),
      motionMs: normalizeNumber(builderState.zapMotionMs, 100, 2000, DEFAULT_ZAP_OPTIONS.motionMs)
    };
  }

  function writeZapOptionsToState(options = {}) {
    const next = {
      ...currentZapOptions(),
      ...options
    };
    builderState.zapTheme = normalizeChoice(next.theme, ZAP_THEMES, DEFAULT_ZAP_OPTIONS.theme);
    builderState.zapFont = normalizeChoice(next.font, ZAP_FONTS, DEFAULT_ZAP_OPTIONS.font);
    builderState.zapEffect = normalizeChoice(next.effect, ZAP_EFFECTS, DEFAULT_ZAP_OPTIONS.effect);
    builderState.zapMotionMs = normalizeNumber(next.motionMs, 100, 2000, DEFAULT_ZAP_OPTIONS.motionMs);
  }

  function currentZapPreviewName() {
    return cleanValue(builderState.zapPreviewName) || shortHex(ZAP_TEST_PREVIEW_SENDER) || 'Test zapper';
  }

  function widgetConfig(kind) {
    return WIDGET_CONFIG[kind] || null;
  }

  function readStoredBuilderState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const legacySource = cleanValue(parsed && parsed.source);
      const legacyIdentityOverride = cleanValue(parsed && parsed.nameTagCustomText);
      return {
        streamSource: cleanValue(parsed && parsed.streamSource) || legacySource,
        profileSource: cleanValue(parsed && parsed.profileSource),
        relays: cleanValue(parsed && parsed.relays),
        nameTagTheme: normalizeChoice(parsed && parsed.nameTagTheme, NAME_TAG_THEMES, DEFAULT_NAME_TAG_OPTIONS.theme),
        nameTagFont: normalizeChoice(parsed && parsed.nameTagFont, NAME_TAG_FONTS, DEFAULT_NAME_TAG_OPTIONS.font),
        nameTagAvatarSide: normalizeChoice(parsed && parsed.nameTagAvatarSide, NAME_TAG_AVATAR_SIDES, DEFAULT_NAME_TAG_OPTIONS.avatarSide),
        nameTagIdentityOverride: sanitizeNameTagText(parsed && (parsed.nameTagIdentityOverride || legacyIdentityOverride)),
        nameTagSubtext: sanitizeNameTagText(parsed && parsed.nameTagSubtext),
        zapTheme: normalizeChoice(parsed && parsed.zapTheme, ZAP_THEMES, DEFAULT_ZAP_OPTIONS.theme),
        zapFont: normalizeChoice(parsed && parsed.zapFont, ZAP_FONTS, DEFAULT_ZAP_OPTIONS.font),
        zapEffect: normalizeChoice(parsed && parsed.zapEffect, ZAP_EFFECTS, DEFAULT_ZAP_OPTIONS.effect),
        zapMotionMs: normalizeNumber(parsed && parsed.zapMotionMs, 100, 2000, DEFAULT_ZAP_OPTIONS.motionMs)
      };
    } catch (_) {
      return {
        streamSource: '',
        profileSource: '',
        relays: '',
        nameTagTheme: DEFAULT_NAME_TAG_OPTIONS.theme,
        nameTagFont: DEFAULT_NAME_TAG_OPTIONS.font,
        nameTagAvatarSide: DEFAULT_NAME_TAG_OPTIONS.avatarSide,
        nameTagIdentityOverride: DEFAULT_NAME_TAG_OPTIONS.identityOverride,
        nameTagSubtext: DEFAULT_NAME_TAG_OPTIONS.subtext,
        zapTheme: DEFAULT_ZAP_OPTIONS.theme,
        zapFont: DEFAULT_ZAP_OPTIONS.font,
        zapEffect: DEFAULT_ZAP_OPTIONS.effect,
        zapMotionMs: DEFAULT_ZAP_OPTIONS.motionMs
      };
    }
  }

  function writeStoredBuilderState() {
    const nameTagOptions = currentNameTagOptions();
    const zapOptions = currentZapOptions();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        streamSource: builderState.streamSource,
        profileSource: builderState.profileSource,
        relays: builderState.relays,
        nameTagTheme: nameTagOptions.theme,
        nameTagFont: nameTagOptions.font,
        nameTagAvatarSide: nameTagOptions.avatarSide,
        nameTagIdentityOverride: nameTagOptions.identityOverride,
        nameTagSubtext: nameTagOptions.subtext,
        zapTheme: zapOptions.theme,
        zapFont: zapOptions.font,
        zapEffect: zapOptions.effect,
        zapMotionMs: zapOptions.motionMs
      }));
    } catch (_) {}
  }

  function currentSourceValue(kind = builderState.activeKind) {
    const config = widgetConfig(kind);
    if (!config) return '';
    return config.sourceMode === 'profile' ? builderState.profileSource : builderState.streamSource;
  }

  function setCurrentSourceValue(value, kind = builderState.activeKind) {
    const config = widgetConfig(kind);
    if (!config) return;
    const clean = cleanValue(value);
    if (config.sourceMode === 'profile') builderState.profileSource = clean;
    else builderState.streamSource = clean;
    writeStoredBuilderState();
  }

  function detectProfileReference(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) return null;

    const nprofileMatch = raw.match(NPROFILE_RE);
    if (nprofileMatch && nprofileMatch[0]) {
      return { type: 'nprofile', token: nprofileMatch[0].toLowerCase() };
    }

    const npubMatch = raw.match(NPUB_RE);
    if (npubMatch && npubMatch[0]) {
      return { type: 'npub', token: npubMatch[0].toLowerCase() };
    }

    const hexMatch = raw.match(HEX_PUBKEY_RE);
    if (hexMatch && hexMatch[0]) {
      return { type: 'pubkey', token: hexMatch[0].toLowerCase() };
    }

    const directNip05 = normalizeNip05Token(raw);
    if (directNip05) {
      return { type: 'nip05', token: directNip05 };
    }

    const inlineNip05Match = raw.match(NIP05_RE);
    if (inlineNip05Match && inlineNip05Match[0]) {
      const normalized = normalizeNip05Token(inlineNip05Match[0]);
      if (normalized) return { type: 'nip05', token: normalized };
    }

    return null;
  }

  function extractProfileSource(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) return '';
    const detected = detectProfileReference(raw);
    return detected ? detected.token : raw;
  }

  function extractStreamSource(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) return '';

    const naddrMatch = raw.match(NADDR_RE);
    if (naddrMatch && naddrMatch[0]) return naddrMatch[0].toLowerCase();

    const addressMatch = raw.match(ADDRESS_RE);
    if (addressMatch && addressMatch[0]) return addressMatch[0];

    return raw;
  }

  function describeWidgetSource(kind, rawValue) {
    const config = widgetConfig(kind);
    const raw = cleanValue(rawValue);
    if (!config) {
      return {
        valid: false,
        tone: '',
        message: 'Pick a widget above to open its generator.'
      };
    }

    if (!raw) {
      return {
        valid: false,
        tone: '',
        message: config.emptyHint
      };
    }

    if (config.sourceMode === 'profile') {
      const profileRef = detectProfileReference(raw);
      if (profileRef) {
        if (profileRef.type === 'npub') {
          return {
            valid: true,
            tone: 'success',
            message: `Detected a Nostr profile reference: ${profileRef.token}`
          };
        }
        if (profileRef.type === 'nprofile') {
          return {
            valid: true,
            tone: 'success',
            message: `Detected a Nostr profile pointer: ${profileRef.token}`
          };
        }
        if (profileRef.type === 'pubkey') {
          return {
            valid: true,
            tone: 'success',
            message: `Using raw pubkey ${profileRef.token} for the name tag widget.`
          };
        }
        return {
          valid: true,
          tone: 'success',
          message: `Using nip-05 ${profileRef.token} for the name tag widget.`
        };
      }

      try {
        const parsed = new URL(raw);
        return {
          valid: true,
          tone: 'success',
          message: `Using ${parsed.hostname}${parsed.pathname} as the name tag source. If the URL contains an npub, nprofile, or nip-05, the overlay will resolve it.`
        };
      } catch (_) {
        return {
          valid: true,
          tone: 'success',
          message: 'Using the pasted value as-is. Name tags accept npub, hex pubkey, nip-05, or a profile URL that includes one of those references.'
        };
      }
    }

    const profileRef = detectProfileReference(raw);
    if (profileRef) {
      return {
        valid: false,
        tone: 'error',
        message: 'This widget needs a live URL, raw naddr, or 30311 live address. Use npub or nip-05 only for the Name Tag widget.'
      };
    }

    const naddrMatch = raw.match(NADDR_RE);
    if (naddrMatch && naddrMatch[0]) {
      return {
        valid: true,
        tone: 'success',
        message: `Detected a Nostr live event reference: ${naddrMatch[0].toLowerCase()}`
      };
    }

    const addressMatch = raw.match(ADDRESS_RE);
    if (addressMatch && addressMatch[0]) {
      return {
        valid: true,
        tone: 'success',
        message: `Detected a raw Nostr live address: ${addressMatch[0]}`
      };
    }

    try {
      const parsed = new URL(raw);
      return {
        valid: true,
        tone: 'success',
        message: `Using ${parsed.hostname}${parsed.pathname} as the live source. The overlay will extract the live reference from this URL.`
      };
    } catch (_) {
      return {
        valid: true,
        tone: 'success',
        message: 'Using the pasted value as-is. If it is a live route, naddr, or 30311 live address, the overlay will resolve it.'
      };
    }
  }

  function overlayBaseUrl() {
    try {
      return new URL('./widget-overlay.html', window.location.href);
    } catch (_) {
      return new URL('widget-overlay.html', 'https://sifaka.live/');
    }
  }

  function applyNameTagParams(url) {
    if (!url || !(url instanceof URL)) return;
    const options = currentNameTagOptions();
    if (options.theme !== DEFAULT_NAME_TAG_OPTIONS.theme) url.searchParams.set('theme', options.theme);
    if (options.font !== DEFAULT_NAME_TAG_OPTIONS.font) url.searchParams.set('font', options.font);
    if (options.avatarSide !== DEFAULT_NAME_TAG_OPTIONS.avatarSide) url.searchParams.set('avatar', options.avatarSide);
    if (cleanValue(options.identityOverride)) url.searchParams.set('identityText', options.identityOverride);
    if (cleanValue(options.subtext)) url.searchParams.set('subtext', options.subtext);
  }

  function applyZapParams(url) {
    if (!url || !(url instanceof URL)) return;
    const options = currentZapOptions();
    if (options.theme !== DEFAULT_ZAP_OPTIONS.theme) url.searchParams.set('zapTheme', options.theme);
    if (options.font !== DEFAULT_ZAP_OPTIONS.font) url.searchParams.set('zapFont', options.font);
    if (options.effect !== DEFAULT_ZAP_OPTIONS.effect) url.searchParams.set('zapEffect', options.effect);
    if (options.motionMs !== DEFAULT_ZAP_OPTIONS.motionMs) url.searchParams.set('zapMotion', String(options.motionMs));
  }

  function buildZapTestPreviewUrl() {
    const url = overlayBaseUrl();
    url.searchParams.set('type', 'zap-alerts');
    url.searchParams.set('testPreview', '1');
    url.searchParams.set('sender', ZAP_TEST_PREVIEW_SENDER);
    url.searchParams.set('testAmount', String(ZAP_TEST_PREVIEW_SATS));
    url.searchParams.set('testNote', ZAP_TEST_PREVIEW_NOTE);
    applyZapParams(url);
    return url;
  }

  function buildWidgetUrl(kind, source, relays) {
    const config = widgetConfig(kind);
    const url = overlayBaseUrl();
    if (!config) return url;
    url.searchParams.set('type', kind);
    if (source) url.searchParams.set(config.queryParam, source);
    if (config.usesRelayOverride && relays) url.searchParams.set('relays', relays);
    if (kind === 'name-tag') applyNameTagParams(url);
    if (kind === 'zap-alerts') applyZapParams(url);
    return url;
  }

  function setHint(message, tone = '') {
    const hint = qs('#widgetSourceHint');
    if (!hint) return;
    hint.textContent = message;
    hint.classList.remove('success', 'error');
    if (tone) hint.classList.add(tone);
  }

  function cancelProfileSearchTimer() {
    if (!builderState.profileSearchTimer) return;
    window.clearTimeout(builderState.profileSearchTimer);
    builderState.profileSearchTimer = null;
  }

  function hideProfileSearchResults() {
    const panel = qs('#widgetProfileSearchResults');
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove('is-empty');
    panel.innerHTML = '';
  }

  function preferredProfileSourceForResult(result) {
    if (!result || typeof result !== 'object') return '';
    return cleanValue(result.verifiedNip05Value)
      || cleanValue(result.nip05)
      || cleanValue(result.npub)
      || cleanValue(result.pubkey);
  }

  function renderProfileSearchResults(results = [], emptyMessage = '') {
    const panel = qs('#widgetProfileSearchResults');
    const sourceInput = qs('#widgetSourceInput');
    if (!panel) return;

    if (!Array.isArray(results) || !results.length) {
      panel.hidden = false;
      panel.classList.add('is-empty');
      panel.innerHTML = escapeHtml(emptyMessage || 'No matching profiles found yet. You can still paste an exact npub, nip-05, or profile URL.');
      return;
    }

    panel.hidden = false;
    panel.classList.remove('is-empty');
    panel.innerHTML = results.map((result, index) => {
      const displayName = cleanValue(result.displayName || result.name) || shortHex(result.pubkey || result.npub || '');
      const identity = cleanValue(result.verifiedNip05Value || result.nip05 || result.npub || result.pubkey);
      const avatar = cleanValue(result.avatar);
      const fallback = escapeHtml(displayName.charAt(0) || 'P');
      return `
        <div class="widget-profile-search-item">
          <div class="widget-profile-search-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : fallback}</div>
          <div class="widget-profile-search-main">
            <div class="widget-profile-search-name">${escapeHtml(displayName)}</div>
            <div class="widget-profile-search-meta">${escapeHtml(identity)}</div>
          </div>
          <button class="btn btn-ghost widget-profile-search-use" type="button" data-profile-index="${index}">Use</button>
        </div>`;
    }).join('');

    qsa('.widget-profile-search-use', panel).forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.profileIndex || -1);
        const selected = results[index];
        const preferred = preferredProfileSourceForResult(selected);
        if (!preferred || !sourceInput) return;
        sourceInput.value = preferred;
        setCurrentSourceValue(preferred, 'name-tag');
        hideProfileSearchResults();
        renderWidgetUrls();
      });
    });
  }

  async function runProfileSearch(queryOverride = '') {
    const config = widgetConfig(builderState.activeKind);
    const sourceInput = qs('#widgetSourceInput');
    if (!config || !config.supportsProfileSearch || !sourceInput) {
      hideProfileSearchResults();
      return;
    }

    const query = extractProfileSource(cleanValue(queryOverride || sourceInput.value));
    if (!query) {
      hideProfileSearchResults();
      return;
    }

    const bridge = contextBridge();
    const requestId = builderState.profileSearchRequestId + 1;
    builderState.profileSearchRequestId = requestId;
    renderProfileSearchResults([], 'Searching loaded profiles...');

    try {
      let results = [];
      if (bridge && typeof bridge.searchProfiles === 'function') {
        results = await bridge.searchProfiles(query, 6);
      }
      if (requestId !== builderState.profileSearchRequestId || !widgetConfig(builderState.activeKind) || !widgetConfig(builderState.activeKind).supportsProfileSearch) return;
      renderProfileSearchResults(results, 'No matching profiles found yet. You can still paste an exact npub, nip-05, or profile URL.');
    } catch (_) {
      if (requestId !== builderState.profileSearchRequestId || !widgetConfig(builderState.activeKind) || !widgetConfig(builderState.activeKind).supportsProfileSearch) return;
      renderProfileSearchResults([], 'Profile search is not available right now. You can still paste an exact npub, nip-05, or profile URL.');
    }
  }

  function scheduleProfileSearch() {
    cancelProfileSearchTimer();
    builderState.profileSearchTimer = window.setTimeout(() => {
      builderState.profileSearchTimer = null;
      runProfileSearch().catch(() => {});
    }, PROFILE_SEARCH_DEBOUNCE_MS);
  }

  function resetWidgetOutput(kind) {
    const input = qs(`#widgetUrl-${kind}`);
    if (input) input.value = '';
    const preview = qs(`.widget-open-btn[data-open-kind="${kind}"]`);
    if (preview) preview.href = buildWidgetUrl(kind, '', builderState.relays).toString();
    if (kind === 'name-tag') updateNameTagLivePreview('');
    if (kind === 'zap-alerts') updateZapTestPreviewLink();
  }

  function updateNameTagLivePreview(url) {
    const frame = qs('#widgetPreviewFrame-name-tag');
    if (!frame) return;

    const nextUrl = cleanValue(url);
    if (!nextUrl) {
      frame.hidden = true;
      if (frame.getAttribute('src')) frame.removeAttribute('src');
      frame.dataset.previewSrc = '';
      return;
    }

    let previewUrl = nextUrl;
    try {
      const parsed = new URL(nextUrl, window.location.href);
      parsed.searchParams.set('embed', '1');
      previewUrl = parsed.toString();
    } catch (_) {}

    if (frame.dataset.previewSrc !== previewUrl) {
      frame.src = previewUrl;
      frame.dataset.previewSrc = previewUrl;
    }
    frame.hidden = false;
  }

  function syncNameTagStyleControls() {
    const themeSelect = qs('#widgetNameTagTheme');
    const fontSelect = qs('#widgetNameTagFont');
    const avatarSelect = qs('#widgetNameTagAvatarSide');
    const identityInput = qs('#widgetNameTagIdentityOverride');
    const subtextInput = qs('#widgetNameTagSubtext');
    const options = currentNameTagOptions();

    if (themeSelect) themeSelect.value = options.theme;
    if (fontSelect) fontSelect.value = options.font;
    if (avatarSelect) avatarSelect.value = options.avatarSide;
    if (identityInput) identityInput.value = options.identityOverride;
    if (subtextInput) subtextInput.value = options.subtext;
  }

  function syncZapStyleControls() {
    const themeSelect = qs('#widgetZapTheme');
    const fontSelect = qs('#widgetZapFont');
    const effectSelect = qs('#widgetZapEffect');
    const motionInput = qs('#widgetZapMotionMs');
    const options = currentZapOptions();

    if (themeSelect) themeSelect.value = options.theme;
    if (fontSelect) fontSelect.value = options.font;
    if (effectSelect) effectSelect.value = options.effect;
    if (motionInput) motionInput.value = String(options.motionMs);
  }

  function updateZapTestPreviewLink() {
    const button = qs('.widget-open-btn[data-test-preview-kind="zap-alerts"]');
    if (!button) return;
    button.href = buildZapTestPreviewUrl().toString();
  }

  function syncZapPreviewStyles(restartAnimation = false) {
    const preview = qs('#widgetPreviewAlert-zap');
    if (!preview) return;
    const options = currentZapOptions();
    preview.className = `widget-preview-alert theme-${options.theme} font-${options.font} effect-${options.effect}`;
    preview.style.setProperty('--widget-preview-zap-motion-ms', `${options.motionMs}ms`);
    preview.innerHTML = `
      <div class="widget-preview-zap-top">
        <strong id="widgetPreviewZapName">${escapeHtml(currentZapPreviewName())}</strong>
        <span class="widget-preview-zap-amount" id="widgetPreviewZapAmount">&#9889; ${escapeHtml(formatCount(ZAP_TEST_PREVIEW_SATS))} sats</span>
      </div>
      <span class="widget-preview-zap-note" id="widgetPreviewZapNote">${escapeHtml(ZAP_TEST_PREVIEW_NOTE)}</span>
      <em>just now</em>`;
    updateZapTestPreviewLink();

    if (!restartAnimation || options.effect === 'none') return;
    preview.classList.remove('is-preview-animating');
    void preview.offsetWidth;
    preview.classList.add('is-preview-animating');
  }

  async function loadZapPreviewSender() {
    builderState.zapPreviewName = shortHex(ZAP_TEST_PREVIEW_SENDER) || 'Test zapper';
    syncZapPreviewStyles();
    const bridge = contextBridge();
    if (!bridge || typeof bridge.searchProfiles !== 'function') return;

    try {
      const results = await bridge.searchProfiles(ZAP_TEST_PREVIEW_SENDER, 1);
      const profile = Array.isArray(results) ? results[0] : null;
      const nextName = cleanValue(profile && (profile.displayName || profile.name || profile.verifiedNip05Value || profile.nip05 || profile.npub));
      if (!nextName) return;
      builderState.zapPreviewName = nextName;
      syncZapPreviewStyles();
    } catch (_) {}
  }

  function updatePickerButtons() {
    qsa('[data-widget-pick]').forEach((button) => {
      const isActive = cleanValue(button.dataset.widgetPick) === builderState.activeKind;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function updateCards() {
    const grid = qs('#widgetsGrid');
    const activeKind = builderState.activeKind;
    if (!grid) return;
    grid.hidden = !activeKind;

    qsa('.widget-tool-card[data-widget-kind]', grid).forEach((card) => {
      const isActive = cleanValue(card.dataset.widgetKind) === activeKind;
      card.hidden = !isActive;
      card.classList.toggle('is-active', isActive);
    });
    if (activeKind !== 'name-tag') updateNameTagLivePreview('');
  }

  function updateBuilderChrome() {
    const activeKind = builderState.activeKind;
    const config = widgetConfig(activeKind);
    const builderCard = qs('#widgetsBuilderCard');
    const title = qs('#widgetsBuilderTitle');
    const description = qs('#widgetsBuilderDescription');
    const sourceLabel = qs('#widgetSourceLabel');
    const sourceInput = qs('#widgetSourceInput');
    const streamField = qs('#widgetStreamSelectField');
    const relayField = qs('#widgetRelayField');
    const nameTagStyleField = qs('#widgetNameTagStyleField');
    const zapStyleField = qs('#widgetZapStyleField');
    const statusField = qs('#widgetStatusField');
    const streamHelp = qs('#widgetStreamSelectHelp');
    const searchBtn = qs('#widgetProfileSearchBtn');

    if (!builderCard || !title || !description || !sourceLabel || !sourceInput || !streamField || !relayField || !statusField || !nameTagStyleField || !zapStyleField) return;
    if (!config) {
      builderCard.hidden = true;
      hideProfileSearchResults();
      return;
    }

    builderCard.hidden = false;
    title.textContent = `${config.name} Generator`;
    description.textContent = config.builderDescription;
    sourceLabel.textContent = config.sourceLabel;
    sourceInput.placeholder = config.sourcePlaceholder;
    sourceInput.type = config.supportsProfileSearch ? 'search' : 'text';
    sourceInput.value = currentSourceValue(activeKind);
    streamField.hidden = !config.usesStreamSelect;
    relayField.hidden = !config.usesRelayOverride;
    nameTagStyleField.hidden = activeKind !== 'name-tag';
    zapStyleField.hidden = activeKind !== 'zap-alerts';
    statusField.hidden = !config.showsStatus;
    if (searchBtn) searchBtn.hidden = !config.supportsProfileSearch;
    syncNameTagStyleControls();
    syncZapStyleControls();
    syncZapPreviewStyles(activeKind === 'zap-alerts');

    if (streamHelp) {
      if (!config.usesStreamSelect) {
        streamHelp.textContent = 'Name tags use a profile reference instead of a live event, so the stream picker is hidden for this widget.';
      } else {
        streamHelp.textContent = builderState.streams.length
          ? 'Pick one of your streams to autofill the generator, or paste any public live URL below.'
          : 'No personal stream shortcuts yet. You can still paste any public live URL below.';
      }
    }

    if (!config.supportsProfileSearch) {
      builderState.profileSearchRequestId += 1;
      cancelProfileSearchTimer();
      hideProfileSearchResults();
    }
  }

  function renderWidgetUrls() {
    const sourceInput = qs('#widgetSourceInput');
    const relayInput = qs('#widgetRelayInput');
    const activeKind = builderState.activeKind;
    const config = widgetConfig(activeKind);

    if (relayInput) {
      builderState.relays = cleanValue(relayInput.value);
      writeStoredBuilderState();
    }

    if (!activeKind || !config || !sourceInput) {
      return;
    }

    const rawSource = cleanValue(sourceInput.value);
    setCurrentSourceValue(rawSource, activeKind);

    const hint = describeWidgetSource(activeKind, rawSource);
    setHint(hint.message, hint.tone);

    const source = config.sourceMode === 'profile'
      ? extractProfileSource(rawSource)
      : extractStreamSource(rawSource);
    const hasSource = hint.valid && !!source;
    const relays = config.usesRelayOverride ? builderState.relays : '';
    const url = buildWidgetUrl(activeKind, hasSource ? source : '', relays);

    const input = qs(`#widgetUrl-${activeKind}`);
    if (input) input.value = hasSource ? url.toString() : '';

    const preview = qs(`.widget-open-btn[data-open-kind="${activeKind}"]`);
    if (preview) preview.href = url.toString();
    if (activeKind === 'name-tag') updateNameTagLivePreview(hasSource ? url.toString() : '');
    if (activeKind === 'zap-alerts') updateZapTestPreviewLink();
  }

  function selectStreamOption(value) {
    const config = widgetConfig(builderState.activeKind);
    const select = qs('#widgetStreamSelect');
    const sourceInput = qs('#widgetSourceInput');
    if (!config || !config.usesStreamSelect || !select || !sourceInput) return;

    builderState.selectedStreamAddress = cleanValue(value);
    const selectedOption = select.options[select.selectedIndex];
    const nextSource = cleanValue(selectedOption && selectedOption.dataset.source ? selectedOption.dataset.source : value);
    if (nextSource) {
      builderState.streamSource = nextSource;
      sourceInput.value = nextSource;
      writeStoredBuilderState();
    }
    renderWidgetUrls();
  }

  function renderStreamOptions(streams = [], selectedAddress = '') {
    const select = qs('#widgetStreamSelect');
    if (!select) return;

    builderState.streams = Array.isArray(streams) ? streams : [];
    builderState.selectedStreamAddress = cleanValue(selectedAddress);
    select.innerHTML = '<option value="">Select one of your streams</option>';

    builderState.streams.forEach((stream) => {
      const option = document.createElement('option');
      option.value = cleanValue(stream.address);
      option.dataset.source = cleanValue(stream.source || stream.address);
      const status = cleanValue(stream.status || '').toUpperCase() || 'STREAM';
      option.textContent = `${status} - ${cleanValue(stream.title) || 'Untitled stream'}`;
      select.appendChild(option);
    });

    if (builderState.streams.length && builderState.selectedStreamAddress) {
      const preferred = builderState.streams.find((stream) => cleanValue(stream.address) === builderState.selectedStreamAddress);
      if (preferred) {
        select.value = preferred.address;
        if (!cleanValue(builderState.streamSource)) {
          builderState.streamSource = cleanValue(preferred.source || preferred.address);
          writeStoredBuilderState();
        }
      }
    }

    updateBuilderChrome();
    renderWidgetUrls();
  }

  function activateWidget(kind, options = {}) {
    if (!widgetConfig(kind)) return;
    builderState.activeKind = kind;
    updatePickerButtons();
    updateBuilderChrome();
    updateCards();
    renderWidgetUrls();
    if (widgetConfig(kind).supportsProfileSearch && cleanValue(currentSourceValue(kind))) {
      scheduleProfileSearch();
    }

    if (options.scroll) {
      const builderCard = qs('#widgetsBuilderCard');
      if (builderCard && typeof builderCard.scrollIntoView === 'function') {
        builderCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function copyFieldValue(targetId, buttonEl) {
    const input = qs(`#${targetId}`);
    if (!input || !input.value) return;
    const originalLabel = buttonEl ? buttonEl.textContent : '';

    const afterCopy = (label) => {
      if (!buttonEl) return;
      buttonEl.textContent = label;
      window.setTimeout(() => {
        buttonEl.textContent = originalLabel || 'Copy URL';
      }, 1400);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(input.value).then(() => {
        afterCopy('Copied');
      }).catch(() => {
        input.focus();
        input.select();
        afterCopy('Select + Copy');
      });
      return;
    }

    input.focus();
    input.select();
    afterCopy('Select + Copy');
  }

  function initBuilder() {
    const stored = readStoredBuilderState();
    builderState.streamSource = cleanValue(stored.streamSource);
    builderState.profileSource = cleanValue(stored.profileSource);
    builderState.relays = cleanValue(stored.relays);
    writeNameTagOptionsToState(stored);
    writeZapOptionsToState(stored);

    const sourceInput = qs('#widgetSourceInput');
    const relayInput = qs('#widgetRelayInput');
    const select = qs('#widgetStreamSelect');
    const searchBtn = qs('#widgetProfileSearchBtn');
    const themeSelect = qs('#widgetNameTagTheme');
    const fontSelect = qs('#widgetNameTagFont');
    const avatarSelect = qs('#widgetNameTagAvatarSide');
    const identityInput = qs('#widgetNameTagIdentityOverride');
    const subtextInput = qs('#widgetNameTagSubtext');
    const zapThemeSelect = qs('#widgetZapTheme');
    const zapFontSelect = qs('#widgetZapFont');
    const zapEffectSelect = qs('#widgetZapEffect');
    const zapMotionInput = qs('#widgetZapMotionMs');

    if (relayInput) relayInput.value = builderState.relays;
    syncNameTagStyleControls();
    syncZapStyleControls();
    syncZapPreviewStyles();
    loadZapPreviewSender().catch(() => {});

    if (sourceInput) {
      sourceInput.addEventListener('input', () => {
        setCurrentSourceValue(sourceInput.value);
        renderWidgetUrls();
        if (widgetConfig(builderState.activeKind) && widgetConfig(builderState.activeKind).supportsProfileSearch) {
          if (!cleanValue(sourceInput.value)) hideProfileSearchResults();
          else scheduleProfileSearch();
        } else {
          hideProfileSearchResults();
        }
      });
      sourceInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (!widgetConfig(builderState.activeKind) || !widgetConfig(builderState.activeKind).supportsProfileSearch) return;
        event.preventDefault();
        cancelProfileSearchTimer();
        runProfileSearch().catch(() => {});
      });
    }

    if (relayInput) {
      relayInput.addEventListener('input', () => {
        builderState.relays = cleanValue(relayInput.value);
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (select) {
      select.addEventListener('change', (event) => {
        selectStreamOption(event.target && event.target.value || '');
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        cancelProfileSearchTimer();
        runProfileSearch().catch(() => {});
      });
    }

    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        writeNameTagOptionsToState({ theme: themeSelect.value });
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (fontSelect) {
      fontSelect.addEventListener('change', () => {
        writeNameTagOptionsToState({ font: fontSelect.value });
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (avatarSelect) {
      avatarSelect.addEventListener('change', () => {
        writeNameTagOptionsToState({ avatarSide: avatarSelect.value });
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (identityInput) {
      identityInput.addEventListener('input', () => {
        writeNameTagOptionsToState({ identityOverride: identityInput.value });
        if (identityInput.value !== builderState.nameTagIdentityOverride) identityInput.value = builderState.nameTagIdentityOverride;
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (subtextInput) {
      subtextInput.addEventListener('input', () => {
        writeNameTagOptionsToState({ subtext: subtextInput.value });
        if (subtextInput.value !== builderState.nameTagSubtext) subtextInput.value = builderState.nameTagSubtext;
        writeStoredBuilderState();
        renderWidgetUrls();
      });
    }

    if (zapThemeSelect) {
      zapThemeSelect.addEventListener('change', () => {
        writeZapOptionsToState({ theme: zapThemeSelect.value });
        writeStoredBuilderState();
        syncZapStyleControls();
        syncZapPreviewStyles(true);
        renderWidgetUrls();
      });
    }

    if (zapFontSelect) {
      zapFontSelect.addEventListener('change', () => {
        writeZapOptionsToState({ font: zapFontSelect.value });
        writeStoredBuilderState();
        syncZapStyleControls();
        syncZapPreviewStyles(true);
        renderWidgetUrls();
      });
    }

    if (zapEffectSelect) {
      zapEffectSelect.addEventListener('change', () => {
        writeZapOptionsToState({ effect: zapEffectSelect.value });
        writeStoredBuilderState();
        syncZapStyleControls();
        syncZapPreviewStyles(true);
        renderWidgetUrls();
      });
    }

    if (zapMotionInput) {
      zapMotionInput.addEventListener('input', () => {
        writeZapOptionsToState({ motionMs: zapMotionInput.value });
        if (zapMotionInput.value !== String(builderState.zapMotionMs)) zapMotionInput.value = String(builderState.zapMotionMs);
        writeStoredBuilderState();
        syncZapStyleControls();
        syncZapPreviewStyles(true);
        renderWidgetUrls();
      });
    }

    qsa('[data-widget-pick]').forEach((button) => {
      button.addEventListener('click', () => {
        activateWidget(cleanValue(button.dataset.widgetPick), { scroll: true });
      });
    });

    qsa('.widget-copy-btn').forEach((button) => {
      button.addEventListener('click', () => {
        copyFieldValue(button.dataset.copyTarget, button);
      });
    });

    updatePickerButtons();
    updateBuilderChrome();
    updateCards();
    setHint('Pick a widget above to open its generator.');
    WIDGET_KINDS.forEach((kind) => resetWidgetOutput(kind));
  }

  window.syncWidgetBuilderStreams = function (streams = [], selectedAddress = '') {
    renderStreamOptions(streams, selectedAddress);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBuilder, { once: true });
  } else {
    initBuilder();
  }
})();
