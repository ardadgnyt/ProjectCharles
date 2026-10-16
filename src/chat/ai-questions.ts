// v0.6.5: questions from the AI (GPT/Codex, Claude, Gemini, Cursor).
//
// Every provider is told (app/core/ask-format.cjs) to ask the user like this when it needs a
// decision or a missing detail before doing the work well:
//
//   <charles-soru>{"soru": "Hangi dilde?", "secenekler": ["Türkçe", "İngilizce"]}</charles-soru>
//
// The block is hidden from the chat text and shown as a card with one button per option and
// a free-answer box. The answer is sent as the user's next message. A block that is still
// being streamed is hidden until it is complete.

export type AiQuestion = { question: string; options: string[]; multi: boolean };

const BLOCK = /<charles-soru>([\s\S]*?)<\/charles-soru>/g;
const OPEN = /<charles-soru>[\s\S]*$/;

function clean(s: unknown, max: number) {
  return typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Parses one block body; accepts Turkish or English keys. */
export function parseQuestion(body: string): AiQuestion | null {
  let v: any;
  try {
    v = JSON.parse(body.trim());
  } catch {
    // tolerate a plain-text question
    const q = clean(body, 400);
    return q ? { question: q, options: [], multi: false } : null;
  }
  const question = clean(v?.soru ?? v?.question, 400);
  if (!question) return null;
  const raw = v?.secenekler ?? v?.seçenekler ?? v?.options ?? [];
  const options = (Array.isArray(raw) ? raw : [])
    .map((o: unknown) => clean(typeof o === 'object' && o ? (o as any).label : o, 120))
    .filter(Boolean)
    .slice(0, 6);
  return { question, options, multi: !!(v?.coklu ?? v?.çoklu ?? v?.multi) };
}

/** Splits an answer into its visible text and its questions. */
export function splitQuestions(text: string): { visible: string; questions: AiQuestion[] } {
  const questions: AiQuestion[] = [];
  let visible = text.replace(BLOCK, (_, body: string) => {
    const q = parseQuestion(body);
    if (q && questions.length < 4) questions.push(q);
    return '';
  });
  visible = visible.replace(OPEN, ''); // still streaming
  return { visible: visible.replace(/\n{3,}/g, '\n\n').trimEnd(), questions };
}

/** The text sent back to the AI for the chosen answers. */
export function answerText(questions: AiQuestion[], answers: string[]) {
  if (questions.length === 1) return answers[0];
  return questions.map((q, i) => `${q.question} → ${answers[i]}`).join('\n');
}

/**
 * The card under the message (v0.7.0, Claude-like): one question at a time, options as
 * numbered rows, a free-answer row at the bottom. A single-choice pick moves on by itself;
 * the last answer sends everything as the user's next message. Number keys 1–4 pick.
 */
export function questionCard(
  questions: AiQuestion[],
  send: (text: string) => void,
  t: (s: string) => string,
) {
  const card = document.createElement('div');
  card.className = 'ai-questions';
  card.tabIndex = -1;
  const answers: string[] = questions.map(() => '');
  let index = 0;

  const head = document.createElement('div');
  head.className = 'ai-q-head';
  const label = document.createElement('span');
  label.className = 'ai-q-label';
  label.textContent = t('Charles soruyor');
  const steps = document.createElement('span');
  steps.className = 'ai-q-steps';
  head.append(label, steps);
  const body = document.createElement('div');
  body.className = 'ai-q-body';
  const foot = document.createElement('div');
  foot.className = 'ai-q-foot';
  card.append(head, body, foot);

  const done = () => {
    card.classList.add('answered');
    const summary = document.createElement('div');
    summary.className = 'ai-q-summary';
    questions.forEach((q, i) => {
      const line = document.createElement('p');
      const qs = document.createElement('span');
      qs.textContent = q.question;
      const a = document.createElement('strong');
      a.textContent = answers[i];
      line.append(qs, a);
      summary.append(line);
    });
    body.replaceChildren(summary);
    foot.replaceChildren();
    steps.textContent = '';
    label.textContent = t('Yanıtlandı');
    send(answerText(questions, answers.map((a) => a.trim())));
  };
  const next = () => {
    if (index < questions.length - 1) {
      index++;
      render();
    } else done();
  };

  function render() {
    const q = questions[index];
    steps.replaceChildren();
    if (questions.length > 1)
      questions.forEach((_, i) => {
        const dot = document.createElement('i');
        if (i < index) dot.className = 'done';
        if (i === index) dot.className = 'on';
        steps.append(dot);
      });
    const title = document.createElement('p');
    title.className = 'ai-q-question';
    title.textContent = q.question;
    const list = document.createElement('div');
    list.className = 'ai-q-options';
    list.setAttribute('role', q.multi ? 'group' : 'radiogroup');
    const chosen = new Set(answers[index] ? answers[index].split(', ') : []);
    q.options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ai-q-option';
      b.setAttribute(q.multi ? 'aria-pressed' : 'aria-checked', String(chosen.has(o)));
      if (!q.multi) b.setAttribute('role', 'radio');
      const n = document.createElement('kbd');
      n.textContent = String(i + 1);
      const text = document.createElement('span');
      text.textContent = o;
      b.append(n, text);
      b.onclick = () => {
        if (card.classList.contains('answered')) return;
        if (q.multi) {
          if (chosen.has(o)) chosen.delete(o);
          else chosen.add(o);
          b.setAttribute('aria-pressed', String(chosen.has(o)));
          answers[index] = q.options.filter((x) => chosen.has(x)).join(', ');
          input.value = '';
          paintFoot();
        } else {
          answers[index] = o;
          next();
        }
      };
      list.append(b);
    });
    const other = document.createElement('label');
    other.className = 'ai-q-other';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 2000;
    input.placeholder = t(q.options.length ? 'Başka bir şey yaz…' : 'Yanıtını yaz…');
    if (answers[index] && !q.options.includes(answers[index]) && !q.multi) input.value = answers[index];
    input.oninput = () => {
      if (input.value.trim()) {
        chosen.clear();
        for (const x of list.querySelectorAll('button'))
          x.setAttribute(q.multi ? 'aria-pressed' : 'aria-checked', 'false');
      }
      answers[index] = input.value;
      paintFoot();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        e.stopPropagation();
        next();
      }
    };
    other.append(input);
    body.replaceChildren(title, ...(q.options.length ? [list] : []), other);
    paintFoot();
    function paintFoot() {
      foot.replaceChildren();
      if (index > 0) {
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'ai-q-back';
        back.textContent = t('Geri');
        back.onclick = () => {
          index--;
          render();
        };
        foot.append(back);
      }
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'primary ai-q-next';
      go.textContent = t(index < questions.length - 1 ? 'Devam' : 'Yanıtla');
      go.disabled = !answers[index].trim();
      // single choice moves on by itself; the button is for typed or multiple answers
      go.hidden = !q.multi && q.options.length > 0 && !input.value.trim();
      go.onclick = next;
      foot.append(go);
      foot.hidden = !foot.querySelector('button:not([hidden])');
    }
    if (!q.options.length) setTimeout(() => input.focus(), 0);
  }
  card.addEventListener('keydown', (e) => {
    if (card.classList.contains('answered') || (e.target as HTMLElement).tagName === 'INPUT') return;
    const n = Number(e.key);
    const option = n >= 1 ? card.querySelectorAll<HTMLButtonElement>('.ai-q-option')[n - 1] : null;
    if (option) {
      e.preventDefault();
      option.click();
    }
  });
  render();
  return card;
}
