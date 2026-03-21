(function () {
  const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://nostr.fmt.wiz.biz',
    'wss://offchain.pub',
    'wss://nostr.mom'
  ];

  const KIND_PROFILE = 0;
  const KIND_DELETION = 5;
  const KIND_CONTACTS = 3;
  const KIND_REACTION = 7;
  const KIND_LIVE_EVENT = 30311;
  const KIND_LIVE_CHAT = 1311;
  const KIND_NIP71_VIDEO = 21;
  const KIND_NIP71_REEL = 22;
  const KIND_COMMENT = 1111;
  const KIND_DIRECT_MESSAGE = 4;
  const KIND_ZAP_RECEIPT = 9735;
  const KIND_PROFILE_STATUS = 30315;
  const KIND_PEOPLE_LIST = 30000;   // NIP-51 people list
  const KIND_GENERIC_LIST = 30001;  // NIP-51 generic list (bookmark-style)

  const LOCAL_NSEC_STORAGE_KEY = 'nostrflux_local_nsec';
  const REMOTE_SIGNER_STORAGE_KEY = 'nostrflux_remote_signer_v1';
  const NOSTR_TOOLS_SRC = 'https://unpkg.com/nostr-tools/lib/nostr.bundle.js';
  const HLS_JS_SRC = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
  const NOSTR_CONNECT_KIND = 24133;
  const REMOTE_SIGNER_REQUEST_TIMEOUT_MS = 18000;
  const REMOTE_SIGNER_CONNECT_TIMEOUT_MS = 28000;
  const REMOTE_SIGNER_SCAN_TIMEOUT_MS = 180000;
  const REMOTE_SIGNER_REQUESTED_PERMS = 'sign_event,nip04_encrypt,nip04_decrypt';
  const SETTINGS_STORAGE_KEY = 'nostrflux_settings_v1';
  const NOTIFICATIONS_LAST_READ_STORAGE_KEY = 'nostrflux_notifications_last_read_v1';
  const FOLLOWING_STORAGE_KEY = 'nostrflux_following_pubkeys_v1';
  const DM_LAST_READ_STORAGE_KEY = 'nostrflux_dm_last_read_v1';
  const DM_THREAD_INITIAL_LIMIT = 24;
  const DM_THREAD_PAGE_INCREMENT = 120;
  const DM_RENDER_BATCH_DELAY_MS = 80;
  const DM_DECRYPT_CONCURRENCY = 2;
  const DM_SYNC_LOOKBACK_YEARS = 48;
  const DM_SYNC_LOOKBACK_SECONDS = 60 * 60 * 24 * 365 * DM_SYNC_LOOKBACK_YEARS;
  const DM_SYNC_RECENT_YEARS = 5;
  const DM_SYNC_RECENT_SECONDS = 60 * 60 * 24 * 365 * DM_SYNC_RECENT_YEARS;
  const DM_SYNC_STATUS_TIMEOUT_MS = 4000;
  const DM_SYNC_LIMIT_PER_DIRECTION = 480;
  const DM_BACKFILL_LIMIT_PER_DIRECTION = 480;
  const DM_DECRYPT_QUEUE_SOFT_CAP = 1800;
  const DM_PER_PEER_MEMORY_CAP = 1200;
  const HIDDEN_ENDED_STREAMS_STORAGE_KEY = 'nostrflux_hidden_ended_streams_v1';
  const NIP05_LOOKUP_CACHE_TTL_MS = 1000 * 60 * 30;
  const NIP05_LOOKUP_MISS_CACHE_TTL_MS = 1000 * 60 * 3;
  const NIP05_LOOKUP_ERROR_CACHE_TTL_MS = 1000 * 45;
  const NIP05_UNVERIFIED_CACHE_TTL_MS = 1000 * 60 * 2;
  const NIP05_LIVE_UI_MAX_AGE_MS = 1000 * 60 * 5;
  const BLOSSOM_UPLOAD_ENDPOINTS = [
    'https://blossom.nostr.build/upload',
    'https://blossom.primal.net/upload'
  ];
  const BLOSSOM_MEDIA_ACCEPT = 'image/*,video/*,audio/*';
  const BLOSSOM_MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
  const SUPPORTED_UPLOAD_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
  const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',
    'mp4', 'webm', 'mov', 'm4v', 'mkv',
    'mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac'
  ]);
  const GIF_PICKER_LIMIT = 24;
  const GIF_PICKER_SEARCH_DEBOUNCE_MS = 260;
  const LIVE_STREAMS_CACHE_STORAGE_KEY = 'nostrflux_live_streams_cache_v1';
  const LIVE_STREAMS_CACHE_TTL_MS = 1000 * 60 * 2;
  const LIVE_STREAMS_CACHE_MAX_ITEMS = 160;
  const ONE_SHOT_CACHE_DEFAULT_TTL_MS = 1000 * 12;
  const ONE_SHOT_CACHE_DEFAULT_WARM_MS = 1000 * 75;
  const ONE_SHOT_CACHE_MAX_ENTRIES = 700;

  const DEFAULT_SETTINGS = {
    relays: [...DEFAULT_RELAYS],
    blossomUploadEndpoints: [...BLOSSOM_UPLOAD_ENDPOINTS],
    autoPublish: true,
    miniPlayer: true,
    showZapNotifications: true,
    showNip05Badges: true,
    compactChat: false,
    animateZaps: true,
    notificationsMentions: true,
    notificationsReplies: true,
    notificationsLikes: true,
    notificationsReposts: true,
    notificationsZaps: true,
    notificationsFollows: true,
    theme: 'dark',
    cacheQueryTtlSec: 12,
    cacheWarmSec: 75,
    cacheLiveFeedTtlSec: 120,
    lud16: '',
    website: '',
    banner: ''
  };

  const SAVED_LISTS_STORAGE_KEY = 'nostrflux_saved_lists_v1';
  const NOSTR_FEED_FILTER_STORAGE_KEY = 'nostrflux_feed_filter_v1';
  const NOSTR_FEED_PROFILE_KEY = '__nostr_feed__';

  const state = {
    relays: [...DEFAULT_RELAYS],
    settings: { ...DEFAULT_SETTINGS },
    pool: null,
    user: null,
    authMode: 'readonly',
    localSecretKey: null,
    remoteSignerSession: null,
    remoteLoginPending: false,
    remoteLoginAbortController: null,
    remoteLoginUri: '',
    pendingOnboardingNsec: '',
    streamsByAddress: new Map(),
    nip71VideosByEventId: new Map(),
    profilesByPubkey: new Map(),
    profileNotesByPubkey: new Map(),
    profileStatsByPubkey: new Map(),
    liveSubId: null,
    liveGridRenderTimer: null,
    profileSubId: null,
    chatSubId: null,
    profileFeedSubId: null,
    profileStatsSubId: null,
    profileStatsTargetPubkey: '',
    profileStatusSubId: null,
    nip51SubId: null,
    contactsSubId: null,
    savedListsSubId: null,
    selectedStreamAddress: null,
    selectedProfilePubkey: null,
    selectedProfileLiveAddress: null,
    profileTab: 'streams',
    profileBioExpandedByPubkey: new Map(),
    isLive: false,
    hlsInstance: null,
    playbackToken: 0,
    playbackAddress: '',
    playbackUrl: '',
    profileHlsInstance: null,
    profilePlaybackToken: 0,
    profilePlaybackAddress: '',
    profilePlaybackUrl: '',
    relayPulseTimer: null,
    followedPubkeys: new Set(),
    contactListPubkeys: new Set(),          // from kind:3 contact list
    contactsLatestCreatedAt: 0,
    contactsContent: '',
    contactsPTagByPubkey: new Map(),
    contactsOtherTags: [],
    followPublishPending: false,
    nip51Lists: new Map(),                  // listId -> { name, pubkeys, kind, d }
    savedExternalLists: [],                 // [{ naddr, name, pubkeys }] from Liststr/external
    activeListFilter: 'all',               // 'all' | 'following' | 'contacts' | listId | naddr
    listFilterDDOpen: false,
    videosFilter: 'all',                   // 'all' | 'watch-party' | 'past' | 'nip71-videos' | 'nip71-reels'
    videosRenderTimer: null,
    videosProfileFetchPending: new Set(),
    videoThumbObserver: null,
    videoPostModalToken: 0,
    videoPostModalEventId: '',
    videoPostModalHostPubkey: '',
    videoPostModalStream: null,
    videoPostModalIsWatchParty: false,
    videoPostModalPlayerCleanup: null,
    videoPostCommentsCacheByEventId: new Map(),
    videoPostCommentsSubId: null,
    videoPostLiveChatCacheByAddress: new Map(),
    videoPostLiveChatSubId: null,
    nostrFeedFilter: 'following',          // 'following' | 'contacts' | listId | naddr | 'global'
    nostrFeedSubId: null,
    nostrFeedRenderTimer: null,
    nostrFeedEoseTimer: null,
    nostrFeedEventsById: new Map(),
    nostrFeedProfileFetchPending: new Set(),
    nostrFeedRepostLookupPending: new Set(),
    nostrFeedInteractionHydratedIds: new Set(),
    nostrFeedInteractionQueuedIds: new Set(),
    nostrFeedInteractionFetchPending: false,
    nostrFeedLoading: false,
    nostrFeedError: '',
    notificationsById: new Map(),
    notificationsLoading: false,
    notificationsError: '',
    notificationsFetchPending: false,
    notificationsFetchPromise: null,
    notificationsLastLoadedAt: 0,
    notificationsLastReadAt: 0,
    notificationsProfileFetchPending: new Set(),
    notificationsTargetNotesById: new Map(),
    notificationsTargetFetchPending: false,
    notificationsTargetFetchPromise: null,
    // Hero featured stream cycling
    heroHlsInstance: null,
    heroPlaybackToken: 0,
    featuredIndex: 0,
    featuredCurrentAddress: '',
    featuredCycleTimer: null,
    featuredCycleStart: 0,
    featuredCycleRafId: null,
    featuredFailed: new Set(),             // addresses currently considered playback-offline
    // Infinite scroll
    liveGridPage: 0,
    liveGridObserver: null,
    GRID_PAGE_SIZE: 20,
    scriptPromises: {},
    streamZapTotals: new Map(),
    streamRecentZapsByAddress: new Map(),
    streamZapEventIdsByAddress: new Map(),
    _theaterRuntimeInterval: null,
    likedStreamAddresses: new Set(),  // tracks which streams the user has liked
    streamLikeEventIdByAddress: new Map(),
    streamLikePublishPending: false,
    boostedStreamAddresses: new Set(),
    streamBoostEventIdByAddress: new Map(),
    streamBoostCheckedByAddress: new Set(),
    streamBoostCheckPendingByAddress: new Set(),
    streamReactionPubkeysByKey: new Map(),
    streamReactionMetaByKey: new Map(),
    streamReactionIdByKeyAndPubkey: new Map(),
    streamReactionEventById: new Map(),
    streamOwnReactionIdByKey: new Map(),
    streamReactionPublishPendingByKey: new Set(),
    chatReactionSubId: null,
    chatLikePubkeysByMessageId: new Map(),
    chatReactionIdByMessageAndPubkey: new Map(),
    chatReactionEventById: new Map(), // reactionEventId -> { messageId, pubkey }
    chatOwnLikeEventByMessageId: new Map(),
    chatMessageEventsById: new Map(),
    chatLikePublishPendingByMessageId: new Set(),
    _chatProfileSubId: null,
    _chatProfileFetchTimer: null,
    _chatProfileEoseTimer: null,
    dmSubId: null,
    dmOwnerPubkey: '',
    dmMessagesByPeer: new Map(),
    dmEventIds: new Set(),
    dmDecryptPendingIds: new Set(),
    dmLastReadByPeer: new Map(),
    dmActivePeerPubkey: '',
    dmSearchTerm: '',
    dmDraftByPeer: new Map(),
    dmSendPending: false,
    dmListSelection: 'following',
    dmListActionPending: false,
    dmStatus: '',
    dmStatusMode: 'info',
    dmRenderTimer: null,
    dmRenderQueuedConversations: false,
    dmRenderQueuedThread: false,
    dmRenderScrollToBottom: false,
    dmThreadVisibleLimitByPeer: new Map(),
    dmDecryptQueue: [],
    dmDecryptWorkers: 0,
    dmLikedMessageIds: new Set(),
    dmEmojiReactionsByMessageId: new Map(),
    dmAddressBookOpen: false,
    dmThreadLastExpandAt: 0,
    dmSyncing: false,
    dmSyncEoseTimer: null,
    dmBackfilling: false,
    dmBackfillSubId: null,
    postReactionPublishPendingByNoteAndKey: new Set(),
    postBoostPublishPendingByNoteId: new Set(),
    reactionPickerTarget: null,
    shareModalStreamAddress: '',
    composeUploadSource: 'blossom',
    composeUploadPending: false,
    composeUploadTarget: 'profile',
    gifPickerTarget: 'profile',
    gifPickerPending: false,
    gifPickerQuery: '',
    gifPickerCursor: '',
    gifPickerResults: [],
    gifPickerRequestId: 0,
    gifPickerSearchTimer: null,
    nip96DiscoveryByHost: new Map(),
    activeViewerAddress: '',
    activeHeroViewerAddress: '',
    relayPingMsByUrl: new Map(),
    goLiveSelectedAddress: '',
    goLiveTemplateAddress: '',
    goLiveForceNew: false,
    goLiveHostMode: 'self',
    goLiveRelaysOpen: false,
    goLiveThirdPartyProvider: '',
    goLivePreviewHls: null,
    goLivePreviewTimer: null,
    goLivePreviewToken: 0,
    goLiveHiddenEndedAddresses: new Set(),
    profileStatusByPubkey: new Map(),
    profileStatusSavePending: false,
    nip05VerificationByPubkey: new Map(),   // pubkey -> { nip05, verified, checkedAt }
    nip05VerificationPendingByPubkey: new Set(),
    nip05LookupCacheByNip05: new Map(),     // nip05 -> { pubkey, checkedAt }
    oneShotQueryCacheByKey: new Map(),      // key -> { events, savedAt }
    oneShotQueryInflightByKey: new Map(),   // key -> Promise<events[]>
    liveStreamCachePersistTimer: null,
    pendingRouteAddress: '',
    pendingRouteNaddr: ''
  };

  class RelayPool {
    constructor(urls, onStatus) {
      this.urls = [...new Set(urls)];
      this.onStatus = onStatus;
      this.sockets = new Map();
      this.subscriptions = new Map();
      this.connectAll();
    }

    connectAll() {
      this.urls.forEach((url) => this.connect(url));
    }

    connect(url) {
      let ws;
      const connectStartedAt = Date.now();
      try {
        ws = new WebSocket(url);
      } catch (_) {
        this.onStatus(url, 'error');
        return;
      }

      ws.addEventListener('open', () => {
        const latencyMs = Date.now() - connectStartedAt;
        if (Number.isFinite(latencyMs) && latencyMs >= 0) {
          state.relayPingMsByUrl.set(url, Math.max(1, Math.round(latencyMs)));
        }
        this.onStatus(url, 'open');
        this.subscriptions.forEach((sub, id) => {
          this.send(url, ['REQ', id, ...sub.filters]);
        });
      });

      ws.addEventListener('message', (msg) => {
        let data;
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
        } else if (type === 'EOSE') {
          const sub = this.subscriptions.get(data[1]);
          if (sub && sub.handlers && typeof sub.handlers.eose === 'function') {
            sub.handlers.eose(url);
          }
        } else if (type === 'OK') {
          const eventId = data[1];
          const ok = data[2];
          const reason = data[3] || '';
          if (window.console && !ok) {
            console.warn('Relay reject', url, eventId, reason);
          }
        }
      });

      ws.addEventListener('error', () => this.onStatus(url, 'error'));
      ws.addEventListener('close', () => {
        this.onStatus(url, 'closed');
        setTimeout(() => this.connect(url), 3000);
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
      this.subscriptions.delete(id);
      this.urls.forEach((url) => {
        this.send(url, ['CLOSE', id]);
      });
    }

    publish(event) {
      let sent = 0;
      this.urls.forEach((url) => {
        if (this.send(url, ['EVENT', event])) sent += 1;
      });
      return sent;
    }

    destroy() {
      this.subscriptions.forEach((_value, id) => {
        this.urls.forEach((url) => this.send(url, ['CLOSE', id]));
      });
      this.subscriptions.clear();
      this.sockets.forEach((ws) => {
        try {
          ws.close();
        } catch (_) {
          // ignore
        }
      });
      this.sockets.clear();
    }
  }

  function qs(sel, root = document) {
    return root.querySelector(sel);
  }

  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  function shortHex(hex) {
    if (!hex || hex.length < 16) return hex || '';
    return `${hex.slice(0, 8)}...${hex.slice(-8)}`;
  }

  function toUnixSeconds(dtLocal) {
    if (!dtLocal) return null;
    const t = new Date(dtLocal).getTime();
    if (Number.isNaN(t)) return null;
    return Math.floor(t / 1000);
  }

  function fromUnixSeconds(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const yyyy = d.getUTCFullYear();
    const mm = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getUTCDate()}`.padStart(2, '0');
    const hh = `${d.getUTCHours()}`.padStart(2, '0');
    const mi = `${d.getUTCMinutes()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  function pickAvatar(seed) {
    const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    if (!seed) return pool[0];
    let sum = 0;
    for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
    return pool[sum % pool.length];
  }

  function loadExternalScript(src, globalName, timeoutMs = 15000) {
    const key = `${src}::${globalName}`;
    if (state.scriptPromises[key]) return state.scriptPromises[key];
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);

    state.scriptPromises[key] = new Promise((resolve, reject) => {
      const existing = qsa(`script[src="${src}"]`)[0];
      if (existing) {
        const started = Date.now();
        const timer = setInterval(() => {
          if (globalName && window[globalName]) {
            clearInterval(timer);
            resolve(window[globalName]);
          } else if (Date.now() - started > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`Timed out loading ${src}`));
          }
        }, 100);
        return;
      }

      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => {
        if (globalName && !window[globalName]) {
          reject(new Error(`${globalName} did not load from ${src}`));
          return;
        }
        resolve(globalName ? window[globalName] : true);
      };
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });

    return state.scriptPromises[key];
  }

  async function ensureNostrTools() {
    if (window.NostrTools) return window.NostrTools;
    return loadExternalScript(NOSTR_TOOLS_SRC, 'NostrTools');
  }

  async function ensureHlsJs() {
    if (window.Hls) return window.Hls;
    return loadExternalScript(HLS_JS_SRC, 'Hls');
  }

  function hexToBytes(hex) {
    const clean = (hex || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      throw new Error('Invalid hex private key.');
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) {
      out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function normalizeSecretKey(secret) {
    if (!secret) throw new Error('Missing secret key');
    if (secret instanceof Uint8Array) return secret;
    if (Array.isArray(secret)) return Uint8Array.from(secret);
    if (typeof secret === 'string') return hexToBytes(secret);
    throw new Error('Unsupported secret key format');
  }

  function isAbortLikeError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const msg = String(err.message || err || '').toLowerCase();
    return msg.includes('aborted') || msg.includes('cancelled') || msg.includes('canceled');
  }

  function throwIfAborted(signal, message = 'Remote login cancelled.') {
    if (signal && signal.aborted) {
      const err = new Error(message);
      err.name = 'AbortError';
      throw err;
    }
  }

  function uniqueRelayUrls(values) {
    const out = [];
    const seen = new Set();
    (Array.isArray(values) ? values : []).forEach((raw) => {
      const clean = String(raw || '').trim();
      if (!/^wss?:\/\//i.test(clean)) return;
      if (seen.has(clean)) return;
      seen.add(clean);
      out.push(clean);
    });
    return out;
  }

  function parseBunkerConnectionToken(tokenInput) {
    const raw = String(tokenInput || '').trim();
    if (!raw) throw new Error('Paste your bunker:// token from Primal first.');

    let parsed;
    try {
      parsed = new URL(raw);
    } catch (_) {
      throw new Error('Invalid bunker token. It should start with bunker://');
    }
    if (parsed.protocol !== 'bunker:') {
      throw new Error('Invalid remote login token. Expected bunker://');
    }

    const hostOrPath = (parsed.hostname || parsed.pathname || '').replace(/^\/+/, '');
    const remoteSignerPubkey = normalizePubkeyHex(hostOrPath);
    if (!remoteSignerPubkey) {
      throw new Error('Bunker token is missing a valid remote signer pubkey.');
    }

    const relays = uniqueRelayUrls(parsed.searchParams.getAll('relay'));
    if (!relays.length) relays.push('wss://relay.primal.net');

    return {
      remoteSignerPubkey,
      relays,
      connectSecret: String(parsed.searchParams.get('secret') || '').trim()
    };
  }

  function finalizeEventWithSecret(tools, unsigned, secretKey) {
    const normalized = normalizeSecretKey(secretKey);
    if (typeof tools.finalizeEvent === 'function') {
      return tools.finalizeEvent(unsigned, normalized);
    }
    const legacy = { ...unsigned, pubkey: tools.getPublicKey(normalized) };
    if (typeof tools.getEventHash === 'function') legacy.id = tools.getEventHash(legacy);
    if (typeof tools.signEvent === 'function') {
      legacy.sig = tools.signEvent(legacy, bytesToHex(normalized));
    }
    return legacy;
  }

  function clearPersistedRemoteSignerSession() {
    try {
      localStorage.removeItem(REMOTE_SIGNER_STORAGE_KEY);
    } catch (_) {}
  }

  function persistRemoteSignerSession(session, connectSecretOverride = '') {
    if (!session || !session.clientSecret) return;
    const payload = {
      remoteSignerPubkey: String(session.remoteSignerPubkey || ''),
      relays: uniqueRelayUrls(session.relays || []),
      clientSecretHex: bytesToHex(normalizeSecretKey(session.clientSecret)),
      connectSecret: String(connectSecretOverride || session.connectSecret || '').trim(),
      encryption: session.encryption === 'nip04' ? 'nip04' : 'nip44',
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(REMOTE_SIGNER_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  }

  function loadPersistedRemoteSignerSession() {
    const raw = (localStorage.getItem(REMOTE_SIGNER_STORAGE_KEY) || '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      const remoteSignerPubkey = normalizePubkeyHex(parsed.remoteSignerPubkey || '');
      const clientSecretHex = String(parsed.clientSecretHex || '').trim().toLowerCase();
      if (!remoteSignerPubkey || !/^[0-9a-f]{64}$/.test(clientSecretHex)) return null;
      const relays = uniqueRelayUrls(parsed.relays || []);
      if (!relays.length) relays.push('wss://relay.primal.net');
      return {
        remoteSignerPubkey,
        relays,
        clientSecretHex,
        connectSecret: String(parsed.connectSecret || '').trim(),
        encryption: parsed.encryption === 'nip04' ? 'nip04' : 'nip44'
      };
    } catch (_) {
      return null;
    }
  }

  function teardownRemoteSignerSessionObject(session, reason = 'Remote signer session closed.') {
    if (!session) return;
    session.closed = true;
    if (session.pendingRequests instanceof Map) {
      session.pendingRequests.forEach((pending) => {
        if (!pending) return;
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        if (pending.abortSignal && pending.abortHandler) {
          try { pending.abortSignal.removeEventListener('abort', pending.abortHandler); } catch (_) {}
        }
        try {
          pending.reject(new Error(reason));
        } catch (_) {}
      });
      session.pendingRequests.clear();
    }
    if (session.responseSub && typeof session.responseSub.close === 'function') {
      try { session.responseSub.close(reason); } catch (_) {}
    }
    session.responseSub = null;
    if (session.pool && typeof session.pool.destroy === 'function') {
      try { session.pool.destroy(); } catch (_) {}
    }
    session.pool = null;
  }

  function teardownRemoteSignerSession(reason = 'Remote signer session closed.') {
    const current = state.remoteSignerSession;
    if (!current) return;
    state.remoteSignerSession = null;
    teardownRemoteSignerSessionObject(current, reason);
  }

  function setRemoteLoginStatus(message, mode = 'info') {
    const statusEl = qs('#remoteLoginStatus');
    if (!statusEl) return;
    const clean = String(message || '').trim();
    statusEl.textContent = clean;
    statusEl.classList.remove('is-loading', 'is-success', 'is-error', 'is-info', 'is-visible');
    if (!clean) return;
    statusEl.classList.add('is-visible');
    statusEl.classList.add(mode === 'loading' || mode === 'success' || mode === 'error' ? `is-${mode}` : 'is-info');
  }

  function buildRemoteQrImageUrl(value) {
    const payload = String(value || '').trim();
    if (!payload) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=3&data=${encodeURIComponent(payload)}`;
  }

  function setRemoteLoginUri(uri = '') {
    const clean = String(uri || '').trim();
    state.remoteLoginUri = clean;
    const card = qs('#remoteQrCard');
    const img = qs('#remoteLoginQrImg');
    const copyBtn = qs('#remoteLoginCopyBtn');
    if (copyBtn) copyBtn.disabled = !clean;
    if (!card || !img) return;
    if (!clean) {
      img.removeAttribute('src');
      card.style.display = 'none';
      return;
    }
    img.src = buildRemoteQrImageUrl(clean);
    card.style.display = 'flex';
  }

  function setRemoteLoginUiBusy(on) {
    const busy = !!on;
    state.remoteLoginPending = busy;
    const launchBtn = qs('#remoteLoginLaunchBtn');
    const copyBtn = qs('#remoteLoginCopyBtn');
    const cancelBtn = qs('#remoteLoginCancelBtn');
    if (launchBtn) {
      launchBtn.classList.toggle('is-disabled', busy);
      launchBtn.style.pointerEvents = busy ? 'none' : '';
      launchBtn.style.opacity = busy ? '.72' : '';
    }
    if (copyBtn) copyBtn.disabled = !state.remoteLoginUri;
    if (cancelBtn) {
      cancelBtn.disabled = !busy;
    }
  }

  function cancelRemoteLoginAttempt(opts = {}) {
    if (state.remoteLoginAbortController) {
      try { state.remoteLoginAbortController.abort(); } catch (_) {}
      state.remoteLoginAbortController = null;
    }
    setRemoteLoginUiBusy(false);
    if (!opts.keepQr) setRemoteLoginUri('');
    if (!opts.silent) setRemoteLoginStatus('Remote login cancelled.', 'info');
  }

  async function decryptRemoteSignerPayloadFromSender(session, senderPubkey, ciphertext, preferredMode = '') {
    const tools = await ensureNostrTools();
    const remotePubkey = normalizePubkeyHex(senderPubkey);
    if (!remotePubkey) throw new Error('Missing remote signer pubkey for decrypt.');
    const modes = [];
    const pushMode = (mode) => {
      const normalized = mode === 'nip04' ? 'nip04' : 'nip44';
      if (!modes.includes(normalized)) modes.push(normalized);
    };
    if (preferredMode) pushMode(preferredMode);
    if (session && session.encryption) pushMode(session.encryption);
    pushMode('nip44');
    pushMode('nip04');

    let lastErr = null;
    for (const mode of modes) {
      try {
        let plaintext = '';
        if (mode === 'nip44') {
          if (!tools.nip44 || typeof tools.nip44.decrypt !== 'function' || typeof tools.nip44.getConversationKey !== 'function') {
            continue;
          }
          const useCached = normalizePubkeyHex(session.remoteSignerPubkey || '') === remotePubkey;
          if (useCached && session.nip44ConversationKey) {
            plaintext = tools.nip44.decrypt(ciphertext, session.nip44ConversationKey);
          } else {
            const conversationKey = tools.nip44.getConversationKey(session.clientSecret, remotePubkey);
            plaintext = tools.nip44.decrypt(ciphertext, conversationKey);
            if (useCached) session.nip44ConversationKey = conversationKey;
          }
        } else {
          if (!tools.nip04 || typeof tools.nip04.decrypt !== 'function') continue;
          plaintext = await tools.nip04.decrypt(session.clientSecret, remotePubkey, ciphertext);
        }
        const payload = JSON.parse(String(plaintext || '{}'));
        if (!payload || typeof payload !== 'object') throw new Error('Malformed remote signer payload.');
        return { payload, encryption: mode };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Could not decrypt remote signer response.');
  }

  async function decryptRemoteSignerPayload(session, ciphertext, preferredMode = '') {
    return decryptRemoteSignerPayloadFromSender(session, session && session.remoteSignerPubkey || '', ciphertext, preferredMode);
  }

  async function encryptRemoteSignerPayload(session, payload, mode) {
    const tools = await ensureNostrTools();
    const rawPayload = JSON.stringify(payload);
    const targetMode = mode === 'nip04' ? 'nip04' : 'nip44';

    if (targetMode === 'nip44') {
      if (!tools.nip44 || typeof tools.nip44.encrypt !== 'function' || typeof tools.nip44.getConversationKey !== 'function') {
        throw new Error('NIP-44 encryption is not available.');
      }
      if (!session.nip44ConversationKey) {
        session.nip44ConversationKey = tools.nip44.getConversationKey(session.clientSecret, session.remoteSignerPubkey);
      }
      return tools.nip44.encrypt(rawPayload, session.nip44ConversationKey);
    }

    if (!tools.nip04 || typeof tools.nip04.encrypt !== 'function') {
      throw new Error('NIP-04 encryption is not available.');
    }
    return await tools.nip04.encrypt(session.clientSecret, session.remoteSignerPubkey, rawPayload);
  }

  async function handleRemoteSignerResponseEvent(session, ev) {
    if (!session || session.closed || !ev || !ev.content) return;
    let decoded;
    try {
      decoded = await decryptRemoteSignerPayload(session, ev.content);
    } catch (_) {
      return;
    }
    if (!decoded || !decoded.payload) return;
    const response = decoded.payload;
    const requestId = String(response.id || '').trim();
    if (!requestId || !session.pendingRequests || !session.pendingRequests.has(requestId)) return;

    const pending = session.pendingRequests.get(requestId);
    session.pendingRequests.delete(requestId);
    if (pending.timeoutId) clearTimeout(pending.timeoutId);
    if (pending.abortSignal && pending.abortHandler) {
      try { pending.abortSignal.removeEventListener('abort', pending.abortHandler); } catch (_) {}
    }

    if (response && typeof response.error !== 'undefined' && response.error !== null && response.error !== '') {
      const err = new Error(String(response.error));
      err.remoteSignerResponse = true;
      pending.reject(err);
      return;
    }
    pending.resolve({
      result: response.result,
      payload: response,
      encryption: decoded.encryption
    });
  }

  function startRemoteSignerResponseSubscription(session) {
    if (!session || session.responseSub || !session.pool) return;
    const since = Math.floor(Date.now() / 1000) - 10;
    const filter = {
      kinds: [NOSTR_CONNECT_KIND],
      '#p': [session.clientPubkey],
      since
    };
    if (session.remoteSignerPubkey) {
      filter.authors = [session.remoteSignerPubkey];
    }
    session.responseSub = session.pool.subscribe(
      session.relays,
      filter,
      {
        onevent: (ev) => {
          handleRemoteSignerResponseEvent(session, ev).catch(() => {});
        }
      }
    );
  }

  function generateRemoteConnectSecret() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function buildNostrConnectUri(session) {
    const params = new URLSearchParams();
    uniqueRelayUrls(session.relays || []).forEach((relay) => params.append('relay', relay));
    params.set('secret', String(session.connectSecret || '').trim());
    params.set('perms', REMOTE_SIGNER_REQUESTED_PERMS);
    const metadata = {
      name: 'Sifaka Live',
      url: (window.location && window.location.origin) ? window.location.origin : 'https://sifaka.live'
    };
    params.set('metadata', JSON.stringify(metadata));
    return `nostrconnect://${session.clientPubkey}?${params.toString()}`;
  }

  function remotePayloadIncludesSecret(payload, secret) {
    const expected = String(secret || '').trim();
    if (!expected) return true;
    const seen = [];
    const collect = (value) => {
      if (value === null || typeof value === 'undefined') return;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        seen.push(String(value).trim());
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => collect(item));
        return;
      }
      if (typeof value === 'object') {
        Object.keys(value).forEach((key) => collect(value[key]));
      }
    };
    collect(payload && payload.result);
    collect(payload && payload.params);
    collect(payload && payload.secret);
    return seen.includes(expected);
  }

  async function waitForRemoteSignerConnect(session, opts = {}) {
    if (!session || !session.pool) throw new Error('Remote signer session is not initialized.');
    const signal = opts.signal || null;
    const timeoutMs = Math.max(8000, Number(opts.timeoutMs || REMOTE_SIGNER_SCAN_TIMEOUT_MS));
    throwIfAborted(signal, 'Remote login cancelled.');

    if (session.responseSub && typeof session.responseSub.close === 'function') {
      try { session.responseSub.close('waiting for connect'); } catch (_) {}
      session.responseSub = null;
    }

    const since = Math.floor(Date.now() / 1000) - 10;
    return await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (signal && abortHandler) {
          try { signal.removeEventListener('abort', abortHandler); } catch (_) {}
        }
        if (timer) clearTimeout(timer);
      };
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (session.responseSub && typeof session.responseSub.close === 'function') {
          try { session.responseSub.close('connect settled'); } catch (_) {}
        }
        session.responseSub = null;
        fn(value);
      };

      const timer = setTimeout(() => {
        finish(reject, new Error('Timed out waiting for QR scan approval.'));
      }, timeoutMs);

      const abortHandler = () => {
        finish(reject, new Error('Remote login cancelled.'));
      };
      if (signal) signal.addEventListener('abort', abortHandler, { once: true });

      session.responseSub = session.pool.subscribe(
        session.relays,
        {
          kinds: [NOSTR_CONNECT_KIND],
          '#p': [session.clientPubkey],
          since
        },
        {
          onevent: (ev) => {
            (async () => {
              if (!ev || !ev.pubkey || !ev.content) return;
              const sender = normalizePubkeyHex(ev.pubkey);
              if (!sender || sender === session.clientPubkey) return;
              let decoded;
              try {
                decoded = await decryptRemoteSignerPayloadFromSender(session, sender, ev.content);
              } catch (_) {
                return;
              }
              if (!decoded || !decoded.payload) return;
              if (!remotePayloadIncludesSecret(decoded.payload, session.connectSecret)) return;
              finish(resolve, { remoteSignerPubkey: sender, encryption: decoded.encryption });
            })().catch(() => {});
          }
        }
      );
    });
  }

  function buildRemoteSignerRequestId(session) {
    session.requestCounter = Number(session.requestCounter || 0) + 1;
    return `r${Date.now().toString(36)}${session.requestCounter.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  async function sendRemoteSignerRequestOnce(session, method, params, mode, opts = {}) {
    if (!session || session.closed || !session.pool) {
      throw new Error('Remote signer session is not connected.');
    }
    const signal = opts.signal || null;
    const timeoutMs = Math.max(3000, Number(opts.timeoutMs || REMOTE_SIGNER_REQUEST_TIMEOUT_MS));
    throwIfAborted(signal, 'Remote login cancelled.');
    startRemoteSignerResponseSubscription(session);

    const requestId = buildRemoteSignerRequestId(session);
    const payload = {
      id: requestId,
      method: String(method || '').trim(),
      params: Array.isArray(params) ? params : []
    };
    const encryptedContent = await encryptRemoteSignerPayload(session, payload, mode);
    const tools = await ensureNostrTools();
    const unsigned = {
      kind: NOSTR_CONNECT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', session.remoteSignerPubkey]],
      content: encryptedContent
    };
    const signed = finalizeEventWithSecret(tools, unsigned, session.clientSecret);

    let abortHandler = null;
    const responsePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        session.pendingRequests.delete(requestId);
        if (signal && abortHandler) {
          try { signal.removeEventListener('abort', abortHandler); } catch (_) {}
        }
        reject(new Error(`Remote signer timed out while waiting for ${payload.method}.`));
      }, timeoutMs);

      abortHandler = () => {
        session.pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(new Error('Remote login cancelled.'));
      };

      session.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeoutId,
        abortSignal: signal,
        abortHandler
      });
      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });

    try {
      const publishes = session.pool.publish(session.relays, signed, { maxWait: Math.max(3000, timeoutMs - 1000), abort: signal });
      if (!Array.isArray(publishes) || !publishes.length) {
        throw new Error('No relays configured for remote signer requests.');
      }
      await Promise.allSettled(publishes);
    } catch (err) {
      const pending = session.pendingRequests.get(requestId);
      if (pending) {
        session.pendingRequests.delete(requestId);
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        if (pending.abortSignal && pending.abortHandler) {
          try { pending.abortSignal.removeEventListener('abort', pending.abortHandler); } catch (_) {}
        }
        pending.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }

    const response = await responsePromise;
    if (response && response.encryption && response.encryption !== session.encryption) {
      session.encryption = response.encryption;
      session.nip44ConversationKey = null;
    }
    return response.result;
  }

  async function sendRemoteSignerRequest(session, method, params = [], opts = {}) {
    const preferred = opts.preferredEncryption === 'nip04' ? 'nip04' : (session.encryption === 'nip04' ? 'nip04' : 'nip44');
    const modes = opts.fallbackEncrypt === false
      ? [preferred]
      : (preferred === 'nip04' ? ['nip04', 'nip44'] : ['nip44', 'nip04']);
    let lastErr = null;
    for (const mode of modes) {
      try {
        return await sendRemoteSignerRequestOnce(session, method, params, mode, opts);
      } catch (err) {
        if (isAbortLikeError(err)) throw err;
        if (err && err.remoteSignerResponse) throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Remote signer request failed: ${method}`);
  }

  async function requestRemoteSigner(method, params = [], opts = {}) {
    if (!state.remoteSignerSession) throw new Error('Remote signer is not connected.');
    return await sendRemoteSignerRequest(state.remoteSignerSession, method, params, opts);
  }

  async function establishRemoteSignerSession(config, opts = {}) {
    const onStatus = typeof opts.onStatus === 'function' ? opts.onStatus : () => {};
    const signal = opts.signal || null;
    throwIfAborted(signal, 'Remote login cancelled.');

    const tools = await ensureNostrTools();
    if (!tools || typeof tools.SimplePool !== 'function' || typeof tools.getPublicKey !== 'function') {
      throw new Error('Remote signer tools are unavailable.');
    }

    const initialRemoteSignerPubkey = normalizePubkeyHex(config && config.remoteSignerPubkey || '');
    if (!initialRemoteSignerPubkey && !opts.waitForConnect) {
      throw new Error('Remote signer pubkey is missing or invalid.');
    }

    const relays = uniqueRelayUrls(config && config.relays || []);
    if (!relays.length) relays.push('wss://relay.primal.net');

    let clientSecret = null;
    if (config && config.clientSecret) {
      clientSecret = normalizeSecretKey(config.clientSecret);
    } else if (config && config.clientSecretHex) {
      clientSecret = normalizeSecretKey(config.clientSecretHex);
    } else if (typeof tools.generateSecretKey === 'function') {
      clientSecret = normalizeSecretKey(tools.generateSecretKey());
    } else {
      clientSecret = normalizeSecretKey(crypto.getRandomValues(new Uint8Array(32)));
    }

    const session = {
      pool: new tools.SimplePool(),
      relays,
      remoteSignerPubkey: initialRemoteSignerPubkey,
      connectSecret: String(config && config.connectSecret || '').trim(),
      clientSecret,
      clientPubkey: tools.getPublicKey(clientSecret),
      encryption: config && config.encryption === 'nip04' ? 'nip04' : 'nip44',
      nip44ConversationKey: null,
      responseSub: null,
      pendingRequests: new Map(),
      requestCounter: 0,
      closed: false
    };
    if (!session.connectSecret && opts.waitForConnect) {
      session.connectSecret = generateRemoteConnectSecret();
    }

    try {
      throwIfAborted(signal, 'Remote login cancelled.');
      const connectedByScan = !session.remoteSignerPubkey && !!opts.waitForConnect;
      if (connectedByScan) {
        const connectUri = buildNostrConnectUri(session);
        if (typeof opts.onUri === 'function') opts.onUri(connectUri);
        onStatus('Scan the QR code and approve in your signer app...');
        const connectInfo = await waitForRemoteSignerConnect(session, {
          timeoutMs: Math.max(REMOTE_SIGNER_SCAN_TIMEOUT_MS, Number(opts.scanTimeoutMs || 0)),
          signal
        });
        session.remoteSignerPubkey = normalizePubkeyHex(connectInfo && connectInfo.remoteSignerPubkey || '');
        if (!session.remoteSignerPubkey) {
          throw new Error('Remote signer approval did not include a valid pubkey.');
        }
        if (connectInfo && connectInfo.encryption) {
          session.encryption = connectInfo.encryption === 'nip04' ? 'nip04' : 'nip44';
        }
        session.nip44ConversationKey = null;
      }

      startRemoteSignerResponseSubscription(session);

      const shouldConnect = !opts.skipConnect && !connectedByScan;
      if (shouldConnect) {
        onStatus('Authorizing with remote signer...');
        const connectParams = [session.remoteSignerPubkey];
        if (session.connectSecret) {
          connectParams.push(session.connectSecret, REMOTE_SIGNER_REQUESTED_PERMS);
        } else {
          connectParams.push('', REMOTE_SIGNER_REQUESTED_PERMS);
        }
        const connectResult = await sendRemoteSignerRequest(session, 'connect', connectParams, {
          timeoutMs: REMOTE_SIGNER_CONNECT_TIMEOUT_MS,
          signal,
          fallbackEncrypt: true
        });
        const expectedSecret = session.connectSecret;
        const resultText = String(connectResult || '').trim();
        if (expectedSecret && resultText && resultText !== 'ack' && resultText !== expectedSecret) {
          throw new Error('Remote signer returned an unexpected connect response.');
        }
      }

      onStatus('Fetching your public key...');
      const pubkeyResult = await sendRemoteSignerRequest(session, 'get_public_key', [], {
        timeoutMs: REMOTE_SIGNER_CONNECT_TIMEOUT_MS,
        signal,
        fallbackEncrypt: true
      });
      const userPubkey = normalizePubkeyHex(typeof pubkeyResult === 'string' ? pubkeyResult : '');
      if (!userPubkey) {
        throw new Error('Remote signer returned an invalid public key.');
      }

      teardownRemoteSignerSession('Replacing remote signer session.');
      state.remoteSignerSession = session;
      state.localSecretKey = null;
      localStorage.removeItem(LOCAL_NSEC_STORAGE_KEY);
      if (opts.persist !== false) {
        persistRemoteSignerSession(session, session.connectSecret);
      }
      setAuthenticatedUser(userPubkey, 'remote');
      return userPubkey;
    } catch (err) {
      teardownRemoteSignerSessionObject(session, 'Remote signer connection failed.');
      throw err;
    }
  }

  async function loginWithRemoteSignerToken(connectionToken, persist = true, opts = {}) {
    const parsed = parseBunkerConnectionToken(connectionToken);
    return establishRemoteSignerSession(parsed, { ...opts, persist });
  }

  function preferredRemoteQrRelays() {
    const configured = uniqueRelayUrls(state.relays || []);
    if (configured.includes('wss://relay.primal.net')) return ['wss://relay.primal.net'];
    if (configured.length) return [configured[0]];
    return ['wss://relay.primal.net'];
  }

  async function loginWithRemoteSignerQr(persist = true, opts = {}) {
    const relays = uniqueRelayUrls(opts.relays || preferredRemoteQrRelays());
    return establishRemoteSignerSession(
      {
        relays: relays.length ? relays : ['wss://relay.primal.net'],
        connectSecret: '',
        remoteSignerPubkey: '',
        clientSecretHex: opts.clientSecretHex || ''
      },
      {
        ...opts,
        persist,
        waitForConnect: true
      }
    );
  }

  async function tryRestoreRemoteLogin() {
    const saved = loadPersistedRemoteSignerSession();
    if (!saved) return false;
    try {
      await establishRemoteSignerSession(saved, { persist: false, skipConnect: true });
      if (state.remoteSignerSession) {
        persistRemoteSignerSession(state.remoteSignerSession, state.remoteSignerSession.connectSecret || '');
      }
      return true;
    } catch (_) {
      teardownRemoteSignerSession('Retrying remote restore.');
      try {
        await establishRemoteSignerSession(saved, { persist: false });
        if (state.remoteSignerSession) {
          persistRemoteSignerSession(state.remoteSignerSession, state.remoteSignerSession.connectSecret || '');
        }
        return true;
      } catch (_) {}
      clearPersistedRemoteSignerSession();
      teardownRemoteSignerSession('Remote restore failed.');
      return false;
    }
  }

  function sanitizeMediaUrl(v) {
    const raw = String(v || '').trim();
    if (!raw) return '';
    const unwrapped = raw.replace(/^['"]+|['"]+$/g, '');
    return unwrapped
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim();
  }

  function isLikelyUrl(v) {
    const clean = sanitizeMediaUrl(v);
    return !!clean && /^https?:\/\//i.test(clean);
  }

  function normalizeTwitterLink(value) {
    const raw = (value || '').trim();
    if (!raw) return { url: '', label: '' };
    if (isLikelyUrl(raw)) return { url: raw, label: raw };
    let handle = raw.replace(/^@+/, '');
    handle = handle.replace(/^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i, '');
    handle = handle.split(/[/?#]/)[0] || '';
    if (!handle) return { url: '', label: '' };
    return { url: `https://x.com/${handle}`, label: `@${handle}` };
  }

  function normalizeGithubLink(value) {
    const raw = (value || '').trim();
    if (!raw) return { url: '', label: '' };
    if (isLikelyUrl(raw)) return { url: raw, label: raw };
    let handle = raw.replace(/^@+/, '');
    handle = handle.replace(/^https?:\/\/(www\.)?github\.com\//i, '');
    handle = handle.split(/[/?#]/)[0] || '';
    if (!handle) return { url: '', label: '' };
    return { url: `https://github.com/${handle}`, label: handle };
  }

  function setProfileVerificationStyle(mode) {
    const identityBox = qs('#profileIdentityBox');
    const avatar = qs('#profAv');
    const nip05Main = qs('#profNip05');
    const nip05Check = qs('#profNip05Check');
    const resolved = (mode === true || mode === 'verified')
      ? 'verified'
      : (mode === 'invalid' ? 'invalid' : 'none');
    if (identityBox) identityBox.classList.toggle('nip05-verified', resolved === 'verified');
    if (avatar) avatar.classList.toggle('nip05-verified', resolved === 'verified');
    if (nip05Main) nip05Main.classList.toggle('nip05-invalid', resolved === 'invalid');
    if (nip05Check) nip05Check.classList.toggle('nip05-invalid', resolved === 'invalid');
  }

  function setAvatarEl(el, pictureValue, fallbackText) {
    if (!el) return;
    const raw = sanitizeMediaUrl(pictureValue);
    el.innerHTML = '';

    if (isLikelyUrl(raw)) {
      const img = document.createElement('img');
      img.src = raw;
      img.alt = 'avatar';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.onerror = () => { el.textContent = fallbackText; };
      el.appendChild(img);
      return;
    }

    if (raw) {
      el.textContent = raw;
      return;
    }

    el.textContent = fallbackText;
  }

  function normalizeThemeSetting(value) {
    const v = String(value || '').trim().toLowerCase();
    return (v === 'light' || v === 'midnight' || v === 'dark') ? v : 'dark';
  }

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(String(value == null ? '' : value), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function sanitizeCacheSettings(input) {
    const src = input || {};
    return {
      cacheQueryTtlSec: clampInt(src.cacheQueryTtlSec, 1, 600, DEFAULT_SETTINGS.cacheQueryTtlSec),
      cacheWarmSec: clampInt(src.cacheWarmSec, 5, 7200, DEFAULT_SETTINGS.cacheWarmSec),
      cacheLiveFeedTtlSec: clampInt(src.cacheLiveFeedTtlSec, 10, 1800, DEFAULT_SETTINGS.cacheLiveFeedTtlSec)
    };
  }

  function getCacheQueryTtlMs() {
    const safe = sanitizeCacheSettings(state.settings);
    return safe.cacheQueryTtlSec * 1000;
  }

  function getCacheWarmMs() {
    const safe = sanitizeCacheSettings(state.settings);
    const ttlMs = safe.cacheQueryTtlSec * 1000;
    return Math.max(ttlMs, safe.cacheWarmSec * 1000);
  }

  function getLiveFeedCacheTtlMs() {
    const safe = sanitizeCacheSettings(state.settings);
    return safe.cacheLiveFeedTtlSec * 1000;
  }

  function loadSettingsFromStorage() {
    let saved = {};
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : {};
    } catch (_) {
      saved = {};
    }

    const merged = { ...DEFAULT_SETTINGS, ...(saved || {}) };
    if (!Array.isArray(merged.relays) || merged.relays.length === 0) {
      merged.relays = [...DEFAULT_RELAYS];
    }
    merged.relays = [...new Set(merged.relays.map((r) => (r || '').trim()).filter((r) => /^wss:\/\//i.test(r)))];
    if (!merged.relays.length) merged.relays = [...DEFAULT_RELAYS];
    if (!Array.isArray(merged.blossomUploadEndpoints) || !merged.blossomUploadEndpoints.length) {
      merged.blossomUploadEndpoints = [...BLOSSOM_UPLOAD_ENDPOINTS];
    }
    merged.blossomUploadEndpoints = [...new Set(
      merged.blossomUploadEndpoints
        .map((value) => String(value || '').trim())
        .filter((value) => isLikelyUrl(value))
    )];
    if (!merged.blossomUploadEndpoints.length) merged.blossomUploadEndpoints = [...BLOSSOM_UPLOAD_ENDPOINTS];
    merged.theme = normalizeThemeSetting(merged.theme);
    merged.notificationsMentions = merged.notificationsMentions !== false;
    merged.notificationsReplies = merged.notificationsReplies !== false;
    merged.notificationsLikes = merged.notificationsLikes !== false;
    merged.notificationsReposts = merged.notificationsReposts !== false;
    merged.notificationsZaps = merged.notificationsZaps !== false;
    merged.notificationsFollows = merged.notificationsFollows !== false;
    Object.assign(merged, sanitizeCacheSettings(merged));

    state.settings = merged;
    state.relays = [...merged.relays];
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.settings));
    } catch (_) {
      // no-op
    }
  }

  function loadNotificationsLastReadFromStorage() {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_LAST_READ_STORAGE_KEY);
      const parsed = Number(raw || 0);
      state.notificationsLastReadAt = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
    } catch (_) {
      state.notificationsLastReadAt = 0;
    }
  }

  function persistNotificationsLastRead() {
    try {
      localStorage.setItem(NOTIFICATIONS_LAST_READ_STORAGE_KEY, String(Math.floor(Number(state.notificationsLastReadAt || 0))));
    } catch (_) {
      // no-op
    }
  }

  function cloneCachedStream(stream) {
    if (!stream || typeof stream !== 'object') return null;
    return {
      id: String(stream.id || ''),
      pubkey: normalizePubkeyHex(stream.pubkey || ''),
      hostPubkey: normalizePubkeyHex(stream.hostPubkey || stream.pubkey || ''),
      platformPubkey: normalizePubkeyHex(stream.platformPubkey || ''),
      created_at: Number(stream.created_at || 0) || 0,
      kind: Number(stream.kind || KIND_LIVE_EVENT) || KIND_LIVE_EVENT,
      d: String(stream.d || ''),
      address: String(stream.address || ''),
      status: String(stream.status || 'live'),
      title: String(stream.title || 'Untitled stream'),
      summary: String(stream.summary || ''),
      image: sanitizeMediaUrl(stream.image || ''),
      streaming: sanitizeMediaUrl(stream.streaming || ''),
      starts: Number(stream.starts || 0) || null,
      participants: Number(stream.participants || 0) || 0
    };
  }

  function loadLiveStreamsCache() {
    try {
      const raw = localStorage.getItem(LIVE_STREAMS_CACHE_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const savedAt = Number(parsed && parsed.savedAt ? parsed.savedAt : 0);
      const age = Date.now() - savedAt;
      if (!savedAt || age > getLiveFeedCacheTtlMs()) return;
      const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
      items.forEach((item) => {
        const stream = cloneCachedStream(item);
        if (!stream || !stream.address || !stream.pubkey) return;
        state.streamsByAddress.set(stream.address, stream);
      });
    } catch (_) {
      // ignore cache read errors
    }
  }

  function persistLiveStreamsCache() {
    try {
      const items = sortedLiveStreams()
        .slice(0, LIVE_STREAMS_CACHE_MAX_ITEMS)
        .map((stream) => cloneCachedStream(stream))
        .filter(Boolean);
      localStorage.setItem(LIVE_STREAMS_CACHE_STORAGE_KEY, JSON.stringify({
        savedAt: Date.now(),
        items
      }));
    } catch (_) {
      // ignore cache write errors
    }
  }

  function schedulePersistLiveStreamsCache() {
    if (state.liveStreamCachePersistTimer) return;
    state.liveStreamCachePersistTimer = setTimeout(() => {
      state.liveStreamCachePersistTimer = null;
      persistLiveStreamsCache();
    }, 1200);
  }

  function normalizePubkeyHex(pubkey) {
    const normalized = (pubkey || '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(normalized) ? normalized : '';
  }

  function loadFollowedPubkeys() {
    let saved = [];
    try {
      const raw = localStorage.getItem(FOLLOWING_STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : [];
    } catch (_) {
      saved = [];
    }

    const list = Array.isArray(saved) ? saved : [];
    state.followedPubkeys = new Set(
      list
        .map((v) => normalizePubkeyHex(typeof v === 'string' ? v : ''))
        .filter(Boolean)
    );
  }

  function persistFollowedPubkeys() {
    try {
      localStorage.setItem(FOLLOWING_STORAGE_KEY, JSON.stringify(Array.from(state.followedPubkeys)));
    } catch (_) {
      // no-op
    }
  }

  function readHiddenEndedStreamsStore() {
    try {
      const raw = localStorage.getItem(HIDDEN_ENDED_STREAMS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function loadHiddenEndedStreamsForPubkey(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return new Set();
    const store = readHiddenEndedStreamsStore();
    const list = Array.isArray(store[key]) ? store[key] : [];
    return new Set(
      list
        .map((v) => String(v || '').trim())
        .filter((v) => /^[0-9]+:[0-9a-f]{64}:.+/i.test(v))
    );
  }

  function persistHiddenEndedStreamsForCurrentUser() {
    const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    if (!own) return;
    const store = readHiddenEndedStreamsStore();
    const values = Array.from(state.goLiveHiddenEndedAddresses)
      .map((v) => String(v || '').trim())
      .filter((v) => /^[0-9]+:[0-9a-f]{64}:.+/i.test(v))
      .slice(-300);
    if (values.length) store[own] = values;
    else delete store[own];
    try {
      localStorage.setItem(HIDDEN_ENDED_STREAMS_STORAGE_KEY, JSON.stringify(store));
    } catch (_) {
      // no-op
    }
  }

  function isFollowingPubkey(pubkey) {
    const normalized = normalizePubkeyHex(pubkey);
    return !!(normalized && state.followedPubkeys.has(normalized));
  }

  function setFollowingPubkey(pubkey, on) {
    const normalized = normalizePubkeyHex(pubkey);
    if (!normalized) return;
    if (on) state.followedPubkeys.add(normalized);
    else state.followedPubkeys.delete(normalized);
    persistFollowedPubkeys();
    renderFollowingCount();
  }

  function captureContactsMetadata(ev) {
    if (!ev || ev.kind !== KIND_CONTACTS) return false;
    const created = Number(ev.created_at || 0) || 0;
    if (created < (state.contactsLatestCreatedAt || 0)) return false;

    state.contactsLatestCreatedAt = created;
    state.contactsContent = typeof ev.content === 'string' ? ev.content : '';
    state.contactsPTagByPubkey = new Map();
    state.contactsOtherTags = [];

    (ev.tags || []).forEach((tag) => {
      if (!Array.isArray(tag) || !tag.length) return;
      if (tag[0] === 'p' && tag[1]) {
        const pk = normalizePubkeyHex(tag[1]);
        if (!pk) return;
        const cloned = [...tag];
        cloned[1] = pk;
        state.contactsPTagByPubkey.set(pk, cloned);
      } else {
        state.contactsOtherTags.push([...tag]);
      }
    });

    return true;
  }

  function buildContactsTagsFromFollowedSet() {
    const tags = [];
    (state.contactsOtherTags || []).forEach((t) => {
      if (!Array.isArray(t) || !t.length || t[0] === 'p') return;
      tags.push([...t]);
    });

    const followed = Array.from(state.followedPubkeys)
      .map((pk) => normalizePubkeyHex(pk))
      .filter(Boolean)
      .sort();

    followed.forEach((pk) => {
      const existing = state.contactsPTagByPubkey && state.contactsPTagByPubkey.get(pk);
      if (Array.isArray(existing) && existing.length >= 2 && existing[0] === 'p') {
        const cloned = [...existing];
        cloned[1] = pk;
        tags.push(cloned);
      } else {
        tags.push(['p', pk]);
      }
    });

    return tags;
  }

  async function publishFollowedPubkeysToNostr() {
    if (!state.user) throw new Error('Please login first to publish your follow list.');
    const tags = buildContactsTagsFromFollowedSet();
    const content = typeof state.contactsContent === 'string' ? state.contactsContent : '';
    const ev = await signAndPublish(KIND_CONTACTS, content, tags);
    captureContactsMetadata(ev);
    return ev;
  }

  function applySettingsToDocument() {
    document.body.classList.toggle('hide-nip05', !state.settings.showNip05Badges);
    document.body.classList.toggle('hide-zap-notices', !state.settings.showZapNotifications);
    document.body.classList.toggle('compact-chat', !!state.settings.compactChat);
    document.body.classList.toggle('no-chat-anim', !state.settings.animateZaps);

    const theme = normalizeThemeSetting(state.settings.theme);
    state.settings.theme = theme;
    if (window.setSifakaTheme) window.setSifakaTheme(theme, false);
    else if (window.SifakaTheme && typeof window.SifakaTheme.apply === 'function') window.SifakaTheme.apply(theme, false);
  }

  function renderSettingsRelayList() {
    const wrap = qs('#settingsRelayList2') || qs('#settingsRelayList');
    if (!wrap) return;
    wrap.innerHTML = '';

    state.settings.relays.forEach((relay) => {
      const tag = document.createElement('div');
      tag.className = 'relay-tag';
      tag.innerHTML = `${relay} <button class="rem" title="Remove">Ã—</button>`;
      const btn = qs('.rem', tag);
      if (btn) btn.addEventListener('click', () => removeRelayFromSettings(relay));
      wrap.appendChild(tag);
    });
  }

  function removeRelayFromSettings(relay) {
    state.settings.relays = state.settings.relays.filter((r) => r !== relay);
    if (!state.settings.relays.length) state.settings.relays = [...DEFAULT_RELAYS];
    renderSettingsRelayList();
  }

  function addRelayToSettings(relay) {
    const clean = (relay || '').trim();
    if (!/^wss:\/\//i.test(clean)) {
      throw new Error('Relay URL must start with wss://');
    }
    if (!state.settings.relays.includes(clean)) state.settings.relays.push(clean);
    renderSettingsRelayList();
  }

  function setToggleById(id, isOn) {
    const el = qs(`#${id}`);
    if (!el) return;
    el.classList.toggle('on', !!isOn);
  }

  function isToggleOn(id) {
    const el = qs(`#${id}`);
    return !!(el && el.classList.contains('on'));
  }

  function populateSettingsModal() {
    renderSettingsRelayList();
    const lud16 = qs('#settingsLud16Input');
    const web = qs('#settingsWebsiteInput');
    const banner = qs('#settingsBannerInput');
    const displayName = qs('#settingsDisplayName');
    const username = qs('#settingsUsername');
    const about = qs('#settingsAbout');
    const avatarUrl = qs('#settingsAvatarUrl');
    const nip05 = qs('#settingsNip05Input');

    const up = state.user ? profileFor(state.user.pubkey) : null;
    if (lud16) lud16.value = (up && up.lud16) || state.settings.lud16 || '';
    if (web) web.value = (up && up.website) || state.settings.website || '';
    if (banner) banner.value = (up && up.banner) || state.settings.banner || '';
    if (displayName) displayName.value = (up && (up.display_name || up.name)) || '';
    if (username) username.value = (up && up.name) || '';
    if (about) about.value = (up && up.about) || '';
    if (avatarUrl) avatarUrl.value = (up && up.picture) || '';
    if (nip05) nip05.value = (up && up.nip05) || '';

    if (up && up.picture) previewSettingsAvatar(up.picture);

    setToggleById('setAutoPublishToggle', state.settings.autoPublish);
    setToggleById('setMiniPlayerToggle', state.settings.miniPlayer);
    setToggleById('setZapNoticeToggle', state.settings.showZapNotifications);
    setToggleById('setNip05Toggle', state.settings.showNip05Badges);
    setToggleById('setCompactToggle', state.settings.compactChat);
    setToggleById('setAnimateToggle', state.settings.animateZaps);
    setToggleById('setNotifMentionsToggle', state.settings.notificationsMentions);
    setToggleById('setNotifRepliesToggle', state.settings.notificationsReplies);
    setToggleById('setNotifLikesToggle', state.settings.notificationsLikes);
    setToggleById('setNotifRepostsToggle', state.settings.notificationsReposts);
    setToggleById('setNotifZapsToggle', state.settings.notificationsZaps);
    setToggleById('setNotifFollowsToggle', state.settings.notificationsFollows);

    const themeSelect = qs('#settingsThemeSelect');
    if (themeSelect) themeSelect.value = normalizeThemeSetting(state.settings.theme);
    const cacheQueryInput = qs('#settingsCacheQueryTtlSec');
    const cacheWarmInput = qs('#settingsCacheWarmSec');
    const cacheLiveInput = qs('#settingsCacheLiveFeedTtlSec');
    const safeCache = sanitizeCacheSettings(state.settings);
    if (cacheQueryInput) cacheQueryInput.value = String(safeCache.cacheQueryTtlSec);
    if (cacheWarmInput) cacheWarmInput.value = String(safeCache.cacheWarmSec);
    if (cacheLiveInput) cacheLiveInput.value = String(safeCache.cacheLiveFeedTtlSec);
  }

  function collectSettingsFromModal() {
    const lud16 = qs('#settingsLud16Input');
    const web = qs('#settingsWebsiteInput');
    const banner = qs('#settingsBannerInput');
    const theme = qs('#settingsThemeSelect');
    const cacheQueryInput = qs('#settingsCacheQueryTtlSec');
    const cacheWarmInput = qs('#settingsCacheWarmSec');
    const cacheLiveInput = qs('#settingsCacheLiveFeedTtlSec');
    const safeCache = sanitizeCacheSettings({
      cacheQueryTtlSec: cacheQueryInput && cacheQueryInput.value,
      cacheWarmSec: cacheWarmInput && cacheWarmInput.value,
      cacheLiveFeedTtlSec: cacheLiveInput && cacheLiveInput.value
    });

    return {
      ...state.settings,
      relays: [...state.settings.relays],
      autoPublish: isToggleOn('setAutoPublishToggle'),
      miniPlayer: isToggleOn('setMiniPlayerToggle'),
      showZapNotifications: isToggleOn('setZapNoticeToggle'),
      showNip05Badges: isToggleOn('setNip05Toggle'),
      compactChat: isToggleOn('setCompactToggle'),
      animateZaps: isToggleOn('setAnimateToggle'),
      notificationsMentions: isToggleOn('setNotifMentionsToggle'),
      notificationsReplies: isToggleOn('setNotifRepliesToggle'),
      notificationsLikes: isToggleOn('setNotifLikesToggle'),
      notificationsReposts: isToggleOn('setNotifRepostsToggle'),
      notificationsZaps: isToggleOn('setNotifZapsToggle'),
      notificationsFollows: isToggleOn('setNotifFollowsToggle'),
      theme: normalizeThemeSetting((theme && theme.value) || state.settings.theme),
      cacheQueryTtlSec: safeCache.cacheQueryTtlSec,
      cacheWarmSec: safeCache.cacheWarmSec,
      cacheLiveFeedTtlSec: safeCache.cacheLiveFeedTtlSec,
      lud16: (lud16 && lud16.value.trim()) || '',
      website: (web && web.value.trim()) || '',
      banner: (banner && banner.value.trim()) || ''
    };
  }

  function rebuildRelayPool() {
    state.oneShotQueryInflightByKey = new Map();
    state.relayPingMsByUrl = new Map();
    stopLiveSubscription();
    stopNostrFeedSubscription();
    if (state.pool) {
      try {
        state.pool.destroy();
      } catch (_) {
        // ignore
      }
    }

    state.pool = new RelayPool(state.relays, () => updateRelayBar());
    updateRelayBar();
    if (isHomeViewActive()) ensureHomeLiveSubscription();

    if (state.selectedStreamAddress) {
      const current = state.streamsByAddress.get(state.selectedStreamAddress);
      if (current) {
        subscribeChat(current);
        if (isVideoPageVisible()) {
          const statsTargetPubkey = normalizePubkeyHex(current.hostPubkey || '') || normalizePubkeyHex(current.pubkey || '');
          if (statsTargetPubkey) subscribeProfileStats(statsTargetPubkey);
        }
      }
    }

    if (state.selectedProfilePubkey) {
      subscribeProfileFeed(state.selectedProfilePubkey);
      if (!isVideoPageVisible()) subscribeProfileStats(state.selectedProfilePubkey);
    }

    if (isFeedPageVisible()) {
      subscribeNostrFeed();
    }
    if (state.user) {
      loadNotifications({
        force: true,
        silent: !isNotificationsPageVisible(),
        minIntervalMs: 0
      }).catch(() => {});
    }

    // Relay pool was rebuilt; force DM subscription to be recreated on the new pool.
    state.dmSubId = null;
    if (isMessagesPageVisible() && state.user) {
      ensureMessagesSession({ subscribe: true });
      renderMessagesPage({ subscribe: true });
    }

    if (state.relayPulseTimer) clearInterval(state.relayPulseTimer);
    state.relayPulseTimer = setInterval(updateRelayBar, 5000);
  }

  function applySettings(newSettings, opts = { reconnect: false }) {
    const safeCache = sanitizeCacheSettings(newSettings);
    state.settings = {
      ...newSettings,
      relays: [...newSettings.relays],
      theme: normalizeThemeSetting(newSettings.theme),
      cacheQueryTtlSec: safeCache.cacheQueryTtlSec,
      cacheWarmSec: safeCache.cacheWarmSec,
      cacheLiveFeedTtlSec: safeCache.cacheLiveFeedTtlSec
    };
    state.relays = [...state.settings.relays];
    persistSettings();
    applySettingsToDocument();
    renderNotificationsBell();
    if (isNotificationsPageVisible()) renderNotifications();

    if (opts.reconnect) {
      rebuildRelayPool();
    }
  }

  function formatCount(n) {
    const v = Number(n || 0);
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return `${v}`;
  }

  function formatTimeAgo(ts) {
    const now = Math.floor(Date.now() / 1000);
    const d = Math.max(1, now - Number(ts || now));
    if (d < 60) return `${d}s`;
    if (d < 3600) return `${Math.floor(d / 60)}m`;
    if (d < 86400) return `${Math.floor(d / 3600)}h`;
    if (d < 604800) return `${Math.floor(d / 86400)}d`;
    return `${Math.floor(d / 604800)}w`;
  }


  function formatNostrAge(ts) {
    const start = Number(ts || 0);
    if (!start) return '-';
    const now = Math.floor(Date.now() / 1000);
    const seconds = Math.max(0, now - start);
    const days = Math.floor(seconds / 86400);
    if (days < 1) return 'less than a day';
    if (days < 30) return `${days} day${days === 1 ? '' : 's'}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
    const years = Math.floor(months / 12);
    const remMonths = months % 12;
    if (!remMonths) return `${years} year${years === 1 ? '' : 's'}`;
    return `${years}y ${remMonths}mo`;
  }

  function estimateProfileFirstSeen(pubkey, profile) {
    let earliest = Number((profile && profile.created_at) || 0) || 0;

    const noteMap = state.profileNotesByPubkey.get(pubkey) || new Map();
    noteMap.forEach((ev) => {
      if (!ev || ev.pubkey !== pubkey) return;
      const ts = Number(ev.created_at || 0) || 0;
      if (ts && (!earliest || ts < earliest)) earliest = ts;
    });

    Array.from(state.streamsByAddress.values())
      .filter((s) => s.pubkey === pubkey)
      .forEach((s) => {
        const ts = Number(s.created_at || 0) || 0;
        if (ts && (!earliest || ts < earliest)) earliest = ts;
      });

    return earliest;
  }
  function parseNpubMaybe(input) {
    const val = (input || '').trim();
    if (!val || !val.startsWith('npub1')) return '';
    if (!window.NostrTools || !window.NostrTools.nip19) return '';
    try {
      const dec = window.NostrTools.nip19.decode(val);
      if (dec && dec.type === 'npub') return dec.data;
    } catch (_) {
      return '';
    }
    return '';
  }

  function formatNpubForDisplay(pubkeyOrNpub) {
    const raw = (pubkeyOrNpub || '').trim();
    if (!raw) return '';
    if (raw.startsWith('npub1')) return raw;
    if (!/^[0-9a-f]{64}$/i.test(raw)) return raw;
    if (!window.NostrTools || !window.NostrTools.nip19 || typeof window.NostrTools.nip19.npubEncode !== 'function') {
      return shortHex(raw);
    }
    try {
      return window.NostrTools.nip19.npubEncode(raw);
    } catch (_) {
      return shortHex(raw);
    }
  }

  function parseTags(tags) {
    const map = new Map();
    tags.forEach((t) => {
      if (Array.isArray(t) && t.length > 1) {
        const key = t[0];
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t.slice(1));
      }
    });
    return map;
  }

  function firstTag(map, key) {
    const vals = map.get(key);
    if (!vals || vals.length === 0) return '';
    return vals[0][0] || '';
  }

  function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    if (value && typeof value === 'object') {
      const keys = Object.keys(value).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
  }

  function normalizeFilterForCache(filter) {
    if (!filter || typeof filter !== 'object') return {};
    const out = {};
    Object.keys(filter).sort().forEach((key) => {
      const val = filter[key];
      if (Array.isArray(val)) out[key] = [...val];
      else out[key] = val;
    });
    return out;
  }

  function cacheKeyForFilters(filters, scope = 'query') {
    const normalizedFilters = (Array.isArray(filters) ? filters : [filters]).map((f) => normalizeFilterForCache(f));
    return `${scope}:${stableStringify(normalizedFilters)}`;
  }

  function pruneOneShotQueryCache(maxEntries = ONE_SHOT_CACHE_MAX_ENTRIES) {
    const entries = Array.from(state.oneShotQueryCacheByKey.entries());
    if (entries.length <= maxEntries) return;
    entries
      .sort((a, b) => Number(a[1] && a[1].savedAt || 0) - Number(b[1] && b[1].savedAt || 0))
      .slice(0, entries.length - maxEntries)
      .forEach(([key]) => state.oneShotQueryCacheByKey.delete(key));
  }

  function runOneShotRelayQuery(filters, opts = {}) {
    return new Promise((resolve) => {
      if (!state.pool) { resolve([]); return; }
      const timeoutMs = Math.max(200, Number(opts.timeoutMs || 1800));
      const maxEvents = Math.max(10, Number(opts.maxEvents || 1200));
      const eventsById = new Map();
      const eoseByRelay = new Set();
      const expectedEose = Math.max(1, Number((state.pool.urls && state.pool.urls.length) || 1));
      let done = false;
      let subId = null;

      const finish = () => {
        if (done) return;
        done = true;
        if (subId) {
          try { state.pool.unsubscribe(subId); } catch (_) {}
        }
        clearTimeout(timer);
        resolve(Array.from(eventsById.values()));
      };

      const timer = setTimeout(finish, timeoutMs);
      subId = state.pool.subscribe(
        filters,
        {
          event: (ev) => {
            if (!ev || !ev.id || eventsById.has(ev.id)) return;
            eventsById.set(ev.id, ev);
            if (eventsById.size >= maxEvents) finish();
          },
          eose: (relayUrl) => {
            const key = relayUrl || `relay_${eoseByRelay.size + 1}`;
            eoseByRelay.add(String(key));
            if (eoseByRelay.size >= expectedEose) finish();
          }
        }
      );
    });
  }

  function refreshOneShotQueryCache(key, filters, opts = {}) {
    const existing = state.oneShotQueryInflightByKey.get(key);
    if (existing) return existing;
    const promise = runOneShotRelayQuery(filters, opts)
      .then((events) => {
        state.oneShotQueryCacheByKey.set(key, {
          savedAt: Date.now(),
          events: Array.isArray(events) ? events.slice() : []
        });
        pruneOneShotQueryCache();
        return Array.isArray(events) ? events : [];
      })
      .finally(() => {
        if (state.oneShotQueryInflightByKey.get(key) === promise) {
          state.oneShotQueryInflightByKey.delete(key);
        }
      });
    state.oneShotQueryInflightByKey.set(key, promise);
    return promise;
  }

  async function fetchEventsCached(filters, opts = {}) {
    const scope = String(opts.scope || 'query');
    const cacheKey = String(opts.cacheKey || cacheKeyForFilters(filters, scope));
    const ttlMs = Math.max(0, Number(opts.ttlMs || getCacheQueryTtlMs() || ONE_SHOT_CACHE_DEFAULT_TTL_MS));
    const warmMs = Math.max(ttlMs, Number(opts.warmMs || getCacheWarmMs() || ONE_SHOT_CACHE_DEFAULT_WARM_MS));
    const allowStale = opts.allowStale !== false;
    const force = !!opts.force;

    const cached = state.oneShotQueryCacheByKey.get(cacheKey);
    const age = cached ? (Date.now() - Number(cached.savedAt || 0)) : Number.POSITIVE_INFINITY;
    const fresh = !!(cached && age <= ttlMs);
    const warm = !!(cached && age <= warmMs);

    if (!force && fresh) return (cached.events || []).slice();

    if (!force && allowStale && warm) {
      refreshOneShotQueryCache(cacheKey, filters, opts).catch(() => {});
      return (cached.events || []).slice();
    }

    try {
      return await refreshOneShotQueryCache(cacheKey, filters, opts);
    } catch (_) {
      return cached ? (cached.events || []).slice() : [];
    }
  }

  function utf8ToBase64(input) {
    const bytes = new TextEncoder().encode(String(input || ''));
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }

  async function sha256HexFromArrayBuffer(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return bytesToHex(new Uint8Array(digest));
  }

  function extensionFromFilename(filename = '') {
    const raw = String(filename || '').trim().toLowerCase();
    if (!raw.includes('.')) return '';
    return raw.split('.').pop() || '';
  }

  function isSupportedUploadFile(file) {
    if (!file) return { ok: false, reason: 'No file selected.' };

    const size = Number(file.size || 0);
    if (size <= 0) return { ok: false, reason: 'Selected file is empty.' };
    if (size > BLOSSOM_MAX_UPLOAD_BYTES) {
      const maxMb = Math.floor(BLOSSOM_MAX_UPLOAD_BYTES / (1024 * 1024));
      return { ok: false, reason: `File is too large. Maximum upload size is ${maxMb}MB.` };
    }

    const mime = String(file.type || '').toLowerCase();
    const byMime = !!SUPPORTED_UPLOAD_MIME_PREFIXES.find((prefix) => mime.startsWith(prefix));
    const byExt = SUPPORTED_UPLOAD_EXTENSIONS.has(extensionFromFilename(file.name || ''));

    if (!byMime && !byExt) {
      return { ok: false, reason: 'Unsupported file type. Please upload common image, video, or audio files.' };
    }

    return { ok: true };
  }

  function parseJsonSafe(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
  }

  function headerValue(rawHeaders, headerName) {
    const lower = String(headerName || '').trim().toLowerCase();
    if (!lower) return '';
    const lines = String(rawHeaders || '').split(/\r?\n/);
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      if (key !== lower) continue;
      return line.slice(idx + 1).trim();
    }
    return '';
  }

  function extractBlossomUploadedUrl(data, rawText = '', rawHeaders = '', fallbackUrl = '') {
    if (data && typeof data === 'object') {
      const direct = [
        data.url,
        data.download_url,
        data.media_url,
        data.file && data.file.url,
        data.file && data.file.download_url
      ].find((candidate) => isLikelyUrl(candidate));
      if (direct) return String(direct).trim();

      if (Array.isArray(data.files) && data.files.length) {
        const fromFiles = data.files
          .map((file) => (file && (file.url || file.download_url || file.source_url || '')) || '')
          .find((candidate) => isLikelyUrl(candidate));
        if (fromFiles) return String(fromFiles).trim();
      }

      const nip94 = data.nip94_event;
      if (nip94 && Array.isArray(nip94.tags)) {
        const urlTag = nip94.tags.find((tag) => Array.isArray(tag) && String(tag[0] || '').toLowerCase() === 'url' && isLikelyUrl(tag[1]));
        if (urlTag && urlTag[1]) return String(urlTag[1]).trim();
      }
    }

    const text = String(rawText || '').trim();
    if (isLikelyUrl(text)) return text;

    const location = headerValue(rawHeaders, 'location');
    if (isLikelyUrl(location)) return String(location).trim();

    const origin = (() => {
      try { return fallbackUrl ? new URL(fallbackUrl).origin : ''; } catch (_) { return ''; }
    })();

    if (data && typeof data === 'object') {
      const hashCandidate = String(data.sha256 || data.sha || data.hash || '').trim();
      if (/^[0-9a-f]{64}$/i.test(hashCandidate) && origin) {
        return `${origin}/${hashCandidate.toLowerCase()}`;
      }
    }

    return '';
  }

  function setComposeUploadStatus(message, mode = 'info') {
    const statusEl = qs('#composeUploadStatus');
    if (!statusEl) return;
    statusEl.textContent = String(message || '').trim();
    statusEl.dataset.mode = mode;
    const palette = {
      info: 'var(--text2)',
      success: 'var(--green)',
      error: 'var(--live)'
    };
    statusEl.style.color = palette[mode] || palette.info;
  }

  function appendTextToTextareaWithLimit(textarea, textToAppend, opts = {}) {
    if (!textarea) return false;
    const val = String(textToAppend || '').trim();
    if (!val) return false;
    const current = String(textarea.value || '');
    const joiner = current && !current.endsWith('\n') ? '\n' : '';
    const next = `${current}${joiner}${val}`;
    const maxLength = Number(opts.maxLength || 4096);
    if (next.length > maxLength) {
      alert(opts.limitMessage || `That upload URL would exceed the ${maxLength} character limit.`);
      return false;
    }
    textarea.value = next;
    if (typeof opts.onApplied === 'function') {
      try { opts.onApplied(next, textarea); } catch (_) {}
    }
    try { textarea.focus(); } catch (_) {}
    return true;
  }

  function appendTextToProfileCompose(textToAppend) {
    const textarea = qs('#profileComposeText');
    const applied = appendTextToTextareaWithLimit(textarea, textToAppend, {
      maxLength: 4096,
      limitMessage: 'That upload URL would exceed the 4096 character note limit.',
      onApplied: () => {
        if (typeof window.profileComposeInput === 'function') window.profileComposeInput(textarea);
      }
    });
    return applied;
  }

  function appendTextToDmCompose(textToAppend) {
    const textarea = qs('#dmComposeInput');
    const applied = appendTextToTextareaWithLimit(textarea, textToAppend, {
      maxLength: 4096,
      limitMessage: 'That upload URL would exceed the 4096 character DM limit.',
      onApplied: (next) => {
        const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
        if (peer) state.dmDraftByPeer.set(peer, next);
      }
    });
    return applied;
  }

  function appendTextToChatCompose(textToAppend) {
    const textarea = qs('#chatInputText') || qs('.chat-inp');
    const applied = appendTextToTextareaWithLimit(textarea, textToAppend, {
      maxLength: 4096,
      limitMessage: 'That upload URL would exceed the chat message limit.'
    });
    return applied;
  }

  function parseTextareaComposeTarget(target) {
    const raw = String(target || '').trim();
    if (!raw) return { id: '' };
    if (!/^textarea:/i.test(raw)) return { id: '' };
    const idx = raw.indexOf(':');
    const id = idx >= 0 ? raw.slice(idx + 1).trim() : '';
    return { id };
  }

  function appendTextToNamedTextarea(target, textToAppend) {
    const parsed = parseTextareaComposeTarget(target);
    if (!parsed.id) return false;
    const textarea = document.getElementById(parsed.id);
    if (!textarea) return false;
    const maxLength = Number(textarea.maxLength && textarea.maxLength > 0 ? textarea.maxLength : 4096);
    return appendTextToTextareaWithLimit(textarea, textToAppend, {
      maxLength,
      limitMessage: `That upload URL would exceed the ${maxLength} character limit.`
    });
  }

  function composeTargetLabel(target = state.composeUploadTarget) {
    const raw = String(target || '').trim();
    if (parseTextareaComposeTarget(raw).id) return 'comment';
    const clean = raw.toLowerCase();
    if (clean === 'dm') return 'message';
    if (clean === 'chat') return 'chat';
    return 'note';
  }

  function appendTextToComposeTarget(target, textToAppend) {
    if (appendTextToNamedTextarea(target, textToAppend)) return true;
    const clean = String(target || '').trim().toLowerCase();
    if (clean === 'dm') return appendTextToDmCompose(textToAppend);
    if (clean === 'chat') return appendTextToChatCompose(textToAppend);
    return appendTextToProfileCompose(textToAppend);
  }

  function appendTextToActiveComposeTarget(textToAppend) {
    return appendTextToComposeTarget(state.composeUploadTarget, textToAppend);
  }

  function getGifProvider() {
    const provider = (typeof window !== 'undefined') ? window.SifakaGifProvider : null;
    if (!provider || typeof provider.search !== 'function' || typeof provider.trending !== 'function') return null;
    return provider;
  }

  function setGifPickerStatus(message, mode = 'info') {
    const statusEl = qs('#gifPickerStatus');
    if (!statusEl) return;
    statusEl.textContent = String(message || '').trim();
    statusEl.dataset.mode = mode;
    const palette = {
      info: 'var(--text2)',
      success: 'var(--green)',
      error: 'var(--live)'
    };
    statusEl.style.color = palette[mode] || palette.info;
  }

  function setGifPickerLoading(isLoading) {
    state.gifPickerPending = !!isLoading;
    const searchInput = qs('#gifPickerSearchInput');
    const searchBtn = qs('#gifPickerSearchBtn');
    const loadMoreBtn = qs('#gifPickerLoadMoreBtn');
    if (searchInput) searchInput.disabled = !!isLoading;
    if (searchBtn) searchBtn.disabled = !!isLoading;
    if (loadMoreBtn) loadMoreBtn.disabled = !!isLoading;
  }

  function renderGifPickerResults(items = []) {
    const grid = qs('#gifPickerResults');
    if (!grid) return;
    grid.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      grid.innerHTML = '<div class="gif-picker-empty">No GIFs found. Try another search.</div>';
      return;
    }

    items.forEach((item) => {
      const url = sanitizeMediaUrl(item && item.url);
      const previewUrl = sanitizeMediaUrl((item && item.previewUrl) || url);
      if (!isLikelyUrl(url) || !isLikelyUrl(previewUrl)) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gif-picker-item';
      btn.title = String(item && item.title || 'GIF');
      btn.dataset.gifUrl = url;

      const img = document.createElement('img');
      img.src = previewUrl;
      img.alt = String(item && item.title || 'GIF');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      btn.appendChild(img);

      btn.addEventListener('click', () => {
        if (typeof window.selectGifFromPicker === 'function') {
          window.selectGifFromPicker(url);
        }
      });
      grid.appendChild(btn);
    });

    if (!grid.children.length) {
      grid.innerHTML = '<div class="gif-picker-empty">No compatible GIF URLs were returned by the provider.</div>';
    }
  }

  function updateGifPickerLoadMoreUi() {
    const loadMoreBtn = qs('#gifPickerLoadMoreBtn');
    if (!loadMoreBtn) return;
    loadMoreBtn.style.display = state.gifPickerCursor ? 'inline-flex' : 'none';
  }

  function clearGifPickerSearchTimer() {
    if (!state.gifPickerSearchTimer) return;
    clearTimeout(state.gifPickerSearchTimer);
    state.gifPickerSearchTimer = null;
  }

  async function fetchGifPickerResults(opts = {}) {
    const provider = getGifProvider();
    if (!provider) {
      setGifPickerStatus('GIF provider is not loaded. Check scripts/gif-provider.js.', 'error');
      renderGifPickerResults([]);
      updateGifPickerLoadMoreUi();
      return;
    }
    if (state.gifPickerPending) return;

    const append = !!opts.append;
    const query = String(opts.query != null ? opts.query : state.gifPickerQuery || '').trim();
    const requestId = state.gifPickerRequestId + 1;
    state.gifPickerRequestId = requestId;

    setGifPickerLoading(true);
    setGifPickerStatus(query ? `Searching GIFs for "${query}"...` : 'Loading trending GIFs...', 'info');
    try {
      const cursor = append ? state.gifPickerCursor : '';
      const response = query
        ? await provider.search({ query, limit: GIF_PICKER_LIMIT, cursor })
        : await provider.trending({ limit: GIF_PICKER_LIMIT, cursor });

      if (requestId !== state.gifPickerRequestId) return;

      const incoming = Array.isArray(response && response.items) ? response.items : [];
      state.gifPickerQuery = query;
      state.gifPickerCursor = String((response && response.cursor) || '').trim();
      state.gifPickerResults = append
        ? [...state.gifPickerResults, ...incoming]
        : incoming.slice();

      renderGifPickerResults(state.gifPickerResults);
      updateGifPickerLoadMoreUi();
      setGifPickerStatus(
        state.gifPickerResults.length
          ? `${state.gifPickerResults.length} GIF${state.gifPickerResults.length === 1 ? '' : 's'} loaded`
          : 'No GIFs found for that search.',
        state.gifPickerResults.length ? 'success' : 'info'
      );
    } catch (err) {
      if (requestId !== state.gifPickerRequestId) return;
      const message = (err && err.message) ? err.message : 'Failed to load GIFs.';
      state.gifPickerCursor = '';
      if (!append) state.gifPickerResults = [];
      renderGifPickerResults(state.gifPickerResults);
      updateGifPickerLoadMoreUi();
      setGifPickerStatus(message, 'error');
    } finally {
      if (requestId === state.gifPickerRequestId) {
        setGifPickerLoading(false);
      }
    }
  }

  function buildBlossomUploadTargets() {
    const out = [];
    const seen = new Set();
    const push = (candidate) => {
      const clean = String(candidate || '').trim();
      if (!isLikelyUrl(clean) || seen.has(clean)) return;
      seen.add(clean);
      out.push(clean);
    };
    BLOSSOM_UPLOAD_ENDPOINTS.forEach(push);
    const fromSettings = Array.isArray(state.settings && state.settings.blossomUploadEndpoints)
      ? state.settings.blossomUploadEndpoints
      : [];
    fromSettings.forEach(push);
    return out;
  }

  async function buildNip98AuthorizationHeader(url, method, payloadHashHex = '') {
    const cleanUrl = String(url || '').trim();
    const cleanMethod = String(method || 'POST').trim().toUpperCase();
    if (!cleanUrl || !isLikelyUrl(cleanUrl)) throw new Error('Invalid upload URL for NIP-98 auth.');
    if (!state.user) throw new Error('Please login to sign NIP-98 auth.');

    const tags = [
      ['u', cleanUrl],
      ['method', cleanMethod]
    ];
    if (/^[0-9a-f]{64}$/i.test(payloadHashHex || '')) {
      tags.push(['payload', String(payloadHashHex).toLowerCase()]);
    }
    const authEvent = await signEvent(27235, '', tags, { createdAt: Math.floor(Date.now() / 1000) });
    return `Nostr ${utf8ToBase64(JSON.stringify(authEvent))}`;
  }

  function uploadWithXhr(opts = {}) {
    const {
      url = '',
      method = 'POST',
      headers = {},
      body = null,
      onProgress = null
    } = opts || {};

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(String(method || 'POST').toUpperCase(), String(url || ''), true);
      Object.entries(headers || {}).forEach(([key, value]) => {
        if (!key || value == null || value === '') return;
        try { xhr.setRequestHeader(key, value); } catch (_) {}
      });

      if (xhr.upload) {
        xhr.upload.onprogress = (event) => {
          if (typeof onProgress !== 'function') return;
          const total = Number(event && event.total || 0);
          const loaded = Number(event && event.loaded || 0);
          const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((loaded / total) * 100))) : 0;
          try { onProgress({ loaded, total, percent }); } catch (_) {}
        };
      }

      xhr.onerror = () => reject(new Error('Upload failed due to a network error.'));
      xhr.onabort = () => reject(new Error('Upload cancelled.'));
      xhr.onload = () => {
        resolve({
          status: Number(xhr.status || 0),
          ok: Number(xhr.status || 0) >= 200 && Number(xhr.status || 0) < 300,
          text: String(xhr.responseText || ''),
          headers: xhr.getAllResponseHeaders() || ''
        });
      };

      try {
        xhr.send(body);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function uploadFileToBlossom(file, opts = {}) {
    const check = isSupportedUploadFile(file);
    if (!check.ok) throw new Error(check.reason || 'Unsupported file.');
    if (!state.user) throw new Error('Please login first.');

    const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;
    if (onProgress) {
      try { onProgress({ loaded: 0, total: Number(file.size || 0), percent: 0 }); } catch (_) {}
    }

    const targets = buildBlossomUploadTargets();
    if (!targets.length) throw new Error('No Blossom upload endpoint is configured.');

    let payloadHashHex = '';
    try {
      const fileBuffer = await file.arrayBuffer();
      payloadHashHex = await sha256HexFromArrayBuffer(fileBuffer);
    } catch (_) {
      payloadHashHex = '';
    }

    let lastError = null;
    const variants = [
      {
        method: 'POST',
        makeBody() {
          const formData = new FormData();
          formData.append('file', file, file.name || 'upload.bin');
          return { body: formData, payloadHash: '' };
        }
      },
      {
        method: 'PUT',
        makeBody() {
          return { body: file, payloadHash: payloadHashHex || '' };
        }
      }
    ];

    for (const targetUrl of targets) {
      for (const variant of variants) {
        try {
          const payload = variant.makeBody();
          const authorization = await buildNip98AuthorizationHeader(targetUrl, variant.method, payload.payloadHash || '');
          const headers = {
            Authorization: authorization
          };
          if (variant.method === 'PUT') {
            headers['Content-Type'] = String(file.type || 'application/octet-stream');
          }

          const response = await uploadWithXhr({
            url: targetUrl,
            method: variant.method,
            headers,
            body: payload.body,
            onProgress
          });

          const parsed = parseJsonSafe(response.text);
          if (!response.ok) {
            const message = (parsed && (parsed.message || parsed.error || parsed.status)) || `Upload failed (${response.status})`;
            throw new Error(String(message));
          }

          const mediaUrl = extractBlossomUploadedUrl(parsed, response.text, response.headers, targetUrl);
          if (!mediaUrl) throw new Error('Upload succeeded but no media URL was returned.');
          if (onProgress) {
            try { onProgress({ loaded: Number(file.size || 0), total: Number(file.size || 0), percent: 100 }); } catch (_) {}
          }
          return {
            url: mediaUrl,
            response: parsed || response.text,
            endpoint: targetUrl,
            method: variant.method
          };
        } catch (err) {
          lastError = err;
        }
      }
    }

    const rawMessage = lastError && lastError.message ? String(lastError.message) : 'Upload failed.';
    if (/network error|failed to fetch|cors/i.test(rawMessage)) {
      throw new Error('Blossom upload endpoint is temporarily unavailable. Please use nostr.build Blossom API.');
    }
    throw new Error(rawMessage);
  }

  function parseLiveEvent(ev) {
    const tagMap = parseTags(ev.tags || []);
    const d = firstTag(tagMap, 'd') || ev.id.slice(0, 12);
    const status = (firstTag(tagMap, 'status') || 'live').toLowerCase();
    const publisherPubkey = normalizePubkeyHex(ev.pubkey) || String(ev.pubkey || '').trim().toLowerCase();
    // NIP-53 address always uses the event publisher's pubkey
    const address = `${KIND_LIVE_EVENT}:${publisherPubkey}:${d}`;
    const starts = Number(firstTag(tagMap, 'starts') || 0) || null;
    const title = firstTag(tagMap, 'title') || (ev.content || '').slice(0, 90) || 'Untitled stream';
    const summary = firstTag(tagMap, 'summary') || ev.content || '';
    const image = sanitizeMediaUrl(firstTag(tagMap, 'image') || firstTag(tagMap, 'thumb') || '');
    const streaming = sanitizeMediaUrl(firstTag(tagMap, 'streaming') || firstTag(tagMap, 'url') || '');
    const participants = Number(firstTag(tagMap, 'current_participants') || 0) || 0;

    // NIP-53: platforms (zap.stream, shosho, etc.) publish under their own key
    // but embed the real streamer as ["p", "<pubkey>", "<relay>", "host"].
    let hostPubkey = publisherPubkey;
    const platformPubkey_ref = { val: null };
    for (const t of (ev.tags || [])) {
      const taggedPubkey = normalizePubkeyHex(t && t[1]);
      if (t[0] === 'p' && taggedPubkey) {
        const role = (t[3] || t[2] || '').toLowerCase().trim();
        if (role === 'host' || role === 'streamer') {
          hostPubkey = taggedPubkey;
          platformPubkey_ref.val = publisherPubkey;
          break;
        }
      }
    }
    const platformPubkey = normalizePubkeyHex(platformPubkey_ref.val || '') || null;

    return {
      id: ev.id,
      pubkey: publisherPubkey, // event publisher (used for NIP-53 address & ownership)
      hostPubkey,            // actual streamer for display (equals pubkey when self-published)
      platformPubkey,        // non-null when a platform published on behalf of the streamer
      created_at: ev.created_at,
      kind: ev.kind,
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

  function extractNip71ImetaUrls(tags = []) {
    const out = [];
    (tags || []).forEach((tag) => {
      if (!Array.isArray(tag) || String(tag[0] || '').toLowerCase() !== 'imeta') return;
      for (let i = 1; i < tag.length; i += 1) {
        const part = String(tag[i] || '').trim();
        if (!part) continue;
        const urlPrefixed = part.match(/(?:^|\s)url\s+(https?:\/\/\S+)/i);
        const direct = part.match(/https?:\/\/\S+/i);
        const candidate = sanitizeMediaUrl((urlPrefixed && urlPrefixed[1]) || (direct && direct[0]) || '');
        if (!candidate) continue;
        out.push(candidate);
      }
    });
    return out;
  }

  function collectNip71MediaUrls(ev, parsedContent = null) {
    const out = [...extractMediaUrlsFromEvent(ev), ...extractNip71ImetaUrls((ev && ev.tags) || [])];
    const content = parsedContent && typeof parsedContent === 'object'
      ? parsedContent
      : parseJsonSafe(ev && ev.content ? ev.content : '');
    if (content && typeof content === 'object') {
      const directCandidates = [
        content.url,
        content.video,
        content.streaming,
        content.src,
        content.media,
        content.image,
        content.thumb,
        content.thumbnail,
        content.poster
      ];
      directCandidates.forEach((value) => {
        const clean = sanitizeMediaUrl(value || '');
        if (clean) out.push(clean);
      });
      if (Array.isArray(content.urls)) {
        content.urls.forEach((value) => {
          const clean = sanitizeMediaUrl(value || '');
          if (clean) out.push(clean);
        });
      }
    }
    return Array.from(new Set(out.filter(Boolean)));
  }

  function parseNip71VideoEvent(ev) {
    const kind = Number(ev && ev.kind || 0);
    if (kind !== KIND_NIP71_VIDEO && kind !== KIND_NIP71_REEL) return null;

    const tags = (ev && ev.tags) || [];
    const tagMap = parseTags(tags);
    const parsedContent = parseJsonSafe(ev && ev.content ? ev.content : '');
    const urls = collectNip71MediaUrls(ev, parsedContent);
    const streaming = urls.find((url) => classifyMediaUrl(url) === 'video' || isDirectFileVideoUrl(url)) || '';
    if (!streaming) return null;

    const mediaImage = urls.find((url) => classifyMediaUrl(url) === 'photo') || '';
    const image = sanitizeMediaUrl(
      firstTag(tagMap, 'image')
      || firstTag(tagMap, 'thumb')
      || (parsedContent && (parsedContent.image || parsedContent.thumb || parsedContent.thumbnail || parsedContent.poster))
      || mediaImage
      || ''
    );
    const fallbackText = String(ev && ev.content || '').trim();
    const title = String(
      firstTag(tagMap, 'title')
      || firstTag(tagMap, 'name')
      || (parsedContent && (parsedContent.title || parsedContent.name))
      || fallbackText.slice(0, 90)
      || (kind === KIND_NIP71_REEL ? 'Nostr Reel' : 'NIP-71 Video')
    ).trim();
    const summary = String(
      firstTag(tagMap, 'summary')
      || (parsedContent && (parsedContent.summary || parsedContent.description || parsedContent.caption))
      || fallbackText
      || ''
    ).trim();
    const publisherPubkey = normalizePubkeyHex(ev && ev.pubkey) || String(ev && ev.pubkey || '').trim().toLowerCase();
    const address = `nip71:${kind}:${String(ev && ev.id || '').trim()}`;
    if (!publisherPubkey || !address || !ev || !ev.id) return null;

    return {
      id: ev.id,
      pubkey: publisherPubkey,
      hostPubkey: publisherPubkey,
      platformPubkey: null,
      created_at: ev.created_at,
      kind,
      nip71Kind: kind,
      d: String(ev.id || '').slice(0, 12),
      address,
      status: 'ended',
      title,
      summary,
      image,
      streaming,
      starts: null,
      participants: 0,
      raw: ev
    };
  }

  function upsertNip71Video(video) {
    const eventId = String(video && video.id || '').trim();
    if (!eventId) return false;
    const existing = state.nip71VideosByEventId.get(eventId);
    const incomingCreatedAt = Number(video && video.created_at || 0);
    const existingCreatedAt = Number(existing && existing.created_at || 0);
    if (!existing || incomingCreatedAt >= existingCreatedAt) {
      state.nip71VideosByEventId.set(eventId, video);
      return true;
    }
    return false;
  }

  function isHomePath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized === '/' || normalized.toLowerCase() === '/index.html';
  }

  function isFaqPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/faq';
  }

  function isMessagesPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/messages';
  }

  function isMyStreamsPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/my-streams';
  }

  function isFeedPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/feed';
  }

  function isNotificationsPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/notifications';
  }

  function isVideosPath(pathname) {
    const raw = (pathname || '/').trim();
    const normalized = raw === '' ? '/' : (raw.replace(/\/+$/, '') || '/');
    return normalized.toLowerCase() === '/videos';
  }


  function restoreRouteFromSpaFallbackQuery() {
    if (!window.location || !window.history || !window.history.replaceState) return;
    let params = null;
    try {
      params = new URLSearchParams(window.location.search || '');
    } catch (_) {
      return;
    }
    const encoded = params.get('__sifaka_route');
    if (!encoded) return;

    let rawTarget = encoded;
    try {
      rawTarget = decodeURIComponent(encoded);
    } catch (_) {
      rawTarget = encoded;
    }

    let target = String(rawTarget || '').trim();
    if (!target) return;
    if (/^https?:\/\//i.test(target)) {
      try {
        const u = new URL(target);
        target = `${u.pathname || '/'}${u.search || ''}${u.hash || ''}`;
      } catch (_) {
        // keep parsed target as-is
      }
    }

    let hash = '';
    const hashIdx = target.indexOf('#');
    if (hashIdx >= 0) {
      hash = target.slice(hashIdx);
      target = target.slice(0, hashIdx);
    }
    let search = '';
    const searchIdx = target.indexOf('?');
    if (searchIdx >= 0) {
      search = target.slice(searchIdx);
      target = target.slice(0, searchIdx);
    }
    if (!target.startsWith('/')) target = `/${target}`;

    const finalTarget = `${target}${search}${hash}`;
    try {
      window.history.replaceState(window.history.state || {}, '', finalTarget);
    } catch (_) {
      // ignore
    }
  }

  function decodePathPart(part) {
    try {
      return decodeURIComponent(part || '');
    } catch (_) {
      return part || '';
    }
  }

  function pathParts(pathname) {
    return (pathname || '').split('/').filter(Boolean).map((p) => decodePathPart(p).trim());
  }

  function extractNaddrFromPath(pathname) {
    const parts = pathParts(pathname);
    if (!parts.length) return '';
    const candidate = parts[0].toLowerCase() === 'a' && parts[1] ? parts[1] : parts[0];
    const naddr = (candidate || '').trim().toLowerCase();
    return /^naddr1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(naddr) ? naddr : '';
  }

  function normalizeNip05Value(value) {
    let raw = (value || '').trim().toLowerCase();
    if (!raw || raw.includes('/')) return '';
    if (raw.startsWith('@')) raw = raw.slice(1);

    let localPart = '';
    let domain = '';
    if (raw.includes('@')) {
      const parts = raw.split('@');
      if (parts.length !== 2) return '';
      localPart = (parts[0] || '').trim();
      domain = (parts[1] || '').trim();
    } else {
      // Accept domain-only form and map to _@domain (common NIP-05 shorthand).
      localPart = '_';
      domain = raw;
    }

    if (!localPart || !domain || !domain.includes('.')) return '';
    if (!/^[a-z0-9._+-]+$/i.test(localPart)) return '';
    if (!/^[a-z0-9.-]+$/i.test(domain)) return '';
    return `${localPart}@${domain}`;
  }

  function nip05EntryForPubkey(pubkey, nip05Value) {
    const key = normalizePubkeyHex(pubkey);
    const nip05 = normalizeNip05Value(nip05Value);
    if (!key || !nip05) return null;
    const row = state.nip05VerificationByPubkey.get(key);
    if (!row || row.nip05 !== nip05) return null;
    return row;
  }

  function getVerifiedNip05ForPubkey(pubkey, nip05Value, opts = {}) {
    const nip05 = normalizeNip05Value(nip05Value);
    const row = nip05EntryForPubkey(pubkey, nip05);
    if (!row || !row.verified) return '';
    const maxAgeMs = Number(opts.maxAgeMs || 0);
    if (maxAgeMs > 0) {
      const age = Date.now() - Number(row.checkedAt || 0);
      if (!Number.isFinite(age) || age > maxAgeMs) return '';
    }
    return nip05;
  }

  function normalizeNip05ResolvedPubkey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const asHex = normalizePubkeyHex(raw);
    if (asHex) return asHex;
    const lower = raw.toLowerCase();
    if (/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) {
      return normalizePubkeyHex(parseNpubMaybe(lower));
    }
    return '';
  }

  async function normalizeNip05ResolvedPubkeyAsync(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const asHex = normalizePubkeyHex(raw);
    if (asHex) return asHex;
    const lower = raw.toLowerCase();
    if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) return '';

    const syncDecoded = normalizePubkeyHex(parseNpubMaybe(lower));
    if (syncDecoded) return syncDecoded;

    // Fallback for first-load cases where nostr-tools isn't ready yet.
    const asyncDecoded = await decodeNpubToPubkey(lower);
    return normalizePubkeyHex(asyncDecoded);
  }

  function pickNip05NameMatch(names, localPart) {
    if (!names || typeof names !== 'object') return '';
    const wanted = String(localPart || '').trim();
    if (!wanted) return '';
    if (names[wanted]) return names[wanted];
    const lowerWanted = wanted.toLowerCase();
    if (names[lowerWanted]) return names[lowerWanted];
    const matchKey = Object.keys(names).find((k) => String(k || '').trim().toLowerCase() === lowerWanted);
    return matchKey ? names[matchKey] : '';
  }

  function refreshNip05DependentUi(pubkey) {
    const normalized = normalizePubkeyHex(pubkey);
    if (!normalized) return;
    renderLiveGrid();

    const selected = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
    if (selected) {
      const isRelated = [selected.pubkey, selected.hostPubkey, selected.platformPubkey]
        .map((v) => normalizePubkeyHex(v))
        .includes(normalized);
      if (isRelated && isVideoPageVisible()) renderVideo(selected);
    }

    if (state.user && normalizePubkeyHex(state.user.pubkey) === normalized) {
      setUserUi();
    }

    if (normalizePubkeyHex(state.selectedProfilePubkey) === normalized && isProfilePageVisible()) {
      renderProfilePage(normalized);
      syncProfileRoute(normalized, 'replace');
    }

    const chatEl = qs('#chatScroll');
    if (chatEl) {
      const verified = !!getVerifiedNip05ForPubkey(normalized, profileFor(normalized).nip05 || '');
      const escaped = (window.CSS && typeof window.CSS.escape === 'function')
        ? window.CSS.escape(normalized)
        : normalized.replace(/["\\]/g, '');
      chatEl.querySelectorAll(`.cmsg[data-pubkey="${escaped}"] .c-av`).forEach((el) => {
        el.classList.toggle('nip05-square', verified);
      });
    }

    if (isNotificationsPageVisible()) {
      renderNotifications();
    }
    renderNotificationsBell();

    if (isMessagesPageVisible()) {
      renderDmContactSelect();
      scheduleDmRender({
        conversations: true,
        thread: normalizePubkeyHex(state.dmActivePeerPubkey) === normalized
      });
    }
  }

  async function fetchNip05PubkeyFromWellKnown(nip05Input, opts = {}) {
    const normalized = normalizeNip05Value(nip05Input);
    if (!normalized) return '';
    const now = Date.now();
    const cached = state.nip05LookupCacheByNip05.get(normalized);
    const maxAge = Number(opts.maxAgeMs || NIP05_LOOKUP_CACHE_TTL_MS);
    if (!opts.force && cached) {
      const age = now - Number(cached.checkedAt || 0);
      const cachedType = String(cached.resultType || (cached.pubkey ? 'hit' : 'miss'));
      const ttl = cachedType === 'error'
        ? NIP05_LOOKUP_ERROR_CACHE_TTL_MS
        : (cachedType === 'miss' ? Math.min(maxAge, NIP05_LOOKUP_MISS_CACHE_TTL_MS) : maxAge);
      if (age < ttl) return await normalizeNip05ResolvedPubkeyAsync(cached.pubkey || '');
    }

    const [localPart, domain] = normalized.split('@');
    const urls = [
      `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(localPart)}`,
      `https://${domain}/.well-known/nostr.json`
    ];

    let hadResponse = false;
    let hadNetworkError = false;
    let resolved = '';
    for (let i = 0; i < urls.length && !resolved; i += 1) {
      try {
        const resp = await fetch(urls[i], { cache: 'no-store' });
        hadResponse = true;
        if (!resp.ok) continue;

        let data = null;
        try {
          data = await resp.json();
        } catch (_) {
          continue;
        }

        const names = data && data.names && typeof data.names === 'object' ? data.names : {};
        const candidate = pickNip05NameMatch(names, localPart);
        resolved = await normalizeNip05ResolvedPubkeyAsync(candidate || '');
      } catch (_) {
        hadNetworkError = true;
      }
    }

    const resultType = resolved ? 'hit' : ((hadNetworkError && !hadResponse) ? 'error' : 'miss');
    state.nip05LookupCacheByNip05.set(normalized, { pubkey: resolved, checkedAt: now, resultType });
    return resolved;
  }

  async function ensureNip05Verification(pubkey, nip05Input, opts = {}) {
    const key = normalizePubkeyHex(pubkey);
    const nip05 = normalizeNip05Value(nip05Input);
    if (!key) return false;
    if (!nip05) {
      const prev = state.nip05VerificationByPubkey.get(key);
      state.nip05VerificationByPubkey.delete(key);
      if (prev) refreshNip05DependentUi(key);
      return false;
    }

    const existing = nip05EntryForPubkey(key, nip05);
    const maxAge = Number(opts.maxAgeMs || NIP05_LOOKUP_CACHE_TTL_MS);
    const existingTtl = existing
      ? (existing.verified ? maxAge : Math.min(maxAge, NIP05_UNVERIFIED_CACHE_TTL_MS))
      : 0;
    const existingFresh = existing && (Date.now() - Number(existing.checkedAt || 0)) < existingTtl;
    if (!opts.force && existingFresh) return !!existing.verified;
    if (state.nip05VerificationPendingByPubkey.has(key)) return !!(existing && existing.verified);

    state.nip05VerificationPendingByPubkey.add(key);
    try {
      const resolved = await fetchNip05PubkeyFromWellKnown(nip05, opts);
      const verified = !!resolved && resolved === key;
      const prev = state.nip05VerificationByPubkey.get(key);
      const changed = !prev || prev.nip05 !== nip05 || !!prev.verified !== verified;
      state.nip05VerificationByPubkey.set(key, { nip05, verified, checkedAt: Date.now() });
      if (changed) refreshNip05DependentUi(key);
      return verified;
    } finally {
      state.nip05VerificationPendingByPubkey.delete(key);
    }
  }

  function extractProfileTokenFromPath(pathname) {
    const parts = pathParts(pathname);
    if (!parts.length) return '';
    if (parts[0].toLowerCase() === 'a') return '';
    const token = parts[0];
    const lower = token.toLowerCase();
    if (/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) return lower;
    const nip05 = normalizeNip05Value(token);
    if (nip05) return nip05;
    return '';
  }

  function encodeStreamNaddr(stream) {
    if (!stream || !window.NostrTools || !window.NostrTools.nip19 || typeof window.NostrTools.nip19.naddrEncode !== 'function') {
      return '';
    }
    try {
      return window.NostrTools.nip19.naddrEncode({
        kind: Number(stream.kind || KIND_LIVE_EVENT),
        pubkey: stream.pubkey,
        identifier: stream.d,
        relays: state.relays.slice(0, 3)
      });
    } catch (_) {
      return '';
    }
  }

  async function decodeNaddrToAddress(naddr) {
    const value = (naddr || '').trim().toLowerCase();
    if (!value) return '';
    try {
      const tools = await ensureNostrTools();
      if (!tools || !tools.nip19 || typeof tools.nip19.decode !== 'function') return '';
      const decoded = tools.nip19.decode(value);
      if (!decoded || decoded.type !== 'naddr' || !decoded.data) return '';
      const kind = Number(decoded.data.kind || KIND_LIVE_EVENT);
      const pubkey = (decoded.data.pubkey || '').toLowerCase();
      const identifier = (decoded.data.identifier || '').trim();
      if (!pubkey || !identifier) return '';
      return `${kind}:${pubkey}:${identifier}`;
    } catch (_) {
      return '';
    }
  }

  async function decodeNpubToPubkey(npub) {
    const value = (npub || '').trim().toLowerCase();
    if (!/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value)) return '';
    try {
      const tools = await ensureNostrTools();
      if (!tools || !tools.nip19 || typeof tools.nip19.decode !== 'function') return '';
      const decoded = tools.nip19.decode(value);
      if (!decoded || decoded.type !== 'npub') return '';
      return /^[0-9a-f]{64}$/i.test(decoded.data || '') ? decoded.data.toLowerCase() : '';
    } catch (_) {
      return '';
    }
  }

  async function resolveNip05ToPubkey(nip05) {
    const normalized = normalizeNip05Value(nip05);
    if (!normalized) return '';
    const resolved = await fetchNip05PubkeyFromWellKnown(normalized);
    if (!resolved) return '';

    const existing = profileFor(resolved);
    const existingNip05 = normalizeNip05Value(existing.nip05 || '');
    if (existingNip05 === normalized) {
      state.nip05VerificationByPubkey.set(resolved, { nip05: normalized, verified: true, checkedAt: Date.now() });
    }
    return resolved;
  }

  async function resolveProfileTokenToPubkey(token) {
    const value = (token || '').trim();
    if (!value) return '';
    const lower = value.toLowerCase();
    if (/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) {
      return decodeNpubToPubkey(lower);
    }
    const nip05 = normalizeNip05Value(value);
    if (nip05) return resolveNip05ToPubkey(nip05);
    return '';
  }

  function syncHomeRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isHomePath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'home' }, '', '/');
    } catch (_) {
      // ignore
    }
  }

  function syncFaqRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isFaqPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'faq' }, '', '/FAQ');
    } catch (_) {
      // ignore
    }
  }
  function syncMessagesRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isMessagesPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'messages' }, '', '/messages');
    } catch (_) {
      // ignore
    }
  }

  function syncMyStreamsRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isMyStreamsPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'myStreams' }, '', '/my-streams');
    } catch (_) {
      // ignore
    }
  }

  function syncFeedRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isFeedPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'feed' }, '', '/feed');
    } catch (_) {
      // ignore
    }
  }

  function syncNotificationsRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isNotificationsPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'notifications' }, '', '/notifications');
    } catch (_) {
      // ignore
    }
  }

  function syncVideosRoute(mode = 'push') {
    if (!window.history || !window.history.pushState) return;
    if (isVideosPath(window.location.pathname)) return;
    const method = mode === 'replace' ? 'replaceState' : 'pushState';
    try {
      window.history[method]({ view: 'videos' }, '', '/videos');
    } catch (_) {
      // ignore
    }
  }

  function syncTheaterRoute(stream, mode = 'push') {
    if (!stream || !window.history || !window.history.pushState) return;

    const applyRoute = (naddr) => {
      const val = (naddr || '').trim().toLowerCase();
      if (!val) return false;
      const targetPath = `/${val}`;
      if (window.location.pathname === targetPath) return true;
      const method = mode === 'replace' ? 'replaceState' : 'pushState';
      try {
        window.history[method]({ view: 'theater', address: stream.address, naddr: val }, '', targetPath);
        return true;
      } catch (_) {
        return false;
      }
    };

    if (applyRoute(encodeStreamNaddr(stream))) return;
    ensureNostrTools().then(() => {
      applyRoute(encodeStreamNaddr(stream));
    }).catch(() => {});
  }

  function syncProfileRoute(pubkey, mode = 'push') {
    if (!pubkey || !window.history || !window.history.pushState) return;

    const applyRoute = (path) => {
      const targetPath = (path || '').trim();
      if (!targetPath) return false;
      if (window.location.pathname === targetPath) return true;
      const method = mode === 'replace' ? 'replaceState' : 'pushState';
      try {
        window.history[method]({ view: 'profile', pubkey }, '', targetPath);
        return true;
      } catch (_) {
        return false;
      }
    };

    const profile = profileFor(pubkey);
    const nip05 = getVerifiedNip05ForPubkey(pubkey, profile.nip05 || '');
    if (nip05 && applyRoute(`/${nip05}`)) return;
    if (!nip05) ensureNip05Verification(pubkey, profile.nip05 || '').catch(() => {});

    const applyNpub = () => {
      if (!window.NostrTools || !window.NostrTools.nip19 || typeof window.NostrTools.nip19.npubEncode !== 'function') {
        return false;
      }
      try {
        const npub = window.NostrTools.nip19.npubEncode(pubkey);
        return applyRoute(`/${(npub || '').toLowerCase()}`);
      } catch (_) {
        return false;
      }
    };

    if (applyNpub()) return;
    ensureNostrTools().then(() => {
      const latest = profileFor(pubkey);
      const latestNip05 = getVerifiedNip05ForPubkey(pubkey, latest.nip05 || '');
      if (latestNip05) {
        applyRoute(`/${latestNip05}`);
        return;
      }
      applyNpub();
    }).catch(() => {});
  }

  function tryOpenPendingRouteStream() {
    if (!state.pendingRouteAddress) return false;
    const stream = state.streamsByAddress.get(state.pendingRouteAddress);
    if (!stream) return false;
    const address = state.pendingRouteAddress;
    state.pendingRouteAddress = '';
    state.pendingRouteNaddr = '';
    openStream(address, { routeMode: 'skip' });
    return true;
  }

  function showHomeFromRoute() {
    if (window.showPage) window.showPage('home', { routeMode: 'skip' });
  }

  function showFaqFromRoute() {
    if (window.showPage) window.showPage('faq', { routeMode: 'skip' });
  }

  function showMessagesFromRoute() {
    if (window.showPage) window.showPage('messages', { routeMode: 'skip' });
  }

  function showMyStreamsFromRoute() {
    if (typeof window.openMyStreams === 'function') {
      const opened = window.openMyStreams({ routeMode: 'skip', allowLoginPrompt: false });
      if (opened) return;
    }
    if (window.showPage) window.showPage('home', { routeMode: 'replace' });
  }

  function showFeedFromRoute() {
    if (window.showPage) window.showPage('feed', { routeMode: 'skip' });
  }

  function showNotificationsFromRoute() {
    if (window.showPage) window.showPage('notifications', { routeMode: 'skip' });
  }

  function showVideosFromRoute() {
    if (window.showPage) window.showPage('videos', { routeMode: 'skip', videosFilter: 'all' });
  }

  async function syncViewFromLocation(opts = {}) {
    const fallbackMode = opts.fallbackMode || 'replace';
    if (isFaqPath(window.location.pathname)) {
      showFaqFromRoute();
      return;
    }
    if (isMessagesPath(window.location.pathname)) {
      showMessagesFromRoute();
      return;
    }
    if (isMyStreamsPath(window.location.pathname)) {
      showMyStreamsFromRoute();
      return;
    }
    if (isFeedPath(window.location.pathname)) {
      showFeedFromRoute();
      return;
    }
    if (isNotificationsPath(window.location.pathname)) {
      showNotificationsFromRoute();
      return;
    }
    if (isVideosPath(window.location.pathname)) {
      showVideosFromRoute();
      return;
    }
    const naddr = extractNaddrFromPath(window.location.pathname);
    if (naddr) {
      state.pendingRouteNaddr = naddr;
      if (window.showVideoPage) window.showVideoPage({ routeMode: 'skip' });
      const address = await decodeNaddrToAddress(naddr);
      if (!address) {
        state.pendingRouteAddress = '';
        state.pendingRouteNaddr = '';
        if (fallbackMode !== 'skip' && !isHomePath(window.location.pathname)) syncHomeRoute(fallbackMode);
        showHomeFromRoute();
        return;
      }
      state.pendingRouteAddress = address;
      tryOpenPendingRouteStream();
      return;
    }

    state.pendingRouteAddress = '';
    state.pendingRouteNaddr = '';

    const profileToken = extractProfileTokenFromPath(window.location.pathname);
    if (profileToken) {
      const pubkey = await resolveProfileTokenToPubkey(profileToken);
      if (!pubkey) {
        if (fallbackMode !== 'skip' && !isHomePath(window.location.pathname)) syncHomeRoute(fallbackMode);
        showHomeFromRoute();
        return;
      }
      showProfileByPubkey(pubkey, { routeMode: 'skip' });
      return;
    }

    if (!isHomePath(window.location.pathname) && fallbackMode !== 'skip') syncHomeRoute(fallbackMode);
    showHomeFromRoute();
  }

  function isMessagesPageVisible() {
    const page = qs('#messagesPage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function isNotificationsPageVisible() {
    const page = qs('#notificationsPage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function isVideoPageVisible() {
    const page = qs('#videoPage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function isProfilePageVisible() {
    const page = qs('#profilePage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function cssEscapeValue(value) {
    const raw = String(value == null ? '' : value);
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(raw);
    }
    return raw.replace(/["\\]/g, '\\$&');
  }

  function dmSortComparator(a, b) {
    const at = Number(a && a.created_at || 0);
    const bt = Number(b && b.created_at || 0);
    if (at !== bt) return at - bt;
    return String(a && a.id || '').localeCompare(String(b && b.id || ''));
  }

  function findDmInsertIndex(messages, message) {
    let lo = 0;
    let hi = messages.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (dmSortComparator(messages[mid], message) <= 0) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function insertDmMessageSorted(messages, message) {
    if (!Array.isArray(messages) || !message) return;
    if (!messages.length) {
      messages.push(message);
      return;
    }
    const last = messages[messages.length - 1];
    if (dmSortComparator(last, message) <= 0) {
      messages.push(message);
      return;
    }
    const idx = findDmInsertIndex(messages, message);
    messages.splice(idx, 0, message);
  }

  function capDmMessagesForPeer(peerPubkey, messages) {
    if (!Array.isArray(messages) || !messages.length) return;
    if (messages.length <= DM_PER_PEER_MEMORY_CAP) return;
    const removeCount = messages.length - DM_PER_PEER_MEMORY_CAP;
    if (removeCount <= 0) return;
    messages.splice(0, removeCount);
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return;
    const current = Number(state.dmThreadVisibleLimitByPeer.get(peer) || 0);
    if (current > DM_PER_PEER_MEMORY_CAP) {
      state.dmThreadVisibleLimitByPeer.set(peer, DM_PER_PEER_MEMORY_CAP);
    }
  }

  function flushScheduledDmRender() {
    if (state.dmRenderTimer) {
      clearTimeout(state.dmRenderTimer);
      state.dmRenderTimer = null;
    }
    const runConversations = !!state.dmRenderQueuedConversations;
    const runThread = !!state.dmRenderQueuedThread;
    const scrollToBottom = !!state.dmRenderScrollToBottom;
    state.dmRenderQueuedConversations = false;
    state.dmRenderQueuedThread = false;
    state.dmRenderScrollToBottom = false;
    if (!isMessagesPageVisible()) return;
    if (runConversations) renderDmConversationList();
    if (runThread) renderDmThread({ scrollToBottom });
  }

  function scheduleDmRender(opts = {}) {
    const conversations = opts.conversations !== false;
    const thread = !!opts.thread;
    if (conversations) state.dmRenderQueuedConversations = true;
    if (thread) state.dmRenderQueuedThread = true;
    if (thread && opts.scrollToBottom) state.dmRenderScrollToBottom = true;
    if (state.dmRenderTimer) return;
    state.dmRenderTimer = setTimeout(flushScheduledDmRender, DM_RENDER_BATCH_DELAY_MS);
  }

  function updateDmStatusUi() {
    const statusEl = qs('#dmStatusText');
    if (!statusEl) return;
    const text = String(state.dmStatus || '').trim();
    statusEl.textContent = text;
    statusEl.style.display = text ? 'inline-flex' : 'none';
    statusEl.classList.remove('error', 'success');
    if (state.dmStatusMode === 'error') statusEl.classList.add('error');
    if (state.dmStatusMode === 'success') statusEl.classList.add('success');
  }

  function setDmStatus(message, mode = 'info') {
    state.dmStatus = String(message || '').trim();
    state.dmStatusMode = mode === 'error' ? 'error' : (mode === 'success' ? 'success' : 'info');
    updateDmStatusUi();
  }

  function teardownDmSubscription() {
    if (state.dmSubId && state.pool) {
      try { state.pool.unsubscribe(state.dmSubId); } catch (_) {}
    }
    state.dmSubId = null;
    if (state.dmRenderTimer) {
      clearTimeout(state.dmRenderTimer);
      state.dmRenderTimer = null;
    }
    state.dmRenderQueuedConversations = false;
    state.dmRenderQueuedThread = false;
    state.dmRenderScrollToBottom = false;
    state.dmDecryptQueue = [];
    state.dmDecryptWorkers = 0;
    state.dmDecryptPendingIds = new Set();
    state.dmSyncing = false;
    state.dmBackfilling = false;
    if (state.dmSyncEoseTimer) {
      clearTimeout(state.dmSyncEoseTimer);
      state.dmSyncEoseTimer = null;
    }
    if (state.dmBackfillSubId && state.pool) {
      try { state.pool.unsubscribe(state.dmBackfillSubId); } catch (_) {}
    }
    state.dmBackfillSubId = null;
  }

  function clearDmState(opts = {}) {
    const keepLastRead = !!opts.keepLastRead;
    teardownDmSubscription();
    state.dmOwnerPubkey = '';
    state.dmMessagesByPeer = new Map();
    state.dmEventIds = new Set();
    state.dmActivePeerPubkey = '';
    state.dmSearchTerm = '';
    state.dmDraftByPeer = new Map();
    state.dmSendPending = false;
    state.dmLikedMessageIds = new Set();
    state.dmEmojiReactionsByMessageId = new Map();
    state.dmAddressBookOpen = false;
    state.dmThreadLastExpandAt = 0;
    state.dmStatus = '';
    state.dmStatusMode = 'info';
    state.dmThreadVisibleLimitByPeer = new Map();
    state.dmDecryptQueue = [];
    state.dmDecryptWorkers = 0;
    state.dmSyncing = false;
    state.dmBackfilling = false;
    if (state.dmSyncEoseTimer) {
      clearTimeout(state.dmSyncEoseTimer);
      state.dmSyncEoseTimer = null;
    }
    if (state.dmBackfillSubId && state.pool) {
      try { state.pool.unsubscribe(state.dmBackfillSubId); } catch (_) {}
    }
    state.dmBackfillSubId = null;
    if (!keepLastRead) state.dmLastReadByPeer = new Map();
  }

  function dmLastReadStorageKeyFor(ownerPubkey) {
    const owner = normalizePubkeyHex(ownerPubkey);
    if (!owner) return '';
    return `${DM_LAST_READ_STORAGE_KEY}:${owner}`;
  }

  function loadDmLastReadForOwner(ownerPubkey) {
    state.dmLastReadByPeer = new Map();
    const key = dmLastReadStorageKeyFor(ownerPubkey);
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== 'object') return;
      Object.keys(parsed).forEach((peerRaw) => {
        const peer = normalizePubkeyHex(peerRaw);
        const ts = Number(parsed[peerRaw] || 0);
        if (!peer || !Number.isFinite(ts) || ts <= 0) return;
        state.dmLastReadByPeer.set(peer, Math.floor(ts));
      });
    } catch (_) {
      state.dmLastReadByPeer = new Map();
    }
  }

  function persistDmLastReadForOwner() {
    const key = dmLastReadStorageKeyFor(state.dmOwnerPubkey);
    if (!key) return;
    const payload = {};
    state.dmLastReadByPeer.forEach((ts, peer) => {
      const val = Number(ts || 0);
      if (!Number.isFinite(val) || val <= 0) return;
      payload[peer] = Math.floor(val);
    });
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (_) {
      // ignore
    }
  }

  function getDmPeerFromEvent(ev, ownerPubkey) {
    if (!ev || Number(ev.kind || 0) !== KIND_DIRECT_MESSAGE) return '';
    const owner = normalizePubkeyHex(ownerPubkey);
    const author = normalizePubkeyHex(ev.pubkey);
    if (!owner || !author) return '';

    const pTags = allTagValues(ev.tags || [], 'p')
      .map((v) => normalizePubkeyHex(v))
      .filter((v) => !!v);

    if (author === owner) {
      const taggedPeer = pTags.find((pk) => pk !== owner);
      return taggedPeer || '';
    }
    if (pTags.includes(owner)) return author;
    return '';
  }

  function upsertDmMessageFromEvent(ev, ownerPubkey) {
    if (!ev || !ev.id || Number(ev.kind || 0) !== KIND_DIRECT_MESSAGE) return null;
    if (state.dmEventIds.has(ev.id)) return null;

    const owner = normalizePubkeyHex(ownerPubkey);
    const peer = getDmPeerFromEvent(ev, owner);
    if (!owner || !peer) return null;

    state.dmEventIds.add(ev.id);

    const mine = normalizePubkeyHex(ev.pubkey) === owner;
    const message = {
      id: ev.id,
      peerPubkey: peer,
      mine,
      pubkey: normalizePubkeyHex(ev.pubkey) || '',
      created_at: Number(ev.created_at || Math.floor(Date.now() / 1000)),
      ciphertext: String(ev.content || ''),
      content: '',
      decrypted: false,
      decryptError: false
    };

    const messages = state.dmMessagesByPeer.get(peer) || [];
    insertDmMessageSorted(messages, message);
    capDmMessagesForPeer(peer, messages);
    state.dmMessagesByPeer.set(peer, messages);
    return message;
  }

  function getDmUnreadCountForPeer(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return 0;
    const messages = state.dmMessagesByPeer.get(peer) || [];
    if (!messages.length) return 0;
    const lastRead = Number(state.dmLastReadByPeer.get(peer) || 0);
    let unread = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      const ts = Number(msg && msg.created_at || 0);
      if (ts <= lastRead) break;
      if (msg && !msg.mine) unread += 1;
    }
    return unread;
  }

  function markDmPeerRead(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return;
    const messages = state.dmMessagesByPeer.get(peer) || [];
    if (!messages.length) return;
    let newestIncomingTs = 0;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg || msg.mine) continue;
      newestIncomingTs = Number(msg.created_at || 0);
      break;
    }
    if (!newestIncomingTs) return;
    const current = Number(state.dmLastReadByPeer.get(peer) || 0);
    if (newestIncomingTs <= current) return;
    state.dmLastReadByPeer.set(peer, newestIncomingTs);
    persistDmLastReadForOwner();
  }

  function dmDisplayNameForPeer(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return 'Unknown';
    const profile = profileFor(peer);
    const preferred = String(profile.display_name || profile.name || '').trim();
    return preferred || shortHex(peer);
  }

  function dmDisplaySublineForPeer(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return '';
    const profile = profileFor(peer);
    const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(peer, claimedNip05);
    if (claimedNip05 && !verifiedNip05) ensureNip05Verification(peer, claimedNip05).catch(() => {});
    if (verifiedNip05) return verifiedNip05;
    const npub = formatNpubForDisplay(peer);
    if (npub.startsWith('npub1') && npub.length > 28) return `${npub.slice(0, 16)}...${npub.slice(-8)}`;
    return npub || shortHex(peer);
  }

  function dmMessagePreview(message) {
    if (!message) return 'No messages yet';
    if (message.decryptError) return 'Encrypted message (cannot decrypt with current signer)';
    if (!message.decrypted) return 'Decrypting encrypted message...';
    const val = String(message.content || '').trim();
    return val || '[empty message]';
  }

  function dmContactOptionLabel(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return 'Unknown';
    const profile = profileFor(peer);
    const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(peer, claimedNip05);
    if (claimedNip05 && !verifiedNip05) ensureNip05Verification(peer, claimedNip05).catch(() => {});
    const name = dmDisplayNameForPeer(peer);
    const suffix = verifiedNip05 || shortHex(peer);
    return `${name} - ${suffix}`;
  }

  function getDmOwnedPeopleLists() {
    const owner = normalizePubkeyHex(state.user && state.user.pubkey || '');
    if (!owner) return [];
    return Array.from(state.nip51Lists.values())
      .filter((list) => normalizePubkeyHex(list && list.pubkey || '') === owner)
      .sort((a, b) => String(a && a.name || '').localeCompare(String(b && b.name || '')));
  }

  function getDmListSelectionOptions() {
    const owner = normalizePubkeyHex(state.user && state.user.pubkey || '');
    if (!owner) return [];

    const followingSource = new Set([
      ...Array.from(state.contactListPubkeys || []),
      ...Array.from(state.followedPubkeys || [])
    ]);
    const followingPeers = Array.from(followingSource)
      .map((pk) => normalizePubkeyHex(pk))
      .filter((pk) => !!pk && pk !== owner);
    const out = [{
      value: 'following',
      label: `Following (${followingPeers.length})`,
      type: 'following'
    }];

    getDmOwnedPeopleLists().forEach((list) => {
      const count = Array.from(new Set((list && list.pubkeys || [])
        .map((pk) => normalizePubkeyHex(pk))
        .filter((pk) => !!pk && pk !== owner))).length;
      out.push({
        value: `list:${list.id}`,
        label: `${String(list && list.name || 'NIP-51 list').trim() || 'NIP-51 list'} (${count})`,
        type: 'nip51',
        listId: list.id
      });
    });
    return out;
  }

  function ensureDmListSelection() {
    const options = getDmListSelectionOptions();
    if (!options.length) {
      state.dmListSelection = '';
      return '';
    }
    const valid = new Set(options.map((opt) => opt.value));
    if (!valid.has(state.dmListSelection)) state.dmListSelection = options[0].value;
    return state.dmListSelection;
  }

  function getDmSelectedListContext() {
    const owner = normalizePubkeyHex(state.user && state.user.pubkey || '');
    if (!owner) return null;
    const selected = ensureDmListSelection();
    if (!selected) return null;

    if (selected === 'following') {
      const followingSource = new Set([
        ...Array.from(state.contactListPubkeys || []),
        ...Array.from(state.followedPubkeys || [])
      ]);
      const pubkeys = Array.from(followingSource)
        .map((pk) => normalizePubkeyHex(pk))
        .filter((pk) => !!pk && pk !== owner);
      return {
        type: 'following',
        value: 'following',
        name: 'Following',
        list: null,
        editable: false,
        pubkeys
      };
    }

    if (selected.startsWith('list:')) {
      const listId = selected.slice(5);
      const list = state.nip51Lists.get(listId);
      if (!list) return null;
      const pubkeys = Array.from(new Set((list.pubkeys || [])
        .map((pk) => normalizePubkeyHex(pk))
        .filter((pk) => !!pk && pk !== owner)));
      return {
        type: 'nip51',
        value: selected,
        name: String(list.name || '').trim() || 'NIP-51 list',
        list,
        editable: true,
        pubkeys
      };
    }

    return null;
  }

  function getDmSelectedListMembers(context) {
    const target = context || getDmSelectedListContext();
    if (!target) return [];
    return Array.from(new Set(target.pubkeys || []))
      .sort((a, b) => dmDisplayNameForPeer(a).localeCompare(dmDisplayNameForPeer(b)));
  }

  function setDmListEditorMode(mode = '') {
    const normalized = mode === 'create' ? 'create' : (mode === 'rename' ? 'rename' : '');
    const createRow = qs('#dmListCreateRow');
    const renameRow = qs('#dmListRenameRow');
    if (createRow) createRow.style.display = normalized === 'create' ? 'flex' : 'none';
    if (renameRow) renameRow.style.display = normalized === 'rename' ? 'flex' : 'none';

    if (normalized === 'create') {
      const input = qs('#dmListCreateInput');
      if (input) {
        input.value = '';
        try { input.focus(); } catch (_) {}
      }
    } else if (normalized === 'rename') {
      const context = getDmSelectedListContext();
      const input = qs('#dmListRenameInput');
      if (input) {
        input.value = context && context.type === 'nip51' ? (context.list.name || '') : '';
        try { input.focus(); } catch (_) {}
      }
    }
  }

  function buildDmPeopleListTags(list, nextName, nextPubkeys) {
    const tags = [];
    if (list && list.d) tags.push(['d', list.d]);
    const cleanedName = String(nextName || '').trim();
    if (cleanedName) tags.push(['name', cleanedName]);
    Array.from(new Set((nextPubkeys || [])
      .map((pk) => normalizePubkeyHex(pk))
      .filter(Boolean)))
      .forEach((pk) => tags.push(['p', pk]));
    return tags;
  }

  async function publishDmPeopleListUpdate(list, opts = {}) {
    if (!list || !list.d) throw new Error('List is missing its identifier.');
    if (!state.user) throw new Error('Please login first.');
    const owner = normalizePubkeyHex(state.user.pubkey || '');
    if (!owner) throw new Error('Please login first.');
    if (normalizePubkeyHex(list.pubkey || '') !== owner) {
      throw new Error('You can only edit your own lists.');
    }

    const name = String(opts.name != null ? opts.name : list.name || '').trim() || 'NIP-51 list';
    const pubkeys = Array.from(new Set((opts.pubkeys != null ? opts.pubkeys : list.pubkeys || [])
      .map((pk) => normalizePubkeyHex(pk))
      .filter((pk) => !!pk && pk !== owner)));
    const tags = buildDmPeopleListTags(list, name, pubkeys);
    if (!tags.some((t) => t[0] === 'd')) tags.push(['d', list.d]);

    state.dmListActionPending = true;
    renderDmListPanel();
    try {
      const ev = await signAndPublish(KIND_PEOPLE_LIST, '', tags);
      const merged = {
        ...list,
        name,
        pubkeys,
        eventId: ev && ev.id ? ev.id : (list.eventId || ''),
        created_at: Number(ev && ev.created_at || Math.floor(Date.now() / 1000))
      };
      state.nip51Lists.set(list.id, merged);
      renderListFilterDD();
      renderFollowingCount();
      renderLiveGrid();
      return merged;
    } finally {
      state.dmListActionPending = false;
      renderDmListPanel();
    }
  }

  async function createDmPeopleList(nameInput) {
    if (!state.user) {
      window.openLogin();
      return null;
    }
    const name = String(nameInput || '').trim();
    if (!name) throw new Error('List name is required.');
    const owner = normalizePubkeyHex(state.user.pubkey || '');
    if (!owner) throw new Error('Please login first.');
    const d = `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const list = {
      id: `${KIND_PEOPLE_LIST}:${owner}:${d}`,
      name,
      pubkeys: [],
      kind: KIND_PEOPLE_LIST,
      d,
      pubkey: owner,
      eventId: '',
      created_at: 0
    };
    const created = await publishDmPeopleListUpdate(list, { name, pubkeys: [] });
    state.dmListSelection = `list:${created.id}`;
    setDmStatus(`Created list "${created.name}".`, 'success');
    renderDmListPanel();
    return created;
  }

  async function renameDmSelectedPeopleList(nextNameInput) {
    const context = getDmSelectedListContext();
    if (!context || context.type !== 'nip51' || !context.list) {
      throw new Error('Select one of your NIP-51 lists first.');
    }
    const nextName = String(nextNameInput || '').trim();
    if (!nextName) throw new Error('List name is required.');
    const updated = await publishDmPeopleListUpdate(context.list, { name: nextName });
    setDmStatus(`Renamed list to "${updated.name}".`, 'success');
    renderDmListPanel();
  }

  async function deleteDmSelectedPeopleList() {
    const context = getDmSelectedListContext();
    if (!context || context.type !== 'nip51' || !context.list) {
      throw new Error('Select one of your NIP-51 lists first.');
    }
    if (!state.user) throw new Error('Please login first.');
    const owner = normalizePubkeyHex(state.user.pubkey || '');
    if (!owner) throw new Error('Please login first.');

    const list = context.list;
    state.dmListActionPending = true;
    renderDmListPanel();
    try {
      const tags = [['a', `${KIND_PEOPLE_LIST}:${owner}:${list.d}`], ['k', `${KIND_PEOPLE_LIST}`], ['d', list.d]];
      if (list.eventId) tags.push(['e', list.eventId]);
      await signAndPublish(KIND_DELETION, `Deleted people list ${list.name || list.d}`, tags);
      state.nip51Lists.delete(list.id);
      state.dmListSelection = 'following';
      setDmStatus(`Deleted list "${list.name || 'NIP-51 list'}".`, 'success');
      renderListFilterDD();
      renderLiveGrid();
    } finally {
      state.dmListActionPending = false;
      renderDmListPanel();
    }
  }

  async function addPeerToDmSelectedList(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) throw new Error('Could not resolve that account.');
    if (!state.user) throw new Error('Please login first.');
    const owner = normalizePubkeyHex(state.user.pubkey || '');
    if (!owner) throw new Error('Please login first.');
    if (peer === owner) throw new Error('You cannot add your own account.');

    const context = getDmSelectedListContext();
    if (!context) throw new Error('Select a list first.');

    if (context.type === 'following') {
      if (state.followedPubkeys.has(peer)) {
        setDmStatus('That account is already in Following.', 'info');
        return;
      }
      const prevFollowed = new Set(state.followedPubkeys);
      const prevContacts = new Set(state.contactListPubkeys);
      state.dmListActionPending = true;
      renderDmListPanel();
      try {
        state.followedPubkeys.add(peer);
        state.contactListPubkeys.add(peer);
        persistFollowedPubkeys();
        await publishFollowedPubkeysToNostr();
        renderFollowingCount();
        renderListFilterDD();
        renderLiveGrid();
        setDmStatus('Added account to Following.', 'success');
      } catch (err) {
        state.followedPubkeys = prevFollowed;
        state.contactListPubkeys = prevContacts;
        persistFollowedPubkeys();
        renderFollowingCount();
        renderListFilterDD();
        renderLiveGrid();
        throw err;
      } finally {
        state.dmListActionPending = false;
        renderDmListPanel();
      }
      return;
    }

    if (context.type === 'nip51' && context.list) {
      const already = (context.list.pubkeys || []).some((pk) => normalizePubkeyHex(pk) === peer);
      if (already) {
        setDmStatus('That account is already in this list.', 'info');
        return;
      }
      await publishDmPeopleListUpdate(context.list, { pubkeys: [...(context.list.pubkeys || []), peer] });
      setDmStatus('Added account to list.', 'success');
      return;
    }

    throw new Error('Selected list is not editable.');
  }

  async function removePeerFromDmSelectedList(peerPubkey) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) throw new Error('Missing account pubkey.');
    if (!state.user) throw new Error('Please login first.');

    const context = getDmSelectedListContext();
    if (!context) throw new Error('Select a list first.');

    if (context.type === 'following') {
      if (!state.followedPubkeys.has(peer) && !state.contactListPubkeys.has(peer)) return;
      const prevFollowed = new Set(state.followedPubkeys);
      const prevContacts = new Set(state.contactListPubkeys);
      state.dmListActionPending = true;
      renderDmListPanel();
      try {
        state.followedPubkeys.delete(peer);
        state.contactListPubkeys.delete(peer);
        persistFollowedPubkeys();
        await publishFollowedPubkeysToNostr();
        renderFollowingCount();
        renderListFilterDD();
        renderLiveGrid();
        setDmStatus('Removed account from Following.', 'success');
      } catch (err) {
        state.followedPubkeys = prevFollowed;
        state.contactListPubkeys = prevContacts;
        persistFollowedPubkeys();
        renderFollowingCount();
        renderListFilterDD();
        renderLiveGrid();
        throw err;
      } finally {
        state.dmListActionPending = false;
        renderDmListPanel();
      }
      return;
    }

    if (context.type === 'nip51' && context.list) {
      const nextPubkeys = (context.list.pubkeys || []).filter((pk) => normalizePubkeyHex(pk) !== peer);
      await publishDmPeopleListUpdate(context.list, { pubkeys: nextPubkeys });
      setDmStatus('Removed account from list.', 'success');
      return;
    }

    throw new Error('Selected list is not editable.');
  }

  function applyDmAddressBookVisibility(rootEl = null) {
    const scope = rootEl || document;
    const wrap = qs('#dmWrap', scope) || qs('#dmWrap');
    const panel = qs('#dmListsPanel', scope) || qs('#dmListsPanel');
    const toggleBtn = qs('#dmAddressBookToggleBtn', scope) || qs('#dmAddressBookToggleBtn');
    const open = !!state.dmAddressBookOpen;

    if (wrap) {
      wrap.classList.toggle('dm-address-book-open', open);
      wrap.classList.toggle('dm-address-book-closed', !open);
    }
    if (panel) panel.style.display = open ? '' : 'none';
    if (toggleBtn) toggleBtn.textContent = open ? 'Hide Address Book' : 'Address Book';
  }

  function renderDmListPanel() {
    applyDmAddressBookVisibility();
    if (!state.dmAddressBookOpen) return;

    const select = qs('#dmListSelect');
    const membersEl = qs('#dmListMembers');
    const addInput = qs('#dmListAddInput');
    const addBtn = qs('#dmListAddBtn');
    const createBtn = qs('#dmListCreateBtn');
    const renameBtn = qs('#dmListRenameBtn');
    const deleteBtn = qs('#dmListDeleteBtn');
    const createInput = qs('#dmListCreateInput');
    const createSaveBtn = qs('#dmListCreateSaveBtn');
    const createCancelBtn = qs('#dmListCreateCancelBtn');
    const renameInput = qs('#dmListRenameInput');
    const renameSaveBtn = qs('#dmListRenameSaveBtn');
    const renameCancelBtn = qs('#dmListRenameCancelBtn');
    const metaEl = qs('#dmListMeta');
    if (!select && !membersEl) return;

    const options = getDmListSelectionOptions();
    ensureDmListSelection();

    if (select) {
      const prev = String(select.value || '');
      select.innerHTML = '';
      if (!options.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No lists available';
        select.appendChild(opt);
        select.disabled = true;
      } else {
        options.forEach((optData) => {
          const opt = document.createElement('option');
          opt.value = optData.value;
          opt.textContent = optData.label;
          select.appendChild(opt);
        });
        select.disabled = false;
        const targetVal = options.some((opt) => opt.value === prev) ? prev : state.dmListSelection;
        select.value = targetVal || options[0].value;
        state.dmListSelection = select.value || '';
      }
    }

    const context = getDmSelectedListContext();
    const members = getDmSelectedListMembers(context);
    if (metaEl) {
      if (!context) metaEl.textContent = 'Create a list, or use Following to manage your contacts.';
      else if (context.type === 'following') metaEl.textContent = `${members.length} account${members.length === 1 ? '' : 's'} in Following (kind:3).`;
      else metaEl.textContent = `${members.length} account${members.length === 1 ? '' : 's'} in ${context.name}.`;
    }

    const canEditCustomList = !!context && context.type === 'nip51';
    if (createBtn) createBtn.disabled = !!state.dmListActionPending;
    if (renameBtn) {
      renameBtn.disabled = !!state.dmListActionPending || !canEditCustomList;
      renameBtn.style.display = canEditCustomList ? '' : 'none';
    }
    if (deleteBtn) {
      deleteBtn.disabled = !!state.dmListActionPending || !canEditCustomList;
      deleteBtn.style.display = canEditCustomList ? '' : 'none';
    }
    if (createInput) createInput.disabled = !!state.dmListActionPending;
    if (createSaveBtn) createSaveBtn.disabled = !!state.dmListActionPending;
    if (createCancelBtn) createCancelBtn.disabled = !!state.dmListActionPending;
    if (renameInput) renameInput.disabled = !!state.dmListActionPending || !context || context.type !== 'nip51';
    if (renameSaveBtn) renameSaveBtn.disabled = !!state.dmListActionPending || !context || context.type !== 'nip51';
    if (renameCancelBtn) renameCancelBtn.disabled = !!state.dmListActionPending;
    if (addInput) addInput.disabled = !!state.dmListActionPending || !context;
    if (addBtn) addBtn.disabled = !!state.dmListActionPending || !context;
    if (addInput) {
      addInput.placeholder = context
        ? 'Add by npub, nip-05, nprofile, or hex pubkey'
        : 'Select or create a list first';
    }

    const renameRow = qs('#dmListRenameRow');
    if (renameRow && renameRow.style.display === 'flex' && (!context || context.type !== 'nip51')) {
      setDmListEditorMode('');
    }

    if (!membersEl) return;
    membersEl.innerHTML = '';
    if (!context) {
      const empty = document.createElement('div');
      empty.className = 'dm-empty';
      empty.innerHTML = '<strong>No contact list selected</strong>Create a NIP-51 list to organize people, or use Following.';
      membersEl.appendChild(empty);
      return;
    }

    if (!members.length) {
      const empty = document.createElement('div');
      empty.className = 'dm-empty';
      empty.innerHTML = `<strong>${context.name} is empty</strong>Add someone with npub, NIP-05, nprofile, or hex pubkey.`;
      membersEl.appendChild(empty);
      return;
    }

    members.forEach((peer) => {
      if (!state.profilesByPubkey.has(peer)) fetchProfileIfNeeded(peer);
      const profile = profileFor(peer);
      const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
      const verifiedNip05 = getVerifiedNip05ForPubkey(peer, claimedNip05);
      if (claimedNip05 && !verifiedNip05) ensureNip05Verification(peer, claimedNip05).catch(() => {});

      const item = document.createElement('article');
      item.className = 'dm-list-member';
      item.dataset.peer = peer;

      const av = document.createElement('div');
      av.className = 'dm-av';
      av.classList.toggle('nip05-square', !!verifiedNip05);
      setAvatarEl(av, profile.picture || '', pickAvatar(peer));
      item.appendChild(av);

      const body = document.createElement('div');
      body.className = 'dm-list-member-main';
      item.appendChild(body);

      const name = document.createElement('div');
      name.className = 'dm-list-member-name';
      name.textContent = dmDisplayNameForPeer(peer);
      body.appendChild(name);

      const sub = document.createElement('div');
      sub.className = 'dm-list-member-sub';
      const npub = formatNpubForDisplay(peer);
      const shortNpub = npub.startsWith('npub1') && npub.length > 28 ? `${npub.slice(0, 12)}...${npub.slice(-8)}` : (npub || shortHex(peer));
      if (verifiedNip05) sub.textContent = `${verifiedNip05} - ${shortNpub}`;
      else if (claimedNip05) sub.textContent = `${claimedNip05} (unverified) - ${shortNpub}`;
      else sub.textContent = shortNpub;
      body.appendChild(sub);

      const actions = document.createElement('div');
      actions.className = 'dm-list-member-actions';
      item.appendChild(actions);

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'btn btn-ghost dm-list-member-open';
      openBtn.dataset.peer = peer;
      openBtn.textContent = 'Message';
      actions.appendChild(openBtn);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn btn-ghost dm-list-member-remove';
      removeBtn.dataset.peer = peer;
      removeBtn.textContent = 'Remove';
      removeBtn.disabled = !!state.dmListActionPending;
      actions.appendChild(removeBtn);

      membersEl.appendChild(item);
    });
  }

  function renderDmContactSelect() {
    if (!state.dmAddressBookOpen) {
      applyDmAddressBookVisibility();
      return;
    }
    renderDmListPanel();
  }

  async function handleDmAddToSelectedList() {
    const input = qs('#dmListAddInput');
    const raw = String(input && input.value || '').trim();
    if (!raw) {
      setDmStatus('Enter an npub, NIP-05, nprofile, or hex pubkey first.', 'error');
      return;
    }
    try {
      const peer = await resolveDmRecipientToken(raw);
      if (!peer) throw new Error('Could not resolve that account.');
      fetchProfileIfNeeded(peer);
      await addPeerToDmSelectedList(peer);
      if (input) input.value = '';
      renderDmListPanel();
    } catch (err) {
      setDmStatus(err && err.message ? err.message : 'Failed to add account to list.', 'error');
    }
  }

  function getDmConversationItems() {
    const term = String(state.dmSearchTerm || '').trim().toLowerCase();
    const out = [];
    const activePeer = normalizePubkeyHex(state.dmActivePeerPubkey);
    state.dmMessagesByPeer.forEach((messages, peerPubkey) => {
      const list = Array.isArray(messages) ? messages : [];
      const peer = normalizePubkeyHex(peerPubkey);
      if (!peer) return;
      if (!state.profilesByPubkey.has(peer)) fetchProfileIfNeeded(peer);
      if (!list.length && peer !== activePeer) return;
      const latest = list[list.length - 1] || null;
      const profile = profileFor(peer);
      const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
      const verifiedNip05 = getVerifiedNip05ForPubkey(peer, claimedNip05);
      const name = dmDisplayNameForPeer(peer);
      const haystack = `${name} ${verifiedNip05 || ''} ${formatNpubForDisplay(peer)} ${dmMessagePreview(latest)}`.toLowerCase();
      if (term && !haystack.includes(term)) return;
      out.push({
        peerPubkey: peer,
        messages: list,
        latest,
        profile,
        verifiedNip05,
        unread: getDmUnreadCountForPeer(peer)
      });
    });
    out.sort((a, b) => {
      const at = Number(a.latest && a.latest.created_at || 0);
      const bt = Number(b.latest && b.latest.created_at || 0);
      if (at !== bt) return bt - at;
      return String(a.peerPubkey || '').localeCompare(String(b.peerPubkey || ''));
    });
    return out;
  }

  function renderDmConversationList() {
    const listEl = qs('#dmConvoList');
    const countEl = qs('#dmConvCount');
    if (!listEl) return;
    listEl.innerHTML = '';

    const conversations = getDmConversationItems();
    if (conversations.length && !conversations.some((entry) => entry.peerPubkey === state.dmActivePeerPubkey)) {
      state.dmActivePeerPubkey = conversations[0].peerPubkey;
      markDmPeerRead(state.dmActivePeerPubkey);
    }
    if (!conversations.length) state.dmActivePeerPubkey = '';

    const totalUnread = conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0);
    if (countEl) {
      const convoCountText = `${conversations.length} conversation${conversations.length === 1 ? '' : 's'}`;
      const unreadText = totalUnread > 0 ? ` - ${totalUnread} unread` : '';
      countEl.textContent = `${convoCountText}${unreadText}`;
    }

    if (!conversations.length) {
      const empty = document.createElement('div');
      empty.className = 'dm-empty';
      empty.innerHTML = '<strong>No DMs yet</strong>Use the field above to open a conversation by npub, NIP-05, or hex pubkey.';
      listEl.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    conversations.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dm-convo';
      if (item.peerPubkey === state.dmActivePeerPubkey) btn.classList.add('active');
      btn.dataset.peer = item.peerPubkey;

      const av = document.createElement('div');
      av.className = 'dm-av';
      setAvatarEl(av, item.profile.picture || '', pickAvatar(item.peerPubkey));
      av.classList.toggle('nip05-square', !!item.verifiedNip05);
      btn.appendChild(av);

      const main = document.createElement('div');
      main.className = 'dm-convo-main';
      btn.appendChild(main);

      const top = document.createElement('div');
      top.className = 'dm-convo-top';
      main.appendChild(top);

      const name = document.createElement('span');
      name.className = 'dm-convo-name';
      name.textContent = dmDisplayNameForPeer(item.peerPubkey);
      top.appendChild(name);

      const time = document.createElement('span');
      time.className = 'dm-convo-time';
      if (item.latest && Number(item.latest.created_at || 0) > 0) {
        time.textContent = `${formatTimeAgo(item.latest.created_at)} ago`;
      } else {
        time.textContent = 'new';
      }
      top.appendChild(time);

      if (item.unread > 0) {
        const unread = document.createElement('span');
        unread.className = 'dm-unread';
        unread.textContent = String(item.unread);
        top.appendChild(unread);
      }

      const preview = document.createElement('div');
      preview.className = 'dm-convo-preview';
      preview.textContent = dmMessagePreview(item.latest);
      main.appendChild(preview);

      fragment.appendChild(btn);
    });
    listEl.appendChild(fragment);
  }

  function adjustDmUnreadSummaryCount(delta) {
    const step = Number(delta || 0);
    if (!Number.isFinite(step) || step === 0) return;
    const countEl = qs('#dmConvCount');
    if (!countEl) return;
    const text = String(countEl.textContent || '').trim();
    const convoMatch = text.match(/^(\d+)\s+conversation(?:s)?/i);
    if (!convoMatch) return;
    const unreadMatch = text.match(/-\s*(\d+)\s+unread/i);
    const convoCount = Number(convoMatch[1] || 0);
    if (!Number.isFinite(convoCount)) return;
    const currentUnread = unreadMatch ? Number(unreadMatch[1] || 0) : 0;
    const nextUnread = Math.max(0, currentUnread + step);
    const unreadText = nextUnread > 0 ? ` - ${nextUnread} unread` : '';
    countEl.textContent = `${convoCount} conversation${convoCount === 1 ? '' : 's'}${unreadText}`;
  }

  function maybeLoadOlderDmMessagesForActiveThread(threadEl) {
    if (!threadEl) return;
    const activePeer = normalizePubkeyHex(state.dmActivePeerPubkey);
    if (!activePeer) return;
    if (Number(threadEl.scrollTop || 0) > 72) return;
    const now = Date.now();
    if ((now - Number(state.dmThreadLastExpandAt || 0)) < 220) return;

    const messages = state.dmMessagesByPeer.get(activePeer) || [];
    if (!messages.length) return;
    const currentLimit = Number(state.dmThreadVisibleLimitByPeer.get(activePeer) || Math.min(DM_THREAD_INITIAL_LIMIT, messages.length));
    if (currentLimit >= messages.length) return;

    const snapshot = {
      prevHeight: Number(threadEl.scrollHeight || 0),
      prevTop: Number(threadEl.scrollTop || 0)
    };
    const nextLimit = Math.min(messages.length, currentLimit + DM_THREAD_PAGE_INCREMENT);
    state.dmThreadVisibleLimitByPeer.set(activePeer, nextLimit);
    state.dmThreadLastExpandAt = now;
    renderDmThread({ preserveScrollAnchor: snapshot });
  }

  function ensureDmReactionEntry(messageId) {
    const key = String(messageId || '').trim();
    if (!key) return null;
    let entry = state.dmEmojiReactionsByMessageId.get(key);
    if (!entry) {
      entry = new Map();
      state.dmEmojiReactionsByMessageId.set(key, entry);
    }
    return entry;
  }

  function updateDmMessageReactionUi(messageId) {
    const msgId = String(messageId || '').trim();
    if (!msgId) return;
    const escapedMsgId = cssEscapeValue(msgId);
    const rows = qsa(`.dm-msg[data-msg-id="${escapedMsgId}"]`);
    if (!rows.length) return;

    const liked = state.dmLikedMessageIds.has(msgId);
    const emojiMap = state.dmEmojiReactionsByMessageId.get(msgId) || new Map();
    const emojiEntries = Array.from(emojiMap.values())
      .filter((entry) => entry && entry.active)
      .sort((a, b) => String(a.key || '').localeCompare(String(b.key || '')));

    rows.forEach((row) => {
      const likeBtn = qs('.dm-like-btn', row);
      const likeCount = qs('.dm-like-count', row);
      if (likeCount) likeCount.textContent = liked ? '1' : '0';
      if (likeBtn) likeBtn.classList.toggle('active', liked);

      const emojiBar = qs('.dm-msg-emoji-bar', row);
      if (!emojiBar) return;
      emojiBar.innerHTML = '';
      if (!emojiEntries.length) {
        emojiBar.style.display = 'none';
        return;
      }
      emojiBar.style.display = 'flex';
      emojiEntries.forEach((entry) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'stream-emoji-chip active';
        chip.title = `${entry.label || entry.key} (1)`;
        chip.addEventListener('click', () => {
          toggleDmEmojiReactionByMeta(msgId, entry);
        });

        const countEl = document.createElement('span');
        countEl.className = 'stream-emoji-count';
        countEl.textContent = '1';
        chip.appendChild(countEl);

        if (entry.imageUrl) {
          const img = document.createElement('img');
          img.src = entry.imageUrl;
          img.alt = entry.label || entry.key;
          img.loading = 'lazy';
          chip.appendChild(img);
        } else {
          const txt = document.createElement('span');
          txt.textContent = String(entry.label || entry.key).slice(0, 18);
          chip.appendChild(txt);
        }
        emojiBar.appendChild(chip);
      });
    });
  }

  function toggleDmLikeMessage(messageId) {
    const msgId = String(messageId || '').trim();
    if (!msgId) return;
    if (state.dmLikedMessageIds.has(msgId)) state.dmLikedMessageIds.delete(msgId);
    else state.dmLikedMessageIds.add(msgId);
    updateDmMessageReactionUi(msgId);
  }

  function toggleDmEmojiReactionByMeta(messageId, reactionMeta) {
    const msgId = String(messageId || '').trim();
    if (!msgId || !reactionMeta || !reactionMeta.key) return;
    const emojiMap = ensureDmReactionEntry(msgId);
    if (!emojiMap) return;
    const key = String(reactionMeta.key || '').trim();
    const existing = emojiMap.get(key);
    if (existing && existing.active) {
      emojiMap.delete(key);
    } else {
      emojiMap.set(key, {
        key,
        label: reactionMeta.label || key,
        imageUrl: reactionMeta.imageUrl || '',
        shortcode: reactionMeta.shortcode || '',
        active: true
      });
    }
    updateDmMessageReactionUi(msgId);
  }

  function renderDmThread(opts = {}) {
    const titleEl = qs('#dmThreadTitle');
    const subEl = qs('#dmThreadSub');
    const avEl = qs('#dmThreadAvatar');
    const verifiedEl = qs('#dmThreadVerified');
    const bannerEl = qs('#dmThreadBanner');
    const followBtn = qs('#dmFollowPeerBtn');
    const zapBtn = qs('#dmZapPeerBtn');
    const threadEl = qs('#dmThread');
    const composeInput = qs('#dmComposeInput');
    const sendBtn = qs('#dmSendBtn');
    const attachBtn = qs('#dmAttachBtn');
    if (!threadEl) return;

    const activePeer = normalizePubkeyHex(state.dmActivePeerPubkey);
    const hasPeer = !!activePeer;
    if (titleEl) titleEl.textContent = hasPeer ? dmDisplayNameForPeer(activePeer) : 'Select a conversation';
    if (subEl) subEl.textContent = hasPeer ? dmDisplaySublineForPeer(activePeer) : 'Only you and the other person can read these DMs.';

    if (hasPeer) {
      const profile = profileFor(activePeer);
      const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
      const verifiedNip05 = getVerifiedNip05ForPubkey(activePeer, claimedNip05);
      if (claimedNip05 && !verifiedNip05) ensureNip05Verification(activePeer, claimedNip05).catch(() => {});
      if (!state.profilesByPubkey.has(activePeer)) {
        fetchProfileIfNeeded(activePeer).then(() => {
          if (normalizePubkeyHex(state.dmActivePeerPubkey) === activePeer && isMessagesPageVisible()) {
            renderDmThread();
          }
        }).catch(() => {});
      }

      const npubText = formatNpubForDisplay(activePeer) || shortHex(activePeer);
      if (subEl) {
        if (verifiedNip05) subEl.textContent = verifiedNip05;
        else subEl.textContent = npubText;
      }
      if (avEl) {
        setAvatarEl(avEl, profile.picture || '', pickAvatar(activePeer));
        avEl.classList.toggle('nip05-square', !!verifiedNip05);
      }
      if (verifiedEl) verifiedEl.style.display = verifiedNip05 ? 'inline-flex' : 'none';
      if (bannerEl) {
        const bannerUrl = sanitizeMediaUrl(profile.banner || '');
        const applyBannerFallback = () => {
          bannerEl.innerHTML = '';
          bannerEl.classList.add('dm-peer-banner-fallback');
          const overlay = document.createElement('span');
          overlay.className = 'dm-peer-banner-overlay';
          bannerEl.appendChild(overlay);
        };
        bannerEl.style.backgroundImage = '';
        bannerEl.style.backgroundSize = '';
        bannerEl.style.backgroundPosition = '';
        bannerEl.innerHTML = '';
        bannerEl.textContent = '';
        bannerEl.classList.remove('dm-peer-banner-fallback');
        if (bannerUrl && isLikelyUrl(bannerUrl)) {
          const img = document.createElement('img');
          img.className = 'dm-peer-banner-img';
          img.src = bannerUrl;
          img.alt = 'profile banner';
          img.loading = 'lazy';
          img.referrerPolicy = 'no-referrer';
          img.decoding = 'async';
          img.onerror = () => {
            applyBannerFallback();
          };
          bannerEl.appendChild(img);
          const overlay = document.createElement('span');
          overlay.className = 'dm-peer-banner-overlay';
          bannerEl.appendChild(overlay);
        } else {
          applyBannerFallback();
        }
      }

      const openProfile = () => showProfileByPubkey(activePeer);
      if (bannerEl) { bannerEl.style.cursor = 'pointer'; bannerEl.onclick = openProfile; }
      if (avEl) { avEl.style.cursor = 'pointer'; avEl.onclick = openProfile; }
      if (titleEl) { titleEl.style.cursor = 'pointer'; titleEl.onclick = openProfile; }
      if (subEl) { subEl.style.cursor = 'pointer'; subEl.onclick = openProfile; }

      if (followBtn) {
        const own = !!(state.user && normalizePubkeyHex(state.user.pubkey) === activePeer);
        if (own) {
          followBtn.textContent = 'Following';
          followBtn.disabled = true;
          followBtn.classList.remove('following-active');
        } else {
          const following = isFollowingPubkey(activePeer);
          followBtn.textContent = following ? 'Following' : 'Follow';
          followBtn.disabled = !state.user;
          followBtn.classList.toggle('following-active', following);
        }
      }
      if (zapBtn) {
        const own = !!(state.user && normalizePubkeyHex(state.user.pubkey) === activePeer);
        zapBtn.disabled = !state.user || own;
      }
    } else {
      if (avEl) {
        avEl.classList.remove('nip05-square');
        avEl.innerHTML = '';
        avEl.textContent = '?';
      }
      if (verifiedEl) verifiedEl.style.display = 'none';
      if (bannerEl) {
        bannerEl.style.backgroundImage = '';
        bannerEl.style.backgroundSize = '';
        bannerEl.style.backgroundPosition = '';
        bannerEl.innerHTML = '';
        bannerEl.textContent = '';
        bannerEl.classList.add('dm-peer-banner-fallback');
        const overlay = document.createElement('span');
        overlay.className = 'dm-peer-banner-overlay';
        bannerEl.appendChild(overlay);
        bannerEl.style.cursor = 'default';
        bannerEl.onclick = null;
      }
      if (titleEl) { titleEl.style.cursor = 'default'; titleEl.onclick = null; }
      if (subEl) { subEl.style.cursor = 'default'; subEl.onclick = null; }
      if (avEl) { avEl.style.cursor = 'default'; avEl.onclick = null; }
      if (followBtn) {
        followBtn.textContent = 'Follow';
        followBtn.disabled = true;
        followBtn.classList.remove('following-active');
      }
      if (zapBtn) zapBtn.disabled = true;
    }

    if (composeInput) {
      composeInput.disabled = !hasPeer || !state.user || state.dmSendPending;
      composeInput.placeholder = hasPeer
        ? 'Write an encrypted message'
        : 'Choose a conversation first';
      const draft = hasPeer ? String(state.dmDraftByPeer.get(activePeer) || '') : '';
      if (document.activeElement !== composeInput) composeInput.value = draft;
    }
    if (sendBtn) {
      sendBtn.disabled = !hasPeer || !state.user || state.dmSendPending;
      sendBtn.textContent = state.dmSendPending ? 'Sending...' : 'Send DM';
    }
    if (attachBtn) attachBtn.disabled = !hasPeer || !state.user || state.dmSendPending;

    const priorHeight = Number(threadEl.scrollHeight || 0);
    const priorTop = Number(threadEl.scrollTop || 0);
    const nearBottom = (priorHeight - priorTop - threadEl.clientHeight) < 36;

    if (!hasPeer) {
      state.dmThreadVisibleLimitByPeer = new Map();
    } else if (opts.resetVisibleLimit) {
      state.dmThreadVisibleLimitByPeer.delete(activePeer);
    }

    threadEl.innerHTML = '';
    if (!hasPeer) {
      const empty = document.createElement('div');
      empty.className = 'dm-empty';
      empty.innerHTML = '<strong>Select a conversation</strong>Pick someone on the left or start a new DM by entering their npub, NIP-05, or hex pubkey.';
      threadEl.appendChild(empty);
      updateDmStatusUi();
      return;
    }

    const messages = state.dmMessagesByPeer.get(activePeer) || [];
    if (!messages.length) {
      const empty = document.createElement('div');
      empty.className = 'dm-empty';
      empty.innerHTML = `<strong>Start chatting with ${dmDisplayNameForPeer(activePeer)}</strong>Messages are encrypted before they are sent to relays.`;
      threadEl.appendChild(empty);
      updateDmStatusUi();
      return;
    }

    const storedLimit = Number(state.dmThreadVisibleLimitByPeer.get(activePeer) || 0);
    const defaultLimit = Math.min(DM_THREAD_INITIAL_LIMIT, messages.length);
    const visibleLimit = Math.min(messages.length, Math.max(defaultLimit, storedLimit || defaultLimit));
    state.dmThreadVisibleLimitByPeer.set(activePeer, visibleLimit);

    const reactionMessageIds = [];
    const fragment = document.createDocumentFragment();
    const visibleMessages = messages.slice(Math.max(0, messages.length - visibleLimit));
    visibleMessages.forEach((message) => {
      if (!message.decrypted && !message.decryptError && !state.dmDecryptPendingIds.has(message.id)) {
        queueDmDecrypt(message);
      }

      const row = document.createElement('article');
      row.className = `dm-msg${message.mine ? ' out' : ''}`;
      if (message.activity) row.classList.add('activity');
      row.dataset.msgId = String(message.id || '');

      const senderPubkey =
        normalizePubkeyHex(message.pubkey || '') ||
        (message.mine ? normalizePubkeyHex(state.user && state.user.pubkey || '') : activePeer) ||
        activePeer;
      if (senderPubkey && !state.profilesByPubkey.has(senderPubkey)) fetchProfileIfNeeded(senderPubkey);
      const senderProfile = profileFor(senderPubkey);
      const senderFallback = senderPubkey
        ? dmDisplayNameForPeer(senderPubkey)
        : (message.mine ? 'Me' : dmDisplayNameForPeer(activePeer));
      const senderName = String(senderProfile.display_name || senderProfile.name || senderFallback).trim() || senderFallback;

      const top = document.createElement('div');
      top.className = 'dm-msg-top';
      const who = document.createElement('div');
      who.className = 'dm-msg-who';
      const fromAv = document.createElement('div');
      fromAv.className = 'dm-msg-from-av';
      setAvatarEl(fromAv, senderProfile.picture || '', pickAvatar(senderPubkey));
      if (senderPubkey) {
        fromAv.style.cursor = 'pointer';
        fromAv.onclick = () => showProfileByPubkey(senderPubkey);
      }
      const from = document.createElement('span');
      from.className = 'dm-msg-from';
      from.textContent = senderName;
      if (senderPubkey) {
        from.style.cursor = 'pointer';
        from.onclick = () => showProfileByPubkey(senderPubkey);
      }
      who.appendChild(fromAv);
      who.appendChild(from);
      const stamp = document.createElement('span');
      stamp.className = 'dm-msg-time';
      stamp.textContent = `${formatChatTimestamp(message.created_at)} - ${formatTimeAgo(message.created_at)} ago`;
      top.appendChild(who);
      top.appendChild(stamp);
      row.appendChild(top);

      const body = document.createElement('div');
      body.className = 'dm-msg-body';
      if (message.decryptError) {
        body.textContent = 'Unable to decrypt this DM with the current signer.';
      } else if (!message.decrypted) {
        body.textContent = 'Decrypting encrypted message...';
      } else {
        const rawText = String(message.content || '');
        if (rawText.length > 2500) {
          body.textContent = rawText;
        } else {
          const allUrls = Array.from(new Set(
            extractHttpUrls(rawText)
              .map((u) => sanitizeMediaUrl(u))
              .filter(Boolean)
          ));
          const mediaItems = allUrls
            .map((url) => ({ url, kind: classifyMediaUrl(url) }))
            .filter((item) => item.kind === 'photo' || item.kind === 'video' || item.kind === 'audio');
          const mediaUrls = mediaItems.map((item) => item.url);
          const spotifyItems = extractSpotifyPreviewItems(allUrls);
          const spotifyUrls = spotifyItems.map((item) => item.sourceUrl);
          const urlsToStrip = Array.from(new Set([...mediaUrls, ...spotifyUrls]));
          const renderText = urlsToStrip.length ? stripMediaUrlsFromText(rawText, urlsToStrip) : rawText;
          if (String(renderText || '').trim()) body.appendChild(renderNostrContent(renderText));
          renderChatInlineMedia(body, mediaItems, {
            allowVideo: true,
            classPrefix: 'dm',
            maxItems: 2,
            videoAutoplay: false,
            videoMuted: false,
            videoLoop: false
          });
          renderSpotifyLinkPreviews(body, spotifyItems, { classPrefix: 'dm', maxItems: 1 });
          if (!String(renderText || '').trim() && !mediaItems.length && !spotifyItems.length) {
            body.textContent = '[empty message]';
          }
        }
      }
      row.appendChild(body);

      if (message.activity) {
        const lock = document.createElement('div');
        lock.className = 'dm-msg-lock';
        lock.textContent = 'Activity';
        row.appendChild(lock);
      } else {
        const reactions = document.createElement('div');
        reactions.className = 'dm-msg-reactions';

        const likeBtn = document.createElement('button');
        likeBtn.type = 'button';
        likeBtn.className = 'profile-comment-like-btn dm-like-btn';
        likeBtn.title = 'Like';
        likeBtn.innerHTML = '&#10084; <span class="dm-like-count">0</span>';
        likeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleDmLikeMessage(message.id);
        });
        reactions.appendChild(likeBtn);

        const emojiBtn = document.createElement('button');
        emojiBtn.type = 'button';
        emojiBtn.className = 'profile-comment-like-btn dm-emoji-add-btn';
        emojiBtn.title = 'Add emoji reaction';
        emojiBtn.textContent = '+';
        emojiBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (typeof window.openReactionPickerForDmMessage === 'function') {
            window.openReactionPickerForDmMessage(message.id);
          }
        });
        reactions.appendChild(emojiBtn);
        row.appendChild(reactions);

        const emojiBar = document.createElement('div');
        emojiBar.className = 'dm-msg-emoji-bar';
        row.appendChild(emojiBar);
      }

      fragment.appendChild(row);
      if (!message.activity) reactionMessageIds.push(message.id);
    });
    threadEl.appendChild(fragment);
    reactionMessageIds.forEach((messageId) => updateDmMessageReactionUi(messageId));

    if (opts.preserveScrollAnchor && Number.isFinite(opts.preserveScrollAnchor.prevHeight) && Number.isFinite(opts.preserveScrollAnchor.prevTop)) {
      const newHeight = Number(threadEl.scrollHeight || 0);
      threadEl.scrollTop = Math.max(0, newHeight - Number(opts.preserveScrollAnchor.prevHeight || 0) + Number(opts.preserveScrollAnchor.prevTop || 0));
    } else if (opts.scrollToBottom || nearBottom) {
      threadEl.scrollTop = threadEl.scrollHeight;
    }
    updateDmStatusUi();
  }

  function setActiveDmPeer(peerPubkey, opts = {}) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return;
    if (!state.dmMessagesByPeer.has(peer)) state.dmMessagesByPeer.set(peer, []);
    const changedPeer = normalizePubkeyHex(state.dmActivePeerPubkey) !== peer;
    state.dmActivePeerPubkey = peer;
    if (opts.markRead !== false) markDmPeerRead(peer);
    const shouldForceListRender = !!opts.forceListRender || !!state.dmSearchTerm;
    let patchedSelection = false;
    if (!shouldForceListRender && changedPeer) {
      const listEl = qs('#dmConvoList');
      if (listEl) {
        const escapedPeer = cssEscapeValue(peer);
        const prevActive = qs('.dm-convo.active', listEl);
        if (prevActive) prevActive.classList.remove('active');
        let nextActive = qs(`.dm-convo[data-peer="${escapedPeer}"]`, listEl);
        if (!nextActive) {
          nextActive = qsa('.dm-convo', listEl)
            .find((btn) => normalizePubkeyHex(btn && btn.dataset && btn.dataset.peer || '') === peer) || null;
        }
        if (nextActive) {
          nextActive.classList.add('active');
          const unreadBadge = qs('.dm-unread', nextActive);
          if (unreadBadge) {
            const unreadVal = Number((unreadBadge.textContent || '').trim() || 0);
            unreadBadge.remove();
            if (Number.isFinite(unreadVal) && unreadVal > 0) adjustDmUnreadSummaryCount(-unreadVal);
          }
          patchedSelection = true;
        }
      }
    }
    if (shouldForceListRender || !patchedSelection) renderDmConversationList();
    renderDmThread({
      scrollToBottom: !!opts.scrollToBottom,
      resetVisibleLimit: changedPeer || !!opts.resetVisibleLimit
    });
  }

  async function decryptDmContent(peerPubkey, ciphertext) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) throw new Error('Missing DM peer pubkey.');
    const payload = String(ciphertext || '');
    if (!payload) return '';

    if (state.authMode === 'nip07') {
      if (!window.nostr || !window.nostr.nip04 || typeof window.nostr.nip04.decrypt !== 'function') {
        throw new Error('Signer does not expose NIP-04 decrypt.');
      }
      return await window.nostr.nip04.decrypt(peer, payload);
    }

    if (state.authMode === 'local') {
      const tools = await ensureNostrTools();
      if (!tools || !tools.nip04 || typeof tools.nip04.decrypt !== 'function') {
        throw new Error('NIP-04 decrypt helpers are unavailable.');
      }
      const secret = normalizeSecretKey(state.localSecretKey);
      try {
        return await tools.nip04.decrypt(secret, peer, payload);
      } catch (_) {
        return await tools.nip04.decrypt(bytesToHex(secret), peer, payload);
      }
    }

    if (state.authMode === 'remote') {
      const plaintext = await requestRemoteSigner('nip04_decrypt', [peer, payload], {
        timeoutMs: REMOTE_SIGNER_REQUEST_TIMEOUT_MS,
        fallbackEncrypt: true
      });
      if (typeof plaintext !== 'string') {
        throw new Error('Remote signer returned an invalid decrypt response.');
      }
      return plaintext;
    }

    throw new Error('Login required for DM decryption.');
  }

  async function encryptDmContent(peerPubkey, plaintext) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) throw new Error('Missing DM recipient pubkey.');
    const clean = String(plaintext || '');

    if (state.authMode === 'nip07') {
      if (!window.nostr || !window.nostr.nip04 || typeof window.nostr.nip04.encrypt !== 'function') {
        throw new Error('Signer does not expose NIP-04 encrypt.');
      }
      return await window.nostr.nip04.encrypt(peer, clean);
    }

    if (state.authMode === 'local') {
      const tools = await ensureNostrTools();
      if (!tools || !tools.nip04 || typeof tools.nip04.encrypt !== 'function') {
        throw new Error('NIP-04 encrypt helpers are unavailable.');
      }
      const secret = normalizeSecretKey(state.localSecretKey);
      try {
        return await tools.nip04.encrypt(secret, peer, clean);
      } catch (_) {
        return await tools.nip04.encrypt(bytesToHex(secret), peer, clean);
      }
    }

    if (state.authMode === 'remote') {
      const ciphertext = await requestRemoteSigner('nip04_encrypt', [peer, clean], {
        timeoutMs: REMOTE_SIGNER_REQUEST_TIMEOUT_MS,
        fallbackEncrypt: true
      });
      if (typeof ciphertext !== 'string') {
        throw new Error('Remote signer returned an invalid encrypt response.');
      }
      return ciphertext;
    }

    throw new Error('Login required for encrypted DM sending.');
  }

  function pumpDmDecryptQueue() {
    while (state.dmDecryptWorkers < DM_DECRYPT_CONCURRENCY && state.dmDecryptQueue.length) {
      const message = state.dmDecryptQueue.shift();
      if (!message || !message.id) continue;
      state.dmDecryptWorkers += 1;

      decryptDmContent(message.peerPubkey, message.ciphertext)
        .then((plaintext) => {
          message.content = String(plaintext || '');
          message.decrypted = true;
          message.decryptError = false;
        })
        .catch(() => {
          message.content = '';
          message.decrypted = false;
          message.decryptError = true;
        })
        .finally(() => {
          state.dmDecryptWorkers = Math.max(0, Number(state.dmDecryptWorkers || 0) - 1);
          state.dmDecryptPendingIds.delete(message.id);
          if (isMessagesPageVisible()) {
            const activePeer = normalizePubkeyHex(state.dmActivePeerPubkey);
            const messagePeer = normalizePubkeyHex(message.peerPubkey);
            const queueSettled = !state.dmDecryptQueue.length && Number(state.dmDecryptWorkers || 0) === 0;
            scheduleDmRender({
              conversations: queueSettled,
              thread: !!(activePeer && messagePeer && activePeer === messagePeer)
            });
          }
          if (state.dmDecryptQueue.length) {
            setTimeout(pumpDmDecryptQueue, 0);
          }
        });
    }
  }

  function queueDmDecrypt(message) {
    if (!message || !message.id || state.dmDecryptPendingIds.has(message.id)) return;
    if (state.dmDecryptQueue.length >= DM_DECRYPT_QUEUE_SOFT_CAP) {
      const dropped = state.dmDecryptQueue.shift();
      if (dropped && dropped.id) state.dmDecryptPendingIds.delete(dropped.id);
    }
    state.dmDecryptPendingIds.add(message.id);
    state.dmDecryptQueue.push(message);
    pumpDmDecryptQueue();
  }

  function subscribeDirectMessages() {
    const owner = normalizePubkeyHex(state.dmOwnerPubkey || (state.user && state.user.pubkey) || '');
    if (!owner || !state.pool) return;

    teardownDmSubscription();
    state.dmSyncing = true;
    const nowSec = Math.floor(Date.now() / 1000);
    const oldestSince = Math.max(0, nowSec - DM_SYNC_LOOKBACK_SECONDS);
    const recentSince = Math.max(oldestSince, nowSec - DM_SYNC_RECENT_SECONDS);
    const expectedEose = Math.max(1, Number((state.pool.urls && state.pool.urls.length) || 1));
    const eoseSeen = new Set();
    let syncFinished = false;
    const finishSync = () => {
      if (syncFinished) return;
      syncFinished = true;
      state.dmSyncing = false;
      if (state.dmSyncEoseTimer) {
        clearTimeout(state.dmSyncEoseTimer);
        state.dmSyncEoseTimer = null;
      }
      setDmStatus('DM sync complete.', 'success');
      if (isMessagesPageVisible()) {
        scheduleDmRender({ conversations: true, thread: true });
      }
      if (!state.dmMessagesByPeer.size && oldestSince < recentSince) {
        state.dmBackfilling = true;
        startDmBackfillSubscription(owner, oldestSince, Math.max(oldestSince, recentSince - 1));
      }
    };
    state.dmSyncEoseTimer = setTimeout(finishSync, DM_SYNC_STATUS_TIMEOUT_MS);
    setDmStatus('Syncing encrypted DMs...', 'info');

    state.dmSubId = state.pool.subscribe(
      [
        { kinds: [KIND_DIRECT_MESSAGE], authors: [owner], since: recentSince, limit: DM_SYNC_LIMIT_PER_DIRECTION },
        { kinds: [KIND_DIRECT_MESSAGE], '#p': [owner], since: recentSince, limit: DM_SYNC_LIMIT_PER_DIRECTION }
      ],
      {
        event: (ev) => {
          const message = upsertDmMessageFromEvent(ev, owner);
          if (!message) return;

          if (!state.dmActivePeerPubkey) state.dmActivePeerPubkey = message.peerPubkey;
          fetchProfileIfNeeded(message.peerPubkey);
          const peerProfile = profileFor(message.peerPubkey);
          if (peerProfile && peerProfile.nip05) ensureNip05Verification(message.peerPubkey, peerProfile.nip05).catch(() => {});

          const isActivePeer = normalizePubkeyHex(state.dmActivePeerPubkey) === normalizePubkeyHex(message.peerPubkey);
          if (isActivePeer) queueDmDecrypt(message);

          if (isMessagesPageVisible()) {
            if (!message.mine && state.dmActivePeerPubkey === message.peerPubkey) markDmPeerRead(message.peerPubkey);
            scheduleDmRender({
              conversations: true,
              thread: state.dmActivePeerPubkey === message.peerPubkey,
              scrollToBottom: state.dmActivePeerPubkey === message.peerPubkey
            });
          }
        },
        eose: (relayUrl) => {
          const relayKey = relayUrl || `relay_${eoseSeen.size + 1}`;
          eoseSeen.add(String(relayKey));
          if (eoseSeen.size < expectedEose) return;
          finishSync();
        }
      }
    );
  }

  function startDmBackfillSubscription(ownerPubkey, since, until) {
    const owner = normalizePubkeyHex(ownerPubkey);
    if (!owner || !state.pool) return;
    if (state.dmBackfillSubId) return;
    state.dmBackfilling = true;

    let backfillDone = false;
    const finishBackfill = () => {
      if (backfillDone) return;
      backfillDone = true;
      state.dmBackfilling = false;
      const subId = state.dmBackfillSubId;
      state.dmBackfillSubId = null;
      if (subId && state.pool) {
        try { state.pool.unsubscribe(subId); } catch (_) {}
      }
      if (isMessagesPageVisible()) {
        scheduleDmRender({ conversations: true, thread: true });
      }
    };

    state.dmBackfillSubId = state.pool.subscribe(
      [
        { kinds: [KIND_DIRECT_MESSAGE], authors: [owner], since, until, limit: DM_BACKFILL_LIMIT_PER_DIRECTION },
        { kinds: [KIND_DIRECT_MESSAGE], '#p': [owner], since, until, limit: DM_BACKFILL_LIMIT_PER_DIRECTION }
      ],
      {
        event: (ev) => {
          const message = upsertDmMessageFromEvent(ev, owner);
          if (!message) return;
          if (!state.dmActivePeerPubkey) state.dmActivePeerPubkey = message.peerPubkey;
          fetchProfileIfNeeded(message.peerPubkey);
          if (isMessagesPageVisible()) {
            scheduleDmRender({ conversations: true, thread: false });
          }
        },
        eose: () => {
          finishBackfill();
        }
      }
    );

    setTimeout(finishBackfill, DM_SYNC_STATUS_TIMEOUT_MS + 3000);
  }

  function ensureMessagesSession(opts = {}) {
    const owner = normalizePubkeyHex(state.user && state.user.pubkey || '');
    if (!owner) {
      teardownDmSubscription();
      return;
    }

    if (state.dmOwnerPubkey !== owner) {
      teardownDmSubscription();
      state.dmOwnerPubkey = owner;
      state.dmMessagesByPeer = new Map();
      state.dmEventIds = new Set();
      state.dmDecryptPendingIds = new Set();
      state.dmActivePeerPubkey = '';
      state.dmDraftByPeer = new Map();
      state.dmSearchTerm = '';
      state.dmSendPending = false;
      state.dmLikedMessageIds = new Set();
      state.dmEmojiReactionsByMessageId = new Map();
      state.dmAddressBookOpen = false;
      state.dmThreadLastExpandAt = 0;
      state.dmListSelection = 'following';
      state.dmListActionPending = false;
      state.dmStatus = '';
      state.dmStatusMode = 'info';
      state.dmThreadVisibleLimitByPeer = new Map();
      state.dmDecryptQueue = [];
      state.dmDecryptWorkers = 0;
      state.dmSyncing = false;
      state.dmBackfilling = false;
      state.dmBackfillSubId = null;
      if (state.dmSyncEoseTimer) {
        clearTimeout(state.dmSyncEoseTimer);
        state.dmSyncEoseTimer = null;
      }
      state.dmRenderQueuedConversations = false;
      state.dmRenderQueuedThread = false;
      state.dmRenderScrollToBottom = false;
      loadDmLastReadForOwner(owner);
    }

    if (opts.subscribe !== false && !state.dmSubId) {
      subscribeDirectMessages();
    }
  }

  async function resolveDmRecipientToken(tokenInput) {
    let raw = String(tokenInput || '').trim();
    if (!raw) return '';
    raw = raw.replace(/^nostr:/i, '');
    const lower = raw.toLowerCase();

    const asHex = normalizePubkeyHex(raw);
    if (asHex) return asHex;

    const syncNpub = normalizePubkeyHex(parseNpubMaybe(lower));
    if (syncNpub) return syncNpub;

    if (/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) {
      return normalizePubkeyHex(await decodeNpubToPubkey(lower));
    }

    const nip05 = normalizeNip05Value(raw);
    if (nip05) {
      return normalizePubkeyHex(await resolveNip05ToPubkey(nip05));
    }

    if (/^nprofile1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) {
      try {
        const tools = await ensureNostrTools();
        if (!tools || !tools.nip19 || typeof tools.nip19.decode !== 'function') return '';
        const decoded = tools.nip19.decode(lower);
        if (decoded && decoded.type === 'nprofile' && decoded.data && decoded.data.pubkey) {
          return normalizePubkeyHex(decoded.data.pubkey);
        }
      } catch (_) {
        return '';
      }
    }

    return '';
  }

  function looksLikeDmRecipientToken(tokenInput) {
    const raw = String(tokenInput || '').trim();
    if (!raw) return false;
    const normalized = raw.replace(/^nostr:/i, '');
    const lower = normalized.toLowerCase();
    if (/^[0-9a-f]{64}$/i.test(normalized)) return true;
    if (/^npub1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) return true;
    if (/^nprofile1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(lower)) return true;
    return !!normalizeNip05Value(normalized);
  }

  async function startDmConversationWithInput(inputValue, opts = {}) {
    if (!state.user) {
      window.openLogin();
      return '';
    }

    const peer = await resolveDmRecipientToken(inputValue);
    if (!peer) {
      setDmStatus('Could not resolve that recipient. Use npub, NIP-05, nprofile, or hex pubkey.', 'error');
      return '';
    }

    if (peer === normalizePubkeyHex(state.user.pubkey)) {
      setDmStatus('You cannot open a DM with your own pubkey.', 'error');
      return '';
    }

    state.dmSearchTerm = '';
    if (!state.dmMessagesByPeer.has(peer)) state.dmMessagesByPeer.set(peer, []);
    fetchProfileIfNeeded(peer);
    setActiveDmPeer(peer, { scrollToBottom: true });
    setDmStatus('DM conversation ready.', 'success');

    const input = qs('#dmNewPeerInput');
    if (input && opts.clearInput !== false) input.value = '';
    const compose = qs('#dmComposeInput');
    if (compose && opts.focusComposer !== false) {
      try { compose.focus(); } catch (_) {}
    }
    return peer;
  }

  async function sendActiveDirectMessage() {
    if (state.dmSendPending) return;
    if (!state.user) {
      window.openLogin();
      return;
    }
    const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
    if (!peer) {
      setDmStatus('Select a conversation first.', 'error');
      return;
    }

    const compose = qs('#dmComposeInput');
    const text = String((compose && compose.value) || '').trim();
    if (!text) {
      setDmStatus('Message is empty.', 'error');
      return;
    }

    state.dmSendPending = true;
    renderDmThread();
    try {
      const ciphertext = await encryptDmContent(peer, text);
      const ev = await signAndPublish(KIND_DIRECT_MESSAGE, ciphertext, [['p', peer]]);

      const localMsg = {
        id: ev.id || `local_dm_${Date.now()}`,
        peerPubkey: peer,
        mine: true,
        pubkey: normalizePubkeyHex(state.user.pubkey) || '',
        created_at: Number(ev.created_at || Math.floor(Date.now() / 1000)),
        ciphertext: String(ev.content || ciphertext || ''),
        content: text,
        decrypted: true,
        decryptError: false
      };

      if (!state.dmEventIds.has(localMsg.id)) {
        state.dmEventIds.add(localMsg.id);
        const messages = state.dmMessagesByPeer.get(peer) || [];
        insertDmMessageSorted(messages, localMsg);
        capDmMessagesForPeer(peer, messages);
        state.dmMessagesByPeer.set(peer, messages);
      }

      state.dmDraftByPeer.set(peer, '');
      if (compose) compose.value = '';
      setDmStatus('Message sent.', 'success');
      setActiveDmPeer(peer, { scrollToBottom: true, markRead: true });
    } catch (err) {
      setDmStatus(err && err.message ? err.message : 'Failed to send DM.', 'error');
    } finally {
      state.dmSendPending = false;
      renderDmConversationList();
      renderDmThread();
    }
  }

  function appendLocalDmActivity(peerPubkey, text) {
    const peer = normalizePubkeyHex(peerPubkey);
    if (!peer) return null;
    const content = String(text || '').trim();
    if (!content) return null;
    const localId = `local_dm_activity_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const localMsg = {
      id: localId,
      peerPubkey: peer,
      mine: true,
      pubkey: normalizePubkeyHex(state.user && state.user.pubkey || '') || '',
      created_at: Math.floor(Date.now() / 1000),
      ciphertext: '',
      content,
      decrypted: true,
      decryptError: false,
      activity: true
    };
    if (!state.dmEventIds.has(localId)) {
      state.dmEventIds.add(localId);
      const messages = state.dmMessagesByPeer.get(peer) || [];
      insertDmMessageSorted(messages, localMsg);
      capDmMessagesForPeer(peer, messages);
      state.dmMessagesByPeer.set(peer, messages);
    }
    if (isMessagesPageVisible()) {
      const isActive = normalizePubkeyHex(state.dmActivePeerPubkey) === peer;
      scheduleDmRender({ conversations: true, thread: isActive, scrollToBottom: isActive });
    }
    return localMsg;
  }

  async function toggleFollowActiveDmPeer() {
    const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
    if (!peer) {
      setDmStatus('Select a conversation first.', 'error');
      return;
    }
    try {
      const next = await toggleFollowPubkey(peer, { silentErrors: true, skipProfileUi: true });
      if (next == null) return;
      setDmStatus(next ? 'Now following this account.' : 'Unfollowed this account.', 'success');
      renderDmThread();
    } catch (err) {
      setDmStatus(err && err.message ? err.message : 'Failed to update follow state.', 'error');
    }
  }

  async function zapActiveDmPeer(buttonEl = null) {
    const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
    if (!peer) {
      setDmStatus('Select a conversation first.', 'error');
      return;
    }
    if (!state.user) {
      window.openLogin();
      return;
    }
    if (normalizePubkeyHex(state.user.pubkey) === peer) {
      setDmStatus('You cannot zap your own account.', 'error');
      return;
    }

    const profile = profileFor(peer);
    const lud16 = String(profile.lud16 || '').trim();
    if (!lud16 || !lud16.includes('@')) {
      setDmStatus('This account has no Lightning address (lud16).', 'error');
      return;
    }

    const originalLabel = buttonEl ? buttonEl.textContent : '';
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Zapping...';
    }
    let paid = false;
    const zapAmountMsats = 21000;
    try {
      if (window.webln) {
        await window.webln.enable();
        const zapTags = [['relays', ...state.relays], ['amount', String(zapAmountMsats)], ['p', peer]];
        const zapRequest = await signAndPublish(9734, 'zap from Sifaka Live DM', zapTags);
        const [user, domain] = lud16.split('@');
        const meta = await fetch(`https://${domain}/.well-known/lnurlp/${user}`).then((r) => r.json());
        if (!meta.callback) throw new Error('Invalid LNURL response.');
        const invoiceData = await fetch(`${meta.callback}?amount=${zapAmountMsats}&nostr=${encodeURIComponent(JSON.stringify(zapRequest))}`).then((r) => r.json());
        if (!invoiceData.pr) throw new Error('No payment request returned.');
        await window.webln.sendPayment(invoiceData.pr);
        paid = true;
      }
    } catch (err) {
      if (window.console) console.warn('DM zap failed:', err && err.message ? err.message : err);
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = originalLabel || 'Zap';
      }
    }

    if (!paid) {
      window.open(`lightning:${lud16}`, '_blank');
      setDmStatus('Opened Lightning wallet to complete zap.', 'info');
      appendLocalDmActivity(peer, `⚡ Opened zap for ${dmDisplayNameForPeer(peer)} (${lud16})`);
      return;
    }

    setDmStatus('Zap sent.', 'success');
    appendLocalDmActivity(peer, `⚡ Zapped ${dmDisplayNameForPeer(peer)} with 21 sats`);
  }

  function openDmAttachModal() {
    const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
    if (!state.user) {
      window.openLogin();
      return;
    }
    if (!peer) {
      setDmStatus('Select a conversation first.', 'error');
      return;
    }
    if (typeof window.openComposeUploadModal === 'function') {
      window.openComposeUploadModal('dm');
      return;
    }
    setDmStatus('Upload modal is not available right now.', 'error');
  }

  function bindMessagesDomEvents(rootEl) {
    if (!rootEl || rootEl.dataset.dmBound === '1') return;
    rootEl.dataset.dmBound = '1';

    const newInput = qs('#dmNewPeerInput', rootEl);
    const newBtn = qs('#dmNewPeerBtn', rootEl);
    const listSelect = qs('#dmListSelect', rootEl);
    const listMembers = qs('#dmListMembers', rootEl);
    const listAddInput = qs('#dmListAddInput', rootEl);
    const listAddBtn = qs('#dmListAddBtn', rootEl);
    const listCreateBtn = qs('#dmListCreateBtn', rootEl);
    const listRenameBtn = qs('#dmListRenameBtn', rootEl);
    const listDeleteBtn = qs('#dmListDeleteBtn', rootEl);
    const listCreateInput = qs('#dmListCreateInput', rootEl);
    const listCreateSaveBtn = qs('#dmListCreateSaveBtn', rootEl);
    const listCreateCancelBtn = qs('#dmListCreateCancelBtn', rootEl);
    const listRenameInput = qs('#dmListRenameInput', rootEl);
    const listRenameSaveBtn = qs('#dmListRenameSaveBtn', rootEl);
    const listRenameCancelBtn = qs('#dmListRenameCancelBtn', rootEl);
    const convoList = qs('#dmConvoList', rootEl);
    const threadEl = qs('#dmThread', rootEl);
    const addressBookToggleBtn = qs('#dmAddressBookToggleBtn', rootEl);
    const compose = qs('#dmComposeInput', rootEl);
    const sendBtn = qs('#dmSendBtn', rootEl);
    const attachBtn = qs('#dmAttachBtn', rootEl);
    const followPeerBtn = qs('#dmFollowPeerBtn', rootEl);
    const zapPeerBtn = qs('#dmZapPeerBtn', rootEl);

    applyDmAddressBookVisibility(rootEl);

    if (newBtn) {
      newBtn.addEventListener('click', () => {
        startDmConversationWithInput(newInput && newInput.value || '', { clearInput: true, focusComposer: true });
      });
    }
    if (newInput) {
      newInput.addEventListener('input', (e) => {
        state.dmSearchTerm = String(e.target && e.target.value || '').trim().toLowerCase();
        renderDmConversationList();
      });
      newInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        const raw = String(newInput.value || '').trim();
        if (!looksLikeDmRecipientToken(raw)) return;
        e.preventDefault();
        startDmConversationWithInput(raw, { clearInput: true, focusComposer: true });
      });
    }

    if (listSelect) {
      listSelect.addEventListener('change', () => {
        state.dmListSelection = String(listSelect.value || '');
        setDmListEditorMode('');
        renderDmListPanel();
      });
    }

    if (listAddBtn) {
      listAddBtn.addEventListener('click', () => {
        handleDmAddToSelectedList();
      });
    }
    if (listAddInput) {
      listAddInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        handleDmAddToSelectedList();
      });
    }

    if (listCreateBtn) {
      listCreateBtn.addEventListener('click', () => {
        if (state.dmListActionPending) return;
        setDmListEditorMode('create');
      });
    }
    if (listCreateSaveBtn) {
      listCreateSaveBtn.addEventListener('click', async () => {
        if (state.dmListActionPending) return;
        const nextName = String(listCreateInput && listCreateInput.value || '').trim();
        if (!nextName) {
          setDmStatus('List name is required.', 'error');
          return;
        }
        try {
          await createDmPeopleList(nextName);
          setDmListEditorMode('');
          renderDmListPanel();
        } catch (err) {
          setDmStatus(err && err.message ? err.message : 'Failed to create list.', 'error');
        }
      });
    }
    if (listCreateInput) {
      listCreateInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (listCreateSaveBtn) listCreateSaveBtn.click();
      });
    }
    if (listCreateCancelBtn) {
      listCreateCancelBtn.addEventListener('click', () => {
        setDmListEditorMode('');
      });
    }

    if (listRenameBtn) {
      listRenameBtn.addEventListener('click', () => {
        if (state.dmListActionPending) return;
        const context = getDmSelectedListContext();
        if (!context || context.type !== 'nip51') return;
        setDmListEditorMode('rename');
      });
    }
    if (listRenameSaveBtn) {
      listRenameSaveBtn.addEventListener('click', async () => {
        if (state.dmListActionPending) return;
        const nextName = String(listRenameInput && listRenameInput.value || '').trim();
        if (!nextName) {
          setDmStatus('List name is required.', 'error');
          return;
        }
        try {
          await renameDmSelectedPeopleList(nextName);
          setDmListEditorMode('');
          renderDmListPanel();
        } catch (err) {
          setDmStatus(err && err.message ? err.message : 'Failed to rename list.', 'error');
        }
      });
    }
    if (listRenameInput) {
      listRenameInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (listRenameSaveBtn) listRenameSaveBtn.click();
      });
    }
    if (listRenameCancelBtn) {
      listRenameCancelBtn.addEventListener('click', () => {
        setDmListEditorMode('');
      });
    }

    if (listDeleteBtn) {
      listDeleteBtn.addEventListener('click', async () => {
        if (state.dmListActionPending) return;
        const context = getDmSelectedListContext();
        if (!context || context.type !== 'nip51') return;
        const msg = `Delete "${context.name}"? This removes the list from your NIP-51 lists and cannot be undone.`;
        if (!window.confirm(msg)) return;
        try {
          await deleteDmSelectedPeopleList();
          setDmListEditorMode('');
          renderDmListPanel();
        } catch (err) {
          setDmStatus(err && err.message ? err.message : 'Failed to delete list.', 'error');
        }
      });
    }

    if (listMembers) {
      listMembers.addEventListener('click', (e) => {
        const openBtn = e.target.closest('.dm-list-member-open');
        if (openBtn && openBtn.dataset && openBtn.dataset.peer) {
          const peer = normalizePubkeyHex(openBtn.dataset.peer);
          if (!peer) return;
          if (!state.dmMessagesByPeer.has(peer)) state.dmMessagesByPeer.set(peer, []);
          fetchProfileIfNeeded(peer);
          setActiveDmPeer(peer, { scrollToBottom: true, markRead: true });
          setDmStatus('Opened conversation from list member.', 'success');
          return;
        }

        const removeBtn = e.target.closest('.dm-list-member-remove');
        if (!removeBtn || !removeBtn.dataset || !removeBtn.dataset.peer) return;
        const peer = normalizePubkeyHex(removeBtn.dataset.peer);
        if (!peer) return;
        if (state.dmListActionPending) return;
        const context = getDmSelectedListContext();
        const listName = context && context.name ? context.name : 'this list';
        const confirmMsg = `Remove "${dmDisplayNameForPeer(peer)}" from ${listName}?`;
        if (!window.confirm(confirmMsg)) return;
        removePeerFromDmSelectedList(peer).catch((err) => {
          setDmStatus(err && err.message ? err.message : 'Failed to remove account from list.', 'error');
        });
      });
    }
    if (convoList) {
      convoList.addEventListener('click', (e) => {
        const btn = e.target.closest('.dm-convo');
        if (!btn || !btn.dataset || !btn.dataset.peer) return;
        setActiveDmPeer(btn.dataset.peer, { scrollToBottom: true, markRead: true });
      });
    }
    if (threadEl) {
      let scrollRaf = 0;
      threadEl.addEventListener('scroll', () => {
        if (scrollRaf) return;
        scrollRaf = window.requestAnimationFrame(() => {
          scrollRaf = 0;
          maybeLoadOlderDmMessagesForActiveThread(threadEl);
        });
      });
    }
    if (addressBookToggleBtn) {
      addressBookToggleBtn.addEventListener('click', () => {
        state.dmAddressBookOpen = !state.dmAddressBookOpen;
        applyDmAddressBookVisibility(rootEl);
        if (state.dmAddressBookOpen) renderDmListPanel();
      });
    }
    if (compose) {
      compose.addEventListener('input', (e) => {
        const peer = normalizePubkeyHex(state.dmActivePeerPubkey);
        if (!peer) return;
        state.dmDraftByPeer.set(peer, String(e.target && e.target.value || ''));
      });
      compose.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        sendActiveDirectMessage();
      });
    }
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        sendActiveDirectMessage();
      });
    }
    if (attachBtn) {
      attachBtn.addEventListener('click', () => {
        openDmAttachModal();
      });
    }
    if (followPeerBtn) {
      followPeerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFollowActiveDmPeer();
      });
    }
    if (zapPeerBtn) {
      zapPeerBtn.addEventListener('click', () => {
        zapActiveDmPeer(zapPeerBtn);
      });
    }
  }

  function renderMessagesPage(opts = {}) {
    const root = qs('#messagesRoot');
    if (!root) return;

    if (!state.user) {
      teardownDmSubscription();
      root.dataset.dmBound = '';
      root.dataset.dmReady = '';
      root.innerHTML = '<div class="dm-wrap"><div class="dm-panel dm-login-card"><strong>Login Required</strong>Sign in to read and send encrypted DMs.<br><br><button type="button" onclick="openLogin()">Login with Nostr</button></div></div>';
      return;
    }

    ensureMessagesSession({ subscribe: opts.subscribe !== false });

    if (!root.dataset.dmReady || opts.forceLayout) {
      root.innerHTML = `
        <div class="dm-wrap dm-address-book-closed" id="dmWrap">
          <section class="dm-panel dm-lists" id="dmListsPanel">
            <div class="dm-lists-head">
              <h2>Contacts & Lists</h2>
              <div class="dm-sub" id="dmListMeta">Create and manage your NIP-51 contact lists.</div>
              <div class="dm-list-select-row">
                <select id="dmListSelect" class="dm-contact-select" title="Select list">
                  <option value="following">Following (0)</option>
                </select>
              </div>
              <div class="dm-list-actions-row">
                <button id="dmListCreateBtn" type="button">New List</button>
                <button id="dmListRenameBtn" type="button">Rename</button>
                <button id="dmListDeleteBtn" type="button">Delete</button>
              </div>
              <div class="dm-list-edit-row" id="dmListCreateRow" style="display:none;">
                <input id="dmListCreateInput" type="text" placeholder="New list name">
                <button id="dmListCreateSaveBtn" type="button">Save</button>
                <button id="dmListCreateCancelBtn" type="button">Cancel</button>
              </div>
              <div class="dm-list-edit-row" id="dmListRenameRow" style="display:none;">
                <input id="dmListRenameInput" type="text" placeholder="Rename list">
                <button id="dmListRenameSaveBtn" type="button">Save</button>
                <button id="dmListRenameCancelBtn" type="button">Cancel</button>
              </div>
              <div class="dm-list-add-row">
                <input id="dmListAddInput" type="text" placeholder="Add by npub, nip-05, nprofile, or hex pubkey">
                <button id="dmListAddBtn" type="button">Add</button>
              </div>
            </div>
            <div class="dm-list-members" id="dmListMembers"></div>
          </section>
          <section class="dm-panel dm-side">
            <div class="dm-side-head">
              <div class="dm-side-title-row">
                <h2>Messages</h2>
                <div class="dm-sub dm-conv-inline" id="dmConvCount">0 conversations</div>
              </div>
              <span class="dm-status dm-status-pill dm-side-status" id="dmStatusText"></span>
              <div class="dm-new-row">
                <input id="dmNewPeerInput" type="text" placeholder="Search conversations or enter npub, nip-05, nprofile, or hex pubkey">
                <button id="dmNewPeerBtn" type="button">Open</button>
              </div>
            </div>
            <div class="dm-convo-list" id="dmConvoList"></div>
            <div class="dm-side-foot">
              <button id="dmAddressBookToggleBtn" type="button" class="btn btn-ghost">Address Book</button>
            </div>
          </section>
          <section class="dm-panel dm-main">
            <div class="dm-main-head">
              <div class="dm-main-title dm-main-title-rich">
                <div class="dm-peer-banner dm-peer-banner-fallback" id="dmThreadBanner"></div>
                <div class="dm-peer-row">
                  <div class="dm-peer-avatar" id="dmThreadAvatar">?</div>
                  <div class="dm-peer-meta">
                    <div class="dm-peer-name-row">
                      <h3 id="dmThreadTitle">Select a conversation</h3>
                      <span class="dm-verified-check" id="dmThreadVerified" style="display:none;">&#10003;</span>
                    </div>
                    <p id="dmThreadSub">Only you and the other person can read these DMs.</p>
                    <button id="dmFollowPeerBtn" type="button" class="btn btn-follow dm-peer-follow-link">Follow</button>
                  </div>
                </div>
              </div>
            </div>
            <div class="dm-thread" id="dmThread"></div>
            <div class="dm-compose">
              <textarea id="dmComposeInput" placeholder="Write an encrypted message"></textarea>
              <div class="dm-compose-foot">
                <div class="dm-main-action-row dm-compose-action-row">
                  <button id="dmSendBtn" type="button">Send DM</button>
                  <button id="dmAttachBtn" type="button">Attach</button>
                  <button id="dmZapPeerBtn" type="button" class="btn btn-zap">Zap</button>
                </div>
                <div class="nostr-markup-toolbar nostr-markup-toolbar-chat dm-markup-toolbar">
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','h1')">H1</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','h2')">H2</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','h3')">H3</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','bold')">B</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','italic')">I</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','strike')">S</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','ul')">UL</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','ol')">OL</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','quote')">"</button>
                  <button type="button" onclick="applyNostrMarkup('dmComposeInput','code')">&lt;/&gt;</button>
                </div>
              </div>
            </div>
          </section>
        </div>
      `;
      root.dataset.dmReady = '1';
      bindMessagesDomEvents(root);
    }

    const mergedInput = qs('#dmNewPeerInput', root);
    if (mergedInput && document.activeElement !== mergedInput && mergedInput.value !== state.dmSearchTerm) {
      mergedInput.value = state.dmSearchTerm;
    }
    renderDmContactSelect();
    renderDmConversationList();
    renderDmThread({ scrollToBottom: !!opts.scrollToBottom });
    updateDmStatusUi();
  }

  async function openMessagesWithPeer(peerToken, opts = {}) {
    const routeMode = opts.routeMode || 'push';
    if (window.showPage) window.showPage('messages', { routeMode });
    if (!peerToken) return '';
    return await startDmConversationWithInput(peerToken, { clearInput: true, focusComposer: true });
  }

  function parseProfile(ev) {
    const normalizedPubkey = normalizePubkeyHex(ev && ev.pubkey || '') || String(ev && ev.pubkey || '').trim().toLowerCase();
    const fallbackPubkey = normalizedPubkey || String(ev && ev.pubkey || '').trim();
    let obj = {};
    try {
      obj = JSON.parse(ev.content || '{}');
    } catch (_) {
      obj = {};
    }
    return {
      pubkey: normalizedPubkey,
      created_at: ev.created_at || 0,
      name: obj.display_name || obj.name || shortHex(fallbackPubkey),
      display_name: obj.display_name || '',
      username: obj.name || '',
      about: obj.about || '',
      picture: obj.picture || '',
      banner: obj.banner || '',
      website: obj.website || '',
      nip05: normalizeNip05Value(obj.nip05 || ''),
      lud16: obj.lud16 || '',
      twitter: obj.twitter || obj.x || '',
      github: obj.github || ''
    };
  }

  function parseKind30315StatusContent(ev) {
    if (!ev || Number(ev.kind || 0) !== KIND_PROFILE_STATUS) return '';
    return String(ev.content || '').trim().slice(0, 180);
  }

  function pickProfileStatusCandidate(pubkey, bestGeneral, bestAny) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return null;
    const candidate = bestGeneral || bestAny || null;
    if (!candidate) return null;
    if (normalizePubkeyHex(candidate.pubkey) !== key) return null;
    return candidate;
  }

  function renderProfileKind30315(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    const row = qs('#profKind30315Row');
    const val = qs('#profKind30315');
    const editRow = qs('#profKind30315Edit');
    const input = qs('#profKind30315Input');
    const saveBtn = qs('#profKind30315SaveBtn');

    const entry = key ? state.profileStatusByPubkey.get(key) : null;
    const statusText = (entry && entry.text ? String(entry.text) : '').trim();
    if (row) row.style.display = (key && statusText) ? 'flex' : 'none';
    if (val) val.textContent = statusText;

    const own = !!(key && state.user && normalizePubkeyHex(state.user.pubkey) === key);
    if (editRow) editRow.style.display = own ? 'flex' : 'none';
    if (input) {
      if (document.activeElement !== input) input.value = statusText;
      input.placeholder = 'Set status';
    }
    if (saveBtn) saveBtn.disabled = !own || !!state.profileStatusSavePending;
  }

  function getProfileStatusText(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return '';
    const entry = state.profileStatusByPubkey.get(key);
    return entry && entry.text ? String(entry.text).trim() : '';
  }

  function subscribeProfileStatus(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    if (state.profileStatusSubId && state.pool) {
      state.pool.unsubscribe(state.profileStatusSubId);
    }
    state.profileStatusSubId = null;
    if (!key || !state.pool) {
      renderProfileKind30315('');
      return;
    }

    let bestGeneral = null;
    let bestAny = null;
    const applyBest = () => {
      const candidate = pickProfileStatusCandidate(key, bestGeneral, bestAny);
      if (candidate) {
        state.profileStatusByPubkey.set(key, {
          text: parseKind30315StatusContent(candidate),
          created_at: Number(candidate.created_at || 0),
          id: candidate.id || ''
        });
      } else if (!state.profileStatusByPubkey.has(key)) {
        state.profileStatusByPubkey.set(key, { text: '', created_at: 0, id: '' });
      }
      if (normalizePubkeyHex(state.selectedProfilePubkey) === key) {
        renderProfileKind30315(key);
        renderProfileFeed(key);
      }
    };

    state.profileStatusSubId = state.pool.subscribe(
      [
        { kinds: [KIND_PROFILE_STATUS], authors: [key], '#d': ['general'], limit: 20 },
        { kinds: [KIND_PROFILE_STATUS], authors: [key], limit: 20 }
      ],
      {
        event: (ev) => {
          if (!ev || Number(ev.kind || 0) !== KIND_PROFILE_STATUS) return;
          if (normalizePubkeyHex(ev.pubkey) !== key) return;
          const ts = Number(ev.created_at || 0);
          if (!bestAny || ts >= Number(bestAny.created_at || 0)) bestAny = ev;
          const d = String(firstTagValue(ev.tags, 'd') || '').trim().toLowerCase();
          if ((d === 'general' || !d) && (!bestGeneral || ts >= Number(bestGeneral.created_at || 0))) {
            bestGeneral = ev;
          }
          applyBest();
        },
        eose: () => {
          applyBest();
        }
      }
    );
  }

  async function signEvent(kind, content, tags, opts = {}) {
    if (!state.user) {
      throw new Error('You are in read-only mode. Login to sign events.');
    }

    const createdAt = Number(opts.createdAt || Math.floor(Date.now() / 1000));
    const unsigned = {
      kind,
      created_at: createdAt,
      tags: Array.isArray(tags) ? tags : [],
      content: String(content || '')
    };

    let signed;

    if (state.authMode === 'nip07') {
      if (!window.nostr) throw new Error('NIP-07 signer not available.');
      const nip07Payload = { ...unsigned, pubkey: state.user.pubkey };
      if (typeof window.nostr.signEvent === 'function') {
        signed = await window.nostr.signEvent(nip07Payload);
      } else if (typeof window.nostr.finalizeEvent === 'function') {
        signed = await window.nostr.finalizeEvent(nip07Payload);
      } else {
        throw new Error('Signer does not support signEvent/finalizeEvent.');
      }
    } else if (state.authMode === 'remote') {
      const remotePayload = { ...unsigned, pubkey: state.user.pubkey };
      const response = await requestRemoteSigner('sign_event', [remotePayload], {
        timeoutMs: REMOTE_SIGNER_REQUEST_TIMEOUT_MS,
        fallbackEncrypt: true
      });
      let parsed = null;
      if (typeof response === 'string') {
        try {
          parsed = JSON.parse(response);
        } catch (_) {
          parsed = null;
        }
      } else if (response && typeof response === 'object') {
        parsed = response;
      }
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Remote signer returned an invalid signature payload.');
      }
      const expectedPubkey = normalizePubkeyHex(state.user && state.user.pubkey || '');
      const signedPubkey = normalizePubkeyHex(parsed.pubkey || '');
      if (signedPubkey && expectedPubkey && signedPubkey !== expectedPubkey) {
        throw new Error('Remote signer returned a signature for a different pubkey.');
      }
      if (!parsed.id || !parsed.sig) {
        throw new Error('Remote signer returned an incomplete signed event.');
      }
      signed = parsed;
    } else if (state.authMode === 'local') {
      const tools = await ensureNostrTools();
      const secret = normalizeSecretKey(state.localSecretKey);
      if (typeof tools.finalizeEvent === 'function') {
        signed = tools.finalizeEvent(unsigned, secret);
      } else {
        const legacy = { ...unsigned, pubkey: tools.getPublicKey(secret) };
        if (typeof tools.getEventHash === 'function') legacy.id = tools.getEventHash(legacy);
        if (typeof tools.signEvent === 'function') {
          legacy.sig = tools.signEvent(legacy, bytesToHex(secret));
        }
        signed = legacy;
      }
    } else {
      throw new Error('You are in read-only mode. Login with extension, remote signer, or nsec key first.');
    }

    return signed;
  }

  async function signAndPublish(kind, content, tags) {
    const signed = await signEvent(kind, content, tags);
    const sent = state.pool.publish(signed);
    if (sent === 0) throw new Error('No relay connections are currently open.');
    return signed;
  }

  function isLikelyPlayableStreamUrl(url) {
    const clean = sanitizeMediaUrl(url || '');
    if (!clean || !/^https?:\/\//i.test(clean)) return false;
    if (isLikelyHlsStreamUrl(clean)) return true;
    if (isDirectFileVideoUrl(clean)) return true;
    return classifyMediaUrl(clean) === 'video';
  }

  function mergeIncomingStream(existing, incoming) {
    if (!existing) return incoming;
    const merged = { ...existing, ...incoming };

    const existingUrl = sanitizeMediaUrl((existing && existing.streaming) || '');
    const incomingUrl = sanitizeMediaUrl((incoming && incoming.streaming) || '');
    if (!incomingUrl) {
      merged.streaming = existingUrl;
    } else if (!isLikelyPlayableStreamUrl(incomingUrl) && isLikelyPlayableStreamUrl(existingUrl)) {
      // Do not downgrade a known-good playable URL to a likely non-playable one.
      merged.streaming = existingUrl;
    } else {
      merged.streaming = incomingUrl;
    }

    if (!sanitizeMediaUrl((incoming && incoming.image) || '')) {
      merged.image = sanitizeMediaUrl((existing && existing.image) || '');
    }

    if (!String((incoming && incoming.title) || '').trim()) {
      merged.title = String((existing && existing.title) || '');
    }
    if (!String((incoming && incoming.summary) || '').trim()) {
      merged.summary = String((existing && existing.summary) || '');
    }
    if (!String((incoming && incoming.status) || '').trim()) {
      merged.status = String((existing && existing.status) || '');
    }

    if (!String((incoming && incoming.hostPubkey) || '').trim()) {
      merged.hostPubkey = String((existing && existing.hostPubkey) || (merged.pubkey || ''));
    }
    if ((incoming && incoming.platformPubkey) == null && existing && existing.platformPubkey) {
      merged.platformPubkey = existing.platformPubkey;
    }

    return merged;
  }

  function relayHostLabel(url) {
    try {
      const parsed = new URL(String(url || '').trim());
      return parsed.host || String(url || '').trim();
    } catch (_) {
      return String(url || '').trim();
    }
  }

  function renderGoLiveRelayDetails() {
    const list = qs('#goLiveRelayDetailList');
    if (!list) return;
    list.innerHTML = '';

    const pool = state.pool;
    const relays = Array.isArray(state.relays) ? state.relays : [];
    if (!relays.length) {
      list.innerHTML = '<div class="go-live-relay-row"><span class="go-live-relay-dot"></span><span class="go-live-relay-url">No relays configured</span><span class="go-live-relay-ping">n/a</span></div>';
      return;
    }

    relays.forEach((url) => {
      const row = document.createElement('div');
      row.className = 'go-live-relay-row';

      const dot = document.createElement('span');
      dot.className = 'go-live-relay-dot';

      const relay = document.createElement('span');
      relay.className = 'go-live-relay-url';
      relay.textContent = relayHostLabel(url);
      relay.title = url;

      const ping = document.createElement('span');
      ping.className = 'go-live-relay-ping';

      const ws = pool ? pool.sockets.get(url) : null;
      const isOpen = !!(ws && ws.readyState === WebSocket.OPEN);
      if (isOpen) row.classList.add('open');

      const pingMs = Number(state.relayPingMsByUrl.get(url));
      if (isOpen && Number.isFinite(pingMs) && pingMs > 0) {
        ping.textContent = `${Math.round(pingMs)}ms`;
      } else if (isOpen) {
        ping.textContent = 'n/a';
      } else {
        ping.textContent = '--';
      }

      row.appendChild(dot);
      row.appendChild(relay);
      row.appendChild(ping);
      list.appendChild(row);
    });
  }

  function updateRelayBar() {
    const bars = [qs('#relayBar'), qs('#myStreamsRelayBar')].filter(Boolean);
    if (!bars.length) return;
    let open = 0;
    let pingSum = 0;
    let pingCount = 0;
    state.relays.forEach((url) => {
      const ws = state.pool ? state.pool.sockets.get(url) : null;
      const isOpen = !!(ws && ws.readyState === WebSocket.OPEN);
      if (isOpen) open += 1;
      const pingMs = Number(state.relayPingMsByUrl.get(url));
      if (isOpen && Number.isFinite(pingMs) && pingMs > 0) {
        pingSum += pingMs;
        pingCount += 1;
      }
    });
    const avgPing = pingCount ? Math.round(pingSum / pingCount) : null;
    const text = `Connected relays: ${open}/${state.relays.length} (${state.relays.join(' | ')})${avgPing != null ? ` | Avg ping: ${avgPing}ms` : ''}`;
    bars.forEach((bar) => {
      bar.textContent = text;
    });
    renderGoLiveRelayDetails();
  }

  function upsertStream(stream) {
    const existing = state.streamsByAddress.get(stream.address);
    const incoming = mergeIncomingStream(existing, stream);
    const existingCreatedAt = Number(existing && existing.created_at || 0);
    const incomingCreatedAt = Number(incoming && incoming.created_at || 0);
    const existingId = String(existing && existing.id || '').trim();
    const incomingId = String(incoming && incoming.id || '').trim();
    const existingStatus = normalizeStreamStatus(existing && existing.status);
    const incomingStatus = normalizeStreamStatus(incoming && incoming.status);
    const existingUrl = sanitizeMediaUrl(existing && existing.streaming || '');
    const incomingUrl = sanitizeMediaUrl(incoming && incoming.streaming || '');
    const sameCoreEvent = !!existing
      && existingCreatedAt === incomingCreatedAt
      && existingId === incomingId
      && existingStatus === incomingStatus
      && existingUrl === incomingUrl
      && String(existing.title || '') === String(incoming.title || '')
      && String(existing.summary || '') === String(incoming.summary || '')
      && Number(existing.participants || 0) === Number(incoming.participants || 0)
      && sanitizeMediaUrl(existing.image || '') === sanitizeMediaUrl(incoming.image || '');

    let didStore = false;
    if (!existing || incomingCreatedAt > existingCreatedAt || (incomingCreatedAt === existingCreatedAt && !sameCoreEvent)) {
      state.streamsByAddress.set(incoming.address, incoming);
      schedulePersistLiveStreamsCache();
      didStore = true;
    }
    if (didStore && isStreamPlaybackOffline(incoming.address)) {
      const metadataUpdated = incomingCreatedAt > existingCreatedAt
        || incomingStatus !== existingStatus
        || incomingUrl !== existingUrl;
      if (metadataUpdated || incomingStatus === 'ended') {
        markStreamPlaybackOnline(incoming.address);
      }
    }
    if (state.selectedStreamAddress === incoming.address) {
      const selected = state.streamsByAddress.get(incoming.address) || existing || incoming;
      const status = normalizeStreamStatus(selected.status);
      const ownPubkey = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
      const streamPubkey = normalizePubkeyHex(selected.pubkey);
      const isOwnStream = !!ownPubkey && ownPubkey === streamPubkey;
      const isWatchingSelected = isVideoPageVisible();

      if (status === 'ended' && !isOwnStream && isWatchingSelected && didStore) {
        renderVideo(selected);
      } else if (isWatchingSelected && didStore) {
        renderVideo(selected);
      }
    }
    updateGoLiveButtonState();
  }

  function normalizeStreamStatus(status) {
    const raw = String(status || '').toLowerCase();
    if (raw.includes('ended')) return 'ended';
    if (raw.includes('planned')) return 'planned';
    return 'live';
  }

  function ownManageableStreams() {
    if (!state.user) return [];
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return [];
    return Array.from(state.streamsByAddress.values())
      .filter((s) => normalizePubkeyHex(s.pubkey) === own)
      .filter((s) => !state.goLiveHiddenEndedAddresses.has(s.address))
      .sort((a, b) => {
        const rank = (stream) => {
          const st = normalizeStreamStatus(stream.status);
          if (st === 'live') return 0;
          if (st === 'planned') return 1;
          return 2;
        };
        const r = rank(a) - rank(b);
        if (r) return r;
        return (b.created_at || 0) - (a.created_at || 0);
      });
  }

  function setGoLiveStatusSelection(statusValue) {
    const normalized = normalizeStreamStatus(statusValue);
    const row = qs('#goLiveStatusRow') || qs('#goLiveModal .srow') || qs('.srow');
    if (!row) return;
    const buttons = qsa('.sc', row);
    buttons.forEach((btn) => btn.classList.remove('sl'));
    const target = buttons.find((btn) => normalizeStreamStatus(btn.textContent) === normalized) || buttons[0];
    if (target) target.classList.add('sl');
    updateGoLiveStartsVisibility();
  }

  function populateGoLiveFormFromStream(stream) {
    const dTagInput = qs('#goLiveDTag');
    const titleInput = qs('#goLiveTitle');
    const summaryInput = qs('#goLiveSummary');
    const streamUrlInput = qs('#goLiveStreamUrl');
    const thumbInput = qs('#goLiveThumb');
    const startsInput = qs('#goLiveStarts');
    const eventIdInput = qs('#goLiveEventId');

    if (dTagInput) dTagInput.value = stream ? (stream.d || '') : '';
    if (titleInput) titleInput.value = stream ? (stream.title || '') : '';
    if (summaryInput) summaryInput.value = stream ? (stream.summary || '') : '';
    if (streamUrlInput) streamUrlInput.value = stream ? (stream.streaming || '') : '';
    if (thumbInput) thumbInput.value = stream ? (stream.image || '') : '';
    if (startsInput) startsInput.value = stream && stream.starts ? fromUnixSeconds(stream.starts) : '';
    if (eventIdInput) eventIdInput.value = stream && stream.id ? stream.id : '';
    setGoLiveStatusSelection(stream ? stream.status : 'live');
    updateGoLiveThumbPreview();
    scheduleGoLiveStreamPreview(120);
  }

  function resetGoLiveFormDefaults() {
    populateGoLiveFormFromStream(null);
    const dtag = qs('#goLiveDTag');
    if (dtag && !dtag.value.trim()) dtag.value = `stream-${Date.now()}`;
    const starts = qs('#goLiveStarts');
    if (starts && !starts.value) starts.value = fromUnixSeconds(Math.floor(Date.now() / 1000));
    const title = qs('#goLiveTitle');
    if (title && !title.value.trim()) title.value = 'Untitled stream';
  }

  function generateGoLiveDTag() {
    return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function setGoLiveCreateModeFieldVisibility(isCreateMode) {
    const dTagWrap = qs('#goLiveDTagWrap');
    const eventIdWrap = qs('#goLiveEventIdWrap');
    if (dTagWrap) dTagWrap.style.display = isCreateMode ? 'none' : 'flex';
    if (eventIdWrap) eventIdWrap.style.display = isCreateMode ? 'none' : 'flex';
  }

  function updateGoLiveStartsVisibility() {
    const startsWrap = qs('#goLiveStartsWrap');
    if (!startsWrap) return;
    const selected = qs('#goLiveStatusRow .sc.sl') || qs('#goLiveModal .srow .sc.sl');
    const status = normalizeStreamStatus(selected ? selected.textContent : 'live');
    startsWrap.style.display = status === 'planned' ? 'flex' : 'none';
  }

  function updateGoLiveThumbPreview() {
    const wrap = qs('#goLiveThumbPreviewWrap');
    const img = qs('#goLiveThumbPreviewImg');
    const empty = qs('#goLiveThumbPreviewEmpty');
    if (!wrap || !img || !empty) return;

    const raw = sanitizeMediaUrl((qs('#goLiveThumb') && qs('#goLiveThumb').value) || '');
    if (raw && isLikelyUrl(raw)) {
      img.style.display = 'block';
      empty.style.display = 'none';
      img.src = raw;
    } else {
      img.style.display = 'none';
      empty.style.display = 'block';
      img.removeAttribute('src');
    }
  }

  function clearGoLiveStreamPreview() {
    if (state.goLivePreviewTimer) {
      clearTimeout(state.goLivePreviewTimer);
      state.goLivePreviewTimer = null;
    }
    if (state.goLivePreviewHls) {
      try { state.goLivePreviewHls.destroy(); } catch (_) {}
      state.goLivePreviewHls = null;
    }
    const video = qs('#goLiveStreamPreviewVideo');
    if (video) {
      try { video.pause(); } catch (_) {}
      try {
        video.removeAttribute('src');
        video.load();
      } catch (_) {}
    }
  }

  async function updateGoLiveStreamPreview(token) {
    const video = qs('#goLiveStreamPreviewVideo');
    const status = qs('#goLiveStreamPreviewStatus');
    if (!video || !status) return;

    const modal = qs('#goLiveModal');
    const isModalOpen = !!(modal && modal.classList.contains('open'));
    if (!isModalOpen || state.goLiveHostMode !== 'self') {
      clearGoLiveStreamPreview();
      status.textContent = 'Enter a streaming URL to preview.';
      return;
    }

    if (token !== state.goLivePreviewToken) return;
    clearGoLiveStreamPreview();
    if (token !== state.goLivePreviewToken) return;

    const raw = sanitizeMediaUrl((qs('#goLiveStreamUrl') && qs('#goLiveStreamUrl').value) || '');
    if (!raw || !isLikelyUrl(raw)) {
      status.textContent = 'Enter a streaming URL to preview.';
      return;
    }
    status.textContent = 'Loading preview...';

    try {
      if (isLikelyHlsStreamUrl(raw) && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const Hls = await ensureHlsJs();
        if (token !== state.goLivePreviewToken) return;
        if (!Hls || typeof Hls.isSupported !== 'function' || !Hls.isSupported()) {
          status.textContent = 'This browser cannot preview this HLS URL.';
          return;
        }
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 6,
          liveSyncDurationCount: 2
        });
        state.goLivePreviewHls = hls;
        hls.loadSource(raw);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (token !== state.goLivePreviewToken) return;
          status.textContent = 'Live preview';
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (token !== state.goLivePreviewToken) return;
          if (data && data.fatal) status.textContent = 'Preview error. Check stream URL.';
        });
        return;
      }

      video.src = raw;
      video.addEventListener('loadedmetadata', () => {
        if (token !== state.goLivePreviewToken) return;
        status.textContent = 'Live preview';
      }, { once: true });
      video.addEventListener('error', () => {
        if (token !== state.goLivePreviewToken) return;
        status.textContent = 'Could not load preview from this URL.';
      }, { once: true });
      await video.play().catch(() => {});
    } catch (_) {
      if (token !== state.goLivePreviewToken) return;
      status.textContent = 'Could not load preview from this URL.';
    }
  }

  function scheduleGoLiveStreamPreview(delayMs = 260) {
    if (state.goLivePreviewTimer) {
      clearTimeout(state.goLivePreviewTimer);
      state.goLivePreviewTimer = null;
    }
    state.goLivePreviewToken += 1;
    const token = state.goLivePreviewToken;
    state.goLivePreviewTimer = setTimeout(() => {
      updateGoLiveStreamPreview(token).catch(() => {});
    }, Math.max(0, Number(delayMs) || 0));
  }

  function setGoLiveRelaysPanelOpen(open) {
    state.goLiveRelaysOpen = !!open;
    const col = qs('#goLiveRelayCol');
    const btn = qs('#goLiveRelaysToggleBtn');
    const grid = qs('#goLiveCreateGrid');
    if (col) col.style.display = state.goLiveRelaysOpen ? 'flex' : 'none';
    if (btn) btn.classList.toggle('on', state.goLiveRelaysOpen);
    if (grid) grid.classList.toggle('relays-open', state.goLiveRelaysOpen);
    if (state.goLiveRelaysOpen) updateRelayBar();
  }

  function clearGoLiveFormForNewStream() {
    const dtag = qs('#goLiveDTag');
    const title = qs('#goLiveTitle');
    const summary = qs('#goLiveSummary');
    const streamUrl = qs('#goLiveStreamUrl');
    const thumb = qs('#goLiveThumb');
    const starts = qs('#goLiveStarts');
    const eventId = qs('#goLiveEventId');
    if (dtag) dtag.value = generateGoLiveDTag();
    if (title) title.value = '';
    if (summary) summary.value = '';
    if (streamUrl) streamUrl.value = '';
    if (thumb) thumb.value = '';
    if (starts) starts.value = '';
    if (eventId) eventId.value = '';
    setGoLiveStatusSelection('live');
    updateGoLiveThumbPreview();
    scheduleGoLiveStreamPreview(120);
  }

  function setGoLiveSelfHostControlsEnabled(enabled) {
    const fieldSelectors = [
      '#goLiveStreamSelect',
      '#goLiveLoadTemplateBtn',
      '#goLiveDTag',
      '#goLiveTitle',
      '#goLiveSummary',
      '#goLiveStreamUrl',
      '#goLiveThumb',
      '#goLiveStarts',
      '#goLiveRelaysToggleBtn'
    ];
    fieldSelectors.forEach((sel) => {
      const el = qs(sel);
      if (!el) return;
      if ('disabled' in el) el.disabled = !enabled;
    });

    qsa('#goLiveModal .srow .sc').forEach((btn) => {
      btn.disabled = !enabled;
    });

    const publishBtn = qs('#goLivePublishBtn');
    if (publishBtn) publishBtn.disabled = !enabled;
    const removeBtn = qs('#goLiveRemoveBtn');
    if (removeBtn) removeBtn.disabled = !enabled;
  }

  function applyGoLiveHostModeUi(mode) {
    const normalized = mode === 'third-party' ? 'third-party' : 'self';
    state.goLiveHostMode = normalized;
    state.goLiveThirdPartyProvider = '';
    const selfBtn = qs('#goLiveHostSelfBtn');
    const thirdBtn = qs('#goLiveHostThirdPartyBtn');
    const selfWrap = qs('#goLiveSelfWrap');
    const thirdWrap = qs('#goLiveThirdPartyWrap');
    const relaysBtn = qs('#goLiveRelaysToggleBtn');
    if (selfBtn) selfBtn.classList.toggle('on', normalized === 'self');
    if (thirdBtn) thirdBtn.classList.toggle('on', normalized === 'third-party');

    const note = qs('#goLiveHostNote');
    const publishBtn = qs('#goLivePublishBtn');
    const thirdPartyHelp = qs('#goLiveThirdPartyHelp');
    qsa('#goLiveThirdPartyWrap .go-live-third-party-btn').forEach((btn) => btn.classList.remove('on'));
    if (normalized === 'third-party') {
      if (note) note.textContent = 'Host via 3rd party is coming soon.';
      if (selfWrap) selfWrap.style.display = 'none';
      if (thirdWrap) thirdWrap.style.display = 'block';
      if (thirdPartyHelp) thirdPartyHelp.textContent = 'Choose a provider. Direct launch integration is coming soon.';
      setGoLiveSelfHostControlsEnabled(false);
      setGoLiveRelaysPanelOpen(false);
      if (relaysBtn) relaysBtn.style.display = 'none';
      if (publishBtn) publishBtn.textContent = 'Coming Soon';
      clearGoLiveStreamPreview();
      return;
    }

    if (note) note.textContent = 'Self host uses your own HLS/RTMP streaming URL.';
    if (selfWrap) selfWrap.style.display = 'block';
    if (thirdWrap) thirdWrap.style.display = 'none';
    if (relaysBtn) relaysBtn.style.display = 'inline-flex';
    setGoLiveSelfHostControlsEnabled(true);
    if (publishBtn) {
      if (state.goLiveForceNew) {
        publishBtn.textContent = 'Go Live Now';
      } else {
        const selected = (state.goLiveSelectedAddress || '').trim();
        const stream = selected ? state.streamsByAddress.get(selected) : null;
        const status = normalizeStreamStatus(stream && stream.status || 'planned');
        publishBtn.textContent = stream ? (status === 'live' ? 'Save Live Update' : 'Save Stream Update') : 'Go Live Now';
      }
    }
    updateGoLiveStartsVisibility();
    updateGoLiveThumbPreview();
    scheduleGoLiveStreamPreview(120);
  }

  function refreshGoLiveTemplateSelector() {
    const selector = qs('#goLiveStreamSelect');
    const streams = ownStreamsForTemplate();
    if (!selector) return streams;

    selector.innerHTML = '';
    if (!streams.length) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No previous streams yet';
      selector.appendChild(emptyOpt);
      selector.disabled = true;
      state.goLiveTemplateAddress = '';
      return streams;
    }

    streams.forEach((stream) => {
      const opt = document.createElement('option');
      const statusLabel = normalizeStreamStatus(stream.status).toUpperCase();
      const title = (stream.title || 'Untitled stream').slice(0, 64);
      opt.value = stream.address;
      opt.textContent = `${statusLabel} - ${title}`;
      selector.appendChild(opt);
    });

    const preferred = streams.some((stream) => stream.address === state.goLiveTemplateAddress)
      ? state.goLiveTemplateAddress
      : streams[0].address;
    selector.value = preferred;
    selector.disabled = false;
    state.goLiveTemplateAddress = preferred;
    return streams;
  }

  function configureGoLiveModalForNewStream() {
    state.goLiveForceNew = true;
    state.goLiveSelectedAddress = '';
    state.goLiveTemplateAddress = '';
    state.goLiveRelaysOpen = false;

    const modalTitle = qs('#goLiveModalTitle');
    const modalSub = qs('#goLiveModalSub');
    const manageWrap = qs('#goLiveManageWrap');
    const manageLabel = qs('#goLiveManageLabel');
    const manageHint = qs('#goLiveManageHint');
    const loadTemplateBtn = qs('#goLiveLoadTemplateBtn');
    const publishBtn = qs('#goLivePublishBtn');
    const removeBtn = qs('#goLiveRemoveBtn');

    if (modalTitle) modalTitle.innerHTML = '<span class="mi"></span>Create Stream';
    if (modalSub) modalSub.textContent = 'Create a new stream event. Start from a blank template or load details from a previous stream.';

    clearGoLiveFormForNewStream();
    const streams = refreshGoLiveTemplateSelector();

    if (manageLabel) manageLabel.textContent = 'Grab Old Stream Details';
    if (manageWrap) manageWrap.classList.toggle('on', streams.length > 0);
    if (manageHint) {
      manageHint.textContent = streams.length
        ? 'Pick a previous stream and click Use Old Details.'
        : 'No previous streams found yet. Fill in details below.';
    }
    if (loadTemplateBtn) loadTemplateBtn.style.display = streams.length ? 'inline-flex' : 'none';

    if (publishBtn) {
      publishBtn.textContent = 'Go Live Now';
      publishBtn.disabled = false;
    }
    if (removeBtn) {
      removeBtn.style.display = 'none';
      removeBtn.disabled = false;
    }

    setGoLiveCreateModeFieldVisibility(true);
    applyGoLiveHostModeUi('self');
    setGoLiveRelaysPanelOpen(false);
    updateGoLiveStartsVisibility();
    updateGoLiveThumbPreview();
    scheduleGoLiveStreamPreview(120);
    updateRelayBar();
  }

  const GO_LIVE_FIELD_PAIRS = [
    ['#goLiveDTag', '#myStreamsDTag'],
    ['#goLiveTitle', '#myStreamsTitleInput'],
    ['#goLiveSummary', '#myStreamsSummary'],
    ['#goLiveStreamUrl', '#myStreamsStreamUrl'],
    ['#goLiveThumb', '#myStreamsThumb'],
    ['#goLiveStarts', '#myStreamsStarts'],
    ['#goLiveEventId', '#myStreamsEventId']
  ];

  function syncStatusRowSelection(fromSel, toSel) {
    const fromRow = qs(fromSel);
    const toRow = qs(toSel);
    if (!fromRow || !toRow) return;
    const fromButtons = qsa('.sc', fromRow);
    const toButtons = qsa('.sc', toRow);
    if (!fromButtons.length || !toButtons.length) return;

    const selected = fromButtons.find((btn) => btn.classList.contains('sl')) || fromButtons[0];
    const normalized = normalizeStreamStatus(selected ? selected.textContent : 'live');
    toButtons.forEach((btn) => btn.classList.remove('sl'));
    const match = toButtons.find((btn) => normalizeStreamStatus(btn.textContent) === normalized) || toButtons[0];
    if (match) match.classList.add('sl');
  }

  function setMyStreamsStatus(message = '', tone = 'info') {
    const el = qs('#myStreamsStatus');
    if (!el) return;
    el.textContent = String(message || '');
    el.classList.remove('ok', 'err');
    if (tone === 'success') el.classList.add('ok');
    if (tone === 'error') el.classList.add('err');
  }

  function syncMyStreamsPageFromGoLiveModal() {
    const page = qs('#myStreamsPage');
    if (!page) return;

    GO_LIVE_FIELD_PAIRS.forEach(([goSel, pageSel]) => {
      const from = qs(goSel);
      const to = qs(pageSel);
      if (!from || !to) return;
      to.value = from.value;
    });

    const goTitle = qs('#goLiveModalTitle');
    const pageTitle = qs('#myStreamsTitle');
    if (pageTitle && goTitle) pageTitle.textContent = String(goTitle.textContent || 'Edit Stream').trim() || 'Edit Stream';

    const goSub = qs('#goLiveModalSub');
    const pageSub = qs('#myStreamsSub');
    if (pageSub && goSub) pageSub.textContent = String(goSub.textContent || '').trim();

    const goManageWrap = qs('#goLiveManageWrap');
    const pageManageWrap = qs('#myStreamsManageWrap');
    if (pageManageWrap) {
      const showManage = !!(goManageWrap && goManageWrap.classList.contains('on'));
      pageManageWrap.classList.toggle('on', showManage);
    }

    const goHint = qs('#goLiveManageHint');
    const pageHint = qs('#myStreamsManageHint');
    if (pageHint && goHint) pageHint.textContent = goHint.textContent || '';

    const goSelect = qs('#goLiveStreamSelect');
    const pageSelect = qs('#myStreamsStreamSelect');
    if (pageSelect) {
      pageSelect.innerHTML = '';
      if (goSelect) {
        qsa('option', goSelect).forEach((opt) => {
          const clone = document.createElement('option');
          clone.value = opt.value;
          clone.textContent = opt.textContent;
          pageSelect.appendChild(clone);
        });
        if (goSelect.value) pageSelect.value = goSelect.value;
        pageSelect.disabled = goSelect.options.length === 0;
      }
    }

    const goPublish = qs('#goLivePublishBtn');
    const pagePublish = qs('#myStreamsPublishBtn');
    if (goPublish && pagePublish) pagePublish.textContent = goPublish.textContent || 'Save Stream Update';

    const goRemove = qs('#goLiveRemoveBtn');
    const pageRemove = qs('#myStreamsRemoveBtn');
    if (goRemove && pageRemove) pageRemove.style.display = goRemove.style.display || 'none';

    const relayBar = qs('#relayBar');
    const pageRelayBar = qs('#myStreamsRelayBar');
    if (relayBar && pageRelayBar) pageRelayBar.textContent = relayBar.textContent || '';

    syncStatusRowSelection('#goLiveModal .srow', '#myStreamsStatusRow');
  }

  function syncGoLiveModalFromMyStreamsPage() {
    state.goLiveForceNew = false;
    state.goLiveRelaysOpen = false;
    setGoLiveCreateModeFieldVisibility(false);
    applyGoLiveHostModeUi('self');
    setGoLiveRelaysPanelOpen(false);
    const pageSelect = qs('#myStreamsStreamSelect');
    if (pageSelect && pageSelect.value) state.goLiveSelectedAddress = pageSelect.value;

    GO_LIVE_FIELD_PAIRS.forEach(([goSel, pageSel]) => {
      const to = qs(goSel);
      const from = qs(pageSel);
      if (!from || !to) return;
      to.value = from.value;
    });

    syncStatusRowSelection('#myStreamsStatusRow', '#goLiveModal .srow');
  }

  function updateGoLiveModalState() {
    const manageWrap = qs('#goLiveManageWrap');
    const manageLabel = qs('#goLiveManageLabel');
    const manageHint = qs('#goLiveManageHint');
    const loadTemplateBtn = qs('#goLiveLoadTemplateBtn');
    const selector = qs('#goLiveStreamSelect');
    const publishBtn = qs('#goLivePublishBtn');
    const removeBtn = qs('#goLiveRemoveBtn');
    const modalTitle = qs('#goLiveModalTitle');
    const modalSub = qs('#goLiveModalSub');

    state.goLiveForceNew = false;
    state.goLiveHostMode = 'self';
    state.goLiveTemplateAddress = '';
    state.goLiveRelaysOpen = false;
    if (manageLabel) manageLabel.textContent = 'Your Streams';
    if (loadTemplateBtn) loadTemplateBtn.style.display = 'none';
    setGoLiveCreateModeFieldVisibility(false);
    applyGoLiveHostModeUi('self');
    setGoLiveRelaysPanelOpen(false);

    const streams = ownManageableStreams();
    let selected = streams.find((s) => s.address === state.goLiveSelectedAddress) || null;
    if (!selected && streams.length) selected = streams[0];
    state.goLiveSelectedAddress = selected ? selected.address : '';

    if (manageWrap) manageWrap.classList.toggle('on', streams.length > 0);
    if (selector) {
      selector.innerHTML = '';
      streams.forEach((stream) => {
        const opt = document.createElement('option');
        const statusLabel = normalizeStreamStatus(stream.status).toUpperCase();
        const title = (stream.title || 'Untitled stream').slice(0, 64);
        opt.value = stream.address;
        opt.textContent = `${statusLabel} - ${title}`;
        selector.appendChild(opt);
      });
      selector.disabled = streams.length === 0;
      if (state.goLiveSelectedAddress) selector.value = state.goLiveSelectedAddress;
    }

    if (selected) {
      populateGoLiveFormFromStream(selected);
      const status = normalizeStreamStatus(selected.status);
      if (modalTitle) modalTitle.innerHTML = '<span class="mi"></span>Edit Stream';
      if (modalSub) modalSub.textContent = 'You already have stream events. Edit details and publish updates.';
      if (publishBtn) publishBtn.textContent = status === 'live' ? 'Save Live Update' : 'Save Stream Update';
      if (removeBtn) removeBtn.style.display = status === 'ended' ? 'inline-flex' : 'none';
      if (manageHint) manageHint.textContent = streams.length > 1
        ? 'Pick a stream from the list to edit or end it.'
        : 'You can edit title, stream id, URL, summary, and status.';
    } else {
      resetGoLiveFormDefaults();
      if (modalTitle) modalTitle.innerHTML = '<span class="mi"></span>Publish Your Stream';
      if (modalSub) modalSub.innerHTML = 'Broadcasts a <span style="color:var(--purple);font-family:\'DM Mono\',monospace">kind:30311</span> NIP-53 event to your relays.';
      if (publishBtn) publishBtn.textContent = 'Go Live Now';
      if (removeBtn) removeBtn.style.display = 'none';
      if (manageHint) manageHint.textContent = 'Create your first stream event, then it will appear here for editing.';
    }
    updateGoLiveStartsVisibility();
    updateGoLiveThumbPreview();
    scheduleGoLiveStreamPreview(120);
    syncMyStreamsPageFromGoLiveModal();
  }

  function updateGoLiveButtonState() {
    const btn = qs('#goLiveBtn');
    if (!btn) return;
    const streams = ownManageableStreams();
    const hasLive = streams.some((s) => normalizeStreamStatus(s.status) === 'live');
    if (hasLive) {
      btn.textContent = 'Edit Stream';
      btn.classList.remove('btn-ghost');
      btn.classList.add('btn-live-pulse', 'btn-edit-stream-live');
      return;
    }
    btn.textContent = 'Go Live';
    btn.classList.remove('btn-live-pulse', 'btn-edit-stream-live');
    btn.classList.add('btn-ghost');
  }

  function effectiveParticipants(stream) {
    if (!stream) return 0;
    const base = Number(stream.participants || 0) || 0;
    const watchingBoost = (
      (state.activeViewerAddress && stream.address === state.activeViewerAddress)
      || (state.activeHeroViewerAddress && stream.address === state.activeHeroViewerAddress)
    ) ? 1 : 0;
    return Math.max(0, base + watchingBoost);
  }

  function refreshParticipantDependentUi() {
    renderLiveGrid();

    const featured = heroFeaturedStreams();
    if (featured.length) {
      let idx = Math.min(Math.max(0, state.featuredIndex), featured.length - 1);
      if (state.featuredCurrentAddress) {
        const currentIdx = featured.findIndex((s) => s.address === state.featuredCurrentAddress);
        if (currentIdx >= 0) idx = currentIdx;
      }
      state.featuredIndex = idx;
      renderHeroIndicators(featured, idx);
      const heroViewers = qs('#heroViewers');
      if (heroViewers) {
        const viewerCount = effectiveParticipants(featured[idx]);
        heroViewers.textContent = viewerCount > 0 ? viewerCount.toLocaleString() : '-';
      }
    }

    const selected = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
    if (selected) {
      const viewers = qs('#theaterViewers');
      if (viewers) viewers.textContent = formatCount(effectiveParticipants(selected));
    }

    if (window.renderRecoStreams) window.renderRecoStreams();
  }

  function setActiveViewerAddress(address) {
    const next = (address || '').trim();
    if (state.activeViewerAddress === next) return;
    state.activeViewerAddress = next;
    refreshParticipantDependentUi();
  }

  function setActiveHeroViewerAddress(address) {
    const next = (address || '').trim();
    if (state.activeHeroViewerAddress === next) return;
    state.activeHeroViewerAddress = next;
    refreshParticipantDependentUi();
  }

  function isStreamPlaybackOffline(address) {
    const key = String(address || '').trim();
    if (!key) return false;
    return state.featuredFailed.has(key);
  }

  function markStreamPlaybackOffline(address) {
    const key = String(address || '').trim();
    if (!key) return;
    const wasOffline = state.featuredFailed.has(key);
    state.featuredFailed.add(key);
    if (!wasOffline && isHomeViewActive()) renderLiveGrid();
  }

  function markStreamPlaybackOnline(address) {
    const key = String(address || '').trim();
    if (!key) return;
    const didClear = state.featuredFailed.delete(key);
    if (didClear && isHomeViewActive()) renderLiveGrid();
  }

  function sortedLiveStreams() {
    return Array.from(state.streamsByAddress.values())
      .filter((s) => s.status !== 'ended')
      .filter((s) => !isDirectFileVideoUrl(s && s.streaming))
      .sort((a, b) => {
        const offlineA = isStreamPlaybackOffline(a && a.address);
        const offlineB = isStreamPlaybackOffline(b && b.address);
        if (offlineA !== offlineB) return offlineA ? 1 : -1;
        // Tier 1: has viewers > 0  ->  Tier 2: has streaming URL but 0 viewers  ->  Tier 3: no URL no viewers
        const tierA = effectiveParticipants(a) > 0 ? 0 : (a.streaming ? 1 : 2);
        const tierB = effectiveParticipants(b) > 0 ? 0 : (b.streaming ? 1 : 2);
        if (tierA !== tierB) return tierA - tierB;
        // Within same tier: higher viewers first
        return effectiveParticipants(b) - effectiveParticipants(a);
      });
  }

  function ownStreamsForTemplate() {
    if (!state.user) return [];
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return [];
    return Array.from(state.streamsByAddress.values())
      .filter((s) => normalizePubkeyHex(s.pubkey) === own)
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  function normalizeVideosFilter(filterId) {
    const raw = String(filterId || '').trim().toLowerCase();
    if (raw === 'watch-party' || raw === 'watchparty' || raw === 'watch') return 'watch-party';
    if (raw === 'past' || raw === 'past-stream' || raw === 'past-streams' || raw === 'archive') return 'past';
    if (raw === 'nip71-videos' || raw === 'nip71' || raw === 'kind21' || raw === 'videos-kind21' || raw === 'videos21') return 'nip71-videos';
    if (raw === 'nip71-reels' || raw === 'reels' || raw === 'kind22' || raw === 'nostr-reels' || raw === 'reel') return 'nip71-reels';
    return 'all';
  }

  function isDirectFileVideoUrl(url) {
    const raw = sanitizeMediaUrl(url || '');
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (/\.(mp4|webm|mov|m4v|mkv)($|[?#])/.test(lower)) return true;
    if (/[?&](format|type|mime|ext)=([^&]*(mp4|webm|mov|m4v|mkv)|video%2F(mp4|webm|quicktime)|video\/(mp4|webm|quicktime))/.test(lower)) {
      return true;
    }
    return false;
  }

  function isWatchPartyStream(stream) {
    return isDirectFileVideoUrl(stream && stream.streaming);
  }

  function isPastVideoStream(stream) {
    const status = normalizeStreamStatus(stream && stream.status);
    if (status !== 'ended') return false;
    const url = sanitizeMediaUrl((stream && stream.streaming) || '');
    if (!url) return true;
    return streamHasHttpVideoUrl(stream) || isDirectFileVideoUrl(url);
  }

  function streamHasHttpVideoUrl(stream) {
    const url = sanitizeMediaUrl((stream && stream.streaming) || '');
    if (!url || !/^https?:\/\//i.test(url)) return false;
    return classifyMediaUrl(url) === 'video' || isDirectFileVideoUrl(url);
  }

  function sortedWatchPartyStreams() {
    return Array.from(state.streamsByAddress.values())
      .filter((stream) => isWatchPartyStream(stream))
      .sort((a, b) => {
        const viewerDelta = effectiveParticipants(b) - effectiveParticipants(a);
        if (viewerDelta) return viewerDelta;
        return Number(b && b.created_at || 0) - Number(a && a.created_at || 0);
      });
  }

  function sortedPastVideoStreams() {
    return Array.from(state.streamsByAddress.values())
      .filter((stream) => isPastVideoStream(stream) && !isWatchPartyStream(stream))
      .sort((a, b) => Number(b && b.created_at || 0) - Number(a && a.created_at || 0));
  }

  function sortedOtherVideoStreams() {
    return Array.from(state.streamsByAddress.values())
      .filter((stream) => {
        if (isWatchPartyStream(stream) || isPastVideoStream(stream)) return false;
        const status = normalizeStreamStatus(stream && stream.status);
        return streamHasHttpVideoUrl(stream) && status !== 'live';
      })
      .sort((a, b) => Number(b && b.created_at || 0) - Number(a && a.created_at || 0));
  }

  function sortedVideoStreams() {
    const watchParty = sortedWatchPartyStreams();
    const past = sortedPastVideoStreams();
    const other = sortedOtherVideoStreams();
    const out = [];
    const seen = new Set();
    watchParty.forEach((stream) => {
      if (!stream || !stream.address || seen.has(stream.address)) return;
      seen.add(stream.address);
      out.push(stream);
    });
    past.forEach((stream) => {
      if (!stream || !stream.address || seen.has(stream.address)) return;
      seen.add(stream.address);
      out.push(stream);
    });
    other.forEach((stream) => {
      if (!stream || !stream.address || seen.has(stream.address)) return;
      seen.add(stream.address);
      out.push(stream);
    });
    return out;
  }

  function sortedNip71VideosByKind(kind) {
    const targetKind = Number(kind || 0);
    return Array.from(state.nip71VideosByEventId.values())
      .filter((entry) => Number(entry && entry.nip71Kind || 0) === targetKind)
      .sort((a, b) => Number(b && b.created_at || 0) - Number(a && a.created_at || 0));
  }

  function sortedNip71Videos() {
    return Array.from(state.nip71VideosByEventId.values())
      .sort((a, b) => Number(b && b.created_at || 0) - Number(a && a.created_at || 0));
  }

  function sortedAllArchiveVideos() {
    return [...sortedVideoStreams(), ...sortedNip71Videos()]
      .sort((a, b) => Number(b && b.created_at || 0) - Number(a && a.created_at || 0));
  }

  function collectProfilePubkeysFromStreams(streams = []) {
    const out = new Set();
    (streams || []).forEach((stream) => {
      if (!stream || typeof stream !== 'object') return;
      [stream.hostPubkey, stream.pubkey, stream.platformPubkey].forEach((pubkey) => {
        const normalized = normalizePubkeyHex(pubkey || '') || String(pubkey || '').trim().toLowerCase();
        if (normalized) out.add(normalized);
      });
    });
    return out;
  }

  function ensureProfilesForStreams(streams = []) {
    const wanted = Array.from(collectProfilePubkeysFromStreams(streams));
    wanted.forEach((pubkey) => {
      if (!pubkey || state.profilesByPubkey.has(pubkey) || state.videosProfileFetchPending.has(pubkey)) return;
      state.videosProfileFetchPending.add(pubkey);
      fetchProfileIfNeeded(pubkey)
        .catch(() => {})
        .finally(() => {
          state.videosProfileFetchPending.delete(pubkey);
        });
    });
  }

  function clearVideosRenderTimer() {
    if (!state.videosRenderTimer) return;
    clearTimeout(state.videosRenderTimer);
    state.videosRenderTimer = null;
  }

  function scheduleVideosPageRender(delayMs = 90) {
    if (!isVideosPageVisible()) return;
    clearVideosRenderTimer();
    state.videosRenderTimer = setTimeout(() => {
      state.videosRenderTimer = null;
      if (!isVideosPageVisible()) return;
      renderVideosPage();
    }, Math.max(0, Number(delayMs || 0)));
  }

  function replaceVideoThumbWithFallback(videoEl, fallbackClass) {
    if (!videoEl || !videoEl.parentNode) return;
    const fallback = document.createElement('div');
    fallback.className = `tc ${fallbackClass}`;
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch (_) {}
    videoEl.parentNode.replaceChild(fallback, videoEl);
  }

  function activateVideoThumbElement(videoEl) {
    if (!videoEl || videoEl.dataset.thumbLoaded === '1') return;
    videoEl.dataset.thumbLoaded = '1';
    const url = sanitizeMediaUrl(videoEl.dataset.thumbSrc || '');
    const fallbackClass = String(videoEl.dataset.thumbFallback || 't1');
    if (!url || !/^https?:\/\//i.test(url)) {
      replaceVideoThumbWithFallback(videoEl, fallbackClass);
      return;
    }
    if (isLikelyHlsStreamUrl(url) && !videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // Desktop browsers without native HLS usually cannot provide a poster frame without full HLS setup.
      replaceVideoThumbWithFallback(videoEl, fallbackClass);
      return;
    }
    try {
      videoEl.src = url;
      videoEl.load();
    } catch (_) {
      replaceVideoThumbWithFallback(videoEl, fallbackClass);
    }
  }

  function ensureVideoThumbObserver() {
    if (state.videoThumbObserver) return state.videoThumbObserver;
    if (!('IntersectionObserver' in window)) return null;
    state.videoThumbObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry || !entry.isIntersecting) return;
        const videoEl = entry.target;
        try { state.videoThumbObserver.unobserve(videoEl); } catch (_) {}
        activateVideoThumbElement(videoEl);
      });
    }, { rootMargin: '220px' });
    return state.videoThumbObserver;
  }

  function initVideoThumbElement(videoEl) {
    if (!videoEl) return;
    videoEl.muted = true;
    videoEl.defaultMuted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'metadata';
    videoEl.autoplay = false;
    videoEl.loop = false;
    videoEl.controls = false;
    videoEl.addEventListener('loadeddata', () => {
      // Freeze on first frame for thumbnail behavior.
      try {
        videoEl.currentTime = 0.01;
      } catch (_) {}
      try { videoEl.pause(); } catch (_) {}
    });
    videoEl.addEventListener('error', () => {
      const fallbackClass = String(videoEl.dataset.thumbFallback || 't1');
      replaceVideoThumbWithFallback(videoEl, fallbackClass);
    });
    const observer = ensureVideoThumbObserver();
    if (observer) observer.observe(videoEl);
    else activateVideoThumbElement(videoEl);
  }

  function renderVideosFilterControls(counts = null) {
    const map = counts && typeof counts === 'object'
      ? counts
      : { all: 0, 'watch-party': 0, past: 0, 'nip71-videos': 0, 'nip71-reels': 0 };
    const normalized = normalizeVideosFilter(state.videosFilter);
    state.videosFilter = normalized;

    const allBtn = qs('#videosFilterAllBtn');
    const nip71VideosBtn = qs('#videosFilterNip71VideosBtn');
    const nip71ReelsBtn = qs('#videosFilterNip71ReelsBtn');
    const watchBtn = qs('#videosFilterWatchPartyBtn');
    const pastBtn = qs('#videosFilterPastBtn');
    if (allBtn) {
      allBtn.classList.toggle('active', normalized === 'all');
      allBtn.textContent = `All Videos (${Number(map.all || 0)})`;
    }
    if (nip71VideosBtn) {
      nip71VideosBtn.classList.toggle('active', normalized === 'nip71-videos');
      nip71VideosBtn.textContent = `Videos (${Number(map['nip71-videos'] || 0)})`;
    }
    if (nip71ReelsBtn) {
      nip71ReelsBtn.classList.toggle('active', normalized === 'nip71-reels');
      nip71ReelsBtn.textContent = `Nostr Reels (${Number(map['nip71-reels'] || 0)})`;
    }
    if (watchBtn) {
      watchBtn.classList.toggle('active', normalized === 'watch-party');
      watchBtn.textContent = `Watch Party (${Number(map['watch-party'] || 0)})`;
    }
    if (pastBtn) {
      pastBtn.classList.toggle('active', normalized === 'past');
      pastBtn.textContent = `Past Streams (${Number(map.past || 0)})`;
    }
  }

  function setVideosFilterInternal(filterId, opts = {}) {
    state.videosFilter = normalizeVideosFilter(filterId);
    if (opts.render !== false && isVideosPageVisible()) scheduleVideosPageRender(0);
  }

  function buildVideoArchiveCard(stream, idx) {
    const hostPubkey = normalizePubkeyHex(stream.hostPubkey || stream.pubkey || '') || String(stream.hostPubkey || stream.pubkey || '').trim().toLowerCase();
    const profile = profileFor(hostPubkey);
    const card = document.createElement('article');
    card.className = 'video-archive-card';

    const gradients = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
    const fallback = gradients[idx % gradients.length];
    const status = normalizeStreamStatus(stream.status);
    const url = sanitizeMediaUrl(stream.streaming || '');
    const nip71Kind = Number(stream.nip71Kind || 0);
    const isNip71Video = nip71Kind === KIND_NIP71_VIDEO;
    const isNip71Reel = nip71Kind === KIND_NIP71_REEL;
    const isWatchParty = isWatchPartyStream(stream);
    const isPastStream = status === 'ended';
    const directVideo = isDirectFileVideoUrl(url);
    const hasImageThumb = !!sanitizeMediaUrl(stream.image || '');
    const canUseVideoThumb = !hasImageThumb && !!url && /^https?:\/\//i.test(url);
    const badgeLabel = isNip71Reel
      ? 'NOSTR REEL'
      : (isNip71Video
        ? 'NIP-71 VIDEO'
        : (isWatchParty
          ? (isPastStream ? 'PAST WATCH PARTY' : 'WATCH PARTY')
          : (isPastStream ? 'PAST STREAM' : (directVideo ? 'VIDEO FILE' : 'VIDEO'))));
    const badgeClass = isWatchParty ? 'watch-party' : (directVideo ? 'video-file' : '');
    const timeAgo = stream.created_at ? `${formatTimeAgo(stream.created_at)} ago` : '';
    let statusText = 'Recorded';
    if (isNip71Reel) statusText = 'Nostr Reel (kind:22)';
    else if (isNip71Video) statusText = 'NIP-71 Video (kind:21)';
    else if (isWatchParty) statusText = status === 'ended'
      ? 'Past Watch Party'
      : (status === 'planned' ? 'Planned Watch Party' : 'Live Watch Party');
    else if (isPastStream) statusText = 'Past Stream';
    else if (status === 'planned') statusText = 'Planned';
    const viewers = effectiveParticipants(stream);
    const metaParts = [statusText];
    if (viewers > 0) metaParts.push(`${formatCount(viewers)} viewers`);
    if (timeAgo) metaParts.push(timeAgo);
    const subMeta = metaParts.join(' • ');

    card.innerHTML = `
      <div class="video-archive-thumb-wrap">
        ${hasImageThumb
          ? `<img class="video-archive-thumb" src="${stream.image}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'tc ${fallback}\\'></div><div class=\\'video-archive-play\\'>&#9654;</div>'">`
          : (canUseVideoThumb
            ? `<video class="video-archive-thumb-video" data-thumb-src="${escapeHtml(url)}" data-thumb-fallback="${fallback}" muted playsinline preload="metadata"></video>`
            : `<div class="tc ${fallback}"></div>`)}
        <div class="video-archive-play">&#9654;</div>
        <div class="video-archive-badge ${badgeClass}">${badgeLabel}</div>
        ${timeAgo ? `<div class="video-archive-duration">${timeAgo}</div>` : ''}
      </div>
      <div class="video-archive-meta">
        <div class="video-archive-avatar"></div>
        <div class="video-archive-text">
          <div class="video-archive-title"></div>
          <div class="video-archive-host"></div>
          <div class="video-archive-sub"></div>
        </div>
      </div>
    `;

    const thumbVideoEl = qs('.video-archive-thumb-video', card);
    if (thumbVideoEl) initVideoThumbElement(thumbVideoEl);

    const avatarEl = qs('.video-archive-avatar', card);
    if (avatarEl) {
      setAvatarEl(avatarEl, profile.picture || '', pickAvatar(hostPubkey || stream.address || stream.id));
      const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
      const verifiedNip05 = getVerifiedNip05ForPubkey(hostPubkey, profile.nip05 || '', { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS });
      avatarEl.classList.toggle('nip05-square', !!verifiedNip05);
      if (claimedNip05 && hostPubkey) {
        ensureNip05Verification(hostPubkey, claimedNip05, { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS }).catch(() => {});
      }
    }

    const titleEl = qs('.video-archive-title', card);
    if (titleEl) titleEl.textContent = stream.title || 'Untitled stream';
    const hostEl = qs('.video-archive-host', card);
    if (hostEl) hostEl.textContent = profile.display_name || profile.name || shortHex(hostPubkey);
    const subEl = qs('.video-archive-sub', card);
    if (subEl) subEl.textContent = subMeta;

    card.addEventListener('click', () => {
      if (isNip71Video || isNip71Reel || isWatchParty) {
        openVideoPostModal(stream);
        return;
      }
      openStream(stream.address);
    });
    return card;
  }

  function renderVideosPage() {
    const grid = qs('#videosGrid');
    const countPill = qs('#videosCountPill');
    if (!grid) return;

    const allStreams = Array.from(state.streamsByAddress.values());
    const watchParty = sortedWatchPartyStreams();
    const pastStreams = sortedPastVideoStreams();
    const nip71Videos = sortedNip71VideosByKind(KIND_NIP71_VIDEO);
    const nip71Reels = sortedNip71VideosByKind(KIND_NIP71_REEL);
    const allVideos = sortedAllArchiveVideos();
    ensureProfilesForStreams(allVideos);
    const counts = {
      all: allVideos.length,
      'watch-party': watchParty.length,
      past: pastStreams.length,
      'nip71-videos': nip71Videos.length,
      'nip71-reels': nip71Reels.length
    };
    renderVideosFilterControls(counts);

    const filter = normalizeVideosFilter(state.videosFilter);
    let videos = allVideos;
    if (filter === 'watch-party') videos = watchParty;
    else if (filter === 'past') videos = pastStreams;
    else if (filter === 'nip71-videos') videos = nip71Videos;
    else if (filter === 'nip71-reels') videos = nip71Reels;

    if (countPill) {
      if (filter === 'watch-party') countPill.textContent = counts['watch-party'] ? `${counts['watch-party']} watch parties` : '';
      else if (filter === 'past') countPill.textContent = counts.past ? `${counts.past} past streams` : '';
      else if (filter === 'nip71-videos') countPill.textContent = counts['nip71-videos'] ? `${counts['nip71-videos']} NIP-71 videos` : '';
      else if (filter === 'nip71-reels') countPill.textContent = counts['nip71-reels'] ? `${counts['nip71-reels']} nostr reels` : '';
      else countPill.textContent = counts.all ? `${counts.all} videos` : '';
    }

    const totalSources = allStreams.length + nip71Videos.length + nip71Reels.length;
    if (!totalSources) {
      grid.innerHTML = '<div class="live-grid-loading"><div class="lf-spinner"></div>Syncing streams from relays...</div>';
      return;
    }

    if (!videos.length) {
      if (filter === 'watch-party') {
        grid.innerHTML = '<div class="videos-empty">No Watch Party videos yet. Live and past Watch Parties will appear here.</div>';
      } else if (filter === 'past') {
        grid.innerHTML = '<div class="videos-empty">No past streams yet.</div>';
      } else if (filter === 'nip71-videos') {
        grid.innerHTML = '<div class="videos-empty">No NIP-71 kind:21 videos found yet.</div>';
      } else if (filter === 'nip71-reels') {
        grid.innerHTML = '<div class="videos-empty">No NIP-71 kind:22 reels found yet.</div>';
      } else {
        grid.innerHTML = '<div class="videos-empty">No videos yet. Streams, NIP-71 videos, and Nostr reels will appear here.</div>';
      }
      return;
    }

    if (state.videoThumbObserver) {
      qsa('.video-archive-thumb-video', grid).forEach((el) => {
        try { state.videoThumbObserver.unobserve(el); } catch (_) {}
      });
    }
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    videos.forEach((stream, idx) => frag.appendChild(buildVideoArchiveCard(stream, idx)));
    grid.appendChild(frag);
  }

  function resolveVideoPostEventId(stream) {
    const id = String((stream && (stream.id || (stream.raw && stream.raw.id))) || '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/i.test(id) ? id : '';
  }

  const VIDEO_POST_COMMENT_KINDS = [1, KIND_COMMENT];

  function isVideoPostCommentEvent(ev) {
    if (!ev) return false;
    const kind = Number(ev.kind || 0);
    return kind === 1 || kind === KIND_COMMENT;
  }

  function buildVideoPostCommentFilters(eventId) {
    const normalizedEventId = String(eventId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalizedEventId)) return [];
    return [
      { kinds: VIDEO_POST_COMMENT_KINDS, '#e': [normalizedEventId], limit: 300 },
      { kinds: [KIND_COMMENT], '#E': [normalizedEventId], limit: 300 }
    ];
  }

  function videoPostCommentTargetsEvent(ev, eventId) {
    if (!ev) return false;
    const normalizedEventId = String(eventId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalizedEventId)) return false;
    const refs = [
      ...allTagValues(ev.tags, 'e'),
      ...allTagValues(ev.tags, 'E')
    ]
      .map((ref) => String(ref || '').trim().toLowerCase())
      .filter((ref) => /^[0-9a-f]{64}$/.test(ref));
    return refs.includes(normalizedEventId);
  }

  function collectVideoPostBodyMedia(stream) {
    const event = stream && stream.raw && typeof stream.raw === 'object' ? stream.raw : null;
    const rawContent = event && typeof event.content === 'string' ? event.content : '';
    const parsedContent = parseJsonSafe(rawContent);
    const urls = [];

    if (event && (Number(event.kind || 0) === KIND_NIP71_VIDEO || Number(event.kind || 0) === KIND_NIP71_REEL)) {
      collectNip71MediaUrls(event, parsedContent).forEach((url) => urls.push(url));
    } else {
      extractHttpUrls(String((stream && stream.summary) || '')).forEach((url) => urls.push(url));
      extractHttpUrls(rawContent).forEach((url) => urls.push(url));
      const image = sanitizeMediaUrl((stream && stream.image) || '');
      const streaming = sanitizeMediaUrl((stream && stream.streaming) || '');
      if (image) urls.push(image);
      if (streaming) urls.push(streaming);
    }

    const unique = Array.from(new Set(
      urls
        .map((url) => sanitizeMediaUrl(url))
        .filter(Boolean)
    ));
    const mediaItems = unique
      .map((url) => ({ url, kind: classifyMediaUrl(url) }))
      .filter((entry) => entry.kind === 'photo' || entry.kind === 'video' || entry.kind === 'audio');

    // Keep the main player video in the left column and avoid duplicating it in the right column.
    const mainVideoUrl = sanitizeMediaUrl((stream && stream.streaming) || '');
    return mediaItems.filter((entry) => !(mainVideoUrl && entry.kind === 'video' && entry.url === mainVideoUrl));
  }

  function buildVideoPostBody(stream) {
    const event = stream && stream.raw && typeof stream.raw === 'object' ? stream.raw : null;
    const rawContent = event && typeof event.content === 'string' ? event.content : '';
    const parsedContent = parseJsonSafe(rawContent);
    const mediaItems = collectVideoPostBodyMedia(stream);
    const stripUrls = mediaItems.map((entry) => entry.url);

    let text = '';
    if (parsedContent && typeof parsedContent === 'object') {
      text = String(
        parsedContent.description
        || parsedContent.summary
        || parsedContent.caption
        || parsedContent.text
        || parsedContent.content
        || ''
      ).trim();
    } else if (rawContent && !String(rawContent).trim().startsWith('{')) {
      text = String(rawContent || '').trim();
    }
    if (!text) text = String((stream && stream.summary) || '').trim();
    if (!text) text = String((stream && stream.title) || '').trim();
    if (stripUrls.length) text = stripMediaUrlsFromText(text, stripUrls);

    return { text, mediaItems };
  }

  function renderVideoPostModalHeader(stream, token) {
    if (!stream || token !== state.videoPostModalToken) return;
    const hostPubkey = normalizePubkeyHex(stream.hostPubkey || stream.pubkey || '') || String(stream.hostPubkey || stream.pubkey || '').trim().toLowerCase();
    const profile = profileFor(hostPubkey);
    const bannerUrl = sanitizeMediaUrl(profile.banner || '');
    const displayName = profile.display_name || profile.name || shortHex(hostPubkey);
    const npubDisplay = formatNpubForDisplay(hostPubkey) || shortHex(hostPubkey);
    const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(hostPubkey, profile.nip05 || '', { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS });

    const bannerEl = qs('#videoPostBanner');
    const modalCardEl = qs('#videoPostModal .video-post-modal');
    const hostRowEl = qs('#videoPostModal .video-post-host-row');
    if (bannerEl) {
      if (bannerUrl) {
        bannerEl.style.display = 'block';
        bannerEl.style.backgroundImage = `linear-gradient(180deg,rgba(7,11,16,.14),rgba(7,11,16,.75)),url("${bannerUrl}")`;
        if (modalCardEl) modalCardEl.classList.remove('video-post-no-banner');
      } else {
        bannerEl.style.display = 'none';
        bannerEl.style.backgroundImage = '';
        if (modalCardEl) modalCardEl.classList.add('video-post-no-banner');
      }
    }
    if (hostRowEl) {
      hostRowEl.classList.toggle('verified', !!verifiedNip05);
      hostRowEl.classList.toggle('unverified', !verifiedNip05);
      hostRowEl.classList.toggle('linkable', !!hostPubkey);
      const openHostProfile = hostPubkey ? (() => showProfileByPubkey(hostPubkey)) : null;
      hostRowEl.onclick = openHostProfile;
      hostRowEl.onkeydown = openHostProfile ? ((event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openHostProfile();
        }
      }) : null;
      hostRowEl.tabIndex = openHostProfile ? 0 : -1;
      hostRowEl.setAttribute('role', openHostProfile ? 'link' : 'group');
    }

    const avatarEl = qs('#videoPostHostAvatar');
    if (avatarEl) {
      setAvatarEl(avatarEl, profile.picture || '', pickAvatar(hostPubkey || stream.address || stream.id));
      avatarEl.classList.toggle('nip05-square', !!verifiedNip05);
      avatarEl.style.cursor = hostPubkey ? 'pointer' : '';
      avatarEl.onclick = hostPubkey ? (() => showProfileByPubkey(hostPubkey)) : null;
    }

    const nameEl = qs('#videoPostHostName');
    if (nameEl) {
      nameEl.textContent = displayName;
      nameEl.style.cursor = hostPubkey ? 'pointer' : '';
      nameEl.onclick = hostPubkey ? (() => showProfileByPubkey(hostPubkey)) : null;
    }

    const hostCheckEl = qs('#videoPostHostCheck');
    if (hostCheckEl) {
      hostCheckEl.style.display = verifiedNip05 ? 'inline-flex' : 'none';
      hostCheckEl.title = verifiedNip05 ? `NIP-05 verified: ${verifiedNip05}` : '';
    }

    const npubEl = qs('#videoPostHostNpub');
    if (npubEl) {
      const idDisplay = verifiedNip05 || npubDisplay;
      npubEl.textContent = idDisplay;
      npubEl.title = idDisplay;
      npubEl.style.color = verifiedNip05 ? 'var(--nip05)' : '';
    }

    const nip05El = qs('#videoPostHostNip05');
    if (nip05El) {
      if (verifiedNip05) {
        nip05El.textContent = '';
        nip05El.title = '';
        nip05El.style.display = 'none';
      } else if (claimedNip05) {
        nip05El.textContent = `${claimedNip05} (unverified)`;
        nip05El.title = claimedNip05;
        nip05El.style.display = 'block';
      } else {
        nip05El.textContent = '';
        nip05El.title = '';
        nip05El.style.display = 'none';
      }
    }

    const titleEl = qs('#videoPostTitle');
    if (titleEl) titleEl.textContent = String(stream.title || 'Untitled video');

    if (claimedNip05 && hostPubkey && !verifiedNip05) {
      ensureNip05Verification(hostPubkey, claimedNip05, { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS })
        .then(() => {
          if (token !== state.videoPostModalToken) return;
          renderVideoPostModalHeader(stream, token);
        })
        .catch(() => {});
    }
  }

  function cleanupVideoPostModalPlayer() {
    if (typeof state.videoPostModalPlayerCleanup === 'function') {
      try { state.videoPostModalPlayerCleanup(); } catch (_) {}
    }
    state.videoPostModalPlayerCleanup = null;
  }

  async function mountVideoPostModalPlayer(url, token) {
    const video = qs('#videoPostPlayer');
    const statusEl = qs('#videoPostPlayerStatus');
    if (!video) return;

    cleanupVideoPostModalPlayer();

    const mediaUrl = sanitizeMediaUrl(url || '');
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
      if (statusEl) {
        statusEl.textContent = 'No browser-playable video URL found.';
        statusEl.style.display = 'flex';
      }
      return;
    }

    const isStale = () => token !== state.videoPostModalToken;
    let hlsInstance = null;
    let hlsAttached = false;
    const shouldPreferHls = isLikelyHlsStreamUrl(mediaUrl);
    const looksLikeDirectFileVideo = isDirectFileVideoUrl(mediaUrl);

    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }

    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    try { video.load(); } catch (_) {}

    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = false;
    video.defaultMuted = false;
    video.playsInline = true;
    video.preload = 'auto';

    const showFailure = (message) => {
      if (isStale()) return;
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.display = 'flex';
      }
    };

    const attachHls = async () => {
      if (hlsAttached || isStale()) return false;
      try {
        const hls = await attachHlsPlaybackWithRecovery(video, mediaUrl, {
          isStale,
          onAttach: (instance) => { hlsInstance = instance; },
          onFatal: () => {
            showFailure('Video playback failed after retries. Try opening the source URL directly.');
          },
          hlsConfig: {
            xhrSetup: (xhr) => { xhr.withCredentials = false; }
          },
          maxNetworkRecoveries: 4,
          maxMediaRecoveries: 2
        });
        if (!hls) return false;
        hlsAttached = true;
        return true;
      } catch (_) {
        return false;
      }
    };

    video.onerror = () => {
      if (isStale()) return;
      (async () => {
        if (!hlsAttached && !video.canPlayType('application/vnd.apple.mpegurl') && (shouldPreferHls || !looksLikeDirectFileVideo)) {
          const attached = await attachHls();
          if (attached) {
            const played = await tryPlayVideoWithMutedFallback(video);
            if (played && video.muted) {
              video.muted = false;
              video.defaultMuted = false;
              try { await video.play(); } catch (_) {}
            }
            return;
          }
        }
        showFailure('Could not play this video in your browser.');
      })().catch(() => {
        showFailure('Could not play this video in your browser.');
      });
    };

    let sourceAssigned = false;
    if (shouldPreferHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = mediaUrl;
        sourceAssigned = true;
      } else {
        const attached = await attachHls();
        if (attached) {
          const played = await tryPlayVideoWithMutedFallback(video);
          if (played && video.muted) {
            video.muted = false;
            video.defaultMuted = false;
            try { await video.play(); } catch (_) {}
          }
        }
      }
    }

    if (!hlsAttached && !sourceAssigned) {
      video.src = mediaUrl;
      sourceAssigned = true;
    }
    if (sourceAssigned && !hlsAttached) {
      const played = await tryPlayVideoWithMutedFallback(video);
      if (played && video.muted) {
        video.muted = false;
        video.defaultMuted = false;
        try { await video.play(); } catch (_) {}
      }
      if (!played) showFailure('Autoplay is blocked. Press play to start this video.');
    }

    state.videoPostModalPlayerCleanup = () => {
      try {
        if (hlsInstance) hlsInstance.destroy();
      } catch (_) {}
      hlsInstance = null;
      hlsAttached = false;
      video.onerror = null;
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
      }
    };
  }

  function renderVideoPostComments(comments, opts = {}) {
    const listEl = qs('#videoPostCommentsList');
    if (!listEl) return;
    listEl.innerHTML = '';

    const normalizedComments = Array.isArray(comments) ? comments : [];
    if (!normalizedComments.length) {
      listEl.innerHTML = '<div class="video-post-empty">No comments yet.</div>';
      return;
    }

    const token = Number(opts.token || 0);
    const skipProfileHydrate = !!opts.skipProfileHydrate;
    const missingPubkeys = new Set();
    const frag = document.createDocumentFragment();

    normalizedComments.forEach((comment) => {
      if (!comment || !comment.id) return;
      const commentPubkey = normalizePubkeyHex(comment.pubkey || '') || String(comment.pubkey || '').trim().toLowerCase();
      const profile = profileFor(commentPubkey);
      const displayName = profile.display_name || profile.name || shortHex(commentPubkey);
      const verifiedNip05 = getVerifiedNip05ForPubkey(commentPubkey, profile.nip05 || '');

      const row = document.createElement('div');
      row.className = 'video-post-comment-item';
      row.innerHTML = `
        <div class="video-post-comment-avatar"></div>
        <div class="video-post-comment-main">
          <div class="video-post-comment-meta">
            <span class="video-post-comment-name"></span>
            <span class="nip05-badge video-post-comment-nip05" style="display:none">&#10003;</span>
            <span class="video-post-comment-time"></span>
          </div>
          <div class="video-post-comment-text"></div>
          <div class="video-post-comment-media"></div>
        </div>
      `;

      const avatarEl = qs('.video-post-comment-avatar', row);
      if (avatarEl) {
        setAvatarEl(avatarEl, profile.picture || '', pickAvatar(commentPubkey));
        avatarEl.classList.toggle('nip05-square', !!verifiedNip05);
        avatarEl.addEventListener('click', () => showProfileByPubkey(commentPubkey));
      }

      const nameEl = qs('.video-post-comment-name', row);
      if (nameEl) {
        nameEl.textContent = displayName;
        nameEl.addEventListener('click', () => showProfileByPubkey(commentPubkey));
      }

      const nip05El = qs('.video-post-comment-nip05', row);
      if (nip05El) {
        nip05El.style.display = verifiedNip05 ? 'inline-flex' : 'none';
        nip05El.title = verifiedNip05 ? `NIP-05 verified: ${verifiedNip05}` : '';
      }

      const timeEl = qs('.video-post-comment-time', row);
      if (timeEl) timeEl.textContent = `${formatTimeAgo(comment.created_at)} ago`;

      const textEl = qs('.video-post-comment-text', row);
      const mediaEl = qs('.video-post-comment-media', row);
      const rawComment = String(comment.content || '');
      const mediaItems = Array.from(new Set(
        extractHttpUrls(rawComment)
          .map((url) => sanitizeMediaUrl(url))
          .filter(Boolean)
      ))
        .map((url) => ({ url, kind: classifyMediaUrl(url) }))
        .filter((entry) => entry.kind === 'photo' || entry.kind === 'video' || entry.kind === 'audio');
      const mediaUrls = mediaItems.map((entry) => entry.url);
      const text = mediaUrls.length ? stripMediaUrlsFromText(rawComment, mediaUrls) : rawComment;
      if (textEl) {
        textEl.innerHTML = '';
        if (String(text || '').trim()) textEl.appendChild(renderNostrContent(text));
        else textEl.textContent = '[empty comment]';
      }
      if (mediaEl) {
        mediaEl.innerHTML = '';
        renderChatInlineMedia(mediaEl, mediaItems, {
          allowVideo: true,
          classPrefix: 'video-post-comment',
          maxItems: 4,
          videoAutoplay: false,
          videoMuted: false,
          videoLoop: false
        });
        mediaEl.style.display = mediaEl.children.length ? 'block' : 'none';
      }

      if (!skipProfileHydrate && commentPubkey && !state.profilesByPubkey.has(commentPubkey)) {
        missingPubkeys.add(commentPubkey);
      }
      frag.appendChild(row);
    });
    listEl.appendChild(frag);

    if (!skipProfileHydrate && missingPubkeys.size) {
      Promise.allSettled(Array.from(missingPubkeys).map((pubkey) => fetchProfileIfNeeded(pubkey))).then(() => {
        if (token !== state.videoPostModalToken) return;
        renderVideoPostComments(normalizedComments, { token, skipProfileHydrate: true });
      });
    }
  }

  function fetchVideoPostComments(stream, opts = {}) {
    const eventId = resolveVideoPostEventId(stream);
    if (!eventId) return Promise.resolve([]);

    const force = !!opts.force;
    const cacheEntry = state.videoPostCommentsCacheByEventId.get(eventId);
    if (!force && cacheEntry && (Date.now() - Number(cacheEntry.savedAt || 0)) < 30000) {
      return Promise.resolve(Array.isArray(cacheEntry.comments) ? cacheEntry.comments : []);
    }
    const commentFilters = buildVideoPostCommentFilters(eventId);
    if (!commentFilters.length) return Promise.resolve([]);

    return fetchEventsCached(
      commentFilters,
      {
        scope: 'video-post-comments',
        cacheKey: `video-post-comments:${eventId}`,
        timeoutMs: 3800,
        maxEvents: 420
      }
    ).then((events) => {
      const unique = new Map();
      (events || []).forEach((ev) => {
        if (!isVideoPostCommentEvent(ev) || !ev.id || !videoPostCommentTargetsEvent(ev, eventId)) return;
        const existing = unique.get(ev.id);
        if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) {
          unique.set(ev.id, ev);
        }
      });
      const fromRelay = Array.from(unique.values())
        .sort((a, b) => Number(a && a.created_at || 0) - Number(b && b.created_at || 0));
      const localCached = cacheEntry && Array.isArray(cacheEntry.comments) ? cacheEntry.comments : [];
      const mergedMap = new Map();
      [...localCached, ...fromRelay].forEach((ev) => {
        if (!ev || !ev.id) return;
        const existing = mergedMap.get(ev.id);
        if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) {
          mergedMap.set(ev.id, ev);
        }
      });
      const comments = Array.from(mergedMap.values())
        .sort((a, b) => Number(a && a.created_at || 0) - Number(b && b.created_at || 0));
      state.videoPostCommentsCacheByEventId.set(eventId, {
        savedAt: Date.now(),
        comments
      });
      return comments;
    }).catch(() => {
      if (cacheEntry && Array.isArray(cacheEntry.comments)) return cacheEntry.comments;
      return [];
    });
  }

  function stopVideoPostCommentsSubscription() {
    if (!state.videoPostCommentsSubId || !state.pool) {
      state.videoPostCommentsSubId = null;
      return;
    }
    try {
      state.pool.unsubscribe(state.videoPostCommentsSubId);
    } catch (_) {}
    state.videoPostCommentsSubId = null;
  }

  function subscribeVideoPostComments(stream, token) {
    stopVideoPostCommentsSubscription();
    if (!state.pool) return;
    const eventId = resolveVideoPostEventId(stream);
    if (!eventId) return;
    const commentFilters = buildVideoPostCommentFilters(eventId);
    if (!commentFilters.length) return;
    state.videoPostCommentsSubId = state.pool.subscribe(
      commentFilters,
      {
        event: (ev) => {
          if (!isVideoPostCommentEvent(ev) || !ev.id || !videoPostCommentTargetsEvent(ev, eventId)) return;
          const existingEntry = state.videoPostCommentsCacheByEventId.get(eventId);
          const existingComments = existingEntry && Array.isArray(existingEntry.comments) ? existingEntry.comments : [];
          const merged = new Map();
          [...existingComments, ev].forEach((item) => {
            if (!item || !item.id) return;
            const prev = merged.get(item.id);
            if (!prev || Number(prev.created_at || 0) <= Number(item.created_at || 0)) {
              merged.set(item.id, item);
            }
          });
          const comments = Array.from(merged.values())
            .sort((a, b) => Number(a && a.created_at || 0) - Number(b && b.created_at || 0));
          state.videoPostCommentsCacheByEventId.set(eventId, {
            savedAt: Date.now(),
            comments
          });
          if (token !== state.videoPostModalToken) return;
          if (String(state.videoPostModalEventId || '').trim() !== eventId) return;
          const statusEl = qs('#videoPostCommentsStatus');
          if (statusEl) statusEl.textContent = comments.length ? `${formatCount(comments.length)} comments` : 'No comments yet';
          renderVideoPostComments(comments, { token });
        }
      }
    );
  }

  function resolveVideoPostLiveChatAddress(stream) {
    return String((stream && stream.address) || '').trim();
  }

  function resolveVideoPostLiveChatEventId(stream) {
    const id = String((stream && (stream.id || (stream.raw && stream.raw.id))) || '').trim().toLowerCase();
    return /^[0-9a-f]{64}$/i.test(id) ? id : '';
  }

  function buildVideoPostLiveChatFilters(stream) {
    const streamAddress = resolveVideoPostLiveChatAddress(stream);
    if (!streamAddress) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    const streamStart = Number(stream && (stream.starts || stream.created_at) || 0) || 0;
    const chatSince = streamStart
      ? Math.max(0, streamStart - 60 * 60 * 2)
      : (nowSec - 60 * 60 * 24);
    const historyLimit = 420;
    const filters = [{
      kinds: [KIND_LIVE_CHAT],
      '#a': [streamAddress],
      limit: historyLimit,
      since: chatSince
    }];
    const streamEventId = resolveVideoPostLiveChatEventId(stream);
    if (streamEventId) {
      filters.push({
        kinds: [KIND_LIVE_CHAT],
        '#e': [streamEventId],
        limit: historyLimit,
        since: chatSince
      });
    }
    return filters;
  }

  function videoPostLiveChatTargetsStream(ev, stream) {
    if (!ev) return false;
    const streamAddress = resolveVideoPostLiveChatAddress(stream);
    const streamEventId = resolveVideoPostLiveChatEventId(stream);
    const aRefs = allTagValues(ev.tags, 'a').map((ref) => String(ref || '').trim());
    const eRefs = allTagValues(ev.tags, 'e')
      .map((ref) => String(ref || '').trim().toLowerCase())
      .filter((ref) => /^[0-9a-f]{64}$/.test(ref));
    if (streamAddress && aRefs.includes(streamAddress)) return true;
    if (streamEventId && eRefs.includes(streamEventId)) return true;
    return false;
  }

  function stopVideoPostLiveChatSubscription() {
    if (!state.videoPostLiveChatSubId || !state.pool) {
      state.videoPostLiveChatSubId = null;
      return;
    }
    try {
      state.pool.unsubscribe(state.videoPostLiveChatSubId);
    } catch (_) {}
    state.videoPostLiveChatSubId = null;
  }

  function upsertVideoPostLiveChatCache(stream, incoming, opts = {}) {
    const streamAddress = resolveVideoPostLiveChatAddress(stream);
    if (!streamAddress) return [];
    const reset = !!opts.reset;
    const existingEntry = state.videoPostLiveChatCacheByAddress.get(streamAddress);
    const current = !reset && existingEntry && Array.isArray(existingEntry.messages) ? existingEntry.messages : [];
    const merged = new Map();
    [...current, ...((Array.isArray(incoming) ? incoming : [incoming]).filter(Boolean))].forEach((ev) => {
      if (!ev || ev.kind !== KIND_LIVE_CHAT || !ev.id) return;
      if (!videoPostLiveChatTargetsStream(ev, stream)) return;
      const prev = merged.get(ev.id);
      if (!prev || Number(prev.created_at || 0) <= Number(ev.created_at || 0)) {
        merged.set(ev.id, ev);
      }
    });
    const messages = Array.from(merged.values())
      .sort((a, b) => Number(a && a.created_at || 0) - Number(b && b.created_at || 0));
    state.videoPostLiveChatCacheByAddress.set(streamAddress, {
      savedAt: Date.now(),
      messages
    });
    return messages;
  }

  function renderVideoPostLiveChat(messages, opts = {}) {
    const listEl = qs('#videoPostCommentsList');
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.classList.add('video-post-live-chat-list');

    const normalizedMessages = Array.isArray(messages) ? messages : [];
    if (!normalizedMessages.length) {
      listEl.innerHTML = '<div class="video-post-empty">No live chat yet.</div>';
      return;
    }

    const token = Number(opts.token || 0);
    const skipProfileHydrate = !!opts.skipProfileHydrate;
    const missingPubkeys = new Set();
    const frag = document.createDocumentFragment();

    normalizedMessages.forEach((ev) => {
      if (!ev || !ev.id) return;
      const messagePubkey = normalizePubkeyHex(ev.pubkey || '') || String(ev.pubkey || '').trim().toLowerCase();
      const profile = profileFor(messagePubkey);
      const displayName = profile.display_name || profile.name || shortHex(messagePubkey);
      const verifiedNip05 = getVerifiedNip05ForPubkey(messagePubkey, profile.nip05 || '');

      const row = document.createElement('div');
      row.className = 'cmsg video-post-live-chat-item';
      row.dataset.pubkey = messagePubkey;
      row.innerHTML = '<div class="c-av"></div><div class="c-body"><div class="c-name-row"><span class="c-name"></span><span class="c-time"></span></div><div class="c-text"></div></div>';

      const avatarEl = qs('.c-av', row);
      if (avatarEl) {
        setAvatarEl(avatarEl, profile.picture || '', pickAvatar(messagePubkey));
        avatarEl.classList.toggle('nip05-square', !!verifiedNip05);
        avatarEl.onclick = () => showProfileByPubkey(messagePubkey);
      }

      const nameEl = qs('.c-name', row);
      if (nameEl) {
        nameEl.textContent = displayName;
        nameEl.onclick = () => showProfileByPubkey(messagePubkey);
      }

      const timeEl = qs('.c-time', row);
      if (timeEl) {
        timeEl.textContent = formatChatTimestamp(ev.created_at);
        try { timeEl.title = new Date(Number(ev.created_at || 0) * 1000).toLocaleString(); } catch (_) {}
      }

      const textEl = qs('.c-text', row);
      if (textEl) {
        const rawText = String(ev.content || '');
        const allUrls = Array.from(new Set(
          extractHttpUrls(rawText)
            .map((url) => sanitizeMediaUrl(url))
            .filter(Boolean)
        ));
        const mediaItems = allUrls
          .map((url) => ({ url, kind: classifyMediaUrl(url) }))
          .filter((item) => item.kind === 'photo' || item.kind === 'video' || item.kind === 'audio');
        const mediaUrls = mediaItems.map((item) => item.url);
        const renderText = mediaUrls.length ? stripMediaUrlsFromText(rawText, mediaUrls) : rawText;
        textEl.innerHTML = '';
        if (renderText) textEl.appendChild(renderNostrContent(renderText));
        renderChatInlineMedia(textEl, mediaItems, {
          allowVideo: true,
          classPrefix: 'chat',
          maxItems: 4,
          videoAutoplay: false,
          videoMuted: false,
          videoLoop: false
        });
      }

      if (!skipProfileHydrate && messagePubkey && !state.profilesByPubkey.has(messagePubkey)) {
        missingPubkeys.add(messagePubkey);
      }
      frag.appendChild(row);
    });
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;

    if (!skipProfileHydrate && missingPubkeys.size) {
      Promise.allSettled(Array.from(missingPubkeys).map((pubkey) => fetchProfileIfNeeded(pubkey))).then(() => {
        if (token !== state.videoPostModalToken) return;
        renderVideoPostLiveChat(normalizedMessages, { token, skipProfileHydrate: true });
      });
    }
  }

  function fetchVideoPostLiveChat(stream, opts = {}) {
    const streamAddress = resolveVideoPostLiveChatAddress(stream);
    if (!streamAddress) return Promise.resolve([]);
    const force = !!opts.force;
    const cacheEntry = state.videoPostLiveChatCacheByAddress.get(streamAddress);
    if (!force && cacheEntry && (Date.now() - Number(cacheEntry.savedAt || 0)) < 25000) {
      return Promise.resolve(Array.isArray(cacheEntry.messages) ? cacheEntry.messages : []);
    }
    const filters = buildVideoPostLiveChatFilters(stream);
    if (!filters.length) return Promise.resolve([]);

    return fetchEventsCached(
      filters,
      {
        scope: 'video-post-live-chat',
        cacheKey: `video-post-live-chat:${streamAddress}`,
        timeoutMs: 4200,
        maxEvents: 900
      }
    ).then((events) => upsertVideoPostLiveChatCache(stream, events, { reset: false }))
      .catch(() => (cacheEntry && Array.isArray(cacheEntry.messages) ? cacheEntry.messages : []));
  }

  function subscribeVideoPostLiveChat(stream, token) {
    stopVideoPostLiveChatSubscription();
    if (!state.pool) return;
    const streamAddress = resolveVideoPostLiveChatAddress(stream);
    if (!streamAddress) return;
    const filters = buildVideoPostLiveChatFilters(stream);
    if (!filters.length) return;

    state.videoPostLiveChatSubId = state.pool.subscribe(
      filters,
      {
        event: (ev) => {
          if (!ev || ev.kind !== KIND_LIVE_CHAT || !ev.id) return;
          if (!videoPostLiveChatTargetsStream(ev, stream)) return;
          const messages = upsertVideoPostLiveChatCache(stream, [ev], { reset: false });
          if (token !== state.videoPostModalToken) return;
          if (!state.videoPostModalIsWatchParty) return;
          const statusEl = qs('#videoPostCommentsStatus');
          if (statusEl) statusEl.textContent = messages.length ? `${formatCount(messages.length)} messages` : 'No live chat yet';
          renderVideoPostLiveChat(messages, { token });
        }
      }
    );
  }

  function refreshVideoPostCommentComposerState() {
    const input = qs('#videoPostCommentInput');
    const commentBtn = qs('#videoPostCommentBtn');
    const attachBtn = qs('#videoPostCommentAttachBtn');
    const isWatchParty = !!state.videoPostModalIsWatchParty;
    const hasTarget = isWatchParty
      ? !!resolveVideoPostLiveChatAddress(state.videoPostModalStream)
      : !!String(state.videoPostModalEventId || resolveVideoPostEventId(state.videoPostModalStream) || '').trim();
    if (input) {
      input.disabled = !hasTarget;
      input.placeholder = hasTarget
        ? (isWatchParty ? 'Send a message...' : 'Write a comment...')
        : (isWatchParty ? 'Live chat unavailable for this stream.' : 'Comments unavailable for this item.');
      if (!hasTarget) input.value = '';
    }
    if (commentBtn) commentBtn.disabled = !hasTarget;
    if (attachBtn) attachBtn.disabled = !hasTarget;
  }

  function bindVideoPostCommentComposer() {
    const input = qs('#videoPostCommentInput');
    const commentBtn = qs('#videoPostCommentBtn');
    const attachBtn = qs('#videoPostCommentAttachBtn');
    const markupBtns = qsa('.video-post-comment-markup [data-action]');
    if (!input || !commentBtn) return;
    if (!input.id) input.id = 'videoPostCommentInput';
    if (attachBtn) {
      attachBtn.onclick = () => {
        const hasTarget = state.videoPostModalIsWatchParty
          ? !!resolveVideoPostLiveChatAddress(state.videoPostModalStream)
          : !!String(state.videoPostModalEventId || '').trim();
        if (!hasTarget) return;
        window.openComposeUploadModal(`textarea:${input.id}`);
      };
    }

    if (Array.isArray(markupBtns) && markupBtns.length) {
      markupBtns.forEach((btn) => {
        btn.onclick = () => {
          const action = String(btn.dataset.action || '').trim().toLowerCase();
          if (!action) return;
          applyNostrMarkupToTextarea(input, action);
        };
      });
    }

    input.onkeydown = (event) => {
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      commentBtn.click();
    };

    commentBtn.onclick = async () => {
      const content = String(input.value || '').trim();
      if (!content) return;
      if (!state.user) {
        window.openLogin();
        return;
      }

      if (state.videoPostModalIsWatchParty) {
        const stream = state.videoPostModalStream;
        const streamAddress = resolveVideoPostLiveChatAddress(stream);
        if (!streamAddress) return;
        commentBtn.disabled = true;
        const originalText = commentBtn.textContent;
        commentBtn.textContent = 'Sending...';
        try {
          const tags = [['a', streamAddress]];
          const streamEventId = resolveVideoPostLiveChatEventId(stream);
          if (streamEventId) tags.push(['e', streamEventId]);
          const targetPubkey = normalizePubkeyHex((stream && (stream.pubkey || stream.hostPubkey)) || '') || String((stream && (stream.pubkey || stream.hostPubkey)) || '').trim().toLowerCase();
          if (targetPubkey) tags.push(['p', targetPubkey]);
          const signed = await signAndPublish(KIND_LIVE_CHAT, content, tags);
          input.value = '';
          const messages = upsertVideoPostLiveChatCache(stream, [signed], { reset: false });
          const statusEl = qs('#videoPostCommentsStatus');
          if (statusEl) statusEl.textContent = messages.length ? `${formatCount(messages.length)} messages` : 'No live chat yet';
          renderVideoPostLiveChat(messages, { token: state.videoPostModalToken });
        } catch (err) {
          alert(err && err.message ? err.message : 'Could not send chat message. Please try again.');
        } finally {
          commentBtn.disabled = false;
          commentBtn.textContent = originalText;
        }
        return;
      }

      const eventId = String(state.videoPostModalEventId || resolveVideoPostEventId(state.videoPostModalStream) || '').trim();
      const targetPubkey = String(state.videoPostModalHostPubkey || '').trim();
      if (!eventId) return;
      commentBtn.disabled = true;
      const originalText = commentBtn.textContent;
      commentBtn.textContent = 'Posting...';
      try {
        const tags = [['e', eventId], ['e', eventId, '', 'root']];
        if (targetPubkey) tags.push(['p', targetPubkey]);
        const signed = await signAndPublish(1, content, tags);
        input.value = '';

        const cacheEntry = state.videoPostCommentsCacheByEventId.get(eventId);
        const current = cacheEntry && Array.isArray(cacheEntry.comments) ? cacheEntry.comments : [];
        const dedup = new Map();
        [...current, signed].forEach((ev) => {
          if (!ev || !ev.id) return;
          const existing = dedup.get(ev.id);
          if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) dedup.set(ev.id, ev);
        });
        const updatedComments = Array.from(dedup.values())
          .sort((a, b) => Number(a && a.created_at || 0) - Number(b && b.created_at || 0));
        state.videoPostCommentsCacheByEventId.set(eventId, {
          savedAt: Date.now(),
          comments: updatedComments
        });

        if (String(state.videoPostModalEventId || '').trim() === eventId) {
          const statusEl = qs('#videoPostCommentsStatus');
          if (statusEl) statusEl.textContent = updatedComments.length ? `${formatCount(updatedComments.length)} comments` : 'No comments yet';
          renderVideoPostComments(updatedComments, { token: state.videoPostModalToken });
        }

        window.setTimeout(() => {
          fetchVideoPostComments(state.videoPostModalStream || { id: eventId, raw: { id: eventId } }, { force: true })
            .then((freshComments) => {
              if (String(state.videoPostModalEventId || '').trim() !== eventId) return;
              const statusEl = qs('#videoPostCommentsStatus');
              if (statusEl) statusEl.textContent = freshComments.length ? `${formatCount(freshComments.length)} comments` : 'No comments yet';
              renderVideoPostComments(freshComments, { token: state.videoPostModalToken });
            })
            .catch(() => {});
        }, 1600);
      } catch (err) {
        alert(err && err.message ? err.message : 'Could not post comment. Please try again.');
      } finally {
        commentBtn.disabled = false;
        commentBtn.textContent = originalText;
      }
    };

    refreshVideoPostCommentComposerState();
  }

  function openVideoPostModal(stream) {
    if (!stream) return;
    const ov = qs('#videoPostModal');
    if (!ov) return;
    const modalCardEl = qs('#videoPostModal .video-post-modal');

    state.videoPostModalToken += 1;
    const token = state.videoPostModalToken;
    stopVideoPostCommentsSubscription();
    stopVideoPostLiveChatSubscription();
    state.videoPostModalStream = stream;
    state.videoPostModalEventId = resolveVideoPostEventId(stream);
    state.videoPostModalIsWatchParty = isWatchPartyStream(stream);
    if (modalCardEl) modalCardEl.classList.toggle('video-post-watch-party', !!state.videoPostModalIsWatchParty);

    const hostPubkey = normalizePubkeyHex(stream.hostPubkey || stream.pubkey || '') || String(stream.hostPubkey || stream.pubkey || '').trim().toLowerCase();
    state.videoPostModalHostPubkey = hostPubkey;
    if (hostPubkey && !state.profilesByPubkey.has(hostPubkey)) {
      fetchProfileIfNeeded(hostPubkey).then(() => {
        if (token !== state.videoPostModalToken) return;
        renderVideoPostModalHeader(stream, token);
      }).catch(() => {});
    }

    renderVideoPostModalHeader(stream, token);

    const body = buildVideoPostBody(stream);
    const bodyTextEl = qs('#videoPostBodyText');
    const bodyMediaEl = qs('#videoPostBodyMedia');
    if (bodyTextEl) {
      bodyTextEl.innerHTML = '';
      if (body.text) bodyTextEl.appendChild(renderNostrContent(body.text));
      else bodyTextEl.textContent = 'No post text provided.';
    }
    if (bodyMediaEl) {
      bodyMediaEl.innerHTML = '';
      renderChatInlineMedia(bodyMediaEl, body.mediaItems, {
        allowVideo: true,
        classPrefix: 'video-post',
        maxItems: 8,
        videoAutoplay: false,
        videoMuted: false,
        videoLoop: false
      });
    }

    const commentsStatusEl = qs('#videoPostCommentsStatus');
    const commentsListEl = qs('#videoPostCommentsList');
    const commentsHeadEl = qs('#videoPostCommentsHead');
    if (commentsHeadEl) commentsHeadEl.textContent = state.videoPostModalIsWatchParty ? 'Live Chat' : 'Comments';
    const commentBtnEl = qs('#videoPostCommentBtn');
    if (commentBtnEl) commentBtnEl.textContent = state.videoPostModalIsWatchParty ? 'Send' : 'Comment';
    if (commentsListEl) commentsListEl.classList.toggle('video-post-live-chat-list', !!state.videoPostModalIsWatchParty);
    if (state.videoPostModalIsWatchParty) {
      if (commentsStatusEl) commentsStatusEl.textContent = 'Loading live chat...';
      if (commentsListEl) commentsListEl.innerHTML = '<div class="video-post-empty">Loading live chat...</div>';
    } else {
      if (commentsStatusEl) commentsStatusEl.textContent = state.videoPostModalEventId ? 'Loading comments...' : 'Comments unavailable for this item';
      if (commentsListEl) commentsListEl.innerHTML = state.videoPostModalEventId
        ? '<div class="video-post-empty">Loading comments...</div>'
        : '<div class="video-post-empty">Comments unavailable for this item.</div>';
    }
    bindVideoPostCommentComposer();
    refreshVideoPostCommentComposerState();
    const commentInputEl = qs('#videoPostCommentInput');
    if (commentInputEl) commentInputEl.value = '';

    mountVideoPostModalPlayer(stream.streaming || '', token).catch(() => {});

    if (state.videoPostModalIsWatchParty) {
      fetchVideoPostLiveChat(stream, { force: true }).then((messages) => {
        if (token !== state.videoPostModalToken) return;
        if (commentsStatusEl) commentsStatusEl.textContent = messages.length ? `${formatCount(messages.length)} messages` : 'No live chat yet';
        renderVideoPostLiveChat(messages, { token });
      }).catch(() => {
        if (token !== state.videoPostModalToken) return;
        if (commentsStatusEl) commentsStatusEl.textContent = 'Could not load live chat right now';
        if (commentsListEl) commentsListEl.innerHTML = '<div class="video-post-empty">Could not load live chat right now.</div>';
      });
      subscribeVideoPostLiveChat(stream, token);
    } else if (state.videoPostModalEventId) {
      fetchVideoPostComments(stream, { force: true }).then((comments) => {
        if (token !== state.videoPostModalToken) return;
        if (commentsStatusEl) commentsStatusEl.textContent = comments.length ? `${formatCount(comments.length)} comments` : 'No comments yet';
        renderVideoPostComments(comments, { token });
      }).catch(() => {
        if (token !== state.videoPostModalToken) return;
        if (commentsStatusEl) commentsStatusEl.textContent = 'Could not load comments right now';
        if (commentsListEl) commentsListEl.innerHTML = '<div class="video-post-empty">Could not load comments right now.</div>';
      });
      subscribeVideoPostComments(stream, token);
    }

    ov.classList.add('open');
  }

  function profileFor(pubkey) {
    const normalizedPubkey = normalizePubkeyHex(pubkey || '') || String(pubkey || '').trim().toLowerCase();
    const profile = (normalizedPubkey && state.profilesByPubkey.get(normalizedPubkey))
      || state.profilesByPubkey.get(pubkey);
    if (profile) return profile;
    return {
      pubkey: normalizedPubkey || pubkey,
      name: shortHex(normalizedPubkey || pubkey),
      about: '',
      picture: '',
      banner: '',
      website: '',
      nip05: '',
      lud16: '',
      twitter: '',
      github: ''
    };
  }

  /* =====================================================================
     NIP-51 PEOPLE LISTS + FOLLOWING LIVE SECTION
     ===================================================================== */

  function loadSavedExternalLists() {
    try {
      const raw = localStorage.getItem(SAVED_LISTS_STORAGE_KEY);
      state.savedExternalLists = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(state.savedExternalLists)) state.savedExternalLists = [];
    } catch (_) {
      state.savedExternalLists = [];
    }
  }

  function persistSavedExternalLists() {
    try {
      localStorage.setItem(SAVED_LISTS_STORAGE_KEY, JSON.stringify(state.savedExternalLists));
    } catch (_) {}
  }

  function loadPersistedNostrFeedFilter() {
    try {
      const raw = (localStorage.getItem(NOSTR_FEED_FILTER_STORAGE_KEY) || '').trim();
      if (!raw) return;
      state.nostrFeedFilter = raw;
    } catch (_) {
      // no-op
    }
  }

  function persistNostrFeedFilter() {
    try {
      localStorage.setItem(NOSTR_FEED_FILTER_STORAGE_KEY, String(state.nostrFeedFilter || 'following'));
    } catch (_) {
      // no-op
    }
  }

  function parseNip51PeopleList(ev) {
    const tagMap = parseTags(ev.tags || []);
    const dTag = firstTag(tagMap, 'd') || '';
    const d = dTag || `event-${String(ev.id || '').slice(0, 16) || Number(ev.created_at || 0)}`;
    const name = firstTag(tagMap, 'name') || firstTag(tagMap, 'title') || d || 'Unnamed list';
    const pubkeys = (ev.tags || [])
      .filter((t) => t[0] === 'p' && t[1] && /^[0-9a-f]{64}$/i.test(t[1]))
      .map((t) => normalizePubkeyHex(t[1]))
      .filter(Boolean);
    return {
      id: `${ev.kind}:${ev.pubkey}:${d}`,
      name,
      pubkeys: Array.from(new Set(pubkeys)),
      kind: ev.kind,
      d,
      pubkey: ev.pubkey,
      eventId: ev.id || '',
      created_at: Number(ev.created_at || 0) || 0
    };
  }

  // Subscribe to user's kind:3 (contacts) and kind:30000 (people lists)
  function subscribeUserLists(pubkey) {
    const normalizedUser = normalizePubkeyHex(pubkey);
    if (!normalizedUser) return;
    state.nip51Lists = new Map();
    renderListFilterDD();
    renderLiveGrid();
    if (isMessagesPageVisible()) renderDmContactSelect();

    // Unsubscribe old
    if (state.nip51SubId) { state.pool.unsubscribe(state.nip51SubId); state.nip51SubId = null; }
    if (state.contactsSubId) { state.pool.unsubscribe(state.contactsSubId); state.contactsSubId = null; }
    let latestContactsCreated = 0;

    // Kind 3: contact list
    state.contactsSubId = state.pool.subscribe(
      [{ kinds: [KIND_CONTACTS], authors: [normalizedUser], limit: 10 }],
      {
        event: (ev) => {
          if (ev.kind !== KIND_CONTACTS) return;
          const created = Number(ev.created_at || 0) || 0;
          if (created < latestContactsCreated) return;
          latestContactsCreated = created;

          if (!captureContactsMetadata(ev)) return;

          const pubs = (ev.tags || [])
            .map((t) => (Array.isArray(t) && t[0] === 'p' ? normalizePubkeyHex(t[1]) : ''))
            .filter(Boolean);
          state.contactListPubkeys = new Set(pubs);

          // Keep app follow state in sync with relay-backed contact list for the logged-in user.
          if (state.user && normalizePubkeyHex(state.user.pubkey) === normalizedUser) {
            state.followedPubkeys = new Set(pubs);
            persistFollowedPubkeys();
            renderFollowingCount();

            const ownStats = state.profileStatsByPubkey.get(normalizedUser) || { followers: 0, following: 0 };
            state.profileStatsByPubkey.set(normalizedUser, {
              followers: Number(ownStats.followers || 0),
              following: pubs.length
            });
            if (normalizePubkeyHex(state.selectedProfilePubkey) === normalizedUser) {
              const followingEl = qs('#profFollowing');
              if (followingEl) followingEl.textContent = formatCount(pubs.length);
            }

            const selectedStream = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
            if (selectedStream && selectedStream.hostPubkey) updateTheaterFollowBtn(selectedStream.hostPubkey);
            if (state.selectedProfilePubkey) renderProfileFollowButton(state.selectedProfilePubkey);
          }

          renderLiveGrid();
          if (isMessagesPageVisible()) renderDmContactSelect();
        }
      }
    );

    // Kind 30000: NIP-51 people lists
    state.nip51SubId = state.pool.subscribe(
      [{ kinds: [KIND_PEOPLE_LIST], authors: [normalizedUser], limit: 50 }],
      {
        event: (ev) => {
          if (ev.kind !== KIND_PEOPLE_LIST) return;
          const list = parseNip51PeopleList(ev);
          const existing = state.nip51Lists.get(list.id);
          const incomingTs = Number(list.created_at || 0);
          const existingTs = Number(existing && existing.created_at || 0);
          if (existing && existingTs > incomingTs) return;
          state.nip51Lists.set(list.id, list);
          renderListFilterDD();
          renderLiveGrid();
          if (isMessagesPageVisible()) renderDmContactSelect();
        }
      }
    );
  }

  // Subscribe to an external NIP-51 list by naddr (kind:30000:pubkey:d)
  function subscribeExternalList(naddrOrUrl, onDone) {
    let naddr = naddrOrUrl.trim();

    // Handle Liststr URLs: https://listr.lol/a/naddr1...
    const listrMatch = naddr.match(/\/a\/(naddr1[a-z0-9]+)/i);
    if (listrMatch) naddr = listrMatch[1];

    // Strip trailing slashes or query params
    naddr = naddr.split(/[?#]/)[0].trim();

    if (!naddr.startsWith('naddr1')) {
      if (onDone) onDone(null, new Error('Not a valid naddr. Paste an naddr1... or a listr.lol URL.'));
      return;
    }

    // Decode via NostrTools
    ensureNostrTools().then((tools) => {
      let decoded;
      try {
        decoded = tools.nip19.decode(naddr);
      } catch (e) {
        if (onDone) onDone(null, new Error('Could not decode naddr: ' + e.message));
        return;
      }

      if (!decoded || decoded.type !== 'naddr') {
        if (onDone) onDone(null, new Error('Expected naddr type, got: ' + (decoded && decoded.type)));
        return;
      }

      const { kind, pubkey, identifier, relays: hintRelays } = decoded.data;

      const subId = state.pool.subscribe(
        [{ kinds: [kind], authors: [pubkey], '#d': [identifier], limit: 1 }],
        {
          event: (ev) => {
            if (ev.kind !== kind || ev.pubkey !== pubkey) return;
            const list = parseNip51PeopleList(ev);
            state.pool.unsubscribe(subId);

            // Check if already saved
            const existingIdx = state.savedExternalLists.findIndex((l) => l.naddr === naddr);
            const entry = { naddr, name: list.name, pubkeys: list.pubkeys };
            if (existingIdx >= 0) {
              state.savedExternalLists[existingIdx] = entry;
            } else {
              state.savedExternalLists.push(entry);
            }
            persistSavedExternalLists();
            renderListFilterDD();
            if (onDone) onDone(entry, null);
          },
          eose: () => {
            // If no event came back, report to caller
            if (onDone) onDone(null, new Error('List not found on connected relays.'));
          }
        }
      );
    }).catch((e) => {
      if (onDone) onDone(null, e);
    });
  }

  function getListFilterPubkeys(filterId) {
    const f = String(filterId || '').trim();
    if (!f || f === 'all' || f === 'global') return null;
    if (f === 'following') return state.followedPubkeys;
    if (f === 'contacts') return state.contactListPubkeys;

    const nip51 = state.nip51Lists.get(f);
    if (nip51) return new Set(nip51.pubkeys);

    const saved = state.savedExternalLists.find((l) => l.naddr === f);
    if (saved) return new Set(saved.pubkeys);

    return null;
  }

  // Get the pubkeys relevant to the current live-stream filter
  function getPubkeysForFilter() {
    return getListFilterPubkeys(state.activeListFilter);
  }

  /* ---- Dropdown rendering ---- */
  function renderListFilterDD() {
    // NIP-51 owned lists
    const nip51Section = qs('#lf-nip51-section');
    const nip51Items = qs('#lf-nip51-items');
    if (nip51Items) {
      nip51Items.innerHTML = '';
      if (state.nip51Lists.size > 0) {
        if (nip51Section) nip51Section.style.display = '';
        state.nip51Lists.forEach((list) => {
          const btn = document.createElement('button');
          btn.className = 'lf-item' + (state.activeListFilter === list.id ? ' active' : '');
          btn.innerHTML = `<span class="lf-dot"></span><span class="lf-item-name"></span><span class="lf-item-count">${list.pubkeys.length}</span>`;
          qs('.lf-item-name', btn).textContent = list.name;
          btn.addEventListener('click', () => setListFilter(list.id, btn));
          nip51Items.appendChild(btn);
        });
      } else {
        if (nip51Section) nip51Section.style.display = 'none';
      }
    }

    // Saved external lists
    const savedSection = qs('#lf-saved-section');
    const savedItems = qs('#lf-saved-items');
    if (savedItems) {
      savedItems.innerHTML = '';
      if (state.savedExternalLists.length > 0) {
        if (savedSection) savedSection.style.display = '';
        state.savedExternalLists.forEach((entry) => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;';

          const btn = document.createElement('button');
          btn.className = 'lf-item' + (state.activeListFilter === entry.naddr ? ' active' : '');
          btn.style.flex = '1';
          btn.innerHTML = `<span class="lf-dot"></span><span class="lf-item-name"></span><span class="lf-item-count">${entry.pubkeys.length}</span>`;
          qs('.lf-item-name', btn).textContent = entry.name;
          btn.addEventListener('click', () => setListFilter(entry.naddr, btn));

          // Remove button
          const rem = document.createElement('button');
          rem.title = 'Remove list';
          rem.innerHTML = '&times;';
          rem.style.cssText = 'background:none;border:none;color:var(--muted);cursor:pointer;font-size:.9rem;padding:.2rem .4rem;line-height:1;flex-shrink:0;';
          rem.addEventListener('click', (e) => {
            e.stopPropagation();
            state.savedExternalLists = state.savedExternalLists.filter((l) => l.naddr !== entry.naddr);
            persistSavedExternalLists();
            if (state.activeListFilter === entry.naddr) setListFilter('all', qs('#lf-all'));
            else renderListFilterDD();
          });
          rem.addEventListener('mouseover', () => { rem.style.color = 'var(--live)'; });
          rem.addEventListener('mouseout', () => { rem.style.color = 'var(--muted)'; });

          row.appendChild(btn);
          row.appendChild(rem);
          savedItems.appendChild(row);
        });
      } else {
        if (savedSection) savedSection.style.display = 'none';
      }
    }
    renderNostrFeedFilterSelect();
    if (isFeedPageVisible() && state.nostrFeedFilter !== 'global') {
      subscribeNostrFeed();
    }
  }

  function setActiveListFilterBtn(activeId) {
    // Deactivate all items
    qsa('.lf-item').forEach((b) => b.classList.remove('active'));
    const target = qs(`#lf-${activeId}`) || qs(`.lf-item.active`);
    if (target) target.classList.add('active');
  }

  function getFilterLabelText() {
    const f = state.activeListFilter;
    if (f === 'all') return 'All Live';
    if (f === 'following') return 'My Following';
    if (f === 'contacts') return 'Contacts';
    const n51 = state.nip51Lists.get(f);
    if (n51) return n51.name;
    const sv = state.savedExternalLists.find((l) => l.naddr === f);
    if (sv) return sv.name;
    return 'Custom List';
  }

  function renderFollowingCount() {
    const cnt = qs('#lfFollowingCount');
    if (cnt) cnt.textContent = state.followedPubkeys.size || '';
    renderNostrFeedFilterSelect();
    if (isFeedPageVisible() && state.nostrFeedFilter === 'following') {
      subscribeNostrFeed();
    }
  }


  /* ---- Global controls wired to HTML ---- */
  function toggleListFilterDDInternal(e) {
    if (e) e.stopPropagation();
    const dd = qs('#listFilterDD');
    const btn = qs('#listFilterBtn');
    if (!dd || !btn) return;
    const isOpen = dd.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    state.listFilterDDOpen = isOpen;
    if (isOpen) renderListFilterDD();
  }

  function closeListFilterDD() {
    const dd = qs('#listFilterDD');
    const btn = qs('#listFilterBtn');
    if (dd) dd.classList.remove('open');
    if (btn) btn.classList.remove('open');
    state.listFilterDDOpen = false;
  }

  function setListFilterInternal(filterId, clickedBtn) {
    state.activeListFilter = filterId;

    // Update active class
    qsa('.lf-item').forEach((b) => b.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');

    // Update button label
    const label = qs('#listFilterLabel');
    if (label) label.textContent = getFilterLabelText();

    closeListFilterDD();
    renderLiveGrid();
  }

  function lfAddInputChangeInternal(inputEl) {
    // Optional: real-time validation feedback could go here
  }

  function lfAddListInternal() {
    const input = qs('#lfAddInput');
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;

    const btn = qs('.lf-add-btn');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    subscribeExternalList(val, (entry, err) => {
      if (btn) { btn.textContent = 'Add'; btn.disabled = false; }
      if (err) {
        const hint = qs('.lf-add-hint');
        if (hint) { hint.style.color = 'var(--live)'; hint.textContent = err.message; setTimeout(() => { hint.style.color = ''; hint.textContent = 'Paste a Liststr URL or NIP-51 naddr to load a curated list of streamers.'; }, 4000); }
        return;
      }
      input.value = '';
      renderListFilterDD();
      setListFilterInternal(entry.naddr, null);
    });
  }

  function normalizeNostrFeedFilter(filterId) {
    const raw = String(filterId || '').trim();
    if (!raw) return 'following';
    if (raw === 'following' || raw === 'contacts' || raw === 'global') return raw;
    if (state.nip51Lists.has(raw)) return raw;
    if (state.savedExternalLists.some((entry) => entry && entry.naddr === raw)) return raw;
    return 'following';
  }

  function getNostrFeedFilterLabel(filterId) {
    const f = normalizeNostrFeedFilter(filterId);
    if (f === 'following') return 'Following';
    if (f === 'contacts') return 'Contacts';
    if (f === 'global') return 'Global';
    const list = state.nip51Lists.get(f);
    if (list && list.name) return list.name;
    const saved = state.savedExternalLists.find((entry) => entry && entry.naddr === f);
    if (saved && saved.name) return saved.name;
    return 'Following';
  }

  function getNostrFeedFilterOptions() {
    const out = [
      { id: 'following', label: `Following (${state.followedPubkeys.size || 0})` },
      { id: 'global', label: 'Global (all relays)' }
    ];
    if (state.contactListPubkeys.size) {
      out.push({ id: 'contacts', label: `Contacts (${state.contactListPubkeys.size})` });
    }
    if (state.nip51Lists.size) {
      state.nip51Lists.forEach((list) => {
        if (!list || !list.id) return;
        out.push({ id: list.id, label: `${list.name || 'List'} (${(list.pubkeys || []).length || 0})` });
      });
    }
    if (state.savedExternalLists.length) {
      state.savedExternalLists.forEach((entry) => {
        if (!entry || !entry.naddr) return;
        out.push({ id: entry.naddr, label: `${entry.name || 'Saved list'} (${(entry.pubkeys || []).length || 0})` });
      });
    }
    return out;
  }

  function renderNostrFeedFilterSelect() {
    const select = qs('#nostrFeedListSelect');
    if (!select) return;
    const prev = state.nostrFeedFilter;
    const options = getNostrFeedFilterOptions();
    const optionIds = new Set(options.map((entry) => entry.id));
    const fallback = state.followedPubkeys.size ? 'following' : 'global';
    const normalized = normalizeNostrFeedFilter(state.nostrFeedFilter);
    state.nostrFeedFilter = optionIds.has(normalized) ? normalized : fallback;

    select.innerHTML = '';
    options.forEach((entry) => {
      const opt = document.createElement('option');
      opt.value = entry.id;
      opt.textContent = entry.label;
      select.appendChild(opt);
    });
    select.value = state.nostrFeedFilter;
    if (prev !== state.nostrFeedFilter) {
      persistNostrFeedFilter();
      if (isFeedPageVisible()) subscribeNostrFeed();
    }
  }

  function isFeedPageVisible() {
    const page = qs('#feedPage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function isVideosPageVisible() {
    const page = qs('#videosPage');
    if (!page) return false;
    if (window.getComputedStyle) {
      try {
        return window.getComputedStyle(page).display !== 'none';
      } catch (_) {
        // ignore
      }
    }
    return page.style.display !== 'none';
  }

  function notificationTypeEnabled(type) {
    if (type === 'mention') return !!state.settings.notificationsMentions;
    if (type === 'reply') return !!state.settings.notificationsReplies;
    if (type === 'like') return !!state.settings.notificationsLikes;
    if (type === 'repost') return !!state.settings.notificationsReposts;
    if (type === 'zap') return !!state.settings.notificationsZaps;
    if (type === 'follow') return !!state.settings.notificationsFollows;
    return true;
  }

  function notificationTypeLabel(type) {
    if (type === 'mention') return 'Mention';
    if (type === 'reply') return 'Reply';
    if (type === 'like') return 'Like';
    if (type === 'repost') return 'Repost';
    if (type === 'zap') return 'Zap';
    if (type === 'follow') return 'Follow';
    return 'Activity';
  }

  function truncateNotificationText(text, maxLen = 220) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    if (raw.length <= maxLen) return raw;
    return `${raw.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function notificationReactionChipHtml(entry) {
    if (!entry || entry.type !== 'like') return '';
    const reactionKey = String(entry.reactionKey || '').trim();
    if (!reactionKey || reactionKey === '+') return '';
    const reactionLabel = String(entry.reactionLabel || reactionKey).trim() || reactionKey;
    const reactionImageUrl = sanitizeMediaUrl(entry.reactionImageUrl || '');
    if (reactionImageUrl && /^https?:\/\//i.test(reactionImageUrl)) {
      return `<span class="notif-reaction-chip" aria-label="${escapeHtml(reactionLabel)}"><img src="${escapeHtml(reactionImageUrl)}" alt="${escapeHtml(reactionLabel)}"></span>`;
    }
    return `<span class="notif-reaction-chip" aria-label="${escapeHtml(reactionLabel)}">${escapeHtml(reactionLabel)}</span>`;
  }

  function normalizeInlineNostrRefsForRender(text) {
    const source = String(text || '');
    if (!source) return '';
    const token = '(npub1[023456789acdefghjklmnpqrstuvwxyz]+|nprofile1[023456789acdefghjklmnpqrstuvwxyz]+|nevent1[023456789acdefghjklmnpqrstuvwxyz]+|note1[023456789acdefghjklmnpqrstuvwxyz]+|naddr1[023456789acdefghjklmnpqrstuvwxyz]+)';
    const pattern = new RegExp(`(^|[\\s>(\\[\"'])@?${token}(?=$|[\\s)\\],.;!?\"'])`, 'gi');
    return source.replace(pattern, (match, lead, entity) => {
      const safeLead = typeof lead === 'string' ? lead : '';
      const safeEntity = typeof entity === 'string' ? entity : '';
      return `${safeLead}nostr:${safeEntity}`;
    });
  }

  function parseNotificationZapSummary(ev) {
    if (!ev || ev.kind !== KIND_ZAP_RECEIPT) return { sats: 0, senderPubkey: '', note: '', targetId: '', targetPubkeys: [] };
    const tags = ev.tags || [];
    const description = parseJsonSafe(firstTagValue(tags, 'description')) || {};
    const descriptionTags = Array.isArray(description.tags) ? description.tags : [];

    let sats = satsFromAmountTag(firstTagValue(tags, 'amount'));
    if (!sats) sats = satsFromAmountTag(firstTagValue(descriptionTags, 'amount'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(tags, 'bolt11'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(descriptionTags, 'bolt11'));

    const senderPubkey = normalizePubkeyHex(description.pubkey || ev.pubkey || '');
    const note = String(description.content || '').trim();
    const targetFromTags = firstTagValue(tags, 'e');
    const targetFromDesc = firstTagValue(descriptionTags, 'e');
    const targetId = /^[0-9a-f]{64}$/i.test(targetFromTags || '')
      ? String(targetFromTags || '').toLowerCase()
      : (/^[0-9a-f]{64}$/i.test(targetFromDesc || '') ? String(targetFromDesc || '').toLowerCase() : '');
    const targetPubkeys = [...new Set(
      [...allTagValues(tags, 'p'), ...allTagValues(descriptionTags, 'p')]
        .map((pk) => normalizePubkeyHex(pk))
        .filter(Boolean)
    )];

    return { sats: Number(sats || 0), senderPubkey, note, targetId, targetPubkeys };
  }

  function buildNotificationEntry(ev, ownPubkey) {
    if (!ev || !ev.id || !ownPubkey) return null;
    const actorPubkey = normalizePubkeyHex(ev.pubkey || '');
    if (!actorPubkey || actorPubkey === ownPubkey) return null;

    const normalizePRefs = (tags) => [...new Set(
      allTagValues(tags || [], 'p')
        .map((pk) => normalizePubkeyHex(pk))
        .filter(Boolean)
    )];

    if (ev.kind === 1) {
      const pRefs = normalizePRefs(ev.tags);
      if (!pRefs.includes(ownPubkey)) return null;
      const eRefs = allTagValues(ev.tags, 'e').filter((id) => /^[0-9a-f]{64}$/i.test(id));
      const content = String(ev.content || '').trim();
      return {
        id: ev.id,
        created_at: Number(ev.created_at || 0) || 0,
        type: eRefs.length ? 'reply' : 'mention',
        actorPubkey,
        targetId: eRefs.length ? String(eRefs[eRefs.length - 1] || '').toLowerCase() : '',
        summary: truncateNotificationText(content || (eRefs.length ? 'Sent you a reply.' : 'Mentioned you in a note.')),
        raw: ev
      };
    }

    if (ev.kind === KIND_REACTION) {
      const pRefs = normalizePRefs(ev.tags);
      if (!pRefs.includes(ownPubkey)) return null;
      const reactionMeta = parseReactionMeta(ev.content, ev.tags);
      if (!reactionMeta) return null;
      const target = firstTagValue(ev.tags, 'e');
      const targetId = /^[0-9a-f]{64}$/i.test(target || '') ? String(target || '').toLowerCase() : '';
      const isLike = reactionMeta.key === '+';
      const reactionLabel = reactionMeta.label || reactionMeta.key || '';
      return {
        id: ev.id,
        created_at: Number(ev.created_at || 0) || 0,
        type: 'like',
        actorPubkey,
        targetId,
        summary: isLike
          ? (targetId ? 'Liked one of your notes.' : 'Liked your content.')
          : (targetId ? `Reacted to your post with ${reactionLabel}.` : `Reacted with ${reactionLabel}.`),
        reactionKey: reactionMeta.key || '',
        reactionLabel,
        reactionImageUrl: reactionMeta.imageUrl || '',
        reactionShortcode: reactionMeta.shortcode || '',
        raw: ev
      };
    }

    if (ev.kind === 6) {
      const pRefs = normalizePRefs(ev.tags);
      if (!pRefs.includes(ownPubkey)) return null;
      const target = allTagValues(ev.tags, 'e');
      const ref = target.length ? target[target.length - 1] : '';
      const targetId = /^[0-9a-f]{64}$/i.test(ref || '') ? String(ref || '').toLowerCase() : '';
      return {
        id: ev.id,
        created_at: Number(ev.created_at || 0) || 0,
        type: 'repost',
        actorPubkey,
        targetId,
        summary: 'Boosted your note.',
        raw: ev
      };
    }

    if (ev.kind === KIND_ZAP_RECEIPT) {
      const zap = parseNotificationZapSummary(ev);
      if (!Array.isArray(zap.targetPubkeys) || !zap.targetPubkeys.includes(ownPubkey)) return null;
      const senderPubkey = normalizePubkeyHex(zap.senderPubkey || actorPubkey);
      if (!senderPubkey || senderPubkey === ownPubkey) return null;
      const sats = Number(zap.sats || 0);
      const summary = truncateNotificationText(
        zap.note || (sats > 0 ? `Sent you ${formatCount(sats)} sats.` : 'Sent you a zap.')
      );
      return {
        id: ev.id,
        created_at: Number(ev.created_at || 0) || 0,
        type: 'zap',
        actorPubkey: senderPubkey,
        targetId: zap.targetId || '',
        sats,
        summary,
        raw: ev
      };
    }

    if (ev.kind === KIND_CONTACTS) {
      const pRefs = normalizePRefs(ev.tags);
      if (!pRefs.includes(ownPubkey)) return null;
      return {
        id: ev.id,
        created_at: Number(ev.created_at || 0) || 0,
        type: 'follow',
        actorPubkey,
        targetId: '',
        summary: 'Started following you.',
        raw: ev
      };
    }

    return null;
  }

  function notificationSortComparator(a, b) {
    const at = Number(a && a.created_at || 0);
    const bt = Number(b && b.created_at || 0);
    if (at !== bt) return bt - at;
    return String(b && b.id || '').localeCompare(String(a && a.id || ''));
  }

  function visibleNotificationEntries() {
    return Array.from(state.notificationsById.values())
      .filter((entry) => notificationTypeEnabled(entry.type))
      .sort(notificationSortComparator);
  }

  function notificationUnreadCount() {
    const lastRead = Number(state.notificationsLastReadAt || 0);
    return visibleNotificationEntries()
      .filter((entry) => Number(entry.created_at || 0) > lastRead)
      .length;
  }

  function renderNotificationsBell() {
    const badgeEl = qs('#navNotifCount');
    const menuBadgeEl = qs('#navNotifMenuCount');
    if (!state.user) {
      if (badgeEl) badgeEl.style.display = 'none';
      if (menuBadgeEl) menuBadgeEl.style.display = 'none';
      return;
    }

    const unread = notificationUnreadCount();
    const label = unread > 99 ? '99+' : String(unread);
    if (badgeEl) {
      if (unread > 0) {
        badgeEl.textContent = label;
        badgeEl.style.display = 'inline-flex';
      } else {
        badgeEl.style.display = 'none';
      }
    }
    if (menuBadgeEl) {
      if (unread > 0) {
        menuBadgeEl.textContent = label;
        menuBadgeEl.style.display = 'inline-flex';
      } else {
        menuBadgeEl.style.display = 'none';
      }
    }
  }

  function fetchNotificationProfileIfNeeded(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return;
    if (state.profilesByPubkey.has(key)) return;
    if (state.notificationsProfileFetchPending.has(key)) return;
    state.notificationsProfileFetchPending.add(key);
    fetchProfileIfNeeded(key)
      .then(() => {
        renderNotificationsBell();
        if (isNotificationsPageVisible()) renderNotifications();
      })
      .catch(() => {})
      .finally(() => {
        state.notificationsProfileFetchPending.delete(key);
      });
  }

  function renderNotifications() {
    const listEl = qs('#notificationsList');
    const statusEl = qs('#notificationsStatus');
    if (!listEl) return;

    if (!state.user) {
      listEl.innerHTML = '<div class="notif-empty">Log in to load your notifications.</div>';
      if (statusEl) {
        statusEl.style.color = '';
        statusEl.textContent = 'Not logged in.';
      }
      return;
    }

    const entries = visibleNotificationEntries();
    const unread = notificationUnreadCount();
    const lastRead = Number(state.notificationsLastReadAt || 0);

    if (statusEl) {
      if (state.notificationsError) {
        statusEl.style.color = 'var(--live)';
        statusEl.textContent = state.notificationsError;
      } else if (state.notificationsLoading) {
        statusEl.style.color = '';
        statusEl.innerHTML = '<span class="lf-spinner"></span>Loading notifications...';
      } else {
        statusEl.style.color = '';
        statusEl.textContent = `${entries.length} notifications - ${unread} unread`;
      }
    }

    listEl.innerHTML = '';
    if (!entries.length) {
      listEl.innerHTML = '<div class="notif-empty">No notifications for your selected settings yet.</div>';
      return;
    }

    entries.forEach((entry) => {
      const actorPubkey = normalizePubkeyHex(entry.actorPubkey || '');
      const actorProfile = profileFor(actorPubkey);
      const actorName = actorProfile.display_name || actorProfile.name || shortHex(actorPubkey);
      const actorPicture = actorProfile.picture || '';
      const isUnread = Number(entry.created_at || 0) > lastRead;
      const typeLabel = notificationTypeLabel(entry.type);
      const timeText = `${formatTimeAgo(entry.created_at)} ago`;
      const verifiedNip05 = getVerifiedNip05ForPubkey(actorPubkey, actorProfile.nip05 || '');

      let actionText = 'sent activity';
      if (entry.type === 'mention') actionText = 'mentioned you';
      else if (entry.type === 'reply') actionText = 'replied to you';
      else if (entry.type === 'like') actionText = (entry.reactionKey && entry.reactionKey !== '+')
        ? 'reacted to your post'
        : 'liked your post';
      else if (entry.type === 'repost') actionText = 'boosted your post';
      else if (entry.type === 'follow') actionText = 'followed you';
      else if (entry.type === 'zap') actionText = entry.sats > 0
        ? `zapped you ${formatCount(entry.sats)} sats`
        : 'sent you a zap';

      const row = document.createElement('article');
      row.className = `notif-item type-${entry.type}${isUnread ? ' unread' : ''}`;
      row.dataset.notificationId = entry.id;
      row.dataset.pubkey = actorPubkey;
      row.innerHTML = '<div class="notif-av"></div><div class="notif-main"><div class="notif-top"><div class="notif-label"></div><div class="notif-time"></div></div><span class="notif-type-chip"></span><div class="notif-text"></div><div class="notif-post-preview" style="display:none"></div></div>';

      const avEl = qs('.notif-av', row);
      setAvatarEl(avEl, actorPicture, pickAvatar(actorPubkey || actorName));
      avEl.classList.toggle('nip05-square', !!verifiedNip05);
      if (!verifiedNip05 && normalizeNip05Value(actorProfile.nip05 || '')) {
        ensureNip05Verification(actorPubkey, actorProfile.nip05 || '').catch(() => {});
      }
      avEl.addEventListener('click', (e) => {
        e.stopPropagation();
        showProfileByPubkey(actorPubkey);
      });

      const labelEl = qs('.notif-label', row);
      const reactionChipHtml = notificationReactionChipHtml(entry);
      labelEl.innerHTML = `<strong>${escapeHtml(actorName)}</strong> ${escapeHtml(actionText)}${reactionChipHtml ? ` ${reactionChipHtml}` : ''}`;
      const strongEl = qs('strong', labelEl);
      if (strongEl) {
        strongEl.addEventListener('click', (e) => {
          e.stopPropagation();
          showProfileByPubkey(actorPubkey);
        });
      }

      const timeEl = qs('.notif-time', row);
      timeEl.textContent = timeText;
      try { timeEl.title = new Date(Number(entry.created_at || 0) * 1000).toLocaleString(); } catch (_) {}

      const chipEl = qs('.notif-type-chip', row);
      chipEl.textContent = (entry.type === 'like' && entry.reactionKey && entry.reactionKey !== '+') ? 'Reaction' : typeLabel;

      const textEl = qs('.notif-text', row);
      const summary = truncateNotificationText(entry.summary || '');
      if (summary) {
        textEl.textContent = summary;
      } else {
        textEl.style.display = 'none';
      }

      const previewEl = qs('.notif-post-preview', row);
      if (previewEl) {
        previewEl.addEventListener('click', (evt) => evt.stopPropagation());
        renderNotificationTargetPreview(previewEl, entry);
      }

      row.addEventListener('click', () => {
        showProfileByPubkey(actorPubkey);
      });
      listEl.appendChild(row);

      if (actorPubkey) fetchNotificationProfileIfNeeded(actorPubkey);
    });
  }

  function notificationFiltersForUser(pubkey, opts = {}) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return [];
    const now = Math.floor(Date.now() / 1000);
    const sinceSec = Math.max(0, Number(opts.sinceSec || (now - 60 * 60 * 24 * 21)));
    const limit = Math.max(60, Number(opts.limit || 420));
    return [
      { kinds: [1], '#p': [key], since: sinceSec, limit },
      { kinds: [KIND_REACTION], '#p': [key], since: sinceSec, limit },
      { kinds: [6], '#p': [key], since: sinceSec, limit },
      { kinds: [KIND_ZAP_RECEIPT], '#p': [key], since: sinceSec, limit },
      { kinds: [KIND_CONTACTS], '#p': [key], since: sinceSec, limit: Math.min(limit, 260) }
    ];
  }

  function notificationTargetPreviewState(entry) {
    if (!entry || entry.type !== 'like') return { state: 'none', note: null };
    const targetId = String(entry.targetId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(targetId)) return { state: 'none', note: null };
    if (!state.notificationsTargetNotesById.has(targetId)) return { state: 'loading', note: null };
    const targetNote = state.notificationsTargetNotesById.get(targetId);
    if (!targetNote || targetNote.__missing) return { state: 'missing', note: null };
    return { state: 'ready', note: targetNote };
  }

  function renderNotificationTargetPreview(previewEl, entry) {
    if (!previewEl) return;
    previewEl.innerHTML = '';
    previewEl.style.display = 'none';

    const preview = notificationTargetPreviewState(entry);
    if (preview.state === 'none') return;
    if (preview.state === 'loading') {
      previewEl.textContent = 'Loading post...';
      previewEl.style.display = 'block';
      return;
    }
    if (preview.state === 'missing') {
      previewEl.textContent = 'Post unavailable.';
      previewEl.style.display = 'block';
      return;
    }

    const targetNote = preview.note;
    const urls = extractMediaUrlsFromEvent(targetNote);
    const mediaItems = urls
      .map((url) => ({ url, kind: classifyMediaUrl(url) }))
      .filter((item) => item.kind === 'photo' || item.kind === 'video' || item.kind === 'audio');
    const mediaUrls = mediaItems.map((item) => item.url);
    const strippedText = mediaUrls.length
      ? stripMediaUrlsFromText(targetNote.content || '', mediaUrls)
      : String(targetNote.content || '').trim();
    const normalizedText = normalizeInlineNostrRefsForRender(strippedText);
    const previewText = truncateNotificationText(normalizedText, 280);

    let hasRenderableContent = false;
    if (previewText) {
      const textWrap = document.createElement('div');
      textWrap.className = 'notif-post-preview-text';
      textWrap.appendChild(renderNostrContent(previewText));
      previewEl.appendChild(textWrap);
      hasRenderableContent = true;
    }
    if (mediaItems.length) {
      renderChatInlineMedia(previewEl, mediaItems, {
        classPrefix: 'chat',
        allowVideo: true,
        allowAudio: true,
        maxItems: 4
      });
      hasRenderableContent = true;
    }
    if (!hasRenderableContent) {
      const empty = document.createElement('div');
      empty.className = 'notif-post-preview-empty';
      empty.textContent = '[No post text]';
      previewEl.appendChild(empty);
    }
    previewEl.style.display = 'block';
  }

  async function hydrateNotificationTargetNotes(entries = [], opts = {}) {
    if (!state.pool) return [];
    const force = !!opts.force;
    const nowMs = Date.now();
    const unresolvedRetryMs = 120000;
    const targetIds = Array.from(new Set(
      (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry && entry.type === 'like')
        .map((entry) => String(entry.targetId || '').trim().toLowerCase())
        .filter((id) => /^[0-9a-f]{64}$/.test(id))
    ));
    if (!targetIds.length) return [];

    const missingIds = targetIds.filter((id) => {
      if (force || !state.notificationsTargetNotesById.has(id)) return true;
      const existing = state.notificationsTargetNotesById.get(id);
      if (!existing) return true;
      if (existing.__missing !== true) return false;
      const checkedAt = Number(existing.checkedAt || 0);
      return !checkedAt || (nowMs - checkedAt) >= unresolvedRetryMs;
    });
    if (!missingIds.length) return [];
    if (state.notificationsTargetFetchPending && state.notificationsTargetFetchPromise) {
      return state.notificationsTargetFetchPromise;
    }

    const wanted = new Set(missingIds);
    const chunkSize = 24;
    const filters = [];
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      if (!chunk.length) continue;
      filters.push({ kinds: [1, 6], ids: chunk, limit: chunk.length * 2 });
    }
    if (!filters.length) return [];

    const promise = fetchEventsCached(filters, {
      scope: 'notifications-target-notes',
      timeoutMs: 3200,
      maxEvents: 1200,
      ttlMs: 60000,
      warmMs: 300000,
      allowStale: true,
      force
    }).then((events) => {
      let changed = false;
      (events || []).forEach((ev) => {
        if (!ev || !ev.id) return;
        const id = String(ev.id || '').trim().toLowerCase();
        if (!wanted.has(id)) return;
        const existing = state.notificationsTargetNotesById.get(id);
        if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) {
          state.notificationsTargetNotesById.set(id, ev);
          changed = true;
        }
      });
      const checkedAt = Date.now();
      wanted.forEach((id) => {
        const existing = state.notificationsTargetNotesById.get(id);
        if (existing && existing.__missing !== true) return;
        state.notificationsTargetNotesById.set(id, { id, __missing: true, checkedAt });
        if (!existing || existing.__missing !== true) changed = true;
      });
      if (changed && isNotificationsPageVisible()) renderNotifications();
      return events || [];
    }).catch(() => {
      return [];
    }).finally(() => {
      state.notificationsTargetFetchPending = false;
      state.notificationsTargetFetchPromise = null;
    });

    state.notificationsTargetFetchPending = true;
    state.notificationsTargetFetchPromise = promise;
    return promise;
  }

  function mergeNotificationEvents(events, ownPubkey) {
    let changed = false;
    (events || []).forEach((ev) => {
      const entry = buildNotificationEntry(ev, ownPubkey);
      if (!entry) return;
      const existing = state.notificationsById.get(entry.id);
      if (!existing || Number(existing.created_at || 0) <= Number(entry.created_at || 0)) {
        state.notificationsById.set(entry.id, entry);
        changed = true;
      }
    });
    return changed;
  }

  function markNotificationsReadInternal(opts = {}) {
    const explicitTs = Number(opts.ts || 0);
    const ts = explicitTs > 0 ? Math.floor(explicitTs) : Math.floor(Date.now() / 1000);
    if (ts > Number(state.notificationsLastReadAt || 0)) {
      state.notificationsLastReadAt = ts;
      persistNotificationsLastRead();
    }
    renderNotificationsBell();
    if (!opts.silent && isNotificationsPageVisible()) renderNotifications();
  }

  async function loadNotifications(opts = {}) {
    if (!state.user || !state.pool) {
      state.notificationsLoading = false;
      state.notificationsError = '';
      state.notificationsById = new Map();
      state.notificationsTargetNotesById = new Map();
      state.notificationsTargetFetchPending = false;
      state.notificationsTargetFetchPromise = null;
      renderNotificationsBell();
      if (isNotificationsPageVisible()) renderNotifications();
      return [];
    }

    const force = !!opts.force;
    const silent = !!opts.silent;
    const minIntervalMs = Math.max(0, Number(opts.minIntervalMs || 45000));
    const nowMs = Date.now();
    if (!force && state.notificationsLastLoadedAt && (nowMs - Number(state.notificationsLastLoadedAt || 0)) < minIntervalMs) {
      renderNotificationsBell();
      if (!silent && isNotificationsPageVisible()) renderNotifications();
      return Array.from(state.notificationsById.values());
    }
    if (state.notificationsFetchPending && state.notificationsFetchPromise) {
      return state.notificationsFetchPromise;
    }

    state.notificationsLoading = true;
    state.notificationsError = '';
    if (!silent && isNotificationsPageVisible()) renderNotifications();

    const ownPubkey = normalizePubkeyHex(state.user.pubkey || '');
    const filters = notificationFiltersForUser(ownPubkey);
    const fetchPromise = fetchEventsCached(filters, {
      scope: 'notifications-feed',
      timeoutMs: 3600,
      maxEvents: 2600,
      ttlMs: 45000,
      warmMs: 180000,
      allowStale: true,
      force
    }).then((events) => {
      const activePubkey = state.user ? normalizePubkeyHex(state.user.pubkey || '') : '';
      if (!activePubkey || activePubkey !== ownPubkey) return [];
      state.notificationsById = new Map();
      mergeNotificationEvents(events, ownPubkey);
      state.notificationsLastLoadedAt = Date.now();
      state.notificationsLoading = false;
      state.notificationsError = '';
      hydrateNotificationTargetNotes(Array.from(state.notificationsById.values()), { force }).catch(() => {});
      renderNotificationsBell();
      if (!silent || isNotificationsPageVisible()) renderNotifications();
      return Array.from(state.notificationsById.values());
    }).catch(() => {
      state.notificationsLoading = false;
      state.notificationsError = 'Could not load notifications from relays right now.';
      renderNotificationsBell();
      if (!silent || isNotificationsPageVisible()) renderNotifications();
      return [];
    }).finally(() => {
      state.notificationsFetchPending = false;
      state.notificationsFetchPromise = null;
    });

    state.notificationsFetchPending = true;
    state.notificationsFetchPromise = fetchPromise;
    return fetchPromise;
  }

  function clearNostrFeedRenderTimer() {
    if (!state.nostrFeedRenderTimer) return;
    clearTimeout(state.nostrFeedRenderTimer);
    state.nostrFeedRenderTimer = null;
  }

  function clearNostrFeedEoseTimer() {
    if (!state.nostrFeedEoseTimer) return;
    clearTimeout(state.nostrFeedEoseTimer);
    state.nostrFeedEoseTimer = null;
  }

  function stopNostrFeedSubscription() {
    clearNostrFeedRenderTimer();
    clearNostrFeedEoseTimer();
    if (state.nostrFeedSubId && state.pool) {
      try { state.pool.unsubscribe(state.nostrFeedSubId); } catch (_) {}
    }
    state.nostrFeedSubId = null;
    state.nostrFeedInteractionFetchPending = false;
    state.nostrFeedInteractionQueuedIds = new Set();
    state.nostrFeedLoading = false;
  }

  function isNostrFeedVirtualProfile(pubkey) {
    return String(pubkey || '').trim() === NOSTR_FEED_PROFILE_KEY;
  }

  function syncNostrFeedProfileMapFromEvents() {
    state.profileNotesByPubkey.set(NOSTR_FEED_PROFILE_KEY, new Map(state.nostrFeedEventsById));
  }

  function syncNostrFeedEventsFromProfileMap(pubkey = NOSTR_FEED_PROFILE_KEY) {
    if (!isNostrFeedVirtualProfile(pubkey)) return;
    const map = state.profileNotesByPubkey.get(NOSTR_FEED_PROFILE_KEY) || new Map();
    state.nostrFeedEventsById = new Map(map);
  }

  function renderFeedOrProfileFeed(pubkey) {
    if (!pubkey) return;
    if (isNostrFeedVirtualProfile(pubkey)) {
      syncNostrFeedEventsFromProfileMap(pubkey);
      renderNostrFeed();
      return;
    }
    renderProfileFeed(pubkey);
  }

  function requestNostrFeedRepostTarget(noteId) {
    const id = String(noteId || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(id)) return;
    if (state.nostrFeedEventsById.has(id)) return;
    if (state.nostrFeedRepostLookupPending.has(id)) return;
    state.nostrFeedRepostLookupPending.add(id);
    fetchEventsCached(
      [{ kinds: [1], ids: [id], limit: 1 }],
      {
        scope: 'nostr-feed-repost-target',
        cacheKey: `nostr-feed-repost-target:${id}`,
        timeoutMs: 2400,
        maxEvents: 20
      }
    ).then((events) => {
      const match = (events || []).find((ev) => ev && ev.id === id && ev.kind === 1);
      if (!match) return;
      state.nostrFeedEventsById.set(match.id, match);
      syncNostrFeedProfileMapFromEvents();
      if (isFeedPageVisible()) scheduleNostrFeedRender();
    }).catch(() => {}).finally(() => {
      state.nostrFeedRepostLookupPending.delete(id);
    });
  }

  function scheduleNostrFeedRender() {
    if (state.nostrFeedRenderTimer) clearTimeout(state.nostrFeedRenderTimer);
    state.nostrFeedRenderTimer = setTimeout(() => {
      state.nostrFeedRenderTimer = null;
      renderNostrFeed();
    }, 110);
  }

  function isTopLevelNostrFeedPost(ev) {
    if (!ev) return false;
    if (ev.kind === 6) return true;
    if (ev.kind !== 1) return false;
    return allTagValues(ev.tags, 'e').length === 0;
  }

  function fetchFeedProfileIfNeeded(pubkey) {
    const key = normalizePubkeyHex(pubkey);
    if (!key) return;
    if (state.profilesByPubkey.has(key)) return;
    if (state.nostrFeedProfileFetchPending.has(key)) return;
    state.nostrFeedProfileFetchPending.add(key);
    fetchProfileIfNeeded(key)
      .then(() => {
        if (isFeedPageVisible()) scheduleNostrFeedRender();
      })
      .catch(() => {})
      .finally(() => {
        state.nostrFeedProfileFetchPending.delete(key);
      });
  }

  function parseFeedRepostTarget(post) {
    if (!post || post.kind !== 6) {
      return {
        displayNote: post,
        displayPubkey: post ? (normalizePubkeyHex(post.pubkey) || post.pubkey) : '',
        boosterPubkey: post ? (normalizePubkeyHex(post.pubkey) || post.pubkey) : ''
      };
    }

    let originalNote = null;
    let originalPubkey = '';
    const parsed = parseJsonSafe(post.content || '');
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.content === 'string' && /^[0-9a-f]{64}$/i.test(parsed.id || '')) {
        originalNote = parsed;
      }
      if (/^[0-9a-f]{64}$/i.test(parsed.pubkey || '')) originalPubkey = parsed.pubkey;
    }
    if (!originalPubkey) {
      const pRefs = allTagValues(post.tags, 'p');
      const maybe = pRefs[pRefs.length - 1] || '';
      if (/^[0-9a-f]{64}$/i.test(maybe)) originalPubkey = maybe;
    }

    const displayNote = originalNote || post;
    const displayPubkey = normalizePubkeyHex(originalPubkey || displayNote.pubkey || post.pubkey) || post.pubkey;
    return {
      displayNote,
      displayPubkey,
      boosterPubkey: normalizePubkeyHex(post.pubkey) || post.pubkey
    };
  }

  function collectNostrFeedInteractionTargetIds(posts = []) {
    const out = new Set();
    (Array.isArray(posts) ? posts : []).slice(0, 72).forEach((post) => {
      if (!post) return;
      const ownId = String(post.id || '').trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(ownId)) out.add(ownId);
      if (post.kind !== 6) return;

      const refs = allTagValues(post.tags, 'e');
      const refId = String((refs && refs.length ? refs[refs.length - 1] : '') || '').trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(refId)) {
        out.add(refId);
        return;
      }

      const parsed = parseJsonSafe(post.content || '');
      const parsedId = String(parsed && parsed.id || '').trim().toLowerCase();
      if (/^[0-9a-f]{64}$/.test(parsedId)) out.add(parsedId);
    });
    return out;
  }

  function flushNostrFeedInteractionHydrationQueue() {
    if (state.nostrFeedInteractionFetchPending) return;
    if (!state.pool) return;

    const batch = Array.from(state.nostrFeedInteractionQueuedIds)
      .map((id) => String(id || '').trim().toLowerCase())
      .filter((id) => /^[0-9a-f]{64}$/.test(id))
      .filter((id) => !state.nostrFeedInteractionHydratedIds.has(id))
      .slice(0, 84);
    if (!batch.length) return;

    batch.forEach((id) => {
      state.nostrFeedInteractionQueuedIds.delete(id);
      state.nostrFeedInteractionHydratedIds.add(id);
    });
    state.nostrFeedInteractionFetchPending = true;

    const chunkSize = 24;
    const since = Math.floor(Date.now() / 1000) - (60 * 60 * 24 * 14);
    const interactionKinds = [1, 6, KIND_REACTION, KIND_ZAP_RECEIPT, KIND_DELETION];
    const filters = [];
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      if (!chunk.length) continue;
      filters.push({
        kinds: interactionKinds,
        '#e': chunk,
        limit: 420,
        since
      });
    }

    let success = false;
    fetchEventsCached(filters, {
      scope: 'nostr-feed-interactions',
      timeoutMs: 3400,
      maxEvents: 2600,
      allowStale: false
    }).then((events) => {
      success = true;
      let changed = false;
      (events || []).forEach((ev) => {
        if (!ev || !ev.id) return;
        if (ev.kind === KIND_DELETION) {
          allTagValues(ev.tags, 'e').forEach((id) => {
            const rawRef = String(id || '').trim();
            const lowerRef = rawRef.toLowerCase();
            if (!/^[0-9a-f]{64}$/.test(lowerRef)) return;
            const removed = state.nostrFeedEventsById.delete(rawRef) || state.nostrFeedEventsById.delete(lowerRef);
            if (removed) changed = true;
          });
        }
        const existing = state.nostrFeedEventsById.get(ev.id);
        if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) {
          state.nostrFeedEventsById.set(ev.id, ev);
          changed = true;
        }
        if (ev.pubkey) fetchFeedProfileIfNeeded(ev.pubkey);
      });
      if (changed) {
        syncNostrFeedProfileMapFromEvents();
        if (isFeedPageVisible()) scheduleNostrFeedRender();
      }
    }).catch(() => {
      success = false;
    }).finally(() => {
      state.nostrFeedInteractionFetchPending = false;
      if (!success) {
        batch.forEach((id) => state.nostrFeedInteractionHydratedIds.delete(id));
      }
      if (state.nostrFeedInteractionQueuedIds.size) {
        setTimeout(() => flushNostrFeedInteractionHydrationQueue(), 70);
      }
    });
  }

  function queueNostrFeedInteractionHydration(posts = []) {
    if (!state.pool) return;
    const targets = collectNostrFeedInteractionTargetIds(posts);
    if (!targets.size) return;
    targets.forEach((id) => {
      if (!state.nostrFeedInteractionHydratedIds.has(id)) {
        state.nostrFeedInteractionQueuedIds.add(id);
      }
    });
    flushNostrFeedInteractionHydrationQueue();
  }

  function renderNostrFeedItem(note) {
    const info = parseFeedRepostTarget(note);
    const displayNote = info.displayNote || note;
    const displayPubkey = info.displayPubkey;
    const displayProfile = profileFor(displayPubkey);
    const boosterProfile = profileFor(info.boosterPubkey);
    const isRepost = note && note.kind === 6;

    const item = document.createElement('article');
    item.className = 'profile-feed-item feed-fade-item';

    const boostBanner = isRepost
      ? `<div class="pf-boost-banner"><div class="pf-boost-av"></div><span class="pf-boost-label"><span class="pf-boost-name"></span> boosted this post</span></div>`
      : '';

    item.innerHTML = `${boostBanner}
      <div class="profile-feed-head">
        <div class="profile-feed-author">
          <div class="profile-feed-av"></div>
          <div class="profile-feed-meta"><div class="profile-feed-name"></div><div class="profile-feed-status"></div></div>
        </div>
        <div class="profile-feed-time"></div>
      </div>
      <div class="profile-feed-text"></div>
      <div class="profile-feed-media-wrap"></div>`;

    const avEl = qs('.profile-feed-av', item);
    const nameEl = qs('.profile-feed-name', item);
    const statusEl = qs('.profile-feed-status', item);
    const timeEl = qs('.profile-feed-time', item);
    const textEl = qs('.profile-feed-text', item);
    const mediaWrap = qs('.profile-feed-media-wrap', item);

    if (avEl) {
      setAvatarEl(avEl, displayProfile.picture || '', pickAvatar(displayPubkey));
      const verifiedNip05 = getVerifiedNip05ForPubkey(displayPubkey, displayProfile.nip05 || '');
      avEl.classList.toggle('nip05-square', !!verifiedNip05);
      avEl.style.cursor = 'pointer';
      avEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(displayPubkey); };
      if (!verifiedNip05 && normalizeNip05Value(displayProfile.nip05 || '')) {
        ensureNip05Verification(displayPubkey, displayProfile.nip05 || '').catch(() => {});
      }
    }

    if (nameEl) {
      nameEl.textContent = displayProfile.display_name || displayProfile.name || shortHex(displayPubkey);
      nameEl.style.cursor = 'pointer';
      nameEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(displayPubkey); };
    }

    if (statusEl) {
      const statusText = getProfileStatusText(displayPubkey);
      statusEl.textContent = statusText;
      statusEl.style.display = statusText ? 'block' : 'none';
    }

    if (timeEl) timeEl.textContent = `${formatTimeAgo(note.created_at)} ago`;

    const mediaUrls = extractMediaUrlsFromEvent(displayNote);
    const mediaItems = mediaUrls
      .map((url) => ({ url, kind: classifyMediaUrl(url) }))
      .filter((entry) => entry.kind && isLikelyUrl(entry.url));
    const text = stripMediaUrlsFromText(displayNote.content || '', mediaUrls);

    if (textEl) {
      textEl.innerHTML = '';
      if (text) {
        textEl.appendChild(renderNostrContent(text));
        textEl.style.display = 'block';
      } else {
        textEl.textContent = mediaItems.length ? '' : (isRepost ? 'Repost' : '[empty note]');
        textEl.style.display = mediaItems.length ? 'none' : 'block';
      }
    }

    if (mediaWrap) {
      mediaWrap.innerHTML = '';
      if (mediaItems.length) {
        renderPostMedia(mediaWrap, mediaItems);
      } else {
        mediaWrap.style.display = 'none';
      }
    }

    if (isRepost) {
      const boostAvEl = qs('.pf-boost-av', item);
      const boostNameEl = qs('.pf-boost-name', item);
      if (boostAvEl) {
        setAvatarEl(boostAvEl, boosterProfile.picture || '', pickAvatar(info.boosterPubkey));
        boostAvEl.style.cursor = 'pointer';
        boostAvEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(info.boosterPubkey); };
        const verified = getVerifiedNip05ForPubkey(info.boosterPubkey, boosterProfile.nip05 || '');
        boostAvEl.classList.toggle('nip05-square', !!verified);
      }
      if (boostNameEl) {
        boostNameEl.textContent = boosterProfile.display_name || boosterProfile.name || shortHex(info.boosterPubkey);
        boostNameEl.style.cursor = 'pointer';
        boostNameEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(info.boosterPubkey); };
      }
      fetchFeedProfileIfNeeded(info.boosterPubkey);
    }

    fetchFeedProfileIfNeeded(displayPubkey);
    return item;
  }

  function renderNostrFeed() {
    const listEl = qs('#nostrFeedList');
    const statusEl = qs('#nostrFeedStatus');
    if (!listEl) return;

    const posts = Array.from(state.nostrFeedEventsById.values())
      .filter((ev) => isTopLevelNostrFeedPost(ev))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    if (posts.length) queueNostrFeedInteractionHydration(posts);
    const filterLabel = getNostrFeedFilterLabel(state.nostrFeedFilter);

    if (statusEl) {
      if (state.nostrFeedError) {
        statusEl.textContent = state.nostrFeedError;
        statusEl.style.color = 'var(--live)';
      } else if (state.nostrFeedLoading) {
        statusEl.style.color = '';
        statusEl.innerHTML = '<span class="lf-spinner"></span>Loading notes from relays...';
      } else if (posts.length) {
        statusEl.style.color = '';
        statusEl.textContent = `${posts.length} notes - ${filterLabel}`;
      } else {
        statusEl.style.color = '';
        statusEl.textContent = `No notes found for ${filterLabel}.`;
      }
    }

    if (!posts.length) {
      const fallback = state.nostrFeedFilter === 'following'
        ? 'Try Global or add more people to Following.'
        : 'Try another list or check your relay connections.';
      listEl.innerHTML = `<div class="profile-feed-empty">No notes to show yet. ${fallback}</div>`;
      return;
    }
    syncNostrFeedProfileMapFromEvents();
    renderProfileFeed(NOSTR_FEED_PROFILE_KEY);
  }

  function subscribeNostrFeed() {
    stopNostrFeedSubscription();
    if (!state.pool) return;

    state.nostrFeedFilter = normalizeNostrFeedFilter(state.nostrFeedFilter);
    persistNostrFeedFilter();
    renderNostrFeedFilterSelect();
    state.nostrFeedEventsById = new Map();
    state.nostrFeedProfileFetchPending = new Set();
    state.nostrFeedRepostLookupPending = new Set();
    state.nostrFeedInteractionHydratedIds = new Set();
    state.nostrFeedInteractionQueuedIds = new Set();
    state.nostrFeedInteractionFetchPending = false;
    state.nostrFeedError = '';
    state.nostrFeedLoading = true;
    state.profileNotesByPubkey.set(NOSTR_FEED_PROFILE_KEY, new Map());
    const listEl = qs('#nostrFeedList');
    if (listEl) listEl.dataset.feedLimit = '24';
    renderNostrFeed();

    const now = Math.floor(Date.now() / 1000);
    const filterId = state.nostrFeedFilter;
    const kinds = [1, 6, KIND_DELETION];
    let filters = [];

    if (filterId === 'global') {
      filters = [{ kinds, limit: 260, since: now - (60 * 60 * 18) }];
    } else {
      const pubkeySet = getListFilterPubkeys(filterId) || new Set();
      const pubkeys = Array.from(pubkeySet)
        .map((pk) => normalizePubkeyHex(pk))
        .filter(Boolean)
        .slice(0, 1200);
      if (!pubkeys.length) {
        state.nostrFeedLoading = false;
        renderNostrFeed();
        return;
      }
      const chunkSize = 150;
      for (let i = 0; i < pubkeys.length; i += chunkSize) {
        const chunk = pubkeys.slice(i, i + chunkSize);
        if (!chunk.length) continue;
        filters.push({
          kinds,
          authors: chunk,
          limit: 110,
          since: now - (60 * 60 * 24 * 10)
        });
      }
    }

    if (!filters.length) {
      state.nostrFeedLoading = false;
      renderNostrFeed();
      return;
    }

    clearNostrFeedEoseTimer();
    state.nostrFeedEoseTimer = setTimeout(() => {
      state.nostrFeedEoseTimer = null;
      state.nostrFeedLoading = false;
      scheduleNostrFeedRender();
    }, 3600);

    state.nostrFeedSubId = state.pool.subscribe(filters, {
      event: (ev) => {
        if (!ev || !ev.id) return;
        if (ev.kind !== 1 && ev.kind !== 6 && ev.kind !== KIND_DELETION) return;
        if (ev.kind === KIND_DELETION) {
          allTagValues(ev.tags, 'e').forEach((id) => {
            if (/^[0-9a-f]{64}$/i.test(id || '')) state.nostrFeedEventsById.delete(id);
          });
          syncNostrFeedProfileMapFromEvents();
          scheduleNostrFeedRender();
          return;
        }
        const existing = state.nostrFeedEventsById.get(ev.id);
        if (!existing || Number(existing.created_at || 0) <= Number(ev.created_at || 0)) {
          state.nostrFeedEventsById.set(ev.id, ev);
        }
        syncNostrFeedProfileMapFromEvents();
        if (ev.pubkey) fetchFeedProfileIfNeeded(ev.pubkey);
        if (ev.kind === 6) {
          const repost = parseFeedRepostTarget(ev);
          if (repost.displayPubkey) fetchFeedProfileIfNeeded(repost.displayPubkey);
          if (repost.boosterPubkey) fetchFeedProfileIfNeeded(repost.boosterPubkey);
          const refs = allTagValues(ev.tags, 'e');
          const targetId = refs.length ? refs[refs.length - 1] : '';
          if (!repost.displayNote || repost.displayNote === ev || !String(repost.displayNote.content || '').trim()) {
            requestNostrFeedRepostTarget(targetId);
          }
        }
        scheduleNostrFeedRender();
      },
      eose: () => {
        clearNostrFeedEoseTimer();
        state.nostrFeedLoading = false;
        scheduleNostrFeedRender();
      }
    });
  }

  function setNostrFeedFilterInternal(filterId, opts = {}) {
    const next = normalizeNostrFeedFilter(filterId);
    const prev = state.nostrFeedFilter;
    state.nostrFeedFilter = next;
    persistNostrFeedFilter();
    renderNostrFeedFilterSelect();
    if (opts.force || prev !== next) {
      if (isFeedPageVisible()) subscribeNostrFeed();
      else renderNostrFeed();
    }
  }

  function buildStreamCard(stream, idx) {
    // NIP-53: show actual streamer (hostPubkey), not the platform publisher
    const p = profileFor(stream.hostPubkey);
    const card = document.createElement('div');
    const viewerCount = effectiveParticipants(stream);
    const hasViewers = viewerCount > 0;
    const hasVideo = !!stream.streaming;
    card.className = 'stream-card' + (!hasViewers && !hasVideo ? ' stream-card-dim' : '');

    const gradients = ['t1','t2','t3','t4','t5','t6','t7','t8'];
    const streamThumb = sanitizeMediaUrl(stream.image || '');
    const profileThumb = sanitizeMediaUrl(p.picture || '');
    let thumbHtml;
    if (streamThumb) {
      const fb = gradients[idx % gradients.length];
      thumbHtml = `<div class="ct-thumb-wrap"><img class="ct-thumb" src="${streamThumb}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'tc ${fb}\\'></div>'"></div>`;
    } else if (profileThumb) {
      const fb = gradients[idx % gradients.length];
      thumbHtml = `<div class="ct-thumb-wrap"><img class="ct-thumb" src="${profileThumb}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'tc ${fb}\\'></div>'"></div>`;
    } else {
      thumbHtml = `<div class="tc ${gradients[idx % gradients.length]}"></div>`;
    }

    const isOffline = isStreamPlaybackOffline(stream && stream.address);
    const statusLabel = isOffline
      ? 'OFFLINE'
      : (stream.status === 'planned' ? 'SOON' : stream.status.toUpperCase());
    const statusBg = isOffline
      ? 'background:#5c6678;color:#e4e8ef;border:1px solid rgba(210,220,235,.25);'
      : (stream.status === 'planned' ? 'background:var(--purple)' : '');
    const statusDot = isOffline ? '' : '<span class="live-dot"></span>';
    const viewerText = hasViewers ? `&#128065; ${viewerCount.toLocaleString()}` : (hasVideo ? '&#128065; 0' : '&#8212;');
    const hideLiveBadge = isDirectFileVideoUrl(stream && stream.streaming);

    card.innerHTML = `
      <div class="ct">
        <div class="ct-inner">${thumbHtml}</div>
        ${hideLiveBadge ? '' : `<div class="cb-live" style="${statusBg}">${statusDot}${statusLabel}</div>`}
        <div class="cb-viewers">${viewerText}</div>
      </div>
      <div class="ci">
        <div class="ci-row">
          <div class="ci-av"></div>
          <div>
            <div class="ci-title"></div>
            <div class="ci-host"></div>
            <div class="ci-tags"><span class="ci-hosted-badge"></span></div>
          </div>
        </div>
      </div>`;

    const avEl = qs('.ci-av', card);
    if (avEl) {
      setAvatarEl(avEl, p.picture || '', pickAvatar(stream.hostPubkey));
      const claimedNip05 = normalizeNip05Value(p.nip05 || '');
      const verifiedNip05 = getVerifiedNip05ForPubkey(stream.hostPubkey, p.nip05 || '', { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS });
      avEl.classList.toggle('nip05-square', !!verifiedNip05);
      if (claimedNip05) {
        ensureNip05Verification(stream.hostPubkey, claimedNip05, { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS }).catch(() => {});
      }
    }
    qs('.ci-title', card).textContent = stream.title;
    qs('.ci-host', card).textContent = p.display_name || p.name || shortHex(stream.hostPubkey);
    const hostedBadge = qs('.ci-hosted-badge', card);
    if (hostedBadge && stream.platformPubkey) {
      const plat = profileFor(stream.platformPubkey);
      const platDisplayName = plat.display_name || plat.name || '';
      const hostDisplayName = p.display_name || p.name || '';
      // Only show if the platform is genuinely different from the streamer
      if (platDisplayName && platDisplayName !== hostDisplayName) {
        hostedBadge.textContent = 'via ' + platDisplayName;
      }
    }
    card.addEventListener('click', () => openStream(stream.address));
    return card;
  }

  function getFilteredStreams() {
    // Only show streams that have a browser-playable HTTP(S) URL
    const allStreams = sortedLiveStreams().filter((s) => {
      const url = (s.streaming || '').trim();
      return url && /^https?:\/\//i.test(url);
    });
    const filterPubkeys = getPubkeysForFilter();
    return filterPubkeys
      ? allStreams.filter((s) => filterPubkeys.has(s.pubkey) || filterPubkeys.has(s.hostPubkey))
      : allStreams;
  }

  function renderLiveGrid() {
    const grid = qs('#liveGrid');
    const sentinel = qs('#liveGridSentinel');
    if (isVideosPageVisible()) scheduleVideosPageRender();
    if (!grid) return;
    if (!isHomeViewActive()) {
      if (state.liveGridObserver) { state.liveGridObserver.disconnect(); state.liveGridObserver = null; }
      return;
    }

    const allStreams = sortedLiveStreams();
    const streams = getFilteredStreams();

    // Update count pill
    const pill = qs('#liveCountPill');
    if (pill) pill.textContent = streams.length ? `${streams.length} live` : '';

    // Reset page counter and disconnect old observer
    state.liveGridPage = 0;
    if (state.liveGridObserver) { state.liveGridObserver.disconnect(); state.liveGridObserver = null; }

    // Loading state
    if (allStreams.length === 0) {
      grid.innerHTML = '<div class="live-grid-loading"><div class="lf-spinner"></div>Syncing streams from relays...</div>';
      return;
    }

    // Empty for filter
    if (streams.length === 0) {
      const f = state.activeListFilter;
      const filterName = f === 'following' ? 'your following list'
        : (() => {
          const n51 = state.nip51Lists.get(f);
          if (n51) return `"${n51.name}"`;
          const sv = state.savedExternalLists.find((l) => l.naddr === f);
          if (sv) return `"${sv.name}"`;
          return 'this filter';
        })();
        grid.innerHTML = `<div class="following-empty" style="grid-column:1/-1"><div class="following-empty-icon">&#x1F4E1;</div><div class="following-empty-title">No live streams in ${filterName}</div><div class="following-empty-sub">Nobody in this list is streaming right now.</div></div>`;
      return;
    }

    // Render first page
    grid.innerHTML = '';
    const firstBatch = streams.slice(0, state.GRID_PAGE_SIZE);
    firstBatch.forEach((s, i) => grid.appendChild(buildStreamCard(s, i)));
    state.liveGridPage = 1;

    // If all loaded, show end marker
    if (streams.length <= state.GRID_PAGE_SIZE) {
      grid.insertAdjacentHTML('beforeend', `<div class="live-grid-end">&#8212; ${streams.length} streams loaded &#8212;</div>`);
      return;
    }

    // Set up IntersectionObserver on sentinel for infinite scroll
    if (sentinel && 'IntersectionObserver' in window) {
      state.liveGridObserver = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        loadMoreStreams();
      }, { rootMargin: '200px' });
      state.liveGridObserver.observe(sentinel);
    }
  }

  function loadMoreStreams() {
    const grid = qs('#liveGrid');
    if (!grid) return;
    const streams = getFilteredStreams();
    const start = state.liveGridPage * state.GRID_PAGE_SIZE;
    if (start >= streams.length) {
      if (state.liveGridObserver) { state.liveGridObserver.disconnect(); state.liveGridObserver = null; }
      // Remove existing end marker then add final one
      const existing = grid.querySelector('.live-grid-end');
      if (existing) existing.remove();
      grid.insertAdjacentHTML('beforeend', `<div class="live-grid-end">&#8212; ${streams.length} streams loaded &#8212;</div>`);
      return;
    }

    const batch = streams.slice(start, start + state.GRID_PAGE_SIZE);
    const offset = start; // for gradient cycling
    batch.forEach((s, i) => grid.appendChild(buildStreamCard(s, offset + i)));
    state.liveGridPage++;
  }

  /* =========================================================
     HERO FEATURED STREAM SYSTEM
     - Randomly features available live streams
     - Autoplay with AUDIO (muted only if browser blocks)
     - Skips streams where playback fails
     - Sci-fi glitch/scan-line transition between streams
     - Cycles every 120 s with progress bar; prev/next nav
     ========================================================= */
  const HERO_CYCLE_MS = 120000;

  function isHomeViewActive() {
    const home = qs('#homePage');
    return !!(home && home.classList.contains('active'));
  }

  function shouldRunHeroCycle() {
    if (!isHomeViewActive()) return false;
    const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    return !isHidden;
  }

  function heroFeaturedStreams() {
    return sortedLiveStreams().filter(
      (s) => {
        const url = (s.streaming || '').trim();
        return url && /^https?:\/\//i.test(url) && !state.featuredFailed.has(s.address);
      }
    );
  }

  /* ---- Sci-fi transition animation ---- */
  function runHeroTransition(cb) {
    const ov = qs('#heroTransitionOv');
    const player = qs('#heroPlayer');
    if (!ov) { cb(); return; }

    // Spawn data-rain particles
    const NUM_PARTICLES = 18;
    const particles = [];
    for (let i = 0; i < NUM_PARTICLES; i++) {
      const p = document.createElement('div');
      p.className = 'hero-data-particle';
      const h = 30 + Math.random() * 120;
      p.style.cssText = `left:${Math.random() * 100}%;height:${h}px;animation-delay:${Math.random() * 0.25}s;opacity:0;`;
      ov.appendChild(p);
      particles.push(p);
    }

    // Show the fx layers
    ['heroScanLine','heroGlitchA','heroGlitchB','heroGridFlash','heroStatic'].forEach((id) => {
      const el = qs(`#${id}`);
      if (el) el.style.display = '';
    });
    ov.classList.add('active');

    // Glitch background on hero player too
    if (player) player.style.filter = 'brightness(1.4) hue-rotate(-15deg)';

    setTimeout(() => {
      if (player) player.style.filter = '';
      // Clear particles
      particles.forEach((p) => p.remove());
      ['heroScanLine','heroGlitchA','heroGlitchB','heroGridFlash','heroStatic'].forEach((id) => {
        const el = qs(`#${id}`);
        if (el) el.style.display = 'none';
      });
      ov.classList.remove('active');
      cb();
    }, 680);
  }

  /* ---- Progress bar RAF loop ---- */
  function startProgressBar() {
    const fill = qs('#heroCycleBarFill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.width = '0%';
    state.featuredCycleStart = Date.now();

    function tick() {
      const elapsed = Date.now() - state.featuredCycleStart;
      const pct = Math.min((elapsed / HERO_CYCLE_MS) * 100, 100);
      fill.style.width = pct + '%';
      if (pct < 100) {
        state.featuredCycleRafId = requestAnimationFrame(tick);
      }
    }
    if (state.featuredCycleRafId) cancelAnimationFrame(state.featuredCycleRafId);
    state.featuredCycleRafId = requestAnimationFrame(tick);
  }

  /* ---- Indicators ---- */
  function renderHeroIndicators(streams, activeIdx) {
    const wrap = qs('#heroIndicators');
    if (!wrap) return;
    wrap.innerHTML = '';
    const count = Math.min(streams.length, 12);
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === activeIdx ? ' active' : '');
      dot.addEventListener('click', (e) => { e.stopPropagation(); heroGoTo(i, true); });
      wrap.appendChild(dot);
    }
  }

  /* ---- Clear hero HLS ---- */
  function clearHeroPlayback() {
    state.heroPlaybackToken++;
    state.featuredCurrentAddress = '';
    setActiveHeroViewerAddress('');
    const playerEl = qs('#heroPlayer');
    if (playerEl) {
      playerEl.querySelectorAll('video').forEach((video) => {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
        try { video.remove(); } catch (_) {}
      });
    }
    const ovEl = qs('#heroPlayOv');
    if (ovEl) ovEl.style.display = '';
    if (state.heroHlsInstance) {
      try { state.heroHlsInstance.destroy(); } catch (_) {}
      state.heroHlsInstance = null;
    }
  }

  /* ---- Load and autoplay with AUDIO ---- */
  async function renderHeroPlayer(stream, token) {
    const playerEl = qs('#heroPlayer');
    const bgEl = qs('#heroPlayerBg');
    const ovEl = qs('#heroPlayOv');
    if (!playerEl || !bgEl) return;

    const url = sanitizeMediaUrl(stream.streaming || '');
    const heroProfile = profileFor(stream.hostPubkey);
    const image = sanitizeMediaUrl(stream.image || '') || sanitizeMediaUrl(heroProfile.picture || '');

    // Set background: thumbnail or gradient
    if (image) {
      const safeImage = image.replace(/"/g, '\\"');
      bgEl.style.cssText = `width:100%;height:100%;background:url("${safeImage}") center/cover no-repeat,linear-gradient(135deg,#0d1e30,#1a0a00);`;
    } else {
      bgEl.style.cssText = 'width:100%;height:100%;background:linear-gradient(135deg,#0d1e30,#1a0a00,#080d18);';
    }

    // Wipe any existing video
    const existingVid = playerEl.querySelector('video');
    if (existingVid) existingVid.remove();
    if (ovEl) ovEl.style.display = '';

    if (!url || !/^https?:\/\//i.test(url)) {
      setActiveHeroViewerAddress('');
      return;
    }

    const video = document.createElement('video');
    // Start muted so browser allows autoplay, then unmute immediately
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:2;';

    const isHls = /\.m3u8($|\?)/i.test(url);
    let hlsObj = null;
    let heroNetworkRecoveries = 0;
    let heroMediaRecoveries = 0;

    // On media loaded / playing -> unmute for audio
    const onCanPlay = () => {
      if (token !== state.heroPlaybackToken) return;
      setActiveHeroViewerAddress(stream.address);
      markStreamPlaybackOnline(stream.address);
      video.muted = false; // restore audio
      video.volume = 0.8;
      if (ovEl) ovEl.style.display = 'none';
    };
    video.addEventListener('canplay', onCanPlay, { once: true });

    // On error -> mark as failed and advance
    video.addEventListener('error', () => {
      if (token !== state.heroPlaybackToken) return;
      setActiveHeroViewerAddress('');
      markStreamPlaybackOffline(stream.address);
      heroAdvance(1); // skip to next
    });

    playerEl.appendChild(video);

    if (isHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => {});
      } else {
        try {
          const Hls = await ensureHlsJs();
          if (token !== state.heroPlaybackToken) return;
          if (Hls.isSupported()) {
            hlsObj = new Hls({
              enableWorker: true,
              lowLatencyMode: true,
              liveSyncDurationCount: 3,
              liveMaxLatencyDurationCount: 9,
              maxBufferLength: 45,
              maxMaxBufferLength: 120,
              backBufferLength: 30
            });
            state.heroHlsInstance = hlsObj;
            hlsObj.loadSource(url);
            hlsObj.attachMedia(video);
            hlsObj.on(Hls.Events.MANIFEST_PARSED, () => {
              if (token !== state.heroPlaybackToken) return;
              video.play().catch(() => {});
            });
            hlsObj.on(Hls.Events.ERROR, (_e, data) => {
              if (!data || token !== state.heroPlaybackToken) return;
              if (!data.fatal) return;

              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && heroNetworkRecoveries < 6) {
                heroNetworkRecoveries += 1;
                try { hlsObj.startLoad(-1); } catch (_) {}
                return;
              }

              if (data.type === Hls.ErrorTypes.MEDIA_ERROR && heroMediaRecoveries < 3) {
                heroMediaRecoveries += 1;
                try { hlsObj.recoverMediaError(); } catch (_) {}
                return;
              }

              setActiveHeroViewerAddress('');
              markStreamPlaybackOffline(stream.address);
              heroAdvance(1);
            });
          }
        } catch (_) {
          if (token === state.heroPlaybackToken) {
            setActiveHeroViewerAddress('');
            markStreamPlaybackOffline(stream.address);
            heroAdvance(1);
          }
        }
      }
    } else {
      video.src = url;
      video.play().catch(() => {});
    }
  }

  /* ---- Render hero info panel ---- */
  function renderHero(stream, idx, total) {
    if (!stream) return;
    state.featuredCurrentAddress = stream.address;
    const p = profileFor(stream.hostPubkey);

    const set = (id, v) => { const el = qs('#' + id); if (el) el.textContent = v; };
    const viewerCount = effectiveParticipants(stream);
    set('heroTitle', stream.title);
    set('heroSummary', stream.summary || 'Live stream on Nostr.');
    set('heroHostName', p.name);
    set('heroStatusLabel', (stream.status || 'live').toUpperCase());
    set('heroViewers', viewerCount > 0 ? viewerCount.toLocaleString() : '-');
    set('heroSats', '-');
    set('heroTime', stream.starts ? new Date(stream.starts * 1000).toUTCString().slice(17, 22) + ' UTC' : 'live');

    const avEl = qs('#heroAv');
    if (avEl) setAvatarEl(avEl, p.picture || '', pickAvatar(stream.hostPubkey));
    const nip05El = qs('#heroNip05');
    const claimedNip05 = normalizeNip05Value(p.nip05 || '');
    const heroNip05 = getVerifiedNip05ForPubkey(stream.hostPubkey, p.nip05 || '', { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS });
    if (claimedNip05) {
      ensureNip05Verification(stream.hostPubkey, claimedNip05, { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS }).catch(() => {});
    }
    if (nip05El) { nip05El.style.display = heroNip05 ? 'inline' : 'none'; if (heroNip05) nip05El.title = heroNip05; }

    // Wire click to open stream
    const heroEl = qs('#heroStream');
    if (heroEl) heroEl.onclick = () => openStream(stream.address);
    const watchBtn = qs('#heroWatchBtn');
    if (watchBtn) watchBtn.onclick = (e) => { e.stopPropagation(); openStream(stream.address); };

    renderHeroIndicators(heroFeaturedStreams(), idx);
  }

  /* ---- Navigate to a specific index ---- */
  function heroGoTo(idx, userInitiated) {
    if (!shouldRunHeroCycle()) {
      stopHeroCycle();
      return;
    }
    const streams = heroFeaturedStreams();
    if (!streams.length) return;
    state.featuredIndex = ((idx % streams.length) + streams.length) % streams.length;

    if (userInitiated) {
      // Instant switch without transition for user-clicked nav
      clearHeroPlayback();
      const token = state.heroPlaybackToken;
      renderHero(streams[state.featuredIndex], state.featuredIndex, streams.length);
      renderHeroPlayer(streams[state.featuredIndex], token);
      resetHeroCycle();
    } else {
      // Auto-cycle: play the sci-fi transition then swap
      runHeroTransition(() => {
        clearHeroPlayback();
        const token = state.heroPlaybackToken;
        renderHero(streams[state.featuredIndex], state.featuredIndex, streams.length);
        renderHeroPlayer(streams[state.featuredIndex], token);
      });
    }
  }

  /* ---- Advance by delta (wraps) ---- */
  function heroAdvance(delta) {
    if (!shouldRunHeroCycle()) {
      stopHeroCycle();
      return;
    }
    const streams = heroFeaturedStreams();
    if (!streams.length) return;
    heroGoTo(state.featuredIndex + delta, false);
    resetHeroCycle();
  }

  /* ---- Reset / restart the 120-s cycle timer ---- */
  function resetHeroCycle() {
    if (!shouldRunHeroCycle()) {
      stopHeroCycle();
      return;
    }
    if (state.featuredCycleTimer) clearInterval(state.featuredCycleTimer);
    startProgressBar();
    state.featuredCycleTimer = setInterval(() => heroAdvance(1), HERO_CYCLE_MS);
  }

  /* ---- Start hero cycle on page load ---- */
  function startHeroCycle() {
    if (!shouldRunHeroCycle()) return;
    const streams = heroFeaturedStreams();
    if (!streams.length) return;
    state.featuredIndex = Math.floor(Math.random() * streams.length);
    clearHeroPlayback();
    const token = state.heroPlaybackToken;
    renderHero(streams[state.featuredIndex], state.featuredIndex, streams.length);
    renderHeroPlayer(streams[state.featuredIndex], token);
    resetHeroCycle();
  }

  function stopHeroCycle() {
    if (state.featuredCycleTimer) { clearInterval(state.featuredCycleTimer); state.featuredCycleTimer = null; }
    if (state.featuredCycleRafId) { cancelAnimationFrame(state.featuredCycleRafId); state.featuredCycleRafId = null; }
    clearHeroPlayback();
  }

  function clearPlayback() {
    state.playbackToken += 1;
    state.playbackAddress = '';
    state.playbackUrl = '';
    if (state.hlsInstance) {
      try {
        state.hlsInstance.destroy();
      } catch (_) {
        // no-op
      }
      state.hlsInstance = null;
    }
    const playerBg = qs('.player-bg');
    if (playerBg) {
      playerBg.classList.remove('player-bg-portrait-source');
      playerBg.querySelectorAll('video').forEach((video) => {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
      });
    }
  }

  function syncTheaterVideoFit(video, playerBg = null) {
    if (!video) return;
    const host = playerBg || qs('.player-bg');
    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    const isPortraitSource = width > 0 && height > 0 && (height / Math.max(width, 1)) > 1.05;
    video.style.objectFit = isPortraitSource ? 'contain' : 'cover';
    if (host && host.classList) host.classList.toggle('player-bg-portrait-source', isPortraitSource);
  }

  function renderPlaybackFallback(message, url) {
    const playerBg = qs('.player-bg');
    const playerUi = qs('.player-ui');
    if (!playerBg) return;

    playerBg.classList.remove('player-bg-portrait-source');
    if (playerUi) playerUi.style.display = '';
    playerBg.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;padding:1rem;text-align:center;gap:.5rem;color:#d0d7e2;';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:.85rem;line-height:1.5;';
    msg.textContent = message;
    wrap.appendChild(msg);

    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open stream URL';
      link.style.cssText = 'color:#f7b731;text-decoration:none;font-family:"DM Mono",monospace;font-size:.75rem;';
      wrap.appendChild(link);
    }

    playerBg.appendChild(wrap);
  }

  function isLikelyHlsStreamUrl(url) {
    const lower = String(url || '').toLowerCase();
    if (!lower) return false;
    if (/\.m3u8($|[?#])/.test(lower)) return true;
    if (/zap\.stream\//.test(lower)) return true;
    if (/(^|[/?#&])hls([/?#&=]|$)/.test(lower)) return true;
    if (/[?&](format|type|mime|ext)=([^&]*m3u8|application%2Fvnd\.apple\.mpegurl|application\/vnd\.apple\.mpegurl|application%2Fx-mpegurl|application\/x-mpegurl)/.test(lower)) return true;
    return false;
  }

  async function tryPlayVideoWithMutedFallback(video) {
    if (!video || typeof video.play !== 'function') return false;
    try {
      await video.play();
      return true;
    } catch (_) {
      try {
        video.muted = true;
        video.defaultMuted = true;
        await video.play();
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  async function attachHlsPlaybackWithRecovery(video, url, opts = {}) {
    const isStale = typeof opts.isStale === 'function' ? opts.isStale : () => false;
    const onAttach = typeof opts.onAttach === 'function' ? opts.onAttach : () => {};
    const onFatal = typeof opts.onFatal === 'function' ? opts.onFatal : () => {};
    const hlsConfig = (opts && opts.hlsConfig && typeof opts.hlsConfig === 'object') ? opts.hlsConfig : {};
    const maxNetworkRecoveries = Math.max(1, Number(opts.maxNetworkRecoveries || 4));
    const maxMediaRecoveries = Math.max(1, Number(opts.maxMediaRecoveries || 2));

    const Hls = await ensureHlsJs();
    if (!Hls || typeof Hls.isSupported !== 'function' || !Hls.isSupported()) return null;
    if (isStale()) return null;

    const hls = new Hls({
      enableWorker: true,
      // Theater mode prioritizes playback stability over ultra-low latency.
      lowLatencyMode: false,
      backBufferLength: 30,
      maxBufferLength: 45,
      maxMaxBufferLength: 120,
      liveSyncDurationCount: 4,
      liveMaxLatencyDurationCount: 12,
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 5,
      manifestLoadingRetryDelay: 1200,
      levelLoadingTimeOut: 15000,
      levelLoadingMaxRetry: 5,
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: 5,
      ...hlsConfig
    });

    let networkRecoveries = 0;
    let mediaRecoveries = 0;
    let lastNonFatalNetworkRecoveryAt = 0;

    onAttach(hls);
    hls.loadSource(url);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (isStale()) return;
      tryPlayVideoWithMutedFallback(video).catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (isStale() || !data) return;

      if (!data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          const now = Date.now();
          if ((now - lastNonFatalNetworkRecoveryAt) > 4000) {
            lastNonFatalNetworkRecoveryAt = now;
            try { hls.startLoad(-1); } catch (_) {}
          }
        }
        return;
      }

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < maxNetworkRecoveries) {
        networkRecoveries += 1;
        try {
          hls.startLoad(-1);
          return;
        } catch (_) {}
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < maxMediaRecoveries) {
        mediaRecoveries += 1;
        try {
          hls.recoverMediaError();
          return;
        } catch (_) {}
      }

      onFatal(data);
    });

    return hls;
  }

  async function renderVideoPlayback(stream) {
    const playerBg = qs('.player-bg');
    const playerUi = qs('.player-ui');
    if (!playerBg) return;
    const address = String(stream && stream.address || '').trim();
    const url = sanitizeMediaUrl((stream && stream.streaming || '').trim());
    const status = normalizeStreamStatus(stream && stream.status);
    const existingVideo = playerBg.querySelector('video');
    const hasHttpUrl = !!url && /^https?:\/\//i.test(url);
    const sameSource = !!(address && url && state.playbackAddress === address && state.playbackUrl === url);
    if (sameSource && (existingVideo || state.hlsInstance)) {
      if (existingVideo) syncTheaterVideoFit(existingVideo, playerBg);
      return;
    }

    clearPlayback();
    const token = state.playbackToken;

    playerBg.classList.remove('player-bg-portrait-source');
    if (status === 'ended' && !hasHttpUrl) {
      const endedSummary = String(stream.summary || '').trim();
      const message = endedSummary ? `Stream ended. ${endedSummary}` : 'Stream ended.';
      renderPlaybackFallback(message, stream.streaming || '');
      return;
    }
    if (!url) {
      if (playerUi) playerUi.style.display = '';
      playerBg.classList.remove('player-bg-portrait-source');
      playerBg.textContent = 'LIVE';
      return;
    }

    if (!hasHttpUrl) {
      renderPlaybackFallback('This stream uses a non-HTTP source. Open it in your external player.', url);
      return;
    }

    state.playbackAddress = address;
    state.playbackUrl = url;

    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = false;
    video.defaultMuted = false;
    video.playsInline = true;
    video.preload = 'auto';
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;';
    const syncFit = () => syncTheaterVideoFit(video, playerBg);
    video.addEventListener('loadedmetadata', syncFit);
    video.addEventListener('loadeddata', syncFit);
    video.addEventListener('resize', syncFit);
    video.addEventListener('canplay', syncFit);
    const markPlayable = () => {
      if (status !== 'ended') markStreamPlaybackOnline(address);
    };
    video.addEventListener('playing', markPlayable, { once: true });
    video.addEventListener('canplay', markPlayable, { once: true });

    playerBg.innerHTML = '';
    playerBg.appendChild(video);
    syncFit();
    window.setTimeout(() => {
      if (token !== state.playbackToken) return;
      syncFit();
    }, 1200);
    if (playerUi) playerUi.style.display = 'none';

    const isStale = () => token !== state.playbackToken;
    let hlsAttached = false;
    let fallbackShown = false;
    const shouldPreferHls = isLikelyHlsStreamUrl(url);
    const looksLikeDirectFileVideo = /\.(mp4|webm|mov|m4v|mkv)($|[?#])/i.test(url);
    let sourceAssigned = false;
    let stallWatchdogId = null;
    let lastProgressAt = Date.now();
    let lastPlaybackTime = 0;
    let recoveryInFlight = false;
    const markProgress = () => {
      lastProgressAt = Date.now();
      lastPlaybackTime = Number(video.currentTime || 0);
    };
    video.addEventListener('timeupdate', markProgress);
    video.addEventListener('progress', markProgress);
    video.addEventListener('playing', markProgress);
    video.addEventListener('canplay', markProgress);

    const tryRestoreAudio = async () => {
      if (isStale()) return false;
      if (!video.muted) return true;
      video.muted = false;
      video.defaultMuted = false;
      try {
        await video.play();
        return true;
      } catch (_) {
        return false;
      }
    };

    const playWithAudioRecovery = async () => {
      const played = await tryPlayVideoWithMutedFallback(video);
      if (!played) return false;
      if (video.muted) {
        const restored = await tryRestoreAudio();
        if (!restored) {
          // Keep playback running even when browser blocks unmuted autoplay.
          video.muted = true;
          video.defaultMuted = true;
        }
      }
      return true;
    };

    const showFailure = (message) => {
      if (fallbackShown || isStale()) return;
      fallbackShown = true;
      if (stallWatchdogId) {
        clearInterval(stallWatchdogId);
        stallWatchdogId = null;
      }
      if (status !== 'ended') markStreamPlaybackOffline(address);
      clearPlayback();
      renderPlaybackFallback(message, url);
    };

    const attemptPlaybackRecovery = async (reason = 'watchdog') => {
      if (recoveryInFlight || isStale() || fallbackShown) return false;
      if (video.ended) return false;
      if (video.paused && !video.seeking && reason !== 'error') return false;

      const now = Date.now();
      const currentTime = Number(video.currentTime || 0);
      const stalledLongEnough = (now - lastProgressAt) > 9000;
      const timeMoved = Math.abs(currentTime - lastPlaybackTime) > 0.04;
      if (reason !== 'error' && (!stalledLongEnough || timeMoved)) return false;

      recoveryInFlight = true;
      try {
        if (state.hlsInstance && hlsAttached) {
          try { state.hlsInstance.startLoad(-1); } catch (_) {}
          const liveSync = Number(state.hlsInstance.liveSyncPosition || 0);
          let liveEdge = Number.isFinite(liveSync) && liveSync > 0 ? liveSync : 0;
          if (!liveEdge && video.seekable && video.seekable.length) {
            try { liveEdge = Number(video.seekable.end(video.seekable.length - 1) || 0); } catch (_) { liveEdge = 0; }
          }
          if (liveEdge > 0) {
            const drift = liveEdge - Number(video.currentTime || 0);
            if (drift > 3.5) {
              try { video.currentTime = Math.max(0, liveEdge - 0.35); } catch (_) {}
            }
          }
          if ((now - lastProgressAt) > 12000) {
            try { state.hlsInstance.recoverMediaError(); } catch (_) {}
          }
        } else if (sourceAssigned && (video.readyState || 0) < 2) {
          const sourceUrl = video.currentSrc || url;
          if (sourceUrl) {
            try {
              video.src = sourceUrl;
              video.load();
            } catch (_) {}
          }
        }

        const played = await playWithAudioRecovery();
        if (played && status !== 'ended') markStreamPlaybackOnline(address);
        markProgress();
        return !!played;
      } catch (_) {
        return false;
      } finally {
        recoveryInFlight = false;
      }
    };

    const scheduleRecovery = () => {
      if (isStale() || fallbackShown) return;
      window.setTimeout(() => {
        attemptPlaybackRecovery('stall').catch(() => {});
      }, 1500);
    };
    video.addEventListener('waiting', scheduleRecovery);
    video.addEventListener('stalled', scheduleRecovery);
    stallWatchdogId = window.setInterval(() => {
      if (isStale() || fallbackShown || !document.body.contains(video)) {
        clearInterval(stallWatchdogId);
        stallWatchdogId = null;
        return;
      }
      attemptPlaybackRecovery('watchdog').catch(() => {});
    }, 6000);

    const attachHls = async () => {
      if (hlsAttached || isStale()) return false;
      try {
        const hls = await attachHlsPlaybackWithRecovery(video, url, {
          isStale,
          onAttach: (instance) => { state.hlsInstance = instance; },
          onFatal: () => {
            showFailure('Playback failed after multiple retries. The stream may be offline, blocked by CORS, or unsupported.');
          },
          hlsConfig: {
            xhrSetup: (xhr) => { xhr.withCredentials = false; },
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 9,
            maxBufferLength: 60,
            maxMaxBufferLength: 180,
            backBufferLength: 45
          },
          maxNetworkRecoveries: 6,
          maxMediaRecoveries: 3
        });
        if (!hls) return false;
        hlsAttached = true;
        return true;
      } catch (_) {
        return false;
      }
    };

    video.addEventListener('error', () => {
      if (isStale()) return;
      (async () => {
        if (!hlsAttached && !video.canPlayType('application/vnd.apple.mpegurl') && (shouldPreferHls || !looksLikeDirectFileVideo)) {
          const attached = await attachHls();
          if (attached) return;
        }
        const recovered = await attemptPlaybackRecovery('error');
        if (recovered) return;
        showFailure('Playback failed. The stream URL may be offline or unsupported.');
      })().catch(() => {
        showFailure('Playback failed. The stream URL may be offline or unsupported.');
      });
    });
    if (shouldPreferHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        sourceAssigned = true;
      } else {
        const attached = await attachHls();
        if (attached) {
          window.setTimeout(() => {
            if (isStale()) return;
            attemptPlaybackRecovery('error').catch(() => {});
          }, 900);
          return;
        }
      }
    }

    if (!hlsAttached && !sourceAssigned) {
      video.src = url;
      sourceAssigned = true;
    }
    if (sourceAssigned && !hlsAttached) {
      const played = await playWithAudioRecovery();
      if (played && status !== 'ended') markStreamPlaybackOnline(address);
    }
  }

  function renderVideo(stream) {
    const hostPubkey = normalizePubkeyHex(stream.hostPubkey) || normalizePubkeyHex(stream.pubkey) || stream.hostPubkey || stream.pubkey;
    const p = profileFor(hostPubkey);

    // Title & summary
    const title = qs('.sib-title');
    if (title) title.textContent = stream.title;
    const summary = qs('.sib-summary');
    if (summary) summary.textContent = stream.summary || 'Live stream.';

    const claimedNip05 = normalizeNip05Value(p.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(hostPubkey, p.nip05 || '', { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS });
    if (claimedNip05) {
      ensureNip05Verification(hostPubkey, claimedNip05, { maxAgeMs: NIP05_LIVE_UI_MAX_AGE_MS }).catch(() => {});
    }

    // Host avatar
    const av = qs('.sib-av');
    if (av) {
      setAvatarEl(av, p.picture || '', pickAvatar(hostPubkey));
      av.classList.toggle('nip05-square', !!verifiedNip05);
      av.onclick = () => showProfileByPubkey(hostPubkey);
    }

    // Host name + nip05
    const name = qs('.sib-name');
    if (name) {
      name.innerHTML = '';
      name.textContent = p.name || shortHex(hostPubkey);
      if (verifiedNip05) {
        const badge = document.createElement('span');
        badge.className = 'nip05-badge';
        badge.title = `NIP-05: ${verifiedNip05}`;
        badge.textContent = '\u2713';
        name.appendChild(document.createTextNode(' '));
        name.appendChild(badge);
      }
    }
    const ident = qs('.sib-identity');
    if (ident) ident.textContent = verifiedNip05 || shortHex(hostPubkey);

    // Hosted-by box: inline in .sib-host-row to the right of .sib-host-info
    let sibHostedBy = qs('.sib-hosted-by');
    if (!sibHostedBy) {
      sibHostedBy = document.createElement('div');
      sibHostedBy.className = 'sib-hosted-by';
      const hostRow = qs('.sib-host-row');
      if (hostRow) hostRow.appendChild(sibHostedBy);
      else if (ident && ident.parentNode) ident.parentNode.appendChild(sibHostedBy);
    }
    sibHostedBy.innerHTML = '';
    if (stream.platformPubkey) {
      const plat = profileFor(stream.platformPubkey);
      const host = profileFor(hostPubkey);
      const platName = plat.display_name || plat.name || '';
      const hostName = host.display_name || host.name || '';
      if (platName && platName !== hostName) {
        const platPic = (plat.picture || '').trim();
        const avHtml = platPic
          ? `<img src="${platPic}" alt="" onerror="this.style.display='none'">`
          : `<span class="hosted-by-av-fallback">${platName.charAt(0).toUpperCase()}</span>`;
        sibHostedBy.innerHTML = `<div class="hosted-by-box"><div class="hosted-by-av">${avHtml}</div><div class="hosted-by-inner"><span class="hosted-by-label">Hosted via</span><span class="hosted-by-name">${platName}</span></div></div>`;
        const box = sibHostedBy.querySelector('.hosted-by-box');
        if (box) box.addEventListener('click', () => showProfileByPubkey(stream.platformPubkey));
      }
    }

    // Stats ? viewers & relays
    const viewers = qs('#theaterViewers');
    if (viewers) viewers.textContent = formatCount(effectiveParticipants(stream));
    const relays = qs('#theaterRelays');
    if (relays) relays.textContent = String(state.relays.length);

    // Sats total for this stream from zap receipts.
    updateTheaterSatsDisplay(stream);

    // Followers ? fetch from profileStats if already loaded
    const followersEl = qs('#theaterFollowers');
    if (followersEl) {
      const statsTargetPubkey = normalizePubkeyHex(stream.hostPubkey || '') || normalizePubkeyHex(stream.pubkey || '');
      const stats = statsTargetPubkey && state.profileStatsByPubkey
        ? state.profileStatsByPubkey.get(statsTargetPubkey)
        : null;
      followersEl.textContent = stats ? formatCount(stats.followers || 0) : '-';
    }

    // Runtime counter ? ticks every second from stream.starts
    clearInterval(state._theaterRuntimeInterval);
    const runtimeEl = qs('#theaterRuntime');
    if (runtimeEl) {
      const updateRuntime = () => {
        const startTs = stream.starts || stream.created_at;
        if (!startTs) { runtimeEl.textContent = '-'; return; }
        const secs = Math.max(0, Math.floor(Date.now() / 1000) - startTs);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        runtimeEl.textContent = h > 0
          ? `${h}h ${String(m).padStart(2,'0')}m`
          : `${m}m ${String(s).padStart(2,'0')}s`;
      };
      updateRuntime();
      state._theaterRuntimeInterval = setInterval(updateRuntime, 1000);
    }

    // Reactions row state
    const likeBtn = qs('#likeBtn');
    const isLiked = state.likedStreamAddresses.has(stream.address);
    if (likeBtn) likeBtn.classList.toggle('liked', isLiked);
    renderStreamReactionsUi(stream);

    // Follow/share button state
    updateTheaterFollowBtn(hostPubkey);
    updateTheaterShareBtn(stream);
    refreshOwnStreamBoostState(stream);

    renderVideoPlayback(stream);

    // Owner-only controls
    // Ownership: the person who published the NIP-53 event (stream.pubkey), not the host
    const owner = state.user && state.user.pubkey === stream.pubkey;
    const endBtn = qs('#endStreamBtn');
    if (endBtn) endBtn.classList.toggle('visible', !!owner);
    qsa('.owner-only').forEach((n) => n.classList.toggle('visible', !!owner));
  }

  function updateTheaterFollowBtn(pubkey) {
    const btn = qs('#theaterFollowBtn');
    if (!btn) return;
    const isFollowing = isFollowingPubkey(pubkey);
    btn.textContent = isFollowing ? 'Unfollow' : 'Follow';
    btn.classList.toggle('following-active', isFollowing);
  }

  function updateTheaterShareBtn(stream) {
    const btn = qs('#theaterShareBtn');
    if (!btn) return;
    const boosted = !!(state.user && stream && state.boostedStreamAddresses.has(stream.address));
    btn.classList.toggle('boosted', boosted);
  }

  async function findOwnStreamBoostEventId(stream) {
    if (!state.user || !stream || !state.pool) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own || !stream.id || !stream.address) return '';
    const filters = [
      { kinds: [6], authors: [own], '#e': [stream.id], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 120 },
      { kinds: [6], authors: [own], '#a': [stream.address], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 120 },
      { kinds: [KIND_DELETION], authors: [own], limit: 150, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 120 }
    ];
    const events = await fetchEventsCached(
      filters,
      {
        scope: 'own-stream-boost',
        cacheKey: `own-stream-boost:${own}:${stream.address}:${stream.id}`,
        timeoutMs: 1800,
        maxEvents: 500
      }
    );

    const reposts = [];
    const deletedIds = new Set();
    events.forEach((ev) => {
      if (!ev || !ev.id) return;
      if (ev.kind === 6) reposts.push(ev);
      else if (ev.kind === KIND_DELETION) {
        (ev.tags || []).forEach((t) => {
          if (Array.isArray(t) && t[0] === 'e' && t[1]) deletedIds.add(String(t[1]));
        });
      }
    });

    const newest = reposts
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))
      .find((ev) => !deletedIds.has(ev.id));
    return newest ? newest.id : '';
  }

  async function refreshOwnStreamBoostState(stream) {
    if (!stream || !stream.address) return;
    if (!state.user || !state.pool) {
      state.boostedStreamAddresses.delete(stream.address);
      state.streamBoostEventIdByAddress.delete(stream.address);
      state.streamBoostCheckedByAddress.delete(stream.address);
      state.streamBoostCheckPendingByAddress.delete(stream.address);
      updateTheaterShareBtn(stream);
      return;
    }

    if (state.streamBoostCheckedByAddress.has(stream.address) || state.streamBoostCheckPendingByAddress.has(stream.address)) {
      updateTheaterShareBtn(stream);
      return;
    }

    state.streamBoostCheckPendingByAddress.add(stream.address);
    try {
      const boostId = await findOwnStreamBoostEventId(stream);
      if (boostId) {
        state.boostedStreamAddresses.add(stream.address);
        state.streamBoostEventIdByAddress.set(stream.address, boostId);
      } else {
        state.boostedStreamAddresses.delete(stream.address);
        state.streamBoostEventIdByAddress.delete(stream.address);
      }
      state.streamBoostCheckedByAddress.add(stream.address);
      if (state.selectedStreamAddress === stream.address) updateTheaterShareBtn(stream);
    } catch (_) {
      // no-op
    } finally {
      state.streamBoostCheckPendingByAddress.delete(stream.address);
    }
  }

  // Debounce timer for relay search
  let _searchRelaySubId = null;
  let _searchDebounceTimer = null;

  function buildSearchProfileItem(p, box) {
    const item = document.createElement('div');
    item.className = 'sr-item';
    const verifiedNip05 = getVerifiedNip05ForPubkey(p.pubkey, p.nip05 || '');
    if (!verifiedNip05 && normalizeNip05Value(p.nip05 || '')) ensureNip05Verification(p.pubkey, p.nip05 || '').catch(() => {});
    const hasNip05 = !!verifiedNip05;
    const avClass = hasNip05 ? 'sr-av nip05-square' : 'sr-av';
    item.innerHTML = `<div class="${avClass}"></div><div><div class="sr-title"></div><div class="sr-sub"></div></div>`;
    setAvatarEl(qs('.sr-av', item), p.picture || '', pickAvatar(p.pubkey));
    qs('.sr-title', item).textContent = p.name;
    qs('.sr-sub', item).textContent = verifiedNip05 || shortHex(p.pubkey);
    item.addEventListener('click', () => {
      showProfileByPubkey(p.pubkey);
      box.classList.remove('open');
    });
    return item;
  }

  function renderSearch(term) {
    const box = qs('#searchResults');
    if (!box) return;

    // Cancel any in-flight relay search
    if (_searchDebounceTimer) { clearTimeout(_searchDebounceTimer); _searchDebounceTimer = null; }
    if (_searchRelaySubId && state.pool) {
      try { state.pool.unsubscribe(_searchRelaySubId); } catch (_) {}
      _searchRelaySubId = null;
    }

    if (!term) {
      box.classList.remove('open');
      return;
    }

    const streams = sortedLiveStreams().filter((s) => s.title.toLowerCase().includes(term) || profileFor(s.hostPubkey).name.toLowerCase().includes(term)).slice(0, 5);

    // Local cache match ? all cached profiles, not just streamers
    const localProfiles = Array.from(state.profilesByPubkey.values()).filter((p) => {
      const t = term.toLowerCase();
      return (p.name || '').toLowerCase().includes(t) ||
             (p.display_name || '').toLowerCase().includes(t) ||
             (p.username || '').toLowerCase().includes(t) ||
             (p.nip05 || '').toLowerCase().includes(t) ||
             (p.pubkey || '').toLowerCase().startsWith(t);
    }).slice(0, 8);

    function rebuildBox(extraProfiles) {
      box.innerHTML = '';

      // --- Streams ---
      if (streams.length) {
        const streamLabel = document.createElement('span');
        streamLabel.className = 'sr-label';
        streamLabel.textContent = 'Live Streams';
        box.appendChild(streamLabel);

        streams.forEach((s) => {
          const p = profileFor(s.pubkey);
          const item = document.createElement('div');
          item.className = 'sr-item';
          item.innerHTML = `<div class="sr-av rect">L</div><div><div class="sr-title"></div><div class="sr-sub"></div></div><span class="sr-live">LIVE</span>`;
          qs('.sr-title', item).textContent = s.title;
          qs('.sr-sub', item).textContent = p.name;
          item.addEventListener('click', () => { openStream(s.address); box.classList.remove('open'); });
          box.appendChild(item);
        });

        const sep = document.createElement('div'); sep.className = 'dd-sep'; box.appendChild(sep);
      }

      // Merge local + extra, de-dupe by pubkey
      const seen = new Set();
      const merged = [];
      [...localProfiles, ...extraProfiles].forEach((p) => {
        if (!seen.has(p.pubkey)) { seen.add(p.pubkey); merged.push(p); }
      });

      // --- Users ---
      const userLabel = document.createElement('span');
      userLabel.className = 'sr-label';
      userLabel.textContent = merged.length ? 'Users' : 'Searching Nostr...';
      box.appendChild(userLabel);

      merged.slice(0, 8).forEach((p) => {
        box.appendChild(buildSearchProfileItem(p, box));
      });

      box.classList.add('open');
    }

    rebuildBox([]);

    // --- Relay queries for broad Nostr search ---
    _searchDebounceTimer = setTimeout(async () => {
      if (!state.pool) return;

      const extraProfiles = [];
      const relayResults = new Map(); // pubkey -> event

      // 1. If looks like npub -> decode + fetch by pubkey
      const npubMatch = term.match(/^npub1[023456789acdefghjklmnpqrstuvwxyz]{6,}/i);
      if (npubMatch) {
        try {
          const tools = await ensureNostrTools();
          const dec = tools.nip19.decode(npubMatch[0].toLowerCase());
          if (dec && dec.type === 'npub') {
            const subId = state.pool.subscribe([{ kinds: [KIND_PROFILE], authors: [dec.data], limit: 1 }], {
              event(ev) {
                const p = parseProfile(ev);
                state.profilesByPubkey.set(p.pubkey, p);
                relayResults.set(p.pubkey, p);
                rebuildBox(Array.from(relayResults.values()));
              },
              eose() {}
            });
            _searchRelaySubId = subId;
          }
        } catch (_) {}
        return;
      }

      // 2. If looks like nip-05 (contains @) -> resolve via .well-known
      if (term.includes('@') && term.split('@').length === 2) {
        const [localPart, domain] = term.split('@');
        if (localPart && domain && domain.includes('.')) {
          try {
            const resp = await fetch(`https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(localPart)}`);
            const data = await resp.json();
            const pubkey = data.names && (data.names[localPart] || data.names[localPart.toLowerCase()]);
            if (pubkey && /^[0-9a-f]{64}$/i.test(pubkey)) {
              const subId = state.pool.subscribe([{ kinds: [KIND_PROFILE], authors: [pubkey], limit: 1 }], {
                event(ev) {
                  const p = parseProfile(ev);
                  state.profilesByPubkey.set(p.pubkey, p);
                  relayResults.set(p.pubkey, p);
                  rebuildBox(Array.from(relayResults.values()));
                },
                eose() {}
              });
              _searchRelaySubId = subId;
            }
          } catch (_) {}
          return;
        }
      }

      // 3. General text search ? use NIP-50 search filter (supported by many relays)
      //    Also fetch recent kind:0 events and filter locally
      const filters = [];
      if (term.length >= 2) {
        filters.push({ kinds: [KIND_PROFILE], search: term, limit: 20 });
      }

      if (filters.length) {
        const subId = state.pool.subscribe(filters, {
          event(ev) {
            if (relayResults.has(ev.pubkey)) {
              if ((relayResults.get(ev.pubkey).created_at || 0) >= (ev.created_at || 0)) return;
            }
            const p = parseProfile(ev);
            state.profilesByPubkey.set(p.pubkey, p);
            const t = term.toLowerCase();
            const matches = (p.name || '').toLowerCase().includes(t) ||
                            (p.display_name || '').toLowerCase().includes(t) ||
                            (p.username || '').toLowerCase().includes(t) ||
                            (p.nip05 || '').toLowerCase().includes(t) ||
                            (p.pubkey || '').toLowerCase().startsWith(t);
            if (matches) {
              relayResults.set(p.pubkey, p);
              rebuildBox(Array.from(relayResults.values()));
            }
          },
          eose() {}
        });
        _searchRelaySubId = subId;
      }
    }, 350);
  }

  /* =====================================================================
     NIP-21 CONTENT RENDERING ? nostr:npub / nprofile / nevent / note
     Parses inline nostr: entities per NIP-21 and renders them as:
     - npub1 / nprofile1 -> clickable @mention pill (fetches profile)
     - nevent1 / note1   -> embedded quoted note card (fetches event + author)
     ===================================================================== */

  function _decodeNostrEntity(entity) {
    if (!window.NostrTools || !window.NostrTools.nip19) return null;
    try {
      const dec = window.NostrTools.nip19.decode(entity);
      if (!dec) return null;
      if (dec.type === 'npub')    return { type: 'npub',    pubkey: dec.data };
      if (dec.type === 'nprofile') return { type: 'nprofile', pubkey: dec.data.pubkey };
      if (dec.type === 'nevent')  return { type: 'nevent',  eventId: dec.data.id };
      if (dec.type === 'note')    return { type: 'note',    eventId: dec.data };
      if (dec.type === 'naddr')   return {
        type: 'naddr',
        kind: Number(dec.data && dec.data.kind || 0),
        pubkey: String(dec.data && dec.data.pubkey || ''),
        identifier: String((dec.data && (dec.data.identifier || dec.data.d)) || '')
      };
      return null;
    } catch (_) { return null; }
  }

  function _fetchEventById(eventId) {
    if (!eventId || !/^[0-9a-f]{64}$/i.test(eventId)) return Promise.resolve(null);
    return fetchEventsCached(
      [{ ids: [eventId], limit: 1 }],
      {
        scope: 'event-by-id',
        cacheKey: `event-by-id:${eventId}`,
        timeoutMs: 3000,
        maxEvents: 4
      }
    ).then((events) => events.find((ev) => ev && ev.id === eventId) || null);
  }

  async function _fetchLiveStreamByNaddrEntity(entity) {
    const decoded = _decodeNostrEntity(entity);
    if (!decoded || decoded.type !== 'naddr') return null;
    if (Number(decoded.kind || 0) !== KIND_LIVE_EVENT) return null;

    const pubkey = normalizePubkeyHex(decoded.pubkey || '') || String(decoded.pubkey || '').trim().toLowerCase();
    const d = String(decoded.identifier || '').trim();
    if (!pubkey || !d) return null;
    const address = `${KIND_LIVE_EVENT}:${pubkey}:${d}`;

    const existing = state.streamsByAddress.get(address);
    if (existing) return existing;

    const events = await fetchEventsCached(
      [{ kinds: [KIND_LIVE_EVENT], authors: [pubkey], '#d': [d], limit: 6 }],
      {
        scope: 'live-by-naddr',
        cacheKey: `live-by-naddr:${address}`,
        timeoutMs: 3200,
        maxEvents: 12
      }
    );
    if (!events.length) return null;

    const parsed = events
      .filter((ev) => ev && ev.kind === KIND_LIVE_EVENT)
      .map((ev) => parseLiveEvent(ev))
      .filter((stream) => stream && stream.address === address)
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    if (!parsed.length) return null;

    const stream = parsed[0];
    upsertStream(stream);
    return stream;
  }

  function _buildNaddrStreamCard(entity) {
    const card = document.createElement('article');
    card.className = 'naddr-stream-card';
    card.textContent = 'Loading stream preview...';

    const doLoad = async () => {
      const decoded = _decodeNostrEntity(entity);
      if (!decoded || decoded.type !== 'naddr') {
        card.textContent = '[could not parse stream address]';
        return;
      }
      if (Number(decoded.kind || 0) !== KIND_LIVE_EVENT) {
        card.innerHTML = '';
        const link = document.createElement('a');
        link.className = 'naddr-stream-open';
        link.href = `nostr:${entity}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `Open nostr:${entity}`;
        card.appendChild(link);
        return;
      }

      const stream = await _fetchLiveStreamByNaddrEntity(entity);
      if (!stream) {
        card.textContent = '[stream not found on connected relays]';
        return;
      }

      const hostPubkey = normalizePubkeyHex(stream.hostPubkey || stream.pubkey || '') || stream.hostPubkey || stream.pubkey;
      const platformPubkey = normalizePubkeyHex(stream.platformPubkey || '') || '';
      await fetchProfileIfNeeded(hostPubkey).catch(() => {});
      if (platformPubkey && platformPubkey !== hostPubkey) await fetchProfileIfNeeded(platformPubkey).catch(() => {});
      const hostProfile = profileFor(hostPubkey);
      const platformProfile = platformPubkey ? profileFor(platformPubkey) : null;

      card.innerHTML = '';
      const badgeRow = document.createElement('div');
      badgeRow.className = 'naddr-stream-badge-row';
      const badge = document.createElement('span');
      badge.className = 'naddr-stream-badge';
      badge.textContent = (normalizeStreamStatus(stream.status || 'live') || 'live').toUpperCase();
      badgeRow.appendChild(badge);
      card.appendChild(badgeRow);

      const title = document.createElement('div');
      title.className = 'naddr-stream-title';
      title.textContent = stream.title || 'Untitled stream';
      card.appendChild(title);

      const hostRow = document.createElement('div');
      hostRow.className = 'naddr-stream-host-row';
      const av = document.createElement('div');
      av.className = 'naddr-stream-av';
      setAvatarEl(av, hostProfile.picture || '', pickAvatar(hostPubkey));
      hostRow.appendChild(av);
      const hostMeta = document.createElement('div');
      hostMeta.className = 'naddr-stream-host-meta';
      const hostName = document.createElement('div');
      hostName.className = 'naddr-stream-host-name';
      hostName.textContent = hostProfile.display_name || hostProfile.name || shortHex(hostPubkey);
      hostMeta.appendChild(hostName);
      const hostId = document.createElement('div');
      hostId.className = 'naddr-stream-host-id';
      hostId.textContent = shortHex(hostPubkey);
      hostMeta.appendChild(hostId);
      hostRow.appendChild(hostMeta);
      card.appendChild(hostRow);

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'naddr-stream-thumb-wrap';
      if (isLikelyUrl(stream.image || '')) {
        const img = document.createElement('img');
        img.className = 'naddr-stream-thumb';
        img.src = stream.image;
        img.alt = stream.title || 'Stream thumbnail';
        img.loading = 'lazy';
        thumbWrap.appendChild(img);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'naddr-stream-thumb-fallback';
        fallback.textContent = stream.summary || 'Live stream preview';
        thumbWrap.appendChild(fallback);
      }
      card.appendChild(thumbWrap);

      if (isLikelyUrl(stream.image || '')) {
        const thumbUrl = document.createElement('a');
        thumbUrl.className = 'naddr-stream-thumb-url';
        thumbUrl.href = stream.image;
        thumbUrl.target = '_blank';
        thumbUrl.rel = 'noopener noreferrer';
        thumbUrl.textContent = stream.image;
        card.appendChild(thumbUrl);
      }

      if (platformPubkey && platformPubkey !== hostPubkey) {
        const via = document.createElement('div');
        via.className = 'naddr-stream-via';
        via.textContent = `Hosted via ${platformProfile.display_name || platformProfile.name || shortHex(platformPubkey)}`;
        card.appendChild(via);
      }

      const openLink = document.createElement('a');
      openLink.className = 'naddr-stream-open';
      openLink.href = `/${'a'}/${encodeStreamNaddr(stream) || entity}`;
      openLink.textContent = 'Open stream';
      openLink.addEventListener('click', (evt) => {
        evt.preventDefault();
        evt.stopPropagation();
        openStream(stream.address);
      });
      card.appendChild(openLink);

      card.addEventListener('click', (evt) => {
        if (evt.target && evt.target.closest('a')) return;
        evt.preventDefault();
        evt.stopPropagation();
        openStream(stream.address);
      });
    };

    if (window.NostrTools && window.NostrTools.nip19) {
      doLoad().catch(() => { card.textContent = '[error loading stream preview]'; });
    } else {
      ensureNostrTools()
        .then(doLoad)
        .catch(() => { card.textContent = '[error loading stream preview]'; });
    }
    return card;
  }

  function _buildMentionPill(pubkey) {
    const pill = document.createElement('span');
    pill.className = 'nostr-mention-pill';
    const known = state.profilesByPubkey.has(pubkey);
    const p = profileFor(pubkey);
    pill.textContent = '@' + (known ? p.name : shortHex(pubkey));
    pill.style.cursor = 'pointer';
    pill.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(pubkey); };
    if (!known) {
      fetchProfileIfNeeded(pubkey).then(() => {
        const fresh = profileFor(pubkey);
        pill.textContent = '@' + (fresh.name || shortHex(pubkey));
      }).catch(() => {});
    }
    return pill;
  }

  function _buildNeventCard(entity) {
    const card = document.createElement('div');
    card.className = 'nevent-embed-card';
    card.textContent = 'Loading quoted note...';

    const doLoad = () => {
      const decoded = _decodeNostrEntity(entity);
      if (!decoded || !decoded.eventId) { card.textContent = '[could not parse note reference]'; return; }
      _fetchEventById(decoded.eventId).then((ev) => {
        if (!ev) { card.textContent = '[note not found on connected relays]'; return; }
        return fetchProfileIfNeeded(ev.pubkey).then(() => {
          const p = profileFor(ev.pubkey);
          card.innerHTML = '';

          const header = document.createElement('div');
          header.className = 'nevent-embed-header';
          const av = document.createElement('div');
          av.className = 'nevent-embed-av';
          setAvatarEl(av, p.picture || '', pickAvatar(ev.pubkey));
          const nameSpan = document.createElement('span');
          nameSpan.className = 'nevent-embed-name';
          nameSpan.textContent = p.name || shortHex(ev.pubkey);
          nameSpan.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(ev.pubkey); };
          const timeSpan = document.createElement('span');
          timeSpan.className = 'nevent-embed-time';
          timeSpan.textContent = formatTimeAgo(ev.created_at) + ' ago';
          header.appendChild(av);
          header.appendChild(nameSpan);
          header.appendChild(timeSpan);

          const body = document.createElement('div');
          body.className = 'nevent-embed-body';
          const mediaUrls = extractMediaUrlsFromEvent(ev);
          const previewText = stripMediaUrlsFromText(ev.content || '', mediaUrls);
          body.textContent = previewText.slice(0, 280) + (previewText.length > 280 ? '...' : '');

          card.appendChild(header);
          card.appendChild(body);
          card.onclick = () => showProfileByPubkey(ev.pubkey);
        });
      }).catch(() => { card.textContent = '[error loading note]'; });
    };

    // If NostrTools isn't ready yet, wait for it
    if (window.NostrTools && window.NostrTools.nip19) {
      doLoad();
    } else {
      ensureNostrTools().then(doLoad).catch(() => { card.textContent = '[error loading note]'; });
    }
    return card;
  }

  function safeHrefFromUrl(rawUrl) {
    const clean = String(rawUrl || '').trim();
    if (!clean) return '';
    try {
      const parsed = new URL(clean);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return parsed.href;
    } catch (_) {
      return '';
    }
  }

  function trimUrlTrailingPunctuation(rawUrl) {
    return String(rawUrl || '').replace(/[)\],.;!?'"`>]+$/g, '');
  }

  function _appendNostrEntityToNode(parent, entity, rawToken, opts = {}) {
    if (!parent || !entity) return;
    const allowEventEmbeds = !!opts.allowEventEmbeds;

    if (entity.startsWith('npub1') || entity.startsWith('nprofile1')) {
      if (window.NostrTools && window.NostrTools.nip19) {
        const decoded = _decodeNostrEntity(entity);
        parent.appendChild(decoded ? _buildMentionPill(decoded.pubkey) : document.createTextNode(rawToken || `nostr:${entity}`));
      } else {
        const pill = document.createElement('span');
        pill.className = 'nostr-mention-pill';
        pill.textContent = '@' + entity.slice(0, 12) + '...';
        parent.appendChild(pill);
        ensureNostrTools().then(() => {
          const decoded = _decodeNostrEntity(entity);
          if (decoded && decoded.pubkey) {
            pill.textContent = '@' + (profileFor(decoded.pubkey).name || shortHex(decoded.pubkey));
            pill.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(decoded.pubkey); };
            fetchProfileIfNeeded(decoded.pubkey).then(() => {
              pill.textContent = '@' + (profileFor(decoded.pubkey).name || shortHex(decoded.pubkey));
            }).catch(() => {});
          }
        }).catch(() => {});
      }
      return;
    }

    if (entity.startsWith('nevent1') || entity.startsWith('note1')) {
      if (allowEventEmbeds) {
        parent.appendChild(_buildNeventCard(entity));
      } else {
        const link = document.createElement('a');
        link.href = `nostr:${entity}`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'nostr-inline-link';
        link.textContent = `nostr:${entity}`;
        parent.appendChild(link);
      }
      return;
    }

    if (entity.startsWith('naddr1')) {
      parent.appendChild(_buildNaddrStreamCard(entity));
      return;
    }

    parent.appendChild(document.createTextNode(rawToken || `nostr:${entity}`));
  }

  function _appendInlineNostrMarkup(parent, text) {
    if (!parent) return;
    const raw = String(text || '');
    if (!raw) return;

    const TOKEN_RE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\*[^*\n]+?\*)|(nostr:(npub1[a-zA-Z0-9]+|nprofile1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|naddr1[a-zA-Z0-9]+))|(https?:\/\/[^\s<]+)/g;
    let cursor = 0;
    let match;
    while ((match = TOKEN_RE.exec(raw)) !== null) {
      if (match.index > cursor) {
        parent.appendChild(document.createTextNode(raw.slice(cursor, match.index)));
      }

      const token = match[0];
      if (match[1]) {
        const code = document.createElement('code');
        code.className = 'nostr-inline-code';
        code.textContent = token.slice(1, -1);
        parent.appendChild(code);
      } else if (match[2]) {
        const strong = document.createElement('strong');
        strong.className = 'nostr-md-strong';
        _appendInlineNostrMarkup(strong, token.slice(2, -2));
        parent.appendChild(strong);
      } else if (match[3]) {
        const strike = document.createElement('s');
        strike.className = 'nostr-md-strike';
        _appendInlineNostrMarkup(strike, token.slice(2, -2));
        parent.appendChild(strike);
      } else if (match[4]) {
        const italic = document.createElement('em');
        italic.className = 'nostr-md-italic';
        _appendInlineNostrMarkup(italic, token.slice(1, -1));
        parent.appendChild(italic);
      } else if (match[5]) {
        _appendNostrEntityToNode(parent, match[6], match[5], { allowEventEmbeds: false });
      } else if (match[7]) {
        const cleanUrl = trimUrlTrailingPunctuation(match[7]);
        const href = safeHrefFromUrl(cleanUrl);
        if (href) {
          const a = document.createElement('a');
          a.href = href;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'nostr-inline-link';
          a.textContent = cleanUrl;
          parent.appendChild(a);
          const trailing = token.slice(cleanUrl.length);
          if (trailing) parent.appendChild(document.createTextNode(trailing));
        } else {
          parent.appendChild(document.createTextNode(token));
        }
      } else {
        parent.appendChild(document.createTextNode(token));
      }
      cursor = TOKEN_RE.lastIndex;
    }

    if (cursor < raw.length) {
      parent.appendChild(document.createTextNode(raw.slice(cursor)));
    }
  }

  // Main content renderer returns a DocumentFragment safe for appending to DOM.
  function renderNostrContent(text) {
    const frag = document.createDocumentFragment();
    const source = String(text || '').replace(/\r\n?/g, '\n');
    if (!source.trim()) return frag;

    const lines = source.split('\n');
    let activeList = null;
    let paragraphLines = [];

    const closeList = () => { activeList = null; };
    const flushParagraph = () => {
      if (!paragraphLines.length) return;
      const p = document.createElement('p');
      p.className = 'nostr-md-p';
      paragraphLines.forEach((line, idx) => {
        if (idx) p.appendChild(document.createElement('br'));
        _appendInlineNostrMarkup(p, line);
      });
      frag.appendChild(p);
      paragraphLines = [];
    };
    const ensureList = (kind) => {
      if (!activeList || activeList.kind !== kind) {
        const list = document.createElement(kind);
        list.className = kind === 'ul' ? 'nostr-md-ul' : 'nostr-md-ol';
        frag.appendChild(list);
        activeList = { kind, el: list };
      }
      return activeList.el;
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      const standaloneEntity = trimmed.match(/^nostr:(npub1[a-zA-Z0-9]+|nprofile1[a-zA-Z0-9]+|nevent1[a-zA-Z0-9]+|note1[a-zA-Z0-9]+|naddr1[a-zA-Z0-9]+)$/);
      if (standaloneEntity && (standaloneEntity[1].startsWith('nevent1') || standaloneEntity[1].startsWith('note1') || standaloneEntity[1].startsWith('naddr1'))) {
        flushParagraph();
        closeList();
        _appendNostrEntityToNode(frag, standaloneEntity[1], standaloneEntity[0], { allowEventEmbeds: true });
        return;
      }

      const heading = line.match(/^\s*(#{1,3})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        closeList();
        const level = heading[1].length;
        const h = document.createElement(`h${level}`);
        h.className = `nostr-md-h${level}`;
        _appendInlineNostrMarkup(h, heading[2]);
        frag.appendChild(h);
        return;
      }

      const quote = line.match(/^\s*>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        const blockquote = document.createElement('blockquote');
        blockquote.className = 'nostr-md-blockquote';
        _appendInlineNostrMarkup(blockquote, quote[1]);
        frag.appendChild(blockquote);
        return;
      }

      const ul = line.match(/^\s*-\s+(.*)$/);
      if (ul) {
        flushParagraph();
        const list = ensureList('ul');
        const li = document.createElement('li');
        li.className = 'nostr-md-li';
        _appendInlineNostrMarkup(li, ul[1]);
        list.appendChild(li);
        return;
      }

      const ol = line.match(/^\s*(\d+)\.\s+(.*)$/);
      if (ol) {
        flushParagraph();
        const list = ensureList('ol');
        const li = document.createElement('li');
        li.className = 'nostr-md-li';
        _appendInlineNostrMarkup(li, ol[2]);
        list.appendChild(li);
        return;
      }

      closeList();
      paragraphLines.push(line);
    });

    flushParagraph();
    return frag;
  }

  /* ===================================================================== */

  function firstTagValue(tags, key) {
    const found = (tags || []).find((t) => Array.isArray(t) && t[0] === key && t[1]);
    return found ? String(found[1]) : '';
  }

  function allTagValues(tags, key) {
    return (tags || [])
      .filter((t) => Array.isArray(t) && t[0] === key && t[1])
      .map((t) => String(t[1]));
  }

  function formatChatTimestamp(ts) {
    const val = Number(ts || 0);
    if (!val) return '--:--';
    try {
      return new Date(val * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (_) {
      return '--:--';
    }
  }

  function parseJsonSafe(text) {
    const raw = String(text || '').trim();
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
    // NIP-57 receipts usually carry millisats in the amount tag.
    if (raw >= 1000) return Math.max(0, Math.floor(raw / 1000));
    return Math.max(0, Math.floor(raw));
  }

  function satsFromBolt11Tag(bolt11TagValue) {
    const invoice = String(bolt11TagValue || '').trim().toLowerCase();
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

    if (!Number.isFinite(sats) || sats <= 0) return 0;
    return Math.max(0, Math.floor(sats));
  }

  function parseStreamZapReceipt(ev, stream) {
    if (!ev || ev.kind !== KIND_ZAP_RECEIPT || !stream) return null;

    const tags = ev.tags || [];
    const description = parseJsonSafe(firstTagValue(tags, 'description')) || {};
    const descriptionTags = Array.isArray(description.tags) ? description.tags : [];
    const streamAddress = String(stream.address || '').trim();
    const streamEventId = String(stream.id || '').trim();
    const streamPublisherPubkey = normalizePubkeyHex(stream.pubkey || '');
    const streamHostPubkey = normalizePubkeyHex(stream.hostPubkey || '') || streamPublisherPubkey;
    const targetAList = [...allTagValues(tags, 'a'), ...allTagValues(descriptionTags, 'a')];
    const targetEList = [...allTagValues(tags, 'e'), ...allTagValues(descriptionTags, 'e')];
    const targetPList = [...allTagValues(tags, 'p'), ...allTagValues(descriptionTags, 'p')]
      .map((pk) => normalizePubkeyHex(pk))
      .filter(Boolean);
    const matchesByAddressOrEvent =
      (streamAddress && targetAList.includes(streamAddress)) ||
      (streamEventId && targetEList.includes(streamEventId));
    const matchesByTargetPubkey = targetPList.some((pk) => pk === streamHostPubkey || pk === streamPublisherPubkey);
    const hasOtherReference = !matchesByAddressOrEvent && (targetAList.length || targetEList.length);
    const matchesStream = matchesByAddressOrEvent || (matchesByTargetPubkey && !hasOtherReference);
    if (!matchesStream) return null;

    let sats = satsFromAmountTag(firstTagValue(tags, 'amount'));
    if (!sats) sats = satsFromAmountTag(firstTagValue(descriptionTags, 'amount'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(tags, 'bolt11'));
    if (!sats) sats = satsFromBolt11Tag(firstTagValue(descriptionTags, 'bolt11'));
    if (!sats) return null;

    const senderPubkey = normalizePubkeyHex(description.pubkey || ev.pubkey || '');
    const senderProfile = senderPubkey ? profileFor(senderPubkey) : null;
    const displayName = (senderProfile && (senderProfile.display_name || senderProfile.name)) ||
      (senderPubkey ? shortHex(senderPubkey) : 'Anon');
    const picture = (senderProfile && senderProfile.picture) || '';

    return {
      eventId: ev.id,
      created_at: Number(ev.created_at || 0),
      sats,
      senderPubkey,
      displayName,
      picture,
      note: String(description.content || '').trim()
    };
  }

  function updateTheaterSatsDisplay(stream) {
    const current = stream || state.streamsByAddress.get(state.selectedStreamAddress);
    const satsEl = qs('#theaterSats');
    if (!satsEl) return;
    if (!current) {
      satsEl.textContent = '-';
      return;
    }

    const total = Number(state.streamZapTotals.get(current.address) || 0);
    satsEl.textContent = formatCount(total);
  }

  function renderStreamZapList(stream) {
    const wrap = qs('#streamZapList');
    const current = stream || state.streamsByAddress.get(state.selectedStreamAddress);
    if (!wrap) return;
    if (!current) {
      wrap.innerHTML = '';
      return;
    }

    const entries = (state.streamRecentZapsByAddress.get(current.address) || []).slice(0, 3);
    wrap.innerHTML = '';
    if (!entries.length) return;

    entries.forEach((entry) => {
      const sender = normalizePubkeyHex(entry.senderPubkey || '');
      const profile = sender ? profileFor(sender) : null;
      const senderName = (profile && (profile.display_name || profile.name)) || entry.displayName || (sender ? shortHex(sender) : 'Anon');
      const senderPicture = (profile && profile.picture) || entry.picture || '';

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'stream-zap-pill';
      chip.title = entry.note || `${formatCount(entry.sats)} sats`;
      if (sender) {
        chip.addEventListener('click', () => showProfileByPubkey(sender));
      }

      const av = document.createElement('div');
      av.className = 'hosted-by-av';
      setAvatarEl(av, senderPicture, pickAvatar(sender || senderName));

      const inner = document.createElement('div');
      inner.className = 'hosted-by-inner';

      const amount = document.createElement('span');
      amount.className = 'hosted-by-label';
      amount.textContent = `${formatCount(entry.sats)} sats`;

      const name = document.createElement('span');
      name.className = 'hosted-by-name';
      name.textContent = senderName;

      inner.appendChild(amount);
      inner.appendChild(name);
      chip.appendChild(av);
      chip.appendChild(inner);
      wrap.appendChild(chip);

      if (sender && !state.profilesByPubkey.has(sender)) {
        fetchProfileIfNeeded(sender).then(() => {
          if (state.selectedStreamAddress === current.address) renderStreamZapList(current);
        }).catch(() => {});
      }
    });
  }

  function addStreamZapReceipt(ev, stream) {
    const current = stream || state.streamsByAddress.get(state.selectedStreamAddress);
    if (!current || !ev || !ev.id) return false;

    const parsed = parseStreamZapReceipt(ev, current);
    if (!parsed) return false;

    if (!state.streamZapEventIdsByAddress.has(current.address)) {
      state.streamZapEventIdsByAddress.set(current.address, new Set());
    }
    const seen = state.streamZapEventIdsByAddress.get(current.address);
    if (seen.has(parsed.eventId)) return false;
    seen.add(parsed.eventId);

    const prevTotal = Number(state.streamZapTotals.get(current.address) || 0);
    state.streamZapTotals.set(current.address, prevTotal + Number(parsed.sats || 0));

    const list = state.streamRecentZapsByAddress.get(current.address) || [];
    list.unshift(parsed);
    list.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    state.streamRecentZapsByAddress.set(current.address, list.slice(0, 20));

    updateTheaterSatsDisplay(current);
    renderStreamZapList(current);
    renderChatZapReceipt(parsed);
    return true;
  }
  function chatReactionKey(messageId, pubkey) {
    return `${messageId}:${pubkey}`;
  }

  function applyChatLikeReaction(messageId, pubkey, reactionEventId) {
    if (!messageId || !pubkey) return;
    if (!state.chatLikePubkeysByMessageId.has(messageId)) {
      state.chatLikePubkeysByMessageId.set(messageId, new Set());
    }
    state.chatLikePubkeysByMessageId.get(messageId).add(pubkey);

    const key = chatReactionKey(messageId, pubkey);
    const prevReactionId = state.chatReactionIdByMessageAndPubkey && state.chatReactionIdByMessageAndPubkey.get(key);
    if (prevReactionId && prevReactionId !== reactionEventId) {
      state.chatReactionEventById.delete(prevReactionId);
    }
    if (!state.chatReactionIdByMessageAndPubkey) state.chatReactionIdByMessageAndPubkey = new Map();
    if (reactionEventId) {
      state.chatReactionIdByMessageAndPubkey.set(key, reactionEventId);
      state.chatReactionEventById.set(reactionEventId, { messageId, pubkey });
    }

    if (state.user && normalizePubkeyHex(state.user.pubkey) === normalizePubkeyHex(pubkey)) {
      if (reactionEventId) state.chatOwnLikeEventByMessageId.set(messageId, reactionEventId);
      else {
        const ownKnown = state.chatReactionIdByMessageAndPubkey.get(key);
        if (ownKnown) state.chatOwnLikeEventByMessageId.set(messageId, ownKnown);
      }
    }
  }

  function applyChatUnlikeByReactionId(reactionEventId) {
    if (!reactionEventId) return;
    const meta = state.chatReactionEventById.get(reactionEventId);
    if (!meta) return;
    state.chatReactionEventById.delete(reactionEventId);
    if (!state.chatReactionIdByMessageAndPubkey) state.chatReactionIdByMessageAndPubkey = new Map();
    const key = chatReactionKey(meta.messageId, meta.pubkey);
    if (state.chatReactionIdByMessageAndPubkey.get(key) === reactionEventId) {
      state.chatReactionIdByMessageAndPubkey.delete(key);
    }

    const set = state.chatLikePubkeysByMessageId.get(meta.messageId);
    if (set) {
      set.delete(meta.pubkey);
      if (!set.size) state.chatLikePubkeysByMessageId.delete(meta.messageId);
    }

    if (state.user && normalizePubkeyHex(state.user.pubkey) === normalizePubkeyHex(meta.pubkey)) {
      const ownReactionId = state.chatOwnLikeEventByMessageId.get(meta.messageId);
      if (ownReactionId === reactionEventId) state.chatOwnLikeEventByMessageId.delete(meta.messageId);
    }
  }

  function updateChatLikeUi(messageId) {
    if (!messageId) return;
    const rows = qsa(`.cmsg[data-msg-id="${CSS.escape(messageId)}"]`);
    if (!rows.length) return;

    const likedBy = state.chatLikePubkeysByMessageId.get(messageId) || new Set();
    const count = likedBy.size;
    const userPubkey = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    const isLiked = !!(userPubkey && likedBy.has(userPubkey));

    rows.forEach((row) => {
      const btn = qs('.chat-like-btn', row);
      const countEl = qs('.chat-like-count', row);
      if (countEl) countEl.textContent = `${count}`;
      if (btn) {
        btn.classList.toggle('active', isLiked);
        btn.title = isLiked ? 'Unlike' : 'Like';
      }
    });
  }

  function normalizeReactionContentKey(content) {
    const raw = String(content == null ? '' : content).trim();
    if (!raw) return '+';
    const low = raw.toLowerCase();
    const mojibakeHeart = '\u00E2\u009D\u00A4';
    const mojibakeHeartVariant = '\u00E2\u009D\u00A4\u00EF\u00B8\u008F';
    const mojibakeEmojiMap = new Map([
      ['\u00E2\u009A\u00A1', '\u26A1'],
      ['\u00F0\u009F\u0094\u00A5', '\uD83D\uDD25'],
      ['\u00F0\u009F\u0091\u008F', '\uD83D\uDC4F'],
      ['\u00F0\u009F\u0098\u0082', '\uD83D\uDE02'],
      ['\u00F0\u009F\u0098\u00AE', '\uD83D\uDE2E'],
      ['\u00F0\u009F\u009A\u0080', '\uD83D\uDE80'],
      ['\u00F0\u009F\u00A4\u0099', '\uD83E\uDD19']
    ]);
    if (
      low === '+' ||
      low === 'like' ||
      raw === '\u2764' ||
      raw === '\u2764\uFE0F' ||
      raw === mojibakeHeart ||
      raw === mojibakeHeartVariant
    ) return '+';
    if (mojibakeEmojiMap.has(raw)) return mojibakeEmojiMap.get(raw);
    if (low === '-') return '-';
    return raw;
  }

  function parseReactionMeta(content, tags) {
    const key = normalizeReactionContentKey(content);
    if (!key || key === '-') return null;
    if (key === '+') return { key: '+', label: '\u2764\uFE0F', imageUrl: '', shortcode: '' };

    let imageUrl = '';
    let shortcode = '';
    const match = key.match(/^:([a-z0-9_+\-]{1,64}):$/i);
    if (match) {
      shortcode = match[1];
      const emojiTag = (tags || []).find((t) =>
        Array.isArray(t) &&
        String(t[0] || '').toLowerCase() === 'emoji' &&
        String(t[1] || '').toLowerCase() === shortcode.toLowerCase() &&
        isLikelyUrl(String(t[2] || ''))
      );
      if (emojiTag) imageUrl = String(emojiTag[2] || '').trim();
    }

    return { key, label: key, imageUrl, shortcode };
  }

  function streamReactionUserKey(reactionKey, pubkey) {
    return `${encodeURIComponent(reactionKey || '')}:${normalizePubkeyHex(pubkey || '')}`;
  }

  function ensureStreamReactionSet(reactionKey) {
    if (!state.streamReactionPubkeysByKey.has(reactionKey)) {
      state.streamReactionPubkeysByKey.set(reactionKey, new Set());
    }
    return state.streamReactionPubkeysByKey.get(reactionKey);
  }

  function streamReactionCount(reactionKey) {
    const set = state.streamReactionPubkeysByKey.get(reactionKey);
    return set ? set.size : 0;
  }

  function applyStreamReaction(reactionMeta, pubkey, reactionEventId) {
    if (!reactionMeta || !reactionMeta.key || !pubkey) return;
    const normalizedPubkey = normalizePubkeyHex(pubkey);
    if (!normalizedPubkey) return;

    const key = reactionMeta.key;
    const set = ensureStreamReactionSet(key);
    set.add(normalizedPubkey);

    if (key !== '+' && (reactionMeta.label || reactionMeta.imageUrl)) {
      state.streamReactionMetaByKey.set(key, {
        label: reactionMeta.label || key,
        imageUrl: reactionMeta.imageUrl || '',
        shortcode: reactionMeta.shortcode || ''
      });
    }

    const userKey = streamReactionUserKey(key, normalizedPubkey);
    const prevReactionId = state.streamReactionIdByKeyAndPubkey.get(userKey);
    if (prevReactionId && prevReactionId !== reactionEventId) {
      state.streamReactionEventById.delete(prevReactionId);
    }

    if (reactionEventId) {
      state.streamReactionIdByKeyAndPubkey.set(userKey, reactionEventId);
      state.streamReactionEventById.set(reactionEventId, { reactionKey: key, pubkey: normalizedPubkey });
    }

    const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    const currentAddress = state.selectedStreamAddress;
    if (own && own === normalizedPubkey) {
      if (reactionEventId) state.streamOwnReactionIdByKey.set(key, reactionEventId);
      if (key === '+' && currentAddress) {
        state.likedStreamAddresses.add(currentAddress);
        if (reactionEventId) state.streamLikeEventIdByAddress.set(currentAddress, reactionEventId);
      }
    }
  }

  function removeOwnStreamReactionByKey(reactionKey) {
    const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    if (!own || !reactionKey) return;
    const userKey = streamReactionUserKey(reactionKey, own);
    const reactionId = state.streamReactionIdByKeyAndPubkey.get(userKey);
    if (reactionId) state.streamReactionEventById.delete(reactionId);
    state.streamReactionIdByKeyAndPubkey.delete(userKey);
    state.streamOwnReactionIdByKey.delete(reactionKey);

    const set = state.streamReactionPubkeysByKey.get(reactionKey);
    if (set) {
      set.delete(own);
      if (!set.size) {
        state.streamReactionPubkeysByKey.delete(reactionKey);
        if (reactionKey !== '+') state.streamReactionMetaByKey.delete(reactionKey);
      }
    }

    if (reactionKey === '+') {
      const currentAddress = state.selectedStreamAddress;
      if (currentAddress) {
        state.likedStreamAddresses.delete(currentAddress);
        state.streamLikeEventIdByAddress.delete(currentAddress);
      }
    }
  }

  function removeStreamReactionById(reactionEventId) {
    if (!reactionEventId) return;
    const meta = state.streamReactionEventById.get(reactionEventId);
    if (!meta) return;

    state.streamReactionEventById.delete(reactionEventId);
    const userKey = streamReactionUserKey(meta.reactionKey, meta.pubkey);
    if (state.streamReactionIdByKeyAndPubkey.get(userKey) === reactionEventId) {
      state.streamReactionIdByKeyAndPubkey.delete(userKey);
    }

    const set = state.streamReactionPubkeysByKey.get(meta.reactionKey);
    if (set) {
      set.delete(meta.pubkey);
      if (!set.size) {
        state.streamReactionPubkeysByKey.delete(meta.reactionKey);
        if (meta.reactionKey !== '+') state.streamReactionMetaByKey.delete(meta.reactionKey);
      }
    }

    const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    if (own && own === normalizePubkeyHex(meta.pubkey)) {
      if (state.streamOwnReactionIdByKey.get(meta.reactionKey) === reactionEventId) {
        state.streamOwnReactionIdByKey.delete(meta.reactionKey);
      }
      if (meta.reactionKey === '+') {
        const currentAddress = state.selectedStreamAddress;
        if (currentAddress) {
          state.likedStreamAddresses.delete(currentAddress);
          state.streamLikeEventIdByAddress.delete(currentAddress);
        }
      }
    }
  }

  function renderStreamReactionsUi(stream) {
    const list = qs('#streamEmojiList');
    const likeCounter = qs('#streamLikeCounter');
    const likeBtn = qs('#likeBtn');
    const current = stream || state.streamsByAddress.get(state.selectedStreamAddress);

    if (!current) {
      if (list) list.innerHTML = '';
      if (likeCounter) likeCounter.textContent = '0 likes';
      if (likeBtn) likeBtn.classList.remove('liked');
      return;
    }

    const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
    const likeSet = state.streamReactionPubkeysByKey.get('+') || new Set();
    const isLiked = !!(own && likeSet.has(own));
    const likeTotal = likeSet.size;
    if (likeCounter) likeCounter.textContent = `${likeTotal} like${likeTotal === 1 ? '' : 's'}`;
    if (likeBtn) likeBtn.classList.toggle('liked', isLiked || state.likedStreamAddresses.has(current.address));

    if (own && isLiked) state.likedStreamAddresses.add(current.address);

    if (!list) return;
    list.innerHTML = '';
    const entries = Array.from(state.streamReactionPubkeysByKey.entries())
      .filter(([key, set]) => key !== '+' && set && set.size)
      .map(([key, set]) => ({
        key,
        count: set.size,
        active: !!(own && set.has(own)),
        meta: state.streamReactionMetaByKey.get(key) || { label: key, imageUrl: '', shortcode: '' }
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.key.localeCompare(b.key);
      });

    entries.forEach((entry) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'stream-emoji-chip' + (entry.active ? ' active' : '');
      chip.title = `${entry.meta.label || entry.key} (${entry.count})`;
      chip.addEventListener('click', () => window.toggleStreamEmojiReaction(entry.key));

      const countEl = document.createElement('span');
      countEl.className = 'stream-emoji-count';
      countEl.textContent = `${entry.count}`;
      chip.appendChild(countEl);

      if (entry.meta.imageUrl) {
        const img = document.createElement('img');
        img.src = entry.meta.imageUrl;
        img.alt = entry.meta.label || entry.key;
        img.loading = 'lazy';
        chip.appendChild(img);
      } else {
        const txt = document.createElement('span');
        txt.textContent = String(entry.meta.label || entry.key).slice(0, 18);
        chip.appendChild(txt);
      }
      list.appendChild(chip);
    });
  }

  async function findOwnStreamReactionIdByKey(stream, reactionKey) {
    if (!state.user || !stream || !state.pool) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return '';
    const wantedKey = normalizeReactionContentKey(reactionKey);
    if (!wantedKey || wantedKey === '-') return '';
    const filters = [
      { kinds: [KIND_REACTION], authors: [own], '#e': [stream.id], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 },
      { kinds: [KIND_REACTION], authors: [own], '#a': [stream.address], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 },
      { kinds: [KIND_DELETION], authors: [own], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 }
    ];
    const events = await fetchEventsCached(
      filters,
      {
        scope: 'own-stream-reaction',
        cacheKey: `own-stream-reaction:${own}:${stream.address}:${stream.id}:${wantedKey}`,
        timeoutMs: 2200,
        maxEvents: 420
      }
    );

    const reactions = [];
    const deletedIds = new Set();
    events.forEach((ev) => {
      if (!ev) return;
      if (ev.kind === KIND_REACTION) {
        const reaction = parseReactionMeta(ev.content, ev.tags);
        if (!reaction || reaction.key !== wantedKey) return;
        const aTag = firstTagValue(ev.tags, 'a');
        if (aTag && aTag !== stream.address) return;
        const eTag = firstTagValue(ev.tags, 'e');
        if (eTag && eTag !== stream.id) return;
        reactions.push(ev);
        return;
      }
      if (ev.kind === KIND_DELETION) {
        allTagValues(ev.tags, 'e').forEach((id) => {
          if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
        });
      }
    });
    const active = reactions
      .filter((ev) => !deletedIds.has(ev.id))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    return active.length ? active[0].id : '';
  }

  async function findOwnStreamLikeReactionId(stream) {
    return findOwnStreamReactionIdByKey(stream, '+');
  }

  async function findOwnChatLikeReactionId(messageId, stream) {
    if (!state.user || !state.pool || !messageId || !stream) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return '';
    const filters = [
      { kinds: [KIND_REACTION], authors: [own], '#e': [messageId], limit: 100, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 },
      { kinds: [KIND_DELETION], authors: [own], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 }
    ];
    const events = await fetchEventsCached(
      filters,
      {
        scope: 'own-chat-like',
        cacheKey: `own-chat-like:${own}:${stream.address}:${messageId}`,
        timeoutMs: 2200,
        maxEvents: 320
      }
    );

    const reactions = [];
    const deletedIds = new Set();
    events.forEach((ev) => {
      if (!ev) return;
      if (ev.kind === KIND_REACTION) {
        const content = (ev.content || '').trim();
        if (content !== '+') return;
        const aTag = firstTagValue(ev.tags, 'a');
        if (aTag && aTag !== stream.address) return;
        reactions.push(ev);
        return;
      }
      if (ev.kind === KIND_DELETION) {
        allTagValues(ev.tags, 'e').forEach((id) => {
          if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
        });
      }
    });
    const active = reactions
      .filter((ev) => !deletedIds.has(ev.id))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    return active.length ? active[0].id : '';
  }

  function postReactionPendingKey(noteId, reactionKey) {
    return `${noteId}:${encodeURIComponent(reactionKey || '')}`;
  }

  async function findOwnPostReactionId(noteId, reactionKey) {
    if (!state.user || !state.pool || !noteId) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return '';
    const wantedKey = normalizeReactionContentKey(reactionKey);
    if (!wantedKey || wantedKey === '-') return '';
    const filters = [
      { kinds: [KIND_REACTION], authors: [own], '#e': [noteId], limit: 100, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 },
      { kinds: [KIND_DELETION], authors: [own], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 }
    ];
    const events = await fetchEventsCached(
      filters,
      {
        scope: 'own-post-reaction',
        cacheKey: `own-post-reaction:${own}:${noteId}:${wantedKey}`,
        timeoutMs: 2200,
        maxEvents: 320
      }
    );

    const reactions = [];
    const deletedIds = new Set();
    events.forEach((ev) => {
      if (!ev) return;
      if (ev.kind === KIND_REACTION) {
        const reaction = parseReactionMeta(ev.content, ev.tags);
        if (!reaction || reaction.key !== wantedKey) return;
        const eTag = firstTagValue(ev.tags, 'e');
        if (eTag && eTag !== noteId) return;
        reactions.push(ev);
        return;
      }
      if (ev.kind === KIND_DELETION) {
        allTagValues(ev.tags, 'e').forEach((id) => {
          if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
        });
      }
    });
    const active = reactions
      .filter((ev) => !deletedIds.has(ev.id))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    return active.length ? active[0].id : '';
  }

  function findOwnPostBoostIdFromProfileMap(noteId, profilePubkey) {
    if (!state.user || !noteId || !profilePubkey) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return '';
    const map = state.profileNotesByPubkey.get(profilePubkey);
    if (!map || !map.size) return '';

    const deletedIds = new Set();
    map.forEach((ev) => {
      if (!ev || ev.kind !== KIND_DELETION) return;
      if (normalizePubkeyHex(ev.pubkey) !== own) return;
      allTagValues(ev.tags, 'e').forEach((id) => {
        if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
      });
    });

    let newest = null;
    map.forEach((ev) => {
      if (!ev || ev.kind !== 6 || normalizePubkeyHex(ev.pubkey) !== own) return;
      if (deletedIds.has(ev.id)) return;
      const refs = allTagValues(ev.tags, 'e');
      if (!refs.includes(noteId)) return;
      if (!newest || Number(ev.created_at || 0) >= Number(newest.created_at || 0)) {
        newest = ev;
      }
    });
    return newest && newest.id ? newest.id : '';
  }

  async function findOwnPostBoostId(noteId) {
    if (!state.user || !state.pool || !noteId) return '';
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return '';
    const filters = [
      { kinds: [6], authors: [own], '#e': [noteId], limit: 100, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 },
      { kinds: [KIND_DELETION], authors: [own], limit: 120, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 90 }
    ];
    const events = await fetchEventsCached(
      filters,
      {
        scope: 'own-post-boost',
        cacheKey: `own-post-boost:${own}:${noteId}`,
        timeoutMs: 2200,
        maxEvents: 320
      }
    );

    const reposts = [];
    const deletedIds = new Set();
    events.forEach((ev) => {
      if (!ev) return;
      if (ev.kind === 6) {
        const eTag = firstTagValue(ev.tags, 'e');
        if (eTag && eTag !== noteId) return;
        reposts.push(ev);
        return;
      }
      if (ev.kind === KIND_DELETION) {
        allTagValues(ev.tags, 'e').forEach((id) => {
          if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
        });
      }
    });
    const active = reposts
      .filter((ev) => !deletedIds.has(ev.id))
      .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    return active.length ? active[0].id : '';
  }

  function reactionMetaFromPicker(codeInput, urlInput = '') {
    const code = String(codeInput || '').trim();
    if (!code) return null;
    const url = String(urlInput || '').trim();
    const tagList = [];
    const shortMatch = code.match(/^:([a-z0-9_+\-]{1,64}):$/i);
    if (shortMatch && isLikelyUrl(url)) {
      tagList.push(['emoji', shortMatch[1], url]);
    }
    const meta = parseReactionMeta(code, tagList);
    if (!meta) return null;
    if (shortMatch && isLikelyUrl(url)) {
      meta.shortcode = shortMatch[1];
      meta.imageUrl = url;
    }
    return meta;
  }

  function defaultReactionPickerOptions() {
    const out = [];
    const seen = new Set();
    [
      '\u2764\uFE0F',
      '\uD83D\uDD25',
      '\uD83D\uDC4F',
      '\u26A1',
      '\uD83D\uDE02',
      '\uD83D\uDE2E',
      '\uD83D\uDE80',
      '\uD83E\uDD19'
    ].forEach((val) => {
      const meta = reactionMetaFromPicker(val, '');
      if (!meta || seen.has(meta.key)) return;
      seen.add(meta.key);
      out.push(meta);
    });
    state.streamReactionMetaByKey.forEach((meta, key) => {
      if (!key || key === '+' || seen.has(key)) return;
      seen.add(key);
      out.push({
        key,
        label: meta && meta.label ? meta.label : key,
        imageUrl: meta && meta.imageUrl ? meta.imageUrl : '',
        shortcode: meta && meta.shortcode ? meta.shortcode : ''
      });
    });
    return out.slice(0, 30);
  }

  async function toggleStreamReactionByMeta(reactionMeta) {
    const stream = state.streamsByAddress.get(state.selectedStreamAddress);
    if (!stream || !reactionMeta || !reactionMeta.key) return;
    if (!state.user) { window.openLogin(); return; }
    const own = normalizePubkeyHex(state.user.pubkey);
    if (!own) return;

    const reactionKey = reactionMeta.key;
    if (state.streamReactionPublishPendingByKey.has(reactionKey)) return;
    state.streamReactionPublishPendingByKey.add(reactionKey);

    const userKey = streamReactionUserKey(reactionKey, own);
    const activeSet = state.streamReactionPubkeysByKey.get(reactionKey) || new Set();
    const wasActive = activeSet.has(own);
    let knownReactionId = state.streamReactionIdByKeyAndPubkey.get(userKey) || state.streamOwnReactionIdByKey.get(reactionKey) || '';

    try {
      if (wasActive) {
        if (!knownReactionId) {
          knownReactionId = await findOwnStreamReactionIdByKey(stream, reactionKey);
        }

        removeOwnStreamReactionByKey(reactionKey);
        renderStreamReactionsUi(stream);

        if (knownReactionId) {
          await signAndPublish(KIND_DELETION, 'removed stream reaction', [['e', knownReactionId], ['k', String(KIND_REACTION)], ['a', stream.address]]);
          removeStreamReactionById(knownReactionId);
        } else if (reactionKey === '+') {
          await signAndPublish(KIND_REACTION, '-', [['e', stream.id], ['p', stream.pubkey], ['a', stream.address]]);
        } else {
          throw new Error('Could not find your existing reaction to remove yet. Try again.');
        }
      } else {
        const tags = [['e', stream.id], ['p', stream.pubkey], ['a', stream.address]];
        if (reactionMeta.shortcode && reactionMeta.imageUrl) {
          tags.push(['emoji', reactionMeta.shortcode, reactionMeta.imageUrl]);
        }
        const signed = await signAndPublish(KIND_REACTION, reactionKey, tags);
        applyStreamReaction(reactionMeta, own, signed && signed.id ? signed.id : '');
      }
      renderStreamReactionsUi(stream);
    } catch (err) {
      if (wasActive) {
        applyStreamReaction(reactionMeta, own, knownReactionId || '');
      } else {
        removeOwnStreamReactionByKey(reactionKey);
      }
      renderStreamReactionsUi(stream);
      alert(err && err.message ? err.message : 'Failed to update reaction.');
    } finally {
      state.streamReactionPublishPendingByKey.delete(reactionKey);
    }
  }

  async function togglePostReactionByMeta(noteId, notePubkey, profilePubkey, reactionMeta) {
    if (!noteId || !reactionMeta || !reactionMeta.key) return;
    if (!state.user) { window.openLogin(); return; }
    const pendingKey = postReactionPendingKey(noteId, reactionMeta.key);
    if (state.postReactionPublishPendingByNoteAndKey.has(pendingKey)) return;
    state.postReactionPublishPendingByNoteAndKey.add(pendingKey);

    try {
      const existingReactionId = await findOwnPostReactionId(noteId, reactionMeta.key);
      const map = state.profileNotesByPubkey.get(profilePubkey) || new Map();

      if (existingReactionId) {
        const delTags = [['e', existingReactionId], ['k', String(KIND_REACTION)], ['p', notePubkey]];
        const deletion = await signAndPublish(KIND_DELETION, 'removed post reaction', delTags);
        if (deletion && deletion.id) map.set(deletion.id, deletion);
      } else {
        const tags = [['e', noteId], ['p', notePubkey]];
        if (reactionMeta.shortcode && reactionMeta.imageUrl) {
          tags.push(['emoji', reactionMeta.shortcode, reactionMeta.imageUrl]);
        }
        const signed = await signAndPublish(KIND_REACTION, reactionMeta.key, tags);
        if (signed && signed.id) map.set(signed.id, signed);
      }

      state.profileNotesByPubkey.set(profilePubkey, map);
      renderFeedOrProfileFeed(profilePubkey);
    } catch (err) {
      alert(err && err.message ? err.message : 'Failed to update post reaction.');
    } finally {
      state.postReactionPublishPendingByNoteAndKey.delete(pendingKey);
    }
  }

  function renderChatInlineMedia(container, mediaUrls, opts = {}) {
    if (!container || !Array.isArray(mediaUrls) || !mediaUrls.length) return;
    const allowVideo = !!opts.allowVideo;
    const allowAudio = opts.allowAudio !== false;
    const classPrefix = String(opts.classPrefix || 'chat').trim() || 'chat';
    const maxItems = Math.max(1, Number(opts.maxItems || 4));
    const normalized = mediaUrls
      .map((entry) => {
        if (typeof entry === 'string') {
          const url = sanitizeMediaUrl(entry);
          return { url, kind: classifyMediaUrl(url) || 'photo' };
        }
        const url = sanitizeMediaUrl(entry && entry.url ? entry.url : '');
        const kind = String((entry && entry.kind) || classifyMediaUrl(url) || '').toLowerCase();
        return { url, kind };
      })
      .filter((item) => item.url && (
        item.kind === 'photo'
        || (allowVideo && item.kind === 'video')
        || (allowAudio && item.kind === 'audio')
      ));
    if (!normalized.length) return;

    const wrap = document.createElement('div');
    wrap.className = `${classPrefix}-media-wrap`;
    if (normalized.length === 1) wrap.classList.add('single');

    normalized.slice(0, maxItems).forEach((item) => {
      if (item.kind === 'video') {
        const box = document.createElement('div');
        box.className = `${classPrefix}-media-item${normalized.length === 1 ? ' single' : ''} media-video`;
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = !!opts.videoAutoplay;
        video.loop = !!opts.videoLoop;
        video.muted = !!opts.videoMuted;
        video.defaultMuted = !!opts.videoMuted;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = item.url;
        video.addEventListener('error', () => {
          box.remove();
          if (!wrap.children.length) wrap.remove();
        });
        box.appendChild(video);
        wrap.appendChild(box);
        return;
      }

      if (item.kind === 'audio') {
        const box = document.createElement('div');
        box.className = `${classPrefix}-media-item${normalized.length === 1 ? ' single' : ''} media-audio`;
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'metadata';
        audio.src = item.url;
        audio.style.cssText = 'width:100%;display:block;min-width:0;';
        audio.addEventListener('error', () => {
          box.remove();
          if (!wrap.children.length) wrap.remove();
        });
        box.appendChild(audio);
        wrap.appendChild(box);
        return;
      }

      const a = document.createElement('a');
      a.className = `${classPrefix}-media-item${normalized.length === 1 ? ' single' : ''}`;
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = `${classPrefix === 'dm' ? 'DM' : 'Chat'} image`;
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        a.remove();
        if (!wrap.children.length) wrap.remove();
      });
      a.appendChild(img);
      wrap.appendChild(a);
    });
    if (wrap.children.length) container.appendChild(wrap);
  }

  function insertChatRowChronological(sc, row, rowId, createdAt) {
    if (!sc || !row) return;
    const safeId = String(rowId || '').trim();
    if (!safeId) return;
    const targetTs = Number(createdAt || 0) || 0;
    row.dataset.msgId = safeId;
    row.dataset.createdAt = String(targetTs);

    // Relay delivery order is not guaranteed, so keep chat sorted by created_at.
    let inserted = false;
    for (let i = sc.children.length - 1; i >= 0; i -= 1) {
      const existing = sc.children[i];
      if (!existing || !existing.classList || !existing.classList.contains('cmsg')) continue;
      const existingTs = Number(existing.dataset.createdAt || 0) || 0;
      const existingId = existing.dataset.msgId || '';
      if (existingTs < targetTs || (existingTs === targetTs && existingId <= safeId)) {
        existing.insertAdjacentElement('afterend', row);
        inserted = true;
        break;
      }
    }
    if (!inserted) sc.insertAdjacentElement('afterbegin', row);
  }

  function renderChatMessage(ev) {
    const sc = qs('#chatScroll');
    if (!sc || !ev || !ev.id) return;
    if (state.chatMessageEventsById.has(ev.id)) return;

    const wasNearBottom = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) <= 28;
    state.chatMessageEventsById.set(ev.id, ev);
    const messagePubkey = normalizePubkeyHex(ev.pubkey || '') || String(ev.pubkey || '').trim();
    const p = profileFor(messagePubkey);
    const row = document.createElement('div');
    row.className = 'cmsg';
    row.dataset.pubkey = messagePubkey;
    row.innerHTML = `<div class="c-av"></div><div class="c-body"><div class="c-name-row"><span class="c-name"></span><span class="c-time"></span></div><div class="c-text"></div></div><div class="chat-msg-actions"><button class="cma-btn like-cma chat-like-btn" title="Like">&#10084; <span class="chat-like-count">0</span></button></div>`;
    const avEl = qs('.c-av', row);
    setAvatarEl(avEl, p.picture || '', pickAvatar(messagePubkey));
    const chatNip05 = getVerifiedNip05ForPubkey(messagePubkey, p.nip05 || '');
    avEl.classList.toggle('nip05-square', !!chatNip05);
    if (!chatNip05 && normalizeNip05Value(p.nip05 || '')) ensureNip05Verification(messagePubkey, p.nip05 || '').catch(() => {});
    avEl.onclick = () => showProfileByPubkey(messagePubkey);
    const nameEl = qs('.c-name', row);
    nameEl.textContent = state.profilesByPubkey.has(messagePubkey)
      ? (p.display_name || p.name || shortHex(messagePubkey))
      : shortHex(messagePubkey);
    nameEl.onclick = () => showProfileByPubkey(messagePubkey);
    const timeEl = qs('.c-time', row);
    if (timeEl) {
      timeEl.textContent = formatChatTimestamp(ev.created_at);
      try { timeEl.title = new Date(Number(ev.created_at || 0) * 1000).toLocaleString(); } catch (_) {}
    }
    const ctext = qs('.c-text', row);
    const rawText = String(ev.content || '');
    const allUrls = Array.from(new Set(
      extractHttpUrls(rawText)
        .map((u) => sanitizeMediaUrl(u))
        .filter(Boolean)
    ));
    const mediaItems = allUrls
      .map((url) => ({ url, kind: classifyMediaUrl(url) }))
      .filter((item) => item.kind === 'photo' || item.kind === 'video' || item.kind === 'audio');
    const mediaUrls = mediaItems.map((item) => item.url);
    const spotifyItems = extractSpotifyPreviewItems(allUrls);
    const spotifyUrls = spotifyItems.map((item) => item.sourceUrl);
    const urlsToStrip = Array.from(new Set([...mediaUrls, ...spotifyUrls]));
    const renderText = urlsToStrip.length ? stripMediaUrlsFromText(rawText, urlsToStrip) : rawText;
    if (renderText) ctext.appendChild(renderNostrContent(renderText));
    renderChatInlineMedia(ctext, mediaItems, {
      allowVideo: true,
      classPrefix: 'chat',
      maxItems: 4,
      videoAutoplay: false,
      videoMuted: false,
      videoLoop: false
    });
    renderSpotifyLinkPreviews(ctext, spotifyItems, { classPrefix: 'chat', maxItems: 2 });
    const likeBtn = qs('.chat-like-btn', row);
    if (likeBtn) likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.toggleChatLikeMessage(ev.id);
    });

    insertChatRowChronological(sc, row, ev.id, ev.created_at);

    updateChatLikeUi(ev.id);
    while (sc.children.length > 300) sc.removeChild(sc.firstChild);
    if (wasNearBottom) sc.scrollTop = sc.scrollHeight;
  }

  function renderChatZapReceipt(entry) {
    const sc = qs('#chatScroll');
    if (!sc || !entry || !entry.eventId) return;
    const eventId = String(entry.eventId || '').trim();
    if (!eventId) return;
    if (state.chatMessageEventsById.has(eventId)) return;
    state.chatMessageEventsById.set(eventId, entry);

    const wasNearBottom = (sc.scrollHeight - sc.scrollTop - sc.clientHeight) <= 28;
    const senderPubkey = normalizePubkeyHex(entry.senderPubkey || '');
    const profile = senderPubkey ? profileFor(senderPubkey) : null;
    const fallbackName = senderPubkey ? shortHex(senderPubkey) : 'Anon';
    const displayName = (profile && (profile.display_name || profile.name)) || entry.displayName || fallbackName;
    const picture = (profile && profile.picture) || entry.picture || '';
    const note = String(entry.note || '').trim();

    const row = document.createElement('div');
    row.className = 'cmsg zap-ev';
    row.dataset.pubkey = senderPubkey;
    row.innerHTML = '<div class="c-av"></div><div class="c-body"><div class="c-name-row"><span class="c-name"></span><span class="chat-zap-amount"></span><span class="c-time"></span></div><div class="c-text"></div></div>';

    const avEl = qs('.c-av', row);
    setAvatarEl(avEl, picture, pickAvatar(senderPubkey || displayName));
    const chatNip05 = senderPubkey ? getVerifiedNip05ForPubkey(senderPubkey, profile && profile.nip05 ? profile.nip05 : '') : '';
    avEl.classList.toggle('nip05-square', !!chatNip05);
    if (senderPubkey && !chatNip05 && profile && normalizeNip05Value(profile.nip05 || '')) {
      ensureNip05Verification(senderPubkey, profile.nip05 || '').catch(() => {});
    }
    if (senderPubkey) avEl.onclick = () => showProfileByPubkey(senderPubkey);

    const nameEl = qs('.c-name', row);
    nameEl.textContent = displayName;
    if (senderPubkey) nameEl.onclick = () => showProfileByPubkey(senderPubkey);

    const amountEl = qs('.chat-zap-amount', row);
    amountEl.textContent = `⚡ ${formatCount(Number(entry.sats || 0))} sats`;

    const timeEl = qs('.c-time', row);
    if (timeEl) {
      timeEl.textContent = formatChatTimestamp(entry.created_at);
      try { timeEl.title = new Date(Number(entry.created_at || 0) * 1000).toLocaleString(); } catch (_) {}
    }

    const textEl = qs('.c-text', row);
    textEl.appendChild(renderNostrContent(note || 'Sent a zap'));

    insertChatRowChronological(sc, row, eventId, entry.created_at);

    if (senderPubkey && !state.profilesByPubkey.has(senderPubkey)) {
      fetchProfileIfNeeded(senderPubkey).then(() => {
        const updated = profileFor(senderPubkey);
        const targetRow = sc.querySelector(`.cmsg.zap-ev[data-msg-id="${CSS.escape(eventId)}"]`);
        if (!targetRow || !updated) return;
        const targetAv = qs('.c-av', targetRow);
        if (targetAv) {
          setAvatarEl(targetAv, updated.picture || '', pickAvatar(senderPubkey));
          const verified = !!getVerifiedNip05ForPubkey(senderPubkey, updated.nip05 || '');
          targetAv.classList.toggle('nip05-square', verified);
        }
        const targetName = qs('.c-name', targetRow);
        if (targetName) targetName.textContent = updated.display_name || updated.name || displayName;
      }).catch(() => {});
    }

    while (sc.children.length > 300) sc.removeChild(sc.firstChild);
    if (wasNearBottom) sc.scrollTop = sc.scrollHeight;
  }

  function setLoggedInUi(on) {
    const out = qs('#navLoggedOut');
    const inn = qs('#navLoggedIn');
    if (out) out.classList.toggle('off', on);
    if (inn) inn.classList.toggle('on', on);
  }

  function setUserUi() {
    if (!state.user) {
      setLoggedInUi(false);
      state.notificationsById = new Map();
      state.notificationsLoading = false;
      state.notificationsError = '';
      state.notificationsFetchPending = false;
      state.notificationsFetchPromise = null;
      state.notificationsProfileFetchPending = new Set();
      state.notificationsTargetNotesById = new Map();
      state.notificationsTargetFetchPending = false;
      state.notificationsTargetFetchPromise = null;
      state.notificationsLastLoadedAt = 0;
      renderNotificationsBell();
      if (isNotificationsPageVisible()) renderNotifications();
      renderFollowingCount();
      updateGoLiveButtonState();
      if (window.SifakaCommunities && typeof window.SifakaCommunities.refreshContext === 'function') {
        window.SifakaCommunities.refreshContext();
      }
      if (isMessagesPageVisible()) renderMessagesPage({ subscribe: false, forceLayout: true });
      return;
    }
    setLoggedInUi(true);
    const p = state.user.profile || { name: shortHex(state.user.pubkey), nip05: '' };
    const claimedNip05 = normalizeNip05Value(p.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(state.user.pubkey, claimedNip05);
    if (claimedNip05 && !verifiedNip05) ensureNip05Verification(state.user.pubkey, claimedNip05).catch(() => {});
    const av = pickAvatar(state.user.pubkey);
    const pic = (p.picture || '').trim();
    const navAvatar = qs('#navAvatar');
    const navName = qs('#navDisplayName');
    const pdAv = qs('#pdAvLg');
    const pdName = qs('#pdName');
    const pdSub = qs('#pdSub');
    const navBadge = qs('#navNip05Badge');
    const pdBadge = qs('#pdBadge');

    if (navAvatar) setAvatarEl(navAvatar, pic, av);
    if (pdAv) setAvatarEl(pdAv, pic, av);
    if (navName) navName.textContent = p.name;
    if (pdName) pdName.childNodes[0].textContent = `${p.name} `;
    if (pdSub) {
      const base = verifiedNip05 || (claimedNip05 ? `${claimedNip05} (unverified)` : shortHex(state.user.pubkey));
      const authLabel = state.authMode === 'local'
        ? 'local key'
        : (state.authMode === 'remote' ? 'remote signer' : '');
      pdSub.textContent = authLabel ? `${base} (${authLabel})` : base;
    }
    if (navBadge) navBadge.style.display = verifiedNip05 ? 'inline' : 'none';
    if (pdBadge) pdBadge.style.display = verifiedNip05 ? 'inline' : 'none';

    // Apply NIP-05 square glow to nav/dropdown avatars
    if (navAvatar) navAvatar.classList.toggle('nip05-square', !!verifiedNip05);
    if (pdAv) pdAv.classList.toggle('nip05-square', !!verifiedNip05);

    // Load user's contact list + NIP-51 people lists for the filter dropdown
    subscribeUserLists(state.user.pubkey);
    renderNotificationsBell();
    loadNotifications({
      force: false,
      silent: !isNotificationsPageVisible(),
      minIntervalMs: isNotificationsPageVisible() ? 0 : 90000
    }).catch(() => {});
    renderFollowingCount();
    updateGoLiveButtonState();
    if (window.SifakaCommunities && typeof window.SifakaCommunities.refreshContext === 'function') {
      window.SifakaCommunities.refreshContext();
    }
    if (isMessagesPageVisible()) renderMessagesPage({ subscribe: true });
  }

  function subscribeProfiles(pubkeys) {
    // Always include the logged-in user so their profile isn't lost when other fetches fire
    const allKeys = [...pubkeys];
    const ownPubkey = normalizePubkeyHex(state.user && state.user.pubkey || '') || '';
    if (ownPubkey && !allKeys.includes(ownPubkey)) {
      allKeys.unshift(ownPubkey);
    }
    const unique = [...new Set(
      allKeys
        .map((pubkey) => normalizePubkeyHex(pubkey || '') || String(pubkey || '').trim().toLowerCase())
        .filter(Boolean)
    )];
    if (!unique.length) return;
    if (state.profileSubId) state.pool.unsubscribe(state.profileSubId);
    state.profileSubId = state.pool.subscribe(
      [{ kinds: [KIND_PROFILE], authors: unique, limit: unique.length * 2 }],
      {
        event: (ev) => {
          if (ev.kind !== KIND_PROFILE) return;
          const parsed = parseProfile(ev);
          const profilePubkey = normalizePubkeyHex(parsed.pubkey || ev.pubkey || '') || '';
          if (!profilePubkey) return;
          state.profilesByPubkey.set(profilePubkey, { ...parsed, pubkey: profilePubkey });
          ensureNip05Verification(profilePubkey, parsed.nip05 || '').catch(() => {});
          if (state.user && normalizePubkeyHex(state.user.pubkey) === profilePubkey) {
            state.user.profile = state.profilesByPubkey.get(profilePubkey);
            setUserUi();
          }
          if (isHomeViewActive()) renderLiveGrid();
          if (isVideosPageVisible()) scheduleVideosPageRender();
          const sel = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
          if (sel && isVideoPageVisible()) renderVideo(sel);
          if (normalizePubkeyHex(state.selectedProfilePubkey) === profilePubkey && isProfilePageVisible()) {
            renderProfilePage(profilePubkey);
            syncProfileRoute(profilePubkey, 'replace');
          }
          if (isMessagesPageVisible()) {
            renderDmContactSelect();
            scheduleDmRender({
              conversations: true,
              thread: normalizePubkeyHex(state.dmActivePeerPubkey) === profilePubkey
            });
          }
        }
      }
    );
  }

  // Fetch a single profile on demand (commenters, repost authors, etc.)
  function fetchProfileIfNeeded(pubkey) {
    const normalizedPubkey = normalizePubkeyHex(pubkey || '') || String(pubkey || '').trim().toLowerCase();
    if (!normalizedPubkey) return Promise.resolve();
    const existing = state.profilesByPubkey.get(normalizedPubkey);
    if (existing && (existing.name || existing.display_name || existing.picture)) return Promise.resolve();
    return fetchEventsCached(
      [{ kinds: [KIND_PROFILE], authors: [normalizedPubkey], limit: 2 }],
      {
        scope: 'profile-by-pubkey',
        cacheKey: `profile-by-pubkey:${normalizedPubkey}`,
        timeoutMs: 2200,
        maxEvents: 10
      }
    ).then((events) => {
      const latest = (events || [])
        .filter((ev) => ev && ev.kind === KIND_PROFILE && normalizePubkeyHex(ev.pubkey || '') === normalizedPubkey)
        .sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0))[0];
      if (!latest) return;
      const parsed = parseProfile(latest);
      state.profilesByPubkey.set(normalizedPubkey, { ...parsed, pubkey: normalizedPubkey });
      ensureNip05Verification(normalizedPubkey, parsed.nip05 || '').catch(() => {});
      if (isVideosPageVisible()) scheduleVideosPageRender();
      if (isMessagesPageVisible()) {
        renderDmContactSelect();
        scheduleDmRender({
          conversations: true,
          thread: normalizePubkeyHex(state.dmActivePeerPubkey) === normalizedPubkey
        });
      }
    }).catch(() => {});
  }

  function clearLiveGridRenderTimer() {
    if (!state.liveGridRenderTimer) return;
    clearTimeout(state.liveGridRenderTimer);
    state.liveGridRenderTimer = null;
  }

  function stopLiveSubscription() {
    clearLiveGridRenderTimer();
    if (!state.liveSubId || !state.pool) {
      state.liveSubId = null;
      return;
    }
    try {
      state.pool.unsubscribe(state.liveSubId);
    } catch (_) {}
    state.liveSubId = null;
  }

  function ensureHomeLiveSubscription() {
    if (!state.pool) return;
    if (state.liveSubId) return;
    subscribeLive();
  }

  function subscribeLive() {
    stopLiveSubscription();
    if (!state.pool) return;
    let initialSyncComplete = false;

    const debouncedRenderGrid = () => {
      clearLiveGridRenderTimer();
      state.liveGridRenderTimer = setTimeout(() => {
        state.liveGridRenderTimer = null;
        if (!isHomeViewActive()) return;
        renderLiveGrid();
      }, 300);
    };

    state.liveSubId = state.pool.subscribe(
      [{ kinds: [KIND_LIVE_EVENT, KIND_NIP71_VIDEO, KIND_NIP71_REEL], limit: 350, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 30 }],
      {
        event: (ev) => {
          const kind = Number(ev && ev.kind || 0);
          if (kind === KIND_LIVE_EVENT) {
            const stream = parseLiveEvent(ev);
            upsertStream(stream);
            if (state.pendingRouteAddress && stream.address === state.pendingRouteAddress) {
              tryOpenPendingRouteStream();
            }
            if (isVideosPageVisible()) scheduleVideosPageRender();
            // Avoid rapid card remount/flicker while the initial relay sync is still streaming in.
            if (isHomeViewActive() && initialSyncComplete) debouncedRenderGrid();
            return;
          }

          if (kind === KIND_NIP71_VIDEO || kind === KIND_NIP71_REEL) {
            const video = parseNip71VideoEvent(ev);
            if (!video) return;
            const changed = upsertNip71Video(video);
            if (video.hostPubkey) fetchProfileIfNeeded(video.hostPubkey).catch(() => {});
            if (changed && isVideosPageVisible()) scheduleVideosPageRender();
          }
        },
        eose: () => {
          if (initialSyncComplete) return;
          initialSyncComplete = true;
          if (isHomeViewActive()) renderLiveGrid();
          if (isVideosPageVisible()) scheduleVideosPageRender();
          persistLiveStreamsCache();
          tryOpenPendingRouteStream();
          if (isHomeViewActive() && shouldRunHeroCycle() && !state.featuredCycleTimer) startHeroCycle();
          const allKnownVideoEntries = [...Array.from(state.streamsByAddress.values()), ...sortedNip71Videos()];
          const pubSet = collectProfilePubkeysFromStreams(allKnownVideoEntries);
          subscribeProfiles(Array.from(pubSet));
          ensureProfilesForStreams(allKnownVideoEntries);
          if (isHomeViewActive() && state.selectedProfilePubkey) renderProfilePage(state.selectedProfilePubkey);
        }
      }
    );
  }

  function subscribeChat(stream) {
    if (!stream) return;
    if (state.chatSubId) state.pool.unsubscribe(state.chatSubId);
    if (state.chatReactionSubId) { try { state.pool.unsubscribe(state.chatReactionSubId); } catch (_) {} state.chatReactionSubId = null; }
    if (state._chatProfileFetchTimer) { clearTimeout(state._chatProfileFetchTimer); state._chatProfileFetchTimer = null; }
    if (state._chatProfileEoseTimer) { clearTimeout(state._chatProfileEoseTimer); state._chatProfileEoseTimer = null; }
    if (state._chatProfileSubId) { try { state.pool.unsubscribe(state._chatProfileSubId); } catch (_) {} state._chatProfileSubId = null; }
    const sc = qs('#chatScroll');
    if (sc) sc.innerHTML = '';
    state.chatLikePubkeysByMessageId = new Map();
    state.chatReactionIdByMessageAndPubkey = new Map();
    state.chatReactionEventById = new Map();
    state.chatOwnLikeEventByMessageId = new Map();
    state.chatMessageEventsById = new Map();
    state.chatLikePublishPendingByMessageId = new Set();
    state.streamReactionPubkeysByKey = new Map();
    state.streamReactionMetaByKey = new Map();
    state.streamReactionIdByKeyAndPubkey = new Map();
    state.streamReactionEventById = new Map();
    state.streamOwnReactionIdByKey = new Map();
    state.streamReactionPublishPendingByKey = new Set();
    state.streamZapTotals.set(stream.address, 0);
    state.streamRecentZapsByAddress.set(stream.address, []);
    state.streamZapEventIdsByAddress.set(stream.address, new Set());
    renderStreamReactionsUi(stream);
    updateTheaterSatsDisplay(stream);
    renderStreamZapList(stream);

    const seenIds = new Set();
    const unknownPubkeys = new Set(); // pubkeys seen in chat but not yet in profile cache

    function scheduleMissingChatProfiles(delayMs = 220) {
      if (state._chatProfileFetchTimer) clearTimeout(state._chatProfileFetchTimer);
      state._chatProfileFetchTimer = setTimeout(() => {
        state._chatProfileFetchTimer = null;
        fetchMissingChatProfiles();
      }, Math.max(0, Number(delayMs || 0)));
    }

    // Called after EOSE and also for each new real-time message
    function fetchMissingChatProfiles() {
      if (!unknownPubkeys.size) return;
      const toFetch = Array.from(new Set(
        Array.from(unknownPubkeys)
          .map((pk) => normalizePubkeyHex(pk))
          .filter((pk) => pk && !state.profilesByPubkey.has(pk))
      ));
      unknownPubkeys.clear();
      if (!toFetch.length) return;

      if (state._chatProfileEoseTimer) { clearTimeout(state._chatProfileEoseTimer); state._chatProfileEoseTimer = null; }
      if (state._chatProfileSubId) { try { state.pool.unsubscribe(state._chatProfileSubId); } catch (_) {} }
      state._chatProfileSubId = state.pool.subscribe(
        [{ kinds: [KIND_PROFILE], authors: toFetch, limit: toFetch.length * 2 }],
        {
          event: (profileEv) => {
            if (profileEv.kind !== KIND_PROFILE) return;
            const normalizedProfilePubkey = normalizePubkeyHex(profileEv.pubkey || '');
            if (!normalizedProfilePubkey) return;
            const p = parseProfile(profileEv);
            state.profilesByPubkey.set(normalizedProfilePubkey, { ...p, pubkey: normalizedProfilePubkey });
            ensureNip05Verification(normalizedProfilePubkey, p.nip05 || '').catch(() => {});
            // Update all chat rows for this pubkey
            const chatEl = qs('#chatScroll');
            if (!chatEl) return;
            chatEl.querySelectorAll(`.cmsg[data-pubkey="${CSS.escape(normalizedProfilePubkey)}"]`).forEach((row) => {
              const avEl = row.querySelector('.c-av');
              const nameEl = row.querySelector('.c-name');
              if (avEl) {
                setAvatarEl(avEl, p.picture || '', pickAvatar(normalizedProfilePubkey));
                const verified = !!getVerifiedNip05ForPubkey(normalizedProfilePubkey, p.nip05 || '');
                avEl.classList.toggle('nip05-square', verified);
              }
              if (nameEl) nameEl.textContent = p.display_name || p.name || shortHex(normalizedProfilePubkey);
            });
          },
          eose: () => {
            if (state._chatProfileEoseTimer) clearTimeout(state._chatProfileEoseTimer);
            // Some relays send EOSE before others; wait briefly to gather all profile events.
            state._chatProfileEoseTimer = setTimeout(() => {
              state._chatProfileEoseTimer = null;
              if (!state._chatProfileSubId) return;
              try { state.pool.unsubscribe(state._chatProfileSubId); } catch (_) {}
              state._chatProfileSubId = null;
            }, 1100);
          }
        }
      );
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const streamStart = Number(stream.starts || stream.created_at || 0) || 0;
    const status = normalizeStreamStatus(stream && stream.status);
    const isArchive = status === 'ended' || isDirectFileVideoUrl(stream && stream.streaming);
    const chatSince = streamStart
      ? Math.max(0, streamStart - 60 * 60 * 2)
      : (nowSec - 60 * 60 * 24);
    const chatHistoryLimit = isArchive ? 260 : 1200;

    const filters = [{
      kinds: [KIND_LIVE_CHAT],
      '#a': [stream.address],
      limit: chatHistoryLimit,
      since: chatSince
    }];
    if (stream.id) {
      filters.push({
        kinds: [KIND_LIVE_CHAT],
        '#e': [stream.id],
        limit: chatHistoryLimit,
        since: chatSince
      });
    }

    state.chatSubId = state.pool.subscribe(filters, {
      event: (ev) => {
        if (!ev || !ev.id) return;
        if (seenIds.has(ev.id)) return;
        seenIds.add(ev.id);
        renderChatMessage(ev);
        // Queue profile fetch for unknown sender
        const senderPubkey = normalizePubkeyHex(ev.pubkey || '');
        if (senderPubkey && !state.profilesByPubkey.has(senderPubkey)) {
          unknownPubkeys.add(senderPubkey);
          scheduleMissingChatProfiles();
        }
      },
      eose: () => {
        // Batch-fetch all profiles we saw during history replay
        scheduleMissingChatProfiles(0);
      }
    });

    const reactionSince = streamStart
      ? Math.max(0, streamStart - 60 * 60 * 12)
      : (nowSec - 60 * 60 * 24 * 7);
    const reactionHistoryLimit = isArchive ? 320 : 1200;
    const reactionFilters = [
      { kinds: [KIND_REACTION, KIND_DELETION], '#a': [stream.address], limit: reactionHistoryLimit, since: reactionSince },
      { kinds: [KIND_ZAP_RECEIPT], '#a': [stream.address], limit: reactionHistoryLimit, since: reactionSince }
    ];
    if (stream.id) {
      reactionFilters.push({ kinds: [KIND_ZAP_RECEIPT], '#e': [stream.id], limit: reactionHistoryLimit, since: reactionSince });
    }
    const pTargets = [...new Set([stream.pubkey, stream.hostPubkey].map((pk) => normalizePubkeyHex(pk)).filter(Boolean))];
    if (pTargets.length) {
      reactionFilters.push({ kinds: [KIND_ZAP_RECEIPT], '#p': pTargets, limit: reactionHistoryLimit, since: reactionSince });
    }

    state.chatReactionSubId = state.pool.subscribe(
      reactionFilters,
      {
        event: (ev) => {
          if (!ev || !ev.id) return;

          if (ev.kind === KIND_REACTION) {
            const targetId = firstTagValue(ev.tags, 'e');
            if (!/^[0-9a-f]{64}$/i.test(targetId || '')) return;
            if (targetId === stream.id) {
              const reactionMeta = parseReactionMeta(ev.content, ev.tags);
              if (!reactionMeta) return;
              applyStreamReaction(reactionMeta, normalizePubkeyHex(ev.pubkey), ev.id);
              renderStreamReactionsUi(stream);
              return;
            }
            const kTag = firstTagValue(ev.tags, 'k');
            if (kTag && kTag !== String(KIND_LIVE_CHAT)) return;
            const reactionContent = (ev.content || '').trim();
            if (!reactionContent || reactionContent === '-') return;
            applyChatLikeReaction(targetId, normalizePubkeyHex(ev.pubkey), ev.id);
            updateChatLikeUi(targetId);
            return;
          }

          if (ev.kind === KIND_ZAP_RECEIPT) {
            addStreamZapReceipt(ev, stream);
            return;
          }

          if (ev.kind === KIND_DELETION) {
            const deletedIds = allTagValues(ev.tags, 'e').filter((id) => /^[0-9a-f]{64}$/i.test(id));
            deletedIds.forEach((rid) => {
              const streamReactionMeta = state.streamReactionEventById.get(rid);
              if (streamReactionMeta) {
                removeStreamReactionById(rid);
                renderStreamReactionsUi(stream);
              }
              const meta = state.chatReactionEventById.get(rid);
              applyChatUnlikeByReactionId(rid);
              if (meta && meta.messageId) updateChatLikeUi(meta.messageId);
            });
          }
        }
      }
    );
  }

  function openStream(address, opts = {}) {
    const routeMode = opts.routeMode || 'push';
    const stream = state.streamsByAddress.get(address);
    if (!stream) return;
    state.pendingRouteAddress = '';
    state.pendingRouteNaddr = '';
    state.selectedStreamAddress = address;
    const statsTargetPubkey = normalizePubkeyHex(stream.hostPubkey || '') || normalizePubkeyHex(stream.pubkey || '');
    if (statsTargetPubkey) subscribeProfileStats(statsTargetPubkey);
    if (routeMode !== 'skip') syncTheaterRoute(stream, routeMode);
    window.showVideoPage();
    renderVideo(stream);
    setTimeout(() => {
      if (state.selectedStreamAddress !== address) return;
      subscribeChat(stream);
    }, 0);
  }

  function clearProfilePlayback() {
    state.profilePlaybackToken += 1;
    state.profilePlaybackAddress = '';
    state.profilePlaybackUrl = '';
    if (state.profileHlsInstance) {
      try {
        state.profileHlsInstance.destroy();
      } catch (_) {
        // no-op
      }
      state.profileHlsInstance = null;
    }
    const host = qs('#profileLivePlayer');
    if (host) {
      host.querySelectorAll('video').forEach((video) => {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) {}
      });
      host.innerHTML = '';
    }
  }

  function renderProfilePlaybackFallback(message, url) {
    const host = qs('#profileLivePlayer');
    if (!host) return;
    host.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4rem;width:100%;height:100%;padding:.9rem;text-align:center;';

    const msg = document.createElement('div');
    msg.style.cssText = 'font-size:.78rem;color:var(--text2);line-height:1.5;';
    msg.textContent = message;
    wrap.appendChild(msg);

    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open stream URL';
      link.style.cssText = 'font-family:"DM Mono",monospace;color:var(--zap);font-size:.7rem;text-decoration:none;';
      wrap.appendChild(link);
    }

    host.appendChild(wrap);
  }

  async function renderProfileLivePlayback(stream) {
    const host = qs('#profileLivePlayer');
    if (!host || !stream) return;
    if (!isProfilePageVisible()) {
      clearProfilePlayback();
      return;
    }
    const address = String(stream.address || '').trim();
    const url = sanitizeMediaUrl((stream.streaming || '').trim());
    const existingVideo = host.querySelector('video');
    const sameSource = !!(address && url && state.profilePlaybackAddress === address && state.profilePlaybackUrl === url);
    if (sameSource && (existingVideo || state.profileHlsInstance)) return;

    clearProfilePlayback();

    if (!url || !/^https?:\/\//i.test(url)) {
      renderProfilePlaybackFallback('Live stream metadata is available, but no browser-playable URL was found.', url);
      return;
    }

    state.profilePlaybackAddress = address;
    state.profilePlaybackUrl = url;
    const token = state.profilePlaybackToken;
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = true;
    video.muted = false;
    video.defaultMuted = false;
    video.playsInline = true;
    video.preload = 'metadata';
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;background:#000;';
    host.appendChild(video);

    const isStale = () => token !== state.profilePlaybackToken;
    let hlsAttached = false;
    let fallbackShown = false;
    const shouldPreferHls = isLikelyHlsStreamUrl(url);
    const looksLikeDirectFileVideo = /\.(mp4|webm|mov|m4v|mkv)($|[?#])/i.test(url);

    const showFailure = (message) => {
      if (fallbackShown || isStale()) return;
      fallbackShown = true;
      clearProfilePlayback();
      renderProfilePlaybackFallback(message, url);
    };

    const attachHls = async () => {
      if (hlsAttached || isStale()) return false;
      try {
        const hls = await attachHlsPlaybackWithRecovery(video, url, {
          isStale,
          onAttach: (instance) => { state.profileHlsInstance = instance; },
          onFatal: () => {
            showFailure('Live playback failed after retries. The stream may be offline or blocked by CORS.');
          },
          hlsConfig: {
            backBufferLength: 8,
            maxBufferLength: 14,
            xhrSetup: (xhr) => { xhr.withCredentials = false; }
          },
          maxNetworkRecoveries: 5,
          maxMediaRecoveries: 2
        });
        if (!hls) return false;
        hlsAttached = true;
        return true;
      } catch (_) {
        return false;
      }
    };

    video.addEventListener('error', () => {
      if (isStale()) return;
      (async () => {
        if (!hlsAttached && !video.canPlayType('application/vnd.apple.mpegurl') && (shouldPreferHls || !looksLikeDirectFileVideo)) {
          const attached = await attachHls();
          if (attached) return;
        }
        showFailure('Profile live playback failed in this browser.');
      })().catch(() => {
        showFailure('Profile live playback failed in this browser.');
      });
    });

    let sourceAssigned = false;
    if (shouldPreferHls) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        sourceAssigned = true;
      } else {
        const attached = await attachHls();
        if (attached) return;
      }
    }

    if (!hlsAttached && !sourceAssigned) {
      video.src = url;
      sourceAssigned = true;
    }
    if (sourceAssigned && !hlsAttached) {
      await tryPlayVideoWithMutedFallback(video);
    }
  }

  function getLatestLiveByPubkey(pubkey) {
    const target = normalizePubkeyHex(pubkey);
    if (!target) return null;
    return Array.from(state.streamsByAddress.values())
      .filter((s) => {
        if (s.status !== 'live') return false;
        const eventPubkey = normalizePubkeyHex(s.pubkey);
        const hostPubkey = normalizePubkeyHex(s.hostPubkey);
        return eventPubkey === target || hostPubkey === target;
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0] || null;
  }


  function getTagValues(ev, key) {
    const values = [];
    (ev && Array.isArray(ev.tags) ? ev.tags : []).forEach((tag) => {
      if (Array.isArray(tag) && tag[0] === key && tag[1]) values.push(tag[1]);
    });
    return values;
  }

  function isTopLevelProfilePost(ev, pubkey) {
    if (!ev || ev.kind !== 1 || ev.pubkey !== pubkey) return false;
    return getTagValues(ev, 'e').length === 0;
  }

  function pickReferencedPostId(ev, postIdSet) {
    const refs = getTagValues(ev, 'e');
    for (let i = refs.length - 1; i >= 0; i -= 1) {
      if (postIdSet.has(refs[i])) return refs[i];
    }
    return '';
  }

  function classifyReactionContent(content) {
    const val = String(content || '').trim().toLowerCase();
    if (!val || val === '+' || val === 'like' || val === '?' || val === '??' || val === '??') return 'like';
    return 'emoji';
  }

  function buildProfilePostAggregates(pubkey, posts) {
    const map = state.profileNotesByPubkey.get(pubkey) || new Map();
    const trackedPostIds = new Set();
    const targetIdByDisplayPostId = new Map();
    const targetPubkeyByDisplayPostId = new Map();
    const statsByPost = new Map();
    const commentsByPost = new Map();
    const likePubkeysByPost = new Map();
    const boostPubkeysByPost = new Map();
    const emojiByPost = new Map();
    const commentLikePubkeysById = new Map();
    const commentBoostPubkeysById = new Map();
    const commentZapCountById = new Map();

    const resolveRepostTarget = (post) => {
      let targetId = post.id;
      let targetPubkey = post.pubkey;

      const parsed = parseJsonSafe(post.content || '');
      if (parsed && /^[0-9a-f]{64}$/i.test(parsed.id || '')) targetId = parsed.id;
      const refs = getTagValues(post, 'e');
      if (/^[0-9a-f]{64}$/i.test(refs[refs.length - 1] || '')) targetId = refs[refs.length - 1];

      if (parsed && /^[0-9a-f]{64}$/i.test(parsed.pubkey || '')) targetPubkey = parsed.pubkey;
      const pRefs = getTagValues(post, 'p');
      if (/^[0-9a-f]{64}$/i.test(pRefs[pRefs.length - 1] || '')) targetPubkey = pRefs[pRefs.length - 1];

      return { targetId, targetPubkey };
    };

    posts.forEach((post) => {
      trackedPostIds.add(post.id);
      if (post.kind === 6) {
        const target = resolveRepostTarget(post);
        if (target && /^[0-9a-f]{64}$/i.test(target.targetId || '')) {
          trackedPostIds.add(target.targetId);
          targetIdByDisplayPostId.set(post.id, target.targetId);
          targetPubkeyByDisplayPostId.set(post.id, target.targetPubkey || post.pubkey);
        } else {
          targetIdByDisplayPostId.set(post.id, post.id);
          targetPubkeyByDisplayPostId.set(post.id, post.pubkey);
        }
      } else {
        targetIdByDisplayPostId.set(post.id, post.id);
        targetPubkeyByDisplayPostId.set(post.id, post.pubkey);
      }
    });

    trackedPostIds.forEach((postId) => {
      statsByPost.set(postId, { likes: 0, emoji: 0, boosts: 0, zaps: 0 });
      commentsByPost.set(postId, []);
      likePubkeysByPost.set(postId, new Set());
      boostPubkeysByPost.set(postId, new Set());
      emojiByPost.set(postId, new Map());
    });

    const deletedIds = new Set();
    map.forEach((ev) => {
      if (!ev || ev.kind !== KIND_DELETION) return;
      allTagValues(ev.tags, 'e').forEach((id) => {
        if (/^[0-9a-f]{64}$/i.test(id)) deletedIds.add(id);
      });
    });

    map.forEach((ev) => {
      if (!ev || !ev.id) return;
      if (deletedIds.has(ev.id)) return;
      const ref = pickReferencedPostId(ev, trackedPostIds);
      if (!ref) return;

      const stats = statsByPost.get(ref);
      if (!stats) return;

      if (ev.kind === 6) {
        stats.boosts += 1;
        boostPubkeysByPost.get(ref).add(ev.pubkey);
        return;
      }

      if (ev.kind === KIND_REACTION) {
        const reaction = parseReactionMeta(ev.content, ev.tags);
        if (!reaction) return;
        if (reaction.key === '+') {
          likePubkeysByPost.get(ref).add(ev.pubkey);
        } else {
          const perPost = emojiByPost.get(ref);
          if (!perPost.has(reaction.key)) {
            perPost.set(reaction.key, {
              key: reaction.key,
              label: reaction.label || reaction.key,
              imageUrl: reaction.imageUrl || '',
              shortcode: reaction.shortcode || '',
              pubkeys: new Set()
            });
          }
          const row = perPost.get(reaction.key);
          row.pubkeys.add(ev.pubkey);
          if (!row.imageUrl && reaction.imageUrl) row.imageUrl = reaction.imageUrl;
        }
        return;
      }

      if (ev.kind === KIND_ZAP_RECEIPT) {
        stats.zaps += 1;
        return;
      }

      if (ev.kind === 1 && !isTopLevelProfilePost(ev, pubkey)) {
        const list = commentsByPost.get(ref);
        if (list) list.push(ev);
      }
    });

    commentsByPost.forEach((list) => {
      list.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    });

    const commentIds = new Set();
    commentsByPost.forEach((list) => {
      list.forEach((comment) => {
        if (!comment || !comment.id) return;
        commentIds.add(comment.id);
        if (!commentLikePubkeysById.has(comment.id)) commentLikePubkeysById.set(comment.id, new Set());
        if (!commentBoostPubkeysById.has(comment.id)) commentBoostPubkeysById.set(comment.id, new Set());
        if (!commentZapCountById.has(comment.id)) commentZapCountById.set(comment.id, 0);
      });
    });

    if (commentIds.size) {
      map.forEach((ev) => {
        if (!ev || !ev.id) return;
        if (deletedIds.has(ev.id)) return;
        const commentRef = pickReferencedPostId(ev, commentIds);
        if (!commentRef) return;

        if (ev.kind === KIND_REACTION) {
          const reaction = parseReactionMeta(ev.content, ev.tags);
          if (!reaction || reaction.key !== '+') return;
          if (!commentLikePubkeysById.has(commentRef)) commentLikePubkeysById.set(commentRef, new Set());
          commentLikePubkeysById.get(commentRef).add(ev.pubkey);
          return;
        }

        if (ev.kind === 6) {
          if (!commentBoostPubkeysById.has(commentRef)) commentBoostPubkeysById.set(commentRef, new Set());
          commentBoostPubkeysById.get(commentRef).add(ev.pubkey);
          return;
        }

        if (ev.kind === KIND_ZAP_RECEIPT) {
          commentZapCountById.set(commentRef, Number(commentZapCountById.get(commentRef) || 0) + 1);
        }
      });
    }

    trackedPostIds.forEach((postId) => {
      const stats = statsByPost.get(postId);
      if (!stats) return;
      const likeSet = likePubkeysByPost.get(postId) || new Set();
      stats.likes = likeSet.size;
      const emojiMap = emojiByPost.get(postId) || new Map();
      let emojiTotal = 0;
      emojiMap.forEach((entry) => { emojiTotal += entry.pubkeys.size; });
      stats.emoji = emojiTotal;
    });

    return {
      statsByPost,
      commentsByPost,
      likePubkeysByPost,
      boostPubkeysByPost,
      emojiByPost,
      commentLikePubkeysById,
      commentBoostPubkeysById,
      commentZapCountById,
      targetIdByDisplayPostId,
      targetPubkeyByDisplayPostId
    };
  }

  function stripMediaUrlsFromText(text, mediaUrls) {
    let out = String(text || '');
    mediaUrls.forEach((url) => {
      out = out.split(url).join(' ');
    });
    return out
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  function renderPostMedia(container, mediaItems) {
    if (!container || !mediaItems.length) return;
    container.classList.add('profile-feed-media');

    const photos = mediaItems.filter((m) => m.kind === 'photo');
    const videos = mediaItems.filter((m) => m.kind === 'video');
    const audios = mediaItems.filter((m) => m.kind === 'audio');

    // Single photo: span full width; multiple: 3-col square grid (CSS handles it)
    if (photos.length === 1 && videos.length === 0 && audios.length === 0) container.classList.add('one');

    // Photos ? square aspect-ratio 1:1 via CSS .profile-feed-photo
    photos.slice(0, 6).forEach((m) => {
      const link = document.createElement('a');
      link.className = 'profile-feed-photo';
      link.href = m.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = m.url;
      img.alt = 'Post image';
      img.loading = 'lazy';
      img.addEventListener('error', () => {
        link.classList.add('broken');
        link.innerHTML = '<span>Open image</span>';
      });
      link.appendChild(img);
      container.appendChild(link);
    });

    audios.slice(0, 2).forEach((m) => {
      const frame = document.createElement('div');
      frame.className = 'profile-feed-audio';
      frame.style.cssText = 'grid-column:1/-1;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:.55rem .65rem;';
      const audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = m.url;
      audio.style.cssText = 'width:100%;display:block;';
      audio.addEventListener('error', () => {
        const fallback = document.createElement('a');
        fallback.href = m.url;
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:52px;color:var(--zap);font-size:.74rem;font-weight:600;text-decoration:none;padding:.35rem;';
        fallback.textContent = 'Open Audio';
        if (audio.parentNode) audio.parentNode.replaceChild(fallback, audio);
      });
      frame.appendChild(audio);
      container.appendChild(frame);
    });

    // Videos ? 16:9 YouTube-style, spans full grid row via CSS grid-column:1/-1
    videos.slice(0, 2).forEach((m) => {
      const frame = document.createElement('div');
      frame.className = 'profile-feed-video';
      const isHls = /\.m3u8($|\?)/i.test(m.url);
      if (isHls) {
        const v = document.createElement('video');
        v.controls = true; v.playsInline = true; v.preload = 'metadata';
        v.style.cssText = 'width:100%;height:100%;max-height:320px;object-fit:contain;display:block;background:#000;';
        frame.appendChild(v);
        (async () => {
          if (v.canPlayType('application/vnd.apple.mpegurl')) {
            v.src = m.url;
          } else {
            try {
              const Hls = await ensureHlsJs();
              if (Hls.isSupported()) {
                const hls = new Hls({ enableWorker: true });
                hls.loadSource(m.url); hls.attachMedia(v);
                hls.on(Hls.Events.ERROR, (_e, data) => {
                  if (data && data.fatal) {
                    hls.destroy();
                    const a = document.createElement('a');
                    a.href = m.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
                    a.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:80px;color:var(--zap);font-size:.74rem;font-weight:600;text-decoration:none;padding:.75rem;';
          a.textContent = '\u25B6 Open HLS stream';
                    if (v.parentNode) v.parentNode.replaceChild(a, v);
                  }
                });
              }
            } catch (_) {}
          }
        })();
      } else {
        const v = document.createElement('video');
        v.controls = true; v.playsInline = true; v.preload = 'metadata';
        v.style.cssText = 'width:100%;height:100%;max-height:320px;object-fit:contain;display:block;background:#000;';
        v.src = m.url;
        v.addEventListener('error', () => {
          const fallback = document.createElement('a');
          fallback.href = m.url; fallback.target = '_blank'; fallback.rel = 'noopener noreferrer';
          fallback.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;min-height:80px;color:var(--zap);font-size:.74rem;font-weight:600;text-decoration:none;padding:.75rem;';
            fallback.textContent = '\u25B6 Open Video';
          if (v.parentNode) v.parentNode.replaceChild(fallback, v);
        });
        frame.appendChild(v);
      }
      container.appendChild(frame);
    });
  }
  function renderProfileFeedInto(listEl, notes, profile, pubkey, aggregates) {
    if (!listEl) return;

    // Infinite scroll: honour per-element limit stored in data attribute
    const limit = parseInt(listEl.dataset.feedLimit || '6', 10);

    if (!notes.length) {
      listEl.innerHTML = '<div class="profile-feed-empty">No notes found yet for this profile.</div>';
      return;
    }

    listEl.innerHTML = '';
    notes.slice(0, limit).forEach((note) => {
      const isRepost = note.kind === 6;
      const item = document.createElement('div');
      item.className = 'profile-feed-item feed-fade-item';
      const listIdToken = String(listEl.id || 'profile-feed-list')
        .trim()
        .replace(/[^a-z0-9_-]/gi, '-')
        .toLowerCase();
      const commentInputId = `comment-${listIdToken}-${String(note.id || 'post').toLowerCase()}`;

      // For reposts, try to parse the original note from content (NIP-18)
      let originalNote = null;
      let originalPubkey = null;
      let repostRefId = '';
      if (isRepost) {
        try {
          if (note.content && note.content.trim().startsWith('{')) {
            originalNote = JSON.parse(note.content);
            originalPubkey = originalNote.pubkey;
          }
        } catch (_) {}
        const eTags = getTagValues(note, 'e');
        repostRefId = eTags.length ? eTags[eTags.length - 1] : '';
        if (!originalPubkey) {
          const pTag = (note.tags || []).find(t => t[0] === 'p');
          if (pTag) originalPubkey = pTag[1];
        }
        if (!originalNote && /^[0-9a-f]{64}$/i.test(repostRefId || '')) {
          const sourceMap = state.profileNotesByPubkey.get(pubkey) || new Map();
          const maybeOriginal = sourceMap.get(repostRefId);
          if (maybeOriginal && maybeOriginal.kind === 1) {
            originalNote = maybeOriginal;
            if (!originalPubkey) originalPubkey = maybeOriginal.pubkey;
          } else if (isNostrFeedVirtualProfile(pubkey)) {
            requestNostrFeedRepostTarget(repostRefId);
          }
        }
      }

      const originalProfile = (isRepost && originalPubkey) ? profileFor(originalPubkey) : null;
      const boostBanner = isRepost
        ? `<div class="pf-boost-banner"><div class="pf-boost-av"></div><span class="pf-boost-label"><span class="pf-boost-name"></span> boosted this post</span></div>`
        : '';

      item.innerHTML = `${boostBanner}
        <div class="profile-feed-head">
          <div class="profile-feed-author">
            <div class="profile-feed-av"></div>
            <div class="profile-feed-meta"><div class="profile-feed-name-row"><div class="profile-feed-name"></div><span class="nip05-badge profile-feed-nip05" style="display:none">&#10003;</span></div><div class="profile-feed-status"></div></div>
          </div>
          <div class="profile-feed-time"></div>
        </div>
        <div class="profile-feed-text"></div>
        <div class="profile-feed-media-wrap"></div>
        <div class="profile-feed-stats">
          <span class="pfs pfs-comments"><strong>0</strong> Comments</span>
          <button class="pfs pfs-btn profile-post-like-btn" type="button"><strong>0</strong> Likes</button>
          <button class="pfs pfs-btn pfs-zaps profile-post-zap-btn" type="button"><strong>0</strong> Zaps</button>
          <button class="pfs pfs-btn profile-post-boost-btn" type="button"><strong>0</strong> Boosts</button>
          <button class="pfs pfs-btn pfs-plus profile-post-emoji-btn" type="button" title="React with custom emoji">+</button>
        </div>
        <div class="profile-feed-emoji-bar"></div>
        <div class="profile-feed-comments"></div>
        <div class="profile-comment-form">
          <textarea class="profile-comment-input" id="${commentInputId}" rows="1" maxlength="4096" placeholder="Write a comment..."></textarea>
          <div class="profile-comment-tools">
            <div class="profile-comment-row">
              <button type="button" class="profile-comment-btn">Comment</button>
              <button type="button" class="profile-comment-attach-btn">Attach</button>
            </div>
            <div class="nostr-markup-toolbar nostr-markup-toolbar-chat profile-comment-markup">
              <button type="button" data-action="h1">H1</button>
              <button type="button" data-action="h2">H2</button>
              <button type="button" data-action="h3">H3</button>
              <button type="button" data-action="bold">B</button>
              <button type="button" data-action="italic">I</button>
              <button type="button" data-action="strike">S</button>
              <button type="button" data-action="ul">UL</button>
              <button type="button" data-action="ol">OL</button>
              <button type="button" data-action="quote">"</button>
              <button type="button" data-action="code">&lt;/&gt;</button>
            </div>
          </div>
        </div>`;

      // For reposts show original author; for regular posts show profile author
      const displayNote = (isRepost && originalNote) ? originalNote : note;
      const displayPubkey = (isRepost && originalPubkey) ? originalPubkey : note.pubkey;
      const displayProfile = (isRepost && originalProfile) ? originalProfile : profileFor(displayPubkey);
      const boostPubkey = normalizePubkeyHex(note.pubkey) || note.pubkey;
      const targetPostId =
        (aggregates && aggregates.targetIdByDisplayPostId && aggregates.targetIdByDisplayPostId.get(note.id)) ||
        displayNote.id ||
        note.id;
      const targetPostPubkey =
        (aggregates && aggregates.targetPubkeyByDisplayPostId && aggregates.targetPubkeyByDisplayPostId.get(note.id)) ||
        displayPubkey ||
        note.pubkey;
      const avEl = qs('.profile-feed-av', item);
      const nameEl = qs('.profile-feed-name', item);
      const nip05BadgeEl = qs('.profile-feed-nip05', item);
      const refreshFeedIdentity = () => {
        const profileNow = profileFor(displayPubkey);
        const verifiedNip05 = getVerifiedNip05ForPubkey(displayPubkey, profileNow.nip05 || '');
        if (avEl) {
          setAvatarEl(avEl, profileNow.picture || '', pickAvatar(displayPubkey));
          avEl.classList.toggle('nip05-square', !!verifiedNip05);
          avEl.style.cursor = 'pointer';
          avEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(displayPubkey); };
        }
        if (nameEl) {
          nameEl.textContent = profileNow.display_name || profileNow.name || shortHex(displayPubkey);
          nameEl.style.cursor = 'pointer';
          nameEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(displayPubkey); };
        }
        if (nip05BadgeEl) {
          nip05BadgeEl.style.display = verifiedNip05 ? 'inline-flex' : 'none';
          nip05BadgeEl.title = verifiedNip05 ? `NIP-05 verified: ${verifiedNip05}` : '';
        }
        if (!verifiedNip05 && normalizeNip05Value(profileNow.nip05 || '')) {
          ensureNip05Verification(displayPubkey, profileNow.nip05 || '')
            .then(() => {
              const refreshedVerified = getVerifiedNip05ForPubkey(displayPubkey, profileNow.nip05 || '');
              if (avEl) avEl.classList.toggle('nip05-square', !!refreshedVerified);
              if (nip05BadgeEl) {
                nip05BadgeEl.style.display = refreshedVerified ? 'inline-flex' : 'none';
                nip05BadgeEl.title = refreshedVerified ? `NIP-05 verified: ${refreshedVerified}` : '';
              }
            })
            .catch(() => {});
        }
      };
      refreshFeedIdentity();
      const statusEl = qs('.profile-feed-status', item);
      const renderFeedStatus = () => {
        if (!statusEl) return;
        const statusText = getProfileStatusText(displayPubkey);
        statusEl.textContent = statusText;
        statusEl.style.display = statusText ? 'block' : 'none';
      };
      renderFeedStatus();
      const timeEl = qs('.profile-feed-time', item);
      if (timeEl) timeEl.textContent = `${formatTimeAgo(note.created_at)} ago`;

      if (isRepost) {
        const boostAvEl = qs('.pf-boost-av', item);
        const boostNameEl = qs('.pf-boost-name', item);
        const boostProfile = profileFor(boostPubkey);
        if (boostAvEl) {
          setAvatarEl(boostAvEl, boostProfile.picture || '', pickAvatar(boostPubkey));
          boostAvEl.style.cursor = 'pointer';
          boostAvEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(boostPubkey); };
          const boostVerifiedNip05 = getVerifiedNip05ForPubkey(boostPubkey, boostProfile.nip05 || '');
          boostAvEl.classList.toggle('nip05-square', !!boostVerifiedNip05);
        }
        if (boostNameEl) {
          boostNameEl.textContent = boostProfile.display_name || boostProfile.name || shortHex(boostPubkey);
          boostNameEl.style.cursor = 'pointer';
          boostNameEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(boostPubkey); };
        }
        if (!state.profilesByPubkey.has(boostPubkey)) {
          fetchProfileIfNeeded(boostPubkey).then(() => {
            const freshBoost = profileFor(boostPubkey);
            if (boostAvEl) {
              setAvatarEl(boostAvEl, freshBoost.picture || '', pickAvatar(boostPubkey));
              boostAvEl.classList.toggle('nip05-square', !!getVerifiedNip05ForPubkey(boostPubkey, freshBoost.nip05 || ''));
            }
            if (boostNameEl) boostNameEl.textContent = freshBoost.display_name || freshBoost.name || shortHex(boostPubkey);
          }).catch(() => {});
        }
      }

      // Fetch and display profile if not cached yet
      if (!state.profilesByPubkey.has(displayPubkey)) {
        fetchProfileIfNeeded(displayPubkey).then(() => {
          refreshFeedIdentity();
          renderFeedStatus();
        }).catch(() => {});
      }

      const mediaUrls = extractMediaUrlsFromEvent(displayNote);
      const mediaItems = mediaUrls
        .map((url) => ({ url, kind: classifyMediaUrl(url) }))
        .filter((m) => m.kind && isLikelyUrl(m.url));
      const text = stripMediaUrlsFromText(displayNote.content || '', mediaUrls);
      const textEl = qs('.profile-feed-text', item);
      if (textEl) {
        textEl.innerHTML = '';
        if (text) {
          textEl.appendChild(renderNostrContent(text));
          textEl.style.display = 'block';
        } else {
          const emptyLabel = isRepost
            ? (repostRefId ? 'Repost (original note loading...)' : 'Repost')
            : '[empty note]';
          textEl.textContent = mediaItems.length ? '' : emptyLabel;
          textEl.style.display = !mediaItems.length ? 'block' : 'none';
        }
      }

      const mediaWrap = qs('.profile-feed-media-wrap', item);
      if (mediaWrap) {
        if (mediaItems.length) renderPostMedia(mediaWrap, mediaItems);
        else mediaWrap.style.display = 'none';
      }

      const stats = (aggregates && aggregates.statsByPost.get(targetPostId)) || { likes: 0, emoji: 0, boosts: 0, zaps: 0 };
      const comments = (aggregates && aggregates.commentsByPost.get(targetPostId)) || [];
      const likeSet = (aggregates && aggregates.likePubkeysByPost && aggregates.likePubkeysByPost.get(targetPostId)) || new Set();
      const boostSet = (aggregates && aggregates.boostPubkeysByPost && aggregates.boostPubkeysByPost.get(targetPostId)) || new Set();
      const emojiMap = (aggregates && aggregates.emojiByPost && aggregates.emojiByPost.get(targetPostId)) || new Map();
      const commentsCount = qs('.pfs-comments strong', item);
      const likesCount = qs('.profile-post-like-btn strong', item);
      const zapsCount = qs('.pfs-zaps strong', item);
      const boostsCount = qs('.profile-post-boost-btn strong', item);
      if (commentsCount) commentsCount.textContent = `${comments.length}`;
      if (likesCount) likesCount.textContent = `${stats.likes}`;
      if (zapsCount) zapsCount.textContent = `${stats.zaps}`;
      if (boostsCount) boostsCount.textContent = `${stats.boosts}`;

      const own = state.user ? normalizePubkeyHex(state.user.pubkey) : '';
      const likeBtn = qs('.profile-post-like-btn', item);
      if (likeBtn) {
        likeBtn.classList.toggle('active', !!(own && likeSet.has(own)));
        likeBtn.addEventListener('click', () => window.toggleProfilePostLike(targetPostId, targetPostPubkey, pubkey));
      }
      const postZapBtn = qs('.profile-post-zap-btn', item);
      if (postZapBtn) {
        postZapBtn.addEventListener('click', () => window.zapProfileNote(targetPostId, targetPostPubkey, pubkey, postZapBtn));
      }
      const boostBtn = qs('.profile-post-boost-btn', item);
      if (boostBtn) {
        boostBtn.classList.toggle('boosted', !!(own && boostSet.has(own)));
        boostBtn.addEventListener('click', () => window.toggleProfilePostBoost(targetPostId, targetPostPubkey, pubkey));
      }

      const emojiPlusBtn = qs('.profile-post-emoji-btn', item);
      if (emojiPlusBtn) {
        emojiPlusBtn.addEventListener('click', () => window.openReactionPickerForPost(targetPostId, targetPostPubkey, pubkey));
      }

      const emojiBar = qs('.profile-feed-emoji-bar', item);
      if (emojiBar) {
        emojiBar.innerHTML = '';
        const entries = Array.from(emojiMap.values())
          .filter((entry) => entry && entry.pubkeys && entry.pubkeys.size)
          .sort((a, b) => {
            if (b.pubkeys.size !== a.pubkeys.size) return b.pubkeys.size - a.pubkeys.size;
            return String(a.key || '').localeCompare(String(b.key || ''));
          });

        if (!entries.length) {
          emojiBar.style.display = 'none';
        } else {
          emojiBar.style.display = 'flex';
          entries.forEach((entry) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'stream-emoji-chip' + (own && entry.pubkeys.has(own) ? ' active' : '');
            chip.title = `${entry.label || entry.key} (${entry.pubkeys.size})`;
            chip.addEventListener('click', () => {
              window.toggleProfilePostEmoji(targetPostId, targetPostPubkey, pubkey, entry.key, entry.imageUrl || '', entry.shortcode || '');
            });

            const countEl = document.createElement('span');
            countEl.className = 'stream-emoji-count';
            countEl.textContent = `${entry.pubkeys.size}`;
            chip.appendChild(countEl);

            if (entry.imageUrl) {
              const img = document.createElement('img');
              img.src = entry.imageUrl;
              img.alt = entry.label || entry.key;
              img.loading = 'lazy';
              chip.appendChild(img);
            } else {
              const txt = document.createElement('span');
              txt.textContent = String(entry.label || entry.key).slice(0, 18);
              chip.appendChild(txt);
            }
            emojiBar.appendChild(chip);
          });
        }
      }

      const commentsWrap = qs('.profile-feed-comments', item);
      const maxPreview = 3;
      let expandedComments = false;
      let pendingReplyTarget = null;
      let commentInput = null;
      let commentBtn = null;

      const updateReplyComposerUi = () => {
        if (!commentInput) return;
        if (pendingReplyTarget && pendingReplyTarget.name) {
          commentInput.placeholder = `Reply to ${pendingReplyTarget.name}...`;
          commentInput.dataset.replyTo = pendingReplyTarget.id || '';
        } else {
          commentInput.placeholder = 'Write a comment...';
          commentInput.dataset.replyTo = '';
        }
      };

      const clearReplyTarget = () => {
        pendingReplyTarget = null;
        updateReplyComposerUi();
      };

      const setReplyTarget = (target) => {
        pendingReplyTarget = target && target.id ? target : null;
        updateReplyComposerUi();
        if (commentInput) {
          if (pendingReplyTarget && !String(commentInput.value || '').trim()) {
            commentInput.value = `@${pendingReplyTarget.name} `;
          }
          try { commentInput.focus(); } catch (_) {}
        }
      };

      const renderComments = () => {
        if (!commentsWrap) return;
        commentsWrap.innerHTML = '';

        const indicator = document.createElement('div');
        indicator.className = 'profile-comments-indicator';
        indicator.textContent = 'Comments';
        commentsWrap.appendChild(indicator);

        if (!comments.length) {
          const empty = document.createElement('div');
          empty.className = 'profile-comment-empty';
          empty.textContent = 'No comments yet.';
          commentsWrap.appendChild(empty);
          return;
        }

        const list = expandedComments ? comments : comments.slice(0, maxPreview);
        list.forEach((comment) => {
          const cp = profileFor(comment.pubkey);
          const commentLikeSet = (aggregates && aggregates.commentLikePubkeysById && aggregates.commentLikePubkeysById.get(comment.id)) || new Set();
          const commentBoostSet = (aggregates && aggregates.commentBoostPubkeysById && aggregates.commentBoostPubkeysById.get(comment.id)) || new Set();
          const commentZapCount = Number((aggregates && aggregates.commentZapCountById && aggregates.commentZapCountById.get(comment.id)) || 0);
          const commentDisplayName = cp.display_name || cp.name || shortHex(comment.pubkey);
          const row = document.createElement('div');
          row.className = 'profile-comment-item feed-fade-item';
          row.innerHTML = `
            <div class="profile-comment-av"></div>
            <div class="profile-comment-main">
              <div class="profile-comment-meta"><span class="n"></span><span class="nip05-badge profile-comment-nip05" style="display:none">&#10003;</span><span class="t"></span></div>
              <div class="profile-comment-text"></div>
              <div class="profile-comment-media"></div>
              <div class="profile-comment-actions">
                <button type="button" class="profile-comment-reply-btn">↩ Reply</button>
                <button type="button" class="profile-comment-like-btn">❤️ <span class="profile-comment-like-count">0</span></button>
                <button type="button" class="profile-comment-zap-btn">⚡ <span class="profile-comment-zap-count">0</span></button>
                <button type="button" class="profile-comment-boost-btn">🔁 <span class="profile-comment-boost-count">0</span></button>
              </div>
            </div>`;
          const cAvEl = qs('.profile-comment-av', row);
          const n = qs('.profile-comment-meta .n', row);
          const nBadge = qs('.profile-comment-nip05', row);
          setAvatarEl(cAvEl, cp.picture || '', pickAvatar(comment.pubkey));
          const commentVerifiedNip05 = getVerifiedNip05ForPubkey(comment.pubkey, cp.nip05 || '');
          if (cAvEl) cAvEl.classList.toggle('nip05-square', !!commentVerifiedNip05);
          if (!commentVerifiedNip05 && normalizeNip05Value(cp.nip05 || '')) {
            ensureNip05Verification(comment.pubkey, cp.nip05 || '')
              .then(() => {
                const refreshedVerified = getVerifiedNip05ForPubkey(comment.pubkey, cp.nip05 || '');
                if (cAvEl) cAvEl.classList.toggle('nip05-square', !!refreshedVerified);
                if (nBadge) {
                  nBadge.style.display = refreshedVerified ? 'inline-flex' : 'none';
                  nBadge.title = refreshedVerified ? `NIP-05 verified: ${refreshedVerified}` : '';
                }
              })
              .catch(() => {});
          }
          if (cAvEl) { cAvEl.style.cursor = 'pointer'; cAvEl.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(comment.pubkey); }; }
          if (n) {
            n.textContent = commentDisplayName;
            n.style.cursor = 'pointer';
            n.onclick = (e) => { e.stopPropagation(); showProfileByPubkey(comment.pubkey); };
          }
          if (nBadge) {
            nBadge.style.display = commentVerifiedNip05 ? 'inline-flex' : 'none';
            nBadge.title = commentVerifiedNip05 ? `NIP-05 verified: ${commentVerifiedNip05}` : '';
          }
          const t = qs('.profile-comment-meta .t', row);
          if (t) t.textContent = `${formatTimeAgo(comment.created_at)} ago`;
          const ct = qs('.profile-comment-text', row);
          const commentMediaEl = qs('.profile-comment-media', row);
          if (ct) {
            const rawComment = String(comment.content || '');
            const mediaItems = Array.from(new Set(
              extractHttpUrls(rawComment)
                .map((u) => sanitizeMediaUrl(u))
                .filter(Boolean)
            ))
              .map((url) => ({ url, kind: classifyMediaUrl(url) }))
              .filter((entry) => entry.kind === 'photo' || entry.kind === 'video' || entry.kind === 'audio');
            const mediaUrls = mediaItems.map((entry) => entry.url);
            const commentText = mediaUrls.length ? stripMediaUrlsFromText(rawComment, mediaUrls) : rawComment;
            ct.innerHTML = '';
            if (commentText.trim()) { ct.appendChild(renderNostrContent(commentText)); }
            else { ct.textContent = '[empty comment]'; }
            if (commentMediaEl) {
              commentMediaEl.innerHTML = '';
              renderChatInlineMedia(commentMediaEl, mediaItems, {
                allowVideo: true,
                classPrefix: 'profile-comment',
                maxItems: 4,
                videoAutoplay: false,
                videoMuted: false,
                videoLoop: false
              });
              commentMediaEl.style.display = commentMediaEl.children.length ? 'block' : 'none';
            }
          }

          const commentReplyBtn = qs('.profile-comment-reply-btn', row);
          const commentLikeBtn = qs('.profile-comment-like-btn', row);
          const commentLikeCountEl = qs('.profile-comment-like-count', row);
          const commentZapBtn = qs('.profile-comment-zap-btn', row);
          const commentZapCountEl = qs('.profile-comment-zap-count', row);
          const commentBoostBtn = qs('.profile-comment-boost-btn', row);
          const commentBoostCountEl = qs('.profile-comment-boost-count', row);

          if (commentReplyBtn) {
            commentReplyBtn.addEventListener('click', (evt) => {
              evt.stopPropagation();
              setReplyTarget({
                id: comment.id,
                pubkey: comment.pubkey,
                name: commentDisplayName
              });
            });
          }
          if (commentLikeCountEl) commentLikeCountEl.textContent = `${commentLikeSet.size}`;
          if (commentLikeBtn) {
            commentLikeBtn.classList.toggle('active', !!(own && commentLikeSet.has(own)));
            commentLikeBtn.addEventListener('click', (evt) => {
              evt.stopPropagation();
              window.toggleProfilePostLike(comment.id, comment.pubkey, pubkey);
            });
          }
          if (commentZapCountEl) commentZapCountEl.textContent = `${commentZapCount}`;
          if (commentZapBtn) {
            commentZapBtn.addEventListener('click', (evt) => {
              evt.stopPropagation();
              window.zapProfileNote(comment.id, comment.pubkey, pubkey, commentZapBtn);
            });
          }
          if (commentBoostCountEl) commentBoostCountEl.textContent = `${commentBoostSet.size}`;
          if (commentBoostBtn) {
            commentBoostBtn.classList.toggle('active', !!(own && commentBoostSet.has(own)));
            commentBoostBtn.addEventListener('click', (evt) => {
              evt.stopPropagation();
              window.toggleProfilePostBoost(comment.id, comment.pubkey, pubkey);
            });
          }

          // If profile not cached yet, fetch and update row
          if (!state.profilesByPubkey.has(comment.pubkey)) {
            fetchProfileIfNeeded(comment.pubkey).then(() => {
              const fresh = profileFor(comment.pubkey);
              if (n) n.textContent = fresh.display_name || fresh.name || shortHex(comment.pubkey);
              const freshVerifiedNip05 = getVerifiedNip05ForPubkey(comment.pubkey, fresh.nip05 || '');
              if (nBadge) {
                nBadge.style.display = freshVerifiedNip05 ? 'inline-flex' : 'none';
                nBadge.title = freshVerifiedNip05 ? `NIP-05 verified: ${freshVerifiedNip05}` : '';
              }
              if (cAvEl) {
                setAvatarEl(cAvEl, fresh.picture || '', pickAvatar(comment.pubkey));
                cAvEl.classList.toggle('nip05-square', !!freshVerifiedNip05);
              }
            }).catch(() => {});
          }

          commentsWrap.appendChild(row);
        });

        if (comments.length > maxPreview) {
          const more = document.createElement('button');
          more.className = 'profile-comments-more';
          more.textContent = expandedComments
            ? 'Show fewer comments'
            : `Show ${comments.length - maxPreview} more comments`;
          more.addEventListener('click', () => {
            expandedComments = !expandedComments;
            renderComments();
          });
          commentsWrap.appendChild(more);
        }
      };
      renderComments();

      commentInput = qs('.profile-comment-input', item);
      commentBtn = qs('.profile-comment-btn', item);
      const commentAttachBtn = qs('.profile-comment-attach-btn', item);
      const commentMarkupBtns = qsa('.profile-comment-markup [data-action]', item);
      updateReplyComposerUi();
      if (commentInput && commentInput.id !== commentInputId) commentInput.id = commentInputId;
      if (commentAttachBtn && commentInput) {
        commentAttachBtn.addEventListener('click', () => {
          window.openComposeUploadModal(`textarea:${commentInput.id}`);
        });
      }
      if (commentInput && commentMarkupBtns && commentMarkupBtns.length) {
        commentMarkupBtns.forEach((btn) => {
          btn.addEventListener('click', () => {
            const action = String(btn.dataset.action || '').trim().toLowerCase();
            if (!action) return;
            applyNostrMarkupToTextarea(commentInput, action);
          });
        });
      }
      if (commentBtn && commentInput) {
        commentInput.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          commentBtn.click();
        });
        commentBtn.addEventListener('click', async () => {
          const content = (commentInput.value || '').trim();
          if (!content) return;
          if (!state.user) { window.openLogin(); return; }
          commentBtn.disabled = true;
          const original = commentBtn.textContent;
          commentBtn.textContent = 'Posting...';
          try {
            const tags = [['e', targetPostId], ['p', targetPostPubkey]];
            if (pendingReplyTarget && /^[0-9a-f]{64}$/i.test(String(pendingReplyTarget.id || ''))) {
              tags.push(['e', String(pendingReplyTarget.id), '', 'reply']);
              if (pendingReplyTarget.pubkey && pendingReplyTarget.pubkey !== targetPostPubkey) {
                tags.push(['p', String(pendingReplyTarget.pubkey)]);
              }
            }
            const signed = await signAndPublish(1, content, tags);
            const map = state.profileNotesByPubkey.get(pubkey) || new Map();
            map.set(signed.id, signed);
            state.profileNotesByPubkey.set(pubkey, map);
            commentInput.value = '';
            clearReplyTarget();
            renderFeedOrProfileFeed(pubkey);
          } catch (err) {
            if (window.console) console.warn('Could not post comment', err);
            alert(err && err.message ? err.message : 'Could not post comment. Please try again.');
          } finally {
            commentBtn.disabled = false;
            commentBtn.textContent = original;
          }
        });
      }

      listEl.appendChild(item);
    });

    // Infinite scroll sentinel ? appear if more posts exist beyond current limit
    if (notes.length > limit) {
      const sentinel = document.createElement('div');
      sentinel.className = 'feed-sentinel';
      sentinel.innerHTML = '<span class="feed-sentinel-label">Loading more posts...</span>';
      listEl.appendChild(sentinel);

      const obs = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        const newLimit = limit + 6;
        listEl.dataset.feedLimit = String(newLimit);
        // Re-render with higher limit using current data
        const map = state.profileNotesByPubkey.get(pubkey) || new Map();
        const isFeedView = isNostrFeedVirtualProfile(pubkey);
        const freshNotes = Array.from(map.values())
          .filter((ev) => {
            if (!ev) return false;
            if (isFeedView) return isTopLevelNostrFeedPost(ev);
            if (ev.pubkey !== pubkey) return false;
            if (ev.kind === 6) return true;
            return isTopLevelProfilePost(ev, pubkey);
          })
          .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
        const freshAgg = buildProfilePostAggregates(pubkey, freshNotes);
        const freshProfile = isFeedView
          ? { pubkey: NOSTR_FEED_PROFILE_KEY, name: 'Nostr Feed', display_name: 'Nostr Feed', picture: '', nip05: '' }
          : profileFor(pubkey);
        renderProfileFeedInto(listEl, freshNotes, freshProfile, pubkey, freshAgg);
      }, { rootMargin: '180px' });
      obs.observe(sentinel);
    }
  }
  function renderProfileFeed(pubkey) {
    if (isNostrFeedVirtualProfile(pubkey)) {
      const listEl = qs('#nostrFeedList');
      if (!listEl) return;
      const map = state.profileNotesByPubkey.get(NOSTR_FEED_PROFILE_KEY) || new Map();
      const notes = Array.from(map.values())
        .filter((ev) => isTopLevelNostrFeedPost(ev))
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      const aggregates = buildProfilePostAggregates(NOSTR_FEED_PROFILE_KEY, notes);
      renderProfileFeedInto(
        listEl,
        notes,
        { pubkey: NOSTR_FEED_PROFILE_KEY, name: 'Nostr Feed', display_name: 'Nostr Feed', picture: '', nip05: '' },
        NOSTR_FEED_PROFILE_KEY,
        aggregates
      );
      return;
    }

    const leftList = qs('#profileFeedList');
    const tabList = qs('#profileFeedListSide');
    const count = qs('#profileFeedCount');

    const map = state.profileNotesByPubkey.get(pubkey) || new Map();
    // Include top-level kind:1 posts AND kind:6 reposts authored by this pubkey (NIP-18)
    const notes = Array.from(map.values())
      .filter((ev) => {
        if (!ev || ev.pubkey !== pubkey) return false;
        if (ev.kind === 6) return true;
        return isTopLevelProfilePost(ev, pubkey);
      })
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    if (count) count.textContent = `${notes.length} notes`;

    const aggregates = buildProfilePostAggregates(pubkey, notes);
    const profile = profileFor(pubkey);
    renderProfileFeedInto(leftList, notes, profile, pubkey, aggregates);
    renderProfileFeedInto(tabList, notes, profile, pubkey, aggregates);
  }

  function extractHttpUrls(text) {
    const raw = (text || '').match(/https?:\/\/\S+/gi) || [];
    return raw.map((url) =>
      String(url || '')
        .replace(/[)\],.;!?'"`>]+$/g, '')
        .replace(/^[("'`<]+/g, '')
    );
  }

  function classifyMediaUrl(url) {
    const base = (url || '').split('#')[0].split('?')[0].toLowerCase();
    if (/\.(mp4|webm|mov|m4v|mkv|m3u8)$/.test(base)) return 'video';
    if (/\.(jpg|jpeg|png|gif|webp|avif)$/.test(base)) return 'photo';
    if (/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/.test(base)) return 'audio';
    return '';
  }

  function parseSpotifyPreviewUrl(rawUrl) {
    const clean = sanitizeMediaUrl(rawUrl);
    if (!clean || !/^https?:\/\//i.test(clean)) return null;
    let parsed;
    try {
      parsed = new URL(clean);
    } catch (_) {
      return null;
    }

    const host = String(parsed.hostname || '').toLowerCase();
    if (!(host === 'open.spotify.com' || host === 'play.spotify.com')) return null;

    const segments = String(parsed.pathname || '')
      .split('/')
      .filter(Boolean);
    if (!segments.length) return null;

    let idx = 0;
    if (segments[0] === 'intl' && segments.length >= 3) idx = 2;
    else if (segments[0].startsWith('intl-') && segments.length >= 3) idx = 1;
    if (segments[idx] === 'embed') idx += 1;

    const type = String(segments[idx] || '').toLowerCase();
    const id = String(segments[idx + 1] || '').split('?')[0].trim();
    if (!type || !id) return null;
    if (!['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(type)) return null;
    if (!/^[a-z0-9]{8,64}$/i.test(id)) return null;

    const canonicalUrl = `https://open.spotify.com/${type}/${id}`;
    const embedUrl = `https://open.spotify.com/embed/${type}/${id}?utm_source=sifaka_live`;
    const compact = type === 'track' || type === 'episode';
    const labelMap = {
      track: 'Spotify Track',
      album: 'Spotify Album',
      playlist: 'Spotify Playlist',
      artist: 'Spotify Artist',
      episode: 'Spotify Episode',
      show: 'Spotify Show'
    };

    return {
      sourceUrl: clean,
      canonicalUrl,
      embedUrl,
      type,
      id,
      compact,
      label: labelMap[type] || 'Spotify'
    };
  }

  function extractSpotifyPreviewItems(urls) {
    const list = Array.isArray(urls) ? urls : [];
    const out = [];
    const seen = new Set();
    list.forEach((url) => {
      const parsed = parseSpotifyPreviewUrl(url);
      if (!parsed) return;
      const key = `${parsed.type}:${parsed.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(parsed);
    });
    return out;
  }

  function renderSpotifyLinkPreviews(container, items, opts = {}) {
    if (!container || !Array.isArray(items) || !items.length) return;
    const classPrefix = String(opts.classPrefix || 'chat').trim() || 'chat';
    const maxItems = Math.max(1, Number(opts.maxItems || 2));
    const wrap = document.createElement('div');
    wrap.className = `${classPrefix}-spotify-wrap spotify-preview-wrap`;

    items.slice(0, maxItems).forEach((item) => {
      if (!item || !item.embedUrl) return;
      const card = document.createElement('article');
      card.className = `spotify-preview-card${item.compact ? ' compact' : ' expanded'}`;

      const head = document.createElement('div');
      head.className = 'spotify-preview-head';
      const label = document.createElement('span');
      label.className = 'spotify-preview-label';
      label.textContent = item.label || 'Spotify';
      const open = document.createElement('a');
      open.className = 'spotify-preview-open';
      open.href = item.canonicalUrl || item.sourceUrl || item.embedUrl;
      open.target = '_blank';
      open.rel = 'noopener noreferrer';
      open.textContent = 'Open';
      head.appendChild(label);
      head.appendChild(open);
      card.appendChild(head);

      const frame = document.createElement('iframe');
      frame.className = 'spotify-preview-frame';
      frame.src = item.embedUrl;
      frame.loading = 'lazy';
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.title = `${item.label || 'Spotify'} preview`;
      frame.height = item.compact ? '152' : '352';
      frame.setAttribute('allowfullscreen', '');
      card.appendChild(frame);
      wrap.appendChild(card);
    });

    if (wrap.children.length) container.appendChild(wrap);
  }

  function extractMediaUrlsFromEvent(ev) {
    const urls = extractHttpUrls(ev && ev.content ? ev.content : '').map((u) => sanitizeMediaUrl(u)).filter(Boolean);
    const tags = (ev && Array.isArray(ev.tags)) ? ev.tags : [];
    tags.forEach((tag) => {
      if (!Array.isArray(tag) || tag.length < 2) return;
      const key = String(tag[0] || '').toLowerCase();
      const value = sanitizeMediaUrl(tag[1] || '');
      if (!/^https?:\/\//i.test(value)) return;
      if (key === 'url' || key === 'r' || key === 'image' || key === 'thumb' || key === 'streaming') {
        urls.push(value);
      }
    });
    return Array.from(new Set(urls));
  }

  function collectProfileMedia(pubkey) {
    const map = state.profileNotesByPubkey.get(pubkey) || new Map();
    const notes = Array.from(map.values())
      .filter((ev) => (ev.pubkey === pubkey) && (ev.kind === 1 || ev.kind === 20 || ev.kind === 21 || ev.kind === 22 || ev.kind === 1063))
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
    const videos = [];
    const photos = [];
    const items = [];
    const seenVideo = new Set();
    const seenPhoto = new Set();
    const seenMedia = new Set();

    notes.forEach((note) => {
      const urls = extractMediaUrlsFromEvent(note);
      const caption = (note.content || '').trim();
      urls.forEach((url) => {
        const kind = classifyMediaUrl(url);
        if (kind === 'video' && !seenVideo.has(url) && videos.length < 200) {
          videos.push({ url, note, caption });
          seenVideo.add(url);
        }
        if (kind === 'photo' && !seenPhoto.has(url) && photos.length < 500) {
          photos.push({ url, note, caption });
          seenPhoto.add(url);
        }
        if ((kind === 'video' || kind === 'photo') && !seenMedia.has(url) && items.length < 700) {
          items.push({ kind, url, note, caption, created_at: Number(note.created_at || 0) || 0 });
          seenMedia.add(url);
        }
      });
    });

    items.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
    return { videos, photos, items };
  }

  function renderProfilePastStreams(pubkey) {
    const list = qs('#profilePastStreamsList');
    if (!list) return;

    const items = Array.from(state.streamsByAddress.values())
      .filter((stream) => (stream.pubkey === pubkey || stream.hostPubkey === pubkey) && stream.status !== 'live')
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
      .slice(0, 24);

    if (!items.length) {
      list.innerHTML = '<div class="profile-feed-empty">No past streams found yet.</div>';
      return;
    }

    list.innerHTML = '';
    items.forEach((stream) => {
      const row = document.createElement('div');
      row.className = 'profile-stream-item';

      const left = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'profile-stream-title';
      title.textContent = stream.title || 'Untitled stream';
      const meta = document.createElement('div');
      meta.className = 'profile-stream-meta';
      meta.textContent = `${(stream.status || 'past').toUpperCase()} - ${formatTimeAgo(stream.created_at)} ago`;
      left.appendChild(title);
      left.appendChild(meta);

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-ghost';
      openBtn.style.padding = '.28rem .58rem';
      openBtn.style.fontSize = '.72rem';
      openBtn.textContent = 'Open';
      openBtn.disabled = !stream.address;
      openBtn.addEventListener('click', () => {
        if (stream.address) openStream(stream.address);
      });

      row.appendChild(left);
      row.appendChild(openBtn);
      list.appendChild(row);
    });
  }

  function renderProfileMediaGrid(media) {
    const wrap = qs('#profileMediaList') || qs('#profileVideosList');
    if (!wrap) return;
    const legacyPhotos = qs('#profilePhotosList');
    if (legacyPhotos) {
      legacyPhotos.innerHTML = '';
      legacyPhotos.style.display = 'none';
    }

    const items = Array.isArray(media && media.items) ? media.items : [];
    if (!items.length) {
      wrap.innerHTML = '<div class="profile-feed-empty">No photos or videos detected in recent notes.</div>';
      return;
    }

    const limit = parseInt(wrap.dataset.mediaLimit || '9', 10);
    wrap.innerHTML = '';
    wrap.classList.add('profile-media-grid');

    items.slice(0, limit).forEach((item) => {
      const isPhoto = item.kind === 'photo';
      const card = document.createElement(isPhoto ? 'a' : 'article');
      card.className = `profile-media-card-item ${isPhoto ? 'photo' : 'video'} feed-fade-item`;

      if (isPhoto) {
        card.href = item.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      }

      const frame = document.createElement('div');
      frame.className = 'profile-media-frame';
      if (isPhoto) {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = 'Profile media';
        img.loading = 'lazy';
        frame.appendChild(img);
      } else if (/\.m3u8($|\?)/i.test(item.url)) {
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'profile-media-fallback-link';
        link.textContent = 'Open HLS video';
        frame.appendChild(link);
      } else {
        const video = document.createElement('video');
        video.controls = true;
        video.autoplay = false;
        video.loop = false;
        video.muted = false;
        video.defaultMuted = false;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = item.url;
        video.addEventListener('error', () => {
          const fallback = document.createElement('a');
          fallback.href = item.url;
          fallback.target = '_blank';
          fallback.rel = 'noopener noreferrer';
          fallback.className = 'profile-media-fallback-link';
          fallback.textContent = 'Open video';
          frame.innerHTML = '';
          frame.appendChild(fallback);
        });
        frame.appendChild(video);
      }

      const meta = document.createElement('div');
      meta.className = 'profile-media-meta';
      const typeEl = document.createElement('span');
      typeEl.className = `profile-media-kind ${item.kind}`;
      typeEl.textContent = isPhoto ? 'Image' : 'Video';
      const timeEl = document.createElement('span');
      timeEl.className = 'profile-media-time';
      timeEl.textContent = `${formatTimeAgo(item.created_at || (item.note && item.note.created_at) || 0)} ago`;
      meta.appendChild(typeEl);
      meta.appendChild(timeEl);

      const caption = document.createElement('div');
      caption.className = 'profile-media-caption';
      caption.textContent = item.caption || item.url;

      card.appendChild(frame);
      card.appendChild(meta);
      card.appendChild(caption);
      wrap.appendChild(card);
    });

    if (items.length > limit) {
      const sentinel = document.createElement('div');
      sentinel.className = 'feed-sentinel media-sentinel';
      sentinel.style.gridColumn = '1/-1';
      sentinel.innerHTML = '<span class="feed-sentinel-label">Loading more media...</span>';
      wrap.appendChild(sentinel);

      const obs = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        wrap.dataset.mediaLimit = String(limit + 9);
        renderProfileMediaGrid(media);
      }, { rootMargin: '180px' });
      obs.observe(sentinel);
    }
  }

  function renderProfileCollections(pubkey) {
    renderProfilePastStreams(pubkey);
    const media = collectProfileMedia(pubkey);
    renderProfileMediaGrid(media);
  }

  function setProfileTab(tabName) {
    const tabMap = {
      posts: 'Posts',
      streams: 'Streams',
      media: 'Media'
    };
    const postsBtn = qs('#profileTabBtnPosts');
    const postsAllowed = !!(postsBtn && postsBtn.style.display !== 'none');
    let tab = tabName;
    if (tab === 'videos' || tab === 'photos') tab = 'media';
    if (!Object.prototype.hasOwnProperty.call(tabMap, tab)) tab = 'streams';
    if (tab === 'posts' && !postsAllowed) tab = 'streams';
    state.profileTab = tab;
    Object.keys(tabMap).forEach((key) => {
      const btn = qs(`#profileTabBtn${tabMap[key]}`);
      if (btn) btn.classList.toggle('active', key === tab);
      const pane = qs(`#profileTab${tabMap[key]}`);
      if (pane) pane.classList.toggle('on', key === tab);
    });
  }

  /* =====================================================================
     NOSTR BADGES (NIP-58)
     kind:8  = Badge Award (issued to a pubkey)
     kind:30009 = Badge Definition (created by issuer)
     ===================================================================== */

  // badgesByPubkey: Map<pubkey, Map<badgeId, { award, definition }>>
  if (!state.badgesByPubkey) state.badgesByPubkey = new Map();
  if (!state.badgeSubId) state.badgeSubId = null;
  if (!state.badgeDefMap) state.badgeDefMap = new Map(); // Map<"pubkey:d", definition event>

  function parseBadgeAddressRef(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const parts = raw.split(':');
    if (parts.length < 3) return null;
    const kind = parts.shift();
    const pubkey = parts.shift();
    const d = parts.join(':');
    if (kind !== '30009' || !pubkey || !d) return null;
    return { pubkey, d, key: `${pubkey}:${d}` };
  }

  function badgeInfoFromEvents(award, definition) {
    const image = sanitizeMediaUrl(getBadgeDefTag(definition, 'image') || getBadgeDefTag(definition, 'thumb'));
    const awardATag = ((award && award.tags) || []).find((t) => Array.isArray(t) && t[0] === 'a' && t[1]);
    const ref = parseBadgeAddressRef(awardATag ? awardATag[1] : '');
    const badgeId = (getBadgeDefTag(definition, 'd') || (ref && ref.d) || '').trim();
    const displayName = (getBadgeDefTag(definition, 'name') || badgeId || '').trim();
    const fallbackName = displayName || (ref ? `Award ${shortHex(ref.pubkey)}` : 'Unknown award');
    const desc = getBadgeDefTag(definition, 'description') || '';
    const issuer = (getBadgeDefTag(definition, 'issuer') || (definition && definition.pubkey) || (ref && ref.pubkey) || '').trim();

    return {
      image,
      name: fallbackName,
      desc,
      id: badgeId,
      issuer
    };
  }

  function subscribeBadges(pubkey) {
    if (!pubkey) return;
    if (state.badgeSubId) { state.pool.unsubscribe(state.badgeSubId); state.badgeSubId = null; }

    if (!state.badgesByPubkey.has(pubkey)) state.badgesByPubkey.set(pubkey, new Map());

    // Fetch kind:8 badge awards where this pubkey is tagged
    state.badgeSubId = state.pool.subscribe(
      [{ kinds: [8], '#p': [pubkey], limit: 100 }],
      {
        event: (ev) => {
          if (ev.kind !== 8) return;
          // Each award references a badge definition via 'a' tag: "30009:creatorPubkey:d-tag"
          const aTags = (ev.tags || []).filter((t) => t[0] === 'a' && t[1]);
          aTags.forEach((aTag) => {
            const ref = parseBadgeAddressRef(aTag[1]);
            if (!ref) return;
            const awardMap = state.badgesByPubkey.get(pubkey);
            const existing = awardMap.get(ref.key);
            if (!existing || Number(existing.award && existing.award.created_at || 0) <= Number(ev.created_at || 0)) {
              awardMap.set(ref.key, { award: ev, definition: state.badgeDefMap.get(ref.key) || (existing && existing.definition) || null });
            }
            // Fetch definition if not cached
            if (!state.badgeDefMap.has(ref.key)) {
              fetchBadgeDefinition(ref.pubkey, ref.d);
            }
          });
          renderProfileBadges(pubkey);
        },
        eose: () => { renderProfileBadges(pubkey); }
      }
    );
  }

  function fetchBadgeDefinition(creatorPubkey, d) {
    const defKey = `${creatorPubkey}:${d}`;
    if (state.badgeDefMap.has(defKey)) return;
    const subId = state.pool.subscribe(
      [{ kinds: [30009], authors: [creatorPubkey], '#d': [d], limit: 1 }],
      {
        event: (ev) => {
          if (ev.kind !== 30009) return;
          state.badgeDefMap.set(defKey, ev);
          // Update any awaiting badge entries
          state.badgesByPubkey.forEach((awardMap, pubkey) => {
            if (awardMap.has(defKey)) {
              awardMap.get(defKey).definition = ev;
              if (state.selectedProfilePubkey === pubkey) renderProfileBadges(pubkey);
            }
          });
          state.pool.unsubscribe(subId);
        },
        eose: () => { state.pool.unsubscribe(subId); }
      }
    );
  }

  function getBadgeDefTag(ev, tagName) {
    if (!ev || !Array.isArray(ev.tags)) return '';
    const t = ev.tags.find((t) => t[0] === tagName);
    return t ? (t[1] || '') : '';
  }

  function renderProfileBadges(pubkey) {
    const panel = qs('#profileBadgesPanel');
    const grid = qs('#profileBadgesGrid');
    const bioGrid = qs('#profileBioGrid');
    if (!panel || !grid || !bioGrid) return;

    const awardMap = state.badgesByPubkey.get(pubkey);
    const badges = awardMap ? Array.from(awardMap.values()) : [];

    if (!badges.length) {
      panel.style.display = 'none';
      bioGrid.classList.remove('has-badges');
      return;
    }

    panel.style.display = 'block';
    bioGrid.classList.add('has-badges');
    grid.innerHTML = '';

    const MAX_SHOWN = 9; // 3x3 grid

    function makeBadgeChip(award, definition) {
      const chip = document.createElement('div');
      chip.className = 'profile-badge-chip';
      const info = badgeInfoFromEvents(award, definition);
      if (info.image && isLikelyUrl(info.image)) {
        const img = document.createElement('img');
        img.src = info.image; img.alt = info.name; img.loading = 'lazy';
        img.onerror = () => { chip.innerHTML = ''; };
        chip.appendChild(img);
      } else { chip.textContent = ''; }
      chip.title = info.name;
      chip.addEventListener('click', () => { openBadgePopup({ ...info, definition, award }); });
      return chip;
    }

    badges.slice(0, MAX_SHOWN).forEach(({ award, definition }) => {
      grid.appendChild(makeBadgeChip(award, definition));
    });

    if (badges.length > MAX_SHOWN) {
      const more = document.createElement('div');
      more.className = 'badge-see-more';
      more.textContent = `+${badges.length - MAX_SHOWN}`;
      more.title = 'See all badges';
      more.addEventListener('click', () => openAllBadgesPopup(badges));
      grid.appendChild(more);
    }
  }

  function refreshProfileHeaderStats(pubkey) {
    const target = normalizePubkeyHex(pubkey);
    if (!target) return;
    if (normalizePubkeyHex(state.selectedProfilePubkey) !== target) return;
    const stats = state.profileStatsByPubkey.get(target) || { followers: 0, following: 0 };
    const followersEl = qs('#profFollowers');
    const followingEl = qs('#profFollowing');
    if (followersEl) followersEl.textContent = formatCount(stats.followers || 0);
    if (followingEl) followingEl.textContent = formatCount(stats.following || 0);
  }

  function refreshTheaterFollowerStat(pubkey, followersCount) {
    const target = normalizePubkeyHex(pubkey);
    if (!target) return;
    const openStream = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
    if (!openStream) return;
    const openTarget = normalizePubkeyHex(openStream.hostPubkey || '') || normalizePubkeyHex(openStream.pubkey || '');
    if (openTarget !== target) return;
    const el = qs('#theaterFollowers');
    if (el) el.textContent = formatCount(Math.max(0, Number(followersCount || 0)));
  }

  function subscribeProfileStats(pubkey) {
    const target = normalizePubkeyHex(pubkey);
    if (!target) {
      if (state.profileStatsSubId) {
        try { state.pool.unsubscribe(state.profileStatsSubId); } catch (_) {}
      }
      state.profileStatsSubId = null;
      state.profileStatsTargetPubkey = '';
      return;
    }

    if (state.profileStatsSubId && state.profileStatsTargetPubkey === target) {
      const existing = state.profileStatsByPubkey.get(target) || { followers: 0, following: 0 };
      refreshProfileHeaderStats(target);
      refreshTheaterFollowerStat(target, existing.followers || 0);
      return;
    }

    if (state.profileStatsSubId) {
      try { state.pool.unsubscribe(state.profileStatsSubId); } catch (_) {}
      state.profileStatsSubId = null;
    }
    state.profileStatsTargetPubkey = target;

    let followerSet = new Set();
    let followingSet = new Set();
    let latestFollowingCreated = 0;

    state.profileStatsByPubkey.set(target, { followers: 0, following: 0 });

    state.profileStatsSubId = state.pool.subscribe(
      [
        { kinds: [3], authors: [target], limit: 10 },
        { kinds: [3], '#p': [target], limit: 400 }
      ],
      {
        event: (ev) => {
          if (ev.kind !== 3) return;
          const eventPubkey = normalizePubkeyHex(ev.pubkey || '');
          if (!eventPubkey) return;

          if (eventPubkey === target) {
            const created = Number(ev.created_at || 0);
            if (created >= latestFollowingCreated) {
              latestFollowingCreated = created;
              followingSet = new Set();
              (ev.tags || []).forEach((tag) => {
                if (Array.isArray(tag) && tag[0] === 'p' && tag[1]) {
                  const normalized = normalizePubkeyHex(tag[1]);
                  if (normalized) followingSet.add(normalized);
                }
              });
            }
          } else {
            followerSet.add(eventPubkey);
          }

          state.profileStatsByPubkey.set(target, {
            followers: followerSet.size,
            following: followingSet.size
          });

          refreshProfileHeaderStats(target);
          refreshTheaterFollowerStat(target, followerSet.size);
        },
        eose: () => {
          state.profileStatsByPubkey.set(target, {
            followers: followerSet.size,
            following: followingSet.size
          });
          refreshProfileHeaderStats(target);
          refreshTheaterFollowerStat(target, followerSet.size);
        }
      }
    );
  }

  function renderProfileFollowButton(pubkey) {
    const isOwn = !!(pubkey && state.user && state.user.pubkey === pubkey);
    const messageBtn = qs('#profileMessageBtn');
    const zapBtn = qs('#profileZapBtn');
    const editBtn = qs('#profileEditBtn');
    const btn = qs('#profileFollowBtn');

    if (messageBtn) messageBtn.style.display = isOwn ? 'none' : '';
    if (zapBtn) zapBtn.style.display = isOwn ? 'none' : '';
    if (btn) btn.style.display = isOwn ? 'none' : '';
    if (editBtn) editBtn.style.display = isOwn ? 'inline-flex' : 'none';
    if (!btn) return;

    btn.disabled = false;
    btn.classList.remove('following-active');

    if (!pubkey) {
      btn.textContent = 'Follow';
      return;
    }

    if (isOwn) return;

    const following = isFollowingPubkey(pubkey);
    btn.textContent = following ? 'Following' : 'Follow';
    btn.classList.toggle('following-active', following);
  }

  function updateOwnFollowingStat(delta) {
    if (!state.user) return;
    const ownPubkey = normalizePubkeyHex(state.user.pubkey);
    if (!ownPubkey) return;

    const current = state.profileStatsByPubkey.get(ownPubkey) || { followers: 0, following: 0 };
    const nextFollowing = Math.max(0, Number(current.following || 0) + Number(delta || 0));
    state.profileStatsByPubkey.set(ownPubkey, {
      followers: Number(current.followers || 0),
      following: nextFollowing
    });

    if (normalizePubkeyHex(state.selectedProfilePubkey) === ownPubkey) {
      const followingEl = qs('#profFollowing');
      if (followingEl) followingEl.textContent = formatCount(nextFollowing);
    }
  }

  function subscribeProfileFeed(pubkey) {
    if (!pubkey) return;
    if (state.profileFeedSubId) state.pool.unsubscribe(state.profileFeedSubId);

    const leftList = qs('#profileFeedList');
    const sideList = qs('#profileFeedListSide');
    if (leftList) { leftList.innerHTML = '<div class="profile-feed-empty">Loading notes from relays...</div>'; leftList.dataset.feedLimit = '6'; }
    if (sideList) { sideList.innerHTML = '<div class="profile-feed-empty">Loading notes from relays...</div>'; sideList.dataset.feedLimit = '6'; }

    // Reset media limits
    const mediaEl = qs('#profileMediaList') || qs('#profileVideosList');
    const photosEl = qs('#profilePhotosList');
    if (mediaEl) mediaEl.dataset.mediaLimit = '9';
    if (photosEl) photosEl.dataset.mediaLimit = '0';

    const selectedKey = normalizePubkeyHex(pubkey) || pubkey;
    const existing = state.profileNotesByPubkey.get(pubkey);
    if (!existing) state.profileNotesByPubkey.set(pubkey, new Map());
    let feedRenderTimer = null;
    const flushProfileFeedRender = () => {
      if (feedRenderTimer) {
        clearTimeout(feedRenderTimer);
        feedRenderTimer = null;
      }
      if ((normalizePubkeyHex(state.selectedProfilePubkey) || state.selectedProfilePubkey) === selectedKey) {
        renderProfileFeed(pubkey);
        renderProfileCollections(pubkey);
      }
    };
    const scheduleProfileFeedRender = () => {
      if (feedRenderTimer) clearTimeout(feedRenderTimer);
      feedRenderTimer = setTimeout(flushProfileFeedRender, 120);
    };

    state.profileFeedSubId = state.pool.subscribe(
      [
        { kinds: [1, 6, KIND_REACTION, KIND_DELETION, 20, 21, 22, 1063, KIND_ZAP_RECEIPT], authors: [pubkey], limit: 320, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 180 },
        { kinds: [1, 6, KIND_REACTION, KIND_DELETION, KIND_ZAP_RECEIPT], '#p': [pubkey], limit: 620, since: Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 180 }
      ],
      {
        event: (ev) => {
          const map = state.profileNotesByPubkey.get(pubkey) || new Map();
          const current = map.get(ev.id);
          if (!current || (current.created_at || 0) <= (ev.created_at || 0)) {
            map.set(ev.id, ev);
            state.profileNotesByPubkey.set(pubkey, map);
          }
          scheduleProfileFeedRender();
        },
        eose: () => {
          flushProfileFeedRender();
        }
      }
    );
  }

  function renderProfilePage(pubkey) {
    const p = profileFor(pubkey);

    const profName = qs('#profName');
    if (profName) profName.textContent = p.name;

    setAvatarEl(qs('#profAv'), p.picture || '', pickAvatar(pubkey));

    const nip05Main = qs('#profNip05');
    const nip05Check = qs('#profNip05Check');
    const npubEl = qs('#profNpub');
    const claimedNip05 = normalizeNip05Value(p.nip05 || '');
    const verifiedNip05 = getVerifiedNip05ForPubkey(pubkey, claimedNip05);
    if (claimedNip05 && !verifiedNip05) ensureNip05Verification(pubkey, claimedNip05).catch(() => {});

    if (npubEl) npubEl.textContent = formatNpubForDisplay(pubkey);

    if (verifiedNip05) {
      if (nip05Main) { nip05Main.style.display = 'flex'; nip05Main.textContent = `NIP-05: ${verifiedNip05}`; }
      if (nip05Check) {
        nip05Check.style.display = 'inline';
        nip05Check.textContent = '\u2713';
        nip05Check.title = 'NIP-05 verified';
      }
    } else {
      if (nip05Main) nip05Main.style.display = 'none';
      if (nip05Check) nip05Check.style.display = 'none';
    }
    if (npubEl) npubEl.style.display = verifiedNip05 ? 'none' : 'block';
    setProfileVerificationStyle(verifiedNip05 ? 'verified' : 'none');
    renderProfileKind30315(pubkey);

    const bio = qs('#profBio');
    const bioText = (p.about || 'No bio yet.').trim() || 'No bio yet.';
    if (bio) {
      bio.innerHTML = '';
      bio.appendChild(renderNostrContent(bioText));
    }

    const bioToggle = qs('#profBioToggle');
    const isExpanded = !!state.profileBioExpandedByPubkey.get(pubkey);
    if (bio) bio.classList.toggle('clamped', !isExpanded);
    const hasLongBio = bioText.length > 280 || (bioText.match(/\n/g) || []).length >= 5;
    if (bioToggle) {
      bioToggle.style.display = hasLongBio ? 'inline-flex' : 'none';
      bioToggle.textContent = isExpanded ? 'Show less' : 'Show more';
    }

    const websiteRow = qs('#profWebsiteRow');
    const websiteBio = qs('#profWebsiteBio');
    let website = (p.website || '').trim();
    if (website && !isLikelyUrl(website) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(website)) {
      website = `https://${website}`;
    }
    const websiteVisible = !!(website && isLikelyUrl(website));
    if (websiteVisible) {
      if (websiteBio) {
        websiteBio.href = website;
        websiteBio.textContent = website;
      }
      if (websiteRow) websiteRow.style.display = 'flex';
    } else if (websiteRow) {
      websiteRow.style.display = 'none';
    }

    const lud16Row = qs('#profLud16Row');
    const lud16Bio = qs('#profLud16Bio');
    const lud16 = (p.lud16 || '').trim();
    const lud16Visible = !!lud16;
    if (lud16Visible) {
      if (lud16Bio) lud16Bio.textContent = lud16;
      if (lud16Row) lud16Row.style.display = 'flex';
    } else if (lud16Row) {
      lud16Row.style.display = 'none';
    }

    const twitterRow = qs('#profTwitterRow');
    const twitterBio = qs('#profTwitterBio');
    const tw = normalizeTwitterLink(p.twitter || '');
    const twitterVisible = !!tw.url;
    if (twitterVisible) {
      if (twitterBio) {
        twitterBio.href = tw.url;
        twitterBio.textContent = tw.label || tw.url;
      }
      if (twitterRow) twitterRow.style.display = 'flex';
    } else if (twitterRow) {
      twitterRow.style.display = 'none';
    }

    const githubRow = qs('#profGithubRow');
    const githubBio = qs('#profGithubBio');
    const gh = normalizeGithubLink(p.github || '');
    const githubVisible = !!gh.url;
    if (githubVisible) {
      if (githubBio) {
        githubBio.href = gh.url;
        githubBio.textContent = gh.label || gh.url;
      }
      if (githubRow) githubRow.style.display = 'flex';
    } else if (githubRow) {
      githubRow.style.display = 'none';
    }

    const mainBioLinks = qs('#profBioLinksMain');
    if (mainBioLinks) mainBioLinks.style.display = (twitterVisible || githubVisible) ? 'flex' : 'none';
    const bottomBioLinks = qs('#profBioLinksBottom');
    if (bottomBioLinks) bottomBioLinks.style.display = (websiteVisible || lud16Visible) ? 'flex' : 'none';

      const bannerImg = qs('#profBannerImg');
      if (bannerImg && p.banner && isLikelyUrl(p.banner)) {
        bannerImg.src = p.banner;
        bannerImg.loading = 'lazy';
        bannerImg.decoding = 'async';
        bannerImg.referrerPolicy = 'no-referrer';
        bannerImg.style.display = 'block';
      } else if (bannerImg) {
      bannerImg.removeAttribute('src');
      bannerImg.style.display = 'none';
    }

    const normalizedProfilePubkey = normalizePubkeyHex(pubkey) || pubkey;
    const userStreams = Array.from(state.streamsByAddress.values()).filter((s) => {
      const eventPubkey = normalizePubkeyHex(s.pubkey) || s.pubkey;
      const hostPubkey = normalizePubkeyHex(s.hostPubkey) || s.hostPubkey;
      return eventPubkey === normalizedProfilePubkey || hostPubkey === normalizedProfilePubkey;
    });
    const sinceEl = qs('#profNostrSince');
    const firstSeenTs = estimateProfileFirstSeen(pubkey, p);
    if (sinceEl) sinceEl.textContent = ''; // hidden via CSS; kept for Time on Nostr stat tile

    const followers = qs('#profFollowers');
    const following = qs('#profFollowing');
    const streams = qs('#profStreams');
    const sats = qs('#profSats');
    const postCountEl = qs('#profPostCount');
    const nostrAgeStatEl = qs('#profNostrAgeStat');
    const stats = state.profileStatsByPubkey.get(pubkey) || { followers: 0, following: 0 };

    if (followers) followers.textContent = formatCount(stats.followers || 0);
    if (following) following.textContent = formatCount(stats.following || 0);
    const noteMap = state.profileNotesByPubkey.get(pubkey) || new Map();
    const noteCount = Array.from(noteMap.values()).filter((ev) => ev.pubkey === pubkey && ev.kind === 1).length;
    if (postCountEl) postCountEl.textContent = formatCount(noteCount);
    if (streams) streams.textContent = `${userStreams.length}`;
    if (nostrAgeStatEl) nostrAgeStatEl.textContent = firstSeenTs ? formatNostrAge(firstSeenTs) : '-';
    if (sats) sats.textContent = formatCount(userStreams.length * 2100);

    // Show compose box only on own profile
    const composeBox = qs('#profileComposeBox');
    const composeAv = qs('#profileComposeAv');
    const isOwnProfile = !!(state.user && state.user.pubkey === pubkey);
    if (composeBox) composeBox.classList.toggle('hidden', !isOwnProfile);
    if (isOwnProfile && composeAv) {
      setAvatarEl(composeAv, p.picture || '', pickAvatar(pubkey));
    }

    const liveWrap = qs('#profileLiveWrap');
    const liveStatus = qs('#profLiveStatus');
    const live = getLatestLiveByPubkey(pubkey);
    state.selectedProfileLiveAddress = live ? live.address : null;
    const selectedProfileKey = normalizePubkeyHex(state.selectedProfilePubkey) || state.selectedProfilePubkey;
    const canRenderProfilePlayback = isProfilePageVisible() && selectedProfileKey === normalizedProfilePubkey;

    if (live && canRenderProfilePlayback) {
      if (liveWrap) liveWrap.style.display = 'block';
      if (liveStatus) liveStatus.textContent = 'LIVE';
      renderProfileLivePlayback(live);
    } else {
      if (liveWrap) liveWrap.style.display = 'none';
      if (liveStatus) liveStatus.textContent = 'offline';
      clearProfilePlayback();
    }

    const postsLeft = qs('#profilePostsLeft');
    const postsTabBtn = qs('#profileTabBtnPosts');
    if (live) {
      if (postsLeft) postsLeft.style.display = 'none';
      if (postsTabBtn) postsTabBtn.style.display = 'inline-flex';
    } else {
      if (postsLeft) postsLeft.style.display = 'block';
      if (postsTabBtn) postsTabBtn.style.display = 'none';
      if (state.profileTab === 'posts') state.profileTab = 'streams';
    }

    renderProfileFeed(pubkey);
    renderProfileCollections(pubkey);
    renderProfileFollowButton(pubkey);
    renderProfileBadges(pubkey);
    setProfileTab(state.profileTab || 'streams');
  }

  function openStreamFromProfile() {
    if (!state.selectedProfileLiveAddress) return;
    openStream(state.selectedProfileLiveAddress);
  }

  function showProfileByPubkey(pubkey, opts = {}) {
    const routeMode = opts.routeMode || 'push';
    if (!pubkey) return;
    state.selectedProfilePubkey = pubkey;
    const p = profileFor(pubkey);
    const verifiedNip05 = getVerifiedNip05ForPubkey(pubkey, p.nip05 || '');
    if (!verifiedNip05 && normalizeNip05Value(p.nip05 || '')) ensureNip05Verification(pubkey, p.nip05 || '').catch(() => {});
    window.showProfile(p.name, pickAvatar(pubkey), formatNpubForDisplay(pubkey), verifiedNip05, pubkey, { routeMode });
    renderProfilePage(pubkey);
    subscribeProfileFeed(pubkey);
    subscribeProfileStats(pubkey);
    subscribeProfileStatus(pubkey);
    subscribeBadges(pubkey);
  }

  async function toggleFollowPubkey(pubkeyInput, opts = {}) {
    const pubkey = normalizePubkeyHex(pubkeyInput);
    if (!pubkey) return null;
    if (!state.user) {
      window.openLogin();
      return null;
    }
    if (normalizePubkeyHex(state.user.pubkey) === pubkey) return null;
    if (state.followPublishPending) return null;
    state.followPublishPending = true;

    const silentErrors = !!opts.silentErrors;
    const skipProfileUi = !!opts.skipProfileUi;
    try {
      const wasFollowing = isFollowingPubkey(pubkey);
      const next = !wasFollowing;
      const current = state.profileStatsByPubkey.get(pubkey) || { followers: 0, following: 0 };
      const prevFollowers = Number(current.followers || 0);
      const nextFollowers = Math.max(0, prevFollowers + (next ? 1 : -1));

      state.profileStatsByPubkey.set(pubkey, {
        followers: nextFollowers,
        following: Number(current.following || 0)
      });

      setFollowingPubkey(pubkey, next);
      state.contactListPubkeys = new Set(state.followedPubkeys);
      updateOwnFollowingStat(next ? 1 : -1);
      if (!skipProfileUi || normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) {
        renderProfileFollowButton(pubkey);
      }
      updateTheaterFollowBtn(pubkey);
      renderLiveGrid();
      const followers = qs('#profFollowers');
      if (followers && normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) {
        followers.textContent = formatCount(nextFollowers);
      }

      try {
        await publishFollowedPubkeysToNostr();
        state.contactListPubkeys = new Set(state.followedPubkeys);
        renderFollowingCount();
        renderLiveGrid();
      } catch (err) {
        setFollowingPubkey(pubkey, wasFollowing);
        state.contactListPubkeys = new Set(state.followedPubkeys);
        updateOwnFollowingStat(next ? -1 : 1);
        state.profileStatsByPubkey.set(pubkey, {
          followers: prevFollowers,
          following: Number(current.following || 0)
        });
        if (!skipProfileUi || normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) {
          renderProfileFollowButton(pubkey);
        }
        updateTheaterFollowBtn(pubkey);
        renderLiveGrid();
        if (followers && normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) {
          followers.textContent = formatCount(prevFollowers);
        }
        if (!silentErrors) alert(err && err.message ? err.message : 'Failed to update follow list.');
        throw err;
      }
      return next;
    } finally {
      state.followPublishPending = false;
    }
  }

  async function toggleFollowSelectedProfile() {
    const pubkey = normalizePubkeyHex(state.selectedProfilePubkey);
    if (!pubkey) return;
    await toggleFollowPubkey(pubkey, { silentErrors: false, skipProfileUi: false });
  }

  function setAuthenticatedUser(pubkey, authMode) {
    const previousUser = normalizePubkeyHex(state.user && state.user.pubkey || '');
    const nextUser = normalizePubkeyHex(pubkey);
    cancelRemoteLoginAttempt({ silent: true });
    state.authMode = authMode;
    state.followPublishPending = false;
    state.streamLikePublishPending = false;
    state.goLiveSelectedAddress = '';
    state.goLiveTemplateAddress = '';
    state.goLiveForceNew = false;
    state.goLiveHostMode = 'self';
    state.goLiveRelaysOpen = false;
    state.goLiveThirdPartyProvider = '';
    if (state.goLivePreviewTimer) {
      clearTimeout(state.goLivePreviewTimer);
      state.goLivePreviewTimer = null;
    }
    if (state.goLivePreviewHls) {
      try { state.goLivePreviewHls.destroy(); } catch (_) {}
      state.goLivePreviewHls = null;
    }
    state.goLiveHiddenEndedAddresses = loadHiddenEndedStreamsForPubkey(pubkey);
    state.boostedStreamAddresses = new Set();
    state.streamBoostEventIdByAddress = new Map();
    state.streamBoostCheckedByAddress = new Set();
    state.streamBoostCheckPendingByAddress = new Set();
    state.streamReactionPublishPendingByKey = new Set();
    state.postReactionPublishPendingByNoteAndKey = new Set();
    state.postBoostPublishPendingByNoteId = new Set();
    state.user = { pubkey, profile: state.profilesByPubkey.get(pubkey) || null };
    ensureNip05Verification(pubkey, state.user.profile && state.user.profile.nip05 || '').catch(() => {});
    setUserUi();
    renderStreamReactionsUi();
    const selected = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
    if (selected) {
      updateTheaterShareBtn(selected);
      refreshOwnStreamBoostState(selected);
    }
    window.closeLogin();
    subscribeProfiles([pubkey]);

    if (previousUser && nextUser && previousUser !== nextUser) {
      clearDmState({ keepLastRead: false });
    }
    if (isMessagesPageVisible()) {
      renderMessagesPage({ subscribe: true });
    }
  }

  async function loginWithExtension() {
    if (!window.nostr || typeof window.nostr.getPublicKey !== 'function') {
      throw new Error('No NIP-07 signer found. You can still use nsec login.');
    }
    const pubkey = await window.nostr.getPublicKey();
    teardownRemoteSignerSession('Switched to extension login.');
    clearPersistedRemoteSignerSession();
    state.localSecretKey = null;
    localStorage.removeItem(LOCAL_NSEC_STORAGE_KEY);
    setAuthenticatedUser(pubkey, 'nip07');
  }

  async function loginWithNsec(nsecOrHex, persist = true) {
    const tools = await ensureNostrTools();
    if (!tools || typeof tools.getPublicKey !== 'function') {
      throw new Error('Could not load local key tools.');
    }

    const input = (nsecOrHex || '').trim();
    if (!input) {
      throw new Error('Enter your nsec key first.');
    }

    let secret;
    if (/^[0-9a-f]{64}$/i.test(input)) {
      secret = hexToBytes(input);
    } else {
      if (!tools.nip19 || typeof tools.nip19.decode !== 'function') {
        throw new Error('Could not load NIP-19 key decoder.');
      }

      let decoded;
      try {
        decoded = tools.nip19.decode(input);
      } catch (_) {
        throw new Error('Invalid nsec key.');
      }

      if (!decoded || decoded.type !== 'nsec') {
        throw new Error('Invalid nsec key.');
      }
      secret = normalizeSecretKey(decoded.data);
    }

    const pubkey = tools.getPublicKey(secret);
    teardownRemoteSignerSession('Switched to local key login.');
    clearPersistedRemoteSignerSession();
    state.localSecretKey = secret;
    if (persist) localStorage.setItem(LOCAL_NSEC_STORAGE_KEY, input);
    setAuthenticatedUser(pubkey, 'local');
  }

  async function publishUserProfile(profileData) {
    if (!state.user) return;

    const payload = {
      name: profileData.name || shortHex(state.user.pubkey),
      display_name: profileData.display_name || profileData.name || shortHex(state.user.pubkey),
      about: profileData.about || '',
      picture: profileData.picture || '',
      banner: profileData.banner || '',
      website: profileData.website || '',
      lud16: profileData.lud16 || '',
      nip05: profileData.nip05 || ''
    };

    await signAndPublish(KIND_PROFILE, JSON.stringify(payload), []);

    const merged = {
      ...profileFor(state.user.pubkey),
      pubkey: state.user.pubkey,
      name: payload.name,
      display_name: payload.display_name,
      about: payload.about,
      picture: payload.picture,
      banner: payload.banner,
      website: payload.website,
      lud16: payload.lud16,
      nip05: payload.nip05
    };

    state.profilesByPubkey.set(state.user.pubkey, merged);
    state.user.profile = merged;
    setUserUi();

    if (state.selectedProfilePubkey === state.user.pubkey) {
      renderProfilePage(state.user.pubkey);
      syncProfileRoute(state.user.pubkey, 'replace');
    }
  }

  function openOnboarding(prefill = {}) {
    const modal = qs('#onboardingModal');
    if (!modal) return;

    // Populate nsec
    const nsecEl = qs('#onbNsecValue');
    if (nsecEl) {
      nsecEl.textContent = state.pendingOnboardingNsec || 'nsec1...';
      nsecEl.classList.remove('revealed');
    }

    // Reset reveal/copy buttons
    const revealBtn = qs('#onbRevealBtn');
    if (revealBtn) revealBtn.textContent = '\uD83D\uDC41 Reveal';
    const copyBtn = qs('#onbCopyBtn');
    if (copyBtn) { copyBtn.textContent = '\uD83D\uDCCB Copy'; copyBtn.classList.remove('copied'); }

    // Reset checkbox + continue button
    const check = qs('#onbSavedCheck');
    if (check) check.checked = false;
    const cont = qs('#onbContinueBtn');
    if (cont) cont.classList.remove('ready');

    // Pre-fill profile fields
    const set = (id, val) => { const el = qs(id); if (el) el.value = val || ''; };
    set('#onbDisplayName', prefill.name);
    set('#onbAvatar', prefill.picture);
    set('#onbBanner', prefill.banner || state.settings.banner);
    set('#onbBio', prefill.about);
    set('#onbWebsite', prefill.website || state.settings.website);
    set('#onbLud16', prefill.lud16 || state.settings.lud16);
    set('#onbNip05', prefill.nip05);

    // Reset to step 1
    onbSetStep(1);

    // Update avatar preview
    onbUpdatePreview();

    modal.classList.add('open');
    // Also close login modal if open
    const loginModal = qs('#loginModal');
    if (loginModal) loginModal.classList.remove('open');
  }

  function onbSetStep(n) {
    const s1 = qs('#onbStep1'), s2 = qs('#onbStep2');
    const d1 = qs('#onbDot1'), d2 = qs('#onbDot2');
    const line = qs('#onbStepLine');
    if (n === 1) {
      if (s1) s1.classList.add('active');
      if (s2) s2.classList.remove('active');
      if (d1) { d1.classList.add('active'); d1.classList.remove('done'); }
      if (d2) { d2.classList.remove('active', 'done'); }
      if (line) line.classList.remove('done');
    } else {
      if (s1) s1.classList.remove('active');
      if (s2) s2.classList.add('active');
      if (d1) { d1.classList.remove('active'); d1.classList.add('done'); }
      if (d2) { d2.classList.add('active'); d2.classList.remove('done'); }
      if (line) line.classList.add('done');
    }
  }

  function closeOnboarding() {
    const modal = qs('#onboardingModal');
    if (modal) modal.classList.remove('open');
  }

  // Called from HTML: reveal the blurred nsec
  function onbRevealNsec() {
    const el = qs('#onbNsecValue');
    const btn = qs('#onbRevealBtn');
    if (!el) return;
    const revealed = el.classList.toggle('revealed');
    if (btn) btn.textContent = revealed ? '\uD83D\uDE48 Hide' : '\uD83D\uDC41 Reveal';
  }

  // Called from HTML: copy nsec to clipboard
  async function onbCopyNsec() {
    const value = state.pendingOnboardingNsec || (qs('#onbNsecValue') && qs('#onbNsecValue').textContent) || '';
    if (!value || value === 'nsec1...') return;
    try {
      await navigator.clipboard.writeText(value);
      const btn = qs('#onbCopyBtn');
      if (btn) {
        btn.textContent = '\u2713 Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '\uD83D\uDCCB Copy'; btn.classList.remove('copied'); }, 2000);
      }
      // Also reveal so user can verify what was copied
      const el = qs('#onbNsecValue');
      if (el) { el.classList.add('revealed'); }
      const revBtn = qs('#onbRevealBtn');
      if (revBtn) revBtn.textContent = '\uD83D\uDE48 Hide';
    } catch (_) {
      alert('Clipboard blocked. Please manually select and copy the key.');
    }
  }

  // Kept for backward compatibility (old HTML may call this)
  async function copyOnboardingNsec() { return onbCopyNsec(); }

  // Called when checkbox changes
  function onbCheckSaved() {
    const check = qs('#onbSavedCheck');
    const btn = qs('#onbContinueBtn');
    if (!btn) return;
    if (check && check.checked) {
      btn.classList.add('ready');
    } else {
      btn.classList.remove('ready');
    }
  }

  // Advance to profile step
  function onbGoToProfile() {
    const check = qs('#onbSavedCheck');
    if (!check || !check.checked) return;
    onbSetStep(2);
    onbUpdatePreview();
  }

  // Go back to key step
  function onbBackToKey() {
    onbSetStep(1);
  }

  // Live avatar preview update
  function onbUpdatePreview() {
    const circle = qs('#onbAvatarPreview');
    if (!circle) return;
    const url = (qs('#onbAvatar') && qs('#onbAvatar').value.trim()) || '';
    const name = (qs('#onbDisplayName') && qs('#onbDisplayName').value.trim()) || '';
    if (url) {
      circle.innerHTML = `<img src="${url}" alt="" onerror="this.parentElement.innerHTML='${name ? name[0].toUpperCase() : '?'}'">`;
    } else {
      circle.innerHTML = name ? name[0].toUpperCase() : '?';
    }
    if (url) circle.style.borderColor = 'var(--green)';
    else circle.style.borderColor = '';
  }

  async function completeOnboarding() {
    const saveBtn = qs('#onbSaveBtn');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

    const profileData = {
      name: (qs('#onbDisplayName') && qs('#onbDisplayName').value.trim()) || shortHex(state.user ? state.user.pubkey : ''),
      picture: (qs('#onbAvatar') && qs('#onbAvatar').value.trim()) || '',
      banner: (qs('#onbBanner') && qs('#onbBanner').value.trim()) || '',
      about: (qs('#onbBio') && qs('#onbBio').value.trim()) || '',
      website: (qs('#onbWebsite') && qs('#onbWebsite').value.trim()) || '',
      lud16: (qs('#onbLud16') && qs('#onbLud16').value.trim()) || '',
      nip05: (qs('#onbNip05') && qs('#onbNip05').value.trim()) || ''
    };

    try {
      await publishUserProfile(profileData);
      const nextSettings = {
        ...state.settings,
        website: profileData.website || state.settings.website,
        banner: profileData.banner || state.settings.banner,
        lud16: profileData.lud16 || state.settings.lud16
      };
      applySettings(nextSettings, { reconnect: false });
      closeOnboarding();
    } catch (err) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '\u2713 Save & Enter Sifaka Live'; }
      alert(err.message || 'Failed to publish profile. Please try again.');
    }
  }

  function skipOnboarding() {
    closeOnboarding();
  }

  async function createLocalIdentity() {
    const saved = (localStorage.getItem(LOCAL_NSEC_STORAGE_KEY) || '').trim();
    if (saved) {
      try {
        await loginWithNsec(saved, false);
        state.pendingOnboardingNsec = saved;
        const current = state.user ? profileFor(state.user.pubkey) : null;
        if (state.user) {
          openOnboarding({
            name: (current && current.name) || '',
            picture: (current && current.picture) || pickAvatar(state.user.pubkey),
            banner: (current && current.banner) || state.settings.banner || '',
            about: (current && current.about) || '',
            website: (current && current.website) || state.settings.website || '',
            lud16: (current && current.lud16) || state.settings.lud16 || ''
          });
          return;
        }
      } catch (err) {
        const msg = (err && err.message ? err.message : '').toLowerCase();
        if (msg.includes('invalid')) {
          localStorage.removeItem(LOCAL_NSEC_STORAGE_KEY);
        } else {
          throw err;
        }
      }
    }

    const tools = await ensureNostrTools();
    const secret = typeof tools.generateSecretKey === 'function'
      ? tools.generateSecretKey()
      : crypto.getRandomValues(new Uint8Array(32));

    const nsec = tools.nip19 && typeof tools.nip19.nsecEncode === 'function'
      ? tools.nip19.nsecEncode(secret)
      : bytesToHex(secret);

    const pubkey = tools.getPublicKey(secret);
    teardownRemoteSignerSession('Switched to local key login.');
    clearPersistedRemoteSignerSession();
    state.localSecretKey = normalizeSecretKey(secret);
    state.pendingOnboardingNsec = nsec;
    localStorage.setItem(LOCAL_NSEC_STORAGE_KEY, nsec);
    setAuthenticatedUser(pubkey, 'local');

    openOnboarding({
      name: '',
      picture: pickAvatar(pubkey),
      banner: state.settings.banner || '',
      website: state.settings.website || '',
      lud16: state.settings.lud16 || ''
    });
  }

  async function tryRestoreLocalLogin() {
    const saved = (localStorage.getItem(LOCAL_NSEC_STORAGE_KEY) || '').trim();
    if (!saved) return false;

    try {
      await loginWithNsec(saved, false);
      return true;
    } catch (err) {
      const msg = (err && err.message ? err.message : '').toLowerCase();
      const permanent = msg.includes('invalid') || msg.includes('unsupported') || msg.includes('missing');
      if (permanent) localStorage.removeItem(LOCAL_NSEC_STORAGE_KEY);
      return false;
    }
  }

  async function publishCurrentStream(statusOverride) {
    if (!state.user) {
      window.openLogin();
      throw new Error('Please login first. You can use extension, remote signer, or nsec mode.');
    }

    const dTagInput = qs('#goLiveDTag');
    const titleInput = qs('#goLiveTitle');
    const summaryInput = qs('#goLiveSummary');
    const streamUrlInput = qs('#goLiveStreamUrl');
    const thumbInput = qs('#goLiveThumb');
    const startsInput = qs('#goLiveStarts');
    const statusEl = qs('#goLiveModal .srow .sc.sl') || qs('.srow .sc.sl');

    const preferredAddress = statusOverride
      ? state.selectedStreamAddress
      : (state.goLiveForceNew ? '' : (state.goLiveSelectedAddress || state.selectedStreamAddress));
    const currentEditAddress = (preferredAddress || '').trim();
    const current = currentEditAddress ? state.streamsByAddress.get(currentEditAddress) : null;
    const useCurrentFields = !!(statusOverride && current);

    const dTagVal = dTagInput ? dTagInput.value.trim() : '';
    const titleVal = titleInput ? titleInput.value.trim() : '';
    const summaryVal = summaryInput ? summaryInput.value.trim() : '';
    const streamUrlVal = streamUrlInput ? streamUrlInput.value.trim() : '';
    const thumbVal = thumbInput ? thumbInput.value.trim() : '';
    const startsRaw = startsInput ? startsInput.value : '';
    const startsParsed = toUnixSeconds(startsRaw);

    const dTag = useCurrentFields
      ? ((current && current.d) || `stream-${Date.now()}`)
      : (dTagVal || (current ? current.d : '') || `stream-${Date.now()}`);
    const title = useCurrentFields
      ? ((current && current.title) || 'Untitled stream')
      : (titleVal || (current ? current.title : '') || 'Untitled stream');
    const summary = useCurrentFields
      ? ((current && current.summary) || '')
      : (summaryInput ? summaryVal : ((current && current.summary) || ''));
    const streamUrl = useCurrentFields
      ? ((current && current.streaming) || '')
      : (streamUrlInput ? streamUrlVal : ((current && current.streaming) || ''));
    const thumb = useCurrentFields
      ? ((current && current.image) || '')
      : (thumbInput ? thumbVal : ((current && current.image) || ''));
    const starts = useCurrentFields
      ? ((current && current.starts) || null)
      : (startsInput ? (startsRaw ? startsParsed : null) : ((current && current.starts) || null));
    const rawStatus = statusOverride || (statusEl ? statusEl.textContent : ((current && current.status) || 'live'));
    const status = normalizeStreamStatus(rawStatus);

    const tags = [
      ['d', dTag],
      ['title', title],
      ['summary', summary],
      ['status', status],
      ['alt', `Live stream: ${title}`]
    ];

    if (streamUrl) tags.push(['streaming', streamUrl]);
    if (thumb) tags.push(['image', thumb]);
    if (starts) tags.push(['starts', `${starts}`]);
    state.relays.forEach((r) => tags.push(['relay', r]));

    const ev = await signAndPublish(KIND_LIVE_EVENT, summary, tags);
    const stream = parseLiveEvent(ev);
    upsertStream(stream);
    state.selectedStreamAddress = stream.address;
    if (status === 'ended') {
      state.goLiveHiddenEndedAddresses.add(stream.address);
      if (state.goLiveSelectedAddress === stream.address) state.goLiveSelectedAddress = '';
    } else {
      state.goLiveHiddenEndedAddresses.delete(stream.address);
      state.goLiveSelectedAddress = stream.address;
    }
    persistHiddenEndedStreamsForCurrentUser();
    state.isLive = status === 'live';
    updateGoLiveModalState();
    updateGoLiveButtonState();
    renderLiveGrid();
    // Refresh hero if this is the currently featured stream
    const featStreams = heroFeaturedStreams();
    if (featStreams.length) renderHero(featStreams[state.featuredIndex], state.featuredIndex, featStreams.length);
    if (isVideoPageVisible()) renderVideo(stream);
    subscribeChat(stream);
    return stream;
  }

  function prefixLinesForMarkup(rawText, prefixBuilder) {
    const lines = String(rawText || '').split('\n');
    return lines.map((line, index) => {
      if (!line.trim()) return line;
      return prefixBuilder(line, index);
    }).join('\n');
  }

  function applyNostrMarkupToTextarea(textarea, action) {
    if (!textarea || !('value' in textarea)) return;
    const current = String(textarea.value || '');
    const start = Number(textarea.selectionStart || 0);
    const end = Number(textarea.selectionEnd || 0);
    const selected = current.slice(start, end);
    const before = current.slice(0, start);
    const after = current.slice(end);
    const hasSelection = start !== end;
    const marker = {
      bold: '**',
      italic: '*',
      strike: '~~',
      code: '`'
    };

    let replacement = selected;
    let nextSelectionStart = 0;
    let nextSelectionEnd = 0;

    if (action === 'h1') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'Heading 1', (line) => `# ${line.replace(/^\s*#{1,3}\s+/, '')}`);
    } else if (action === 'h2') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'Heading 2', (line) => `## ${line.replace(/^\s*#{1,3}\s+/, '')}`);
    } else if (action === 'h3') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'Heading 3', (line) => `### ${line.replace(/^\s*#{1,3}\s+/, '')}`);
    } else if (action === 'ul') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'Item one', (line) => line.trim().startsWith('- ') ? line : `- ${line}`);
    } else if (action === 'ol') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'First', (line, idx) => line.match(/^\s*\d+\.\s+/) ? line : `${idx + 1}. ${line}`);
    } else if (action === 'quote') {
      replacement = prefixLinesForMarkup(hasSelection ? selected : 'This is a blockquote.', (line) => line.trim().startsWith('> ') ? line : `> ${line}`);
    } else if (marker[action]) {
      const token = marker[action];
      const base = hasSelection ? selected : (action === 'code' ? 'inline code' : 'text');
      replacement = `${token}${base}${token}`;
      if (!hasSelection) {
        nextSelectionStart = token.length;
        nextSelectionEnd = token.length + base.length;
      }
    } else {
      return;
    }

    textarea.value = `${before}${replacement}${after}`;
    const anchor = before.length;
    if (!hasSelection && (nextSelectionEnd > nextSelectionStart)) {
      textarea.setSelectionRange(anchor + nextSelectionStart, anchor + nextSelectionEnd);
    } else {
      const caret = anchor + replacement.length;
      textarea.setSelectionRange(caret, caret);
    }
    textarea.focus();

    if (textarea.id === 'profileComposeText' && typeof window.profileComposeInput === 'function') {
      window.profileComposeInput(textarea);
    }
  }

  async function sendChatMessage() {
    const input = qs('.chat-inp');
    const text = (input && input.value.trim()) || '';
    if (!text) return;
    if (!state.user) {
      window.openLogin();
      return;
    }
    const stream = state.streamsByAddress.get(state.selectedStreamAddress);
    if (!stream) return;

    const tags = [
      ['a', stream.address],
      ['e', stream.id],
      ['p', stream.pubkey]
    ];

    try {
      await signAndPublish(KIND_LIVE_CHAT, text, tags);
      input.value = '';
    } catch (err) {
      alert(err.message || 'Failed to send chat message.');
    }
  }

  async function sendReaction() {
    const stream = state.streamsByAddress.get(state.selectedStreamAddress);
    if (!stream) return;
    if (!state.user) { window.openLogin(); return; }
    if (state.streamLikePublishPending) return;
    state.streamLikePublishPending = true;
    const ownPubkey = normalizePubkeyHex(state.user.pubkey);
    if (!ownPubkey) { state.streamLikePublishPending = false; return; }
    const alreadyLiked = state.likedStreamAddresses.has(stream.address);
    const likeMeta = { key: '+', label: '\u2764\uFE0F', imageUrl: '', shortcode: '' };

    try {
      if (alreadyLiked) {
        removeOwnStreamReactionByKey('+');
        renderStreamReactionsUi(stream);

        let reactionId = state.streamLikeEventIdByAddress.get(stream.address) || '';
        if (!reactionId) {
          reactionId = await findOwnStreamLikeReactionId(stream);
          if (reactionId) state.streamLikeEventIdByAddress.set(stream.address, reactionId);
        }

        if (reactionId) {
          await signAndPublish(KIND_DELETION, 'unliked stream', [['e', reactionId], ['k', String(KIND_REACTION)], ['a', stream.address]]);
          removeStreamReactionById(reactionId);
          state.streamLikeEventIdByAddress.delete(stream.address);
        } else {
          // Fallback for relays that cannot return our prior reaction quickly.
          await signAndPublish(KIND_REACTION, '-', [['e', stream.id], ['p', stream.pubkey], ['a', stream.address]]);
        }
      } else {
        applyStreamReaction(likeMeta, ownPubkey, '');
        renderStreamReactionsUi(stream);
        const likeEv = await signAndPublish(KIND_REACTION, '+', [['e', stream.id], ['p', stream.pubkey], ['a', stream.address]]);
        if (likeEv && likeEv.id) {
          state.streamLikeEventIdByAddress.set(stream.address, likeEv.id);
          applyStreamReaction(likeMeta, ownPubkey, likeEv.id);
        }
      }
      renderStreamReactionsUi(stream);
    } catch (err) {
      if (alreadyLiked) {
        applyStreamReaction(likeMeta, ownPubkey, state.streamLikeEventIdByAddress.get(stream.address) || '');
      } else {
        removeOwnStreamReactionByKey('+');
      }
      renderStreamReactionsUi(stream);
      alert(err.message || 'Failed to react.');
    } finally {
      state.streamLikePublishPending = false;
    }
  }

  function wireEvents() {
    const searchInput = qs('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderSearch((e.target.value || '').trim().toLowerCase());
      });
      searchInput.addEventListener('focus', (e) => {
        if ((e.target.value || '').trim()) renderSearch((e.target.value || '').trim().toLowerCase());
      });
    }

    const sendBtn = qs('.chat-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendChatMessage);
    const chatInput = qs('.chat-inp');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
    }

    qsa('.srow .sc').forEach((c) => {
      c.addEventListener('click', () => {
        const row = c.closest('.srow');
        qsa('.sc', row).forEach((x) => x.classList.remove('sl'));
        c.classList.add('sl');
        if (row && row.id === 'goLiveStatusRow') updateGoLiveStartsVisibility();
      });
    });

    const goLiveStreamUrl = qs('#goLiveStreamUrl');
    if (goLiveStreamUrl) {
      goLiveStreamUrl.addEventListener('input', () => {
        if (state.goLiveHostMode !== 'self') return;
        scheduleGoLiveStreamPreview(280);
      });
    }

    const goLiveThumb = qs('#goLiveThumb');
    if (goLiveThumb) {
      goLiveThumb.addEventListener('input', () => {
        updateGoLiveThumbPreview();
      });
    }

    const nsecLoginInput = qs('#nsecLoginInput');
    if (nsecLoginInput) {
      nsecLoginInput.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        window.loginDemo('keyuser');
      });
    }

  }

  function bindLegacyGlobals() {
    window.toggleDD = function (key) {
      const other = key === 'logo' ? 'profile' : 'logo';
      window.closeDD(other);
      const btnId = key === 'logo' ? 'logoBtn' : 'navUserPill';
      const ddId = key === 'logo' ? 'logoDropdown' : 'profileDropdown';
      const dd = qs(`#${ddId}`);
      const btn = qs(`#${btnId}`);
      const open = dd.classList.contains('open');
      dd.classList.toggle('open', !open);
      btn.classList.toggle('dd-open', !open);
    };

    window.closeDD = function (key) {
      const btnId = key === 'logo' ? 'logoBtn' : 'navUserPill';
      const ddId = key === 'logo' ? 'logoDropdown' : 'profileDropdown';
      const dd = qs(`#${ddId}`);
      const btn = qs(`#${btnId}`);
      if (dd) dd.classList.remove('open');
      if (btn) btn.classList.remove('dd-open');
    };

    window.closeAllDD = function () {
      window.closeDD('logo');
      window.closeDD('profile');
    };

    window.applyNostrMarkup = function (targetId, action) {
      const id = String(targetId || '').trim();
      if (!id || !action) return;
      const textarea = qs(`#${id}`);
      if (!textarea) return;
      applyNostrMarkupToTextarea(textarea, String(action || '').trim().toLowerCase());
    };

    // Communities integration context:
    // exposes dynamic getters so the Communities module can reuse current app auth/relay state.
    window.__SIFAKA_CONTEXT = {
      getUser: () => (state.user ? { ...state.user } : null),
      getRelays: () => [...state.relays],
      getSettings: () => ({ ...state.settings }),
      openLogin: () => window.openLogin(),
      showProfileByPubkey: (pubkey) => showProfileByPubkey(pubkey),
      getProfileByPubkey: (pubkeyInput) => {
        const raw = String(pubkeyInput || '').trim();
        const decoded = normalizePubkeyHex(raw) || normalizePubkeyHex(parseNpubMaybe(raw));
        if (!decoded) return null;
        const profile = profileFor(decoded);
        const claimedNip05 = normalizeNip05Value(profile.nip05 || '');
        const verifiedNip05 = getVerifiedNip05ForPubkey(decoded, claimedNip05);
        return {
          pubkey: decoded,
          name: String(profile.display_name || profile.name || '').trim(),
          displayName: String(profile.display_name || profile.name || '').trim(),
          avatar: String(profile.picture || '').trim(),
          nip05: claimedNip05,
          verifiedNip05: !!verifiedNip05,
          verifiedNip05Value: verifiedNip05 || '',
          bio: String(profile.about || '').trim()
        };
      },
      getVerifiedNip05ForPubkey: (pubkeyInput, nip05Input = '') => {
        const raw = String(pubkeyInput || '').trim();
        const decoded = normalizePubkeyHex(raw) || normalizePubkeyHex(parseNpubMaybe(raw));
        if (!decoded) return '';
        const fallbackNip05 = normalizeNip05Value(nip05Input || '');
        const profile = profileFor(decoded);
        return getVerifiedNip05ForPubkey(decoded, fallbackNip05 || profile.nip05 || '');
      },
      ensureNip05ForPubkey: (pubkeyInput, nip05Input = '') => {
        const raw = String(pubkeyInput || '').trim();
        const decoded = normalizePubkeyHex(raw) || normalizePubkeyHex(parseNpubMaybe(raw));
        if (!decoded) return Promise.resolve(false);
        const fallbackNip05 = normalizeNip05Value(nip05Input || '');
        const profile = profileFor(decoded);
        const candidate = fallbackNip05 || normalizeNip05Value(profile.nip05 || '');
        if (!candidate) return Promise.resolve(false);
        return ensureNip05Verification(decoded, candidate);
      },
      getUploadAccept: () => BLOSSOM_MEDIA_ACCEPT,
      uploadMediaFile: (file, opts = {}) => uploadFileToBlossom(file, opts)
    };

    window.showCommunities = function () {
      window.showPage('communities');
    };

    window.showMessages = function () {
      window.showPage('messages');
    };

    window.showNotifications = function () {
      window.showPage('notifications');
    };

    window.openNotificationsPage = function () {
      window.closeAllDD();
      window.showPage('notifications');
    };

    window.setVideosFilter = function (filterId) {
      setVideosFilterInternal(filterId, { render: true });
    };

    window.openVideoPostModal = function (streamAddressOrObject) {
      let stream = null;
      if (streamAddressOrObject && typeof streamAddressOrObject === 'object') {
        stream = streamAddressOrObject;
      } else {
        const key = String(streamAddressOrObject || '').trim();
        stream = key ? (state.nip71VideosByEventId.get(key) || state.streamsByAddress.get(key) || null) : null;
      }
      if (!stream) return;
      openVideoPostModal(stream);
    };

    window.closeVideoPostModal = function () {
      const ov = qs('#videoPostModal');
      if (!ov) return;
      ov.classList.remove('open');
      state.videoPostModalToken += 1;
      state.videoPostModalEventId = '';
      state.videoPostModalHostPubkey = '';
      state.videoPostModalStream = null;
      state.videoPostModalIsWatchParty = false;
      stopVideoPostCommentsSubscription();
      stopVideoPostLiveChatSubscription();
      cleanupVideoPostModalPlayer();
      refreshVideoPostCommentComposerState();
    };

    window.refreshNotifications = function (force = false) {
      loadNotifications({ force: !!force, silent: false, minIntervalMs: 0 }).catch(() => {});
    };

    window.markNotificationsRead = function () {
      markNotificationsReadInternal({ silent: false });
    };

    window.openMessagesWithPeer = function (peerToken) {
      openMessagesWithPeer(peerToken, { routeMode: 'push' }).catch(() => {});
    };

    /* ---- Master audio/playback stop ----
       Call with which player to KEEP playing ('hero' | 'theater' | 'profile' | null).
       All other active players are paused and their HLS instances destroyed.       */
    function stopAllAudio(keep) {
      // --- Hero ---
      if (keep !== 'hero') {
        // Pause any <video> inside the hero player
        const heroPlayer = qs('#heroPlayer');
        if (heroPlayer) {
          heroPlayer.querySelectorAll('video').forEach((v) => {
            try { v.pause(); v.src = ''; } catch (_) {}
          });
        }
        // Destroy HLS instance
        if (state.heroHlsInstance) {
          try { state.heroHlsInstance.destroy(); } catch (_) {}
          state.heroHlsInstance = null;
        }
        state.heroPlaybackToken++;
      }

      // --- Theater (video page) ---
      if (keep !== 'theater') {
        const playerBg = qs('.player-bg');
        if (playerBg) {
          playerBg.querySelectorAll('video').forEach((v) => {
            try { v.pause(); v.src = ''; } catch (_) {}
          });
        }
        if (state.hlsInstance) {
          try { state.hlsInstance.destroy(); } catch (_) {}
          state.hlsInstance = null;
        }
        state.playbackToken++;
        state.playbackAddress = '';
        state.playbackUrl = '';
        // Stop runtime ticker
        clearInterval(state._theaterRuntimeInterval);
        state._theaterRuntimeInterval = null;
      }

      // --- Profile mini-player ---
      if (keep !== 'profile') {
        clearProfilePlayback();
      }
    }

    window.showPage = function (p, opts = {}) {
      const routeMode = opts.routeMode || 'push';
      const home = qs('#homePage');
      const video = qs('#videoPage');
      const profile = qs('#profilePage');
      const videos = qs('#videosPage');
      const feed = qs('#feedPage');
      const notifications = qs('#notificationsPage');
      const communities = qs('#communitiesPage');
      const messages = qs('#messagesPage');
      const myStreams = qs('#myStreamsPage');
      const faq = qs('#faqPage');
      if (p !== 'video') setActiveViewerAddress('');
      if (p === 'home' && routeMode !== 'skip') syncHomeRoute(routeMode);
      if (p === 'videos' && routeMode !== 'skip') syncVideosRoute(routeMode);
      if (p === 'videos' && Object.prototype.hasOwnProperty.call(opts, 'videosFilter')) {
        setVideosFilterInternal(opts.videosFilter, { render: false });
      }
      if (p !== 'videos' && typeof window.closeVideoPostModal === 'function') {
        window.closeVideoPostModal();
      }
      if (p === 'feed' && routeMode !== 'skip') syncFeedRoute(routeMode);
      if (p === 'notifications' && routeMode !== 'skip') syncNotificationsRoute(routeMode);
      if (p === 'faq' && routeMode !== 'skip') syncFaqRoute(routeMode);
      if (p === 'messages' && routeMode !== 'skip') syncMessagesRoute(routeMode);
      if (p === 'myStreams' && routeMode !== 'skip') syncMyStreamsRoute(routeMode);
      if (home) home.classList.toggle('active', p === 'home');
      if (video) video.style.display = 'none';
      if (profile) profile.style.display = 'none';
      if (videos) videos.style.display = p === 'videos' ? 'block' : 'none';
      if (feed) feed.style.display = p === 'feed' ? 'block' : 'none';
      if (notifications) notifications.style.display = p === 'notifications' ? 'block' : 'none';
      if (communities) communities.style.display = p === 'communities' ? 'block' : 'none';
      if (messages) messages.style.display = p === 'messages' ? 'block' : 'none';
      if (myStreams) myStreams.style.display = p === 'myStreams' ? 'block' : 'none';
      if (faq) faq.style.display = p === 'faq' ? 'block' : 'none';
      // Communities/home router behavior:
      // - home keeps hero playback and cycling
      // - all other top-level pages fully stop hero playback
      if (p === 'home') {
        ensureHomeLiveSubscription();
        stopAllAudio('hero');
        stopHeroCycle(); // clear any stale timer first
        const streams = heroFeaturedStreams();
        if (streams.length) startHeroCycle();
        renderLiveGrid();
      } else if (p === 'videos') {
        ensureHomeLiveSubscription();
        stopHeroCycle();
        stopAllAudio(null);
        scheduleVideosPageRender(0);
      } else {
        stopLiveSubscription();
        stopHeroCycle();
        stopAllAudio(null);
      }
      if (p === 'feed') {
        subscribeNostrFeed();
      } else {
        stopNostrFeedSubscription();
      }
      if (p === 'notifications') {
        markNotificationsReadInternal({ silent: true });
        loadNotifications({ force: false, silent: false, minIntervalMs: 0 }).catch(() => {});
      }
      if (p === 'communities' && window.SifakaCommunities && typeof window.SifakaCommunities.mount === 'function') {
        // Communities view is mounted lazily so existing Sifaka Live startup stays fast.
        window.SifakaCommunities.mount();
      }
      if (p === 'messages') {
        renderMessagesPage({ subscribe: true });
      } else {
        teardownDmSubscription();
      }
      if (p === 'myStreams') {
        updateGoLiveModalState();
      } else {
        setMyStreamsStatus('');
      }
      if (state.settings.miniPlayer && state.selectedStreamAddress) window.showMini();
      else window.hideMini();
      window.scrollTo(0, 0);
    };

    window.showVideoPage = function (opts = {}) {
      const routeMode = opts.routeMode || 'replace';
      if (typeof window.closeVideoPostModal === 'function') window.closeVideoPostModal();
      const home = qs('#homePage');
      const video = qs('#videoPage');
      const profile = qs('#profilePage');
      const videos = qs('#videosPage');
      const feed = qs('#feedPage');
      const notifications = qs('#notificationsPage');
      const communities = qs('#communitiesPage');
      const messages = qs('#messagesPage');
      const myStreams = qs('#myStreamsPage');
      const faq = qs('#faqPage');
      const selected = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
      setActiveViewerAddress(selected ? selected.address : '');
      if (selected && routeMode !== 'skip') syncTheaterRoute(selected, routeMode);
      if (home) home.classList.remove('active');
      if (video) video.style.display = 'block';
      if (profile) profile.style.display = 'none';
      if (videos) videos.style.display = 'none';
      if (feed) feed.style.display = 'none';
      if (notifications) notifications.style.display = 'none';
      if (communities) communities.style.display = 'none';
      if (messages) messages.style.display = 'none';
      if (myStreams) myStreams.style.display = 'none';
      if (faq) faq.style.display = 'none';
      teardownDmSubscription();
      stopLiveSubscription();
      stopNostrFeedSubscription();
      // Kill the hero cycle timer completely ? prevents it firing and starting audio behind theater
      stopHeroCycle();
      stopAllAudio('theater');
      if (window.renderRecoStreams) window.renderRecoStreams(); // populate "Also Live Now"
      if (state.settings.miniPlayer && state.selectedStreamAddress) window.showMini();
      else window.hideMini();
      window.scrollTo(0, 0);
    };

    window.showProfile = function (name, av, npub, nip05, rawPubkey, opts = {}) {
      const routeMode = opts.routeMode || 'push';
      if (typeof window.closeVideoPostModal === 'function') window.closeVideoPostModal();
      const home = qs('#homePage');
      const video = qs('#videoPage');
      const profile = qs('#profilePage');
      const videos = qs('#videosPage');
      const feed = qs('#feedPage');
      const notifications = qs('#notificationsPage');
      const communities = qs('#communitiesPage');
      const messages = qs('#messagesPage');
      const myStreams = qs('#myStreamsPage');
      const faq = qs('#faqPage');
      setActiveViewerAddress('');
      if (home) home.classList.remove('active');
      if (video) video.style.display = 'none';
      if (profile) profile.style.display = 'block';
      if (videos) videos.style.display = 'none';
      if (feed) feed.style.display = 'none';
      if (notifications) notifications.style.display = 'none';
      if (communities) communities.style.display = 'none';
      if (messages) messages.style.display = 'none';
      if (myStreams) myStreams.style.display = 'none';
      if (faq) faq.style.display = 'none';
      teardownDmSubscription();
      stopLiveSubscription();
      stopNostrFeedSubscription();
      // Kill the hero cycle timer completely ? prevents audio starting behind profile
      stopHeroCycle();
      stopAllAudio('profile');

      setAvatarEl(qs('#profAv'), '', av || 'U');
      if (qs('#profName')) qs('#profName').textContent = name || 'user';
      if (qs('#profNpub')) qs('#profNpub').textContent = formatNpubForDisplay(npub || rawPubkey || '');
      const normalizedRawPubkey = normalizePubkeyHex(rawPubkey || '') || parseNpubMaybe(npub || '');
      const claimedNip05 = normalizeNip05Value(nip05 || '');
      const verifiedNip05 = normalizedRawPubkey ? getVerifiedNip05ForPubkey(normalizedRawPubkey, claimedNip05) : '';
      if (claimedNip05 && normalizedRawPubkey && !verifiedNip05) ensureNip05Verification(normalizedRawPubkey, claimedNip05).catch(() => {});
      setProfileVerificationStyle(verifiedNip05 ? 'verified' : 'none');

      const n05 = qs('#profNip05');
      const n05c = qs('#profNip05Check');
      if (verifiedNip05) {
        if (n05) {
          n05.style.display = 'flex';
          n05.textContent = `NIP-05: ${verifiedNip05}`;
        }
        if (n05c) {
          n05c.style.display = 'inline';
          n05c.textContent = '\u2713';
          n05c.title = 'NIP-05 verified';
        }
      } else {
        if (n05) n05.style.display = 'none';
        if (n05c) n05c.style.display = 'none';
      }
      if (qs('#profNpub')) qs('#profNpub').style.display = verifiedNip05 ? 'none' : 'block';

      if (qs('#profBio') && !qs('#profBio').textContent.trim()) {
        qs('#profBio').textContent = 'No bio yet.';
      }

      let inferredPubkey = normalizedRawPubkey;
      if (!inferredPubkey) {
        const wantedName = (name || '').trim().toLowerCase();
        const wantedNip05 = claimedNip05;
        const fallback = Array.from(state.profilesByPubkey.values()).find((entry) => {
          const entryName = (entry.name || '').trim().toLowerCase();
          const entryNip05 = (entry.nip05 || '').trim().toLowerCase();
          if (wantedNip05 && entryNip05 === wantedNip05) return true;
          if (wantedName && entryName === wantedName) return true;
          return false;
        });
        inferredPubkey = fallback ? fallback.pubkey : '';
      }

      if (inferredPubkey) {
        if (routeMode !== 'skip') syncProfileRoute(inferredPubkey, routeMode);
        state.selectedProfilePubkey = inferredPubkey;
        renderProfilePage(inferredPubkey);
        subscribeProfileFeed(inferredPubkey);
        subscribeProfileStats(inferredPubkey);
        subscribeProfileStatus(inferredPubkey);
      } else {
        if (routeMode !== 'skip') syncHomeRoute(routeMode);
        state.selectedProfilePubkey = null;
        state.selectedProfileLiveAddress = null;
        subscribeProfileStatus('');
        renderProfileKind30315('');
        const liveWrap = qs('#profileLiveWrap');
        if (liveWrap) liveWrap.style.display = 'none';
        const feed = qs('#profileFeedList');
        if (feed) feed.innerHTML = '<div class="profile-feed-empty">This profile is in preview mode. Open a relay-backed user to load notes.</div>';
        const feedSide = qs('#profileFeedListSide');
        if (feedSide) feedSide.innerHTML = '<div class="profile-feed-empty">This profile is in preview mode. Open a relay-backed user to load notes.</div>';
        const past = qs('#profilePastStreamsList');
        if (past) past.innerHTML = '<div class="profile-feed-empty">Stream history needs a relay-backed profile.</div>';
        const media = qs('#profileMediaList') || qs('#profileVideosList');
        if (media) media.innerHTML = '<div class="profile-feed-empty">Media needs a relay-backed profile.</div>';
        const photos = qs('#profilePhotosList');
        if (photos) photos.innerHTML = '';

        const postsLeft = qs('#profilePostsLeft');
        const postsBtn = qs('#profileTabBtnPosts');
        if (postsLeft) postsLeft.style.display = 'block';
        if (postsBtn) postsBtn.style.display = 'none';
        if (state.profileTab === 'posts') state.profileTab = 'streams';
        renderProfileFollowButton('');
        setProfileVerificationStyle(verifiedNip05 ? 'verified' : 'none');

        const websiteRow = qs('#profWebsiteRow');
        const lud16Row = qs('#profLud16Row');
        const twitterRow = qs('#profTwitterRow');
        const githubRow = qs('#profGithubRow');
        const mainLinksWrap = qs('#profBioLinksMain');
        const bottomLinksWrap = qs('#profBioLinksBottom');
        if (websiteRow) websiteRow.style.display = 'none';
        if (lud16Row) lud16Row.style.display = 'none';
        if (twitterRow) twitterRow.style.display = 'none';
        if (githubRow) githubRow.style.display = 'none';
        if (mainLinksWrap) mainLinksWrap.style.display = 'none';
        if (bottomLinksWrap) bottomLinksWrap.style.display = 'none';
        const bioToggle = qs('#profBioToggle');
        if (bioToggle) bioToggle.style.display = 'none';
        const nostrSince = qs('#profNostrSince');
        if (nostrSince) nostrSince.textContent = '';

        setProfileTab(state.profileTab || 'streams');
      }

      window.scrollTo(0, 0);
    };

    window.goBackFromProfile = function () {
      window.showPage('home');
    };

    window.heroNav = function (delta) {
      heroAdvance(delta);
      resetHeroCycle();
    };

    window.heroWatchCurrent = function () {
      const streams = heroFeaturedStreams();
      if (!streams.length) return;
      const idx = ((state.featuredIndex % streams.length) + streams.length) % streams.length;
      openStream(streams[idx].address);
    };

    /* ---- NIP-51 / Following Live filter globals ---- */
    window.toggleListFilterDD = function (e) {
      toggleListFilterDDInternal(e);
    };

    window.setListFilter = function (filterId, clickedBtn) {
      setListFilterInternal(filterId, clickedBtn);
    };

    window.lfAddInputChange = function (el) {
      lfAddInputChangeInternal(el);
    };

    window.lfAddList = function () {
      lfAddListInternal();
    };

    window.setNostrFeedFilterFromSelect = function (filterId) {
      setNostrFeedFilterInternal(filterId);
    };

    // Close list filter dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#listFilterWrap')) closeListFilterDD();
    });

    window.openMyProfile = function () {
      if (!state.user) {
        window.openLogin();
        return;
      }
      showProfileByPubkey(state.user.pubkey);
    };

    window.switchProfileTab = function (tab) {
      setProfileTab(tab);
    };

    window.toggleProfileBio = function () {
      const pubkey = state.selectedProfilePubkey;
      if (!pubkey) return;
      const current = !!state.profileBioExpandedByPubkey.get(pubkey);
      state.profileBioExpandedByPubkey.set(pubkey, !current);
      renderProfilePage(pubkey);
    };

    window.toggleFollowProfile = function () {
      toggleFollowSelectedProfile();
    };

    window.openProfileMessage = function () {
      const peer = normalizePubkeyHex(state.selectedProfilePubkey);
      if (!peer) return;
      if (!state.user) {
        window.openLogin();
        return;
      }
      if (normalizePubkeyHex(state.user.pubkey) === peer) {
        setDmStatus('You cannot message your own account.', 'error');
        return;
      }
      openMessagesWithPeer(peer, { routeMode: 'push' }).catch((err) => {
        setDmStatus(err && err.message ? err.message : 'Could not open DM conversation.', 'error');
      });
    };

    window.openProfileEditSettings = function () {
      window.openSettings();
      window.switchSettingsTab('profile');
    };

    window.saveProfileKind30315Status = async function () {
      const selected = normalizePubkeyHex(state.selectedProfilePubkey);
      if (!selected) return;
      if (!state.user) { window.openLogin(); return; }
      const own = normalizePubkeyHex(state.user.pubkey);
      if (!own || own !== selected) return;
      if (state.profileStatusSavePending) return;

      const input = qs('#profKind30315Input');
      const btn = qs('#profKind30315SaveBtn');
      const nextStatus = String((input && input.value) || '').trim().slice(0, 180);

      state.profileStatusSavePending = true;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }

      try {
        const ev = await signAndPublish(KIND_PROFILE_STATUS, nextStatus, [['d', 'general']]);
        state.profileStatusByPubkey.set(selected, {
          text: nextStatus,
          created_at: Number(ev.created_at || Math.floor(Date.now() / 1000)),
          id: ev.id || ''
        });
        renderProfileKind30315(selected);
        renderProfileFeed(selected);
        if (btn) {
          btn.textContent = 'Saved';
          setTimeout(() => {
            const active = normalizePubkeyHex(state.selectedProfilePubkey);
            if (active === selected && btn) btn.textContent = 'Save';
          }, 1200);
        }
      } catch (err) {
        alert(err && err.message ? err.message : 'Failed to save status.');
        if (btn) btn.textContent = 'Save';
      } finally {
        state.profileStatusSavePending = false;
        renderProfileKind30315(selected);
      }
    };

    // ---- Add-to-List dropdown (NIP-51) ----
    function renderAtlDropdown() {
      const itemsEl = qs('#atlListItems');
      if (!itemsEl) return;
      itemsEl.innerHTML = '';

      const lists = Array.from(state.nip51Lists.values());
      if (!lists.length) {
        itemsEl.innerHTML = '<div class="atl-empty">No lists yet - create one below.</div>';
        return;
      }

      const pubkey = state.selectedProfilePubkey;
      lists.forEach((list) => {
        const btn = document.createElement('button');
        btn.className = 'atl-item';
        const inList = !!(pubkey && list.pubkeys.includes(pubkey));
        if (inList) {
          btn.textContent = '\u2713 ' + (list.name || 'Unnamed List');
          btn.classList.add('atl-saved');
          btn.title = 'Click to remove from this list';
        } else {
          btn.textContent = (list.name || 'Unnamed List');
          btn.title = 'Click to add to this list';
        }
        btn.addEventListener('click', async () => {
          if (!pubkey) return;
          if (!state.user) { window.openLogin(); return; }
          try {
            const tags = [];
            if (inList) {
              // Remove: republish list without this pubkey
              list.pubkeys.filter((pk) => pk !== pubkey).forEach((pk) => tags.push(['p', pk]));
            } else {
              // Add: republish list with this pubkey appended
              list.pubkeys.forEach((pk) => tags.push(['p', pk]));
              tags.push(['p', pubkey]);
            }
            tags.push(['d', list.d]);
            if (list.name) tags.push(['name', list.name]);
            await signAndPublish(30000, '', tags);
            // Optimistically update local state
            if (inList) {
              list.pubkeys = list.pubkeys.filter((pk) => pk !== pubkey);
            } else {
              list.pubkeys.push(pubkey);
            }
            renderAtlDropdown();
            renderListFilterDD();
          } catch (err) {
            alert(err.message || 'Failed to update list.');
          }
        });
        itemsEl.appendChild(btn);
      });
    }

    window.toggleAtlDropdown = function (e) {
      if (e) e.stopPropagation();
      const dd = qs('#atlDropdown');
      if (!dd) return;
      if (dd.classList.contains('open')) {
        dd.classList.remove('open');
      } else {
        renderAtlDropdown();
        dd.classList.add('open');
        // Hide create row when reopening
        const nr = qs('#atlNewRow');
        if (nr) nr.style.display = 'none';
      }
    };

    window.atlShowCreateRow = function () {
      const nr = qs('#atlNewRow');
      if (nr) { nr.style.display = 'flex'; qs('#atlNewInput') && qs('#atlNewInput').focus(); }
    };

    window.atlCreateList = async function () {
      const inp = qs('#atlNewInput');
      const name = inp ? inp.value.trim() : '';
      if (!name) return;
      if (!state.user) { window.openLogin(); return; }

      const d = `list-${Date.now()}`;
      const pubkey = state.selectedProfilePubkey;
      const tags = [['d', d], ['name', name]];
      if (pubkey) tags.push(['p', pubkey]);

      try {
        const signed = await signAndPublish(30000, '', tags);
        const list = { id: `30000:${state.user.pubkey}:${d}`, name, pubkeys: pubkey ? [pubkey] : [], kind: 30000, d, pubkey: state.user.pubkey };
        state.nip51Lists.set(list.id, list);
        if (inp) inp.value = '';
        const nr = qs('#atlNewRow');
        if (nr) nr.style.display = 'none';
        renderAtlDropdown();
        renderListFilterDD();
      } catch (err) {
        alert(err.message || 'Failed to create list.');
      }
    };

    // Close ATL dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const wrap = qs('#atlWrap');
      const dd = qs('#atlDropdown');
      if (dd && dd.classList.contains('open') && wrap && !wrap.contains(e.target)) {
        dd.classList.remove('open');
      }
    });

    window.addProfileToList = window.toggleAtlDropdown;

    window.shareProfile = async function () {
      const pubkey = state.selectedProfilePubkey;
      if (!pubkey) return;

      syncProfileRoute(pubkey, 'replace');
      const npub = formatNpubForDisplay(pubkey);
      const fallbackUrl = npub.startsWith('npub1') ? `${window.location.origin}/${npub}` : window.location.href;
      const text = isHomePath(window.location.pathname) ? fallbackUrl : window.location.href;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
        }
      } catch (_) {
        // ignore clipboard failures
      }

      const btn = qs('#profileShareBtn');
      if (btn) {
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Share'; }, 1200);
      }
    };

    window.showMini = function () {
      const m = qs('#miniPlayer');
      if (m) m.classList.add('visible');
    };

    window.hideMini = function () {
      const m = qs('#miniPlayer');
      if (m) m.classList.remove('visible');
    };

    window.closeMini = window.hideMini;
    window.returnToStream = function () { window.showVideoPage({ routeMode: 'push' }); };

    window.openMyStreams = function (opts = {}) {
      const routeMode = opts.routeMode || 'push';
      const allowLoginPrompt = opts.allowLoginPrompt !== false;
      if (!state.user) {
        if (allowLoginPrompt) window.openLogin();
        return false;
      }
      state.goLiveForceNew = false;
      state.goLiveHostMode = 'self';
      state.goLiveTemplateAddress = '';
      state.goLiveRelaysOpen = false;
      if (!state.goLiveSelectedAddress && state.selectedStreamAddress) {
        state.goLiveSelectedAddress = state.selectedStreamAddress;
      }
      setMyStreamsStatus('');
      updateGoLiveModalState();
      window.showPage('myStreams', { routeMode });
      return true;
    };

    window.selectMyStreamsStream = function (address) {
      state.goLiveSelectedAddress = (address || '').trim();
      setMyStreamsStatus('');
      updateGoLiveModalState();
    };

    window.publishMyStreamUpdate = async function () {
      if (!state.user) {
        window.openLogin();
        return;
      }
      state.goLiveForceNew = false;
      syncGoLiveModalFromMyStreamsPage();
      const btn = qs('#myStreamsPublishBtn');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving...';
      }
      setMyStreamsStatus('Publishing stream update...');
      try {
        const stream = await publishCurrentStream();
        const status = normalizeStreamStatus(stream.status);
        if (status === 'ended') {
          setMyStreamsStatus('Stream ended and removed from your editable list.', 'success');
        } else {
          setMyStreamsStatus('Stream update published successfully.', 'success');
        }
      } catch (err) {
        setMyStreamsStatus(err && err.message ? err.message : 'Failed to publish stream update.', 'error');
      } finally {
        if (btn) btn.disabled = false;
        updateGoLiveModalState();
      }
    };

    window.removeMyStreamFromList = function () {
      const address = ((qs('#myStreamsStreamSelect') && qs('#myStreamsStreamSelect').value) || state.goLiveSelectedAddress || '').trim();
      if (!address) return;
      state.goLiveSelectedAddress = address;
      const stream = state.streamsByAddress.get(address);
      if (!stream || normalizeStreamStatus(stream.status) !== 'ended') {
        alert('Only ended streams can be removed from this list.');
        return;
      }
      window.removeGoLiveStreamFromList();
      setMyStreamsStatus('Ended stream removed from list.', 'success');
      updateGoLiveModalState();
    };

    window.goToMyStreamFromPage = function () {
      const address = ((qs('#myStreamsStreamSelect') && qs('#myStreamsStreamSelect').value) || state.goLiveSelectedAddress || state.selectedStreamAddress || '').trim();
      if (!address) return;
      openStream(address);
    };

    window.setGoLiveHostMode = function (mode) {
      applyGoLiveHostModeUi(mode);
    };

    window.toggleGoLiveRelaysPanel = function () {
      if (state.goLiveHostMode !== 'self') return;
      setGoLiveRelaysPanelOpen(!state.goLiveRelaysOpen);
    };

    window.selectGoLiveThirdParty = function (providerName) {
      const name = String(providerName || '').trim();
      if (!name) return;
      state.goLiveThirdPartyProvider = name;
      qsa('#goLiveThirdPartyWrap .go-live-third-party-btn').forEach((btn) => {
        btn.classList.toggle('on', (btn.textContent || '').trim().toLowerCase() === name.toLowerCase());
      });
      const help = qs('#goLiveThirdPartyHelp');
      if (help) help.textContent = `${name} selected. Direct launch integration is coming soon.`;
    };

    window.handleGoLiveStreamSelect = function (address) {
      const next = (address || '').trim();
      if (state.goLiveForceNew) {
        state.goLiveTemplateAddress = next;
        return;
      }
      window.selectGoLiveStream(next);
    };

    window.loadGoLiveTemplate = function () {
      if (!state.goLiveForceNew) return;
      const selector = qs('#goLiveStreamSelect');
      const selectedAddress = ((selector && selector.value) || state.goLiveTemplateAddress || '').trim();
      if (!selectedAddress) return;
      state.goLiveTemplateAddress = selectedAddress;
      const stream = state.streamsByAddress.get(selectedAddress);
      if (!stream) {
        alert('Could not load that stream template.');
        return;
      }

      const title = qs('#goLiveTitle');
      const summary = qs('#goLiveSummary');
      const streamUrl = qs('#goLiveStreamUrl');
      const thumb = qs('#goLiveThumb');
      const starts = qs('#goLiveStarts');
      const dtag = qs('#goLiveDTag');
      const eventId = qs('#goLiveEventId');

      if (title) title.value = stream.title || '';
      if (summary) summary.value = stream.summary || '';
      if (streamUrl) streamUrl.value = stream.streaming || '';
      if (thumb) thumb.value = stream.image || '';
      if (starts) starts.value = '';
      if (dtag) dtag.value = generateGoLiveDTag();
      if (eventId) eventId.value = '';
      setGoLiveStatusSelection('live');
      state.goLiveSelectedAddress = '';
      updateGoLiveThumbPreview();
      scheduleGoLiveStreamPreview(120);
    };

    window.openGoLive = function () {
      if (!state.user) {
        window.openLogin();
        return;
      }
      const streams = ownManageableStreams();
      const hasLive = streams.some((stream) => normalizeStreamStatus(stream.status) === 'live');
      if (hasLive) {
        state.goLiveForceNew = false;
        state.goLiveHostMode = 'self';
        state.goLiveTemplateAddress = '';
        state.goLiveRelaysOpen = false;

        const hasSelected = streams.some((stream) => stream.address === state.goLiveSelectedAddress);
        if (!hasSelected) {
          const preferred = streams.find((stream) => stream.address === state.selectedStreamAddress)
            || streams.find((stream) => normalizeStreamStatus(stream.status) === 'live')
            || streams[0]
            || null;
          state.goLiveSelectedAddress = preferred ? preferred.address : '';
        }
        updateGoLiveModalState();
      } else {
        configureGoLiveModalForNewStream();
      }
      const modal = qs('#goLiveModal');
      const form = qs('#mForm');
      const success = qs('#mSuccess');
      if (modal) modal.classList.add('open');
      if (form) form.style.display = 'flex';
      if (success) success.className = 'msuccess';
    };

    window.closeGoLive = function () {
      qs('#goLiveModal').classList.remove('open');
      setGoLiveRelaysPanelOpen(false);
      clearGoLiveStreamPreview();
    };

    window.selectGoLiveStream = function (address) {
      state.goLiveForceNew = false;
      state.goLiveSelectedAddress = (address || '').trim();
      updateGoLiveModalState();
    };

    window.removeGoLiveStreamFromList = function () {
      const address = (state.goLiveSelectedAddress || '').trim();
      if (!address) return;
      const stream = state.streamsByAddress.get(address);
      if (stream && normalizeStreamStatus(stream.status) !== 'ended') {
        alert('Only ended streams can be removed from this list.');
        return;
      }
      state.goLiveHiddenEndedAddresses.add(address);
      if (state.goLiveSelectedAddress === address) state.goLiveSelectedAddress = '';
      persistHiddenEndedStreamsForCurrentUser();
      updateGoLiveModalState();
    };

    window.publishStream = async function () {
      if (state.goLiveHostMode === 'third-party') {
        alert('Host via 3rd party is coming soon.');
        return;
      }
      try {
        const stream = await publishCurrentStream();
        const status = normalizeStreamStatus(stream.status);
        const form = qs('#mForm');
        const success = qs('#mSuccess');
        const succTitle = success ? qs('.succ-title', success) : null;
        const succText = success ? qs('.succ-text', success) : null;
        if (form) form.style.display = 'none';
        if (success) success.classList.add('on');
        if (succTitle) succTitle.textContent = status === 'ended'
          ? 'Stream Ended'
          : (status === 'planned' ? 'Stream Updated' : "You're Live on Nostr!");
        if (succText) succText.textContent = status === 'ended'
          ? 'Your ended status has been published and removed from the edit list.'
          : (status === 'planned'
            ? 'Your stream details were updated with planned status.'
            : 'Your NIP-53 event is live on your relays.');
      } catch (err) {
        alert(err.message || 'Failed to publish stream.');
      }
    };

    window.goToMyStream = function () {
      const address = state.goLiveSelectedAddress || state.selectedStreamAddress;
      if (address) openStream(address);
      window.closeGoLive();
    };

    window.openEnd = function () { qs('#endModal').classList.add('open'); };
    window.closeEnd = function () { qs('#endModal').classList.remove('open'); };

    window.confirmEndStream = async function () {
      try {
        await publishCurrentStream('ended');
      } catch (err) {
        alert(err.message || 'Failed to publish end event.');
      }
      window.closeEnd();
      state.isLive = false;
      const selected = state.selectedStreamAddress && state.streamsByAddress.get(state.selectedStreamAddress);
      if (selected && normalizeStreamStatus(selected.status) === 'ended') {
        window.showVideoPage({ routeMode: 'replace' });
        renderVideo(selected);
      } else {
        window.showPage('home');
      }
    };

    window.openLogin = function () {
      cancelRemoteLoginAttempt({ silent: true });
      setRemoteLoginStatus('', 'info');
      qs('#loginModal').classList.add('open');
    };
    window.closeLogin = function () {
      cancelRemoteLoginAttempt({ silent: true });
      setRemoteLoginStatus('', 'info');
      qs('#loginModal').classList.remove('open');
    };

    window.loginRemote = async function () {
      if (state.remoteLoginPending) return;

      const abortController = typeof AbortController === 'function' ? new AbortController() : null;
      state.remoteLoginAbortController = abortController;
      setRemoteLoginUri('');
      setRemoteLoginUiBusy(true);
      setRemoteLoginStatus('Preparing remote login QR code...', 'loading');

      try {
        await loginWithRemoteSignerQr(true, {
          signal: abortController ? abortController.signal : null,
          onUri: (uri) => {
            setRemoteLoginUri(uri);
            setRemoteLoginStatus('Scan the QR code with your signer app, then approve.', 'loading');
          },
          onStatus: (msg) => setRemoteLoginStatus(msg, 'loading')
        });
        setRemoteLoginStatus('Remote signer connected.', 'success');
      } catch (err) {
        if (isAbortLikeError(err)) {
          setRemoteLoginStatus('Remote login cancelled.', 'info');
        } else {
          setRemoteLoginStatus(err && err.message ? err.message : 'Remote login failed.', 'error');
        }
      } finally {
        state.remoteLoginAbortController = null;
        setRemoteLoginUiBusy(false);
      }
    };

    window.copyRemoteLoginUri = async function () {
      const uri = String(state.remoteLoginUri || '').trim();
      if (!uri) {
        setRemoteLoginStatus('Start Remote Nostr Login first to generate a link.', 'info');
        return;
      }
      try {
        await navigator.clipboard.writeText(uri);
        setRemoteLoginStatus('Remote login link copied.', 'success');
      } catch (_) {
        setRemoteLoginStatus('Could not copy link to clipboard on this browser.', 'error');
      }
    };

    window.cancelRemoteLogin = function () {
      cancelRemoteLoginAttempt({ silent: false });
    };

    window.loginDemo = async function (name) {
      try {
        if (state.remoteLoginPending && name !== 'remote' && name !== 'remoteprimal') {
          cancelRemoteLoginAttempt({ silent: true });
        }
        if (name === 'keyuser') {
          const nsecInput = qs('#nsecLoginInput');
          const nsec = (nsecInput && nsecInput.value.trim()) || '';
          if (!nsec) throw new Error('Enter your nsec key first.');
          await loginWithNsec(nsec, true);
          if (nsecInput) nsecInput.value = '';
          return;
        }

        if (name === 'newnostr') {
          await createLocalIdentity();
          return;
        }

        if (name === 'remote' || name === 'remoteprimal') {
          await window.loginRemote();
          return;
        }

        await loginWithExtension();
      } catch (err) {
        alert(err.message || 'Login failed.');
      }
    };

    window.openSettings = function () {
      populateSettingsModal();
      qs('#settingsModal').classList.add('open');
      // Reset to profile tab each time
      window.switchSettingsTab('profile');
    };

    window.closeSettings = function () {
      qs('#settingsModal').classList.remove('open');
    };

    window.switchSettingsTab = function (tab) {
      ['profile','relays','app'].forEach(t => {
        const btn = qs(`#smTab-${t}`);
        const panel = qs(`#smPanel${t.charAt(0).toUpperCase()+t.slice(1)}`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (panel) panel.classList.toggle('active', t === tab);
      });
    };

    window.previewSettingsAvatar = function (url) {
      const preview = qs('#smAvatarPreview');
      if (!preview) return;
      if (url && url.trim()) {
        preview.innerHTML = `<img src="${url.trim()}" alt="avatar" onerror="this.parentElement.innerHTML='?'">`;
      } else {
        preview.innerHTML = '?';
      }
    };

    window.toggleSetting = function (el) {
      if (el) el.classList.toggle('on');
    };

    window.addRelayFromSettings = function () {
      try {
        const input = qs('#settingsRelayInput');
        const value = (input && input.value.trim()) || '';
        if (!value) return;
        addRelayToSettings(value);
        if (input) input.value = '';
      } catch (err) {
        alert(err.message || 'Invalid relay URL.');
      }
    };

    // Save just the Nostr profile (NIP-01 kind:0)
    window.saveProfileSettings = async function () {
      try {
        if (!state.user) { alert('Please sign in first.'); return; }
        const displayName = (qs('#settingsDisplayName') || {}).value || '';
        const username = (qs('#settingsUsername') || {}).value || '';
        const about = (qs('#settingsAbout') || {}).value || '';
        const picture = (qs('#settingsAvatarUrl') || {}).value || '';
        const banner = (qs('#settingsBannerInput') || {}).value || '';
        const website = (qs('#settingsWebsiteInput') || {}).value || '';
        const lud16 = (qs('#settingsLud16Input') || {}).value || '';
        const nip05 = (qs('#settingsNip05Input') || {}).value || '';

        await publishUserProfile({ name: username || displayName, display_name: displayName, about, picture, banner, website, lud16, nip05 });

        state.settings.lud16 = lud16;
        state.settings.website = website;
        state.settings.banner = banner;
        persistSettings();
        window.closeSettings();
      } catch (err) {
        alert(err.message || 'Failed to save profile.');
      }
    };

    // Save relay settings only
    window.saveRelaySettings = function () {
      try {
        const next = { ...state.settings, relays: [...state.settings.relays] };
        applySettings(next, { reconnect: true });
        window.closeSettings();
      } catch (err) {
        alert(err.message || 'Failed to save relays.');
      }
    };

    // Save app/interface settings only
    window.saveAppSettings = function () {
      try {
        const next = collectSettingsFromModal();
        applySettings(next, { reconnect: false });
        window.closeSettings();
      } catch (err) {
        alert(err.message || 'Failed to save settings.');
      }
    };

    // Legacy save ? kept for external references
    window.saveSettings = async function () {
      try {
        const next = collectSettingsFromModal();
        const relaysChanged = next.relays.join('|') !== state.settings.relays.join('|');
        applySettings(next, { reconnect: relaysChanged });

        if (state.user) {
          const current = profileFor(state.user.pubkey);
          const shouldUpdateProfile = (next.lud16 !== (current.lud16 || '')) || (next.website !== (current.website || '')) || (next.banner !== (current.banner || ''));
          if (shouldUpdateProfile) {
            await publishUserProfile({
              name: current.name,
              picture: current.picture,
              about: current.about,
              website: next.website,
              banner: next.banner,
              lud16: next.lud16
            });
          }
        }

        window.closeSettings();
      } catch (err) {
        alert(err.message || 'Failed to save settings.');
      }
    };

    window.copyOnboardingNsec = copyOnboardingNsec;
    window.completeOnboarding = completeOnboarding;
    window.skipOnboarding = skipOnboarding;
    window.closeOnboarding = closeOnboarding;
    window.onbRevealNsec = onbRevealNsec;
    window.onbCopyNsec = onbCopyNsec;
    window.onbCheckSaved = onbCheckSaved;
    window.onbGoToProfile = onbGoToProfile;
    window.onbBackToKey = onbBackToKey;
    window.onbUpdatePreview = onbUpdatePreview;
    window.openStreamFromProfile = openStreamFromProfile;

    window.openFaq = function () { window.showPage('faq'); };
    window.renderNostrContent = renderNostrContent;
    window.closeFaq = function () {
      const modal = qs('#faqModal');
      if (modal) modal.classList.remove('open');
      if (isFaqPath(window.location.pathname)) window.showPage('home');
    };
    window.toggleFaq = function (el) { el.closest('.faq-item').classList.toggle('open'); };
    window.switchTab = function (t) {
      const isChat = t === 'chat';
      qsa('.stab').forEach((s, i) => s.classList.toggle('active', isChat ? i === 0 : i === 1));
      if (qs('#chatScroll')) qs('#chatScroll').style.display = isChat ? 'flex' : 'none';
      if (qs('#viewersPanel')) qs('#viewersPanel').classList.toggle('on', !isChat);
    };

    window.toggleEmoji = function (ev) {
      ev.stopPropagation();
      qs('#emojiPicker').classList.toggle('open');
    };

    window.closeEmoji = function () {
      qs('#emojiPicker').classList.remove('open');
    };

    window.handleSearch = function (inp) {
      renderSearch((inp.value || '').trim().toLowerCase());
    };

    window.toggleLike = function () {
      sendReaction();
    };

    window.toggleStreamEmojiReaction = async function (reactionKey) {
      const knownMeta = state.streamReactionMetaByKey.get(reactionKey) || {};
      const reactionMeta = {
        key: normalizeReactionContentKey(reactionKey),
        label: knownMeta.label || reactionKey,
        imageUrl: knownMeta.imageUrl || '',
        shortcode: knownMeta.shortcode || ''
      };
      await toggleStreamReactionByMeta(reactionMeta);
    };

    window.toggleProfilePostLike = async function (noteId, notePubkey, profilePubkey) {
      await togglePostReactionByMeta(noteId, notePubkey, profilePubkey, { key: '+', label: '\u2764\uFE0F', imageUrl: '', shortcode: '' });
    };

    window.zapProfileNote = async function (noteId, notePubkey, profilePubkey, buttonEl = null) {
      if (!noteId || !notePubkey) return;
      if (!state.user) { window.openLogin(); return; }

      let profile = profileFor(notePubkey);
      let lud16 = String(profile.lud16 || '').trim();
      if ((!lud16 || !lud16.includes('@')) && !state.profilesByPubkey.has(normalizePubkeyHex(notePubkey) || notePubkey)) {
        try {
          await fetchProfileIfNeeded(notePubkey);
          profile = profileFor(notePubkey);
          lud16 = String(profile.lud16 || '').trim();
        } catch (_) {}
      }
      if (!lud16 || !lud16.includes('@')) {
        alert('This profile has no valid Lightning address (lud16) for zaps.');
        return;
      }

      if (window.webln) {
        try {
          await window.webln.enable();
          const zapAmountMsats = 21000;
          const zapTags = [['relays', ...state.relays], ['amount', String(zapAmountMsats)], ['p', notePubkey], ['e', noteId]];
          const zapRequest = await signAndPublish(9734, 'zap from Sifaka Live', zapTags);
          const [user, domain] = lud16.split('@');
          const meta = await fetch(`https://${domain}/.well-known/lnurlp/${user}`).then((r) => r.json());
          if (!meta.callback) throw new Error('Invalid LNURL response.');
          const invoiceData = await fetch(`${meta.callback}?amount=${zapAmountMsats}&nostr=${encodeURIComponent(JSON.stringify(zapRequest))}`).then((r) => r.json());
          if (!invoiceData.pr) throw new Error('No payment request returned.');
          await window.webln.sendPayment(invoiceData.pr);
          if (buttonEl) {
            const original = buttonEl.textContent;
            buttonEl.textContent = 'Zapped';
            setTimeout(() => { buttonEl.textContent = original; }, 1400);
          }
          if (profilePubkey) {
            setTimeout(() => {
              try { renderFeedOrProfileFeed(profilePubkey); } catch (_) {}
            }, 1200);
          }
          return;
        } catch (err) {
          console.warn('Comment zap failed:', err && err.message ? err.message : err);
        }
      }

      window.open(`lightning:${lud16}`, '_blank');
    };

    window.toggleProfilePostBoost = async function (noteId, notePubkey, profilePubkey) {
      if (!noteId || !notePubkey || !profilePubkey) return;
      if (!state.user) { window.openLogin(); return; }
      if (state.postBoostPublishPendingByNoteId.has(noteId)) return;
      state.postBoostPublishPendingByNoteId.add(noteId);

      try {
        const map = state.profileNotesByPubkey.get(profilePubkey) || new Map();
        let existingBoostId = findOwnPostBoostIdFromProfileMap(noteId, profilePubkey);
        if (!existingBoostId) existingBoostId = await findOwnPostBoostId(noteId);

        if (existingBoostId) {
          const deletion = await signAndPublish(KIND_DELETION, 'removed post boost', [['e', existingBoostId], ['k', '6'], ['p', notePubkey]]);
          if (deletion && deletion.id) map.set(deletion.id, deletion);
        } else {
          const sourceNote = map.get(noteId);
          const repostContent = sourceNote && sourceNote.id === noteId ? JSON.stringify(sourceNote) : '';
          const repost = await signAndPublish(6, repostContent, [['e', noteId], ['p', notePubkey]]);
          if (repost && repost.id) map.set(repost.id, repost);
        }

        state.profileNotesByPubkey.set(profilePubkey, map);
        renderFeedOrProfileFeed(profilePubkey);
      } catch (err) {
        alert(err && err.message ? err.message : 'Failed to update post boost.');
      } finally {
        state.postBoostPublishPendingByNoteId.delete(noteId);
      }
    };

    window.toggleProfilePostEmoji = async function (noteId, notePubkey, profilePubkey, reactionKey, imageUrl = '', shortcode = '') {
      const knownMeta = state.streamReactionMetaByKey.get(reactionKey) || {};
      const reactionMeta = {
        key: normalizeReactionContentKey(reactionKey),
        label: knownMeta.label || reactionKey,
        imageUrl: imageUrl || knownMeta.imageUrl || '',
        shortcode: shortcode || knownMeta.shortcode || ''
      };
      await togglePostReactionByMeta(noteId, notePubkey, profilePubkey, reactionMeta);
    };

    const renderReactionPickerGrid = () => {
      const grid = qs('#reactionPickerGrid');
      if (!grid) return;
      grid.innerHTML = '';
      defaultReactionPickerOptions().forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reaction-opt-btn';
        btn.title = opt.label || opt.key;
        btn.addEventListener('click', async () => {
          const target = state.reactionPickerTarget;
          if (!target) return;
          if (target.type === 'stream') {
            await toggleStreamReactionByMeta(opt);
          } else if (target.type === 'post') {
            await togglePostReactionByMeta(target.noteId, target.notePubkey, target.profilePubkey, opt);
          } else if (target.type === 'dm') {
            toggleDmEmojiReactionByMeta(target.messageId, opt);
          }
          window.closeReactionPicker();
        });

        if (opt.imageUrl) {
          const img = document.createElement('img');
          img.src = opt.imageUrl;
          img.alt = opt.label || opt.key;
          img.loading = 'lazy';
          btn.appendChild(img);
        } else {
          btn.textContent = opt.label || opt.key;
        }
        grid.appendChild(btn);
      });
    };

    window.openReactionPickerForStream = function () {
      const stream = state.streamsByAddress.get(state.selectedStreamAddress);
      if (!stream) return;
      state.reactionPickerTarget = { type: 'stream' };
      renderReactionPickerGrid();
      const code = qs('#reactionPickerCode');
      const url = qs('#reactionPickerUrl');
      if (code) code.value = '';
      if (url) url.value = '';
      const ov = qs('#reactionPickerModal');
      if (ov) ov.classList.add('open');
      if (code) code.focus();
    };

    window.openReactionPickerForPost = function (noteId, notePubkey, profilePubkey) {
      if (!noteId || !notePubkey || !profilePubkey) return;
      state.reactionPickerTarget = { type: 'post', noteId, notePubkey, profilePubkey };
      renderReactionPickerGrid();
      const code = qs('#reactionPickerCode');
      const url = qs('#reactionPickerUrl');
      if (code) code.value = '';
      if (url) url.value = '';
      const ov = qs('#reactionPickerModal');
      if (ov) ov.classList.add('open');
      if (code) code.focus();
    };

    window.openReactionPickerForDmMessage = function (messageId) {
      const msgId = String(messageId || '').trim();
      if (!msgId) return;
      state.reactionPickerTarget = { type: 'dm', messageId: msgId };
      renderReactionPickerGrid();
      const code = qs('#reactionPickerCode');
      const url = qs('#reactionPickerUrl');
      if (code) code.value = '';
      if (url) url.value = '';
      const ov = qs('#reactionPickerModal');
      if (ov) ov.classList.add('open');
      if (code) code.focus();
    };

    window.closeReactionPicker = function (e) {
      const ov = qs('#reactionPickerModal');
      if (!ov) return;
      if (e && e.target !== ov) return;
      ov.classList.remove('open');
      state.reactionPickerTarget = null;
      const code = qs('#reactionPickerCode');
      const url = qs('#reactionPickerUrl');
      if (code) code.value = '';
      if (url) url.value = '';
    };

    window.submitCustomReactionPicker = async function () {
      const target = state.reactionPickerTarget;
      if (!target) return;
      const code = (qs('#reactionPickerCode') && qs('#reactionPickerCode').value || '').trim();
      const url = (qs('#reactionPickerUrl') && qs('#reactionPickerUrl').value || '').trim();
      const reactionMeta = reactionMetaFromPicker(code, url);
      if (!reactionMeta) {
        alert('Enter an emoji or :shortcode: first.');
        return;
      }
      if (target.type === 'stream') {
        await toggleStreamReactionByMeta(reactionMeta);
      } else if (target.type === 'post') {
        await togglePostReactionByMeta(target.noteId, target.notePubkey, target.profilePubkey, reactionMeta);
      } else if (target.type === 'dm') {
        toggleDmEmojiReactionByMeta(target.messageId, reactionMeta);
      }
      window.closeReactionPicker();
    };

    window.toggleChatLikeMessage = async function (messageId) {
      const messageEvent = state.chatMessageEventsById.get(messageId);
      const stream = state.streamsByAddress.get(state.selectedStreamAddress);
      if (!messageEvent || !stream || !/^[0-9a-f]{64}$/i.test(messageId || '')) return;
      if (!state.user) { window.openLogin(); return; }
      if (state.chatLikePublishPendingByMessageId.has(messageId)) return;

      const userPubkey = normalizePubkeyHex(state.user.pubkey);
      if (!userPubkey) return;
      state.chatLikePublishPendingByMessageId.add(messageId);

      const likedSet = state.chatLikePubkeysByMessageId.get(messageId) || new Set();
      const wasLiked = likedSet.has(userPubkey);
      const previousOwnReactionId = state.chatOwnLikeEventByMessageId.get(messageId) || '';

      try {
        if (wasLiked) {
          if (state.chatLikePubkeysByMessageId.has(messageId)) {
            state.chatLikePubkeysByMessageId.get(messageId).delete(userPubkey);
            if (!state.chatLikePubkeysByMessageId.get(messageId).size) state.chatLikePubkeysByMessageId.delete(messageId);
          }
          state.chatOwnLikeEventByMessageId.delete(messageId);
          updateChatLikeUi(messageId);

          let reactionId = previousOwnReactionId;
          if (!reactionId) {
            reactionId = await findOwnChatLikeReactionId(messageId, stream);
          }

          if (reactionId) {
            await signAndPublish(KIND_DELETION, 'unliked chat message', [['e', reactionId], ['k', String(KIND_REACTION)], ['a', stream.address]]);
            applyChatUnlikeByReactionId(reactionId);
          } else {
            await signAndPublish(KIND_REACTION, '-', [['e', messageId], ['p', messageEvent.pubkey], ['a', stream.address]]);
          }
          updateChatLikeUi(messageId);
        } else {
          applyChatLikeReaction(messageId, userPubkey, '');
          updateChatLikeUi(messageId);

          const likeEv = await signAndPublish(KIND_REACTION, '+', [['e', messageId], ['p', messageEvent.pubkey], ['a', stream.address]]);
          if (likeEv && likeEv.id) applyChatLikeReaction(messageId, userPubkey, likeEv.id);
          updateChatLikeUi(messageId);
        }
      } catch (err) {
        if (wasLiked) {
          applyChatLikeReaction(messageId, userPubkey, previousOwnReactionId);
        } else {
          const set = state.chatLikePubkeysByMessageId.get(messageId);
          if (set) {
            set.delete(userPubkey);
            if (!set.size) state.chatLikePubkeysByMessageId.delete(messageId);
          }
          state.chatOwnLikeEventByMessageId.delete(messageId);
        }
        updateChatLikeUi(messageId);
        alert(err.message || 'Failed to update chat like.');
      } finally {
        state.chatLikePublishPendingByMessageId.delete(messageId);
      }
    };

    window.toggleTheaterFollow = async function () {
      const stream = state.streamsByAddress.get(state.selectedStreamAddress);
      if (!stream) return;
      if (!state.user) { window.openLogin(); return; }
      const pubkey = normalizePubkeyHex(stream.hostPubkey);
      if (!pubkey) return;
      if (state.followPublishPending) return;
      state.followPublishPending = true;

      try {
        const wasFollowing = isFollowingPubkey(pubkey);
        const next = !wasFollowing;
        setFollowingPubkey(pubkey, next);
        state.contactListPubkeys = new Set(state.followedPubkeys);
        updateOwnFollowingStat(next ? 1 : -1);
        updateTheaterFollowBtn(pubkey);
        renderLiveGrid();

        // Keep profile page in sync if it's open for the same person
        if (normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) renderProfileFollowButton(pubkey);

        try {
          await publishFollowedPubkeysToNostr();
          state.contactListPubkeys = new Set(state.followedPubkeys);
          renderFollowingCount();
          renderLiveGrid();
        } catch (err) {
          setFollowingPubkey(pubkey, wasFollowing);
          state.contactListPubkeys = new Set(state.followedPubkeys);
          updateOwnFollowingStat(next ? -1 : 1);
          updateTheaterFollowBtn(pubkey);
          if (normalizePubkeyHex(state.selectedProfilePubkey) === pubkey) renderProfileFollowButton(pubkey);
          renderLiveGrid();
          alert(err.message || 'Failed to update follow list.');
        }
      } finally {
        state.followPublishPending = false;
      }
    };

    // ---- "Also Live Now" reco panel ----
    window.renderRecoStreams = function () {
      const list = qs('#recoList');
      if (!list) return;
      const current = state.selectedStreamAddress;
      const thumbClasses = ['t1','t2','t3','t4','t5','t6','t7','t8'];
      const others = sortedLiveStreams()
        .filter((s) => s.address !== current && s.status === 'live')
        .slice(0, 6);
      list.innerHTML = '';
      if (!others.length) {
        list.innerHTML = '<div style="font-size:.74rem;color:var(--muted);padding:.25rem .45rem;">No other live streams right now.</div>';
        return;
      }
      others.forEach((s, i) => {
        const p = profileFor(s.hostPubkey);
        const viewerCount = effectiveParticipants(s);
        const item = document.createElement('div');
        item.className = 'reco-item';
        item.innerHTML = `
          <div class="reco-thumb"><div class="tc ${thumbClasses[i % thumbClasses.length]}" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"></div></div>
          <div class="reco-text"><div class="rt"></div><div class="rs"></div></div>`;
        qs('.rt', item).textContent = s.title || 'Untitled stream';
        qs('.rs', item).innerHTML = `${p.name || shortHex(s.hostPubkey)} - <span style="color:var(--live)">${viewerCount > 0 ? viewerCount.toLocaleString() + ' live' : 'live'}</span>`;
        if (s.image) {
          const thumb = qs('.reco-thumb', item);
          thumb.innerHTML = `<img src="${s.image}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`;
        }
        item.addEventListener('click', () => openStream(s.address));
        list.appendChild(item);
      });
    };

    // ---- Compose / post note on own profile ----
    window.profileComposeInput = function () {
      // Kept for backward-compatible inline handlers. Counter UI was removed.
    };

    function normalizeComposeTarget(target) {
      const raw = String(target || '').trim();
      if (!raw) return 'profile';
      if (/^textarea:/i.test(raw)) {
        const idx = raw.indexOf(':');
        const id = idx >= 0 ? raw.slice(idx + 1).trim() : '';
        if (id) return `textarea:${id}`;
        return 'profile';
      }
      const clean = raw.toLowerCase();
      if (clean === 'dm') return 'dm';
      if (clean === 'chat') return 'chat';
      return 'profile';
    }

    window.openGifPicker = function (target = 'profile') {
      if (!state.user) { window.openLogin(); return; }
      const ov = qs('#gifPickerModal');
      if (!ov) return;

      state.gifPickerTarget = normalizeComposeTarget(target);
      ov.classList.add('open');

      const input = qs('#gifPickerSearchInput');
      if (input) {
        input.value = state.gifPickerQuery || '';
        try { input.focus(); } catch (_) {}
      }

      if (input && !input.dataset.boundGifSearch) {
        input.dataset.boundGifSearch = '1';
        input.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (typeof window.searchGifsFromPicker === 'function') window.searchGifsFromPicker();
        });
        input.addEventListener('input', () => {
          clearGifPickerSearchTimer();
          state.gifPickerSearchTimer = setTimeout(() => {
            state.gifPickerSearchTimer = null;
            if (typeof window.searchGifsFromPicker === 'function') window.searchGifsFromPicker();
          }, GIF_PICKER_SEARCH_DEBOUNCE_MS);
        });
      }

      if (state.gifPickerResults.length) {
        renderGifPickerResults(state.gifPickerResults);
        updateGifPickerLoadMoreUi();
        setGifPickerStatus('Pick a GIF to insert into your note.', 'info');
      } else {
        fetchGifPickerResults({ query: '', append: false }).catch(() => {});
      }
    };

    window.closeGifPicker = function (e) {
      const ov = qs('#gifPickerModal');
      if (!ov) return;
      if (e && e.target !== ov) return;
      ov.classList.remove('open');
      clearGifPickerSearchTimer();
    };

    window.searchGifsFromPicker = function () {
      const input = qs('#gifPickerSearchInput');
      const query = String(input && input.value || '').trim();
      fetchGifPickerResults({ query, append: false }).catch(() => {});
    };

    window.loadMoreGifsFromPicker = function () {
      if (!state.gifPickerCursor || state.gifPickerPending) return;
      fetchGifPickerResults({ query: state.gifPickerQuery || '', append: true }).catch(() => {});
    };

    window.selectGifFromPicker = function (gifUrl) {
      const url = sanitizeMediaUrl(gifUrl);
      if (!isLikelyUrl(url)) {
        setGifPickerStatus('That GIF URL is invalid.', 'error');
        return;
      }
      const target = normalizeComposeTarget(state.gifPickerTarget || 'profile');
      const inserted = appendTextToComposeTarget(target, url);
      if (!inserted) {
        setGifPickerStatus('Could not insert GIF into the current composer.', 'error');
        return;
      }
      const targetLabel = composeTargetLabel(target);
      setGifPickerStatus(`GIF inserted into your ${targetLabel}.`, 'success');
      window.closeGifPicker();
    };

    window.openComposeUploadModal = function (target = 'profile') {
      if (!state.user) { window.openLogin(); return; }
      const ov = qs('#composeUploadModal');
      if (!ov) return;
      state.composeUploadTarget = normalizeComposeTarget(target);

      state.composeUploadSource = 'blossom';
      const targetLabel = composeTargetLabel(state.composeUploadTarget);
      setComposeUploadStatus(`Choose a media file for your ${targetLabel}.`, 'info');
      ov.classList.add('open');
      if (typeof window.selectComposeUploadSource === 'function') {
        window.selectComposeUploadSource('blossom');
      }
    };

    window.closeComposeUploadModal = function (e) {
      const ov = qs('#composeUploadModal');
      if (!ov) return;
      if (e && e.target !== ov) return;
      ov.classList.remove('open');
      const fileInput = qs('#composeUploadFileInput');
      if (fileInput) fileInput.value = '';
    };

  window.promptComposeMediaUrl = function () {
      const raw = window.prompt('Paste an image, video, or audio URL:');
      const url = String(raw || '').trim();
      if (!url) return;
      if (!isLikelyUrl(url)) {
        alert('Please paste a valid URL.');
        return;
      }
      if (!appendTextToActiveComposeTarget(url)) return;
      const targetLabel = composeTargetLabel(state.composeUploadTarget);
      setComposeUploadStatus(`URL inserted into your ${targetLabel}.`, 'success');
      setTimeout(() => {
        const ov = qs('#composeUploadModal');
        if (ov) ov.classList.remove('open');
      }, 350);
    };

    window.selectComposeUploadSource = function (source) {
      if (state.composeUploadPending) return;
      const normalized = String(source || '').trim().toLowerCase();
      state.composeUploadSource = normalized || 'blossom';
      if (state.composeUploadSource === 'blossom') {
        const fileInput = qs('#composeUploadFileInput');
        if (!fileInput) return;
        fileInput.setAttribute('accept', BLOSSOM_MEDIA_ACCEPT);
        fileInput.value = '';
        setComposeUploadStatus('Pick an image, video, or audio file from your device.', 'info');
        try { fileInput.click(); } catch (_) {}
        return;
      }
      alert('Unsupported upload source.');
    };

    window.uploadComposeFile = async function (event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      if (!file) return;
      if (state.composeUploadPending) return;
      if (!state.user) { window.openLogin(); return; }
      state.composeUploadPending = true;
      setComposeUploadStatus(`Uploading ${file.name}...`, 'info');

      try {
        if (state.composeUploadSource !== 'blossom') {
          throw new Error('Unsupported upload source selected.');
        }
        const result = await uploadFileToBlossom(file, {
          onProgress: ({ percent }) => {
            if (!Number.isFinite(Number(percent))) return;
            setComposeUploadStatus(`Uploading ${file.name}... ${Number(percent)}%`, 'info');
          }
        });
        if (!appendTextToActiveComposeTarget(result.url)) {
          throw new Error('Could not insert uploaded URL into the active composer.');
        }
        const targetLabel = composeTargetLabel(state.composeUploadTarget);
        setComposeUploadStatus(`Upload complete. Media link inserted into your ${targetLabel}.`, 'success');
        setTimeout(() => {
          const ov = qs('#composeUploadModal');
          if (ov) ov.classList.remove('open');
        }, 500);
      } catch (err) {
        setComposeUploadStatus(err && err.message ? err.message : 'Upload failed.', 'error');
      } finally {
        state.composeUploadPending = false;
        if (input) input.value = '';
      }
    };

    window.publishProfileNote = async function () {
      if (!state.user) { window.openLogin(); return; }
      const textarea = qs('#profileComposeText');
      const btn = qs('#profileComposeBtn');
      const text = (textarea && textarea.value || '').trim();
      if (!text) return;

      if (btn) { btn.disabled = true; btn.textContent = 'Posting...'; }
      try {
        await signAndPublish(1, text, []);
        if (textarea) textarea.value = '';
        window.profileComposeInput(textarea || { value: '' });
        // Refresh feed
        if (state.selectedProfilePubkey) {
          subscribeProfileFeed(state.selectedProfilePubkey);
        }
      } catch (err) {
        alert(err.message || 'Failed to post note.');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Post Note'; }
      }
    };

    // ---- Theater Zap ----
    window.theaterZap = async function () {
      const stream = state.streamsByAddress.get(state.selectedStreamAddress);
      if (!stream) return;
      if (!state.user) { window.openLogin(); return; }
      const p = profileFor(stream.hostPubkey);
      const lud16 = (p.lud16 || '').trim();
      if (!lud16) { alert('This streamer has no Lightning address (lud16) set on their Nostr profile.'); return; }
      if (window.webln) {
        try {
          await window.webln.enable();
          const zapAmountMsats = 21000;
          const zapTags = [['relays', ...state.relays], ['amount', String(zapAmountMsats)], ['p', stream.pubkey], ['e', stream.id]];
          const zapRequest = await signAndPublish(9734, '\u26A1 zapping from Sifaka Live', zapTags);
          const [user, domain] = lud16.split('@');
          const meta = await fetch(`https://${domain}/.well-known/lnurlp/${user}`).then((r) => r.json());
          if (!meta.callback) throw new Error('Invalid LNURL response.');
          const invoiceData = await fetch(`${meta.callback}?amount=${zapAmountMsats}&nostr=${encodeURIComponent(JSON.stringify(zapRequest))}`).then((r) => r.json());
          if (!invoiceData.pr) throw new Error('No payment request returned.');
          await window.webln.sendPayment(invoiceData.pr);
          const zapBtn = qs('#theaterZapBtn');
          if (zapBtn) { const o = zapBtn.innerHTML; zapBtn.textContent = '\u26A1 Zapped!'; setTimeout(() => { zapBtn.innerHTML = o; }, 2000); }
          return;
        } catch (err) { console.warn('WebLN zap failed:', err.message); }
      }
      window.open(`lightning:${lud16}`, '_blank');
    };

    // ---- Share stream ----
    window.closeShareModal = function (e) {
      const ov = qs('#shareModal');
      if (!ov) return;
      if (e && e.target !== ov) return;
      ov.classList.remove('open');
      state.shareModalStreamAddress = '';
    };

    window.copyShareField = async function (fieldId) {
      const input = qs(`#${fieldId}`);
      const val = input ? String(input.value || '').trim() : '';
      if (!val) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(val);
          return;
        }
      } catch (_) {}
      window.prompt('Copy value:', val);
    };

    window.shareStreamAction = async function (mode) {
      const stream = state.streamsByAddress.get(state.shareModalStreamAddress || state.selectedStreamAddress);
      if (!stream) return;
      syncTheaterRoute(stream, 'replace');

      const url = (qs('#shareWebUrl') && qs('#shareWebUrl').value) || window.location.href;
      const text = stream.title ? `Watching "${stream.title}" live on Nostr` : 'Live stream on Nostr';
      const shareBody = `${text}\n${url}`;

      try {
        if (mode === 'boost') {
          if (!state.user) { window.openLogin(); return; }
          const repostTags = [['e', stream.id], ['p', stream.pubkey], ['a', stream.address]];
          const repostContent = stream.raw && stream.raw.id ? JSON.stringify(stream.raw) : '';
          const repostEv = await signAndPublish(6, repostContent, repostTags);
          state.boostedStreamAddresses.add(stream.address);
          if (repostEv && repostEv.id) state.streamBoostEventIdByAddress.set(stream.address, repostEv.id);
          state.streamBoostCheckedByAddress.add(stream.address);
          updateTheaterShareBtn(stream);
          window.closeShareModal();
          return;
        }

        if (mode === 'copy') {
          await window.copyShareField('shareWebUrl');
          return;
        }

        if (mode === 'app') {
          if (navigator.share) {
            await navigator.share({ title: text, text: shareBody, url });
            return;
          }
          window.open(`sms:?&body=${encodeURIComponent(shareBody)}`, '_blank');
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        alert(err && err.message ? err.message : 'Share failed.');
      }
    };

    window.shareStream = async function () {
      const stream = state.streamsByAddress.get(state.selectedStreamAddress);
      if (!stream) return;

      syncTheaterRoute(stream, 'replace');
      state.shareModalStreamAddress = stream.address;

      const webUrl = window.location.href;
      const naddrInput = qs('#shareNaddr');
      const webInput = qs('#shareWebUrl');
      if (webInput) webInput.value = webUrl;

      const initialNaddr = encodeStreamNaddr(stream);
      if (naddrInput) naddrInput.value = initialNaddr || '';
      if (!initialNaddr) {
        ensureNostrTools().then(() => {
          const next = encodeStreamNaddr(stream);
          if (naddrInput) naddrInput.value = next || '';
        }).catch(() => {});
      }

      const ov = qs('#shareModal');
      if (ov) ov.classList.add('open');
    };

    // ---- Badge popup ----
    window.openBadgePopup = function ({ name, desc, image, id, issuer, definition, award }) {
      const ov = qs('#badgePopupOv');
      if (!ov) return;

      const imgWrap = qs('#badgePopupImgWrap');
      const nameEl = qs('#badgePopupName');
      const descEl = qs('#badgePopupDesc');
      const metaEl = qs('#badgePopupMeta');

      const info = badgeInfoFromEvents(award, definition);
      const finalName = (name || info.name || '').trim();
      const finalDesc = desc || info.desc || '';
      const finalId = (id || info.id || '').trim();
      const finalIssuer = (issuer || info.issuer || '').trim();

      if (nameEl) nameEl.textContent = finalName || 'Award';
      if (descEl) descEl.textContent = finalDesc;

      if (imgWrap) {
        imgWrap.innerHTML = '';
        const imageUrl = sanitizeMediaUrl(image || info.image || '');
        if (imageUrl && isLikelyUrl(imageUrl)) {
          const img = document.createElement('img');
          img.src = imageUrl;
          img.alt = finalName || 'Award';
          img.onerror = () => { imgWrap.textContent = ''; };
          imgWrap.appendChild(img);
        } else {
          imgWrap.textContent = '';
        }
      }

      if (metaEl) {
        metaEl.innerHTML = '';
        const rows = [];
        if (finalIssuer) rows.push({ lbl: 'Issued by', val: finalIssuer });
        if (finalId) rows.push({ lbl: 'Badge ID', val: finalId });
        if (definition) {
          if (definition.created_at) {
            rows.push({ lbl: 'Created', val: new Date(definition.created_at * 1000).toLocaleDateString() });
          }
        }
        if (award && award.created_at) {
          rows.push({ lbl: 'Awarded', val: new Date(award.created_at * 1000).toLocaleDateString() });
        }
        rows.forEach(({ lbl, val }) => {
          const row = document.createElement('div');
          row.className = 'badge-popup-meta-row';
          row.innerHTML = `<span class="badge-popup-meta-lbl">${lbl}</span><span class="badge-popup-meta-val"></span>`;
          qs('.badge-popup-meta-val', row).textContent = val;
          metaEl.appendChild(row);
        });
      }

      ov.classList.add('open');
    };

    window.closeBadgePopup = function (e) {
      if (e && e.target !== qs('#badgePopupOv')) return;
      const ov = qs('#badgePopupOv');
      if (ov) ov.classList.remove('open');
    };

    // ---- All Badges popup ----
    window.openAllBadgesPopup = function (badges) {
      const ov = qs('#allBadgesPopupOv');
      const grid = qs('#allBadgesGrid');
      if (!ov || !grid) return;
      grid.innerHTML = '';
      badges.forEach(({ award, definition }) => {
        const chip = document.createElement('div');
        chip.className = 'profile-badge-chip';
        const info = badgeInfoFromEvents(award, definition);
        if (info.image && isLikelyUrl(info.image)) {
          const img = document.createElement('img');
          img.src = info.image; img.alt = info.name; img.loading = 'lazy';
          img.onerror = () => { chip.innerHTML = ''; };
          chip.appendChild(img);
        } else { chip.textContent = ''; }
        chip.title = info.name;
        chip.addEventListener('click', () => { openBadgePopup({ ...info, definition, award }); });
        grid.appendChild(chip);
      });
      ov.classList.add('open');
    };

    window.closeAllBadgesPopup = function (e) {
      if (e && e.target !== qs('#allBadgesPopupOv')) return;
      const ov = qs('#allBadgesPopupOv');
      if (ov) ov.classList.remove('open');
    };

    // ---- Sign out: clear all data, go home ----
    window.signOut = function () {
      cancelRemoteLoginAttempt({ silent: true });
      teardownRemoteSignerSession('Signed out.');
      clearPersistedRemoteSignerSession();
      stopNostrFeedSubscription();
      try { localStorage.clear(); } catch (_) {}
      state.user = null; state.authMode = 'readonly'; state.localSecretKey = null;
      state.remoteSignerSession = null; state.remoteLoginPending = false; state.remoteLoginAbortController = null; state.remoteLoginUri = '';
      state.pendingOnboardingNsec = ''; state.selectedStreamAddress = null;
      state.selectedProfilePubkey = null; state.selectedProfileLiveAddress = null;
      state.playbackAddress = ''; state.playbackUrl = '';
      state.profilePlaybackAddress = ''; state.profilePlaybackUrl = '';
      state.followedPubkeys = new Set(); state.contactListPubkeys = new Set();
      state.contactsLatestCreatedAt = 0; state.contactsContent = '';
      state.contactsPTagByPubkey = new Map(); state.contactsOtherTags = [];
      state.followPublishPending = false;
      state.nip51Lists = new Map(); state.savedExternalLists = [];
      state.nostrFeedFilter = 'following';
      state.nostrFeedEventsById = new Map();
      state.nostrFeedProfileFetchPending = new Set();
      state.nostrFeedRepostLookupPending = new Set();
      state.nostrFeedInteractionHydratedIds = new Set();
      state.nostrFeedInteractionQueuedIds = new Set();
      state.nostrFeedInteractionFetchPending = false;
      state.nostrFeedLoading = false;
      state.nostrFeedError = '';
      state.notificationsById = new Map();
      state.notificationsLoading = false;
      state.notificationsError = '';
      state.notificationsFetchPending = false;
      state.notificationsFetchPromise = null;
      state.notificationsLastLoadedAt = 0;
      state.notificationsLastReadAt = 0;
      state.notificationsProfileFetchPending = new Set();
      state.notificationsTargetNotesById = new Map();
      state.notificationsTargetFetchPending = false;
      state.notificationsTargetFetchPromise = null;
      state.streamZapTotals = new Map();
      state.streamRecentZapsByAddress = new Map();
      state.streamZapEventIdsByAddress = new Map();
      state.likedStreamAddresses = new Set();
      state.streamLikeEventIdByAddress = new Map();
      state.streamLikePublishPending = false;
      state.boostedStreamAddresses = new Set();
      state.streamBoostEventIdByAddress = new Map();
      state.streamBoostCheckedByAddress = new Set();
      state.streamBoostCheckPendingByAddress = new Set();
      state.streamReactionPubkeysByKey = new Map();
      state.streamReactionMetaByKey = new Map();
      state.streamReactionIdByKeyAndPubkey = new Map();
      state.streamReactionEventById = new Map();
      state.streamOwnReactionIdByKey = new Map();
      state.streamReactionPublishPendingByKey = new Set();
      state.chatLikePubkeysByMessageId = new Map();
      state.chatReactionIdByMessageAndPubkey = new Map();
      state.chatReactionEventById = new Map();
      state.chatOwnLikeEventByMessageId = new Map();
      state.chatMessageEventsById = new Map();
      state.chatLikePublishPendingByMessageId = new Set();
      if (state._chatProfileFetchTimer) { clearTimeout(state._chatProfileFetchTimer); state._chatProfileFetchTimer = null; }
      if (state._chatProfileEoseTimer) { clearTimeout(state._chatProfileEoseTimer); state._chatProfileEoseTimer = null; }
      if (state._chatProfileSubId && state.pool) {
        try { state.pool.unsubscribe(state._chatProfileSubId); } catch (_) {}
      }
      state._chatProfileSubId = null;
      if (state.profileStatsSubId && state.pool) {
        try { state.pool.unsubscribe(state.profileStatsSubId); } catch (_) {}
      }
      state.profileStatsSubId = null;
      state.profileStatsTargetPubkey = '';
      state.profileStatsByPubkey = new Map();
      teardownDmSubscription();
      state.dmOwnerPubkey = '';
      state.dmMessagesByPeer = new Map();
      state.dmEventIds = new Set();
      state.dmDecryptPendingIds = new Set();
      state.dmLastReadByPeer = new Map();
      state.dmActivePeerPubkey = '';
      state.dmSearchTerm = '';
      state.dmDraftByPeer = new Map();
      state.dmSendPending = false;
      state.dmLikedMessageIds = new Set();
      state.dmEmojiReactionsByMessageId = new Map();
      state.dmAddressBookOpen = false;
      state.dmThreadLastExpandAt = 0;
      state.dmThreadVisibleLimitByPeer = new Map();
      state.dmDecryptQueue = [];
      state.dmDecryptWorkers = 0;
      state.dmSyncing = false;
      state.dmBackfilling = false;
      state.dmBackfillSubId = null;
      if (state.dmSyncEoseTimer) {
        clearTimeout(state.dmSyncEoseTimer);
        state.dmSyncEoseTimer = null;
      }
      state.dmRenderQueuedConversations = false;
      state.dmRenderQueuedThread = false;
      state.dmRenderScrollToBottom = false;
      state.dmStatus = '';
      state.dmStatusMode = 'info';
      state.postReactionPublishPendingByNoteAndKey = new Set();
      state.postBoostPublishPendingByNoteId = new Set();
      state.reactionPickerTarget = null;
      state.shareModalStreamAddress = '';
      state.videoPostModalToken = 0;
      state.videoPostModalEventId = '';
      state.videoPostModalHostPubkey = '';
      state.videoPostModalStream = null;
      state.videoPostModalIsWatchParty = false;
      stopVideoPostCommentsSubscription();
      stopVideoPostLiveChatSubscription();
      cleanupVideoPostModalPlayer();
      state.videoPostCommentsCacheByEventId = new Map();
      state.videoPostLiveChatCacheByAddress = new Map();
      state.videosProfileFetchPending = new Set();
      clearVideosRenderTimer();
      if (state.videoThumbObserver) {
        try { state.videoThumbObserver.disconnect(); } catch (_) {}
        state.videoThumbObserver = null;
      }
      state.composeUploadSource = 'blossom';
      state.composeUploadPending = false;
      state.composeUploadTarget = 'profile';
      state.gifPickerTarget = 'profile';
      state.gifPickerPending = false;
      state.gifPickerQuery = '';
      state.gifPickerCursor = '';
      state.gifPickerResults = [];
      state.gifPickerRequestId = 0;
      if (state.gifPickerSearchTimer) {
        clearTimeout(state.gifPickerSearchTimer);
        state.gifPickerSearchTimer = null;
      }
      state.nip96DiscoveryByHost = new Map();
      state.goLiveSelectedAddress = '';
      state.goLiveTemplateAddress = '';
      state.goLiveForceNew = false;
      state.goLiveHostMode = 'self';
      state.goLiveRelaysOpen = false;
      state.goLiveThirdPartyProvider = '';
      state.relayPingMsByUrl = new Map();
      if (state.goLivePreviewTimer) {
        clearTimeout(state.goLivePreviewTimer);
        state.goLivePreviewTimer = null;
      }
      if (state.goLivePreviewHls) {
        try { state.goLivePreviewHls.destroy(); } catch (_) {}
        state.goLivePreviewHls = null;
      }
      state.goLiveHiddenEndedAddresses = new Set();
      if (state.profileStatusSubId && state.pool) {
        try { state.pool.unsubscribe(state.profileStatusSubId); } catch (_) {}
      }
      state.profileStatusSubId = null;
      state.profileStatusByPubkey = new Map();
      state.profileStatusSavePending = false;
      state.nip05VerificationByPubkey = new Map();
      state.nip05VerificationPendingByPubkey = new Set();
      state.nip05LookupCacheByNip05 = new Map();
      state.oneShotQueryCacheByKey = new Map();
      state.oneShotQueryInflightByKey = new Map();
      if (state.liveStreamCachePersistTimer) {
        clearTimeout(state.liveStreamCachePersistTimer);
        state.liveStreamCachePersistTimer = null;
      }
      window.closeAllDD();
      ['goLiveModal','endModal','loginModal','settingsModal','faqModal','shareModal','videoPostModal','reactionPickerModal','composeUploadModal','gifPickerModal'].forEach((id) => {
        const el = qs('#' + id); if (el) el.classList.remove('open');
      });
      setUserUi();
      stopAllAudio(null);
      setActiveViewerAddress('');
      window.showPage('home');
    };
  }

  function initEmojiPicker() {
    const emojis = [':)', ':D', '<3', ':fire:', ':zap:', ':rocket:', ':100:', ':wave:', ':music:', ':clap:'];
    const grid = qs('#epGrid');
    if (grid) {
      grid.innerHTML = '';
      emojis.forEach((emoji) => {
        const d = document.createElement('div');
        d.className = 'ep-emoji';
        d.textContent = emoji;
        d.onclick = () => {
          const input = qs('.chat-inp');
          if (input) input.value += emoji;
          window.closeEmoji();
        };
        grid.appendChild(d);
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-acts')) window.closeEmoji();
      if (!e.target.closest('.logo-wrap') && !e.target.closest('.nav-profile')) window.closeAllDD();
    });

    // Backdrop clicks should not dismiss modals. Close controls handle dismissal.
  }

  function attachSeparatedPageModules() {
    if (window.__SIFAKA_SEPARATED_PAGES_ATTACHED) return;
    window.__SIFAKA_SEPARATED_PAGES_ATTACHED = true;

    const views = window.SifakaPageViews || {};

    if (typeof views.mountCommunities === 'function' && typeof window.showPage === 'function') {
      const originalShowPage = window.showPage;
      window.showPage = function (p, opts = {}) {
        const out = originalShowPage(p, opts);
        if (p === 'communities') {
          try { views.mountCommunities(); } catch (_) {}
        }
        return out;
      };
    }

    if (typeof views.showTheaterLayout === 'function' && typeof window.showVideoPage === 'function') {
      const originalShowVideoPage = window.showVideoPage;
      window.showVideoPage = function (opts = {}) {
        try {
          stopNostrFeedSubscription();
          const feed = qs('#feedPage');
          if (feed) feed.style.display = 'none';
          const videos = qs('#videosPage');
          if (videos) videos.style.display = 'none';
          const notifications = qs('#notificationsPage');
          if (notifications) notifications.style.display = 'none';
          const myStreams = qs('#myStreamsPage');
          if (myStreams) myStreams.style.display = 'none';
          views.showTheaterLayout({
            opts,
            qs,
            state,
            setActiveViewerAddress,
            syncTheaterRoute,
            stopHeroCycle,
            stopAllAudio,
            renderRecoStreams: window.renderRecoStreams,
            showMini: window.showMini,
            hideMini: window.hideMini,
            scrollToTop: () => window.scrollTo(0, 0)
          });
          return;
        } catch (_) {}
        return originalShowVideoPage(opts);
      };
    }

    if (typeof views.prepareProfileLayout === 'function' && typeof window.showProfile === 'function') {
      const originalShowProfile = window.showProfile;
      window.showProfile = function (name, av, npub, nip05, rawPubkey, opts = {}) {
        try {
          views.prepareProfileLayout({
            qs,
            setActiveViewerAddress,
            stopHeroCycle,
            stopAllAudio
          });
        } catch (_) {}
        return originalShowProfile(name, av, npub, nip05, rawPubkey, opts);
      };
    }

    if (typeof views.openCommunities === 'function') {
      window.showCommunities = function () {
        views.openCommunities({ showPage: window.showPage, document });
      };
    }
  }

  function initRelay() {
    rebuildRelayPool();
  }

  async function init() {
    loadSettingsFromStorage();
    loadFollowedPubkeys();
    loadSavedExternalLists();
    loadPersistedNostrFeedFilter();
    loadNotificationsLastReadFromStorage();
    loadLiveStreamsCache();
    applySettingsToDocument();
    restoreRouteFromSpaFallbackQuery();

    bindLegacyGlobals();
    attachSeparatedPageModules();
    initEmojiPicker();
    wireEvents();
    document.addEventListener('visibilitychange', () => {
      if (isHomeViewActive()) ensureHomeLiveSubscription();
      else stopLiveSubscription();
      if (shouldRunHeroCycle()) {
        if (!state.featuredCycleTimer) startHeroCycle();
      } else {
        stopHeroCycle();
      }
    });
    window.addEventListener('popstate', () => {
      syncViewFromLocation({ fallbackMode: 'skip' });
    });

    const logoBtn = qs('#logoBtn');
    if (logoBtn) logoBtn.addEventListener('click', (e) => { e.stopPropagation(); window.toggleDD('logo'); });
    const pill = qs('#navUserPill');
    if (pill) pill.addEventListener('click', (e) => { e.stopPropagation(); window.toggleDD('profile'); });

    if (state.streamsByAddress.size) renderLiveGrid();
    initRelay();
    const restoredRemote = await tryRestoreRemoteLogin();
    if (!restoredRemote) await tryRestoreLocalLogin();
    setUserUi();
    syncViewFromLocation({ fallbackMode: 'replace' });

    // Render saved external lists immediately (they come from localStorage)
    renderListFilterDD();
    renderNostrFeedFilterSelect();
    renderLiveGrid();
  }

  document.addEventListener('DOMContentLoaded', init);
})();






















