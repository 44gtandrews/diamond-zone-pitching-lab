#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
OUT=".firebase-build"
FILES=(index.html firebase-config.js trackman-pdf.js importer.js cloud.js dz-logo.svg)
for file in "${FILES[@]}"; do
  if [ ! -f "$file" ]; then
    echo "Missing required app file: $file" >&2
    exit 1
  fi
done
rm -rf "$OUT"
mkdir -p "$OUT"
for file in "${FILES[@]}"; do
  cp "$file" "$OUT/$file"
done
echo "Ready: staged ${#FILES[@]} public app files in $OUT. No player data or repository files are included."
