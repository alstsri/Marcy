# Removed screenshot-mode code (reference)

This was stripped out of `docs/index.html` on 2026-09-08 because the screenshots
were already captured (see `screenshots/`) and this code was shipping inside the
real iOS app bundle for no reason — `docs/` is Capacitor's `webDir`, so anything
in it gets copied into the app on `cap sync`.

It was never committed to git before removal, so it doesn't exist in any prior
commit. If a future round of screenshots needs the same rig, reapply the pieces
below to `docs/index.html`, run the capture, then strip them again before
archiving for the App Store.

## 1. CSS — screenshot-mode / ipad-shot sizing

Sat right after the `body::before` safe-area spacer, before `.app`:

```css
body.screenshot-mode::before {
  height: max(env(safe-area-inset-top), 59px);
}

body.screenshot-mode .app {
  padding-bottom: 280px;
}

body.screenshot-mode.ipad-shot::before {
  height: max(env(safe-area-inset-top), 24px);
}

body.screenshot-mode.ipad-shot .app {
  min-height: calc(100vh + 600px);
}
```

## 2. JS — forcing a specific today's-read variant

Let a screenshot script pick an exact insight/connect message via `?insight=N`
and `?connect=N` instead of the normal day-based rotation. Replaces the plain
`pickVariant` calls in `todayButton()`:

```js
function pickTodayVariant(arr, cycleDay, queryKey) {
  const requestedIndex = Number.parseInt(new URLSearchParams(window.location.search).get(queryKey), 10);
  if (Number.isInteger(requestedIndex) && requestedIndex >= 0 && requestedIndex < arr.length) {
    return arr[requestedIndex];
  }
  return pickVariant(arr, cycleDay);
}

function todayButton(status) {
  const key = getPhaseKey(status);
  const content = todayContent[key];
  const insight = pickTodayVariant(content.insights, status.cycle_day, 'insight');
  const connect = pickTodayVariant(content.connect, status.cycle_day, 'connect');
  // ...rest unchanged
```

## 3. JS — entering/configuring screenshot mode

Sat right before the PWA service-worker registration:

```js
// Screenshot/debug helpers via query params
const urlParams = new URLSearchParams(window.location.search);
const screenshotMode = urlParams.get('screenshot') === '1';
if (window.Capacitor) document.body.classList.add('native-app');
if (screenshotMode) document.body.classList.add('screenshot-mode');
if (urlParams.get('ipad') === '1') document.body.classList.add('ipad-shot');

// PWA
if ('serviceWorker' in navigator && !screenshotMode) {
  navigator.serviceWorker.register('sw.js');
}
```

Note: `if (window.Capacitor) document.body.classList.add('native-app');` was
KEPT in production — it's not screenshot-only, it drives the real safe-area/iPad
layout fix. Only the `screenshotMode`/`ipad-shot` lines and the `urlParams`
declaration were removed.

## 4. JS — jumping straight to a UI state, and skipping notification permission prompts

Sat right before `scheduleNotifications(); render();` at the end of the script:

```js
if (urlParams.get('autoopen') === 'today') todayCardOpen = true;
if (urlParams.get('autoview') === 'manage') currentView = 'manage';

if (!screenshotMode) scheduleNotifications();
render();
```

`!screenshotMode` on `scheduleNotifications()` avoided triggering the native
notification-permission dialog while a screenshot script was driving the
simulator.

## 5. JS — scrolling to a specific position after render

Sat at the very end, after `render()`:

```js
const screenshotScroll = urlParams.get('scroll');
if (screenshotMode && screenshotScroll !== null) {
  const scrollY = Number.parseInt(screenshotScroll, 10);
  if (Number.isFinite(scrollY)) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, scrollY)));
    setTimeout(() => window.scrollTo(0, scrollY), 250);
  }
}
```

## Query params this enabled

| Param | Effect |
|---|---|
| `?screenshot=1` | Enables screenshot mode (padding/sizing tweaks, skips SW registration and notification prompt) |
| `?ipad=1` | Adds iPad-specific sizing on top of screenshot mode |
| `?autoopen=today` | Auto-expands the today's-read card |
| `?autoview=manage` | Auto-switches to the data/manage view |
| `?insight=N` / `?connect=N` | Forces a specific message variant by index instead of the day-based rotation |
| `?scroll=N` | Scrolls to a fixed Y position after render |
