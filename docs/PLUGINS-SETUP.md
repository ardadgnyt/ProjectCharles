# Plugin setup

Connect your accounts in **Settings → Plugins**. Each person connects their own accounts.
Sessions from ChatGPT plugins cannot be moved into Charles. Keys, passwords and OAuth tokens are
encrypted for your Windows user (DPAPI), stored in `%APPDATA%\Charles` and never included in an
installer package.

Mail, calendar and Drive access is **read-only**. Content that arrives by mail can never run
commands or send messages on its own.

For Google and Microsoft, **Set up with Charles** opens the official site and shows a short
guide next to Slime, step by step.

- [Google: Gmail, Calendar, Drive](#google-gmail-calendar-drive)
- [Microsoft: Outlook and Calendar](#microsoft-outlook-and-calendar)
- [POP3 / IMAP mail (school, work, custom domain)](#pop3--imap-mail)
- [Home Assistant](#home-assistant)
- [Developer services](#developer-services)
- [Notifications](#notifications)
- [Using plugins in chat](#using-plugins-in-chat)
- [AI accounts](#ai-accounts)

## Google: Gmail, Calendar, Drive

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (for example
   *Charles*) and enable the **Gmail API**, **Google Calendar API** and **Google Drive API**.
2. Configure the **Google Auth Platform** (consent screen). Set the audience to *External*. While
   the app is in testing, add your own Google account under **Test users**.
3. Create an OAuth client of type **Desktop app** and download its JSON file.
4. In Charles, choose **Import Google JSON file**, then **Sign in with Google**. Sign in with the
   account you added as a test user. The callback is `http://127.0.0.1:42813/callback`, and
   state and PKCE are checked.

Do not use an API key or a service-account file. Apps in testing mode may ask you to sign in
again from time to time. Publishing an OAuth app to other people requires Google’s own review.

Drive search works by file name. Google Docs, TXT and Markdown files can be read into a chat.
For other formats, open the file and attach it.

## Google Calendar (add events)

Available since v0.7.2 Beta. The Google plugin above only reads your calendar. To add
events from the workspace window, open **Settings → Plugins → Google Calendar** and press
**Connect Google Calendar**. It uses the same Google app registration, so set up the Google
plugin first. Google asks for one permission: view and edit events on your calendars.

If Google shows an "access blocked" or "app not verified" page, open Google Cloud → Google
Auth Platform → Data access and add the scope `https://www.googleapis.com/auth/calendar.events`,
then try again. The Google Calendar API must be enabled (it is part of the Google setup).

## WhatsApp

Available since v0.7.2 Beta. No account or key is needed: Charles opens **WhatsApp Desktop**
(from the Microsoft Store) with your message. If it is not installed, WhatsApp Web opens instead.

1. Open **Settings → Plugins → WhatsApp** and add the people you message often: a name
   (for example *Annem*) and the phone number with the country code (*+90 555 111 22 33*).
2. Say or type *“WhatsApp’tan Annem’e akşam geliyorum mesajını at”*.
3. For a saved contact, Charles opens the chat and presses send for you (turn this off with
   **Send automatically to saved contacts**; then you press send). For anyone else, WhatsApp
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
   into Charles and choose **Sign in with Microsoft**.

Work and school tenants may need an administrator to approve the app.

## POP3 / IMAP mail

For school, work or custom-domain mailboxes:

1. Ask your IT department for the server address and check that IMAP or POP3 access is enabled
   for your account.
2. In Charles, choose **IMAP · TLS** (usually port `993`) or **POP3 · TLS** (usually port `995`),
   enter the server, your full email address and your password (or an app password).
3. **Save**, then **Test connection**.

Certificate checks cannot be turned off. The mailbox is opened read-only: messages are never
marked as read or deleted. Charles lists the 25 newest messages from the last 7 days and reads
at most 30,000 characters of a message. Attachments are not downloaded. POP3 cannot report
read/unread status, so new mail is tracked by message ID after the first check. If your school
blocks IMAP and POP3, use its webmail instead. Charles does not scrape webmail.

## Home Assistant

1. In Home Assistant, open your profile → **Security** and create a **long-lived access token**.
2. In Charles, enter the server URL (for example `http://homeassistant.local:8123`) and the
   token. Remote servers must use HTTPS.
3. **Test connection.** Devices are addressed by their Home Assistant names.

Supported domains: light, switch, fan, media_player, cover, lock, scene, script and automation.
In **Full access** mode commands run directly. In the other modes Charles shows an approval card
first. A command the server rejects is not reported as done. Google Home accounts cannot be
connected directly.

## Developer services

A GitHub connection is planned for a later version and is shown as *coming soon*. The Vercel,
Stripe, Resend, Notion, Cal.com and n8n cards were removed in v0.7.0.

## Notifications

Turn on **Important mail and calendar notifications** to see bubbles under the island.

- Mail and calendars are checked every **5 minutes while Charles is running**. Nothing is
  checked while it is closed.
- The first check only records what is already there. After that, new unread mail is flagged
  when the provider marks it important or when it contains one of your **important keywords**
  (comma-separated, for example *urgent, exam, deadline*).
- New calendar events and events starting within 15 minutes are announced, each only once.
- Sorting uses local rules, not a background AI call.

Click a bubble and Charles explains the email. It can also offer to add a deadline to your
calendar with reminders.

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

AI providers are connected in **Settings → AI models**, not under Plugins:

| Provider | How it connects |
| --- | --- |
| GPT | Your ChatGPT account through Codex (browser sign-in) |
| Claude | Claude Code. It needs a plan that includes Claude Code; a free web account is not enough |
| Antigravity | Your Google account through Antigravity. Gemini Live voice uses a separate API key from AI Studio. Both have **Set up with Charles**, a step-by-step guide next to Slime |
| Cursor | The official Cursor Agent (browser sign-in). The island shows what is left of the plan this billing cycle (Auto and monthly) in turquoise |

## Technical references

- [Google OAuth for desktop apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Microsoft authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Home Assistant REST API](https://developers.home-assistant.io/docs/api/rest/)
- [Cursor CLI authentication](https://cursor.com/docs/cli/reference/authentication)
- [ImapFlow](https://imapflow.com/docs/)
