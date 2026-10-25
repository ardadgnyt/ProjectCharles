"""Independent peer: run against a locally downloaded, unmodified MultiDrop checkout.
Usage: python multidrop-peer.py SOURCE_DIR receive INBOX | send PORT FILE...
Dependencies: cryptography, protobuf. No discovery, BLE, or external network.
"""
import asyncio
import json
import sys
import types
from pathlib import Path

source = Path(sys.argv[1])
# Load only the protocol package; its desktop backend imports optional GUI/BLE deps.
sys.path.insert(0, str(source))
for name, relative in [('multidrop.backends', 'multidrop/backends'),
                       ('multidrop.backends.quickshare', 'multidrop/backends/quickshare')]:
    module = types.ModuleType(name)
    module.__path__ = [str(source / relative)]
    sys.modules[name] = module
from multidrop.backends.quickshare import inbound, outbound

def event(kind, details):
    print(json.dumps({'event': kind, 'details': details}, default=str), flush=True)

async def main():
    if sys.argv[2] == 'send':
        await outbound.send('127.0.0.1', int(sys.argv[3]), our_name='MultiDrop reference',
                            entries=[(Path(p), Path(p).name) for p in sys.argv[4:]], on_event=event)
        return
    done = asyncio.Event()
    async def accept(offer):
        return {f.id for f in offer.files}
    async def receive(reader, writer):
        try:
            await inbound.handle_inbound(reader, writer, download_dir=Path(sys.argv[3]),
                                         on_offer=accept, on_event=event)
        finally:
            done.set()
    server = await asyncio.start_server(receive, '127.0.0.1', 0)
    print(json.dumps({'port': server.sockets[0].getsockname()[1]}), flush=True)
    async with server:
        await asyncio.wait_for(done.wait(), 45)

asyncio.run(main())
