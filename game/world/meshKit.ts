/**
 * Helpers for low-poly instanced models (vehicles, people, props).
 *
 * Every part carries two per-vertex flags:
 *  - tint: 1 = takes the per-instance color (car paint, shirts), 0 = keeps its own (glass, tyres, skin)
 *  - glow: 1 = lights up at night (headlights, lamps, windows)
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { envUniforms } from "@/game/systems/environment";

const SRGB = /* glsl */ `
#ifdef USE_COLOR
  diffuseColor.rgb *= pow(vColor.rgb, vec3(2.2));
#endif
`;

export const part = (geometry: THREE.BufferGeometry, hex: string, opts: { tint?: boolean; glow?: boolean } = {}) => {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute("uv");
  const n = g.attributes.position!.count;
  // Stored as sRGB (decoded in the shader) to match the world's vertex colors.
  const c = new THREE.Color(hex);
  const srgb = [c.r, c.g, c.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set(srgb, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  g.setAttribute("tint", new THREE.BufferAttribute(new Float32Array(n).fill(opts.tint ? 1 : 0), 1));
  g.setAttribute("glow", new THREE.BufferAttribute(new Float32Array(n).fill(opts.glow ? 1 : 0), 1));
  return g;
};

export const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
};

/** Box helper positioned by its center. */
export const block = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

export const createInstancedMaterial = (opts: { doubleSide?: boolean; glowStrength?: number } = {}) => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  const strength = (opts.glowStrength ?? 2.2).toFixed(2);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = envUniforms.uNight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float tint;\nattribute float glow;\nvarying float vGlow;")
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        #ifdef USE_INSTANCING_COLOR
          if (tint < 0.5) vColor.rgb = color;
        #endif
        vGlow = glow;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nvarying float vGlow;")
      .replace("#include <color_fragment>", SRGB)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * (0.25 + uNight * ${strength});`);
  };
  m.customProgramCacheKey = () => `bodago-instanced-${opts.doubleSide ? 1 : 0}-${strength}`;
  return m;
};

/** Write an sRGB hex into an InstancedMesh color slot (the shader decodes sRGB). */
const tmp = new THREE.Color();
export const setInstanceHex = (mesh: THREE.InstancedMesh, index: number, hex: string) => {
  tmp.set(hex);
  tmp.setRGB(...([tmp.r, tmp.g, tmp.b].map((v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)) as [number, number, number]));
  mesh.setColorAt(index, tmp);
};
