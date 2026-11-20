import {
  BoxGeometry,
  Color,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Quaternion,
  Euler,
  Vector3,
  type Scene,
} from "three";

export interface Spawn {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  color: Color | number;
  size?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  /** 1 = rebondit sur le sol, 0 = traverse. */
  ground?: number;
  /** >0 grossit avec l'âge (fumée), <0 rétrécit. */
  grow?: number;
  spin?: number;
  /** oscillation horizontale (feuilles qui virevoltent) */
  flutter?: number;
}

/** Débris, fumée, éclaboussures, braises : tous des petits cubes. */
export class Particles {
  readonly mesh: InstancedMesh;
  private count = 0;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly a: Float32Array; // âge, durée, taille, gravité, traînée, sol, croissance, rotation, phase, flutter
  private readonly c: Float32Array;
  private readonly m4 = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler();
  private readonly s = new Vector3();
  private readonly t = new Vector3();
  private readonly tmp = new Color();
  private static readonly A = 10;

  constructor(scene: Scene, readonly max: number, glow: boolean, private readonly groundAt: (x: number, z: number, y: number) => number) {
    const mat = glow ? new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }) : new MeshLambertMaterial({ color: 0xffffff });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !glow;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.a = new Float32Array(max * Particles.A);
    this.c = new Float32Array(max * 3);
    scene.add(this.mesh);
  }

  spawn(o: Spawn): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.p.set([o.x, o.y, o.z], i * 3);
    this.v.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    const A = Particles.A;
    this.a.set(
      [0, o.life ?? 1.2, o.size ?? 0.6, o.gravity ?? 30, o.drag ?? 0.5, o.ground ?? 1, o.grow ?? -1, o.spin ?? 6, Math.random() * 10, o.flutter ?? 0],
      i * A,
    );
    if (typeof o.color === "number") this.tmp.setHex(o.color);
    else this.tmp.copy(o.color);
    this.c.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
    this.mesh.setColorAt(i, this.tmp);
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number): void {
    const A = Particles.A;
    let colorsMoved = false;
    for (let i = 0; i < this.count; i++) {
      const o = i * A;
      this.a[o] = this.a[o]! + dt;
      if (this.a[o]! >= this.a[o + 1]!) {
        // remplace par la dernière particule vivante
        const last = --this.count;
        if (i !== last) {
          this.p.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.v.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.a.copyWithin(o, last * A, last * A + A);
          this.c.copyWithin(i * 3, last * 3, last * 3 + 3);
          this.tmp.setRGB(this.c[i * 3]!, this.c[i * 3 + 1]!, this.c[i * 3 + 2]!);
          this.mesh.setColorAt(i, this.tmp);
          colorsMoved = true;
        }
        i--;
        continue;
      }
      const drag = Math.exp(-this.a[o + 4]! * dt);
      const fl = this.a[o + 9]!;
      let vx = this.v[i * 3]! * drag;
      let vy = this.v[i * 3 + 1]! * drag - this.a[o + 3]! * dt;
      let vz = this.v[i * 3 + 2]! * drag;
      if (fl) {
        const ph = this.a[o + 8]! + this.a[o]! * 3;
        vx += Math.sin(ph) * fl * dt;
        vz += Math.cos(ph * 0.7) * fl * dt;
      }
      let x = this.p[i * 3]! + vx * dt;
      let y = this.p[i * 3 + 1]! + vy * dt;
      let z = this.p[i * 3 + 2]! + vz * dt;
      if (this.a[o + 5]!) {
        const g = this.groundAt(x, z, y + 1.5);
        const half = this.a[o + 2]! * 0.5;
        if (y - half < g) {
          y = g + half;
          vy = Math.abs(vy) > 3 ? -vy * 0.35 : 0;
          vx *= 0.6;
          vz *= 0.6;
          this.a[o + 7] = this.a[o + 7]! * 0.5;
        }
      }
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
      const k = this.a[o]! / this.a[o + 1]!;
      const grow = this.a[o + 6]!;
      let sc = this.a[o + 2]!;
      if (grow > 0) sc *= (1 + k * grow) * Math.min(1, (1 - k) * 4);
      else sc *= Math.min(1, (1 - k) * 3.5) * Math.min(1, k * 12 + 0.3);
      const rot = this.a[o + 8]! + this.a[o]! * this.a[o + 7]!;
      this.e.set(rot, rot * 0.7, rot * 0.3);
      this.q.setFromEuler(this.e);
      this.t.set(x, y, z);
      this.s.setScalar(Math.max(0.001, sc));
      this.m4.compose(this.t, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m4);
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (colorsMoved) this.mesh.instanceColor!.needsUpdate = true;
  }
}
