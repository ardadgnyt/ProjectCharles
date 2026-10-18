// Merhaba Modülü — every part of window.charlesModule (API v1). No network, no Node.js:
// everything goes through Charles.
const C = window.charlesModule;
const $ = (id) => document.getElementById(id);
const status = (text, error = false) => {
  $('status').textContent = text;
  $('status').classList.toggle('error', error);
};
const run = async (button, job) => {
  if (button) button.disabled = true;
  try {
    await job();
  } catch (e) {
    status(e.message, true);
  } finally {
    if (button) button.disabled = false;
  }
};

async function start() {
  const info = await C.info();
  $('info').textContent = `v${info.version} · Charles ${info.charlesVersion} · dil: ${info.language} · izinler: ${info.permissions.join(', ')}`;
  C.on('language', (lang) => status('Charles’ın dili değişti: ' + lang));
  const note = await C.storage.getJSON('note.json', null);
  if (note) $('note').value = note.text;
}

let lastAnswer = '';
$('ask').onsubmit = (e) => {
  e.preventDefault();
  const q = $('question').value.trim();
  if (!q) return;
  const button = e.submitter;
  run(button, async () => {
    $('answer').textContent = 'Düşünüyor…';
    lastAnswer = await C.ai.chat({
      system: 'Kısa ve sıcak Türkçe yanıtlar ver.',
      messages: [{ role: 'user', content: q }],
    });
    $('answer').textContent = lastAnswer;
    status('Yanıt geldi.');
  });
};
$('speak').onclick = () => run($('speak'), async () => {
  if (!lastAnswer) throw new Error('Önce yapay zekâya bir şey sor.');
  await C.voice.speak(lastAnswer);
});
$('stop').onclick = () => run(null, () => C.voice.stop());

$('draw').onsubmit = (e) => {
  e.preventDefault();
  const prompt = $('prompt').value.trim();
  if (!prompt) return;
  run(e.submitter, async () => {
    $('image').textContent = 'Görsel oluşturuluyor… (bu bir dakika kadar sürebilir)';
    const img = await C.ai.image({ prompt });
    const el = document.createElement('img');
    el.src = img.url;
    el.alt = prompt;
    $('image').replaceChildren(el);
    status('Görsel kaydedildi: ' + img.path);
  });
};

$('save').onclick = () => run($('save'), async () => {
  await C.storage.setJSON('note.json', { text: $('note').value, savedAt: new Date().toISOString() });
  status('Not kaydedildi.');
});
$('load').onclick = () => run($('load'), async () => {
  const note = await C.storage.getJSON('note.json', null);
  $('storage').textContent = note ? `${note.savedAt}\n${note.text}` : 'Henüz kayıt yok.';
});
$('files').onclick = () => run($('files'), async () => {
  const files = await C.storage.listFiles();
  $('storage').textContent = files.length
    ? files.map((f) => (f.dir ? '📁 ' : '📄 ') + f.path + (f.dir ? '' : ` (${f.size} bayt)`)).join('\n')
    : 'Veri klasörü boş.';
});

const EMOTES = { love: 'Sevgi', surprised: 'Şaşkın', proud: 'Gururlu', wink: 'Göz kırp', yawn: 'Esne', happy: 'Mutlu', annoyed: 'Sinirli' };
for (const [name, label] of Object.entries(EMOTES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = () => run(b, async () => {
    await C.slime.emote(name);
    status('Slime: ' + label);
  });
  $('emotes').append(b);
}
$('notify').onclick = () => run($('notify'), async () => {
  await C.notify('Merhaba Modülü’nden selam!');
  status('Bildirim gönderildi.');
});

start().catch((e) => status(e.message, true));
