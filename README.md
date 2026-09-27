# Marcy

Marcy is a browser prototype for recording period starts and tension events, viewing cycle estimates, and reading cycle-related guidance. The current app lives in `docs/` and is hosted on [GitHub Pages](https://alstsri.github.io/Marcy/). A Capacitor iOS project is also included for native development.

## Use the browser prototype

Open https://alstsri.github.io/Marcy/ in Safari. To keep it on your iPhone home screen, use **Share → Add to Home Screen**. Load the app online first so its service worker can cache the app for offline use.

The app provides:

- Period history, cycle-length calculation, and estimated upcoming dates.
- Tension-event logging and a cycle-day heatmap of recorded history.
- Expandable daily guidance and history details.
- Backup export/import, storage-recovery controls, and local data deletion.

Cycle timing is estimated. Calendar estimates cannot confirm ovulation and must not be used for contraception. The heatmap summarizes logged events; it does not predict arguments or establish their cause.

## Data and backups

The current app stores history and settings in `localStorage` in the browser or native web view. There is no account or automatic history sync. The old Python app's `data.json` is a separate store and is not read by the browser prototype.

Use **export backup** on the Data page to keep a copy before clearing website data, changing browsers, or moving devices. Backups contain personal history: choose where to save and share them carefully. Importing a backup replaces the current history after confirmation. Local data deletion does not delete downloaded backups.

Different browser contexts or website addresses may have separate storage. A local development preview will not automatically show the history from GitHub Pages.

Optional product-update signup sends the submitted email address to Formspree. GitHub Pages serves the website and receives website requests. See the app's [privacy page](https://alstsri.github.io/Marcy/privacy.html) and [support page](https://alstsri.github.io/Marcy/support.html) for further information.

## Local browser preview

From the repository root, serve only the website directory:

```sh
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs
```

Open http://127.0.0.1:8080. Python is only serving static files here; Flask and npm dependencies are not needed for this preview. Keep the port consistent if you want to retain the same development storage.

## Development and tests

Capacitor CLI 8 requires Node.js 22 or newer. A clean install, the test suite, and the iOS asset-copy step were verified with Node.js 24.19.0. The repository does not currently pin a Node version; check `node --version` before installing.

From the repository root:

```sh
npm ci
npm test
npm audit
```

`npm ci` installs the versions recorded in `package-lock.json`. Commit that lockfile when updating dependencies. Tests use Node's test runner and jsdom to check app behavior, backup handling, storage recovery, notifications, accessibility interactions, and offline caching.

Automated checks do not replace testing on an actual iPhone, including VoiceOver, offline startup, and native notification delivery.

## Native iOS development

`capacitor.config.json` points Capacitor at `docs/`. With dependencies installed, copy web changes into the existing iOS project using:

```sh
npx cap copy ios
```

When native dependencies or plugins change, use `npx cap sync ios`, then open the project with `npx cap open ios`. Building and signing require an appropriately configured Xcode installation. A full native build and device release have not been validated by the current automated checks.

Scheduled reminders use Capacitor's local-notifications plugin in the native app. The hosted browser prototype does not provide those native reminders.

## Project structure

```text
Marcy/
  docs/                    Current static browser app and policy/support pages
    index.html             App UI, styles, and logic
    sw.js                  Offline cache
    manifest.json          Home-screen app metadata
  scripts/                 Automated tests and development/screenshot helpers
  ios/                     Capacitor iOS project
  capacitor.config.json    Native app configuration; webDir is docs
  package.json             Dependencies and test command
  package-lock.json        Locked dependency versions
  app.py                   Legacy Flask app
  marcy.py                 Legacy Python CLI and cycle logic
  templates/               Legacy Flask UI
  static/                  Legacy Flask assets
```

## Legacy Python prototype

`app.py`, `marcy.py`, `templates/`, and `static/` belong to an earlier implementation. They are retained for reference, are not the GitHub Pages app, and do not share its browser history or recent fixes. Their Flask setup, desktop launcher, and launchd notification workflow are not the supported setup for this prototype. Do not use the old same-Wi-Fi/server instructions to deploy the current app.
