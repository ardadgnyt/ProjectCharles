// v1.0.0: what the chat says after Stop, by whether the stopped turn could have changed files.

/** True when a turn of `model` in `mode` could change files: Codex (GPT, no provider prefix) always
 *  runs with its sandbox; a CLI connection only in project mode; EVREN (HTTP, no tools) never. */
export function turnCanChangeFiles(model: string, mode: string) {
  if (/^evren:/.test(model)) return false;
  return mode === 'project' || !/^[a-z][a-z0-9_-]*:/.test(model);
}

/** The chat row after a stopped turn. */
export function stoppedText(model: string, mode: string) {
  return turnCanChangeFiles(model, mode)
    ? 'İş durduruldu. Daha önce yapılan dosya değişiklikleri korunur.'
    : 'Yanıt durduruldu.';
}
