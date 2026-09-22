# Cantero Field (apps/mobile)

The field app for site crews: Expo SDK 57 + expo-router + React Native, sharing domain types,
validation and translations with the web app through `packages/shared`. Everything a crew does
works offline and syncs later (SQLite queue with idempotency keys, see `src/lib/offline-queue.ts`).

What it covers: tasks, time with geofence check, stock movements with barcode scanning, daily
logs, punch list, RFIs and expenses with receipt scanning — photos on all of them, taken offline
and uploaded behind the record they belong to — plus the Plan room's drawing sheets (downloaded
for offline, pins, links between sheets, adding a punch item on the sheet), native push
notifications and Face ID / fingerprint unlock.

## Running it

A development build is needed (not Expo Go): the drawing viewer, camera and push use native
modules. On macOS with **full Xcode** installed and selected
(`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`):

```bash
pnpm --filter mobile ios        # builds and launches in the iOS simulator
pnpm --filter mobile android    # needs Android Studio / an emulator
```

`EXPO_PUBLIC_API_URL` (see `.env.example`) points the app at the API; a physical phone needs the
dev machine's LAN address rather than `localhost`.

## Builds (EAS)

`eas.json` defines:

| Profile | For |
| --- | --- |
| `development` | dev client for the iOS simulator / Android emulator |
| `development-device` | dev client installed on a registered phone |
| `preview` | internal testing build (Android APK, iOS ad hoc) |
| `production` | store build, build number incremented by EAS |

Steps that need your own accounts (nothing here can do them for you):

1. `npx eas-cli login`, then `npx eas-cli init` in this folder — links the project and writes
   `extra.eas.projectId` into the app config. **Push notifications need this**: without a project
   id the app skips push registration and everything else works as before.
2. For TestFlight / App Store: an Apple Developer account ($99/year). `eas build -p ios` sets up
   signing and the APNs key for push.
3. For Google Play: a Play Console account ($25 once) and, for push on Android, a Firebase
   project whose FCM V1 service-account key is uploaded to EAS (`eas credentials`).
4. Set `EXPO_PUBLIC_API_URL` for `preview`/`production` as an EAS environment variable pointing at
   the deployed API.

## Push

The API sends the same alerts it sends to browsers (Web Push) to phones through Expo Push — see
`apps/api/src/notifications/push.service.ts`. Phones register on sign-in and unregister on
sign-out; tapping an alert opens its project on the matching tab. The iOS simulator gets no push
token, so push is tested on a real phone.
