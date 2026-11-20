import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  PCFSoftShadowMap,
  PointLight,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { HorizontalTiltShiftShader } from "three/examples/jsm/shaders/HorizontalTiltShiftShader.js";
import { VerticalTiltShiftShader } from "three/examples/jsm/shaders/VerticalTiltShiftShader.js";

export const canvas = document.getElementById("game") as HTMLCanvasElement;
export const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
const COARSE = window.matchMedia?.("(pointer: coarse)").matches === true;
// Sur tablette, on part d'une définition un peu moindre ; adaptQuality descend encore si besoin.
let pixelRatio = Math.min(window.devicePixelRatio, COARSE ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;

export const scene = new Scene();

// Ciel de fin d'après-midi : la même lumière dorée que la Vallée de Brume.
{
  const sky = document.createElement("canvas");
  sky.width = 4; sky.height = 256;
  const g = sky.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#b98a7e");
  grad.addColorStop(0.55, "#e5a884");
  grad.addColorStop(1, "#f4d6a4");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new CanvasTexture(sky);
  tex.colorSpace = SRGBColorSpace;
  scene.background = tex;
}

export const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 1400);
export const cam = { yaw: 0.4, pitch: 0.62, view: 190, target: new Vector3(104, 40, 104), shake: 0, fixed: false };

export const sun = new DirectionalLight(0xffe7c4, 2.5);
sun.position.set(104 + 170, 240, 104 + 8);
sun.target.position.set(104, 30, 104);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);
const sc = sun.shadow.camera;
sc.left = -135; sc.right = 135; sc.top = 135; sc.bottom = -135; sc.near = 1; sc.far = 700;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.35;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
scene.add(new HemisphereLight(0xdfe6ff, 0x7a6244, 1.25));
// les deux panneaux doivent être aussi lisibles l'un que l'autre
for (const sz of [1, -1]) {
  const fill = new DirectionalLight(0xfff0dc, 0.75);
  fill.position.set(104, 120, 104 + sz * 200);
  fill.target.position.set(104, 40, 104);
  scene.add(fill, fill.target);
}

/** Lueur brève des explosions. */
export const flash = new PointLight(0xffa050, 0, 180, 1.3);
scene.add(flash);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(pixelRatio);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.5, 0.6, 0.92);
composer.addPass(bloom);
const tiltH = new ShaderPass(HorizontalTiltShiftShader);
const tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms["r"]!.value = 0.5;
tiltV.uniforms["r"]!.value = 0.5;
composer.addPass(tiltH);
composer.addPass(tiltV);

/**
 * Le brouillage du passage de main : l'image éclate en grosses mosaïques de
 * voxels, floutées, secouées par bandes. À 1, plus rien n'est lisible.
 */
const scramble = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uAmt: { value: 0 },
    uTime: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAmt; uniform float uTime; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      float a = uAmt;
      if (a < 0.002) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      float size = mix(1.0, 70.0, a * a);
      vec2 px = vUv * uRes;
      float tick = floor(uTime * 10.0);
      float band = floor(px.y / (size * 2.0 + 6.0));
      float shift = (h(vec2(band, tick)) - 0.5) * a * a * 0.2;
      vec2 block = floor((px + vec2(shift * uRes.x, 0.0)) / size);
      vec2 uv = (block + 0.5) * size / uRes;
      vec3 col = vec3(0.0);
      float r = a * 0.085;
      for (int i = 0; i < 14; i++) {
        float t = float(i) * 2.399;
        float d = sqrt(float(i) / 14.0) * r;
        col += texture2D(tDiffuse, uv + vec2(cos(t), sin(t) * uRes.x / uRes.y) * d).rgb;
      }
      col /= 14.0;
      col *= 1.0 + (h(block + tick * 0.37) - 0.5) * 0.55 * a;
      vec2 in3 = fract((px + vec2(shift * uRes.x, 0.0)) / size);
      float bevel = smoothstep(0.0, 0.08, in3.x) * smoothstep(0.0, 0.08, in3.y);
      col *= mix(1.0, 0.72 + 0.28 * bevel, smoothstep(0.1, 0.5, a));
      col = mix(col, vec3(0.1, 0.13, 0.24) + col * 0.65, smoothstep(0.35, 1.0, a) * 0.55);
      gl_FragColor = vec4(col, 1.0);
    }`,
});
composer.addPass(scramble);
composer.addPass(new OutputPass());

export const fx = { scramble: 0, bloomBoost: 0 };

/**
 * Taille réelle de l'écran : un élément de 100lvh de haut. En app installée sur iPad,
 * window.innerHeight et les éléments fixés aux bords s'arrêtent au-dessus de la barre d'accueil,
 * ce qui laisserait une bande vide en bas.
 */
const screenBox = document.getElementById("screenProbe")!;
export function screenSize(): { w: number; h: number } {
  const r = screenBox.getBoundingClientRect();
  return { w: Math.round(r.width) || window.innerWidth, h: Math.round(r.height) || window.innerHeight };
}

function resize(): void {
  const { w, h } = screenSize();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  tiltH.uniforms["h"]!.value = 0.5 / w;
  tiltV.uniforms["v"]!.value = 0.5 / h;
  const pr = renderer.getPixelRatio();
  (scramble.uniforms["uRes"]!.value as Vector2).set(w * pr, h * pr);
}
window.addEventListener("resize", resize);
resize();

/** Sur un écran étroit, on recule pour garder toute la largeur du plateau. */
export function viewFactor(): number {
  const { w, h } = screenSize();
  return Math.max(1, (0.85 * h) / w);
}

/** Passe à un cadrage calculé pour l'écran (cam.view exact), sans saut d'image. */
export function setFixedView(on: boolean): void {
  if (on === cam.fixed) return;
  cam.view = on ? cam.view * viewFactor() : cam.view / viewFactor();
  cam.fixed = on;
}

let slowSum = 0, slowN = 0;
/** Descend la définition si l'appareil n'arrive plus à tenir une trentaine d'images par seconde. */
export function adaptQuality(rawDt: number): void {
  if (rawDt <= 0 || rawDt > 0.25) return; // onglet masqué, pas une vraie mesure
  slowSum += rawDt;
  if (++slowN < 90) return;
  const avg = slowSum / slowN;
  slowSum = 0; slowN = 0;
  if (avg > 1 / 34 && pixelRatio > 0.8) {
    pixelRatio = Math.max(0.75, pixelRatio - 0.25);
    renderer.setPixelRatio(pixelRatio);
    composer.setPixelRatio(pixelRatio);
    resize();
    console.info(`Table Fleet : définition réduite à ${pixelRatio}`);
  }
}

const tmp = new Vector3();
export function applyCamera(dt: number, clock: number): void {
  cam.shake *= Math.exp(-5 * dt);
  const d = 500;
  tmp.copy(cam.target);
  if (cam.shake > 0.02) {
    tmp.x += (Math.sin(clock * 71) + Math.sin(clock * 43)) * cam.shake * 0.5;
    tmp.y += Math.sin(clock * 61) * cam.shake * 0.6;
    tmp.z += (Math.sin(clock * 53) + Math.sin(clock * 37)) * cam.shake * 0.5;
  }
  camera.position.set(
    tmp.x + Math.cos(cam.pitch) * Math.sin(cam.yaw) * d,
    tmp.y + Math.sin(cam.pitch) * d,
    tmp.z + Math.cos(cam.pitch) * Math.cos(cam.yaw) * d,
  );
  camera.lookAt(tmp);
  const { w, h } = screenSize();
  const aspect = w / h;
  const view = cam.fixed ? cam.view : cam.view * viewFactor();
  camera.left = (-view * aspect) / 2;
  camera.right = (view * aspect) / 2;
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.updateProjectionMatrix();
}

export function renderFrame(dt: number, clock: number): void {
  flash.intensity *= Math.exp(-6 * dt);
  fx.bloomBoost *= Math.exp(-5 * dt);
  bloom.strength = 0.5 + fx.bloomBoost;
  scramble.uniforms["uAmt"]!.value = fx.scramble;
  scramble.uniforms["uTime"]!.value = clock;
  composer.render(dt);
}

