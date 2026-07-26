# Eduraa Mobile

Expo/React Native implementation of the Eduraa product. The sibling
`AI_Question_Paper_System` repository remains the source of truth for backend
contracts and website workflows; this repository owns the mobile interaction,
navigation, device behavior, and release artifacts.

Parity means the same supported roles, data, permissions, and end-to-end user
outcomes. It does not mean shrinking desktop layouts onto a phone.

## First-time setup

Requirements:

- Node.js `20.19.4` and npm `10.8.2` (pinned by `.nvmrc` and `package.json`);
- Azure CLI access to the Eduraa development subscription, or the public API
  origin supplied by a maintainer;
- Expo Go for physical-device testing;
- Android Studio/ADB only for an Android emulator;
- macOS and Xcode only for an iOS simulator.

From the repository root:

```bash
nvm install
nvm use
npm ci
```

Create the ignored `.env` from the live Azure development API:

```bash
API_FQDN="$(az containerapp show \
  --name eduraa-ai-dev-cin-api \
  --resource-group eduraa-ai-dev-cin-rg \
  --query properties.configuration.ingress.fqdn \
  --output tsv)"

printf 'EXPO_PUBLIC_API_URL=https://%s\nEDURAA_API_UPSTREAM_URL=https://%s\n' \
  "$API_FQDN" "$API_FQDN" > .env

node --env-file=.env scripts/validate-release-env.cjs --release
```

If the teammate cannot read Azure, give them the public API origin and have
them create `.env` with this shape:

```dotenv
EXPO_PUBLIC_API_URL=https://api-host.example.com
EDURAA_API_UPSTREAM_URL=https://api-host.example.com
```

These values are public app configuration, not secrets. Never put passwords,
tokens, connection strings, or API keys in an `EXPO_PUBLIC_*` variable.

## Run in a browser

```bash
npm run web
```

Expo normally opens `http://localhost:8081`. If that port is occupied, use the
URL printed by Expo or choose one explicitly:

```bash
npm run web -- --port 8084
```

All local start commands launch the API bridge automatically. The browser app
uses `http://localhost:8001`; the bridge forwards requests to Azure and adds
localhost CORS headers. Port `8001` is internal and is not the app URL.

The equivalent interactive workflow is:

```bash
npm start
```

Then press `w`. Stop an old server with `Ctrl+C` before starting another one,
because only one bridge can listen on port `8001`.

## Run with Expo Go

Install or update Expo Go on the phone, then start a tunnel:

```bash
npm run expo-go -- --port 8082
```

Wait until the terminal prints `Tunnel ready` and an address such as
`exp://...exp.direct`.

- Android: open Expo Go and use **Scan QR code**.
- iPhone: scan the terminal QR code with the built-in Camera app, then tap
  **Open in Expo Go**.
- Keep the terminal running while anyone uses the app.
- The tunnel URL changes after a restart.
- A tester does not need access to the EAS project or the owner's Expo account.

The `expo-go` script deliberately serves an anonymous local development
manifest so Expo Go does not request the owner's signing credentials. EAS
ownership and the project ID remain present for preview and production builds.

Native Expo Go bundles call the Azure API directly. They do not use the local
browser bridge.

## Run in an emulator

Android requires a real SDK and ADB installation:

```bash
npm run android
```

If Expo reports `Failed to resolve the Android SDK path` or `spawn adb`, install
Android Studio and its platform tools, then set `ANDROID_HOME`. Pressing `a`
cannot work without ADB. On WSL, the simpler path is usually Expo Go on a
physical phone.

An iOS simulator is available only on macOS with Xcode:

```bash
npm run ios
```

## Share with teammates

`localhost` always refers to the computer opening the URL. A friend cannot open
your `http://localhost:8081` or `http://localhost:8084` remotely.

- To develop: each teammate clones the repository, creates their own `.env`,
  runs `npm ci`, and starts their own localhost server.
- To test on a phone temporarily: share the current Expo Go QR code or
  `exp://...` tunnel URL while your terminal remains running.
- To distribute a stable mobile artifact: create an EAS `preview` build.
- To share web permanently: deploy a preview web build. Do not expose the local
  bridge as a production service.

## Login behavior

Local development authenticates against the Azure development API configured
in `.env`. Browser login goes through the automatic bridge; native login goes
directly to Azure.

- **Could not reach Eduraa**: close any old page/server, restart `npm run web`,
  open the newly printed localhost URL, and hard-refresh the page.
- **ID or password does not match**: transport is working, but the credentials
  are not valid in the configured development database.
- Never post screenshots with a visible password.

Preview and production builds receive `EXPO_PUBLIC_API_URL` from their managed
EAS environment, not from local `.env`. Release builds reject missing, local,
plain-HTTP, credentialed, or malformed API origins before bundling.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Start Expo development with browser API bridging |
| `npm run expo-go -- --port 8082` | Start an Expo Go tunnel and print a QR code |
| `npm run web` | Start Expo web with browser API bridging |
| `npm run web:remote` | Alias for the bridged Expo web startup |
| `npm run android` | Launch Android; requires Android SDK and ADB |
| `npm run ios` | Launch iOS; requires macOS and Xcode |
| `npm run check:deps` | Check package alignment with the installed Expo SDK |
| `npm run validate:release-env` | Validate a preview/production API origin |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm test` | Run configuration and existing feature-model tests |
| `npm run export:ci` | Validate and production-bundle Android, iOS, and web JavaScript |

## Repository map

| Path | Ownership |
| --- | --- |
| `src/api` | HTTP configuration and domain API adapters |
| `src/auth`, `src/stores` | Session persistence, role resolution, and app state |
| `src/navigation` | Role-aware stacks and tabs |
| `src/screens` | Mobile feature flows grouped by product domain |
| `src/components/ui` | Shared mobile interaction primitives |
| `src/theme` | Eduraa tokens and visual language |
| `scripts` | Local tooling and executable model/configuration tests |
| `design-mocks` | Product reference material, not runtime source |
| `test-artifacts` | Local device and accessibility evidence |

The existing screen-domain layout is retained to avoid a high-risk mass move.
API modules can be grouped by domain incrementally when a feature is verified;
configuration and the shared client stay at the root of `src/api`.

See [docs/DELIVERY.md](docs/DELIVERY.md) for CI, Azure discovery, EAS builds, and
release responsibilities. See [docs/PARITY_PLAN.md](docs/PARITY_PLAN.md) for the
website-to-mobile implementation sequence and definition of done.
