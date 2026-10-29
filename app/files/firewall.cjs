// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// v0.9.6: Windows Firewall rules for the private Quick Share runtime.
//
// Phones only see the PC if their mDNS questions (UDP 5353) and connections (TCP 53318) reach
// tools/quickshare/python/python.exe. Without an allow rule — or with the block rule Windows
// writes when its first-run prompt is dismissed — the PC shows up only now and then (when
// Charles itself happens to send traffic) and transfers hang on "Bağlanıyor…".
//
// check(): reads the rules without administrator rights. allow(): runs
// tools/quickshare/Allow-Local-Network.ps1 once through the normal Windows UAC prompt.
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ps = (script, timeout = 30000) =>
  new Promise((resolve, reject) =>
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout, maxBuffer: 256 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(String(stdout || '').trim())),
    ),
  );
const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";

function checkScript(runtime) {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$runtime = [IO.Path]::GetFullPath(${quote(runtime)})
$h = [Security.Cryptography.SHA256]::Create()
$suffix = ([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($runtime.ToLowerInvariant())))).Replace('-','').Substring(0,12)
$allow = 0
foreach ($p in @('TCP','UDP')) { $r = Get-NetFirewallRule -Name "Charles-QuickShare-$suffix-$p"; if ($r -and $r.Enabled -eq 'True' -and $r.Action -eq 'Allow') { $allow++ } }
$block = @(Get-NetFirewallApplicationFilter -Program $runtime | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' }).Count
$profile = (Get-NetConnectionProfile | Select-Object -First 1).NetworkCategory
@{ allow = $allow; block = $block; profile = "$profile" } | ConvertTo-Json -Compress`;
}

class QuickShareFirewall {
  constructor({ runtimeRoot, platform = process.platform, run = ps } = {}) {
    this.runtimeRoot = runtimeRoot;
    this.platform = platform;
    this.run = run;
    this.cache = null;
  }
  runtime() {
    return path.join(this.runtimeRoot(), 'python', 'python.exe');
  }
  async check(force = false) {
    if (this.platform !== 'win32') return { ok: true, unsupported: true };
    if (!force && this.cache && Date.now() - this.cache.at < 10 * 60000) return this.cache.value;
    const runtime = this.runtime();
    if (!fs.existsSync(runtime)) return { ok: true, unsupported: true };
    let value;
    try {
      const out = JSON.parse(await this.run(checkScript(runtime)));
      const allow = Number(out.allow) || 0;
      const block = Number(out.block) || 0;
      value = { ok: allow >= 2 && block === 0, allow, block, profile: String(out.profile || '') };
    } catch {
      value = { ok: true, unknown: true }; // never nag when the rules cannot be read
    }
    this.cache = { at: Date.now(), value };
    return value;
  }
  async allow() {
    if (this.platform !== 'win32') return { ok: true, unsupported: true };
    const script = path.join(this.runtimeRoot(), 'Allow-Local-Network.ps1');
    if (!fs.existsSync(script)) throw Error('Ağ izni betiği bulunamadı.');
    try {
      await this.run(
        `$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru ` +
          `-ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',${quote(script)}); exit $p.ExitCode`,
        120000,
      );
    } catch {
      throw Error('Ağ izni verilmedi. Windows onay penceresinde “Evet” seçilmeli.');
    }
    this.cache = null;
    return this.check(true);
  }
}

module.exports = { QuickShareFirewall, checkScript };
