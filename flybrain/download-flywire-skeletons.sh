#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-flybrain/sk_lod1_783_healed_ds2.parquet}"
URL="https://zenodo.org/records/10877326/files/sk_lod1_783_healed_ds2.parquet?download=1"
EXPECTED_MD5="a4c104776f33ec539ef859064c4de3df"

mkdir -p "$(dirname "$OUT")"
echo "Downloading the FlyWire v783 whole-brain neuron skeleton dataset."
echo "This file is approximately 5.4 GB."
curl -fL --retry 3 --retry-delay 2 -C - "$URL" -o "$OUT"
echo "$EXPECTED_MD5  $OUT" | md5sum --check
echo "Verified: $OUT"
