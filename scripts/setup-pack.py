#!/usr/bin/env python3
"""Create the complete Windows setup kit and its SHA-256 from the built checkout."""
import hashlib
import importlib.util
import pathlib
import sys
import zipfile
import json

root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]).resolve()
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
label = 'v' + version.split('-')[0] + '-Beta'
kit = out / ('ProjectCharles-' + label + '-Setup')
kit.mkdir(parents=True, exist_ok=True)
spec = importlib.util.spec_from_file_location('payload_pack', root / 'scripts/package.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
payload = kit / 'Charles.zip'
packer.main(str(root), str(payload))

def sha(file):
    digest = hashlib.sha256()
    with file.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(block)
    value = digest.hexdigest()
    pathlib.Path(str(file) + '.sha256').write_text(value + '  ' + file.name + '\n', encoding='utf-8')
    return value

sha(payload)
for name in ['Install.cmd', 'install.ps1']:
    (kit / name).write_bytes((root / 'setup' / name).read_bytes())
(kit / 'LICENSE').write_bytes((root / 'LICENSE').read_bytes())
(kit / 'README.txt').write_text('Charles ' + version + ''' - Windows Setup

Extract this entire folder, then run Install.cmd. Select your language and destination.
The setup includes the runtime and voice tools; Node.js is not required separately.
The Download module is installed separately; its tools (yt-dlp, FFmpeg) are included.
If an older in-app updater leaves files in _update, use this setup once.
Chats and settings remain in %APPDATA%\\Charles.

Klasorun tamamini cikartin, Install.cmd dosyasini calistirin. Dil ve kurulum yolunu secin.
Node.js kurmaniz gerekmez. Download modulu ayri kurulur; indirme araclari (yt-dlp, FFmpeg) pakete dahildir.
Eski guncelleyici _update klasorunde takiliyorsa bir kez bu Setup paketini kullanin.
Sohbetler ve ayarlar %APPDATA%\\Charles klasorunde korunur.
''', encoding='utf-8')
archive = out / (kit.name + '.zip')
with zipfile.ZipFile(archive, 'w', allowZip64=True) as z:
    for file in sorted(kit.iterdir()):
        if file.name.endswith('.hashes.json'):
            continue
        z.write(file, kit.name + '/' + file.name, compress_type=zipfile.ZIP_STORED if file.suffix == '.zip' else zipfile.ZIP_DEFLATED)
print(json.dumps({'setup':str(archive), 'sha256':sha(archive), 'bytes':archive.stat().st_size}))
