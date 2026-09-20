# Penumbra Phantasm

SillyTavern extension that recreates the **Steins;Gate** phone / e-mail loop: open a feature-phone UI, customize wallpaper and sounds, and exchange dialogue-focused e-mails with characters.

> The repository name still reflects an earlier idea. The product direction is Phone Trigger–style mail, not DELTARUNE.

## Features

- **Phone UI** — floating button, Extensions menu entry, `/phone`
- **SG-001 chassis** — candy-bar styled after Okabe’s phone (camera block, chrome rails, keitai keypad)
- **Mobile-ready** — native `<dialog showModal()>` top layer (same S25 Ultra fix as Killer-Within’s investigator hub) + scale-to-fit so the full phone stays on-screen
- **E-mail app** — inbox, outbox, read, compose; optional tap-to-reply phrases
- **Customization** — built-in wallpapers or custom image URL; synth or custom notification / ringtone URLs
- **Character → user** — `send_email` function tool, or `<email subject="…">…</email>` tags in replies
- **User → character** — compose in the phone (or `/mailsend`); replies come back as e-mail, not chat prose
- **Prompt injection** — characters are told about the phone mail system and recent threads

## Install

1. SillyTavern → **Extensions** → **Install extension**
2. Paste this repository URL
3. Enable **Penumbra Phantasm** and open the phone from the floating button

## Commands

| Command | Action |
|--------|--------|
| `/phone` | Toggle phone |
| `/mail` | Open inbox |
| `/mailsend subject="Hi" Hello there` | Send mail (optional `reply=off`) |

## Character mail formats

**Function tool** (preferred when tool calling is enabled): `send_email` with `subject`, `body`, optional `replies` (`option1\|option2`).

**Tag fallback** (stripped from the chat bubble and delivered to the inbox):

```text
<email subject="About today" replies="Sure|Maybe later|What?">
Are you free this evening?
</email>
```

## Settings

Extensions panel → **Penumbra Phantasm — Phone / E-mail**: enable toggles, position, prompt injection, auto-open on mail, sound, and a test message button.

In-phone **Settings** also change wallpaper and sounds per the original VN’s phone options vibe.

## Notes

- Mail is stored in **chat metadata** (per chat).
- Wallpaper / sound preferences live in **extension settings** (global).
- E-mail replies use `generateQuietPrompt` so they stay off the main prose channel.
