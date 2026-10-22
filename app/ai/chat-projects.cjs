// v0.8.8: Projects ("Projeler") — like projects in the Claude and Codex apps. Folders only
// group chats; a project also shares knowledge: every chat in a project gets the project's
// instructions and a digest of the project's other chats, so Charles knows what was said
// and decided there.
const { randomUUID } = require('node:crypto');

const MAX_PROJECTS = 100;
const MAX_INSTRUCTIONS = 8000;
// how much of the other chats goes with a message (characters)
const PROJECT_BUDGET = 30000;
const PER_CHAT = 7000;
const MAX_OTHER_CHATS = 10;

function restoreProjects(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const ids = new Set();
  for (const p of value.slice(0, MAX_PROJECTS))
    if (p && typeof p.id === 'string' && p.id.length <= 80 && !ids.has(p.id) && typeof p.name === 'string' && p.name.trim()) {
      ids.add(p.id);
      out.push({
        id: p.id,
        name: p.name.trim().slice(0, 60),
        instructions: typeof p.instructions === 'string' ? p.instructions.slice(0, MAX_INSTRUCTIONS) : '',
        createdAt: Number(p.createdAt) || Date.now(),
      });
    }
  return out;
}

function cleanName(name, projects, id = null) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60) throw Error('Proje adı 1–60 karakter olmalı.');
  name = name.trim();
  if (projects.some((p) => p.id !== id && p.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr')))
    throw Error('Bu isimde bir proje var.');
  return name;
}

/** Project actions of the history editor (folders-edit IPC). Returns true when handled. */
function editProject(s, { action, id, name, instructions, roomId, projectId }) {
  const projects = s.projects;
  const project = id ? projects.find((p) => p.id === id) : null;
  if (action === 'project-create') {
    if (projects.length >= MAX_PROJECTS) throw Error(`En fazla ${MAX_PROJECTS} proje oluşturabilirsin.`);
    const p = { id: randomUUID(), name: cleanName(name, projects), instructions: '', createdAt: Date.now() };
    projects.push(p);
    return p;
  }
  if (action === 'move-chat-project') {
    const room = s.rooms.get(roomId);
    if (!room) throw Error('Sohbet bulunamadı.');
    if (projectId !== null && !projects.some((p) => p.id === projectId)) throw Error('Proje bulunamadı.');
    room.projectId = projectId;
    room.projectSeenAt = 0;
    // a chat is either in a project or in a folder
    if (projectId) {
      room.folderId = null;
      room.manualFolder = true;
    }
    return true;
  }
  if (!['project-rename', 'project-instructions', 'project-delete'].includes(action)) return false;
  if (!project) throw Error('Proje bulunamadı.');
  if (action === 'project-rename') project.name = cleanName(name, projects, project.id);
  else if (action === 'project-instructions') {
    if (typeof instructions !== 'string') throw Error('Geçersiz proje talimatı.');
    if (instructions.length > MAX_INSTRUCTIONS) throw Error(`Proje talimatı en fazla ${MAX_INSTRUCTIONS} karakter olabilir.`);
    project.instructions = instructions.trim();
    project.instructionsAt = Date.now();
  } else {
    // removing a project never removes its chats: they become ordinary chats
    for (const r of s.rooms.values()) if (r.projectId === project.id) r.projectId = null;
    s.projects = projects.filter((p) => p.id !== project.id);
  }
  return true;
}

/**
 * The project block for a message in `room`: instructions and the other chats of the project.
 * `full`: the AI starts without its own thread (send everything); otherwise only when something
 * changed since this chat last saw the project. Returns '' when nothing needs to be sent.
 */
function projectContext(s, room, { full = false, budget = PROJECT_BUDGET, contextText } = {}) {
  const project = room.projectId ? s.projects.find((p) => p.id === room.projectId) : null;
  if (!project) return '';
  const others = [...s.rooms.values()]
    .filter((r) => r !== room && r.projectId === project.id && r.events.length)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_OTHER_CHATS);
  const seen = room.projectSeenAt || 0;
  const changed = others.some((r) => r.updatedAt > seen) || (project.instructionsAt || 0) > seen;
  if (!full && !changed) return '';
  const parts = [
    `Bu sohbet “${project.name}” projesine ait. Projedeki diğer sohbetler aşağıda özetlendi; kullanıcı onlara atıfta bulunursa bu bilgiyi kullan.`,
  ];
  if (project.instructions) parts.push('Proje talimatları (kullanıcının yazdığı):\n' + project.instructions);
  let room_ = budget - parts.join('\n\n').length;
  for (const r of others) {
    if (room_ < 800) break;
    const take = Math.min(PER_CHAT, room_ - 200);
    const text = contextText(r.events, { budget: take });
    if (!text) continue;
    const block = `### Projedeki başka sohbet: “${r.name}” (son güncelleme ${new Date(r.updatedAt).toISOString().slice(0, 16).replace('T', ' ')})\n${text}`;
    parts.push(block);
    room_ -= block.length + 2;
  }
  if (!others.length) parts.push('(Projede henüz başka sohbet yok.)');
  return parts.join('\n\n');
}

module.exports = { restoreProjects, editProject, projectContext, MAX_PROJECTS, PROJECT_BUDGET };
