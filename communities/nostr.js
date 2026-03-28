// Nostr protocol bridge for Communities.
// Network and signing logic is isolated from UI/store.

const NIP_FLAGS = {
  nip01: true,
  nip05: true,
  nip07: true,
  nip10: true,
  nip17: true,
  nip19: true,
  nip21: true,
  nip25: true,
  nip27: true,
  nip28: true,
  nip29: true,
  nip30: true,
  nip36: true,
  nip42: true,
  nip43: true,
  nip44: true,
  nip46: true,
  nip50: true,
  nip51: true,
  nip53: true,
  nip56: true,
  nip57: true,
  nip65: true,
  nip66: true,
  nip72: true,
  nip78: true
};

const KIND_PROFILE = 0;
const KIND_CONTACTS = 3;
const KIND_DELETION = 5;
const KIND_REACTION = 7;
const KIND_TEXT_NOTE = 1;
const KIND_CHANNEL_CREATE = 40;
const KIND_CHANNEL_META = 41;
const KIND_CHANNEL_MSG = 42;
const KIND_COMMUNITY_PUBLIC = 34550;
const KIND_GROUP_PRIVATE = 39000;
const KIND_GROUP_MEMBERS_39002 = 39002;
const KIND_GROUP_MODS_39003 = 39003;
const KIND_COMMUNITY_MEMBERSHIP_LIST = 30001;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normalizeRelay(url) {
  const value = String(url || '').trim();
  return /^wss:\/\//i.test(value) ? value : '';
}

function randomId(prefix = 'sc') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

const ROOM_PROVIDER_VALUES = new Set(['native_nostr', 'nostrnests', 'hivetalk', 'external']);
const ROOM_STATUS_VALUES = new Set(['inactive', 'planned', 'live', 'ended']);

function normalizeRoomProvider(value, fallback = 'native_nostr') {
  const raw = String(value || '').trim().toLowerCase();
  if (ROOM_PROVIDER_VALUES.has(raw)) return raw;
  return ROOM_PROVIDER_VALUES.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : 'native_nostr';
}

function normalizeRoomStatus(value, fallback = 'planned') {
  const raw = String(value || '').trim().toLowerCase();
  if (ROOM_STATUS_VALUES.has(raw)) return raw;
  return ROOM_STATUS_VALUES.has(String(fallback || '').trim().toLowerCase())
    ? String(fallback || '').trim().toLowerCase()
    : 'planned';
}

function shortStableHash(value) {
  const text = String(value || 'community');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function normalizeRelayInput(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return [input];
  if (input && typeof input[Symbol.iterator] === 'function') return Array.from(input);
  return [];
}

function slugify(input) {
  const raw = String(input || '');
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  if (slug) return slug;
  return `community-${shortStableHash(raw).slice(0, 8)}`;
}

function parseJson(content) {
  const raw = String(content || '').trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function parseTimestampMs(value) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return raw.length <= 10 ? numeric * 1000 : numeric;
}

function firstTagValue(tags, key) {
  const found = (tags || []).find((tag) => Array.isArray(tag) && tag[0] === key && tag[1] != null);
  return found ? String(found[1]) : '';
}

function tagValues(tags, key) {
  return (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === key && tag[1] != null)
    .map((tag) => String(tag[1]));
}

function parseARefToCommunityId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split(':');
  if (parts.length < 3) return '';
  const kind = Number(parts[0]);
  const d = String(parts[2] || '').trim();
  if (!d) return '';
  if (kind === KIND_COMMUNITY_PUBLIC) return `n72:${d}`;
  if (kind === KIND_GROUP_PRIVATE) return `n29:${d}`;
  return '';
}

function extractCommunityId(event) {
  const tags = event.tags || [];
  const d = firstTagValue(tags, 'd');
  if (event.kind === KIND_COMMUNITY_PUBLIC && d) return `n72:${d}`;
  if ((event.kind === KIND_GROUP_PRIVATE || event.kind === KIND_GROUP_MEMBERS_39002 || event.kind === KIND_GROUP_MODS_39003) && d) {
    return `n29:${d}`;
  }

  const h = firstTagValue(tags, 'h');
  if (/^(n72|n29):/i.test(h)) return h;

  const a = firstTagValue(tags, 'a');
  const aCommunity = parseARefToCommunityId(a);
  if (aCommunity) return aCommunity;

  const topicCommunity = tagValues(tags, 't').find((value) => /^community:/i.test(value));
  if (topicCommunity) return `n72:${topicCommunity.replace(/^community:/i, '')}`;

  return '';
}

function extractChannelId(event, communityId = '') {
  const tags = event.tags || [];
  const tagged = tagValues(tags, 't').find((value) => /^channel:/i.test(value));
  if (tagged) return tagged.replace(/^channel:/i, '');

  const d = firstTagValue(tags, 'd');
  if (d && (event.kind === KIND_CHANNEL_CREATE || event.kind === KIND_CHANNEL_META)) {
    const communitySlug = (communityId.split(':')[1] || 'community').slice(0, 24);
    return `ch:${communitySlug}:${slugify(d)}`;
  }

  const nameTag = firstTagValue(tags, 'name');
  if (nameTag && (event.kind === KIND_CHANNEL_CREATE || event.kind === KIND_CHANNEL_META)) {
    const communitySlug = (communityId.split(':')[1] || 'community').slice(0, 24);
    return `ch:${communitySlug}:${slugify(nameTag)}`;
  }

  return '';
}

function parseProfileEvent(event) {
  if (event.kind !== KIND_PROFILE) return null;
  const content = parseJson(event.content) || {};
  const displayName = String(content.display_name || content.displayName || content.name || '').trim();
  return {
    pubkey: event.pubkey,
    name: String(content.name || displayName || '').trim(),
    displayName: displayName || String(content.name || '').trim(),
    nip05: String(content.nip05 || '').trim(),
    verifiedNip05: false,
    avatar: String(content.picture || content.avatar || '').trim(),
    bio: String(content.about || content.bio || '').trim()
  };
}

function parseCommunityEvent(event) {
  if (event.kind !== KIND_COMMUNITY_PUBLIC && event.kind !== KIND_GROUP_PRIVATE) return null;
  const tags = event.tags || [];
  const d = firstTagValue(tags, 'd') || slugify(firstTagValue(tags, 'name') || event.id || 'community');
  const type = event.kind === KIND_GROUP_PRIVATE ? 'private' : 'public';
  const id = `${type === 'private' ? 'n29' : 'n72'}:${d}`;
  const content = parseJson(event.content) || {};

  const rulesFromTags = tagValues(tags, 'rule');
  const rulesFromContent = Array.isArray(content.rules) ? content.rules.map((rule) => String(rule || '').trim()).filter(Boolean) : [];
  const topicsFromTags = tagValues(tags, 't').filter((topic) => !/^community:/i.test(topic));
  const topicsFromContent = Array.isArray(content.topics) ? content.topics.map((topic) => String(topic || '').trim()).filter(Boolean) : [];
  const moderators = (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === 'p' && String(tag[3] || '').toLowerCase().includes('moder'))
    .map((tag) => String(tag[1] || '').trim())
    .filter(Boolean);
  const admins = (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === 'p' && String(tag[3] || '').toLowerCase().includes('admin'))
    .map((tag) => String(tag[1] || '').trim())
    .filter(Boolean);
  const defaultChannelId = String(firstTagValue(tags, 'default_channel') || content.default_channel || '');

  const embeddedChannels = (Array.isArray(content.channels) ? content.channels : [])
    .map((entry, index) => {
      const item = entry && typeof entry === 'object' ? entry : {};
      const fallbackName = `channel-${index + 1}`;
      const name = String(item.name || item.channel || item.title || fallbackName).trim();
      const idValue = String(item.id || '').trim();
      const channelId = idValue || `ch:${d.slice(0, 24)}:${slugify(name || fallbackName)}`;
      return {
        id: channelId,
        communityId: id,
        name,
        topic: String(item.topic || item.about || ''),
        category: String(item.category || 'Channels'),
        channelType: String(item.channelType || item.type || 'public'),
        privacyLevel: String(item.privacyLevel || item.privacy || 'public'),
        slowModeSec: Math.max(0, Number(item.slowModeSec || item.slow_mode || 0)),
        roomId: String(item.roomId || item.room_id || ''),
        roomProvider: normalizeRoomProvider(item.roomProvider || item.room_provider || content.default_room_provider || 'native_nostr'),
        roomUrl: String(item.roomUrl || item.room_url || ''),
        roomNaddr: String(item.roomNaddr || item.room_naddr || ''),
        roomStatus: normalizeRoomStatus(item.roomStatus || item.room_status || 'planned'),
        roomHostPubkey: String(item.roomHostPubkey || item.room_host_pubkey || ''),
        roomStartsAt: parseTimestampMs(item.roomStartsAt || item.room_starts_at || 0),
        roomEndsAt: parseTimestampMs(item.roomEndsAt || item.room_ends_at || 0),
        roomCurrentParticipants: Math.max(0, Number(item.roomCurrentParticipants || item.room_current_participants || 0)),
        roomTotalParticipants: Math.max(0, Number(item.roomTotalParticipants || item.room_total_participants || 0)),
        roomRecordingUrl: String(item.roomRecordingUrl || item.room_recording_url || ''),
        roomSpeakers: unique((Array.isArray(item.roomSpeakers) ? item.roomSpeakers : (Array.isArray(item.room_speakers) ? item.room_speakers : [])).map((value) => String(value || '').trim()).filter(Boolean)),
        roomParticipants: unique((Array.isArray(item.roomParticipants) ? item.roomParticipants : (Array.isArray(item.room_participants) ? item.room_participants : [])).map((value) => String(value || '').trim()).filter(Boolean)),
        source: 'nostr',
        createdAt: Number(event.created_at || nowSec()) * 1000,
        eventId: event.id
      };
    })
    .filter((entry) => entry.id && entry.name);

  const embeddedRolesInput = (content.roles_by_pubkey && typeof content.roles_by_pubkey === 'object')
    ? content.roles_by_pubkey
    : ((content.rolesByPubkey && typeof content.rolesByPubkey === 'object') ? content.rolesByPubkey : {});
  const embeddedRolesByPubkey = {};
  Object.keys(embeddedRolesInput || {}).forEach((rawPubkey) => {
    const pubkey = String(rawPubkey || '').trim();
    if (!pubkey) return;
    const rawRoles = embeddedRolesInput[rawPubkey];
    const roleList = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
    const normalizedRoles = unique(roleList.map((role) => String(role || '').trim()).filter(Boolean));
    if (!normalizedRoles.length) return;
    embeddedRolesByPubkey[pubkey] = normalizedRoles;
  });

  const embeddedMembers = unique([
    ...(Array.isArray(content.members) ? content.members : []).map((member) => String(member || '').trim()).filter(Boolean),
    ...Object.keys(embeddedRolesByPubkey)
  ]);
  embeddedMembers.forEach((pubkey) => {
    if (!embeddedRolesByPubkey[pubkey]) embeddedRolesByPubkey[pubkey] = ['member'];
  });

  return {
    id,
    type,
    title: String(firstTagValue(tags, 'name') || content.name || content.title || d),
    description: String(firstTagValue(tags, 'description') || content.about || content.description || ''),
    icon: String(firstTagValue(tags, 'icon') || content.icon || ''),
    image: String(firstTagValue(tags, 'image') || content.image || content.picture || ''),
    banner: String(firstTagValue(tags, 'banner') || content.banner || ''),
    ownerPubkey: event.pubkey,
    moderatorPubkeys: unique(moderators),
    adminPubkeys: unique(admins),
    rules: unique([...rulesFromTags, ...rulesFromContent]),
    topics: unique([...topicsFromTags, ...topicsFromContent]),
    joinMode: String(firstTagValue(tags, 'mode') || firstTagValue(tags, 'join') || content.join_mode || (type === 'private' ? 'approval' : 'open')),
    postingPolicy: String(firstTagValue(tags, 'posting_policy') || content.posting_policy || 'members'),
    discoverable: type === 'public' ? firstTagValue(tags, 'discoverable') !== '0' : false,
    defaultChannelId,
    allowedRelays: unique([...tagValues(tags, 'relay'), ...tagValues(tags, 'r')]),
    defaultRoomProvider: normalizeRoomProvider(firstTagValue(tags, 'default_room_provider') || content.default_room_provider || 'native_nostr'),
    nostrNestsUrl: String(firstTagValue(tags, 'nostrnests') || content.nostrnests_url || 'https://nostrnests.com'),
    hiveTalkUrl: String(firstTagValue(tags, 'hivetalk') || content.hivetalk_url || 'https://vanilla.hivetalk.org'),
    embeddedChannels,
    embeddedMembers,
    embeddedRolesByPubkey,
    createdAt: Number(event.created_at || nowSec()) * 1000,
    updatedAt: Number(event.created_at || nowSec()) * 1000,
    source: 'nostr',
    eventId: event.id
  };
}

function parseCommunityMembers39002(event) {
  if (event.kind !== KIND_GROUP_MEMBERS_39002) return null;
  const tags = event.tags || [];
  const communityId = extractCommunityId(event);
  if (!communityId) return null;

  const rolesByPubkey = {};
  const members = (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === 'p' && tag[1])
    .map((tag) => {
      const pubkey = String(tag[1] || '').trim();
      const role = String(tag[3] || 'member').trim() || 'member';
      if (!rolesByPubkey[pubkey]) rolesByPubkey[pubkey] = [];
      rolesByPubkey[pubkey].push(role);
      return pubkey;
    })
    .filter(Boolean);

  return {
    communityId,
    members: unique(members),
    rolesByPubkey,
    replace: true,
    source: 'nostr',
    eventId: event.id,
    createdAt: Number(event.created_at || nowSec()) * 1000
  };
}

function parseCommunityModerators39003(event) {
  if (event.kind !== KIND_GROUP_MODS_39003) return null;
  const tags = event.tags || [];
  const communityId = extractCommunityId(event);
  if (!communityId) return null;

  const moderators = (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === 'p' && tag[1])
    .filter((tag) => {
      const role = String(tag[3] || 'moderator').toLowerCase();
      return role.includes('moder') || (!role.includes('admin') && !role.includes('owner'));
    })
    .map((tag) => String(tag[1] || '').trim())
    .filter(Boolean);
  const admins = (tags || [])
    .filter((tag) => Array.isArray(tag) && tag[0] === 'p' && tag[1])
    .filter((tag) => String(tag[3] || '').toLowerCase().includes('admin'))
    .map((tag) => String(tag[1] || '').trim())
    .filter(Boolean);

  return {
    communityId,
    moderators: unique(moderators),
    admins: unique(admins),
    source: 'nostr',
    eventId: event.id,
    createdAt: Number(event.created_at || nowSec()) * 1000
  };
}

function parseChannelEvent(event) {
  if (event.kind !== KIND_CHANNEL_CREATE && event.kind !== KIND_CHANNEL_META) return null;
  const content = parseJson(event.content) || {};
  const communityId = extractCommunityId(event);
  if (!communityId) return null;

  const tags = event.tags || [];
  const channelId = extractChannelId(event, communityId);
  const name = String(content.name || firstTagValue(tags, 'name') || firstTagValue(tags, 'd') || '').trim();
  if (!channelId || !name) return null;

  return {
    id: channelId,
    communityId,
    name,
    topic: String(content.about || content.topic || firstTagValue(tags, 'topic') || ''),
    category: String(firstTagValue(tags, 'category') || content.category || 'Channels'),
    channelType: String(firstTagValue(tags, 'type') || content.type || 'public'),
    privacyLevel: String(firstTagValue(tags, 'privacy') || content.privacy || 'public'),
    slowModeSec: Number(firstTagValue(tags, 'slow') || content.slow_mode || 0),
    roomId: String(firstTagValue(tags, 'room_id') || content.room_id || ''),
    roomProvider: normalizeRoomProvider(firstTagValue(tags, 'room_provider') || content.room_provider || 'native_nostr'),
    roomUrl: String(firstTagValue(tags, 'room_url') || content.room_url || firstTagValue(tags, 'streaming') || ''),
    roomNaddr: String(firstTagValue(tags, 'room_naddr') || content.room_naddr || ''),
    roomStatus: normalizeRoomStatus(firstTagValue(tags, 'room_status') || content.room_status || 'planned'),
    roomHostPubkey: String(firstTagValue(tags, 'room_host') || content.room_host_pubkey || ''),
    roomStartsAt: parseTimestampMs(firstTagValue(tags, 'room_starts') || content.room_starts_at || firstTagValue(tags, 'starts') || 0),
    roomEndsAt: parseTimestampMs(firstTagValue(tags, 'room_ends') || content.room_ends_at || firstTagValue(tags, 'ends') || 0),
    roomCurrentParticipants: Math.max(0, Number(firstTagValue(tags, 'room_current_participants') || content.room_current_participants || 0)),
    roomTotalParticipants: Math.max(0, Number(firstTagValue(tags, 'room_total_participants') || content.room_total_participants || 0)),
    roomRecordingUrl: String(firstTagValue(tags, 'room_recording') || content.room_recording_url || firstTagValue(tags, 'recording') || ''),
    roomSpeakers: unique(tagValues(tags, 'room_speaker').concat(Array.isArray(content.room_speakers) ? content.room_speakers.map((value) => String(value || '').trim()) : []).filter(Boolean)),
    roomParticipants: unique(tagValues(tags, 'room_participant').concat(Array.isArray(content.room_participants) ? content.room_participants.map((value) => String(value || '').trim()) : []).filter(Boolean)),
    source: 'nostr',
    createdAt: Number(event.created_at || nowSec()) * 1000,
    eventId: event.id
  };
}

function parseMessageThreadTags(tags = []) {
  let replyTo = '';
  let threadRoot = '';
  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag[0] !== 'e') return;
    const id = String(tag[1] || '').trim();
    const marker = String(tag[3] || '').trim().toLowerCase();
    if (!id) return;
    if (marker === 'reply') replyTo = id;
    if (marker === 'root') threadRoot = id;
    if (!replyTo) replyTo = id;
    if (!threadRoot) threadRoot = id;
  });
  return { replyTo, threadRoot };
}

function parseMessageEvent(event) {
  if (![KIND_TEXT_NOTE, KIND_CHANNEL_MSG].includes(event.kind)) return null;
  const communityId = extractCommunityId(event);
  const channelId = extractChannelId(event, communityId) || (communityId ? `ch:${communityId.split(':')[1]}:general` : '');
  if (!communityId && !channelId) return null;

  const tags = event.tags || [];
  const { replyTo, threadRoot } = parseMessageThreadTags(tags);

  return {
    id: event.id,
    channelId,
    communityId,
    channelName: channelId.split(':').slice(-1)[0] || 'channel',
    authorPubkey: event.pubkey,
    content: String(event.content || ''),
    createdAt: Number(event.created_at || nowSec()) * 1000,
    replyTo,
    threadRoot,
    attachments: [],
    source: 'nostr',
    eventId: event.id
  };
}

function parseReactionEvent(event) {
  if (event.kind !== KIND_REACTION) return null;
  const tags = event.tags || [];
  const messageId = firstTagValue(tags, 'e');
  if (!messageId) return null;

  return {
    eventId: event.id,
    messageId,
    pubkey: event.pubkey,
    key: String(event.content || '+').trim() || '+',
    communityId: extractCommunityId(event),
    channelId: extractChannelId(event, extractCommunityId(event)),
    source: 'nostr',
    createdAt: Number(event.created_at || nowSec()) * 1000
  };
}

function parseDeletionEvent(event) {
  if (event.kind !== KIND_DELETION) return null;
  return {
    eventId: event.id,
    pubkey: event.pubkey,
    eventIds: unique(tagValues(event.tags || [], 'e')),
    createdAt: Number(event.created_at || nowSec()) * 1000,
    source: 'nostr'
  };
}

function parseMembershipListEvent(event) {
  if (event.kind !== KIND_COMMUNITY_MEMBERSHIP_LIST) return null;
  const d = firstTagValue(event.tags || [], 'd');
  if (!['sifaka-communities', 'communities', 'joined-communities'].includes(d)) return null;

  const communityFromH = tagValues(event.tags || [], 'h').filter((id) => /^(n72|n29):/i.test(id));
  const communityFromA = tagValues(event.tags || [], 'a').map(parseARefToCommunityId).filter(Boolean);
  const content = parseJson(event.content) || {};
  const contentCommunities = Array.isArray(content.communities) ? content.communities.map((id) => String(id || '').trim()).filter(Boolean) : [];

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    communityIds: unique([...communityFromH, ...communityFromA, ...contentCommunities]),
    source: 'nostr',
    createdAt: Number(event.created_at || nowSec()) * 1000
  };
}

function computeEventIdFallback(ev) {
  const raw = JSON.stringify([0, ev.pubkey || '', ev.created_at || 0, ev.kind || 1, ev.tags || [], ev.content || '']);
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
  }
  return `local_${Math.abs(hash).toString(16)}`;
}

function buildMessageTags(input = {}) {
  const tags = [];
  if (input.communityId) tags.push(['h', input.communityId]);
  if (input.channelId) tags.push(['t', `channel:${input.channelId}`]);
  if (input.channelName) tags.push(['alt', `Message in #${input.channelName}`]);
  if (input.replyTo) tags.push(['e', input.replyTo, '', 'reply']);
  if (input.threadRoot) tags.push(['e', input.threadRoot, '', 'root']);
  if (input.contentWarning) tags.push(['content-warning', input.contentWarning]);
  return tags;
}

export function createNostrBridge(options = {}) {
  const relays = unique(normalizeRelayInput(options.relays).map(normalizeRelay).filter(Boolean));
  const sockets = new Map();
  const subscriptions = new Map();
  const publishQueue = [];

  const listeners = {
    event: new Set(),
    status: new Set(),
    notice: new Set()
  };

  function emit(type, payload) {
    const set = listeners[type];
    if (!set) return;
    set.forEach((fn) => {
      try { fn(payload); } catch (_) {}
    });
  }

  function on(type, fn) {
    const set = listeners[type];
    if (!set) return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  function send(url, payload) {
    const ws = sockets.get(url);
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (_) {
      return false;
    }
  }

  function sendToAll(payload) {
    let sent = 0;
    sockets.forEach((_ws, url) => {
      if (send(url, payload)) sent += 1;
    });
    return sent;
  }

  function replaySubscriptionsToRelay(url) {
    subscriptions.forEach((sub, subId) => {
      send(url, ['REQ', subId, ...(sub.filters || [])]);
    });
  }

  function flushQueue() {
    if (!publishQueue.length) return;
    const copy = publishQueue.splice(0, publishQueue.length);
    copy.forEach((event) => {
      const sent = sendToAll(['EVENT', event]);
      if (!sent) publishQueue.push(event);
    });
  }

  function handleRelayMessage(relay, raw) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      return;
    }
    if (!Array.isArray(data)) return;

    const type = data[0];
    if (type === 'EVENT') {
      const subId = data[1];
      const event = data[2];
      const sub = subscriptions.get(subId);
      if (sub && sub.handlers && typeof sub.handlers.event === 'function') {
        try { sub.handlers.event(event, { relay, subId }); } catch (_) {}
      }
      emit('event', { relay, subId, event });
      return;
    }

    if (type === 'EOSE') {
      const subId = data[1];
      const sub = subscriptions.get(subId);
      if (sub && sub.handlers && typeof sub.handlers.eose === 'function') {
        try { sub.handlers.eose({ relay, subId }); } catch (_) {}
      }
      return;
    }

    if (type === 'NOTICE') {
      emit('notice', { relay, notice: String(data[1] || '') });
      return;
    }

    if (type === 'OK') {
      emit('notice', {
        relay,
        ok: !!data[2],
        eventId: String(data[1] || ''),
        reason: String(data[3] || '')
      });
    }
  }

  function connectRelay(url) {
    if (!url || sockets.has(url)) return;

    let ws = null;
    try {
      ws = new WebSocket(url);
    } catch (_) {
      emit('status', { relay: url, state: 'error' });
      return;
    }

    ws.addEventListener('open', () => {
      emit('status', { relay: url, state: 'open' });
      replaySubscriptionsToRelay(url);
      flushQueue();
    });

    ws.addEventListener('close', () => emit('status', { relay: url, state: 'closed' }));
    ws.addEventListener('error', () => emit('status', { relay: url, state: 'error' }));
    ws.addEventListener('message', (msg) => handleRelayMessage(url, msg.data));

    sockets.set(url, ws);
  }

  function connectAll() {
    relays.forEach(connectRelay);
  }

  function subscribe(filters, handlers = {}, options = {}) {
    const subId = String(options.id || randomId('sub'));
    subscriptions.set(subId, { filters: Array.isArray(filters) ? filters : [], handlers, options });
    sendToAll(['REQ', subId, ...(filters || [])]);
    return {
      id: subId,
      close() {
        closeSubscription(subId);
      }
    };
  }

  function closeSubscription(subId) {
    if (!subId || !subscriptions.has(subId)) return;
    subscriptions.delete(subId);
    sendToAll(['CLOSE', subId]);
  }

  function closeAllSubscriptions() {
    Array.from(subscriptions.keys()).forEach((subId) => closeSubscription(subId));
  }

  function subscribeCommunityGraph(handlers = {}, options = {}) {
    const limit = Math.max(100, Number(options.limit || 500));

    return subscribe([
      { kinds: [KIND_COMMUNITY_PUBLIC, KIND_GROUP_PRIVATE], limit: Math.max(100, limit / 2) },
      { kinds: [KIND_GROUP_MEMBERS_39002, KIND_GROUP_MODS_39003], limit: Math.max(100, limit / 2) },
      { kinds: [KIND_CHANNEL_CREATE, KIND_CHANNEL_META], limit: Math.max(200, limit) },
      { kinds: [KIND_CHANNEL_MSG, KIND_TEXT_NOTE], limit: Math.max(400, limit * 2) },
      { kinds: [KIND_REACTION, KIND_DELETION], limit: Math.max(400, limit * 2) },
      { kinds: [KIND_PROFILE], limit: Math.max(400, limit * 2) },
      { kinds: [KIND_COMMUNITY_MEMBERSHIP_LIST], '#d': ['sifaka-communities', 'communities', 'joined-communities'], limit: Math.max(60, Math.floor(limit / 2)) }
    ], {
      event(event, ctx) {
        if (handlers.onRawEvent) {
          try { handlers.onRawEvent(event, ctx); } catch (_) {}
        }

        const profile = parseProfileEvent(event);
        if (profile && handlers.onProfile) handlers.onProfile(profile, event, ctx);

        const community = parseCommunityEvent(event);
        if (community && handlers.onCommunity) handlers.onCommunity(community, event, ctx);
        if (community && handlers.onChannel) {
          (community.embeddedChannels || []).forEach((embeddedChannel) => {
            handlers.onChannel(embeddedChannel, event, ctx);
          });
        }
        if (community && handlers.onCommunityMembers39002 && (community.embeddedMembers || []).length) {
          handlers.onCommunityMembers39002({
            communityId: community.id,
            members: community.embeddedMembers,
            rolesByPubkey: community.embeddedRolesByPubkey || {},
            replace: true,
            source: 'nostr',
            eventId: event.id,
            createdAt: Number(event.created_at || nowSec()) * 1000
          }, event, ctx);
        }

        const members39002 = parseCommunityMembers39002(event);
        if (members39002 && handlers.onCommunityMembers39002) handlers.onCommunityMembers39002(members39002, event, ctx);

        const mods39003 = parseCommunityModerators39003(event);
        if (mods39003 && handlers.onCommunityModerators39003) handlers.onCommunityModerators39003(mods39003, event, ctx);

        const channel = parseChannelEvent(event);
        if (channel && handlers.onChannel) handlers.onChannel(channel, event, ctx);

        const message = parseMessageEvent(event);
        if (message && handlers.onMessage) handlers.onMessage(message, event, ctx);

        const reaction = parseReactionEvent(event);
        if (reaction && handlers.onReaction) handlers.onReaction(reaction, event, ctx);

        const deletion = parseDeletionEvent(event);
        if (deletion && handlers.onDeletion) handlers.onDeletion(deletion, event, ctx);

        const membership = parseMembershipListEvent(event);
        if (membership && handlers.onMembershipList) handlers.onMembershipList(membership, event, ctx);
      },
      eose(ctx) {
        if (handlers.onEose) handlers.onEose(ctx);
      }
    }, { id: options.id || randomId('community') });
  }

  async function getPubkeyFromSigner() {
    if (!window.nostr || typeof window.nostr.getPublicKey !== 'function') return '';
    try {
      return await window.nostr.getPublicKey();
    } catch (_) {
      return '';
    }
  }

  async function signEvent(unsigned) {
    if (window.nostr && typeof window.nostr.signEvent === 'function') {
      return window.nostr.signEvent(unsigned);
    }

    return {
      ...unsigned,
      id: computeEventIdFallback(unsigned),
      sig: 'unsigned'
    };
  }

  async function publish(event) {
    const sent = sendToAll(['EVENT', event]);
    if (!sent) publishQueue.push(event);
    return sent;
  }

  async function publishChannelMessage(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const unsigned = {
      kind: KIND_CHANNEL_MSG,
      created_at: nowSec(),
      pubkey,
      tags: buildMessageTags({
        communityId: input.communityId,
        channelId: input.channelId,
        channelName: input.channel && input.channel.name,
        replyTo: input.replyTo,
        threadRoot: input.threadRoot,
        contentWarning: input.contentWarning
      }),
      content: String(input.content || '')
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    signed._sent = sent;
    return signed;
  }

  async function publishReaction(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const unsigned = {
      kind: KIND_REACTION,
      created_at: nowSec(),
      pubkey,
      tags: [
        ['e', String(input.messageId || '')],
        ['h', String(input.communityId || '')],
        ['t', `channel:${String(input.channelId || '')}`]
      ],
      content: String(input.reaction || '+')
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    signed._sent = sent;
    return signed;
  }

  async function publishCommunityCreate(input = {}) {
    const type = String(input.type || 'public').trim() === 'private' ? 'private' : 'public';
    const kind = type === 'private' ? KIND_GROUP_PRIVATE : KIND_COMMUNITY_PUBLIC;
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const slug = slugify(input.slug || input.name || input.title || 'community');
    const communityId = `${type === 'private' ? 'n29' : 'n72'}:${slug}`;
    const defaultChannelId = String(input.defaultChannelId || `ch:${slug}:general`).trim();
    const moderatorPubkeys = unique([...(input.moderators || []), ...(input.moderatorPubkeys || [])].map((value) => String(value || '').trim()).filter(Boolean));
    const adminPubkeys = unique([...(input.admins || []), ...(input.adminPubkeys || [])].map((value) => String(value || '').trim()).filter(Boolean));

    const normalizedChannels = (Array.isArray(input.channels) ? input.channels : [])
      .map((entry) => {
        const item = entry && typeof entry === 'object' ? entry : {};
        const name = String(item.name || '').trim();
        const idValue = String(item.id || '').trim();
        if (!name || !idValue) return null;
        const channelType = String(item.channelType || item.type || 'public').trim().toLowerCase() || 'public';
        const isRoom = ['voice', 'video', 'stage'].includes(channelType);
        return {
          id: idValue,
          name,
          category: String(item.category || 'Channels'),
          topic: String(item.topic || ''),
          channelType,
          privacyLevel: String(item.privacyLevel || item.privacy || 'public'),
          slowModeSec: Math.max(0, Number(item.slowModeSec || item.slow_mode || 0)),
          roomId: isRoom ? String(item.roomId || item.room_id || '') : '',
          roomProvider: isRoom ? normalizeRoomProvider(item.roomProvider || item.room_provider || input.defaultRoomProvider || 'native_nostr') : '',
          roomUrl: isRoom ? String(item.roomUrl || item.room_url || '') : '',
          roomNaddr: isRoom ? String(item.roomNaddr || item.room_naddr || '') : '',
          roomStatus: isRoom ? normalizeRoomStatus(item.roomStatus || item.room_status || 'planned') : 'inactive',
          roomHostPubkey: isRoom ? String(item.roomHostPubkey || item.room_host_pubkey || '') : '',
          roomStartsAt: isRoom ? Math.max(0, Number(item.roomStartsAt || item.room_starts_at || 0)) : 0,
          roomEndsAt: isRoom ? Math.max(0, Number(item.roomEndsAt || item.room_ends_at || 0)) : 0,
          roomCurrentParticipants: isRoom ? Math.max(0, Number(item.roomCurrentParticipants || item.room_current_participants || 0)) : 0,
          roomTotalParticipants: isRoom ? Math.max(0, Number(item.roomTotalParticipants || item.room_total_participants || 0)) : 0,
          roomRecordingUrl: isRoom ? String(item.roomRecordingUrl || item.room_recording_url || '') : '',
          roomSpeakers: isRoom ? unique((Array.isArray(item.roomSpeakers) ? item.roomSpeakers : (Array.isArray(item.room_speakers) ? item.room_speakers : [])).map((value) => String(value || '').trim()).filter(Boolean)) : [],
          roomParticipants: isRoom ? unique((Array.isArray(item.roomParticipants) ? item.roomParticipants : (Array.isArray(item.room_participants) ? item.room_participants : [])).map((value) => String(value || '').trim()).filter(Boolean)) : []
        };
      })
      .filter(Boolean);

    const includeMemberData = Array.isArray(input.members) || (input.rolesByPubkey && typeof input.rolesByPubkey === 'object');
    const normalizedRolesByPubkey = {};
    const normalizedMembers = unique((Array.isArray(input.members) ? input.members : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean));
    if (includeMemberData) {
      const rawRoles = (input.rolesByPubkey && typeof input.rolesByPubkey === 'object') ? input.rolesByPubkey : {};
      Object.keys(rawRoles).forEach((rawPubkey) => {
        const pubkeyKey = String(rawPubkey || '').trim();
        if (!pubkeyKey) return;
        const roleList = Array.isArray(rawRoles[rawPubkey]) ? rawRoles[rawPubkey] : [rawRoles[rawPubkey]];
        const normalizedRoleList = unique(roleList.map((role) => String(role || '').trim()).filter(Boolean));
        if (!normalizedRoleList.length) return;
        normalizedRolesByPubkey[pubkeyKey] = normalizedRoleList;
      });
      Object.keys(normalizedRolesByPubkey).forEach((pubkeyKey) => {
        if (!normalizedMembers.includes(pubkeyKey)) normalizedMembers.push(pubkeyKey);
      });
      normalizedMembers.forEach((pubkeyKey) => {
        if (!normalizedRolesByPubkey[pubkeyKey]) normalizedRolesByPubkey[pubkeyKey] = ['member'];
      });
    }

    const tags = [
      ['d', slug],
      ['name', String(input.name || input.title || slug)],
      ['description', String(input.description || '')],
      ['mode', String(input.joinMode || input.membershipMode || (type === 'private' ? 'approval' : 'open'))],
      ['posting_policy', String(input.postingPolicy || 'members')],
      ['discoverable', type === 'public' && input.discoverable !== false ? '1' : '0'],
      ['default_channel', defaultChannelId],
      ['default_room_provider', normalizeRoomProvider(input.defaultRoomProvider || 'native_nostr')],
      ['client', 'sifaka.live']
    ];

    const imageUrl = String(input.image || input.banner || input.icon || '').trim();
    if (imageUrl) tags.push(['image', imageUrl]);
    if (input.icon) tags.push(['icon', String(input.icon)]);
    if (input.nostrNestsUrl) tags.push(['nostrnests', String(input.nostrNestsUrl)]);
    if (input.hiveTalkUrl) tags.push(['hivetalk', String(input.hiveTalkUrl)]);

    unique(input.topics || []).forEach((topic) => tags.push(['t', String(topic)]));
    unique(input.rules || []).forEach((rule) => tags.push(['rule', String(rule)]));
    unique(input.allowedRelays || []).forEach((relay) => tags.push(['relay', String(relay)]));
    moderatorPubkeys.forEach((moderatorPubkey) => tags.push(['p', String(moderatorPubkey), '', 'moderator']));
    adminPubkeys.forEach((adminPubkey) => tags.push(['p', String(adminPubkey), '', 'admin']));

    const contentPayload = {
      name: String(input.name || input.title || slug),
      about: String(input.description || ''),
      image: imageUrl,
      rules: unique(input.rules || []),
      topics: unique(input.topics || []),
      posting_policy: String(input.postingPolicy || 'members'),
      default_room_provider: normalizeRoomProvider(input.defaultRoomProvider || 'native_nostr'),
      nostrnests_url: String(input.nostrNestsUrl || ''),
      hivetalk_url: String(input.hiveTalkUrl || '')
    };
    if (defaultChannelId) contentPayload.default_channel = defaultChannelId;
    if (normalizedChannels.length) contentPayload.channels = normalizedChannels;
    if (includeMemberData) {
      contentPayload.members = normalizedMembers;
      contentPayload.roles_by_pubkey = normalizedRolesByPubkey;
    }

    const unsigned = {
      kind,
      created_at: nowSec(),
      pubkey,
      tags,
      content: JSON.stringify(contentPayload)
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    return {
      event: signed,
      communityId,
      slug,
      sent
    };
  }

  async function publishCommunityMembers39002(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const communityId = String(input.communityId || '').trim();
    if (!communityId) throw new Error('communityId required for kind 39002');
    const d = communityId.split(':')[1] || slugify(communityId);

    const members = unique(input.members || []);
    const rolesByPubkey = input.rolesByPubkey || {};

    const tags = [
      ['d', d],
      ['h', communityId],
      ['client', 'sifaka.live']
    ];

    members.forEach((memberPubkey) => {
      const role = Array.isArray(rolesByPubkey[memberPubkey])
        ? String(rolesByPubkey[memberPubkey][0] || 'member')
        : String(rolesByPubkey[memberPubkey] || 'member');
      tags.push(['p', String(memberPubkey), '', role]);
    });

    const unsigned = {
      kind: KIND_GROUP_MEMBERS_39002,
      created_at: nowSec(),
      pubkey,
      tags,
      content: JSON.stringify({
        membership_mode: String(input.joinMode || input.membershipMode || 'approval')
      })
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    signed._sent = sent;
    return signed;
  }

  async function publishCommunityModerators39003(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const communityId = String(input.communityId || '').trim();
    if (!communityId) throw new Error('communityId required for kind 39003');
    const d = communityId.split(':')[1] || slugify(communityId);

    const tags = [
      ['d', d],
      ['h', communityId],
      ['client', 'sifaka.live']
    ];
    unique([...(input.moderators || []), ...(input.moderatorPubkeys || [])]).forEach((moderatorPubkey) => tags.push(['p', String(moderatorPubkey), '', 'moderator']));
    unique([...(input.admins || []), ...(input.adminPubkeys || [])]).forEach((adminPubkey) => tags.push(['p', String(adminPubkey), '', 'admin']));

    const unsigned = {
      kind: KIND_GROUP_MODS_39003,
      created_at: nowSec(),
      pubkey,
      tags,
      content: JSON.stringify({
        posting_policy: String(input.postingPolicy || 'members')
      })
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    signed._sent = sent;
    return signed;
  }

  async function publishChannelCreate(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const communityId = String(input.communityId || '').trim();
    if (!communityId) throw new Error('communityId required');

    const channelName = String(input.name || '').trim();
    if (!channelName) throw new Error('channel name required');

    const channelSlug = slugify(input.slug || channelName);
    const communitySlug = communityId.split(':')[1] || 'community';
    const channelId = String(input.channelId || `ch:${communitySlug}:${channelSlug}`);
    const isRoomChannel = ['voice', 'video', 'stage'].includes(String(input.channelType || '').trim().toLowerCase());

    const tags = [
      ['h', communityId],
      ['d', channelSlug],
      ['name', channelName],
      ['category', String(input.category || 'Channels')],
      ['privacy', String(input.privacyLevel || 'public')],
      ['type', String(input.channelType || 'public')],
      ['slow', String(Math.max(0, Number(input.slowModeSec || 0)))],
      ['t', `channel:${channelId}`],
      ['client', 'sifaka.live']
    ];

    const roomProvider = isRoomChannel ? normalizeRoomProvider(input.roomProvider || 'native_nostr') : '';
    const roomStatus = isRoomChannel ? normalizeRoomStatus(input.roomStatus || 'planned') : 'inactive';
    const roomId = isRoomChannel ? String(input.roomId || '').trim() : '';
    const roomUrl = isRoomChannel ? String(input.roomUrl || '').trim() : '';
    const roomNaddr = isRoomChannel ? String(input.roomNaddr || '').trim() : '';
    const roomHostPubkey = isRoomChannel ? String(input.roomHostPubkey || '').trim() : '';
    const roomStartsAt = isRoomChannel ? Math.max(0, Number(input.roomStartsAt || 0)) : 0;
    const roomEndsAt = isRoomChannel ? Math.max(0, Number(input.roomEndsAt || 0)) : 0;
    const roomRecordingUrl = isRoomChannel ? String(input.roomRecordingUrl || '').trim() : '';
    const roomCurrentParticipants = isRoomChannel ? Math.max(0, Number(input.roomCurrentParticipants || 0)) : 0;
    const roomTotalParticipants = isRoomChannel ? Math.max(0, Number(input.roomTotalParticipants || 0)) : 0;
    const roomSpeakers = isRoomChannel
      ? unique((Array.isArray(input.roomSpeakers) ? input.roomSpeakers : []).map((value) => String(value || '').trim()).filter(Boolean))
      : [];
    const roomParticipants = isRoomChannel
      ? unique((Array.isArray(input.roomParticipants) ? input.roomParticipants : []).map((value) => String(value || '').trim()).filter(Boolean))
      : [];

    if (roomId) tags.push(['room_id', roomId]);
    if (roomUrl) tags.push(['room_url', roomUrl], ['streaming', roomUrl]);
    if (roomNaddr) tags.push(['room_naddr', roomNaddr]);
    if (roomHostPubkey) tags.push(['room_host', roomHostPubkey]);
    if (roomStartsAt > 0) tags.push(['room_starts', String(roomStartsAt)]);
    if (roomEndsAt > 0) tags.push(['room_ends', String(roomEndsAt)]);
    if (roomRecordingUrl) tags.push(['room_recording', roomRecordingUrl], ['recording', roomRecordingUrl]);
    if (roomCurrentParticipants > 0) tags.push(['room_current_participants', String(roomCurrentParticipants)]);
    if (roomTotalParticipants > 0) tags.push(['room_total_participants', String(roomTotalParticipants)]);
    if (isRoomChannel) {
      tags.push(['room_provider', roomProvider], ['room_status', roomStatus]);
    }
    roomSpeakers.forEach((pubkeyValue) => tags.push(['room_speaker', pubkeyValue]));
    roomParticipants.forEach((pubkeyValue) => tags.push(['room_participant', pubkeyValue]));

    const contentPayload = {
      name: channelName,
      about: String(input.topic || ''),
      image: String(input.image || '')
    };
    if (isRoomChannel) {
      Object.assign(contentPayload, {
        room_id: roomId,
        room_provider: roomProvider,
        room_url: roomUrl,
        room_naddr: roomNaddr,
        room_status: roomStatus,
        room_host_pubkey: roomHostPubkey,
        room_starts_at: roomStartsAt,
        room_ends_at: roomEndsAt,
        room_current_participants: roomCurrentParticipants,
        room_total_participants: roomTotalParticipants,
        room_recording_url: roomRecordingUrl,
        room_speakers: roomSpeakers,
        room_participants: roomParticipants
      });
    }

    const unsigned = {
      kind: KIND_CHANNEL_CREATE,
      created_at: nowSec(),
      pubkey,
      tags,
      content: JSON.stringify(contentPayload)
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    return {
      event: signed,
      channelId,
      sent
    };
  }

  async function publishMembershipList(input = {}) {
    const pubkey = input.pubkey || await getPubkeyFromSigner();
    const communities = unique(input.communityIds || []);
    const tags = [['d', 'sifaka-communities'], ['client', 'sifaka.live']];
    communities.forEach((communityId) => tags.push(['h', String(communityId)]));

    const unsigned = {
      kind: KIND_COMMUNITY_MEMBERSHIP_LIST,
      created_at: nowSec(),
      pubkey,
      tags,
      content: JSON.stringify({ communities })
    };

    const signed = await signEvent(unsigned);
    const sent = await publish(signed);
    signed._sent = sent;
    return signed;
  }

  function nip19Encode(type, payload) {
    if (!window.NostrTools || !window.NostrTools.nip19) return '';
    try {
      if (type === 'npub' && window.NostrTools.nip19.npubEncode) return window.NostrTools.nip19.npubEncode(payload);
      if (type === 'naddr' && window.NostrTools.nip19.naddrEncode) return window.NostrTools.nip19.naddrEncode(payload);
      if (type === 'note' && window.NostrTools.nip19.noteEncode) return window.NostrTools.nip19.noteEncode(payload);
    } catch (_) {
      return '';
    }
    return '';
  }

  function nip19Decode(value) {
    if (!window.NostrTools || !window.NostrTools.nip19 || !window.NostrTools.nip19.decode) return null;
    try {
      return window.NostrTools.nip19.decode(String(value || '').trim());
    } catch (_) {
      return null;
    }
  }

  function capabilities() {
    return {
      ...NIP_FLAGS,
      signerNip07: !!(window.nostr && typeof window.nostr.signEvent === 'function'),
      signerNip46: false,
      relays: relays.slice(),
      connectedRelays: Array.from(sockets.entries())
        .filter(([, ws]) => ws.readyState === WebSocket.OPEN)
        .map(([url]) => url),
      kinds: {
        groupMeta39000: KIND_GROUP_PRIVATE,
        groupMembers39002: KIND_GROUP_MEMBERS_39002,
        groupModerators39003: KIND_GROUP_MODS_39003
      }
    };
  }

  return {
    connectAll,
    on,
    subscribe,
    closeSubscription,
    closeAllSubscriptions,
    subscribeCommunityGraph,
    publish,
    publishChannelMessage,
    publishReaction,
    publishCommunityCreate,
    publishCommunityMembers39002,
    publishCommunityModerators39003,
    publishChannelCreate,
    publishMembershipList,
    getPubkeyFromSigner,
    nip19Encode,
    nip19Decode,
    capabilities
  };
}

