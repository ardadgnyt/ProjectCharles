'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  QuickShareEngine,
  QrKeySession,
  encodeEndpointInfo,
  parseEndpointInfo,
  buildMdnsQuery,
  buildMdnsAnnouncement,
  parseMdnsPacket,
  computePin,
  renderQrSvg,
} = require('../app/files/quickshare.cjs');
const {
  AirDropEngine,
  encodeBplist,
  decodeBplist,
  packCpioGzip,
  extractCpioGzip,
} = require('../app/files/airdrop.cjs');
const { ShareService } = require('../app/files/share.cjs');
const { Sessions } = require('../app/ai/sessions.cjs');

test('v0.9.2 · WhatsApp bildirim balonu donma ve tıklama düzeltmeleri', () => {
  const bubblePlugin = fs.readFileSync(path.join(__dirname, '../app/plugins/mail-bubble.cjs'), 'utf8');
  const bubbleJs = fs.readFileSync(path.join(__dirname, '../public/bubble.js'), 'utf8');
  const mainCjs = fs.readFileSync(path.join(__dirname, '../app/main.cjs'), 'utf8');

  // 1. Window is focusable without WS_EX_NOACTIVATE w.setFocusable(false) toggle
  assert.match(bubblePlugin, /focusable:\s*true/);
  assert.ok(!bubblePlugin.includes('w.setFocusable(false)'), 'w.setFocusable(false) olmamalı');
  assert.match(bubblePlugin, /active\(\)\s*\{/);

  // 2. waHost and mailHost are permanent children of #stack; actOnPress and dismissButton exist in all modes
  assert.match(bubbleJs, /stack\.append\(waHost,\s*mailHost\)/);
  assert.ok(!bubbleJs.includes('stack.replaceChildren('), 'stack.replaceChildren waHost odak kaybına yol açmamalı');
  assert.match(bubbleJs, /function actOnPress\(/);
  assert.match(bubbleJs, /Promise\.race\(/);

  // 3. main.cjs panel-pointer-enter and blur check mailBubble
  assert.match(mainCjs, /safeHandler\('panel-pointer-enter'[\s\S]*?mailBubble\?\.contains\(p\)/);
  assert.match(mainCjs, /!mailBubble\?\.active\(\)/);
});

test('v0.9.2 · Küçük adacıkta yarı boy Dönüştürücü, Gönder kartı ve yeni Alım Modu seçici', () => {
  const shelfTs = fs.readFileSync(path.join(__dirname, '../src/island/shelf.ts'), 'utf8');
  const shareTs = fs.readFileSync(path.join(__dirname, '../src/island/share.ts'), 'utf8');
  const css092 = fs.readFileSync(path.join(__dirname, '../public/styles/25-v092.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  assert.match(shelfTs, /shelf-col shelf-col-mid/);
  assert.match(shelfTs, /card card-send/);
  assert.match(shareTs, /share-mode-seg/);
  assert.match(shareTs, /share-mode-pill/);
  assert.match(css092, /#shelf \.shelf-col\.shelf-col-mid/);
  assert.match(css092, /#shelf \.shelf-col-mid \.card-convert,\s*#shelf \.shelf-col-mid \.card-send/);
  assert.match(css092, /\.share-mode-pill\.active/);
  assert.match(html, /styles\/25-v092\.css/);
});

test('v0.9.2 · AppData\\Roaming\\Charles bağlantısı ve sohbet geçmişi kurtarma (recoverNonEmpty)', () => {
  const mainCjs = fs.readFileSync(path.join(__dirname, '../app/main.cjs'), 'utf8');
  assert.match(mainCjs, /app\.setName\('Charles'\)/);
  assert.match(mainCjs, /app\.setPath\('userData',\s*path\.join\(roaming,\s*'Charles'\)\)/);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-hist-rec-'));
  try {
    const histFile = path.join(tmp, 'charles-history.json');
    // Simulate main file accidentally overwritten with empty rooms while .bak has actual chat history
    fs.writeFileSync(
      histFile,
      JSON.stringify({ version: 1, active: 'r0', rooms: [{ id: 'r0', name: 'Yeni sohbet', events: [] }] }),
    );
    fs.writeFileSync(
      histFile + '.bak',
      JSON.stringify({
        version: 1,
        active: 'r1',
        rooms: [
          {
            id: 'r1',
            name: 'Önceki Sohbetim',
            model: 'claude:claude-sonnet-4-5',
            events: [{ type: 'history-user', data: 'Merhaba Charles!' }],
          },
        ],
      }),
    );
    const sessions = new Sessions(tmp, tmp);
    const list = sessions.list();
    assert.ok(list.some((r) => r.name === 'Önceki Sohbetim'), 'Yedekten sohbet geçmişi kurtarılmalı');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('v0.9.2 · Quick Share EndpointInfo, PIN, QR SVG ve ECDSA imzası üretimi', () => {
  const raw = encodeEndpointInfo('Charles Test PC', 3);
  const parsed = parseEndpointInfo(raw);
  assert.equal(parsed.name, 'Charles Test PC');
  assert.equal(parsed.deviceType, 'laptop');

  const pin = computePin(Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc]));
  assert.equal(pin.length, 4);
  assert.match(pin, /^\d{4}$/);

  const qr = new QrKeySession();
  assert.match(qr.url, /^https:\/\/quickshare\.google\/qrcode#key=/);
  assert.match(qr.svg, /^data:image\/svg\+xml;base64,/);
  const sig = qr.signAuthString(Buffer.alloc(32, 0x42));
  assert.ok(Buffer.isBuffer(sig) && sig.length === 64, 'IEEE-P1363 ECDSA imzası 64 bayt olmalı');

  const svgDataUrl = renderQrSvg('https://quickshare.google/qrcode#key=test1234567890');
  assert.match(svgDataUrl, /^data:image\/svg\+xml;base64,/);

  const qPkt = buildMdnsQuery(['_airdrop._tcp.local', '_FC9F5ED42C8A._tcp.local.']);
  const parsedQ = parseMdnsPacket(qPkt);
  assert.equal(parsedQ.questions.length, 2);

  const annPkt = buildMdnsAnnouncement({
    service: '_airdrop._tcp.local',
    instanceName: 'test-airdrop',
    hostName: 'charles-test',
    ip: '192.168.1.42',
    port: 8770,
    txtEntries: ['flags=139'],
  });
  const parsedAnn = parseMdnsPacket(annPkt);
  assert.equal(parsedAnn.records.length, 4);
  const srvRec = parsedAnn.records.find((r) => r.type === 33);
  const txtRec = parsedAnn.records.find((r) => r.type === 16);
  const aRec = parsedAnn.records.find((r) => r.type === 1);
  assert.equal(srvRec.port, 8770);
  assert.equal(txtRec.txt.flags, '139');
  assert.equal(aRec.ip, '192.168.1.42');
});

test('v0.9.2 · AirDrop bplist00 ve CPIO/gzip arşiv kodlayıcı/çözücü', () => {
  const original = {
    SenderComputerName: 'Charles PC',
    SenderModelName: 'Windows PC',
    ConvertMediaFormats: false,
    Files: [
      { FileName: 'merhaba.txt', FileType: 'public.plain-text', FileIsDirectory: false },
    ],
  };
  const encoded = encodeBplist(original);
  assert.equal(encoded.subarray(0, 8).toString('ascii'), 'bplist00');
  const decoded = decodeBplist(encoded);
  assert.equal(decoded.SenderComputerName, 'Charles PC');
  assert.equal(decoded.ConvertMediaFormats, false);
  assert.equal(decoded.Files[0].FileName, 'merhaba.txt');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-cpio-'));
  try {
    const srcFile = path.join(tmp, 'deneme.txt');
    fs.writeFileSync(srcFile, 'AirDrop CPIO içerik testi 12345', 'utf8');
    const outDir = path.join(tmp, 'out');
    fs.mkdirSync(outDir);
    const gz = packCpioGzip([srcFile]);
    const extracted = extractCpioGzip(gz, outDir);
    assert.equal(extracted.length, 1);
    assert.equal(extracted[0].name, 'deneme.txt');
    assert.equal(fs.readFileSync(extracted[0].path, 'utf8'), 'AirDrop CPIO içerik testi 12345');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('v0.9.2 · Quick Share uçtan uca (UKEY2 + AES-256-CBC/HMAC) dosya gönderme ve alma', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-qs-'));
  const srcFile = path.join(tmp, 'rapor.txt');
  const payload = 'Merhaba Quick Share! '.repeat(300);
  fs.writeFileSync(srcFile, payload, 'utf8');
  const recvDir = path.join(tmp, 'downloads');

  const receiver = new QuickShareEngine({ deviceName: 'Alıcı PC', downloadDir: recvDir });
  const sender = new QuickShareEngine({ deviceName: 'Gönderici PC', downloadDir: tmp });

  let offeredPin = null;
  let senderPin = null;
  receiver.on('offer', (offer) => {
    offeredPin = offer.pin;
    offer.respond(true);
  });

  const receivedPromise = new Promise((resolve, reject) => {
    receiver.once('received', resolve);
    receiver.once('transfer-error', (e) => reject(Error(e.error)));
  });

  try {
    const port = await receiver.start();
    await sender.sendFiles({
      host: '127.0.0.1',
      port,
      files: [srcFile],
      onPin: (pin) => {
        senderPin = pin;
      },
    });
    const rec = await receivedPromise;
    assert.equal(rec.files.length, 1);
    assert.equal(rec.files[0].name, 'rapor.txt');
    assert.equal(fs.readFileSync(rec.files[0].path, 'utf8'), payload);
    assert.ok(senderPin && senderPin === offeredPin, 'UKEY2 PIN her iki tarafta aynı olmalı');
  } finally {
    receiver.stop();
    sender.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('v0.9.2 · AirDrop uçtan uca (/Discover -> /Ask -> /Upload) dosya gönderme ve alma', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-ad-'));
  const srcFile = path.join(tmp, 'fotograf.txt');
  const payload = 'AirDrop üzerinden gönderilen dosya içeriği! '.repeat(200);
  fs.writeFileSync(srcFile, payload, 'utf8');
  const recvDir = path.join(tmp, 'downloads');

  const receiver = new AirDropEngine({ deviceName: 'iPhone Test', downloadDir: recvDir });
  const sender = new AirDropEngine({ deviceName: 'Charles PC', downloadDir: tmp });

  receiver.on('offer', (offer) => {
    offer.respond(true);
  });

  const receivedPromise = new Promise((resolve, reject) => {
    receiver.once('received', resolve);
    receiver.once('error', reject);
  });

  try {
    const port = await receiver.start();
    await sender.sendFiles({
      host: '127.0.0.1',
      port,
      files: [srcFile],
    });
    const rec = await receivedPromise;
    assert.equal(rec.files.length, 1);
    assert.equal(rec.files[0].name, 'fotograf.txt');
    assert.equal(fs.readFileSync(rec.files[0].path, 'utf8'), payload);
  } finally {
    receiver.stop();
    sender.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('v0.9.2 · ShareService dosya hazırlama ve görünürlük modu yönetimi', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'charles-share-svc-'));
  const f1 = path.join(tmp, 'test.txt');
  fs.writeFileSync(f1, 'merhaba', 'utf8');
  const svc = new ShareService({ userData: tmp, downloadDir: tmp });
  try {
    await svc.start();
    const st1 = svc.stageFiles([f1]);
    assert.equal(st1.stagedFiles.length, 1);
    assert.equal(st1.stagedFiles[0].name, 'test.txt');

    const st2 = svc.setReceiveMode('auto');
    assert.equal(st2.receiveMode, 'auto');

    const st3 = svc.removeStagedFile(f1);
    assert.equal(st3.stagedFiles.length, 0);
  } finally {
    svc.stop();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
