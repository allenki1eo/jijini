/**
 * World materials. All use Lambert lighting (cheap, per-fragment) with
 * small shader patches for vertex colors stored as sRGB bytes, ground grain,
 * procedural facades, water shimmer and tree sway.
 */
import * as THREE from "three";
import { envUniforms } from "@/game/systems/environment";
import { WATER_COLOR } from "./palette";

export interface WorldMaterials {
  ground: THREE.MeshLambertMaterial;
  buildings: THREE.MeshLambertMaterial;
  water: THREE.MeshLambertMaterial;
  trees: THREE.MeshLambertMaterial;
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
    shader.uniforms.uWet = envUniforms.uWet;
    withWorldXZ(shader);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uWet;").replace(
      "#include <color_fragment>",
      `${SRGB_VERTEX_COLOR}
      float grain = bgNoise(vWorldXZ * 0.08) * 0.45 + bgNoise(vWorldXZ * 0.6) * 0.35 + bgNoise(vWorldXZ * 3.1) * 0.2;
      diffuseColor.rgb *= 0.86 + 0.26 * grain;
      // Rain darkens everything and leaves puddles in the low spots.
      float puddle = smoothstep(0.55, 0.7, bgNoise(vWorldXZ * 0.21)) * uWet;
      diffuseColor.rgb *= 1.0 - uWet * 0.32;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.19, 0.24), puddle * 0.7);`,
    );
  };
  m.customProgramCacheKey = () => "bodago-ground";
  return m;
};

const createBuildings = () => {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = envUniforms.uNight;
    withWorldXZ(shader);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 facade;\nvarying vec3 vFacade;\nvarying float vDist;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFacade = facade;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvDist = -mvPosition.z;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFacade;\nvarying float vDist;\nuniform float uNight;\nvec3 bgGlow = vec3(0.0);")
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += bgGlow;",
      )
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
            bgGlow += signColor * signBand * uNight * 0.55;
            // Some shops stay open late with warm light spilling from the doorway.
            bgGlow += vec3(1.0, 0.72, 0.38) * door * uNight * step(0.55, bgHash(floor(vWorldXZ / 3.6))) * 0.7;
          } else if (h > 0.42) {
            float cell = mod(u, 3.0);
            float frame = step(0.82, floorY) * step(floorY, 2.24) * step(0.82, cell) * step(cell, 2.18);
            float glass = step(0.92, floorY) * step(floorY, 2.14) * step(0.92, cell) * step(cell, 2.08);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.12, frame * detail);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.09), glass * detail);
            float lit = step(0.58, bgHash(floor(vWorldXZ / 3.0) + level * 7.13));
            bgGlow += vec3(1.0, 0.78, 0.45) * glass * lit * uNight * 0.9;
          }
        }`,
      );
  };
  m.customProgramCacheKey = () => "bodago-buildings";
  return m;
};

const createWater = () => {
  const m = new THREE.MeshLambertMaterial({ color: WATER_COLOR });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = envUniforms.uTime;
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

const createTrees = () => {
  // A touch of emissive keeps the canopy's underside from going black.
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: "#14240E" });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = envUniforms.uTime;
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
  const materials = {
    ground: createGround(),
    buildings: createBuildings(),
    water: createWater(),
    trees: createTrees(),
  };
  return {
    ...materials,
    dispose: () => Object.values(materials).forEach((m) => m.dispose()),
  };
};
