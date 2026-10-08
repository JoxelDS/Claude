#!/usr/bin/env bash
# Runs in the Higgsfield sandbox (Instagram's CDN is reachable there, not from the build container).
#   bash igbatch.sh <commit> <media file path in the repo> [keep-alive seconds]
# The media file has one line per candidate photo: "SLUG KEY TYPE LIKES URL" (KEY LOGO = profile picture),
# written by the daily run from the brand pulls. For every SLUG it runs tools/ds/igauto.py, which keeps the
# 3 best photos (720×900) + the logo (320×320) in ~/ig/o/ and prints "FILE <name> <bytes>" + the logo palette.
# Then it stays alive so the files can be fetched 4 at a time with sandbox_exec image_paths — the sandbox lease of a
# background job is 15 minutes in all, so fetch right after DONE (run with PICKS=… to apply hand picks in the same job).
set -u
C=${1:?commit}; M=${2:?media file}; KEEP=${3:-840}
RAW=https://raw.githubusercontent.com/joxelds/Claude/$C
rm -rf ~/ig && mkdir -p ~/ig/o && cd ~/ig || exit 1
python3 -c "import rapidocr_onnxruntime" 2>/dev/null || python3 -m pip install -q rapidocr_onnxruntime
curl -sfL -o igauto.py "$RAW/tools/ds/igauto.py" && curl -sfL -o media.txt "$RAW/$M" || { echo "download failed"; exit 1; }
for s in $(awk '{print $1}' media.txt | awk '!seen[$0]++'); do
  mkdir -p "w_$s" && cd "w_$s"
  awk -v s="$s" '$1 == s { $1 = ""; sub(/^ /, ""); print }' ../media.txt > u.txt
  echo "=== $s"
  S="$s" timeout 300 python3 ../igauto.py 2>&1 | grep -v '^FILE' | sed 's/^/  /'
  # PICKS="slug:6,11,15 slug2:3 slug3:" = numbers chosen on the review sheets (o/<slug>-sheet.jpg); empty = no own photos
  if [ -n "${PICKS:-}" ] && echo " $PICKS " | grep -q " $s:"; then
    pk=$(echo " $PICKS " | tr ' ' '\n' | awk -F: -v s="$s" '$1 == s { print $2 }')
    PICK="$pk" S="$s" python3 ../igauto.py --final > /dev/null 2>&1
    rm -f "../o/$s-"[0-9].jpg; echo "  FINAL $pk"
  fi
  cp o/* ../o/ 2>/dev/null
  cd ..
done
curl -sfL -o igpack.py "$RAW/tools/ds/igpack.py" && python3 igpack.py o packs
echo "=== FILES"
for f in o/*; do echo "FILE $(basename "$f") $(stat -c %s "$f")"; done
echo DONE
sleep "$KEEP"
