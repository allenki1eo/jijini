/**
 * The boda stage at Mzee Juma's kijiwe: riders park in line and take
 * customers in turn. Stop at the stage and join the queue (foleni); each
 * customer who walks up goes to whoever is first. Your turn comes when the
 * riders ahead of you have gone off with theirs.
 *
 * Or don't wait: ride up and take a customer who isn't yours. You get the
 * fare, the other riders get angry (they honk, your sifa drops) and they
 * won't let you back in the line for a while.
 *
 * Local frame: −z faces the road (as the kijiwe itself).
 */
import * as THREE from "three";
import { events } from "@/game/core/events";
import { VEHICLE_GEOMETRY } from "@/game/traffic/vehicleMeshes";
import type { BikeState } from "@/game/vehicles/BikePhysics";
import { createInstancedMaterial, setInstanceHex } from "./meshKit";
import { PERSON_GEOMETRY } from "./people";

const SLOTS = 4;
const ZONE = 18;
/** Seconds between customers walking up to the stage. */
const CUSTOMER_EVERY: [number, number] = [14, 26];
/** How long a customer waits before the first rider in line takes them. */
const CUSTOMER_WAIT = 5;
/** A rider who left with a customer is back in line after this long. */
const RIDER_AWAY: [number, number] = [45, 90];
/** Riders keep a customer-thief out of the line this long (s). */
const BAN = 240;
const RIDER_COLORS = ["#C93A31", "#1F3A63", "#0B6E4F", "#10131A"];

/** Read by the stage panel. */
export const stageHud = {
  inZone: false,
  joined: false,
  /** 1 = next customer is yours. */
  position: 0,
  /** Riders parked in line now. */
  riders: 0,
  customer: false,
  banned: 0,
};

export class KijiweStage {
  readonly group = new THREE.Group();
  private readonly material = createInstancedMaterial();
  private readonly bikes: THREE.InstancedMesh;
  private readonly customerMesh: THREE.Mesh;
  private readonly slots: { x: number; z: number; yaw: number }[] = [];
  /** Seconds until each rider is back (0 = parked in line). */
  private away: number[] = Array(SLOTS).fill(0);
  private nextCustomer = 8;
  private customerWait = 0;
  private bikeGeometry: THREE.BufferGeometry;
  private personGeometry: THREE.BufferGeometry;

  constructor(
    readonly x: number,
    readonly z: number,
    readonly yaw: number,
  ) {
    this.group.name = "kijiwe-stage";
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
    // Bikes parked side by side at the kerb beside the kijiwe, front wheels to the road.
    for (let i = 0; i < SLOTS; i++) {
      const [px, pz] = at(4.2 + i * 1.3, -0.6);
      this.slots.push({ x: px, z: pz, yaw: yaw + Math.PI });
    }
    this.bikeGeometry = VEHICLE_GEOMETRY.boda();
    this.bikes = new THREE.InstancedMesh(this.bikeGeometry, this.material, SLOTS);
    RIDER_COLORS.forEach((hex, i) => setInstanceHex(this.bikes, i, hex));
    this.bikes.frustumCulled = false;
    this.personGeometry = PERSON_GEOMETRY.mama();
    this.customerMesh = new THREE.Mesh(this.personGeometry, this.material);
    const [cx, cz] = at(2.4, -1.4);
    this.customerMesh.position.set(cx, 0, cz);
    this.customerMesh.rotation.y = yaw + Math.PI * 0.6;
    this.customerMesh.visible = false;
    this.group.add(this.bikes, this.customerMesh);
    this.layout();
  }

  /** Where the stage is (for the rides it starts). */
  get spot() {
    return { x: this.customerMesh.position.x, z: this.customerMesh.position.z };
  }

  private get parked() {
    return this.away.filter((t) => t <= 0).length;
  }

  private layout() {
    const dummy = new THREE.Object3D();
    let n = 0;
    this.away.forEach((t, i) => {
      if (t > 0) return;
      const slot = this.slots[i]!;
      dummy.position.set(slot.x, 0, slot.z);
      dummy.rotation.set(0, slot.yaw, 0);
      dummy.updateMatrix();
      this.bikes.setMatrixAt(n, dummy.matrix);
      setInstanceHex(this.bikes, n++, RIDER_COLORS[i]!);
    });
    this.bikes.count = n;
    this.bikes.instanceMatrix.needsUpdate = true;
    if (this.bikes.instanceColor) this.bikes.instanceColor.needsUpdate = true;
  }

  private randomIn([a, b]: [number, number]) {
    return a + Math.random() * (b - a);
  }

  /** The first rider in line rides off with the waiting customer. */
  private riderTakes() {
    const i = this.away.findIndex((t) => t <= 0);
    if (i >= 0) this.away[i] = this.randomIn(RIDER_AWAY);
    this.customerMesh.visible = false;
    stageHud.customer = false;
    if (stageHud.joined) stageHud.position = Math.max(1, stageHud.position - 1);
    this.nextCustomer = this.randomIn(CUSTOMER_EVERY);
    this.layout();
  }

  update(dt: number, bike: BikeState, busy: boolean) {
    const h = stageHud;
    h.banned = Math.max(0, h.banned - dt);
    let changed = false;
    this.away = this.away.map((t) => {
      if (t <= 0) return 0;
      const left = t - dt;
      if (left <= 0) changed = true;
      return Math.max(0, left);
    });
    if (changed) this.layout();
    h.riders = this.parked;
    h.inZone = !busy && Math.hypot(bike.x - this.x, bike.z - this.z) < ZONE;
    if (h.joined && (!h.inZone || busy)) {
      h.joined = false;
      h.position = 0;
    }

    if (!h.customer) {
      this.nextCustomer -= dt;
      if (this.nextCustomer <= 0) {
        h.customer = true;
        this.customerWait = 0;
        this.customerMesh.visible = true;
      }
      return;
    }
    // A customer is waiting: yours if you're first, otherwise the first rider takes them.
    if (h.joined && h.position <= 1) return;
    this.customerWait += dt;
    if (this.customerWait > CUSTOMER_WAIT) {
      if (this.parked > 0) this.riderTakes();
      else if (h.joined) h.position = 1;
    }
  }

  /** Join the back of the line. False when the riders won't have you. */
  join(): boolean {
    const h = stageHud;
    if (h.banned > 0 || !h.inZone) return false;
    h.joined = true;
    h.position = this.parked + 1;
    return true;
  }

  leave() {
    stageHud.joined = false;
    stageHud.position = 0;
  }

  /** Your turn: the waiting customer is yours. */
  takeTurn(): boolean {
    const h = stageHud;
    if (!h.customer || !h.joined || h.position > 1) return false;
    this.hand();
    return true;
  }

  /** Take a customer that isn't yours. The riders won't forget it. */
  steal(): boolean {
    const h = stageHud;
    if (!h.customer || (h.joined && h.position <= 1)) return false;
    this.hand();
    h.banned = BAN;
    // The whole line leans on its horns.
    this.slots.forEach((slot, i) => {
      if (this.away[i]! > 0) return;
      window.setTimeout(() => events.emit("honked", { x: slot.x, z: slot.z, kind: "boda", mood: "angry" }), 150 + i * 260);
    });
    return true;
  }

  private hand() {
    stageHud.customer = false;
    stageHud.joined = false;
    stageHud.position = 0;
    this.customerMesh.visible = false;
    this.nextCustomer = this.randomIn(CUSTOMER_EVERY);
  }

  dispose() {
    this.bikeGeometry.dispose();
    this.personGeometry.dispose();
    this.material.dispose();
  }
}
