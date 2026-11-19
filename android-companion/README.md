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

The manifest declares only `PACKAGE_USAGE_STATS`. It does not request internet
access or ordinary runtime permissions. Usage summaries stay in memory while
displayed; this phase does not persist or upload them. On Android 11 and newer,
package visibility is limited to apps with a launcher activity.

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
