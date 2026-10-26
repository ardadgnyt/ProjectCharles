'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { WhatsAppLive } = require('../app/plugins/whatsapp-live.cjs');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1cAAAAASUVORK5CYII=', 'base64');
const json = value => new Response(JSON.stringify({ status: 200, results: value }), { headers: { 'Content-Type': 'application/json' } });

function fixture(fetch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-wa-photo-'));
  const live = new WhatsAppLive({ dir, fetch });
  live.port = 54321; live.auth = 'test:local-only';
  const message = { id: 'photo-1', chat: '123456789@s.whatsapp.net', kind: 'image', media: 'Fotoğraf', mine: false, name: 'Test', at: Date.now() };
  const chat = { jid: message.chat, messages: [message], name: 'Test', unread: 1 };
  live.chats.set(chat.jid, chat);
  return { live, chat, message, async close() { await live.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

test('GOWA 9.6 file_url becomes a visible photo through authenticated loopback requests', async () => {
  const calls = [];
  const f = fixture(async (url, options) => {
    calls.push(url);
    assert.equal(new URL(url).origin, 'http://127.0.0.1:54321');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['X-Device-Id'], 'charles');
    return url.includes('/download?') ? json({ media_type: 'image', filename: 'photo.png', file_url: 'http://127.0.0.1:54321/statics/media/photo.png', file_size: png.length })
      : new Response(png, { headers: { 'Content-Type': 'application/octet-stream' } });
  });
  try {
    assert.equal(await f.live.photo(f.chat, f.message), true);
    assert.equal(f.message.image, 'data:image/png;base64,' + png.toString('base64'));
    assert.equal(calls.length, 2);
    const conversation = await f.live.conversation(f.chat.jid);
    assert.equal(conversation.messages[0].image, f.message.image);
  } finally { await f.close(); }
});

test('legacy Base64, direct binary and Windows static paths remain supported', async () => {
  for (const format of ['base64', 'binary', 'path']) {
    const f = fixture(async url => {
      if (!url.includes('/download?')) return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      if (format === 'binary') return new Response(png, { headers: { 'Content-Type': 'image/png' } });
      if (format === 'base64') return json({ mime_type: 'image/png', data: png.toString('base64') });
      return json({ media_type: 'image', file_path: 'statics\\media\\photo.png' });
    });
    try { assert.equal(await f.live.photo(f.chat, f.message), true, format); }
    finally { await f.close(); }
  }
});

test('temporary message-storage lag retries instead of permanently hiding the photo', async () => {
  let requests = 0;
  const f = fixture(async () => ++requests === 1 ? new Response('not yet stored', { status: 404 }) : new Response(png));
  try {
    assert.equal(await f.live.photo(f.chat, f.message), true);
    assert.equal(requests, 2);
    assert.ok(f.message.image);
  } finally { await f.close(); }
});

test('concurrent downloads coalesce and update a refreshed conversation object', async () => {
  let release, requests = 0;
  const wait = new Promise(resolve => release = resolve);
  const f = fixture(async () => { requests++; await wait; return new Response(png); });
  try {
    const one = f.live.photo(f.chat, f.message);
    const replacement = { ...f.message };
    f.chat.messages = [replacement];
    const two = f.live.photo(f.chat, replacement);
    release();
    assert.deepEqual(await Promise.all([one, two]), [true, true]);
    assert.equal(requests, 1);
    assert.equal(replacement.image, f.message.image);
  } finally { await f.close(); }
});

test('photo URLs cannot send bridge credentials outside its static loopback origin', async () => {
  for (const file_url of ['https://example.com/photo.png', 'http://127.0.0.1:55555/statics/photo.png', 'http://127.0.0.1:54321/app/logout', '/statics/%2e%2e/app/logout', '/statics/%2fsecret', 'file:///C:/private.png']) {
    let requests = 0;
    const f = fixture(async () => { requests++; return json({ file_url }); });
    try {
      assert.equal(await f.live.photo(f.chat, f.message), false, file_url);
      assert.equal(requests, 1);
      assert.equal(f.message.image, undefined);
    } finally { await f.close(); }
  }
});

test('photo update preserves the notification update flag and does not reopen the card', async () => {
  const f = fixture(async () => new Response(png));
  f.live.chats.clear();
  const messages = [];
  const update = new Promise(resolve => f.live.on('message', value => { messages.push(value); if (value.update) resolve(value); }));
  try {
    f.live.receive(f.message);
    const result = await update;
    assert.ok(result.image);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].update, undefined);
    assert.equal(messages[1].update, true);
  } finally { await f.close(); }
});

test('shutdown discards an outstanding photo response', async () => {
  let release;
  const wait = new Promise(resolve => release = resolve);
  const f = fixture(async () => { await wait; return new Response(png); });
  try {
    const download = f.live.photo(f.chat, f.message);
    await f.live.stop();
    release();
    assert.equal(await download, false);
    assert.equal(f.message.image, undefined);
  } finally { await f.close(); }
});
