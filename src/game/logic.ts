/** Règles de la bataille navale : aucune dépendance au rendu. */

export const N = 10;

export interface ShipDef { id: string; name: string; article: string; len: number }

export const FLEET: ShipDef[] = [
  { id: "carrier", name: "Porte-avions", article: "le porte-avions", len: 5 },
  { id: "cruiser", name: "Croiseur", article: "le croiseur", len: 4 },
  { id: "destroyer", name: "Contre-torpilleur", article: "le contre-torpilleur", len: 3 },
  { id: "sub", name: "Sous-marin", article: "le sous-marin", len: 3 },
  { id: "torpedo", name: "Torpilleur", article: "le torpilleur", len: 2 },
];

export interface Ship {
  def: ShipDef;
  index: number;
  c: number;
  r: number;
  vertical: boolean;
  cells: number[];
  hits: number;
}

export const SHOT_NONE = 0;
export const SHOT_MISS = 1;
export const SHOT_HIT = 2;

export type ShotKind = "miss" | "hit" | "sunk";
export interface ShotResult { cell: number; kind: ShotKind; ship: Ship | null; over: boolean }

export const cellId = (c: number, r: number) => c + N * r;
export const cellC = (cell: number) => cell % N;
export const cellR = (cell: number) => Math.floor(cell / N);
export const cellName = (cell: number) => `${String.fromCharCode(65 + cellC(cell))}${cellR(cell) + 1}`;

export function shipCells(len: number, c: number, r: number, vertical: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < len; i++) out.push(vertical ? cellId(c, r + i) : cellId(c + i, r));
  return out;
}

/** Ramène l'ancre pour que le navire reste entièrement sur la grille. */
export function clampAnchor(len: number, c: number, r: number, vertical: boolean): [number, number] {
  return vertical
    ? [Math.max(0, Math.min(N - 1, c)), Math.max(0, Math.min(N - len, r))]
    : [Math.max(0, Math.min(N - len, c)), Math.max(0, Math.min(N - 1, r))];
}

export class Board {
  ships: Ship[] = [];
  readonly shots = new Uint8Array(N * N);
  shotsFired = 0;
  hitsLanded = 0;

  shipAt(cell: number): Ship | null {
    return this.ships.find((s) => s.cells.includes(cell)) ?? null;
  }

  canPlace(len: number, c: number, r: number, vertical: boolean, ignore?: Ship): boolean {
    const cells = shipCells(len, c, r, vertical);
    return cells.every((cell) => {
      const cc = cellC(cell), rr = cellR(cell);
      if (cc < 0 || rr < 0 || cc >= N || rr >= N) return false;
      const other = this.shipAt(cell);
      return !other || other === ignore;
    }) && (vertical ? r + len <= N && c >= 0 && c < N : c + len <= N && r >= 0 && r < N);
  }

  place(index: number, c: number, r: number, vertical: boolean): Ship {
    this.remove(index);
    const def = FLEET[index]!;
    const ship: Ship = { def, index, c, r, vertical, cells: shipCells(def.len, c, r, vertical), hits: 0 };
    this.ships.push(ship);
    return ship;
  }

  remove(index: number): void {
    this.ships = this.ships.filter((s) => s.index !== index);
  }

  randomize(): void {
    this.ships = [];
    FLEET.forEach((def, index) => {
      for (;;) {
        const vertical = Math.random() < 0.5;
        const c = Math.floor(Math.random() * (vertical ? N : N - def.len + 1));
        const r = Math.floor(Math.random() * (vertical ? N - def.len + 1 : N));
        if (this.canPlace(def.len, c, r, vertical)) { this.place(index, c, r, vertical); return; }
      }
    });
  }

  get complete(): boolean { return this.ships.length === FLEET.length; }

  receive(cell: number): ShotResult {
    if (this.shots[cell] !== SHOT_NONE) throw new Error("Case déjà visée");
    const ship = this.shipAt(cell);
    if (!ship) {
      this.shots[cell] = SHOT_MISS;
      return { cell, kind: "miss", ship: null, over: false };
    }
    this.shots[cell] = SHOT_HIT;
    ship.hits++;
    const sunk = ship.hits >= ship.def.len;
    return { cell, kind: sunk ? "sunk" : "hit", ship, over: sunk && this.ships.every((s) => s.hits >= s.def.len) };
  }

  isSunk(ship: Ship): boolean { return ship.hits >= ship.def.len; }
}

// ------------------------------------------------------------------ ordinateur

export type Level = "easy" | "normal" | "hard";

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)]!;

/** Ce que le tireur sait légitimement : tirs passés, touches, navires déjà coulés. */
function knowledge(b: Board) {
  const sunkCells = new Set<number>();
  for (const s of b.ships) if (b.isSunk(s)) s.cells.forEach((x) => sunkCells.add(x));
  const open: number[] = [];
  const wounds: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (b.shots[i] === SHOT_NONE) open.push(i);
    else if (b.shots[i] === SHOT_HIT && !sunkCells.has(i)) wounds.push(i);
  }
  const lengths = b.ships.filter((s) => !b.isSunk(s)).map((s) => s.def.len);
  return { sunkCells, open, wounds, lengths };
}

/** Compte les positions encore possibles de chaque navire restant sur chaque case. */
function density(b: Board): Float64Array {
  const { sunkCells, wounds, lengths } = knowledge(b);
  const woundSet = new Set(wounds);
  const score = new Float64Array(N * N);
  const blocked = (x: number) => b.shots[x] === SHOT_MISS || sunkCells.has(x);
  for (const len of lengths) {
    for (const vertical of [false, true]) {
      for (let r = 0; r < (vertical ? N - len + 1 : N); r++)
        for (let c = 0; c < (vertical ? N : N - len + 1); c++) {
          const cells = shipCells(len, c, r, vertical);
          if (cells.some(blocked)) continue;
          const covered = cells.filter((x) => woundSet.has(x)).length;
          if (wounds.length && !covered) continue;
          const w = covered ? 1 + covered * 30 : 1;
          for (const x of cells) if (b.shots[x] === SHOT_NONE) score[x] = score[x]! + w;
        }
    }
  }
  return score;
}

function bestOf(open: number[], score: Float64Array, jitter: number): number {
  let best = open[0]!, bs = -1;
  for (const x of open) {
    const v = score[x]! * (1 + Math.random() * jitter) + Math.random() * 0.01;
    if (v > bs) { bs = v; best = x; }
  }
  return best;
}

function neighbours(cell: number): number[] {
  const c = cellC(cell), r = cellR(cell);
  const out: number[] = [];
  if (c > 0) out.push(cellId(c - 1, r));
  if (c < N - 1) out.push(cellId(c + 1, r));
  if (r > 0) out.push(cellId(c, r - 1));
  if (r < N - 1) out.push(cellId(c, r + 1));
  return out;
}

export function chooseShot(b: Board, level: Level): number {
  const { open, wounds } = knowledge(b);
  if (level === "easy") {
    if (wounds.length && Math.random() < 0.6) {
      const near = wounds.flatMap(neighbours).filter((x) => b.shots[x] === SHOT_NONE);
      if (near.length) return pick(near);
    }
    return pick(open);
  }
  if (level === "normal" && !wounds.length) {
    const even = open.filter((x) => (cellC(x) + cellR(x)) % 2 === 0);
    return pick(even.length ? even : open);
  }
  return bestOf(open, density(b), level === "hard" ? 0.12 : 0.5);
}
