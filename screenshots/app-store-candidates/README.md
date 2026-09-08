# Marcy App Store screenshot candidates

These are native Capacitor/WKWebView captures with a clean iOS status bar, no Safari chrome, no notification prompt, and no alpha channel.

- `6.9/`: 1320 × 2868 px (iPhone 16 Pro Max)
- `6.3/`: 1206 × 2622 px (iPhone 16 Pro)
- `13-ipad/`: 2064 × 2752 px (13-inch iPad Pro)
- Contact sheets are review aids only; do not upload them to App Store Connect.

## Recommended upload order

Use the same filenames from either device folder:

1. `01-dashboard-overview.png` — core cycle/timeline view
2. `10-pms-warm-things.png` — warm, useful, and gently funny
3. `02-menstrual-follow-her-lead.png` — empathetic and consent-aware
4. `03-menstrual-what-do-you-need.png` — practical support
5. `04-follicular-plan-together.png` — positive shared planning
6. `07-menstrual-mental-load.png` — thoughtful practical care
7. `11-pms-tissue-not-solution.png` — heartwarming, concise support
8. `14-data-entry.png` — shows the period and tension logging controls
9. `15-menstrual-low-key-time.png` — warm, low-key quality-time suggestion
10. `12-tension-pattern.png` — demonstrates the app's tracking feature

## Alternates

- `05-follicular-try-something-new.png`
- `06-follicular-show-initiative.png`
- `08-luteal-small-things.png`
- `09-luteal-quiet-reassurance.png`
- `13-dashboard-pms-ring.png` — alternate closed-card ring view

App Store Connect accepts 1–10 screenshots per device class. Since February 2026, only one highest-resolution iPhone screenshot set is required; the second iPhone size is optional. If the app continues to support iPad, a 13-inch iPad screenshot set is also required.

Apple references:

- [Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

Regenerate the full candidate set from the project root with:

```sh
bash ./take_screenshots.sh
```
