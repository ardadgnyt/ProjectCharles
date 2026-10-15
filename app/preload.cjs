const { contextBridge, ipcRenderer, webUtils } = require('electron');
const invoke = async (channel, ...args) => {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
let dropCallback,
  lastDropSignal = 0;
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
    let task;
    try {
      task = files.length
        ? invoke(
            'drop-files',
            files.map((f) => webUtils.getPathForFile(f)),
          )
        : invoke('drop-text', text);
    } catch (error) {
      dropCallback?.({ error: error.message });
      return;
    }
    task.then(
      (items) => dropCallback?.({ items }),
      (error) => dropCallback?.({ error: error.message }),
    );
  },
  true,
);
contextBridge.exposeInMainWorld('charles', {
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
  memoryImport: () => invoke('memory-import'),
  onCompanion: (cb) => ipcRenderer.on('companion-changed', (_e, value) => cb(value)),
  onFileDrop: (cb) => {
    dropCallback = cb;
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
  copy: (text) => invoke('clipboard-copy', text),
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
