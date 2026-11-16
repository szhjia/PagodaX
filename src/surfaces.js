// Four corners in photograph pixels: top-left, top-right, bottom-right, bottom-left.
// A homography removes the source camera's perspective before the 3D camera adds its own.
export function surfaceProjection([a, b, c, d]) {
  const dx1 = b[0] - c[0], dx2 = d[0] - c[0], dx3 = a[0] - b[0] + c[0] - d[0];
  const dy1 = b[1] - c[1], dy2 = d[1] - c[1], dy3 = a[1] - b[1] + c[1] - d[1];
  const det = dx1 * dy2 - dx2 * dy1;
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return [((b[0] - a[0] + g * b[0]) * u + (d[0] - a[0] + h * d[0]) * v + a[0]) / w,
      ((b[1] - a[1] + g * b[1]) * u + (d[1] - a[1] + h * d[1]) * v + a[1]) / w];
  };
}

// Original photo pixel coordinates, kept explicit so no sky, parapet or foliage is sampled.
// The lowest three front storeys are occluded: reuse intact masonry from storeys 4–6.
export const FRONT_SURFACES = [
  [[432,616],[757,614],[761,683],[428,686]],
  [[454,501],[738,501],[747,561],[450,564]],
  [[478,390],[715,388],[725,454],[475,458]],
  [[432,616],[757,614],[761,683],[428,686]],
  [[454,501],[738,501],[747,561],[450,564]],
  [[478,390],[715,388],[725,454],[475,458]],
  [[499,301],[698,299],[708,354],[497,357]],
];
