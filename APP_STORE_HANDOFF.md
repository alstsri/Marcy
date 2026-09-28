# Marcy — App Store handoff

Last updated: September 28, 2026.

## Start here

The current priority is **a tested native iOS build, then TestFlight and App Store submission**. Marketing-plan review and Android packaging are deferred. Keep the browser prototype functional throughout.

The latest implementation checkpoint is **`720c11e` on `main`**: native history now uses Capacitor Preferences with migration from the old web-view storage. This document is added after that commit. The change is implemented and tested with mocks; **it has not yet been built or tested on a real iPhone**.

The owner reports Xcode **26.1 on the Mac mini**. The MacBook used for the code changes has Xcode 15.4. Continue native build work on the mini; verify its selected Xcode and signing setup rather than assuming they are configured.

Repository: https://github.com/alstsri/Marcy

Browser prototype: https://alstsri.github.io/Marcy/

## Pickup on the Mac mini

Use the mini's own checkout. Avoid editing the same iCloud-synced working directory from two machines at once. During this session the MacBook's Git index disappeared; it was rebuilt from HEAD without changing source files. The cause was not established.

From an existing Marcy checkout, first inspect any local work:

```sh
git status --short --branch
git remote -v
```

Preserve any local changes before pulling; do not reset or overwrite them. Once the checkout is ready:

```sh
git pull --ff-only origin main
git log -3 --oneline
node --version
xcodebuild -version
```

Use Node 22 or newer. The last clean-install validation used Node 24.19.0. If `xcodebuild` selects Command Line Tools or the wrong Xcode, select Xcode 26.1 in Xcode's Locations settings, or set `DEVELOPER_DIR` to that installation's `Contents/Developer` directory for the terminal session.

Then:

```sh
npm ci
npm test
npm audit
npx cap sync ios
npx cap open ios
```

Use **sync**, not only copy, for this update: it adds the Preferences native plugin. The project uses Swift Package Manager. Let Xcode resolve packages. Confirm the App target's signing team and bundle identifier before installing over an existing native app.

The MacBook's repo-only SSH deploy key is machine-specific. Git authentication on the mini must use credentials available there; do not copy private keys into the repository.

## Current architecture and implementation

- `docs/index.html` contains the shared UI, styles, and application logic.
- `docs/sw.js` supports the browser's offline cache.
- `capacitor.config.json` points the native app to `docs/`.
- Native platform detection selects Preferences; the browser continues using `localStorage`. These are runtime paths in the same codebase, not separate Git branches.
- Native startup loads Preferences before rendering history or scheduling reminders.
- Migration copies existing native web-view history and recovery records, verifies the writes, then marks migration complete and removes the old copies. Invalid history bytes are retained for recovery rather than silently replaced with an empty history.
- A migration marker prevents stale web-view data from returning after Fresh start. Existing native records take precedence over legacy copies.
- Native success messages wait for verified saves. Failed or uncertain writes open recovery for a fresh read. Deletion waits for an outstanding save and cancels reminders.
- Browser records do **not** automatically migrate into the installed native app: those are separate storage contexts. Use export/import to transfer them.
- `@capacitor/preferences` is locked at 8.0.1. The generated SPM package includes `CapacitorPreferences`.
- `ios/App/App/PrivacyInfo.xcprivacy` declares UserDefaults reason `CA92.1` and is included in the app target's resources. This does not replace the App Store Connect privacy questionnaire or final archive inspection.
- Preferences is local persistence, not an encrypted database or cloud sync. Uninstalling the native app removes its app data; backups remain important.
- Legacy `app.py`, `marcy.py`, `templates/`, and `static/` are separate, outdated implementations. Do not resume development there.

## Verification completed at 720c11e

- [x] All **100 automated tests pass**: 85 existing tests and 15 native-storage tests.
- [x] Native tests cover migration/reload, interrupted migration, unavailable storage/plugin, malformed records and recovery, failed/uncertain saves, concurrent email completion, backup import, export invocation, deletion/Undo, and Fresh start without data resurrection.
- [x] Clean dependency install and audit: **zero reported vulnerabilities** at the time of checking.
- [x] Capacitor sync in a clean temporary copy detects both Local Notifications and Preferences and generates their native registration.
- [x] Xcode project and privacy-manifest plist syntax validation passes.
- [x] Updated browser HTML is verified live on GitHub Pages.
- [ ] Compile/archive with Xcode 26.1, inspect the built resources and privacy report, and test native behavior. Browser/jsdom tests do not establish native readiness.

## Next work: native build and device checks

Do these before changing the store listing or submitting anything. Record the device, iOS version, build number, and results below.

1. Build and run the current app in the simulator, then on an iPhone. Check plugin registration, startup errors, layout, keyboard, and safe-area behavior.
2. Test native storage migration with **disposable records in an older installed build**, then install this build over it using the same app identity. Export a backup first. **Do not uninstall between builds**: that destroys the state needed to test migration.
3. Confirm periods, tension events, name, settings, and period ends survive the update, force-quit/reopen, and a device restart. Confirm later edits persist too.
4. Test a fresh install separately. Confirm it opens onboarding normally. Transfer a synthetic browser backup into it and verify the result.
5. Verify export produces a usable file on iOS and import restores it only after confirmation. Test actual file handling; a mocked download test is not enough.
6. Test deletion, cancellation, Undo, and Fresh start using disposable data. Check that no records return after reopening and unrelated data is untouched.
7. Test native notification permission allow/deny, scheduling, changes to recorded dates, pause, and Fresh start cancellation. Check actual delivery as well as pending requests.
8. Check offline launch, VoiceOver navigation and dialogs, larger text, and the device sizes/orientations the target supports.

If export/import or native bridge behavior fails, fix that before claiming the migration is release-ready. Keep real personal histories out of test fixtures, screenshots, logs, and Git.

## Remaining submission work

- [ ] Verify Apple Developer membership, App Store Connect access, app record, signing, and whether `com.marcy.app` is the intended available identifier. The project has a team configured; that alone does not prove account readiness.
- [ ] Decide iPhone-only versus iPhone and iPad. The target currently supports both (`TARGETED_DEVICE_FAMILY = "1,2"`). Existing iPad screenshot candidates are present; validate or refresh them if retaining support.
- [ ] Update `APP_STORE_LISTING.md`. It still contains outdated feature/privacy claims, an assumed `4+` rating, and a duplicate old privacy policy. Do not paste it into App Store Connect unchanged.
- [ ] Complete Apple's current age-rating questionnaire based on actual content. Neither the old `4+` entry nor the external review's asserted `17+` is a validated result.
- [ ] Complete App Privacy disclosures, including the optional email submission to Formspree. Verify vendor handling and deletion details. Keep the listing, in-app wording, and hosted policy consistent.
- [ ] Review individual health/physiology claims for support and presentation before submission. Preserve the approved voice; propose specific corrections rather than rewriting all daily cards.
- [ ] Review the five-day menstrual fallback when no end date is logged. This remains an open accuracy question, not a completed fix.
- [ ] Refresh screenshots against the final native build using synthetic records. See `screenshots/app-store-candidates/README.md`; candidates predate recent UI changes.
- [ ] Verify support/privacy URLs, native sharing behavior, app icon, version/build number, availability, pricing, and review notes. No account login should be needed by the reviewer.
- [ ] Archive, validate, upload to TestFlight, complete device testing, and only then submit the reviewed release. No TestFlight upload or App Store submission has been performed in this work.

Recheck current Apple requirements at submission time:

- [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Submit an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app)
- [Capacitor Preferences and its privacy manifest](https://capacitorjs.com/docs/apis/preferences)

## Working preferences and prior decisions

- Make one coherent change at a time; test, commit, push, and allow an iPhone check when the UI changes.
- Preserve minimal styling. Avoid adding explanatory copy to the dashboard for minor edge cases. Accessibility changes should preserve the established appearance.
- The rare deletion entry is a compact outlined **fresh start** button matching export/import, separated from them by extra space. Its confirmation explicitly says **erase data** and offers export first.
- Daily guidance should retain useful cycle context and considerate, direct advice. A broad rewrite into generic relationship coaching was rejected and mostly reverted. Review specific claims individually.
- Keep estimated timing clear without repeating the same qualifier throughout a section.
- Multiple-person profiles, tension notes, Android packaging, and broad marketing revisions are deferred.
- Automated GitHub CI was discussed but deferred; continue running the tests during changes.
- Code push authorization has been established for this incremental workflow. Store upload/submission is a separate release step to coordinate with the owner.

## Progress log

| Date | Checkpoint | Result / next action |
| --- | --- | --- |
| 2026-09-28 | `720c11e`: Preferences migration | 100 tests pass; native compile and device validation pending on Mac mini. |
| 2026-09-28 | Handoff document added | Start with Mac mini setup and native build above. |
| 2026-09-28 | Browser layout refinement | Cycle-length override moved below Product updates; Fresh start uses a smaller backup-style button. Native build checks remain next. |

Append subsequent commits, actual device/build results, outstanding failures, and the next concrete action here. Distinguish mocked tests, simulator checks, real-device checks, and App Store validation.
