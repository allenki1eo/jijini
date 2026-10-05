/**
 * Render statistics written from inside the frame loop and polled by the
 * HUD at a low rate. A plain mutable object: no allocations, no re-renders.
 */
export const renderStats = {
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  x: 0,
  z: 0,
  heading: 0,
};
