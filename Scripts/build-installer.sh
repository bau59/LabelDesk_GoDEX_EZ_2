#!/bin/zsh
set -euo pipefail

ROOT="${0:A:h:h}"
BUILD_DIR="$ROOT/build"
APP="$BUILD_DIR/LabelDesk.app"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$ROOT/LabelDesk/Resources/Info.plist")"
DMG="$BUILD_DIR/LabelDesk-${VERSION}.dmg"
MACOS_DIR="$APP/Contents/MacOS"
SOURCE_FILES=("$ROOT/LabelDesk/App/LabelDeskApp.swift" "$ROOT/LabelDesk/App/WebLabelDeskBridge.swift" "$ROOT/LabelDesk/App/UpdateManager.swift")
MODULE_CACHE="$ROOT/.build/module-cache"
SWIFTC_OPTIONS=()

trap 'print -u2 "[LabelDesk] Failed at line $LINENO. Run again with LABELDESK_DEBUG=1 for the full command trace."' ERR

if [[ "${LABELDESK_DEBUG:-0}" == "1" ]]; then
  set -x
  SWIFTC_OPTIONS=(-v -driver-time-compilation)
fi

print "[LabelDesk] 1/5 Finding the macOS SDK…"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
print "[LabelDesk] Using SDK: $SDK_PATH"

if (( ${#SOURCE_FILES[@]} == 0 )); then
  print -u2 "No Swift sources found in $ROOT/LabelDesk"
  exit 1
fi

print "[LabelDesk] 2/5 Preparing build folder…"
rm -rf "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$MODULE_CACHE"

print "[LabelDesk] 3/5 Compiling minimal native WebKit bridge…"
START_TIME=$SECONDS
swiftc \
  "${SWIFTC_OPTIONS[@]}" \
  -target x86_64-apple-macosx15.0 \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE" \
  -parse-as-library \
  -framework SwiftUI \
  -framework AppKit \
  -framework WebKit \
  "${SOURCE_FILES[@]}" \
  -o "$MACOS_DIR/LabelDesk"
print "[LabelDesk] Compilation completed in $(( SECONDS - START_TIME )) seconds."

print "[LabelDesk] 4/5 Creating and signing the app bundle…"
mkdir -p "$APP/Contents/Resources"
cp "$ROOT/LabelDesk/Resources/Info.plist" "$APP/Contents/Info.plist"
cp "$ROOT/Scripts/install-update.sh" "$APP/Contents/Resources/install-update.sh"
for file in app.html app.js editor.html barcodes.js native.js text-engine.js food-presets.js raster.js; do

  cp "$ROOT/LabelDesk/Resources/$file" "$APP/Contents/Resources/$file"
done
cp "$ROOT/Scripts/printer.sh" "$APP/Contents/Resources/printer.sh"
cp "$ROOT/Scripts/printer-native.sh" "$APP/Contents/Resources/printer-native.sh"
cp "$ROOT/Scripts/printer-text.sh" "$APP/Contents/Resources/printer-text.sh"
codesign --force --deep --sign - "$APP"
print "[LabelDesk] 5/5 Creating the disk image…"
hdiutil create -volname LabelDesk -srcfolder "$APP" -ov -format UDZO "$DMG"

print "Created: $APP"
print "Created: $DMG"
