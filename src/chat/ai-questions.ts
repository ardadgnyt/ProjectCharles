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

/** The card under the message. `send` posts the answer as the user's next message. */
export function questionCard(
  questions: AiQuestion[],
  send: (text: string) => void,
  t: (s: string) => string,
) {
  const card = document.createElement('div');
  card.className = 'ai-questions';
  const title = document.createElement('p');
  title.className = 'ai-questions-title';
  title.textContent = t(questions.length > 1 ? 'Devam etmeden önce birkaç sorum var' : 'Devam etmeden önce bir sorum var');
  card.append(title);
  const answers: string[] = questions.map(() => '');
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'primary ai-questions-send';
  submit.textContent = t('Yanıtla');
  const done = (text: string) => {
    card.classList.add('answered');
    for (const b of card.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button,input'))
      b.disabled = true;
    send(text);
  };
  const refresh = () => {
    submit.disabled = answers.some((a) => !a.trim());
  };
  questions.forEach((q, i) => {
    const box = document.createElement('div');
    box.className = 'ai-question';
    const label = document.createElement('p');
    label.textContent = q.question;
    box.append(label);
    const opts = document.createElement('div');
    opts.className = 'ai-question-options';
    const chosen = new Set<string>();
    for (const o of q.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = o;
      b.onclick = () => {
        if (q.multi) {
          if (chosen.has(o)) chosen.delete(o);
          else chosen.add(o);
          b.setAttribute('aria-pressed', String(chosen.has(o)));
          answers[i] = [...chosen].join(', ');
        } else {
          for (const x of opts.querySelectorAll('button')) x.setAttribute('aria-pressed', 'false');
          b.setAttribute('aria-pressed', 'true');
          answers[i] = o;
          input.value = '';
          // one question, one choice: answer right away
          if (questions.length === 1) return done(o);
        }
        refresh();
      };
      opts.append(b);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 2000;
    input.placeholder = t(q.options.length ? 'Ya da kendi yanıtını yaz…' : 'Yanıtını yaz…');
    input.oninput = () => {
      if (input.value.trim()) {
        for (const x of opts.querySelectorAll('button')) x.setAttribute('aria-pressed', 'false');
        chosen.clear();
      }
      answers[i] = input.value;
      refresh();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !submit.disabled) {
        e.preventDefault();
        submit.click();
      }
    };
    if (q.options.length) box.append(opts);
    box.append(input);
    card.append(box);
  });
  submit.onclick = () => done(answerText(questions, answers.map((a) => a.trim())));
  refresh();
  card.append(submit);
  return card;
}
