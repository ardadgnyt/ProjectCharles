// Ask the AI a single background question and return its text answer.
//
// Used for small helper jobs that must not appear in the user's chat history
// (mail triage, classification). It opens its own short-lived connection:
// Codex for GPT models, or the subscription CLI for gemini:/claude:/cursor: models.
const { Agent } = require('./agent.cjs');

const SUBSCRIPTION = /^(gemini|claude|cursor|abacus|evren|copilot):/;

async function askOnce({
  root,
  providers,
  prompt,
  model = null,
  attachments = [],
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
    // v0.8.7: images ({ type: 'localImage', path }) like the main chat's attachments
    if (Array.isArray(attachments) && attachments.length) args.attachments = attachments;
    // v0.9.15: `background`: nobody is watching this run (see Providers.geminiEnv)
    if (SUBSCRIPTION.test(model || '')) await providers.send(agent, { ...args, background: true });
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
  if (primary === 'evren') return 'evren:auto';
  if (['copilot'].includes(primary)) return primary + ':auto';
  return null; // Codex default model
}

// v1.0.0: the model a module's question runs on when the module names none. The user's chosen
// default model is used only while its AI is signed in and still lists it; otherwise the light
// model of the main AI when that is signed in, otherwise Codex's default (null), as the chat
// falls back when its default model is not in the list.
async function moduleModel(providers, chosen) {
  if (!chosen) return null;
  const prefix = /^([a-z][a-z0-9_-]*):/.exec(chosen);
  if (!prefix) return chosen; // a GPT model runs on Codex
  try {
    await providers?.refreshAuth?.();
  } catch {}
  const auth = providers?.auth || {};
  let rows = [];
  try {
    rows = providers?.models?.() || [];
  } catch {}
  const listed = rows.some((r) => r.id === chosen || (r.efforts || []).some((e) => e.id === chosen));
  if (auth[prefix[1]] && listed) return chosen;
  const light = backgroundModel(providers?.enabled?.primary);
  return light && auth[light.split(':')[0]] ? light : null;
}

module.exports = { askOnce, backgroundModel, moduleModel };
