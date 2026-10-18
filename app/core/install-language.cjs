// v0.8.0: the setup asks for a language (English by default) and writes charles-install.json
// next to the app: {"language":"de","stamp":"2026-10-18T15:00:00Z"}. Charles applies it once
// per install: a later change in Settings is kept until the next setup run.
const fs = require('node:fs');
const path = require('node:path');

const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'zh'];

/** charles-install.json → { language, stamp } or null. */
function readInstallLanguage(root, fsx = fs) {
  try {
    const file = path.join(root, 'charles-install.json');
    if (fsx.statSync(file).size > 1024) return null;
    const v = JSON.parse(String(fsx.readFileSync(file, 'utf8')).replace(/^﻿/, ''));
    if (!v || !LANGS.includes(v.language) || typeof v.stamp !== 'string' || !v.stamp || v.stamp.length > 40) return null;
    return { language: v.language, stamp: v.stamp };
  } catch {
    return null;
  }
}

/** Sets prefs.data.language from the setup choice if this install was not applied yet. */
function applyInstallLanguage(root, prefs, fsx = fs) {
  const pick = readInstallLanguage(root, fsx);
  if (!pick || !prefs?.data || prefs.data.installStamp === pick.stamp) return null;
  prefs.data.language = pick.language;
  prefs.data.installStamp = pick.stamp;
  try {
    prefs.save();
  } catch {}
  return pick.language;
}

module.exports = { readInstallLanguage, applyInstallLanguage, LANGS };
