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

1. Make sure at least one lorebook exists.
2. Click the hovering **Toy Knife**.
3. Fill in:
   - **Dark World name** — optional; if blank, the model invents one
   - **Fountain location** — the Light World place where the fountain is opened
   - **Location details** — what that place is like
   - **Guidelines** — optional extra direction for the model
   - **Lorebook** — which World Info book receives the entry (defaults to the chat-bound book when there is one)
4. Click **OPEN DARK FOUNTAIN**.
5. The fountain animation plays fullscreen once while the entry is generated. Tap the overlay to skip the video. The last frame holds until generation finishes, then a new lorebook entry is saved.

### Creator UI controls

- **HIDE TOY KNIFE / SHOW TOY KNIFE** — toggles the floating button from inside the creator UI. You can also restore it from **Extensions → Penumbra Phantasm**, or open the form with `/darkfountain`.
- **SETTINGS** — customize generation:
  - Edit the **system prompt** and **user prompt template**
  - Enable **Use OpenRouter instead of main API**
  - Paste an OpenRouter API key, refresh the model list, and pick or type a model id

User prompt placeholders: `{{location}}`, `{{details}}`, `{{name}}`, `{{guidelines}}`, `{{name_instruction}}`, `{{guidelines_block}}`.

If OpenRouter is disabled, generation uses SillyTavern's currently selected API via `generateRaw`.

## Assets

| File | Role |
| --- | --- |
| `assets/button/Toy_Knife.png` | Hovering button |
| `assets/sfx/open_fountain.webm` | Fullscreen fountain animation (VP9/WebM) |
| `assets/sfx/open_fountain.mp3` | Fallback audio if the browser blocks video sound |

## Notes

- Requires a SillyTavern build that exposes `generateRaw`, `getWorldInfoNames`, `loadWorldInfo`, and `saveWorldInfo` on `SillyTavern.getContext()`.
- The knife, form, and video overlay are pinned to the browser's visual viewport for phone layouts (including Galaxy S25 Ultra portrait).
