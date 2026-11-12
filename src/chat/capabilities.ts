// v0.9.25: what each AI connection can do from the + menu. The same table lives in
// app/ai/provider-drawing.cjs (main checks it again); test/v0925.test.cjs keeps the two equal.
export type MenuTask = 'attach' | 'image' | 'web' | 'research';

export const CAPABILITIES: Record<string, MenuTask[]> = {
  gpt: ['attach', 'image', 'web', 'research'],
  gemini: ['attach', 'image', 'web', 'research'],
  claude: ['attach', 'image', 'web', 'research'],
  cursor: ['attach'],
  abacus: ['attach'],
  evren: ['attach', 'image'],
  // v0.9.27: pictures are drawn as with Claude and EVREN; Kimi Code has a web search of its own
  kimi: ['attach', 'image', 'web', 'research'],
  copilot: ['attach', 'image'],
  opencode: ['attach', 'image'],
};

export function providerOf(model: string): string {
  const m = /^(gemini|claude|cursor|abacus|evren|kimi|copilot|opencode):/.exec(String(model || ''));
  return m ? m[1] : 'gpt';
}

export function supports(model: string, task: string): boolean {
  return (CAPABILITIES[providerOf(model)] || []).includes(task as MenuTask);
}
