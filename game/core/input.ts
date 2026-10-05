/**
 * Shared analog input written by on-screen controls and read by the frame
 * loop. Mutable on purpose: touch handlers and useFrame never re-render React.
 */
export const analogInput = {
  /** Left stick, x right / y up, each in [-1, 1]. */
  move: { x: 0, y: 0 },
};
