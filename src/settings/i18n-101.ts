// v1.0.1. Turkish → English; other languages: src/settings/lang/*.ts ({n} is a number).
export const english101: Record<string, string> = {
  // the picture being made: the step under the percentage again (chat/image-card.ts, as in v0.9.27)
  'Fırçalar hazırlanıyor…': 'Getting the brushes ready…',
  'Taslak çiziliyor…': 'Sketching…',
  'Renkler ekleniyor…': 'Adding colours…',
  'Son rötuşlar…': 'Final touches…',
  // the steps list of an answer (chat/steps.ts): a completed turn whose last failure was never made up for
  'Kısmen tamamlandı': 'Partly done',
  // a failed step that worked when it was run again
  'Hata · yeniden denendi': 'Error · retried',
};
export const patterns101: [RegExp, (...m: string[]) => string][] = [];
