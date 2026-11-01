#!/bin/sh
# Compress .glb models for the web, keeping every part name.
# Usage: tools/compress-models.sh <source folder> <output folder>
#   e.g. tools/compress-models.sh ~/Downloads/asset-pack/assets/models assets/models
# Needs Node. Uses gltf-transform (downloaded by npx on first run).
# Steps: drop repeated animation keys, convert textures to WebP, compress meshes.
# It does not merge or rename anything, because the game finds parts by name.
set -e
SRC="$1"; OUT="$2"
if [ -z "$SRC" ] || [ -z "$OUT" ]; then echo "usage: $0 <source folder> <output folder>"; exit 1; fi
TMP=$(mktemp -d)
GT="npx --yes @gltf-transform/cli@4.1.1"
cd "$SRC"
find . -name '*.glb' | while read -r f; do
  mkdir -p "$OUT/$(dirname "$f")"
  b=$(basename "$f" .glb)
  $GT resample "$f" "$TMP/$b.1.glb" >/dev/null
  $GT webp "$TMP/$b.1.glb" "$TMP/$b.2.glb" --quality 85 >/dev/null
  $GT meshopt "$TMP/$b.2.glb" "$OUT/$f" --level medium >/dev/null
  echo "compressed $f"
done
rm -rf "$TMP"
