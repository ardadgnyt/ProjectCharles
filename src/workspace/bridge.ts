// v0.7.1 SpecialBeta: how the workspace window reaches the chat code that lives in the
// renderer and in settings/extras.ts (opening a saved chat, starting a new one).

export type RoomActions = {
  /** Opens a saved chat (same as a click in the chat history). */
  open: (id: string) => Promise<void>;
  /** Starts a new, separate chat. */
  create: () => Promise<void>;
};

let actions: RoomActions | null = null;

export function setRoomActions(a: RoomActions) {
  actions = a;
}

export function roomActions(): RoomActions {
  if (!actions) throw Error('Sohbetler henüz hazır değil.');
  return actions;
}
