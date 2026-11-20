import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Jeu installable et jouable hors ligne : à la fin du build, écrit un sw.js qui connaît tous les
 * fichiers du jeu et les met en cache dès son installation. Sans ça, une app ajoutée à l'écran
 * d'accueil d'un iPad n'aurait pas son code au premier lancement sans réseau.
 *
 * Chaque cache est préfixé par le dossier du jeu, et le jeu n'efface jamais que ses propres
 * anciennes versions (d'autres sites peuvent partager le même domaine).
 */
const SKIP = new Set(["sw.js", "og-image.png", ".DS_Store"]);

function listFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listFiles(path, root);
    return SKIP.has(name) ? [] : [relative(root, path).split("\\").join("/")];
  });
}

const swSource = (version: string, files: string[]) => `// Généré par tools/offlinePwa.ts : ne pas modifier à la main.
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(["./", ...files])};
const SCOPE = new URL(self.registration.scope);
const PREFIX = "offline:" + SCOPE.pathname + ":";
const CACHE = PREFIX + VERSION;
// La page attend le réseau un court instant, puis se rabat sur sa copie (métro, avion, mauvaise 4G).
const PAGE_TIMEOUT_MS = 2500;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((file) => new Request(new URL(file, SCOPE), { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys())
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function pageResponse(request, cache) {
  const copy = await cache.match(SCOPE.href);
  if (!copy) return fetch(request);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), PAGE_TIMEOUT_MS));
    const response = await Promise.race([fetch(request), timeout]);
    return response.ok ? response : copy;
  } catch {
    return copy;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.includes("/api/")) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (request.mode === "navigate") return pageResponse(request, cache);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  })());
});
`;

export function offlinePwa(): Plugin {
  let outDir = "dist";
  return {
    name: "offline-pwa",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files = listFiles(outDir).sort();
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      writeFileSync(join(outDir, "sw.js"), swSource(hash.digest("hex").slice(0, 12), files));
    },
  };
}
