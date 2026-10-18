// v0.8.0: ai.image for modules — the same way the chat creates images: a short background
// Codex connection with the built-in image_generation tool (task "image", app/core/task-mode.cjs).
// Nothing is written to the chat history. Needs the ChatGPT (Codex) sign-in.
const { Agent } = require('../ai/agent.cjs');

/** The image of an imageGeneration item as plain base64 (PNG/JPEG/WebP). */
function imageBase64(result) {
  const s = String(result || '');
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/s.exec(s);
  const b64 = (m ? m[2] : s).replace(/\s+/g, '');
  if (!b64 || !/^[A-Za-z0-9+/=]+$/.test(b64)) return null;
  return b64;
}

async function askImage({ root, prompt, cwd, timeoutMs = 180000, makeAgent = () => new Agent(root) }) {
  const agent = makeAgent();
  let image = null,
    timer;
  const done = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Error('Görsel oluşturma zaman aşımına uğradı.')), timeoutMs);
    agent.on('event', (e) => {
      if (e.type === 'error' || e.type === 'disconnected') reject(Error('Codex bağlantısı kurulamadı.'));
      if (e.type === 'request') reject(Error('Görsel aracı onay istedi; modüller onay gerektiren araçları kullanamaz.'));
      if (e.type !== 'agent') return;
      const { method, params } = e.data;
      const item = params?.item;
      if (method === 'item/completed' && item?.type === 'imageGeneration') {
        if (item.status === 'failed') return reject(Error('Görsel oluşturulamadı.'));
        image = imageBase64(item.result) || image;
      }
      if (method === 'turn/completed') {
        if (image) resolve(image);
        else reject(Error(params.turn?.status === 'completed' ? 'Yapay zekâ bir görsel döndürmedi (görsel aracı bu hesapta kullanılamıyor olabilir).' : 'Görsel oluşturma tamamlanamadı.'));
      }
    });
  });
  done.catch(() => {});
  try {
    await agent.connect();
    await agent.send({ cwd, mode: 'chat', access: 'ask', model: null, prompt, task: 'image' });
    return await done;
  } finally {
    clearTimeout(timer);
    try {
      agent.stop();
    } catch {}
  }
}

module.exports = { askImage, imageBase64 };
