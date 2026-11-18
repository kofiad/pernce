#!/usr/bin/env bash
# Build a Release iOS app signed with a free (personal team) Apple ID and
# install it on a connected iPhone, without SideStore.
#
# SideStore installs apps as <bundle id>.<team id>, so to update a
# SideStore-installed copy in place (keeping its data) this signs with the
# same team and the same suffixed bundle ID. app.json is left untouched.
#
# Usage: TEAM_ID=JMM68997D7 pnpm run ios:device [<device udid>]
#        TEAM_ID=JMM68997D7 pnpm run ios:device:personal   (with sync; see app.config.ts)
# Prereq: the Apple ID is added in Xcode > Settings > Accounts.
set -euo pipefail

cd "$(dirname "$0")/.."

: "${TEAM_ID:?set TEAM_ID to the personal team ID (the suffix SideStore adds to bundle IDs)}"
# The resolved config, so APP_ID (shell or .env.local, app.config.ts) counts.
BASE_ID=$(pnpm exec expo config --json --type public | node -e 'let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => console.log(JSON.parse(s).ios.bundleIdentifier))')
NAME=$(node -p "require('./app.json').expo.name")  # prebuild's Xcode project and scheme
BUNDLE_ID="${BUNDLE_ID:-$BASE_ID.$TEAM_ID}"
DERIVED=ios/build/device

DEVICE="${1:-}"
if [ -z "$DEVICE" ]; then
  DEVICE=$(xcrun devicectl list devices 2>/dev/null \
    | awk '/(available|connected)/ && !/simulated/ { for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{16}$/) { print $i; exit } }')
fi
[ -n "$DEVICE" ] || { echo "No paired iPhone found; connect and unlock it, or pass its UDID." >&2; exit 1; }

echo "Bundle ID: $BUNDLE_ID  Team: $TEAM_ID  Device: $DEVICE  Variant: ${APP_VARIANT:-store}"

# Clean, because the two variants link different native modules
# (app.config.ts) and a leftover Podfile would keep the other's.
pnpm expo prebuild --platform ios --clean

xcodebuild \
  -workspace "ios/$NAME.xcworkspace" \
  -scheme "$NAME" \
  -configuration Release \
  -destination "id=$DEVICE" \
  -derivedDataPath "$DERIVED" \
  -allowProvisioningUpdates \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" \
  build

xcrun devicectl device install app --device "$DEVICE" \
  "$DERIVED/Build/Products/Release-iphoneos/$NAME.app"

echo "Installed. Free-account signing expires in 7 days; rerun to refresh."
