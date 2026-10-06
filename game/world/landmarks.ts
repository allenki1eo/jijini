/**
 * Hand-built (procedural) landmark models placed from lat/lon in the city
 * config, so each city feels like home: Shinyanga's Nguzo Nane and Kambarage
 * Stadium, Arusha's Clock Tower and the Arusha Declaration torch, Mwanza's
 * Bismarck Rock and clock tower, Kariakoo market's umbrella roofs and the
 * Yanga and Simba spots, plus the kijiwe (boda stand) where every ride
 * starts. Each also returns wall segments for collisions.
 *
 * Curb-placed models face the road along local −z.
 */
import * as THREE from "three";
import { block, createInstancedMaterial, merge, part } from "./meshKit";

export interface LandmarkBuild {
  object: THREE.Object3D;
  /** Collision walls, flat [x1, z1, x2, z2, ...] in local space. */
  walls: number[];
}

const square = (half: number) => [-half, -half, half, -half, half, -half, half, half, half, half, -half, half, -half, half, -half, -half];
const circle = (r: number, n = 10) => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = ((i + 1) / n) * Math.PI * 2;
    out.push(Math.cos(a) * r, Math.sin(a) * r, Math.cos(b) * r, Math.sin(b) * r);
  }
  return out;
};

const clockFace = (y: number) => {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const rot = (i * Math.PI) / 2;
    parts.push(part(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 20).rotateX(Math.PI / 2).translate(0, y, 1.62).rotateY(rot), "#FFFDF2", { glow: true }));
    parts.push(part(block(0.08, 0.7, 0.06, 0, y + 0.3, 1.68).rotateY(rot), "#10131A"));
    parts.push(part(block(0.5, 0.08, 0.06, 0.22, y, 1.68).rotateY(rot), "#10131A"));
  }
  return parts;
};

/** A painted sign board: big title, small subtitle, drawn on a canvas. */
const textSign = (w: number, h: number, title: string, sub: string, bg: string, fg: string, stripe?: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = Math.round((512 * h) / w);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (stripe) {
    ctx.fillStyle = stripe;
    ctx.fillRect(0, canvas.height - 14, canvas.width, 14);
    ctx.fillRect(0, 0, canvas.width, 8);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = canvas.height * 0.42;
  ctx.font = `800 ${size}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
  while (ctx.measureText(title).width > canvas.width * 0.92 && size > 12) ctx.font = `800 ${(size -= 2)}px "Baloo 2 Variable", "Baloo 2", system-ui, sans-serif`;
  ctx.fillText(title, canvas.width / 2, canvas.height * (sub ? 0.42 : 0.5));
  if (sub) {
    ctx.font = `600 ${canvas.height * 0.17}px "Inter Variable", Inter, system-ui, sans-serif`;
    ctx.fillText(sub, canvas.width / 2, canvas.height * 0.78);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
};

const clockTower = (shaft: string, band: string, roof: string) => ({
  object: new THREE.Mesh(
    merge([
      part(new THREE.CylinderGeometry(4.5, 4.8, 0.5, 24).translate(0, 0.25, 0), "#C9C2B2"),
      part(block(3.6, 1.2, 3.6, 0, 1.1, 0), "#F2EDE3"),
      part(block(3.0, 9, 3.0, 0, 6.2, 0), shaft),
      part(block(3.3, 0.35, 3.3, 0, 10.8, 0), band),
      part(block(3.2, 2.2, 3.2, 0, 12.1, 0), shaft),
      ...clockFace(12.1),
      part(new THREE.ConeGeometry(2.5, 2.6, 4).rotateY(Math.PI / 4).translate(0, 14.5, 0), roof),
      part(new THREE.SphereGeometry(0.3, 8, 6).translate(0, 15.9, 0), "#FFC72C", { glow: true }),
    ]),
    createInstancedMaterial({ glowStrength: 1.2 }),
  ),
  walls: square(1.6),
});

/** A flagpole with a two-colour flag (club colours), flag along +x. */
const flag = (x: number, z: number, top: string, bottom: string, h = 7) => [
  part(new THREE.CylinderGeometry(0.06, 0.08, h, 6).translate(x, h / 2, z), "#D8D8D8"),
  part(block(1.8, 0.5, 0.04, x + 0.95, h - 0.5, z), top),
  part(block(1.8, 0.5, 0.04, x + 0.95, h - 1.0, z), bottom),
];

/** A club spot on the street: painted shopfront, bunting and flags in club colours. */
const clubFront = (a: string, b: string, title: string, sub: string) => {
  const group = new THREE.Group();
  const parts = [
    part(block(7, 3.4, 0.4, 0, 1.7, 1.2), a),
    part(block(7, 0.5, 0.42, 0, 3.2, 1.19), b),
    part(block(2.2, 2.4, 0.1, -1.6, 1.2, 0.98), "#2A2F3A"),
    part(block(1.8, 0.9, 0.1, 1.9, 1.6, 0.98), "#2A2F3A"),
    // Supporters' benches on the verge.
    part(block(2.6, 0.12, 0.45, 0.6, 0.48, -0.4), "#8B5E3C"),
    part(block(0.1, 0.45, 0.4, -0.6, 0.24, -0.4), "#6B4A33"),
    part(block(0.1, 0.45, 0.4, 1.8, 0.24, -0.4), "#6B4A33"),
    ...flag(-3.4, -0.6, a, b),
    ...flag(3.4, -0.6, b, a),
    // Bunting across the front.
    ...Array.from({ length: 9 }, (_, i) => part(new THREE.ConeGeometry(0.22, 0.4, 3).rotateX(Math.PI).translate(-3.2 + i * 0.8, 3.75, 0.95), i % 2 ? a : b)),
  ];
  group.add(new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1 })));
  const sign = textSign(6, 1.25, title, sub, a, b, b);
  sign.position.set(0, 4.25, 0.98);
  sign.rotation.y = Math.PI;
  group.add(sign);
  return { object: group, walls: [-3.5, 1.4, 3.5, 1.4] };
};

const BUILDERS: Record<string, () => LandmarkBuild> = {
  "clock-tower": () => clockTower("#F7F3EA", "#0B6E4F", "#0B6E4F"),
  "mwanza-clock": () => clockTower("#F4F1EA", "#1E5AA8", "#C9C2B2"),
  "uhuru-torch": () => {
    // The Arusha Declaration (Uhuru) monument: a white column with the torch of freedom.
    const parts: THREE.BufferGeometry[] = [
      part(new THREE.CylinderGeometry(7, 7.4, 0.5, 32).translate(0, 0.25, 0), "#4E9A3A"),
      part(new THREE.CylinderGeometry(3.6, 3.8, 0.8, 8).translate(0, 0.9, 0), "#E9E1CF"),
      part(new THREE.CylinderGeometry(2.6, 2.8, 0.8, 8).translate(0, 1.7, 0), "#F2EDE3"),
      part(new THREE.CylinderGeometry(0.75, 1.3, 13, 8).translate(0, 8.6, 0), "#F7F3EA"),
      part(new THREE.CylinderGeometry(1.1, 0.7, 1.2, 8).translate(0, 15.6, 0), "#B8892E"),
      part(new THREE.ConeGeometry(0.9, 2.2, 8).translate(0, 17.3, 0), "#FF8A1F", { glow: true }),
      part(new THREE.ConeGeometry(0.5, 1.4, 8).translate(0, 17.6, 0), "#FFE27A", { glow: true }),
    ];
    // Four green-black-yellow-blue national-colour bands on the plinth.
    ["#1EB53A", "#00A3DD", "#FCD116", "#111111"].forEach((c, i) => parts.push(part(block(1.2, 0.35, 0.1, 0, 1.75, 2.66).rotateY((i * Math.PI) / 2), c)));
    return { object: new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 2 })), walls: circle(3) };
  },
  "kambarage-stadium": () => {
    // Pitch with two long stands, a roof over the main stand, floodlights and the gate.
    const parts: THREE.BufferGeometry[] = [part(block(78, 0.08, 112, 0, 0.04, 0), "#3E8E3A")];
    for (let i = -5; i <= 5; i++) parts.push(part(block(68, 0.09, 4.5, 0, 0.05, i * 9.5), i % 2 ? "#3E8E3A" : "#47A043"));
    parts.push(part(block(66, 0.1, 0.25, 0, 0.1, 0), "#FFFFFF"), part(new THREE.TorusGeometry(9, 0.15, 4, 40).rotateX(Math.PI / 2).translate(0, 0.1, 0), "#FFFFFF"));
    for (const z of [-50, 50]) parts.push(part(block(7.3, 2.4, 0.15, 0, 1.2, z), "#FFFFFF"));
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 6; tier++) {
        const x = side * (37 + tier * 1.4);
        parts.push(part(block(1.4, 0.5 + tier * 0.75, 100, x, (0.5 + tier * 0.75) / 2, 0), tier % 2 ? "#1E5AA8" : "#F4F1EA"));
      }
      parts.push(part(block(1, 6, 100, side * 45.4, 3, 0), "#C9C2B2"));
    }
    parts.push(part(block(10, 0.3, 70, -42, 9, 0), "#B7BCC4"));
    for (const z of [-25, 25]) parts.push(part(block(0.4, 9, 0.4, -46.5, 4.5, z), "#8A8F99"));
    for (const [x, z] of [[-48, -54], [48, -54], [-48, 54], [48, 54]] as const) {
      parts.push(part(new THREE.CylinderGeometry(0.35, 0.5, 26, 6).translate(x, 13, z), "#8A8F99"));
      parts.push(part(block(4, 2.4, 0.5, x, 26.5, z), "#FFF6D8", { glow: true }));
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.6 })));
    const sign = textSign(14, 2.4, "UWANJA WA KAMBARAGE", "SHINYANGA", "#1E5AA8", "#FFFFFF", "#FCD116");
    sign.position.set(46, 7.4, 0);
    sign.rotation.y = Math.PI / 2;
    group.add(sign);
    return { object: group, walls: [-46, -50, -46, 50, 46, -50, 46, 50] };
  },
  "yanga-tawi": () => clubFront("#0B7A3B", "#FCD116", "TAWI LA YANGA", "Wananchi · Mtaa wa Uhuru"),
  "simba-duka": () => clubFront("#C8102E", "#FFFFFF", "SIMBA SPORTS CLUB", "Duka la Wanasimba · Msimbazi"),
  kijiwe: () => {
    // Mzee Juma's boda stand: a tin-roof shelter, a bench, and the stand's bodas lined up.
    const parts: THREE.BufferGeometry[] = [
      part(block(5.6, 0.12, 3, 0, 2.7, 1.4).rotateX(0.06), "#9AA3AD"),
      ...[-2.6, 2.6].flatMap((x) => [0.1, 2.7].map((z) => part(block(0.12, 2.7, 0.12, x, 1.35, z), "#6B4A33"))),
      part(block(4, 0.12, 0.5, 0, 0.5, 2.3), "#8B5E3C"),
      part(block(0.12, 0.5, 0.45, -1.8, 0.25, 2.3), "#6B4A33"),
      part(block(0.12, 0.5, 0.45, 1.8, 0.25, 2.3), "#6B4A33"),
    ];
    const bodas = ["#C93A31", "#1F3A63", "#0B6E4F", "#9C4A2E"];
    bodas.forEach((c, i) => {
      const x = -3.6 + i * 2.4;
      parts.push(
        part(block(0.3, 0.5, 1.7, x, 0.62, -0.6), c),
        part(block(0.32, 0.18, 0.9, x, 0.95, -0.4), "#1B1D22"),
        part(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.3, -1.35), "#15181E"),
        part(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).rotateZ(Math.PI / 2).translate(x, 0.3, 0.15), "#15181E"),
        part(block(0.7, 0.05, 0.05, x, 1.15, -1.25), "#4B5563"),
      );
    });
    // Two riders chatting on the bench, in reflector vests.
    for (const x of [-0.8, 0.9]) {
      parts.push(
        part(block(0.44, 0.6, 0.3, x, 0.95, 2.35), "#C6F432", { glow: true }),
        part(block(0.4, 0.2, 0.55, x, 0.6, 2.1), "#2F3340"),
        part(new THREE.SphereGeometry(0.15, 8, 6).translate(x, 1.42, 2.35), "#4A2E1E"),
      );
    }
    const group = new THREE.Group();
    group.add(new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.4 })));
    const sign = textSign(3.6, 0.8, "KIJIWE CHA MZEE JUMA", "Boda safi · Bei poa", "#FFC72C", "#10131A", "#10131A");
    sign.position.set(0, 3.25, 0.05);
    group.add(sign);
    return { object: group, walls: [] };
  },
  "kariakoo-market": () => {
    // The market's famous inverted-umbrella concrete roofs.
    const parts: THREE.BufferGeometry[] = [part(block(38, 7, 38, 0, 3.5, 0), "#E9E1CF")];
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const x = i * 12.5, z = j * 12.5;
        parts.push(part(new THREE.ConeGeometry(6.6, 3.2, 4).rotateX(Math.PI).rotateY(Math.PI / 4).translate(x, 9.4, z), "#D8D0BE"));
        parts.push(part(new THREE.CylinderGeometry(0.5, 0.6, 3, 8).translate(x, 7.6, z), "#C9C0AC"));
      }
    }
    parts.push(part(block(14, 1.6, 0.3, 0, 5.4, -19.2), "#0B6E4F"));
    parts.push(part(block(12, 0.7, 0.32, 0, 5.4, -19.25), "#FFC72C", { glow: true }));
    return { object: new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.2 })), walls: square(19) };
  },
  "bismarck-rock": () => {
    const rock = (r: number, x: number, y: number, z: number, sy = 0.8) => part(new THREE.IcosahedronGeometry(r, 1).scale(1, sy, 1).translate(x, y, z), "#9C8A86");
    return {
      object: new THREE.Mesh(
        merge([
          rock(5.5, 0, 2.5, 0),
          rock(3.6, 1.2, 7.8, -0.6, 0.75),
          rock(2.4, 0.6, 11.2, -0.2, 0.9),
          rock(1.4, 0.8, 13.6, 0, 1),
          rock(3.2, -5.5, 1.4, 3, 0.6),
          rock(2.2, 5.6, 1, -2.6, 0.7),
        ]),
        createInstancedMaterial(),
      ),
      walls: circle(6),
    };
  },
  "nguzo-nane": () => {
    const parts: THREE.BufferGeometry[] = [part(new THREE.CylinderGeometry(7.5, 8, 0.6, 32).translate(0, 0.3, 0), "#C9C2B2")];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      parts.push(part(new THREE.CylinderGeometry(0.45, 0.55, 6.5, 10).translate(Math.cos(a) * 5.5, 3.6, Math.sin(a) * 5.5), "#F7F3EA"));
    }
    parts.push(part(new THREE.TorusGeometry(5.5, 0.45, 8, 32).rotateX(Math.PI / 2).translate(0, 7, 0), "#0B6E4F"));
    parts.push(part(new THREE.SphereGeometry(0.6, 10, 8).translate(0, 7.8, 0), "#FFC72C", { glow: true }));
    return { object: new THREE.Mesh(merge(parts), createInstancedMaterial({ glowStrength: 1.2 })), walls: [] };
  },
};

export const buildLandmark = (id: string): LandmarkBuild | null => BUILDERS[id]?.() ?? null;
