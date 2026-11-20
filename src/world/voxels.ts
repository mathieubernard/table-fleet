import { Color } from "three";

/** Taille du monde, en voxels. */
export const SX = 208;
export const SY = 112;
export const SZ = 208;
export const CHUNK = 16;

/** Comportement animé d'un voxel (lu par le shader). */
export const Kind = {
  Solid: 0,
  Sway: 1, // herbe, fleurs, blé : ondule au vent, s'écarte du joueur
  Water: 2, // surface qui ondule et scintille
  Leaves: 3, // feuillage qui frissonne
  Fall: 4, // cascade : stries qui descendent
  Glow: 5, // fenêtres, lanternes, cristaux : s'allument la nuit
} as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export interface PalEntry {
  color: Color;
  kind: Kind;
  /** Intensité de l'animation (hauteur du brin, puissance de lueur…). */
  param: number;
  /** Bloque le joueur. */
  solid: boolean;
  /** Cache la face du voisin. */
  opaque: boolean;
  /** Se coupe à l'épée et repousse. */
  cut: boolean;
  /** Variation aléatoire de teinte. */
  jitter: number;
}

export interface PalOpts {
  kind?: Kind;
  param?: number;
  solid?: boolean;
  opaque?: boolean;
  cut?: boolean;
  jitter?: number;
}

export class Palette {
  readonly entries: PalEntry[] = [];
  private readonly keys = new Map<string, number>();

  constructor() {
    // 0 = vide
    this.entries.push({ color: new Color(0), kind: Kind.Solid, param: 0, solid: false, opaque: false, cut: false, jitter: 0 });
  }

  add(hex: number, o: PalOpts = {}): number {
    const kind = o.kind ?? Kind.Solid;
    const param = o.param ?? (kind === Kind.Glow ? 1 : kind === Kind.Water ? 1 : 0.5);
    const solid = o.solid ?? (kind === Kind.Solid || kind === Kind.Glow);
    const opaque = o.opaque ?? kind !== Kind.Sway;
    const cut = o.cut ?? kind === Kind.Sway;
    const jitter = o.jitter ?? 0.06;
    const key = `${hex}|${kind}|${param.toFixed(2)}|${solid}|${opaque}|${cut}|${jitter}`;
    const known = this.keys.get(key);
    if (known !== undefined) return known;
    const id = this.entries.length;
    if (id > 255) throw new Error("Palette pleine");
    this.entries.push({ color: new Color(hex), kind, param, solid, opaque, cut, jitter });
    this.keys.set(key, id);
    return id;
  }
}

export class Grid {
  readonly data = new Uint8Array(SX * SY * SZ);

  idx(x: number, y: number, z: number): number {
    return x + SX * (z + SZ * y);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ;
  }

  get(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return 0;
    return this.data[x + SX * (z + SZ * y)]!;
  }

  set(x: number, y: number, z: number, v: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
    this.data[x + SX * (z + SZ * y)] = v;
  }
}
