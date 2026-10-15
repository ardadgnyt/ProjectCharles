// Charles' own questions in the chat (v0.5.3, fixed in v0.5.4).
//
// Calendar suggestions (from the main process) and quota warnings (src/island/quota-watch.ts)
// are written into the chat by Charles himself as a message with a few buttons. While the
// question is open Slime shows the question-mark face for a few seconds.
//
// v0.5.4: the buttons live outside the markdown body (the markdown renderer replaces its
// element's content on the next frame, which used to wipe them), and a typed answer such as
// "evet" / "hayır" / "sadece hatırlat" answers the open question instead of going to the AI.
import { updateMarkdown } from './markdown';

export type ProposalAction = {
  id: string;
  label: string;
  primary?: boolean;
  // Local proposals run in the renderer; remote ones are answered through the main process.
  run?: () => string | Promise<string>;
};

type Deps = {
  api: any;
  row: (text: string, className?: string) => HTMLElement;
  ask: () => void; // Slime: question face
  settle: () => void; // back to the normal state
  notice: (text: string) => void;
};

type Open = {
  actions: ProposalAction[];
  choose: (id: string, said?: string) => Promise<string>;
  at: number;
};

const OPEN_FOR = 2 * 3600 * 1000;

const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .replace(/[.!?,;:…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Maps a short typed reply to one of the open question's buttons (or null: not an answer).
export function typedChoice(text: string, actions: { id: string; primary?: boolean }[]) {
  const t = fold(text);
  if (!t || t.length > 40) return null;
  const has = (id: string) => actions.some((a) => a.id === id);
  const no =
    /^(hayır|hayir|yok|gerek yok|istemiyorum|istemem|kalsın|kalsin|böyle kalsın|boyle kalsin|vazgeç|vazgec|hiç gerek yok|olmaz|no|nope|ekleme|takvime ekleme|hatırlatma kurma|kurma|hatırlatma istemiyorum)( teşekkürler| sağ ol| sagol| teşekkür ederim| lütfen)?$/;
  if (no.test(t)) {
    const negative =
      actions.find((a) => ['no', 'stay'].includes(a.id)) || actions[actions.length - 1];
    return negative?.id || null;
  }
  if (
    has('remind') &&
    /^(sadece |yalnızca |yalnizca )?(hatırlat|hatırlatma kur|hatırlatıcı kur)(sana| bana)?( yeter| yeterli| lütfen)?$/.test(
      t,
    )
  )
    return 'remind';
  const yes =
    /^(evet|olur|tamam|ekle|ekleyebilirsin|ekle lütfen|lütfen ekle|evet ekle|evet lütfen|tabii|tabi|tabiki|tabii ki|elbette|kesinlikle|aynen|hı hı|yes|ok|okey|olur ekle|takvime ekle|geç|geçelim|evet geç)( lütfen)?$/;
  if (yes.test(t)) return (actions.find((a) => a.primary) || actions[0])?.id || null;
  return null;
}

export function proposalsUI({ api, row, ask, settle, notice }: Deps) {
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let open: Open | null = null;

  function show(
    text: string,
    actions: ProposalAction[],
    answer: (id: string, said?: string) => Promise<string>,
  ) {
    const el = row('', 'agent proposal');
    const body = document.createElement('div');
    body.className = 'proposal-body';
    el.append(body);
    updateMarkdown(body, text, true);
    const bar = document.createElement('div');
    bar.className = 'proposal-actions';
    const current: Open = {
      actions,
      at: Date.now(),
      choose: async (id, said) => {
        if (open === current) open = null;
        for (const x of bar.querySelectorAll('button')) x.disabled = true;
        const label = actions.find((a) => a.id === id)?.label || '';
        try {
          const reply = await answer(id, said || label);
          bar.replaceChildren();
          const done = document.createElement('div');
          done.className = 'proposal-reply';
          done.textContent =
            (label ? '✓ ' + label + ' — ' : '') + (reply || 'Tamam.').replace(/\*\*/g, '');
          bar.append(done);
          return reply || 'Tamam.';
        } catch (e) {
          notice((e as Error).message);
          for (const x of bar.querySelectorAll('button')) x.disabled = false;
          if (!open) open = current;
          throw e;
        }
      },
    };
    for (const action of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      if (action.primary) b.className = 'primary';
      b.onclick = () => void current.choose(action.id).catch(() => {});
      bar.append(b);
    }
    el.append(bar);
    open = current;
    el.scrollIntoView({ block: 'end', behavior: 'smooth' });
    clearTimeout(settleTimer);
    ask();
    settleTimer = setTimeout(settle, 6000);
  }

  // From the main process (calendar).
  api.onProposal((p: any) => {
    if (!p?.id || !Array.isArray(p.actions)) return;
    show(String(p.text || ''), p.actions, async (action, said) => {
      const r = await api.proposalAnswer(p.id, action, said || '');
      return r?.reply || '';
    });
  });

  return {
    // From the renderer itself (quota watcher).
    local(text: string, actions: ProposalAction[]) {
      show(text, actions, async (id, said) => {
        const action = actions.find((a) => a.id === id);
        const reply = action?.run ? await action.run() : '';
        // Keep the exchange in the chat history so the AI knows what was answered.
        void api.chatLocal(said || action?.label || id, reply || 'Tamam.').catch(() => {});
        return reply;
      });
      // The question itself goes to the history too (as Charles' message).
      void api.chatLocal('', text).catch(() => {});
    },
    // A typed reply ("hayır", "evet", "sadece hatırlat") to the open question.
    // Returns Charles' reply, or null when the text is not an answer to it.
    async typed(text: string): Promise<string | null> {
      if (!open || Date.now() - open.at > OPEN_FOR) return null;
      const id = typedChoice(text, open.actions);
      if (!id) return null;
      return open.choose(id, text);
    },
  };
}
