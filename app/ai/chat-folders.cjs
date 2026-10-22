// History folders and sub-folders (create, move, restore after corruption).
const { randomUUID } = require('node:crypto');
class ChatFolders {
  constructor(sessions) {
    this.sessions = sessions;
  }
  state() {
    return {
      folders: this.sessions.folders,
      projects: this.sessions.projects || [],
      activeId: this.sessions.active,
      auto: this.sessions.autoFolders,
      rooms: this.sessions.list(),
    };
  }
  edit(args = {}) {
    // v0.8.8: projects (app/ai/chat-projects.cjs)
    if (typeof args.action === 'string' && (args.action.startsWith('project-') || args.action === 'move-chat-project')) {
      require('./chat-projects.cjs').editProject(this.sessions, args);
      this.sessions.save();
      return this.state();
    }
    let { action, id, name, parentId = null, roomId, enabled } = args;
    const s = this.sessions,
      folders = s.folders;
    if (parentId !== null && !folders.some((f) => f.id === parentId))
      throw Error('Üst klasör bulunamadı.');
    if (action === 'auto') {
      if (typeof enabled !== 'boolean') throw Error('Geçersiz ayar.');
      s.autoFolders = enabled;
    } else if (action === 'move-chat') {
      const room = s.rooms.get(roomId);
      if (!room) throw Error('Sohbet bulunamadı.');
      room.folderId = parentId;
      room.manualFolder = true;
      // a chat moved into a folder leaves its project
      if (parentId) room.projectId = null;
    } else {
      const folder = folders.find((f) => f.id === id);
      if (action !== 'create' && !folder) throw Error('Klasör bulunamadı.');
      if (['create', 'rename'].includes(action)) {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 60)
          throw Error('Klasör adı 1–60 karakter olmalı.');
        name = name.trim();
        const target = action === 'rename' ? folder.parentId : parentId;
        if (
          folders.some(
            (f) =>
              f.id !== id &&
              f.parentId === target &&
              f.name.toLocaleLowerCase('tr') === name.toLocaleLowerCase('tr'),
          )
        )
          throw Error('Bu isimde bir klasör var.');
        if (action === 'create') {
          if (folders.length >= 200) throw Error('En fazla 200 klasör oluşturabilirsin.');
          folders.push({ id: randomUUID(), name, parentId });
        } else folder.name = name;
      } else if (action === 'move-folder') {
        let p = parentId;
        while (p) {
          if (p === id) throw Error('Klasör kendi içine taşınamaz.');
          p = folders.find((f) => f.id === p)?.parentId;
        }
        folder.parentId = parentId;
      } else if (action === 'delete') {
        // Removing a container never removes its chats or child folders.
        for (const r of s.rooms.values())
          if (r.folderId === id) {
            r.folderId = folder.parentId;
            r.manualFolder = true;
          }
        for (const f of folders) if (f.parentId === id) f.parentId = folder.parentId;
        s.folders = folders.filter((f) => f.id !== id);
      } else throw Error('Geçersiz klasör işlemi.');
    }
    s.save();
    return this.state();
  }
  applyAI(roomId, result) {
    const s = this.sessions,
      r = s.rooms.get(roomId);
    if (!r || r.manualFolder || r.projectId) return false;
    const value = JSON.parse(
      String(result)
        .trim()
        .replace(/^```(?:json)?\s*|\s*```$/g, ''),
    );
    const names = ['Dersler', 'Normal Sohbet', 'FRP', 'Projeler'];
    let folder = s.folders.find((f) => f.id === value.folderId);
    if (!folder) {
      if (!names.includes(value.category)) throw Error('AI sınıflandırma yanıtı geçersiz.');
      folder = s.folders.find((f) => f.name === value.category && f.parentId === null);
      if (!folder) {
        if (s.folders.length >= 200) throw Error('Klasör sınırı dolu.');
        folder = { id: randomUUID(), name: value.category, parentId: null };
        s.folders.push(folder);
      }
    }
    r.folderId = folder.id;
    r.classified = true;
    s.save();
    return true;
  }
}
function restoreFolders(value) {
  if (!Array.isArray(value)) return [];
  const result = [],
    ids = new Set();
  for (const f of value.slice(0, 200))
    if (
      f &&
      typeof f.id === 'string' &&
      f.id.length <= 80 &&
      !ids.has(f.id) &&
      typeof f.name === 'string' &&
      f.name.trim()
    ) {
      ids.add(f.id);
      result.push({
        id: f.id,
        name: f.name.trim().slice(0, 60),
        parentId: typeof f.parentId === 'string' ? f.parentId : null,
      });
    }
  for (const f of result) {
    const seen = new Set([f.id]);
    let p = f.parentId;
    while (p) {
      if (seen.has(p) || !ids.has(p)) {
        f.parentId = null;
        break;
      }
      seen.add(p);
      p = result.find((x) => x.id === p)?.parentId;
    }
  }
  return result;
}
module.exports = { ChatFolders, restoreFolders };
