# Image sources and attribution

[English README](../../README.md) · [中文说明](../../README.zh-CN.md)

## Runtime artwork

| Published asset | Source and authorship | Processing |
| --- | --- | --- |
| `public/assets/xian-clear.webp` | Original Xi’an photograph supplied by the project creator | Resized to 2040 × 1536; WebP quality 82, metadata removed |
| `public/assets/xian-haze.webp` | Image-generation edit of that photograph, using a separate supplied haze photograph as an atmospheric reference | WebP quality 82; registered against fixed buildings at display and shader sampling time |
| `public/assets/xian-cleanplate.webp` | Image-generation edit of the clear photograph, removing only the original pagoda | WebP quality 82; only the local tower region is composited into the scene |
| `public/assets/pagoda-facade-photo.webp` | O.Mustafin, [Big Wild Goose Pagoda 1.jpg](https://commons.wikimedia.org/wiki/File:Big_Wild_Goose_Pagoda_1.jpg), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1050 × 1400 WebP derivative; individual walls and cornices are perspective-corrected at runtime |
| `public/assets/pagoda-vehicle-mark.webp` | Generated monochrome project artwork | Lossless WebP with transparency preserved |

The seven-stage tower uses independent 3D geometry. Its shape does not come from cutting a flat pagoda out of the city photograph. Where the lower facade is occluded, visible upper masonry supplies the surface; the side repeats rectified masonry with exposure matched to the photographed shade. This is a visual reconstruction rather than a photogrammetric survey.

Haze, generated repairs, and future flight trajectories are artistic constructions, not measurements. High-resolution originals and unused reference images remain local and are not distributed in the website or public repository.

## Additional reconstruction references

- O.Mustafin, [Big Wild Goose Pagoda 2.JPG](https://commons.wikimedia.org/wiki/File:Big_Wild_Goose_Pagoda_2.JPG), CC0 1.0: complete side profile, lower structure and cornices, used in earlier reconstruction research.
- Alex Kwok, [Giant Wild Goose Pagoda.jpg](https://commons.wikimedia.org/wiki/File:Giant_Wild_Goose_Pagoda.jpg): reviewed for camera angle, not used in runtime textures.
- Alexey Komarov, [Giant Wild Goose Pagoda, Xi’an, May, 2018-1.jpg](https://commons.wikimedia.org/wiki/File:Giant_Wild_Goose_Pagoda,_Xi%27an,_May,_2018-1.jpg), CC BY-SA 4.0: reviewed for masonry, not used in runtime textures.
- Kgbkgbkgb, [Giant Wild Goose pagoda.jpg](https://commons.wikimedia.org/wiki/File:Giant_Wild_Goose_pagoda.jpg), CC BY-SA 3.0: reviewed for lower geometry, not used in runtime textures.

Third-party material remains subject to its own license. Project photography and generated artwork are not automatically covered by the licenses of the software dependencies.
