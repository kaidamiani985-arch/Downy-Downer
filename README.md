# Downy Downloader

A small, local YouTube downloader for macOS and Windows 11. Paste a link, choose the quality, and download. No Python, Homebrew, or terminal setup required.

![Downy Downloader](build/dmg-background.png)

## Download

[Download the latest release](https://github.com/kaidamiani985-arch/Downy-Downer/releases/latest).

- **macOS 12+** — `Downy-Downloader-1.0.2-universal.dmg` (Intel and Apple Silicon)
- **Windows 11 (64-bit)** — `Downy-Downloader-1.0.2-windows-x64-setup.exe`

## Install on macOS

1. Open the DMG and drag **Downy Downloader** into **Applications**.
2. The app is ad-hoc signed, not notarized with a paid Apple Developer certificate. On first launch, macOS may block it:
   - macOS 15 Sequoia or newer: **System Settings → Privacy & Security → Open Anyway**.
   - macOS 14 Sonoma or older: right-click the app and choose **Open**.
3. After the first launch, it opens normally.

Requires macOS 12 Monterey or newer. The DMG is universal: native Intel and Apple Silicon.

## Install on Windows 11

1. Run `Downy-Downloader-1.0.2-windows-x64-setup.exe`.
2. Windows SmartScreen may warn because the installer is unsigned. Choose **More info → Run anyway**.
3. The installer is per-user and does not need administrator rights. It creates Desktop and Start menu shortcuts.

Windows 11 on ARM can run the x64 build through Windows emulation. The installer keeps your queue and settings in your user profile during upgrades.

## Use

- Paste a YouTube video, Shorts, or playlist link and press **Add**.
- Select one or more queue items, choose video/audio and quality, then **Download**.
- Files go to the folder shown in the footer. The first download asks you to choose one.
- Normal downloads cost **5 tokens**.
- A complete playlist costs **`ceil(5 × videos ÷ 2)`** tokens:
  - 3 videos → 8 tokens
  - 10 videos → 25 tokens
- Partial playlist selections cost the normal 5 tokens per video.
- Failed or cancelled downloads refund automatically.
- You start with 0 tokens. The wallet in the top-right shows your balance, and the download cost is always shown before you start.
- If YouTube asks you to sign in, open **Settings → Under the hood → Browser cookies** and choose your browser.
- If YouTube changes and downloads stop working, open **Settings → Under the hood → Update yt-dlp**.
- To update the app, open **Settings → Updates** (or use the menu bar). On macOS Downy installs and relaunches itself; on Windows it downloads and opens the installer.
- To start over, open **Settings → Reset save**. This clears the queue and resets tokens to 0 while keeping your settings.

## What is bundled

- `yt-dlp 2026.10.26` for macOS and Windows
- `Deno 2.9.8` for Intel and Apple Silicon Macs, and Windows x64 (required for YouTube's JavaScript challenges)
- `FFmpeg` and `FFprobe` for macOS and Windows x64 (merging streams and audio conversion)
- Inter and DM Mono fonts, licensed for local bundling

No external runtime is needed. On first launch, the app copies its tools into:

- macOS: `~/Library/Application Support/Downy Downloader/bin`
- Windows: `%APPDATA%\Downy Downloader\bin`

The in-app yt-dlp updater writes to that folder, so the app bundle can stay signed.

## Build from source

```bash
npm install
node node_modules/electron/install.js   # if your npm setup skips install scripts
npm run typecheck
npm test
```

### macOS

```bash
npm run fetch:binaries
npm run make:icons
npm run dist:mac
```

This produces:

- `release/Downy Downloader.app` (universal)
- `release/Downy-Downloader-1.0.2-universal.dmg`
- `release/SHA256SUMS.txt`

The build ad-hoc signs the app. It temporarily moves the yt-dlp binary out of the bundle while deep-signing, then restores it and re-seals the outer bundle.

### Windows

```bash
npm run fetch:win-binaries
npm run make:win-icon
npm run build
npm run dist:win
```

This produces:

- `release/win-build/win-unpacked/` (portable app directory)
- `release/Downy-Downloader-1.0.2-windows-x64-setup.exe`
- `release/SHA256SUMS-windows.txt`

The Windows installer uses NSIS. Install `makensis` first if it is not already available:

- macOS: `brew install makensis`
- Windows: install NSIS from https://nsis.sourceforge.io/

### Signing

macOS builds are ad-hoc signed. A warning-free macOS install requires an Apple Developer ID certificate and notarization. The project is structured for that: replace the ad-hoc signing step in `scripts/package-mac.mjs` with a Developer ID identity and notarize the app/DMG.

Windows builds are unsigned. A warning-free install requires a Windows code-signing certificate and signing both the app executable and the installer.

## Verification

- Unit tests cover playlist pricing, refund allocation math, URL parsing, duration formatting, and download option handling.
- End-to-end tested on macOS with real YouTube downloads:
  - 360p MP4 download
  - MP3 128 kbps audio extraction
  - playlist import and 50% group pricing
  - token charging and wallet updates
- macOS app slices verified with `lipo`.
- Windows binaries verified as x64 PE executables; the NSIS installer is built and inspected locally.

## Notes

- Everything stays on your computer. No analytics, accounts, or telemetry.
- Public videos work out of the box. Age-restricted, private, or members-only videos may require browser cookies or may not be available.
- Live streams are not supported yet.
- Download only content you have the rights to, and follow YouTube's terms.
