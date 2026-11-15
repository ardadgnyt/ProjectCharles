# Charles — User Guide

This guide covers Charles **v1.0.0 Stable** on Windows 10/11. For installation, see the
[README](../README.md#install-and-update). For the full history of changes, see
[CHANGELOG.md](../CHANGELOG.md) (in English from v0.9.18; older entries are in Turkish).

- [The island](#the-island)
- [Notification cards](#notification-cards)
- [The app window](#the-app-window)
- [Chatting](#chatting)
- [Project mode](#project-mode)
- [Voice](#voice)
- [Slime](#slime)
- [Settings](#settings)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Things you can just say](#things-you-can-just-say)
- [Data, updates and reset](#data-updates-and-reset)
- [Safety](#safety)
- [Troubleshooting](#troubleshooting)
- [System monitor](#system-monitor) · [Push to talk](#push-to-talk) ·
  [Dropping Charles on content](#dropping-charles-on-content) · [Converting files](#converting-files) ·
  [Download with Charles](#download-with-charles) · [Moving the character](#moving-the-character) ·
  [Right-click menu](#right-click-menu) · [After an update](#after-an-update)

## The island

Charles lives in an island at the top of the screen. It has four sizes:

- **The thin strip (closed):** when nothing plays, the closed island is a thin strip at the top
  edge. Rest the pointer on it for a moment and the card shelf opens.
- **The music notch (closed, while music plays):** Slime, the name and the Spotify controls with
  the song's progress line. It shows by itself when a song starts and goes back into the strip a
  moment after you pause and move the pointer away. A running or finished timer and a colour you
  just picked with the colour picker also show on the closed island.
- **The card shelf (small island):** the voice chat card, a message box, Charles with the version
  under his name, the Spotify card, and four cards that open a panel below them. A click on an
  empty part opens the chat; the cream bar below closes the island.
  - **Files** has three buttons: **Convert**, **Send** and **File shelf**. What each one does is in
    its tooltip. Drop files on the Files card to convert or send them; everything runs on your
    computer. See [Converting files](#converting-files).
  - **AI usage** shows every connected AI with two rings (for example the 5-hour and the weekly
    allowance) and when they reset.
  - **Weather** shows now, the next hours, today and the next five days in one frame; now and today
    are told apart by the weight of the text. The pencil button changes the city.
  - **Tools** shows eight tools as tiles (colour picker, timer, reminders, calendar, emails, usage
    summary, smart home, system monitor) and your installed modules.
  - **Music:** a click on the card opens Spotify; its buttons control playback.
- **The chat (big island):** the island grows down into the chat panel. A click on an empty part
  goes back to the card shelf; a click on the cream bar closes the island, dragging it changes
  the panel's height.

Icon buttons and names that are cut off show a small tooltip of Charles’ own when you rest the
pointer on them or reach them with the keyboard. The tooltip stays inside the island.

**Full-screen programs.** While a game, a film or a presentation fills the display the island is
on, the island steps back behind it, Slime is not drawn and notification cards wait; they come back
when you leave the program. If the full-screen program is on another display, the island stays in
front on its own display. While any program is full screen, Charles does not take the focus, flash
his taskbar button or show a Windows notification by himself; what waited happens when you leave it.
Anything you start yourself (a shortcut, a click on Charles) is never held back.

## Notification cards

Cards below the island show reminders, the end of a focus timer, updates, important new emails,
calendar events, WhatsApp messages, an AI allowance that is running out, a computer under heavy
load, module notices, finished downloads and file sharing. Every card has the same design: a line
icon, a title, the text, and a button that names what a click does, such as **Let Charles explain**
for a mail, **See what’s new** after an update or **Show in folder** for a saved file. The WhatsApp
card shows the WhatsApp mark. Cards are written in the interface language (all six languages), with
numbers in that language’s format.

The × closes a card (a closed one does not come back unless something new arrives); a click on an
email asks Charles to explain it, a click on a module notice opens that module. Module notices also
close by themselves after a minute. The cards never take the keyboard from what you are typing.
With the app window open they appear in its top-right corner; beside a tall panel they appear next
to it.

The **×** in the island's top bar closes it; Charles keeps running. To quit, Shift-click the ×
or use the tray icon → Çıkış (Quit). Use the **‹ ›** arrows to dock the island to the left or
right corner. The pin button keeps it open. The island never has a taskbar button of its own;
only the app window does.

## The app window

The window button next to the pin turns Charles into a normal Windows app (the island hides).
**Back to the island** or the × at the top right brings the island back.

- **Left column:** Charles’ card with his name and the version at the top, then your chats:
  **New chat**, search, folders (drag a chat onto a folder) and recent chats.
- **Overview (the home page):** the message box at the top at full width, and the cards below it in
  two columns: Spotify, reminders, calendar, important emails, smart home and AI usage for every
  connected AI. The pencil in the title bar (**Edit home page**) lets you add, move and remove cards;
  quick commands, notes, system usage, system information, modules, colour picker, timer, files and
  weather can be added too. **Reset layout** in the edit bar asks once, then puts the default page
  back (removed cards come back). A saved layout loads as you left it.
- **Calendar:** dots for Google Calendar, Outlook, reminders and holidays. **Edit** opens a big
  month/week calendar where you add, change and delete events. Public holidays and special days
  follow the interface language (Türkçe → Turkey, English → USA, Deutsch → Germany, Français →
  France, Español → Spain, 中文 → China).
- **Smart home:** device rows with on/off switches. **Edit** opens a layout where you drag
  devices into place; **+ Add** picks devices from Home Assistant.
- **Chat view:** click a chat on the left. Its title row holds **Chat** / **Project** and the chat’s
  tools (search in this chat, review changes, side panel, work queue, more); the work queue row
  under it appears only while it holds something. The **side panel** button opens files Charles wrote,
  code it gave and commands it ran. Its **Open** menu opens the file in Visual Studio Code,
  GitHub Desktop, Notepad++, the Terminal, the default app or the folder, or saves a copy.
  Select lines to **Add to chat**, **Edit** them (describe the change in the bar that appears)
  or ask Charles to **Suggest a fix**.
- **A normal Windows window:** Windows' own Snap works (drag to the top or the sides, Win + arrow
  keys, the layouts on the maximize button). Its × goes back to the island. Settings and the other
  dialogs open below the window’s own buttons.

Text that is meant to be copied (a message draft, a command, code) arrives in a box with its
own **Copy** button, on the island and in the app window.

## Chatting

Open the panel and type in the message box at the bottom. A new chat shows one line, *What’s on
your mind?*, and two suggestions. The **model menu** next to the box
lists every AI you have connected: GPT (through Codex), Claude, Antigravity, Cursor, Abacus AI, EVREN and GitHub Copilot. Choose an AI, then one of its models; **Auto** in a model list lets that AI pick the model itself. EVREN lists only its chat models (gemma-4-31b, glm-5.3, qwen3.8-flash-next and deepseek-v4.1-flash). If a model you chose earlier is no longer offered, Charles moves to that AI's Auto and tells you. After you choose another model, one quiet line above the message box says which model the next message will use (*Next message: …*); it goes when that message is sent or a new chat starts. Beside the model menu the **effort** menu lists only the levels the chosen model offers; models without levels stay on *Auto*. The **+**
menu has more tools:

| Tool | What it does |
| --- | --- |
| Add photos and files | Attach images, PDFs, Word and PowerPoint files, documents or text files |
| Create image | Ask the AI to draw an image. While it is made, a plain card shows one thin bar and *about N s left*; the finished image can be downloaded, copied or enlarged |
| Search the web | Answers from current web sources, with links |
| Deep research | A longer, multi-source report |

You can also drop text or files onto Slime, or press **Ctrl + Shift + S** to capture an area of
the screen and ask about it. Your own message is as wide as its text. To change a message after
sending it, use the edit pencil beside it, which shows when you rest the pointer on the message or
reach it with the keyboard. It opens in its own bubble, and what you were writing in the message box stays there.
**Save** (Enter; Shift+Enter starts a new line) sends it again from that point, and **Cancel** (Esc)
leaves everything as it was. The earlier conversation stays one ‹ › away; file changes are not undone.
While an answer is being written a message cannot be edited.

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
to remove it. You can add pictures and files to an extra instruction, even with no text. In the
queue they wait with it, and clicking the row brings the text and the files back to the box.

**Attachments.** Add files with **+**, drag them in, or paste a picture. A file has no size limit,
and one message can carry 1000 files. A GIF can be up to 256 MB and a presentation up to 500 MB. An AI
reads at most 1,000,000 characters of file text in one message. If a long file does not fit, Charles
sends the part that fits, tells the AI, and names the file for you. Claude takes up to 600 pictures
in a message and Antigravity up to 1000. With many pictures, each one is sent smaller. The limits of
your AI account still apply. Cursor, Abacus AI and GitHub Copilot take up to 20 pictures in a
message and EVREN up to 8.

**Creating pictures, web search and research.** The **+** menu shows what the chosen AI can do: a
choice it cannot do is grey. GPT and Antigravity create pictures with their own image generators;
Claude, EVREN and GitHub Copilot draw them, and Charles shows the drawing as a picture. GPT,
Antigravity and Claude can search the web and do deep research. A message that carries outside
content (a mail Charles opened or found, or what he read when you dropped him on a window) is sent
with web search off, and the chat says so.

**Looking at a picture.** Click a picture in the chat to see it large. The bar above it has
**Add to chat** (the picture goes into the message box), **Copy image** and **Save a copy**. Saving
never replaces a file that is already there. Esc or a click outside the picture closes the view.

**Quota notices.** When an AI's quota runs low, Charles says so once and offers another connected
AI. If Claude's hourly and weekly quotas run low at the same time, both are named in one notice.

Past chats are listed in **History** (the list button at the top left). Its header is one row:
search, new chat, new folder and an **Edit** menu with **Edit with AI** (Charles sorts your chats
into folders) and the **Automatic with AI** switch. There you can search chats, sort them into
folders, rename them and reopen them.

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

- **Hey Charles:** turn it on in Settings → General (**Start a voice conversation with Hey
  Charles**), then say *“Hey Charles”*. The island opens with the note *I heard Hey Charles. Go
  ahead.* and the voice conversation starts. The wake word is detected on your computer with the local Whisper model, and
  a short training (three recordings) improves it. While it is on, the microphone keeps listening
  for the wake word. Charles checks a stretch of sound when it ends in a short pause, or after about
  three seconds when the sound goes on, so *“Hey Charles, what time is it?”* said in one breath is
  checked as well. A steady background sound (a fan, even steady music) is checked once and then
  treated as background. Besides *Hey Charles*, *Okay Charles* and a few near spellings that the
  speech model writes for the name (such as *Hey Chars*) are accepted. Over loud music the speech
  model may still not hear the phrase.
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
codes on a laptop, reads documents, draws, gets an idea, sweats when the quota runs out and
falls asleep when nothing happens. It also reacts to you: click it, poke it with the cursor or
say something nice.

**Desktop pet.** Drag Slime off the island and drop it anywhere on the desktop. Throw it and
it flies, slows down and bounces off the screen edges. Drop it gently and it squashes and
hops. Double-click Slime to send it back to the island.

**Slime studio** (Settings → Appearance) lets you pick:

- **Colour:** green, teal, blue, purple, coral, yellow or white. The app icon follows the
  colour.
- **Hat:** felt hat, crown, party hat, beanie, witch hat, Santa hat, bunny ears, bow or
  colourful headphones.
- **Eyes:** sunglasses, big sunglasses, round glasses, a monocle or a pirate eye patch. Sunglasses slide up onto
  the forehead when Slime makes a face.
- **Face:** with or without a moustache.
- **Other:** pumpkin, scarf, banana, bow tie, cat collar with a bell, or an arrow stuck in
  Slime's jelly.

Items from different categories can be worn together, except that the pumpkin does not go
with a hat. Press **Save** to put the outfit on Charles.

In the Turkish interface, Slime holds a Turkish flag on 19 May, 30 August, 29 October and
10 November.

## Settings

| Page | What you will find |
| --- | --- |
| **General** | Language (Türkçe, English, Deutsch, Français, Español, 中文), start with Windows, sounds and volume, auto-hide and collapse, read aloud, Hey Charles, weather location (search a city or district and pick it from the list), welcome tour |
| **AI models** | Sign in to ChatGPT/Codex, Claude, Antigravity and Cursor; connect Abacus AI through its own command line tool; connect GitHub Copilot through its own command line tool, which you install yourself or get with VS Code (**Set up with Charles** opens the setup page and walks through the sign-in; the model list is the one your Copilot plan has, and it follows the plan when the plan changes); add an EVREN API key (**Key settings → Save and connect** checks the key against EVREN at once; if EVREN asks an account to accept its own usage terms, the card shows EVREN’s text and an **Accept and connect** button). Every card has **Set up with Charles**, a sign-in button (EVREN: the key settings) and **Check connection**. While an account is connected, its sign-in button is hidden and one status line under the buttons shows a green dot, **Connected** and what the last check said (for example *Models are ready.*); not connected, checking and errors are that line’s text alone, and a sign-in error stays until you act. **Default model**: a list of Charles’ own, grouped by AI, with the chosen AI and model shown together, a search field when there are many models and full keyboard use (arrows, Enter, Esc); *The model I used last* is one of the choices, and a saved model that is no longer offered is shown as unavailable with the reason. Gemini Live has the same status line, and its voice and key settings |
| **Appearance** | Text size, panel size, character size, **Island size** (Large is the usual size; Small shows the whole island at 3/4 of its width and height, for a laptop screen; the app window keeps its size), screen choice, Slime studio |
| **Memory** | Things Charles should remember; **Get to know me from the AI I use**: pick ChatGPT, Claude or Antigravity, paste its answer and choose what to keep |
| **Access** | How much the AI may do without asking, as three short lines (see [Project mode](#project-mode)) |
| **Plugins** | **Notifications** (show important mail and calendar reminders on the island, words that are always important to you, and **Let the AI decide what is important**), Google (Gmail, Calendar, Drive), Microsoft (Outlook, Calendar), Home Assistant, POP3/IMAP mail, Google Calendar (add events), WhatsApp and its contacts. A connected account shows the same status line as the AI cards; **Check connection** and the button that removes the connection appear while it is connected, and the sign-in button comes back after you remove it. The WhatsApp card shows its connection state in one place: off, waiting, the QR code, an error, or connected with the number |
| **Shortcuts** | Change any global shortcut; push to talk |
| **Weekly summary** | This week or last week: time at the computer (active and idle), AI requests through Charles per day and per model, and the most used apps. Daily charts have an axis and a legend; a value that was not measured shows as “—”, never as 0. It can be shown on Monday morning |
| **Performance** | Optional CPU, RAM and GPU history kept on this computer; **Low memory mode** turns graphics acceleration off, so Charles uses less memory and a little more processor time during animations. It is off unless you turn it on and takes effect when Charles restarts (a **Restart** button appears) |
| **Account** | Which AI accounts are connected, **Open data folder**, **Remove account connections** and **Reset all data** (both ask “Are you sure?” first) |

For step-by-step plugin setup, see [PLUGINS-SETUP.md](PLUGINS-SETUP.md).

## Keyboard shortcuts

These work from any app and can be changed in Settings → Shortcuts. Click a shortcut, then press
the new key or combination: it is saved at once, and the row says so for a moment. Every key of the combination is shown as its own label. If the key cannot be used,
the row says why: Windows keeps it for itself, another shortcut (or push to talk) already has it,
or it is a modifier such as Ctrl alone. Keys are read by their place on the keyboard, so the same
key works with a Turkish or an English layout. While you record a key, the other shortcuts pause.
**Reset to default** puts every shortcut back.

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

**Inside Charles.** The first **Tab** offers **Skip to the message box**. The message box, Charles
and text fields show a focus ring when you reach them with the keyboard, and icon buttons show
their tooltip on keyboard focus too. Closing Settings with **Esc** puts the focus back on what
opened it.

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

## Safety

- Text that comes from outside (a mail Charles opened or found, what he read when you dropped him
  on a window) and the text of files you attach are handed to the AI as data, not as instructions.
  Invisible characters are removed from it and tags that pretend to end that data or to speak for
  the system are made harmless. A message with outside content runs without tools and with web
  search off.
- **“Remember this”** (*Bunu hatırla: …*) saves one line of at most 300 characters. For a longer
  pasted text Charles asks which sentence to remember instead of storing all of it.
- A converted file never replaces an existing one. A second job on the same file takes the next
  free name.
- An archive is not opened when an entry would land outside the target folder, is a link or a
  device file, or cannot be read by the check.
- When you open a program or script file that an AI wrote (from the side panel), Charles shows it in
  its folder instead of starting it.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| Charles does not start | Only one Charles can run at a time. Quit the old one from the tray icon and start again. If you run from source, run `npm run build` first. |
| “Sign-in required” | Settings → AI models → sign in again. Finish the sign-in in the browser window that opens. |
| No sound | Check the speaker button at the top right and Settings → General → Sounds. |
| Hey Charles does not react | Check the microphone button at the top right (red means off). Check that the microphone is allowed in Windows privacy settings, then redo the training in Settings → General. |
| Spotify is not shown or its buttons do nothing | Charles reads Spotify through Windows' media controls. If Windows' own media controls (the volume flyout) do not show Spotify either, quit Spotify from its tray icon and start it again; if that does not help, restart the computer once. |
| Mail is not shown | Settings → Plugins → *Check connection*. Mail is checked every five minutes while Charles is open. |
| Something looks broken after an update | Use `setup\Reset-Charles.cmd`. Your old data is backed up first. |

## System monitor

**Tools → System monitor** shows CPU, GPU and RAM. **Current**, **Average** and **Peak** change the big numbers; **1 min**, **5 min** and **1 hr** change the range of both the numbers and the charts. Charles measures once a second while the monitor is on screen and every 5 seconds behind it. Clear **Measure in the background** to measure only while it is open. Readings stay in memory for an hour and are not saved. A value Windows does not give shows as **No data**, never as 0.

## Push to talk

Turn it on in **Settings → Shortcuts → Push to talk**. It is off by default.

| Action | Result |
| --- | --- |
| Hold Right Arrow + Up Arrow together and speak | Your words are typed at the cursor when you let go; either key can go first |
| Press the pair twice quickly | Hands-free recording; press once more to finish |
| Esc | Cancels the recording or the text on its way |
| One of the keys alone | The key’s normal job, a moment later |

The status bubble (Listening, Turning speech into text…) appears right under the island or the open panel, below any notifications, and follows them when they move. The shortcut can be changed in the same place: an arrow, navigation or function key alone, two of those pressed together, or a combination with Ctrl, Alt, Shift or Win. A shortcut that cannot be used says why in the same card and the old one stays. Recordings can be up to two minutes long. Speech is processed by the local Whisper model; nothing is sent anywhere and no audio is kept. Enter is never pressed. If the keyboard moved to another place while you were speaking, the text waits in a small card with **Copy** and **Insert anyway**.

## Dropping Charles on content

1. Drag Charles (from the app window, the open island or the desktop) over a page, a document or an email and hold him still for a moment.
2. A frame shows what he would read. Press **Esc** or move away to cancel.
3. Let go. Charles goes back to where you took him from, and a card above the message box shows the title, the app and how much was read.
4. Choose **Summarize**, **Key points** or **What I need to do**, or type a question. Nothing goes to an AI before this step. The content goes with that one message, and the card then leaves; what was sent stays in the chat. To ask about it in a new message, drop Charles on it again. If the message could not be sent, the card stays so you can try again.

If the window cannot be read, or you press Esc, he goes back as well. Picked up again while reading, he stays in your hand, and the card arrives when you let go.

No browser extension is needed. Pages are read from the active tab only. PDFs opened from this computer and saved Word and PowerPoint files are read from the file; unsaved changes are not included. An app that shares no text is pictured as a single window, and the card says only the visible part was read. **×** removes the content from the chat; **Read again** reads the same window once more.

## Converting files

Open **Files → Convert**, or drop files on the Files card. Choose a format from the list on the
right; only formats that every chosen file can become, and that this computer can make, are
offered. Choices for that format (quality, size, pages, sheet, separator, language …) appear under
the list, with notes about what will not be kept. Press **Convert**. The result is saved next to the
original, with a new name if a file of that name is there; the original is never changed. **Open**
shows the result.

| From | To |
| --- | --- |
| PDF | DOCX, XLSX, PPTX (page pictures or editable text), TXT, HTML, PNG, JPEG, TIFF. Scanned PDF → searchable PDF, TXT, DOCX; tables → XLSX, CSV |
| Word: DOCX, DOC, ODT, RTF | PDF, DOCX, ODT, RTF, TXT, HTML, EPUB, Markdown; pages → PNG, JPEG |
| Excel: XLSX, XLS, ODS | XLSX, ODS, PDF, CSV, TSV, HTML; a sheet or a range → PNG, JPEG |
| CSV, TSV, JSON | XLSX, ODS, CSV, TSV, JSON, HTML, PDF (separator, encoding, header and types can be set) |
| PowerPoint: PPTX, PPT, ODP | PPTX, ODP, PDF; slides → PNG, JPEG, TIFF; text → TXT, with or without speaker notes |
| TXT, Markdown, HTML | PDF, DOCX, ODT, RTF, HTML, Markdown, TXT, EPUB; a page's look → PNG, JPEG |
| EPUB | PDF, TXT, HTML, DOCX |
| PNG, JPEG, WebP, BMP, TIFF, AVIF, HEIC | each other, PDF; PNG ↔ ICO; PNG or JPEG → SVG (vectorize); text in the picture → TXT, DOCX, searchable PDF; tables → XLSX, CSV |
| SVG | PNG, JPEG, WebP, PDF |
| GIF | animated WebP, MP4; chosen frames → PNG, JPEG |
| Several pictures | one animated GIF or WebP; pictures and PDFs → one PDF in the order you set |
| MP3, WAV, FLAC, M4A, AAC, OGG, Opus | each other (bit rate, sample rate, mono or stereo); speech → TXT, DOCX, SRT, VTT |
| MP4, MKV, MOV, AVI, WebM | each other (resolution, frame rate, quality, sound); sound → MP3, WAV, FLAC, M4A; a part → GIF, animated WebP; frames → PNG, JPEG; speech → subtitles |
| SRT, VTT | each other; plain text without times |
| ZIP, 7z, TAR, TAR.GZ, TAR.XZ, RAR | extract; an archive repacked as ZIP, 7z, TAR or TAR.GZ (RAR and TAR.XZ can only be extracted) |
| Any files and folders | packed together as ZIP, 7z or TAR |

**Text recognition** uses Windows' own OCR and the languages installed in Windows (Settings → Time
& language → Language). Tables found in a scan are shown to you first: check and correct them, then
save. **Speech** is turned into text by the local Whisper model. **HEIC** needs Windows' HEIF Image
Extensions. Word, Excel and PowerPoint files keep their look best when Microsoft Office is
installed; Charles then uses it in the background, opens the file read-only with macros off and
closes only what it opened. Without Office, formats that need it are not offered.

Archives are always extracted safely: a name that would land outside the target folder, a link, a
device file or an entry the check cannot read stops the job. Windows’ own archive tool cannot hold
some file names (Chinese, Japanese, Korean, Russian, Greek, emoji, depending on Windows’ language).
Such names, also in a folder named that way, work in ZIP, TAR and TAR.GZ, which Charles then reads
and writes itself; 7z, TAR.XZ and RAR say plainly that they cannot hold them. When two files with
the same name from different folders are packed as ZIP, both are kept. Turning a lossy sound (MP3, AAC …) into a lossless one (WAV, FLAC) does not bring back the
lost quality.

## Download with Charles

When you copy a link to a video or a file, a small card offers to download it with Charles. It
appears under the island, or in the top-right corner of the screen when the island is hidden, and
stays away while a full-screen app is open.

## Moving the character

Drag the character out of the app window or the open island. His place stays empty and everything else stays where it is. He keeps his moods and animations, stays out while you open or close the panel, and goes home with a double-click, or by himself after he has read something. From the closed island he comes out as the desktop pet, as before.

## Right-click menu

Select text in a message, a code block or a text box and right-click. **Copy** copies the selection, **Paste** works in text boxes, and **Ask Charles** puts the selection in the message box as a quote without sending it. The menu closes with Esc or a click elsewhere.

## After an update

A card says Charles was updated. Click it (**See what’s new**) to read what changed; the notes are in English and come from your computer, so they work with no AI or quota. **Let Charles explain** sends them to your AI once. The card appears once after an update, and not after a first install or an ordinary start.
