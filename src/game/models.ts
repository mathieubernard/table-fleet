import { type BufferGeometry, MeshBasicMaterial, MeshLambertMaterial } from "three";
import { VoxModel } from "../render/voxModel";

/** Voxels fins des navires : deux par voxel du plateau. */
export const SHIP_S = 0.5;
/** Une case vaut 12 voxels de navire. */
const U = 12;

const STEEL = [0x8d979c, 0x848e93];
const DECK = 0xb8a886;
const HULL_LOW = 0x4d555a;
const DARK = 0x3a4044;
const RUST = 0x6d5848;
const WHITE = 0xe9e4d4;

function hullWidth(x: number, half: number, w: number, bow = 16, stern = 6): number {
  const toBow = half - x;
  const toStern = x + half;
  let v = w;
  if (toBow < bow) v = Math.min(v, w * Math.pow(toBow / bow, 0.75));
  if (toStern < stern) v = Math.min(v, w * (0.6 + 0.4 * (toStern / stern)));
  return v;
}

/** Coque effilée : proue vers +x. */
function hull(m: VoxModel, half: number, w: number, h: number, stripe: number, deck = DECK): void {
  for (let x = -half; x < half; x++) {
    const hw = hullWidth(x + 0.5, half, w);
    for (let z = -Math.ceil(w); z < Math.ceil(w); z++) {
      const zc = z + 0.5;
      for (let y = 0; y < h; y++) {
        const widthHere = hw * (0.72 + 0.28 * (y / Math.max(1, h - 1)));
        if (Math.abs(zc) > widthHere) continue;
        const onDeck = y === h - 1;
        const col = onDeck ? deck
          : y === 0 ? HULL_LOW
          : y === 1 ? stripe
          : STEEL[(x + z + 40) % 7 === 0 ? 1 : 0]!;
        m.set(x, y, z, col);
      }
    }
  }
}

function turret(m: VoxModel, x: number, y: number, dir: number, stripe: number): void {
  m.box(x - 2, y, -2, x + 1, y + 1, 1, STEEL[1]!);
  m.box(x - 1, y + 2, -1, x, y + 2, 0, stripe);
  m.set(x + dir * 2 + (dir > 0 ? 0 : -1), y + 1, -1, DARK);
  m.set(x + dir * 2 + (dir > 0 ? 0 : -1), y + 1, 0, DARK);
  m.set(x + dir * 3 + (dir > 0 ? 0 : -1), y + 1, -1, DARK);
  m.set(x + dir * 3 + (dir > 0 ? 0 : -1), y + 1, 0, DARK);
}

function funnel(m: VoxModel, x: number, y: number, h: number, stripe: number): void {
  m.box(x - 1, y, -1, x + 1, y + h - 1, 0, RUST);
  m.box(x - 1, y + h - 2, -1, x + 1, y + h - 2, 0, stripe);
  m.box(x, y + h - 1, -1, x, y + h - 1, 0, DARK);
}

export function shipModel(id: string, stripe: number): VoxModel {
  const m = new VoxModel();
  if (id === "carrier") {
    const half = (5 * U) / 2 - 2;
    hull(m, half, 4, 4, stripe, DARK);
    // pont d'envol plat et large
    for (let x = -half + 1; x < half - 5; x++)
      for (let z = -5; z < 5; z++) {
        const zc = z + 0.5;
        const taper = hullWidth(x + 0.5, half, 5.2, 9, 3);
        if (Math.abs(zc) > taper) continue;
        const paint = z === 0 && (x + 80) % 6 < 3 ? WHITE : (Math.abs(zc) > taper - 1 ? 0x6b7276 : 0x565e63);
        m.set(x, 4, z, paint);
      }
    // îlot de commandement
    m.box(-4, 5, 3, 3, 7, 4, STEEL[0]!);
    m.box(-3, 8, 3, 2, 8, 4, stripe);
    m.box(-1, 9, 3, 0, 11, 3, DARK);
    // petits avions alignés sur le pont
    for (const px of [-20, -13, 14, 20]) {
      m.box(px - 1, 5, -3, px + 1, 5, -3, WHITE);
      m.box(px, 5, -5, px, 5, -1, stripe);
    }
    return m;
  }
  if (id === "cruiser") {
    const half = (4 * U) / 2 - 2;
    hull(m, half, 4, 4, stripe);
    m.box(-11, 4, -2, 9, 6, 1, STEEL[0]!);
    m.box(-4, 7, -2, 4, 8, 1, STEEL[1]!);
    m.box(-1, 9, -1, 2, 10, 0, stripe);
    m.box(0, 11, -1, 0, 14, 0, DARK);
    funnel(m, -7, 7, 4, stripe);
    turret(m, 13, 4, 1, stripe);
    turret(m, 19, 4, 1, stripe);
    turret(m, -16, 4, -1, stripe);
    return m;
  }
  if (id === "destroyer") {
    const half = (3 * U) / 2 - 2;
    hull(m, half, 3.5, 3, stripe);
    m.box(-7, 3, -2, 5, 5, 1, STEEL[0]!);
    m.box(-1, 6, -1, 3, 7, 0, stripe);
    m.box(1, 8, -1, 1, 11, 0, DARK);
    funnel(m, -4, 6, 3, stripe);
    turret(m, 10, 3, 1, stripe);
    turret(m, -11, 3, -1, stripe);
    return m;
  }
  if (id === "sub") {
    const half = (3 * U) / 2 - 3;
    const hullC = 0x4b5a58;
    for (let x = -half; x < half; x++) {
      const r = hullWidth(x + 0.5, half, 2.9, 10, 8);
      for (let z = -3; z < 3; z++)
        for (let y = 0; y < 4; y++) {
          const dy = y + 0.5 - 1.2;
          if (Math.hypot(z + 0.5, dy * 1.2) > r) continue;
          m.set(x, y, z, y === 0 ? HULL_LOW : (x + 60) % 11 === 0 ? DARK : hullC);
        }
    }
    m.box(-3, 3, -1, 3, 6, 0, hullC);
    m.box(-3, 6, -1, 3, 6, 0, stripe);
    m.box(1, 7, 0, 1, 10, 0, DARK);
    m.box(1, 10, 0, 2, 10, 0, DARK);
    return m;
  }
  // torpilleur
  const half = (2 * U) / 2 - 2;
  hull(m, half, 3, 3, stripe);
  m.box(-3, 3, -2, 3, 4, 1, STEEL[0]!);
  m.box(0, 5, -1, 2, 6, 0, stripe);
  m.box(1, 7, 0, 1, 8, 0, DARK);
  turret(m, 7, 3, 1, stripe);
  m.box(-9, 3, 1, -6, 3, 1, DARK);
  m.box(-9, 3, -2, -6, 3, -2, DARK);
  return m;
}

const cache = new Map<string, BufferGeometry>();
const STRIPES = [0x3f6a8f, 0xa8503f];

export function shipGeometry(id: string, player: number): BufferGeometry {
  const key = `${id}:${player}`;
  let g = cache.get(key);
  if (!g) {
    g = shipModel(id, STRIPES[player]!).geometry(SHIP_S, [0, 0, 0], 0.04);
    cache.set(key, g);
  }
  return g;
}

export const wreckMaterial = new MeshLambertMaterial({ vertexColors: true, color: 0x6a5a50 });
/** Navire coulé sur le panneau du tireur : calciné, lueur de braises pour ressortir sur le fond sombre. */
export const lidWreckMaterial = new MeshLambertMaterial({ vertexColors: true, color: 0xe2cdb8, emissive: 0x5a1a06, emissiveIntensity: 0.45 });
export const ghostOk = new MeshBasicMaterial({ color: 0x9dffb0, transparent: true, opacity: 0.62, depthWrite: false, toneMapped: false });
export const ghostBad = new MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false });

/** Fiche : tige dans le trou, tête arrondie, le long de +y. */
function pegModel(color: number, dark: number): VoxModel {
  const m = new VoxModel();
  m.box(0, 0, 0, 1, 3, 1, dark);
  m.box(-1, 4, -1, 2, 5, 2, color);
  m.box(0, 6, 0, 1, 6, 1, color);
  return m;
}

export const pegGeoWhite = pegModel(0xf4eee0, 0xcfc7b4).geometry(0.5, [0.5, 0, 0.5], 0.02);
export const pegGeoRed = pegModel(0xd8332b, 0x9a241f).geometry(0.5, [0.5, 0, 0.5], 0.02);
export const pegMatRed = new MeshLambertMaterial({ vertexColors: true, emissive: 0xc01810, emissiveIntensity: 0.65 });

/** Morceau de coque arraché : seul indice laissé par un coup au but. */
function fragModel(): VoxModel {
  const m = new VoxModel();
  m.box(-4, 0, -3, 3, 1, 2, 0x34302c);
  m.box(-3, 2, -2, 2, 2, 1, 0x2a2623);
  m.set(-2, 3, 0, 0x4d4640).set(1, 3, -1, 0x4d4640).set(2, 2, 2, 0x6d5848).set(-4, 2, 0, 0x6d5848);
  return m;
}
export const fragGeo = fragModel().geometry(SHIP_S, [0, 0, 0], 0.08);

/** L'obus : nez vers +z. */
function shellModel(): VoxModel {
  const m = new VoxModel();
  m.box(-1, -1, -4, 0, 0, 3, 0xcfd2d0);
  m.box(-1, -1, 2, 0, 0, 3, 0xd8332b);
  m.box(-1, -1, 4, 0, 0, 4, 0x3a4044);
  m.box(-2, -1, -4, 1, 0, -3, 0x3a4044);
  m.box(-1, -2, -4, 0, 1, -3, 0x3a4044);
  return m;
}
export const shellGeo = shellModel().geometry(0.95, [0, 0, 0], 0.02);

/** Le chat de la maison, couché sur la table. Tête vers +x. */
export function catModels(): { body: VoxModel; tail: VoxModel; head: VoxModel } {
  const FUR = 0xd98e45, FUR_D = 0xb46f30, CREAM = 0xf2dfc0;
  const body = new VoxModel();
  body.box(-7, 0, -3, 5, 4, 3, (x, _y, z) => ((x + z * 2 + 40) % 5 < 2 ? FUR_D : FUR));
  body.box(-6, 5, -2, 3, 5, 2, (x) => ((x + 40) % 4 < 2 ? FUR_D : FUR));
  body.box(3, 0, -3, 7, 1, -1, FUR).box(3, 0, 1, 7, 1, 3, FUR).box(6, 0, -3, 7, 0, -1, CREAM).box(6, 0, 1, 7, 0, 3, CREAM);
  const head = new VoxModel();
  head.box(0, 0, -3, 5, 4, 3, FUR);
  head.box(4, 0, -2, 5, 1, 2, CREAM);
  head.set(6, 1, 0, 0xd87a70).set(5, 3, -2, 0x262626).set(5, 3, 2, 0x262626).set(6, 3, -2, 0x262626).set(6, 3, 2, 0x262626);
  head.box(1, 5, -3, 2, 6, -2, FUR_D).box(1, 5, 2, 2, 6, 3, FUR_D);
  const tail = new VoxModel();
  tail.box(-9, 0, -1, 0, 1, 0, (x) => ((x + 40) % 4 < 2 ? FUR_D : FUR));
  return { body, tail, head };
}
