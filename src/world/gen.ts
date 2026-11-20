import { Grid, Kind, Palette } from "./voxels";
import { hash2, hash3, vnoise } from "./noise";

/** Centre de la table, en voxels. */
export const CX = 104;
export const CZ = 104;
export const FLOOR = 8;
/** Dessus de la table. */
export const T = 30;
/** Une case de grille : 5 voxels + 1 ligne. */
export const CELL = 6;
/** Bord gauche de la grille (repère du joueur : +x à sa droite, +z vers lui). */
export const GX0 = -27;
/** Bord de la grille côté charnière. */
export const GZ0 = 12;
/** Dessus de l'eau dans la mallette. */
export const WATER = T + 3;
/** Haut de la grille du panneau vertical. */
export const LID_TOP = T + 65;
/** Dessus du panneau de fiches (profondeur de la face avant). */
export const LID_FACE = 4;

/** Couleurs des mallettes : joueur 1 bleu, joueur 2 terre cuite. */
const CASES = [
  { body: 0x3f6a8f, dark: 0x2f5270, lid: 0x24384e, line: 0x4d7396, trim: 0xd6b25a },
  { body: 0xa8503f, dark: 0x853d30, lid: 0x4a2a28, line: 0x8f5a4c, trim: 0xe3c78a },
];

const FONT: Record<string, string[]> = {
  A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"],
  E: ["111", "100", "110", "100", "111"], F: ["111", "100", "110", "100", "100"],
  G: ["011", "100", "101", "101", "011"], H: ["101", "101", "111", "101", "101"],
  I: ["111", "010", "010", "010", "111"], J: ["001", "001", "001", "101", "010"],
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"], "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"], "9": ["111", "101", "111", "001", "111"],
};

export interface Scenery {
  grid: Grid;
  pal: Palette;
  lamps: [number, number, number][];
  mugs: [number, number, number][];
}

export function generate(): Scenery {
  const grid = new Grid();
  const pal = new Palette();
  /** Écrit un voxel dans le repère d'un joueur (s=1 : côté +z, s=-1 : retourné de 180°). */
  const put = (s: number, lx: number, y: number, lz: number, v: number) => {
    grid.set(s > 0 ? CX + lx : CX - 1 - lx, y, s > 0 ? CZ + lz : CZ - 1 - lz, v);
  };
  const lamps: [number, number, number][] = [];
  const mugs: [number, number, number][] = [];

  // ---------------------------------------------------- l'îlot du salon
  const stone = pal.add(0x5d584f, { jitter: 0.1 });
  const stoneD = pal.add(0x4a463f, { jitter: 0.1 });
  const planks = [0xa67845, 0x9c6f3f, 0xb0824c, 0x94683a].map((h) => pal.add(h, { jitter: 0.05 }));
  const plankLine = pal.add(0x6f4c2a, { jitter: 0.03 });
  for (let z = 0; z < 208; z++)
    for (let x = 0; x < 208; x++) {
      const d = Math.hypot(x + 0.5 - CX, z + 0.5 - CZ);
      const wob = vnoise(x * 0.09, z * 0.09, 3) * 7;
      if (d > 96 + wob) continue;
      const edge = d > 89 + wob;
      const depth = edge ? Math.floor(hash2(x, z, 8) * 3) + 3 : 0;
      for (let y = depth; y < FLOOR - 1; y++) grid.set(x, y, z, hash3(x, y, z) < 0.5 ? stone : stoneD);
      const band = Math.floor(z / 7);
      const seam = z % 7 === 0 || (x + band * 17) % 41 === 0;
      grid.set(x, FLOOR - 1, z, seam ? plankLine : planks[Math.floor(hash2(band, Math.floor((x + band * 17) / 41), 2) * 4)]!);
    }

  // ---------------------------------------------------- le tapis
  const rugA = pal.add(0x8f3f3a, { jitter: 0.08 });
  const rugB = pal.add(0xc9a35f, { jitter: 0.08 });
  const rugC = pal.add(0x3b4a63, { jitter: 0.08 });
  for (let z = -92; z < 92; z++)
    for (let x = -66; x < 66; x++) {
      const ring = Math.min(66 - Math.abs(x + 0.5), 92 - Math.abs(z + 0.5));
      if (ring < 1 && (x + z) % 2) continue; // franges
      const v = ring < 5 ? rugC : ring < 7 ? rugB : ring < 13 ? rugA : (Math.floor(Math.abs(x) / 8) + Math.floor(Math.abs(z) / 8)) % 2 ? rugA : rugC;
      grid.set(CX + x, FLOOR, CZ + z, ring > 15 && (Math.abs(Math.abs(x) - Math.abs(z)) % 16 === 0) ? rugB : v);
    }

  // ---------------------------------------------------- la table
  const wood = [0x7a5230, 0x70492a, 0x825936].map((h) => pal.add(h, { jitter: 0.05 }));
  const woodD = pal.add(0x573920, { jitter: 0.05 });
  const leg = pal.add(0x4e331d, { jitter: 0.05 });
  for (let z = -84; z < 84; z++)
    for (let x = -54; x < 54; x++) {
      const corner = Math.abs(x + 0.5) > 50 && Math.abs(z + 0.5) > 80 && Math.abs(x + 0.5) + Math.abs(z + 0.5) > 132;
      if (corner) continue;
      const rim = Math.abs(x + 0.5) > 52 || Math.abs(z + 0.5) > 82;
      const board = Math.floor((x + 54) / 9);
      const grain = vnoise(x * 0.5, z * 0.04, 5);
      grid.set(CX + x, T - 1, CZ + z, rim ? woodD : (x + 54) % 9 === 0 ? woodD : wood[Math.floor(hash2(board, Math.floor(grain * 4), 9) * 3)]!);
      grid.set(CX + x, T - 2, CZ + z, woodD);
      grid.set(CX + x, T - 3, CZ + z, rim ? woodD : leg);
    }
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    for (let y = FLOOR + 1; y < T - 3; y++)
      for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
        const bulge = y > FLOOR + 6 && y < FLOOR + 11 ? 0 : 1;
        if (bulge && (a === 0 || a === 5 || b === 0 || b === 5)) continue;
        grid.set(CX + sx * 44 + a - 3, y, CZ + sz * 72 + b - 3, leg);
      }

  // ---------------------------------------------------- les deux mallettes, comme à la maison
  const water = [0x3f7f96, 0x47899f, 0x37718a].map((h) => pal.add(h, { kind: Kind.Water, param: 0.55, jitter: 0.03 }));
  const waterLight = pal.add(0x6ca9b5, { kind: Kind.Water, param: 0.55, jitter: 0.03 });
  const waterHole = pal.add(0x24505f, { kind: Kind.Water, param: 0.55, jitter: 0.02 });
  const seaLine = pal.add(0x8cc2c8, { jitter: 0.03 });
  const hole = pal.add(0x12141c, { jitter: 0 });

  for (const s of [1, -1]) {
    const C = CASES[s > 0 ? 0 : 1]!;
    const body = pal.add(C.body, { jitter: 0.03 });
    const dark = pal.add(C.dark, { jitter: 0.03 });
    const trim = pal.add(C.trim, { jitter: 0.03 });
    const lidBg = pal.add(C.lid, { jitter: 0.03 });
    const lidLine = pal.add(C.line, { jitter: 0.03 });
    const glyph = (txt: string, ox: number, draw: (px: number, row: number) => void) => {
      [...txt].forEach((ch, i) => {
        FONT[ch]!.forEach((rowBits, row) => {
          [...rowBits].forEach((bit, col) => { if (bit === "1") draw(ox + i * 4 + col, row); });
        });
      });
    };

    // -- le bac : un plateau plat, rempli d'une mer imprimée percée de trous
    for (let lz = 4; lz < 76; lz++)
      for (let lx = -36; lx < 36; lx++) {
        const corner = (lx < -34 || lx > 33) && (lz > 73);
        if (corner) continue;
        put(s, lx, T, lz, dark);
        put(s, lx, T + 1, lz, body);
        const gx = lx - GX0, gz = lz - GZ0;
        if (gx >= 0 && gx <= 60 && gz >= 0 && gz <= 60) {
          const line = gx % CELL === 0 || gz % CELL === 0;
          const center = gx % CELL === 3 && gz % CELL === 3;
          const wave = vnoise((lx + s * 3) * 0.16, lz * 0.34, 11 + s);
          const v = line ? seaLine : center ? waterHole : wave > 0.72 ? waterLight : water[Math.floor(wave * 3)]!;
          put(s, lx, T + 2, lz, v);
        } else {
          const rim = lx < -35 || lx > 33 || lz > 73 || lz < 6;
          put(s, lx, T + 2, lz, body);
          put(s, lx, T + 3, lz, rim ? trim : body);
        }
      }
    for (let c = 0; c < 10; c++) {
      glyph(String.fromCharCode(65 + c), GX0 + CELL * c + 2, (px, row) => put(s, px, T + 3, 6 + row, trim));
      const n = String(c + 1);
      glyph(n, GX0 - n.length * 4, (px, row) => put(s, px, T + 3, GZ0 + CELL * c + 1 + row, trim));
    }

    // -- le panneau : debout, percé de trous pour les fiches, il cache l'adversaire
    const top = T + 73;
    for (let y = T + 2; y <= top; y++)
      for (let lx = -36; lx < 36; lx++) {
        const corner = (lx < -34 || lx > 33) && y > top - 2;
        if (corner) continue;
        put(s, lx, y, 2, dark);
        const gx = lx - GX0, gy = LID_TOP - y;
        const inGrid = gx >= 0 && gx <= 60 && gy >= 0 && gy <= 60;
        if (inGrid) {
          const line = gx % CELL === 0 || gy % CELL === 0;
          const center = gx % CELL === 3 && gy % CELL === 3;
          if (center) { put(s, lx, y, 2, hole); continue; }
          put(s, lx, y, 3, line ? lidLine : lidBg);
        } else {
          const rim = lx < -35 || lx > 33 || y > top - 2 || y < T + 4;
          put(s, lx, y, 3, body);
          if (rim) put(s, lx, y, 4, trim);
        }
      }
    for (let c = 0; c < 10; c++) {
      glyph(String.fromCharCode(65 + c), GX0 + CELL * c + 2, (px, row) => put(s, px, LID_TOP + 6 - row, 4, trim));
      const n = String(c + 1);
      glyph(n, GX0 - n.length * 4, (px, row) => put(s, px, LID_TOP - CELL * c - 1 - row, 4, trim));
    }
    // charnières et dos du panneau
    for (const hx of [-26, 20])
      for (let lx = hx; lx < hx + 6; lx++) for (let y = T; y < T + 4; y++) { put(s, lx, y, 2, trim); put(s, lx, y, 3, trim); put(s, lx, y, 1, trim); }
    for (let y = T + 10; y < T + 62; y++)
      for (let lx = -30; lx < 30; lx++)
        if ((lx + y + 900) % 22 < 2) put(s, lx, y, 1, body);

    // -- le fauteuil du joueur
    const chair = pal.add(0x6b4527, { jitter: 0.05 });
    const cushion = pal.add(C.body, { jitter: 0.06 });
    for (let lz = 88; lz < 95; lz++) {
      const lwide = 14;
      for (let lx = -lwide; lx < lwide; lx++) {
        put(s, lx, FLOOR + 10, lz, chair);
        put(s, lx, FLOOR + 11, lz, cushion);
      }
    }
    for (const lx of [-13, 12]) for (const lz of [88, 94]) for (let y = FLOOR + 1; y < FLOOR + 10; y++) put(s, lx, y, lz, chair);
    for (let lx = -14; lx < 14; lx++) for (let y = FLOOR + 11; y < T - 8; y++) put(s, lx, y, 95, (lx % 4 === 0 || y === T - 9) ? chair : cushion);

    // -- le coin du joueur : suspension, tasse, carnet et crayon
    const pole = pal.add(0x3c3029, { jitter: 0.04 });
    const shade = pal.add(0xffd690, { kind: Kind.Glow, param: 1.1, jitter: 0.04 });
    const shadeTop = pal.add(0xc8863f, { jitter: 0.04 });
    const lampX = 80, lampZ = 48;
    for (let y = FLOOR; y < 72; y++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(s, lampX + a, y, lampZ + b, pole);
    for (let a = -5; a < 7; a++) for (let b = -5; b < 7; b++) if (Math.hypot(a - 0.5, b - 0.5) < 6) put(s, lampX + a, FLOOR, lampZ + b, pole);
    for (let y = 70; y < 84; y++) {
      const r = 10 - (y - 70) * 0.35;
      for (let a = -12; a < 14; a++) for (let b = -12; b < 14; b++)
        if (Math.hypot(a - 0.5, b - 0.5) < r) put(s, lampX + a, y, lampZ + b, y > 81 ? shadeTop : shade);
    }
    lamps.push([CX + s * (lampX + 1), 66, CZ + s * (lampZ + 1)]);

    const mug = pal.add(s > 0 ? 0xe8e0cc : 0x4f7fa8, { jitter: 0.03 });
    const coffee = pal.add(0x3d2616, { kind: Kind.Water, param: 0.15, jitter: 0.02 });
    const mx = 45, mz = 30;
    for (let y = T; y < T + 6; y++)
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const d = Math.hypot(a, b);
        if (d > 3.4) continue;
        if (y === T + 5 && d < 2.4) put(s, mx + a, y - 1, mz + b, coffee);
        else if (y < T + 5 || d >= 2.4) put(s, mx + a, y, mz + b, mug);
      }
    for (let y = T + 1; y < T + 5; y++) put(s, mx + 4, y, mz, y === T + 1 || y === T + 4 ? mug : 0);
    put(s, mx + 5, T + 2, mz, mug); put(s, mx + 5, T + 3, mz, mug);
    mugs.push([CX + s * (mx + 0.5), T + 6, CZ + s * (mz + 0.5)]);

    const paper = pal.add(0xf0e8d2, { jitter: 0.03 });
    const ink = pal.add(0x8a95a8, { jitter: 0.02 });
    const pencil = pal.add(0xe0a93f, { jitter: 0.03 });
    for (let lz = 44; lz < 66; lz++) for (let lx = 39; lx < 51; lx++)
      put(s, lx, T, lz, (lz % 4 === 2 && lx > 40 && lx < 49) ? ink : paper);
    for (let i = 0; i < 14; i++) put(s, 48 - Math.floor(i * 0.3), T + 1, 62 - i, i < 1 ? stone : i > 11 ? rugA : pencil);
  }

  // ---------------------------------------------------- petits riens du salon
  // dés et biscuits au milieu de la table
  const die = pal.add(0xf0ead8, { jitter: 0.02 });
  const pip = pal.add(0x2b2b33, { jitter: 0 });
  for (const [dx, dz, n] of [[-46, -8, 5], [-40, 2, 3]] as [number, number, number][]) {
    for (let y = 0; y < 5; y++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) grid.set(CX + dx + a, T + y, CZ + dz + b, die);
    const top: [number, number][] = n === 5 ? [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]] : [[1, 1], [2, 2], [3, 3]];
    for (const [a, b] of top) grid.set(CX + dx + a, T + 4, CZ + dz + b, pip);
  }

  // plantes en pot
  const pot = pal.add(0xa8583a, { jitter: 0.05 });
  const leaves = [0x5d8a3f, 0x4a7734, 0x6f9c49].map((h) => pal.add(h, { kind: Kind.Leaves, param: 0.8, jitter: 0.08 }));
  for (const [px, pz] of [[-76, 40], [76, -36]] as [number, number][]) {
    for (let y = FLOOR; y < FLOOR + 9; y++)
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++)
        if (Math.hypot(a, b) < 4 + (y - FLOOR) * 0.25) grid.set(CX + px + a, y, CZ + pz + b, pot);
    for (let y = FLOOR + 9; y < 40; y++)
      for (let a = -14; a <= 14; a++) for (let b = -14; b <= 14; b++) {
        const h = y - FLOOR - 9;
        const r = 11 - Math.abs(h - 10) * 0.6;
        if (Math.hypot(a, b) < r && hash3(px + a, y, pz + b) > 0.28 + vnoise(a * 0.3, y * 0.3, 4) * 0.25)
          grid.set(CX + px + a, y, CZ + pz + b, leaves[Math.floor(hash3(a, y, b) * 3)]!);
      }
  }

  // pile de boîtes de jeux
  const boxes = [0xc9a35f, 0x6f8fa0, 0xa8503f, 0x7e9462];
  let by = FLOOR;
  boxes.forEach((h, i) => {
    const col = pal.add(h, { jitter: 0.04 });
    const edge = pal.add(0xf0e8d2, { jitter: 0.02 });
    const hgt = 4;
    const ox = -82 + (i % 2) * 2, oz = -40 - i;
    for (let y = by; y < by + hgt; y++) for (let a = 0; a < 20; a++) for (let b = 0; b < 26; b++)
      grid.set(CX + ox + a, y, CZ + oz + b, y === by + hgt - 2 && (a === 0 || b === 0 || a === 19 || b === 25) ? edge : col);
    by += hgt;
  });

  return { grid, pal, lamps, mugs };
}
