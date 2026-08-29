// Runs automatically on every `npm install` / `yarn install` (via the
// "postinstall" script in package.json) — including the install step
// EAS Build and `expo prebuild`/`expo run:android` both perform before
// bundling. If anything upstream has reverted "main" back to
// "expo-router/entry" (or removed it), this puts it back to "./index.js"
// before the JS bundle is ever built, so the headless task registration
// in index.js can't silently get skipped.
//
// Idempotent: if "main" is already correct, this is a no-op.

const fs = require('fs');
const path = require('path');

const REQUIRED_MAIN = './index.js';
const pkgPath = path.join(__dirname, '..', 'package.json');

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (pkg.main !== REQUIRED_MAIN) {
  console.warn(
    `[ensure-entry-point] package.json "main" was "${pkg.main}" — ` +
      `resetting to "${REQUIRED_MAIN}" so the SchedulerCheckTask headless ` +
      `registration in index.js isn't bypassed.`
  );
  pkg.main = REQUIRED_MAIN;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
} else {
  console.log('[ensure-entry-point] package.json "main" already correct.');
}
