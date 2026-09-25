import { copyText } from '../core/secure';
import type { PhoneDeps } from './apps';
import type { Block, Row } from './canvas-ui';
import type { View } from './phone';

/** Guest friends and private rooms, on the same phone as messages and builds. */
export function friendsApp(d: PhoneDeps): View {
  let notice = '';
  const shownCode = (code: string) => code.match(/.{1,8}/g)?.join(' ') ?? code;
  const socialReady = () => d.social().status === 'Connected';
  const roomBusy = () => ['Connecting', 'Loading', 'Reconnecting'].includes(d.network().status);
  const copy = async (value: string, label: string) => {
    notice = await copyText(value) ? label + ' copied' : 'Clipboard unavailable. The code is shown on this screen.';
    d.phone.refresh();
  };
  const sendFriend = (type: string, friendId: string) => {
    if (!socialReady()) return;
    d.social().send({ type, friendId });
    notice = type === 'friend-request' ? 'Requesting friend…' : '';
    d.phone.refresh();
  };
  const profileView: View = {
    title: 'MY PROFILE', live: true,
    page: () => {
      const s = d.social();
      return { blocks: [
        { type: 'title', text: 'MY PROFILE', sub: s.status.toUpperCase() },
        { type: 'card', title: s.name || 'GUEST RIDER', icon: 'rider', lines: ['Your friend code', s.id ? s.id.slice(0, 8) + '…' : 'Connecting…'] },
        { type: 'text', text: s.id ? 'Code: ' + shownCode(s.id) + ' (ignore spaces when typing)' : 'Your code will appear when Friends connects.', muted: true },
        { type: 'text', text: 'Guest friends stay with this browser. They are not synced to an account.' + (s.persistent ? '' : ' Contacts reset when the friend service restarts.'), muted: true },
        ...(notice || s.lastError ? [{ type: 'text', text: s.lastError || notice } as Block] : []),
        { type: 'list', rows: [
          { id: 'copy-code', label: 'COPY MY CODE', disabled: !s.id, action: () => { void copy(s.id, 'Friend code'); } },
          { id: 'name', label: 'CHANGE DISPLAY NAME', detail: s.name, disabled: !socialReady(), action: () => { const name = prompt('Your guest display name', s.name)?.trim(); if (name) { void s.setName(name); notice = 'Updating name…'; } } },
        ] },
      ] };
    },
  };
  const friendView = (id: string): View => ({
    title: 'FRIEND', live: true,
    page: () => {
      const s = d.social(), friend = s.friends.find(f => f.id === id);
      if (!friend) return { blocks: [{ type: 'title', text: 'FRIEND', sub: 'No longer in your list' }] };
      const net = d.network(), peer = net.roster.find(p => p.friendId === id && p.connected !== false);
      const rows: Row[] = [
        { id: 'invite', label: 'INVITE TO ROOM', detail: 'Send a lobby invitation', disabled: !friend.online || net.status !== 'Connected', action: () => { net.send({ type: 'invite', generation: net.generation, friendId: id }); notice = 'Invitation requested'; d.phone.refresh(); } },
        { id: 'teleport', label: 'TELEPORT TO FRIEND', detail: 'Join their spot in this room', disabled: !peer || net.status !== 'Connected', action: () => d.phone.close(() => { if (!peer || !d.teleportToPlayer(peer.id)) d.phone.notify('Friends', 'Could not teleport to that rider.', 'rider'); }) },
        { id: 'remove', label: 'REMOVE FRIEND…', disabled: !socialReady(), action: () => d.phone.sheet('REMOVE ' + friend.name.toUpperCase() + '?', [
          { label: 'KEEP FRIEND', action: () => {} },
          { label: 'REMOVE FRIEND', action: () => sendFriend('friend-remove', id) },
        ], 'This removes the friend from your list') },
      ];
      return { blocks: [
        { type: 'title', text: friend.name.toUpperCase(), sub: friend.online ? 'ONLINE' : 'OFFLINE' },
        { type: 'text', text: 'Friend code: ' + shownCode(friend.id), muted: true },
        ...(s.lastError || net.lastError || notice ? [{ type: 'text', text: s.lastError || net.lastError || notice } as Block] : []),
        { type: 'list', rows },
      ] };
    },
  });
  const roomView: View = {
    title: 'PRIVATE ROOM', live: true,
    page: () => {
      const net = d.network(), inRoom = !!net.id, busy = roomBusy();
      const rows: Row[] = inRoom ? [
        { id: 'copy-room', label: 'COPY INVITE', detail: 'Share this room code', disabled: !net.code, action: () => { void copy(location.origin + location.pathname + '#room=' + encodeURIComponent(net.code), 'Room invite'); } },
        { id: 'leave', label: 'LEAVE ROOM', disabled: busy, action: () => { net.leave(); notice = 'You left the room'; } },
        ...(net.owner === net.id ? [
          { id: 'lock', label: net.locked ? 'UNLOCK ROOM' : 'LOCK ROOM', detail: net.locked ? 'Allow friends to join again' : 'Stop new joins', disabled: busy, action: () => net.send({ type: 'lock', locked: !net.locked }) } as Row,
        ] : []),
      ] : [
        { id: 'create', label: 'CREATE PRIVATE ROOM', disabled: busy || !net.endpoint, action: () => d.phone.close(() => { void net.connect('create', d.social().name || 'Rider'); }) },
        { id: 'join', label: 'JOIN ROOM', disabled: busy || !net.endpoint, action: () => {
          const input = prompt('Paste invite link or room code', '')?.trim();
          if (!input) return;
          let code = input;
          try { if (input.includes('#room=')) code = decodeURIComponent(input.split('#room=')[1].split('&')[0]); }
          catch { notice = 'Check that invite link and try again.'; d.phone.refresh(); return; }
          d.phone.close(() => { void net.connect('join', d.social().name || 'Rider', code); });
        } },
      ];
      const blocks: Block[] = [
        { type: 'title', text: 'PRIVATE ROOM', sub: net.status.toUpperCase() + (net.locked ? ' · LOCKED' : '') },
        ...(inRoom ? [{ type: 'text', text: 'Room code: ' + net.code, muted: true } as Block] : []),
        ...(net.lastError ? [{ type: 'text', text: net.lastError } as Block] : []),
        { type: 'list', rows },
      ];
      if (inRoom) {
        blocks.push({ type: 'title', text: 'RIDERS', sub: net.roster.length + ' in this room' });
        blocks.push({ type: 'list', rows: net.roster.map(p => ({
          id: 'rider-' + p.id,
          label: p.name.toUpperCase() + (p.id === net.id ? ' / YOU' : ''),
          detail: p.connected === false ? 'Reconnecting' : p.id === net.owner ? 'Room owner' : 'Connected',
          disabled: p.id === net.id,
          action: () => d.phone.push(riderView(p.id)),
        })) });
      }
      return { blocks };
    },
  };
  const riderView = (id: string): View => ({
    title: 'RIDER', live: true,
    page: () => {
      const net = d.network(), s = d.social(), rider = net.roster.find(p => p.id === id);
      if (!rider) return { blocks: [{ type: 'title', text: 'RIDER', sub: 'Left the room' }] };
      const friendId = typeof rider.friendId === 'string' ? rider.friendId : '';
      const alreadyFriend = s.friends.some(f => f.id === friendId);
      const requested = s.outgoing.some(f => f.id === friendId);
      const incoming = s.requests.some(f => f.id === friendId);
      const rows: Row[] = [
        { id: 'teleport', label: 'TELEPORT TO RIDER', disabled: net.status !== 'Connected' || rider.connected === false, action: () => d.phone.close(() => { if (!d.teleportToPlayer(id)) d.phone.notify('Friends', 'Could not teleport to that rider.', 'rider'); }) },
        { id: 'mute', label: net.muted.has(id) ? 'UNMUTE RIDER' : 'MUTE RIDER', disabled: roomBusy(), action: () => { net.muted.has(id) ? net.muted.delete(id) : net.muted.add(id); d.phone.refresh(); } },
        { id: 'add-friend', label: incoming ? 'ACCEPT FRIEND REQUEST' : requested ? 'REQUEST PENDING' : alreadyFriend ? 'ALREADY FRIENDS' : 'ADD FRIEND', disabled: !friendId || !socialReady() || alreadyFriend || requested, action: () => sendFriend(incoming ? 'friend-accept' : 'friend-request', friendId) },
        ...(net.owner === net.id ? [{ id: 'kick', label: 'REMOVE FROM ROOM…', disabled: roomBusy(), action: () => d.phone.sheet('REMOVE ' + rider.name.toUpperCase() + '?', [
          { label: 'KEEP RIDER', action: () => {} },
          { label: 'REMOVE RIDER', action: () => net.send({ type: 'kick', id }) },
        ], 'They can rejoin unless the room is locked') } as Row] : []),
      ];
      return { blocks: [
        { type: 'title', text: rider.name.toUpperCase(), sub: rider.connected === false ? 'RECONNECTING' : 'IN YOUR ROOM' },
        ...(s.lastError || net.lastError || notice ? [{ type: 'text', text: s.lastError || net.lastError || notice } as Block] : []),
        { type: 'list', rows },
      ] };
    },
  });
  return {
    title: 'FRIENDS', live: true,
    page: () => {
      const s = d.social(), net = d.network();
      const blocks: Block[] = [
        { type: 'title', text: 'FRIENDS', sub: s.status.toUpperCase() },
      ];
      if (notice || s.lastError || net.lastError) blocks.push({ type: 'text', text: s.lastError || net.lastError || notice });
      blocks.push({ type: 'list', rows: [
        { id: 'room', label: 'PRIVATE ROOM', detail: net.status + (net.roster.length ? ' · ' + net.roster.length + ' riders' : ''), action: () => d.phone.push(roomView) },
        { id: 'profile', label: 'MY PROFILE / CODE', detail: s.name, action: () => d.phone.push(profileView) },
        { id: 'add', label: 'ADD FRIEND BY CODE', disabled: !socialReady(), action: () => { const code = prompt('Friend code', '')?.replace(/\s+/g, ''); if (code && code !== s.id) sendFriend('friend-request', code); } },
        ...(!socialReady() ? [{ id: 'retry', label: 'RETRY FRIENDS CONNECTION', disabled: s.status === 'Connecting', action: () => { void s.connect(); } } as Row] : []),
      ] });
      const invites = s.invites.filter(i => i.expiresAt > Date.now());
      if (invites.length) {
        blocks.push({ type: 'title', text: 'ROOM INVITES', sub: invites.length + ' waiting' });
        blocks.push({ type: 'list', rows: invites.flatMap(i => [
          { id: 'invite-accept-' + i.id, label: 'JOIN ' + i.name.toUpperCase(), detail: 'Room invitation', disabled: roomBusy() || !socialReady(), action: () => d.phone.close(() => s.send({ type: 'invite-accept', id: i.id })) },
          { id: 'invite-decline-' + i.id, label: 'DECLINE ' + i.name.toUpperCase(), disabled: !socialReady(), action: () => s.send({ type: 'invite-decline', id: i.id }) },
        ]) });
      }
      if (s.requests.length) {
        blocks.push({ type: 'title', text: 'FRIEND REQUESTS', sub: s.requests.length + ' incoming' });
        blocks.push({ type: 'list', rows: s.requests.flatMap(r => [
          { id: 'accept-' + r.id, label: 'ACCEPT ' + r.name.toUpperCase(), disabled: !socialReady(), action: () => sendFriend('friend-accept', r.id) },
          { id: 'decline-' + r.id, label: 'DECLINE ' + r.name.toUpperCase(), disabled: !socialReady(), action: () => sendFriend('friend-decline', r.id) },
        ]) });
      }
      if (s.outgoing.length) {
        blocks.push({ type: 'title', text: 'SENT REQUESTS', sub: s.outgoing.length + ' pending' });
        blocks.push({ type: 'list', rows: s.outgoing.map(r => ({ id: 'out-' + r.id, label: r.name.toUpperCase(), detail: 'Awaiting reply', disabled: true })) });
      }
      blocks.push({ type: 'title', text: 'YOUR FRIENDS', sub: s.friends.length + ' saved' });
      blocks.push(s.friends.length ? { type: 'list', rows: [...s.friends].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)).map(f => ({
        id: 'friend-' + f.id, label: f.name.toUpperCase(), detail: f.online ? 'ONLINE' : 'OFFLINE', action: () => d.phone.push(friendView(f.id)),
      })) } : { type: 'text', text: 'Share your code, then add a friend using theirs.', muted: true });
      return { blocks };
    },
  };
}
