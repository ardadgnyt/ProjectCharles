#!/usr/bin/env python3
"""Create CharlesSetup.exe and its SHA-256 from the built checkout.

    tools\\quickshare\\python\\python.exe -B scripts/setup-pack.py <output folder>

The installer program (setup/CharlesSetup.cs, compiled by scripts/build-setup.ps1) comes first, then
the application as a zip with charles-manifest.json, then a footer the program reads:

    [program][zip][sha-256 of the zip: 32][program length: 8][zip length: 8]["CHARLES1": 8]
"""
import hashlib
import importlib.util
import json
import os
import pathlib
import struct
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]).resolve()
out.mkdir(parents=True, exist_ok=True)
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
target = out / 'CharlesSetup.exe'
work = out / '.charles-setup-work'
work.mkdir(parents=True, exist_ok=True)
stub = work / 'stub.exe'
subprocess.run(['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(root / 'scripts' / 'build-setup.ps1'), '-Output', str(stub)], check=True)
spec = importlib.util.spec_from_file_location('payload_pack', root / 'scripts/package.py')
packer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packer)
payload = work / 'Charles.zip'
packer.main(str(root), str(payload))

digest, whole = hashlib.sha256(), hashlib.sha256()
partial = pathlib.Path(str(target) + '.partial')
stub_bytes = stub.read_bytes()
with partial.open('wb') as w:
    w.write(stub_bytes)
    whole.update(stub_bytes)
    with payload.open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(block)
            whole.update(block)
            w.write(block)
    footer = digest.digest() + struct.pack('<qq', len(stub_bytes), payload.stat().st_size) + b'CHARLES1'
    whole.update(footer)
    w.write(footer)
os.replace(partial, target)
value = whole.hexdigest()
pathlib.Path(str(target) + '.sha256').write_text(value + '  ' + target.name + '\n', encoding='utf-8')
hashes = work / 'Charles.zip.hashes.json'
if hashes.exists():
    hashes.unlink()
payload.unlink()
stub.unlink()
work.rmdir()
print(json.dumps({'setup': str(target), 'sha256': value, 'bytes': target.stat().st_size, 'version': version}))
