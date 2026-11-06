// v0.9.19: a sent message is edited inside its own bubble. The message box and what is drafted
// there stay as they are; nothing changes in the chat until Save, and a failed Save keeps the text.
import { t } from '../settings/i18n';

type Attachment = { id?: string; name: string; available?: boolean };
type Deps = {
  api: any;
  feed: HTMLElement;
  notice: (s: string) => void;
  blocked: () => string;
  save: (index: number, text: string, attachments: Attachment[]) => Promise<boolean>;
};
type Open = { el: HTMLElement; area: HTMLTextAreaElement; original: string; saving: boolean };

export function messageEditor({ api, feed, notice, blocked, save }: Deps) {
  let open: Open | null = null;
  const live = () => (open?.el.isConnected ? open : null);
  function close(el = open?.el) {
    el?.querySelector('.message-edit')?.remove();
    el?.classList.remove('editing');
    if (open?.el === el) open = null;
  }
  function grow(area: HTMLTextAreaElement) {
    // the list stays where it is while the box takes the height of its text
    const top = feed.scrollTop;
    area.style.height = 'auto';
    area.style.height = area.scrollHeight + 2 + 'px';
    feed.scrollTop = top;
  }
  async function start(el: HTMLElement, text: string, draft = text, error = '') {
    const message = blocked();
    if (message) return notice(t(message));
    const current = live();
    if (current?.el === el) return current.area.focus({ preventScroll: true });
    if (current) {
      // one at a time; a changed text is not thrown away by a click on another message
      if (current.area.value !== current.original) {
        notice(t('Önce açık düzenlemeyi kaydet veya iptal et.'));
        return current.area.focus();
      }
      close(current.el);
    }
    const index = Number(el.dataset.userIndex);
    let attachments: Attachment[] = [];
    try {
      attachments = (await api.messageEditInfo(index)).attachments || [];
    } catch (e) {
      return notice((e as Error).message);
    }
    if (!el.isConnected) return;
    const top = feed.scrollTop;
    const box = document.createElement('div');
    box.className = 'message-edit';
    const area = document.createElement('textarea');
    area.rows = 1;
    area.value = draft;
    area.setAttribute('aria-label', t('Mesajı düzenle'));
    const hint = document.createElement('small');
    hint.textContent = t('Charles bu mesajdan yeniden yanıt verir. Önceki konuşma ‹ › ile açılır; dosya değişiklikleri geri alınmaz.');
    box.append(area, hint);
    if (error) {
      const why = document.createElement('small');
      why.className = 'message-edit-warn';
      why.textContent = error;
      box.append(why);
    }
    const lost = attachments.filter((a) => a.available === false);
    if (lost.length) {
      const warn = document.createElement('small');
      warn.className = 'message-edit-warn';
      warn.textContent = t('Bu ekler artık bulunamadı ve yeniden gönderilmez:') + ' ' + lost.map((a) => a.name).join(', ');
      box.append(warn);
    }
    const row = document.createElement('div');
    row.className = 'message-edit-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = t('İptal');
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'primary';
    confirm.textContent = t('Kaydet');
    row.append(cancel, confirm);
    box.append(row);
    el.classList.add('editing');
    el.append(box);
    const state: Open = { el, area, original: text, saving: false };
    open = state;
    const paint = () => {
      confirm.disabled = state.saving || !area.value.trim();
      cancel.disabled = state.saving;
      area.readOnly = state.saving;
    };
    const submit = async () => {
      if (state.saving) return;
      const value = area.value.trim();
      if (!value) return;
      if (value === text.trim()) return close(el);
      const reason = blocked();
      if (reason) return notice(t(reason)); // the text stays in the box
      state.saving = true;
      paint();
      let saved = false;
      try {
        saved = await save(index, value, attachments.filter((a) => a.available !== false));
      } catch (e) {
        notice((e as Error).message);
      } finally {
        state.saving = false;
        if (el.isConnected) {
          paint();
          if (!saved) area.focus();
        }
      }
      if (saved) close(el);
    };
    cancel.onclick = () => close(el);
    confirm.onclick = () => void submit();
    area.addEventListener('input', () => {
      grow(area);
      paint();
    });
    area.addEventListener('keydown', (e) => {
      e.stopPropagation(); // these keys belong to the box, not to the panel's own shortcuts
      if (e.key === 'Escape') {
        e.preventDefault();
        close(el);
      } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        void submit();
      }
    });
    paint();
    grow(area);
    feed.scrollTop = top;
    area.focus({ preventScroll: true });
    area.selectionStart = area.selectionEnd = area.value.length;
    el.scrollIntoView({ block: 'nearest' });
  }
  return { start, close: () => close(), active: () => !!live() };
}
