---
name: start-mobile
description: Start the Eduraa React Native app for a physical phone, create a fresh Expo Go QR code, and keep the verified development session running. Use when the user says StartMobile, asks to start Expo/Expo Go, requests a fresh mobile QR, or wants to open eduraa-mobile on a phone. Do not use for EAS preview or production builds.
---

# Start Mobile

Launch a working Eduraa Mobile session and return a QR the user can scan. Do not stop after printing a command or an unverified URL.

## Locate and protect the project

1. Resolve the `eduraa-mobile` root by finding the `package.json` whose `name` is `eduraa-mobile`. Run all project commands there.
2. Read and follow that directory's `AGENTS.md` and the Expo Go section of `README.md`.
3. Confirm `node_modules` exists. If it does not, run `npm ci` before startup.
4. Check the configured Node and npm versions. A mismatch is a warning unless startup actually fails because of it.
5. Never print `.env` values, credentials, tokens, or passwords. The Expo tunnel URL is safe to return.

## Replace only a verified stale Eduraa server

The API bridge uses port `8001`, and Expo normally uses `8082`. Inspect listeners before starting.

- If neither port is occupied, continue.
- If an existing process tree is clearly an Eduraa Mobile development server, stop that exact tree so the user receives a fresh QR. Verify it from command lines containing this repository path, `scripts/start-web.cjs`, or the repository's Expo CLI child.
- Never terminate an unknown process merely because it owns one of these ports. Report the conflicting PID and command instead.
- On Windows, enumerate the resolved parent/child PIDs and use PowerShell `Stop-Process -Id ...`; do not use broad image-name kills such as `taskkill /IM node.exe`.

## Start Expo Go

Start this command in a persistent PTY so the server remains alive after the response:

```powershell
npm run expo-go -- --port 8082
```

Poll output at intervals of at most 30 seconds and keep the user updated at least once per minute. Success requires both:

- `Tunnel ready.`
- `Metro waiting on exp://...`

Do not return the QR while the tunnel is merely connecting.

If ngrok reports that the tunnel took too long, stop the failed process tree and retry the same command once. If the second tunnel attempt fails, start a same-Wi-Fi fallback with:

```powershell
node scripts/start-web.cjs --go --lan --clear --port 8082
```

Clearly label a LAN result as requiring the phone and computer to be on the same network. Do not claim it is a remote tunnel.

If port `8082` alone is unavailable to an unrelated process, choose the next free port from `8083` through `8090`. Port `8001` cannot be changed without changing the app's bridge contract, so an unrelated listener there is a blocker.

## Create and verify the QR artifact

Extract the exact `exp://` URL printed by Metro. From the mobile repository root, generate both QR formats:

```powershell
node .codex/skills/start-mobile/scripts/render-qr.cjs "<exp-url>" "../output/eduraa-mobile-expo-qr"
```

The helper writes `.png` and `.svg` files and prints their absolute paths. Inspect the PNG with the available image viewer. When a QR decoder is locally available, decode it and confirm it equals the Metro URL; otherwise state that visual generation and the live Metro URL were verified but decoding was not automated.

Poll the Expo PTY once more after QR generation. If it exited, do not present the QR as live; diagnose or restart first.

## Return the result

Lead with the QR image or a clickable PNG link, then include:

- the exact `exp://` URL;
- Android: Expo Go -> **Scan QR code**;
- iPhone: Camera -> **Open in Expo Go**;
- whether it is a tunnel or same-Wi-Fi LAN session;
- that the QR works only while this development server remains running;
- any real warning or limitation.

Keep the final response concise. Do not imply that a local development QR is a stable production build.
