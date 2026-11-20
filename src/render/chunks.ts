import {
  BoxGeometry,
  BufferGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  type Material,
  type Scene,
} from "three";
import { CHUNK, Grid, Kind, Palette, SX, SY, SZ } from "../world/voxels";
import { hash3 } from "../world/noise";

const HIDDEN = 1e9;
const NCX = Math.ceil(SX / CHUNK);
const NCZ = Math.ceil(SZ / CHUNK);

interface Chunk {
  mesh: InstancedMesh;
  n: number;
  pos: Int16Array;
  pid: Uint8Array;
  jit: Float32Array;
  life: Float32Array;
  lifeAttr: InstancedBufferAttribute;
  vis: number;
  x0: number;
  z0: number;
  hideAt: number;
}

/** Cube sans face du dessous (jamais vue d'en haut). */
function cubeGeometry(): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1);
  const idx = box.getIndex()!;
  const keep: number[] = [];
  for (let i = 0; i < idx.count; i++) if (Math.floor(i / 6) !== 3) keep.push(idx.getX(i));
  const g = new BufferGeometry();
  g.setAttribute("position", box.getAttribute("position"));
  g.setAttribute("normal", box.getAttribute("normal"));
  g.setIndex(keep);
  return g;
}

/**
 * Le monde découpé en colonnes de 16×16. Chaque voxel visible est une instance ;
 * son apparition et sa disparition sont pilotées voxel par voxel selon la
 * distance au joueur, ce qui dessine un front circulaire qui avance avec lui.
 */
export class ChunkSet {
  readonly chunks: Chunk[] = [];
  private readonly cutOf: Uint8Array;
  total = 0;

  constructor(
    readonly grid: Grid,
    readonly pal: Palette,
    scene: Scene,
    material: Material,
    depthMaterial: Material,
  ) {
    const opaque = new Uint8Array(256);
    const kindOf = new Float32Array(256);
    const paramOf = new Float32Array(256);
    this.cutOf = new Uint8Array(256);
    pal.entries.forEach((e, i) => {
      opaque[i] = e.opaque ? 1 : 0;
      kindOf[i] = e.kind;
      paramOf[i] = e.param;
      this.cutOf[i] = e.cut ? 1 : 0;
    });
    const isOpaque = (x: number, y: number, z: number) => {
      if (x < 0 || z < 0 || x >= SX || z >= SZ || y >= SY) return false;
      if (y < 0) return true;
      return opaque[grid.data[x + SX * (z + SZ * y)]!] === 1;
    };

    // Recensement des voxels visibles, chunk par chunk.
    const lists: number[][] = Array.from({ length: NCX * NCZ }, () => []);
    const data = grid.data;
    for (let y = 0; y < SY; y++)
      for (let z = 0; z < SZ; z++)
        for (let x = 0; x < SX; x++) {
          const v = data[x + SX * (z + SZ * y)]!;
          if (!v) continue;
          const exposed =
            !isOpaque(x + 1, y, z) || !isOpaque(x - 1, y, z) || !isOpaque(x, y + 1, z) || !isOpaque(x, y, z + 1) || !isOpaque(x, y, z - 1);
          if (!exposed) continue;
          lists[(x >> 4) + NCX * (z >> 4)]!.push(x, y, z, v);
        }

    const geo = cubeGeometry();
    const m4 = new Matrix4();
    const col = new Color();
    for (let cz = 0; cz < NCZ; cz++)
      for (let cx = 0; cx < NCX; cx++) {
        const list = lists[cx + NCX * cz]!;
        const n = list.length / 4;
        if (!n) continue;
        const g = new BufferGeometry();
        g.setAttribute("position", geo.getAttribute("position"));
        g.setAttribute("normal", geo.getAttribute("normal"));
        g.setIndex(geo.getIndex());
        const life = new Float32Array(n * 2).fill(HIDDEN);
        const anim = new Float32Array(n * 2);
        const lifeAttr = new InstancedBufferAttribute(life, 2);
        g.setAttribute("aLife", lifeAttr);
        g.setAttribute("aAnim", new InstancedBufferAttribute(anim, 2));
        const mesh = new InstancedMesh(g, material, n);
        mesh.customDepthMaterial = depthMaterial;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3), 3);
        const pos = new Int16Array(n * 3);
        const pid = new Uint8Array(n);
        const jit = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const x = list[i * 4]!, y = list[i * 4 + 1]!, z = list[i * 4 + 2]!, v = list[i * 4 + 3]!;
          pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
          pid[i] = v;
          m4.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
          mesh.setMatrixAt(i, m4);
          anim[i * 2] = kindOf[v]!;
          anim[i * 2 + 1] = paramOf[v]!;
          const e = pal.entries[v]!;
          // occlusion ambiante : voisins au-dessus et autour, puis ciel bouché
          let ao = 1;
          if (e.kind !== Kind.Glow) {
            let above = 0, side = 0;
            for (let dz = -1; dz <= 1; dz++)
              for (let dx = -1; dx <= 1; dx++) {
                if ((dx || dz) && isOpaque(x + dx, y + 1, z + dz)) above++;
                if ((dx === 0) !== (dz === 0) && isOpaque(x + dx, y, z + dz)) side++;
              }
            ao = 1 - above * 0.05 - side * 0.035;
            for (let k = 2; k < 14; k++)
              if (isOpaque(x, y + k, z)) { ao *= 0.8 + k * 0.008; break; }
            if (e.kind === Kind.Water) ao = 0.85 + ao * 0.15;
          }
          const r = hash3(x, y, z);
          col.copy(e.color).multiplyScalar(Math.max(0.45, ao) * (1 + (r - 0.5) * 2 * e.jitter));
          mesh.setColorAt(i, col);
          jit[i] = hash3(z, x, y) * 0.35 + Math.max(0, y - 8) * 0.009;
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.boundingSphere!.radius += 20;
        mesh.visible = false;
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
        this.chunks.push({ mesh, n, pos, pid, jit, life, lifeAttr, vis: 0, x0: cx * CHUNK, z0: cz * CHUNK, hideAt: 0 });
        this.total += n;
      }
  }

  /** Avance le front de chargement autour de (px, pz). */
  update(now: number, px: number, pz: number, radius: number): void {
    const HY = 7;
    const R2 = radius * radius;
    const O2 = (radius + HY) * (radius + HY);
    for (const c of this.chunks) {
      const nx = Math.max(c.x0, Math.min(px, c.x0 + CHUNK));
      const nz = Math.max(c.z0, Math.min(pz, c.z0 + CHUNK));
      const minD = Math.hypot(nx - px, nz - pz);
      const fx = Math.max(Math.abs(px - c.x0), Math.abs(px - c.x0 - CHUNK));
      const fz = Math.max(Math.abs(pz - c.z0), Math.abs(pz - c.z0 - CHUNK));
      const maxD = Math.hypot(fx, fz);
      if (maxD < radius && c.vis === c.n) continue;
      if (minD > radius + HY && c.vis === 0) {
        if (c.mesh.visible && now > c.hideAt) c.mesh.visible = false;
        continue;
      }
      const { pos, life, jit } = c;
      let changed = false;
      for (let i = 0; i < c.n; i++) {
        const dx = pos[i * 3]! + 0.5 - px;
        const dz = pos[i * 3 + 2]! + 0.5 - pz;
        const d2 = dx * dx + dz * dz;
        const shown = life[i * 2]! < 1e8 && life[i * 2 + 1]! > 1e8;
        if (!shown && d2 < R2) {
          life[i * 2] = now + jit[i]!;
          life[i * 2 + 1] = HIDDEN;
          c.vis++;
          changed = true;
        } else if (shown && d2 > O2) {
          life[i * 2 + 1] = now + jit[i]! * 0.6;
          c.vis--;
          changed = true;
        }
      }
      if (changed) {
        c.lifeAttr.needsUpdate = true;
        if (c.vis > 0) c.mesh.visible = true;
        else c.hideAt = now + 1.5;
      }
    }
  }

  /**
   * Coupe la végétation dans une sphère : chaque voxel tranché est rendu
   * comme débris par `onCut`, puis repousse plus tard.
   */
  cut(now: number, x: number, y: number, z: number, r: number, onCut: (x: number, y: number, z: number, color: Color) => void): number {
    let count = 0;
    const col = new Color();
    for (const c of this.chunks) {
      if (x + r < c.x0 || x - r > c.x0 + CHUNK || z + r < c.z0 || z - r > c.z0 + CHUNK) continue;
      let changed = false;
      for (let i = 0; i < c.n; i++) {
        if (!this.cutOf[c.pid[i]!]) continue;
        const vx = c.pos[i * 3]! + 0.5, vy = c.pos[i * 3 + 1]! + 0.5, vz = c.pos[i * 3 + 2]! + 0.5;
        const dx = vx - x, dy = (vy - y) * 0.7, dz = vz - z;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
        if (c.life[i * 2]! > now || c.life[i * 2 + 1]! < 1e8) continue;
        c.life[i * 2] = now + 25 + Math.random() * 25;
        c.mesh.getColorAt(i, col);
        onCut(vx, vy, vz, col);
        count++;
        changed = true;
      }
      if (changed) c.lifeAttr.needsUpdate = true;
    }
    return count;
  }

  shownCount(): number {
    let s = 0;
    for (const c of this.chunks) s += c.vis;
    return s;
  }
}
