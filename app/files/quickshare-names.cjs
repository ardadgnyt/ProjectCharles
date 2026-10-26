// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const { isIP } = require('node:net');

// Android can hide its name in DNS-SD even though an accepted transfer supplied
// it. Keep that observation in memory; do not permanently associate an IP with
// a device (DHCP can give it to a different phone).
class QuickShareNames {
  constructor(now = Date.now) {
    this.now = now;
    this.endpoints = new Map();
    this.addresses = new Map();
  }
  friendly(value) {
    const name = String(value || '').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 255);
    if (!name || isIP(name) || /^(hidden device\b|quick share\s*\(|android cihazı$|quick share cihazı$)/i.test(name)) return null;
    return name;
  }
  prune() {
    const now = this.now();
    for (const map of [this.endpoints, this.addresses]) {
      for (const [key, value] of map) if (value.until <= now) map.delete(key);
      while (map.size > 256) map.delete(map.keys().next().value);
    }
  }
  rememberAddress(address, value) {
    this.prune();
    const name = this.friendly(value);
    if (!isIP(address || '') || !name) return false;
    this.addresses.set(address, { name, until: this.now() + 120000 });
    return true;
  }
  resolve(peer) {
    this.prune();
    const key = peer.endpointId || peer.id;
    let name = this.friendly(peer.name);
    if (name) {
      this.rememberAddress(peer.host, name);
      if (key) this.endpoints.set(key, { name, until: this.now() + 30 * 60000 });
    } else {
      name = this.endpoints.get(key)?.name || this.addresses.get(peer.host)?.name;
      if (name && key && !this.endpoints.has(key))
        this.endpoints.set(key, { name, until: this.now() + 30 * 60000 });
    }
    return { ...peer, name: name || (['phone', 'tablet', 'foldable'].includes(peer.deviceType) ? 'Android cihazı' : 'Quick Share cihazı') };
  }
}

module.exports = { QuickShareNames };
