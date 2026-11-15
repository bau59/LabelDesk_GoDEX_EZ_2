#!/bin/zsh
set -euo pipefail
ROOT="${0:A:h:h}"
APP="$ROOT/build/LabelDesk.app"
TESTDIR="$(/usr/bin/mktemp -d)"
trap '/bin/rm -rf "$TESTDIR"' EXIT
/bin/mkdir -p "$TESTDIR/current" "$TESTDIR/new" "$TESTDIR/workspace-good" "$TESTDIR/workspace-bad"
/usr/bin/ditto "$APP" "$TESTDIR/current/LabelDesk.app"
/usr/bin/ditto "$APP" "$TESTDIR/new/LabelDesk.app"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString 0.8.2" "$TESTDIR/current/LabelDesk.app/Contents/Info.plist"
/usr/bin/codesign --force --deep --sign - "$TESTDIR/current/LabelDesk.app"
export LABELDESK_UPDATE_SKIP_LAUNCH=1
/bin/zsh "$ROOT/Scripts/install-update.sh" 99999999 \
  "$TESTDIR/current/LabelDesk.app" \
  "$TESTDIR/new/LabelDesk.app" \
  "$TESTDIR/workspace-good"
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$TESTDIR/current/LabelDesk.app/Contents/Info.plist")"
[[ "$VERSION" == "0.9.0" ]] || { print -u2 "Update failed to replace old version"; exit 1; }
/usr/bin/codesign --verify --deep --strict "$TESTDIR/current/LabelDesk.app"
# A damaged signed bundle must never overwrite the installed app.
/bin/mkdir -p "$TESTDIR/broken"
/usr/bin/ditto "$APP" "$TESTDIR/broken/LabelDesk.app"
print "corrupt" >> "$TESTDIR/broken/LabelDesk.app/Contents/Info.plist"
if /bin/zsh "$ROOT/Scripts/install-update.sh" 99999999 \
  "$TESTDIR/current/LabelDesk.app" \
  "$TESTDIR/broken/LabelDesk.app" \
  "$TESTDIR/workspace-bad"; then
  print -u2 "Invalid signature was accepted!"
  exit 1
fi
VERSION="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$TESTDIR/current/LabelDesk.app/Contents/Info.plist")"
[[ "$VERSION" == "0.9.0" ]] || { print -u2 "Original app was lost"; exit 1; }
print "Detached updater passed replacement and invalid-signature rollback tests."
