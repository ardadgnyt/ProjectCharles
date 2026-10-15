// v0.6.5: "search the web for …", "open … on YouTube" — typed or spoken.
// Opens the user's default browser (shell.openExternal). Nothing is sent to an AI.
//
// parseWebCommand(text) → { kind: 'search' | 'youtube' | 'youtube-search' | 'site', query, url }
// openWeb(command, { openExternal, fetch }) → message for the chat

function lower(s) {
  return String(s || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[’`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Polite padding around the actual request.
function tidy(s) {
  return s
    .replace(/^(?:hey\s+)?charles[,\s]+/, '')
    .replace(/^(?:lütfen|lutfen|please)\s+/, '')
    .replace(/\s+(?:lütfen|lutfen|please)$/, '')
    .replace(/[.!?]+$/, '')
    .trim();
}

// Removes a Turkish accusative/dative ending glued to the query with an apostrophe
// ("kediler'i", "Tarkan'ın şarkısı" stays as written otherwise).
function bare(q) {
  return q
    .replace(/'(?:yi|yı|yu|yü|i|ı|u|ü|nı|ni|nu|nü)$/u, '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const VERB_SEARCH =
  '(?:ara|arat|aratır mısın|aratir misin|arar mısın|arar misin|araştır|arastir|bul|bulur musun)';
const VERB_OPEN =
  '(?:aç|ac|açar mısın|acar misin|açsana|oynat|oynatır mısın|oynatir misin|başlat|baslat|çal|cal|çalar mısın|izlet|göster|goster)';
const YT = "(?:youtube|you tube|yutup|youtup)(?:'?(?:dan|tan|da|ta|de|te|u|yu))?";
const WEB =
  "(?:internet(?:'?(?:te|ten|ten bana))?|google(?:'?(?:da|dan|la|layarak))?|web(?:'?(?:de|den))?|tarayıcı(?:da|dan)?|tarayici(?:da|dan)?)";

function parseWebCommand(text) {
  const t = tidy(lower(text));
  if (!t || t.length > 300) return null;
  let m;

  // ── YouTube ───────────────────────────────────────────────────────────────
  // "youtube'dan X videosunu aç", "youtube'da X aç", "youtube'dan X'i oynat"
  m = t.match(
    new RegExp(
      `^(?:bana\\s+)?${YT}\\s+(.+?)\\s+(?:(?:videosunu|videoyu|videosu|klibini|klibi|şarkısını|sarkisini|şarkıyı|sarkiyi)\\s+)?${VERB_OPEN}$`,
    ),
  );
  if (m) return yt('youtube', m[1]);
  // "X videosunu youtube'dan aç"
  m = t.match(
    new RegExp(
      `^(.+?)\\s+(?:(?:videosunu|videoyu|klibini|şarkısını|sarkisini)\\s+)?${YT}\\s+${VERB_OPEN}$`,
    ),
  );
  if (m) return yt('youtube', m[1]);
  // "youtube'da X ara"
  m = t.match(new RegExp(`^(?:bana\\s+)?${YT}\\s+(.+?)\\s+${VERB_SEARCH}$`));
  if (m) return yt('youtube-search', m[1]);
  // English
  m = t.match(/^(?:play|open|watch|put on)\s+(.+?)\s+on youtube$/);
  if (m) return yt('youtube', m[1]);
  m = t.match(/^(?:search|look up|find)\s+(?:on\s+)?youtube\s+for\s+(.+)$/);
  if (m) return yt('youtube-search', m[1]);
  m = t.match(/^youtube\s+(?:search\s+)?(.+)$/);
  if (m && !/^(?:aç|ac|open)$/.test(m[1])) return yt('youtube-search', m[1]);

  // ── Web search ────────────────────────────────────────────────────────────
  // "internetten X ara", "bana internetten X arat", "google'da X ara"
  m = t.match(new RegExp(`^(?:bana\\s+)?${WEB}\\s+(?:bana\\s+)?(.+?)\\s+(?:diye\\s+)?${VERB_SEARCH}$`));
  if (m) return search(m[1]);
  // "X'i internette ara", "X internetten arat"
  m = t.match(new RegExp(`^(?:bana\\s+)?(.+?)\\s+${WEB}\\s+${VERB_SEARCH}$`));
  if (m) return search(m[1]);
  // "google X", "search the web for X", "look up X online"
  m = t.match(/^(?:search|google|look up)\s+(?:the web|the internet|online|google)?\s*(?:for\s+)?(.+?)(?:\s+online)?$/);
  if (m && m[1].length > 1) return search(m[1]);

  // ── A web address ─────────────────────────────────────────────────────────
  m = t.match(
    /^(?:(?:open|go to)\s+)?((?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s]*)?)(?:\s+(?:sitesini|sayfasını|sayfasini|adresini))?(?:\s+(?:aç|ac|açar mısın|acar misin|git|gir))?$/,
  );
  if (m && (/^(?:open|go to)\s/.test(t) || /\s(?:aç|ac|git|gir|açar mısın|acar misin)$/.test(t))) {
    const url = /^https?:\/\//.test(m[1]) ? m[1] : 'https://' + m[1];
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') return { kind: 'site', query: u.host, url: u.href };
    } catch {}
  }
  return null;
}

function yt(kind, q) {
  const query = bare(q);
  if (!query) return null;
  return {
    kind,
    query,
    url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query),
  };
}
function search(q) {
  const query = bare(q);
  if (!query) return null;
  return { kind: 'search', query, url: 'https://www.google.com/search?q=' + encodeURIComponent(query) };
}

/** The first video id on a YouTube results page, or null. */
function firstVideoId(html) {
  const m = /"videoRenderer":\{"videoId":"([\w-]{11})"/.exec(html) || /"videoId":"([\w-]{11})"/.exec(html);
  return m ? m[1] : null;
}

async function openWeb(cmd, { openExternal, fetch, en = false }) {
  let url = cmd.url;
  if (cmd.kind === 'youtube' && fetch) {
    // Open the first matching video directly; fall back to the results page.
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      const res = await fetch(cmd.url, {
        signal: ctl.signal,
        headers: { 'Accept-Language': en ? 'en-US,en' : 'tr-TR,tr,en' },
      });
      clearTimeout(timer);
      const id = res.ok ? firstVideoId(await res.text()) : null;
      if (id) url = 'https://www.youtube.com/watch?v=' + id;
    } catch {}
  }
  await openExternal(url);
  const q = '“' + cmd.query + '”';
  if (en)
    return cmd.kind === 'search'
      ? `🔎 Searching the web for ${q} in your browser.`
      : cmd.kind === 'site'
        ? `🌐 Opened ${cmd.query} in your browser.`
        : url.includes('watch?v=')
          ? `▶️ Playing ${q} on YouTube in your browser.`
          : `▶️ Showing YouTube results for ${q} in your browser.`;
  return cmd.kind === 'search'
    ? `🔎 ${q} için Google araması tarayıcında açıldı.`
    : cmd.kind === 'site'
      ? `🌐 ${cmd.query} tarayıcında açıldı.`
      : url.includes('watch?v=')
        ? `▶️ ${q} YouTube’da tarayıcında açıldı.`
        : `▶️ YouTube’da ${q} sonuçları tarayıcında açıldı.`;
}

module.exports = { parseWebCommand, openWeb, firstVideoId };
