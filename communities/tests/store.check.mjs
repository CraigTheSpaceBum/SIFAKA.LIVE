import assert from 'node:assert/strict';
import { createCommunityStore } from '../store.js';

const ownerPubkey = '1'.repeat(64);
const guestPubkey = '2'.repeat(64);

const store = createCommunityStore({ currentUserPubkey: ownerPubkey });

const openCreated = store.createCommunity({
  name: 'Open Builders',
  type: 'public',
  joinMode: 'open',
  includeAnnouncements: false,
  includeForum: false,
  includeStaff: false
});
assert.equal(openCreated.ok, true);

const approvalCreated = store.createCommunity({
  name: 'Approval Club',
  type: 'public',
  joinMode: 'approval',
  includeAnnouncements: false,
  includeForum: false,
  includeStaff: false
});
assert.equal(approvalCreated.ok, true);

const inviteCreated = store.createCommunity({
  name: 'Invite Club',
  type: 'public',
  joinMode: 'invite_only',
  includeAnnouncements: false,
  includeForum: false,
  includeStaff: false
});
assert.equal(inviteCreated.ok, true);

const privateCreated = store.createCommunity({
  name: 'Private Ops',
  type: 'private',
  joinMode: 'approval',
  includeAnnouncements: false,
  includeForum: false,
  includeStaff: false
});
assert.equal(privateCreated.ok, true);

const roomCreated = store.createCommunity({
  name: 'Room Guild',
  type: 'public',
  joinMode: 'open',
  includeAnnouncements: false,
  includeForum: false,
  includeStaff: false,
  includeVoiceLounge: true,
  includeVideoRoom: true,
  includeStageRoom: true,
  defaultRoomProvider: 'hivetalk',
  nostrNestsUrl: 'https://nostrnests.com',
  hiveTalkUrl: 'https://vanilla.hivetalk.org'
});
assert.equal(roomCreated.ok, true);
assert.equal(roomCreated.community.defaultRoomProvider, 'hivetalk');
assert.equal(roomCreated.community.hiveTalkUrl, 'https://vanilla.hivetalk.org');
assert.equal(roomCreated.community.nostrNestsUrl, 'https://nostrnests.com');

const seededVoiceRoom = roomCreated.channels.find((channel) => channel.channelType === 'voice');
assert.ok(seededVoiceRoom);
assert.equal(seededVoiceRoom.roomProvider, 'hivetalk');
assert.equal(seededVoiceRoom.roomStatus, 'planned');

const updatedVoiceRoom = store.updateChannel(seededVoiceRoom.id, {
  roomId: 'room-guild-lounge',
  roomStatus: 'live',
  roomHostPubkey: ownerPubkey,
  roomNaddr: 'naddr1voiceguildroom'
});
assert.equal(updatedVoiceRoom.ok, true);
assert.equal(updatedVoiceRoom.channel.roomId, 'room-guild-lounge');
assert.equal(updatedVoiceRoom.channel.roomStatus, 'live');
assert.equal(updatedVoiceRoom.channel.roomNaddr, 'naddr1voiceguildroom');

const stageRoom = store.createChannel({
  communityId: roomCreated.community.id,
  name: 'Town Hall',
  channelType: 'stage',
  privacyLevel: 'public',
  roomProvider: 'nostrnests',
  roomUrl: 'https://njump.me/naddr1townhallroom'
});
assert.equal(stageRoom.ok, true);
assert.equal(stageRoom.channel.channelType, 'stage');
assert.equal(stageRoom.channel.roomProvider, 'nostrnests');
assert.equal(stageRoom.channel.roomUrl, 'https://njump.me/naddr1townhallroom');

store.setCurrentUser(guestPubkey);

const openJoin = store.joinCommunity(openCreated.community.id);
assert.equal(openJoin.ok, true);
assert.equal(openJoin.joined, true);
assert.equal(store.getState().joinedCommunityIds.includes(openCreated.community.id), true);

const approvalJoin = store.joinCommunity(approvalCreated.community.id);
assert.equal(approvalJoin.ok, true);
assert.equal(approvalJoin.requested, true);
assert.equal(store.getState().joinedCommunityIds.includes(approvalCreated.community.id), false);
assert.equal(store.hasPendingJoinRequest(approvalCreated.community.id), true);

const inviteBlocked = store.joinCommunity(inviteCreated.community.id);
assert.equal(inviteBlocked.ok, false);
assert.equal(inviteBlocked.reason, 'invite_required');

const inviteToken = store.createInvite(inviteCreated.community.id);
const resolvedInvite = store.resolveInviteToken(inviteToken);
assert.equal(resolvedInvite.ok, true);
assert.equal(resolvedInvite.communityId, inviteCreated.community.id);

const inviteJoin = store.joinCommunity(inviteCreated.community.id, {
  acceptedInviteToken: inviteToken
});
assert.equal(inviteJoin.ok, true);
assert.equal(inviteJoin.joined, true);
assert.equal(store.getState().joinedCommunityIds.includes(inviteCreated.community.id), true);

const privateBlocked = store.joinCommunity(privateCreated.community.id);
assert.equal(privateBlocked.ok, true);
assert.equal(privateBlocked.requested, true);

const freshStore = createCommunityStore({ currentUserPubkey: guestPubkey });
const freshResolved = freshStore.resolveInviteToken(inviteToken);
assert.equal(freshResolved.ok, true);
assert.equal(freshResolved.communityId, inviteCreated.community.id);
assert.equal(freshStore.getCommunity(inviteCreated.community.id).id, inviteCreated.community.id);

console.log('store checks passed');
