import { BufferGeometry, Color, Float32BufferAttribute, Mesh, MeshLambertMaterial, type Material } from "three";
import { hash3 } from "../world/noise";

const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
// sommets de chaque face (sens anti-horaire vu de l'extérieur)
const FACES: number[][][] = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]],
  [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]],
];

export const sharedLambert = new MeshLambertMaterial({ vertexColors: true });

/** Petit modèle voxel peint à la main (personnages, animaux, ailes du moulin). */
export class VoxModel {
  private readonly vox = new Map<string, number>();

  set(x: number, y: number, z: number, color: number): this {
    this.vox.set(`${x},${y},${z}`, color);
    return this;
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | ((x: number, y: number, z: number) => number)): this {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, typeof color === "number" ? color : color(x, y, z));
    return this;
  }

  clear(x: number, y: number, z: number): this {
    this.vox.delete(`${x},${y},${z}`);
    return this;
  }

  /** Géométrie à faces cachées retirées, centrée sur `pivot` (en voxels). */
  geometry(scale: number, pivot: [number, number, number] = [0, 0, 0], jitter = 0.05): BufferGeometry {
    const pos: number[] = [];
    const nor: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new Color();
    for (const [key, hex] of this.vox) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      c.setHex(hex).multiplyScalar(1 + (hash3(x, y, z) - 0.5) * 2 * jitter);
      for (let f = 0; f < 6; f++) {
        const [dx, dy, dz] = DIRS[f]!;
        if (this.vox.has(`${x + dx},${y + dy},${z + dz}`)) continue;
        const base = pos.length / 3;
        // léger assombrissement des faces latérales basses : modelé doux
        const shade = f === 3 ? 0.7 : f === 2 ? 1 : 0.92;
        for (const v of FACES[f]!) {
          pos.push((x + v[0]! - pivot[0]) * scale, (y + v[1]! - pivot[1]) * scale, (z + v[2]! - pivot[2]) * scale);
          nor.push(dx, dy, dz);
          col.push(c.r * shade, c.g * shade, c.b * shade);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
    g.setAttribute("color", new Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  mesh(scale: number, pivot: [number, number, number] = [0, 0, 0], material: Material = sharedLambert): Mesh {
    const m = new Mesh(this.geometry(scale, pivot), material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
}
