# Penumbra Phantasm

A SillyTavern extension that opens a Dark Fountain and writes a Deltarune-style Dark World entry into a chosen lorebook.

## Install

1. In SillyTavern, open **Extensions** → **Install extension**.
2. Paste this repository URL:
   `https://github.com/LithiumWaves/Penumbra-Phantasm`
3. Enable **Penumbra Phantasm**.

For local development, clone the repo into:

```
SillyTavern/public/scripts/extensions/third-party/Penumbra-Phantasm
```

## Usage

1. Connect the API you want to use (the extension calls SillyTavern's selected API via `generateRaw`).
2. Make sure at least one lorebook exists.
3. Click the hovering **Toy Knife** on the right side of the screen.
4. Fill in:
   - **Dark World name** — optional; if blank, the model invents one
   - **Fountain location** — the Light World place where the fountain is opened
   - **Location details** — what that place is like
   - **Guidelines** — optional extra direction for the model
   - **Lorebook** — which World Info book receives the entry (defaults to the chat-bound book when there is one)
5. Click **OPEN DARK FOUNTAIN**.
6. The fountain animation plays fullscreen once while the entry is generated. The last frame holds until generation finishes, then a new lorebook entry is saved.

The Toy Knife can be hidden with the **X** above it. Show it again from **Extensions → Penumbra Phantasm → Show Toy Knife button**, or open the form with `/darkfountain` while it is hidden.

The entry is written as encyclopedic Dark World lore: a manifestation of the Light World location, a named motif, distinct regions, and the Dark Fountain's resting place. Trigger keys include the Dark World name, the location, `Dark World`, and `Dark Fountain`.

## Assets

Place these files in the extension folder (they ship with this repo):

| File | Role |
| --- | --- |
| `assets/button/Toy_Knife.png` | Hovering button on the right of the screen |
| `assets/sfx/open_fountain.webm` | Fullscreen fountain animation (VP9/WebM) |
| `assets/sfx/open_fountain.mp3` | Fallback audio if the browser blocks video sound |

## Notes

- Requires a SillyTavern build that exposes `generateRaw`, `getWorldInfoNames`, `loadWorldInfo`, and `saveWorldInfo` on `SillyTavern.getContext()`.
- The overlay stays up until **both** the video and the generation request have finished. The video plays once and holds on the last frame if generation is still running.
- The form is laid out for narrow portrait phones (around a Galaxy S25 Ultra viewport) and tracks the visual viewport so the on-screen keyboard does not cover it.
