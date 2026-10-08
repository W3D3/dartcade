#!/usr/bin/env bash
# Renders the PNG/ICO app icons in backend/frontend/public from the geometry of
# favicon.svg (32-unit grid: rings r=13 and r=7, stroke 2.2, bull r=2.4).
# Needs ImageMagick. Re-run after changing the logo.
set -euo pipefail
out="$(cd "$(dirname "$0")/../backend/frontend/public" && pwd)"
bg='#0f100e'
fg='#c6f24e'
ss=8 # supersampling factor

# render <size> <scale> <rounded 0|1> <file>
# scale shrinks the target around the centre (maskable icons keep it inside the safe zone).
render() {
  local size=$1 scale=$2 rounded=$3 file=$4
  local big=$((size * ss))
  local u c bgdraw
  u=$(echo "$big / 32 * $scale" | bc -l)
  c=$(echo "$big / 2" | bc -l)
  if [ "$rounded" = 1 ]; then
    local r
    r=$(echo "$big / 32 * 7" | bc -l)
    bgdraw="roundrectangle 0,0 $((big - 1)),$((big - 1)) $r,$r"
  else
    bgdraw="rectangle 0,0 $big,$big"
  fi
  local o1 o2 dot sw
  o1=$(echo "$c + 13 * $u" | bc -l)
  o2=$(echo "$c + 7 * $u" | bc -l)
  dot=$(echo "$c + 2.4 * $u" | bc -l)
  sw=$(echo "2.2 * $u" | bc -l)
  local bgcanvas=$bg
  [ "$rounded" = 1 ] && bgcanvas=none
  convert -size "${big}x${big}" "xc:$bgcanvas" \
    -fill "$bg" -draw "$bgdraw" \
    -fill none -stroke "$fg" -strokewidth "$sw" \
    -draw "circle $c,$c $o1,$c" -draw "circle $c,$c $o2,$c" \
    -stroke none -fill "$fg" -draw "circle $c,$c $dot,$c" \
    -resize "${size}x${size}" -strip "PNG32:$file"
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# iOS/iPadOS rounds the corners itself and shows transparency as black: full bleed.
render 180 1 0 "$out/apple-touch-icon.png"
# Web app manifest (Android, desktop installs).
render 192 1 0 "$out/icon-192.png"
render 512 1 0 "$out/icon-512.png"
render 512 0.75 0 "$out/icon-maskable-512.png"
# Legacy favicon.ico for browsers and tools that don't read the SVG.
for s in 16 32 48; do render "$s" 1 1 "$tmp/$s.png"; done
convert "$tmp/16.png" "$tmp/32.png" "$tmp/48.png" "$out/favicon.ico"
