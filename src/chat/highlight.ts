// v0.7.2: light syntax colouring for code blocks and the side panel. Builds DOM nodes
// (never HTML strings), so model output can't inject markup.
const KEYWORDS: Record<string, string> = {
  py: 'False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield print input self',
  js: 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield interface type enum implements readonly public private protected',
  c: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected namespace using new delete true false bool string include define',
  sh: 'if then else elif fi for in do done while case esac function return export local echo cd ls set',
  sql: 'select from where insert into values update set delete create table drop alter join left right inner outer on as and or not null order by group having limit',
};
const ALIASES: Record<string, string> = {
  python: 'py', py: 'py',
  javascript: 'js', js: 'js', ts: 'js', typescript: 'js', jsx: 'js', tsx: 'js', json: 'js', java: 'c', kotlin: 'js',
  c: 'c', cpp: 'c', 'c++': 'c', cs: 'c', csharp: 'c', go: 'c', rust: 'c', swift: 'c', php: 'js',
  bash: 'sh', sh: 'sh', shell: 'sh', powershell: 'sh', ps1: 'sh', cmd: 'sh', bat: 'sh',
  sql: 'sql',
};
export const LANGUAGE_NAMES: Record<string, string> = {
  py: 'Python', python: 'Python', js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  json: 'JSON', html: 'HTML', css: 'CSS', java: 'Java', c: 'C', cpp: 'C++', cs: 'C#', csharp: 'C#', go: 'Go',
  rust: 'Rust', sh: 'Shell', bash: 'Bash', powershell: 'PowerShell', ps1: 'PowerShell', sql: 'SQL', php: 'PHP',
  kotlin: 'Kotlin', swift: 'Swift', md: 'Markdown', markdown: 'Markdown', yaml: 'YAML', yml: 'YAML', xml: 'XML',
  txt: 'Metin', text: 'Metin', plaintext: 'Metin', cmd: 'Komut', bat: 'Komut',
};
const EXT: Record<string, string> = { py: 'python', js: 'js', cjs: 'js', mjs: 'js', ts: 'ts', tsx: 'ts', jsx: 'js', json: 'json', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cs: 'cs', go: 'go', rs: 'rust', sh: 'sh', ps1: 'powershell', bat: 'cmd', cmd: 'cmd', sql: 'sql', php: 'php', html: 'html', css: 'css', md: 'md', yml: 'yaml', yaml: 'yaml', kt: 'kotlin', swift: 'swift' };
export function languageOfFile(name: string) {
  return EXT[(name.split('.').pop() || '').toLowerCase()] || '';
}

export function highlightInto(target: HTMLElement, code: string, language: string) {
  const family = ALIASES[language.toLowerCase()] || '';
  target.replaceChildren();
  if (!family || code.length > 200000) {
    target.textContent = code;
    return;
  }
  const words = new Set(KEYWORDS[family].split(' '));
  const comment = family === 'py' || family === 'sh' ? '#' : family === 'sql' ? '--' : '//';
  // strings, comments, numbers, words
  const re = new RegExp(
    String.raw`("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\x60(?:\\.|[^\x60\\])*\x60)|(` +
      (comment === '#' ? '#' : comment === '--' ? '--' : '//') +
      String.raw`[^\n]*|/\*[\s\S]*?\*/)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(?=\s*\()|([A-Za-z_][A-Za-z0-9_]*)`,
    'g',
  );
  let last = 0;
  const push = (text: string, cls = '') => {
    if (!text) return;
    if (!cls) {
      target.append(document.createTextNode(text));
      return;
    }
    const span = document.createElement('span');
    span.className = 'tok-' + cls;
    span.textContent = text;
    target.append(span);
  };
  for (const m of code.matchAll(re)) {
    push(code.slice(last, m.index));
    const [all, str, com, num, call, word] = m;
    if (str) push(str, 'str');
    else if (com) push(com, family === 'js' || family === 'c' || com.startsWith(comment) ? 'com' : '');
    else if (num) push(num, 'num');
    else if (call) push(call, words.has(call) ? 'kw' : 'fn');
    else if (word) push(word, words.has(word) || words.has(word.toLowerCase()) && family === 'sql' ? 'kw' : '');
    else push(all);
    last = (m.index || 0) + all.length;
  }
  push(code.slice(last));
}
