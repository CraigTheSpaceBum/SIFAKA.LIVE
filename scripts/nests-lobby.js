(function () {
  'use strict';

  const RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://relay.primal.net',
    'wss://relay.nostr.band',
    'wss://relay.nostr.net'
  ];
  const PRESENCE_TTL = 5 * 60;
  let modal, activeRoomUrl = '', sockets = [], refreshTimer = null, liveRefreshTimer = null, countdownTimer = null, chatSince = 0;
  let activeRoom = null, activeRoomEvent = null, activeRoomRelays = [];
  let activeRoomAudio = null, activeRoomAudioModulesPromise = null;
  let activeRoomPresenceTimer = null, activeRoomRefreshTimer = null, activeRoomChatTimer = null;
  let activeRoomRefreshInFlight = false, activeRoomChatRefreshInFlight = false;
  let activeRoomJoinPromise = null;
  let activeRoomAdminTimer = null;
  let activeRoomHandRaised = false;
  let activeRoomReactions = [];
  let activeRoomChatReactions = new Map();
  let activeRoomCustomEmojis = [];
  let roomPageMode = false, roomPageRoot = null, roomPageNaddr = '';

  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => {
    const d = document.createElement('div');
    d.textContent = String(v == null ? '' : v);
    return d.innerHTML;
  };
  const now = () => Math.floor(Date.now() / 1000);

  function tag(ev, name) {
    const t = (ev && ev.tags || []).find(x => Array.isArray(x) && x[0] === name);
    return t ? String(t[1] || '') : '';
  }
  function tags(ev, name) {
    return (ev && ev.tags || []).filter(x => Array.isArray(x) && x[0] === name)
      .map(x => String(x[1] || '')).filter(Boolean);
  }
  function pTags(ev) {
    return (ev && ev.tags || []).filter(x => Array.isArray(x) && x[0] === 'p' && x[1])
      .map(x => ({ pubkey: String(x[1]).toLowerCase(), role: String(x[3] || 'Participant'), relay: String(x[2] || '') }));
  }
  function formatDate(ts) {
    if (!ts) return '';
    try {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit'
      }).format(new Date(Number(ts) * 1000));
    } catch (_) { return ''; }
  }
  function relativeTime(ts) {
    const diff = Number(ts) - now();
    if (Math.abs(diff) < 60) return diff >= 0 ? 'Starting now' : 'Just started';
    const mins = Math.round(Math.abs(diff) / 60);
    if (mins < 60) return diff >= 0 ? 'Starts in ' + mins + ' min' : 'Started ' + mins + ' min ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return diff >= 0 ? 'Starts in ' + hours + 'h' : 'Started ' + hours + 'h ago';
    const days = Math.round(hours / 24);
    return diff >= 0 ? 'Starts in ' + days + 'd' : 'Started ' + days + 'd ago';
  }
  function roleClass(role) {
    const r = String(role || '').toLowerCase();
    if (r.includes('host') || r.includes('owner')) return 'host';
    if (r.includes('moderator') || r.includes('admin')) return 'moderator';
    if (r.includes('speaker')) return 'speaker';
    return 'participant';
  }
  function normalizeRoomNaddr(url) {
    const token = String(url || '').trim().split('/').filter(Boolean).pop() || '';
    const value = token.toLowerCase();
    return /^naddr1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(value) ? value : '';
  }

  function roomPageUrlFromNaddr(naddr) {
    const value = normalizeRoomNaddr(naddr);
    return value ? (window.location.origin + '/room/' + value) : '';
  }

  function decodeRoom(url) {
    try {
      const nt = window.NostrTools;
      if (!nt || !nt.nip19 || !nt.nip19.decode) return null;
      const token = String(url || '').split('/').filter(Boolean).pop();
      if (!token || token.indexOf('naddr1') !== 0) return null;
      const d = nt.nip19.decode(token).data;
      if (!d || Number(d.kind) !== 30312) return null;
      const pubkey = String(d.pubkey || '').toLowerCase();
      const identifier = String(d.identifier || '');
      return {
        pubkey: pubkey,
        d: identifier,
        a: '30312:' + pubkey + ':' + identifier,
        relays: Array.isArray(d.relays) ? d.relays.slice() : []
      };
    } catch (_) { return null; }
  }

  function relayQuery(filters, timeout, relayUrls) {
    timeout = timeout || 4200;
    const relayList = Array.from(new Set((Array.isArray(relayUrls) && relayUrls.length ? relayUrls : RELAYS)
      .map(function(url) { return String(url || '').trim(); })
      .filter(function(url) { return /^wss:\/\//i.test(url); })));
    if (!relayList.length) relayList.push.apply(relayList, RELAYS);
    return new Promise(function(resolve) {
      const events = new Map();
      let pending = relayList.length, settled = false;
      const localSockets = [];
      const relayDone = new Set();
      const markRelayDone = function(index) {
        if (relayDone.has(index)) return false;
        relayDone.add(index);
        pending--;
        return true;
      };
      const finish = function() {
        if (settled) return;
        settled = true;
        localSockets.forEach(function(ws) { try { ws.close(); } catch (_) {} });
        resolve(Array.from(events.values()));
      };
      const timer = setTimeout(finish, timeout);
      relayList.forEach(function(relay, relayIndex) {
        let ws;
        try { ws = new WebSocket(relay); }
        catch (_) { markRelayDone(relayIndex); if (!pending) { clearTimeout(timer); finish(); } return; }
        localSockets.push(ws);
        ws.onopen = function() {
          try { ws.send(JSON.stringify(['REQ', 'sifaka-nest-' + Math.random().toString(36).slice(2), ...filters])); } catch (_) {}
        };
        ws.onmessage = function(message) {
          try {
            const m = JSON.parse(message.data);
            if (m[0] === 'EVENT' && m[2] && m[2].id) events.set(m[2].id, m[2]);
            if (m[0] === 'EOSE') {
              markRelayDone(relayIndex);
              if (!pending) { clearTimeout(timer); finish(); }
            }
          } catch (_) {}
        };
        ws.onerror = function() {
          markRelayDone(relayIndex);
          if (!pending) { clearTimeout(timer); finish(); }
        };
        ws.onclose = function() {
          markRelayDone(relayIndex);
          if (!pending) { clearTimeout(timer); finish(); }
        };
      });
    });
  }

  async function loadProfiles(pubkeys) {
    const keys = Array.from(new Set(pubkeys.filter(Boolean).map(function(x) { return x.toLowerCase(); }))).slice(0, 24);
    if (!keys.length) return new Map();
    const events = await relayQuery([{ kinds: [0], authors: keys, limit: 80 }], 3200);
    const map = new Map();
    events.sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); });
    events.forEach(function(ev) {
      if (map.has(ev.pubkey)) return;
      try {
        const j = JSON.parse(ev.content || '{}');
        map.set(ev.pubkey.toLowerCase(), {
          displayName: String(j.display_name || '').trim(),
          name: String(j.name || '').trim(),
          picture: String(j.picture || '').trim(),
          banner: String(j.banner || '').trim(),
          about: String(j.about || '').trim()
        });
      } catch (_) {}
    });
    return map;
  }

  function getCardFallback(button) {
    const card = button && button.closest('.nests-room-card');
    if (!card) return {};
    const title = $('.nests-room-body h3', card)?.textContent?.trim()
      || $('.nests-room-title', card)?.textContent?.trim()
      || 'Nostr Nest';
    const summary = $('.nests-room-body p', card)?.textContent?.trim() || '';
    const meta = Array.from(card.querySelectorAll('.nests-room-meta span')).map(function(x) { return x.textContent.trim(); }).filter(Boolean);
    const countText = meta.find(function(x) { return /listening|audio room|listener/i.test(x); }) || '';
    const host = meta.find(function(x) { return x !== countText && x !== '·'; }) || '';
    const img = $('.nests-room-cover img', card)?.getAttribute('src') || '';
    const badge = $('.nests-live-badge', card)?.textContent?.trim() || '';
    const topics = Array.from(card.querySelectorAll('.nests-topic')).map(function(x) { return x.textContent.replace(/^#/, '').trim(); }).filter(Boolean);

    // The Nest card markup has changed a few times. Prefer an explicit room URL,
    // then an href, then the legacy inline joinNestsRoom(...) handler.
    let url = String(
      button.getAttribute('data-room-url') ||
      button.getAttribute('data-room') ||
      card.getAttribute('data-room-url') ||
      card.getAttribute('data-room') ||
      ''
    ).trim();

    if (!url) {
      const link = button.closest('a[href]') || (button.tagName === 'A' ? button : null);
      if (link) url = String(link.getAttribute('href') || '').trim();
    }

    if (!url) {
      const onclick = button.getAttribute('onclick') || '';
      const match = onclick.match(/joinNestsRoom\s*\((.*)\)/);
      if (match) {
        const raw = String(match[1] || '').trim();
        try { url = JSON.parse(raw); }
        catch (_) {
          try { url = JSON.parse('"' + raw.replace(/\\\\/g, '\\\\').replace(/"/g, '\\"') + '"'); }
          catch (_) { url = raw.replace(/^['"]|['"]$/g, ''); }
        }
      }
    }

    // Last-resort: look for any room button in the same card that still carries
    // the legacy join handler.
    if (!url) {
      const legacy = Array.from(card.querySelectorAll('[onclick*="joinNestsRoom"]')).find(function(el) {
        return el !== button;
      });
      if (legacy) {
        const onclick = legacy.getAttribute('onclick') || '';
        const match = onclick.match(/joinNestsRoom\s*\((.*)\)/);
        if (match) {
          const raw = String(match[1] || '').trim();
          try { url = JSON.parse(raw); } catch (_) { url = raw.replace(/^['"]|['"]$/g, ''); }
        }
      }
    }

    return { title: title, summary: summary, host: host, countText: countText, img: img, badge: badge, topics: topics, url: url };
  }

  function getSifakaContext() {
    return window.__SIFAKA_CONTEXT || null;
  }

  let nestAudioUnlockBound = false;
  function bindNestAudioUnlock() {
    if (nestAudioUnlockBound) return;
    nestAudioUnlockBound = true;
    const resume = function() {
      try {
        document.querySelectorAll('#nestRoomPageRoot, #nestRoomPreviewModal').forEach(function(root) {
          if (!root) return;
        });
      } catch (_) {}
      if (!activeRoomAudio) return;
      if (activeRoomAudio.resumeAudio) activeRoomAudio.resumeAudio().catch(function() {});
    };
    ['pointerdown','touchstart','mousedown','keydown','click'].forEach(function(name) {
      document.addEventListener(name, resume, { passive: true });
    });
  }

  async function loadNestAudioModules() {
    if (!activeRoomAudioModulesPromise) {
      activeRoomAudioModulesPromise = Promise.all([
        import('https://esm.sh/@moq/net@0.3.8'),
        import('https://esm.sh/@moq/watch@0.5.4'),
        import('https://esm.sh/@moq/publish@0.4.7')
      ]).then(function(modules) {
        return { Moq: modules[0], Watch: modules[1], Publish: modules[2] };
      });
    }
    return activeRoomAudioModulesPromise;
  }

  function closeAudioEntry(entry) {
    if (!entry) return;
    try { entry.emitter && entry.emitter.close(); } catch (_) {}
    try { entry.decoder && entry.decoder.close(); } catch (_) {}
    try { entry.audioSource && entry.audioSource.close(); } catch (_) {}
    try { entry.sync && entry.sync.close(); } catch (_) {}
    try { entry.broadcast && entry.broadcast.close(); } catch (_) {}
  }

  class SifakaNestAudioTransport {
    constructor() {
      this.connection = null;
      this.entries = new Map();
      this.state = 'disconnected';
      this.volume = 1;
      this.muted = false;
      this.listeners = new Set();
      this.announcementDispose = null;
      this.statusDispose = null;
      this.errorDispose = null;
      this.connectionError = '';
      this.pollTimer = null;
      this.announcementConsumer = null;
      this.identity = '';
      this.publishRequested = false;
      this.publishDeclined = false;
      this.isPublishing = false;
      this.microphoneReady = false;
      this.microphoneError = '';
      this.microphoneSourceDispose = null;
      this.microphoneErrorDispose = null;
      this.microphoneMuted = false;
      this.stageParticipants = new Set();
      this.announcedParticipants = new Set();
      this.microphone = null;
      this.publishBroadcast = null;
      this.publishAudioSource = null;
      this.publishCapture = null;
      this.publishEncoder = null;
      this.Moq = null;
      this.Watch = null;
      this.Publish = null;
    }

    onStateChange(cb) {
      this.listeners.add(cb);
      const self = this;
      return function() { self.listeners.delete(cb); };
    }

    emitState(next) {
      this.state = next;
      this.listeners.forEach(function(cb) { try { cb(next); } catch (_) {} });
    }

    async connect(config) {
      await this.disconnect();
      const libs = await loadNestAudioModules();
      this.Moq = libs.Moq;
      this.Watch = libs.Watch;
      this.Publish = libs.Publish;
      this.identity = String(config.identity || '').toLowerCase();
      this.publishRequested = !!config.publish;
      this.connectionError = '';
      this.emitState('connecting');

      const relayUrl = new URL(String(config.serverUrl));
      relayUrl.pathname = '/' + String(config.namespace || '');
      if (config.token) relayUrl.searchParams.set('jwt', config.token);

      this.connection = new this.Moq.Connection({
        url: relayUrl,
        enabled: true,
        delay: { initial: 1000, multiplier: 2, max: 30000 },
        discovery: true,
        webtransport: {},
        websocket: {}
      });
      bindNestAudioUnlock();

      const self = this;
      if (this.connection.status && this.connection.status.watch) {
        this.statusDispose = this.connection.status.watch(function(status) {
          if (status === 'connected') {
            self.emitState('connected');
            self.startAnnouncements();
            if (self.publishRequested && !self.publishDeclined && !self.isPublishing) {
              self.startMicrophonePublish().catch(function(err) {
                console.warn('[sifaka-nests] microphone publish unavailable; continuing as listener', err);
              });
            }
          } else if (status === 'connecting') {
            self.emitState(self.state === 'disconnected' ? 'connecting' : 'reconnecting');
          } else if (status === 'disconnected') {
            self.emitState('disconnected');
            self.stopAnnouncements();
            self.closeMicrophonePublish();
          }
        });
      }

      if (this.connection.error && this.connection.error.watch) {
        this.errorDispose = this.connection.error.watch(function(error) {
          if (!error) return;
          self.connectionError = error && error.message ? error.message : String(error);
          self.emitState('error');
          updateActiveRoomAudioUi();
          console.warn('[sifaka-nests] MoQ connection error', error);
        });
      }

      const initialState = this.connection.status && this.connection.status.peek
        ? this.connection.status.peek()
        : 'connecting';
      if (initialState === 'connected') {
        this.emitState('connected');
        this.startAnnouncements();
        if (this.publishRequested && !this.publishDeclined && !this.isPublishing) {
          try { await this.startMicrophonePublish(); } catch (err) {
            console.warn('[sifaka-nests] microphone publish unavailable; continuing as listener', err);
          }
        }
      }
    }

    async startMicrophonePublish() {
      if (!this.connection || !this.Publish || this.isPublishing || this.publishDeclined) return;
      this.closeMicrophonePublish();

      let microphone = null;
      let audioSource = null;
      let capture = null;
      let broadcast = null;
      let encoder = null;

      try {
        microphone = new this.Publish.Source.Microphone({ enabled: true });
        audioSource = new this.Publish.Signals.Computed(function(effect) {
          const source = effect.get(microphone.out.source);
          return source && source.audio;
        });
        capture = new this.Publish.Audio.Capture({ source: audioSource });
        broadcast = new this.Publish.Broadcast({
          origin: this.connection.origin,
          enabled: true,
          announce: true,
          name: this.Moq.Path.from(this.identity)
        });
        encoder = new this.Publish.Audio.Encoder('audio', {
          broadcast: broadcast,
          capture: capture,
          enabled: true
        });

        this.microphone = microphone;
        this.publishBroadcast = broadcast;
        this.publishAudioSource = audioSource;
        this.publishCapture = capture;
        this.publishEncoder = encoder;
        this.microphoneReady = false;
        this.microphoneError = '';

        const self = this;
        this.microphoneSourceDispose = microphone.out.source.subscribe(function(source) {
          self.microphoneReady = !!source;
          if (source) self.microphoneError = '';
          updateActiveRoomAudioUi();
          if (activeRoom && activeRoom.a) publishCurrentRoomPresence().catch(function() {});
        });
        this.microphoneErrorDispose = microphone.out.error.subscribe(function(error) {
          self.microphoneError = error ? (error.message || String(error)) : '';
          if (error) self.microphoneReady = false;
          updateActiveRoomAudioUi();
          if (error) publishCurrentRoomPresence().catch(function() {});
        });

        const initialSource = microphone.out.source.peek();
        const initialError = microphone.out.error.peek();
        this.microphoneReady = !!initialSource;
        this.microphoneError = initialError ? (initialError.message || String(initialError)) : '';

        if (encoder.volume) {
          try { encoder.volume.set(this.microphoneMuted ? 0 : 1); } catch (_) {}
        }

        this.isPublishing = true;
        updateActiveRoomAudioUi();
      } catch (err) {
        try { if (encoder) encoder.close(); } catch (_) {}
        try { if (capture) capture.close(); } catch (_) {}
        try { if (audioSource) audioSource.close(); } catch (_) {}
        try { if (broadcast) broadcast.close(); } catch (_) {}
        try { if (microphone) microphone.close(); } catch (_) {}
        this.microphone = null;
        this.publishBroadcast = null;
        this.publishAudioSource = null;
        this.publishCapture = null;
        this.publishEncoder = null;
        this.microphoneReady = false;
        this.microphoneError = err && err.message ? err.message : String(err);
        this.isPublishing = false;
        updateActiveRoomAudioUi();
        throw err;
      }
    }

    async leaveStage() {
      this.publishDeclined = true;
      await publishActiveRoomDeparture();
      this.closeMicrophonePublish();
      updateActiveRoomAudioUi();
    }

    async rejoinStage() {
      if (!this.connection || !activeRoom || !activeRoomEvent || !activeRoomCanPublish()) {
        throw new Error('You do not currently have permission to join the stage.');
      }
      if (this.isPublishing) return;

      const ctx = getSifakaContext();
      const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
      if (!user) throw new Error('Please sign in to join the stage.');

      const d = String(tag(activeRoomEvent, 'd') || activeRoom.d || '');
      const namespace = 'nests/30312:' + activeRoomEvent.pubkey + ':' + d;
      const streamingUrl = normalizeNestStreamingUrl(tag(activeRoomEvent, 'streaming') || activeRoom.streaming || '');
      const token = await authenticateNestAudio(activeRoomEvent, namespace, true);

      const volume = this.volume;
      const muted = this.muted;
      await this.disconnect();

      activeRoomAudio = new SifakaNestAudioTransport();
      activeRoomAudio.volume = volume;
      activeRoomAudio.muted = muted;
      activeRoomAudio.publishRequested = true;
      activeRoomAudio.onStateChange(function() { updateActiveRoomAudioUi(); });
      await activeRoomAudio.connect({
        serverUrl: streamingUrl,
        namespace: namespace,
        identity: String(user.pubkey),
        token: token,
        publish: true
      });
      if (activeRoom && Array.isArray(activeRoom.participants)) {
        activeRoomAudio.setParticipants(activeRoom.participants
          .filter(function(person) {
            const role = String(person && person.role || '').toLowerCase();
            return /host|speaker|moderator|admin|owner/.test(role);
          })
          .map(function(person) { return person && person.pubkey; })
          .filter(Boolean));
      }
      startActiveRoomPresence();
      updateActiveRoomAudioUi();
    }

    closeMicrophonePublish() {
      if (this.microphoneSourceDispose) {
        try { this.microphoneSourceDispose(); } catch (_) {}
        this.microphoneSourceDispose = null;
      }
      if (this.microphoneErrorDispose) {
        try { this.microphoneErrorDispose(); } catch (_) {}
        this.microphoneErrorDispose = null;
      }
      this.microphoneReady = false;
      this.microphoneError = '';
      if (this.publishEncoder) {
        try { this.publishEncoder.close(); } catch (_) {}
        this.publishEncoder = null;
      }
      if (this.publishCapture) {
        try { this.publishCapture.close(); } catch (_) {}
        this.publishCapture = null;
      }
      if (this.publishAudioSource) {
        try { this.publishAudioSource.close(); } catch (_) {}
        this.publishAudioSource = null;
      }
      if (this.publishBroadcast) {
        try { this.publishBroadcast.close(); } catch (_) {}
        this.publishBroadcast = null;
      }
      if (this.microphone) {
        try { this.microphone.close(); } catch (_) {}
        this.microphone = null;
      }
      this.isPublishing = false;
      updateActiveRoomAudioUi();
    }

    startAnnouncements() {
      this.stopAnnouncements();
      if (!this.connection) return;
      const self = this;
      try {
        const consumer = this.connection.announced();
        this.announcementConsumer = consumer;
        this.announcementDispose = function() {
          try { consumer.close(); } catch (_) {}
          self.announcementConsumer = null;
        };
        (async function() {
          try {
            for (;;) {
              const update = await consumer.next();
              if (!update) break;
              self.processAnnouncementUpdate(update);
            }
          } catch (err) {
            if (self.connection) console.warn('[sifaka-nests] announcement stream failed', err);
          }
        })();
      } catch (err) {
        console.warn('[sifaka-nests] could not start announcement stream', err);
      }
    }

    stopAnnouncements() {
      if (this.announcementDispose) {
        try { this.announcementDispose(); } catch (_) {}
        this.announcementDispose = null;
      }
      this.announcementConsumer = null;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.announcedParticipants = new Set();
      this.reconcileParticipants();
    }

    processAnnouncementUpdate(update) {
      if (!this.connection || !update) return;
      const pubkey = String(update.prefix || '').toLowerCase();
      if (!pubkey || pubkey === String(this.identity || '').toLowerCase()) return;
      if (!/^[0-9a-f]{64}$/.test(pubkey)) return;
      if (update.kind === 'retracted') this.announcedParticipants.delete(pubkey);
      else this.announcedParticipants.add(pubkey);
      this.reconcileParticipants();
    }

    reconcileParticipants() {
      if (!this.connection) return;
      const current = new Set(this.announcedParticipants || []);
      const self = this;

      // Keep explicitly advertised on-stage speakers subscribed even when the
      // MoQ announcement set temporarily lags during reconnects or relay churn.
      self.stageParticipants.forEach(function(pubkey) {
        if (!pubkey || pubkey === String(self.identity || '').toLowerCase()) return;
        current.add(pubkey);
      });

      current.forEach(function(pubkey) {
        if (!self.entries.has(pubkey)) self.subscribeParticipant(pubkey);
      });

      Array.from(this.entries.keys()).forEach(function(pubkey) {
        if (!current.has(pubkey)) {
          closeAudioEntry(self.entries.get(pubkey));
          self.entries.delete(pubkey);
        }
      });
      updateActiveRoomAudioUi();
    }

    subscribeParticipant(pubkey) {
      if (!this.connection || !this.Watch || !this.Moq || this.entries.has(pubkey)) return;
      try {
        const broadcast = new this.Watch.Broadcast({
          origin: this.connection.origin,
          enabled: true,
          name: this.Moq.Path.from(pubkey),
          announced: true
        });
        const sync = new this.Watch.Sync({
          probe: this.connection.probe
        });
        const audioSource = new this.Watch.Audio.Source({
          broadcast: broadcast,
          supported: this.Watch.Audio.Decoder.supported
        });
        const decoder = new this.Watch.Audio.Decoder({
          source: audioSource,
          sync: sync,
          enabled: true
        });
        const emitter = new this.Watch.Audio.Emitter({
          source: decoder,
          volume: this.muted ? 0 : this.volume,
          muted: this.muted
        });
        this.entries.set(pubkey, { broadcast, sync, audioSource, decoder, emitter });
      } catch (err) {
        console.warn('[sifaka-nests] participant audio failed', err);
      }
      updateActiveRoomAudioUi();
    }

    async resumeAudio() {
      this.entries.forEach(function(entry) {
        try {
          const contextSignal = entry.decoder && entry.decoder.out && entry.decoder.out.context;
          const context = contextSignal && typeof contextSignal.peek === 'function' ? contextSignal.peek() : null;
          if (context && context.state === 'suspended') context.resume().catch(function() {});
        } catch (_) {}
      });
      try {
        const microphoneContext = this.microphone && this.microphone.out && this.microphone.out.source;
        void microphoneContext;
      } catch (_) {}
    }

    setParticipants(pubkeys) {
      if (!this.connection) return;
      // Treat the NIP-53 stage roster as an additive hint, not an authoritative
      // replacement for MoQ announcements. A room event can lag behind the
      // transport announcement by several seconds; keep stage speakers alive
      // until the roster itself changes.
      const wanted = new Set((Array.isArray(pubkeys) ? pubkeys : [])
        .map(function(value) { return String(value || '').trim().toLowerCase(); })
        .filter(function(value) {
          return /^[0-9a-f]{64}$/.test(value) && value !== String(this.identity || '').toLowerCase();
        }, this));

      this.stageParticipants = wanted;
      this.reconcileParticipants();
      updateActiveRoomAudioUi();
    }

    setMicrophoneMuted(value) {
      this.microphoneMuted = !!value;
      if (this.publishEncoder && this.publishEncoder.volume) {
        try { this.publishEncoder.volume.set(this.microphoneMuted ? 0 : 1); } catch (_) {}
      }
      updateActiveRoomAudioUi();
    }

    setVolume(value) {
      this.volume = Math.max(0, Math.min(1, Number(value) || 0));
      this.entries.forEach(function(entry) {
        try { entry.emitter.volume.set(this.muted ? 0 : this.volume); } catch (_) {}
      }, this);
    }

    setMuted(value) {
      this.muted = !!value;
      this.entries.forEach(function(entry) {
        try {
          entry.emitter.muted.set(this.muted);
          entry.emitter.volume.set(this.muted ? 0 : this.volume);
        } catch (_) {}
      }, this);
    }

    async disconnect() {
      this.stopAnnouncements();
      this.closeMicrophonePublish();
      if (this.statusDispose) {
        try { this.statusDispose(); } catch (_) {}
        this.statusDispose = null;
      }
      if (this.errorDispose) {
        try { this.errorDispose(); } catch (_) {}
        this.errorDispose = null;
      }
      this.connectionError = '';
      this.entries.forEach(function(entry) { closeAudioEntry(entry); });
      this.entries.clear();
      this.announcedParticipants = new Set();
      if (this.connection) {
        try { this.connection.close(); } catch (_) {}
        try { this.connection.enabled.set(false); } catch (_) {}
      }
      this.connection = null;
      this.emitState('disconnected');
    }
  }
  function roomRelayUrls(room, decoded) {
    const ctx = getSifakaContext();
    const defaults = ctx && typeof ctx.getRelays === 'function' ? ctx.getRelays() : [];
    const tagged = room && Array.isArray(room.relays) ? room.relays : [];
    const hinted = decoded && Array.isArray(decoded.relays) ? decoded.relays : [];
    return Array.from(new Set(defaults.concat(tagged, hinted)
      .map(function(url) { return String(url || '').trim(); })
      .filter(function(url) { return /^wss:\/\//i.test(url); })));
  }

  async function signRoomEvent(kind, content, tags) {
    const ctx = getSifakaContext();
    if (!ctx || typeof ctx.signEvent !== 'function') {
      throw new Error('Please sign in to interact with this Nest.');
    }
    return ctx.signEvent(kind, content, tags);
  }

  async function publishSignedRoomEvent(event, relays) {
    const relayList = Array.from(new Set((relays || [])
      .map(function(url) { return String(url || '').trim(); })
      .filter(function(url) { return /^wss:\/\//i.test(url); })));
    if (!relayList.length) throw new Error('No room relays are available.');

    const results = await Promise.all(relayList.map(function(relay) {
      return new Promise(function(resolve) {
        let settled = false;
        let ws = null;
        const timer = setTimeout(function() {
          if (settled) return;
          settled = true;
          try { if (ws) ws.close(); } catch (_) {}
          resolve(false);
        }, 5000);
        try { ws = new WebSocket(relay); } catch (_) { clearTimeout(timer); resolve(false); return; }
        ws.onopen = function() {
          try { ws.send(JSON.stringify(['EVENT', event])); } catch (_) {}
        };
        ws.onmessage = function(message) {
          try {
            const payload = JSON.parse(message.data);
            if (payload[0] === 'OK') {
              clearTimeout(timer);
              settled = true;
              try { ws.close(); } catch (_) {}
              resolve(!!payload[2]);
            }
          } catch (_) {}
        };
        ws.onerror = function() {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          try { ws.close(); } catch (_) {}
          resolve(false);
        };
      });
    }));
    if (!results.some(Boolean)) throw new Error('Could not publish the Nest event to any room relay.');
  }

  async function sha256Hex(text) {
    try {
      if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return '';
      const data = new TextEncoder().encode(String(text || ''));
      const digest = await window.crypto.subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(digest)).map(function(byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
    } catch (_) {
      return '';
    }
  }

  function nestAuthError(status, detail) {
    const message = 'Nest audio authentication failed (' + status + ')' + (detail ? ': ' + detail : '.');
    const error = new Error(message);
    error.status = Number(status || 0);
    error.detail = String(detail || '');
    if (error.detail) {
      try {
        const json = JSON.parse(error.detail);
        error.code = String(json && json.code || '');
      } catch (_) {}
    }
    return error;
  }

  async function republishRoomEventForAudioAuth(roomEvent) {
    if (!roomEvent || Number(roomEvent.kind) !== 30312 || !roomEvent.id) return false;
    const decoded = decodeRoom(activeRoomUrl);
    const relayList = Array.from(new Set(
      RELAYS
        .concat(roomRelayUrls(activeRoom, decoded))
        .concat(tags(roomEvent, 'relays'))
        .concat(decoded && decoded.relays ? decoded.relays : [])
        .map(function(url) { return String(url || '').trim(); })
        .filter(function(url) { return /^wss:\/\//i.test(url); })
    ));
    if (!relayList.length) return false;
    try {
      await publishSignedRoomEvent(roomEvent, relayList);
      return true;
    } catch (err) {
      console.warn('[sifaka-nests] could not republish room event for audio auth', err);
      return false;
    }
  }

  async function authenticateNestAudio(roomEvent, namespace, publish) {
    const ctx = getSifakaContext();
    const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
    if (!user || typeof ctx.signEvent !== 'function') throw new Error('Please sign in to join Nest audio.');

    const authUrl = tag(roomEvent, 'auth') || 'https://moq-auth.nostrnests.com';
    const endpoint = authUrl.replace(/\/$/, '') + '/auth';
    const body = JSON.stringify({ namespace: namespace, publish: !!publish });

    async function requestToken() {
      const authTags = [['u', endpoint], ['method', 'POST']];
      const payloadHash = await sha256Hex(body);
      if (payloadHash) authTags.push(['payload', payloadHash]);
      const signed = await ctx.signEvent(27235, '', authTags);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Nostr ' + btoa(JSON.stringify(signed))
        },
        body: body
      });
      if (!response.ok) {
        const detail = (await response.text().catch(function() { return ''; })).trim();
        throw nestAuthError(response.status, detail);
      }
      const data = await response.json();
      if (!data || !data.token) throw new Error('Nest audio authentication returned no token.');
      return String(data.token);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await requestToken();
      } catch (err) {
        const roomUnknown = Number(err && err.status) === 404 &&
          /room_unknown|no event for this room/i.test(String(err && (err.detail || err.message) || ''));
        if (!roomUnknown || attempt >= 2) throw err;

        // The auth sidecar resolves the Nests namespace by reading the 30312
        // room event from its relay set. Re-publish the already-signed event to
        // standard relays so newly discovered rooms can converge before auth.
        await republishRoomEventForAudioAuth(roomEvent);
        await new Promise(function(resolve) {
          setTimeout(resolve, 900 + (attempt * 900));
        });
      }
    }

    throw new Error('Nest audio authentication failed.');
  }

  function parseNestThemeTags(tagsList) {
    const tagsArray = Array.isArray(tagsList) ? tagsList : [];
    const theme = { colors: {}, font: null, background: null };
    tagsArray.forEach(function(t) {
      if (!Array.isArray(t)) return;
      if (t[0] === 'c' && t[1] && t[2]) {
        if (t[2] === 'background') theme.colors.background = String(t[1]);
        if (t[2] === 'text') theme.colors.text = String(t[1]);
        if (t[2] === 'primary') theme.colors.primary = String(t[1]);
      } else if (t[0] === 'f' && t[1]) {
        const url = String(t[2] || '');
        theme.font = { family: String(t[1]), url: /^https?:\/\//i.test(url) ? url : '' };
      } else if (t[0] === 'bg' && t[1]) {
        let url = '', mode = 'cover';
        (t.slice(1) || []).forEach(function(v) {
          const value = String(v || '');
          if (value.indexOf('url ') === 0) url = value.slice(4);
          else if (value.indexOf('mode ') === 0) mode = value.slice(5) === 'tile' ? 'tile' : 'cover';
        });
        if (/^https?:\/\//i.test(url)) theme.background = { url: url, mode: mode };
      }
    });
    return theme;
  }

  function applyNestRoomTheme(event) {
    const root = roomPageRoot || modal;
    if (!root || !event) return;
    const theme = parseNestThemeTags(event.tags);
    const colors = theme.colors || {};
    if (colors.background) root.style.setProperty('--surface', colors.background);
    if (colors.background) root.style.setProperty('--surface2', colors.background);
    if (colors.background) root.style.setProperty('--surface3', colors.background);
    if (colors.text) root.style.setProperty('--text', colors.text);
    if (colors.text) root.style.setProperty('--text2', colors.text);
    if (colors.primary) root.style.setProperty('--purple', colors.primary);
    if (colors.primary) root.style.setProperty('--accent', colors.primary);
    const dialog = $('.nests-room-page-dialog', root) || $('.nest-preview-dialog', root);
    if (dialog && colors.background) dialog.style.backgroundColor = colors.background;
    if (dialog && colors.text) dialog.style.color = colors.text;
    const title = $('#nestPreviewTitle', root);
    if (title && colors.text) title.style.color = colors.text;
    const summary = $('#nestPreviewSummary', root);
    if (summary && colors.text) summary.style.color = colors.text;
    if (dialog && theme.background) {
      dialog.style.backgroundImage = 'url("' + theme.background.url.replace(/"/g, '%22') + '")';
      dialog.style.backgroundSize = theme.background.mode === 'tile' ? 'auto' : 'cover';
      dialog.style.backgroundRepeat = theme.background.mode === 'tile' ? 'repeat' : 'no-repeat';
      dialog.style.backgroundPosition = 'center';
    }
    if (theme.font && theme.font.url && /^https?:\/\//i.test(theme.font.url)) {
      const fontId = 'nest-room-theme-font';
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = theme.font.url;
        document.head.appendChild(link);
      }
      if (dialog) dialog.style.fontFamily = '"' + theme.font.family.replace(/"/g, '') + '", sans-serif';
    }
  }

  function getCurrentNestUser() {
    const ctx = getSifakaContext();
    return ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
  }

  function activeRoomUserIsAdmin() {
    const user = getCurrentNestUser();
    if (!user || !activeRoomEvent) return false;
    const pubkey = String(user.pubkey || '').toLowerCase();
    if (pubkey === String(activeRoomEvent.pubkey || '').toLowerCase()) return true;
    return pTags(activeRoomEvent).some(function(person) {
      return person.pubkey === pubkey && /admin|host|owner/i.test(person.role);
    });
  }

  function activeRoomUserCanPublish() {
    const user = getCurrentNestUser();
    if (!user || !activeRoomEvent) return false;
    const pubkey = String(user.pubkey || '').toLowerCase();
    if (pubkey === String(activeRoomEvent.pubkey || '').toLowerCase()) return true;
    return pTags(activeRoomEvent).some(function(person) {
      return person.pubkey === pubkey && /speaker|admin|host|owner/i.test(person.role);
    });
  }

  async function publishCurrentRoomPresence() {
    if (!activeRoom || !activeRoom.a) return;
    const user = getCurrentNestUser();
    if (!user) return;
    const publishing = !!(activeRoomAudio && activeRoomAudio.isPublishing);
    const muted = !!(activeRoomAudio ? activeRoomAudio.microphoneMuted : false);
    const onstage = publishing;
    const event = await signRoomEvent(10312, '', [
      ['a', activeRoom.a],
      ['hand', activeRoomHandRaised ? '1' : '0'],
      ['publishing', publishing ? '1' : '0'],
      ['muted', muted ? '1' : '0'],
      ['onstage', onstage ? '1' : '0']
    ]);
    await publishSignedRoomEvent(event, activeRoomRelays);
  }

  async function setNestHandRaised(next) {
    if (!getCurrentNestUser()) throw new Error('Please sign in to raise your hand.');
    activeRoomHandRaised = !!next;
    await publishCurrentRoomPresence();
    updateNestInteractionUi();
    refreshLiveRoom(activeRoomUrl).catch(function() {});
  }

  async function loadNestCustomEmojis() {
    const user = getCurrentNestUser();
    if (!user) return [];
    try {
      const listEvents = await relayQuery([{ kinds: [10030], authors: [user.pubkey], limit: 1 }], 2500, activeRoomRelays);
      if (!listEvents.length) return [];
      const emojis = [];
      const setRefs = [];
      (listEvents[0].tags || []).forEach(function(t) {
        if (!Array.isArray(t)) return;
        if (t[0] === 'emoji' && t[1] && t[2]) emojis.push({ shortcode: String(t[1]), url: String(t[2]) });
        if (t[0] === 'a' && /^30030:[0-9a-f]{64}:.+/i.test(String(t[1] || ''))) {
          const parts = String(t[1]).split(':');
          setRefs.push({ pubkey: parts[1], d: parts.slice(2).join(':') });
        }
      });
      if (setRefs.length) {
        const events = await relayQuery(setRefs.map(function(ref) {
          return { kinds: [30030], authors: [ref.pubkey], '#d': [ref.d], limit: 1 };
        }), 2500, activeRoomRelays);
        events.forEach(function(ev) {
          (ev.tags || []).forEach(function(t) {
            if (Array.isArray(t) && t[0] === 'emoji' && t[1] && t[2]) emojis.push({ shortcode: String(t[1]), url: String(t[2]) });
          });
        });
      }
      const seen = new Set();
      return emojis.filter(function(e) {
        if (seen.has(e.shortcode)) return false;
        seen.add(e.shortcode);
        return /^https?:\/\//i.test(e.url);
      }).slice(0, 64);
    } catch (_) { return []; }
  }

  async function sendNestReaction(value, customEmoji) {
    const user = getCurrentNestUser();
    if (!user || !activeRoom || !activeRoom.a) throw new Error('Please sign in to react.');
    const emoji = String(value || '').trim();
    if (!emoji) return;
    const eventTags = [['a', activeRoom.a]];
    let content = emoji;
    if (customEmoji) {
      content = ':' + customEmoji.shortcode + ':';
      eventTags.push(['emoji', customEmoji.shortcode, customEmoji.url]);
    }
    const event = await signRoomEvent(7, content, eventTags);
    await publishSignedRoomEvent(event, activeRoomRelays);
    activeRoomReactions = [{ id: event.id || ('local-' + now()), content: content, pubkey: user.pubkey, created_at: event.created_at || now(), emojiUrl: customEmoji ? customEmoji.url : '' }].concat(activeRoomReactions).slice(0, 24);
    renderNestReactionOverlay();
  }

  function buildRoomReactionMaps(events) {
    const chatMap = new Map();
    const roomReactions = [];
    (Array.isArray(events) ? events : []).forEach(function(ev) {
      if (Number(ev.kind) === 7) {
        const eTag = tag(ev, 'e');
        if (eTag) {
          if (!chatMap.has(eTag)) chatMap.set(eTag, []);
          chatMap.get(eTag).push(ev);
        } else {
          roomReactions.push(ev);
        }
      }
    });
    return { chatMap: chatMap, roomReactions: roomReactions };
  }

  function renderNestReactionOverlay() {
    if (!modal) return;
    const overlay = $('#nestReactionOverlay', modal);
    if (!overlay) return;
    const recent = activeRoomReactions.slice(0, 12);
    overlay.innerHTML = recent.map(function(ev) {
      const content = String(ev.content || '✨');
      const custom = String(ev.emojiUrl || tag(ev, 'emoji') || '');
      return '<span class="nest-floating-reaction">' + (custom ? '<img src="' + esc(custom) + '" alt="' + esc(content) + '">' : esc(content)) + '</span>';
    }).join('');
    overlay.hidden = !recent.length;
  }

  function populateNestReactionMenu() {
    if (!modal) return;
    const menu = $('#nestReactionMenu', modal);
    if (!menu) return;
    const basics = ['🤙','💯','🔥','😂','❤️','👏','🙌','✨','🚀','⚡','🎉','💜'];
    menu.innerHTML = basics.map(function(emoji) {
      return '<button type="button" class="nest-reaction-btn" data-emoji="' + esc(emoji) + '">' + emoji + '</button>';
    }).join('');
    if (activeRoomCustomEmojis.length) {
      const customHtml = activeRoomCustomEmojis.map(function(e) {
        return '<button type="button" class="nest-reaction-btn nest-custom-reaction-btn" data-custom-shortcode="' + esc(e.shortcode) + '" data-custom-url="' + esc(e.url) + '"><img src="' + esc(e.url) + '" alt="' + esc(e.shortcode) + '"></button>';
      }).join('');
      menu.insertAdjacentHTML('beforeend', customHtml);
    }
    Array.from(menu.querySelectorAll('[data-emoji]')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        sendNestReaction(btn.getAttribute('data-emoji')).catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Reaction failed.';
        });
        menu.hidden = true;
      });
    });
    Array.from(menu.querySelectorAll('[data-custom-shortcode]')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        sendNestReaction('', {
          shortcode: btn.getAttribute('data-custom-shortcode') || '',
          url: btn.getAttribute('data-custom-url') || ''
        }).catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Reaction failed.';
        });
        menu.hidden = true;
      });
    });
  }

  async function isNestUserInList(kind, targetPubkey) {
    const user = getCurrentNestUser();
    if (!user || !targetPubkey) return false;
    const events = await relayQuery([{ kinds: [kind], authors: [user.pubkey], limit: 1 }], 2600, activeRoomRelays);
    const latest = events.sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); })[0];
    if (!latest) return false;
    const target = String(targetPubkey).toLowerCase();
    return (latest.tags || []).some(function(t) {
      return Array.isArray(t) && t[0] === 'p' && String(t[1] || '').toLowerCase() === target;
    });
  }

  async function publishNestUserList(kind, targetPubkey, add) {
    const user = getCurrentNestUser();
    if (!user || !targetPubkey) throw new Error('Please sign in first.');
    const events = await relayQuery([{ kinds: [kind], authors: [user.pubkey], limit: 1 }], 3000, activeRoomRelays);
    const latest = events.sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); })[0] || null;
    const existingTags = latest && Array.isArray(latest.tags) ? latest.tags : [];
    const target = String(targetPubkey).toLowerCase();
    const newTags = existingTags.filter(function(t) { return Array.isArray(t) && !(t[0] === 'p' && String(t[1] || '').toLowerCase() === target); });
    if (add) newTags.push(['p', target]);
    const event = await signRoomEvent(kind, latest ? latest.content : '', newTags);
    await publishSignedRoomEvent(event, activeRoomRelays);
    return add;
  }

  async function updateNestParticipantRole(targetPubkey, role) {
    if (!activeRoomEvent || !activeRoomUserIsAdmin()) throw new Error('Only the host or an admin can manage the stage.');
    const target = String(targetPubkey || '').toLowerCase();
    const nextTags = (activeRoomEvent.tags || []).filter(function(t) {
      return !(Array.isArray(t) && t[0] === 'p' && String(t[1] || '').toLowerCase() === target);
    });
    if (role) nextTags.push(['p', target, '', role]);
    const event = await signRoomEvent(30312, activeRoomEvent.content || '', nextTags);
    await publishSignedRoomEvent(event, activeRoomRelays);
    activeRoomEvent = event;
    activeRoom = Object.assign({}, activeRoom || {}, {
      participants: pTags(event),
      roomParticipants: pTags(event),
      title: tag(event, 'title') || tag(event, 'room') || (activeRoom && activeRoom.title) || 'Nostr Nest',
      summary: tag(event, 'summary') || (activeRoom && activeRoom.summary) || '',
      image: tag(event, 'image') || (activeRoom && activeRoom.image) || '',
      status: tag(event, 'status') || (activeRoom && activeRoom.status) || 'open',
      starts: Number(tag(event, 'starts') || (activeRoom && activeRoom.starts) || 0),
      ends: Number(tag(event, 'ends') || (activeRoom && activeRoom.ends) || 0)
    });
    await refreshLiveRoom(activeRoomUrl);
  }

  async function kickNestParticipant(targetPubkey) {
    if (!activeRoomEvent || !activeRoomUserIsAdmin()) throw new Error('Only the host or an admin can kick participants.');
    const target = String(targetPubkey || '').toLowerCase();
    const command = await signRoomEvent(4312, '', [['a', activeRoom.a], ['p', target], ['action', 'kick']]);
    await publishSignedRoomEvent(command, activeRoomRelays);
    await updateNestParticipantRole(target, null);
  }

  async function endNestRoom() {
    if (!activeRoomEvent || !activeRoomUserIsAdmin()) throw new Error('Only the host or an admin can end the room.');
    if (!window.confirm('End this Nostr Nest for everyone?')) return;
    const nextTags = (activeRoomEvent.tags || []).filter(function(t) {
      return !(Array.isArray(t) && (t[0] === 'status' || t[0] === 'ends'));
    });
    nextTags.push(['status', 'ended']);
    nextTags.push(['ends', String(now())]);
    const event = await signRoomEvent(30312, activeRoomEvent.content || '', nextTags);
    await publishSignedRoomEvent(event, activeRoomRelays);
    activeRoomEvent = event;
    activeRoom = Object.assign({}, activeRoom || {}, {
      status: 'ended',
      ends: Number(tag(event, 'ends') || now())
    });
    await refreshLiveRoom(activeRoomUrl);
  }

  async function editNestRoomDetails() {
    if (!activeRoomEvent || !activeRoomUserIsAdmin()) throw new Error('Only the host or an admin can edit this room.');
    const currentTitle = tag(activeRoomEvent, 'title') || tag(activeRoomEvent, 'room') || '';
    const currentSummary = tag(activeRoomEvent, 'summary') || '';
    const title = window.prompt('Nest room title:', currentTitle);
    if (title === null) return;
    const summary = window.prompt('Nest room description:', currentSummary);
    if (summary === null) return;
    const currentImage = tag(activeRoomEvent, 'image') || '';
    const image = window.prompt('Nest banner image URL (leave blank to remove):', currentImage);
    if (image === null) return;
    const nextTags = (activeRoomEvent.tags || []).filter(function(t) {
      return !(Array.isArray(t) && (t[0] === 'title' || t[0] === 'room' || t[0] === 'summary' || t[0] === 'image'));
    });
    nextTags.push(['title', title.trim() || 'Nostr Nest']);
    if (summary.trim()) nextTags.push(['summary', summary.trim()]);
    if (image.trim()) nextTags.push(['image', image.trim()]);
    const event = await signRoomEvent(30312, activeRoomEvent.content || '', nextTags);
    await publishSignedRoomEvent(event, activeRoomRelays);
    activeRoomEvent = event;
    activeRoom = Object.assign({}, activeRoom || {}, {
      title: tag(event, 'title') || tag(event, 'room') || 'Nostr Nest',
      summary: tag(event, 'summary') || '',
      image: tag(event, 'image') || '',
      status: tag(event, 'status') || 'open',
      starts: Number(tag(event, 'starts') || 0),
      ends: Number(tag(event, 'ends') || 0)
    });
    await refreshLiveRoom(activeRoomUrl);
  }

  async function zapNestParticipant(targetPubkey, targetProfile) {
    const user = getCurrentNestUser();
    if (!user || !targetPubkey || String(targetPubkey).toLowerCase() === String(user.pubkey).toLowerCase()) return;
    const lud16 = String(targetProfile && (targetProfile.lud16 || targetProfile.lud06) || '').trim();
    if (!lud16 || !lud16.includes('@')) throw new Error('This profile does not expose a Lightning address.');
    const amount = Number.parseInt(window.prompt('Zap amount (sats):', '100') || '', 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const tools = window.NostrTools;
    if (!tools || !tools.nip57 || typeof tools.nip57.makeZapRequest !== 'function') throw new Error('Nostr zap support is not available in this browser.');
    const [name, domain] = lud16.split('@');
    const meta = await fetch('https://' + domain + '/.well-known/lnurlp/' + encodeURIComponent(name)).then(function(res) {
      if (!res.ok) throw new Error('Lightning address lookup failed.');
      return res.json();
    });
    if (meta.allowsNostr !== true || !meta.callback) throw new Error('This Lightning address does not support Nostr zaps.');
    const zapReq = tools.nip57.makeZapRequest({
      profile: String(targetPubkey).toLowerCase(),
      amount: amount * 1000,
      relays: activeRoomRelays,
      comment: 'Nostr Nest'
    });
    const signed = await signRoomEvent(zapReq.kind, zapReq.content, zapReq.tags);
    const callback = new URL(meta.callback);
    callback.searchParams.set('amount', String(amount * 1000));
    callback.searchParams.set('nostr', JSON.stringify(signed));
    const invoiceResponse = await fetch(callback.toString());
    if (!invoiceResponse.ok) throw new Error('Lightning callback failed.');
    const invoiceData = await invoiceResponse.json();
    const invoice = invoiceData && invoiceData.pr;
    if (!invoice) throw new Error('No Lightning invoice returned.');
    if (window.webln) {
      await window.webln.enable();
      await window.webln.sendPayment(invoice);
      return;
    }
    try { await navigator.clipboard.writeText(invoice); } catch (_) {}
    window.alert('Invoice copied. Pay it with your Lightning wallet.');
  }

  async function shareNestRoomToNostr() {
    const user = getCurrentNestUser();
    if (!user || !activeRoom || !activeRoomEvent) throw new Error('Please sign in to share this room to Nostr.');
    const title = tag(activeRoomEvent, 'title') || tag(activeRoomEvent, 'room') || 'Nostr Nest';
    const event = await signRoomEvent(1, 'Join me in "' + title + '" on Nostr Nest!\n\nnostr:' + activeRoomUrl, [['a', activeRoom.a]]);
    await publishSignedRoomEvent(event, activeRoomRelays);
    window.alert('Shared to Nostr.');
  }

    function normalizeNestStreamingUrl(value) {
    // The reference Nostr Nests client uses the public MoQ relay endpoint.
    // Keep an explicit room endpoint intact; otherwise use the production
    // listener-compatible endpoint.
    const fallback = 'https://moq.nostrnests.com:4443';
    try {
      const parsed = new URL(String(value || fallback));
      if (parsed.protocol === 'wss:' || parsed.protocol === 'ws:' || parsed.protocol === 'http:') {
        parsed.protocol = 'https:';
      }
      if (parsed.hostname.toLowerCase() === 'moq.nostrnests.com') {
        // The production Nostr Nests relay serves the MoQ transport on 4443.
        // A room event may omit the port or carry the web origin; normalize
        // that production hostname to the actual relay endpoint.
        if (!parsed.port || parsed.port === '443') parsed.port = '4443';
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '';
      }
      return parsed.toString().replace(/\/$/, '');
    } catch (_) {
      return fallback;
    }
  }

  function updateNestInteractionUi() {
    if (!modal) return;
    const hand = $('#nestHandBtn', modal);
    const react = $('#nestReactBtn', modal);
    const broadcast = $('#nestBroadcastBtn', modal);
    const edit = $('#nestEditBtn', modal);
    const end = $('#nestEndBtn', modal);
    const reactionMenu = $('#nestReactionMenu', modal);
    if (hand) {
      hand.disabled = !getCurrentNestUser();
      hand.textContent = activeRoomHandRaised ? 'Lower Hand' : 'Raise Hand';
      hand.classList.toggle('is-active', !!activeRoomHandRaised);
    }
    if (react) react.disabled = !getCurrentNestUser();
    if (broadcast) broadcast.disabled = !getCurrentNestUser();
    const admin = activeRoomUserIsAdmin();
    if (edit) edit.hidden = !admin;
    if (end) end.hidden = !admin;
    if (reactionMenu && reactionMenu.dataset.initialized !== '1') {
      populateNestReactionMenu();
      reactionMenu.dataset.initialized = '1';
    }
    renderNestReactionOverlay();
  }

  function clearNestRoomError(root) {
    const target = root || modal;
    if (!target) return;
    const box = $('#nestRoomError', target);
    if (box) box.hidden = true;
  }

  function showNestRoomError(err, root) {
    const target = root || modal;
    if (!target) return;
    const message = String(err && err.message || err || 'Unable to join this Nest.').trim();
    const status = $('#nestRoomAudioStatus', target);
    const box = $('#nestRoomError', target);
    const title = $('#nestRoomErrorTitle', target);
    const text = $('#nestRoomErrorText', target);
    const roomUnknown = Number(err && err.status) === 404 &&
      /room_unknown|no event for this room/i.test(String(err && (err.detail || err.message) || ''));

    if (roomUnknown) {
      if (status) status.textContent = 'Audio server is catching up…';
      if (title) title.textContent = 'Audio server is catching up';
      if (text) text.textContent = 'The room announcement was not visible to the audio server yet. Sifaka refreshed it and retried automatically.';
    } else {
      if (status) status.textContent = 'Audio connection failed';
      if (title) title.textContent = 'Unable to connect audio';
      if (text) text.textContent = /sign in/i.test(message)
        ? message
        : 'The room is available, but its audio connection could not be established. You can retry without leaving the room.';
    }
    if (box) box.hidden = false;
    console.warn('[sifaka-nests] Nest audio join error', err);
  }

  function updateActiveRoomAudioUi() {
    if (!modal) return;
    const status = modal.querySelector('#nestRoomAudioStatus');
    const btn = modal.querySelector('#nestRoomMuteBtn');
    const slider = modal.querySelector('#nestRoomVolume');
    const dot = modal.querySelector('#nestRoomAudioDot');
    const join = modal.querySelector('#nestPreviewJoinBtn');
    const micBtn = modal.querySelector('#nestRoomMicBtn');
    const stageBtn = modal.querySelector('#nestRoomStageBtn');
    if (status && activeRoomAudio) {
      const state = activeRoomAudio.state || 'disconnected';
      const count = activeRoomAudio.entries ? activeRoomAudio.entries.size : 0;
      const micError = String(activeRoomAudio.microphoneError || '').trim();
      const connectionError = String(activeRoomAudio.connectionError || '').trim();
      const label = state === 'error'
        ? 'Audio connection error'
        : state === 'connected'
        ? (micError && activeRoomAudio.publishRequested
          ? 'Connected • Microphone unavailable'
          : ('Connected • ' + count + ' speaker' + (count === 1 ? '' : 's')))
        : state === 'reconnecting'
          ? 'Reconnecting…'
          : state === 'connecting'
            ? 'Connecting…'
            : 'Disconnected';
      status.textContent = label;
      if (dot) dot.classList.toggle('connected', state === 'connected');
      if (join && (state === 'disconnected' || state === 'error')) {
        join.disabled = false;
        join.textContent = state === 'error' ? 'Retry Audio' : roomJoinLabel(true);
      }
    }
    if (btn && activeRoomAudio) btn.textContent = activeRoomAudio.muted ? 'Unmute Room' : 'Mute Room';
    if (slider && activeRoomAudio) slider.value = String(Math.round(activeRoomAudio.volume * 100));
    if (stageBtn) {
      const canPublish = !!(activeRoomAudio && activeRoomCanPublish());
      const publishing = !!(activeRoomAudio && activeRoomAudio.isPublishing);
      stageBtn.hidden = !canPublish;
      stageBtn.textContent = publishing ? 'Leave Stage' : 'Join Stage';
      stageBtn.disabled = !activeRoomAudio || activeRoomAudio.state !== 'connected';
    }
    if (micBtn) {
      const publishing = !!(activeRoomAudio && activeRoomAudio.isPublishing);
      const ready = !!(activeRoomAudio && activeRoomAudio.microphoneReady);
      const micError = String((activeRoomAudio && activeRoomAudio.microphoneError) || '').trim();
      micBtn.disabled = !publishing;
      if (publishing && !ready) {
        micBtn.textContent = micError ? 'Retry Mic' : 'Enable Mic';
        micBtn.title = micError || 'Microphone is not ready yet.';
      } else {
        micBtn.textContent = publishing && activeRoomAudio.microphoneMuted ? 'Unmute Mic' : 'Mute Mic';
        micBtn.title = 'Toggle your microphone';
      }
    }
  }

  function wireRoomRootControls(root) {
    if (!root || root._nestsRoomControlsWired) return root;
    root._nestsRoomControlsWired = true;

    const retry = $('#nestRoomRetryBtn', root);
    if (retry) retry.addEventListener('click', function() {
      retry.disabled = true;
      clearNestRoomError(root);
      enterActiveRoom({ force: true }).catch(function(err) {
        showNestRoomError(err, root);
      }).finally(function() {
        retry.disabled = false;
        updateActiveRoomAudioUi();
      });
    });

    const join = $('#nestPreviewJoinBtn', root);
    if (join) {
      join.addEventListener('click', function() {
        clearNestRoomError(root);
        enterActiveRoom().catch(function(err) {
          showNestRoomError(err, root);
        });
      });
    }

    const stage = $('#nestRoomStageBtn', root);
    if (stage) {
      stage.addEventListener('click', function() {
        if (!activeRoomAudio) return;
        const op = activeRoomAudio.isPublishing
          ? activeRoomAudio.leaveStage()
          : activeRoomAudio.rejoinStage();
        Promise.resolve(op).catch(function(err) {
          const status = $('#nestRoomAudioStatus', root);
          if (status) status.textContent = err && err.message ? err.message : 'Could not update stage status.';
        });
      });
    }


    const mic = $('#nestRoomMicBtn', root);
    if (mic) {
      mic.addEventListener('click', function() {
        if (!activeRoomAudio || !activeRoomAudio.isPublishing) return;
        if (!activeRoomAudio.microphoneReady) {
          activeRoomAudio.startMicrophonePublish().catch(function(err) {
            const status = $('#nestRoomAudioStatus', root);
            if (status) status.textContent = err && err.message ? err.message : 'Could not enable the microphone.';
            updateActiveRoomAudioUi();
          });
          return;
        }
        activeRoomAudio.setMicrophoneMuted(!activeRoomAudio.microphoneMuted);
        publishCurrentRoomPresence().catch(function() {});
        updateActiveRoomAudioUi();
      });
    }

    const mute = $('#nestRoomMuteBtn', root);
    if (mute) {
      mute.addEventListener('click', function() {
        if (!activeRoomAudio) return;
        activeRoomAudio.setMuted(!activeRoomAudio.muted);
        updateActiveRoomAudioUi();
      });
    }

    const volume = $('#nestRoomVolume', root);
    if (volume) {
      volume.addEventListener('input', function() {
        if (!activeRoomAudio) return;
        activeRoomAudio.setVolume(Number(this.value) / 100);
        updateActiveRoomAudioUi();
      });
    }

    const leave = $('#nestRoomLeaveBtn', root);
    if (leave) {
      leave.addEventListener('click', function() {
        window.leaveNestsRoom();
      });
    }

    const send = $('#nestRoomChatSendBtn', root);
    if (send) {
      send.addEventListener('click', function() {
        sendActiveRoomChat().catch(function(err) {
          const status = $('#nestRoomAudioStatus', root);
          if (status) status.textContent = err && err.message ? err.message : 'Could not send message';
        });
      });
    }

    const input = $('#nestRoomChatInput', root);
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          sendActiveRoomChat().catch(function(err) {
            const status = $('#nestRoomAudioStatus', root);
            if (status) status.textContent = err && err.message ? err.message : 'Could not send message';
          });
        }
      });
    }

    const share = $('#nestPreviewShareBtn', root);
    if (share) {
      share.addEventListener('click', async function() {
        const shareUrl = roomPageUrlFromNaddr(activeRoomUrl) || activeRoomUrl;
        if (!shareUrl) return;
        try {
          if (navigator.share) await navigator.share({
            title: $('#nestPreviewTitle', root)?.textContent || 'Nostr Nest',
            url: shareUrl
          });
          else if (navigator.clipboard) {
            await navigator.clipboard.writeText(shareUrl);
            share.textContent = 'Copied';
            setTimeout(function() { share.textContent = 'Share'; }, 1200);
          }
        } catch (_) {}
      });
    }

    const hand = $('#nestHandBtn', root);
    if (hand) hand.addEventListener('click', function() {
      setNestHandRaised(!activeRoomHandRaised).catch(function(err) {
        const status = $('#nestRoomAudioStatus', root);
        if (status) status.textContent = err && err.message ? err.message : 'Could not update hand raise.';
      });
    });

    const react = $('#nestReactBtn', root);
    const reactionMenu = $('#nestReactionMenu', root);
    if (react && reactionMenu) {
      react.addEventListener('click', function() {
        reactionMenu.hidden = !reactionMenu.hidden;
        if (!reactionMenu.hidden) {
          populateNestReactionMenu();
          reactionMenu.dataset.initialized = '1';
        }
      });
    }

    const broadcast = $('#nestBroadcastBtn', root);
    if (broadcast) broadcast.addEventListener('click', function() {
      shareNestRoomToNostr().catch(function(err) {
        const status = $('#nestRoomAudioStatus', root);
        if (status) status.textContent = err && err.message ? err.message : 'Could not share to Nostr.';
      });
    });

    const edit = $('#nestEditBtn', root);
    if (edit) edit.addEventListener('click', function() {
      editNestRoomDetails().catch(function(err) {
        const status = $('#nestRoomAudioStatus', root);
        if (status) status.textContent = err && err.message ? err.message : 'Could not edit room.';
      });
    });

    const end = $('#nestEndBtn', root);
    if (end) end.addEventListener('click', function() {
      endNestRoom().catch(function(err) {
        const status = $('#nestRoomAudioStatus', root);
        if (status) status.textContent = err && err.message ? err.message : 'Could not end room.';
      });
    });

    return root;
  }

  function ensureRoomPageRoot() {
    const mount = document.getElementById('nestsRoomPageMount');
    if (!mount) return null;
    if (roomPageRoot) return roomPageRoot;

    roomPageRoot = document.createElement('div');
    roomPageRoot.id = 'nestRoomPageRoot';
    roomPageRoot.className = 'nests-room-page-root';
    roomPageRoot.innerHTML =
      '<div class="nest-preview-dialog nests-room-page-dialog" role="main" aria-labelledby="nestPreviewTitle">' +
        '<div class="nest-preview-cover nests-room-page-cover" id="nestPreviewCover"></div>' +
        '<div class="nest-preview-content nests-room-page-content">' +
          '<div class="nests-room-page-toolbar">' +
            '<div class="nest-preview-status" id="nestPreviewStatus"></div>' +
            '<div class="nests-room-page-toolbar-actions">' +
              '<button class="btn btn-ghost" id="nestPreviewShareBtn" type="button">Share</button>' +
              '<button class="btn btn-ghost" id="nestBroadcastBtn" type="button">Share on Nostr</button>' +
              '<button class="btn btn-ghost" id="nestEditBtn" type="button" hidden>Edit Room</button>' +
              '<button class="btn btn-ghost" id="nestEndBtn" type="button" hidden>End Room</button>' +
            '</div>' +
          '</div>' +
          '<h1 id="nestPreviewTitle">Nostr Nest</h1>' +
          '<p class="nest-preview-summary" id="nestPreviewSummary"></p>' +
          '<div class="nest-room-interaction-bar">' +
            '<button class="btn btn-ghost" id="nestHandBtn" type="button">Raise Hand</button>' +
            '<div class="nest-reaction-wrap">' +
              '<button class="btn btn-ghost" id="nestReactBtn" type="button">React</button>' +
              '<div class="nest-reaction-menu" id="nestReactionMenu" hidden></div>' +
            '</div>' +
          '</div>' +
          '<div class="nest-reaction-overlay" id="nestReactionOverlay" hidden></div>' +
          '<div class="nests-room-page-overview-grid">' +
            '<div class="nest-preview-panel active" data-panel="overview">' +
              '<div class="nest-preview-stats" id="nestPreviewStats"></div>' +
              '<div class="nest-preview-schedule" id="nestPreviewSchedule"></div>' +
              '<div class="nest-preview-topics" id="nestPreviewTopics"></div>' +
            '</div>' +
            '<div class="nests-room-page-people-column">' +
              '<div class="nest-preview-panel active" data-panel="people">' +
                '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>On stage</span><span id="nestPreviewPeopleCount"></span></div><div class="nest-preview-people" id="nestPreviewPeople"></div></div>' +
                '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>Listeners</span><span id="nestPreviewListenerCount">—</span></div><div class="nest-preview-listeners" id="nestPreviewListeners"></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="nests-room-page-chat-column">' +
              '<div class="nest-preview-panel active" data-panel="chat">' +
                '<div class="nest-chat-header"><div><strong>Live chat</strong><span id="nestPreviewChatCount">—</span></div><span class="nest-chat-live"><i></i>LIVE</span></div>' +
                '<div class="nest-preview-chat" id="nestPreviewChat"></div>' +
                '<div class="nest-room-chat-compose" id="nestRoomChatCompose" hidden>' +
                  '<input id="nestRoomChatInput" type="text" maxlength="1000" placeholder="Say something…" aria-label="Send a Nest room message">' +
                  '<button class="btn btn-primary" id="nestRoomChatSendBtn" type="button" aria-label="Send message">Send</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="nest-room-error" id="nestRoomError" hidden role="alert" aria-live="polite">' +
            '<div class="nest-room-error-copy"><strong id="nestRoomErrorTitle">Audio connection issue</strong><span id="nestRoomErrorText"></span></div>' +
            '<button class="btn btn-ghost" id="nestRoomRetryBtn" type="button">Retry Audio</button>' +
          '</div>' +
          '<div class="nest-room-audio-bar" id="nestRoomAudioBar" hidden>' +
            '<span class="nest-room-audio-dot" id="nestRoomAudioDot"></span>' +
            '<strong id="nestRoomAudioStatus">Not connected</strong>' +
            '<button class="btn btn-ghost" id="nestRoomStageBtn" type="button" hidden>Join Stage</button>' +
            '<button class="btn btn-ghost" id="nestRoomMicBtn" type="button" disabled>Mute Mic</button>' +
            '<button class="btn btn-ghost" id="nestRoomMuteBtn" type="button">Mute Room</button>' +
            '<label class="nest-room-volume"><span>Volume</span><input id="nestRoomVolume" type="range" min="0" max="100" value="100" aria-label="Nest volume"></label>' +
            '<div class="nest-room-audio-actions">' +
              '<button class="btn btn-primary" id="nestPreviewJoinBtn" type="button">Join Room</button>' +
              '<button class="btn btn-ghost nest-room-leave-btn" id="nestRoomLeaveBtn" type="button">Leave Nest</button>' +
            '</div>' +
          '</div>' +
          '<div class="nest-preview-footnote" id="nestPreviewFootnote">Room details are read from Nostr NIP-53 events.</div>' +
        '</div>' +
      '</div>';
    mount.replaceChildren(roomPageRoot);
    wireRoomRootControls(roomPageRoot);
    return roomPageRoot;
  }

  function ensureModal() {
    if (roomPageMode) return ensureRoomPageRoot();
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'nestRoomPreviewModal';
    modal.className = 'nest-preview-overlay';
    modal.innerHTML =
      '<div class="nest-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="nestPreviewTitle">' +
        '<button class="nest-preview-close" type="button" aria-label="Close room preview">×</button>' +
        '<div class="nest-preview-cover" id="nestPreviewCover"></div>' +
        '<div class="nest-preview-content">' +
          '<div class="nest-preview-status" id="nestPreviewStatus"></div>' +
          '<div class="nest-preview-tabs" role="tablist" aria-label="Nest sections">' +
            '<button type="button" class="nest-preview-tab active" role="tab" aria-selected="true" data-tab="overview">Overview</button>' +
            '<button type="button" class="nest-preview-tab" role="tab" aria-selected="false" data-tab="people">People</button>' +
            '<button type="button" class="nest-preview-tab" role="tab" aria-selected="false" data-tab="chat">Chat</button>' +
          '</div>' +
          '<h2 id="nestPreviewTitle">Nostr Nest</h2>' +
          '<p class="nest-preview-summary" id="nestPreviewSummary"></p>' +
          '<div class="nest-preview-panel active" data-panel="overview">' +
            '<div class="nest-preview-stats" id="nestPreviewStats"></div>' +
            '<div class="nest-preview-schedule" id="nestPreviewSchedule"></div>' +
            '<div class="nest-preview-topics" id="nestPreviewTopics"></div>' +
          '</div>' +
          '<div class="nest-preview-panel" data-panel="people">' +
          '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>On stage</span><span id="nestPreviewPeopleCount"></span></div><div class="nest-preview-people" id="nestPreviewPeople"></div></div>' +
          '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>Listeners</span><span id="nestPreviewListenerCount">—</span></div><div class="nest-preview-listeners" id="nestPreviewListeners"></div></div>' +
          '</div>' +
          '<div class="nest-preview-panel" data-panel="chat">' +
            '<div class="nest-preview-section nest-preview-chat-section"><div class="nest-preview-section-head"><span>Room chat</span><span id="nestPreviewChatCount">—</span></div><div class="nest-preview-chat" id="nestPreviewChat"></div></div>' +
          '</div>' +
          '<div class="nest-room-error" id="nestRoomError" hidden role="alert" aria-live="polite">' +
            '<div class="nest-room-error-copy"><strong id="nestRoomErrorTitle">Audio connection issue</strong><span id="nestRoomErrorText"></span></div>' +
            '<button class="btn btn-ghost" id="nestRoomRetryBtn" type="button">Retry Audio</button>' +
          '</div>' +
          '<div class="nest-room-audio-bar" id="nestRoomAudioBar" hidden>' +
            '<span class="nest-room-audio-dot" id="nestRoomAudioDot"></span>' +
            '<strong id="nestRoomAudioStatus">Not connected</strong>' +
            '<button class="btn btn-ghost" id="nestRoomStageBtn" type="button" hidden>Join Stage</button>' +
            '<button class="btn btn-ghost" id="nestRoomMicBtn" type="button" disabled>Mute Mic</button>' +
            '<button class="btn btn-ghost" id="nestRoomMuteBtn" type="button">Mute Room</button>' +
            '<label class="nest-room-volume"><span>Volume</span><input id="nestRoomVolume" type="range" min="0" max="100" value="100" aria-label="Nest volume"></label>' +
          '</div>' +
          '<div class="nest-room-chat-compose" id="nestRoomChatCompose" hidden>' +
            '<input id="nestRoomChatInput" type="text" maxlength="1000" placeholder="Say something in the room…" aria-label="Send a Nest room message">' +
            '<button class="btn btn-primary" id="nestRoomChatSendBtn" type="button">Send</button>' +
          '</div>' +
          '<div class="nest-preview-actions"><button class="btn btn-ghost" id="nestPreviewShareBtn" type="button">Share</button><button class="btn btn-primary" id="nestPreviewJoinBtn" type="button">Join Nest</button></div>' +
          '<div class="nest-preview-footnote" id="nestPreviewFootnote">Room details are read from Nostr NIP-53 events.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    const profileSheet = document.createElement('div');
    profileSheet.id = 'nestProfileSheet';
    profileSheet.className = 'nest-profile-sheet';
    profileSheet.innerHTML = '<div class="nest-profile-card" role="dialog" aria-modal="true" aria-labelledby="nestProfileName">' +
      '<button class="nest-profile-close" type="button" aria-label="Close profile">×</button>' +
      '<div class="nest-profile-hero" id="nestProfileHero"></div>' +
      '<div class="nest-profile-body"><div class="nest-profile-avatar" id="nestProfileAvatar"></div>' +
      '<div class="nest-profile-role" id="nestProfileRole"></div><h3 id="nestProfileName">Profile</h3>' +
      '<p id="nestProfileAbout"></p>' +
      '<div class="nest-profile-actions nest-profile-social-actions">' +
        '<button class="btn btn-ghost" id="nestProfileFollowBtn" type="button">Follow</button>' +
        '<button class="btn btn-ghost" id="nestProfileMuteBtn" type="button">Mute</button>' +
        '<button class="btn btn-ghost" id="nestProfileZapBtn" type="button">Zap</button>' +
      '</div>' +
      '<div class="nest-profile-actions"><button class="btn btn-ghost" id="nestProfileStageBtn" type="button">Add to Stage</button><button class="btn btn-ghost" id="nestProfileAdminBtn" type="button">Make Admin</button><button class="btn btn-ghost" id="nestProfileKickBtn" type="button">Kick</button></div>' +
      '<div class="nest-profile-actions"><button class="btn btn-ghost" id="nestProfileCopy" type="button">Copy npub</button><button class="btn btn-primary" id="nestProfileOpen" type="button">Open profile</button></div>' +
      '<div class="nest-profile-npub" id="nestProfileNpub"></div></div></div>';
    document.body.appendChild(profileSheet);
    $('.nest-profile-close', profileSheet).addEventListener('click', function() { profileSheet.classList.remove('open'); });
    profileSheet.addEventListener('click', function(e) { if (e.target === profileSheet) profileSheet.classList.remove('open'); });
    $('#nestProfileCopy', profileSheet).addEventListener('click', async function() {
      const npub = profileSheet.dataset.npub || '';
      if (!npub) return;
      try { await navigator.clipboard.writeText(npub); this.textContent = 'Copied'; setTimeout(() => { this.textContent = 'Copy npub'; }, 1200); } catch (_) {}
    });
    $('#nestProfileOpen', profileSheet).addEventListener('click', function() {
      const npub = profileSheet.dataset.npub || '';
      if (npub) window.open('https://njump.me/' + npub, '_blank', 'noopener');
    });
    modal._profileSheet = profileSheet;
    $('.nest-preview-close', modal).addEventListener('click', closePreview);
    modal.addEventListener('click', function(e) { if (e.target === modal) closePreview(); });
    $('#nestPreviewJoinBtn', modal).addEventListener('click', function() {
      if (!activeRoomUrl) return;
      clearNestRoomError(modal);
      enterActiveRoom().catch(function(err) {
        showNestRoomError(err, modal);
      });
    });
    $('#nestRoomStageBtn', modal).addEventListener('click', function() {
      if (!activeRoomAudio) return;
      const op = activeRoomAudio.isPublishing
        ? activeRoomAudio.leaveStage()
        : activeRoomAudio.rejoinStage();
      Promise.resolve(op).catch(function(err) {
        const status = $('#nestRoomAudioStatus', modal);
        if (status) status.textContent = err && err.message ? err.message : 'Could not update stage status.';
      });
    });
    $('#nestRoomMicBtn', modal).addEventListener('click', function() {
      if (!activeRoomAudio || !activeRoomAudio.isPublishing) return;
      if (!activeRoomAudio.microphoneReady) {
        activeRoomAudio.startMicrophonePublish().catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Could not enable the microphone.';
          updateActiveRoomAudioUi();
        });
        return;
      }
      activeRoomAudio.setMicrophoneMuted(!activeRoomAudio.microphoneMuted);
      publishCurrentRoomPresence().catch(function() {});
      updateActiveRoomAudioUi();
    });
    $('#nestRoomMuteBtn', modal).addEventListener('click', function() {
      if (!activeRoomAudio) return;
      activeRoomAudio.setMuted(!activeRoomAudio.muted);
      updateActiveRoomAudioUi();
    });
    $('#nestRoomVolume', modal).addEventListener('input', function() {
      if (!activeRoomAudio) return;
      activeRoomAudio.setVolume(Number(this.value) / 100);
      updateActiveRoomAudioUi();
    });
    $('#nestRoomChatSendBtn', modal).addEventListener('click', function() {
      sendActiveRoomChat().catch(function(err) {
        const status = $('#nestRoomAudioStatus', modal);
        if (status) status.textContent = err && err.message ? err.message : 'Could not send message';
      });
    });
    $('#nestRoomChatInput', modal).addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendActiveRoomChat().catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Could not send message';
        });
      }
    });
    $('#nestPreviewShareBtn', modal).addEventListener('click', async function() {
      if (!activeRoomUrl) return;
      try {
        if (navigator.share) await navigator.share({ title: $('#nestPreviewTitle', modal).textContent || 'Nostr Nest', url: activeRoomUrl });
        else if (navigator.clipboard) {
          await navigator.clipboard.writeText(activeRoomUrl);
          const b = $('#nestPreviewShareBtn', modal); b.textContent = 'Copied';
          setTimeout(function() { b.textContent = 'Share'; }, 1200);
        }
      } catch (_) {}
    });
    Array.from(modal.querySelectorAll('.nest-preview-tab')).forEach(function(tab) {
      tab.addEventListener('click', function() {
        const target = tab.getAttribute('data-tab');
        Array.from(modal.querySelectorAll('.nest-preview-tab')).forEach(function(t) {
          const active = t === tab;
          t.classList.toggle('active', active);
          t.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Array.from(modal.querySelectorAll('.nest-preview-panel')).forEach(function(panel) {
          panel.classList.toggle('active', panel.getAttribute('data-panel') === target);
        });
      });
    });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && modal.classList.contains('open')) closePreview(); });
    return modal;
  }

  async function closePreview() {
    if (!modal) return;
    await leaveActiveRoom({ silent: true });
    modal.classList.remove('open');
    modal.classList.remove('is-live-room');
    document.body.classList.remove('nest-preview-open');
    document.body.classList.remove('nest-room-page-open');
    sockets.forEach(function(ws) { try { ws.close(); } catch (_) {} });
    sockets = [];
    clearTimeout(refreshTimer);
    clearTimeout(liveRefreshTimer);
    clearInterval(countdownTimer);
    clearInterval(activeRoomRefreshTimer);
    clearInterval(activeRoomChatTimer);
    refreshTimer = null;
    liveRefreshTimer = null;
    countdownTimer = null;
    activeRoomRefreshTimer = null;
    activeRoomChatTimer = null;
    chatSince = 0;
  }

  function resetActiveRoomUi() {
    if (!modal) return;
    const bar = $('#nestRoomAudioBar', modal);
    const compose = $('#nestRoomChatCompose', modal);
    const join = $('#nestPreviewJoinBtn', modal);
    if (bar) bar.hidden = true;
    if (compose) compose.hidden = true;
    if (join) {
      join.textContent = 'Join Room';
      join.disabled = false;
      join.classList.remove('btn-danger');
    }
    modal.classList.remove('is-live-room');
  }

  function renderLoading(fallback) {
    resetActiveRoomUi();
    ensureModal().classList.add('open');
    if (roomPageMode) document.body.classList.add('nest-room-page-open');
    else document.body.classList.add('nest-preview-open');
    $('#nestPreviewCover', modal).innerHTML = fallback.img ? '<img src="' + esc(fallback.img) + '" alt="">' : '<div class="nest-preview-cover-fallback">N</div>';
    $('#nestPreviewStatus', modal).textContent = fallback.badge || 'ROOM PREVIEW';
    $('#nestPreviewTitle', modal).textContent = fallback.title || 'Nostr Nest';
    $('#nestPreviewSummary', modal).textContent = fallback.summary || 'Loading room details from Nostr…';
    $('#nestPreviewStats', modal).innerHTML = '<span>◉ Loading presence…</span>';
    $('#nestPreviewSchedule', modal).innerHTML = '';
    $('#nestPreviewPeople', modal).innerHTML = '<div class="nest-preview-loading">Loading hosts and speakers…</div>';
    $('#nestPreviewPeopleCount', modal).textContent = '';
    $('#nestPreviewListenerCount', modal).textContent = fallback.countText || '—';
    $('#nestPreviewListeners', modal).innerHTML = '';
    $('#nestPreviewChatCount', modal).textContent = 'Loading…';
    $('#nestPreviewChat', modal).innerHTML = '<div class="nest-preview-chat-loading"><span></span><span></span><span></span></div>';
    $('#nestPreviewTopics', modal).innerHTML = (fallback.topics || []).map(function(t) { return '<span>#' + esc(t) + '</span>'; }).join('');
    Array.from(modal.querySelectorAll('.nest-preview-tab')).forEach(function(t) {
      const active = t.getAttribute('data-tab') === 'overview';
      t.classList.toggle('active', active); t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    Array.from(modal.querySelectorAll('.nest-preview-panel')).forEach(function(p) { p.classList.toggle('active', p.getAttribute('data-panel') === 'overview'); });
    $('#nestPreviewFootnote', modal).textContent = 'Loading Nostr room metadata…';
  }

  function profileDisplayName(profile) {
    if (!profile) return 'Anonymous';
    const displayName = String(profile.displayName || '').trim();
    return displayName || 'Anonymous';
  }

  function safeNestImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) return '';
    let inspected = raw;
    for (let i = 0; i < 2; i += 1) {
      try {
        const decoded = decodeURIComponent(inspected);
        if (decoded === inspected) break;
        inspected = decoded;
      } catch (_) {
        break;
      }
    }
    if (/^data:/i.test(inspected)
      || /<\/?svg\b/i.test(inspected)
      || /<\/?(?:rect|text|path|circle|ellipse|polygon|polyline)\b/i.test(inspected)) {
      return '';
    }
    return raw;
  }

  async function sendNestChatReaction(messageEvent, emoji) {
    if (!messageEvent || !activeRoom || !activeRoom.a) return;
    const event = await signRoomEvent(7, emoji, [
      ['a', activeRoom.a],
      ['e', String(messageEvent.id || '')],
      ['p', String(messageEvent.pubkey || '').toLowerCase()]
    ]);
    await publishSignedRoomEvent(event, activeRoomRelays);
    refreshLiveRoom(activeRoomUrl).catch(function() {});
  }

  function summarizeChatReactions(reactionEvents) {
    const byEmoji = new Map();
    let zapCount = 0;
    (Array.isArray(reactionEvents) ? reactionEvents : []).forEach(function(ev) {
      if (Number(ev.kind) === 7 && ev.content) {
        const key = String(ev.content);
        byEmoji.set(key, (byEmoji.get(key) || 0) + 1);
      }
      if (Number(ev.kind) === 9735) zapCount++;
    });
    return { byEmoji: byEmoji, zapCount: zapCount };
  }

  function renderChat(room, profiles) {
    const chatEl = $('#nestPreviewChat', modal);
    if (!chatEl) return;
    const stickToBottom = (chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight) < 64;
    const messages = Array.isArray(room.chat) ? room.chat.slice().sort(function(a, b) {
      return Number(a.created_at || 0) - Number(b.created_at || 0);
    }).slice(-80) : [];

    const countEl = $('#nestPreviewChatCount', modal);
    if (countEl) countEl.textContent = messages.length
      ? messages.length + (messages.length === 1 ? ' message' : ' messages')
      : 'No messages';

    if (!messages.length) {
      chatEl.innerHTML =
        '<div class="nest-preview-chat-empty"><span class="nest-chat-empty-icon">✦</span><strong>No live chat yet</strong><small>Messages from this room will appear here in real time.</small></div>';
      return;
    }

    chatEl.innerHTML = messages.map(function(ev, index) {
      const prof = profiles.get(String(ev.pubkey || '').toLowerCase()) || {};
      const name = profileDisplayName(prof);
      const picture = safeNestImageUrl(prof.picture);
      const content = String(ev.content || '').trim();
      const when = ev.created_at ? new Date(Number(ev.created_at) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const previous = messages[index - 1];
      const sameSender = previous &&
        String(previous.pubkey || '').toLowerCase() === String(ev.pubkey || '').toLowerCase() &&
        Number(ev.created_at || 0) - Number(previous.created_at || 0) < 300;
      const reactionEvents = room.chatReactions && typeof room.chatReactions.get === 'function'
        ? (room.chatReactions.get(ev.id) || [])
        : [];
      const reactionSummary = summarizeChatReactions(reactionEvents);
      const reactionHtml = Array.from(reactionSummary.byEmoji.entries()).map(function(entry) {
        return '<button type="button" class="nest-chat-reaction-chip" data-chat-id="' + esc(ev.id) + '" data-chat-emoji="' + esc(entry[0]) + '">' + esc(entry[0]) + '<span>' + entry[1] + '</span></button>';
      }).join('') + (reactionSummary.zapCount ? '<span class="nest-chat-zap-chip">⚡ ' + reactionSummary.zapCount + '</span>' : '');
      return '<div class="nest-chat-message' + (sameSender ? ' is-grouped' : '') + '">' +
        (sameSender ? '<span class="nest-chat-avatar nest-chat-avatar-empty"></span>' :
          '<span class="nest-chat-avatar">' + (picture ? '<img src="' + esc(picture) + '" alt="">' : esc(name.slice(0, 1).toUpperCase())) + '</span>') +
        '<div class="nest-chat-copy"><div><strong>' + esc(name) + '</strong><time>' + esc(when) + '</time></div><p>' + esc(content) + '</p>' +
          '<div class="nest-chat-action-row">' +
            '<button type="button" class="nest-chat-quick-react" data-chat-id="' + esc(ev.id) + '" data-chat-emoji="🔥">🔥</button>' +
            '<button type="button" class="nest-chat-quick-react" data-chat-id="' + esc(ev.id) + '" data-chat-emoji="❤️">❤️</button>' +
            (prof.lud16 || prof.lud06 ? '<button type="button" class="nest-chat-zap-btn" data-chat-pubkey="' + esc(ev.pubkey) + '">Zap</button>' : '') +
          '</div>' +
          (reactionHtml ? '<div class="nest-chat-reactions">' + reactionHtml + '</div>' : '') +
        '</div></div>';
    }).join('');

    Array.from(chatEl.querySelectorAll('.nest-chat-quick-react,.nest-chat-reaction-chip')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        const message = messages.find(function(ev) { return String(ev.id) === String(btn.getAttribute('data-chat-id')); });
        if (!message) return;
        sendNestChatReaction(message, btn.getAttribute('data-chat-emoji') || '👍').catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Could not react to chat.';
        });
      });
    });
    Array.from(chatEl.querySelectorAll('.nest-chat-zap-btn')).forEach(function(btn) {
      btn.addEventListener('click', function() {
        const pubkey = btn.getAttribute('data-chat-pubkey') || '';
        const profile = profiles.get(pubkey.toLowerCase()) || {};
        zapNestParticipant(pubkey, profile).catch(function(err) {
          const status = $('#nestRoomAudioStatus', modal);
          if (status) status.textContent = err && err.message ? err.message : 'Zap failed.';
        });
      });
    });

    if (stickToBottom) chatEl.scrollTop = chatEl.scrollHeight;
  }

  function isActiveNestLive(room) {
    if (!room) return false;
    const roomStatus = String(room.status || '').toLowerCase();
    if (roomStatus === 'ended') return false;

    const meeting = room.meeting;
    if (meeting) {
      const meetingStatus = String(meeting.status || '').toLowerCase();
      if (meetingStatus === 'ended' || meetingStatus === 'planned') return false;
      const meetingEnds = Number(meeting.ends || 0);
      if (meetingEnds && meetingEnds <= now()) return false;
      if (meetingStatus === 'live' || meetingStatus === 'open') return true;
    }

    const starts = Number(room.starts || 0);
    const ends = Number(room.ends || 0);
    if (ends && ends <= now()) return false;
    if (starts && starts > now()) return false;
    return roomStatus === 'live' || roomStatus === 'open';
  }

  function activeRoomCanPublish() {
    const ctx = getSifakaContext();
    const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
    if (!user || !activeRoom) return false;
    const pubkey = String(user.pubkey || '').toLowerCase();
    if (pubkey && pubkey === String(activeRoom.pubkey || '').toLowerCase()) return true;
    return Array.isArray(activeRoom.participants) && activeRoom.participants.some(function(person) {
      if (!person || String(person.pubkey || '').toLowerCase() !== pubkey) return false;
      return /host|speaker|moderator|admin|owner/i.test(String(person.role || ''));
    });
  }

  function roomJoinLabel(isLive) {
    if (!isLive) return 'Open Room';
    return activeRoomCanPublish() ? 'Join As Speaker' : 'Join As Listener';
  }

  function renderRoom(room, profiles, fallback) {
    const status = String(room.status || '').toLowerCase();
    const meeting = room.meeting;
    const meetingStatus = String(meeting && meeting.status || '').toLowerCase();
    const live = meetingStatus ? meetingStatus === 'live' : (status === 'live' || status === 'open');
    const title = (meeting && meeting.title) || room.title || fallback.title || 'Nostr Nest';
    const summary = (meeting && meeting.summary) || room.summary || fallback.summary || 'Live audio conversation on Nostr.';
    const image = (meeting && meeting.image) || room.image || fallback.img || '';
    const people = [];
    function addPeople(list) {
      (list || []).forEach(function(p) {
        if (!p || !p.pubkey || people.some(function(x) { return x.pubkey === p.pubkey; })) return;
        people.push(p);
      });
    }
    addPeople(room.participants);
    addPeople(meeting && meeting.participants);
    if (room.pubkey && !people.some(function(p) { return p.pubkey === room.pubkey; })) people.unshift({ pubkey: room.pubkey, role: 'Host' });
    const hosts = people.filter(function(p) { return /host|owner/i.test(p.role); });
    const speakers = people.filter(function(p) { return /speaker|moderator|admin/i.test(p.role); });
    const ordered = hosts.concat(speakers, people.filter(function(p) { return hosts.indexOf(p) < 0 && speakers.indexOf(p) < 0; })).slice(0, 16);
    const presence = Array.from(room.presence || []);
    const count = Math.max(Number(meeting && meeting.currentParticipants || 0), Number(room.currentParticipants || 0), presence.length);
    const roomStatus = (meeting && meeting.status) || (live ? 'live' : status || 'open');

    $('#nestPreviewCover', modal).innerHTML = image ? '<img src="' + esc(image) + '" alt="">' : '<div class="nest-preview-cover-fallback">N</div>';
    $('#nestPreviewStatus', modal).innerHTML = '<span class="' + (live ? 'live' : '') + '">' + (live ? '● LIVE NOW' : esc(roomStatus.toUpperCase())) + '</span>';
    $('#nestPreviewTitle', modal).textContent = title;
    $('#nestPreviewSummary', modal).textContent = summary;

    const speakerCount = speakers.length;
    const hostCount = hosts.length || (room.pubkey ? 1 : 0);
    $('#nestPreviewStats', modal).innerHTML =
      '<span><strong>' + count + '</strong> listener' + (count === 1 ? '' : 's') + '</span>' +
      '<span><strong>' + hostCount + '</strong> host' + (hostCount === 1 ? '' : 's') + '</span>' +
      '<span><strong>' + speakerCount + '</strong> speaker' + (speakerCount === 1 ? '' : 's') + '</span>';

    const start = Number((meeting && meeting.starts) || room.starts || 0);
    const end = Number((meeting && meeting.ends) || room.ends || 0);
    clearInterval(countdownTimer);
    if (start) {
      const renderSchedule = function() {
        const currentNow = now();
        let detail = relativeTime(start);
        if (live && end && end > currentNow) {
          const left = end - currentNow;
          const mins = Math.floor(left / 60);
          const secs = left % 60;
          detail = 'Ends in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + ':' + String(secs).padStart(2, '0'));
        }
        $('#nestPreviewSchedule', modal).innerHTML =
          '<div class="nest-preview-schedule-icon">' + (live ? '●' : '◷') + '</div><div><strong>' + (live ? 'Live session' : 'Scheduled session') + '</strong><span>' +
          esc(formatDate(start)) + (end ? ' — ' + esc(formatDate(end)) : '') + '</span><small id="nestPreviewCountdown">' + esc(detail) + '</small></div>';
      };
      renderSchedule();
      countdownTimer = setInterval(function() {
        if (!modal || !modal.classList.contains('open')) return;
        renderSchedule();
      }, 1000);
    } else {
      $('#nestPreviewSchedule', modal).innerHTML = '';
    }
    const showSchedule = !!start && (!live || !!end);
    $('#nestPreviewSchedule', modal).style.display = showSchedule ? '' : 'none';

    const showProfile = function(pubkey, role) {
      if (roomPageMode && typeof window.showProfileByPubkey === 'function') {
        window.showProfileByPubkey(pubkey, { routeMode: 'push' });
        return;
      }
      const sheet = modal && modal._profileSheet;
      if (!sheet || !pubkey) return;
      sheet.classList.add('open');
      const normalizedPubkey = String(pubkey).toLowerCase();
      const profile = profiles.get(normalizedPubkey) || {};
      const name = profileDisplayName(profile);
      const picture = safeNestImageUrl(profile.picture);
      const banner = safeNestImageUrl(profile.banner);
      let npub = '';
      try { if (window.NostrTools?.nip19?.npubEncode) npub = window.NostrTools.nip19.npubEncode(pubkey); } catch (_) {}
      sheet.dataset.npub = npub;
      sheet.dataset.pubkey = normalizedPubkey;
      $('#nestProfileName', sheet).textContent = name;
      $('#nestProfileRole', sheet).textContent = role || 'Nest participant';
      $('#nestProfileAbout', sheet).textContent = profile.about || 'No profile bio published.';
      $('#nestProfileAvatar', sheet).innerHTML = picture ? '<img src="' + esc(picture) + '" alt="">' : '<span>' + esc(name.slice(0,1).toUpperCase()) + '</span>';
      $('#nestProfileHero', sheet).style.backgroundImage = banner ? 'url("' + esc(banner) + '")' : '';
      $('#nestProfileNpub', sheet).textContent = npub || 'npub unavailable';
      $('#nestProfileOpen', sheet).disabled = !npub;
      $('#nestProfileCopy', sheet).disabled = !npub;

      const user = getCurrentNestUser();
      const isSelf = !!(user && String(user.pubkey).toLowerCase() === normalizedPubkey);
      const currentEntry = (activeRoom && Array.isArray(activeRoom.participants))
        ? activeRoom.participants.find(function(person) { return String(person.pubkey || '').toLowerCase() === normalizedPubkey; })
        : null;
      const onStage = !!(currentEntry && /speaker|admin|host|owner/i.test(String(currentEntry.role || ''))) || String(activeRoom && activeRoom.pubkey || '').toLowerCase() === normalizedPubkey;
      const admin = activeRoomUserIsAdmin();

      const followBtn = $('#nestProfileFollowBtn', sheet);
      const muteBtn = $('#nestProfileMuteBtn', sheet);
      const zapBtn = $('#nestProfileZapBtn', sheet);
      const stageBtn = $('#nestProfileStageBtn', sheet);
      const adminBtn = $('#nestProfileAdminBtn', sheet);
      const kickBtn = $('#nestProfileKickBtn', sheet);
      const isTargetAdmin = !!(currentEntry && /admin/i.test(String(currentEntry.role || '')));
      const isTargetHost = String(activeRoom && activeRoom.pubkey || '').toLowerCase() === normalizedPubkey;

      [followBtn, muteBtn, zapBtn, stageBtn, adminBtn, kickBtn].forEach(function(btn) { if (btn) btn.hidden = true; });
      if (!isSelf && user) {
        if (followBtn) { followBtn.hidden = false; followBtn.textContent = 'Follow'; }
        if (muteBtn) { muteBtn.hidden = false; muteBtn.textContent = 'Mute'; }
        if (zapBtn) zapBtn.hidden = !profile.lud16 && !profile.lud06;
      }
      if (admin && !isSelf && normalizedPubkey !== String(activeRoom && activeRoom.pubkey || '').toLowerCase()) {
        if (stageBtn) {
          stageBtn.hidden = false;
          stageBtn.textContent = onStage ? 'Remove from Stage' : 'Add to Stage';
        }
        if (String((activeRoomEvent && activeRoomEvent.pubkey) || '').toLowerCase() === String(getCurrentNestUser().pubkey).toLowerCase() && !isTargetHost && adminBtn) {
          adminBtn.hidden = false;
          adminBtn.textContent = isTargetAdmin ? 'Remove Admin' : 'Make Admin';
        }
        if (kickBtn) {
          kickBtn.hidden = false;
          kickBtn.textContent = 'Kick';
        }
      }

      if (followBtn) {
        isNestUserInList(3, normalizedPubkey).then(function(isFollowing) {
          followBtn.textContent = isFollowing ? 'Unfollow' : 'Follow';
          followBtn.onclick = function() {
            publishNestUserList(3, normalizedPubkey, !isFollowing).then(function() {
              followBtn.textContent = isFollowing ? 'Follow' : 'Unfollow';
            }).catch(function(err) { window.alert(err && err.message ? err.message : 'Could not update follow state.'); });
          };
        }).catch(function() {});
      }
      if (muteBtn) {
        isNestUserInList(10000, normalizedPubkey).then(function(isMuted) {
          muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
          muteBtn.onclick = function() {
            publishNestUserList(10000, normalizedPubkey, !isMuted).then(function() {
              muteBtn.textContent = isMuted ? 'Mute' : 'Unmute';
            }).catch(function(err) { window.alert(err && err.message ? err.message : 'Could not update mute state.'); });
          };
        }).catch(function() {});
      }
      if (zapBtn) {
        zapBtn.onclick = function() {
          zapNestParticipant(normalizedPubkey, profile).catch(function(err) {
            window.alert(err && err.message ? err.message : 'Zap failed.');
          });
        };
      }
      if (stageBtn) {
        stageBtn.onclick = function() {
          updateNestParticipantRole(normalizedPubkey, onStage ? null : 'speaker').catch(function(err) {
            window.alert(err && err.message ? err.message : 'Could not update stage.');
          });
        };
      }
      if (adminBtn) {
        adminBtn.onclick = function() {
          updateNestParticipantRole(normalizedPubkey, isTargetAdmin ? 'speaker' : 'admin').catch(function(err) {
            window.alert(err && err.message ? err.message : 'Could not update admin role.');
          });
        };
      }
      if (kickBtn) {
        kickBtn.onclick = function() {
          kickNestParticipant(normalizedPubkey).catch(function(err) {
            window.alert(err && err.message ? err.message : 'Could not kick participant.');
          });
        };
      }
    };

    const peopleHtml = ordered.map(function(p) {
      const prof = profiles.get(p.pubkey) || {};
      const name = profileDisplayName(prof);
      const picture = safeNestImageUrl(prof.picture);
      const role = String(p.role || 'Participant');
      return '<button class="nest-person" type="button">' +
        '<span class="nest-person-avatar">' + (picture ? '<img src="' + esc(picture) + '" alt="">' : '<span>' + esc(name.slice(0,1).toUpperCase()) + '</span>') + '</span>' +
        '<span class="nest-person-copy"><strong>' + esc(name) + '</strong><small>' + esc(role) + '</small></span>' +
        '<span class="nest-person-role nest-person-role-' + roleClass(role) + '">' + esc(role) + '</span>' +
        '<span class="nest-person-dot ' + roleClass(role) + '"></span></button>';
    }).join('');
    $('#nestPreviewPeople', modal).innerHTML = peopleHtml || '<div class="nest-preview-empty">No named speakers were published yet.</div>';
    Array.from($('#nestPreviewPeople', modal).querySelectorAll('.nest-person')).forEach(function(button, index) {
      const person = ordered[index];
      if (person) button.addEventListener('click', function() { showProfile(person.pubkey, person.role); });
    });
    $('#nestPreviewPeopleCount', modal).textContent = ordered.length ? ordered.length + ' shown' : '';

    const listenerKeys = presence.filter(function(k) { return !ordered.some(function(p) { return p.pubkey === k; }); }).slice(0, 12);
    $('#nestPreviewListenerCount', modal).textContent = count ? count + ' present' : 'No live count';
    $('#nestPreviewListeners', modal).innerHTML = listenerKeys.length
      ? listenerKeys.map(function(k) {
          const prof = profiles.get(k) || {};
          const name = profileDisplayName(prof);
          const picture = safeNestImageUrl(prof.picture);
          return '<button class="nest-listener" type="button" title="' + esc(name) + '" data-pubkey="' + esc(k) + '">' +
            (picture ? '<img src="' + esc(picture) + '" alt="">' : esc(name.slice(0,1).toUpperCase())) + '</button>';
        }).join('') + (count > listenerKeys.length ? '<span class="nest-listener-more">+' + (count - listenerKeys.length) + '</span>' : '')
      : '<span class="nest-listener-text">' + (count ? count + ' listener' + (count === 1 ? '' : 's') + ' currently in the room' : 'Presence is not currently published.') + '</span>';
    Array.from($('#nestPreviewListeners', modal).querySelectorAll('.nest-listener')).forEach(function(button) {
      const pubkey = button.getAttribute('data-pubkey');
      button.addEventListener('click', function() { showProfile(pubkey, 'Listener'); });
    });

    renderChat(room, profiles);

    const topicValues = Array.from(new Set((room.topics || []).concat((meeting && meeting.topics) || []))).slice(0, 8);
    $('#nestPreviewTopics', modal).innerHTML = topicValues.map(function(t) { return '<span>#' + esc(t) + '</span>'; }).join('');
    const joinButton = $('#nestPreviewJoinBtn', modal);
    if (joinButton) {
      joinButton.textContent = activeRoomAudio
        ? (activeRoomAudio.isPublishing ? 'Joined As Speaker' : 'Joined As Listener')
        : roomJoinLabel(live);
      joinButton.disabled = !!activeRoomAudio;
      joinButton.classList.remove('btn-danger');
    }
    const leaveButton = $('#nestRoomLeaveBtn', modal);
    if (leaveButton) leaveButton.disabled = false;
    updateActiveRoomAudioUi();
    $('#nestPreviewFootnote', modal).textContent = room.sourceCount > 1 ? 'Room details merged from ' + room.sourceCount + ' relays.' : 'Room details are read from Nostr NIP-53 events.';
  }

  async function enterActiveRoom(options = {}) {
    if (activeRoomJoinPromise) return activeRoomJoinPromise;
    activeRoomJoinPromise = (async function() {
    if (!activeRoomUrl) return;
    if (activeRoomAudio && activeRoomAudio.state === 'connected') return;
    if (activeRoomAudio && (activeRoomAudio.state === 'disconnected' || activeRoomAudio.state === 'error')) {
      try { await activeRoomAudio.disconnect(); } catch (_) {}
      activeRoomAudio = null;
    }
    if (!activeRoomEvent || !activeRoom) {
      await openPreview(activeRoomUrl, {
        title: $('#nestPreviewTitle', modal)?.textContent || 'Nostr Nest',
        summary: $('#nestPreviewSummary', modal)?.textContent || '',
        img: $('#nestPreviewCover img', modal)?.getAttribute('src') || '',
        badge: $('#nestPreviewStatus', modal)?.textContent || 'LIVE',
        countText: $('#nestPreviewListenerCount', modal)?.textContent || '',
        topics: []
      });
    }
    if (!activeRoomEvent) throw new Error('Could not load the Nest room event from Nostr.');

    const ctx = getSifakaContext();
    const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
    if (!user) throw new Error('Please sign in to join Nest audio.');

    const d = String(tag(activeRoomEvent, 'd') || activeRoom.d || '');
    const namespace = 'nests/30312:' + activeRoomEvent.pubkey + ':' + d;
    const streamingUrl = normalizeNestStreamingUrl(tag(activeRoomEvent, 'streaming') || activeRoom.streaming || '');

    let token = '';
    const wantsPublish = options.publish === true;
    let publish = wantsPublish && activeRoomCanPublish();

    try {
      // Match the reference Nostr Nests client: ordinary listeners authenticate
      // with listen-only scope. Only a room participant explicitly marked as
      // host/speaker/moderator/admin/owner requests publish rights.
      token = await authenticateNestAudio(activeRoomEvent, namespace, publish);
      if (publish) {
        console.info('[sifaka-nests] authenticated with speaker scope');
      }
    } catch (authErr) {
      if (publish) {
        console.warn('[sifaka-nests] speaker auth failed; retrying listener auth', authErr);
        publish = false;
        token = await authenticateNestAudio(activeRoomEvent, namespace, false);
      } else {
        throw authErr;
      }
    }

    const bar = $('#nestRoomAudioBar', modal);
    const compose = $('#nestRoomChatCompose', modal);
    const join = $('#nestPreviewJoinBtn', modal);
    if (bar) bar.hidden = false;
    if (compose) compose.hidden = !user;
    if (join) {
      join.textContent = 'Connecting…';
      join.disabled = true;
      join.classList.remove('btn-danger');
    }
    const leaveButton = $('#nestRoomLeaveBtn', modal);
    if (leaveButton) leaveButton.disabled = false;
    modal.classList.add('is-live-room');

    activeRoomAudio = new SifakaNestAudioTransport();
    activeRoomAudio.onStateChange(function() { updateActiveRoomAudioUi(); });

    try {
      await activeRoomAudio.connect({
        serverUrl: streamingUrl,
        namespace: namespace,
        identity: String(user.pubkey),
        token: token,
        publish: publish
      });
      clearNestRoomError(modal);
      if (join) {
        join.disabled = true;
        join.textContent = activeRoomAudio.state === 'connected'
          ? (activeRoomAudio.isPublishing ? 'Joined As Speaker' : 'Joined As Listener')
          : 'Connecting…';
      }
      const stagePubkeys = (activeRoom && Array.isArray(activeRoom.participants) ? activeRoom.participants : [])
        .filter(function(person) {
          const role = String(person && person.role || '').toLowerCase();
          return /host|speaker|moderator/.test(role);
        })
        .map(function(person) { return person && person.pubkey; })
        .filter(Boolean);
      if (activeRoomAudio && typeof activeRoomAudio.setParticipants === 'function') {
        activeRoomAudio.setParticipants(stagePubkeys);
      }
      startActiveRoomPresence();
      startActiveRoomRefresh();
      updateActiveRoomAudioUi();
    } catch (err) {
      if (activeRoomAudio) {
        await activeRoomAudio.disconnect();
        activeRoomAudio = null;
      }
      if (bar) bar.hidden = true;
      if (compose) compose.hidden = true;
      if (join) {
        join.disabled = false;
        join.textContent = roomJoinLabel(true);
      }
      modal.classList.remove('is-live-room');
      throw err;
    }
  }

    })().finally(function() {
      activeRoomJoinPromise = null;
    });
    return activeRoomJoinPromise;
  }

  async function leaveActiveRoom() {
    if (activeRoomPresenceTimer) {
      clearInterval(activeRoomPresenceTimer);
      activeRoomPresenceTimer = null;
    }
    if (activeRoomRefreshTimer) {
      clearInterval(activeRoomRefreshTimer);
      activeRoomRefreshTimer = null;
    }
    if (activeRoomChatTimer) {
      clearInterval(activeRoomChatTimer);
      activeRoomChatTimer = null;
    }
    activeRoomRefreshInFlight = false;
    activeRoomChatRefreshInFlight = false;
    if (activeRoomAudio) {
      await publishActiveRoomDeparture();
      try { await activeRoomAudio.disconnect(); } catch (_) {}
      activeRoomAudio = null;
    }
    if (!modal) return;
    const bar = $('#nestRoomAudioBar', modal);
    const compose = $('#nestRoomChatCompose', modal);
    const join = $('#nestPreviewJoinBtn', modal);
    if (bar) bar.hidden = true;
    if (compose) compose.hidden = true;
    if (join) {
      join.disabled = false;
      const liveNow = String($('#nestPreviewStatus', modal)?.textContent || '').toLowerCase().includes('live');
      join.textContent = roomJoinLabel(liveNow);
      join.classList.remove('btn-danger');
    }
    modal.classList.remove('is-live-room');
  }

  async function publishActiveRoomPresence() {
    try {
      await publishCurrentRoomPresence();
    } catch (err) {
      console.warn('[sifaka-nests] presence publish failed', err);
    }
  }

  async function publishActiveRoomDeparture() {
    if (!activeRoom || !activeRoom.a || !getCurrentNestUser()) return;
    try {
      const event = await signRoomEvent(10312, '', [
        ['a', activeRoom.a],
        ['hand', '0'],
        ['publishing', '0'],
        ['muted', '1'],
        ['onstage', '0']
      ]);
      await publishSignedRoomEvent(event, activeRoomRelays);
    } catch (err) {
      console.warn('[sifaka-nests] departure presence publish failed', err);
    }
  }

  function startActiveRoomPresence() {
    const ctx = getSifakaContext();
    const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
    if (!user || !activeRoom || !activeRoom.a) return;
    publishActiveRoomPresence().catch(function() {});
    clearInterval(activeRoomPresenceTimer);
    activeRoomPresenceTimer = setInterval(function() {
      publishActiveRoomPresence().catch(function() {});
    }, 120000);
  }

  function startActiveRoomRefresh() {
    clearInterval(activeRoomRefreshTimer);
    clearInterval(activeRoomChatTimer);

    activeRoomRefreshTimer = setInterval(function() {
      if (!activeRoomUrl || !modal || !modal.classList.contains('is-live-room')) return;
      if (activeRoomRefreshInFlight) return;
      activeRoomRefreshInFlight = true;
      refreshLiveRoom(activeRoomUrl)
        .catch(function() {})
        .finally(function() { activeRoomRefreshInFlight = false; });
    }, 12000);

    activeRoomChatTimer = setInterval(function() {
      if (!activeRoomUrl || !modal || !modal.classList.contains('is-live-room')) return;
      if (activeRoomChatRefreshInFlight) return;
      activeRoomChatRefreshInFlight = true;
      refreshActiveRoomInteractions(activeRoomUrl)
        .catch(function() {})
        .finally(function() { activeRoomChatRefreshInFlight = false; });
    }, 4000);
  }

  async function sendActiveRoomChat() {
    const input = $('#nestRoomChatInput', modal);
    if (!input || !String(input.value || '').trim()) return;
    if (!activeRoom || !activeRoom.a) throw new Error('This room does not expose a valid Nostr room address.');
    const content = String(input.value || '').trim().slice(0, 1000);
    const event = await signRoomEvent(1311, content, [['a', activeRoom.a]]);
    await publishSignedRoomEvent(event, activeRoomRelays);
    input.value = '';
    refreshLiveRoom(activeRoomUrl).catch(function() {});
  }

  async function refreshActiveRoomInteractions(url) {
    const decoded = decodeRoom(url);
    if (!decoded || !modal || !modal.classList.contains('is-live-room') || activeRoomUrl !== url) return;

    const events = await relayQuery([
      { kinds: [1311], '#a': [decoded.a], limit: 60 },
      { kinds: [7, 9735], '#a': [decoded.a], limit: 220 },
      { kinds: [10312], '#a': [decoded.a], limit: 200 }
    ], 2600, roomRelayUrls(activeRoom, decoded));

    if (!modal || !modal.classList.contains('is-live-room') || activeRoomUrl !== url) return;

    const interactionEvents = events.filter(function(e) { return Number(e.kind) === 7 || Number(e.kind) === 9735; });
    const reactionMaps = buildRoomReactionMaps(interactionEvents);
    activeRoomReactions = reactionMaps.roomReactions.map(function(ev) {
      const emojiTag = (ev.tags || []).find(function(t) {
        return Array.isArray(t) && t[0] === 'emoji' && t[1] && t[2];
      });
      return {
        id: ev.id,
        content: ev.content,
        pubkey: ev.pubkey,
        created_at: ev.created_at,
        emojiUrl: emojiTag ? String(emojiTag[2] || '') : ''
      };
    }).sort(function(a,b) {
      return Number(b.created_at || 0) - Number(a.created_at || 0);
    }).slice(0, 24);
    activeRoomChatReactions = reactionMaps.chatMap;

    const presence = new Set();
    events.filter(function(e) {
      return Number(e.kind) === 10312 && Number(e.created_at || 0) >= now() - PRESENCE_TTL;
    }).forEach(function(e) {
      presence.add(String(e.pubkey || '').toLowerCase());
    });

    const user = getCurrentNestUser();
    if (user) {
      const me = events.filter(function(e) {
        return Number(e.kind) === 10312 &&
          String(e.pubkey || '').toLowerCase() === String(user.pubkey || '').toLowerCase();
      }).sort(function(a,b) {
        return Number(b.created_at || 0) - Number(a.created_at || 0);
      })[0];
      activeRoomHandRaised = tag(me, 'hand') === '1';
    }

    activeRoom = Object.assign({}, activeRoom || {}, {
      presence: presence,
      chat: events.filter(function(e) { return Number(e.kind) === 1311; }),
      reactions: interactionEvents,
      chatReactions: reactionMaps.chatMap
    });

    updateNestInteractionUi();

    const chatPubkeys = activeRoom.chat.map(function(ev) {
      return String(ev.pubkey || '').toLowerCase();
    }).filter(Boolean);
    const profiles = await loadProfiles(Array.from(new Set(chatPubkeys.concat(Array.from(presence)))));
    if (!modal || !modal.classList.contains('is-live-room') || activeRoomUrl !== url) return;
    renderChat(activeRoom, profiles);
    renderNestReactionOverlay();
  }

  function chooseCurrentMeeting(events) {
    const meetings = (Array.isArray(events) ? events : [])
      .filter(function(e) { return Number(e && e.kind || 0) === 30313; })
      .sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); });

    // Kind:30313 is parameterized replaceable. Keep only the newest event
    // for each d-tag before deciding which meeting is current.
    const latestByD = new Map();
    meetings.forEach(function(ev) {
      const d = String(tag(ev, 'd') || '').trim();
      if (!d) return;
      if (!latestByD.has(d)) latestByD.set(d, ev);
    });

    const latest = Array.from(latestByD.values())
      .sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); });
    const current = latest.find(function(e) {
      const status = String(tag(e, 'status') || '').toLowerCase();
      const starts = Number(tag(e, 'starts') || 0);
      const ends = Number(tag(e, 'ends') || 0);
      if (status === 'live' || status === 'open') return !ends || ends > now();
      if (status === 'planned') return starts > now();
      // Some producers omit status while the start/end window is authoritative.
      if (!status) return (!starts || starts <= now()) && (!ends || ends > now());
      return false;
    });
    if (current) return current;

    // No active meeting: prefer the next scheduled meeting, otherwise the
    // newest historical meeting so ended rooms are shown as ended rather than
    // being resurrected by an older live event.
    return latest.find(function(e) {
      return Number(tag(e, 'starts') || 0) > now();
    }) || latest[0] || null;
  }

  async function openPreview(url, fallback) {
    if (activeRoomAudio && activeRoomUrl === url) return;
    if (activeRoomAudio) await leaveActiveRoom();
    activeRoomUrl = url;
    activeRoomEvent = null;
    activeRoom = null;
    activeRoomRelays = [];
    renderLoading(fallback);
    const decoded = decodeRoom(url);
    if (!decoded) {
      renderRoom({
        title: fallback.title, summary: fallback.summary, image: fallback.img,
        pubkey: '', status: /live/i.test(fallback.badge) ? 'live' : 'open',
        currentParticipants: parseInt(fallback.countText, 10) || 0, participants: [], presence: new Set(), a: ''
      }, new Map(), fallback);
      return;
    }

    const events = await relayQuery([
      { kinds: [30312], authors: [decoded.pubkey], '#d': [decoded.d], limit: 20 },
      { kinds: [30313], '#a': [decoded.a], limit: 20 },
      { kinds: [1311], '#a': [decoded.a], limit: 60 },
      { kinds: [7, 9735], '#a': [decoded.a], limit: 220 },
      { kinds: [10312], '#a': [decoded.a], limit: 300 },
      { kinds: [4312], '#a': [decoded.a], limit: 50 }
    ], 5200, roomRelayUrls(null, decoded));
    if (!modal || !modal.classList.contains('open') || activeRoomUrl !== url) return;

    const rooms = events.filter(function(e) { return Number(e.kind) === 30312; }).sort(function(a,b) { return Number(b.created_at||0)-Number(a.created_at||0); });
    const roomEvent = rooms[0] || null;
    const current = chooseCurrentMeeting(events);
    const presence = new Set();
    events.filter(function(e) { return Number(e.kind) === 10312; }).forEach(function(e) {
      if (Number(e.created_at || 0) >= now() - PRESENCE_TTL) presence.add(String(e.pubkey || '').toLowerCase());
    });

    const roomParticipants = pTags(roomEvent);
    const meetingParticipants = pTags(current);
    const people = roomParticipants.slice();
    meetingParticipants.forEach(function(p) { if (!people.some(function(x) { return x.pubkey === p.pubkey; })) people.push(p); });
    if (decoded.pubkey && !people.some(function(p) { return p.pubkey === decoded.pubkey; })) people.unshift({ pubkey: decoded.pubkey, role: 'Host' });

    const interactionEvents = events.filter(function(e) { return Number(e.kind) === 7 || Number(e.kind) === 9735; });
    const reactionMaps = buildRoomReactionMaps(interactionEvents);
    activeRoomReactions = reactionMaps.roomReactions.map(function(ev) {
      const emojiTag = (ev.tags || []).find(function(t) {
        return Array.isArray(t) && t[0] === 'emoji' && t[1] && t[2];
      });
      return {
        id: ev.id,
        content: ev.content,
        pubkey: ev.pubkey,
        created_at: ev.created_at,
        emojiUrl: emojiTag ? String(emojiTag[2] || '') : ''
      };
    }).sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); }).slice(0, 24);
    activeRoomChatReactions = reactionMaps.chatMap;
    activeRoomHandRaised = false;
    const currentUser = getCurrentNestUser();
    if (currentUser) {
      const me = events.filter(function(e) {
        return Number(e.kind) === 10312 && String(e.pubkey || '').toLowerCase() === String(currentUser.pubkey || '').toLowerCase();
      }).sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); })[0];
      activeRoomHandRaised = tag(me, 'hand') === '1';
    }
    activeRoomCustomEmojis = await loadNestCustomEmojis();

    const profiles = await loadProfiles(Array.from(new Set(people.map(function(p) { return p.pubkey; }).concat(Array.from(presence)))));
    const room = {
      pubkey: decoded.pubkey, d: decoded.d,
      title: tag(roomEvent,'room') || tag(roomEvent,'title') || fallback.title,
      summary: tag(roomEvent,'summary') || fallback.summary,
      image: tag(roomEvent,'image') || fallback.img,
      status: tag(roomEvent,'status') || 'open',
      starts: Number(tag(roomEvent,'starts') || 0), ends: Number(tag(roomEvent,'ends') || 0),
      topics: tags(roomEvent,'t'), currentParticipants: Number(tag(roomEvent,'current_participants') || 0),
      participants: people, roomParticipants: roomParticipants, meetingParticipants: meetingParticipants,
      presence: presence,
      chat: events.filter(function(e) { return Number(e.kind) === 1311; }),
      reactions: interactionEvents,
      chatReactions: reactionMaps.chatMap,
      meeting: current ? {
        title: tag(current,'title'), summary: tag(current,'summary'), image: tag(current,'image'),
        starts: Number(tag(current,'starts') || 0), ends: Number(tag(current,'ends') || 0),
        status: tag(current,'status'), currentParticipants: Number(tag(current,'current_participants') || 0),
        participants: pTags(current), topics: tags(current,'t')
      } : null,
      sourceCount: new Set(events.map(function(e) { return e.id; })).size,
      a: decoded.a,
      relays: tags(roomEvent, 'relays'),
      streaming: tag(roomEvent, 'streaming'),
      auth: tag(roomEvent, 'auth')
    };
    activeRoomEvent = roomEvent;
    activeRoom = room;
    activeRoomRelays = roomRelayUrls(room, decoded);
    applyNestRoomTheme(roomEvent);
    updateNestInteractionUi();
    renderRoom(room, profiles, fallback);
    const kickEvents = events.filter(function(e) {
      if (Number(e.kind) !== 4312 || String(e.pubkey || '').toLowerCase() !== String(decoded.pubkey || '').toLowerCase() && !pTags(roomEvent).some(function(p) { return /admin/i.test(p.role) && p.pubkey === String(e.pubkey || '').toLowerCase(); })) return false;
      return tag(e, 'action') === 'kick' && String(tag(e, 'p') || '').toLowerCase() === String((getCurrentNestUser() || {}).pubkey || '').toLowerCase();
    });
    if (kickEvents.length && getCurrentNestUser()) {
      const status = $('#nestRoomAudioStatus', modal);
      if (status) status.textContent = 'You were removed from this Nest.';
      leaveActiveRoom().catch(function() {});
    }

    // Keep a live room lobby feeling live: refresh presence/chat more often than
    // the heavier room/profile metadata refresh. The preview is always closed
    // and cleaned up when the modal closes.
    clearTimeout(liveRefreshTimer);
    if (modal && modal.classList.contains('open') && activeRoomUrl === url && !activeRoomRefreshTimer) {
      liveRefreshTimer = setTimeout(function() {
        if (modal && modal.classList.contains('open') && activeRoomUrl === url) {
          refreshLiveRoom(url);
        }
      }, 12000);
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(function() {
      if (modal && modal.classList.contains('open') && activeRoomUrl === url) openPreview(url, fallback);
    }, 60000);
  }

  async function refreshLiveRoom(url) {
    const decoded = decodeRoom(url);
    if (!decoded || !modal || !modal.classList.contains('open') || activeRoomUrl !== url) return;

    const events = await relayQuery([
      { kinds: [30312], authors: [decoded.pubkey], '#d': [decoded.d], limit: 5 },
      { kinds: [30313], '#a': [decoded.a], limit: 10 },
      { kinds: [1311], '#a': [decoded.a], limit: 60 },
      { kinds: [7, 9735], '#a': [decoded.a], limit: 220 },
      { kinds: [10312], '#a': [decoded.a], limit: 200 },
      { kinds: [4312], '#a': [decoded.a], limit: 50 }
    ], 3600, roomRelayUrls(activeRoom, decoded));

    if (!modal || !modal.classList.contains('open') || activeRoomUrl !== url) return;

    const refreshedRoomEvents = events
      .filter(function(e) { return Number(e.kind) === 30312; })
      .sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); });
    const refreshedRoomEvent = refreshedRoomEvents[0] || activeRoomEvent || null;
    if (refreshedRoomEvent) activeRoomEvent = refreshedRoomEvent;

    const roomEnded = String(tag(refreshedRoomEvent, 'status') || '').toLowerCase() === 'ended';
    const current = roomEnded ? null : chooseCurrentMeeting(events);

    const interactionEvents = events.filter(function(e) { return Number(e.kind) === 7 || Number(e.kind) === 9735; });
    const reactionMaps = buildRoomReactionMaps(interactionEvents);
    activeRoomReactions = reactionMaps.roomReactions.map(function(ev) {
      const emojiTag = (ev.tags || []).find(function(t) {
        return Array.isArray(t) && t[0] === 'emoji' && t[1] && t[2];
      });
      return {
        id: ev.id,
        content: ev.content,
        pubkey: ev.pubkey,
        created_at: ev.created_at,
        emojiUrl: emojiTag ? String(emojiTag[2] || '') : ''
      };
    }).sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); }).slice(0, 24);
    activeRoomChatReactions = reactionMaps.chatMap;
    const currentUser = getCurrentNestUser();
    if (currentUser) {
      const me = events.filter(function(e) {
        return Number(e.kind) === 10312 && String(e.pubkey || '').toLowerCase() === String(currentUser.pubkey || '').toLowerCase();
      }).sort(function(a,b) { return Number(b.created_at || 0) - Number(a.created_at || 0); })[0];
      activeRoomHandRaised = tag(me, 'hand') === '1';
    }

    const presence = new Set();
    events.filter(function(e) { return Number(e.kind) === 10312; }).forEach(function(e) {
      if (Number(e.created_at || 0) >= now() - PRESENCE_TTL) presence.add(String(e.pubkey || '').toLowerCase());
    });

    const chat = events.filter(function(e) { return Number(e.kind) === 1311; });
    const chatPubkeys = chat.map(function(e) { return String(e.pubkey || '').toLowerCase(); }).filter(Boolean);
    const roster = [];
    const addRoster = function(person) {
      if (person && person.pubkey && !roster.some(function(x) { return x.pubkey === person.pubkey; })) roster.push(person);
    };
    (activeRoom && Array.isArray(activeRoom.roomParticipants) ? activeRoom.roomParticipants : []).forEach(addRoster);
    (current ? pTags(current) : []).forEach(addRoster);
    if (decoded.pubkey && !roster.some(function(p) { return p.pubkey === decoded.pubkey; })) {
      roster.unshift({ pubkey: decoded.pubkey, role: 'Host' });
    }

    const profiles = await loadProfiles(Array.from(new Set(
      presence.concat(roster.map(function(p) { return p.pubkey; }), chatPubkeys)
    )));

    activeRoom = Object.assign({}, activeRoom || {}, {
      pubkey: decoded.pubkey,
      d: decoded.d,
      a: decoded.a,
      title: tag(refreshedRoomEvent, 'title') || tag(refreshedRoomEvent, 'room') || (activeRoom && activeRoom.title) || 'Nostr Nest',
      summary: tag(refreshedRoomEvent, 'summary') || (activeRoom && activeRoom.summary) || '',
      image: tag(refreshedRoomEvent, 'image') || (activeRoom && activeRoom.image) || '',
      status: roomEnded ? 'ended' : (current ? tag(current,'status') : (activeRoom && activeRoom.status) || 'open'),
      starts: Number(tag(refreshedRoomEvent, 'starts') || (activeRoom && activeRoom.starts) || 0),
      ends: Number(tag(refreshedRoomEvent, 'ends') || (activeRoom && activeRoom.ends) || 0),
      relays: tags(refreshedRoomEvent, 'relays').length ? tags(refreshedRoomEvent, 'relays') : ((activeRoom && activeRoom.relays) || []),
      streaming: tag(refreshedRoomEvent, 'streaming') || (activeRoom && activeRoom.streaming) || '',
      auth: tag(refreshedRoomEvent, 'auth') || (activeRoom && activeRoom.auth) || '',
      participants: roster,
      roomParticipants: pTags(refreshedRoomEvent),

      meetingParticipants: current ? pTags(current) : [],
      presence: presence
    });

    applyNestRoomTheme(activeRoomEvent);
    updateNestInteractionUi();
    if (activeRoomAudio && typeof activeRoomAudio.setParticipants === 'function') {
      const stagePubkeys = roster
        .filter(function(person) {
          const role = String(person && person.role || '').toLowerCase();
          return /host|speaker|moderator/.test(role);
        })
        .map(function(person) { return person && person.pubkey; })
        .filter(Boolean);
      activeRoomAudio.setParticipants(stagePubkeys);
    }
    renderRoom({
      pubkey: decoded.pubkey,
      title: current ? tag(current,'title') : (activeRoom && activeRoom.title) || 'Nostr Nest',
      summary: current ? tag(current,'summary') : (activeRoom && activeRoom.summary) || '',
      image: current ? tag(current,'image') : (activeRoom && activeRoom.image) || '',
      status: current ? tag(current,'status') : 'open',
      starts: current ? Number(tag(current,'starts') || 0) : 0,
      ends: current ? Number(tag(current,'ends') || 0) : 0,
      topics: current ? tags(current,'t') : [],
      currentParticipants: current ? Number(tag(current,'current_participants') || 0) : 0,
      participants: roster,
      presence: presence,
      chat: chat,
      reactions: interactionEvents,
      chatReactions: reactionMaps.chatMap,
      meeting: null,
      sourceCount: 0,
      a: decoded.a
    }, profiles, {
      title: $('#nestPreviewTitle', modal).textContent || 'Nostr Nest',
      summary: $('#nestPreviewSummary', modal).textContent || '',
      img: $('#nestPreviewCover img', modal)?.getAttribute('src') || '',
      badge: $('#nestPreviewStatus', modal).textContent || '',
      countText: $('#nestPreviewListenerCount', modal).textContent || ''
    });

    if (roomEnded && activeRoomAudio) {
      await leaveActiveRoom();
    }

    clearTimeout(liveRefreshTimer);
    if (modal && modal.classList.contains('open') && activeRoomUrl === url && !activeRoomRefreshTimer) {
      liveRefreshTimer = setTimeout(function() { refreshLiveRoom(url); }, 12000);
    }
  }

  window.loadNestsRoomPage = async function(naddr, opts = {}) {
    const value = normalizeRoomNaddr(naddr);
    if (!value) return false;

    if (roomPageMode && roomPageNaddr === value && activeRoomAudio) {
      updateActiveRoomAudioUi();
      return true;
    }

    roomPageMode = true;
    roomPageNaddr = value;
    const root = ensureRoomPageRoot();
    if (!root) return false;
    modal = root;
    root.classList.add('open');
    document.body.classList.add('nest-room-page-open');

    const urlEl = document.getElementById('nestsRoomPageUrl');
    if (urlEl) urlEl.textContent = window.location.host + '/room/' + value;

    if (window.history && window.location.pathname !== '/room/' + value && opts.routeMode !== 'skip' && typeof window.showPage === 'function') {
      window.showPage('nestsRoom', {
        routeMode: opts.routeMode || 'push',
        roomNaddr: value,
        autoJoin: opts.autoJoin !== false,
        joinAsListener: opts.joinAsListener !== false
      });
      return true;
    }

    const fallback = {
      title: 'Nostr Nest',
      summary: 'Live audio conversation on Nostr.',
      host: '',
      countText: '',
      img: '',
      badge: 'NEST ROOM',
      topics: [],
      url: value
    };

    try {
      await openPreview(value, fallback);
      if (opts.autoJoin !== false && activeRoomEvent && isActiveNestLive(activeRoom)) {
        await enterActiveRoom({ publish: opts.joinAsListener === false });
      }
      const pageUrlEl = document.getElementById('nestsRoomPageUrl');
      if (pageUrlEl) pageUrlEl.textContent = window.location.host + '/room/' + value;
      return true;
    } catch (err) {
      showNestRoomError(err, root);
      return false;
    }
  };

  window.openNestsRoomPage = function(url, opts = {}) {
    const value = normalizeRoomNaddr(url);
    if (!value) return false;
    if (typeof window.showPage !== 'function') return false;
    window.showPage('nestsRoom', {
      routeMode: opts.routeMode || 'push',
      roomNaddr: value,
      autoJoin: opts.autoJoin !== false,
      joinAsListener: opts.joinAsListener !== false
    });
    return true;
  };

  window.closeNestsRoomPage = async function(opts = {}) {
    if (!roomPageMode && !roomPageRoot) return;
    try { await closePreview(); } catch (_) {}
    if (roomPageRoot) {
      roomPageRoot.remove();
      roomPageRoot = null;
    }
    modal = null;
    roomPageMode = false;
    roomPageNaddr = '';
    if (opts.silent !== true && typeof window.showPage === 'function') {
      window.showPage('nests', { routeMode: 'push' });
    }
  };

  async function loadNestNostrToolsForCard() {
    if (window.NostrTools && window.NostrTools.nip19 && window.NostrTools.nip19.naddrEncode) {
      return window.NostrTools;
    }
    if (typeof window.ensureSifakaNostrTools === 'function') {
      try {
        const tools = await window.ensureSifakaNostrTools();
        if (tools && tools.nip19 && typeof tools.nip19.naddrEncode === 'function') {
          return tools;
        }
      } catch (err) {
        console.warn('[sifaka-nests] shared Nostr tools loader failed', err);
      }
    }
    if (window.__sifakaNestNostrToolsPromise) return window.__sifakaNestNostrToolsPromise;
    window.__sifakaNestNostrToolsPromise = new Promise(function(resolve, reject) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/nostr-tools/lib/nostr.bundle.js';
      script.async = true;
      script.dataset.sifakaNostrTools = '1';
      script.onload = function() {
        if (window.NostrTools) resolve(window.NostrTools);
        else reject(new Error('Nostr tools loaded without a usable API.'));
      };
      script.onerror = function() { reject(new Error('Unable to load Nostr tools.')); };
      document.head.appendChild(script);
    }).catch(function(err) {
      window.__sifakaNestNostrToolsPromise = null;
      throw err;
    });
    return window.__sifakaNestNostrToolsPromise;
  }

  function roomNaddrFromRef(roomRef, relays) {
    const ref = String(roomRef || '').trim();
    const match = ref.match(/^30312:([0-9a-f]{64}):(.+)$/i);
    if (!match) return '';
    const nt = window.NostrTools;
    if (!nt || !nt.nip19 || typeof nt.nip19.naddrEncode !== 'function') return '';
    try {
      return String(nt.nip19.naddrEncode({
        identifier: match[2],
        pubkey: match[1],
        kind: 30312,
        relays: String(relays || '').split('|').map(function(x) {
          return x.trim();
        }).filter(function(x) {
          return /^wss:\/\//i.test(x);
        })
      }) || '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  async function openRoomFromCard(card, event) {
    if (!card) return false;
    if (event && event.target && event.target.closest && event.target.closest('.nests-card-share')) return false;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    let naddr = normalizeRoomNaddr(card.getAttribute('data-room-url') || '');

    if (!naddr) {
      const roomRef = card.getAttribute('data-room-ref') || '';
      const roomRelays = card.getAttribute('data-room-relays') || '';

      try {
        await loadNestNostrToolsForCard();
      } catch (err) {
        console.warn('[sifaka-nests] shared Nostr tools loader failed; trying available API', err);
      }

      naddr = roomNaddrFromRef(roomRef, roomRelays);

      if (!naddr && typeof window.getNestsRoomNaddr === 'function') {
        try {
          naddr = normalizeRoomNaddr(window.getNestsRoomNaddr({
            roomRef: roomRef,
            relays: String(roomRelays || '').split('|').filter(Boolean)
          }) || '');
        } catch (_) {}
      }
    }

    if (!naddr) {
      console.warn('[sifaka-nests] unable to derive room naddr from card', {
        target: card.getAttribute('data-room-url') || '',
        roomRef: card.getAttribute('data-room-ref') || ''
      });
      return false;
    }

    if (typeof window.openNestsRoomPage === 'function') {
      return !!window.openNestsRoomPage(naddr, {
        routeMode: 'push',
        autoJoin: true,
        joinAsListener: true
      });
    }

    const target = '/room/' + naddr;
    try {
      window.history.pushState({ view: 'nestsRoom', naddr: naddr }, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return true;
    } catch (_) {
      try { window.location.assign(target); } catch (_) {}
      return true;
    }
  }

  function interceptJoinClicks(e) {
    const target = e.target;
    const card = target && target.closest
      ? target.closest('#nestsRoomsGrid .nests-room-card')
      : null;
    if (!card) return;
    if (target.closest && target.closest('.nests-card-share')) return;
    openRoomFromCard(card, e).catch(function(err) {
      console.warn('[sifaka-nests] could not open room card', err);
    });
  }

  function interceptNestCardKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const target = e.target;
    const card = target && target.closest
      ? target.closest('#nestsRoomsGrid .nests-room-card')
      : null;
    if (!card) return;
    if (target.closest && target.closest('.nests-card-share')) return;
    e.preventDefault();
    openRoomFromCard(card, e).catch(function(err) {
      console.warn('[sifaka-nests] could not open room card from keyboard', err);
    });
  }

  window.openNestsRoomCard = function(card, event) {
    return openRoomFromCard(card, event);
  };

  function boot() {
    if (!(window.location.pathname && /^\/room\/naddr1/i.test(window.location.pathname))) {
      ensureModal();
    }
    window.enterNestsRoom = function(url) {
      const target = String(url || '').trim();
      if (!target) return;
      activeRoomUrl = target;
      enterActiveRoom().catch(function(err) {
        console.warn('[sifaka-nests] native room join failed', err);
      });
    };
    window.leaveNestsRoom = async function() {
      try { await leaveActiveRoom(); } catch (_) {}
      if (typeof window.showPage === 'function') window.showPage('nests', { routeMode: 'push' });
    };
    window.openNestsRoomPreview = function(url, fallback = {}) {
      const target = String(url || '').trim();
      if (!target) return;
      if (typeof window.openNestsRoomPage === 'function') {
        window.openNestsRoomPage(target, { routeMode: 'push' });
        return;
      }
      openPreview(target, {
        title: String(fallback.title || 'Nostr Nest'),
        summary: String(fallback.summary || 'Live audio conversation on Nostr.'),
        host: String(fallback.host || ''),
        countText: String(fallback.countText || ''),
        img: String(fallback.img || ''),
        badge: String(fallback.badge || 'ROOM PREVIEW'),
        topics: Array.isArray(fallback.topics) ? fallback.topics : [],
        url: target
      }).catch(function() {});
    };

    if (!window.__sifakaNestsCardHandlersBound) {
      document.addEventListener('click', interceptJoinClicks, true);
      document.addEventListener('keydown', interceptNestCardKeydown, true);
      window.__sifakaNestsCardHandlersBound = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();