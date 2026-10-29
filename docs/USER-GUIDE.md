# Charles — User Guide

This guide covers Charles **v0.9.6 Beta** on Windows 10/11. For installation, see the
[README](../README.md#installation). For the full history of changes, see
[CHANGELOG.md](../CHANGELOG.md) (Turkish).

- [The island](#the-island)
- [Chatting](#chatting)
- [Project mode](#project-mode)
- [Voice](#voice)
- [Slime](#slime)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Things you can just say](#things-you-can-just-say)
- [Data, updates and reset](#data-updates-and-reset)
- [Troubleshooting](#troubleshooting)

## The island

Charles lives in an island at the top of the screen. It has four sizes:

- **The thin strip (closed):** when nothing plays, the closed island is a thin strip at the top
  edge. Rest the pointer on it for a moment and the card shelf opens.
- **The music notch (closed, while music plays):** Slime, the name and the Spotify controls with
  the song's progress line. It shows by itself when a song starts and goes back into the strip a
  moment after you pause and move the pointer away.
- **The card shelf (small island):** AI usage, the weather, the converter, Charles and the music
  card. A click on an empty part opens the chat; the cream bar below closes the island.
  - **AI usage** shows what is left of the current AI's 5-hour and weekly limits.
  - **Weather** opens the next five days (temperature, feels like, humidity, wind, chance of
    rain); the pencil button changes the city.
  - **Converter:** drop files on it (or click it to pick them) to turn them into other formats.
    Everything runs on your computer; the result is saved next to the original.
  - **Music:** a click on the card opens Spotify; its buttons control playback.
- **The chat (big island):** the island grows down into the chat panel. A click on an empty part
  goes back to the card shelf; a click on the cream bar closes the island, dragging it changes
  the panel's height.

Bubbles below the island show important new emails, calendar reminders, WhatsApp messages and
module notices. The × closes a bubble (a closed one does not come back unless something new
arrives); a click on an email asks Charles to explain it, a click on a module notice opens that
module. Module notices also close by themselves after a minute.

The **×** in the island's top bar closes it; Charles keeps running. To quit, Shift-click the ×
or use the tray icon → Çıkış (Quit). Use the **‹ ›** arrows to dock the island to the left or
right corner. The pin button keeps it open. The island never has a taskbar button of its own;
only the app window does.

## The app window

The window button next to the pin turns Charles into a normal Windows app (the island hides).
**Back to the island** or the × at the top right brings the island back.

- **Left column:** Slime, then your chats: new chat, search, folders (drag a chat onto a folder)
  and recent chats.
- **Overview:** Spotify, reminders, calendar, important emails, a message box, smart home and
  remaining usage for every connected AI.
- **Calendar:** dots for Google Calendar, Outlook, reminders and holidays. **Edit** opens a big
  month/week calendar where you add, change and delete events. Public holidays and special days
  follow the interface language (Türkçe → Turkey, English → USA, Deutsch → Germany, Français →
  France, Español → Spain, 中文 → China).
- **Smart home:** device tiles with on/off switches. **Edit** opens a layout where you drag
  devices into place; **+ Add** picks devices from Home Assistant.
- **Chat view:** click a chat on the left. The **side panel** button opens files Charles wrote,
  code it gave and commands it ran. Its **Open** menu opens the file in Visual Studio Code,
  GitHub Desktop, Notepad++, the Terminal, the default app or the folder, or saves a copy.
  Select lines to **Add to chat**, **Edit** them (describe the change in the bar that appears)
  or ask Charles to **Suggest a fix**.
- **A normal Windows window:** Windows' own Snap works (drag to the top or the sides, Win + arrow
  keys, the layouts on the maximize button). Its × goes back to the island.

Text that is meant to be copied (a message draft, a command, code) arrives in a box with its
own **Copy** button, on the island and in the app window.

## Chatting

Open the panel and type in the message box at the bottom. The **model menu** next to the box
lists every AI you have connected: GPT (through Codex), Claude, Antigravity, Cursor, Abacus AI and EVREN. Beside it the **effort** menu lists only the levels the chosen model offers; models without levels stay on *Otomatik*. The **+**
menu has more tools:

| Tool | What it does |
| --- | --- |
| Add photos and files | Attach up to five images, PDFs, documents or text files |
| Create image | Ask the AI to draw an image. A progress card shows the estimate, and the finished image can be downloaded, copied or enlarged |
| Search the web | Answers from current web sources, with links |
| Deep research | A longer, multi-source report |

You can also drop text or files onto Slime, or press **Ctrl + Shift + S** to capture an area of
the screen and ask about it. To change a message after sending it, use the edit button on the
message. The earlier conversation stays in history.

When an AI is running low on quota, Charles offers to continue with another connected AI.

**Questions from the AI.** Sometimes the AI needs a decision before it can do the work well
(which language, which file, which option). The question appears under its answer as a card.
It asks one question at a time: click an option (or press its number), or type your own
answer. After the last question, the answers are sent as your next message. Charles tells every
AI to ask only when a wrong guess would really cost time, so ordinary chats are not
interrupted.

**Extra instructions while it works.** You do not have to wait for an answer to finish. Type
in the message box and press **Ctrl + Enter** (or Enter). GPT receives the instruction inside
the running task. Claude, Antigravity, Cursor and EVREN answer in one go, so the message waits in a small
*Queued* row above the box and is sent as soon as the answer is done; click it to edit, or ×
to remove it.

Past chats are listed in **History** (the list button at the top left). There you can search
chats, sort them into folders, rename them and reopen them.

## Project mode

Switch the mode selector from **Chat** to **Project** and choose a folder. The AI (Codex) can
then read and change files in that folder and run commands. How much it may do on its own is
set in **Settings → Access**:

- **Ask for approval:** Charles asks before every file change and command.
- **Approve for me:** edits inside the project are allowed, and other requests go through a
  risk check.
- **Full access:** no questions. Use this only in folders you trust.

Approval requests appear as cards in the chat. You can stop a running task at any time. Changes
that were already made stay in place.

## Voice

- **Hey Charles:** turn it on in Settings → General, then say *“Hey Charles”* and talk. The
  wake word is detected on your computer, and a short training (three recordings) improves it.
  While it is on, the microphone keeps listening for the wake word.
- **Microphone button:** the microphone icon at the top right of the panel, left of the
  speaker, switches Charles’s microphone off for privacy. While it is off (red, crossed out),
  Hey Charles, dictation and voice conversation do not listen at all. Click it again to turn the
  microphone back on. The choice is remembered.
- **Voice conversation (Gemini Live):** a real-time spoken conversation. It needs a Gemini API
  key (Settings → AI models). Press **Set up with Charles** there and Slime shows you how to
  create a free key in Google AI Studio, then saves and tests it. While a call is on, the
  *Voice conversation active* pill on the right shows your voice level, so you can see that
  your voice is getting through. Audio goes to Google. Actions on your computer still go through
  your connected GPT/Codex account and your Access setting.
- **Dictation:** the microphone button turns speech into text in the message box. With
  `npm run setup:voice` (or the release package), this runs locally with Whisper.
- **Read aloud:** Charles can read answers out loud (Settings → General).

## Slime

Slime shows what is going on. It thinks while the AI thinks, searches with a magnifier,
codes on a laptop, reads documents, draws, gets an idea 💡, sweats when the quota runs out and
falls asleep when nothing happens. It also reacts to you: click it, poke it with the cursor or
say something nice.

**Desktop pet.** Drag Slime off the island and drop it anywhere on the desktop. Throw it and
it flies, slows down and bounces off the screen edges. Drop it gently and it squashes and
hops. Double-click Slime to send it back to the island.

**Slime studio** (Settings → Appearance) lets you pick:

- **Colour:** green, teal, blue, purple, coral, yellow or white. The app icon follows the
  colour.
- **Hat:** felt hat, crown, party hat, beanie, witch hat, Santa hat, bunny ears, bow or
  colourful headphones. With *Seasonal*, Slime picks a hat for the time of year.
- **Eyes:** sunglasses, big sunglasses, round glasses, a monocle or a pirate eye patch. Sunglasses slide up onto
  the forehead when Slime makes a face.
- **Face:** with or without a moustache.
- **Other:** pumpkin, scarf, banana, bow tie, cat collar with a bell, or an arrow stuck in
  Slime's jelly.

Items from different categories can be worn together, except that the pumpkin does not go
with a hat. Press **Save** to put the outfit on Charles. **Try expressions**, on the same page,
plays every expression and work animation.

In the Turkish interface, Slime holds a Turkish flag on 19 May, 30 August, 29 October and
10 November.

## Settings

| Page | What you will find |
| --- | --- |
| **General** | Language (Türkçe, English, Deutsch, Français, Español, 中文), start with Windows, sounds and volume, auto-hide and collapse, read aloud, Hey Charles, weather location (search a city or district and pick it from the list), welcome tour |
| **AI models** | Sign in to ChatGPT/Codex, Claude, Antigravity and Cursor; add an EVREN API key. Every card has the same buttons: **Set up with Charles** · sign in (“✓ connected” once signed in) · **Check connection**. Default model; Gemini Live with its own connected state, voice and key settings |
| **Appearance** | Text size, panel size, character size, screen choice, chat colours, Slime studio, try expressions |
| **Memory** | Things Charles should remember; **Get to know me from the AI I use**: pick ChatGPT, Claude or Antigravity, paste its answer and choose what to keep |
| **Access** | How much the AI may do without asking (see [Project mode](#project-mode)) |
| **Plugins** | Google (Gmail, Calendar, Drive), Microsoft (Outlook, Calendar), POP3/IMAP mail, Home Assistant, Google Calendar (add events), WhatsApp contacts (a connected account shows “✓ … connected”; after **Remove** you can sign in again); important-mail notifications and keywords. GitHub is listed as coming in a later version |
| **Shortcuts** | Change any global shortcut |
| **Weekly summary** | Time on the computer, Charles tasks, sessions, files and commands. It is shown on Monday morning |
| **Performance** | Optional CPU, RAM and GPU history kept on this computer |
| **Account** | Which AI accounts are connected, **Open data folder**, **Remove account connections** and **Reset all data** (both ask “Are you sure?” first) |

For step-by-step plugin setup, see [PLUGINS-SETUP.md](PLUGINS-SETUP.md).

## Keyboard shortcuts

These work from any app and can be changed in Settings → Shortcuts.

| Shortcut | Action |
| --- | --- |
| Ctrl + Alt + C | Open the chat |
| Ctrl + Alt + A | Jump to the latest alert |
| Ctrl + Alt + T | Show the latest terminal activity |
| Ctrl + Alt + → / ← | Next / previous chat |
| Ctrl + Alt + V | Start or end a voice conversation |
| Ctrl + Alt + D | Dictate |
| Ctrl + Alt + M | Move Slime to the desktop |
| Ctrl + Alt + W | Open the Slime studio |
| Ctrl + Shift + S | Capture a screen region |

## Things you can just say

Charles handles some requests itself, without asking the AI. These shortcuts understand
Turkish phrasing (browser and WhatsApp commands also understand English), for example:

| You say | Charles |
| --- | --- |
| *“5 dakika sonra su içmeyi hatırlat”* | sets a reminder in 5 minutes |
| *“25 dakika odaklan”* | starts a 25-minute focus timer |
| *“Hatırlatıcılarımı göster”* | lists your reminders |
| *“Bunu hatırla: …”* · *“Bana … diye hitap et”* | saves to memory / sets how Charles addresses you |
| *“Ne çalışıyorduk?”* | recalls your current study topic |
| *“Önemli mail var mı?”* · *“Okul maillerimi özetle”* | checks and summarizes connected mailboxes |
| *“Maillerimde fatura ara”* · *“Dün gelen mailleri göster”* · *“Geçen hafta Ahmet’ten gelen mailler”* · *“Search my email for invoice last week”* | searches connected mailboxes by word, sender and date (today, yesterday, this/last week or month, “last 3 days”, “15 Ekim”, “15.10.2026”, “since 10 October”) |
| *“Hava nasıl?”* | today’s weather for your city |
| *“Tavan lambasını kapat”* | controls a Home Assistant device |
| *“Evin içi kaç derece?”* · *“Nem oranı ne?”* · *“How warm is it inside?”* | reads indoor temperature and humidity from Home Assistant sensors and thermostats |
| *“İnternetten … arat”* · *“Search the web for …”* | opens a Google search in your default browser |
| *“YouTube’dan … videosunu aç”* · *“Play … on YouTube”* | opens the first matching YouTube video in your browser |
| *“github.com sitesini aç”* · *“Open github.com”* | opens the site in your browser |
| *“WhatsApp’tan Ahmet’e yarın geliyorum mesajını at”* · *“Send see you at 5 to Ahmet on WhatsApp”* | opens the chat in WhatsApp Desktop with the message; sends it to contacts saved in Settings → Plugins → WhatsApp (if automatic sending is on) |

Anything else, in any language, goes to the AI you selected.

## Data, updates and reset

- Everything personal (chats, memory, settings, encrypted keys and account connections) is
  stored in **`%APPDATA%\Charles`**. Nothing personal is written to the app folder.
- To update, install the new version (or extract it to a new folder) and start it. Your data
  stays.
- Plugin accounts are encrypted for this Windows user. On another computer, connect them
  again.
- **Settings → Account** can remove only the account connections (plugins, Gemini Live key,
  Claude/Antigravity sign-ins, the ChatGPT sign-in) or reset everything. It asks first, restarts
  Charles and moves the old files into `%APPDATA%\Charles\reset-backup-<time>`; nothing is
  deleted. Cursor keeps its own sign-in; sign out in Cursor if you want to remove it too.
- **`setup\Reset-Charles.cmd`** backs up your data inside `%APPDATA%\Charles` and starts
  Charles fresh. It asks before doing anything.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Charles does not start | Only one Charles can run at a time. Quit the old one from the tray icon and start again. If you run from source, run `npm run build` first. |
| “Sign-in required” | Settings → AI models → sign in again. Finish the sign-in in the browser window that opens. |
| No sound | Check the speaker button at the top right and Settings → General → Sounds. |
| Hey Charles does not react | Check the microphone button at the top right (red means off). Check that the microphone is allowed in Windows privacy settings, then redo the training in Settings → General. |
| Spotify is not shown or its buttons do nothing | Charles reads Spotify through Windows' media controls. If Windows' own media controls (the volume flyout) do not show Spotify either, quit Spotify from its tray icon and start it again; if that does not help, restart the computer once. |
| Mail is not shown | Settings → Plugins → *Test connection*. Mail is checked every five minutes while Charles is open. |
| Something looks broken after an update | Use `setup\Reset-Charles.cmd`. Your old data is backed up first. |
