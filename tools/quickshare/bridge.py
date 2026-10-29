# SPDX-License-Identifier: GPL-3.0-or-later
"""Charles stdio adapter for the vendored MultiDrop Windows Quick Share backend.

Control never listens on a network port. EOF on the parent pipe stops the service.
The protocol, crypto, DNS-SD publisher/responder and file writer are MultiDrop's.
"""
from __future__ import annotations

import asyncio
import contextlib
import contextvars
import dataclasses
import ipaddress
import json
import logging
import os
from pathlib import Path
import sys
import threading
import time
import uuid

from multidrop.config import Config
from multidrop.core import Device, TransferError
from multidrop.backends.quickshare import QuickShareBackend, frames


def emit(event, **data):
    print(json.dumps({"event": event, **data}, ensure_ascii=True), flush=True)


class JsonLog(logging.Handler):
    def __init__(self, file):
        super().__init__()
        self.file = Path(file)
        self.file.parent.mkdir(parents=True, exist_ok=True)

    def emit(self, record):
        # Upstream messages can include peer/file names, so formatted arguments
        # stay off disk. The message *template* and exception class do not carry
        # names, and without them every warning collapses into an identical
        # "WARNING" line that cannot be told apart while diagnosing discovery.
        # Detailed exceptions are returned to the local UI, not disk.
        detail = f"{record.name} {record.levelname} {record.msg}"
        if record.exc_info and record.exc_info[0] is not None:
            detail += f" [{record.exc_info[0].__name__}]"
        self.note("backend-log", detail)

    def note(self, stage, detail=""):
        try:
            if self.file.exists() and self.file.stat().st_size > 1024 * 1024:
                self.file.replace(self.file.with_suffix(".log.previous"))
            from datetime import datetime, timezone
            with self.file.open("a", encoding="utf-8") as stream:
                stream.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(),
                                         "stage": stage, "detail": detail}) + "\n")
        except OSError:
            pass


class Bridge:
    def __init__(self):
        self.backend = None
        self.mode = False
        self.ready = False
        self.lock = asyncio.Lock()
        self.jobs = {}
        self.offers = {}
        self.sessions = {}
        self.context = contextvars.ContextVar("quickshare_session", default=None)
        self.devices = {}
        self.discovery = None
        self.closed = asyncio.Event()
        self.log = None
        self.ticker = None
        self.forwarded = 0

    def note(self, stage, detail=""):
        if self.log:
            self.log.note(stage, detail)

    def health(self):
        backend = self.backend
        publisher = backend._publisher if backend else None
        return {"mode": "everyone" if self.mode else "off",
                "listening": bool(backend and backend.started),
                "mdns": bool(publisher and publisher._zc),
                # counts only (no addresses or names): how many adapters announce
                # and how many phone queries were answered, for diagnosing visibility
                "adapters": len(publisher.addresses) if publisher else 0,
                "answered": publisher._unicast.answered if publisher and publisher._unicast else 0,
                # packets the Python socket heard itself vs. those Electron handed over: few of
                # either while a phone is searching means Windows Firewall keeps them out
                "heard": publisher._unicast.heard if publisher and publisher._unicast else 0,
                "forwarded": self.forwarded,
                "neighbors": len(publisher._unicast.neighbors) if publisher and publisher._unicast else 0,
                "unicastSent": publisher._unicast.unicast_sent if publisher and publisher._unicast else 0,
                "asked": dict(sorted((publisher._unicast.question_types if publisher and publisher._unicast else {}).items(),
                                     key=lambda kv: -kv[1])[:6]),
                "port": backend.port if backend and backend.started else 0,
                "endpointId": backend.endpoint_id if backend else None,
                "pendingOffers": len(self.offers), "peers": len(self.devices),
                "engine": "multidrop-python", "pid": os.getpid()}

    def status(self):
        value = self.health()
        emit("health", value=value)
        return value

    async def init(self, data):
        if self.ready:
            return self.status()
        cfg = Config()
        cfg.alias = str(data.get("deviceName") or "Charles PC")[:255]
        cfg.download_dir = Path(data["downloadDir"]).resolve()
        cfg.download_dir.mkdir(parents=True, exist_ok=True)
        cfg.quickshare.port = int(data.get("port", 53318))
        cfg.quickshare.ble = False  # MultiDrop Windows never uses BlueZ/BLE.
        cfg.quickshare.mdns = data.get("discovery", True) is not False
        cfg.quickshare.bind = data.get("bind", "0.0.0.0")
        if data.get("addresses"):
            cfg.quickshare.mdns_addresses = list(data["addresses"])
        self.log = JsonLog(data["logFile"]) if data.get("logFile") else None
        if self.log:
            logging.getLogger("multidrop").addHandler(self.log)
            logging.getLogger("multidrop").setLevel(logging.INFO)
        self.backend = QuickShareBackend(cfg)
        # Charles preserves an opaque endpoint id across launches. No identity
        # rotation on transfer, discovery or receive-mode transitions.
        identity_file = Path(data["identityFile"]) if data.get("identityFile") else None
        if identity_file:
            with contextlib.suppress(OSError, ValueError, TypeError):
                value = json.loads(identity_file.read_text(encoding="utf-8"))
                endpoint = value.get("endpointId", "")
                if len(endpoint) == 4 and endpoint.isascii() and endpoint.isalnum():
                    self.backend.endpoint_id = endpoint
            identity_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = identity_file.with_suffix(".tmp")
            temporary.write_text(json.dumps({"endpointId": self.backend.endpoint_id}), encoding="utf-8")
            temporary.replace(identity_file)
        self.ready = True
        await self.receiving(data.get("receiving", True))
        self.ticker = asyncio.create_task(self.background())
        self.note("engine-start", json.dumps(self.health()))
        return self.status()

    def session(self):
        session = self.context.get()
        if session is None:
            session = {"id": "receive-" + uuid.uuid4().hex, "files": [],
                       "task": asyncio.current_task(), "total": 0, "done": 0,
                       "sizes": {}, "lastProgress": 0, "peerName": ""}
            self.context.set(session)
            self.sessions[session["id"]] = session
        return session

    async def offer(self, offer):
        session = self.session()
        job = session["id"]
        if not self.mode:
            return set()
        session["peerName"] = offer.sender_name
        session["peerAddress"] = offer.sender_address
        session["total"] = offer.total_size
        future = asyncio.get_running_loop().create_future()
        self.offers[job] = future
        self.note("receive-offer", f"id={job} files={len(offer.files)} bytes={offer.total_size}")
        emit("offer", id=job, protocol="quickshare", peerName=offer.sender_name,
             pin=session.get("pin"), files=[dataclasses.asdict(f) for f in offer.files])
        try:
            accepted = await asyncio.wait_for(future, 120)
            return {f.id for f in offer.files} if accepted and self.mode else set()
        finally:
            self.offers.pop(job, None)
            emit("offer-closed", id=job)

    def event(self, kind, details):
        session = self.session()
        job = session["id"]
        if kind == "pin":
            session["pin"] = details["pin"]
            session["peerName"] = details.get("from", "")
            self.note("receive-secure-ready", f"id={job}")
        elif kind == "session_started":
            emit("progress", id=job, protocol="quickshare", direction="receive",
                 peerName=session["peerName"], transferred=0, total=session["total"])
        elif kind == "progress":
            session["sizes"][details["file"]] = details["done"]
            now = time.monotonic()
            if now - session["lastProgress"] >= .08:
                session["lastProgress"] = now
                emit("progress", id=job, protocol="quickshare", direction="receive",
                     peerName=session["peerName"], fileName=details["file"],
                     transferred=sum(session["sizes"].values()), total=session["total"])
        elif kind == "file_received":
            path = Path(details["path"])
            session["files"].append({"name": path.name, "path": str(path), "size": path.stat().st_size})
        elif kind == "session_done":
            self.note("receive-done", f"id={job} files={len(session['files'])}")
            emit("received", id=job, protocol="quickshare", peerName=session["peerName"],
                 peerAddress=session.get("peerAddress"), files=session["files"])
        elif kind == "failed":
            self.note("receive-failed", f"id={job}")
            emit("transfer-error", id=job, protocol="quickshare", direction="receive",
                 peerName=session["peerName"], error=details.get("error", "Aktarım başarısız."))
        if kind in ("session_done", "failed", "rejected"):
            self.sessions.pop(job, None)

    async def receiving(self, enabled):
        async with self.lock:
            enabled = bool(enabled)
            if enabled == self.mode and (not enabled or self.backend.started):
                return self.status()
            self.mode = enabled
            if enabled:
                try:
                    await self.backend.start(self.offer, self.event)
                except BaseException:
                    self.mode = False
                    await self.backend.stop()
                    raise
            else:
                for future in list(self.offers.values()):
                    if not future.done():
                        future.set_result(False)
                handlers = list(self.backend._handlers)
                await self.backend.stop()
                if handlers:
                    await asyncio.gather(*handlers, return_exceptions=True)
                for session in list(self.sessions.values()):
                    emit("offer-closed", id=session["id"])
                self.sessions.clear()
            self.note("receive-mode", "everyone" if enabled else "off")
            return self.status()

    async def discover(self):
        if not self.backend.qs.mdns:
            return []
        if self.discovery and not self.discovery.done():
            return await asyncio.shield(self.discovery)
        async def run():
            found = await self.backend.discover(3)
            now = time.monotonic()
            publisher = self.backend._publisher
            if publisher and publisher._unicast:
                for device in found:
                    with contextlib.suppress(Exception):
                        publisher._unicast.neighbor(str(device.address))
            for device in found:
                self.devices[device.id] = (device, now)
            self.devices = {key: item for key, item in self.devices.items() if now - item[1] <= 90}
            peers = [{"id": "qs:" + d.id, "endpointId": d.id, "protocol": "quickshare",
                      "host": d.address, "port": d.port, "name": d.name,
                      "deviceType": d.device_type, "updatedAt": int(time.time() * 1000)}
                     for d, _ in self.devices.values()]
            emit("peers", value=peers)
            return peers
        self.discovery = asyncio.create_task(run())
        return await asyncio.shield(self.discovery)

    async def background(self):
        # Charles: a scan opens and closes its own zeroconf sockets on UDP/5353.
        # Doing that every 5 s churned the port the receiver listens on; the
        # share panel asks for a scan itself when it opens, so the background
        # keeps the device list fresh only every 30 s.
        tick = 0
        try:
            while True:
                if tick % 6 == 0:
                    with contextlib.suppress(Exception):
                        await self.discover()
                tick += 1
                if tick % 12 == 0:
                    self.note("health", json.dumps(self.health()))
                    self.status()
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            pass

    async def send(self, request):
        # Bind each outbound event to its own job; receive callbacks never share
        # this task's context. No receive socket/publisher reset after sending.
        files = [Path(p).resolve() for p in request["files"]]
        if not files or any(not f.is_file() for f in files):
            raise TransferError("Gönderilecek dosya bulunamadı.")
        device = Device("quickshare", request.get("endpointId", ""), request.get("name", ""),
                        str(request["host"]), int(request["port"]))
        ipaddress.IPv4Address(device.address)
        if not 0 < device.port < 65536:
            raise ValueError("Geçersiz cihaz portu.")
        total = sum(f.stat().st_size for f in files)
        sizes = {}
        last_progress = 0
        def event(kind, data):
            nonlocal last_progress
            if kind == "pin":
                emit("send-pin", id=request["jobId"], pin=data["pin"])
            elif kind in ("waiting", "progress"):
                if kind == "progress":
                    sizes[data["file"]] = data["done"]
                now = time.monotonic()
                if kind == "waiting" or now - last_progress >= .08:
                    last_progress = now
                    emit("send-progress", id=request["jobId"],
                         status="waiting" if kind == "waiting" else "sending",
                         fileName=data.get("file", files[0].name),
                         transferred=sum(sizes.values()), total=total)
        await self.backend.send(device, files, on_event=event)
        return {"files": [{"name": f.name, "path": str(f), "size": f.stat().st_size} for f in files]}

    async def cancel(self, job):
        if job in self.offers:
            future = self.offers[job]
            if not future.done():
                future.set_result(False)
            return True
        task = self.jobs.get(job)
        session = self.sessions.get(job)
        if session:
            task = session["task"]
        if task:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
            self.sessions.pop(job, None)
            emit("offer-closed", id=job)
            return True
        return False

    async def dispatch(self, command):
        method = command.get("method")
        data = command.get("data") or {}
        if method == "init":
            return await self.init(data)
        if method == "stop":
            self.closed.set()
            return True
        if not self.ready:
            raise RuntimeError("Quick Share henüz hazır değil.")
        if method == "receiving":
            return await self.receiving(data["enabled"])
        if method == "discover":
            return await self.discover()
        if method == "health":
            return self.status()
        if method == "refresh":
            # Charles: after sleep/resume or a network change, publish again from
            # fresh sockets. Same endpoint id, so the phone sees the same device.
            async with self.lock:
                if self.mode and self.backend.started:
                    with contextlib.suppress(Exception):
                        await self.backend.republish()
                        self.note("mdns-refresh")
            return self.status()
        if method == "answer":
            future = self.offers.get(data["id"])
            if future and not future.done():
                future.set_result(bool(data["accept"]))
                return True
            return False
        if method == "cancel":
            return await self.cancel(data["id"])
        if method == "send":
            job = data["jobId"]
            self.jobs[job] = asyncio.current_task()
            try:
                return await self.send(data)
            finally:
                self.jobs.pop(job, None)
        if method == "mdns-neighbor":
            publisher = self.backend._publisher
            if publisher and publisher._unicast:
                publisher._unicast.neighbor(str(ipaddress.IPv4Address(data["address"])))
            return True
        if method == "mdns-query":
            publisher = self.backend._publisher
            responder = publisher._unicast if publisher else None
            if responder:
                import base64
                address = str(ipaddress.IPv4Address(data["address"]))
                packet = base64.b64decode(data["packet"], validate=True)
                port = int(data["port"])
                if len(packet) <= 9000 and 0 < port < 65536:
                    self.forwarded += 1
                    responder.heard -= 1   # counted under "forwarded", not as heard directly
                    responder.datagram_received(packet, (address, port))
            return True
        raise ValueError("Bilinmeyen paylaşım işlemi.")

    async def handle(self, command):
        try:
            result = await self.dispatch(command)
            emit("response", id=command.get("id"), ok=True, value=result)
        except asyncio.CancelledError:
            emit("response", id=command.get("id"), ok=False, error="Aktarım iptal edildi.")
        except Exception as error:
            self.note("command-error", f"{command.get('method')} [{type(error).__name__}]")
            emit("response", id=command.get("id"), ok=False, error=str(error))

    async def close(self):
        if self.ticker:
            self.ticker.cancel()
            await asyncio.gather(self.ticker, return_exceptions=True)
        if self.discovery:
            self.discovery.cancel()
            await asyncio.gather(self.discovery, return_exceptions=True)
        for task in list(self.jobs.values()):
            task.cancel()
        if self.jobs:
            await asyncio.gather(*list(self.jobs.values()), return_exceptions=True)
        if self.backend:
            await self.receiving(False)
        self.note("engine-stop")


async def main():
    bridge = Bridge()
    queue = asyncio.Queue()
    loop = asyncio.get_running_loop()
    def reader():
        while True:
            line = sys.stdin.buffer.readline(1024 * 1024 + 1)
            if not line or len(line) > 1024 * 1024:
                loop.call_soon_threadsafe(queue.put_nowait, None)
                return
            try:
                value = json.loads(line)
                if isinstance(value, dict):
                    loop.call_soon_threadsafe(queue.put_nowait, value)
            except (ValueError, UnicodeDecodeError):
                continue
    threading.Thread(target=reader, daemon=True).start()
    tasks = set()
    try:
        while not bridge.closed.is_set():
            waiter = asyncio.create_task(queue.get())
            closed = asyncio.create_task(bridge.closed.wait())
            done, pending = await asyncio.wait({waiter, closed}, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            if closed in done or waiter.result() is None:
                break
            task = asyncio.create_task(bridge.handle(waiter.result()))
            tasks.add(task)
            task.add_done_callback(tasks.discard)
    finally:
        for task in list(tasks):
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await bridge.close()


if __name__ == "__main__":
    asyncio.run(main())
