# Marcy iOS build-readiness report

Date: September 29, 2026  
Checkout: `/Users/als/Desktop/Marcy`  
Branch: `main`  
Starting checkpoint: `ec94bd9` (`Refine data settings order and fresh start button`)

## Outcome

Marcy compiles and signs successfully with Xcode 26.1. Debug and Release simulator builds passed, signed generic-device Release builds passed, and a fresh signed Xcode archive containing the final Dynamic Type fix completed successfully. The app was installed on an iPhone 15 Pro running iOS 26.6.1 and passed the planned physical-device readiness checklist, including onboarding, persistence, notification delivery, backup sharing and restoration, Fresh start, Undo, offline launch, restart persistence, VoiceOver, rotation, keyboard layout, safe areas, and larger text.

The native build is ready to move into TestFlight validation. App Store Connect setup, store metadata, final screenshots, distribution validation/upload, and TestFlight testing remain outstanding before submission.

## Environment verified

- Xcode 26.1, build 17B55
- Node.js 22.18.0
- iOS 26.1 simulator runtime
- Bundle identifier: `com.marcy.app`
- Development team: `ANG6HGNAAV`
- Marketing version: `1.0`
- Build number: `1`
- Deployment target: iOS 15.0
- Target devices: iPhone and iPad (`TARGETED_DEVICE_FAMILY = "1,2"`)
- Valid signing identity: Apple Development certificate for Adam Louis Sobel
- Provisioning: automatic iOS Team Provisioning Profile

## Checks completed

- `npm test`: all 102 tests passed.
- `npx cap sync ios`: completed successfully.
- Capacitor detected and linked Filesystem 8.1.3, Local Notifications 8.0.2, Preferences 8.0.1, and Share 8.0.2.
- Debug build for iPhone 17 Pro simulator: passed.
- Release build for iPhone 17 Pro simulator: passed.
- Signed Release build for generic physical iPhone: passed.
- Fresh signed Xcode archive after the backup fix: passed (`/tmp/Marcy-Native-Backup.xcarchive`).
- Final signed Release archive after the Dynamic Type fix: passed (`/tmp/Marcy-Final-Readiness-20260929.xcarchive`).
- App bundle inspection confirmed:
  - packaged `public/index.html`
  - packaged Capacitor configuration
  - packaged app privacy manifest
  - Capacitor and Cordova privacy manifests
  - UserDefaults required-reason declaration `CA92.1`
  - file-timestamp required-reason declaration `C617.1`
- Existing simulator installation launched successfully after an in-place update.
- Five existing synthetic/test period records remained visible after termination and relaunch.
- Native notification permission denial did not block startup.
- A newly created isolated simulator displayed clean onboarding with no inherited records.
- Startup logs showed the Capacitor WebView loading and Local Notifications querying pending requests without a crash.
- Clean install on an iPhone 15 Pro running iOS 26.6.1: passed.
- Onboarding with synthetic data and notification permission request: passed.
- Force-quit and relaunch persistence: passed.
- Installation of the updated build over the existing app retained its data: passed.
- Native backup export opened the iOS share sheet and produced a file that could be saved to Files: passed.
- Native import displayed replacement confirmation and restored the exported cycle length from 30 days to the backed-up 28 days: passed.
- Actual local-notification delivery on the physical phone: passed.
- Reminder reconciliation in native logs showed the prior requests being cancelled and the current fertile-window and PMS reminders being scheduled: passed.
- Undo, Fresh start cancellation, confirmed erasure, clean relaunch, and backup restoration after erasure: passed.
- Persistence after a full device restart: passed.
- Offline launch: passed.
- Portrait/landscape rotation, keyboard interaction, safe-area layout, and control accessibility: passed.
- VoiceOver navigation: passed by physical-device review.
- Dynamic Type initially failed because the WebView used fixed pixel sizes. The interface now uses iOS Dynamic Type-aware root sizing with proportional text and wrapping/scroll protections. Simulator comparison at standard and maximum accessibility sizes and a physical-phone recheck both passed.

The first screenshots taken immediately after launch were blank while the WebView initialized. Settled screenshots showed the correct dashboard or onboarding screen; this was launch timing rather than a persistent blank-screen failure.

## Still required

Preferences migration from a build predating native Preferences could not be exercised on this phone because Marcy was not already installed before this test. Simulator in-place update persistence passed, but this does not fully replace a real legacy migration check.

### App Store preparation

- Decide whether the release supports iPhone only or both iPhone and iPad.
- Update `APP_STORE_LISTING.md`; its privacy, feature, and age-rating statements need review.
- Complete Apple's current age-rating questionnaire.
- Complete App Privacy disclosures, including optional Formspree email submission.
- Review health and physiology claims and the five-day menstrual fallback.
- Capture final screenshots using synthetic data from the final native build.
- Verify support and privacy URLs, pricing, availability, review notes, icon, version, and build number.
- Validate and upload through Xcode/TestFlight only after physical-device testing passes.

## Release status

Native compilation and development signing: **passed**  
Simulator smoke testing: **passed for startup, persistence, clean onboarding, and update checks**  
Physical iPhone testing: **passed for the planned release-readiness checklist**
TestFlight upload: **not started**  
App Store submission: **not ready; store preparation and TestFlight remain**
