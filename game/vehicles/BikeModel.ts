/**
 * Procedural low-poly boda + rider (the fallback whenever no GLB is shipped).
 * Every customizable part is a material parameter, so paint, helmet, jacket,
 * plate text and accessories change without rebuilding geometry.
 */
import * as THREE from "three";
import type { Customization } from "@/stores/player";
import { BIKES, type BikeId } from "./bikes";
import type { BikeState } from "./BikePhysics";

export type PassengerKind = "none" | "mama" | "student" | "business" | "kid" | "tourist" | "elder";
export type CargoKind = "none" | "parcel" | "crates" | "chai" | "food" | "groceries" | "speaker";

const STICKERS: Record<Customization["sticker"], [string, string] | null> = {
  none: null,
  reds: ["#D7261E", "#FFFFFF"],
  yellows: ["#FFC72C", "#0B6E4F"],
  blues: ["#00A3DD", "#FFFFFF"],
  kitenge: ["#FF5A4F", "#FFC72C"],
};

const PASSENGER_LOOK: Record<Exclude<PassengerKind, "none">, { top: string; bottom: string; skin: string; hat?: string; extra?: "basket" | "bag" | "briefcase" | "shuka" | "camera" }> = {
  mama: { top: "#E0457B", bottom: "#F2B134", skin: "#5B3A26", hat: "#E0457B", extra: "basket" },
  student: { top: "#F4F1EA", bottom: "#1F4E8C", skin: "#4A2E1E", extra: "bag" },
  business: { top: "#2B3A55", bottom: "#2B3A55", skin: "#3E2618", extra: "briefcase" },
  kid: { top: "#2F80ED", bottom: "#2B2B2B", skin: "#5B3A26", extra: "bag" },
  tourist: { top: "#F2994A", bottom: "#C9B79C", skin: "#E8C4A6", hat: "#C9B79C", extra: "camera" },
  elder: { top: "#C62828", bottom: "#7A1F1F", skin: "#3E2618", extra: "shuka" },
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (r: number, len: number, seg = 8) => new THREE.CylinderGeometry(r, r, len, seg);
/** A capsule limb of length `len` (end to end), lying along y before rotation. */
const limb = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 3, 8);

const plateTexture = (text: string) => {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFD54A";
  ctx.fillRect(0, 0, 256, 96);
  ctx.strokeStyle = "#10131A";
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 248, 88);
  ctx.fillStyle = "#10131A";
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 10).toUpperCase(), 128, 52);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
};

export class BikeModel {
  readonly root = new THREE.Group();
  private lean = new THREE.Group();
  private pitch = new THREE.Group();
  private frontAssembly = new THREE.Group();
  private wheels: THREE.Object3D[] = [];
  private riderTorso = new THREE.Group();
  private passenger = new THREE.Group();
  private cargo = new THREE.Group();
  private fairing: THREE.Mesh;
  private exhaust2: THREE.Mesh;
  private rack: THREE.Group;
  private mudflaps: THREE.Group;
  private ledStrip: THREE.Mesh;
  private vest: THREE.Mesh;
  /** The helmet's parts, and the bare head with a kofia shown when it has cracked. */
  private helmetParts: THREE.Mesh[] = [];
  private bareHead: THREE.Group = new THREE.Group();
  private tank: THREE.Mesh;
  private stickerMeshes: THREE.Mesh[] = [];
  private plate: THREE.Mesh;
  private plateText = "";
  readonly headlight: THREE.Mesh;
  private wheelSpin = 0;
  private disposables: { dispose: () => void }[] = [];

  readonly mats = {
    body: this.mat("#C93A31"),
    accent: this.mat("#FF8A80"),
    frame: this.mat("#2A3040"),
    metal: this.mat("#C9D0DC"),
    tyre: this.mat("#15171C"),
    rim: this.mat("#9AA3B5"),
    seat: this.mat("#10131A"),
    helmet: this.mat("#FFC72C"),
    visor: this.mat("#1A2230"),
    jacket: this.mat("#0B6E4F"),
    vest: this.mat("#D7F24A"),
    trousers: this.mat("#1F3A63"),
    skin: this.mat("#5B3A26"),
    shoes: this.mat("#10131A"),
    sticker1: this.mat("#FFFFFF"),
    sticker2: this.mat("#FFFFFF"),
    led: new THREE.MeshBasicMaterial({ color: "#3EE0FF" }),
    lamp: new THREE.MeshBasicMaterial({ color: "#FFF3C4" }),
    tail: new THREE.MeshBasicMaterial({ color: "#FF2D2D" }),
    plate: new THREE.MeshBasicMaterial({ color: "#FFFFFF" }),
    pTop: this.mat("#E0457B"),
    pBottom: this.mat("#F2B134"),
    pSkin: this.mat("#5B3A26"),
    pExtra: this.mat("#C8913A"),
    cargo: this.mat("#D69A57"),
    cargo2: this.mat("#FF5A4F"),
    oil: this.mat("#F2C230"),
    greens: this.mat("#4E9A3A"),
  };

  constructor() {
    this.root.name = "boda";
    this.root.add(this.lean);
    this.lean.add(this.pitch);
    // Wheelies pivot on the rear contact patch.
    this.pitch.position.set(0, 0, 0.66);
    const body = new THREE.Group();
    body.position.z = -0.66;
    this.pitch.add(body);
    const m = this.mats;
    const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      parent.add(mesh);
      this.disposables.push(g);
      return mesh;
    };

    // Wheels: a round tyre, a rim and wire spokes that blur when they spin.
    const wheel = (z: number, parent: THREE.Object3D) => {
      const w = new THREE.Group();
      w.position.set(0, 0.31, z);
      add(w, new THREE.TorusGeometry(0.255, 0.058, 8, 22), m.tyre, 0, 0, 0, 0, Math.PI / 2, 0);
      add(w, new THREE.TorusGeometry(0.2, 0.014, 4, 22), m.rim, 0, 0, 0, 0, Math.PI / 2, 0);
      add(w, cyl(0.045, 0.13, 8), m.metal, 0, 0, 0, 0, 0, Math.PI / 2);
      for (let i = 0; i < 6; i++) add(w, box(0.012, 0.4, 0.012), m.metal, 0, 0, 0, (i / 6) * Math.PI);
      parent.add(w);
      this.wheels.push(w);
    };
    wheel(0.66, body);

    // Frame, engine, exhausts.
    add(body, box(0.1, 0.08, 1.0), m.frame, 0, 0.5, 0.05, -0.15);
    add(body, box(0.26, 0.26, 0.34), m.frame, 0, 0.4, 0.02);
    add(body, box(0.06, 0.06, 0.66), m.frame, 0, 0.36, 0.38, 0.2);
    add(body, cyl(0.045, 0.9), m.metal, 0.17, 0.32, 0.42, Math.PI / 2 - 0.12);
    this.exhaust2 = add(body, cyl(0.045, 0.9), m.metal, -0.17, 0.32, 0.42, Math.PI / 2 - 0.12);

    // Tank, side panels, seat.
    this.tank = add(body, new THREE.SphereGeometry(0.2, 14, 10).scale(0.82, 0.62, 1.15), m.body, 0, 0.77, -0.16);
    add(body, cyl(0.045, 0.04, 10), m.metal, 0, 0.9, -0.18);
    add(body, box(0.32, 0.16, 0.36), m.body, 0, 0.62, 0.3);
    add(body, box(0.27, 0.07, 0.62), m.seat, 0, 0.75, 0.32);
    for (const [i, x] of [-0.152, 0.152].entries()) {
      this.stickerMeshes.push(add(body, box(0.004, 0.05, 0.36), i ? m.sticker1 : m.sticker2, x, 0.79, -0.16));
    }
    this.ledStrip = add(body, box(0.24, 0.025, 0.4), m.led, 0, 0.27, 0.02);

    // Rear rack, tail light, plate, mud flaps.
    this.rack = new THREE.Group();
    body.add(this.rack);
    add(this.rack, box(0.36, 0.03, 0.4), m.frame, 0, 0.8, 0.72);
    add(this.rack, box(0.03, 0.18, 0.03), m.frame, 0.16, 0.71, 0.9);
    add(this.rack, box(0.03, 0.18, 0.03), m.frame, -0.16, 0.71, 0.9);
    add(body, box(0.2, 0.06, 0.04), m.tail, 0, 0.7, 0.98);
    this.plate = add(body, new THREE.PlaneGeometry(0.24, 0.09), m.plate, 0, 0.58, 1.0);
    add(body, box(0.18, 0.04, 0.5), m.body, 0, 0.66, 0.72, 0.12);
    this.mudflaps = new THREE.Group();
    body.add(this.mudflaps);
    add(this.mudflaps, box(0.16, 0.2, 0.01), m.seat, 0, 0.18, 1.0);
    add(this.mudflaps, box(0.16, 0.2, 0.01), m.seat, 0, 0.18, -0.48);

    // Steerable front: fork, wheel, fender, headlight, bars, fairing.
    this.frontAssembly.position.set(0, 0, -0.5);
    body.add(this.frontAssembly);
    const fa = this.frontAssembly;
    add(fa, cyl(0.035, 0.85), m.metal, 0.08, 0.66, -0.06, -0.33);
    add(fa, cyl(0.035, 0.85), m.metal, -0.08, 0.66, -0.06, -0.33);
    wheel(-0.16, fa);
    add(fa, box(0.16, 0.04, 0.5), m.body, 0, 0.66, -0.2, -0.25);
    this.headlight = add(fa, cyl(0.08, 0.05, 12), m.lamp, 0, 1.0, -0.06, Math.PI / 2 - 0.2);
    add(fa, cyl(0.098, 0.07, 12), m.frame, 0, 1.0, -0.03, Math.PI / 2 - 0.2);
    add(fa, cyl(0.02, 0.72), m.frame, 0, 1.12, 0.06, 0, 0, Math.PI / 2);
    // Grips and the round mirrors every boda wears.
    for (const x of [-0.33, 0.33]) {
      add(fa, cyl(0.028, 0.12, 8), m.seat, x, 1.12, 0.06, 0, 0, Math.PI / 2);
      add(fa, cyl(0.008, 0.3, 4), m.frame, x * 0.82, 1.28, 0.1, -0.2);
      // Black housing, with the glass facing the rider.
      add(fa, cyl(0.055, 0.025, 12), m.seat, x * 0.82, 1.43, 0.13, Math.PI / 2);
      add(fa, cyl(0.045, 0.01, 12), m.visor, x * 0.82, 1.43, 0.145, Math.PI / 2);
    }
    add(fa, box(0.05, 0.12, 0.05), m.frame, 0.3, 1.2, 0.08);
    add(fa, box(0.05, 0.12, 0.05), m.frame, -0.3, 1.2, 0.08);
    this.fairing = add(fa, box(0.34, 0.3, 0.12), m.body, 0, 1.02, 0.0, -0.35);

    // Rider.
    const rider = new THREE.Group();
    rider.position.set(0, 0.78, 0.28);
    body.add(rider);
    for (const x of [-0.13, 0.13]) {
      // Thigh along the seat, shin down to the footpeg, shoe.
      add(rider, limb(0.075, 0.44), m.trousers, x, 0.04, -0.12, Math.PI / 2 - 0.1);
      add(rider, limb(0.065, 0.44), m.trousers, x * 1.15, -0.2, -0.33, 0.28);
      add(rider, box(0.11, 0.08, 0.22), m.shoes, x * 1.15, -0.42, -0.4);
    }
    rider.add(this.riderTorso);
    const t = this.riderTorso;
    add(t, limb(0.19, 0.58), m.jacket, 0, 0.36, 0.0, -0.32);
    this.vest = add(t, limb(0.2, 0.42), m.vest, 0, 0.34, 0.0, -0.32);
    // Reflective tape wrapped round the vest.
    for (const y of [-0.08, 0.08]) add(this.vest, new THREE.CylinderGeometry(0.203, 0.203, 0.035, 18, 1, true), m.metal, 0, y, 0);
    for (const x of [-0.22, 0.22]) {
      // Upper arm and forearm reaching for the grips, then the hand.
      add(t, limb(0.055, 0.32), m.jacket, x, 0.5, -0.16, -0.9, 0, -Math.sign(x) * 0.15);
      add(t, limb(0.048, 0.32), m.jacket, x * 1.2, 0.38, -0.42, -1.35);
      add(t, new THREE.SphereGeometry(0.05, 8, 6), m.skin, x * 1.3, 0.33, -0.58);
    }
    add(t, cyl(0.06, 0.1, 8), m.skin, 0, 0.66, -0.08);
    // Full-face helmet: shell, chin bar and a curved visor.
    this.helmetParts = [
      add(t, new THREE.SphereGeometry(0.16, 16, 12), m.helmet, 0, 0.78, -0.12),
      add(t, new THREE.SphereGeometry(0.162, 16, 8, -0.9, 1.8, 1.15, 0.55), m.visor, 0, 0.78, -0.12, 0, Math.PI, 0),
      add(t, box(0.18, 0.06, 0.08), m.helmet, 0, 0.66, -0.24),
    ];
    // Without a helmet: just a head and a kofia (what Afande fines you for).
    t.add(this.bareHead);
    add(this.bareHead, new THREE.SphereGeometry(0.12, 14, 10), m.skin, 0, 0.77, -0.12);
    add(this.bareHead, new THREE.CylinderGeometry(0.115, 0.12, 0.08, 14), m.jacket, 0, 0.86, -0.12);
    this.bareHead.visible = false;

    // Passenger (Abiria) and cargo (Mzigo, crates, chai, food).
    body.add(this.passenger);
    body.add(this.cargo);
    this.buildPassenger(add);
    this.buildCargo(add);
    this.setPassenger("none");
    this.setCargo("none");
  }

  private mat(color: string) {
    return new THREE.MeshLambertMaterial({ color });
  }

  private buildPassenger(add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx?: number) => THREE.Mesh) {
    const m = this.mats;
    const p = this.passenger;
    p.position.set(0, 0.8, 0.66);
    for (const x of [-0.13, 0.13]) {
      add(p, limb(0.07, 0.38), m.pBottom, x, 0.03, -0.1, Math.PI / 2);
      add(p, limb(0.062, 0.4), m.pBottom, x * 1.2, -0.2, -0.26, 0.2);
    }
    add(p, limb(0.18, 0.54), m.pTop, 0, 0.34, 0.06, 0.08);
    // Hands on the rider's waist.
    for (const x of [-0.2, 0.2]) add(p, limb(0.045, 0.34), m.pTop, x, 0.36, -0.12, -1.2);
    add(p, new THREE.SphereGeometry(0.13, 12, 10), m.pSkin, 0, 0.72, 0.06);
    p.userData.extras = {
      basket: add(p, cyl(0.2, 0.16, 10), m.pExtra, 0, 0.92, 0.06),
      bag: add(p, box(0.32, 0.36, 0.14), m.pExtra, 0, 0.36, 0.26),
      briefcase: add(p, box(0.08, 0.26, 0.36), m.pExtra, 0.28, 0.12, 0.06),
      shuka: add(p, box(0.44, 0.54, 0.28), m.pExtra, 0, 0.34, 0.06, 0.08),
      camera: add(p, box(0.14, 0.1, 0.1), m.pExtra, 0, 0.42, -0.08),
      hat: add(p, cyl(0.17, 0.05, 10), m.pTop, 0, 0.82, 0.06),
    } satisfies Record<string, THREE.Mesh>;
  }

  private buildCargo(add: (p: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => THREE.Mesh) {
    const m = this.mats;
    const c = this.cargo;
    c.position.set(0, 0.82, 0.74);
    c.userData.kinds = {
      parcel: add(c, box(0.42, 0.34, 0.4), m.cargo, 0, 0.17, 0),
      crates: (() => {
        const g = new THREE.Group();
        c.add(g);
        add(g, box(0.48, 0.24, 0.42), m.cargo, 0, 0.12, 0);
        add(g, box(0.48, 0.24, 0.42), m.cargo, 0, 0.37, 0.02);
        add(g, box(0.3, 0.14, 0.26), m.cargo2, 0, 0.56, 0);
        return g;
      })(),
      chai: (() => {
        const g = new THREE.Group();
        c.add(g);
        add(g, cyl(0.13, 0.36, 10), m.metal, -0.1, 0.18, 0);
        add(g, box(0.18, 0.12, 0.26), m.cargo2, 0.14, 0.06, 0);
        return g;
      })(),
      food: add(c, box(0.46, 0.4, 0.42), m.cargo2, 0, 0.2, 0),
      // Matangazo: a loudspeaker horn on a pole and a little banner.
      speaker: (() => {
        const g = new THREE.Group();
        c.add(g);
        add(g, box(0.3, 0.26, 0.3), m.metal, 0, 0.13, 0);
        add(g, cyl(0.025, 0.9, 6), m.metal, 0, 0.7, 0.05);
        add(g, new THREE.CylinderGeometry(0.2, 0.05, 0.36, 10).rotateX(-Math.PI / 2), m.oil, 0, 1.15, -0.1);
        add(g, box(0.62, 0.3, 0.02), m.cargo2, 0.32, 0.92, 0.12);
        return g;
      })(),
      // A woven kikapu with a bottle of cooking oil and greens poking out.
      groceries: (() => {
        const g = new THREE.Group();
        c.add(g);
        add(g, new THREE.CylinderGeometry(0.24, 0.19, 0.3, 10), m.cargo, 0, 0.15, 0);
        add(g, cyl(0.06, 0.32, 8), m.oil, -0.08, 0.36, 0.02);
        add(g, box(0.16, 0.12, 0.14), m.greens, 0.09, 0.34, -0.04);
        add(g, box(0.12, 0.1, 0.12), m.cargo2, 0.06, 0.33, 0.1);
        return g;
      })(),
    } satisfies Record<Exclude<CargoKind, "none">, THREE.Object3D>;
  }

  setPassenger(kind: PassengerKind) {
    this.passenger.visible = kind !== "none";
    if (kind === "none") return;
    const look = PASSENGER_LOOK[kind];
    this.mats.pTop.color.set(look.top);
    this.mats.pBottom.color.set(look.bottom);
    this.mats.pSkin.color.set(look.skin);
    this.mats.pExtra.color.set(kind === "elder" ? "#B71C1C" : kind === "business" ? "#3B2A1E" : kind === "tourist" ? "#222" : "#C8913A");
    const extras = this.passenger.userData.extras as Record<string, THREE.Mesh>;
    for (const [name, mesh] of Object.entries(extras)) mesh.visible = name === look.extra || (name === "hat" && Boolean(look.hat));
    // The passenger sits on the rack, so hide the cargo.
    this.cargo.visible = false;
  }

  setCargo(kind: CargoKind) {
    const kinds = this.cargo.userData.kinds as Record<string, THREE.Object3D>;
    for (const [name, obj] of Object.entries(kinds)) obj.visible = name === kind;
    this.cargo.visible = kind !== "none";
    if (kind !== "none") this.passenger.visible = false;
  }

  /** A whole helmet, or a bare head after it cracked. */
  setHelmet(on: boolean) {
    this.helmetParts.forEach((p) => (p.visible = on));
    this.bareHead.visible = !on;
  }

  setBike(id: BikeId, custom: Customization) {
    const look = BIKES[id].look;
    const m = this.mats;
    m.body.color.set(custom.body);
    m.accent.color.set(custom.body).offsetHSL(0, 0, 0.15);
    m.helmet.color.set(custom.helmet);
    m.jacket.color.set(custom.jacket);
    m.seat.color.set(custom.cushion);
    m.rim.color.set(look.gold ? "#E5B53A" : "#9AA3B5");
    m.metal.color.set(look.gold ? "#F2CF6B" : "#C9D0DC");
    this.tank.scale.set(look.tank, look.tank, look.tank);
    this.fairing.visible = look.fairing;
    this.exhaust2.visible = look.exhausts === 2;
    this.rack.visible = look.rack;
    this.vest.visible = custom.vest;
    this.mudflaps.visible = custom.mudflaps;
    this.ledStrip.visible = custom.led;
    const sticker = STICKERS[custom.sticker];
    this.stickerMeshes.forEach((s) => (s.visible = Boolean(sticker)));
    if (sticker) {
      m.sticker1.color.set(sticker[0]);
      m.sticker2.color.set(sticker[1]);
    }
    if (custom.plate !== this.plateText) {
      this.plateText = custom.plate;
      m.plate.map?.dispose();
      m.plate.map = plateTexture(custom.plate);
      m.plate.needsUpdate = true;
    }
  }

  /** Pose the model from the physics state. */
  update(s: BikeState, dt: number) {
    this.root.position.set(s.x, 0, s.z);
    this.root.rotation.y = s.heading;
    this.lean.rotation.z = -s.lean;
    this.pitch.rotation.x = s.pitch;
    this.frontAssembly.rotation.y = -s.steerAngle * 0.45 * Math.max(0.15, 1 - Math.abs(s.speed) / 18);
    this.wheelSpin -= (s.speed / 0.31) * dt;
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    this.riderTorso.rotation.z = -s.lean * 0.25;
    this.riderTorso.rotation.x = -Math.min(0.15, Math.max(0, s.speed / 120));
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    Object.values(this.mats).forEach((m) => {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    });
  }
}
