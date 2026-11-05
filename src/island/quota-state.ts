// v0.9.16: when Charles may show "limit reached". The animation follows only what is verified for
// the AI in use. A failed read, an old answer or a window that has already reset is "unknown", and
// unknown never looks like an empty quota.
const MAX_AGE = 15 * 60000;

/** true: used up · false: usable · null: not known. Seconds in resetsAt, ms in updatedAt. */
export function verifiedBlocked(v: any, now = Date.now()): boolean | null {
  if (!v || v.stale) return null;
  if (typeof v.updatedAt === 'number' && now - v.updatedAt > MAX_AGE) return null;
  if (v.blocked === false) return false;
  if (v.blocked !== true) return null;
  const empty = [v.fiveHour, v.weekly].filter((w: any) => w?.remaining === 0);
  // every empty window has reset since this was read: only a new read can tell
  if (empty.length && empty.every((w: any) => w.resetsAt && w.resetsAt * 1000 <= now)) return null;
  return true;
}

/**
 * How long an AI's own "limit" error counts when no usage read can confirm it.
 * 0: not a limit error. "Too many requests" passes in a moment; a used-up plan lasts longer.
 */
export function limitErrorLasts(message: string) {
  const s = String(message || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  if (/usage.?limit|quota|limit.{0,12}(?:reached|exceeded|hit)|hit .{0,16}limit|kullanim (?:siniri|limiti)|limit.{0,20}(?:dol|asil)/i.test(s)) return 10 * 60000;
  if (/rate.?limit|too many requests|\b429\b/i.test(s)) return 60000;
  return 0;
}
