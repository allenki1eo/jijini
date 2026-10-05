/**
 * World materials. All use Lambert lighting (cheap, per-fragment) with
 * small shader patches for vertex colors stored as sRGB bytes, ground grain,
 * procedural facades, water shimmer and tree sway.
 */
import * as THREE from "three";
import { WATER_COLOR } from "./palette";

export interface WorldMaterials {
  ground: THREE.MeshLambertMaterial;
  buildings: THREE.MeshLambertMaterial;
  water: THREE.MeshLambertMaterial;
  trees: THREE.MeshLambertMaterial;
  /** Shared clock uniform; advance it once per frame. */
  time: { value: number };
  dispose: () => void;
}

/** Vertex colors are authored as sRGB bytes; decode them to linear for lighting. */
const SRGB_VERTEX_COLOR = /* glsl */ `
#ifdef USE_COLOR
  diffuseColor.rgb *= pow(vColor.rgb, vec3(2.2));
#endif
`;

const NOISE = /* glsl */ `
float bgHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float bgNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bgHash(i), bgHash(i + vec2(1.0, 0.0)), u.x), mix(bgHash(i + vec2(0.0, 1.0)), bgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const withWorldXZ = (shader: THREE.WebGLProgramParametersWithUniforms) => {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vWorldXZ;")
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;",
    );
  shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec2 vWorldXZ;\n${NOISE}`);
};

const createGround = () => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    withWorldXZ(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `${SRGB_VERTEX_COLOR}
      float grain = bgNoise(vWorldXZ * 0.08) * 0.45 + bgNoise(vWorldXZ * 0.6) * 0.35 + bgNoise(vWorldXZ * 3.1) * 0.2;
      diffuseColor.rgb *= 0.86 + 0.26 * grain;`,
    );
  };
  m.customProgramCacheKey = () => "bodago-ground";
  return m;
};

const createBuildings = () => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 facade;\nvarying vec3 vFacade;\nvarying float vDist;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFacade = facade;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvDist = -mvPosition.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFacade;\nvarying float vDist;")
      .replace(
        "#include <color_fragment>",
        `${SRGB_VERTEX_COLOR}
        if (vFacade.y >= 0.0) {
          float h = vFacade.y;
          float u = vFacade.x;
          float detail = 1.0 - smoothstep(110.0, 220.0, vDist);
          float floorY = mod(h, 3.2);
          float level = floor(h / 3.2);
          // Red-dust splash plinth and contact shadow at street level.
          float plinth = 1.0 - step(0.42, h);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.6, 0.5), plinth);
          diffuseColor.rgb *= 0.74 + 0.26 * smoothstep(0.0, 1.8, h);
          if (vFacade.z >= 1.0 && level < 1.0) {
            // Shopfront: ribbed roller shutters under a painted sign band.
            float bay = mod(u, 3.6);
            float door = step(0.3, bay) * step(bay, 3.3) * step(0.42, floorY) * step(floorY, 2.4);
            float rib = 0.86 + 0.14 * step(0.5, fract(floorY * 7.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.15, 0.17) * rib, door * detail);
            float signBand = step(2.5, floorY) * step(floorY, 3.08);
            float pick = floor(fract(vFacade.z) * 5.0);
            vec3 signColor = pick < 1.0 ? vec3(0.85, 0.12, 0.1) : pick < 2.0 ? vec3(0.0, 0.32, 0.62)
              : pick < 3.0 ? vec3(1.0, 0.6, 0.0) : pick < 4.0 ? vec3(0.0, 0.3, 0.16) : vec3(0.55, 0.05, 0.3);
            diffuseColor.rgb = mix(diffuseColor.rgb, signColor, signBand);
          } else if (h > 0.42) {
            float cell = mod(u, 3.0);
            float frame = step(0.82, floorY) * step(floorY, 2.24) * step(0.82, cell) * step(cell, 2.18);
            float glass = step(0.92, floorY) * step(floorY, 2.14) * step(0.92, cell) * step(cell, 2.08);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12, frame * detail);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.09), glass * detail);
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => "bodago-buildings";
  return m;
};

const createWater = (time: { value: number }) => {
  const m = new THREE.MeshLambertMaterial({ color: WATER_COLOR });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    withWorldXZ(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float wave = bgNoise(vWorldXZ * 0.35 + vec2(uTime * 0.25, uTime * 0.18)) * bgNoise(vWorldXZ * 0.9 - vec2(uTime * 0.3, 0.0));
        diffuseColor.rgb *= 0.82 + 0.3 * wave;
        diffuseColor.rgb += smoothstep(0.42, 0.6, wave) * 0.18;`,
      );
  };
  m.customProgramCacheKey = () => "bodago-water";
  return m;
};

const createTrees = (time: { value: number }) => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float phase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
        float sway = sin(uTime * 1.4 + phase) * 0.035 * max(position.y - 1.6, 0.0);
        transformed.x += sway;
        transformed.z += sway * 0.6;
      #endif`,
    );
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", SRGB_VERTEX_COLOR);
  };
  m.customProgramCacheKey = () => "bodago-trees";
  return m;
};

export const createWorldMaterials = (): WorldMaterials => {
  const time = { value: 0 };
  const materials = {
    ground: createGround(),
    buildings: createBuildings(),
    water: createWater(time),
    trees: createTrees(time),
  };
  return {
    ...materials,
    time,
    dispose: () => Object.values(materials).forEach((m) => m.dispose()),
  };
};
