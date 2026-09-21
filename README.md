# Phone Trigger

SillyTavern extension that recreates the Steins;Gate **Phone Trigger** loop: open a handset UI, customize wallpaper and sounds, exchange dialogue-focused e-mail with characters.

## Features

- **Phone UI** — draggable MAIL chip, Extensions wand menu, `/phone`
- **Handset chassis** — red keitai with working multi-tap keypad (T9-style Latin)
- **Mobile** — `<dialog showModal()>` top layer + scale-to-fit (S25 Ultra–safe)
- **Mail** — inbox / outbox / read / compose; optional tap-to-reply phrases; trash on open mail
- **Calls** — Presence-less handset calls: dial a character and talk in the phone UI (not the main chat); optional call initiative (incoming rings); generation via unique prompt, main chat presets, or both
- **Character initiative** — optional VN-style unsolicited mail with interval, chance, idle, caps, quiet hours, and contact rules (off by default)
- **D-Mail** — permanent contact **PhoneWave (name subject to change)** (hideable); Spectacle (FX only) / Worldline / Propose / Apply; clearable worldline facts
- **Strong Apply** — system chat note + sticky worldline block on the active character card
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

1. Extensions → Install extension → `https://github.com/LithiumWaves/Phone-Trigger`
2. Enable **Phone Trigger**
3. Folder should be `scripts/extensions/third-party/Phone-Trigger` (legacy `Penumbra-Phantasm` still works for assets/settings fallback)
4. Divergence clip: `lib/vid/divmeter.mp4`

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

Mail to **PhoneWave (name subject to change)** is a D-Mail: no character reply. **Spectacle** plays the divergence meter in the browser top layer (mobile-safe) and does not create worldline facts. Facts are only derived when **Worldline**, **Propose**, or **Apply** is on; by default Worldline injects them into the prompt. **Apply** also writes a system note and a tagged block onto the active character card.

### Character initiative

Optional VN-style unsolicited mail (Extensions drawer → **Character initiative**). Off by default. When enabled, the extension periodically rolls chance against idle / generation / phone-open / quiet-hours / unread / hourly-daily caps, then generates inbound mail with a dedicated prompt (or the Forced mail prompt). Use **Send initiative now** to test without waiting on chance.

### Calls

Presence-less calls live entirely in the handset: green ☎ → pick a contact → talk in the call screen. Generation mode can be **unique call prompt**, **main chat completion presets** (`generateQuietPrompt`), or **both** (presets + full call template). Optional **Call initiative** rings you with mail-style throttling. Hang up with red ☎ or soft **End**.

Mail is stored in chat metadata. Wallpaper / sounds / reply prompt are extension settings.

## Keypad

Focus a subject/body field, then use the chassis keys:

- **2–9** multi-tap letters (classic phone timing)
- **Long-press** inserts the digit
- **0** space (long-press = `0`)
- **\*** toggles Aa / aa
- **◀** soft-nav left = backspace
