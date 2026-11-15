# Plugin setup

Connect your accounts in **Settings → Plugins**. Each person connects their own accounts.
Sessions from ChatGPT plugins cannot be moved into Charles. Keys, passwords and OAuth tokens are
encrypted for your Windows user (DPAPI), stored in `%APPDATA%\Charles` and never included in an
installer package.

Mail, calendar and Drive access is **read-only**. Content that arrives by mail can never run
commands or send messages on its own.

For Google and Microsoft, **Set up with Charles** opens the official site and shows a short
guide next to Slime, step by step.

**How a card shows its state.** Each card has one status line under its buttons. While the
account is connected it shows a green dot, **Connected** and, after a check, what the check found
(for example “Connection successful. The mailbox can be read.”). While it is not connected, or while
a check runs or fails, the line holds only that text. The buttons follow the state:

- **Not connected:** the sign-in button (**Sign in with Google**, **Sign in with Microsoft**,
  **Connect Google Calendar**) is the card’s main button; Home Assistant and POP3 / IMAP open their
  **Connection settings** instead.
- **Connected:** the sign-in button is hidden; **Check connection** and the button that removes the
  connection appear. After the connection is removed, the sign-in button comes back.

- [Google: Gmail, Calendar, Drive](#google-gmail-calendar-drive)
- [Google Calendar (add events)](#google-calendar-add-events)
- [WhatsApp](#whatsapp)
- [Microsoft: Outlook and Calendar](#microsoft-outlook-and-calendar)
- [POP3 / IMAP mail (school, work, custom domain)](#pop3--imap-mail)
- [Home Assistant](#home-assistant)
- [Notifications](#notifications)
- [Using plugins in chat](#using-plugins-in-chat)
- [AI accounts](#ai-accounts)

## Google: Gmail, Calendar, Drive

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (for example
   *Charles*) and enable the **Gmail API**, **Google Calendar API** and **Google Drive API**.
2. Configure the **Google Auth Platform** (consent screen). Set the audience to *External*. While
   the app is in testing, add your own Google account under **Test users**.
3. Under **Google Auth Platform → Clients**, create a client of type **Desktop app**. Google shows
   the client ID and the client secret while you create it; it no longer offers a JSON download
   and does not show the secret again (if you lost it, create a new one with **Add secret** on the
   client).
4. In Charles, open **Connection settings** on the Google card, enter the **Google OAuth client
   ID** and the **Google desktop client secret**, press **Save connection settings**, then **Sign in
   with Google**. Sign in with the account you added as a test user. The callback is
   `http://127.0.0.1:42813/callback`, and state and PKCE are checked. If you have an old JSON file
   from Google, **Import old JSON file** fills the fields from it.

Do not use an API key or a service-account file. Apps in testing mode may ask you to sign in
again from time to time. Publishing an OAuth app to other people requires Google’s own review.

Drive search works by file name. Google Docs, TXT and Markdown files can be read into a chat.
For other formats, open the file and attach it.

## Google Calendar (add events)

Available since v0.7.2 Beta. The Google plugin above only reads your calendar. To add
events from the calendar in the app window, open **Settings → Plugins → Google Calendar** and press
**Connect Google Calendar**. It uses the same Google app registration, so set up the Google
plugin first. Google asks for one permission: view and edit events on your calendars.

If Google shows an "access blocked" or "app not verified" page, open Google Cloud → Google
Auth Platform → Data access and add the scope `https://www.googleapis.com/auth/calendar.events`,
then try again. The Google Calendar API must be enabled (it is part of the Google setup).

## WhatsApp

The WhatsApp card in **Settings → Plugins** has two parts.

**WhatsApp in Charles (messages under the island).** Link WhatsApp once with a QR code: press
**Link WhatsApp**, then in WhatsApp’s settings on your phone open **Linked devices**, tap **Link a
device** and scan the code the card shows. Incoming
messages then appear as cards under the island, with quick replies and a reply box; nothing is sent
until you press send. Messages are kept only in memory on this computer. The card shows the
connection state in one place: off, waiting, the QR code, an error, or connected with the number.
It uses an unofficial open-source bridge, which is downloaded only when you turn the feature on and
checked against its SHA-256; use it with your own account only.

**Sending by voice or text (saved contacts).** No link is needed for this part: Charles opens
**WhatsApp Desktop** (from the Microsoft Store) with your message. If it is not installed, WhatsApp
Web opens instead.

1. Open **Saved contacts** on the WhatsApp card and add the people you message often: a name
   (for example *Annem*) and the phone number with the country code (*+90 555 111 22 33*).
2. Say or type *“WhatsApp’tan Annem’e akşam geliyorum mesajını at”*.
3. For a saved contact, Charles opens the chat and presses send for you (turn this off with the
   automatic sending switch under the contacts; then you press send). For anyone else, WhatsApp
   opens with the message and you pick the person.

Numbers are stored only on this computer (`%APPDATA%\Charles\whatsapp.json`). The message goes
from your own WhatsApp; Charles never sends anything unless you ask for it.

## Microsoft: Outlook and Calendar

1. In [Microsoft Entra](https://entra.microsoft.com/), go to **App registrations → New
   registration**. Name: *Charles*. Account type: *Any Entra ID tenant + personal Microsoft
   accounts* (needed for Outlook.com/Hotmail).
2. **Authentication → Add a platform → Mobile and desktop applications**. Add the redirect URI
   `http://127.0.0.1:42813/callback`.
3. Under **Settings**, set **Allow public client flows** to *Yes*. Charles is a public desktop
   client and does not need a client secret.
4. **API permissions → Microsoft Graph → Delegated:** add `Mail.Read`, `Calendars.Read` and
   `offline_access`.
5. Copy the **Application (client) ID** from *Overview* (not the tenant or object ID), paste it
   into **Connection settings** on the Microsoft card, press **Save connection settings** and choose
   **Sign in with Microsoft**.

Work and school tenants may need an administrator to approve the app.

## POP3 / IMAP mail

For school, work or custom-domain mailboxes:

1. Ask your IT department for the server address and check that IMAP or POP3 access is enabled
   for your account.
2. In Charles, choose **IMAP · TLS** (usually port `993`) or **POP3 · TLS** (usually port `995`),
   enter the server, your full email address and your password (or an app password).
3. **Save connection settings**, then **Check connection**.

Certificate checks cannot be turned off. The mailbox is opened read-only: messages are never
marked as read or deleted. Charles lists the 25 newest messages from the last 7 days and reads
at most 30,000 characters of a message. Attachments are not downloaded. POP3 cannot report
read/unread status, so new mail is tracked by message ID after the first check. If your school
blocks IMAP and POP3, use its webmail instead. Charles does not scrape webmail.

## Home Assistant

1. In Home Assistant, open your profile → **Security** and create a **long-lived access token**.
2. In Charles, enter the **Home Assistant server URL** (for example
   `http://homeassistant.local:8123`) and the **Long-lived access token**, then press **Save
   connection settings**. Remote servers must use HTTPS.
3. **Check connection.** The status line says how many devices and entities were found. Devices are
   addressed by their Home Assistant names.

Supported domains: light, switch, fan, media_player, cover, lock, scene, script and automation.
In **Full access** mode commands run directly. In the other modes Charles shows an approval card
first. A command the server rejects is not reported as done. Google Home accounts cannot be
connected directly.

## Notifications

The **Notifications** card at the top of the Plugins page holds these settings. Turn on **Show
important emails and calendar reminders on the island** to see cards under the island.

- Mail and calendars are checked every **5 minutes while Charles is running**. Nothing is
  checked while it is closed.
- The first check only records what is already there. After that, new unread mail is flagged
  when the provider marks it important or when it contains one of the **Words that are always
  important to me** (comma-separated, for example *urgent, exam, deadline*).
- New calendar events and events starting within 15 minutes are announced, each only once.
- Sorting uses local rules, not a background AI call. Only if you turn on **Let the AI decide what
  is important** does the sender, subject and a short preview of new mail go to the selected AI for
  sorting (off by default since v0.9.25).

Every card has the same design: a line icon, a title, the text and a button that names what a
click does. Click a mail card (**Let Charles explain**) and Charles explains the email. It can also
offer to add a deadline to your calendar with reminders. The cards are shown in the interface
language and wait while a full-screen program covers their display.

## Using plugins in chat

Ask in plain language, by text or voice. Charles understands Turkish requests such as
*“Okul maillerimi özetle”* (summarize my school mail), *“Önemli mail var mı?”* (any important
mail?), *“Takvimimi göster”* (show my calendar) and *“Tavan lambasını kapat”* (turn off the
ceiling light).

**Mail search** (v0.7.0) looks through every connected mailbox by word, sender and date:
*“Maillerimde fatura ara”*, *“Dün gelen mailleri göster”*, *“Geçen hafta Ahmet’ten gelen
mailler”*, *“15 Ekim’deki maillerde staj geçen mailleri bul”*, *“Search my email for invoice
last week”*. Gmail and Outlook search on the server; IMAP searches the inbox on the server;
POP3 has no search, so Charles looks through the newest 100 messages. Add *özetle* to have the
AI summarize what was found.

There are also slash commands: `/gmail`, `/outlook`, `/calendar`, `/outlook-calendar`, `/school`,
`/drive <file name>` and `/home`. **Ask Charles** in the plugin panel puts the selected text into
a draft. It is sent only when you press Send.

## AI accounts

AI providers are connected in **Settings → AI models**, not under Plugins. Every card has **Set
up with Charles** (a step-by-step guide next to Slime), a sign-in button (EVREN: **Key settings**)
and **Check connection**, and the same status line as the plugin cards: while connected, the
sign-in button is hidden and the line shows a green dot, **Connected** and what the last check said
(for example “Models are ready.”). A sign-in error stays on the card until you act on it.

| Provider | How it connects |
| --- | --- |
| ChatGPT (Codex) | Your ChatGPT account through Codex (browser sign-in) |
| Antigravity | Your Google account through Antigravity |
| Claude | Claude Code. It needs a Pro or Max plan; a free account is not enough |
| Cursor | The official Cursor Agent (browser sign-in); chat mode only. The island shows what is left of the plan this billing cycle (Auto and monthly) |
| Abacus AI | Its official command line tool, which does not come with Charles: install it with the steps on its setup page, press **Sign in with Abacus AI** and type `/login` in the window that opens. Read-only in chat |
| EVREN | Your EVREN API key, stored with Windows encryption. **Key settings → Save and connect** checks it at once |
| GitHub Copilot | Its own command line tool (yours, or the one that comes with VS Code) and your GitHub account. The model list follows your Copilot plan |

Real-time voice chat uses **Gemini Live** with a separate Gemini API key from Google AI Studio; its
card on the same page has **Set up with Charles** too.

## Technical references

- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
- [Cursor CLI authentication](https://cursor.com/docs/cli/reference/authentication)
- [ImapFlow](https://imapflow.com/docs/)
