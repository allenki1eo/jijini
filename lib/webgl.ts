/**
 * Can this browser draw the 3D world? Checked once with a throwaway canvas:
 * WebGL 2 first, then WebGL 1 (three.js runs on either). Old phones, some
 * locked-down browsers and GPUs on the blocklist have neither.
 */
let cached: boolean | null = null;

export const hasWebGL = (): boolean => {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    cached = Boolean(gl);
    // Let the context go straight away rather than waiting for the GC.
    (gl as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
};

/** Does this error look like the 3D context failing (rather than a bug in the game)? */
export const isWebGLError = (error: unknown) => /webgl|webglrenderer|context lost|creating webgl context|gl context/i.test(String((error as Error)?.message ?? error));
