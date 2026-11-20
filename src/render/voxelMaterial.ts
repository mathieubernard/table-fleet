import { MeshDepthMaterial, MeshLambertMaterial, RGBADepthPacking, Vector2, Vector3, Vector4 } from "three";

/** Uniformes partagés par tous les voxels du monde. */
export const VU = {
  uTime: { value: 0 },
  uPlayer: { value: new Vector3() },
  uNight: { value: 0 },
  uWind: { value: new Vector2(0.6, 0.25) },
  uCloud: { value: 1 },
  /** Ondes de choc dans l'eau : (x, z, instant, amplitude). */
  uRip: { value: [new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0), new Vector4(0, 0, -99, 0)] },
};

const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uPlayer;
uniform float uNight;
uniform vec2 uWind;
uniform vec4 uRip[4];
attribute vec2 aLife;  // (apparition, disparition) en secondes
attribute vec2 aAnim;  // (type, intensité)

float vxHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }

float bounceOut(float t) {
  if (t < 1.0 / 2.75) return 7.5625 * t * t;
  if (t < 2.0 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
}
float backOut(float t) { float c = 2.2; float u = t - 1.0; return 1.0 + (c + 1.0) * u * u * u + c * u * u; }

// Anime un voxel : arrivée en vague, vie propre, départ.
void voxelAnim(vec3 c, inout vec3 p, out float shade, out float glow) {
  int kind = int(aAnim.x + 0.5);
  float prm = aAnim.y;
  float h = vxHash(c);
  float tIn = clamp((uTime - aLife.x) / 0.95, 0.0, 1.0);
  float tOut = clamp((uTime - aLife.y) / 0.6, 0.0, 1.0);
  vec3 off = vec3(0.0);
  float s = 1.0;
  shade = 1.0;
  glow = 0.0;

  // --- arrivée
  if (kind == 1 || kind == 3) {
    // les plantes poussent depuis leur base
    s = tIn <= 0.0 ? 0.0 : backOut(tIn);
  } else if (kind == 2) {
    s = smoothstep(0.0, 0.25, tIn);
    off.y -= (1.0 - (1.0 - pow(1.0 - tIn, 3.0))) * 6.0;
  } else {
    s = smoothstep(0.0, 0.18, tIn);
    off.y += (1.0 - bounceOut(tIn)) * 18.0;
    float spin = (1.0 - tIn) * (h - 0.5) * 2.0;
    off.x += spin * 2.0;
    off.z -= spin * 1.5;
  }
  // --- départ
  s *= 1.0 - tOut;
  off.y -= tOut * tOut * 9.0;

  // --- vie
  if (kind == 1) {
    float lv = prm;
    float gust = sin(uTime * 0.7 + c.x * 0.03) * 0.5 + 0.5;
    float w = sin(uTime * 1.7 + c.x * 0.13 + c.z * 0.09) * 0.6 + sin(uTime * 3.9 + c.x * 0.5 + c.z * 0.31) * 0.22 + 0.35 * gust;
    off.xz += uWind * w * lv * 1.25;
    vec2 d = c.xz - uPlayer.xz;
    float l = length(d);
    float near = (1.0 - smoothstep(1.2, 5.5, l)) * step(abs(c.y - uPlayer.y - 2.0), 9.0);
    off.xz += d / (l + 0.001) * near * lv * 2.4;
    off.y -= near * lv * 0.9;
  } else if (kind == 3) {
    float a = prm * (0.55 + 0.45 * h) * (0.6 + length(uWind));
    off += vec3(sin(uTime * 2.1 + c.y * 0.4 + c.x * 0.3), sin(uTime * 1.3 + c.z * 0.5) * 0.5, cos(uTime * 1.8 + c.z * 0.35 + c.y * 0.2)) * 0.16 * a;
    shade = 0.95 + 0.1 * sin(uTime * 2.5 + h * 30.0);
  } else if (kind == 2) {
    off.y += (sin(uTime * 1.4 + c.x * 0.35 + c.z * 0.2) + sin(uTime * 2.2 - c.z * 0.45 + c.x * 0.1) * 0.6) * 0.16 * prm;
    shade = 0.93 + 0.08 * sin(uTime * 1.5 + c.x * 0.4 - c.z * 0.3);
    float sp = pow(max(0.0, sin(uTime * 1.9 + c.x * 0.83 + h * 6.28) * sin(uTime * 1.1 + c.z * 0.71 + h * 3.0)), 14.0);
    shade += sp * 1.1;
    for (int i = 0; i < 4; i++) {
      float rt = uTime - uRip[i].z;
      if (rt > 0.0 && rt < 3.5) {
        float rd = length(c.xz - uRip[i].xy);
        float front = smoothstep(rt * 30.0 + 3.0, rt * 30.0 - 6.0, rd);
        float wv = sin(rd * 0.85 - rt * 15.0) * exp(-rd * 0.035) * exp(-rt * 1.25) * front * uRip[i].w;
        off.y += wv;
        shade += max(0.0, wv) * 0.5;
      }
    }
  } else if (kind == 4) {
    float st = fract(c.y * 0.07 + uTime * 1.5 + h * 0.3 + c.x * 0.11 + c.z * 0.07);
    shade = 0.82 + 0.5 * smoothstep(0.72, 1.0, st);
    off.z += sin(uTime * 8.0 + c.y * 0.7) * 0.05;
    off.x += sin(uTime * 6.0 + c.y * 0.9 + c.x) * 0.05;
  } else if (kind == 5) {
    float flick = 0.86 + 0.14 * sin(uTime * 9.0 + h * 20.0) * sin(uTime * 5.3 + h * 7.0);
    glow = prm * (0.18 + 0.82 * uNight) * flick;
  }

  if (kind == 1 || kind == 3) p = (p + vec3(0.0, 0.5, 0.0)) * s - vec3(0.0, 0.5, 0.0) + off;
  else p = p * s + off;
}
`;

const VERT_HOOK = /* glsl */ `
#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 vxC = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 vxC = vec3(0.0);
#endif
  float vxShade; float vxGlow;
  voxelAnim(vxC, transformed, vxShade, vxGlow);
`;

/** Matériau des voxels du monde : lumière diffuse, vagues, ombres des nuages. */
export function makeVoxelMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: 0xffffff });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, VU);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}\nvarying float vShade;\nvarying float vGlow;\nvarying vec3 vWPos;`)
      .replace("#include <begin_vertex>", `${VERT_HOOK}\n  vShade = vxShade; vGlow = vxGlow; vWPos = vxC + transformed;`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime; uniform float uNight; uniform vec2 uWind; uniform float uCloud;
varying float vShade; varying float vGlow; varying vec3 vWPos;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1, 0)), f.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), f.x), f.y); }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  diffuseColor.rgb *= vShade;
  vec2 cp = vWPos.xz * 0.011 + uWind * uTime * 0.012;
  float cl = cNoise(cp) * 0.65 + cNoise(cp * 2.3 + 7.0) * 0.35;
  cl = smoothstep(0.52, 0.72, cl) * uCloud * (1.0 - uNight);
  diffuseColor.rgb *= 1.0 - cl * 0.28;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vGlow;`,
      );
  };
  return m;
}

/** Matériau d'ombre : mêmes déplacements, sinon les ombres ne suivent pas. */
export function makeVoxelDepthMaterial(): MeshDepthMaterial {
  const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, VU);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${COMMON}`)
      .replace("#include <begin_vertex>", VERT_HOOK);
  };
  return m;
}
