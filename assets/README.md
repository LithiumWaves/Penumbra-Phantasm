# Phone Trigger assets

Divergence meter clip used for D-Mail:

- **Primary:** `lib/vid/divmeter.mp4` (H.264 + AAC audio, faststart)
- **Fallback path:** `assets/divmeter.mp4` (optional copy)

When you send mail to **PhoneWave (name subject to change)**, Phone Trigger plays this video fullscreen (with its soundtrack when Sounds / Play cutscene audio are on), then applies a short screen distortion. If the file fails to load, a CSS divergence-meter fallback runs instead.

Re-encode tip (keep audio):

```bash
ffmpeg -i source.mp4 -c:v libx264 -profile:v main -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k lib/vid/divmeter.mp4
```
