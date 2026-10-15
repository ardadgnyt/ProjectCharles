// Pinned upstream downloads; no API keys, services or registry changes.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
async function download(url, destination, hash) {
  if (
    fs.existsSync(destination) &&
    crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') === hash
  )
    return;
  const response = await fetch(url);
  if (!response.ok) throw Error(`Download HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (crypto.createHash('sha256').update(data).digest('hex') !== hash)
    throw Error('Download SHA-256 mismatch');
  fs.writeFileSync(destination, data);
}
(async () => {
  const cache = path.join(root, 'tools', 'voice-setup');
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(path.join(root, 'models'), { recursive: true });
  const zip = path.join(cache, 'whisper.zip'),
    unpack = path.join(cache, 'unpacked'),
    dest = path.join(root, 'tools/whisper');
  await download(
    'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip',
    zip,
    '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a',
  );
  execFileSync(
    path.join(
      process.env.SystemRoot || 'C:\\Windows',
      'System32/WindowsPowerShell/v1.0/powershell.exe',
    ),
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Expand-Archive -LiteralPath $env:CHARLES_VOICE_ZIP -DestinationPath $env:CHARLES_VOICE_UNPACK -Force',
    ],
    {
      windowsHide: true,
      env: { ...process.env, CHARLES_VOICE_ZIP: zip, CHARLES_VOICE_UNPACK: unpack },
    },
  );
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(path.join(unpack, 'Release')))
    if (
      (name.startsWith('ggml') && name.endsWith('.dll')) ||
      name === 'whisper.dll' ||
      name === 'whisper-cli.exe'
    )
      fs.copyFileSync(path.join(unpack, 'Release', name), path.join(dest, name));
  await download(
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin?download=true',
    path.join(root, 'models/ggml-small.bin'),
    '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  );
  console.log('Yerel ses modeli hazır.');
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
