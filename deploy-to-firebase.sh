#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
bash prepare-firebase-hosting.sh
if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI not found. In Google Cloud Shell it is preinstalled. On your Mac: npm install -g firebase-tools" >&2
  exit 1
fi
# Deploy the website AND its Firestore rules together.
# New-player uploads reserve six-digit IDs in playerCodes; stale rules deny those writes.
firebase deploy --only hosting,firestore:rules --project diamond-zone-pitching-lab
