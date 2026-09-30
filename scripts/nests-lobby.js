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
  let modal, activeRoomUrl = '', sockets = [], refreshTimer = null;

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
      return { pubkey: pubkey, d: identifier, a: '30312:' + pubkey + ':' + identifier };
    } catch (_) { return null; }
  }

  function relayQuery(filters, timeout) {
    timeout = timeout || 4200;
    return new Promise(function(resolve) {
      const events = new Map();
      let pending = RELAYS.length, settled = false;
      const localSockets = [];
      const finish = function() {
        if (settled) return;
        settled = true;
        localSockets.forEach(function(ws) { try { ws.close(); } catch (_) {} });
        resolve(Array.from(events.values()));
      };
      const timer = setTimeout(finish, timeout);
      RELAYS.forEach(function(relay) {
        let ws;
        try { ws = new WebSocket(relay); }
        catch (_) { pending--; if (!pending) { clearTimeout(timer); finish(); } return; }
        localSockets.push(ws);
        ws.onopen = function() {
          try { ws.send(JSON.stringify(['REQ', 'sifaka-nest-' + Math.random().toString(36).slice(2), ...filters])); } catch (_) {}
        };
        ws.onmessage = function(message) {
          try {
            const m = JSON.parse(message.data);
            if (m[0] === 'EVENT' && m[2] && m[2].id) events.set(m[2].id, m[2]);
            if (m[0] === 'EOSE') {
              pending--;
              if (!pending) { clearTimeout(timer); finish(); }
            }
          } catch (_) {}
        };
        ws.onerror = function() {
          pending--;
          if (!pending) { clearTimeout(timer); finish(); }
        };
        ws.onclose = function() {
          pending--;
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
          picture: j.picture || ''
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
      const match = onclick.match(/joinNestsRoom\\s*\\((.*)\\)/);
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
        const match = onclick.match(/joinNestsRoom\\s*\\((.*)\\)/);
        if (match) {
          const raw = String(match[1] || '').trim();
          try { url = JSON.parse(raw); } catch (_) { url = raw.replace(/^['"]|['"]$/g, ''); }
        }
      }
    }

    return { title: title, summary: summary, host: host, countText: countText, img: img, badge: badge, topics: topics, url: url };
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
          '<h2 id="nestPreviewTitle">Nostr Nest</h2>' +
          '<p class="nest-preview-summary" id="nestPreviewSummary"></p>' +
          '<div class="nest-preview-stats" id="nestPreviewStats"></div>' +
          '<div class="nest-preview-schedule" id="nestPreviewSchedule"></div>' +
          '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>On stage</span><span id="nestPreviewPeopleCount"></span></div><div class="nest-preview-people" id="nestPreviewPeople"></div></div>' +
          '<div class="nest-preview-section"><div class="nest-preview-section-head"><span>Listeners</span><span id="nestPreviewListenerCount">—</span></div><div class="nest-preview-listeners" id="nestPreviewListeners"></div></div>' +
          '<div class="nest-preview-section nest-preview-chat-section"><div class="nest-preview-section-head"><span>Room chat</span><span id="nestPreviewChatCount">—</span></div><div class="nest-preview-chat" id="nestPreviewChat"></div></div>' +
          '<div class="nest-preview-topics" id="nestPreviewTopics"></div>' +
          '<div class="nest-preview-actions"><button class="btn btn-ghost" id="nestPreviewShareBtn" type="button">Share</button><button class="btn btn-primary" id="nestPreviewJoinBtn" type="button">Join Nest</button></div>' +
          '<div class="nest-preview-footnote" id="nestPreviewFootnote">Room details are read from Nostr NIP-53 events.</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    $('.nest-preview-close', modal).addEventListener('click', closePreview);
    modal.addEventListener('click', function(e) { if (e.target === modal) closePreview(); });
    $('#nestPreviewJoinBtn', modal).addEventListener('click', function() {
      if (!activeRoomUrl) return;
      // Use Sifaka's existing Nest join flow when available so room navigation,
      // mobile handling, and any future in-app Nest integration remain intact.
      if (typeof window.joinNestsRoom === 'function') {
        try {
          window.joinNestsRoom(activeRoomUrl);
          return;
        } catch (_) {}
      }
      window.open(activeRoomUrl, '_blank', 'noopener');
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
    refreshTimer = null;
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
    if (start) {
      $('#nestPreviewSchedule', modal).innerHTML =
        '<div class="nest-preview-schedule-icon">◷</div><div><strong>' + (live ? 'Live session' : 'Scheduled session') + '</strong><span>' +
        esc(formatDate(start)) + (end ? ' — ' + esc(formatDate(end)) : '') + '</span><small>' + esc(relativeTime(start)) + '</small></div>';
    } else {
      $('#nestPreviewSchedule', modal).innerHTML = '<div class="nest-preview-schedule-icon">◉</div><div><strong>Drop-in room</strong><span>Join whenever the room is open.</span></div>';
    }

    const peopleHtml = ordered.map(function(p) {
      const prof = profiles.get(p.pubkey) || {};
      const name = prof.name || p.pubkey.slice(0, 8) + '…' + p.pubkey.slice(-6);
      return '<button class="nest-person" type="button">' +
        '<span class="nest-person-avatar">' + (prof.picture ? '<img src="' + esc(prof.picture) + '" alt="">' : '<span>' + esc(name.slice(0,1).toUpperCase()) + '</span>') + '</span>' +
        '<span class="nest-person-copy"><strong>' + esc(name) + '</strong><small>' + esc(p.role || 'Participant') + '</small></span>' +
        '<span class="nest-person-dot ' + roleClass(p.role) + '"></span></button>';
    }).join('');
    $('#nestPreviewPeople', modal).innerHTML = peopleHtml || '<div class="nest-preview-empty">No named speakers were published yet.</div>';
    $('#nestPreviewPeopleCount', modal).textContent = ordered.length ? ordered.length + ' shown' : '';

    const listenerKeys = presence.filter(function(k) { return !ordered.some(function(p) { return p.pubkey === k; }); }).slice(0, 12);
    $('#nestPreviewListenerCount', modal).textContent = count ? count + ' present' : 'No live count';
    $('#nestPreviewListeners', modal).innerHTML = listenerKeys.length
      ? listenerKeys.map(function(k) {
          const prof = profiles.get(k) || {};
          return '<span class="nest-listener" title="' + esc(prof.name || k) + '">' +
            (prof.picture ? '<img src="' + esc(prof.picture) + '" alt="">' : esc((prof.name || k).slice(0,1).toUpperCase())) + '</span>';
        }).join('') + (count > listenerKeys.length ? '<span class="nest-listener-more">+' + (count - listenerKeys.length) + '</span>' : '')
      : '<span class="nest-listener-text">' + (count ? count + ' listener' + (count === 1 ? '' : 's') + ' currently in the room' : 'Presence is not currently published.') + '</span>';

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
    refreshTimer = setTimeout(function() { if (modal && modal.classList.contains('open')) openPreview(url, fallback); }, 45000);
  }

  function interceptJoinClicks(e) {
    const btn = e.target.closest && e.target.closest(
      '#nestsRoomsGrid .nests-room-actions .btn-primary, ' +
      '#nestsRoomsGrid .nests-room-join, ' +
      '#nestsRoomsGrid [data-action="join"], ' +
      '#nestsRoomsGrid button'
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
    const grid = $('#nestsRoomsGrid');
    if (!grid) return;
    grid.addEventListener('click', interceptJoinClicks, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();