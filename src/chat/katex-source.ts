// Where the formula renderer (math.ts) gets KaTeX. This eager version is what unit tests and other
// bundles get; the page build (scripts/build.mjs) swaps in katex-lazy.ts, which loads dist/katex.js
// on the first formula, so a chat without math never loads it (v1.0.0, perf2 P9.3).
import katex from 'katex';

export const katexNow = (): any => katex;
export const loadKatex = (): Promise<any> => Promise.resolve(katex);
