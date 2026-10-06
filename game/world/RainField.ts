/**
 * Rain streaks that live around the camera. Positions wrap in the vertex
 * shader, so the CPU only updates three uniforms per frame.
 */
import * as THREE from "three";

const BOX = 36;
const HEIGHT = 22;

export class RainField {
  readonly mesh: THREE.LineSegments;
  private material: THREE.ShaderMaterial;

  constructor(count: number) {
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * BOX;
      const y = Math.random() * HEIGHT;
      const z = Math.random() * BOX;
      positions.set([x, y, z, x, y + 0.8, z], i * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uIntensity: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uCam;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y = mod(p.y - uTime * 16.0, ${HEIGHT.toFixed(1)});
          // Wrap the box so it always surrounds the camera.
          p.x = uCam.x + mod(p.x - uCam.x, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
          p.z = uCam.z + mod(p.z - uCam.z, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)};
          p.x += p.y * 0.04;
          vAlpha = smoothstep(0.0, 3.0, p.y);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uIntensity;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(0.82, 0.87, 0.94, 0.62 * uIntensity * vAlpha);
        }`,
    });
    this.mesh = new THREE.LineSegments(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  update(dt: number, camera: THREE.Camera, intensity: number) {
    this.material.uniforms.uTime!.value += dt;
    (this.material.uniforms.uCam!.value as THREE.Vector3).copy(camera.position);
    this.material.uniforms.uIntensity!.value = intensity;
    this.mesh.visible = intensity > 0.02;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
