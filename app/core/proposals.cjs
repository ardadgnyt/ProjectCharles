// Charles' own suggestions ("öneriler"): the calendar and quota watchers ask the user a
// question in the chat with a few buttons. Slime shows the question-mark face while it waits.
//
// The main process keeps what each button does; the renderer only gets the text and the
// button labels and answers with (id, action). An answer is accepted once. v0.9.20: one that failed
// leaves the question open for a new try; while one runs, a second is refused.
const { randomUUID } = require('node:crypto');

class Proposals {
  // show(proposal): sends { id, text, actions: [{ id, label, primary }] } to the renderer.
  constructor({ show }) {
    this.show = show;
    this.items = new Map();
  }

  // actions: [{ id, label, primary?, run?: () => string | Promise<string> }]
  // run's return value (optional) is shown as Charles' reply under the question.
  add({ text, actions, ttl = 7 * 86400000 }) {
    const id = randomUUID();
    this.items.set(id, { actions, expires: Date.now() + ttl });
    for (const [key, item] of this.items) if (item.expires < Date.now()) this.items.delete(key);
    this.show({
      id,
      text: String(text).slice(0, 600),
      actions: actions.map((a) => ({ id: a.id, label: a.label, primary: !!a.primary })),
    });
    return id;
  }

  async answer(id, actionId) {
    const item = this.items.get(id);
    if (!item) throw Error('Bu öneri artık geçerli değil.');
    const action = item.actions.find((a) => a.id === actionId);
    if (!action) throw Error('Geçersiz seçim.');
    if (item.running) throw Error('Bu seçim işleniyor.');
    item.running = true;
    try {
      const reply = action.run ? String((await action.run()) || '') : '';
      this.items.delete(id);
      return { reply };
    } finally {
      item.running = false;
    }
  }
}

module.exports = { Proposals };
