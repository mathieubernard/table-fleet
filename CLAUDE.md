# Table Fleet — notes pour Claude

Bataille navale voxel (three.js + Vite + TypeScript). Répondre en français.

- **Règles et IA** (`src/game/logic.ts`) : aucune dépendance au rendu. Niveaux : 64, 50 et 45 tirs en moyenne pour finir une partie (simulation de 400 parties par niveau).
- **Décor** (`src/world/gen.ts`) : table, mallettes et panneaux écrits dans le repère de chaque joueur (`put`), le joueur 2 étant le joueur 1 tourné de 180°.
- **Secret du jeu** : `updateVisibility` ne dessine jamais les navires intacts adverses. Le passage de main brouille l'écran d'abord, puis met `viewer` à `null`.
- **Tir à deux** : le tir est retiré (`removeMark`, `undoSink`) sous le brouillage, puis rejoué sur la mer du défenseur (`incoming`).
- **Entrées** (`src/game/input.ts`) : clavier et manette émettent des `Action` communes, `onAction` dans `main.ts` les répartit selon la phase.
- **Débogage** : `tableFleet.advance(s, render)` fait avancer la simulation, `tableFleet.freeze(true)` gèle la boucle. Les promesses ne se résolvent qu'entre deux appels : avancer par petits pas avec un `await`.
- **Tactile** : `pointerType` détermine le périphérique (`setDevice`). Au doigt, la visée suit le doigt sans tirer : seul le bouton Feu ou un second appui sur la même case tire. `placePose` calcule le cadrage selon l'écran et le panneau.
- **Hors ligne** (`tools/offlinePwa.ts`) : le build écrit un `sw.js` qui met tout en cache à l'installation. Chaque cache est préfixé par le dossier du jeu, jamais d'effacement global.
- **Langues** (`src/i18n.ts`) : tous les textes visibles passent par `t(clé, paramètres)`, dictionnaires `fr` et `en` (le type impose les mêmes clés). Langue : `?lang=fr|en`, sinon le choix du bouton FR/EN du menu (localStorage), sinon l’anglais par défaut. Textes fixes de `index.html` : attributs `data-i18n`, `data-i18n-aria`, `data-i18n-title`. Ne jamais employer « Battleship » (marque déposée).
- **GitHub Pages** : `.github/workflows/pages.yml` construit et publie `dist` à chaque poussée sur `main` (https://mathieubernard.github.io/table-fleet/). `base: "./"` dans Vite et le `sw.js` lit sa portée : le jeu marche sous n'importe quel sous-dossier.
- **Navire coulé** : `showWreckOnLid` l'affiche entier et en flammes sur le panneau du tireur, à sa place. Ces navires restent visibles après le passage de main : l'information est publique.
- **Musique** (`src/game/music.ts`) : boucle procédurale Web Audio (marimba, basse, nappe, balais, 86 BPM balancé, grilles et mélodies tirées d'un générateur à graine), ≈ −18 dB sous les effets, baissée de 6 dB sous `boom`/`sunk`. Démarre au premier geste (`audioUnlock`), s'arrête onglet caché et quand le son est coupé.
