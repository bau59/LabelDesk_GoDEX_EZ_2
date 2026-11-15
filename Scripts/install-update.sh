#!/bin/zsh
# Runs outside LabelDesk.app to replace the closed, installed application.
# Args: old process ID, target bundle path, validated extracted bundle, workspace.
set -euo pipefail
if (( $# != 4 )); then print -u2 "Expected four arguments"; exit 2; fi
OLD_PID="$1"
TARGET="$2"
SOURCE="$3"
WORKSPACE="$4"
LOGDIR="$HOME/Library/Logs/LabelDesk"
/bin/mkdir -p "$LOGDIR"
exec >> "$LOGDIR/updater.log" 2>&1
print "Update started: $(/bin/date); target: $TARGET"

if [[ "$TARGET" != */LabelDesk.app || ! -d "$TARGET" || ! -d "$SOURCE" ]]; then
  print "Invalid app paths"; exit 3
fi
if [[ ! "$OLD_PID" =~ '^[0-9]+$' ]]; then print "Invalid PID"; exit 3; fi

integer tries=0
while /bin/kill -0 "$OLD_PID" 2>/dev/null; do
  if (( tries >= 120 )); then print "Old app did not exit"; exit 4; fi
  /bin/sleep 0.25
  (( tries += 1 ))
done

PARENT="${TARGET:h}"
SUFFIX="${WORKSPACE:t}"
STAGED="$PARENT/.LabelDesk-new-$SUFFIX.app"
BACKUP="$PARENT/.LabelDesk-backup-$SUFFIX.app"
if [[ -e "$STAGED" || -e "$BACKUP" ]]; then print "Staging path already exists"; exit 5; fi

cleanup() {
  if [[ -d "$WORKSPACE" ]]; then /bin/rm -rf "$WORKSPACE"; fi
}
trap cleanup EXIT

# Stage on the same filesystem, and keep original until staged copy verifies.
if ! /usr/bin/ditto "$SOURCE" "$STAGED"; then
  print "Could not stage new app"
  /bin/rm -rf "$STAGED"; exit 6
fi
if ! /usr/bin/codesign --verify --deep --strict "$STAGED"; then
  print "Staged bundle signature failed"
  /bin/rm -rf "$STAGED"; exit 7
fi
if ! /bin/mv "$TARGET" "$BACKUP"; then
  print "Cannot move old app"
  /bin/rm -rf "$STAGED"; exit 8
fi
if ! /bin/mv "$STAGED" "$TARGET"; then
  print "Cannot install; restoring original"
  /bin/mv "$BACKUP" "$TARGET" || print "RESTORE FAILED; original at $BACKUP"
  /bin/rm -rf "$STAGED"; exit 9
fi

if ! /usr/bin/codesign --verify --deep --strict "$TARGET"; then
  print "Installed app invalid; restoring original"
  /bin/rm -rf "$TARGET"
  /bin/mv "$BACKUP" "$TARGET"; exit 10
fi

# Allow CI to verify replacement without launching a GUI app on a runner.
if [[ "${LABELDESK_UPDATE_SKIP_LAUNCH:-0}" != "1" ]]; then
  if ! /usr/bin/open "$TARGET"; then
    print "Could not relaunch; restoring original"
    /bin/mv "$TARGET" "$STAGED"
    /bin/mv "$BACKUP" "$TARGET"
    /bin/rm -rf "$STAGED"
    /usr/bin/open "$TARGET" || true
    exit 11
  fi
fi

/bin/rm -rf "$BACKUP"
print "Update completed: $(/bin/date)"
