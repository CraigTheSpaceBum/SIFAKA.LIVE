import { PERMISSIONS, buildPermissionMatrix } from './permissions.js';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtTime(ts) {
  const date = new Date(Number(ts || 0));
  if (!Number.isFinite(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name) {
  const value = String(name || '?').trim();
  if (!value) return '?';
  return value.slice(0, 2).toUpperCase();
}

function shortPubkey(pubkey, left = 12, right = 8) {
  const value = String(pubkey || '').trim();
  if (!value) return '';
  if (value.length <= (left + right + 3)) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function groupedChannels(channels) {
  const map = new Map();
  (channels || []).forEach((channel) => {
    const key = channel.category || 'Channels';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(channel);
  });
  return Array.from(map.entries());
}

function roleLabel(profile, member) {
  const role = (member && member.roles && member.roles[0]) || 'guest';
  return `${profile.displayName || profile.name} - ${role}`;
}

function parseLines(value) {
  return String(value || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniqueValues(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function splitCsvTokens(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function trailingCsvToken(value) {
  const parts = String(value || '').split(',');
  return String(parts[parts.length - 1] || '').trim();
}

export function createCommunitiesUI(input) {
  const { root, store, nostrBridge, appContext } = input;

  let mounted = false;
  let dispose = null;
  let outsideClickListenerBound = false;
  let renderQueued = false;
  let toastTimer = null;

  const ui = {
    session: {
      user: (input.session && input.session.user) || null,
      isAuthenticated: !!(input.session && input.session.isAuthenticated)
    },
    openModal: '',
    selectedMember: '',
    composerAttachments: [],
    emojiOpen: false,
    contextMessageId: '',
    contextX: 0,
    contextY: 0,
    roleEditorMember: '',
    memberPanelOpen: true,
    createBusy: false,
    saveBusy: false,
    statusMsg: '',
    discoveryLimit: 18,
    discoveryChunk: 18,
    discoveryObserver: null,
    createDraft: null,
    createRoleSearch: { moderators: '', admins: '' },
    replyTargetByChannel: new Map(),
    discoveryLoading: false,
    attachUploadPending: false,
    attachUploadProgress: 0
  };

  function defaultCreateCommunityDraft(state) {
    const relayValue = (state && state.relayStatusByUrl)
      ? Array.from(state.relayStatusByUrl.keys()).join(', ')
      : '';

    return {
      type: 'public',
      name: '',
      slug: '',
      defaultChannelName: 'general',
      description: '',
      image: '',
      banner: '',
      moderators: '',
      admins: '',
      topics: '',
      joinMode: 'open',
      postingPolicy: 'members',
      rules: '',
      allowedRelays: relayValue,
      discoverable: true,
      includeAnnouncements: true,
      includeForum: true,
      includeStaff: true
    };
  }

  function ensureCreateCommunityDraft(state) {
    if (!ui.createDraft) {
      ui.createDraft = defaultCreateCommunityDraft(state);
      return ui.createDraft;
    }

    if (!ui.createDraft.allowedRelays) {
      const relayValue = (state && state.relayStatusByUrl)
        ? Array.from(state.relayStatusByUrl.keys()).join(', ')
        : '';
      if (relayValue) ui.createDraft.allowedRelays = relayValue;
    }

    return ui.createDraft;
  }

  function setCreateDraftField(field, value) {
    const state = store.getState();
    const draft = ensureCreateCommunityDraft(state);
    draft[field] = value;
  }

  function syncCreateCommunityDraftFromDom() {
    if (ui.openModal !== 'createCommunity') return ensureCreateCommunityDraft(store.getState());
    const nameField = root.querySelector('#scCreateName');
    if (!nameField) return ensureCreateCommunityDraft(store.getState());

    ui.createDraft = {
      type: (root.querySelector('#scCreateType') || {}).value || 'public',
      name: nameField.value || '',
      slug: (root.querySelector('#scCreateSlug') || {}).value || '',
      defaultChannelName: (root.querySelector('#scCreateDefaultChannel') || {}).value || 'general',
      description: (root.querySelector('#scCreateDescription') || {}).value || '',
      image: (root.querySelector('#scCreateImage') || {}).value || '',
      banner: (root.querySelector('#scCreateBanner') || {}).value || '',
      moderators: (root.querySelector('#scCreateModerators') || {}).value || '',
      admins: (root.querySelector('#scCreateAdmins') || {}).value || '',
      topics: (root.querySelector('#scCreateTopics') || {}).value || '',
      joinMode: (root.querySelector('#scCreateJoinMode') || {}).value || 'open',
      postingPolicy: (root.querySelector('#scCreatePostingPolicy') || {}).value || 'members',
      rules: (root.querySelector('#scCreateRules') || {}).value || '',
      allowedRelays: (root.querySelector('#scCreateAllowedRelays') || {}).value || '',
      discoverable: !!((root.querySelector('#scCreateDiscoverable') || {}).checked),
      includeAnnouncements: !!((root.querySelector('#scCreateIncludeAnnouncements') || {}).checked),
      includeForum: !!((root.querySelector('#scCreateIncludeForum') || {}).checked),
      includeStaff: !!((root.querySelector('#scCreateIncludeStaff') || {}).checked)
    };

    return ui.createDraft;
  }

  function closeTransient() {
    ui.selectedMember = '';
    ui.contextMessageId = '';
    ui.emojiOpen = false;
  }

  function getReplyTarget(channelId) {
    if (!channelId) return '';
    return String(ui.replyTargetByChannel.get(channelId) || '').trim();
  }

  function clearReplyTarget(channelId) {
    if (!channelId) return;
    ui.replyTargetByChannel.delete(channelId);
  }

  function resetDiscoveryWindow() {
    ui.discoveryLimit = ui.discoveryChunk;
    ui.discoveryLoading = false;
  }

  function disconnectDiscoveryObserver() {
    if (!ui.discoveryObserver) return;
    ui.discoveryObserver.disconnect();
    ui.discoveryObserver = null;
    ui.discoveryLoading = false;
  }

  function setSession(next = {}) {
    ui.session = {
      user: next.user || null,
      isAuthenticated: !!next.isAuthenticated
    };
  }

  function normalizePubkey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase();
    if (/^npub1/i.test(raw) && nostrBridge && typeof nostrBridge.nip19Decode === 'function') {
      const decoded = nostrBridge.nip19Decode(raw);
      if (decoded && decoded.type === 'npub' && typeof decoded.data === 'string') {
        return String(decoded.data || '').trim().toLowerCase();
      }
    }
    return raw;
  }

  function parsePubkeyCsv(value) {
    return uniqueValues(parseCsv(value).map(normalizePubkey).filter(Boolean));
  }

  function toNpub(pubkey) {
    const key = String(pubkey || '').trim();
    if (!key) return '';
    if (/^npub1/i.test(key)) return key;
    if (nostrBridge && typeof nostrBridge.nip19Encode === 'function') {
      const encoded = nostrBridge.nip19Encode('npub', key);
      if (encoded) return encoded;
    }
    return key;
  }

  function resolveMemberCount(state, community) {
    if (!community || !state) return 0;
    const seen = new Set();
    const members = ((state.data && state.data.membersByCommunity) ? state.data.membersByCommunity[community.id] : []) || [];
    members.forEach((member) => {
      if (member && member.pubkey && !member.banned) seen.add(member.pubkey);
    });
    if (community.ownerPubkey) seen.add(community.ownerPubkey);
    (community.moderatorPubkeys || []).forEach((pubkey) => seen.add(pubkey));
    (community.adminPubkeys || []).forEach((pubkey) => seen.add(pubkey));
    return seen.size;
  }

  function sentCountFromPublishResult(result) {
    if (!result || typeof result !== 'object') return 0;
    if (Number.isFinite(Number(result.sent))) return Number(result.sent);
    if (Number.isFinite(Number(result._sent))) return Number(result._sent);
    if (result.event && Number.isFinite(Number(result.event.sent))) return Number(result.event.sent);
    if (result.event && Number.isFinite(Number(result.event._sent))) return Number(result.event._sent);
    return 0;
  }

  function assertPublished(result, label) {
    const sent = sentCountFromPublishResult(result);
    if (sent > 0) return;
    throw new Error(`Could not publish ${label}. Check relay connection and try again.`);
  }

  function captureFocusSnapshot() {
    if (typeof document === 'undefined') return null;
    const active = document.activeElement;
    if (!active || !root.contains(active)) return null;
    if (!active.id) return null;
    const snapshot = { id: active.id };
    if (typeof active.selectionStart === 'number' && typeof active.selectionEnd === 'number') {
      snapshot.start = active.selectionStart;
      snapshot.end = active.selectionEnd;
      snapshot.direction = active.selectionDirection || 'none';
    }
    return snapshot;
  }

  function restoreFocusSnapshot(snapshot) {
    if (!snapshot || !snapshot.id) return;
    const next = root.querySelector(`#${snapshot.id}`);
    if (!next || typeof next.focus !== 'function') return;
    try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); }
    if (typeof snapshot.start === 'number' && typeof next.setSelectionRange === 'function') {
      try { next.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction); } catch (_) {}
    }
  }

  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    const hasWindow = typeof window !== 'undefined';
    const raf = (hasWindow && typeof window.requestAnimationFrame === 'function')
      ? window.requestAnimationFrame.bind(window)
      : (cb) => setTimeout(cb, 16);
    raf(() => {
      renderQueued = false;
      render();
    });
  }

  function shouldRenderForStoreEvent(evt = {}) {
    const type = String((evt && evt.type) || '').trim();
    if (!type) return true;

    if (ui.openModal === 'createCommunity') {
      const alwaysRender = new Set(['user_changed', 'community_created', 'community_removed', 'community_joined', 'community_left', 'joined_set']);
      if (!alwaysRender.has(type)) return false;
    }

    if (ui.openModal === 'joinCommunity' || ui.openModal === 'discovery' || ui.openModal === 'communityHub') {
      const noisyTypes = new Set([
        'message_ingested',
        'message_sent',
        'reaction_ingested',
        'reaction_toggled',
        'deletion_ingested',
        'draft_changed',
        'read',
        'search_changed',
        'relay_status'
      ]);
      if (noisyTypes.has(type)) return false;
    }

    return true;
  }

  function permissionsSummary() {
    const matrix = buildPermissionMatrix();
    const keys = ['owner', 'admin', 'moderator', 'member', 'guest'];
    return `
      <div class="sc-table-wrap">
        <table class="sc-table">
          <thead>
            <tr><th>Permission</th>${keys.map((key) => `<th>${esc(key)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${PERMISSIONS.map((perm) => `
              <tr>
                <td>${esc(perm)}</td>
                ${keys.map((key) => `<td>${matrix[key] && matrix[key][perm] ? 'Y' : '-'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderLoginGate() {
    root.innerHTML = `
      <section class="sc-auth-gate">
        <div class="sc-auth-card">
          <h2>Login Required</h2>
          <p>You need a Nostr account connected to access Communities.</p>
          <ul>
            <li>Real Nostr relay subscriptions</li>
            <li>Create and manage groups with roles and posting rules</li>
            <li>Private group metadata with kind 39000, 39002, and 39003</li>
          </ul>
          <button id="scLoginGateBtn">Login with Nostr</button>
        </div>
      </section>
    `;

    const btn = root.querySelector('#scLoginGateBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (appContext && typeof appContext.openLogin === 'function') {
          appContext.openLogin();
        }
      });
    }
  }


  function enhanceRenderedCommunityContent() {
    const nodes = root.querySelectorAll('.sc-content[data-raw-content]');
    if (!nodes || !nodes.length) return;

    nodes.forEach((node) => {
      const raw = String(node.getAttribute('data-raw-content') || '');
      if (!raw.trim()) {
        node.textContent = '';
        return;
      }

      if (typeof window !== 'undefined' && typeof window.renderNostrContent === 'function') {
        try {
          node.innerHTML = '';
          node.appendChild(window.renderNostrContent(raw));
          return;
        } catch (_) {}
      }

      node.textContent = raw;
    });
  }
  function render() {
    try {
    const focusSnapshot = captureFocusSnapshot();
    if (!ui.session.isAuthenticated) {
      renderLoginGate();
      return;
    }

    const state = store.getState();
    const community = store.getCommunity();
    const channel = store.getChannel();
    const joinedCommunityIds = new Set(state.joinedCommunityIds);
    const lastActiveByCommunity = state.lastActiveByCommunity instanceof Map
      ? state.lastActiveByCommunity
      : new Map(Object.entries(state.lastActiveByCommunity || {}));
    const draftsByChannel = state.draftsByChannel instanceof Map
      ? state.draftsByChannel
      : new Map(Object.entries(state.draftsByChannel || {}));
    const unreadByChannel = state.unreadByChannel instanceof Map
      ? state.unreadByChannel
      : new Map(Object.entries(state.unreadByChannel || {}));
    const relayStatusByUrl = state.relayStatusByUrl instanceof Map
      ? state.relayStatusByUrl
      : new Map(Object.entries(state.relayStatusByUrl || {}));
    const communities = state.data.communities || [];
    const publicCommunities = communities
      .filter((entry) => entry.type !== 'private' && entry.discoverable !== false)
      .slice()
      .sort((a, b) => {
        const aLast = Number(lastActiveByCommunity.get(a.id) || 0);
        const bLast = Number(lastActiveByCommunity.get(b.id) || 0);
        if (aLast !== bLast) return bLast - aLast;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    const suggestions = store.getDiscoverySuggestions(6);
    const channels = community ? store.getChannels(community.id) : [];
    const messages = channel ? store.filteredMessages(channel.id) : [];
    const pins = channel ? store.getPinnedMessages(channel.id) : [];
    const draft = channel ? (draftsByChannel.get(channel.id) || '') : '';
    const replyTarget = channel ? getReplyTarget(channel.id) : '';
    const profiles = store.getProfiles();
    const members = community ? (state.data.membersByCommunity[community.id] || []) : [];
    const memberCount = community ? resolveMemberCount(state, community) : 0;

    const relayStatuses = Array.from(relayStatusByUrl.values());
    const connectedRelays = relayStatuses.filter((value) => value === 'open').length;

    const railCommunities = communities.filter((entry) => joinedCommunityIds.has(entry.id));
    const hasJoinedCommunities = railCommunities.length > 0;
    const hasActiveCommunity = !!(community && joinedCommunityIds.has(community.id));

    const railHtml = railCommunities.map((entry) => {
      const active = community && entry.id === community.id;
      return `
        <button class="sc-server-pill${active ? ' active' : ''}" data-community="${esc(entry.id)}" title="${esc(entry.title)}">
          <span>${esc(entry.icon || initials(entry.title))}</span>
        </button>
      `;
    }).join('');

    const channelHtml = groupedChannels(channels).map(([category, items]) => `
      <section class="sc-category">
        <header>${esc(category)}</header>
        ${items.map((entry) => {
          const unread = Number(unreadByChannel.get(entry.id) || 0);
          const locked = entry.privacyLevel !== 'public';
          return `
            <button class="sc-channel-btn${channel && entry.id === channel.id ? ' active' : ''}" data-channel="${esc(entry.id)}" title="${esc(entry.topic || '')}">
              <span class="sc-channel-name"># ${esc(entry.name)}</span>
              <span class="sc-channel-meta">${locked ? 'private' : ''}${unread ? `<b>${unread}</b>` : ''}</span>
            </button>
          `;
        }).join('')}
      </section>
    `).join('');

    const memberHtml = members.map((member) => {
      const profileData = profiles[member.pubkey] || store.profile(member.pubkey);
      const timedOut = member.timeoutUntil && Number(member.timeoutUntil) > Date.now();
      const memberAvatar = String((profileData && profileData.avatar) || '').trim();
      const hasMemberAvatar = /^https?:\/\//i.test(memberAvatar);
      return `
        <button class="sc-member-row" data-member="${esc(member.pubkey)}">
          <span class="sc-avatar${hasMemberAvatar ? ' has-image' : ''}"${hasMemberAvatar ? ` style="background-image:url('${esc(memberAvatar)}')"` : ''}>${hasMemberAvatar ? '' : esc(initials(profileData.displayName || profileData.name))}</span>
          <span class="sc-member-main">
            <strong>${esc(profileData.displayName || profileData.name)}</strong>
            <small>${esc((member.roles || ['guest']).join(', '))}${member.muted ? ' | muted' : ''}${timedOut ? ' | timeout' : ''}${member.banned ? ' | banned' : ''}</small>
          </span>
        </button>
      `;
    }).join('');

    const messageHtml = messages.map((message) => {
      const author = profiles[message.authorPubkey] || store.profile(message.authorPubkey);
      const authorAvatar = String((author && author.avatar) || '').trim();
      const hasAuthorAvatar = /^https?:\/\//i.test(authorAvatar);
      const reactions = Object.entries(message.reactions || {}).map(([key, who]) => {
        const active = (who || []).includes(state.currentUserPubkey);
        return `<button class="sc-react-chip${active ? ' active' : ''}" data-react-key="${esc(key)}" data-message="${esc(message.id)}">${esc(key)} ${Number((who || []).length)}</button>`;
      }).join('');
      const actions = `
        <div class="sc-actions sc-actions-inline">
          <button data-action="reply" data-message="${esc(message.id)}">Reply</button>
          <button data-action="pin" data-message="${esc(message.id)}">${message.pinned ? 'Unpin' : 'Pin'}</button>
          <button data-action="menu" data-message="${esc(message.id)}">Menu</button>
        </div>
      `;

      return `
        <article class="sc-message" data-message-id="${esc(message.id)}">
          <button class="sc-avatar${hasAuthorAvatar ? ' has-image' : ''}" data-member="${esc(message.authorPubkey)}"${hasAuthorAvatar ? ` style="background-image:url('${esc(authorAvatar)}')"` : ''}>${hasAuthorAvatar ? '' : esc(initials(author.displayName || author.name))}</button>
          <div class="sc-message-main">
            <header class="sc-message-head">
              <div class="sc-message-head-meta">
                <button class="sc-author" data-member="${esc(message.authorPubkey)}">${esc(author.displayName || author.name)}</button>
                <time>${esc(fmtTime(message.createdAt))}</time>
                ${(author.nip05 && author.verifiedNip05) ? `<span class="sc-nip05">${esc(author.nip05)}</span>` : ''}
              </div>
              ${actions}
            </header>
            ${message.replyTo ? `<div class="sc-reply-tag">Replying to ${esc(message.replyTo)}</div>` : ''}
            <div class="sc-content" data-raw-content="${esc(message.content)}">${esc(message.content)}</div>
            ${(message.attachments || []).length ? `<div class="sc-attachments">${(message.attachments || []).map((attachment) => `<span>${esc(attachment.name)}</span>`).join('')}</div>` : ''}
            ${reactions ? `<div class="sc-reactions sc-reactions-row">${reactions}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');

    const notificationUnread = (state.data.notifications || []).filter((n) => n.unread).length;
    const attachAccept = (appContext && typeof appContext.getUploadAccept === 'function')
      ? String(appContext.getUploadAccept() || '').trim()
      : '';
    const effectiveAttachAccept = attachAccept || 'image/*,video/*,audio/*';
    const attachLabel = ui.attachUploadPending
      ? `Uploading${ui.attachUploadProgress > 0 ? ` ${ui.attachUploadProgress}%` : '...'}`
      : 'Attach';

    root.innerHTML = `
      <div class="sc-wrap${hasJoinedCommunities ? '' : ' sc-wrap-empty'}" id="scWrap">
        <aside class="sc-server-rail">
          <button class="sc-server-add sc-server-add-primary" id="scCreateCommunityBtn" title="Create or join communities">+</button>
          <div class="sc-server-list">${railHtml}</div>
        </aside>

        <aside class="sc-channel-col${hasJoinedCommunities ? '' : ' sc-channel-col-empty'}">
          ${hasJoinedCommunities ? `
            <header class="sc-channel-head">
              <div>
                <h2>${esc(community ? community.title : 'Communities')}</h2>
                <p>${community ? esc(community.type === 'private' ? 'Private Group / NIP-29' : 'Public Community / NIP-72') : 'No active community selected'}</p>
                <p>${connectedRelays} relay${connectedRelays === 1 ? '' : 's'} connected</p>
              </div>
              <button id="scServerSettingsBtn" ${community ? '' : 'disabled'}>Settings</button>
            </header>

            <div class="sc-channel-search">
              <input id="scSearchInput" value="${esc(state.searchTerm)}" placeholder="Search messages or channels" />
            </div>

            <div class="sc-channel-list">${community ? (channelHtml || '<div class="sc-empty">No channels yet.</div>') : '<div class="sc-empty">Select a community.</div>'}</div>

            <footer class="sc-channel-footer">
              <button id="scInviteBtn" ${community ? '' : 'disabled'}>Invite</button>
              <button id="scJoinLeaveBtn" ${community ? '' : 'disabled'}>${community && joinedCommunityIds.has(community.id) ? 'Leave' : 'Join'}</button>
              <button id="scCreateChannelBtn" ${(community && joinedCommunityIds.has(community.id) && store.can('manage_channels', channel, community)) ? '' : 'disabled'}>New Channel</button>
            </footer>
          ` : `
            <div class="sc-no-community-panel">
              <h2>No Communities Yet</h2>
              <p>If you are not in any communities, only Create and Join options appear.</p>
            </div>
          `}
        </aside>

        <main class="sc-main">
          <header class="sc-main-head">
            <div>
              <h3>${hasJoinedCommunities ? (channel ? `# ${esc(channel.name)}` : 'No channel selected') : 'Communities'}</h3>
              <p>${hasJoinedCommunities ? (channel ? esc(channel.topic || '') : 'Choose a channel to start chatting.') : 'Discover public spaces or create your own.'}</p>
            </div>
            <div class="sc-main-actions">
              ${hasJoinedCommunities
                ? `<button id="scPinnedBtn" ${channel ? '' : 'disabled'}>Pinned (${pins.length})</button>
                   <button id="scChannelSettingsBtn" ${(channel && store.can('manage_channels', channel, community)) ? '' : 'disabled'}>Channel Settings</button>
                   <button id="scNotifBtn">Notifications${notificationUnread ? ` (${notificationUnread})` : ''}</button>`
                : ``}
            </div>
          </header>

          ${hasJoinedCommunities
            ? `<section class="sc-feed" id="scFeed">${messageHtml || '<div class="sc-empty">No messages yet.</div>'}</section>

               <section class="sc-composer">
                 <div class="sc-draft-tools">
                   <button id="scEmojiBtn">Emoji</button>
                   <label class="sc-attach-label${ui.attachUploadPending ? ' is-busy' : ''}">${esc(attachLabel)}<input type="file" id="scAttachInput" accept="${esc(effectiveAttachAccept)}" multiple hidden ${ui.attachUploadPending ? 'disabled' : ''}></label>
                   <button id="scDmHintBtn">Encrypted DM</button>
                 </div>
                 ${(ui.composerAttachments || []).length ? `<div class="sc-attachment-preview">${ui.composerAttachments.map((file) => `<span>${esc(file.name)}</span>`).join('')}</div>` : ''}
                 ${replyTarget ? `<div class="sc-replying">Replying to <code>${esc(shortPubkey(replyTarget, 10, 8))}</code><button id="scClearReplyBtn" type="button">Clear</button></div>` : ''}
                 <textarea id="scComposer" placeholder="${channel ? `Message #${esc(channel.name)}` : 'Select a channel'}" ${channel ? '' : 'disabled'}>${esc(draft)}</textarea>
                 <div class="sc-compose-foot">
                   <small>${channel ? (store.can('post_messages', channel, community) ? 'Ready to publish via Nostr relays' : 'You do not have permission to post in this channel') : 'Pick a channel to start typing'}</small>
                   <button id="scSendBtn" ${(channel && store.can('post_messages', channel, community)) ? '' : 'disabled'}>Send</button>
                 </div>
                 ${ui.emojiOpen ? `<div class="sc-emoji-pop" id="scEmojiPop">${['😀', '😂', '🔥', '⚡', '💜', '🚀', '👏', '❤️', '🤝', '🎉'].map((emoji) => `<button data-emoji="${esc(emoji)}">${esc(emoji)}</button>`).join('')}</div>` : ''}
               </section>`
            : `<section class="sc-feed">
                 <div class="sc-empty sc-empty-onboard">
                   <strong>Ready to start your community space?</strong>
                   <p>Set up your own community in minutes, or explore public communities and jump into live conversations.</p>
                   <div class="sc-empty-onboard-actions">
                     <button id="scOpenCommunityHubBtn" class="sc-onboard-btn">Create or Join</button>
                     <button id="scOpenJoinModalBtn" class="sc-onboard-btn">Browse Public Communities</button>
                   </div>
                 </div>
               </section>`}
        </main>

        ${hasActiveCommunity ? `
          <aside class="sc-member-col${ui.memberPanelOpen ? '' : ' collapsed'}">
            <header>
              <h4>Members (${memberCount})</h4>
              <button id="scToggleMembersBtn">${ui.memberPanelOpen ? 'Hide' : 'Show'}</button>
            </header>
            <div class="sc-member-list">${memberHtml}</div>
          </aside>
        ` : ''}

        ${ui.statusMsg ? `<div class="sc-toast">${esc(ui.statusMsg)}</div>` : ''}
        ${ui.selectedMember ? renderProfilePopout(ui.selectedMember, profiles, members, community, store) : ''}
        ${ui.openModal ? renderModal(ui.openModal, state, community, channel, members, profiles, store, suggestions, publicCommunities) : ''}
        ${ui.contextMessageId ? renderContextMenu(ui.contextMessageId, ui.contextX, ui.contextY) : ''}
      </div>
    `;

    enhanceRenderedCommunityContent();
    bindHandlers();
    restoreFocusSnapshot(focusSnapshot);
    } catch (err) {
      console.error('Sifaka Communities render error', err);
      root.innerHTML = '<section class="sc-auth-gate"><div class="sc-auth-card"><h2>Communities Temporarily Unavailable</h2><p>Reload this page to try again.</p></div></section>';
    }
  }
function renderProfilePopout(pubkey, profiles, members, community, storeRef) {
    const profile = profiles[pubkey] || storeRef.profile(pubkey);
    const member = (members || []).find((entry) => entry.pubkey === pubkey) || { roles: ['guest'] };
    const avatar = String((profile && profile.avatar) || '').trim();
    const hasAvatar = /^https?:\/\//i.test(avatar);

    return `
      <div class="sc-popout" id="scProfilePopout">
        <button class="sc-popout-close" data-close="member">x</button>
        <div class="sc-pop-head">
          <span class="sc-avatar big${hasAvatar ? ' has-image' : ''}"${hasAvatar ? ` style="background-image:url('${esc(avatar)}')"` : ''}>${hasAvatar ? '' : esc(initials(profile.displayName || profile.name))}</span>
          <div>
            <h5>${esc(profile.displayName || profile.name)}</h5>
            <small>${esc(roleLabel(profile, member))}</small>
          </div>
        </div>
        <p>${esc(profile.bio || '')}</p>
        <div class="sc-pop-meta">
          <span>${profile.verifiedNip05 ? '[verified]' : '[unverified]'} ${esc(profile.nip05 || 'No NIP-05')}</span>
          <span>${esc(community ? community.id : '')}</span>
        </div>
        <div class="sc-pop-actions">
          <button data-member-action="mute" data-member="${esc(pubkey)}">Mute</button>
          <button data-member-action="timeout_5m" data-member="${esc(pubkey)}">Timeout</button>
          <button data-member-action="ban" data-member="${esc(pubkey)}">Ban</button>
          <button data-member-action="roles" data-member="${esc(pubkey)}">Roles</button>
        </div>
      </div>
    `;
  }

  function renderCreateImagePreview(url, label, wide = false) {
    const clean = String(url || '').trim();
    if (!clean) {
      return `<div class="sc-url-preview-empty">${esc(label)} preview appears here</div>`;
    }
    return `
      <div class="sc-url-preview-frame${wide ? ' wide' : ''}">
        <img src="${esc(clean)}" alt="${esc(label)} preview" loading="lazy" />
      </div>
    `;
  }

  function buildRoleSearchResults(role, value, state) {
    const query = String(ui.createRoleSearch[role] || trailingCsvToken(value || '')).trim().toLowerCase();
    if (query.length < 2) return '';

    const selected = new Set(parsePubkeyCsv(value || ''));
    const profiles = (state && state.data && state.data.profiles) ? state.data.profiles : {};
    const keys = uniqueValues([...(Object.keys(profiles || {})), state.currentUserPubkey || ''])
      .map((pubkey) => String(pubkey || '').trim())
      .filter((pubkey) => pubkey && !selected.has(normalizePubkey(pubkey)));

    const results = keys
      .map((pubkey) => {
        const profile = profiles[pubkey] || store.profile(pubkey);
        const npub = toNpub(pubkey);
        const name = profile.displayName || profile.name || shortPubkey(pubkey, 12, 8);
        const haystack = [
          name,
          profile.name || '',
          profile.displayName || '',
          npub,
          pubkey
        ].join(' ').toLowerCase();
        return {
          pubkey,
          npub,
          name,
          avatar: String(profile.avatar || '').trim(),
          haystack
        };
      })
      .filter((entry) => entry.haystack.includes(query))
      .slice(0, 6);

    return results.map((entry) => `
      <button class="sc-role-result" type="button" data-role-target="${esc(role)}" data-role-pubkey="${esc(entry.pubkey)}" data-role-label="${esc(entry.npub || entry.pubkey)}">
        <span class="sc-role-result-avatar">
          ${entry.avatar
            ? `<img src="${esc(entry.avatar)}" alt="${esc(entry.name)} avatar" loading="lazy" />`
            : `<i>${esc(initials(entry.name))}</i>`}
        </span>
        <span class="sc-role-result-main">
          <strong>${esc(entry.name)}</strong>
          <small>${esc(entry.npub || entry.pubkey)}</small>
        </span>
      </button>
    `).join('');
  }

  function renderCreateCommunityModal(state) {
    const draft = ensureCreateCommunityDraft(state);
    const ownerProfile = state.currentUserPubkey ? store.profile(state.currentUserPubkey) : null;
    const ownerName = ownerProfile ? (ownerProfile.displayName || ownerProfile.name || shortPubkey(state.currentUserPubkey)) : shortPubkey(state.currentUserPubkey);
    const ownerNip05 = ownerProfile && ownerProfile.nip05 ? `${ownerProfile.nip05}${ownerProfile.verifiedNip05 ? '' : ' (unverified)'}` : 'No NIP-05 set';
    const moderatorResults = buildRoleSearchResults('moderators', draft.moderators || '', state);
    const adminResults = buildRoleSearchResults('admins', draft.admins || '', state);

    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide sc-create-modal">
          <h4>Create Community</h4>
          <p>Create a space for your audience. You can change these settings later.</p>
          <div class="sc-create-owner">Owner: <strong>${esc(ownerName || 'Nostr User')}</strong><small>${esc(ownerNip05)} | ${esc(shortPubkey(state.currentUserPubkey, 12, 10))}</small></div>

          <section class="sc-create-section">
            <h5>Basics</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Visibility
                <select id="scCreateType">
                  <option value="public" ${draft.type === 'public' ? 'selected' : ''}>Public (discoverable)</option>
                  <option value="private" ${draft.type === 'private' ? 'selected' : ''}>Private (invite/approval)</option>
                </select>
                <small>Public communities can be listed in Join Communities.</small>
              </label>
              <label>Community name
                <input id="scCreateName" value="${esc(draft.name)}" placeholder="Sifaka Builders">
                <small>This is what people will see first.</small>
              </label>
              <label>Community link slug (optional)
                <input id="scCreateSlug" value="${esc(draft.slug)}" placeholder="sifaka-builders">
                <small>Letters, numbers, and dashes only.</small>
              </label>
              <label>First channel name
                <input id="scCreateDefaultChannel" value="${esc(draft.defaultChannelName)}" placeholder="general">
              </label>
              <label class="full">What is this community about?
                <textarea id="scCreateDescription" placeholder="Example: A friendly place to discuss livestream gear and tips.">${esc(draft.description)}</textarea>
              </label>
              <label>Topics (comma separated)
                <input id="scCreateTopics" value="${esc(draft.topics)}" placeholder="livestream, nostr, support">
              </label>
              <label>How people join
                <select id="scCreateJoinMode">
                  <option value="open" ${draft.joinMode === 'open' ? 'selected' : ''}>Anyone can join</option>
                  <option value="approval" ${draft.joinMode === 'approval' ? 'selected' : ''}>Request + approval</option>
                  <option value="invite_only" ${draft.joinMode === 'invite_only' ? 'selected' : ''}>Invite only</option>
                </select>
              </label>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Look and Feel</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Community image URL
                <input id="scCreateImage" value="${esc(draft.image)}" placeholder="https://example.com/community-image.jpg">
                <small>Square image recommended.</small>
              </label>
              <div id="scCreateImagePreview" class="sc-url-preview">${renderCreateImagePreview(draft.image, 'Community image')}</div>
              <label>Banner image URL
                <input id="scCreateBanner" value="${esc(draft.banner)}" placeholder="https://example.com/community-banner.jpg">
                <small>Wide image works best for banners.</small>
              </label>
              <div id="scCreateBannerPreview" class="sc-url-preview">${renderCreateImagePreview(draft.banner, 'Banner image', true)}</div>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Team and Posting</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label class="full">Moderators
                <input id="scCreateModerators" value="${esc(draft.moderators)}" placeholder="Type a name, npub, or hex pubkey">
                <small>Start typing to search known profiles, then click to add.</small>
                <div id="scCreateModeratorsSearch" class="sc-role-search" ${moderatorResults ? '' : 'hidden'}>${moderatorResults}</div>
              </label>
              <label class="full">Admins
                <input id="scCreateAdmins" value="${esc(draft.admins)}" placeholder="Type a name, npub, or hex pubkey">
                <small>Admins can manage settings and moderation tools.</small>
                <div id="scCreateAdminsSearch" class="sc-role-search" ${adminResults ? '' : 'hidden'}>${adminResults}</div>
              </label>
              <label>Who can post
                <select id="scCreatePostingPolicy">
                  <option value="members" ${draft.postingPolicy === 'members' ? 'selected' : ''}>Members</option>
                  <option value="moderators" ${draft.postingPolicy === 'moderators' ? 'selected' : ''}>Moderators only</option>
                  <option value="admins" ${draft.postingPolicy === 'admins' ? 'selected' : ''}>Admins only</option>
                </select>
              </label>
              <label>Allowed relay URLs (comma separated)
                <input id="scCreateAllowedRelays" value="${esc(draft.allowedRelays)}" placeholder="wss://relay.example.com, wss://relay2.example.com">
              </label>
              <label class="full">Community rules (one per line)
                <textarea id="scCreateRules" placeholder="Be respectful\nNo spam\nKeep discussion on-topic">${esc(draft.rules)}</textarea>
              </label>
            </div>
          </section>

          <div class="sc-check-grid">
            <label><input type="checkbox" id="scCreateDiscoverable" ${draft.discoverable ? 'checked' : ''}> Show in public discovery</label>
            <label><input type="checkbox" id="scCreateIncludeAnnouncements" ${draft.includeAnnouncements ? 'checked' : ''}> Add #announcements channel</label>
            <label><input type="checkbox" id="scCreateIncludeForum" ${draft.includeForum ? 'checked' : ''}> Add #forum channel</label>
            <label><input type="checkbox" id="scCreateIncludeStaff" ${draft.includeStaff ? 'checked' : ''}> Add private #staff channel</label>
          </div>

          <div class="sc-modal-foot">
            <button data-close="modal">Cancel</button>
            <button id="scCreateCommunitySubmit">${ui.createBusy ? 'Creating...' : 'Create Community'}</button>
          </div>
        </div>
      </div>
    `;
  }
function renderCommunitySettingsModal(community) {
    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide">
          <h4>Community Settings</h4>
          <p>Edit metadata, moderators/admins, posting policy, and discovery controls.</p>
          <div class="sc-form-grid sc-form-grid-2">
            <label>Name<input id="scSettingsName" value="${esc(community.title || '')}"></label>
            <label>Join Mode
              <select id="scSettingsJoinMode">
                <option value="open" ${community.joinMode === 'open' ? 'selected' : ''}>Open</option>
                <option value="approval" ${community.joinMode === 'approval' ? 'selected' : ''}>Approval</option>
                <option value="invite_only" ${community.joinMode === 'invite_only' ? 'selected' : ''}>Invite only</option>
              </select>
            </label>
            <label>Image URL<input id="scSettingsImage" value="${esc(community.image || '')}"></label>
            <label>Banner URL<input id="scSettingsBanner" value="${esc(community.banner || '')}"></label>
            <label>Moderators (comma pubkeys)
              <input id="scSettingsModerators" value="${esc((community.moderatorPubkeys || []).join(', '))}">
            </label>
            <label>Admins (comma pubkeys)
              <input id="scSettingsAdmins" value="${esc((community.adminPubkeys || []).join(', '))}">
            </label>
            <label>Posting Rules
              <select id="scSettingsPostingPolicy">
                <option value="members" ${community.postingPolicy === 'members' ? 'selected' : ''}>Members</option>
                <option value="moderators" ${community.postingPolicy === 'moderators' ? 'selected' : ''}>Moderators</option>
                <option value="admins" ${community.postingPolicy === 'admins' ? 'selected' : ''}>Admins</option>
              </select>
            </label>
            <label class="full">Description<textarea id="scSettingsDescription">${esc(community.description || '')}</textarea></label>
            <label class="full">Rules (one per line)<textarea id="scSettingsRules">${esc((community.rules || []).join('\n'))}</textarea></label>
            <label class="full">Topics (comma)<input id="scSettingsTopics" value="${esc((community.topics || []).join(', '))}"></label>
            <label class="full">Allowed Relays (comma)<input id="scSettingsRelays" value="${esc((community.allowedRelays || []).join(', '))}"></label>
          </div>
          <div class="sc-check-grid">
            <label><input type="checkbox" id="scSettingsDiscoverable" ${community.discoverable ? 'checked' : ''}> Discoverable in public lists</label>
          </div>
          <h5>Permission Matrix</h5>
          ${permissionsSummary()}
          <div class="sc-modal-foot">
            <button data-close="modal">Cancel</button>
            <button id="scSaveCommunitySettingsBtn">Save Settings</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCreateChannelModal(community) {
    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal">
          <h4>Create Channel</h4>
          <p>${esc(community.title)}</p>
          <div class="sc-form-grid">
            <label>Name<input id="scCreateChannelName" placeholder="support"></label>
            <label>Category<input id="scCreateChannelCategory" value="Channels"></label>
            <label>Topic<textarea id="scCreateChannelTopic" placeholder="Channel purpose"></textarea></label>
            <label>Channel Type
              <select id="scCreateChannelType">
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="announcement">Announcement</option>
                <option value="forum">Forum</option>
              </select>
            </label>
            <label>Privacy
              <select id="scCreateChannelPrivacy">
                <option value="public">Public</option>
                <option value="invite_only">Invite only</option>
              </select>
            </label>
            <label>Slow Mode (seconds)<input id="scCreateChannelSlow" type="number" min="0" value="0"></label>
          </div>
          <div class="sc-modal-foot">
            <button data-close="modal">Cancel</button>
            <button id="scCreateChannelSubmit">Create Channel</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCommunityHubModal() {
    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-hub-modal">
          <h4>Communities</h4>
          <p>Create your own server or join a public community.</p>
          <div class="sc-hub-actions">
            <button class="sc-hub-card" id="scHubCreateBtn">
              <strong>Create Community</strong>
              <small>Set up channels, permissions, moderators, and admins.</small>
            </button>
            <button class="sc-hub-card" id="scHubJoinBtn">
              <strong>Join Community</strong>
              <small>Browse discoverable public communities and join instantly.</small>
            </button>
          </div>
          <div class="sc-modal-foot">
            <button data-close="modal">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderJoinCommunityModal(state, discoveryCommunities = []) {
    const joinedCommunityIds = new Set(state.joinedCommunityIds || []);
    const max = Math.max(ui.discoveryChunk, ui.discoveryLimit);
    const visible = (discoveryCommunities || []).slice(0, max);
    const hasMore = visible.length < (discoveryCommunities || []).length;

    const cards = visible.map((entry) => {
      const members = resolveMemberCount(state, entry);
      const joined = joinedCommunityIds.has(entry.id);
      const media = String(entry.banner || entry.image || '').trim();
      const mediaHtml = media
        ? `<span class="sc-community-card-banner has-image"><img src="${esc(media)}" alt="${esc(entry.title)} banner" loading="lazy" referrerpolicy="no-referrer"></span>`
        : `<span class="sc-community-card-banner">${esc(entry.icon || initials(entry.title))}</span>`;

      return `
        <button class="sc-community-card${joined ? ' joined' : ''}" data-discovery-community="${esc(entry.id)}" data-discovery-joined="${joined ? '1' : '0'}">
          ${mediaHtml}
          <span class="sc-community-card-main">
            <strong>${esc(entry.title)}</strong>
            <small>${esc(entry.description || 'No description yet.')}</small>
            <i>${members} member${members === 1 ? '' : 's'}</i>
          </span>
          <span class="sc-community-card-cta">${joined ? 'Open' : 'Join'}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide">
          <h4>Join Community</h4>
          <p>Public communities discovered from relays. Scroll to load more.</p>
          <div class="sc-discovery-grid-scroll${hasMore ? ' has-bottom' : ''}" id="scDiscoveryScroll" data-total="${(discoveryCommunities || []).length}">
            <div class="sc-discovery-grid">${cards || '<div class="sc-empty">No public communities available yet.</div>'}</div>
            ${hasMore ? '<div class="sc-discovery-sentinel" id="scDiscoverySentinel" aria-hidden="true"></div>' : ''}
          </div>
          <div class="sc-modal-foot"><button data-close="modal">Close</button></div>
        </div>
      </div>
    `;
  }

  function renderModal(key, state, community, channel, members, profiles, storeRef, suggestions, publicCommunities) {
    if (key === 'communityHub') {
      return renderCommunityHubModal();
    }

    if (key === 'createCommunity') {
      return renderCreateCommunityModal(state);
    }

    if (key === 'communitySettings' && community) {
      return renderCommunitySettingsModal(community);
    }

    if (key === 'createChannel' && community) {
      return renderCreateChannelModal(community);
    }

    if (key === 'channelSettings' && channel) {
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Channel Settings</h4>
            <p>#${esc(channel.name)}</p>
            <div class="sc-form-grid">
              <label>Name<input id="scChannelName" value="${esc(channel.name)}"></label>
              <label>Category<input id="scChannelCategory" value="${esc(channel.category || 'Channels')}"></label>
              <label>Topic<textarea id="scChannelTopic">${esc(channel.topic || '')}</textarea></label>
              <label>Privacy
                <select id="scChannelPrivacy">
                  <option value="public" ${channel.privacyLevel === 'public' ? 'selected' : ''}>Public</option>
                  <option value="invite_only" ${channel.privacyLevel === 'invite_only' ? 'selected' : ''}>Invite only</option>
                </select>
              </label>
              <label>Type
                <select id="scChannelType">
                  <option value="public" ${channel.channelType === 'public' ? 'selected' : ''}>Public</option>
                  <option value="private" ${channel.channelType === 'private' ? 'selected' : ''}>Private</option>
                  <option value="announcement" ${channel.channelType === 'announcement' ? 'selected' : ''}>Announcement</option>
                  <option value="forum" ${channel.channelType === 'forum' ? 'selected' : ''}>Forum</option>
                </select>
              </label>
              <label>Slow mode (seconds)<input id="scChannelSlow" type="number" min="0" value="${esc(channel.slowModeSec || 0)}"></label>
            </div>
            <div class="sc-modal-foot">
              <button data-close="modal">Cancel</button>
              <button id="scSaveChannelSettingsBtn">Save Channel</button>
            </div>
          </div>
        </div>
      `;
    }

    if (key === 'invites' && community) {
      const inviteCode = state.inviteCodesByCommunity.get(community.id) || '';
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Invite Members</h4>
            <p>Create an invite link for ${esc(community.title)}.</p>
            <div class="sc-invite-row">
              <input id="scInviteCode" readonly value="${esc(inviteCode ? `${location.origin}/communities/invite/${inviteCode}` : '')}">
              <button id="scGenerateInviteBtn">Generate</button>
            </div>
            <div class="sc-modal-foot"><button data-close="modal">Close</button></div>
          </div>
        </div>
      `;
    }

    if (key === 'joinCommunity' || key === 'discovery') {
      return renderJoinCommunityModal(state, publicCommunities || suggestions || []);
    }

    if (key === 'notifications') {
      const rows = (state.data.notifications || [])
        .map((n) => `<div class="sc-notif-row${n.unread ? ' unread' : ''}"><strong>${esc(n.kind)}</strong><span>${esc(n.title)}</span><small>${esc(fmtTime(n.createdAt))}</small></div>`)
        .join('');
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Notifications</h4>
            <div class="sc-notif-list">${rows || '<div class="sc-empty">No notifications.</div>'}</div>
            <div class="sc-modal-foot"><button data-close="modal">Close</button></div>
          </div>
        </div>
      `;
    }

    if (key === 'roleEditor' && community) {
      const member = members.find((entry) => entry.pubkey === ui.roleEditorMember);
      const profileData = profiles[ui.roleEditorMember] || storeRef.profile(ui.roleEditorMember);
      const roleOptions = ['owner', 'admin', 'moderator', 'member', 'guest'];
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Role Editor</h4>
            <p>${esc((profileData && (profileData.displayName || profileData.name)) || 'Member')}</p>
            <div class="sc-role-picker">
              ${roleOptions.map((role) => `<button class="sc-role-btn${member && member.roles.includes(role) ? ' active' : ''}" data-role="${esc(role)}">${esc(role)}</button>`).join('')}
            </div>
            <div class="sc-modal-foot">
              <button id="scSaveRolesBtn" ${!member ? 'disabled' : ''}>Save</button>
              <button data-close="modal">Close</button>
            </div>
          </div>
        </div>
      `;
    }

    if (key === 'pinned' && channel) {
      const rows = storeRef.getPinnedMessages(channel.id).map((message) => `<div class="sc-pin-row"><strong>${esc(message.id)}</strong><span>${esc(message.content)}</span></div>`).join('');
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Pinned Messages</h4>
            <div class="sc-pin-list">${rows || '<div class="sc-empty">No pins yet.</div>'}</div>
            <div class="sc-modal-foot"><button data-close="modal">Close</button></div>
          </div>
        </div>
      `;
    }

    return '';
  }

  function renderContextMenu(messageId, x, y) {
    return `
      <div class="sc-context" style="left:${Number(x)}px;top:${Number(y)}px" data-context-menu>
        <button data-context-action="reply" data-message="${esc(messageId)}">Reply</button>
        <button data-context-action="pin" data-message="${esc(messageId)}">Toggle Pin</button>
        <button data-context-action="report" data-message="${esc(messageId)}">Report (NIP-56)</button>
      </div>
    `;
  }

  function setStatus(message) {
    ui.statusMsg = String(message || '');
    requestRender();
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (!ui.statusMsg) return;
    toastTimer = window.setTimeout(() => {
      ui.statusMsg = '';
      toastTimer = null;
      requestRender();
    }, 2600);
  }

  async function publishMembershipList() {
    if (!nostrBridge || !ui.session.isAuthenticated) return { ok: true, skipped: true };
    const joined = store.getState().joinedCommunityIds || [];
    try {
      const result = await nostrBridge.publishMembershipList({
        pubkey: store.getState().currentUserPubkey,
        communityIds: joined
      });
      if (sentCountFromPublishResult(result) <= 0) {
        return { ok: false, reason: 'no_relays' };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'publish_failed', error: err };
    }
  }

  function closeModalAndRerender() {
    if (ui.openModal === 'createCommunity') {
      ui.createDraft = null;
      ui.createRoleSearch = { moderators: '', admins: '' };
    }
    ui.openModal = '';
    render();
  }

  function updateCreateImagePreview(previewId, value, label, wide = false) {
    const host = root.querySelector(previewId);
    if (!host) return;
    host.innerHTML = renderCreateImagePreview(value, label, wide);
  }

  function updateRoleSearchBox(role, value) {
    const isModerators = role === 'moderators';
    const searchId = isModerators ? '#scCreateModeratorsSearch' : '#scCreateAdminsSearch';
    const searchBox = root.querySelector(searchId);
    if (!searchBox) return;
    ui.createRoleSearch[role] = trailingCsvToken(value || '');
    const html = buildRoleSearchResults(role, value, store.getState());
    if (!html) {
      searchBox.hidden = true;
      searchBox.innerHTML = '';
      return;
    }
    searchBox.hidden = false;
    searchBox.innerHTML = html;
  }

  function addRoleFieldValue(role, pubkey, label) {
    const isModerators = role === 'moderators';
    const inputId = isModerators ? '#scCreateModerators' : '#scCreateAdmins';
    const input = root.querySelector(inputId);
    if (!input) return;

    const token = String(label || toNpub(pubkey) || pubkey).trim();
    if (!token) return;

    const tokens = splitCsvTokens(input.value);
    const normalized = new Set(tokens.map(normalizePubkey));
    const normalizedToken = normalizePubkey(token);
    if (!normalized.has(normalizedToken)) {
      tokens.push(token);
    }
    input.value = `${tokens.join(', ')}${tokens.length ? ', ' : ''}`;
    setCreateDraftField(role, input.value);
    updateRoleSearchBox(role, input.value);
  }

  function bindCreateCommunityForm() {
    const bindInputField = (selector, field, mode = 'input') => {
      const el = root.querySelector(selector);
      if (!el) return;
      const evt = (mode === 'change' || mode === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (mode === 'checkbox') setCreateDraftField(field, !!el.checked);
        else setCreateDraftField(field, el.value || '');
      });
    };

    bindInputField('#scCreateType', 'type', 'change');
    bindInputField('#scCreateName', 'name');
    bindInputField('#scCreateSlug', 'slug');
    bindInputField('#scCreateDefaultChannel', 'defaultChannelName');
    bindInputField('#scCreateDescription', 'description');
    bindInputField('#scCreateTopics', 'topics');
    bindInputField('#scCreateJoinMode', 'joinMode', 'change');
    bindInputField('#scCreatePostingPolicy', 'postingPolicy', 'change');
    bindInputField('#scCreateRules', 'rules');
    bindInputField('#scCreateAllowedRelays', 'allowedRelays');
    bindInputField('#scCreateDiscoverable', 'discoverable', 'checkbox');
    bindInputField('#scCreateIncludeAnnouncements', 'includeAnnouncements', 'checkbox');
    bindInputField('#scCreateIncludeForum', 'includeForum', 'checkbox');
    bindInputField('#scCreateIncludeStaff', 'includeStaff', 'checkbox');

    const imageInput = root.querySelector('#scCreateImage');
    if (imageInput) {
      const syncImage = () => {
        setCreateDraftField('image', imageInput.value || '');
        updateCreateImagePreview('#scCreateImagePreview', imageInput.value || '', 'Community image');
      };
      imageInput.addEventListener('input', syncImage);
      imageInput.addEventListener('change', syncImage);
    }

    const bannerInput = root.querySelector('#scCreateBanner');
    if (bannerInput) {
      const syncBanner = () => {
        setCreateDraftField('banner', bannerInput.value || '');
        updateCreateImagePreview('#scCreateBannerPreview', bannerInput.value || '', 'Banner image', true);
      };
      bannerInput.addEventListener('input', syncBanner);
      bannerInput.addEventListener('change', syncBanner);
    }

    const bindRoleSearchField = (selector, field) => {
      const input = root.querySelector(selector);
      if (!input) return;
      input.addEventListener('input', () => {
        setCreateDraftField(field, input.value || '');
        updateRoleSearchBox(field, input.value || '');
      });
      input.addEventListener('focus', () => updateRoleSearchBox(field, input.value || ''));
      input.addEventListener('blur', () => {
        window.setTimeout(() => {
          const searchId = field === 'moderators' ? '#scCreateModeratorsSearch' : '#scCreateAdminsSearch';
          const searchBox = root.querySelector(searchId);
          if (searchBox) searchBox.hidden = true;
        }, 90);
      });
    };

    bindRoleSearchField('#scCreateModerators', 'moderators');
    bindRoleSearchField('#scCreateAdmins', 'admins');

    const bindRoleContainer = (selector) => {
      const box = root.querySelector(selector);
      if (!box) return;
      box.addEventListener('mousedown', (event) => {
        if (event.target && event.target.closest && event.target.closest('.sc-role-result')) {
          event.preventDefault();
        }
      });
      box.addEventListener('click', (event) => {
        const btn = event.target && event.target.closest ? event.target.closest('.sc-role-result') : null;
        if (!btn) return;
        const role = btn.getAttribute('data-role-target') || '';
        const pubkey = btn.getAttribute('data-role-pubkey') || '';
        const label = btn.getAttribute('data-role-label') || '';
        addRoleFieldValue(role, pubkey, label);
      });
    };

    bindRoleContainer('#scCreateModeratorsSearch');
    bindRoleContainer('#scCreateAdminsSearch');
  }

  function bindHandlers() {
    disconnectDiscoveryObserver();

    root.querySelectorAll('[data-community]').forEach((el) => {
      el.addEventListener('click', () => {
        store.setActiveCommunity(el.getAttribute('data-community'));
        closeTransient();
      });
    });

    root.querySelectorAll('[data-channel]').forEach((el) => {
      el.addEventListener('click', () => {
        store.setActiveChannel(el.getAttribute('data-channel'));
        closeTransient();
      });
    });

    root.querySelectorAll('[data-member]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        ui.selectedMember = el.getAttribute('data-member');
        render();
      });
    });

    root.querySelectorAll('[data-close="member"]').forEach((el) => {
      el.addEventListener('click', () => {
        ui.selectedMember = '';
        render();
      });
    });

    root.querySelectorAll('[data-close="modal"]').forEach((el) => {
      el.addEventListener('click', (event) => {
        if (event.target !== el) return;
        if (ui.openModal === 'createCommunity') {
          ui.createDraft = null;
          ui.createRoleSearch = { moderators: '', admins: '' };
        }
        ui.openModal = '';
        render();
      });
    });

    if (ui.openModal === 'createCommunity') {
      bindCreateCommunityForm();
    }

    const search = root.querySelector('#scSearchInput');
    if (search) search.addEventListener('input', () => store.setSearch(search.value));

    const composer = root.querySelector('#scComposer');
    if (composer) {
      composer.addEventListener('input', () => store.setDraft(store.getState().activeChannelId, composer.value));
      composer.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const snapshot = store.getState();
          const replyTo = getReplyTarget(snapshot.activeChannelId);
          const res = store.sendMessage({ content: composer.value, attachments: ui.composerAttachments, replyTo });
          if (!res.ok) return;
          store.setDraft(snapshot.activeChannelId, '');
          clearReplyTarget(snapshot.activeChannelId);
          ui.composerAttachments = [];

          if (nostrBridge) {
            const state = store.getState();
            const channel = store.getChannel();
            try {
              await nostrBridge.publishChannelMessage({
                pubkey: state.currentUserPubkey,
                channel,
                communityId: state.activeCommunityId,
                channelId: state.activeChannelId,
                content: res.message.content,
                replyTo: res.message.replyTo,
                threadRoot: res.message.threadRoot
              });
            } catch (_) {}
          }
        }
      });
    }

    const sendBtn = root.querySelector('#scSendBtn');
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        const stateBeforeSend = store.getState();
        const text = (composer && composer.value) || '';
        const replyTo = getReplyTarget(stateBeforeSend.activeChannelId);
        const res = store.sendMessage({ content: text, attachments: ui.composerAttachments, replyTo });
        if (!res.ok) return;

        store.setDraft(stateBeforeSend.activeChannelId, '');
        clearReplyTarget(stateBeforeSend.activeChannelId);
        ui.composerAttachments = [];

        if (nostrBridge) {
          const state = store.getState();
          const channel = store.getChannel();
          try {
            await nostrBridge.publishChannelMessage({
              pubkey: state.currentUserPubkey,
              channel,
              communityId: state.activeCommunityId,
              channelId: state.activeChannelId,
              content: res.message.content,
              replyTo: res.message.replyTo,
              threadRoot: res.message.threadRoot
            });
          } catch (_) {}
        }
      });
    }

    const clearReplyBtn = root.querySelector('#scClearReplyBtn');
    if (clearReplyBtn) {
      clearReplyBtn.addEventListener('click', () => {
        clearReplyTarget(store.getState().activeChannelId);
        requestRender();
      });
    }

    const attachInput = root.querySelector('#scAttachInput');
    if (attachInput) {
      attachInput.addEventListener('change', async () => {
        const files = Array.from(attachInput.files || []);
        attachInput.value = '';
        if (!files.length || ui.attachUploadPending) return;

        if (!ui.session.isAuthenticated) {
          setStatus('Login required to upload attachments.');
          return;
        }
        if (!appContext || typeof appContext.uploadMediaFile !== 'function') {
          setStatus('Media upload is unavailable right now.');
          return;
        }
        const activeChannelId = store.getState().activeChannelId;
        if (!activeChannelId) {
          setStatus('Pick a channel before attaching files.');
          return;
        }

        ui.attachUploadPending = true;
        ui.attachUploadProgress = 0;
        requestRender();

        const uploaded = [];
        const failed = [];
        const totalFiles = files.length;
        let lastProgress = -1;

        try {
          for (let index = 0; index < files.length; index += 1) {
            const file = files[index];
            try {
              const result = await appContext.uploadMediaFile(file, {
                onProgress(progress = {}) {
                  const percent = Number(progress.percent);
                  if (!Number.isFinite(percent)) return;
                  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
                  const overall = Math.max(0, Math.min(100, Math.round(((index + (clamped / 100)) / totalFiles) * 100)));
                  if (overall === lastProgress) return;
                  lastProgress = overall;
                  ui.attachUploadProgress = overall;
                  requestRender();
                }
              });
              const url = String(result && result.url || '').trim();
              if (!url) throw new Error('Upload finished but no media URL was returned.');
              uploaded.push({
                id: `upload:${Date.now().toString(36)}:${index}`,
                name: file.name || 'attachment',
                kind: 'file',
                url
              });
            } catch (err) {
              failed.push({ file, error: err });
            }
          }

          if (uploaded.length) {
            const snapshot = store.getState();
            const draft = snapshot.draftsByChannel.get(activeChannelId) || '';
            const joiner = draft && !draft.endsWith('\n') ? '\n' : '';
            const urls = uploaded.map((item) => item.url).join('\n');
            const nextDraft = `${draft}${joiner}${urls}`;
            store.setDraft(activeChannelId, nextDraft);
            if (snapshot.activeChannelId === activeChannelId) {
              const composerEl = root.querySelector('#scComposer');
              if (composerEl) {
                composerEl.value = nextDraft;
              }
              ui.composerAttachments = [...ui.composerAttachments, ...uploaded];
            }
          }

          if (uploaded.length && failed.length) {
            const firstError = failed[0] && failed[0].error && failed[0].error.message
              ? failed[0].error.message
              : 'Some files failed to upload.';
            setStatus(`Uploaded ${uploaded.length}/${files.length} files. ${firstError}`);
          } else if (uploaded.length) {
            setStatus(`Uploaded ${uploaded.length} file${uploaded.length === 1 ? '' : 's'} and inserted into your message.`);
          } else if (failed.length) {
            const firstError = failed[0] && failed[0].error && failed[0].error.message
              ? failed[0].error.message
              : 'Upload failed.';
            setStatus(firstError);
          }
        } finally {
          ui.attachUploadPending = false;
          ui.attachUploadProgress = 0;
          render();
        }
      });
    }

    const emojiBtn = root.querySelector('#scEmojiBtn');
    if (emojiBtn) {
      emojiBtn.addEventListener('click', () => {
        ui.emojiOpen = !ui.emojiOpen;
        render();
      });
    }

    root.querySelectorAll('[data-emoji]').forEach((el) => {
      el.addEventListener('click', () => {
        const value = el.getAttribute('data-emoji') || '';
        const snapshot = store.getState();
        const draft = snapshot.draftsByChannel.get(snapshot.activeChannelId) || '';
        store.setDraft(snapshot.activeChannelId, `${draft}${value} `);
      });
    });

    root.querySelectorAll('.sc-react-chip').forEach((el) => {
      el.addEventListener('click', async () => {
        const messageId = el.getAttribute('data-message');
        const key = el.getAttribute('data-react-key');
        const state = store.getState();
        const res = store.toggleReaction(state.activeChannelId, messageId, key);

        if (res.ok && res.added && nostrBridge) {
          try {
            await nostrBridge.publishReaction({
              communityId: state.activeCommunityId,
              channelId: state.activeChannelId,
              messageId,
              reaction: key,
              pubkey: state.currentUserPubkey
            });
          } catch (_) {}
        }
      });
    });

    root.querySelectorAll('[data-action="pin"]').forEach((el) => {
      el.addEventListener('click', () => {
        const res = store.togglePin(store.getState().activeChannelId, el.getAttribute('data-message'));
        if (!res.ok) {
          setStatus(res.reason === 'permission_denied' ? 'You do not have permission to pin messages.' : 'Could not pin this message.');
        }
      });
    });

    root.querySelectorAll('[data-action="reply"]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-message');
        const state = store.getState();
        ui.replyTargetByChannel.set(state.activeChannelId, id || '');
        requestRender();
      });
    });

    root.querySelectorAll('[data-action="menu"]').forEach((el) => {
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        ui.contextMessageId = el.getAttribute('data-message') || '';
        ui.contextX = event.clientX;
        ui.contextY = event.clientY;
        render();
      });
    });

    root.querySelectorAll('[data-context-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.getAttribute('data-context-action');
        const messageId = el.getAttribute('data-message');
        const channelId = store.getState().activeChannelId;
        if (action === 'pin') {
          const res = store.togglePin(channelId, messageId);
          if (!res.ok) {
            setStatus(res.reason === 'permission_denied' ? 'You do not have permission to pin messages.' : 'Could not pin this message.');
          }
        }
        if (action === 'reply') {
          ui.replyTargetByChannel.set(channelId, messageId || '');
          requestRender();
        }
        if (action === 'report') setStatus('Report flow queued (NIP-56).');
        ui.contextMessageId = '';
        render();
      });
    });

    root.querySelectorAll('[data-member-action]').forEach((el) => {
      el.addEventListener('click', () => {
        const action = el.getAttribute('data-member-action');
        const pubkey = el.getAttribute('data-member');
        const state = store.getState();
        if (action === 'roles') {
          ui.openModal = 'roleEditor';
          ui.roleEditorMember = pubkey;
          render();
          return;
        }
        store.moderateMember(state.activeCommunityId, pubkey, action);
        ui.selectedMember = '';
        render();
      });
    });

    root.querySelectorAll('.sc-role-btn').forEach((el) => {
      el.addEventListener('click', () => {
        root.querySelectorAll('.sc-role-btn').forEach((btn) => btn.classList.remove('active'));
        el.classList.add('active');
      });
    });

    const saveRolesBtn = root.querySelector('#scSaveRolesBtn');
    if (saveRolesBtn) {
      saveRolesBtn.addEventListener('click', () => {
        const activeRole = root.querySelector('.sc-role-btn.active');
        if (!activeRole) return;
        const role = activeRole.getAttribute('data-role');
        const state = store.getState();
        store.setMemberRole(state.activeCommunityId, ui.roleEditorMember, [role]);
        ui.openModal = '';
        ui.roleEditorMember = '';
        render();
      });
    }

    const createCommunityBtn = root.querySelector('#scCreateCommunityBtn');
    if (createCommunityBtn) createCommunityBtn.addEventListener('click', () => { ui.openModal = 'communityHub'; render(); });

    const openCommunityHubBtn = root.querySelector('#scOpenCommunityHubBtn');
    if (openCommunityHubBtn) openCommunityHubBtn.addEventListener('click', () => { ui.openModal = 'communityHub'; render(); });

    const openJoinModalBtn = root.querySelector('#scOpenJoinModalBtn');
    if (openJoinModalBtn) openJoinModalBtn.addEventListener('click', () => {
      resetDiscoveryWindow();
      ui.openModal = 'joinCommunity';
      render();
    });

    const hubCreateBtn = root.querySelector('#scHubCreateBtn');
    if (hubCreateBtn) hubCreateBtn.addEventListener('click', () => {
      ui.createDraft = null;
      ui.createRoleSearch = { moderators: '', admins: '' };
      ui.openModal = 'createCommunity';
      render();
    });

    const hubJoinBtn = root.querySelector('#scHubJoinBtn');
    if (hubJoinBtn) hubJoinBtn.addEventListener('click', () => {
      resetDiscoveryWindow();
      ui.openModal = 'joinCommunity';
      render();
    });

    const serverSettingsBtn = root.querySelector('#scServerSettingsBtn');
    if (serverSettingsBtn) serverSettingsBtn.addEventListener('click', () => { ui.openModal = 'communitySettings'; render(); });

    const channelSettingsBtn = root.querySelector('#scChannelSettingsBtn');
    if (channelSettingsBtn) channelSettingsBtn.addEventListener('click', () => { ui.openModal = 'channelSettings'; render(); });

    const pinnedBtn = root.querySelector('#scPinnedBtn');
    if (pinnedBtn) pinnedBtn.addEventListener('click', () => { ui.openModal = 'pinned'; render(); });

    const notifBtn = root.querySelector('#scNotifBtn');
    if (notifBtn) notifBtn.addEventListener('click', () => { ui.openModal = 'notifications'; render(); });

    const inviteBtn = root.querySelector('#scInviteBtn');
    if (inviteBtn) inviteBtn.addEventListener('click', () => { ui.openModal = 'invites'; render(); });

    const createChannelBtn = root.querySelector('#scCreateChannelBtn');
    if (createChannelBtn) createChannelBtn.addEventListener('click', () => { ui.openModal = 'createChannel'; render(); });

    const generateInviteBtn = root.querySelector('#scGenerateInviteBtn');
    if (generateInviteBtn) {
      generateInviteBtn.addEventListener('click', () => {
        const code = store.createInvite();
        const field = root.querySelector('#scInviteCode');
        if (field) field.value = `${location.origin}/communities/invite/${code}`;
      });
    }

    const joinLeaveBtn = root.querySelector('#scJoinLeaveBtn');
    if (joinLeaveBtn) {
      joinLeaveBtn.addEventListener('click', async () => {
        const state = store.getState();
        const joined = new Set(state.joinedCommunityIds);
        if (joined.has(state.activeCommunityId)) store.leaveCommunity(state.activeCommunityId);
        else store.joinCommunity(state.activeCommunityId);
        const membershipPublish = await publishMembershipList();
        if (!membershipPublish.ok) {
          setStatus('Joined locally, but could not sync membership list to relays.');
        }
      });
    }

    root.querySelectorAll('[data-discovery-community]').forEach((el) => {
      el.addEventListener('click', async () => {
        const communityId = el.getAttribute('data-discovery-community');
        if (!communityId) return;
        const alreadyJoined = el.getAttribute('data-discovery-joined') === '1';
        store.setActiveCommunity(communityId);
        if (!alreadyJoined) {
          store.joinCommunity(communityId);
          const membershipPublish = await publishMembershipList();
          if (!membershipPublish.ok) {
            setStatus('Joined locally, but could not sync membership list to relays.');
          }
        }
        ui.openModal = '';
        render();
      });
    });

    const discoveryScroll = root.querySelector('#scDiscoveryScroll');
    if (discoveryScroll) {
      const updateDiscoveryFade = () => {
        const top = discoveryScroll.scrollTop > 6;
        const bottom = (discoveryScroll.scrollTop + discoveryScroll.clientHeight) < (discoveryScroll.scrollHeight - 6);
        discoveryScroll.classList.toggle('has-top', top);
        discoveryScroll.classList.toggle('has-bottom', bottom);
      };

      discoveryScroll.addEventListener('scroll', updateDiscoveryFade, { passive: true });
      window.requestAnimationFrame(updateDiscoveryFade);

      const discoverySentinel = root.querySelector('#scDiscoverySentinel');
      if (discoverySentinel && typeof window.IntersectionObserver === 'function') {
        ui.discoveryObserver = new window.IntersectionObserver((entries) => {
          if (ui.discoveryLoading) return;
          const seen = entries.some((entry) => entry.isIntersecting);
          if (!seen) return;
          const total = Number(discoveryScroll.getAttribute('data-total') || 0);
          if (!total || ui.discoveryLimit >= total) return;
          ui.discoveryLoading = true;
          ui.discoveryLimit = Math.min(total, ui.discoveryLimit + ui.discoveryChunk);
          window.requestAnimationFrame(() => {
            ui.discoveryLoading = false;
            render();
          });
        }, {
          root: discoveryScroll,
          rootMargin: '120px 0px',
          threshold: 0.1
        });
        ui.discoveryObserver.observe(discoverySentinel);
      }
    }

    const createCommunitySubmit = root.querySelector('#scCreateCommunitySubmit');
    if (createCommunitySubmit) {
      createCommunitySubmit.addEventListener('click', async () => {
        if (ui.createBusy) return;
        ui.createBusy = true;
        createCommunitySubmit.disabled = true;
        syncCreateCommunityDraftFromDom();
        const form = ui.createDraft || defaultCreateCommunityDraft(store.getState());

        const payload = {
          type: form.type || 'public',
          name: form.name || '',
          slug: form.slug || '',
          defaultChannelName: form.defaultChannelName || 'general',
          description: form.description || '',
          image: form.image || '',
          banner: form.banner || '',
          moderators: parsePubkeyCsv(form.moderators || ''),
          admins: parsePubkeyCsv(form.admins || ''),
          topics: parseCsv(form.topics || ''),
          joinMode: form.joinMode || 'open',
          postingPolicy: form.postingPolicy || 'members',
          rules: parseLines(form.rules || ''),
          allowedRelays: parseCsv(form.allowedRelays || ''),
          discoverable: !!form.discoverable,
          includeAnnouncements: !!form.includeAnnouncements,
          includeForum: !!form.includeForum,
          includeStaff: !!form.includeStaff
        };

        const created = store.createCommunity(payload);
        if (!created.ok) {
          ui.createBusy = false;
          createCommunitySubmit.disabled = false;
          setStatus(created.reason === 'auth_required' ? 'Login required.' : 'Unable to create community.');
          return;
        }

        let finalStatus = 'Community created and published.';

        if (nostrBridge) {
          try {
            const publishedCommunity = await nostrBridge.publishCommunityCreate({
              ...payload,
              communityId: created.community.id,
              defaultChannelId: created.community.defaultChannelId
            });
            assertPublished(publishedCommunity, 'community metadata');

            if (created.community.type === 'private') {
              const members = (store.getState().data.membersByCommunity[created.community.id] || []).map((m) => m.pubkey);
              const rolesByPubkey = {};
              (store.getState().data.membersByCommunity[created.community.id] || []).forEach((m) => { rolesByPubkey[m.pubkey] = m.roles || ['member']; });
              const publishedMembers = await nostrBridge.publishCommunityMembers39002({
                communityId: created.community.id,
                members,
                rolesByPubkey,
                joinMode: created.community.joinMode
              });
              assertPublished(publishedMembers, 'private group members (39002)');
              const publishedMods = await nostrBridge.publishCommunityModerators39003({
                communityId: created.community.id,
                moderators: created.community.moderatorPubkeys || [],
                admins: created.community.adminPubkeys || [],
                postingPolicy: created.community.postingPolicy
              });
              assertPublished(publishedMods, 'private group moderators (39003)');
            }

            for (let i = 0; i < created.channels.length; i += 1) {
              const channel = created.channels[i];
              const publishedChannel = await nostrBridge.publishChannelCreate({
                communityId: created.community.id,
                channelId: channel.id,
                name: channel.name,
                category: channel.category,
                topic: channel.topic,
                channelType: channel.channelType,
                privacyLevel: channel.privacyLevel,
                slowModeSec: channel.slowModeSec
              });
              assertPublished(publishedChannel, `channel "${channel.name}"`);
            }

            const membershipPublish = await publishMembershipList();
            if (!membershipPublish.ok) {
              finalStatus = 'Community created, but membership sync to relays failed.';
            }
          } catch (err) {
            store.removeCommunity(created.community.id, { source: 'rollback' });
            ui.createBusy = false;
            createCommunitySubmit.disabled = false;
            ui.createRoleSearch = { moderators: '', admins: '' };
            setStatus((err && err.message) ? err.message : 'Community was not published to relays.');
            return;
          }
        } else {
          finalStatus = 'Community created locally only.';
        }

        ui.createBusy = false;
        createCommunitySubmit.disabled = false;
        ui.createDraft = null;
        ui.createRoleSearch = { moderators: '', admins: '' };
        ui.openModal = '';
        render();
        setStatus(finalStatus);
      });
    }

    const saveSettingsBtn = root.querySelector('#scSaveCommunitySettingsBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', async () => {
        const state = store.getState();
        const community = store.getCommunity(state.activeCommunityId);
        if (!community) return;

        const patch = {
          name: (root.querySelector('#scSettingsName') || {}).value || community.title,
          description: (root.querySelector('#scSettingsDescription') || {}).value || '',
          image: (root.querySelector('#scSettingsImage') || {}).value || '',
          banner: (root.querySelector('#scSettingsBanner') || {}).value || '',
          moderatorPubkeys: parsePubkeyCsv((root.querySelector('#scSettingsModerators') || {}).value || ''),
          adminPubkeys: parsePubkeyCsv((root.querySelector('#scSettingsAdmins') || {}).value || ''),
          joinMode: (root.querySelector('#scSettingsJoinMode') || {}).value || community.joinMode,
          postingPolicy: (root.querySelector('#scSettingsPostingPolicy') || {}).value || community.postingPolicy,
          discoverable: !!((root.querySelector('#scSettingsDiscoverable') || {}).checked),
          rules: parseLines((root.querySelector('#scSettingsRules') || {}).value || ''),
          topics: parseCsv((root.querySelector('#scSettingsTopics') || {}).value || ''),
          allowedRelays: parseCsv((root.querySelector('#scSettingsRelays') || {}).value || '')
        };

        const updated = store.updateCommunity(community.id, patch);
        if (!updated.ok) {
          setStatus('Could not save settings.');
          return;
        }

        if (nostrBridge) {
          try {
            await nostrBridge.publishCommunityCreate({
              ...community,
              ...patch,
              communityId: community.id,
              slug: community.id.split(':')[1],
              name: patch.name,
              defaultChannelId: community.defaultChannelId,
              type: community.type
            });

            if (community.type === 'private') {
              const members = (store.getState().data.membersByCommunity[community.id] || []).map((m) => m.pubkey);
              const rolesByPubkey = {};
              (store.getState().data.membersByCommunity[community.id] || []).forEach((m) => { rolesByPubkey[m.pubkey] = m.roles || ['member']; });
              await nostrBridge.publishCommunityMembers39002({
                communityId: community.id,
                members,
                rolesByPubkey,
                joinMode: patch.joinMode
              });
              await nostrBridge.publishCommunityModerators39003({
                communityId: community.id,
                moderators: patch.moderatorPubkeys,
                admins: patch.adminPubkeys,
                postingPolicy: patch.postingPolicy
              });
            }
          } catch (_) {}
        }

        closeModalAndRerender();
        setStatus('Community settings updated.');
      });
    }

    const createChannelSubmit = root.querySelector('#scCreateChannelSubmit');
    if (createChannelSubmit) {
      createChannelSubmit.addEventListener('click', async () => {
        const state = store.getState();
        const payload = {
          communityId: state.activeCommunityId,
          name: (root.querySelector('#scCreateChannelName') || {}).value || '',
          category: (root.querySelector('#scCreateChannelCategory') || {}).value || 'Channels',
          topic: (root.querySelector('#scCreateChannelTopic') || {}).value || '',
          channelType: (root.querySelector('#scCreateChannelType') || {}).value || 'public',
          privacyLevel: (root.querySelector('#scCreateChannelPrivacy') || {}).value || 'public',
          slowModeSec: Number((root.querySelector('#scCreateChannelSlow') || {}).value || 0)
        };

        const created = store.createChannel(payload);
        if (!created.ok) {
          setStatus('Unable to create channel.');
          return;
        }

        if (nostrBridge) {
          try {
            await nostrBridge.publishChannelCreate({
              communityId: payload.communityId,
              channelId: created.channel.id,
              name: created.channel.name,
              category: created.channel.category,
              topic: created.channel.topic,
              channelType: created.channel.channelType,
              privacyLevel: created.channel.privacyLevel,
              slowModeSec: created.channel.slowModeSec
            });
          } catch (_) {}
        }

        ui.openModal = '';
        render();
        setStatus('Channel created.');
      });
    }

    const saveChannelBtn = root.querySelector('#scSaveChannelSettingsBtn');
    if (saveChannelBtn) {
      saveChannelBtn.addEventListener('click', async () => {
        const channel = store.getChannel();
        if (!channel) return;

        const patch = {
          name: (root.querySelector('#scChannelName') || {}).value || channel.name,
          category: (root.querySelector('#scChannelCategory') || {}).value || channel.category,
          topic: (root.querySelector('#scChannelTopic') || {}).value || channel.topic,
          privacyLevel: (root.querySelector('#scChannelPrivacy') || {}).value || channel.privacyLevel,
          channelType: (root.querySelector('#scChannelType') || {}).value || channel.channelType,
          slowModeSec: Number((root.querySelector('#scChannelSlow') || {}).value || channel.slowModeSec || 0)
        };

        const updated = store.updateChannel(channel.id, patch);
        if (!updated.ok) {
          setStatus('Could not save channel settings.');
          return;
        }

        if (nostrBridge) {
          try {
            await nostrBridge.publishChannelCreate({
              communityId: updated.channel.communityId,
              channelId: updated.channel.id,
              name: updated.channel.name,
              category: updated.channel.category,
              topic: updated.channel.topic,
              channelType: updated.channel.channelType,
              privacyLevel: updated.channel.privacyLevel,
              slowModeSec: updated.channel.slowModeSec
            });
          } catch (_) {}
        }

        ui.openModal = '';
        render();
        setStatus('Channel updated.');
      });
    }

    const memberToggle = root.querySelector('#scToggleMembersBtn');
    if (memberToggle) {
      memberToggle.addEventListener('click', () => {
        ui.memberPanelOpen = !ui.memberPanelOpen;
        render();
      });
    }

    if (!outsideClickListenerBound) {
      document.addEventListener('click', onOutsideClick);
      outsideClickListenerBound = true;
    }
  }

  function onOutsideClick(event) {
    const inMenu = event.target && event.target.closest && event.target.closest('[data-context-menu]');
    const inPopout = event.target && event.target.closest && event.target.closest('#scProfilePopout');
    let changed = false;
    if (ui.contextMessageId && !inMenu) {
      ui.contextMessageId = '';
      changed = true;
    }
    if (ui.selectedMember && !inPopout) {
      ui.selectedMember = '';
      changed = true;
    }
    if (changed) render();
  }

  function mount() {
    if (mounted) return;
    mounted = true;
    render();
    dispose = store.subscribe((evt) => {
      if (!shouldRenderForStoreEvent(evt)) return;
      requestRender();
    });
  }

  function unmount() {
    if (!mounted) return;
    mounted = false;
    disconnectDiscoveryObserver();
    if (toastTimer) {
      window.clearTimeout(toastTimer);
      toastTimer = null;
    }
    renderQueued = false;
    if (outsideClickListenerBound) {
      document.removeEventListener('click', onOutsideClick);
      outsideClickListenerBound = false;
    }
    if (dispose) dispose();
    dispose = null;
    root.innerHTML = '';
  }

  return {
    mount,
    unmount,
    rerender: render,
    setSession
  };
}


















