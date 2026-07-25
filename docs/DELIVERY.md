# Mobile Delivery

## System boundary

The two repositories have separate delivery responsibilities:

| Surface | Built from | Delivery system |
| --- | --- | --- |
| FastAPI backend and worker | `AI_Question_Paper_System` | GitHub Actions, ACR, Azure Container Apps |
| React website | `AI_Question_Paper_System` | GitHub Actions, Azure Static Web Apps |
| Android and iOS apps | `eduraa-mobile` | EAS Build, then Play Store/App Store |
| Expo web bundle | `eduraa-mobile` | Verification only unless a host is explicitly chosen |

The mobile app consumes Azure, but it is not deployed to Azure. A backend deploy
can happen independently; a mobile release is needed only when app code or an
embedded public build variable changes.

## Pull-request gate

`.github/workflows/ci.yml` runs on every pull request to `main`, every push to
`main`, and manual dispatch. It uses no repository or cloud secrets, does not
persist the automatic checkout token, and never calls the live API.

1. `npm ci` proves that `package-lock.json` is complete and reproducible.
2. An audit rejects critical advisories across app and locked delivery tooling.
3. `expo install --check` verifies Expo SDK dependency alignment.
4. Strict TypeScript catches navigation, model, and API typing failures.
5. Configuration, bridge, and feature-model tests verify deterministic behavior.
6. Release validation requires one canonical public HTTPS API origin, then the
  production export bundles Android, iOS, and web with a reserved example
  endpoint to prove that release configuration and Metro bundling work.

Configure the repository's `main` branch protection to require
`Mobile CI / Verify` before merge. UI changes still require real-device states
and the repository's independent premium UI review; CI cannot judge rendering.

## Azure discovery with `az`

Use the signed-in Azure CLI as the only Azure access path. Do not copy resource
credentials into this repository.

```bash
az account show --query '{subscription:name,id:id,user:user.name}' -o json

az containerapp list \
  --query '[].{name:name,resourceGroup:resourceGroup,fqdn:properties.configuration.ingress.fqdn}' \
  -o table

API_FQDN="$(az containerapp show \
  --name eduraa-ai-dev-cin-api \
  --resource-group eduraa-ai-dev-cin-rg \
  --query properties.configuration.ingress.fqdn -o tsv)"

az rest --method get \
  --url "https://${API_FQDN}/health" \
  --skip-authorization-header -o json
```

As observed on 2026-07-24, the subscription contains a development API, worker,
scaler, registry, PostgreSQL, Redis, storage, Key Vault, monitoring, and Static
Web App in or associated with `eduraa-ai-dev-cin-rg`. No production mobile API
endpoint was observed. Do not point the EAS `production` environment at the
development API merely to make a build pass.

## EAS environments and builds

`eas.json` maps each build profile to the equally named managed EAS environment:

| Build profile | EAS environment | Intended use |
| --- | --- | --- |
| `development` | `development` | Development-client builds |
| `preview` | `preview` | Internal APK/device acceptance |
| `production` | `production` | Store artifacts only |

Discover the Azure endpoint with `az`, then enter its public URL into the EAS
environment. `EXPO_PUBLIC_*` values are embedded in the app and must never hold
secrets. Preview and production accept only `EXPO_PUBLIC_API_URL`; they reject
platform-specific overrides, non-public hosts, plain HTTP, credentials, paths,
queries, and fragments. Expo config evaluation and `eas-build-post-install`
invoke the same validator so a signed artifact cannot be produced with missing
or malformed release configuration.

```bash
API_FQDN="$(az containerapp show \
  --name eduraa-ai-dev-cin-api \
  --resource-group eduraa-ai-dev-cin-rg \
  --query properties.configuration.ingress.fqdn -o tsv)"

npm exec -- eas env:create \
  --environment preview \
  --name EXPO_PUBLIC_API_URL \
  --value "https://${API_FQDN}" \
  --visibility plaintext

npm exec -- eas build --profile preview --platform android
```

Production delivery should remain manual until the production backend, store
accounts, signing credentials, privacy declarations, and rollback owner are all
confirmed:

```bash
npm exec -- eas build --profile production --platform all
npm exec -- eas submit --profile production --platform android
npm exec -- eas submit --profile production --platform ios
```

For later GitHub-driven builds, add an `EXPO_TOKEN` repository secret and a
manual environment-protected workflow. Do not expose that token to pull-request
jobs, and do not auto-submit store releases directly from an unreviewed merge.

## Dependency policy

CI rejects critical dependency advisories. As of 2026-07-24, npm still reports
moderate/high findings in Markdown linkification and Expo/EAS tooling. The
linkification issue has no upstream fix, while some suggested fixes force an
Expo SDK upgrade or incompatible tool changes. Track these with SDK/tooling
upgrades and do not run `npm audit fix --force` as an unreviewed shortcut.

## Rollback model

- Backend: redeploy a previously known immutable ACR image through the website
  repository's deployment workflow.
- Native app: halt a staged store rollout where possible. After full release,
  rebuild the known-good commit with incremented store build/version identifiers
  and submit it as a new release; stores do not roll devices back to an older build.
- API endpoint: change the relevant EAS environment and create a new build.
- JavaScript over-the-air updates are not configured in this repository, so do
  not assume a broken native release can be repaired with an update command.
