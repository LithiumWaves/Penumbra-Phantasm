# Phone Trigger

SillyTavern extension that recreates the Steins;Gate **Phone Trigger** loop: open a handset UI, customize wallpaper and sounds, exchange dialogue-focused e-mail with characters.

## Features

- **Phone UI** — draggable MAIL chip, Extensions wand menu, `/phone`
- **Handset chassis** — red / silver / black keitai styled after Okabe’s phone
- **Mobile** — `<dialog showModal()>` top layer + scale-to-fit (S25 Ultra–safe)
- **Mail** — inbox / outbox / read / compose; optional tap-to-reply phrases
- **D-Mail** — permanent contact **PhoneWave (name subject to change)** (hideable); in-phone Settings → D-Mail toggles Spectacle / Worldline overlay / Propose / Apply; send plays `lib/vid/divmeter.mp4` when Spectacle is on
- **Do not reply** — compose toggle skips the AI reply so mail threads do not loop
- **Notifications** — Steins;Gate-styled mail alerts + chip unread badge
- **Send animation** — compose shows an e-mail-client send sequence
- **Wallpaper & sounds** — presets or custom URLs
- **Character → user** — `send_email` tool or `<email subject="…">…</email>` tags
- **User → character** — compose in-phone or `/mailsend`
- **Independent replies** — mail generation uses raw/OpenRouter (not the active chat turn), with a configurable delay and editable prompt template
- **Active-chat To:** — PhoneWave plus group members (or the solo chat character) appear in compose
- **Context toggles** — optional chat→mail summary; optional mail→chat memory with a phone **Memory** picker per character; optional worldline inject after D-Mail
- **Guided receive** — faint signal bars on Inbox open a From / Guide panel to force inbound mail

## Install

1. Extensions → Install extension → this repository URL
2. Enable **Phone Trigger**
3. Divergence clip lives at `lib/vid/divmeter.mp4` (already in-repo); `assets/divmeter.mp4` works as a fallback path

## Commands

| Command | Action |
|--------|--------|
| `/phone` | Toggle phone |
| `/mail` | Open inbox |
| `/mailsend subject="Hi" Hello` | Send mail (`reply=off` to skip AI reply) |

## Character mail

**Tool:** `send_email` (`subject`, `body`, optional `replies`).

**Tag:**

```text
<email subject="Subject" replies="A|B|C">
Body
</email>
```

Mail replies are generated independently of the main chat character (To: contact card + editable prompt). A short delay (default 3–8s) runs before the reply arrives. Optional chat→mail summary keeps replies story-aware; optional mail→chat injection can be limited to the speaking character so group members do not share private mail.

Mail to **PhoneWave (name subject to change)** is a D-Mail: no character reply; worldline facts are stored in chat metadata and (by default) injected into the prompt.

Mail is stored in chat metadata. Wallpaper / sounds / reply prompt are extension settings.
