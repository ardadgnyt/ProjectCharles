// Page side of katex-source.ts (swapped in by scripts/build.mjs): KaTeX is a separate file,
// dist/katex.js (it sets window.charlesKatex), loaded through a script tag on the first formula.
let lib: any = null;
let loading: Promise<any> | null = null;

export const katexNow = (): any => lib;
export function loadKatex(): Promise<any> {
  if (lib) return Promise.resolve(lib);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'katex.js';
    script.onload = () => {
      const k = (window as any).charlesKatex;
      lib = k?.default ?? k ?? null;
      if (lib?.renderToString) resolve(lib);
      else ((lib = null), (loading = null), reject(Error('katex.js did not load')));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(Error('katex.js did not load'));
    };
    document.head.append(script);
  });
  return loading;
}
