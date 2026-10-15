# Charles — User Guide

This guide covers Charles **v0.6.5 Beta** on Windows 10/11. For installation, see the
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

When Charles starts, a small island sits at the top of the screen.

- **Left:** how much quota your current AI has left (5-hour and weekly windows for Codex,
  similar meters for Claude and Gemini).
- **Middle:** Slime and the Charles name. Click Slime to open the large panel.
- **Right:** the weather for your city and your Spotify controls.
- **Below the island:** bubbles for important new emails and calendar reminders. Click a bubble
  and Charles explains the email.

Use the **‹ ›** arrows to dock the island to the left or right corner. The pin button keeps the
large panel open. When the pointer moves away, the panel collapses on its own. You can change
this in Settings → General.

## Chatting

Open the panel and type in the message box at the bottom. The **model menu** next to the box
lists every AI you have connected: GPT (through Codex), Claude, Gemini and Cursor. The **+**
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
Click an option or type your own answer and press **Reply**. The answer is sent as your next
message.

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
  key (Settings → Account). Press **Set up with Charles** there and Slime shows you how to
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
- **Hat:** felt hat, crown, party hat, beanie, witch hat, Santa hat, bunny ears or bow. With
  *Seasonal*, Slime picks a hat for the time of year.
- **Eyes:** sunglasses, big sunglasses, round glasses or a monocle. Sunglasses slide up onto
  the forehead when Slime makes a face.
- **Face:** with or without a moustache.
- **Other:** pumpkin, scarf or banana.

Items from different categories can be worn together, except that the pumpkin does not go
with a hat. Press **Save** to put the outfit on Charles. **Try expressions**, on the same page,
plays every expression and work animation.

In the Turkish interface, Slime holds a Turkish flag on 19 May, 30 August, 29 October and
10 November.

## Settings

| Page | What you will find |
| --- | --- |
| **General** | Language (English / Türkçe), start with Windows, sounds and volume, auto-hide and collapse, read aloud, Hey Charles, weather city, welcome tour |
| **Account** | Sign in to ChatGPT/Codex, Claude, Gemini and Cursor (Gemini has **Set up with Charles**); default model; Gemini Live key (with **Set up with Charles**) and voice |
| **Appearance** | Text size, panel size, character size, opacity, screen choice, chat colours, Slime studio, try expressions |
| **Memory** | Things Charles should remember; import a summary from ChatGPT |
| **Access** | How much the AI may do without asking (see [Project mode](#project-mode)) |
| **Plugins** | Google (Gmail, Calendar, Drive), Microsoft (Outlook, Calendar), POP3/IMAP mail, Home Assistant, GitHub, Vercel, Stripe, Resend, Notion, Cal.com, n8n; important-mail notifications and keywords |
| **Shortcuts** | Change any global shortcut |
| **Weekly summary** | Time on the computer, Charles tasks, sessions, files and commands. It is shown on Monday morning |
| **Performance** | Optional CPU, RAM and GPU history kept on this computer |

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
Turkish phrasing (browser commands also understand English), for example:

| You say | Charles |
| --- | --- |
| *“5 dakika sonra su içmeyi hatırlat”* | sets a reminder in 5 minutes |
| *“25 dakika odaklan”* | starts a 25-minute focus timer |
| *“Hatırlatıcılarımı göster”* | lists your reminders |
| *“Bunu hatırla: …”* · *“Bana … diye hitap et”* | saves to memory / sets how Charles addresses you |
| *“Ne çalışıyorduk?”* | recalls your current study topic |
| *“Önemli mail var mı?”* · *“Okul maillerimi özetle”* | checks and summarizes connected mailboxes |
| *“Hava nasıl?”* | today’s weather for your city |
| *“Tavan lambasını kapat”* | controls a Home Assistant device |
| *“İnternetten … arat”* · *“Search the web for …”* | opens a Google search in your default browser |
| *“YouTube’dan … videosunu aç”* · *“Play … on YouTube”* | opens the first matching YouTube video in your browser |
| *“github.com sitesini aç”* · *“Open github.com”* | opens the site in your browser |

Anything else, in any language, goes to the AI you selected.

## Data, updates and reset

- Everything personal (chats, memory, settings, encrypted keys and account connections) is
  stored in **`%APPDATA%\Charles`**. Nothing personal is written to the app folder.
- To update, install the new version (or extract it to a new folder) and start it. Your data
  stays.
- Plugin accounts are encrypted for this Windows user. On another computer, connect them
  again.
- **`setup\Reset-Charles.cmd`** backs up your data inside `%APPDATA%\Charles` and starts
  Charles fresh. It asks before doing anything.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Charles does not start | Only one Charles can run at a time. Quit the old one from the tray icon and start again. If you run from source, run `npm run build` first. |
| “Sign-in required” | Settings → Account → sign in again. Finish the sign-in in the browser window that opens. |
| No sound | Check the speaker button at the top right and Settings → General → Sounds. |
| Hey Charles does not react | Check the microphone button at the top right (red means off). Check that the microphone is allowed in Windows privacy settings, then redo the training in Settings → General. |
| Mail is not shown | Settings → Plugins → *Test connection*. Mail is checked every five minutes while Charles is open. |
| Something looks broken after an update | Use `setup\Reset-Charles.cmd`. Your old data is backed up first. |
