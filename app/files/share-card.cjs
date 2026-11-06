// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.21: the cards for a file coming in while the app window is open. The island shows an offer on
// its own panel, which is not on screen there, so an offer waited unseen until it ran out. Names come
// from another device: the card window puts them on screen as text only.
const PROTOCOLS = { localsend: 'LocalSend', airdrop: 'AirDrop' };
const source = (protocol) => PROTOCOLS[protocol] || 'Quick Share';
const peer = (name) => String(name || '').trim().slice(0, 60) || 'Bir cihaz';

function bytes(n) {
  if (!(n > 0)) return '';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(1) + ' GB';
}

/** "rapor.pdf · 2.4 MB", "rapor.pdf +2 · 2.4 MB" */
function filesLine(files) {
  const list = Array.isArray(files) ? files : [];
  const first = String(list[0]?.name || '').slice(0, 80);
  const total = list.reduce((s, f) => s + (Number(f?.size) || 0), 0);
  return [first + (list.length > 1 ? ' +' + (list.length - 1) : ''), bytes(total)].filter(Boolean).join(' · ');
}

const askId = (id) => 'share|' + id;
const RECEIVING = 'share|receiving';

/** The question. It has no ×: leaving it unanswered is not an answer, the two buttons are. */
function offerCard(offer) {
  return {
    id: askId(offer.id),
    kind: 'charles',
    plain: true,
    source: source(offer.protocol),
    icon: '📥',
    title: peer(offer.peerName),
    lead: 'Sana dosya göndermek istiyor',
    reason: [filesLine(offer.files), offer.pin ? 'PIN: ' + String(offer.pin).slice(0, 12) : ''].filter(Boolean).join(' · '),
    choices: [
      { id: 'accept', label: 'Kabul et', primary: true },
      { id: 'decline', label: 'Reddet' },
    ],
  };
}

function receivingCard(offer) {
  return {
    id: RECEIVING,
    kind: 'charles',
    plain: true,
    source: source(offer.protocol),
    icon: '📥',
    title: peer(offer.peerName),
    lead: 'Dosya alınıyor',
    reason: filesLine(offer.files),
  };
}

/** Done: a click shows the file in its folder (`reveal`, handled by main's focus()). */
function receivedCard(entry, fallback = '') {
  return {
    id: 'share|done|' + entry.id,
    kind: 'charles',
    plain: true,
    source: source(entry.protocol),
    icon: '✓',
    title: peer(entry.peerName),
    lead: 'Dosya alındı',
    reason: filesLine(entry.files),
    reveal: entry.files?.[0]?.path || fallback,
    ttl: 60000,
  };
}

module.exports = { offerCard, receivingCard, receivedCard, filesLine, askId, RECEIVING };
