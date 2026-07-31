#!/usr/bin/env bash
#
# Turns the artist's originals in assets-source/ into web textures in src/assets/.
#
# The originals are 11811x11811 (300dpi, 1m square) with the artwork floating in a sea of
# transparency — 139 megapixels, which is both over WebGL's max texture size and ~558MB of
# VRAM per layer. So for each one we:
#
#   1. find the real bounding box of the non-transparent pixels (ffmpeg `bbox`)
#   2. crop to it, so position/scale in the app refer to the artwork, not to empty space
#   3. downscale so the long side is LONG_SIDE px
#   4. add PAD px of transparent border, so shader UV warping can pull pixels from just
#      outside the shape without smearing the edge row
#
# Re-run this after dropping a new PNG into assets-source/. Requires ffmpeg.

set -euo pipefail

LONG_SIDE=2048
PAD=8

cd "$(dirname "$0")/.."
mkdir -p src/assets

for src in assets-source/*.png; do
  name="$(basename "$src" .png)"

  # The reference composition is only used as a tracing ghost in edit mode: no alpha, and
  # it never needs to be sharp. Flatten it to a small JPEG instead.
  if [ "$name" = "reference-composition" ]; then
    ffmpeg -v error -y -i "$src" -vf "scale=600:-2" -q:v 4 "src/assets/$name.jpg"
    echo "reference-composition -> src/assets/$name.jpg  ($(du -h "src/assets/$name.jpg" | cut -f1))"
    continue
  fi

  box="$(ffmpeg -v info -i "$src" -vf "alphaextract,bbox=min_val=8" -frames:v 1 -f null - 2>&1 \
         | grep -o 'crop=[0-9:]*' | head -1)"
  if [ -z "$box" ]; then
    echo "!! $name: no opaque pixels found, skipping" >&2
    continue
  fi

  ffmpeg -v error -y -i "$src" -vf "\
${box},\
scale='if(gt(iw,ih),${LONG_SIDE},-2)':'if(gt(iw,ih),-2,${LONG_SIDE})':flags=lanczos,\
pad=iw+$((PAD*2)):ih+$((PAD*2)):${PAD}:${PAD}:color=0x00000000" \
    -pix_fmt rgba "src/assets/$name.png"

  dims="$(ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0:s=x "src/assets/$name.png")"
  echo "$name -> src/assets/$name.png  ${dims}  ($(du -h "src/assets/$name.png" | cut -f1))  from ${box}"
done
