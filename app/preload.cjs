const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
// v0.7.8: several listeners (the message box and the app window's Slime); v0.7.7 had one
// slot, so the second listener replaced the first and dropped files were never attached.
const dropCallbacks = new Set();
const dropCallback = (v) => {
  for (const cb of dropCallbacks)
    try {
      cb(v);
    } catch {}
};
const convertCallbacks = new Set();
const convertCallback = (v) => {
  for (const cb of convertCallbacks)
    try {
      cb(v);
    } catch {}
};
const shareDropCallbacks = new Set();
const shareDropCallback = (v) => {
  for (const cb of shareDropCallbacks)
    try {
      cb(v);
    } catch {}
};
let lastDropSignal = 0;
function dropActive(active) {
  if (active && Date.now() - lastDropSignal < 350) return;
  lastDropSignal = Date.now();
  void invoke('drop-active', active).catch(() => {});
}
let internalDrag = false;
window.addEventListener(
  'dragstart',
  () => {
    internalDrag = true;
  },
  true,
);
window.addEventListener(
  'dragend',
  () => {
    internalDrag = false;
    dropActive(false);
  },
  true,
);
window.addEventListener(
  'dragover',
  (event) => {
    const types = Array.from(event.dataTransfer?.types || []);
    if (!internalDrag && (types.includes('Files') || types.includes('text/plain'))) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      dropActive(true);
    }
  },
  true,
);
window.addEventListener(
  'drop',
  (event) => {
    if (internalDrag) return;
    const files = Array.from(event.dataTransfer?.files || []);
    const text = event.dataTransfer?.getData('text/plain');
    if (!files.length && !text) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    dropActive(false);
    // v0.8.10: files dropped on the converter card go to the converter, not to the chat
    const target = event.target && event.target.closest ? event.target.closest('[data-drop="convert"]') : null;
    if (target && files.length) {
      let paths;
      try {
        paths = files.map((f) => webUtils.getPathForFile(f));
      } catch (error) {
        convertCallback({ error: error.message });
        return;
      }
      invoke('convert-drop', paths).then(
        (batch) => convertCallback({ batch }),
        (error) => convertCallback({ error: error.message }),
      );
      return;
    }
    // v0.9.2: files dropped on the Gönder (Quick Share / AirDrop) card go to the share service
    const shareTarget = event.target && event.target.closest ? event.target.closest('[data-drop="share"]') : null;
    if (shareTarget && files.length) {
      let paths;
      try {
        paths = files.map((f) => webUtils.getPathForFile(f));
      } catch (error) {
        shareDropCallback({ error: error.message });
        return;
      }
      invoke('share-drop', paths).then(
        (state) => shareDropCallback({ state }),
        (error) => shareDropCallback({ error: error.message }),
      );
      return;
    }
    let task;
    try {
      task = files.length
        ? invoke(
            'drop-files',
            files.map((f) => webUtils.getPathForFile(f)),
          )
        : invoke('drop-text', text);
    } catch (error) {
      dropCallback({ error: error.message });
      return;
    }
    task.then(
      (items) => dropCallback({ items }),
      (error) => dropCallback({ error: error.message }),
    );
  },
  true,
);
contextBridge.exposeInMainWorld('charles', {
  // v0.8.10: notch → card shelf → chat, and the converter
  islandView: (view) => invoke('island-view', view),
  islandViewRead: () => invoke('island-view-read'),
  onView: (cb) => ipcRenderer.on('ui-view', (_e, view) => cb(view)),
  shelfHold: (value) => invoke('shelf-hold', value),
  notchMusic: (value) => invoke('notch-music', value),
  spotifyOpen: () => invoke('spotify-open'),
  spotifyIcon: () => invoke('spotify-icon'),
  onConvertDrop: (cb) => {
    if (typeof cb === 'function') convertCallbacks.add(cb);
  },
  onConvertProgress: (cb) => ipcRenderer.on('convert-progress', (_e, p) => cb(p)),
  convertChoose: () => invoke('convert-choose'),
  convertRun: (id, target, options) => invoke('convert-run', id, target, options),
  convertCancel: (id) => invoke('convert-cancel', id),
  convertReveal: (id) => invoke('convert-reveal', id),
  // v0.9.2: Gönder (Quick Share / AirDrop Send & Receive)
  onShareDrop: (cb) => {
    if (typeof cb === 'function') shareDropCallbacks.add(cb);
  },
  onShareState: (cb) => ipcRenderer.on('share-state', (_e, st) => cb(st)),
  onShareOffer: (cb) => ipcRenderer.on('share-offer', (_e, offer) => cb(offer)),
  onShareReceived: (cb) => ipcRenderer.on('share-received', (_e, entry) => cb(entry)),
  shareState: () => invoke('share-state'),
  shareDiscover: () => invoke('share-discover'),
  shareQrRefresh: () => invoke('share-qr-refresh'),
  shareChoose: () => invoke('share-choose'),
  shareRemoveFile: (filePath) => invoke('share-remove-file', filePath),
  shareReceiveMode: (mode) => invoke('share-receive-mode', mode),
  shareSend: (target) => invoke('share-send', target),
  shareCancel: () => invoke('share-cancel'),
  shareFirewall: (action) => invoke('share-firewall', action === 'allow' ? 'allow' : action === 'refresh' ? 'refresh' : 'check'),
  shareRespond: (id, accept) => invoke('share-respond', id, accept),
  shareReveal: (filePath) => invoke('share-reveal', filePath),
  wakeEnable: (value) => invoke('wake-enable', value),
  micPrivacy: (value) => invoke('mic-privacy', value),
  wakeArm: () => invoke('wake-arm'),
  wakeCheck: (bytes) => invoke('wake-check', bytes),
  wakeStop: () => invoke('wake-stop'),
  onPowerPaused: (cb) => ipcRenderer.on('ui-power-paused', (_e, value) => cb(value)),
  primaryRead: () => invoke('provider-primary-read'),
  primarySave: (id) => invoke('provider-primary-save', id),
  onPrimary: (cb) => ipcRenderer.on('provider-primary-changed', (_e, value) => cb(value)),
  providersStatus: () => invoke('providers-status'),
  providersLogin: (id) => invoke('providers-login', id),
  providersEnable: (id, value) => invoke('providers-enable', { id, value }),
  providersAbacusTest: () => invoke('providers-abacus-test'),
  providersEvrenTest: () => invoke('providers-evren-test'),
  evrenKeySave: (key) => invoke('evren-key-save', key),
  evrenKeyClear: () => invoke('evren-key-clear'),
  evrenTerms: () => invoke('evren-terms'),
  evrenTermsAccept: () => invoke('evren-terms-accept'),
  updateState: () => invoke('update-state'),
  updateCheck: () => invoke('update-check'),
  updateAuto: (value) => invoke('update-auto', value),
  updateInstall: () => invoke('update-install'),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_e, p) => cb(p)),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_e, info) => cb(info)),
  liveVoiceStatus: () => invoke('live-voice-status'),
  liveVoiceSave: (value) => invoke('live-voice-save', value),
  liveVoiceClear: () => invoke('live-voice-clear'),
  liveVoiceKeyPage: () => invoke('live-voice-key-page'),
  liveVoiceStart: () => invoke('live-voice-start'),
  liveVoiceAudio: (bytes) => invoke('live-voice-audio', bytes),
  liveVoiceStop: () => invoke('live-voice-stop'),
  liveVoiceArm: () => invoke('live-voice-arm'),
  onLiveVoice: (cb) => ipcRenderer.on('live-voice-event', (_e, event) => cb(event)),
  petDetach: (value) => invoke('pet-detach', value),
  petDrag: (active, origin) => invoke('pet-drag', active, origin),
  petDragMove: () => invoke('pet-drag-move'),
  pointerEnter: () => invoke('panel-pointer-enter'),
  onDesktopPet: (cb) => ipcRenderer.on('ui-desktop-pet', (_e, value) => cb(value)),
  onPetPhysics: (cb) => ipcRenderer.on('pet-physics', (_e, value) => cb(value)),
  panelResize: (height, save) => invoke('panel-resize', height, save),
  companionRead: () => invoke('companion-read'),
  companionSave: (value) => invoke('companion-save', value),
  weatherCities: (query) => invoke('weather-cities', query),
  weatherForecast: () => invoke('weather-forecast'),
  memoryImport: () => invoke('memory-import'),
  onCompanion: (cb) => ipcRenderer.on('companion-changed', (_e, value) => cb(value)),
  onFileDrop: (cb) => {
    if (typeof cb === 'function') dropCallbacks.add(cb);
  },
  capture: () => invoke('capture'),
  onCapture: (cb) => ipcRenderer.on('capture-attachment', (_e, item) => cb(item)),
  editMessage: (index) => invoke('message-edit', index),
  libraryAdd: () => invoke('library-add'),
  libraryRemove: (folder) => invoke('library-remove', folder),
  librarySearch: (q) => invoke('library-search', q),
  libraryOpen: (id, reveal = false) => invoke('library-open', { id, reveal }),
  appsList: () => invoke('apps-list'),
  defaultModel: (value) => invoke('default-model', value),
  startupModel: (value) => invoke('startup-model', value),
  voiceArm: () => invoke('voice-arm'),
  voiceTranscribe: (data) => invoke('voice-transcribe', data),
  voiceSpeak: (text) => invoke('voice-speak', text),
  voiceStop: () => invoke('voice-stop'),
  usageRead: (force = false, provider = null) => invoke('usage-read', force, provider),
  onLayoutPrepare: (callback) => ipcRenderer.on('ui-layout-prepare', (_e, v) => callback(v)),
  layoutPrepared: (id) => invoke('layout-prepared', id),
  onLayout: (callback) => ipcRenderer.on('ui-layout', (_e, v) => callback(v)),
  onLayoutDone: (callback) => ipcRenderer.on('ui-layout-done', (_e, v) => callback(v)),
  layoutDone: (id) => invoke('layout-done', id),
  performanceRead: () => invoke('performance-read'),
  performanceSet: (v) => invoke('performance-set', v),
  performanceClear: () => invoke('performance-clear'),
  personalRead: () => invoke('personal-read'),
  profileGuide: () => invoke('profile-guide'),
  profilePreview: (raw) => invoke('profile-preview', raw),
  profileSave: (items) => invoke('profile-save', items),
  personalEdit: (action, args) => invoke('personal-edit', { action, args }),
  historyManage: (args) => invoke('history-manage', args),
  foldersRead: () => invoke('folders-read'),
  foldersEdit: (args) => invoke('folders-edit', args),
  foldersClassify: () => invoke('folders-classify'),
  onFoldersChanged: (fn) => ipcRenderer.on('folders-changed', () => fn()),
  panelPin: (value) => invoke('panel-pin', value),
  copy: (text, html) => invoke('clipboard-copy', text, html),
  imageSave: (dataUrl) => invoke('image-save', dataUrl),
  appIcon: (dataUrl) => invoke('app-icon', dataUrl),
  imageCopy: (dataUrl) => invoke('image-copy', dataUrl),
  media: (action) => invoke('media-control', action),
  onPersonal: (cb) => ipcRenderer.on('personal-changed', (_e, d) => cb(d)),
  onAlert: (cb) => ipcRenderer.on('personal-alert', (_e, d) => cb(d)),
  onPluginConfirm: (cb) => ipcRenderer.on('plugin-confirm', (_e, v) => cb(v)),
  pluginsRead: (kind, id) => invoke('plugins-read', kind, id),
  pluginsStatus: () => invoke('plugins-status'),
  pluginsConfigure: (id, v) => invoke('plugins-configure', id, v),
  // v0.9.10: the original name of an attached file Charles keeps as <id>.pdf (for citation chips)
  attachmentName: (id) => invoke('attachment-name', id),
  pluginsLogin: (id) => invoke('plugins-login', id),
  pluginsDisconnect: (id) => invoke('plugins-disconnect', id),
  pluginsSettings: (v) => invoke('plugins-settings', v),
  pluginsList: (kind, q) => invoke('plugins-list', kind, q),
  pluginsHome: (entity, action) => invoke('plugins-home', entity, action),
  pluginsHelp: () => invoke('plugins-help'),
  onPluginAlert: (cb) => ipcRenderer.on('plugin-alert', (_e, v) => cb(v)),
  onMailExplain: (cb) => ipcRenderer.on('mail-explain', (_e, v) => cb(v)),
  onProposal: (cb) => ipcRenderer.on('charles-proposal', (_e, v) => cb(v)),
  proposalAnswer: (id, action, said = '') => invoke('proposal-answer', id, action, said),
  chatLocal: (prompt, message) => invoke('chat-local', prompt, message),
  charlesBubble: (v) => invoke('charles-bubble', v),
  onSweat: (cb) => ipcRenderer.on('charles-sweat', (_e, v) => cb(v)),
  wakeTrainingArm: () => invoke('wake-training-arm'),
  wakeTrainingSample: (v, training) => invoke('wake-training-sample', v, training),
  wakeTrainingSave: (v) => invoke('wake-training-save', v),
  pluginsSetupStart: (id) => invoke('plugins-setup-start', id),
  pluginsSetupPage: (id, step) => invoke('plugins-setup-page', id, step),
  pluginsSetupEnd: () => invoke('plugins-setup-end'),
  pluginsImportGoogle: () => invoke('plugins-import-google'),
  shortcutsRecord: (active) => invoke('shortcuts-record', active),
  shortcutsRead: () => invoke('shortcuts-read'),
  shortcutsSave: (v) => invoke('shortcuts-save', v),
  onShortcut: (cb) => ipcRenderer.on('shortcut-action', (_e, v) => cb(v)),
  weeklyRead: (period) => invoke('weekly-read', period),
  weeklyEnable: (v) => invoke('weekly-enable', v),
  onWeekly: (cb) => ipcRenderer.on('weekly-summary', (_e, v) => cb(v)),
  boot: () => invoke('boot'),
  connect: () => invoke('connect'),
  login: () => invoke('login'),
  models: () => invoke('models'),
  chooseFolder: () => invoke('choose-folder'),
  send: (args) => invoke('send', args),
  steer: (text) => invoke('steer', text),
  // v0.7.1 SpecialBeta: workspace window
  workspace: (on) => invoke('workspace', on),
  workspaceWindow: (action, value) => invoke('workspace-window', action, value),
  workspaceState: () => invoke('workspace-state'),
  onWorkspace: (cb) => ipcRenderer.on('ui-workspace', (_e, v) => cb(v)),
  workspaceMail: () => invoke('workspace-mail'),
  filePreview: (file) => invoke('file-preview', file),
  fileOpen: (file, how) => invoke('file-open', file, how),
  fileSaveText: (name, text) => invoke('file-save-text', name, text),
  fileWriteCode: (name, text) => invoke('file-write-code', name, text),
  workspaceMailOpen: (id, recent) => invoke('workspace-mail-open', id, recent),
  workspaceMailRecent: () => invoke('workspace-mail-recent'),
  workspaceCalendar: (force, range) => invoke('workspace-calendar', force, range),
  workspaceCalendarAdd: (ev) => invoke('workspace-calendar-add', ev),
  workspaceCalendarUpdate: (id, ev) => invoke('workspace-calendar-update', id, ev),
  workspaceCalendarDelete: (id) => invoke('workspace-calendar-delete', id),
  whatsappRead: () => invoke('whatsapp-read'),
  whatsappSave: (v) => invoke('whatsapp-save', v),
  // v0.8.8: WhatsApp messages in Charles
  whatsappLiveState: () => invoke('whatsapp-live-state'),
  whatsappLiveEnable: (on) => invoke('whatsapp-live-enable', on),
  whatsappLiveInstall: () => invoke('whatsapp-live-install'),
  whatsappLiveRestart: () => invoke('whatsapp-live-restart'),
  whatsappLiveConfigure: (v) => invoke('whatsapp-live-configure', v),
  whatsappLiveLogout: () => invoke('whatsapp-live-logout'),
  onWhatsappLive: (cb) => ipcRenderer.on('whatsapp-live', (_e, v) => cb(v)),
  onWhatsappMessage: (cb) => ipcRenderer.on('whatsapp-message', (_e, v) => cb(v)),
  workspaceHomeLayout: (ids) => invoke('workspace-home-layout', ids),
  workspaceHome: (force) => invoke('workspace-home', force),
  workspaceHomeAction: (entity, action) => invoke('workspace-home-action', entity, action),
  // v0.7.7
  reviewList: () => invoke('review-list'),
  reviewGet: (id) => invoke('review-get', id),
  reviewUndo: (id) => invoke('review-undo', id),
  systemUsage: () => invoke('system-usage'),
  systemInfo: () => invoke('system-info'),
  workspaceDash: (patch) => invoke('workspace-dash', patch),
  // v0.8.0: modules
  modulesList: () => invoke('modules-list'),
  modulesPick: (kind) => invoke('modules-pick', kind),
  modulesInstall: (token) => invoke('modules-install', token),
  modulesCancel: (token) => invoke('modules-cancel', token),
  modulesOpen: (id) => invoke('modules-open', id),
  modulesEnable: (id, value) => invoke('modules-enable', id, value),
  modulesRemove: (id, deleteData) => invoke('modules-remove', id, deleteData),
  modulesDev: (value) => invoke('modules-dev', value),
  // v0.8.8: Slime for modules
  modulesLook: () => invoke('modules-look'),
  historySearch: (q) => invoke('history-search', q),
  historyImage: (name) => invoke('history-image', name),
  onModuleReact: (cb) => ipcRenderer.on('module-react', (_e, v) => cb(v)),
  onModuleWear: (cb) => ipcRenderer.on('module-wear', (_e, v) => cb(v)),
  onModulesChanged: (cb) => {
    const fn = () => cb();
    ipcRenderer.on('modules-changed', fn);
    return () => ipcRenderer.removeListener('modules-changed', fn);
  },
  onModuleEmote: (cb) => {
    const fn = (_e, name) => cb(name);
    ipcRenderer.on('module-emote', fn);
    return () => ipcRenderer.removeListener('module-emote', fn);
  },
  resetAll: (scope) => invoke('reset-all', scope),
  openDataFolder: () => invoke('open-data-folder'),
  interrupt: () => invoke('interrupt'),
  openLink: (url) => invoke('open-link', url),
  newChat: (options) => invoke('new-chat', options),
  reply: (args) => invoke('reply', args),
  expand: (value) => invoke('expand', value),
  quit: () => invoke('quit'),
  autoStart: (value) => invoke('auto-start', value),
  settings: (value) => invoke('settings', value),
  pauseServices: (value) => invoke('pause-services', value),
  serviceSave: (args) => invoke('service-save', args),
  serviceRefresh: (id) => invoke('service-refresh', id),
  sessionNew: () => invoke('session-new'),
  sessionSelect: (id) => invoke('session-select', id),
  sessionClose: () => invoke('session-close'),
  openProject: () => invoke('open-project'),
  pasteImage: (bytes, name) => invoke('paste-image', bytes, name),
  chooseFiles: () => invoke('choose-files'),
  dropFiles: (files) =>
    invoke(
      'drop-files',
      files.map((file) => webUtils.getPathForFile(file)),
    ),
  onExtras: (callback) => {
    const fn = (_e, value) => callback(value);
    ipcRenderer.on('extras-changed', fn);
    return () => ipcRenderer.removeListener('extras-changed', fn);
  },
  onHidden: (callback) => {
    ipcRenderer.on('ui-hidden', (_e, v) => callback(v));
  },
  onPeek: (callback) => {
    ipcRenderer.on('character-peek', () => callback());
  },
  onSettings: (callback) => {
    ipcRenderer.on('show-settings', () => callback());
  },
  onCursor: (callback) => {
    const listener = (_e, value) => callback(value);
    ipcRenderer.on('cursor-position', listener);
    return () => ipcRenderer.removeListener('cursor-position', listener);
  },
  onEvent: (callback) => {
    const listener = (_e, value) => callback(value);
    ipcRenderer.on('agent-event', listener);
    return () => ipcRenderer.removeListener('agent-event', listener);
  },
  onExpanded: (callback) => {
    const listener = (_e, value) => callback(value);
    ipcRenderer.on('ui-expanded', listener);
    return () => ipcRenderer.removeListener('ui-expanded', listener);
  },
});
