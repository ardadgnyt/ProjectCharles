// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.21: the cards for a file coming in while the app window is open. The island shows an offer on
// its own panel, which is not on screen there, so an offer waited unseen until it ran out. Names come
// from another device: the card window puts them on screen as text only.
// v1.0.0: built with the shared card shape (plugins/notice-cards.cjs); the sender's name is a var,
// never part of the translated text.
const { card, protocol: source } = require('../plugins/notice-cards.cjs');
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

/** v1.0.0 (bughunt): filesLine() for a card: a size with decimals is the number var {size}, which
 *  the card window writes in the interface language ("2,4 MB" in Turkish, "2.4 MB" in English). */
function filesCard(files) {
  const total = (Array.isArray(files) ? files : []).reduce((s, f) => s + (Number(f?.size) || 0), 0);
  const line = filesLine(files);
  if (!(total >= 1024 * 1024)) return { line, vars: {} };
  const big = total >= 1024 * 1024 * 1024;
  const size = Math.round((total / (big ? 1073741824 : 1048576)) * 10) / 10;
  return { line: line.replace(/ · [\d.]+ [MG]B$/, ' · {size} ' + (big ? 'GB' : 'MB')), vars: { size } };
}

const askId = (id) => 'share|' + id;
const RECEIVING = 'share|receiving';

/** The question. It has no ×: leaving it unanswered is not an answer, the two buttons are. */
function offerCard(offer) {
  const files = filesCard(offer.files);
  return card({
    id: askId(offer.id),
    plain: true,
    source: source(offer.protocol),
    icon: 'send',
    title: '{peer} dosya göndermek istiyor',
    vars: { peer: peer(offer.peerName), ...files.vars },
    reason: [files.line, offer.pin ? 'PIN ' + String(offer.pin).slice(0, 12) : ''].filter(Boolean).join(' · '),
    choices: [
      { id: 'accept', label: 'Kabul et', primary: true },
      { id: 'decline', label: 'Reddet' },
    ],
    t: ['title'],
  });
}

function receivingCard(offer) {
  const files = filesCard(offer.files);
  return card({
    id: RECEIVING,
    plain: true,
    source: source(offer.protocol),
    from: peer(offer.peerName),
    icon: 'download',
    title: 'Dosya alınıyor',
    reason: files.line,
    vars: files.vars,
    t: ['title'],
  });
}

/** Done: a click shows the file in its folder (`reveal`, handled by main's focus()). */
function receivedCard(entry, fallback = '') {
  const files = filesCard(entry.files);
  return card({
    id: 'share|done|' + entry.id,
    plain: true,
    source: source(entry.protocol),
    from: peer(entry.peerName),
    icon: 'file',
    title: 'Dosya alındı',
    reason: files.line,
    vars: files.vars,
    action: 'Klasörde göster',
    reveal: entry.files?.[0]?.path || fallback,
    ttl: 60000,
    t: ['title', 'action'],
  });
}

module.exports = { offerCard, receivingCard, receivedCard, filesLine, filesCard, askId, RECEIVING };
