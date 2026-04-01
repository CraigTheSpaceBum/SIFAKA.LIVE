(function () {
  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://relay.nostr.net',
    'wss://www.nostr.ltd',
    'wss://relayable.org',
    'wss://nostr.fmt.wiz.biz',
    'wss://offchain.pub',
    'wss://nostr.mom'
  ];
  const NOSTR_TOOLS_SRC = 'https://unpkg.com/nostr-tools/lib/nostr.bundle.js';
  const KIND_PROFILE = 0;
  const KIND_LIVE_EVENT = 30311;
  const KIND_LIVE_CHAT = 1311;
  const KIND_ZAP_RECEIPT = 9735;
  const WIDGET_TYPES = new Set(['name-tag', 'viewer-counter', 'stream-chat', 'zap-alerts']);
  const NADDR_RE = /naddr1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const ADDRESS_RE = /30311:[0-9a-f]{64}:[^\s?#]+/i;
  const NPUB_RE = /npub1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const NPROFILE_RE = /nprofile1[023456789acdefghjklmnpqrstuvwxyz]+/i;
  const HEX_PUBKEY_RE = /\b[0-9a-f]{64}\b/i;
  const NIP05_RE = /\b[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
  const CHAT_MAX_VISIBLE = 8;
  const ZAP_MAX_VISIBLE = 4;
  const ZAP_ALERT_TTL_MS = 9000;
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
  const DEFAULT_TEST_ZAP_SENDER = 'npub1826v365he5ty69lk3xgvzqrwy8587vdfrxnsz0k09khzustf8r7s6j7t95';
  const DEFAULT_TEST_ZAP_SATS = 210;
  const DEFAULT_TEST_ZAP_NOTE = 'This is a test zap preview.';

  const state = {
    type: '',
    streamSource: '',
    nameTagOptions: { ...DEFAULT_NAME_TAG_OPTIONS },
    zapOptions: { ...DEFAULT_ZAP_OPTIONS },
    testPreview: false,
    relays: [],
    pool: null,
    stream: null,
    profilePubkey: '',
    profiles: new Map(),
    profileLookupFinished: new Set(),
    profilePromises: new Map(),
    nip05VerificationByPubkey: new Map(),
    nip05VerificationPromises: new Map(),
    npubByPubkey: new Map(),
    npubPromises: new Map(),
    scriptPromises: {},
    seenChatIds: new Set(),
    seenZapIds: new Set(),
    chatItems: [],
    zapAlerts: [],
    profileSubId: null,
    streamSubId: null,
    chatSubId: null,
    zapSubId: null,
    streamRefreshTimer: null,
    zapPruneTimer: null
  };

  class RelayPool {
    constructor(urls) {
      this.urls = [...new Set(urls)];
      this.sockets = new Map();
      this.subscriptions = new Map();
      this.connectAll();
    }

    connectAll() {
      this.urls.forEach((url) => this.connect(url));
    }

    connect(url) {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (_) {
        return;
      }

      ws.addEventListener('open', () => {
        this.subscriptions.forEach((sub, id) => {
          this.send(url, ['REQ', id, ...sub.filters]);
        });
      });

      ws.addEventListener('message', (msg) => {
        let data = null;
        try {
          data = JSON.parse(msg.data);
        } catch (_) {
          return;
        }
        if (!Array.isArray(data)) return;
        const type = data[0];
        if (type === 'EVENT') {
          const sub = this.subscriptions.get(data[1]);
          if (sub && sub.handlers && typeof sub.handlers.event === 'function') {
            sub.handlers.event(data[2], url);
          }
          return;
        }
        if (type === 'EOSE') {
          const sub = this.subscriptions.get(data[1]);
          if (sub && sub.handlers && typeof sub.handlers.eose === 'function') {
            sub.handlers.eose(url);
          }
        }
      });

      ws.addEventListener('close', () => {
        window.setTimeout(() => this.connect(url), 3000);
      });

      this.sockets.set(url, ws);
    }

    send(url, payload) {
      const ws = this.sockets.get(url);
      if (!ws || ws.readyState !== WebSocket.OPEN) return false;
      ws.send(JSON.stringify(payload));
      return true;
    }

    subscribe(filters, handlers) {
      const id = `sub_${Math.random().toString(36).slice(2, 10)}`;
      this.subscriptions.set(id, { filters, handlers });
      this.urls.forEach((url) => {
        this.send(url, ['REQ', id, ...filters]);
      });
      return id;
    }

    unsubscribe(id) {
      if (!id) return;
      this.subscriptions.delete(id);
      this.urls.forEach((url) => {
        this.send(url, ['CLOSE', id]);
      });
    }

    destroy() {
      this.subscriptions.forEach((_value, id) => this.unsubscribe(id));
      this.subscriptions.clear();
      this.sockets.forEach((ws) => {
        try { ws.close(); } catch (_) {}
      });
      this.sockets.clear();
    }
  }

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function cleanValue(value) {
    return String(value || '').trim();
  }

  function normalizeChoice(value, allowedValues, fallback) {
    const clean = cleanValue(value).toLowerCase();
    return allowedValues.has(clean) ? clean : fallback;
  }

  function sanitizeNameTagText(value, maxLength = 120) {
    return String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .slice(0, maxLength);
  }

  function normalizeNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    const rounded = Math.round(parsed);
    return Math.min(max, Math.max(min, rounded));
  }

  function normalizeNameTagOptions(options = {}) {
    return {
      theme: normalizeChoice(options.theme, NAME_TAG_THEMES, DEFAULT_NAME_TAG_OPTIONS.theme),
      font: normalizeChoice(options.font, NAME_TAG_FONTS, DEFAULT_NAME_TAG_OPTIONS.font),
      avatarSide: normalizeChoice(options.avatarSide || options.avatar, NAME_TAG_AVATAR_SIDES, DEFAULT_NAME_TAG_OPTIONS.avatarSide),
      identityOverride: sanitizeNameTagText(options.identityOverride || options.identityText),
      subtext: sanitizeNameTagText(options.subtext)
    };
  }

  function normalizeZapOptions(options = {}) {
    return {
      theme: normalizeChoice(options.theme || options.zapTheme, ZAP_THEMES, DEFAULT_ZAP_OPTIONS.theme),
      font: normalizeChoice(options.font || options.zapFont, ZAP_FONTS, DEFAULT_ZAP_OPTIONS.font),
      effect: normalizeChoice(options.effect || options.zapEffect, ZAP_EFFECTS, DEFAULT_ZAP_OPTIONS.effect),
      motionMs: normalizeNumber(options.motionMs || options.zapMotion, 100, 2000, DEFAULT_ZAP_OPTIONS.motionMs)
    };
  }

  function uniqueRelayUrls(values = []) {
    return Array.from(new Set(
      values
        .map((value) => cleanValue(value))
        .filter((value) => /^wss?:\/\//i.test(value))
    ));
  }

  function normalizePubkeyHex(pubkey) {
    const normalized = cleanValue(pubkey).toLowerCase();
    return /^[0-9a-f]{64}$/.test(normalized) ? normalized : '';
  }

  function shortHex(hex) {
    const clean = cleanValue(hex);
    if (!clean || clean.length < 16) return clean || 'Anon';
    return `${clean.slice(0, 8)}...${clean.slice(-6)}`;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeMediaUrl(value) {
    const raw = cleanValue(value);
    if (!raw) return '';
    return raw
      .replace(/^['"]+|['"]+$/g, '')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim();
  }

  function safeHrefFromUrl(value) {
    const raw = sanitizeMediaUrl(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, window.location.href);
      const protocol = String(parsed.protocol || '').toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') return '';
      return parsed.toString();
    } catch (_) {
      return '';
    }
  }

  function trimUrlTrailingPunctuation(url) {
    return String(url || '').replace(/[)\],.;!?'"`>]+$/g, '');
  }

  function extractHttpUrls(text) {
    const raw = String(text || '').match(/https?:\/\/\S+/gi) || [];
    return raw.map((url) =>
      String(url || '')
        .replace(/[)\],.;!?'"`>]+$/g, '')
        .replace(/^[("'`<]+/g, '')
    );
  }

  function classifyMediaUrl(url) {
    const base = String(url || '').split('#')[0].split('?')[0].toLowerCase();
    if (/\.(jpg|jpeg|png|gif|webp|avif)$/i.test(base)) return 'photo';
    return '';
  }

  function parseTags(tags = []) {
    const map = new Map();
    tags.forEach((tag) => {
      if (!Array.isArray(tag) || tag.length < 2) return;
      if (!map.has(tag[0])) map.set(tag[0], []);
      map.get(tag[0]).push(tag.slice(1));
    });
    return map;
  }

  function firstTag(map, key) {
    const values = map.get(key);
    if (!values || !values.length) return '';
    return String(values[0][0] || '');
  }

  function firstTagValue(tags, key) {
    const found = (tags || []).find((tag) => Array.isArray(tag) && tag[0] === key && tag[1]);
    return found ? String(found[1]) : '';
  }

  function allTagValues(tags, key) {
    return (tags || [])
      .filter((tag) => Array.isArray(tag) && tag[0] === key && tag[1])
      .map((tag) => String(tag[1]));
  }

  function parseJsonSafe(text) {
    const raw = cleanValue(text);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function satsFromAmountTag(amountTagValue) {
    const raw = Number(amountTagValue || 0);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (raw >= 1000) return Math.max(0, Math.floor(raw / 1000));
    return Math.max(0, Math.floor(raw));
  }

  function satsFromBolt11Tag(bolt11TagValue) {
    const invoice = cleanValue(bolt11TagValue).toLowerCase();
    if (!invoice) return 0;
    const match = invoice.match(/^ln(?:bc|tb|bcrt|sb|tbs)(\d+)([munp]?)/i);
    if (!match) return 0;
    const amount = Number(match[1] || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    const unit = String(match[2] || '').toLowerCase();
    let sats = 0;
    if (unit === 'm') sats = amount * 100000;
    else if (unit === 'u') sats = amount * 100;
    else if (unit === 'n') sats = amount / 10;
    else if (unit === 'p') sats = amount / 10000;
    else sats = amount * 100000000;
    return Number.isFinite(sats) && sats > 0 ? Math.max(0, Math.floor(sats)) : 0;
  }

  function formatCount(value) {
    const num = Number(value || 0) || 0;
    return num.toLocaleString();
  }

  function formatTime(ts) {
    const num = Number(ts || 0);
    if (!num) return '--:--';
    try {
      return new Date(num * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '--:--';
    }
  }

  function pickAvatar(seed) {
    const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const value = cleanValue(seed);
    if (!value) return pool[0];
    let sum = 0;
    for (let i = 0; i < value.length; i += 1) sum += value.charCodeAt(i);
    return pool[sum % pool.length];
  }

  function setStatus(message, tone = '') {
    const status = qs('#widgetStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.remove('hidden', 'error');
    if (tone === 'error') status.classList.add('error');
  }

  function hideStatus() {
    const status = qs('#widgetStatus');
    if (!status) return;
    status.classList.add('hidden');
  }

  function showError(message) {
    hideStatus();
    const stage = qs('#widgetStage');
    if (!stage) return;
    stage.innerHTML = `<div class="overlay-error"><strong>Widget setup needed</strong><span>${escapeHtml(message)}</span></div>`;
  }

  function loadExternalScript(src, globalName, timeoutMs = 15000) {
    const key = `${src}::${globalName}`;
    if (state.scriptPromises[key]) return state.scriptPromises[key];
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);

    state.scriptPromises[key] = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        const started = Date.now();
        const timer = window.setInterval(() => {
          if (globalName && window[globalName]) {
            window.clearInterval(timer);
            resolve(window[globalName]);
          } else if (Date.now() - started > timeoutMs) {
            window.clearInterval(timer);
            reject(new Error(`Timed out loading ${src}`));
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        if (globalName && !window[globalName]) {
          reject(new Error(`${globalName} did not load from ${src}`));
          return;
        }
        resolve(globalName ? window[globalName] : true);
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    }).catch((error) => {
      delete state.scriptPromises[key];
      throw error;
    });

    return state.scriptPromises[key];
  }

  async function ensureNostrTools() {
    if (window.NostrTools) return window.NostrTools;
    return loadExternalScript(NOSTR_TOOLS_SRC, 'NostrTools');
  }

  function normalizeNip05Value(value) {
    let raw = cleanValue(value).toLowerCase();
    if (!raw || raw.includes('/')) return '';
    if (raw.startsWith('@')) raw = raw.slice(1);

    let localPart = '';
    let domain = '';
    if (raw.includes('@')) {
      const parts = raw.split('@');
      if (parts.length !== 2) return '';
      localPart = cleanValue(parts[0]).toLowerCase();
      domain = cleanValue(parts[1]).toLowerCase();
    } else {
      localPart = '_';
      domain = raw;
    }

    if (!localPart || !domain || !domain.includes('.')) return '';
    if (!/^[a-z0-9._+-]+$/i.test(localPart)) return '';
    if (!/^[a-z0-9.-]+$/i.test(domain)) return '';
    return `${localPart}@${domain}`;
  }

  function pickNip05NameMatch(names, localPart) {
    if (!names || typeof names !== 'object') return '';
    const wanted = cleanValue(localPart).toLowerCase();
    if (!wanted) return '';
    if (names[wanted]) return names[wanted];
    const direct = Object.keys(names).find((key) => cleanValue(key).toLowerCase() === wanted);
    return direct ? names[direct] : '';
  }

  async function fetchNip05PubkeyFromWellKnown(nip05Input) {
    const normalized = normalizeNip05Value(nip05Input);
    if (!normalized) return '';
    const [localPart, domain] = normalized.split('@');
    const urls = [
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(localPart)}`,
      `https://${domain}/.well-known/nostr.json`
    ];
    for (let i = 0; i < urls.length; i += 1) {
      try {
        const response = await fetch(urls[i], { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        const names = data && data.names && typeof data.names === 'object' ? data.names : {};
        const candidate = normalizePubkeyHex(pickNip05NameMatch(names, localPart) || '');
        if (candidate) return candidate;
      } catch (_) {}
    }
    return '';
  }

  async function ensureVerifiedNip05(pubkey, nip05Input) {
    const normalizedPubkey = normalizePubkeyHex(pubkey);
    const normalizedNip05 = normalizeNip05Value(nip05Input);
    if (!normalizedPubkey || !normalizedNip05) return '';
    const cached = state.nip05VerificationByPubkey.get(normalizedPubkey);
    if (cached && cached.nip05 === normalizedNip05) {
      return cached.verified ? normalizedNip05 : '';
    }
    if (state.nip05VerificationPromises.has(normalizedPubkey)) {
      return state.nip05VerificationPromises.get(normalizedPubkey);
    }

    const promise = fetchNip05PubkeyFromWellKnown(normalizedNip05)
      .then((resolvedPubkey) => {
        const verified = !!resolvedPubkey && resolvedPubkey === normalizedPubkey;
        state.nip05VerificationByPubkey.set(normalizedPubkey, {
          nip05: normalizedNip05,
          verified
        });
        renderCurrentWidget();
        return verified ? normalizedNip05 : '';
      })
      .catch(() => '')
      .finally(() => {
        state.nip05VerificationPromises.delete(normalizedPubkey);
      });

    state.nip05VerificationPromises.set(normalizedPubkey, promise);
    return promise;
  }

  async function ensureNpub(pubkey) {
    const normalized = normalizePubkeyHex(pubkey);
    if (!normalized) return '';
    if (state.npubByPubkey.has(normalized)) return state.npubByPubkey.get(normalized);
    if (state.npubPromises.has(normalized)) return state.npubPromises.get(normalized);

    const promise = ensureNostrTools()
      .then((tools) => {
        if (!tools || !tools.nip19 || typeof tools.nip19.npubEncode !== 'function') return '';
        try {
          const npub = cleanValue(tools.nip19.npubEncode(normalized)).toLowerCase();
          state.npubByPubkey.set(normalized, npub);
          renderCurrentWidget();
          return npub;
        } catch (_) {
          return '';
        }
      })
      .catch(() => '')
      .finally(() => {
        state.npubPromises.delete(normalized);
      });

    state.npubPromises.set(normalized, promise);
    return promise;
  }

  async function decodeProfileToken(token) {
    const rawToken = cleanValue(token).toLowerCase();
    if (!rawToken) return null;
    const tools = await ensureNostrTools();
    const decoded = tools && tools.nip19 && typeof tools.nip19.decode === 'function'
      ? tools.nip19.decode(rawToken)
      : null;
    if (!decoded || !decoded.type || decoded.data == null) return null;

    if (decoded.type === 'npub') {
      const pubkey = normalizePubkeyHex(typeof decoded.data === 'string' ? decoded.data : '');
      return pubkey ? { pubkey, relays: [] } : null;
    }

    if (decoded.type === 'nprofile') {
      const pubkey = normalizePubkeyHex(decoded.data && decoded.data.pubkey || '');
      return pubkey
        ? { pubkey, relays: uniqueRelayUrls(decoded.data && decoded.data.relays || []) }
        : null;
    }

    return null;
  }

  async function resolveProfileReference(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) {
      throw new Error('Add a profile URL, npub, hex pubkey, or nip-05 to the widget URL.');
    }

    const nprofileMatch = raw.match(NPROFILE_RE);
    if (nprofileMatch && nprofileMatch[0]) {
      const decoded = await decodeProfileToken(nprofileMatch[0]);
      if (decoded && decoded.pubkey) return decoded;
      throw new Error('That nprofile could not be decoded.');
    }

    const npubMatch = raw.match(NPUB_RE);
    if (npubMatch && npubMatch[0]) {
      const decoded = await decodeProfileToken(npubMatch[0]);
      if (decoded && decoded.pubkey) return decoded;
      throw new Error('That npub could not be decoded.');
    }

    const hexMatch = raw.match(HEX_PUBKEY_RE);
    if (hexMatch && hexMatch[0]) {
      const pubkey = normalizePubkeyHex(hexMatch[0]);
      if (pubkey) return { pubkey, relays: [] };
    }

    const directNip05 = normalizeNip05Value(raw);
    const inlineNip05Match = raw.match(NIP05_RE);
    const nip05 = directNip05 || normalizeNip05Value(inlineNip05Match && inlineNip05Match[0] || '');
    if (nip05) {
      const pubkey = await fetchNip05PubkeyFromWellKnown(nip05);
      if (pubkey) return { pubkey, relays: [] };
      throw new Error(`The nip-05 ${nip05} could not be resolved.`);
    }

    throw new Error('No profile reference was found. Use a profile URL, npub, hex pubkey, or nip-05.');
  }

  async function resolveNameTagReference(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) {
      throw new Error('Add a profile URL, npub, hex pubkey, or nip-05 to the widget URL.');
    }
    try {
      const profileRef = await resolveProfileReference(raw);
      return {
        mode: 'profile',
        ...profileRef
      };
    } catch (profileError) {
      try {
        const streamRef = await resolveStreamReference(raw);
        return {
          mode: 'stream',
          ...streamRef
        };
      } catch (_) {
        throw profileError;
      }
    }
  }

  async function resolveStreamReference(rawValue) {
    const raw = cleanValue(rawValue);
    if (!raw) {
      throw new Error('Add a live URL, raw naddr, or Nostr live address to the widget URL.');
    }

    const naddrMatch = raw.match(NADDR_RE);
    if (naddrMatch && naddrMatch[0]) {
      const tools = await ensureNostrTools();
      const decoded = tools && tools.nip19 && typeof tools.nip19.decode === 'function'
        ? tools.nip19.decode(naddrMatch[0].toLowerCase())
        : null;
      if (!decoded || decoded.type !== 'naddr' || !decoded.data) {
        throw new Error('That naddr could not be decoded.');
      }
      const kind = Number(decoded.data.kind || KIND_LIVE_EVENT);
      const pubkey = normalizePubkeyHex(decoded.data.pubkey || '');
      const identifier = cleanValue(decoded.data.identifier);
      if (kind !== KIND_LIVE_EVENT || !pubkey || !identifier) {
        throw new Error('The supplied naddr is not a Nostr live event.');
      }
      return {
        kind,
        pubkey,
        identifier,
        address: `${kind}:${pubkey}:${identifier}`,
        relays: uniqueRelayUrls(decoded.data.relays || [])
      };
    }

    const addressMatch = raw.match(ADDRESS_RE);
    if (addressMatch && addressMatch[0]) {
      const token = addressMatch[0];
      const first = token.indexOf(':');
      const second = token.indexOf(':', first + 1);
      const kind = Number(token.slice(0, first));
      const pubkey = normalizePubkeyHex(token.slice(first + 1, second));
      const identifier = cleanValue(token.slice(second + 1));
      if (kind !== KIND_LIVE_EVENT || !pubkey || !identifier) {
        throw new Error('The supplied live address is not valid.');
      }
      return {
        kind,
        pubkey,
        identifier,
        address: `${kind}:${pubkey}:${identifier}`,
        relays: []
      };
    }

    throw new Error('No live event reference was found. Use a Sifaka live URL, a raw naddr, or a 30311 live address.');
  }

  function parseLiveEvent(ev) {
    const tagMap = parseTags(ev.tags || []);
    const d = firstTag(tagMap, 'd') || ev.id.slice(0, 12);
    const status = cleanValue(firstTag(tagMap, 'status') || 'live').toLowerCase() || 'live';
    const publisherPubkey = normalizePubkeyHex(ev.pubkey) || cleanValue(ev.pubkey).toLowerCase();
    const address = `${KIND_LIVE_EVENT}:${publisherPubkey}:${d}`;
    const starts = Number(firstTag(tagMap, 'starts') || 0) || null;
    const title = firstTag(tagMap, 'title') || cleanValue(ev.content).slice(0, 90) || 'Untitled stream';
    const summary = firstTag(tagMap, 'summary') || cleanValue(ev.content);
    const image = firstTag(tagMap, 'image') || firstTag(tagMap, 'thumb') || '';
    const streaming = firstTag(tagMap, 'streaming') || firstTag(tagMap, 'url') || '';
    const participants = Number(firstTag(tagMap, 'current_participants') || 0) || 0;

    let hostPubkey = publisherPubkey;
    for (const tag of (ev.tags || [])) {
      const taggedPubkey = normalizePubkeyHex(tag && tag[1]);
      if (tag[0] !== 'p' || !taggedPubkey) continue;
      const role = cleanValue(tag[3] || tag[2]).toLowerCase();
      if (role === 'host' || role === 'streamer') {
        hostPubkey = taggedPubkey;
        break;
      }
    }

    return {
      id: ev.id,
      pubkey: publisherPubkey,
      hostPubkey,
      created_at: Number(ev.created_at || 0),
      kind: Number(ev.kind || KIND_LIVE_EVENT),
      d,
      address,
      status,
      title,
      summary,
      image,
      streaming,
      starts,
      participants,
      raw: ev
    };
  }

  function parseProfileEvent(ev) {
    if (!ev || Number(ev.kind || 0) !== KIND_PROFILE) return null;
    const pubkey = normalizePubkeyHex(ev.pubkey || '');
    if (!pubkey) return null;
    const data = parseJsonSafe(ev.content) || {};
    return {
      pubkey,
      created_at: Number(ev.created_at || 0),
      name: cleanValue(data.name),
      display_name: cleanValue(data.display_name),
      picture: cleanValue(data.picture),
      nip05: cleanValue(data.nip05)
    };
  }

  function streamSessionStartSec(stream) {
    if (!stream) return 0;
    const starts = Number(stream.starts || 0) || 0;
    const createdAt = Number(stream.created_at || 0) || 0;
    return starts && createdAt ? Math.max(starts, createdAt) : (starts || createdAt || 0);
  }

  function currentHostPubkey() {
    if (!state.stream) return '';
    return normalizePubkeyHex(state.stream.hostPubkey || '') || normalizePubkeyHex(state.stream.pubkey || '');
  }

  function currentNameTagPubkey() {
    const directPubkey = normalizePubkeyHex(state.profilePubkey || '');
    if (directPubkey) return directPubkey;
    return currentHostPubkey();
  }

  function profileFor(pubkey) {
    return state.profiles.get(normalizePubkeyHex(pubkey)) || null;
  }

  function displayNameFor(pubkey, fallback = 'Anon') {
    const profile = profileFor(pubkey);
    if (profile) return profile.display_name || profile.name || shortHex(pubkey) || fallback;
    return shortHex(pubkey) || fallback;
  }

  function chatDisplayNameFor(item) {
    const pubkey = normalizePubkeyHex(item && item.pubkey || '');
    const profile = profileFor(pubkey);
    if (profile) {
      const displayName = cleanValue(profile.display_name || profile.name);
      if (displayName) return displayName;
    }
    if (pubkey && state.profilePromises.has(pubkey)) return 'Loading...';
    if (pubkey && !state.profileLookupFinished.has(pubkey) && !state.profilePromises.has(pubkey) && !state.profiles.has(pubkey)) {
      ensureProfile(pubkey).catch(() => {});
      return 'Loading...';
    }
    return 'Anonymous';
  }

  function collectWidgetMediaItems(text) {
    const rawText = String(text || '');
    const found = [];
    const seen = new Set();
    const pushUrl = (value) => {
      const href = safeHrefFromUrl(value);
      const kind = classifyMediaUrl(href);
      if (!href || kind !== 'photo' || seen.has(href)) return;
      seen.add(href);
      found.push({ url: href, kind });
    };

    rawText.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, (_match, url) => {
      pushUrl(url);
      return '';
    });

    extractHttpUrls(rawText).forEach((url) => pushUrl(url));
    return found;
  }

  function stripWidgetMediaTokens(text) {
    let next = String(text || '');
    next = next.replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, ' ');
    next = next.replace(/https?:\/\/\S+/gi, (match) => {
      const clean = trimUrlTrailingPunctuation(match);
      return classifyMediaUrl(clean) === 'photo' ? ' ' : match;
    });
    return next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function renderInlineWidgetMarkdown(raw) {
    const source = String(raw || '');
    if (!source) return '';

    const tokenRe = /(`[^`]+`|\*\*[^*][\s\S]*?\*\*|~~[^~][\s\S]*?~~|\*[^*\n][\s\S]*?\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/\S+)/g;
    let html = '';
    let cursor = 0;
    let match;

    while ((match = tokenRe.exec(source))) {
      const token = match[0];
      html += escapeHtml(source.slice(cursor, match.index));

      if (/^`[^`]+`$/.test(token)) {
        html += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
      } else if (/^\*\*[\s\S]+\*\*$/.test(token)) {
        html += `<strong>${renderInlineWidgetMarkdown(token.slice(2, -2))}</strong>`;
      } else if (/^~~[\s\S]+~~$/.test(token)) {
        html += `<s>${renderInlineWidgetMarkdown(token.slice(2, -2))}</s>`;
      } else if (/^\*[\s\S]+\*$/.test(token)) {
        html += `<em>${renderInlineWidgetMarkdown(token.slice(1, -1))}</em>`;
      } else if (/^\[[^\]]+\]\((https?:\/\/[^)\s]+)\)$/.test(token)) {
        const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
        const href = safeHrefFromUrl(linkMatch && linkMatch[2] ? linkMatch[2] : '');
        const label = linkMatch && linkMatch[1] ? linkMatch[1] : token;
        html += href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlineWidgetMarkdown(label)}</a>`
          : escapeHtml(token);
      } else {
        const cleanUrl = trimUrlTrailingPunctuation(token);
        const href = safeHrefFromUrl(cleanUrl);
        if (href) {
          html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(cleanUrl)}</a>`;
          html += escapeHtml(token.slice(cleanUrl.length));
        } else {
          html += escapeHtml(token);
        }
      }

      cursor = tokenRe.lastIndex;
    }

    html += escapeHtml(source.slice(cursor));
    return html;
  }

  function renderWidgetMarkdownBlocks(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';

    const lines = source.split('\n');
    let html = '';
    let paragraphLines = [];
    let activeList = '';

    const closeList = () => {
      if (!activeList) return;
      html += `</${activeList}>`;
      activeList = '';
    };

    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      html += `<p>${paragraphLines.map((line) => renderInlineWidgetMarkdown(line)).join('<br>')}</p>`;
      paragraphLines = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      const heading = line.match(/^\s*(#{1,3})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        html += `<h${level}>${renderInlineWidgetMarkdown(heading[2])}</h${level}>`;
        return;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        html += `<blockquote>${renderInlineWidgetMarkdown(quote[1])}</blockquote>`;
        return;
      }

      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        flushParagraph();
        if (activeList !== 'ul') {
          closeList();
          activeList = 'ul';
          html += '<ul>';
        }
        html += `<li>${renderInlineWidgetMarkdown(ul[1])}</li>`;
        return;
      }

      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        flushParagraph();
        if (activeList !== 'ol') {
          closeList();
          activeList = 'ol';
          html += '<ol>';
        }
        html += `<li>${renderInlineWidgetMarkdown(ol[1])}</li>`;
        return;
      }

      closeList();
      paragraphLines.push(line);
    });

    flushParagraph();
    closeList();
    return html;
  }

  function renderWidgetRichContent(content) {
    const mediaItems = collectWidgetMediaItems(content);
    const textOnly = stripWidgetMediaTokens(content);
    return {
      html: renderWidgetMarkdownBlocks(textOnly),
      mediaItems
    };
  }

  function renderWidgetMediaHtml(mediaItems, classPrefix = 'widget-chat') {
    if (!Array.isArray(mediaItems) || !mediaItems.length) return '';
    const items = mediaItems
      .filter((item) => item && item.kind === 'photo' && safeHrefFromUrl(item.url))
      .slice(0, 4);
    if (!items.length) return '';
    return `
      <div class="${classPrefix}-media-wrap">
        ${items.map((item) => `
          <a class="${classPrefix}-media-item" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
            <img src="${escapeHtml(item.url)}" alt="Chat image" loading="lazy">
          </a>`).join('')}
      </div>`;
  }

  function avatarMarkup(profile, seed, sizeClass = '') {
    const picture = cleanValue(profile && profile.picture || '');
    const classes = `widget-avatar ${sizeClass}`.trim();
    if (picture) {
      return `<div class="${classes}"><img src="${escapeHtml(picture)}" alt=""></div>`;
    }
    return `<div class="${classes}"><span class="widget-avatar-fallback">${escapeHtml(pickAvatar(seed))}</span></div>`;
  }

  async function collectEvents(filters, timeoutMs = 3600) {
    return new Promise((resolve) => {
      if (!state.pool) {
        resolve([]);
        return;
      }
      const eventsById = new Map();
      let settled = false;
      let settleTimer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (settleTimer) window.clearTimeout(settleTimer);
        window.clearTimeout(hardTimer);
        state.pool.unsubscribe(subId);
        resolve(Array.from(eventsById.values()));
      };

      const subId = state.pool.subscribe(filters, {
        event: (ev) => {
          if (ev && ev.id && !eventsById.has(ev.id)) eventsById.set(ev.id, ev);
        },
        eose: () => {
          if (settleTimer) return;
          settleTimer = window.setTimeout(finish, 250);
        }
      });

      const hardTimer = window.setTimeout(finish, timeoutMs);
    });
  }

  async function fetchLatestStream(ref) {
    const events = await collectEvents([
      {
        kinds: [KIND_LIVE_EVENT],
        authors: [ref.pubkey],
        '#d': [ref.identifier],
        limit: 12
      }
    ], 4200);
    const latest = events
      .filter((ev) => Number(ev.kind || 0) === KIND_LIVE_EVENT)
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
    return latest ? parseLiveEvent(latest) : null;
  }

  function unsubscribeTracked(key) {
    const subId = state[key];
    if (!subId || !state.pool) return;
    state.pool.unsubscribe(subId);
    state[key] = null;
  }

  function getNameTagIdentity(pubkey, profile) {
    const normalizedPubkey = normalizePubkeyHex(pubkey);
    const nip05 = normalizeNip05Value(profile && profile.nip05 || '');
    if (nip05) {
      const cached = state.nip05VerificationByPubkey.get(normalizedPubkey);
      if (cached && cached.nip05 === nip05 && cached.verified) {
        return {
          label: nip05,
          verified: true
        };
      }
      ensureVerifiedNip05(normalizedPubkey, nip05).catch(() => {});
    }

    const cachedNpub = state.npubByPubkey.get(normalizedPubkey);
    if (cachedNpub) {
      return {
        label: cachedNpub,
        verified: false
      };
    }

    ensureNpub(normalizedPubkey).catch(() => {});
    return {
      label: shortHex(normalizedPubkey),
      verified: false
    };
  }

  function renderNameTag() {
    const stage = qs('#widgetStage');
    const hostPubkey = currentNameTagPubkey();
    const hostProfile = profileFor(hostPubkey);
    const hostName = displayNameFor(hostPubkey, 'Streamer');
    const identity = getNameTagIdentity(hostPubkey, hostProfile);
    const options = normalizeNameTagOptions(state.nameTagOptions);
    const identityLabel = cleanValue(options.identityOverride) ? options.identityOverride : identity.label;
    const hasSubtext = !!cleanValue(options.subtext);
    const avatarPanelHtml = options.avatarSide === 'none'
      ? ''
      : `<div class="widget-name-avatar-panel">${avatarMarkup(hostProfile, hostPubkey, 'name-tag-avatar')}</div>`;
    stage.innerHTML = `
      <div class="widget-name-tag theme-${escapeHtml(options.theme)} font-${escapeHtml(options.font)} avatar-${escapeHtml(options.avatarSide)}">
        <div class="widget-name-tag-inner">
          ${avatarPanelHtml}
          <div class="widget-name-copy">
            <strong class="widget-name-display${identity.verified ? ' is-verified' : ''}">${escapeHtml(hostName)}${identity.verified ? '<span class="widget-name-check" aria-hidden="true">&#10003;</span>' : ''}</strong>
            <div class="widget-name-identity${identity.verified ? ' is-verified' : ''}">
              <span>${escapeHtml(identityLabel)}</span>
            </div>
            ${hasSubtext ? `<div class="widget-name-subtext">${escapeHtml(options.subtext)}</div>` : ''}
          </div>
        </div>
      </div>`;
  }

  function renderViewerCounter() {
    const stage = qs('#widgetStage');
    const viewers = formatCount(Number(state.stream && state.stream.participants || 0));
    stage.innerHTML = `
      <div class="widget-viewer-counter">
        <div class="widget-viewer-label">
          <span>Viewers</span>
        </div>
        <div class="widget-viewer-count">${escapeHtml(viewers)}</div>
      </div>`;
  }

  function renderChatWidget() {
    const stage = qs('#widgetStage');
    const title = state.stream ? state.stream.title || 'Untitled stream' : 'Untitled stream';
    const rows = state.chatItems.slice(-CHAT_MAX_VISIBLE);
    const listHtml = rows.length
      ? rows.map((item) => {
        const profile = profileFor(item.pubkey);
        const displayName = chatDisplayNameFor(item);
        const richContent = renderWidgetRichContent(item.content);
        const bodyHtml = richContent.html
          ? `<div class="widget-chat-text">${richContent.html}</div>`
          : '';
        const mediaHtml = renderWidgetMediaHtml(richContent.mediaItems);
        const hasPicture = !!cleanValue(profile && profile.picture || '');
        if (hasPicture) {
          return `
          <div class="widget-chat-item has-inline-avatar">
            <div class="widget-chat-copy">
              <div class="widget-chat-meta">
                ${avatarMarkup(profile, item.pubkey, 'widget-chat-inline-avatar')}
                <span class="widget-chat-name">${escapeHtml(displayName)}</span>
                <span class="widget-chat-time">${escapeHtml(formatTime(item.created_at))}</span>
              </div>
              ${bodyHtml}
              ${mediaHtml}
            </div>
          </div>`;
        }
        return `
          <div class="widget-chat-item">
            ${avatarMarkup(profile, item.pubkey)}
            <div class="widget-chat-copy">
              <div class="widget-chat-meta">
                <span class="widget-chat-name">${escapeHtml(displayName)}</span>
                <span class="widget-chat-time">${escapeHtml(formatTime(item.created_at))}</span>
              </div>
              ${bodyHtml}
              ${mediaHtml}
            </div>
          </div>`;
      }).join('')
      : '<div class="widget-empty">Waiting for live chat messages on this stream.</div>';

    stage.innerHTML = `
      <div class="widget-chat-shell">
        <div class="widget-chat-head">
          <strong>Stream Chat</strong>
          <span class="widget-pill"><span class="widget-dot"></span>Live</span>
        </div>
        <div class="widget-chat-stream">${escapeHtml(title)}</div>
        <div class="widget-chat-list">${listHtml}</div>
      </div>`;
  }

  function renderZapAlerts() {
    const stage = qs('#widgetStage');
    const options = normalizeZapOptions(state.zapOptions);
    const alerts = state.zapAlerts.slice(0, ZAP_MAX_VISIBLE);
    if (!alerts.length) {
      stage.innerHTML = '';
      return;
    }

    const content = alerts.map((alert) => {
      const alertName = alert.senderPubkey
        ? displayNameFor(alert.senderPubkey, alert.name || 'Anon')
        : alert.name || 'Anon';
      return `
        <div class="widget-zap-alert${alert.phase === 'entering' ? ' is-entering' : ''}${alert.phase === 'exiting' ? ' is-exiting' : ''}">
          <div class="widget-zap-top">
            <span class="widget-zap-name">${escapeHtml(alertName)}</span>
            <span class="widget-zap-amount">&#9889; ${escapeHtml(formatCount(alert.sats))} sats</span>
          </div>
          <div class="widget-zap-note">${escapeHtml(alert.note || 'Sent a zap')}</div>
          <div class="widget-zap-time">${escapeHtml(formatTime(alert.created_at))}</div>
        </div>`;
    }).join('');

    stage.innerHTML = `<div class="widget-zap-stack theme-${escapeHtml(options.theme)} font-${escapeHtml(options.font)} effect-${escapeHtml(options.effect)}" style="--widget-zap-motion-ms:${options.motionMs}ms">${content}</div>`;
  }

  function renderCurrentWidget() {
    hideStatus();
    if (state.type === 'name-tag') {
      if (!currentNameTagPubkey()) {
        setStatus('Waiting for profile data...');
        return;
      }
      renderNameTag();
      return;
    }
    if (state.type === 'zap-alerts' && state.testPreview) {
      renderZapAlerts();
      return;
    }
    if (!state.stream) {
      setStatus('Waiting for stream data...');
      return;
    }
    if (state.type === 'viewer-counter') {
      renderViewerCounter();
      return;
    }
    if (state.type === 'stream-chat') {
      renderChatWidget();
      return;
    }
    renderZapAlerts();
  }

  async function ensureProfile(pubkey) {
    const normalized = normalizePubkeyHex(pubkey);
    if (!normalized) return null;
    if (state.profiles.has(normalized)) return state.profiles.get(normalized);
    if (state.profileLookupFinished.has(normalized)) return null;
    if (state.profilePromises.has(normalized)) return state.profilePromises.get(normalized);

    const promise = collectEvents([{ kinds: [KIND_PROFILE], authors: [normalized], limit: 2 }], 2800)
      .then((events) => {
        const latest = (events || [])
          .map((ev) => parseProfileEvent(ev))
          .filter((profile) => profile && profile.pubkey === normalized)
          .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
        if (!latest) return null;
        const profile = latest;
        state.profiles.set(normalized, profile);
        renderCurrentWidget();
        return profile;
      })
      .catch(() => null)
      .finally(() => {
        state.profileLookupFinished.add(normalized);
        state.profilePromises.delete(normalized);
      });

    state.profilePromises.set(normalized, promise);
    return promise;
  }

  function subscribeProfileUpdates(pubkey) {
    unsubscribeTracked('profileSubId');
    const normalized = normalizePubkeyHex(pubkey);
    if (!state.pool || !normalized) return;
    state.profileSubId = state.pool.subscribe([
      {
        kinds: [KIND_PROFILE],
        authors: [normalized],
        limit: 3
      }
    ], {
      event: (ev) => {
        const profile = parseProfileEvent(ev);
        if (!profile || profile.pubkey !== normalized) return;
        const current = state.profiles.get(normalized);
        if (current && Number(current.created_at || 0) > Number(profile.created_at || 0)) return;
        state.profiles.set(normalized, profile);
        state.profileLookupFinished.add(normalized);
        renderCurrentWidget();
      }
    });
  }

  function chatEventMatchesStream(ev) {
    if (!ev || Number(ev.kind || 0) !== KIND_LIVE_CHAT || !state.stream) return false;
    const tags = ev.tags || [];
    const targetAList = allTagValues(tags, 'a');
    const targetEList = allTagValues(tags, 'e').map((id) => cleanValue(id).toLowerCase());
    const targetPList = allTagValues(tags, 'p').map((pk) => normalizePubkeyHex(pk)).filter(Boolean);
    const streamAddress = cleanValue(state.stream.address);
    const currentEventId = cleanValue(state.stream.id).toLowerCase();
    if (streamAddress && targetAList.includes(streamAddress)) return true;
    if (currentEventId && targetEList.includes(currentEventId)) return true;
    const targets = [state.stream.pubkey, state.stream.hostPubkey].map((value) => normalizePubkeyHex(value)).filter(Boolean);
    if (!targetAList.length && !targetEList.length && targetPList.some((pk) => targets.includes(pk))) return true;
    return false;
  }

  function pushChatEvent(ev) {
    if (!ev || !ev.id || state.seenChatIds.has(ev.id) || !chatEventMatchesStream(ev)) return;
    state.seenChatIds.add(ev.id);
    const pubkey = normalizePubkeyHex(ev.pubkey || '') || cleanValue(ev.pubkey).toLowerCase();
    const item = {
      id: ev.id,
      pubkey,
      content: cleanValue(ev.content) || '[empty]',
      created_at: Number(ev.created_at || 0)
    };
    state.chatItems.push(item);
    state.chatItems.sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
    state.chatItems = state.chatItems.slice(-CHAT_MAX_VISIBLE);
    renderCurrentWidget();
    if (pubkey) ensureProfile(pubkey).catch(() => {});
  }

  function parseZapReceipt(ev) {
    if (!ev || Number(ev.kind || 0) !== KIND_ZAP_RECEIPT || !state.stream) return null;
    const tags = ev.tags || [];
    const description = parseJsonSafe(firstTagValue(tags, 'description')) || {};
    const descriptionTags = Array.isArray(description.tags) ? description.tags : [];
    const streamAddress = cleanValue(state.stream.address);
    const streamEventId = cleanValue(state.stream.id);
    const streamPubkey = normalizePubkeyHex(state.stream.pubkey || '');
    const streamHostPubkey = normalizePubkeyHex(state.stream.hostPubkey || '') || streamPubkey;

    const targetAList = [...allTagValues(tags, 'a'), ...allTagValues(descriptionTags, 'a')];
    const targetEList = [...allTagValues(tags, 'e'), ...allTagValues(descriptionTags, 'e')];
    const targetPList = [...allTagValues(tags, 'p'), ...allTagValues(descriptionTags, 'p')]
      .map((pk) => normalizePubkeyHex(pk))
      .filter(Boolean);

    const matchesByAddressOrEvent =
      (streamAddress && targetAList.includes(streamAddress)) ||
      (streamEventId && targetEList.includes(streamEventId));
    const matchesByTargetPubkey = targetPList.some((pk) => pk === streamHostPubkey || pk === streamPubkey);
    const hasOtherReference = !matchesByAddressOrEvent && (targetAList.length || targetEList.length);
    const matchesStream = matchesByAddressOrEvent || (matchesByTargetPubkey && !hasOtherReference);
    if (!matchesStream) return null;

    let sats = satsFromAmountTag(firstTagValue(tags, 'amount'));
    if (!sats) sats = satsFromAmountTag(firstTagValue(descriptionTags, 'amount'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(tags, 'bolt11'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(descriptionTags, 'bolt11'));
    if (!sats) return null;

    const senderPubkey = normalizePubkeyHex(description.pubkey || ev.pubkey || '');
    return {
      id: ev.id,
      created_at: Number(ev.created_at || 0),
      sats,
      senderPubkey,
      name: displayNameFor(senderPubkey, 'Anon'),
      note: cleanValue(description.content) || ''
    };
  }

  function pruneZapAlerts() {
    const now = Date.now();
    const options = normalizeZapOptions(state.zapOptions);
    let changed = false;
    const next = [];
    state.zapAlerts.forEach((alert) => {
      if (alert.phase === 'exiting') {
        if (Number(alert.removeAt || 0) <= now) {
          changed = true;
          return;
        }
        next.push(alert);
        return;
      }

      if (Number(alert.expiresAt || 0) <= now) {
        changed = true;
        if (options.effect === 'none') {
          return;
        }
        alert.phase = 'exiting';
        alert.removeAt = now + options.motionMs;
        next.push(alert);
        return;
      }

      next.push(alert);
    });
    if (!changed) return;
    state.zapAlerts = next;
    renderCurrentWidget();
  }

  function pushZapAlert(ev, animate = true) {
    if (!ev || !ev.id || state.seenZapIds.has(ev.id)) return;
    const parsed = parseZapReceipt(ev);
    if (!parsed) return;
    state.seenZapIds.add(ev.id);
    const options = normalizeZapOptions(state.zapOptions);
    const shouldAnimate = animate && options.effect !== 'none';
    const alert = {
      id: parsed.id,
      sats: parsed.sats,
      name: parsed.name,
      note: parsed.note,
      senderPubkey: parsed.senderPubkey,
      created_at: parsed.created_at,
      phase: shouldAnimate ? 'entering' : '',
      expiresAt: Date.now() + ZAP_ALERT_TTL_MS,
      removeAt: 0
    };
    state.zapAlerts.unshift(alert);
    state.zapAlerts = state.zapAlerts
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
      .slice(0, ZAP_MAX_VISIBLE);
    renderCurrentWidget();
    if (shouldAnimate) {
      window.setTimeout(() => {
        if (alert.phase !== 'entering') return;
        alert.phase = '';
        renderCurrentWidget();
      }, options.motionMs);
    }
    if (parsed.senderPubkey) ensureProfile(parsed.senderPubkey).catch(() => {});
  }

  function subscribeStreamUpdates() {
    unsubscribeTracked('streamSubId');
    if (!state.pool || !state.stream) return;
    state.streamSubId = state.pool.subscribe([
      {
        kinds: [KIND_LIVE_EVENT],
        authors: [state.stream.pubkey],
        '#d': [state.stream.d]
      }
    ], {
      event: (ev) => {
        if (!ev || Number(ev.kind || 0) !== KIND_LIVE_EVENT) return;
        const oldId = cleanValue(state.stream && state.stream.id);
        state.stream = parseLiveEvent(ev);
        renderCurrentWidget();
        const hostPubkey = currentHostPubkey();
        if (hostPubkey) {
          subscribeProfileUpdates(hostPubkey);
          ensureProfile(hostPubkey).catch(() => {});
        }
        if (oldId !== cleanValue(state.stream.id)) {
          if (state.type === 'stream-chat') subscribeChat();
          if (state.type === 'zap-alerts') subscribeZaps();
        }
      }
    });
  }

  function currentStreamRef() {
    if (!state.stream) return null;
    const pubkey = normalizePubkeyHex(state.stream.pubkey || '');
    const identifier = cleanValue(state.stream.d);
    if (!pubkey || !identifier) return null;
    return {
      pubkey,
      identifier
    };
  }

  async function refreshCurrentStreamSnapshot() {
    const ref = currentStreamRef();
    if (!ref) return;
    try {
      const latest = await fetchLatestStream(ref);
      if (!latest) return;
      const previous = state.stream || {};
      const changed =
        cleanValue(previous.id) !== cleanValue(latest.id)
        || Number(previous.participants || 0) !== Number(latest.participants || 0)
        || cleanValue(previous.status) !== cleanValue(latest.status);
      if (!changed) return;
      state.stream = latest;
      renderCurrentWidget();
    } catch (_) {}
  }

  function startViewerCounterRefreshLoop() {
    if (state.streamRefreshTimer) {
      window.clearInterval(state.streamRefreshTimer);
      state.streamRefreshTimer = null;
    }
    state.streamRefreshTimer = window.setInterval(() => {
      refreshCurrentStreamSnapshot();
    }, 8000);
  }

  async function seedChatHistory() {
    if (!state.stream) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const since = Math.max(0, Math.max(streamSessionStartSec(state.stream) - 1800, nowSec - (60 * 60 * 6)));
    const filters = [
      { kinds: [KIND_LIVE_CHAT], '#a': [state.stream.address], since, limit: 18 }
    ];
    if (state.stream.id) {
      filters.push({ kinds: [KIND_LIVE_CHAT], '#e': [state.stream.id], since, limit: 18 });
    }
    const targets = [state.stream.pubkey, state.stream.hostPubkey].map((value) => normalizePubkeyHex(value)).filter(Boolean);
    if (targets.length) {
      filters.push({ kinds: [KIND_LIVE_CHAT], '#p': targets, since, limit: 18 });
    }
    const events = await collectEvents(filters, 3200);
    events
      .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))
      .forEach((ev) => pushChatEvent(ev));
  }

  function subscribeChat() {
    unsubscribeTracked('chatSubId');
    if (!state.pool || !state.stream) return;
    const since = Math.max(0, Math.floor(Date.now() / 1000) - 120);
    const filters = [
      { kinds: [KIND_LIVE_CHAT], '#a': [state.stream.address], since }
    ];
    if (state.stream.id) {
      filters.push({ kinds: [KIND_LIVE_CHAT], '#e': [state.stream.id], since });
    }
    const targets = [state.stream.pubkey, state.stream.hostPubkey].map((value) => normalizePubkeyHex(value)).filter(Boolean);
    if (targets.length) {
      filters.push({ kinds: [KIND_LIVE_CHAT], '#p': targets, since });
    }
    state.chatSubId = state.pool.subscribe(filters, {
      event: (ev) => pushChatEvent(ev)
    });
  }

  async function seedRecentZaps() {
    if (!state.stream) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const since = Math.max(0, Math.max(streamSessionStartSec(state.stream) - 900, nowSec - (60 * 30)));
    const filters = [
      { kinds: [KIND_ZAP_RECEIPT], '#a': [state.stream.address], since, limit: 10 }
    ];
    if (state.stream.id) {
      filters.push({ kinds: [KIND_ZAP_RECEIPT], '#e': [state.stream.id], since, limit: 10 });
    }
    const events = await collectEvents(filters, 3200);
    events
      .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0))
      .forEach((ev) => pushZapAlert(ev, false));
  }

  function subscribeZaps() {
    unsubscribeTracked('zapSubId');
    if (!state.pool || !state.stream) return;
    const since = Math.max(0, Math.floor(Date.now() / 1000) - 120);
    const filters = [
      { kinds: [KIND_ZAP_RECEIPT], '#a': [state.stream.address], since }
    ];
    if (state.stream.id) {
      filters.push({ kinds: [KIND_ZAP_RECEIPT], '#e': [state.stream.id], since });
    }
    state.zapSubId = state.pool.subscribe(filters, {
      event: (ev) => pushZapAlert(ev, true)
    });
  }

  function buildRelayList(ref, overrideRelays) {
    return uniqueRelayUrls([...(overrideRelays || []), ...(ref.relays || []), ...DEFAULT_RELAYS]);
  }

  async function bootstrapZapTestPreview(params, overrideRelays) {
    const senderSource = cleanValue(params.get('sender')) || DEFAULT_TEST_ZAP_SENDER;
    const note = cleanValue(params.get('testNote')) || DEFAULT_TEST_ZAP_NOTE;
    const sats = normalizeNumber(params.get('testAmount'), 1, 100000000, DEFAULT_TEST_ZAP_SATS);
    let senderPubkey = '';
    let senderRelays = [];

    try {
      const profileRef = await resolveProfileReference(senderSource);
      senderPubkey = normalizePubkeyHex(profileRef && profileRef.pubkey || '');
      senderRelays = uniqueRelayUrls(profileRef && profileRef.relays || []);
    } catch (_) {}

    state.relays = uniqueRelayUrls([...(overrideRelays || []), ...senderRelays, ...DEFAULT_RELAYS]);
    if (senderPubkey) {
      state.pool = new RelayPool(state.relays);
    }

    const initialName = senderPubkey
      ? displayNameFor(senderPubkey, shortHex(senderSource) || 'Test zapper')
      : shortHex(senderSource) || 'Test zapper';
    const shouldAnimate = normalizeZapOptions(state.zapOptions).effect !== 'none';
    const alert = {
      id: 'test-zap-preview',
      sats,
      name: initialName,
      note,
      senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      phase: shouldAnimate ? 'entering' : '',
      expiresAt: Date.now() + 600000,
      removeAt: 0
    };

    state.zapAlerts = [alert];
    renderCurrentWidget();

    if (alert.phase === 'entering') {
      window.setTimeout(() => {
        if (alert.phase !== 'entering') return;
        alert.phase = '';
        renderCurrentWidget();
      }, normalizeZapOptions(state.zapOptions).motionMs);
    }

    if (senderPubkey) {
      subscribeProfileUpdates(senderPubkey);
      ensureProfile(senderPubkey).catch(() => {});
    }
  }

  function queryParams() {
    return new URLSearchParams(window.location.search || '');
  }

  function cleanup() {
    unsubscribeTracked('profileSubId');
    unsubscribeTracked('streamSubId');
    unsubscribeTracked('chatSubId');
    unsubscribeTracked('zapSubId');
    if (state.streamRefreshTimer) {
      window.clearInterval(state.streamRefreshTimer);
      state.streamRefreshTimer = null;
    }
    if (state.zapPruneTimer) {
      window.clearInterval(state.zapPruneTimer);
      state.zapPruneTimer = null;
    }
    if (state.pool) {
      state.pool.destroy();
      state.pool = null;
    }
  }

  async function bootstrap() {
    const params = queryParams();
    document.body.classList.toggle('widget-embed-mode', cleanValue(params.get('embed')) === '1');
    const requestedType = cleanValue(params.get('type') || '').toLowerCase();
    state.type = WIDGET_TYPES.has(requestedType) ? requestedType : '';
    state.nameTagOptions = normalizeNameTagOptions({
      theme: params.get('theme'),
      font: params.get('font'),
      avatarSide: params.get('avatar'),
      identityOverride: params.get('identityText'),
      subtext: params.get('subtext')
    });
    state.zapOptions = normalizeZapOptions({
      zapTheme: params.get('zapTheme'),
      zapFont: params.get('zapFont'),
      zapEffect: params.get('zapEffect'),
      zapMotion: params.get('zapMotion')
    });
    state.testPreview = cleanValue(params.get('testPreview')) === '1';
    state.streamSource = cleanValue(
      params.get('profile')
      || params.get('npub')
      || params.get('pubkey')
      || params.get('stream')
      || params.get('address')
      || params.get('naddr')
      || params.get('url')
    );
    state.profilePubkey = '';
    const overrideRelays = uniqueRelayUrls(cleanValue(params.get('relays')).split(','));

    if (!state.type) {
      showError('Choose a valid widget type: name-tag, viewer-counter, stream-chat, or zap-alerts.');
      return;
    }

    setStatus(state.type === 'name-tag' ? 'Resolving the profile for this widget...' : 'Resolving the live event for this widget...');

    try {
      if (state.type === 'zap-alerts' && state.testPreview) {
        setStatus('Loading test zap preview...');
        await bootstrapZapTestPreview(params, overrideRelays);
        hideStatus();
        return;
      }

      if (state.type === 'name-tag') {
        const ref = await resolveNameTagReference(state.streamSource);
        state.relays = buildRelayList(ref, overrideRelays);
        state.pool = new RelayPool(state.relays);

        if (ref.mode === 'profile') {
          state.profilePubkey = normalizePubkeyHex(ref.pubkey || '');
          renderCurrentWidget();
          if (state.profilePubkey) {
            subscribeProfileUpdates(state.profilePubkey);
            ensureProfile(state.profilePubkey).catch(() => {});
          }
          hideStatus();
          return;
        }

        state.stream = await fetchLatestStream(ref);
        if (!state.stream) {
          throw new Error('The live event could not be found on the configured relays yet.');
        }

        renderCurrentWidget();
        const hostPubkey = currentHostPubkey();
        if (hostPubkey) {
          subscribeProfileUpdates(hostPubkey);
          ensureProfile(hostPubkey).catch(() => {});
        }
        subscribeStreamUpdates();
        hideStatus();
        return;
      }

      const ref = await resolveStreamReference(state.streamSource);
      state.relays = buildRelayList(ref, overrideRelays);
      state.pool = new RelayPool(state.relays);
      state.stream = await fetchLatestStream(ref);
      if (!state.stream) {
        throw new Error('The live event could not be found on the configured relays yet.');
      }

      renderCurrentWidget();
      const hostPubkey = currentHostPubkey();
      if (hostPubkey) {
        subscribeProfileUpdates(hostPubkey);
        ensureProfile(hostPubkey).catch(() => {});
      }
      subscribeStreamUpdates();
      if (state.type === 'viewer-counter') {
        startViewerCounterRefreshLoop();
        refreshCurrentStreamSnapshot();
      }

      if (state.type === 'stream-chat') {
        setStatus('Loading recent chat...');
        await seedChatHistory();
        subscribeChat();
        renderCurrentWidget();
      }

      if (state.type === 'zap-alerts') {
        setStatus('Loading recent zaps...');
        await seedRecentZaps();
        subscribeZaps();
        renderCurrentWidget();
        state.zapPruneTimer = window.setInterval(pruneZapAlerts, 250);
      }

      hideStatus();
    } catch (error) {
      cleanup();
      showError(error && error.message ? error.message : 'This widget could not be started.');
    }
  }

  window.addEventListener('beforeunload', cleanup);
  bootstrap();
})();
