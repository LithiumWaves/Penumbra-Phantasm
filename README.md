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
3. Choose a mode:
   - **Create new Dark World** — invent a full entry from a Light World location
   - **Append to existing Dark World** — add a region, NPCs, or secret area into an existing lorebook entry
4. Fill the fields (or hit **RANDOM** to seed a surprise world and open the fountain immediately).
5. Click **OPEN DARK FOUNTAIN** / **APPEND TO DARK WORLD**.
6. Unless skipped in settings, the fountain animation plays once while generation runs. Tap the overlay to skip.

A themed success toast appears when the Dark World is written.

### Creator UI controls

- **HIDE TOY KNIFE / SHOW TOY KNIFE** — toggles the floating button
- **RANDOM** — picks a random Light World seed, clears the name, and opens a fountain so the AI invents the rest
- **SETTINGS**
  - Edit system/user prompts
  - Enable OpenRouter + API key + model
  - **Always skip fountain animation**

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
- The knife, form, video overlay, and success toast are pinned to the browser's visual viewport for phone layouts.
