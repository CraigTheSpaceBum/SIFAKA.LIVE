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
  const PRESENCE_TTL = 15 * 60;
  let modal, activeRoomUrl = '', sockets = [], refreshTimer = null, liveRefreshTimer = null, countdownTimer = null, chatSince = 0;
  let activeRoom = null, activeRoomEvent = null, activeRoomRelays = [];
  let activeRoomAudio = null, activeRoomAudioModulesPromise = null;
  let activeRoomPresenceTimer = null, activeRoomRefreshTimer = null, activeRoomChatTimer = null;

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
          name: j.display_name || j.name || '',
          picture: j.picture || '',
          banner: j.banner || '',
          about: j.about || ''
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

  async function loadNestAudioModules() {
    if (!activeRoomAudioModulesPromise) {
      activeRoomAudioModulesPromise = Promise.all([
        import('https://esm.sh/@moq/lite@0.1.7'),
        import('https://esm.sh/@moq/watch@0.2.3')
      ]).then(function(modules) {
        return { Moq: modules[0], Watch: modules[1] };
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
      this.pollTimer = null;
      this.identity = '';
      this.Moq = null;
      this.Watch = null;
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
      this.identity = String(config.identity || '');
      this.emitState('connecting');

      const relayUrl = new URL(String(config.serverUrl));
      relayUrl.pathname = '/' + String(config.namespace || '');
      if (config.token) relayUrl.searchParams.set('jwt', config.token);

      this.connection = new this.Moq.Connection.Reload({
        url: relayUrl,
        enabled: true,
        delay: { initial: 1000, multiplier: 2, max: 30000 },
        webtransport: {},
        websocket: {}
      });

      const self = this;
      if (this.connection.status && this.connection.status.watch) {
        this.statusDispose = this.connection.status.watch(function(status) {
          if (status === 'connected') {
            self.emitState('connected');
            self.startAnnouncements();
          } else if (status === 'connecting') {
            self.emitState(self.state === 'disconnected' ? 'connecting' : 'reconnecting');
          } else if (status === 'disconnected') {
            self.emitState('disconnected');
            self.stopAnnouncements();
          }
        });
      }
    }

    startAnnouncements() {
      this.stopAnnouncements();
      if (!this.connection) return;
      const self = this;
      if (this.connection.announced && this.connection.announced.subscribe) {
        this.announcementDispose = this.connection.announced.subscribe(function(announced) {
          self.processAnnouncements(announced);
        });
      }
      this.pollTimer = setInterval(function() {
        if (!self.connection || !self.connection.announced) return;
        try { self.processAnnouncements(self.connection.announced.peek()); } catch (_) {}
      }, 3000);
      try { this.processAnnouncements(this.connection.announced.peek()); } catch (_) {}
    }

    stopAnnouncements() {
      if (this.announcementDispose) {
        try { this.announcementDispose(); } catch (_) {}
        this.announcementDispose = null;
      }
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }

    processAnnouncements(announced) {
      if (!this.connection || !announced) return;
      const current = new Set();
      const self = this;
      announced.forEach(function(path) {
        const pubkey = String(path || '').toLowerCase();
        if (!pubkey || pubkey === String(self.identity || '').toLowerCase()) return;
        if (!/^[0-9a-f]{64}$/.test(pubkey)) return;
        current.add(pubkey);
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
          connection: this.connection.established,
          enabled: true,
          name: this.Moq.Path.from(pubkey),
          reload: true
        });
        const sync = new this.Watch.Sync({ jitter: 150 });
        const audioSource = new this.Watch.Audio.Source(sync, { broadcast: broadcast });
        const decoder = new this.Watch.Audio.Decoder(audioSource, { enabled: true });
        const emitter = new this.Watch.Audio.Emitter(decoder, {
          volume: this.muted ? 0 : this.volume,
          muted: this.muted
        });
        this.entries.set(pubkey, { broadcast, sync, audioSource, decoder, emitter });
      } catch (err) {
        console.warn('[sifaka-nests] participant audio failed', err);
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
      if (this.statusDispose) {
        try { this.statusDispose(); } catch (_) {}
        this.statusDispose = null;
      }
      this.entries.forEach(function(entry) { closeAudioEntry(entry); });
      this.entries.clear();
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

    await Promise.all(relayList.map(function(relay) {
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
  }

  async function authenticateNestAudio(roomEvent, namespace) {
    const ctx = getSifakaContext();
    const user = ctx && typeof ctx.getUser === 'function' ? ctx.getUser() : null;
    if (!user || typeof ctx.signEvent !== 'function') return '';
    const authUrl = tag(roomEvent, 'auth') || 'https://moq-auth.nostrnests.com';
    const endpoint = authUrl.replace(/\/$/, '') + '/auth';
    const signed = await ctx.signEvent(27235, '', [['u', endpoint], ['method', 'POST']]);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Nostr ' + btoa(JSON.stringify(signed))
      },
      body: JSON.stringify({ namespace: namespace, publish: false })
    });
    if (!response.ok) throw new Error('Nest audio authentication failed (' + response.status + ').');
    const data = await response.json();
    return String(data.token || '');
  }

  function updateActiveRoomAudioUi() {
    if (!modal) return;
    const status = modal.querySelector('#nestRoomAudioStatus');
    const btn = modal.querySelector('#nestRoomMuteBtn');
    const slider = modal.querySelector('#nestRoomVolume');
    const dot = modal.querySelector('#nestRoomAudioDot');
    if (status && activeRoomAudio) {
      const state = activeRoomAudio.state || 'disconnected';
      const count = activeRoomAudio.entries ? activeRoomAudio.entries.size : 0;
      status.textContent = state === 'connected'
        ? ('Connected • ' + count + ' speaker' + (count === 1 ? '' : 's'))
        : (state.charAt(0).toUpperCase() + state.slice(1) + '…');
      if (dot) dot.classList.toggle('connected', state === 'connected');
    }
    if (btn && activeRoomAudio) btn.textContent = activeRoomAudio.muted ? 'Unmute' : 'Mute';
    if (slider && activeRoomAudio) slider.value = String(Math.round(activeRoomAudio.volume * 100));
  }

  function ensureModal() {
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
          '<div class="nest-room-audio-bar" id="nestRoomAudioBar" hidden>' +
            '<span class="nest-room-audio-dot" id="nestRoomAudioDot"></span>' +
            '<strong id="nestRoomAudioStatus">Not connected</strong>' +
            '<button class="btn btn-ghost" id="nestRoomMuteBtn" type="button">Mute</button>' +
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
      '<p id="nestProfileAbout"></p><div class="nest-profile-actions"><button class="btn btn-ghost" id="nestProfileCopy" type="button">Copy npub</button><button class="btn btn-primary" id="nestProfileOpen" type="button">Open profile</button></div>' +
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
      enterActiveRoom().catch(function(err) {
        const status = $('#nestRoomAudioStatus', modal);
        if (status) status.textContent = err && err.message ? err.message : 'Unable to join this Nest.';
      });
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

  function closePreview() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('nest-preview-open');
    sockets.forEach(function(ws) { try { ws.close(); } catch (_) {} });
    sockets = [];
    clearTimeout(refreshTimer);
    clearTimeout(liveRefreshTimer);
    clearInterval(countdownTimer);
    refreshTimer = null;
    liveRefreshTimer = null;
    countdownTimer = null;
    chatSince = 0;
  }

  function renderLoading(fallback) {
    ensureModal().classList.add('open');
    document.body.classList.add('nest-preview-open');
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

  function renderChat(room, profiles) {
    const messages = Array.isArray(room.chat) ? room.chat.slice().sort(function(a, b) {
      return Number(a.created_at || 0) - Number(b.created_at || 0);
    }).slice(-12) : [];

    $('#nestPreviewChatCount', modal).textContent = messages.length
      ? messages.length + (messages.length === 1 ? ' recent message' : ' recent messages')
      : 'No messages';

    if (!messages.length) {
      $('#nestPreviewChat', modal).innerHTML =
        '<div class="nest-preview-chat-empty"><span class="nest-chat-empty-icon">✦</span><strong>No room chat yet</strong><small>Be the first to say hello when you join.</small></div>';
      return;
    }

    $('#nestPreviewChat', modal).innerHTML = messages.map(function(ev) {
      const prof = profiles.get(String(ev.pubkey || '').toLowerCase()) || {};
      const name = prof.name || String(ev.pubkey || '').slice(0, 8) + '…';
      const content = String(ev.content || '').trim();
      const when = ev.created_at ? new Date(Number(ev.created_at) * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      return '<div class="nest-chat-message">' +
        '<span class="nest-chat-avatar">' + (prof.picture ? '<img src="' + esc(prof.picture) + '" alt="">' : esc(name.slice(0, 1).toUpperCase())) + '</span>' +
        '<div class="nest-chat-copy"><div><strong>' + esc(name) + '</strong><time>' + esc(when) + '</time></div><p>' + esc(content) + '</p></div>' +
      '</div>';
    }).join('');
  }

  function renderRoom(room, profiles, fallback) {
    const status = String(room.status || '').toLowerCase();
    const live = status === 'live' || status === 'open';
    const meeting = room.meeting;
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
      $('#nestPreviewSchedule', modal).innerHTML = '<div class="nest-preview-schedule-icon">◉</div><div><strong>Drop-in room</strong><span>Join whenever the room is open.</span></div>';
    }

    const showProfile = function(pubkey, role) {
      const sheet = modal && modal._profileSheet;
      if (!sheet || !pubkey) return;
      sheet.classList.add('open');
      const profile = profiles.get(String(pubkey).toLowerCase()) || {};
      const name = profile.name || String(pubkey).slice(0, 8) + '…' + String(pubkey).slice(-6);
      let npub = '';
      try { if (window.NostrTools?.nip19?.npubEncode) npub = window.NostrTools.nip19.npubEncode(pubkey); } catch (_) {}
      sheet.dataset.npub = npub;
      $('#nestProfileName', sheet).textContent = name;
      $('#nestProfileRole', sheet).textContent = role || 'Nest participant';
      $('#nestProfileAbout', sheet).textContent = profile.about || 'No profile bio published.';
      $('#nestProfileAvatar', sheet).innerHTML = profile.picture ? '<img src="' + esc(profile.picture) + '" alt="">' : '<span>' + esc(name.slice(0,1).toUpperCase()) + '</span>';
      $('#nestProfileHero', sheet).style.backgroundImage = profile.banner ? 'url("' + esc(profile.banner) + '")' : '';
      $('#nestProfileNpub', sheet).textContent = npub || 'npub unavailable';
      $('#nestProfileOpen', sheet).disabled = !npub;
      $('#nestProfileCopy', sheet).disabled = !npub;
    };

    const peopleHtml = ordered.map(function(p) {
      const prof = profiles.get(p.pubkey) || {};
      const name = prof.name || p.pubkey.slice(0, 8) + '…' + p.pubkey.slice(-6);
      return '<button class="nest-person" type="button">' +
        '<span class="nest-person-avatar">' + (prof.picture ? '<img src="' + esc(prof.picture) + '" alt="">' : '<span>' + esc(name.slice(0,1).toUpperCase()) + '</span>') + '</span>' +
        '<span class="nest-person-copy"><strong>' + esc(name) + '</strong><small>' + esc(p.role || 'Participant') + '</small></span>' +
        '<span class="nest-person-dot ' + roleClass(p.role) + '"></span></button>';
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
          return '<button class="nest-listener" type="button" title="' + esc(prof.name || k) + '" data-pubkey="' + esc(k) + '">' +
            (prof.picture ? '<img src="' + esc(prof.picture) + '" alt="">' : esc((prof.name || k).slice(0,1).toUpperCase())) + '</button>';
        }).join('') + (count > listenerKeys.length ? '<span class="nest-listener-more">+' + (count - listenerKeys.length) + '</span>' : '')
      : '<span class="nest-listener-text">' + (count ? count + ' listener' + (count === 1 ? '' : 's') + ' currently in the room' : 'Presence is not currently published.') + '</span>';
    Array.from($('#nestPreviewListeners', modal).querySelectorAll('.nest-listener')).forEach(function(button) {
      const pubkey = button.getAttribute('data-pubkey');
      button.addEventListener('click', function() { showProfile(pubkey, 'Listener'); });
    });

    renderChat(room, profiles);

    const topicValues = Array.from(new Set((room.topics || []).concat((meeting && meeting.topics) || []))).slice(0, 8);
    $('#nestPreviewTopics', modal).innerHTML = topicValues.map(function(t) { return '<span>#' + esc(t) + '</span>'; }).join('');
    $('#nestPreviewJoinBtn', modal).textContent = live ? 'Join Nest' : 'Open Nest';
    $('#nestPreviewFootnote', modal).textContent = room.sourceCount > 1 ? 'Room details merged from ' + room.sourceCount + ' relays.' : 'Room details are read from Nostr NIP-53 events.';
  }

  async function openPreview(url, fallback) {
    activeRoomUrl = url;
    renderLoading(fallback);
    const decoded = decodeRoom(url);
    if (!decoded) {
      renderRoom({
        title: fallback.title, summary: fallback.summary, image: fallback.img,
        pubkey: '', status: /live/i.test(fallback.badge) ? 'live' : 'open',
        currentParticipants: parseInt(fallback.countText, 10) || 0, participants: [], presence: new Set()
      }, new Map(), fallback);
      return;
    }

    const events = await relayQuery([
      { kinds: [30312], authors: [decoded.pubkey], '#d': [decoded.d], limit: 20 },
      { kinds: [30313], '#a': [decoded.a], limit: 20 },
      { kinds: [1311], '#a': [decoded.a], limit: 60 },
      { kinds: [10312], '#a': [decoded.a], limit: 300 }
    ], 5200);
    if (!modal || !modal.classList.contains('open') || activeRoomUrl !== url) return;

    const rooms = events.filter(function(e) { return Number(e.kind) === 30312; }).sort(function(a,b) { return Number(b.created_at||0)-Number(a.created_at||0); });
    const meetings = events.filter(function(e) { return Number(e.kind) === 30313; }).sort(function(a,b) { return Number(b.created_at||0)-Number(a.created_at||0); });
    const roomEvent = rooms[0] || null;
    const current = meetings.find(function(e) { return ['live','planned','open'].indexOf(String(tag(e,'status')).toLowerCase()) >= 0; })
      || meetings.find(function(e) { return Number(tag(e,'starts')) > now(); }) || meetings[0] || null;
    const presence = new Set();
    events.filter(function(e) { return Number(e.kind) === 10312; }).forEach(function(e) {
      if (Number(e.created_at || 0) >= now() - PRESENCE_TTL) presence.add(String(e.pubkey || '').toLowerCase());
    });

    const people = pTags(roomEvent);
    pTags(current).forEach(function(p) { if (!people.some(function(x) { return x.pubkey === p.pubkey; })) people.push(p); });
    if (decoded.pubkey && !people.some(function(p) { return p.pubkey === decoded.pubkey; })) people.unshift({ pubkey: decoded.pubkey, role: 'Host' });

    const profiles = await loadProfiles(Array.from(new Set(people.map(function(p) { return p.pubkey; }).concat(Array.from(presence)))));
    const room = {
      pubkey: decoded.pubkey, d: decoded.d,
      title: tag(roomEvent,'room') || tag(roomEvent,'title') || fallback.title,
      summary: tag(roomEvent,'summary') || fallback.summary,
      image: tag(roomEvent,'image') || fallback.img,
      status: tag(roomEvent,'status') || 'open',
      starts: Number(tag(roomEvent,'starts') || 0), ends: Number(tag(roomEvent,'ends') || 0),
      topics: tags(roomEvent,'t'), currentParticipants: Number(tag(roomEvent,'current_participants') || 0),
      participants: people, presence: presence,
      chat: events.filter(function(e) { return Number(e.kind) === 1311; }),
      meeting: current ? {
        title: tag(current,'title'), summary: tag(current,'summary'), image: tag(current,'image'),
        starts: Number(tag(current,'starts') || 0), ends: Number(tag(current,'ends') || 0),
        status: tag(current,'status'), currentParticipants: Number(tag(current,'current_participants') || 0),
        participants: pTags(current), topics: tags(current,'t')
      } : null,
      sourceCount: new Set(events.map(function(e) { return e.id; })).size
    };
    renderRoom(room, profiles, fallback);

    // Keep a live room lobby feeling live: refresh presence/chat more often than
    // the heavier room/profile metadata refresh. The preview is always closed
    // and cleaned up when the modal closes.
    clearTimeout(liveRefreshTimer);
    if (modal && modal.classList.contains('open') && activeRoomUrl === url) {
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
      { kinds: [30313], '#a': [decoded.a], limit: 10 },
      { kinds: [1311], '#a': [decoded.a], limit: 30 },
      { kinds: [10312], '#a': [decoded.a], limit: 200 }
    ], 3600);

    if (!modal || !modal.classList.contains('open') || activeRoomUrl !== url) return;

    const meetings = events.filter(function(e) { return Number(e.kind) === 30313; })
      .sort(function(a,b) { return Number(b.created_at||0)-Number(a.created_at||0); });
    const current = meetings.find(function(e) {
      return ['live','planned','open'].indexOf(String(tag(e,'status')).toLowerCase()) >= 0;
    }) || meetings.find(function(e) { return Number(tag(e,'starts')) > now(); }) || meetings[0] || null;

    const presence = new Set();
    events.filter(function(e) { return Number(e.kind) === 10312; }).forEach(function(e) {
      if (Number(e.created_at || 0) >= now() - PRESENCE_TTL) presence.add(String(e.pubkey || '').toLowerCase());
    });

    const chat = events.filter(function(e) { return Number(e.kind) === 1311; });
    const profiles = await loadProfiles(Array.from(presence).concat(
      (current ? pTags(current).map(function(p) { return p.pubkey; }) : [])
    ));

    const people = current ? pTags(current) : [];
    if (decoded.pubkey && !people.some(function(p) { return p.pubkey === decoded.pubkey; })) {
      people.unshift({ pubkey: decoded.pubkey, role: 'Host' });
    }

    renderRoom({
      pubkey: decoded.pubkey,
      title: current ? tag(current,'title') : 'Nostr Nest',
      summary: current ? tag(current,'summary') : '',
      image: current ? tag(current,'image') : '',
      status: current ? tag(current,'status') : 'open',
      starts: current ? Number(tag(current,'starts') || 0) : 0,
      ends: current ? Number(tag(current,'ends') || 0) : 0,
      topics: current ? tags(current,'t') : [],
      currentParticipants: current ? Number(tag(current,'current_participants') || 0) : 0,
      participants: people,
      presence: presence,
      chat: chat,
      meeting: null,
      sourceCount: 0
    }, profiles, {
      title: $('#nestPreviewTitle', modal).textContent || 'Nostr Nest',
      summary: $('#nestPreviewSummary', modal).textContent || '',
      img: $('#nestPreviewCover img', modal)?.getAttribute('src') || '',
      badge: $('#nestPreviewStatus', modal).textContent || '',
      countText: $('#nestPreviewListenerCount', modal).textContent || ''
    });

    clearTimeout(liveRefreshTimer);
    if (modal && modal.classList.contains('open') && activeRoomUrl === url) {
      liveRefreshTimer = setTimeout(function() { refreshLiveRoom(url); }, 12000);
    }
  }

  function interceptJoinClicks(e) {
    // Only intercept actual room-open controls. Do not capture share buttons
    // or other controls inside a room card; those have their own handlers.
    const btn = e.target.closest && e.target.closest(
      '#nestsRoomsGrid .nests-room-cover-btn, ' +
      '#nestsRoomsGrid .nests-room-actions .btn-primary, ' +
      '#nestsRoomsGrid .nests-room-join, ' +
      '#nestsRoomsGrid [data-action="join"]'
    );
    if (!btn) return;

    const fallback = getCardFallback(btn);
    if (!fallback.url) {
      // Never swallow a working legacy join button if the room URL cannot be
      // recovered from the new card markup.
      if (typeof window.joinNestsRoom === 'function') {
        const onclick = btn.getAttribute('onclick') || '';
        if (/joinNestsRoom/.test(onclick)) return;
      }
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    openPreview(fallback.url, fallback);
  }

  function boot() {
    ensureModal();
    window.openNestsRoomPreview = function(url, fallback = {}) {
      const target = String(url || '').trim();
      if (!target) return;
      const safeFallback = {
        title: String(fallback.title || 'Nostr Nest'),
        summary: String(fallback.summary || 'Live audio conversation on Nostr.'),
        host: String(fallback.host || ''),
        countText: String(fallback.countText || ''),
        img: String(fallback.img || ''),
        badge: String(fallback.badge || 'ROOM PREVIEW'),
        topics: Array.isArray(fallback.topics) ? fallback.topics : [],
        url: target
      };
      openPreview(target, safeFallback).catch(function() {
        renderRoom({
          title: safeFallback.title,
          summary: safeFallback.summary,
          image: safeFallback.img,
          pubkey: '',
          status: /live/i.test(safeFallback.badge) ? 'live' : 'open',
          currentParticipants: parseInt(safeFallback.countText, 10) || 0,
          participants: [],
          presence: new Set()
        }, new Map(), safeFallback);
      });
    };
    const grid = $('#nestsRoomsGrid');
    if (!grid) return;
    grid.addEventListener('click', interceptJoinClicks, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();