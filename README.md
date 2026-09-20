# Phone Trigger

SillyTavern extension that recreates the Steins;Gate **Phone Trigger** loop: open a handset UI, customize wallpaper and sounds, exchange dialogue-focused e-mail with characters.

## Features

- **Phone UI** — floating button, Extensions menu, `/phone`
- **Handset chassis** — red / silver / black keitai styled after Okabe’s phone
- **Mobile** — `<dialog showModal()>` top layer + scale-to-fit (S25 Ultra–safe)
- **Mail** — inbox / outbox / read / compose; optional tap-to-reply phrases
- **Wallpaper & sounds** — presets or custom URLs
- **Character → user** — `send_email` tool or `<email subject="…">…</email>` tags
- **User → character** — compose in-phone or `/mailsend`

## Install

1. Extensions → Install extension → this repository URL
2. Enable **Phone Trigger**

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

Mail is stored in chat metadata. Wallpaper / sounds are extension settings.
