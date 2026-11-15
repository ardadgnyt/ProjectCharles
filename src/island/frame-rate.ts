// Slime's frame rate per state (renderer.ts draw loop), kept pure so the rule can be unit-tested.
export type FrameState = {
  dragging: boolean;
  hovering: boolean;
  jelly: boolean;
  /** v1.0.0 (perffix P1): the costume itself moves (tweens, particles, dance, a slot changing,
   *  the dizzy wobble): not the head merely following the pointer */
  costumeMoving: boolean;
  aiBusy: boolean;
  /** v1.0.0 (perffix P7): the sleep state (eyes closed, the "z" letters) */
  asleep: boolean;
  /** ms since the pointer or a key last moved */
  sinceInput: number;
  compact: boolean;
  focused: boolean;
};

/** v1.0.0 (perffix P7): asleep he only breathes slowly and the "z" letters drift up; 8 frames show
 *  both evenly (compared in frame captures) at two thirds of the awake idle cost. Waking draws at
 *  once at the awake rate (renderer.ts touchCharacter -> slimeLoop.now()). */
export const SLEEP_FPS = 8;

export function slimeFrameRate(s: FrameState): number {
  if (s.dragging || s.hovering || s.jelly || s.costumeMoving) return 60;
  // v0.9.24: while the AI works he is busy, not moving fast: a long answer spent half of its
  // CPU on these frames
  if (s.aiBusy) return 30;
  // asleep the head does not follow the pointer, so a moving pointer changes nothing
  if (s.asleep) return SLEEP_FPS;
  // v0.9.19: nearly all of an open panel's cost is these frames: when nobody is at the panel
  // and Charles is only breathing, he breathes at the pace the compact island always had
  // v0.9.24: with the pointer resting he only breathes and blinks, which 12 frames show as well
  if (s.sinceInput > 4000) return 12;
  // v1.0.0 (perffix P1): head and eye following, with or without an outfit: 20 without focus,
  // 30 with it. An outfit used to make every pointer move anywhere on the screen a 60-frame
  // redraw of its 576 px layer (22-26 % of a core against 9-10 % with the pointer still).
  return s.compact || !s.focused ? 20 : 30;
}
