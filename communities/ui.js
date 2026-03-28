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

function isRoomChannel(channel) {
  const type = String(channel && channel.channelType || '').trim().toLowerCase();
  return type === 'voice' || type === 'video' || type === 'stage';
}

function channelTypeLabel(type) {
  const key = String(type || '').trim().toLowerCase();
  if (key === 'announcement') return 'Announcement';
  if (key === 'forum') return 'Forum';
  if (key === 'private') return 'Private';
  if (key === 'voice') return 'Voice Room';
  if (key === 'video') return 'Video Room';
  if (key === 'stage') return 'Stage Room';
  return 'Text Channel';
}

function roomProviderLabel(provider) {
  const key = String(provider || '').trim().toLowerCase();
  if (key === 'nostrnests') return 'NostrNests';
  if (key === 'hivetalk') return 'HiveTalk';
  if (key === 'external') return 'Custom Room';
  return 'Nostr Room';
}

function roomStatusLabel(status) {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'live') return 'Live';
  if (key === 'ended') return 'Ended';
  if (key === 'inactive') return 'Inactive';
  return 'Planned';
}

function fmtDateTime(ts) {
  const date = new Date(Number(ts || 0));
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function datetimeLocalValue(ts) {
  const date = new Date(Number(ts || 0));
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseDateTimeLocalValue(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roomJoinUrl(channel, community, viewerName = '') {
  if (!channel || !isRoomChannel(channel)) return '';
  const direct = String(channel.roomUrl || '').trim();
  if (direct) return direct;

  const naddr = String(channel.roomNaddr || '').trim();
  const provider = String(channel.roomProvider || community && community.defaultRoomProvider || 'native_nostr').trim().toLowerCase();
  if (naddr) return `https://njump.me/${encodeURIComponent(naddr)}`;

  if (provider === 'hivetalk') {
    const base = String((community && community.hiveTalkUrl) || 'https://vanilla.hivetalk.org').trim().replace(/\/+$/, '');
    const roomId = slugify(String(channel.roomId || channel.id || channel.name || 'room').trim());
    if (!base || !roomId) return '';
    try {
      const url = new URL('/join', base);
      url.searchParams.set('room', roomId);
      if (viewerName) url.searchParams.set('name', viewerName);
      url.searchParams.set('audio', '1');
      url.searchParams.set('video', channel.channelType === 'voice' ? '0' : '1');
      url.searchParams.set('notify', '0');
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  return '';
}

async function copyTextToClipboard(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {
    // Fall through to the DOM-based fallback when clipboard permissions are blocked.
  }

  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', 'readonly');
    field.style.position = 'fixed';
    field.style.top = '-9999px';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.focus();
    field.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(field);
    return !!copied;
  } catch (_) {
    return false;
  }
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
  const fallbackPubkey = member && member.pubkey ? member.pubkey : '';
  const name = String((profile && (profile.displayName || profile.name)) || '').trim()
    || shortPubkey(fallbackPubkey, 10, 8)
    || 'Member';
  return `${name} - ${role}`;
}

function highestRole(roleIds = []) {
  const roles = Array.isArray(roleIds) ? roleIds : [];
  if (roles.includes('owner')) return 'owner';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('moderator')) return 'moderator';
  if (roles.includes('member')) return 'member';
  return 'guest';
}

function settingsRoleSummary(role = 'guest') {
  const key = String(role || 'guest').toLowerCase();
  if (key === 'owner') {
    return {
      label: 'Owner',
      hint: 'Full community control, including server settings and delete group.'
    };
  }
  if (key === 'admin') {
    return {
      label: 'Admin',
      hint: 'Can manage channels and roles, but owner-only server settings are locked.'
    };
  }
  if (key === 'moderator') {
    return {
      label: 'Moderator',
      hint: 'Can moderate members and channels, but server settings are read-only.'
    };
  }
  if (key === 'member') {
    return {
      label: 'Member',
      hint: 'Can read community details and leave the group.'
    };
  }
  return {
    label: 'Guest',
    hint: 'Join this community to participate.'
  };
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
  const { root, store, nostrBridge } = input;
  const initialAppContext = input.appContext || null;

  function getAppContext() {
    if (typeof window !== 'undefined' && window.__SIFAKA_CONTEXT && typeof window.__SIFAKA_CONTEXT === 'object') {
      return window.__SIFAKA_CONTEXT;
    }
    return initialAppContext;
  }

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
    settingsDraft: null,
    createRoleSearch: { moderators: '', admins: '' },
    replyTargetByChannel: new Map(),
    discoveryLoading: false,
    attachUploadPending: false,
    attachUploadProgress: 0,
    nip05LookupRequested: new Set(),
    lastRouteKey: ''
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
      includeStaff: true,
      includeVoiceLounge: true,
      includeVideoRoom: true,
      includeStageRoom: false,
      defaultRoomProvider: 'native_nostr',
      nostrNestsUrl: 'https://nostrnests.com',
      hiveTalkUrl: 'https://vanilla.hivetalk.org'
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
      includeStaff: !!((root.querySelector('#scCreateIncludeStaff') || {}).checked),
      includeVoiceLounge: !!((root.querySelector('#scCreateIncludeVoiceLounge') || {}).checked),
      includeVideoRoom: !!((root.querySelector('#scCreateIncludeVideoRoom') || {}).checked),
      includeStageRoom: !!((root.querySelector('#scCreateIncludeStageRoom') || {}).checked),
      defaultRoomProvider: (root.querySelector('#scCreateDefaultRoomProvider') || {}).value || 'native_nostr',
      nostrNestsUrl: (root.querySelector('#scCreateNostrNestsUrl') || {}).value || 'https://nostrnests.com',
      hiveTalkUrl: (root.querySelector('#scCreateHiveTalkUrl') || {}).value || 'https://vanilla.hivetalk.org'
    };

    return ui.createDraft;
  }

  function defaultCommunitySettingsDraft(community) {
    if (!community) return null;
    return {
      communityId: community.id,
      name: String(community.title || ''),
      description: String(community.description || ''),
      image: normalizeAvatarUrl(community.image || community.banner || ''),
      moderators: String((community.moderatorPubkeys || []).join(', ')),
      admins: String((community.adminPubkeys || []).join(', ')),
      joinMode: String(community.joinMode || 'open'),
      postingPolicy: String(community.postingPolicy || 'members'),
      discoverable: !!community.discoverable,
      rules: String((community.rules || []).join('\n')),
      topics: String((community.topics || []).join(', ')),
      allowedRelays: String((community.allowedRelays || []).join(', ')),
      defaultRoomProvider: String(community.defaultRoomProvider || 'native_nostr'),
      nostrNestsUrl: String(community.nostrNestsUrl || 'https://nostrnests.com'),
      hiveTalkUrl: String(community.hiveTalkUrl || 'https://vanilla.hivetalk.org')
    };
  }

  function ensureCommunitySettingsDraft(community) {
    if (!community) return null;
    if (!ui.settingsDraft || ui.settingsDraft.communityId !== community.id) {
      ui.settingsDraft = defaultCommunitySettingsDraft(community);
    }
    return ui.settingsDraft;
  }

  function syncCommunitySettingsDraftFromDom() {
    if (ui.openModal !== 'communitySettings') return ui.settingsDraft;
    const state = store.getState();
    const community = store.getCommunity(state.activeCommunityId);
    if (!community) return null;
    const current = ensureCommunitySettingsDraft(community) || defaultCommunitySettingsDraft(community);
    ui.settingsDraft = {
      ...current,
      communityId: community.id,
      name: (root.querySelector('#scSettingsName') || {}).value || '',
      description: (root.querySelector('#scSettingsDescription') || {}).value || '',
      image: (root.querySelector('#scSettingsImage') || {}).value || '',
      moderators: (root.querySelector('#scSettingsModerators') || {}).value || '',
      admins: (root.querySelector('#scSettingsAdmins') || {}).value || '',
      joinMode: (root.querySelector('#scSettingsJoinMode') || {}).value || 'open',
      postingPolicy: (root.querySelector('#scSettingsPostingPolicy') || {}).value || 'members',
      discoverable: !!((root.querySelector('#scSettingsDiscoverable') || {}).checked),
      rules: (root.querySelector('#scSettingsRules') || {}).value || '',
      topics: (root.querySelector('#scSettingsTopics') || {}).value || '',
      allowedRelays: (root.querySelector('#scSettingsRelays') || {}).value || '',
      defaultRoomProvider: (root.querySelector('#scSettingsDefaultRoomProvider') || {}).value || 'native_nostr',
      nostrNestsUrl: (root.querySelector('#scSettingsNostrNestsUrl') || {}).value || 'https://nostrnests.com',
      hiveTalkUrl: (root.querySelector('#scSettingsHiveTalkUrl') || {}).value || 'https://vanilla.hivetalk.org'
    };
    return ui.settingsDraft;
  }

  function resolveCommunitySettingsAccess(community, stateSnapshot = null) {
    if (!community) {
      return {
        role: 'guest',
        roleLabel: 'Guest',
        roleHint: 'Join this community to participate.',
        isOwner: false,
        canManageServer: false,
        canManageRoles: false,
        canManageChannels: false,
        canLeave: false
      };
    }

    const state = stateSnapshot || store.getState();
    const roleIds = store.getMemberRoles(community.id, state.currentUserPubkey) || [];
    const role = highestRole(roleIds);
    const roleInfo = settingsRoleSummary(role);
    const ownerPubkey = normalizePubkey(community.ownerPubkey || '');
    const currentPubkey = normalizePubkey(state.currentUserPubkey || '');
    const isOwner = role === 'owner' || (!!ownerPubkey && !!currentPubkey && ownerPubkey === currentPubkey);
    const canManageServer = isOwner || store.can('manage_server', null, community);
    const canManageRoles = store.can('manage_roles', null, community);
    const canManageChannels = store.can('manage_channels', null, community);
    const joinedCommunityIds = new Set(state.joinedCommunityIds || []);
    return {
      role,
      roleLabel: roleInfo.label,
      roleHint: roleInfo.hint,
      isOwner,
      canManageServer,
      canManageRoles,
      canManageChannels,
      canLeave: joinedCommunityIds.has(community.id)
    };
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
    const prevPubkey = String((ui.session.user && ui.session.user.pubkey) || '').trim();
    const nextPubkey = String((next.user && next.user.pubkey) || '').trim();
    const authChanged = (!!next.isAuthenticated !== !!ui.session.isAuthenticated) || prevPubkey !== nextPubkey;
    ui.session = {
      user: next.user || null,
      isAuthenticated: !!next.isAuthenticated
    };
    if (authChanged) ui.lastRouteKey = '';
  }

  function parseCommunitiesRouteFromLocation() {
    if (typeof window === 'undefined' || !window.location) {
      return { isCommunities: false, inviteToken: '', routeKey: '' };
    }

    const parts = String(window.location.pathname || '')
      .split('/')
      .filter(Boolean)
      .map((part) => {
        try { return decodeURIComponent(part || ''); } catch (_) { return part || ''; }
      })
      .map((part) => String(part || '').trim());

    if (!parts.length || parts[0].toLowerCase() !== 'communities') {
      return { isCommunities: false, inviteToken: '', routeKey: '' };
    }

    const inviteToken = parts[1] && parts[1].toLowerCase() === 'invite'
      ? String(parts[2] || '').trim()
      : '';

    return {
      isCommunities: true,
      inviteToken,
      routeKey: inviteToken ? `invite:${inviteToken}` : 'communities'
    };
  }

  function communityJoinAction(community, stateSnapshot, routeState = parseCommunitiesRouteFromLocation()) {
    const joinedCommunityIds = new Set((stateSnapshot && stateSnapshot.joinedCommunityIds) || []);
    const joined = !!(community && joinedCommunityIds.has(community.id));
    const requested = !!(community && store.hasPendingJoinRequest && store.hasPendingJoinRequest(community.id));
    const mode = community && store.getJoinMode ? store.getJoinMode(community) : 'open';
    const hasInvite = !!(community
      && routeState
      && routeState.inviteToken
      && store.inviteTokenMatchesCommunity
      && store.inviteTokenMatchesCommunity(routeState.inviteToken, community.id));

    if (joined) return { label: 'Open', joined: true, requested: false, mode, hasInvite };
    if (requested) return { label: 'Requested', joined: false, requested: true, mode, hasInvite };
    if (hasInvite) return { label: 'Join Invite', joined: false, requested: false, mode, hasInvite };
    if (mode === 'approval') return { label: 'Request', joined: false, requested: false, mode, hasInvite };
    if (mode === 'invite_only') return { label: 'Invite Only', joined: false, requested: false, mode, hasInvite };
    return { label: 'Join', joined: false, requested: false, mode, hasInvite };
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

  function normalizeProfileLookupKey(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[0-9a-f]{64}$/i.test(raw)) return raw.toLowerCase();
    if (/^npub1/i.test(raw) && nostrBridge && typeof nostrBridge.nip19Decode === 'function') {
      const decoded = nostrBridge.nip19Decode(raw);
      if (decoded && decoded.type === 'npub' && typeof decoded.data === 'string') {
        const hex = String(decoded.data || '').trim();
        if (/^[0-9a-f]{64}$/i.test(hex)) return hex.toLowerCase();
      }
    }
    return raw;
  }

  function normalizeAvatarUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\/\//.test(raw)) return `https:${raw}`;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) return `https://${raw}`;
    return '';
  }

  function displayNameForProfile(profile, pubkey = '') {
    const name = String((profile && (profile.displayName || profile.display_name || profile.name || profile.username)) || '').trim();
    if (name) return name;
    const key = normalizeProfileLookupKey(pubkey) || String(pubkey || '').trim();
    return shortPubkey(key, 12, 8) || 'Nostr User';
  }

  function normalizeProfileRecord(profile = {}, pubkey = '') {
    const normalizedPubkey = normalizeProfileLookupKey(pubkey || profile.pubkey || '');
    const avatar = normalizeAvatarUrl(profile.avatar || profile.picture || '');
    const displayName = String(profile.displayName || profile.display_name || profile.name || profile.username || '').trim();
    const nip05 = String(profile.nip05 || '').trim();
    const verifiedNip05Value = String(profile.verifiedNip05Value || '').trim();
    return {
      ...profile,
      pubkey: normalizedPubkey || String(profile.pubkey || pubkey || '').trim(),
      name: String(profile.name || displayName || '').trim(),
      displayName: displayName || String(profile.name || '').trim(),
      avatar,
      nip05,
      verifiedNip05: !!(profile.verifiedNip05 || verifiedNip05Value),
      verifiedNip05Value
    };
  }

  function resolveProfileRecord(profiles, pubkey, storeRef = store) {
    const raw = String(pubkey || '').trim();
    const normalized = normalizeProfileLookupKey(raw);
    const npub = (/^[0-9a-f]{64}$/i.test(normalized) ? toNpub(normalized) : (/^npub1/i.test(raw) ? raw : ''));
    const candidates = uniqueValues([raw, raw.toLowerCase(), normalized, npub]);
    let local = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const key = String(candidates[i] || '').trim();
      if (!key) continue;
      if (profiles && profiles[key]) {
        local = profiles[key];
        break;
      }
    }
    if (!local && storeRef && typeof storeRef.profile === 'function') {
      local = storeRef.profile(normalized || raw);
    }

    let external = null;
    const ctx = getAppContext();
    if (ctx && typeof ctx.getProfileByPubkey === 'function') {
      for (let i = 0; i < candidates.length; i += 1) {
        const key = String(candidates[i] || '').trim();
        if (!key) continue;
        const profile = ctx.getProfileByPubkey(key);
        if (profile && typeof profile === 'object') {
          external = profile;
          break;
        }
      }
    }

    return normalizeProfileRecord({
      ...(local || {}),
      ...(external || {})
    }, normalized || raw);
  }

  function verifiedNip05ForProfile(profile, pubkey = '') {
    const record = normalizeProfileRecord(profile || {}, pubkey);
    const key = normalizeProfileLookupKey(pubkey || record.pubkey || '');
    const claimed = String(record.nip05 || '').trim();
    if (record.verifiedNip05Value) return String(record.verifiedNip05Value);
    if (record.verifiedNip05 && claimed) return claimed;

    const ctx = getAppContext();
    if (ctx && typeof ctx.getVerifiedNip05ForPubkey === 'function' && key) {
      const verified = ctx.getVerifiedNip05ForPubkey(key, claimed);
      if (verified) return String(verified).trim();
    }

    if (ctx && typeof ctx.ensureNip05ForPubkey === 'function' && key && claimed) {
      const cacheKey = `${key}|${claimed.toLowerCase()}`;
      if (!ui.nip05LookupRequested.has(cacheKey)) {
        ui.nip05LookupRequested.add(cacheKey);
        Promise.resolve(ctx.ensureNip05ForPubkey(key, claimed))
          .then(() => requestRender())
          .catch(() => {});
      }
    }

    return '';
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

    if (ui.openModal === 'createCommunity' && ui.createBusy) {
      return false;
    }

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

    if (ui.openModal === 'communitySettings') {
      const alwaysRender = new Set(['user_changed', 'community_removed', 'community_selected']);
      if (alwaysRender.has(type)) return true;
      return false;
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
        const ctx = getAppContext();
        if (ctx && typeof ctx.openLogin === 'function') {
          ctx.openLogin();
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

  function joinResultMessage(result, community) {
    const title = community && community.title ? `"${community.title}"` : 'this community';
    if (!result || !result.ok) {
      if (result && result.reason === 'auth_required') return 'Login required to join communities.';
      if (result && result.reason === 'invite_required') return `Invite required to join ${title}. Open it from a valid invite link.`;
      if (result && result.reason === 'missing_community') return 'This community is unavailable right now.';
      return `Could not join ${title}.`;
    }
    if (result.requested) return `Join request saved locally for ${title}. A moderator still needs to approve you.`;
    if (result.alreadyJoined) return `Opened ${title}.`;
    return `Joined ${title}.`;
  }

  async function syncMembershipAfterJoin(community, options = {}) {
    const title = community && community.title ? `"${community.title}"` : 'this community';
    const membershipPublish = await publishMembershipList();
    if (!membershipPublish.ok) {
      return {
        ok: false,
        message: options.failureMessage || `Joined ${title} locally, but could not sync membership list to relays.`
      };
    }
    return {
      ok: true,
      message: options.successMessage || `Joined ${title}.`
    };
  }

  function processCommunitiesRouteIntent() {
    const routeState = parseCommunitiesRouteFromLocation();
    if (!routeState.routeKey || routeState.routeKey === ui.lastRouteKey) return routeState;
    ui.lastRouteKey = routeState.routeKey;

    if (!routeState.inviteToken || !store.resolveInviteToken) return routeState;

    const resolved = store.resolveInviteToken(routeState.inviteToken);
    if (!resolved.ok || !resolved.communityId) {
      setStatus('Invite link is invalid or unavailable.');
      return routeState;
    }

    const community = store.getCommunity(resolved.communityId) || resolved.community;
    if (community) store.setActiveCommunity(community.id);
    if (!ui.session.isAuthenticated || !community) return routeState;

    const joinResult = store.joinCommunity(community.id, {
      source: 'invite_link',
      acceptedInviteToken: routeState.inviteToken
    });
    if (!joinResult.ok) {
      setStatus(joinResultMessage(joinResult, community));
      return routeState;
    }
    if (joinResult.alreadyJoined || joinResult.requested) return routeState;

    Promise.resolve()
      .then(() => syncMembershipAfterJoin(community, {
        successMessage: `Joined "${community.title}" from invite.`,
        failureMessage: `Joined "${community.title}" from invite, but could not sync membership list to relays.`
      }))
      .then((result) => {
        if (result && result.message) setStatus(result.message);
      })
      .catch(() => {
        setStatus(`Joined "${community.title}" from invite, but could not sync membership list to relays.`);
      });

    return routeState;
  }

  function render() {
    try {
    const focusSnapshot = captureFocusSnapshot();
    processCommunitiesRouteIntent();
    if (!ui.session.isAuthenticated) {
      renderLoginGate();
      return;
    }

    const state = store.getState();
    const routeState = parseCommunitiesRouteFromLocation();
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
    const channels = community
      ? store.getChannels(community.id).filter((entry) => store.can('view_channels', entry, community))
      : [];
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
    const activeJoinAction = community ? communityJoinAction(community, state, routeState) : null;

    const railHtml = railCommunities.map((entry) => {
      const active = community && entry.id === community.id;
      const communityAvatar = normalizeAvatarUrl(entry.image || entry.icon || entry.banner || '');
      return `
        <button class="sc-server-pill${active ? ' active' : ''}" data-community="${esc(entry.id)}" title="${esc(entry.title)}">
          ${communityAvatar
            ? `<span class="sc-server-pill-media"><img src="${esc(communityAvatar)}" alt="${esc(entry.title)} icon" loading="lazy" referrerpolicy="no-referrer"></span>`
            : `<span>${esc(entry.icon || initials(entry.title))}</span>`}
        </button>
      `;
    }).join('');

    const roomPanelHtml = channel && isRoomChannel(channel)
      ? renderRoomPanel(channel, community, profiles, state)
      : '';

    const channelHtml = groupedChannels(channels).map(([category, items]) => `
      <section class="sc-category">
        <header>${esc(category)}</header>
        ${items.map((entry) => {
          const unread = Number(unreadByChannel.get(entry.id) || 0);
          const locked = entry.privacyLevel !== 'public';
          const room = isRoomChannel(entry);
          const roomStatus = room ? String(entry.roomStatus || 'planned').trim().toLowerCase() : '';
          return `
            <button class="sc-channel-btn${channel && entry.id === channel.id ? ' active' : ''}" data-channel="${esc(entry.id)}" title="${esc(entry.topic || '')}">
              <span class="sc-channel-name">${esc(room ? channelTypeLabel(entry.channelType) : '#')} ${esc(entry.name)}</span>
              <span class="sc-channel-meta">${locked ? 'private' : ''}${room && roomStatus === 'live' ? '<b>live</b>' : ''}${unread ? `<b>${unread}</b>` : ''}</span>
            </button>
          `;
        }).join('')}
      </section>
    `).join('');

    const memberHtml = members.map((member) => {
      const profileData = resolveProfileRecord(profiles, member.pubkey, store);
      const timedOut = member.timeoutUntil && Number(member.timeoutUntil) > Date.now();
      const memberName = displayNameForProfile(profileData, member.pubkey);
      const memberAvatar = normalizeAvatarUrl(profileData && profileData.avatar);
      const memberVerifiedNip05 = verifiedNip05ForProfile(profileData, member.pubkey);
      const hasMemberAvatar = !!memberAvatar;
      const memberAvatarClass = `sc-avatar${hasMemberAvatar ? ' has-image' : ''}${memberVerifiedNip05 ? ' nip05-square' : ''}`;
      const memberRoleFlags = `${(member.roles || ['guest']).join(', ')}${member.muted ? ' | muted' : ''}${timedOut ? ' | timeout' : ''}${member.banned ? ' | banned' : ''}`;
      return `
        <button class="sc-member-row" data-member="${esc(member.pubkey)}">
          <span class="${memberAvatarClass}"${hasMemberAvatar ? ` style="background-image:url('${esc(memberAvatar)}')"` : ''}>${hasMemberAvatar ? '' : esc(initials(memberName))}</span>
          <span class="sc-member-main">
            <strong>${esc(memberName)}${memberVerifiedNip05 ? `<span class="sc-nip05-badge" title="NIP-05: ${esc(memberVerifiedNip05)}">\u2713</span>` : ''}</strong>
            <small>${memberVerifiedNip05 ? `${esc(memberVerifiedNip05)} | ` : ''}${esc(memberRoleFlags)}</small>
          </span>
        </button>
      `;
    }).join('');

    const messageHtml = messages.map((message) => {
      const author = resolveProfileRecord(profiles, message.authorPubkey, store);
      const authorName = displayNameForProfile(author, message.authorPubkey);
      const authorAvatar = normalizeAvatarUrl(author && author.avatar);
      const authorVerifiedNip05 = verifiedNip05ForProfile(author, message.authorPubkey);
      const hasAuthorAvatar = !!authorAvatar;
      const authorAvatarClass = `sc-avatar${hasAuthorAvatar ? ' has-image' : ''}${authorVerifiedNip05 ? ' nip05-square' : ''}`;
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
          <button class="${authorAvatarClass}" data-member="${esc(message.authorPubkey)}"${hasAuthorAvatar ? ` style="background-image:url('${esc(authorAvatar)}')"` : ''}>${hasAuthorAvatar ? '' : esc(initials(authorName))}</button>
          <div class="sc-message-main">
            <header class="sc-message-head">
              <div class="sc-message-head-meta">
                <button class="sc-author" data-member="${esc(message.authorPubkey)}">${esc(authorName)}</button>
                ${authorVerifiedNip05 ? `<span class="sc-nip05-badge" title="NIP-05: ${esc(authorVerifiedNip05)}">\u2713</span>` : ''}
                <time>${esc(fmtTime(message.createdAt))}</time>
                ${authorVerifiedNip05 ? `<span class="sc-nip05">${esc(authorVerifiedNip05)}</span>` : ''}
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
    const ctx = getAppContext();
    const attachAccept = (ctx && typeof ctx.getUploadAccept === 'function')
      ? String(ctx.getUploadAccept() || '').trim()
      : '';
    const effectiveAttachAccept = attachAccept || 'image/*,video/*,audio/*';
    const attachLabel = ui.attachUploadPending
      ? `Uploading${ui.attachUploadProgress > 0 ? ` ${ui.attachUploadProgress}%` : '...'}`
      : 'Attach';
    const communityBanner = normalizeAvatarUrl(community && (community.image || community.banner || community.icon) || '');

    root.innerHTML = `
      <div class="sc-wrap${hasJoinedCommunities ? '' : ' sc-wrap-empty'}" id="scWrap">
        <aside class="sc-server-rail">
          <button class="sc-server-add sc-server-add-primary" id="scCreateCommunityBtn" title="Create community">+</button>
          <div class="sc-server-list">${railHtml}</div>
        </aside>

        <aside class="sc-channel-col${hasJoinedCommunities ? '' : ' sc-channel-col-empty'}">
          ${hasJoinedCommunities ? `
            <header class="sc-channel-head">
              ${communityBanner
                ? `<div class="sc-channel-head-banner"><img src="${esc(communityBanner)}" alt="${esc(community ? community.title : 'Community')} banner" loading="lazy" referrerpolicy="no-referrer"></div>`
                : ''}
              <div class="sc-channel-head-row">
                <div>
                  <h2>${esc(community ? community.title : 'Communities')}</h2>
                  <p>${community ? esc(community.type === 'private' ? 'Private Group / NIP-29' : 'Public Community / NIP-72') : 'No active community selected'}</p>
                  <p>${connectedRelays} relay${connectedRelays === 1 ? '' : 's'} connected</p>
                </div>
                <button id="scServerSettingsBtn" ${community ? '' : 'disabled'}>Settings</button>
              </div>
            </header>

            <div class="sc-channel-search">
              <input id="scSearchInput" value="${esc(state.searchTerm)}" placeholder="Search messages or channels" />
            </div>

            <div class="sc-channel-list">${community ? (channelHtml || '<div class="sc-empty">No channels yet.</div>') : '<div class="sc-empty">Select a community.</div>'}</div>

            <footer class="sc-channel-footer">
              <button id="scInviteBtn" ${community ? '' : 'disabled'}>Invite</button>
              <button id="scJoinLeaveBtn" ${community && !joinedCommunityIds.has(community.id) && !(activeJoinAction && activeJoinAction.requested) ? '' : 'disabled'}>${community && joinedCommunityIds.has(community.id) ? 'Joined' : esc(activeJoinAction ? activeJoinAction.label : 'Join')}</button>
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
                   <button id="scJoinRoomBtn" ${(channel && isRoomChannel(channel) && roomJoinUrl(channel, community, displayNameForProfile(store.profile(state.currentUserPubkey), state.currentUserPubkey))) ? '' : 'disabled'}>${channel && isRoomChannel(channel) ? 'Join Room' : 'Room'}</button>
                   <button id="scChannelSettingsBtn" ${(channel && store.can('manage_channels', channel, community)) ? '' : 'disabled'}>Channel Settings</button>
                   <button id="scNotifBtn">Notifications${notificationUnread ? ` (${notificationUnread})` : ''}</button>`
                : ``}
            </div>
          </header>

          ${hasJoinedCommunities
            ? `<section class="sc-feed" id="scFeed">${roomPanelHtml}${messageHtml || '<div class="sc-empty">No messages yet.</div>'}</section>

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
                   <small>${channel
                     ? (store.can('post_messages', channel, community)
                       ? (isRoomChannel(channel)
                         ? 'Room backchannel is ready on Nostr. Join the linked room for live audio or video.'
                         : 'Ready to publish via Nostr relays')
                       : 'You do not have permission to post in this channel')
                     : 'Pick a channel to start typing'}</small>
                   <button id="scSendBtn" ${(channel && store.can('post_messages', channel, community)) ? '' : 'disabled'}>Send</button>
                 </div>
                 ${ui.emojiOpen ? `<div class="sc-emoji-pop" id="scEmojiPop">${['😀', '😂', '🔥', '⚡', '💜', '🚀', '👏', '❤️', '🤝', '🎉'].map((emoji) => `<button data-emoji="${esc(emoji)}">${esc(emoji)}</button>`).join('')}</div>` : ''}
               </section>`
            : `<section class="sc-feed">
                 <div class="sc-empty sc-empty-onboard">
                   <strong>Ready to start your community space?</strong>
                   <p>Set up your own community in minutes, or explore public communities and jump into live conversations.</p>
                   <div class="sc-empty-onboard-actions">
                      <button id="scOpenCommunityHubBtn" class="sc-onboard-btn">Create</button>
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
        ${ui.openModal ? renderModal(ui.openModal, state, community, channel, members, profiles, store, suggestions, publicCommunities, routeState) : ''}
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
    const profile = resolveProfileRecord(profiles, pubkey, storeRef);
    const member = (members || []).find((entry) => entry.pubkey === pubkey) || { roles: ['guest'] };
    const avatar = normalizeAvatarUrl(profile && profile.avatar);
    const hasAvatar = !!avatar;
    const name = displayNameForProfile(profile, pubkey);
    const verifiedNip05 = verifiedNip05ForProfile(profile, pubkey);
    const avatarClass = `sc-avatar big${hasAvatar ? ' has-image' : ''}${verifiedNip05 ? ' nip05-square' : ''}`;
    const stateSnapshot = storeRef && typeof storeRef.getState === 'function' ? storeRef.getState() : {};
    const currentUserPubkey = normalizePubkey((stateSnapshot && stateSnapshot.currentUserPubkey) || '');
    const memberPubkey = normalizePubkey(pubkey);
    const isSelf = !!(currentUserPubkey && memberPubkey && currentUserPubkey === memberPubkey);
    const canModerate = !!(community && storeRef.can('mute_timeout_ban', null, community)) && !isSelf;
    const canManageRoles = !!(community && storeRef.can('manage_roles', null, community)) && !isSelf;
    const ctx = getAppContext();
    const isFollowing = !!(ctx && typeof ctx.isFollowingPubkey === 'function' && ctx.isFollowingPubkey(pubkey));

    return `
      <div class="sc-popout" id="scProfilePopout">
        <button class="sc-popout-close" data-close="member">x</button>
        <div class="sc-pop-head">
          <span class="${avatarClass}"${hasAvatar ? ` style="background-image:url('${esc(avatar)}')"` : ''}>${hasAvatar ? '' : esc(initials(name))}</span>
          <div>
            <h5>${esc(name)}${verifiedNip05 ? `<span class="sc-nip05-badge" title="NIP-05: ${esc(verifiedNip05)}">\u2713</span>` : ''}</h5>
            <small>${esc(roleLabel(profile, member))}</small>
          </div>
        </div>
        <p>${esc(profile.bio || '')}</p>
        <div class="sc-pop-meta">
          <span>${verifiedNip05 ? '[verified]' : '[unverified]'} ${esc(verifiedNip05 || profile.nip05 || 'No NIP-05')}</span>
          <span>${esc(community ? community.id : '')}</span>
        </div>
        <div class="sc-pop-actions">
          <button data-profile-action="view" data-member="${esc(pubkey)}">View Profile</button>
          ${!isSelf && ctx && typeof ctx.openMessagesWithPubkey === 'function' ? `<button data-profile-action="message" data-member="${esc(pubkey)}">Message</button>` : ''}
          ${!isSelf && ctx && typeof ctx.toggleFollowPubkey === 'function' ? `<button data-profile-action="follow" data-member="${esc(pubkey)}">${isFollowing ? 'Following' : 'Follow'}</button>` : ''}
          ${!isSelf && ctx && typeof ctx.zapPubkey === 'function' ? `<button data-profile-action="zap" data-member="${esc(pubkey)}">Zap</button>` : ''}
          ${canModerate ? `<button data-member-action="mute" data-member="${esc(pubkey)}">Mute</button>` : ''}
          ${canModerate ? `<button data-member-action="timeout_5m" data-member="${esc(pubkey)}">Timeout</button>` : ''}
          ${canModerate ? `<button data-member-action="ban" data-member="${esc(pubkey)}">Ban</button>` : ''}
          ${canManageRoles ? `<button data-member-action="roles" data-member="${esc(pubkey)}">Roles</button>` : ''}
        </div>
      </div>
    `;
  }

  function renderRoomPanel(channel, community, profiles, stateSnapshot) {
    if (!channel || !community || !isRoomChannel(channel)) return '';
    const roomHostPubkey = String(channel.roomHostPubkey || community.ownerPubkey || '').trim();
    const hostProfile = roomHostPubkey ? resolveProfileRecord(profiles, roomHostPubkey, store) : null;
    const hostName = roomHostPubkey ? displayNameForProfile(hostProfile, roomHostPubkey) : 'Community host';
    const viewerProfile = stateSnapshot && stateSnapshot.currentUserPubkey
      ? resolveProfileRecord(profiles, stateSnapshot.currentUserPubkey, store)
      : null;
    const viewerName = viewerProfile ? displayNameForProfile(viewerProfile, stateSnapshot.currentUserPubkey) : '';
    const joinUrl = roomJoinUrl(channel, community, viewerName);
    const roomStatus = String(channel.roomStatus || 'planned').trim().toLowerCase();
    const schedule = [];
    if (channel.roomStartsAt) schedule.push(`Starts ${fmtDateTime(channel.roomStartsAt)}`);
    if (channel.roomEndsAt) schedule.push(`Ends ${fmtDateTime(channel.roomEndsAt)}`);
    const speakerPubkeys = uniqueValues([
      ...(Array.isArray(channel.roomSpeakers) ? channel.roomSpeakers : []),
      ...(roomHostPubkey ? [roomHostPubkey] : [])
    ]);
    const speakerHtml = speakerPubkeys.map((pubkey) => {
      const speakerProfile = resolveProfileRecord(profiles, pubkey, store);
      return `<button class="sc-room-chip" type="button" data-member="${esc(pubkey)}">${esc(displayNameForProfile(speakerProfile, pubkey))}</button>`;
    }).join('');

    return `
      <section class="sc-room-panel sc-room-${esc(roomStatus)}">
        <header class="sc-room-panel-head">
          <div>
            <strong>${esc(channelTypeLabel(channel.channelType))}</strong>
            <small>${esc(roomProviderLabel(channel.roomProvider || community.defaultRoomProvider || 'native_nostr'))} | ${esc(roomStatusLabel(roomStatus))}</small>
          </div>
          <div class="sc-room-panel-stats">
            ${channel.roomCurrentParticipants ? `<span>${esc(String(channel.roomCurrentParticipants))} live now</span>` : ''}
            ${channel.roomTotalParticipants ? `<span>${esc(String(channel.roomTotalParticipants))} total</span>` : ''}
          </div>
        </header>
        <div class="sc-room-panel-body">
          <p>${esc(channel.topic || 'Join the linked room for live audio or video and keep text chat here on Nostr.')}</p>
          <div class="sc-room-meta">
            <span>Host: ${esc(hostName)}</span>
            ${channel.roomId ? `<span>Room ID: ${esc(channel.roomId)}</span>` : ''}
            ${schedule.map((entry) => `<span>${esc(entry)}</span>`).join('')}
          </div>
          ${speakerHtml ? `<div class="sc-room-speakers"><strong>Speakers</strong><div class="sc-room-chip-row">${speakerHtml}</div></div>` : ''}
          <div class="sc-room-actions">
            <button type="button" data-room-action="join" data-room-url="${esc(joinUrl)}" ${joinUrl ? '' : 'disabled'}>${joinUrl ? 'Join Room' : 'Add Room Link'}</button>
            <button type="button" data-room-action="copy" data-room-url="${esc(joinUrl)}" ${joinUrl ? '' : 'disabled'}>Copy Link</button>
            ${channel.roomNaddr ? `<button type="button" data-room-action="copy-naddr" data-room-naddr="${esc(channel.roomNaddr)}">Copy naddr</button>` : ''}
          </div>
        </div>
      </section>
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
        const profile = resolveProfileRecord(profiles, pubkey, store);
        const npub = toNpub(pubkey);
        const name = displayNameForProfile(profile, pubkey);
        const avatar = normalizeAvatarUrl(profile && profile.avatar);
        const haystack = [
          name,
          (profile && profile.name) || '',
          (profile && profile.displayName) || '',
          npub,
          pubkey
        ].join(' ').toLowerCase();
        return {
          pubkey,
          npub,
          name,
          avatar,
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

          <section class="sc-create-section">
            <h5>Room Integrations</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Default room provider
                <select id="scCreateDefaultRoomProvider">
                  <option value="native_nostr" ${draft.defaultRoomProvider === 'native_nostr' ? 'selected' : ''}>Nostr-native room metadata</option>
                  <option value="nostrnests" ${draft.defaultRoomProvider === 'nostrnests' ? 'selected' : ''}>NostrNests</option>
                  <option value="hivetalk" ${draft.defaultRoomProvider === 'hivetalk' ? 'selected' : ''}>HiveTalk</option>
                  <option value="external" ${draft.defaultRoomProvider === 'external' ? 'selected' : ''}>Custom external room</option>
                </select>
              </label>
              <label>NostrNests base URL
                <input id="scCreateNostrNestsUrl" value="${esc(draft.nostrNestsUrl)}" placeholder="https://nostrnests.com">
                <small>Used for room discovery and join handoff when you attach Nostr room addresses.</small>
              </label>
              <label>HiveTalk base URL
                <input id="scCreateHiveTalkUrl" value="${esc(draft.hiveTalkUrl)}" placeholder="https://vanilla.hivetalk.org">
                <small>Voice and video rooms can generate direct HiveTalk join links from this base.</small>
              </label>
            </div>
          </section>

          <div class="sc-check-grid">
            <label><input type="checkbox" id="scCreateDiscoverable" ${draft.discoverable ? 'checked' : ''}> Show in public discovery</label>
            <label><input type="checkbox" id="scCreateIncludeAnnouncements" ${draft.includeAnnouncements ? 'checked' : ''}> Add #announcements channel</label>
            <label><input type="checkbox" id="scCreateIncludeForum" ${draft.includeForum ? 'checked' : ''}> Add #forum channel</label>
            <label><input type="checkbox" id="scCreateIncludeStaff" ${draft.includeStaff ? 'checked' : ''}> Add private #staff channel</label>
            <label><input type="checkbox" id="scCreateIncludeVoiceLounge" ${draft.includeVoiceLounge ? 'checked' : ''}> Add lounge voice room</label>
            <label><input type="checkbox" id="scCreateIncludeVideoRoom" ${draft.includeVideoRoom ? 'checked' : ''}> Add video room</label>
            <label><input type="checkbox" id="scCreateIncludeStageRoom" ${draft.includeStageRoom ? 'checked' : ''}> Add stage room</label>
          </div>

          <div class="sc-modal-foot">
            <button data-close="modal">Cancel</button>
            <button id="scCreateCommunitySubmit" ${ui.createBusy ? 'disabled' : ''}>${ui.createBusy ? 'Creating...' : 'Create Community'}</button>
          </div>
        </div>
      </div>
    `;
  }
function renderCommunitySettingsModal(community) {
    const draft = ensureCommunitySettingsDraft(community) || defaultCommunitySettingsDraft(community);
    const access = resolveCommunitySettingsAccess(community, store.getState());
    const readOnly = !access.canManageServer;
    const disableAttr = readOnly ? 'disabled' : '';
    const saveButton = access.canManageServer
      ? '<button id="scSaveCommunitySettingsBtn">Save Settings</button>'
      : '<button class="sc-settings-owner-only" type="button" disabled>Owner Settings Only</button>';
    const footerCopy = access.canManageServer
      ? 'Changes are published to relays after saving.'
      : 'Server settings are read-only for your role.';

    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide sc-community-settings-modal">
          <h4>Community Settings</h4>
          <p>Update identity, branding, moderation, and discovery settings.</p>
          <div class="sc-settings-access sc-role-${esc(access.role)}">
            <strong>${esc(access.roleLabel)} Access</strong>
            <small>${esc(access.roleHint)}${readOnly ? ' Ask the community owner to apply server-level changes.' : ''}</small>
          </div>

          <section class="sc-create-section">
            <h5>Basics</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Community name
                <input id="scSettingsName" value="${esc(draft.name || '')}" placeholder="Community name" ${disableAttr}>
              </label>
              <label>How people join
                <select id="scSettingsJoinMode" ${disableAttr}>
                  <option value="open" ${draft.joinMode === 'open' ? 'selected' : ''}>Anyone can join</option>
                  <option value="approval" ${draft.joinMode === 'approval' ? 'selected' : ''}>Request + approval</option>
                  <option value="invite_only" ${draft.joinMode === 'invite_only' ? 'selected' : ''}>Invite only</option>
                </select>
              </label>
              <label>Who can post
                <select id="scSettingsPostingPolicy" ${disableAttr}>
                  <option value="members" ${draft.postingPolicy === 'members' ? 'selected' : ''}>Members</option>
                  <option value="moderators" ${draft.postingPolicy === 'moderators' ? 'selected' : ''}>Moderators only</option>
                  <option value="admins" ${draft.postingPolicy === 'admins' ? 'selected' : ''}>Admins only</option>
                </select>
              </label>
              <label class="sc-inline-check"><input type="checkbox" id="scSettingsDiscoverable" ${draft.discoverable ? 'checked' : ''} ${disableAttr}> Show community in public discovery</label>
              <label class="full">Description
                <textarea id="scSettingsDescription" placeholder="What is this community about?" ${disableAttr}>${esc(draft.description || '')}</textarea>
              </label>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Branding</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Image URL
                <input id="scSettingsImage" value="${esc(draft.image || '')}" placeholder="https://example.com/community-image.jpg" ${disableAttr}>
                <small>Square image recommended.</small>
              </label>
              <div id="scSettingsImagePreview" class="sc-url-preview">${renderCreateImagePreview(draft.image || '', 'Community image')}</div>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Team</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label class="full">Moderators (comma separated npub or hex)
                <input id="scSettingsModerators" value="${esc(draft.moderators || '')}" placeholder="npub1..., npub1..." ${disableAttr}>
              </label>
              <label class="full">Admins (comma separated npub or hex)
                <input id="scSettingsAdmins" value="${esc(draft.admins || '')}" placeholder="npub1..., npub1..." ${disableAttr}>
              </label>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Rules and Relays</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label class="full">Community rules (one per line)
                <textarea id="scSettingsRules" placeholder="Be respectful\nNo spam\nKeep discussion on-topic" ${disableAttr}>${esc(draft.rules || '')}</textarea>
              </label>
              <label>Topics (comma separated)
                <input id="scSettingsTopics" value="${esc(draft.topics || '')}" placeholder="nostr, livestream, support" ${disableAttr}>
              </label>
              <label>Allowed relays (comma separated)
                <input id="scSettingsRelays" value="${esc(draft.allowedRelays || '')}" placeholder="wss://relay.example.com, wss://relay2.example.com" ${disableAttr}>
              </label>
            </div>
          </section>

          <section class="sc-create-section">
            <h5>Room Integrations</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Default room provider
                <select id="scSettingsDefaultRoomProvider" ${disableAttr}>
                  <option value="native_nostr" ${draft.defaultRoomProvider === 'native_nostr' ? 'selected' : ''}>Nostr-native room metadata</option>
                  <option value="nostrnests" ${draft.defaultRoomProvider === 'nostrnests' ? 'selected' : ''}>NostrNests</option>
                  <option value="hivetalk" ${draft.defaultRoomProvider === 'hivetalk' ? 'selected' : ''}>HiveTalk</option>
                  <option value="external" ${draft.defaultRoomProvider === 'external' ? 'selected' : ''}>Custom external room</option>
                </select>
              </label>
              <label>NostrNests base URL
                <input id="scSettingsNostrNestsUrl" value="${esc(draft.nostrNestsUrl || '')}" placeholder="https://nostrnests.com" ${disableAttr}>
              </label>
              <label>HiveTalk base URL
                <input id="scSettingsHiveTalkUrl" value="${esc(draft.hiveTalkUrl || '')}" placeholder="https://vanilla.hivetalk.org" ${disableAttr}>
              </label>
            </div>
          </section>

          <details class="sc-settings-advanced">
            <summary>Advanced Permission Matrix</summary>
            ${permissionsSummary()}
          </details>
          <div class="sc-modal-foot-note">${esc(footerCopy)}</div>
          <div class="sc-modal-foot sc-modal-foot-split">
            <div class="sc-modal-foot-danger">
              ${access.canLeave ? '<button id="scLeaveCommunitySettingsBtn" class="sc-btn-danger" type="button">Leave Community</button>' : ''}
              ${access.isOwner ? '<button id="scDeleteCommunityBtn" class="sc-btn-danger sc-btn-danger-strong" type="button">Delete Group</button>' : ''}
            </div>
            <div class="sc-modal-foot-main">
              <button data-close="modal">Close</button>
              ${saveButton}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCreateChannelModal(community) {
    const defaultRoomProvider = String(community.defaultRoomProvider || 'native_nostr');
    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide">
          <h4>Create Channel</h4>
          <p>${esc(community.title)}</p>
          <div class="sc-form-grid sc-form-grid-2">
            <label>Name<input id="scCreateChannelName" placeholder="support"></label>
            <label>Category<input id="scCreateChannelCategory" value="Channels"></label>
            <label class="full">Topic<textarea id="scCreateChannelTopic" placeholder="Channel purpose"></textarea></label>
            <label>Channel Type
              <select id="scCreateChannelType">
                <option value="public">Text</option>
                <option value="private">Private</option>
                <option value="announcement">Announcement</option>
                <option value="forum">Forum</option>
                <option value="voice">Voice Room</option>
                <option value="video">Video Room</option>
                <option value="stage">Stage Room</option>
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

          <section class="sc-room-fields" id="scCreateRoomFields" hidden>
            <h5>Room Link and Presence</h5>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Room provider
                <select id="scCreateChannelRoomProvider">
                  <option value="native_nostr" ${defaultRoomProvider === 'native_nostr' ? 'selected' : ''}>Nostr-native room metadata</option>
                  <option value="nostrnests" ${defaultRoomProvider === 'nostrnests' ? 'selected' : ''}>NostrNests</option>
                  <option value="hivetalk" ${defaultRoomProvider === 'hivetalk' ? 'selected' : ''}>HiveTalk</option>
                  <option value="external" ${defaultRoomProvider === 'external' ? 'selected' : ''}>Custom external room</option>
                </select>
              </label>
              <label>Provider room ID
                <input id="scCreateChannelRoomId" placeholder="builders-lounge">
                <small>Used for direct providers like HiveTalk.</small>
              </label>
              <label class="full">Direct join URL
                <input id="scCreateChannelRoomUrl" placeholder="https://vanilla.hivetalk.org/join?room=builders-lounge">
                <small>Paste a provider URL to send members straight into the room.</small>
              </label>
              <label class="full">Nostr room address (naddr)
                <input id="scCreateChannelRoomNaddr" placeholder="naddr1...">
                <small>Useful for NostrNests and other NIP-53 compatible rooms.</small>
              </label>
              <label>Room status
                <select id="scCreateChannelRoomStatus">
                  <option value="planned">Planned</option>
                  <option value="live">Live</option>
                  <option value="ended">Ended</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label>Host pubkey
                <input id="scCreateChannelRoomHost" value="${esc(community.ownerPubkey || '')}" placeholder="npub or hex pubkey">
              </label>
              <label>Starts at
                <input id="scCreateChannelRoomStartsAt" type="datetime-local">
              </label>
              <label>Ends at
                <input id="scCreateChannelRoomEndsAt" type="datetime-local">
              </label>
              <label class="full">Recording URL
                <input id="scCreateChannelRoomRecordingUrl" placeholder="https://example.com/recording">
              </label>
            </div>
          </section>
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
              <small>Set up text channels, voice/video rooms, permissions, moderators, and admins.</small>
            </button>
            <button class="sc-hub-card" id="scHubJoinBtn">
              <strong>Join Community</strong>
              <small>Browse discoverable public communities and join, request access, or use an invite link.</small>
            </button>
          </div>
          <div class="sc-modal-foot">
            <button data-close="modal">Close</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderJoinCommunityModal(state, discoveryCommunities = [], routeState = parseCommunitiesRouteFromLocation()) {
    const joinedCommunityIds = new Set(state.joinedCommunityIds || []);
    const max = Math.max(ui.discoveryChunk, ui.discoveryLimit);
    const visible = (discoveryCommunities || []).slice(0, max);
    const hasMore = visible.length < (discoveryCommunities || []).length;

    const cards = visible.map((entry) => {
      const members = resolveMemberCount(state, entry);
      const joinAction = communityJoinAction(entry, state, routeState);
      const joined = joinedCommunityIds.has(entry.id);
      const media = normalizeAvatarUrl(entry.image || entry.banner || '');
      const joinHint = joinAction.requested
        ? 'Request pending'
        : (joinAction.hasInvite
          ? 'Invite link ready'
          : (joinAction.mode === 'approval'
            ? 'Approval required'
            : (joinAction.mode === 'invite_only' ? 'Invite only' : 'Open join')));
      const mediaHtml = media
        ? `<span class="sc-community-card-banner has-image"><img src="${esc(media)}" alt="${esc(entry.title)} banner" loading="lazy" referrerpolicy="no-referrer"></span>`
        : `<span class="sc-community-card-banner">${esc(entry.icon || initials(entry.title))}</span>`;

      return `
        <button class="sc-community-card${joined ? ' joined' : ''}" data-discovery-community="${esc(entry.id)}" data-discovery-joined="${joined ? '1' : '0'}">
          ${mediaHtml}
          <span class="sc-community-card-main">
            <strong>${esc(entry.title)}</strong>
            <small>${esc(entry.description || 'No description yet.')}</small>
            <i>${members} member${members === 1 ? '' : 's'} · ${esc(joinHint)}</i>
          </span>
          <span class="sc-community-card-cta">${esc(joinAction.label)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="sc-modal-ov" data-close="modal">
        <div class="sc-modal sc-modal-wide">
          <h4>Join Community</h4>
          <p>Public communities discovered from relays. Open communities join instantly, approval communities save a request, and invite-only communities need a direct invite link.</p>
          <div class="sc-discovery-grid-scroll${hasMore ? ' has-bottom' : ''}" id="scDiscoveryScroll" data-total="${(discoveryCommunities || []).length}">
            <div class="sc-discovery-grid">${cards || '<div class="sc-empty">No public communities available yet.</div>'}</div>
            ${hasMore ? '<div class="sc-discovery-sentinel" id="scDiscoverySentinel" aria-hidden="true"></div>' : ''}
          </div>
          <div class="sc-modal-foot"><button data-close="modal">Close</button></div>
        </div>
      </div>
    `;
  }

  function renderModal(key, state, community, channel, members, profiles, storeRef, suggestions, publicCommunities, routeState) {
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
      const categoryOptions = uniqueValues(
        (storeRef.getChannels(channel.communityId) || [])
          .map((entry) => String(entry.category || 'Channels').trim() || 'Channels')
      )
        .sort((a, b) => String(a).localeCompare(String(b)));
      const roomJoinPreview = roomJoinUrl(channel, community, displayNameForProfile(store.profile(store.getState().currentUserPubkey), store.getState().currentUserPubkey));
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal sc-modal-wide">
            <h4>Channel Settings</h4>
            <p>#${esc(channel.name)}</p>
            <div class="sc-form-grid sc-form-grid-2">
              <label>Name<input id="scChannelName" value="${esc(channel.name)}"></label>
              <label>Category
                <input id="scChannelCategory" list="scChannelCategoryList" value="${esc(channel.category || 'Channels')}">
                <small>Edit channel grouping. Choose existing or type a new category.</small>
              </label>
              <datalist id="scChannelCategoryList">${categoryOptions.map((item) => `<option value="${esc(item)}"></option>`).join('')}</datalist>
              <label class="sc-inline-check full"><input id="scChannelRenameCategoryAll" type="checkbox">Rename this category for all channels in this community</label>
              <label class="full">Topic<textarea id="scChannelTopic">${esc(channel.topic || '')}</textarea></label>
              <label>Privacy
                <select id="scChannelPrivacy">
                  <option value="public" ${channel.privacyLevel === 'public' ? 'selected' : ''}>Public</option>
                  <option value="invite_only" ${channel.privacyLevel === 'invite_only' ? 'selected' : ''}>Invite only</option>
                </select>
              </label>
              <label>Type
                <select id="scChannelType">
                  <option value="public" ${channel.channelType === 'public' ? 'selected' : ''}>Text</option>
                  <option value="private" ${channel.channelType === 'private' ? 'selected' : ''}>Private</option>
                  <option value="announcement" ${channel.channelType === 'announcement' ? 'selected' : ''}>Announcement</option>
                  <option value="forum" ${channel.channelType === 'forum' ? 'selected' : ''}>Forum</option>
                  <option value="voice" ${channel.channelType === 'voice' ? 'selected' : ''}>Voice Room</option>
                  <option value="video" ${channel.channelType === 'video' ? 'selected' : ''}>Video Room</option>
                  <option value="stage" ${channel.channelType === 'stage' ? 'selected' : ''}>Stage Room</option>
                </select>
              </label>
              <label>Slow mode (seconds)<input id="scChannelSlow" type="number" min="0" value="${esc(channel.slowModeSec || 0)}"></label>
            </div>
            <section class="sc-room-fields" id="scChannelRoomFields" ${isRoomChannel(channel) ? '' : 'hidden'}>
              <h5>Room Link and Presence</h5>
              <div class="sc-form-grid sc-form-grid-2">
                <label>Room provider
                  <select id="scChannelRoomProvider">
                    <option value="native_nostr" ${channel.roomProvider === 'native_nostr' ? 'selected' : ''}>Nostr-native room metadata</option>
                    <option value="nostrnests" ${channel.roomProvider === 'nostrnests' ? 'selected' : ''}>NostrNests</option>
                    <option value="hivetalk" ${channel.roomProvider === 'hivetalk' ? 'selected' : ''}>HiveTalk</option>
                    <option value="external" ${channel.roomProvider === 'external' ? 'selected' : ''}>Custom external room</option>
                  </select>
                </label>
                <label>Provider room ID
                  <input id="scChannelRoomId" value="${esc(channel.roomId || '')}" placeholder="builders-lounge">
                </label>
                <label class="full">Direct join URL
                  <input id="scChannelRoomUrl" value="${esc(channel.roomUrl || '')}" placeholder="https://vanilla.hivetalk.org/join?room=builders-lounge">
                </label>
                <label class="full">Nostr room address (naddr)
                  <input id="scChannelRoomNaddr" value="${esc(channel.roomNaddr || '')}" placeholder="naddr1...">
                </label>
                <label>Room status
                  <select id="scChannelRoomStatus">
                    <option value="planned" ${channel.roomStatus === 'planned' ? 'selected' : ''}>Planned</option>
                    <option value="live" ${channel.roomStatus === 'live' ? 'selected' : ''}>Live</option>
                    <option value="ended" ${channel.roomStatus === 'ended' ? 'selected' : ''}>Ended</option>
                    <option value="inactive" ${channel.roomStatus === 'inactive' ? 'selected' : ''}>Inactive</option>
                  </select>
                </label>
                <label>Host pubkey
                  <input id="scChannelRoomHost" value="${esc(channel.roomHostPubkey || '')}" placeholder="npub or hex pubkey">
                </label>
                <label>Starts at
                  <input id="scChannelRoomStartsAt" type="datetime-local" value="${esc(datetimeLocalValue(channel.roomStartsAt || 0))}">
                </label>
                <label>Ends at
                  <input id="scChannelRoomEndsAt" type="datetime-local" value="${esc(datetimeLocalValue(channel.roomEndsAt || 0))}">
                </label>
                <label class="full">Recording URL
                  <input id="scChannelRoomRecordingUrl" value="${esc(channel.roomRecordingUrl || '')}" placeholder="https://example.com/recording">
                </label>
                ${roomJoinPreview ? `<div class="sc-room-preview full"><strong>Preview join link</strong><code>${esc(roomJoinPreview)}</code></div>` : ''}
              </div>
            </section>
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
      return renderJoinCommunityModal(state, publicCommunities || suggestions || [], routeState);
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
      const profileData = resolveProfileRecord(profiles, ui.roleEditorMember, storeRef);
      const roleOptions = ['owner', 'admin', 'moderator', 'member', 'guest'];
      return `
        <div class="sc-modal-ov" data-close="modal">
          <div class="sc-modal">
            <h4>Role Editor</h4>
            <p>${esc(displayNameForProfile(profileData, ui.roleEditorMember))}</p>
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
        <button data-context-action="copy-id" data-message="${esc(messageId)}">Copy Event ID</button>
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
    if (ui.openModal === 'communitySettings') {
      ui.settingsDraft = null;
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
    bindInputField('#scCreateIncludeVoiceLounge', 'includeVoiceLounge', 'checkbox');
    bindInputField('#scCreateIncludeVideoRoom', 'includeVideoRoom', 'checkbox');
    bindInputField('#scCreateIncludeStageRoom', 'includeStageRoom', 'checkbox');
    bindInputField('#scCreateDefaultRoomProvider', 'defaultRoomProvider', 'change');
    bindInputField('#scCreateNostrNestsUrl', 'nostrNestsUrl');
    bindInputField('#scCreateHiveTalkUrl', 'hiveTalkUrl');

    const imageInput = root.querySelector('#scCreateImage');
    if (imageInput) {
      const syncImage = () => {
        setCreateDraftField('image', imageInput.value || '');
        updateCreateImagePreview('#scCreateImagePreview', imageInput.value || '', 'Community image');
      };
      imageInput.addEventListener('input', syncImage);
      imageInput.addEventListener('change', syncImage);
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

  function syncRoomFieldsVisibility(typeSelector, fieldsSelector) {
    const typeField = root.querySelector(typeSelector);
    const fields = root.querySelector(fieldsSelector);
    if (!fields) return;
    const isVisible = !!(typeField && isRoomChannel({ channelType: typeField.value }));
    fields.hidden = !isVisible;
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

    root.querySelectorAll('[data-profile-action]').forEach((el) => {
      el.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = el.getAttribute('data-profile-action') || '';
        const pubkey = el.getAttribute('data-member') || '';
        const ctx = getAppContext();
        if (!pubkey || !ctx) return;
        try {
          if (action === 'view' && typeof ctx.showProfileByPubkey === 'function') {
            ctx.showProfileByPubkey(pubkey);
            ui.selectedMember = '';
            return;
          }
          if (action === 'message' && typeof ctx.openMessagesWithPubkey === 'function') {
            await ctx.openMessagesWithPubkey(pubkey, { routeMode: 'push' });
            ui.selectedMember = '';
            return;
          }
          if (action === 'follow' && typeof ctx.toggleFollowPubkey === 'function') {
            const next = await ctx.toggleFollowPubkey(pubkey, { silentErrors: false });
            if (next === true) setStatus('Now following this profile.');
            else if (next === false) setStatus('Removed follow from this profile.');
            ui.selectedMember = '';
            render();
            return;
          }
          if (action === 'zap' && typeof ctx.zapPubkey === 'function') {
            await ctx.zapPubkey(pubkey, { amountMsats: 21000 });
            setStatus('Opened wallet to zap this profile.');
            ui.selectedMember = '';
          }
        } catch (err) {
          setStatus(err && err.message ? err.message : 'Could not complete that profile action.');
        }
      });
    });

    root.querySelectorAll('[data-room-action]').forEach((el) => {
      el.addEventListener('click', async (event) => {
        event.stopPropagation();
        const action = el.getAttribute('data-room-action') || '';
        if (action === 'join') {
          const url = el.getAttribute('data-room-url') || '';
          if (!url) {
            setStatus('Add a room link or Nostr room address in channel settings first.');
            return;
          }
          window.open(url, '_blank', 'noopener');
          return;
        }
        if (action === 'copy') {
          const url = el.getAttribute('data-room-url') || '';
          if (!url) return;
          const copied = await copyTextToClipboard(url);
          setStatus(copied ? 'Room link copied.' : 'Could not copy the room link.');
          return;
        }
        if (action === 'copy-naddr') {
          const naddr = el.getAttribute('data-room-naddr') || '';
          if (!naddr) return;
          const copied = await copyTextToClipboard(naddr);
          setStatus(copied ? 'Room naddr copied.' : 'Could not copy the room naddr.');
        }
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
        if (ui.openModal === 'createCommunity' && ui.createBusy) return;
        closeModalAndRerender();
      });
    });

    if (ui.openModal === 'createCommunity') {
      bindCreateCommunityForm();
    }
    if (ui.openModal === 'createChannel') {
      syncRoomFieldsVisibility('#scCreateChannelType', '#scCreateRoomFields');
    }
    if (ui.openModal === 'channelSettings') {
      syncRoomFieldsVisibility('#scChannelType', '#scChannelRoomFields');
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
        const ctx = getAppContext();
        if (!ctx || typeof ctx.uploadMediaFile !== 'function') {
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
              const result = await ctx.uploadMediaFile(file, {
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
      el.addEventListener('click', async () => {
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
        if (action === 'copy-id') {
          const copied = await copyTextToClipboard(messageId);
          setStatus(copied ? 'Event ID copied.' : 'Could not copy the event ID.');
        }
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

    const openCreateCommunityModal = () => {
      ui.createDraft = null;
      ui.createRoleSearch = { moderators: '', admins: '' };
      ui.openModal = 'createCommunity';
      render();
    };

    const createCommunityBtn = root.querySelector('#scCreateCommunityBtn');
    if (createCommunityBtn) createCommunityBtn.addEventListener('click', openCreateCommunityModal);

    const openCommunityHubBtn = root.querySelector('#scOpenCommunityHubBtn');
    if (openCommunityHubBtn) openCommunityHubBtn.addEventListener('click', openCreateCommunityModal);

    const openJoinModalBtn = root.querySelector('#scOpenJoinModalBtn');
    if (openJoinModalBtn) openJoinModalBtn.addEventListener('click', () => {
      resetDiscoveryWindow();
      ui.openModal = 'joinCommunity';
      render();
    });

    const hubCreateBtn = root.querySelector('#scHubCreateBtn');
    if (hubCreateBtn) hubCreateBtn.addEventListener('click', openCreateCommunityModal);

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

    const joinRoomBtn = root.querySelector('#scJoinRoomBtn');
    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => {
        const state = store.getState();
        const activeChannel = store.getChannel(state.activeChannelId);
        const activeCommunity = store.getCommunity(state.activeCommunityId);
        const viewer = state.currentUserPubkey ? store.profile(state.currentUserPubkey) : null;
        const joinUrl = roomJoinUrl(
          activeChannel,
          activeCommunity,
          viewer ? displayNameForProfile(viewer, state.currentUserPubkey) : ''
        );
        if (!joinUrl) {
          setStatus('Add a room link or Nostr room address in channel settings first.');
          return;
        }
        window.open(joinUrl, '_blank', 'noopener');
      });
    }

    const notifBtn = root.querySelector('#scNotifBtn');
    if (notifBtn) notifBtn.addEventListener('click', () => { ui.openModal = 'notifications'; render(); });

    const dmHintBtn = root.querySelector('#scDmHintBtn');
    if (dmHintBtn) {
      dmHintBtn.addEventListener('click', () => {
        const ctx = getAppContext();
        if (ctx && typeof ctx.showMessages === 'function') {
          ctx.showMessages();
          return;
        }
        setStatus('Encrypted community DM handoff is not wired yet. Use Messages for one-to-one chats right now.');
      });
    }

    const inviteBtn = root.querySelector('#scInviteBtn');
    if (inviteBtn) inviteBtn.addEventListener('click', () => { ui.openModal = 'invites'; render(); });

    const createChannelBtn = root.querySelector('#scCreateChannelBtn');
    if (createChannelBtn) createChannelBtn.addEventListener('click', () => { ui.openModal = 'createChannel'; render(); });

    const createChannelType = root.querySelector('#scCreateChannelType');
    if (createChannelType) createChannelType.addEventListener('change', () => syncRoomFieldsVisibility('#scCreateChannelType', '#scCreateRoomFields'));

    const channelTypeField = root.querySelector('#scChannelType');
    if (channelTypeField) channelTypeField.addEventListener('change', () => syncRoomFieldsVisibility('#scChannelType', '#scChannelRoomFields'));

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
        const community = store.getCommunity(state.activeCommunityId);
        if (!community) return;
        const joined = new Set(state.joinedCommunityIds);
        if (joined.has(state.activeCommunityId)) {
          ui.openModal = 'communitySettings';
          render();
          return;
        }
        const routeState = parseCommunitiesRouteFromLocation();
        const joinResult = store.joinCommunity(state.activeCommunityId, {
          source: 'active_join',
          acceptedInviteToken: routeState.inviteToken || ''
        });
        if (!joinResult.ok || joinResult.requested) {
          setStatus(joinResultMessage(joinResult, community));
          render();
          return;
        }
        const membershipResult = await syncMembershipAfterJoin(community);
        if (membershipResult.message) setStatus(membershipResult.message);
      });
    }

    root.querySelectorAll('[data-discovery-community]').forEach((el) => {
      el.addEventListener('click', async () => {
        const communityId = el.getAttribute('data-discovery-community');
        if (!communityId) return;
        const alreadyJoined = el.getAttribute('data-discovery-joined') === '1';
        const community = store.getCommunity(communityId);
        if (!community) return;
        if (!alreadyJoined) {
          const routeState = parseCommunitiesRouteFromLocation();
          const joinResult = store.joinCommunity(communityId, {
            source: 'discovery_join',
            acceptedInviteToken: routeState.inviteToken || ''
          });
          if (!joinResult.ok || joinResult.requested) {
            setStatus(joinResultMessage(joinResult, community));
            if (joinResult.requested) {
              ui.openModal = '';
              render();
            }
            return;
          }
          const membershipResult = await syncMembershipAfterJoin(community);
          if (membershipResult.message) setStatus(membershipResult.message);
        }
        store.setActiveCommunity(communityId);
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
          includeStaff: !!form.includeStaff,
          includeVoiceLounge: !!form.includeVoiceLounge,
          includeVideoRoom: !!form.includeVideoRoom,
          includeStageRoom: !!form.includeStageRoom,
          defaultRoomProvider: form.defaultRoomProvider || 'native_nostr',
          nostrNestsUrl: form.nostrNestsUrl || 'https://nostrnests.com',
          hiveTalkUrl: form.hiveTalkUrl || 'https://vanilla.hivetalk.org'
        };

        const created = store.createCommunity(payload);
        if (!created.ok) {
          ui.createBusy = false;
          createCommunitySubmit.disabled = false;
          if (created.reason === 'auth_required') setStatus('Login required.');
          else if (created.reason === 'duplicate') setStatus('A community with this slug already exists. Change the name or slug and try again.');
          else if (created.reason === 'missing_name') setStatus('Community name is required.');
          else setStatus('Unable to create community.');
          return;
        }

        let finalStatus = 'Community created and published.';

        if (nostrBridge) {
          try {
            const stateSnapshot = store.getState();
            const members = (store.getState().data.membersByCommunity[created.community.id] || [])
              .map((member) => String(member.pubkey || '').trim())
              .filter(Boolean);
            const rolesByPubkey = {};
            (store.getState().data.membersByCommunity[created.community.id] || []).forEach((member) => {
              const pubkey = String(member.pubkey || '').trim();
              if (!pubkey) return;
              rolesByPubkey[pubkey] = uniqueValues(Array.isArray(member.roles) ? member.roles : ['member']);
            });

            const embeddedChannels = (created.channels || []).map((channel) => ({
              id: String(channel.id || '').trim(),
              name: String(channel.name || '').trim(),
              category: String(channel.category || 'Channels'),
              topic: String(channel.topic || ''),
              channelType: String(channel.channelType || 'public'),
              privacyLevel: String(channel.privacyLevel || 'public'),
              slowModeSec: Math.max(0, Number(channel.slowModeSec || 0)),
              roomId: String(channel.roomId || ''),
              roomProvider: String(channel.roomProvider || ''),
              roomUrl: String(channel.roomUrl || ''),
              roomNaddr: String(channel.roomNaddr || ''),
              roomStatus: String(channel.roomStatus || ''),
              roomHostPubkey: String(channel.roomHostPubkey || ''),
              roomStartsAt: Number(channel.roomStartsAt || 0),
              roomEndsAt: Number(channel.roomEndsAt || 0),
              roomCurrentParticipants: Number(channel.roomCurrentParticipants || 0),
              roomTotalParticipants: Number(channel.roomTotalParticipants || 0),
              roomRecordingUrl: String(channel.roomRecordingUrl || ''),
              roomSpeakers: Array.isArray(channel.roomSpeakers) ? channel.roomSpeakers.slice() : [],
              roomParticipants: Array.isArray(channel.roomParticipants) ? channel.roomParticipants.slice() : []
            })).filter((channel) => channel.id && channel.name);

            const publishedCommunity = await nostrBridge.publishCommunityCreate({
              ...payload,
              pubkey: stateSnapshot.currentUserPubkey,
              communityId: created.community.id,
              defaultChannelId: created.community.defaultChannelId,
              channels: embeddedChannels,
              members: uniqueValues(members),
              rolesByPubkey
            });
            const sent = sentCountFromPublishResult(publishedCommunity);
            finalStatus = sent > 0
              ? 'Community created and published.'
              : 'Community created. Relay publish queued until a relay connection is available.';
          } catch (err) {
            finalStatus = (err && err.message)
              ? `Community created locally. Relay publish failed: ${err.message}`
              : 'Community created locally. Relay publish failed.';
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
    const settingsNameInput = root.querySelector('#scSettingsName');
    if (settingsNameInput) settingsNameInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsDescriptionInput = root.querySelector('#scSettingsDescription');
    if (settingsDescriptionInput) settingsDescriptionInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsImageInput = root.querySelector('#scSettingsImage');
    if (settingsImageInput) {
      settingsImageInput.addEventListener('input', () => {
        syncCommunitySettingsDraftFromDom();
        updateCreateImagePreview('#scSettingsImagePreview', settingsImageInput.value || '', 'Community image');
      });
    }
    const settingsModeratorsInput = root.querySelector('#scSettingsModerators');
    if (settingsModeratorsInput) settingsModeratorsInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsAdminsInput = root.querySelector('#scSettingsAdmins');
    if (settingsAdminsInput) settingsAdminsInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsJoinModeInput = root.querySelector('#scSettingsJoinMode');
    if (settingsJoinModeInput) settingsJoinModeInput.addEventListener('change', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsPostingPolicyInput = root.querySelector('#scSettingsPostingPolicy');
    if (settingsPostingPolicyInput) settingsPostingPolicyInput.addEventListener('change', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsDiscoverableInput = root.querySelector('#scSettingsDiscoverable');
    if (settingsDiscoverableInput) settingsDiscoverableInput.addEventListener('change', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsRulesInput = root.querySelector('#scSettingsRules');
    if (settingsRulesInput) settingsRulesInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsTopicsInput = root.querySelector('#scSettingsTopics');
    if (settingsTopicsInput) settingsTopicsInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsRelaysInput = root.querySelector('#scSettingsRelays');
    if (settingsRelaysInput) settingsRelaysInput.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsDefaultRoomProvider = root.querySelector('#scSettingsDefaultRoomProvider');
    if (settingsDefaultRoomProvider) settingsDefaultRoomProvider.addEventListener('change', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsNostrNestsUrl = root.querySelector('#scSettingsNostrNestsUrl');
    if (settingsNostrNestsUrl) settingsNostrNestsUrl.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });
    const settingsHiveTalkUrl = root.querySelector('#scSettingsHiveTalkUrl');
    if (settingsHiveTalkUrl) settingsHiveTalkUrl.addEventListener('input', () => { syncCommunitySettingsDraftFromDom(); });

    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', async () => {
        const state = store.getState();
        const community = store.getCommunity(state.activeCommunityId);
        if (!community) return;
        const access = resolveCommunitySettingsAccess(community, state);
        if (!access.canManageServer) {
          setStatus('Only community owners can edit server settings.');
          return;
        }
        const draft = syncCommunitySettingsDraftFromDom() || ensureCommunitySettingsDraft(community) || defaultCommunitySettingsDraft(community);

        const patch = {
          name: draft.name || community.title,
          description: draft.description || '',
          image: draft.image || '',
          moderatorPubkeys: parsePubkeyCsv(draft.moderators || ''),
          adminPubkeys: parsePubkeyCsv(draft.admins || ''),
          joinMode: draft.joinMode || community.joinMode,
          postingPolicy: draft.postingPolicy || community.postingPolicy,
          discoverable: !!draft.discoverable,
          rules: parseLines(draft.rules || ''),
          topics: parseCsv(draft.topics || ''),
          allowedRelays: parseCsv(draft.allowedRelays || ''),
          defaultRoomProvider: draft.defaultRoomProvider || community.defaultRoomProvider || 'native_nostr',
          nostrNestsUrl: draft.nostrNestsUrl || community.nostrNestsUrl || 'https://nostrnests.com',
          hiveTalkUrl: draft.hiveTalkUrl || community.hiveTalkUrl || 'https://vanilla.hivetalk.org'
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
              pubkey: state.currentUserPubkey,
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
                pubkey: state.currentUserPubkey,
                communityId: community.id,
                members,
                rolesByPubkey,
                joinMode: patch.joinMode
              });
              await nostrBridge.publishCommunityModerators39003({
                pubkey: state.currentUserPubkey,
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

    const leaveCommunitySettingsBtn = root.querySelector('#scLeaveCommunitySettingsBtn');
    if (leaveCommunitySettingsBtn) {
      leaveCommunitySettingsBtn.addEventListener('click', async () => {
        const state = store.getState();
        const community = store.getCommunity(state.activeCommunityId);
        if (!community) return;
        const joinedCommunityIds = new Set(state.joinedCommunityIds || []);
        if (!joinedCommunityIds.has(community.id)) return;
        if (!window.confirm(`Leave "${community.title}"?`)) return;
        store.leaveCommunity(community.id);
        const membershipPublish = await publishMembershipList();
        closeModalAndRerender();
        if (!membershipPublish.ok) {
          setStatus('Left locally, but could not sync membership list to relays.');
          return;
        }
        setStatus('You left the community.');
      });
    }

    const deleteCommunityBtn = root.querySelector('#scDeleteCommunityBtn');
    if (deleteCommunityBtn) {
      deleteCommunityBtn.addEventListener('click', () => {
        const state = store.getState();
        const community = store.getCommunity(state.activeCommunityId);
        if (!community) return;
        if (!window.confirm(`Delete "${community.title}"? This cannot be undone.`)) return;
        const confirmText = window.prompt('Type DELETE to confirm deleting this group.', '');
        if (String(confirmText || '').trim().toUpperCase() !== 'DELETE') {
          setStatus('Delete cancelled.');
          return;
        }
        const removed = store.removeCommunity(community.id, { source: 'owner_delete' });
        if (!removed.ok) {
          setStatus(removed.reason === 'permission_denied' ? 'Only the owner can delete this group.' : 'Unable to delete this group.');
          return;
        }
        closeModalAndRerender();
        setStatus('Group deleted.');
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
          slowModeSec: Number((root.querySelector('#scCreateChannelSlow') || {}).value || 0),
          roomProvider: (root.querySelector('#scCreateChannelRoomProvider') || {}).value || 'native_nostr',
          roomId: (root.querySelector('#scCreateChannelRoomId') || {}).value || '',
          roomUrl: (root.querySelector('#scCreateChannelRoomUrl') || {}).value || '',
          roomNaddr: (root.querySelector('#scCreateChannelRoomNaddr') || {}).value || '',
          roomStatus: (root.querySelector('#scCreateChannelRoomStatus') || {}).value || 'planned',
          roomHostPubkey: (root.querySelector('#scCreateChannelRoomHost') || {}).value || '',
          roomStartsAt: parseDateTimeLocalValue((root.querySelector('#scCreateChannelRoomStartsAt') || {}).value || ''),
          roomEndsAt: parseDateTimeLocalValue((root.querySelector('#scCreateChannelRoomEndsAt') || {}).value || ''),
          roomRecordingUrl: (root.querySelector('#scCreateChannelRoomRecordingUrl') || {}).value || ''
        };

        const created = store.createChannel(payload);
        if (!created.ok) {
          setStatus('Unable to create channel.');
          return;
        }

        if (nostrBridge) {
          try {
            await nostrBridge.publishChannelCreate({
              pubkey: state.currentUserPubkey,
              communityId: payload.communityId,
              channelId: created.channel.id,
              name: created.channel.name,
              category: created.channel.category,
              topic: created.channel.topic,
              channelType: created.channel.channelType,
              privacyLevel: created.channel.privacyLevel,
              slowModeSec: created.channel.slowModeSec,
              roomProvider: created.channel.roomProvider,
              roomId: created.channel.roomId,
              roomUrl: created.channel.roomUrl,
              roomNaddr: created.channel.roomNaddr,
              roomStatus: created.channel.roomStatus,
              roomHostPubkey: created.channel.roomHostPubkey,
              roomStartsAt: created.channel.roomStartsAt,
              roomEndsAt: created.channel.roomEndsAt,
              roomRecordingUrl: created.channel.roomRecordingUrl
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
        const channelCommunity = store.getCommunity(channel.communityId);
        const previousCategory = String(channel.category || 'Channels').trim() || 'Channels';
        const renameCategoryAll = !!((root.querySelector('#scChannelRenameCategoryAll') || {}).checked);
        const roomStartsValue = (root.querySelector('#scChannelRoomStartsAt') || {}).value || '';
        const roomEndsValue = (root.querySelector('#scChannelRoomEndsAt') || {}).value || '';

        const patch = {
          name: (root.querySelector('#scChannelName') || {}).value || channel.name,
          category: (root.querySelector('#scChannelCategory') || {}).value || channel.category,
          topic: (root.querySelector('#scChannelTopic') || {}).value || channel.topic,
          privacyLevel: (root.querySelector('#scChannelPrivacy') || {}).value || channel.privacyLevel,
          channelType: (root.querySelector('#scChannelType') || {}).value || channel.channelType,
          slowModeSec: Number((root.querySelector('#scChannelSlow') || {}).value || channel.slowModeSec || 0),
          roomProvider: (root.querySelector('#scChannelRoomProvider') || {}).value || channel.roomProvider || (channelCommunity && channelCommunity.defaultRoomProvider) || 'native_nostr',
          roomId: (root.querySelector('#scChannelRoomId') || {}).value || channel.roomId || '',
          roomUrl: (root.querySelector('#scChannelRoomUrl') || {}).value || channel.roomUrl || '',
          roomNaddr: (root.querySelector('#scChannelRoomNaddr') || {}).value || channel.roomNaddr || '',
          roomStatus: (root.querySelector('#scChannelRoomStatus') || {}).value || channel.roomStatus || 'planned',
          roomHostPubkey: (root.querySelector('#scChannelRoomHost') || {}).value || channel.roomHostPubkey || '',
          roomStartsAt: roomStartsValue ? parseDateTimeLocalValue(roomStartsValue) : 0,
          roomEndsAt: roomEndsValue ? parseDateTimeLocalValue(roomEndsValue) : 0,
          roomRecordingUrl: (root.querySelector('#scChannelRoomRecordingUrl') || {}).value || channel.roomRecordingUrl || ''
        };

        const updated = store.updateChannel(channel.id, patch);
        if (!updated.ok) {
          setStatus('Could not save channel settings.');
          return;
        }

        const nextCategory = String((patch && patch.category) || updated.channel.category || 'Channels').trim() || 'Channels';
        let categoryRenameResult = null;
        if (renameCategoryAll && previousCategory.toLowerCase() !== nextCategory.toLowerCase() && typeof store.renameChannelCategory === 'function') {
          categoryRenameResult = store.renameChannelCategory(updated.channel.communityId, previousCategory, nextCategory);
        }

        if (nostrBridge) {
          try {
            const publishQueue = [];
            const seen = new Set();
            const pushChannel = (entry) => {
              if (!entry || !entry.id || seen.has(entry.id)) return;
              seen.add(entry.id);
              publishQueue.push(entry);
            };
            pushChannel(updated.channel);
            if (categoryRenameResult && categoryRenameResult.ok && Array.isArray(categoryRenameResult.channels)) {
              categoryRenameResult.channels.forEach(pushChannel);
            }
            for (let i = 0; i < publishQueue.length; i += 1) {
              const entry = publishQueue[i];
              await nostrBridge.publishChannelCreate({
                pubkey: store.getState().currentUserPubkey,
                communityId: entry.communityId,
                channelId: entry.id,
                name: entry.name,
                category: entry.category,
                topic: entry.topic,
                channelType: entry.channelType,
                privacyLevel: entry.privacyLevel,
                slowModeSec: entry.slowModeSec,
                roomProvider: entry.roomProvider,
                roomId: entry.roomId,
                roomUrl: entry.roomUrl,
                roomNaddr: entry.roomNaddr,
                roomStatus: entry.roomStatus,
                roomHostPubkey: entry.roomHostPubkey,
                roomStartsAt: entry.roomStartsAt,
                roomEndsAt: entry.roomEndsAt,
                roomRecordingUrl: entry.roomRecordingUrl
              });
            }
          } catch (_) {}
        }

        ui.openModal = '';
        render();
        if (categoryRenameResult && categoryRenameResult.ok && Number(categoryRenameResult.count || 0) > 1) {
          setStatus(`Channel updated. Category renamed for ${categoryRenameResult.count} channels.`);
        } else {
          setStatus('Channel updated.');
        }
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
    if (mounted) {
      render();
      return;
    }
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



















