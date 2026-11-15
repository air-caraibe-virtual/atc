#!/bin/bash
# Construit ATC pour Windows : application, icône et version dans l'exe, puis installateur.
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
NUMVER=${VERSION%%-*}
rm -rf dist
npx electron-builder --win dir --x64
export WINEDEBUG=-all
wine "$HOME/.cache/electron-builder/winCodeSign/winCodeSign-2.6.0/rcedit-x64.exe" dist/win-unpacked/ATC.exe \
  --set-version-string FileDescription "ATC - controle aerien pour Microsoft Flight Simulator 2024" \
  --set-version-string ProductName ATC --set-version-string CompanyName ATC \
  --set-version-string LegalCopyright "(c) 2026 ATC" --set-version-string InternalName ATC \
  --set-version-string OriginalFilename ATC.exe \
  --set-file-version "$NUMVER" --set-product-version "$VERSION" --set-icon build/icon.ico
(cd installer && makensis -V2 -DVERSION="$VERSION" -DNUMVER="$NUMVER" atc-solo.nsi)
ls -la dist/*.exe
