/** Clavier et manette traduits en actions communes : le jeu ne connaît que celles-ci. */

export type Action =
  | "up" | "down" | "left" | "right"
  | "confirm" | "back" | "rotate" | "random" | "prev" | "next" | "start" | "recenter" | "mute";
export type Device = "mouse" | "keys" | "pad" | "touch";

const KEYS: Record<string, Action> = {
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  Enter: "confirm", NumpadEnter: "confirm", Space: "confirm",
  Backspace: "back", Escape: "back",
  KeyR: "rotate", KeyF: "random", Tab: "next", KeyV: "start", KeyC: "recenter", KeyM: "mute",
};
const REPEATS = new Set<Action>(["up", "down", "left", "right"]);
const CAMERA_KEYS = new Set(["KeyQ", "KeyE", "PageUp", "PageDown", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"]);

/** Bouton de manette au format standard → action. */
const PAD_BUTTONS: [number, Action][] = [
  [0, "confirm"], [1, "back"], [2, "random"], [3, "rotate"], [4, "prev"], [5, "next"],
  [8, "mute"], [9, "start"], [10, "recenter"], [11, "recenter"],
];
const DIRS: { action: Action; button: number; axis: number; sign: number }[] = [
  { action: "up", button: 12, axis: 1, sign: -1 }, { action: "down", button: 13, axis: 1, sign: 1 },
  { action: "left", button: 14, axis: 0, sign: -1 }, { action: "right", button: 15, axis: 0, sign: 1 },
];
const STICK = 0.5;
const DEAD = 0.18;
const FIRST_REPEAT = 0.3;
const NEXT_REPEAT = 0.11;

let emit: (a: Action) => void = () => undefined;
let device: Device = window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "mouse";
let onDevice: (d: Device) => void = () => undefined;

export const currentDevice = () => device;
/** Clavier ou manette : il faut dessiner un curseur, personne ne survole. */
export const usesCursor = () => device === "keys" || device === "pad";
export function setDevice(d: Device): void {
  if (d === device) return;
  device = d;
  onDevice(d);
}

const held = new Set<string>();
const padPrev = new Map<number, boolean>();
const dirTimers = new Map<Action, number>();

export function initInput(onAction: (a: Action) => void, deviceChanged: (d: Device) => void): void {
  emit = onAction;
  onDevice = deviceChanged;
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (CAMERA_KEYS.has(e.code)) {
      held.add(e.code);
      setDevice("keys");
      e.preventDefault();
      return;
    }
    const a = e.code === "Tab" && e.shiftKey ? "prev" : KEYS[e.code];
    if (!a) return;
    e.preventDefault(); // Espace et Entrée ne doivent pas re-cliquer un bouton resté en focus
    if (e.repeat && !REPEATS.has(a)) return;
    setDevice("keys");
    emit(a);
  });
  window.addEventListener("keyup", (e) => held.delete(e.code));
  window.addEventListener("blur", () => held.clear());
}

function activePad(): Gamepad | null {
  for (const p of navigator.getGamepads?.() ?? []) if (p && p.connected) return p;
  return null;
}

export interface CameraAxes { yaw: number; pitch: number; zoom: number }

/** À appeler à chaque image : lit la manette, renvoie les commandes de caméra maintenues. */
export function pollInput(dt: number): CameraAxes {
  const axes: CameraAxes = { yaw: 0, pitch: 0, zoom: 0 };
  if (held.has("KeyQ")) axes.yaw += 1;
  if (held.has("KeyE")) axes.yaw -= 1;
  if (held.has("PageUp")) axes.pitch += 1;
  if (held.has("PageDown")) axes.pitch -= 1;
  if (held.has("Equal") || held.has("NumpadAdd")) axes.zoom -= 1;
  if (held.has("Minus") || held.has("NumpadSubtract")) axes.zoom += 1;

  const pad = activePad();
  if (!pad) return axes;
  const pressed = (i: number) => pad.buttons[i]?.pressed === true;

  for (const [button, action] of PAD_BUTTONS) {
    const now = pressed(button);
    if (now && !padPrev.get(button)) { setDevice("pad"); emit(action); }
    padPrev.set(button, now);
  }
  for (const d of DIRS) {
    const on = pressed(d.button) || (pad.axes[d.axis] ?? 0) * d.sign > STICK;
    const timer = dirTimers.get(d.action);
    if (!on) { dirTimers.delete(d.action); continue; }
    if (timer === undefined) {
      setDevice("pad");
      emit(d.action);
      dirTimers.set(d.action, FIRST_REPEAT);
    } else if (timer - dt <= 0) {
      emit(d.action);
      dirTimers.set(d.action, NEXT_REPEAT);
    } else dirTimers.set(d.action, timer - dt);
  }
  const rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
  if (Math.abs(rx) > DEAD) { axes.yaw -= rx; setDevice("pad"); }
  if (Math.abs(ry) > DEAD) { axes.pitch -= ry; setDevice("pad"); }
  const lt = pad.buttons[6]?.value ?? 0, rt = pad.buttons[7]?.value ?? 0;
  if (lt > 0.1 || rt > 0.1) { axes.zoom += lt - rt; setDevice("pad"); }
  return axes;
}
