#!/usr/bin/env python3
"""Builds the installer payload Charles.zip from a Charles folder (developer tool).

    python3 scripts/package.py <Charles klasörü> <çıktı .zip>

Every file is read once; the bytes that go into the zip are the bytes that are hashed, so
charles-manifest.json (inside the zip) describes exactly what was packed. install.ps1 checks
the installed files against it and re-extracts anything that came out wrong.

The build stops if a Windows program or library in the source is not a valid PE file
(e.g. a truncated or zero-filled electron.exe) instead of shipping a broken installer.
"""
import hashlib
import json
import os
import sys
import time
import zipfile

SKIP_DIRS = {'.git', '_to_delete', '_update', 'release', 'modules-bundled', '__pycache__', '.qa'}
# personal / machine-local files never go into an installer
SKIP_FILES = {
    'Charles.zip',
    'charles-manifest.json',
    'Charles-creator.json',
    'charles-install.json',  # the language chosen in setup on this computer
    '.env',
    # local-only notes (kept out of GitHub and releases)
    'docs/GITHUB.md',
    'docs/VERIFICATION-v0.4.4.md',
}
STORE = ('.zip', '.gz', '.png', '.jpg', '.ico', '.mp3', '.ogg', '.wav', '.bin', '.onnx', '.woff2', '.7z', '.asar')
PE = ('.exe', '.dll', '.node')
CHUNK = 256 * 1024  # bigger reads come back wrong through the VM folder share


def hashed(rel):
    low = rel.lower()
    return low.endswith(PE) or low.startswith('node_modules/electron/dist/')


def must_be_pe(rel):
    # Windows binaries Charles runs. Other platforms' prebuilds (linux/darwin .node files)
    # and npm's placeholder scripts named *.exe are not Windows programs and are fine.
    low = rel.lower()
    if 'linux' in low or 'darwin' in low:
        return False
    return low.startswith('node_modules/electron/dist/') and low.endswith(PE) or (
        low.endswith(PE) and ('win32' in low or 'windows' in low or low.startswith('tools/'))
    )


def read_all(path, size):
    # Folders shared from Windows into the VM sometimes end a read early on big files
    # (seen: electron.exe stopping at 16 MB / 85 MB). Reopen and continue from the same
    # position until the whole file is read; give up after repeated empty reads.
    done, empty = 0, 0
    while done < size and empty < 20:
        with open(path, 'rb') as f:
            f.seek(done)
            while done < size:
                block = f.read(min(CHUNK, size - done))
                if not block:
                    break
                done += len(block)
                empty = 0
                yield block
        if done < size:
            empty += 1
            time.sleep(0.25)


def valid_pe(head):
    if len(head) < 64 or head[:2] != b'MZ':
        return False
    off = int.from_bytes(head[0x3C:0x40], 'little')
    return 0 < off and off + 6 <= len(head) and head[off:off + 4] == b'PE\0\0'


def main(src, out):
    files = []
    for root, dirs, names in os.walk(src):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and os.path.relpath(os.path.join(root, d), src).replace(os.sep, '/') not in {'modules/download', 'tools/download', 'licenses/download'})
        for name in sorted(names):
            rel = os.path.relpath(os.path.join(root, name), src).replace(os.sep, '/')
            if rel in SKIP_FILES or rel.endswith(('.tar', '.log', '.pyc')) or (rel.startswith('node_modules/electron/dist/charles-host-') and rel.endswith('.exe')):
                continue
            files.append(rel)
    manifest, problems, full = {}, [], {}
    with zipfile.ZipFile(out, 'w', allowZip64=True) as z:
        for rel in files:
            path = os.path.join(src, rel)
            size = os.path.getsize(path)
            store = size > 50e6 or rel.lower().endswith(STORE) or rel.startswith('models/')
            info = zipfile.ZipInfo.from_file(path, rel)
            info.compress_type = zipfile.ZIP_STORED if store else zipfile.ZIP_DEFLATED
            digest, total, head = hashlib.sha256(), 0, b''
            with z.open(info, 'w', force_zip64=size > 2**31) as w:
                for block in read_all(path, size):
                    if len(head) < 4096:
                        head += block[: 4096 - len(head)]
                    digest.update(block)
                    w.write(block)
                    total += len(block)
            if total != size:
                problems.append(f'{rel}: {total} bayt okundu, {size} bekleniyordu')
            if must_be_pe(rel) and not valid_pe(head):
                problems.append(f'{rel}: geçerli bir Windows programı değil')
            full[rel] = digest.hexdigest().upper()
            manifest[rel] = [total, full[rel] if hashed(rel) else None]
        z.writestr('charles-manifest.json', json.dumps({'format': 1, 'files': manifest}))
    if problems:
        os.remove(out)
        print('PAKET OLUŞTURULMADI:\n  ' + '\n  '.join(problems[:20]))
        sys.exit(1)
    # Every file's hash, for a second independent read of the source (see DEVELOPMENT.md).
    json.dump(full, open(out + '.hashes.json', 'w'))
    exe = manifest.get('node_modules/electron/dist/electron.exe')
    print(f'{len(files)} dosya paketlendi; electron.exe {exe[0] if exe else "YOK"} bayt')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
