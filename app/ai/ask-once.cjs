// Ask the AI a single background question and return its text answer.
//
// Used for small helper jobs that must not appear in the user's chat history
// (mail triage, classification). It opens its own short-lived connection:
// Codex for GPT models, or the subscription CLI for gemini:/claude:/cursor: models.
const { Agent } = require('./agent.cjs');

const SUBSCRIPTION = /^(gemini|claude|cursor|abacus):/;

async function askOnce({
  root,
  providers,
  prompt,
  model = null,
  cwd = root,
  timeoutMs = 60000,
  makeAgent = () => new Agent(root),
}) {
  const agent = makeAgent();
  let answer = '',
    timer;
  const done = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      providers?.interrupt?.(agent);
      reject(Error('AI yanıtı zaman aşımına uğradı.'));
    }, timeoutMs);
    agent.on('event', (e) => {
      if (e.type === 'error' || e.type === 'disconnected')
        reject(Error('AI bağlantısı kurulamadı.'));
      if (e.type !== 'agent') return;
      const { method, params } = e.data;
      if (method === 'item/completed' && params.item?.type === 'agentMessage')
        answer = params.item.text;
      if (method === 'turn/completed')
        params.turn?.status === 'completed'
          ? resolve(answer)
          : reject(Error('AI yanıtı tamamlanamadı.'));
    });
  });
  done.catch(() => {});
  try {
    const args = { cwd, mode: 'chat', access: 'ask', model, prompt, stream: false };
    if (SUBSCRIPTION.test(model || '')) await providers.send(agent, args);
    else {
      await agent.connect();
      await agent.send(args);
    }
    return await done;
  } finally {
    clearTimeout(timer);
    try {
      agent.stop();
    } catch {}
  }
}

// Picks a light model of the user's main AI for background jobs.
function backgroundModel(primary) {
  if (primary === 'claude') return 'claude:haiku';
  if (primary === 'gemini') return 'gemini:flash';
  if (primary === 'cursor') return 'cursor:auto';
  if (primary === 'abacus') return 'abacus:auto';
  return null; // Codex default model
}

module.exports = { askOnce, backgroundModel };
