/**
 * Unified rider input. Keyboard, gamepad, on-screen touch controls and phone
 * tilt all feed one mutable `controls` object that the frame loop reads.
 */

export interface ControlState {
  throttle: number;
  brake: number;
  /** -1 left … 1 right */
  steer: number;
  boost: boolean;
  wheelie: boolean;
  horn: boolean;
  /** Edge-triggered actions, cleared after each frame. */
  pressed: { horn: boolean; camera: boolean; pause: boolean; action: boolean };
}

export const controls: ControlState = {
  throttle: 0,
  brake: 0,
  steer: 0,
  boost: false,
  wheelie: false,
  horn: false,
  pressed: { horn: false, camera: false, pause: false, action: false },
};

/** Written by the on-screen controls. */
export const touch = { steer: 0, throttle: 0, brake: 0, boost: false, wheelie: false, horn: false };

const keys = new Set<string>();
let tiltSteer = 0;
let lastPad: boolean[] = [];

const has = (...codes: string[]) => codes.some((c) => keys.has(c));
/** Keys that ride the bike (rather than operate the page). */
const DRIVE_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight", "KeyQ", "KeyH"]);

export interface ControlOptions {
  autoThrottle: boolean;
  tilt: boolean;
}

/** Install keyboard + tilt listeners. Returns a cleanup function. */
export const attachInputs = (): (() => void) => {
  const onKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
    // After clicking a HUD button, focus stays on it and Space/Enter would press it again: hand the keys back to the bike.
    if (e.type === "keydown" && DRIVE_KEYS.has(e.code) && target instanceof HTMLButtonElement && !target.closest("[role=dialog]")) {
      target.blur();
      e.preventDefault();
    }
    if (e.type === "keydown") {
      if (!e.repeat) {
        if (e.code === "KeyH") controls.pressed.horn = true;
        if (e.code === "KeyC") controls.pressed.camera = true;
        if (e.code === "Escape" || e.code === "KeyP") controls.pressed.pause = true;
        if (e.code === "KeyE" || e.code === "Enter") controls.pressed.action = true;
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
      keys.add(e.code);
    } else keys.delete(e.code);
  };
  const clear = () => keys.clear();
  const onTilt = (e: DeviceOrientationEvent) => {
    const angle = screen.orientation?.angle ?? 0;
    // In landscape the phone's beta axis is the steering wheel; flip it for the other landscape.
    const raw = angle === 90 ? e.beta : angle === 270 || angle === -90 ? -(e.beta ?? 0) : e.gamma;
    tiltSteer = Math.max(-1, Math.min(1, (raw ?? 0) / 24));
  };
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", clear);
  window.addEventListener("deviceorientation", onTilt);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
    window.removeEventListener("blur", clear);
    window.removeEventListener("deviceorientation", onTilt);
    keys.clear();
  };
};

/** iOS needs an explicit permission prompt (from a tap) before tilt events flow. */
export const requestTiltPermission = async (): Promise<boolean> => {
  const D = (typeof DeviceOrientationEvent !== "undefined" ? DeviceOrientationEvent : undefined) as
    | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> })
    | undefined;
  if (!D) return false;
  if (!D.requestPermission) return true;
  try {
    return (await D.requestPermission()) === "granted";
  } catch {
    return false;
  }
};

const approach = (value: number, target: number, rate: number) =>
  value < target ? Math.min(target, value + rate) : Math.max(target, value - rate);

/** Merge every source into `controls`. Call once per frame before the simulation. */
export const pollControls = (dt: number, opts: ControlOptions) => {
  let throttle = has("KeyW", "ArrowUp") ? 1 : 0;
  let brake = has("KeyS", "ArrowDown", "Space") ? 1 : 0;
  let steerTarget = (has("KeyD", "ArrowRight") ? 1 : 0) - (has("KeyA", "ArrowLeft") ? 1 : 0);
  let boost = has("ShiftLeft", "ShiftRight");
  let wheelie = has("KeyQ");
  let horn = has("KeyH");

  // Gamepad (standard mapping): left stick steers, RT/LT throttle/brake, A boost, X wheelie, B horn.
  const pad = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads().find(Boolean) : null;
  if (pad) {
    const b = (i: number) => pad.buttons[i]?.value ?? 0;
    const stick = pad.axes[0] ?? 0;
    if (Math.abs(stick) > 0.12) steerTarget = stick;
    throttle = Math.max(throttle, b(7));
    brake = Math.max(brake, b(6));
    boost ||= b(0) > 0.5;
    wheelie ||= b(2) > 0.5;
    horn ||= b(1) > 0.5;
    const now = pad.buttons.map((x) => x.pressed);
    if (now[1] && !lastPad[1]) controls.pressed.horn = true;
    if (now[3] && !lastPad[3]) controls.pressed.camera = true;
    if (now[9] && !lastPad[9]) controls.pressed.pause = true;
    lastPad = now;
  }

  // Touch controls and tilt.
  throttle = Math.max(throttle, touch.throttle);
  brake = Math.max(brake, touch.brake);
  if (Math.abs(touch.steer) > 0.02) steerTarget = touch.steer;
  if (opts.tilt && Math.abs(tiltSteer) > 0.04) steerTarget = tiltSteer;
  boost ||= touch.boost;
  wheelie ||= touch.wheelie;
  horn ||= touch.horn;
  if (opts.autoThrottle && brake < 0.1) throttle = Math.max(throttle, 0.75);

  controls.throttle = throttle;
  controls.brake = brake;
  // Keyboard steering eases in; analog sources pass straight through.
  controls.steer = Math.abs(steerTarget) === 1 ? approach(controls.steer, steerTarget, dt * 5) : approach(controls.steer, steerTarget, dt * 12);
  controls.boost = boost;
  controls.wheelie = wheelie;
  controls.horn = horn;
};

export const clearPressed = () => {
  controls.pressed.horn = false;
  controls.pressed.camera = false;
  controls.pressed.pause = false;
  controls.pressed.action = false;
};
