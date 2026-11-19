# Sotiría Android Companion

This is a standalone native Android project. It is intentionally kept under
`android-companion/` so it does not change the existing PWA build or source.

## Local usage summaries

The app contains a child-friendly onboarding screen that explains Android's
Usage Access setting and shows whether access is enabled. The user must enable
it in Android Settings. When enabled, the app reads today's per-app foreground
time and displays the included-app total plus a ranked breakdown with app name,
package name, duration in minutes, and local usage date. Sotiría itself and
system apps are excluded.

The manifest declares `PACKAGE_USAGE_STATS` and `INTERNET`; internet is used
only for pairing in this phase, not for usage uploads. No camera or ordinary
runtime permissions are requested. Usage summaries stay in memory while
displayed. On Android 11 and newer, package visibility is limited to apps with
a launcher activity.

## Secure device pairing

From the parent PWA's family profile, choose **Connect phone** for an active
child. The PWA creates a random, ten-minute pairing code. Enter the code in
the companion app. The server associates the phone with the child from the
parent-authorized pairing record; the Android app never submits a child ID.

The Android app generates independent pending and device credentials. It keeps
them encrypted in private app storage using an AES key held by Android Keystore.
Only SHA-256 hashes of those Android credentials are sent to the Worker. The
one-time pairing code is sent over HTTPS and hashed by the Worker before its
verifier reaches Supabase. The Worker uses the existing service-role-only
pairing RPCs; the service-role key is not included in the PWA client or Android
project. A replacement phone becomes active only after its credentials are
successfully activated.

Configure the deployed Worker origin at build time; it must be an HTTPS origin
without a path:

```powershell
.\gradlew.bat -PsotiriaPairingApiBaseUrl=https://your-worker-host :app:assembleDebug
```

Alternatively, set `SOTIRIA_PAIRING_API_BASE_URL` in the build environment.
The value is compiled as a public endpoint URL, not a credential. If omitted,
the app still builds but pairing reports that the server URL is not configured.
The pairing database migration must be applied through the project's approved
migration process before pairing can work; this code does not apply migrations.

The project targets Android API 35 and requires API 26 or newer. Usage Access
must be enabled explicitly by the user; availability and reported aggregates
may vary by Android version and device manufacturer.

## Build later

The Android Gradle Plugin 8.9.2 is configured with the Gradle 8.11.1 wrapper.
To build locally, install a JDK 17 and Android SDK Platform 35. The wrapper
downloads its verified Gradle distribution on first use. From this directory
run:

```sh
./gradlew :app:assembleDebug
```

On Windows PowerShell, use:

```powershell
.\gradlew.bat :app:assembleDebug
```

The debug APK will be written to `app/build/outputs/apk/debug/`. Alternatively,
open this directory in Android Studio when available and let Gradle sync.

## GitHub Actions

The repository-root workflow at `.github/workflows/android-apk.yml` can be run
manually with `workflow_dispatch`. It configures JDK 17 and Android SDK
Platform 35 on the GitHub-hosted runner, builds `:app:assembleDebug`, and
uploads the APK as the `sotiria-android-debug-apk` artifact for 14 days.
