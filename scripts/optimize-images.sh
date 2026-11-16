#!/bin/sh
set -eu
# Source artwork stays local; only these five web derivatives are published.
source_dir=${1:-artwork-source}
mkdir -p public/assets
for name in xian-clear xian-cleanplate xian-haze pagoda-facade-photo; do
  cwebp -quiet -q 82 -m 6 -metadata none "$source_dir/$name.jpg" -o "public/assets/$name.webp"
done
cwebp -quiet -lossless -m 6 -metadata none "$source_dir/pagoda-vehicle-mark.png" -o public/assets/pagoda-vehicle-mark.webp
