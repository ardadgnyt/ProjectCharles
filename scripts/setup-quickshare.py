"""Maintainer bootstrap: private Windows x64 Python, not a system installation.

Run with a development Python that has pip: python scripts/setup-quickshare.py
End users receive this runtime already included in the setup/update ZIP.
"""
from pathlib import Path
import hashlib
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

root = Path(__file__).resolve().parent.parent / 'tools' / 'quickshare'
runtime = root / 'python'
url = 'https://www.python.org/ftp/python/3.13.17/python-3.13.17-embed-amd64.zip'
expected = '9e35319bffedab8b36ad44d8f377cb4f1733bcec257a0b6d04d94f01486ddb38'
runtime.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='charles-python-') as temp:
    archive = Path(temp) / 'python.zip'
    urllib.request.urlretrieve(url, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise RuntimeError('Python SHA-256 mismatch')
    with zipfile.ZipFile(archive) as z:
        z.extractall(runtime)
    (runtime / 'python313._pth').write_text('python313.zip\n.\npackages\n..\n..\\vendor\n', encoding='utf-8')
subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', str(runtime / 'packages'),
                '--platform', 'win_amd64', '--python-version', '3.13', '--only-binary=:all:',
                '--no-compile', '--upgrade', '-r', str(root / 'requirements.lock')], check=True)
print('Charles Quick Share Windows runtime is ready.')
