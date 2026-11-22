#!/bin/sh
# Regenera CVDiegoRozo.pdf a partir de cv-src/cv.html usando un navegador Chromium (Brave o Chrome).
# Uso: sh cv-src/build-cv.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/../CVDiegoRozo.pdf"
for B in "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
         "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
  [ -x "$B" ] && BROWSER="$B" && break
done
[ -n "$BROWSER" ] || { echo "No encontré Brave ni Chrome"; exit 1; }
"$BROWSER" --headless=new --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$OUT" "file://$DIR/cv.html"
echo "Generado: $OUT"
