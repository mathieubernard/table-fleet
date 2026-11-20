import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from "three";
import { adaptQuality, camera, canvas, cam, applyCamera, flash, fx, renderFrame, scene, screenSize, setFixedView } from "./render/stage";
import { CELL, CX, CZ, GX0, GZ0, LID_TOP, T, WATER, generate } from "./world/gen";
import { ChunkSet } from "./render/chunks";
import { makeVoxelDepthMaterial, makeVoxelMaterial, VU } from "./render/voxelMaterial";
import { sharedLambert } from "./render/voxModel";
import { Particles } from "./fx/particles";
import {
  Board, FLEET, N, cellC, cellId, cellName, cellR, chooseShot, clampAnchor,
  type Level, type Ship, type ShotKind, type ShotResult,
} from "./game/logic";
import {
  catModels, fragGeo, ghostBad, ghostOk, lidWreckMaterial, pegGeoRed, pegGeoWhite, pegMatRed, shellGeo, shipGeometry, wreckMaterial,
} from "./game/models";
import { audioUnlock, sfx, toggleMute } from "./game/audio";
import { currentDevice, initInput, pollInput, setDevice, usesCursor, type Action } from "./game/input";
import { applyStatic, lang, setLang, t, tMaybe, type Key } from "./i18n";

applyStatic();
const shipName = (id: string) => t(`ship.${id}` as Key);
const shipThe = (id: string) => t(`shipThe.${id}` as Key);
const shipLow = (id: string) => t(`shipLow.${id}` as Key);

const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

// ------------------------------------------------------------------ décor
const world = generate();
const chunks = new ChunkSet(world.grid, world.pal, scene, makeVoxelMaterial(), makeVoxelDepthMaterial());
console.info(`Table Fleet : ${chunks.total} voxels visibles`);

const inTray = (x: number, z: number) => {
  const lx = Math.abs(x - CX), lz = Math.abs(z - CZ);
  return lx < 36 && lz >= 4 && lz < 76;
};
const groundAt = (x: number, z: number) => {
  if (inTray(x, z)) return WATER;
  if (Math.abs(x - CX) < 54 && Math.abs(z - CZ) < 84) return T;
  return Math.hypot(x - CX, z - CZ) < 96 ? 8 : -60;
};
const debris = new Particles(scene, 3200, false, groundAt);
const embers = new Particles(scene, 1800, true, groundAt);

// Le chat de la maison dort sur la table, entre les deux panneaux.
const cat = (() => {
  const { body, tail, head } = catModels();
  const root = new Group();
  root.position.set(CX + 43, T, CZ);
  root.scale.setScalar(1);
  const bodyMesh = body.mesh(0.62);
  const headMesh = head.mesh(0.62);
  headMesh.position.set(0.62 * 5, 0.62 * 2, 0);
  const tailMesh = tail.mesh(0.62);
  tailMesh.position.set(-0.62 * 6, 0.62, 0);
  root.add(bodyMesh, headMesh, tailMesh);
  scene.add(root);
  return { root, headMesh, tailMesh, hop: 0, hopV: 0 };
})();

// ------------------------------------------------------------------ temps de simulation
let clock = 0;
let speed = 1;
interface Job { t: number; d: number; ease: (k: number) => number; fn: (k: number) => void; done: () => void }
const jobs: Job[] = [];
const inOut = (k: number) => k * k * (3 - 2 * k);
const linear = (k: number) => k;
const outBack = (k: number) => { const c = 1.7, u = k - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const outBounce = (k: number) => {
  if (k < 1 / 2.75) return 7.5625 * k * k;
  if (k < 2 / 2.75) { k -= 1.5 / 2.75; return 7.5625 * k * k + 0.75; }
  if (k < 2.5 / 2.75) { k -= 2.25 / 2.75; return 7.5625 * k * k + 0.9375; }
  k -= 2.625 / 2.75; return 7.5625 * k * k + 0.984375;
};
function tween(d: number, fn: (k: number) => void, ease: (k: number) => number = inOut): Promise<void> {
  return new Promise((done) => jobs.push({ t: 0, d, ease, fn, done }));
}
const wait = (d: number) => tween(d, () => undefined, linear);

function runJobs(dt: number): void {
  for (let i = jobs.length - 1; i >= 0; i--) {
    const j = jobs[i]!;
    j.t += dt;
    const k = Math.min(1, j.t / j.d);
    j.fn(j.ease(k));
    if (k >= 1) { jobs.splice(i, 1); j.done(); }
  }
}

// ------------------------------------------------------------------ coordonnées
const signOf = (p: number) => (p === 0 ? 1 : -1);
const cellX = (p: number, c: number) => CX + signOf(p) * (GX0 + CELL * c + 3.5);
const trayPos = (p: number, cell: number) =>
  new Vector3(cellX(p, cellC(cell)), WATER, CZ + signOf(p) * (GZ0 + CELL * cellR(cell) + 3.5));
const lidPos = (p: number, cell: number) =>
  new Vector3(cellX(p, cellC(cell)), LID_TOP - CELL * cellR(cell) - 2.5, CZ + signOf(p) * 3);
const seatYaw = (p: number) => (p === 0 ? 0.26 : Math.PI + 0.26);
const nearYaw = (from: number, yaw: number) => yaw + Math.round((from - yaw) / (Math.PI * 2)) * Math.PI * 2;

interface CamPose { yaw: number; pitch: number; view: number; target: Vector3 }
const isPortrait = () => { const { w, h } = screenSize(); return h > w; };
function homePose(p: number): CamPose {
  const pitch = 0.66, view = 128;
  // en portrait, le plateau remonte pour laisser la place aux flottes en bas de l'écran
  const { w, h } = screenSize();
  const lift = isPortrait() ? (80 * view * Math.max(1, (0.85 * h) / w)) / h / Math.cos(pitch) : 0;
  return { yaw: seatYaw(p), pitch, view, target: new Vector3(CX + signOf(p), T + 29 - lift, CZ + signOf(p) * 30) };
}
/** Vue de face calculée pour que toute la mer tienne à côté du panneau de déploiement. */
function placePose(p: number): CamPose {
  const { w: W, h: H } = screenSize();
  const pitch = 1.2;
  const box = $("place").getBoundingClientRect();
  document.documentElement.style.setProperty("--place-h", `${Math.round(box.height)}px`);
  const tallPanel = isPortrait();
  const needW = 80, needH = 78;
  const availW = tallPanel ? W : Math.max(120, W - box.right);
  const availH = tallPanel ? Math.max(120, H - box.height - 70) : H - 64;
  const view = Math.max((needH * H) / availH, (needW * H) / availW);
  const worldPerPx = view / H;
  const dx = tallPanel ? 0 : (box.right / 2) * worldPerPx;
  const dy = tallPanel ? ((box.height - 62) / 2) * worldPerPx : -20 * worldPerPx;
  return {
    yaw: p === 0 ? 0 : Math.PI, pitch, view,
    target: new Vector3(CX + signOf(p) * (-1.5 - dx), WATER, CZ + signOf(p) * (41 + dy / Math.sin(pitch))),
  };
}

function camTo(pose: CamPose, d: number, ease = inOut): Promise<void> {
  const y0 = cam.yaw, p0 = cam.pitch, v0 = cam.view;
  const t0 = cam.target.clone();
  return tween(d, (k) => {
    cam.yaw = y0 + (pose.yaw - y0) * k;
    cam.pitch = p0 + (pose.pitch - p0) * k;
    cam.view = v0 + (pose.view - v0) * k;
    cam.target.lerpVectors(t0, pose.target, k);
  }, ease);
}
const toHome = (p: number, d = 1.2) => camTo({ ...homePose(p), yaw: nearYaw(cam.yaw, seatYaw(p)) }, d);

// ------------------------------------------------------------------ objets de chaque camp
interface ShipView {
  ship: Ship;
  group: Group;
  mesh: Mesh;
  phase: number;
  drop: number;
  rock: number;
  rockV: number;
  wreck: boolean;
  wreckY: number;
}
interface Mark { kind: ShotKind; peg: Mesh; frag: Mesh | null }

class Side {
  board = new Board();
  readonly group = new Group();
  readonly views = new Map<number, ShipView>();
  readonly marks = new Map<number, Mark>();
  /** Fiches plantées dans le panneau : le relevé des tirs de ce joueur. */
  readonly lidPegs: Mesh[] = [];
  /** Navires adverses coulés, affichés en flammes sur le panneau : leurs cases brûlent. */
  readonly lidWrecks: number[] = [];
  fired = 0;
  landed = 0;

  constructor(readonly p: number) { scene.add(this.group); }

  clear(): void {
    this.board = new Board();
    this.group.clear();
    this.views.clear();
    this.marks.clear();
    this.lidPegs.length = 0;
    this.lidWrecks.length = 0;
    this.fired = 0;
    this.landed = 0;
  }

  addView(ship: Ship, drop = 0): ShipView {
    this.removeView(ship.index);
    const group = new Group();
    const mesh = new Mesh(shipGeometry(ship.def.id, this.p), sharedLambert);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const a = trayPos(this.p, ship.cells[0]!), b = trayPos(this.p, ship.cells[ship.cells.length - 1]!);
    group.position.copy(a).add(b).multiplyScalar(0.5);
    group.rotation.y = shipYaw(this.p, ship.vertical);
    this.group.add(group);
    const view: ShipView = { ship, group, mesh, phase: Math.random() * 6, drop, rock: 0, rockV: 0, wreck: false, wreckY: 0 };
    this.views.set(ship.index, view);
    updateVisibility();
    return view;
  }

  removeView(index: number): void {
    const v = this.views.get(index);
    if (v) { this.group.remove(v.group); this.views.delete(index); }
  }
}
const shipYaw = (p: number, vertical: boolean) => (p === 0 ? 0 : Math.PI) + (vertical ? -Math.PI / 2 : 0);

const sides = [new Side(0), new Side(1)] as const;
const enemyOf = (p: number) => sides[1 - p]!;

/** Qui regarde : les navires intacts des autres ne sont jamais dessinés. */
let viewer: number | "all" | null = null;
function setViewer(v: number | "all" | null): void { viewer = v; updateVisibility(); }
function updateVisibility(): void {
  for (const side of sides) {
    for (const v of side.views.values()) v.group.visible = viewer === "all" || viewer === side.p || v.wreck;
    for (const [cell, m] of side.marks) {
      if (!m.frag) continue;
      const ship = side.board.shipAt(cell);
      const wrecked = ship ? side.views.get(ship.index)?.wreck === true : false;
      m.frag.visible = !(viewer === side.p || viewer === "all" || wrecked);
    }
  }
}

function addMark(side: Side, cell: number, kind: ShotKind): void {
  const pos = trayPos(side.p, cell);
  const red = kind !== "miss";
  const peg = new Mesh(red ? pegGeoRed : pegGeoWhite, red ? pegMatRed : sharedLambert);
  peg.castShadow = true;
  peg.position.copy(pos);
  peg.position.y += red ? 2.2 : -0.6;
  side.group.add(peg);
  let frag: Mesh | null = null;
  if (red) {
    frag = new Mesh(fragGeo, sharedLambert);
    frag.position.copy(pos);
    frag.position.y -= 0.4;
    frag.rotation.y = Math.random() * 6;
    frag.castShadow = true;
    side.group.add(frag);
  }
  side.marks.set(cell, { kind, peg, frag });
  tween(0.28, (k) => { peg.scale.setScalar(Math.max(0.01, k)); }, outBack);
  updateVisibility();
}
function removeMark(side: Side, cell: number): void {
  const m = side.marks.get(cell);
  if (!m) return;
  side.group.remove(m.peg);
  if (m.frag) side.group.remove(m.frag);
  side.marks.delete(cell);
}

// ------------------------------------------------------------------ effets
const color = (r: number, g: number, b: number) => new Color(r, g, b);
const HOT = [color(2.6, 2.0, 0.8), color(2.4, 1.2, 0.3), color(2.0, 0.55, 0.12), color(1.3, 0.25, 0.08)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

let ripIdx = 0;
function ripple(x: number, z: number, amp: number): void {
  VU.uRip.value[ripIdx]!.set(x, z, clock, amp);
  ripIdx = (ripIdx + 1) % 4;
  // les navires voisins encaissent la vague
  for (const side of sides)
    for (const v of side.views.values()) {
      const d = Math.hypot(v.group.position.x - x, v.group.position.z - z);
      if (d < 50) v.rockV += (amp * 0.5 * (1 - d / 50)) * (Math.random() < 0.5 ? -1 : 1);
    }
}

function splash(pos: Vector3, power = 1): void {
  const whites = [0xf2fbfb, 0xd6eef2, 0xaad6e0];
  for (let i = 0; i < 90 * power; i++) {
    const a = Math.random() * Math.PI * 2;
    const core = Math.random() < 0.55;
    const sp = core ? rand(0, 3) : rand(4, 11);
    debris.spawn({
      x: pos.x + Math.cos(a) * rand(0, 1.6), y: pos.y + 0.5, z: pos.z + Math.sin(a) * rand(0, 1.6),
      vx: Math.cos(a) * sp, vy: core ? rand(22, 44) * power : rand(9, 20), vz: Math.sin(a) * sp,
      color: whites[Math.floor(Math.random() * 3)]!, size: rand(0.45, 1.25), life: rand(1, 1.9), gravity: 44, drag: 0.35, ground: 1, grow: -1, spin: 7,
    });
  }
  for (let i = 0; i < 26; i++) {
    embers.spawn({
      x: pos.x + rand(-1, 1), y: pos.y + rand(0, 5), z: pos.z + rand(-1, 1), vx: rand(-4, 4), vy: rand(8, 24), vz: rand(-4, 4),
      color: color(1.5, 1.8, 1.9), size: rand(0.2, 0.45), life: rand(0.3, 0.8), gravity: 30, drag: 0.8, ground: 0, grow: -1,
    });
  }
}

function explosion(pos: Vector3, power = 1): void {
  for (let i = 0; i < 80 * power; i++) {
    const a = Math.random() * Math.PI * 2, e = rand(-0.1, 1);
    const sp = rand(6, 30) * power;
    embers.spawn({
      x: pos.x + rand(-1.4, 1.4), y: pos.y + rand(0, 2.2), z: pos.z + rand(-1.4, 1.4),
      vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 8, vz: Math.sin(a) * Math.cos(e) * sp,
      color: HOT[Math.floor(Math.random() * 4)]!, size: rand(0.7, 2.6), life: rand(0.3, 1), gravity: 6, drag: 3.2, ground: 0, grow: 0.8,
    });
  }
  for (let i = 0; i < 16 * power; i++) {
    debris.spawn({
      x: pos.x + rand(-2.5, 2.5), y: pos.y + rand(1, 5), z: pos.z + rand(-2.5, 2.5),
      vx: rand(-4, 4), vy: rand(6, 19), vz: rand(-4, 4), color: Math.random() < 0.5 ? 0x4a433e : 0x6b635c,
      size: rand(0.9, 2), life: rand(1, 2.2), gravity: -2, drag: 1.5, ground: 0, grow: 0.8, spin: 2,
    });
  }
  for (let i = 0; i < 40 * power; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(8, 28);
    debris.spawn({
      x: pos.x, y: pos.y + 2, z: pos.z, vx: Math.cos(a) * sp, vy: rand(16, 40), vz: Math.sin(a) * sp,
      color: [0x4d555a, 0x8d979c, 0x33302c, 0xb8a886][Math.floor(Math.random() * 4)]!, size: rand(0.35, 1.1), life: rand(1.2, 2.2), gravity: 46, drag: 0.3, ground: 1, grow: -1, spin: 12,
    });
  }
  flash.position.set(pos.x, pos.y + 12, pos.z);
  flash.intensity = 1500 * power;
  fx.bloomBoost = Math.max(fx.bloomBoost, 0.4 * power);
  cam.shake = Math.max(cam.shake, 3.4 * power);
  catHop();
}

function catHop(): void { if (cat.hop <= 0.05) cat.hopV = 26; }

const shellMat = sharedLambert;
function flyShell(from: Vector3, to: Vector3, peak: number, dur: number, withTrail = true): Promise<void> {
  const m = new Mesh(shellGeo, shellMat);
  m.castShadow = true;
  scene.add(m);
  const ctrl = from.clone().add(to).multiplyScalar(0.5);
  ctrl.y = peak * 2 - (from.y + to.y) / 2;
  const prev = from.clone();
  const look = new Vector3();
  let acc = 0;
  let lastK = 0;
  return tween(dur, (k) => {
    const u = 1 - k;
    m.position.set(0, 0, 0).addScaledVector(from, u * u).addScaledVector(ctrl, 2 * u * k).addScaledVector(to, k * k);
    look.copy(m.position).add(m.position).sub(prev);
    if (look.distanceToSquared(m.position) > 1e-4) m.lookAt(look);
    acc += k - lastK;
    lastK = k;
    if (withTrail && acc > 0.012) {
      acc = 0;
      embers.spawn({ x: m.position.x, y: m.position.y, z: m.position.z, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-1, 1), color: HOT[Math.floor(Math.random() * 3)]!, size: rand(0.5, 1), life: 0.3, gravity: 0, drag: 2, ground: 0, grow: -1 });
      debris.spawn({ x: m.position.x, y: m.position.y, z: m.position.z, vy: rand(0.5, 2), color: 0xcfc8bc, size: rand(0.7, 1.3), life: rand(0.8, 1.5), gravity: -1, drag: 1.2, ground: 0, grow: 1, spin: 2 });
    }
    prev.copy(m.position);
  }, linear).then(() => { scene.remove(m); });
}

/** Le navire coulé apparaît entier sur le panneau du tireur, à sa place, et se met à brûler. */
function showWreckOnLid(p: number, ship: Ship): void {
  const side = sides[p]!;
  const s = signOf(p);
  const hull = new Mesh(shipGeometry(ship.def.id, 1 - p), lidWreckMaterial);
  hull.rotation.x = Math.PI / 2; // le pont fait face au joueur
  hull.castShadow = true;
  const turn = new Group();
  turn.rotation.z = ship.vertical ? -Math.PI / 2 : 0;
  turn.add(hull);
  const root = new Group();
  root.rotation.y = p === 0 ? 0 : Math.PI;
  root.add(turn);
  const a = lidPos(p, ship.cells[0]!), b = lidPos(p, ship.cells[ship.cells.length - 1]!);
  root.position.copy(a).add(b).multiplyScalar(0.5);
  root.position.z += s * 3.6;
  side.group.add(root);
  side.lidWrecks.push(...ship.cells);
  tween(0.45, (k) => { root.scale.setScalar(Math.max(0.01, k)); }, outBack);
  for (const cell of ship.cells) {
    const pos = lidPos(p, cell);
    for (let i = 0; i < 16; i++)
      embers.spawn({ x: pos.x + rand(-3, 3), y: pos.y + rand(-2, 2), z: pos.z + s * 5, vx: rand(-7, 7), vy: rand(2, 15), vz: s * rand(1, 9), color: HOT[Math.floor(Math.random() * 4)]!, size: rand(0.4, 1.3), life: rand(0.3, 0.8), gravity: 6, drag: 2, ground: 0, grow: -1 });
  }
  flash.position.set(root.position.x, root.position.y, root.position.z + s * 14);
  flash.intensity = Math.max(flash.intensity, 500);
  sfx.boom();
}

// ------------------------------------------------------------------ viseur
const reticle = (() => {
  const g = new Group();
  const gold = new MeshBasicMaterial({ color: new Color(2.2, 1.6, 0.55), toneMapped: false });
  const box = new BoxGeometry(1, 1, 1);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const a = new Mesh(box, gold); a.scale.set(1.8, 0.6, 0.6); a.position.set(sx * 2.4, sy * 2.8, 0);
    const b = new Mesh(box, gold); b.scale.set(0.6, 1.8, 0.6); b.position.set(sx * 2.8, sy * 2.4, 0);
    g.add(a, b);
  }
  g.visible = false;
  scene.add(g);
  const glass = new MeshBasicMaterial({ color: new Color(1.6, 1.2, 0.45), transparent: true, opacity: 0.17, depthWrite: false, toneMapped: false });
  const rowBar = new Mesh(box, glass), colBar = new Mesh(box, glass);
  rowBar.visible = colBar.visible = false;
  scene.add(rowBar, colBar);
  return { g, gold, rowBar, colBar };
})();

function showReticle(p: number, cell: number, blocked: boolean): void {
  const s = signOf(p);
  const pos = lidPos(p, cell);
  const z = pos.z + s * 2;
  reticle.g.visible = reticle.rowBar.visible = reticle.colBar.visible = true;
  reticle.g.rotation.x = 0;
  reticle.g.position.set(pos.x, pos.y, z);
  reticle.gold.color.copy(blocked ? color(2, 0.35, 0.25) : color(2.2, 1.6, 0.55));
  reticle.rowBar.visible = reticle.colBar.visible = !blocked;
  reticle.rowBar.position.set(CX + s * (GX0 + 30), pos.y, z - s * 0.7);
  reticle.rowBar.scale.set(60, 5, 0.2);
  reticle.colBar.position.set(pos.x, LID_TOP - 30, z - s * 0.7);
  reticle.colBar.scale.set(5, 60, 0.2);
}
/** Curseur couché sur la mer : le déploiement sans souris. */
function showTrayCursor(p: number, cell: number): void {
  reticle.g.visible = true;
  reticle.rowBar.visible = reticle.colBar.visible = false;
  reticle.g.rotation.x = Math.PI / 2;
  reticle.g.position.copy(trayPos(p, cell));
  reticle.g.position.y += 0.8;
  reticle.gold.color.copy(color(2.2, 1.6, 0.55));
}
function hideReticle(): void { reticle.g.visible = reticle.rowBar.visible = reticle.colBar.visible = false; }

// ------------------------------------------------------------------ interface
type Mode = "duo" | "ai";
const game = { mode: "duo" as Mode, level: "normal" as Level, turn: 0, over: false, names: [t("name.p1"), t("name.p2")] };
type Phase = "menu" | "place" | "aim" | "busy" | "pass" | "end";
let phase = "menu" as Phase;
const AI_P = 1;

function bannerShow(cls: string, big: string, small = ""): void {
  const el = $("banner");
  el.className = "";
  el.querySelector("b")!.textContent = big;
  el.querySelector("span")!.textContent = small;
  void el.offsetWidth;
  el.className = `show ${cls}`;
}

function setPhase(next: Phase): void {
  phase = next;
  if (next !== "busy") speed = 1;
  document.body.classList.toggle("busy", next === "busy");
  document.body.classList.toggle("placing", next === "place");
  document.body.classList.toggle("aiming", next === "aim");
  document.body.classList.toggle("playing", next === "place" || next === "aim" || next === "busy");
  (document.activeElement as HTMLElement | null)?.blur?.();
  renderHints();
}

function setTurnLabel(p: number, title: string, sub = ""): void {
  const el = $("turn");
  el.className = `hud p${p}`;
  el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ""}`;
}

function renderFleets(me: number): void {
  const mine = sides[me]!.board, theirs = sides[1 - me]!.board;
  const row = (name: string, pips: string, sunk: boolean) =>
    `<div class="fship ${sunk ? "sunk" : ""}"><span>${name}</span><span class="pips">${pips}</span></div>`;
  $("fleetMine").innerHTML = `<h2>${t("fleet.mine")}</h2>` + FLEET.map((def, i) => {
    const s = mine.ships.find((x) => x.index === i);
    const hits = s ? s.hits : 0;
    return row(shipName(def.id), Array.from({ length: def.len }, (_, k) => `<i class="${k < hits ? "hit" : ""}"></i>`).join(""), !!s && mine.isSunk(s));
  }).join("");
  $("fleetEnemy").innerHTML = `<h2>${t("fleet.enemy", { name: game.names[1 - me]! })}</h2>` + FLEET.map((def, i) => {
    const s = theirs.ships.find((x) => x.index === i);
    const sunk = !!s && theirs.isSunk(s);
    return row(shipName(def.id), Array.from({ length: def.len }, () => `<i class="${sunk ? "gone" : ""}"></i>`).join(""), sunk);
  }).join("");
  const a = sides[me]!;
  const acc = a.fired ? Math.round((a.landed / a.fired) * 100) : 0;
  $("score").innerHTML = t("score", { fired: a.fired, acc });
}

// ------------------------------------------------------------------ mise en place
interface PlaceState { p: number; active: number; vertical: boolean; hover: number; resolve: () => void }
let place: PlaceState | null = null;
const ghost = new Mesh(shipGeometry("carrier", 0), ghostOk);
ghost.visible = false;
scene.add(ghost);

function anchorFor(st: PlaceState): [number, number] {
  const len = FLEET[st.active]!.len;
  const back = Math.floor((len - 1) / 2);
  const c = cellC(st.hover), r = cellR(st.hover);
  return st.vertical ? clampAnchor(len, c, r - back, true) : clampAnchor(len, c - back, r, false);
}

function refreshGhost(): void {
  if (place && place.hover >= 0 && usesCursor()) showTrayCursor(place.p, place.hover);
  else if (phase === "place") hideReticle();
  if (!place || place.active < 0 || place.hover < 0) {
    ghost.visible = false;
    if (place && sides[place.p]!.board.complete) $("coord").innerHTML = t("place.complete", { ready: t(`ready.${currentDevice()}`) });
    else if (place && place.active >= 0 && currentDevice() === "touch") $("coord").innerHTML = t("place.tapSea", { ship: shipName(FLEET[place.active]!.id) });
    else $("coord").textContent = "";
    return;
  }
  const st = place, def = FLEET[st.active]!;
  const [c, r] = anchorFor(st);
  const ok = sides[st.p]!.board.canPlace(def.len, c, r, st.vertical);
  ghost.geometry = shipGeometry(def.id, st.p);
  ghost.material = ok ? ghostOk : ghostBad;
  const a = trayPos(st.p, cellId(c, r));
  const b = trayPos(st.p, st.vertical ? cellId(c, r + def.len - 1) : cellId(c + def.len - 1, r));
  ghost.position.copy(a).add(b).multiplyScalar(0.5);
  ghost.position.y += 0.2 + Math.sin(clock * 5) * 0.2;
  ghost.rotation.y = shipYaw(st.p, st.vertical);
  ghost.visible = true;
  $("coord").innerHTML = t("place.at", { ship: shipName(def.id), cell: cellName(cellId(c, r)) });
}

function renderPlaceList(): void {
  if (!place) return;
  const st = place, board = sides[st.p]!.board;
  $("placeList").innerHTML = FLEET.map((def, i) => {
    const done = board.ships.some((x) => x.index === i);
    return `<button type="button" data-i="${i}" class="${i === st.active ? "active" : ""} ${done ? "done" : ""}"><span>${shipName(def.id)}</span><span class="pips">${"<i></i>".repeat(def.len)}</span></button>`;
  }).join("");
  ($("btnDone") as HTMLButtonElement).disabled = !board.complete;
  renderRotate();
}

function renderRotate(): void {
  if (!place) return;
  const key = currentDevice() === "mouse" || currentDevice() === "keys" ? " (R)" : "";
  $("btnRotate").innerHTML = `<i class="rot ${place.vertical ? "v" : "h"}"></i>${t("place.rotate")}${key}`;
}

function dropShip(side: Side, ship: Ship, delay = 0): void {
  const view = side.addView(ship, 70);
  const start = () => {
    tween(0.62, (k) => { view.drop = 70 * (1 - k); }, outBounce);
    wait(0.26).then(() => {
      const p = view.group.position;
      splash(p, 0.45);
      ripple(p.x, p.z, 1);
      sfx.place();
    });
  };
  if (delay) wait(delay).then(start); else start();
}

/** Pose le navire en main là où est le fantôme, si la place est libre. */
function dropActive(): boolean {
  if (!place || place.hover < 0 || place.active < 0) return false;
  const st = place, board = sides[st.p]!.board;
  const def = FLEET[st.active]!;
  const [c, r] = anchorFor(st);
  if (!board.canPlace(def.len, c, r, st.vertical)) return false;
  dropShip(sides[st.p]!, board.place(st.active, c, r, st.vertical));
  lastDropAt = performance.now();
  st.active = FLEET.findIndex((_, i) => !board.ships.some((x) => x.index === i));
  // au doigt, pas de survol : le navire suivant attend le prochain appui
  if (currentDevice() === "touch") st.hover = -1;
  renderPlaceList();
  refreshGhost();
  renderHints();
  return true;
}

function placeClick(): void {
  if (!place || place.hover < 0) return;
  if (dropActive()) return;
  const under = sides[place.p]!.board.shipAt(place.hover);
  if (under) pickUp(under);
}

let lastDropAt = 0;

/** Déplace le curseur de déploiement ; le navire ne reste jamais coincé contre un bord. */
function placeMove(dx: number, dy: number): void {
  if (!place) return;
  const st = place;
  if (st.hover < 0) { st.hover = cellId(4, 4); refreshGhost(); return; }
  let c = cellC(st.hover), r = cellR(st.hover);
  if (st.active >= 0) {
    const back = Math.floor((FLEET[st.active]!.len - 1) / 2);
    const [ac, ar] = anchorFor(st);
    c = st.vertical ? ac : ac + back;
    r = st.vertical ? ar + back : ar;
  }
  c = Math.max(0, Math.min(N - 1, c + dx));
  r = Math.max(0, Math.min(N - 1, r + dy));
  st.hover = cellId(c, r);
  sfx.tick();
  refreshGhost();
}

function cycleShip(step: number): void {
  if (!place) return;
  const st = place, board = sides[st.p]!.board;
  const free = FLEET.map((_, i) => i).filter((i) => !board.ships.some((x) => x.index === i));
  if (!free.length) return;
  const at = free.indexOf(st.active);
  st.active = free[(at + step + free.length) % free.length]!;
  sfx.tick();
  renderPlaceList();
  refreshGhost();
}

function validateFleet(): void {
  if (!place || !sides[place.p]!.board.complete) return;
  const done = place.resolve;
  place = null;
  ghost.visible = false;
  hideReticle();
  $("coord").textContent = "";
  setFixedView(false);
  done();
}

function placeAction(a: Action): void {
  if (!place) return;
  const st = place;
  const board = sides[st.p]!.board;
  switch (a) {
    case "up": placeMove(0, -1); break;
    case "down": placeMove(0, 1); break;
    case "left": placeMove(-1, 0); break;
    case "right": placeMove(1, 0); break;
    case "rotate": rotateShip(); break;
    case "random": randomFleet(); break;
    case "next": cycleShip(1); break;
    case "prev": cycleShip(-1); break;
    case "start": validateFleet(); break;
    case "back": {
      const under = st.hover >= 0 ? board.shipAt(st.hover) : null;
      if (under) pickUp(under); else sfx.deny();
      break;
    }
    case "confirm":
      if (st.hover < 0) { placeMove(0, 0); break; }
      // flotte complète : un second appui valide, après un court délai anti-rebond
      if (board.complete) { if (performance.now() - lastDropAt > 450) validateFleet(); break; }
      placeClick();
      break;
    default: break;
  }
}

function pickUp(ship: Ship): void {
  if (!place) return;
  const st = place, side = sides[st.p]!;
  side.board.remove(ship.index);
  side.removeView(ship.index);
  st.active = ship.index;
  st.vertical = ship.vertical;
  // sans survol, le fantôme reste exactement là où était le navire
  if (currentDevice() !== "mouse") st.hover = ship.cells[Math.floor((ship.def.len - 1) / 2)]!;
  sfx.tick();
  renderPlaceList();
  refreshGhost();
}

function rotateShip(): void {
  if (!place) return;
  // plus rien en main : on reprend le dernier navire posé pour le tourner
  if (place.active < 0) {
    const last = sides[place.p]!.board.ships.at(-1);
    if (!last) { sfx.deny(); return; }
    pickUp(last);
  }
  place.vertical = !place.vertical;
  sfx.tick();
  renderRotate();
  refreshGhost();
}

function randomFleet(): void {
  if (!place) return;
  const side = sides[place.p]!;
  for (const i of [...side.views.keys()]) side.removeView(i);
  side.board.randomize();
  side.board.ships.forEach((ship, i) => dropShip(side, ship, i * 0.09));
  place.active = -1;
  lastDropAt = performance.now();
  renderPlaceList();
  refreshGhost();
  renderHints();
}

function placement(p: number): Promise<void> {
  return new Promise((resolve) => {
    place = { p, active: 0, vertical: false, hover: -1, resolve };
    $("placeTitle").textContent = game.mode === "ai" ? t("place.title") : t("place.titleNamed", { name: game.names[p]! });
    setTurnLabel(p, game.mode === "ai" ? t("turn.deploy") : `${game.names[p]}`, t("turn.deploySub"));
    setPhase("place");
    if (usesCursor()) place.hover = cellId(4, 4);
    renderPlaceList();
    refreshGhost();
    setFixedView(true);
    const pose = placePose(p);
    camTo({ ...pose, yaw: nearYaw(cam.yaw, pose.yaw) }, 1.1);
  });
}

// ------------------------------------------------------------------ passage de main
let passResolve: (() => void) | null = null;
let passOpenedAt = 0;
/** Un appui nerveux sur « feu » ne doit jamais passer la main à l'aveugle. */
function confirmReady(): void {
  if (passResolve && performance.now() - passOpenedAt > 900) passResolve();
}
const orbit = { speed: 0, on: false, phase: 0 };

/** Brouille l'écran, cache toutes les flottes et fait tourner la caméra autour de la table. */
async function passTo(next: number, title: string, sub: string): Promise<void> {
  setPhase("pass");
  hideReticle();
  sfx.scramble();
  const s0 = fx.scramble;
  await tween(0.5, (k) => { fx.scramble = s0 + (1 - s0) * k; });
  // écran illisible : plus aucun navire n'est dessiné à partir d'ici
  setViewer(null);
  sfx.sonar();
  $("passTitle").innerHTML = title;
  $("passSub").textContent = sub;
  $("btnReady").textContent = t("pass.ready", { name: game.names[next]! });
  $("pass").classList.add("on");
  passOpenedAt = performance.now();
  uiReset();
  orbit.on = true;
  orbit.phase = 0;
  orbit.speed = 3.4;
  const y0 = cam.pitch, v0 = cam.view;
  const t0 = cam.target.clone();
  const centre = new Vector3(CX, T + 14, CZ);
  tween(0.9, (k) => {
    cam.pitch = y0 + (0.72 - y0) * k;
    cam.view = v0 + (210 - v0) * k;
    cam.target.lerpVectors(t0, centre, k);
    fx.scramble = 1 - 0.5 * k;
  });
  tween(2.4, (k) => { orbit.speed = 3.4 + (0.85 - 3.4) * k; });
  await new Promise<void>((resolve) => { passResolve = resolve; });
  passResolve = null;
  $("pass").classList.remove("on");
  sfx.ready();
  uiPaint();
  // Le nouveau joueur a confirmé : la caméra file s'asseoir à sa place.
  orbit.on = false;
  setViewer(next);
  renderFleets(next);
  const target = homePose(next);
  const seat = nearYaw(cam.yaw, seatYaw(next));
  const pose = { ...target, yaw: seat + (seat < cam.yaw + 1.5 ? Math.PI * 2 : 0) };
  const sc = fx.scramble;
  setPhase("busy");
  speed = 1;
  await Promise.all([
    camTo(pose, 1.6),
    wait(0.5).then(() => tween(1.1, (k) => { fx.scramble = sc * (1 - k); })),
  ]);
  fx.scramble = 0;
}

// ------------------------------------------------------------------ tirs
function launchPoint(p: number): Vector3 {
  const side = sides[p]!;
  const afloat = [...side.views.values()].filter((v) => !v.wreck);
  const v = afloat[Math.floor(Math.random() * afloat.length)];
  if (!v) return new Vector3(CX, WATER + 2, CZ + signOf(p) * 40);
  v.rockV += 3;
  const pos = v.group.position.clone();
  pos.y += 4;
  for (let i = 0; i < 26; i++) {
    embers.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-9, 9), vy: rand(4, 26), vz: rand(-9, 9), color: HOT[Math.floor(Math.random() * 3)]!, size: rand(0.4, 1.3), life: rand(0.15, 0.45), gravity: 4, drag: 3, ground: 0, grow: -1 });
    debris.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: rand(-3, 3), vy: rand(2, 9), vz: rand(-3, 3), color: 0xd9d3c6, size: rand(0.9, 1.9), life: rand(0.7, 1.5), gravity: -2, drag: 2, ground: 0, grow: 1, spin: 2 });
  }
  flash.position.copy(pos);
  flash.intensity = Math.max(flash.intensity, 500);
  ripple(pos.x, pos.z, 0.7);
  return pos;
}

async function sinkShip(side: Side, ship: Ship): Promise<void> {
  const view = side.views.get(ship.index);
  if (!view) return;
  const wasVisible = view.group.visible;
  view.wreck = true;
  view.mesh.material = wreckMaterial;
  view.group.visible = true;
  updateVisibility();
  const fromY = wasVisible ? 0 : -6;
  for (const cell of ship.cells) {
    explosion(trayPos(side.p, cell), 0.7);
    ripple(trayPos(side.p, cell).x, trayPos(side.p, cell).z, 1.4);
    await wait(0.15);
  }
  await tween(1.5, (k) => {
    view.wreckY = fromY + (-1.5 - fromY) * k;
    view.mesh.rotation.x = 0.34 * k;
    view.mesh.rotation.z = -0.1 * k;
  });
}

function undoSink(side: Side, ship: Ship): void {
  const view = side.views.get(ship.index);
  if (!view) return;
  view.wreck = false;
  view.wreckY = 0;
  view.mesh.material = sharedLambert;
  view.mesh.rotation.set(0, 0, 0);
}

async function impact(side: Side, res: ShotResult, subtitle: string): Promise<void> {
  const pos = trayPos(side.p, res.cell);
  addMark(side, res.cell, res.kind);
  if (res.kind === "miss") {
    splash(pos, 1.1);
    ripple(pos.x, pos.z, 2.2);
    cam.shake = 1;
    sfx.splash();
    bannerShow("miss", t("shot.miss"), subtitle);
    await wait(1.25);
    return;
  }
  explosion(pos, 1.25);
  ripple(pos.x, pos.z, 3.4);
  if (res.kind === "hit") {
    sfx.boom();
    bannerShow("hit", t("shot.hit"), subtitle);
    await wait(1.5);
    return;
  }
  sfx.sunk();
  bannerShow("sunk", t("shot.sunk"), subtitle);
  await sinkShip(side, res.ship!);
  await wait(0.5);
}

/** Le joueur tire : la caméra franchit les panneaux et suit l'obus jusqu'à la mer adverse. */
async function outgoing(p: number, res: ShotResult): Promise<void> {
  const foe = enemyOf(p);
  const me = sides[p]!;
  setPhase("busy");
  $("coord").textContent = "";
  const lid = lidPos(p, res.cell);
  sfx.tick();
  // verrouillage : le viseur clignote une demi-seconde
  await tween(0.35, (k) => { reticle.g.scale.setScalar(1 + Math.sin(k * Math.PI * 4) * 0.2); }, linear);
  reticle.g.scale.setScalar(1);
  hideReticle();

  const from = launchPoint(p);
  const to = trayPos(foe.p, res.cell);
  sfx.launch();
  // Vue depuis la place de l'adversaire : la mer s'y présente exactement comme le panneau visé.
  const yaw = nearYaw(cam.yaw, seatYaw(p)) + Math.PI;
  const lookAt = new Vector3(CX + signOf(foe.p) * -2, WATER, CZ + signOf(foe.p) * 40);
  lookAt.lerp(to, 0.25);
  await Promise.all([
    camTo({ yaw, pitch: 1.02, view: 100, target: lookAt }, 1.55),
    flyShell(from, to, 125, 1.75),
  ]);
  const name = cellName(res.cell);
  await impact(foe, res, res.kind === "sunk" ? t("shot.sunkOut", { ship: shipThe(res.ship!.def.id), cell: name }) : t("shot.at", { cell: name }));

  // la fiche revient se planter dans le panneau du tireur
  const red = res.kind !== "miss";
  const peg = new Mesh(red ? pegGeoRed : pegGeoWhite, red ? pegMatRed : sharedLambert);
  peg.castShadow = true;
  me.group.add(peg);
  me.lidPegs.push(peg);
  const start = to.clone().add(new Vector3(0, 6, 0));
  const mid = start.clone().add(lid).multiplyScalar(0.5);
  mid.y = 118;
  const tilt = signOf(p) * (Math.PI / 2);
  await Promise.all([
    toHome(p, 1.15),
    tween(1.05, (k) => {
      const u = 1 - k;
      peg.position.set(0, 0, 0).addScaledVector(start, u * u).addScaledVector(mid, 2 * u * k).addScaledVector(lid, k * k);
      peg.rotation.x = tilt * k;
      peg.scale.setScalar(1 + Math.sin(k * Math.PI) * 1.2);
    }),
  ]);
  sfx.peg();
  for (let i = 0; i < 12; i++)
    embers.spawn({ x: lid.x, y: lid.y, z: lid.z + signOf(p) * 3, vx: rand(-9, 9), vy: rand(-3, 12), vz: signOf(p) * rand(2, 10), color: red ? color(2.2, 0.5, 0.3) : color(1.9, 1.9, 1.8), size: rand(0.25, 0.6), life: rand(0.2, 0.5), gravity: 18, drag: 1, ground: 0, grow: -1 });
  renderFleets(p);
  if (res.kind === "sunk") {
    showWreckOnLid(p, res.ship!);
    bannerShow("sunk", shipName(res.ship!.def.id), t("shot.lid"));
    await wait(1.5);
  }
  await wait(0.35);
}

/** Le tir adverse arrive de derrière le panneau et tombe sur ta mer. */
async function incoming(p: number, shooter: string, res: ShotResult): Promise<void> {
  setPhase("busy");
  const side = sides[p]!;
  const name = cellName(res.cell);
  bannerShow("info", t("shot.incoming", { shooter, cell: name }));
  const to = trayPos(p, res.cell);
  const from = new Vector3(CX + rand(-20, 20), T + 90, CZ - signOf(p) * 42);
  const zoom = new Vector3(CX + signOf(p) * -2, WATER + 2, CZ + signOf(p) * 40).lerp(to, 0.3);
  await camTo({ yaw: nearYaw(cam.yaw, seatYaw(p)), pitch: 0.98, view: 98, target: zoom }, 0.8);
  sfx.launch();
  await flyShell(from, to, 138, 1.25);
  await impact(side, res, res.kind === "sunk" ? t("shot.sunkIn", { shooter, ship: shipLow(res.ship!.def.id) }) : t("shot.at", { cell: name }));
  renderFleets(p);
  await toHome(p, 0.9);
}

function chooseTarget(p: number): Promise<number> {
  return new Promise((resolve) => {
    aim = { p, hover: -1, resolve };
    setTurnLabel(p, game.mode === "ai" ? t("aim.turn") : t("aim.turnNamed", { name: game.names[p]! }), t("aim.sub"));
    setPhase("aim");
    renderFleets(p);
    if (usesCursor()) aim.hover = aimCursor[p]!;
    refreshAim();
  });
}
interface AimState { p: number; hover: number; resolve: (cell: number) => void }
let aim: AimState | null = null;

/** Dernière case visée par chaque joueur : le curseur y revient. */
const aimCursor = [cellId(4, 4), cellId(4, 4)];

function fireAtCursor(): void {
  if (!aim || aim.hover < 0) return;
  if (enemyOf(aim.p).board.shots[aim.hover] !== 0) { sfx.deny(); return; }
  aim.resolve(aim.hover);
}

function aimMove(dx: number, dy: number): void {
  if (!aim) return;
  const p = aim.p;
  if (aim.hover < 0) aim.hover = aimCursor[p]!;
  else aim.hover = cellId(Math.max(0, Math.min(N - 1, cellC(aim.hover) + dx)), Math.max(0, Math.min(N - 1, cellR(aim.hover) + dy)));
  aimCursor[p] = aim.hover;
  sfx.tick();
  refreshAim();
}

function aimAction(a: Action): void {
  if (!aim) return;
  switch (a) {
    case "up": aimMove(0, -1); break;
    case "down": aimMove(0, 1); break;
    case "left": aimMove(-1, 0); break;
    case "right": aimMove(1, 0); break;
    case "confirm":
      if (aim.hover < 0) aimMove(0, 0); else fireAtCursor();
      break;
    case "rotate":
    case "recenter":
      toHome(aim.p, 0.5);
      break;
    default: break;
  }
}

function refreshAim(): void {
  if (!aim) return;
  const fire = $("btnFire") as HTMLButtonElement;
  if (aim.hover < 0) {
    hideReticle();
    $("coord").innerHTML = currentDevice() === "touch" ? t("aim.touch") : "";
    fire.disabled = true;
    return;
  }
  const blocked = enemyOf(aim.p).board.shots[aim.hover] !== 0;
  fire.disabled = blocked;
  showReticle(aim.p, aim.hover, blocked);
  $("coord").innerHTML = blocked ? t("aim.blocked", { cell: cellName(aim.hover) }) : t("aim.fire", { cell: cellName(aim.hover) });
  canvas.style.cursor = blocked ? "not-allowed" : "crosshair";
}

// ------------------------------------------------------------------ déroulement
const machineWord = () => t(currentDevice() === "touch" ? "machine.touch" : "machine.pc");
const passTitle = (p: number) => t("pass.to", { machine: machineWord(), who: `<em style="color:var(--p${p})">${game.names[p]}</em>` });

async function runGame(mode: Mode): Promise<void> {
  orbit.on = false;
  game.mode = mode;
  game.names = mode === "duo" ? [t("name.p1"), t("name.p2")] : [t("name.you"), t("name.cpu")];
  game.over = false;
  game.turn = 0;
  for (const s of sides) s.clear();
  $("menu").classList.remove("on");
  $("end").classList.remove("on");
  uiPaint();
  endFx = false;
  setViewer(0);

  // ---- déploiement
  await placement(0);
  if (mode === "duo") {
    await passTo(1, passTitle(1), t("pass.deploy2"));
    setViewer(1);
    await placement(1);
    await passTo(0, passTitle(0), t("pass.begin"));
  } else {
    sides[AI_P]!.board.randomize();
    for (const ship of sides[AI_P]!.board.ships) sides[AI_P]!.addView(ship);
    updateVisibility();
    setPhase("busy");
    speed = 1;
    await toHome(0, 1.3);
  }
  bannerShow("info", t(mode === "duo" ? "start.duo" : "start.ai"));

  // ---- échanges de tirs
  let pending: { res: ShotResult; shooter: string } | null = null;
  for (;;) {
    const p = game.turn;
    if (mode === "ai" && p === AI_P) {
      setPhase("busy");
      setTurnLabel(AI_P, t("ai.aiming"), t("ai.calm"));
      await wait(0.9);
      const shot = chooseShot(sides[0].board, game.level);
      const res = sides[0].board.receive(shot);
      const a = sides[AI_P]!;
      a.fired++;
      if (res.kind !== "miss") a.landed++;
      await incoming(0, game.names[AI_P]!, res);
      if (res.kind === "sunk") showWreckOnLid(AI_P, res.ship!);
      if (res.over) { await finish(AI_P); return; }
    } else {
      if (pending) {
        await incoming(p, pending.shooter, pending.res);
        pending = null;
      }
      const cell = await chooseTarget(p);
      aim = null;
      canvas.style.cursor = "";
      const foe = enemyOf(p);
      const res = foe.board.receive(cell);
      const me = sides[p]!;
      me.fired++;
      if (res.kind !== "miss") me.landed++;
      setTurnLabel(p, game.mode === "ai" ? t("fire.self", { cell: cellName(cell) }) : t("fire.named", { name: game.names[p]!, cell: cellName(cell) }));
      await outgoing(p, res);
      if (res.over) { await finish(p); return; }
      if (mode === "duo") {
        const next = 1 - p;
        pending = { res, shooter: game.names[p]! };
        const passing = passTo(next, passTitle(next), t("pass.shot", { shooter: game.names[p]!, next: game.names[next]! }));
        // sitôt l'écran brouillé, le tir est retiré pour être rejoué chez l'adversaire
        wait(0.55).then(() => {
          removeMark(foe, res.cell);
          if (res.kind === "sunk") undoSink(foe, res.ship!);
          updateVisibility();
        });
        await passing;
      }
    }
    game.turn = 1 - p;
  }
}

let endFx = false;
let fwAcc = 0;

async function finish(winner: number): Promise<void> {
  game.over = true;
  setPhase("end");
  hideReticle();
  setViewer("all");
  const youWin = game.mode === "duo" || winner !== AI_P;
  (youWin ? sfx.victory : sfx.defeat)();
  bannerShow("sunk", t("end.banner"));
  endFx = youWin;
  orbit.on = true;
  orbit.speed = 0.28;
  orbit.phase = 0;
  const y0 = cam.pitch, v0 = cam.view;
  const t0 = cam.target.clone();
  const centre = new Vector3(CX, T + 16, CZ);
  tween(1.8, (k) => {
    cam.pitch = y0 + (0.72 - y0) * k;
    cam.view = v0 + (205 - v0) * k;
    cam.target.lerpVectors(t0, centre, k);
  });
  await wait(1.7);
  const w = sides[winner]!;
  const acc = w.fired ? Math.round((w.landed / w.fired) * 100) : 0;
  $("endTitle").textContent = game.mode === "duo"
    ? t("end.duo", { name: game.names[winner]! })
    : t(youWin ? "end.win" : "end.lose");
  $("endSub").innerHTML = t("end.sub", { fired: w.fired, landed: w.landed, acc });
  $("end").classList.add("on");
  uiReset();
}

// ------------------------------------------------------------------ entrées
const pointer = new Vector2();
const ray = new Raycaster();
const hit = new Vector3();
const planeTray = new Plane(new Vector3(0, 1, 0), -WATER);

function pickTray(p: number): number {
  ray.setFromCamera(pointer, camera);
  if (!ray.ray.intersectPlane(planeTray, hit)) return -1;
  const s = signOf(p);
  const c = Math.floor((s * (hit.x - CX) - GX0) / CELL);
  const r = Math.floor((s * (hit.z - CZ) - GZ0) / CELL);
  return c >= 0 && r >= 0 && c < N && r < N ? cellId(c, r) : -1;
}
function pickLid(p: number): number {
  ray.setFromCamera(pointer, camera);
  const s = signOf(p);
  const plane = new Plane(new Vector3(0, 0, s), -s * (CZ + s * 4));
  if (!ray.ray.intersectPlane(plane, hit)) return -1;
  const c = Math.floor((s * (hit.x - CX) - GX0) / CELL);
  const r = Math.floor((LID_TOP - hit.y) / CELL);
  return c >= 0 && r >= 0 && c < N && r < N ? cellId(c, r) : -1;
}
function updatePointer(e: PointerEvent): void {
  const { w, h } = screenSize();
  pointer.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
}
function hoverUpdate(): void {
  if (phase === "place" && place) {
    const h = pickTray(place.p);
    if (h !== place.hover) { place.hover = h; refreshGhost(); }
  } else if (phase === "aim" && aim) {
    const h = pickLid(aim.p);
    if (h !== aim.hover) { aim.hover = h; if (h >= 0) sfx.tick(); refreshAim(); }
  }
}

interface Drag { x: number; y: number; moved: boolean; button: number; touch: boolean; aiming: boolean; picked: boolean; cell: number; cellMoved: boolean }
let drag: Drag | null = null;
const fingers = new Map<number, { x: number; y: number }>();
let pinchDist = 0;
const fingerSpread = () => {
  const [a, b] = [...fingers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};

window.addEventListener("pointerdown", (e) => setDevice(e.pointerType === "mouse" ? "mouse" : "touch"), true);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  audioUnlock();
  canvas.setPointerCapture(e.pointerId);
  updatePointer(e);
  const touch = e.pointerType !== "mouse";
  if (touch) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // deux doigts à la visée : on zoome, le geste en cours est annulé
  if (fingers.size >= 2) {
    drag = null;
    pinchDist = fingerSpread();
    return;
  }
  drag = { x: e.clientX, y: e.clientY, moved: false, button: e.button, touch, aiming: false, picked: false, cell: -1, cellMoved: false };
  if (!touch) return;
  if (phase === "place" && place) {
    const h = pickTray(place.p);
    if (h < 0) return;
    drag.cell = h;
    const under = sides[place.p]!.board.shipAt(h);
    place.hover = h;
    if (under) { pickUp(under); drag.picked = true; }
    refreshGhost();
  } else if (phase === "aim" && aim) {
    const h = pickLid(aim.p);
    if (h < 0) return;
    drag.aiming = true;
    drag.cell = h;
    if (h !== aim.hover) sfx.tick();
    else drag.cell = -2; // appui sur la case déjà visée : un relâché sur place tire
    aim.hover = h;
    aimCursor[aim.p] = h;
    refreshAim();
  }
});
canvas.addEventListener("pointermove", (e) => {
  updatePointer(e);
  if (e.pointerType === "mouse" && (e.movementX || e.movementY)) setDevice("mouse");
  if (e.pointerType !== "mouse" && fingers.has(e.pointerId)) fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (fingers.size >= 2) {
    const spread = fingerSpread();
    if (phase === "aim" && pinchDist > 0 && spread > 0) cam.view = Math.min(260, Math.max(50, cam.view * (pinchDist / spread)));
    pinchDist = spread;
    return;
  }
  if (e.pointerType !== "mouse" && !drag) return;
  if (drag?.touch && phase === "place" && place) {
    const h = pickTray(place.p);
    if (h >= 0 && h !== place.hover) { place.hover = h; drag.cellMoved = true; refreshGhost(); }
    return;
  }
  if (drag?.aiming && phase === "aim" && aim) {
    const h = pickLid(aim.p);
    if (h >= 0 && h !== aim.hover) { aim.hover = h; aimCursor[aim.p] = h; drag.cellMoved = true; sfx.tick(); refreshAim(); }
    return;
  }
  if (drag && phase === "aim") {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.moved || Math.abs(dx) + Math.abs(dy) > 5) {
      drag.moved = true;
      cam.yaw -= dx * 0.006;
      cam.pitch = Math.min(1.5, Math.max(0.12, cam.pitch + dy * 0.004));
      drag.x = e.clientX; drag.y = e.clientY;
      return;
    }
  }
  hoverUpdate();
});
function endFinger(e: PointerEvent): void {
  fingers.delete(e.pointerId);
  if (fingers.size < 2) pinchDist = 0;
}
canvas.addEventListener("pointercancel", (e) => { endFinger(e); drag = null; });
canvas.addEventListener("pointerup", (e) => {
  audioUnlock(); // iOS n'autorise le son qu'à la fin d'un geste
  endFinger(e);
  const d = drag;
  drag = null;
  if (!d) return;
  updatePointer(e);
  if (d.touch) {
    if (phase === "busy") { speed = 3; return; }
    if (phase === "place" && place && d.cell >= 0) {
      // un simple appui sur un navire le garde en main, pour le faire pivoter
      if (d.picked && !d.cellMoved) return;
      if (place.active >= 0 && !dropActive()) sfx.deny();
      return;
    }
    // viser ne tire jamais : seul un second appui sur la même case, ou le bouton Feu
    if (phase === "aim" && d.aiming && d.cell === -2 && !d.cellMoved) fireAtCursor();
    return;
  }
  if (d.moved) return;
  if (phase === "busy") { speed = 3; return; }
  if (phase === "place") {
    if (d.button === 2) { rotateShip(); return; }
    hoverUpdate();
    placeClick();
  } else if (phase === "aim" && aim) {
    if (d.button !== 0) return;
    hoverUpdate();
    fireAtCursor();
  }
});
canvas.addEventListener("wheel", (e) => {
  if (phase !== "aim") return;
  cam.view = Math.min(260, Math.max(50, cam.view * Math.exp(e.deltaY * 0.0012)));
  e.preventDefault();
}, { passive: false });
// pas de zoom de page ni de loupe au doigt : tout passe par le jeu
for (const type of ["gesturestart", "gesturechange", "dblclick"]) document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
window.addEventListener("touchend", audioUnlock, { passive: true });
window.addEventListener("resize", () => {
  if (phase === "place" && place) camTo(placePose(place.p), 0.25);
});

// ------------------------------------------------------------------ clavier et manette
function renderHints(): void {
  const dev = currentDevice();
  document.body.dataset["input"] = dev;
  $("controls").innerHTML = dev === "mouse" ? "" : tMaybe(`hint.${dev}.${phase}`) ?? "";
  $("hintFast").textContent = t(`fast.${dev}`);
  $("placeHelp").textContent = tMaybe(`place.help.${dev}`) ?? "";
  renderRotate();
}

/** Navigation dans les écrans : une grille de boutons, ligne par ligne. */
const ui = { row: 0, col: 0 };
function uiRows(): HTMLElement[][] {
  const on = (id: string) => $(id).classList.contains("on");
  if (phase === "menu" && on("menu")) return [[$("btnDuo")], [$("btnAi")], [...$("levels").querySelectorAll("button")]];
  if (phase === "pass" && on("pass")) return [[$("btnReady")]];
  if (phase === "end" && on("end")) return [[$("btnAgain"), $("btnMenu")]];
  return [];
}
function uiPaint(): void {
  document.querySelectorAll(".navfocus").forEach((x) => x.classList.remove("navfocus"));
  if (!usesCursor()) return;
  uiRows()[ui.row]?.[ui.col]?.classList.add("navfocus");
}
function uiReset(): void {
  ui.row = 0;
  ui.col = 0;
  uiPaint();
  renderHints();
}
function uiAction(a: Action): void {
  const rows = uiRows();
  if (!rows.length) return;
  const levelRow = phase === "menu" && ui.row === 2;
  const moveRow = (d: number) => {
    ui.row = Math.max(0, Math.min(rows.length - 1, ui.row + d));
    ui.col = phase === "menu" && ui.row === 2 ? rows[2]!.findIndex((b) => b.classList.contains("active")) : 0;
    sfx.tick();
  };
  switch (a) {
    case "up": moveRow(-1); break;
    case "down": moveRow(1); break;
    case "left":
    case "right": {
      const row = rows[ui.row]!;
      ui.col = Math.max(0, Math.min(row.length - 1, ui.col + (a === "left" ? -1 : 1)));
      if (levelRow) row[ui.col]!.click(); // le niveau s'applique dès qu'on le survole
      sfx.tick();
      break;
    }
    case "confirm":
    case "start":
      if (levelRow) $("btnAi").click();
      else rows[ui.row]?.[ui.col]?.click();
      return;
    case "back":
      if (phase === "end") $("btnMenu").click();
      return;
    default: return;
  }
  uiPaint();
}

function onAction(a: Action): void {
  audioUnlock();
  if (a === "mute") { $("mute").textContent = toggleMute() ? "🔇" : "🔊"; return; }
  if (phase === "place") placeAction(a);
  else if (phase === "aim") aimAction(a);
  else if (phase === "busy") { if (a === "confirm" || a === "start") speed = 3; }
  else uiAction(a);
}

initInput(onAction, () => {
  renderHints();
  uiPaint();
  if (phase === "place") refreshGhost();
  if (phase === "aim") refreshAim();
});
window.addEventListener("gamepadconnected", () => bannerShow("info", t("pad.connected")));

$("btnDuo").addEventListener("click", () => { audioUnlock(); void runGame("duo"); });
$("btnAi").addEventListener("click", () => { audioUnlock(); void runGame("ai"); });
$("levels").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b) return;
  game.level = b.dataset["level"] as Level;
  $("levels").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
});
$("placeList").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest("button");
  if (!b || !place) return;
  const i = Number(b.dataset["i"]);
  const ship = sides[place.p]!.board.ships.find((x) => x.index === i);
  if (ship) pickUp(ship);
  else { place.active = i; renderPlaceList(); refreshGhost(); }
});
$("btnRotate").addEventListener("click", rotateShip);
$("btnFire").addEventListener("click", fireAtCursor);
$("btnRandom").addEventListener("click", randomFleet);
$("btnDone").addEventListener("click", validateFleet);
$("btnReady").addEventListener("click", confirmReady);
$("btnAgain").addEventListener("click", () => {
  orbit.on = false;
  void runGame(game.mode);
});
$("btnMenu").addEventListener("click", () => {
  orbit.on = true;
  orbit.speed = 0.16;
  endFx = false;
  $("end").classList.remove("on");
  for (const s of sides) s.clear();
  setViewer(null);
  setPhase("menu");
  $("menu").classList.add("on");
  uiReset();
});
$("mute").addEventListener("click", () => { $("mute").textContent = toggleMute() ? "🔇" : "🔊"; });

// ------------------------------------------------------------------ boucle
let radius = 0;
let last = performance.now();
let frame = 0;
let fireAcc = 0;
let lidFireAcc = 0;
let steamAcc = 0;
let menuAcc = 2;

function burstFirework(): void {
  const x = CX + rand(-80, 80), y = rand(90, 125), z = CZ + rand(-80, 80);
  const base = [color(2.4, 1.3, 0.4), color(0.6, 1.5, 2.4), color(2.4, 0.5, 0.5), color(1.2, 2.3, 0.9), color(2.3, 2.1, 1.3)][Math.floor(Math.random() * 5)]!;
  for (let i = 0; i < 80; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.acos(rand(-1, 1)), sp = rand(14, 30);
    embers.spawn({ x, y, z, vx: Math.sin(e) * Math.cos(a) * sp, vy: Math.cos(e) * sp, vz: Math.sin(e) * Math.sin(a) * sp, color: base, size: rand(0.5, 1.1), life: rand(0.8, 1.5), gravity: 16, drag: 1.5, ground: 0, grow: -1 });
  }
  sfx.firework();
}

let headless = false;
function tick(now: number): void {
  if (!headless) adaptQuality((now - last) / 1000);
  const realDt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  if (now > last) last = now;
  const dt = realDt * speed;
  clock += dt;
  frame++;
  runJobs(dt);

  radius += (135 - radius) * Math.min(1, (radius < 5 ? 0.6 : 1.1) * dt) + (radius < 135 ? dt * 3 : 0);
  if (frame % 2 === 0) chunks.update(clock, CX, CZ, radius);

  const axes = pollInput(realDt);
  if (phase === "aim") {
    cam.yaw += axes.yaw * realDt * 1.6;
    cam.pitch = Math.min(1.5, Math.max(0.12, cam.pitch + axes.pitch * realDt * 0.9));
    cam.view = Math.min(260, Math.max(50, cam.view * Math.exp(axes.zoom * realDt * 1.2)));
  }

  if (phase === "menu") {
    cam.yaw += dt * 0.14;
    menuAcc -= dt;
    if (menuAcc < 0 && radius > 100) {
      menuAcc = rand(1.6, 3);
      const p = Math.random() < 0.5 ? 0 : 1;
      const cell = Math.floor(Math.random() * N * N);
      const to = trayPos(p, cell);
      const from = new Vector3(CX + rand(-60, 60), 110, CZ - signOf(p) * 60);
      flyShell(from, to, 130, 1.1).then(() => { splash(to, 0.8); ripple(to.x, to.z, 1.8); });
    }
  }
  if (orbit.on) {
    orbit.phase += dt;
    cam.yaw += orbit.speed * dt;
    if (phase === "pass") {
      cam.pitch = 0.72 + Math.sin(orbit.phase * 0.7) * 0.2;
      cam.view = 210 + Math.sin(orbit.phase * 0.43) * 14;
    }
  }

  VU.uTime.value = clock;
  VU.uNight.value = 0.32;
  VU.uPlayer.value.set(0, -500, 0);
  VU.uWind.value.set(Math.cos(clock * 0.05) * 0.5, Math.sin(clock * 0.05) * 0.4);

  // navires qui tanguent
  for (const side of sides)
    for (const v of side.views.values()) {
      v.rockV += -v.rock * 18 * dt;
      v.rockV *= Math.exp(-2.2 * dt);
      v.rock += v.rockV * dt;
      v.group.position.y = WATER - 0.55 + Math.sin(clock * 1.5 + v.phase) * 0.14 + v.drop + v.wreckY;
      v.mesh.rotation.x = (v.wreck ? v.mesh.rotation.x : Math.sin(clock * 1.1 + v.phase) * 0.018) + v.rock * 0.1 * (v.wreck ? 0 : 1);
    }

  // feux qui brûlent sur les cases touchées
  fireAcc += dt;
  if (fireAcc > 0.09) {
    fireAcc = 0;
    for (const side of sides)
      for (const [cell, m] of side.marks) {
        if (m.kind === "miss" || Math.random() > 0.5) continue;
        const pos = trayPos(side.p, cell);
        embers.spawn({ x: pos.x + rand(-1.6, 1.6), y: pos.y + 1.2, z: pos.z + rand(-1.6, 1.6), vx: rand(-0.6, 0.6), vy: rand(3, 9), vz: rand(-0.6, 0.6), color: HOT[Math.floor(Math.random() * 4)]!, size: rand(0.4, 1.1), life: rand(0.35, 0.8), gravity: -2, drag: 1, ground: 0, grow: -1 });
        if (Math.random() < 0.3)
          debris.spawn({ x: pos.x + rand(-1, 1), y: pos.y + 3, z: pos.z + rand(-1, 1), vx: rand(-0.4, 0.4), vy: rand(4, 8), vz: rand(-0.4, 0.4), color: 0x3c3733, size: rand(0.9, 1.7), life: rand(1.2, 2.2), gravity: -0.5, drag: 0.8, ground: 0, grow: 1, spin: 2 });
      }
  }

  // les navires coulés brûlent sur les panneaux
  lidFireAcc += dt;
  if (lidFireAcc > 0.1) {
    lidFireAcc = 0;
    for (const side of sides) {
      const s = signOf(side.p);
      for (const cell of side.lidWrecks) {
        if (Math.random() > 0.55) continue;
        const pos = lidPos(side.p, cell);
        const z = pos.z + s * rand(4.5, 6.5);
        embers.spawn({ x: pos.x + rand(-2.4, 2.4), y: pos.y + rand(-2.4, 1.5), z, vx: rand(-0.5, 0.5), vy: rand(4, 11), vz: s * rand(0, 1), color: HOT[Math.floor(Math.random() * 4)]!, size: rand(0.5, 1.2), life: rand(0.3, 0.75), gravity: -2, drag: 1, ground: 0, grow: -1 });
        if (Math.random() < 0.18)
          debris.spawn({ x: pos.x + rand(-1, 1), y: pos.y + 2, z, vx: rand(-0.3, 0.3), vy: rand(4, 8), vz: s * rand(0.2, 1.2), color: 0x4a443f, size: rand(0.7, 1.3), life: rand(0.9, 1.7), gravity: -0.5, drag: 0.8, ground: 0, grow: 1, spin: 2 });
      }
    }
  }

  // la vapeur des tasses
  steamAcc += dt;
  if (steamAcc > 0.28) {
    steamAcc = 0;
    for (const m of world.mugs)
      debris.spawn({ x: m[0] + rand(-1, 1), y: m[1], z: m[2] + rand(-1, 1), vx: rand(-0.3, 0.3), vy: rand(2.5, 4.5), vz: rand(-0.3, 0.3), color: 0xf2efe6, size: rand(0.4, 0.7), life: rand(1.2, 2), gravity: -0.4, drag: 0.6, ground: 0, grow: 0.8, spin: 1, flutter: 3 });
  }

  // le chat
  cat.hopV -= 80 * dt;
  cat.hop = Math.max(0, cat.hop + cat.hopV * dt);
  if (cat.hop === 0) cat.hopV = 0;
  cat.root.position.y = T + cat.hop;
  cat.tailMesh.rotation.y = Math.sin(clock * 1.7) * 0.45;
  cat.headMesh.rotation.z = -0.08 + Math.sin(clock * 0.8) * 0.05;

  // réticule qui respire
  if (reticle.g.visible && phase === "aim") reticle.g.scale.setScalar(1 + Math.sin(clock * 6) * 0.05);
  if (ghost.visible) refreshGhost();

  // feux d'artifice de victoire
  if (endFx) {
    fwAcc += dt;
    if (fwAcc > 0.55) { fwAcc = 0; burstFirework(); }
  }

  debris.update(dt);
  embers.update(dt);
  if (headless) return;
  applyCamera(realDt, clock);
  renderFrame(realDt, clock);
}

let frozen = false;
function loop(t: number): void {
  if (frozen) last = t;
  else tick(t);
  requestAnimationFrame(loop);
}
renderHints();
let offlineReady = false;
navigator.serviceWorker?.ready.then(() => { offlineReady = true; $("offlineNote").textContent = t("menu.offline"); });
$("lang").addEventListener("click", () => setLang(lang === "fr" ? "en" : "fr", () => {
  renderHints();
  if (offlineReady) $("offlineNote").textContent = t("menu.offline");
}));
void navigator.storage?.persist?.();
requestAnimationFrame((t) => { last = t; loop(t); });

// Débogage : la partie se pilote depuis la console, même onglet masqué.
function advance(seconds: number, render = true): void {
  headless = !render;
  for (let s = 0; s < seconds; s += 1 / 30) tick(last + 1000 / 30);
  headless = false;
}
Object.assign(window, {
  tableFleet: {
    advance, sides, game, cam, fx, chunks,
    freeze(on: boolean) { frozen = on; },
    get phase() { return phase; },
    get viewer() { return viewer; },
    fire(c: number, r: number) { aim?.resolve(cellId(c, r)); },
    randomFleet,
    done() { $("btnDone").click(); },
    ready() { passResolve?.(); },
    visibleShips(p: number) { return [...sides[p]!.views.values()].filter((v) => v.group.visible).length; },
  },
});
