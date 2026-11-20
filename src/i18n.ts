/**
 * Textes du jeu en français et en anglais. Langue : `?lang=fr|en` dans l'adresse, sinon le choix
 * enregistré par le bouton FR/EN, sinon l’anglais par défaut.
 */
export type Lang = "fr" | "en";

const fr = {
  "game.subtitle": "La bataille navale sur la table du salon",

  "menu.duo": "À deux sur cet appareil",
  "menu.ai": "Contre l'ordinateur",
  "level.easy": "Moussaillon",
  "level.normal": "Capitaine",
  "level.hard": "Amiral",
  "menu.offline": "Prêt à jouer hors ligne",
  "lang.switch": "EN",
  "lang.switchLabel": "Play in English",

  "name.p1": "Joueur 1",
  "name.p2": "Joueur 2",
  "name.you": "Toi",
  "name.cpu": "L'ordinateur",

  "ship.carrier": "Porte-avions",
  "ship.cruiser": "Croiseur",
  "ship.destroyer": "Contre-torpilleur",
  "ship.sub": "Sous-marin",
  "ship.torpedo": "Torpilleur",
  "shipThe.carrier": "le porte-avions",
  "shipThe.cruiser": "le croiseur",
  "shipThe.destroyer": "le contre-torpilleur",
  "shipThe.sub": "le sous-marin",
  "shipThe.torpedo": "le torpilleur",
  "shipLow.carrier": "porte-avions",
  "shipLow.cruiser": "croiseur",
  "shipLow.destroyer": "contre-torpilleur",
  "shipLow.sub": "sous-marin",
  "shipLow.torpedo": "torpilleur",

  "fleet.mine": "Ta flotte",
  "fleet.enemy": "Flotte de {name}",
  "score": "Tirs : <b>{fired}</b> · Précision : <b>{acc} %</b>",

  "place.title": "Place ta flotte",
  "place.titleNamed": "{name}, place ta flotte",
  "place.rotate": "Pivoter",
  "place.random": "Au hasard",
  "place.done": "Flotte prête",
  "place.complete": "Flotte complète : <b>{ready}</b>",
  "place.tapSea": "<b>{ship}</b> : touche la mer pour le poser",
  "place.at": "{ship} en <b>{cell}</b>",
  "place.help.mouse": "Clic sur la mer : poser. Clic sur un navire : le reprendre. Clic droit ou R : pivoter.",
  "place.help.touch": "Glisse le doigt sur la mer, lève-le pour poser. Touche un navire pour le reprendre, puis Pivoter.",
  "turn.deploy": "Ton déploiement",
  "turn.deploySub": "Déploie tes navires sur ta mer",

  "ready.mouse": "Flotte prête",
  "ready.keys": "Entrée pour valider",
  "ready.pad": "A ou Start pour valider",
  "ready.touch": "touche « Flotte prête »",
  "fast.mouse": "Clic : accélérer l'action",
  "fast.keys": "Espace : accélérer l'action",
  "fast.pad": "A : accélérer l'action",
  "fast.touch": "Touche l'écran : accélérer l'action",

  "pass.eye": "Ne regarde pas l'écran de l'autre",
  "pass.to": "Passe {machine} à {who}",
  "pass.ready": "Je suis {name}, c'est parti",
  "pass.deploy2": "Joueur 1, tourne la tête : c'est au tour de l'autre amiral de déployer sa flotte.",
  "pass.begin": "Les flottes sont déployées. Que la bataille commence !",
  "pass.shot": "{shooter} a tiré. {next} verra le tir arriver sur sa mer.",
  "machine.touch": "l'appareil",
  "machine.pc": "l'ordinateur",

  "start.duo": "La bataille commence",
  "start.ai": "Tout le monde à son poste",
  "ai.aiming": "L'ordinateur vise…",
  "ai.calm": "Garde ton sang-froid",

  "aim.turn": "À toi",
  "aim.turnNamed": "À toi, {name}",
  "aim.sub": "Choisis une case sur ton panneau",
  "aim.touch": "Glisse le doigt sur ton <b>panneau</b> pour viser",
  "aim.blocked": "{cell} : déjà visée",
  "aim.fire": "Feu sur <b>{cell}</b>",
  "aim.fireButton": "FEU",
  "fire.self": "Feu sur {cell} !",
  "fire.named": "{name} : feu sur {cell} !",

  "shot.miss": "À l'eau !",
  "shot.hit": "Touché !",
  "shot.sunk": "Coulé !",
  "shot.at": "Tir en {cell}",
  "shot.sunkOut": "Tu as envoyé par le fond {ship}, en {cell}",
  "shot.sunkIn": "{shooter} a coulé ton {ship}",
  "shot.lid": "Coulé : le voici en entier sur ton panneau",
  "shot.incoming": "{shooter} tire en {cell}",

  "end.banner": "Flotte anéantie !",
  "end.duo": "{name} remporte la bataille !",
  "end.win": "Victoire, amiral !",
  "end.lose": "L'ordinateur a gagné",
  "end.sub": "{fired} tirs, {landed} au but, précision de {acc} %.<br/>Les navires survivants sont désormais à découvert.",
  "end.again": "Nouvelle bataille",
  "end.menu": "Menu",

  "pad.connected": "Manette connectée",
  "mute": "Couper le son",

  "hint.touch.aim": "<b>Glisse</b> sur le panneau pour viser, puis <b>Feu</b><br/><b>Glisse</b> à côté : tourner · <b>Pince</b> : zoom",
  "hint.keys.menu": "<b>Flèches</b> choisir · <b>Entrée</b> valider",
  "hint.keys.place": "<b>Flèches/ZQSD</b> déplacer · <b>Entrée</b> poser · <b>R</b> pivoter · <b>Tab</b> navire · <b>F</b> au hasard · <b>Retour</b> reprendre · <b>V</b> valider · <b>M</b> son",
  "hint.keys.aim": "<b>Flèches/ZQSD</b> viser · <b>Entrée</b> feu<br/><b>A/E</b> tourner · <b>PgUp/PgDn</b> incliner · <b>+/−</b> zoom · <b>C</b> recentrer · <b>M</b> son",
  "hint.keys.pass": "<b>Entrée</b> : c'est parti",
  "hint.keys.end": "<b>Flèches</b> choisir · <b>Entrée</b> valider",
  "hint.pad.menu": "<b>Croix</b> choisir · <b>A</b> valider",
  "hint.pad.place": "<b>Croix/Stick</b> déplacer · <b>A</b> poser · <b>Y</b> pivoter · <b>LB/RB</b> navire · <b>X</b> au hasard · <b>B</b> reprendre · <b>Start</b> valider · <b>Select</b> son",
  "hint.pad.aim": "<b>Croix/Stick</b> viser · <b>A</b> feu · <b>Y</b> recentrer<br/><b>Stick droit</b> caméra · <b>Gâchettes</b> zoom · <b>Select</b> son",
  "hint.pad.pass": "<b>A</b> : c'est parti",
  "hint.pad.end": "<b>Croix</b> choisir · <b>A</b> valider",
};

export type Key = keyof typeof fr;

const en: Record<Key, string> = {
  "game.subtitle": "A naval battle on the coffee table",

  "menu.duo": "Two players, one device",
  "menu.ai": "Against the computer",
  "level.easy": "Deckhand",
  "level.normal": "Captain",
  "level.hard": "Admiral",
  "menu.offline": "Ready to play offline",
  "lang.switch": "FR",
  "lang.switchLabel": "Jouer en français",

  "name.p1": "Player 1",
  "name.p2": "Player 2",
  "name.you": "You",
  "name.cpu": "The computer",

  "ship.carrier": "Carrier",
  "ship.cruiser": "Cruiser",
  "ship.destroyer": "Destroyer",
  "ship.sub": "Submarine",
  "ship.torpedo": "Torpedo boat",
  "shipThe.carrier": "the carrier",
  "shipThe.cruiser": "the cruiser",
  "shipThe.destroyer": "the destroyer",
  "shipThe.sub": "the submarine",
  "shipThe.torpedo": "the torpedo boat",
  "shipLow.carrier": "carrier",
  "shipLow.cruiser": "cruiser",
  "shipLow.destroyer": "destroyer",
  "shipLow.sub": "submarine",
  "shipLow.torpedo": "torpedo boat",

  "fleet.mine": "Your fleet",
  "fleet.enemy": "{name}'s fleet",
  "score": "Shots: <b>{fired}</b> · Accuracy: <b>{acc}%</b>",

  "place.title": "Place your fleet",
  "place.titleNamed": "{name}, place your fleet",
  "place.rotate": "Rotate",
  "place.random": "Random",
  "place.done": "Fleet ready",
  "place.complete": "Fleet complete: <b>{ready}</b>",
  "place.tapSea": "<b>{ship}</b>: tap the sea to place it",
  "place.at": "{ship} at <b>{cell}</b>",
  "place.help.mouse": "Click the sea: place. Click a ship: pick it up. Right-click or R: rotate.",
  "place.help.touch": "Slide your finger on the sea, lift it to place. Tap a ship to pick it up, then Rotate.",
  "turn.deploy": "Your deployment",
  "turn.deploySub": "Deploy your ships on your sea",

  "ready.mouse": "Fleet ready",
  "ready.keys": "Enter to confirm",
  "ready.pad": "A or Start to confirm",
  "ready.touch": "tap “Fleet ready”",
  "fast.mouse": "Click: speed things up",
  "fast.keys": "Space: speed things up",
  "fast.pad": "A: speed things up",
  "fast.touch": "Tap the screen: speed things up",

  "pass.eye": "Don't look at the other player's screen",
  "pass.to": "Hand {machine} to {who}",
  "pass.ready": "I'm {name}, let's go",
  "pass.deploy2": "Player 1, look away: the other admiral deploys their fleet now.",
  "pass.begin": "The fleets are deployed. Let the battle begin!",
  "pass.shot": "{shooter} has fired. {next} will see the shot land on their sea.",
  "machine.touch": "the device",
  "machine.pc": "the computer",

  "start.duo": "The battle begins",
  "start.ai": "Battle stations",
  "ai.aiming": "The computer is aiming…",
  "ai.calm": "Keep your cool",

  "aim.turn": "Your turn",
  "aim.turnNamed": "Your turn, {name}",
  "aim.sub": "Pick a square on your board",
  "aim.touch": "Slide your finger on your <b>board</b> to aim",
  "aim.blocked": "{cell}: already targeted",
  "aim.fire": "Fire at <b>{cell}</b>",
  "aim.fireButton": "FIRE",
  "fire.self": "Fire at {cell}!",
  "fire.named": "{name}: fire at {cell}!",

  "shot.miss": "Miss!",
  "shot.hit": "Hit!",
  "shot.sunk": "Sunk!",
  "shot.at": "Shot at {cell}",
  "shot.sunkOut": "You sent {ship} to the bottom at {cell}",
  "shot.sunkIn": "{shooter} sank your {ship}",
  "shot.lid": "Sunk: here it is, whole, on your board",
  "shot.incoming": "{shooter} fires at {cell}",

  "end.banner": "Fleet destroyed!",
  "end.duo": "{name} wins the battle!",
  "end.win": "Victory, admiral!",
  "end.lose": "The computer won",
  "end.sub": "{fired} shots, {landed} hits, {acc}% accuracy.<br/>The surviving ships are now revealed.",
  "end.again": "New battle",
  "end.menu": "Menu",

  "pad.connected": "Controller connected",
  "mute": "Mute",

  "hint.touch.aim": "<b>Slide</b> on the board to aim, then <b>Fire</b><br/><b>Slide</b> beside it: turn · <b>Pinch</b>: zoom",
  "hint.keys.menu": "<b>Arrows</b> choose · <b>Enter</b> confirm",
  "hint.keys.place": "<b>Arrows/WASD</b> move · <b>Enter</b> place · <b>R</b> rotate · <b>Tab</b> ship · <b>F</b> random · <b>Backspace</b> pick up · <b>V</b> confirm · <b>M</b> sound",
  "hint.keys.aim": "<b>Arrows/WASD</b> aim · <b>Enter</b> fire<br/><b>Q/E</b> turn · <b>PgUp/PgDn</b> tilt · <b>+/−</b> zoom · <b>C</b> recenter · <b>M</b> sound",
  "hint.keys.pass": "<b>Enter</b>: let's go",
  "hint.keys.end": "<b>Arrows</b> choose · <b>Enter</b> confirm",
  "hint.pad.menu": "<b>D-pad</b> choose · <b>A</b> confirm",
  "hint.pad.place": "<b>D-pad/Stick</b> move · <b>A</b> place · <b>Y</b> rotate · <b>LB/RB</b> ship · <b>X</b> random · <b>B</b> pick up · <b>Start</b> confirm · <b>Select</b> sound",
  "hint.pad.aim": "<b>D-pad/Stick</b> aim · <b>A</b> fire · <b>Y</b> recenter<br/><b>Right stick</b> camera · <b>Triggers</b> zoom · <b>Select</b> sound",
  "hint.pad.pass": "<b>A</b>: let's go",
  "hint.pad.end": "<b>D-pad</b> choose · <b>A</b> confirm",
};

const DICT: Record<Lang, Record<Key, string>> = { fr, en };
const STORE = "tableFleet.lang";
const isLang = (v: unknown): v is Lang => v === "fr" || v === "en";

function detect(): Lang {
  const asked = new URLSearchParams(location.search).get("lang");
  if (isLang(asked)) return asked;
  try {
    const saved = localStorage.getItem(STORE);
    if (isLang(saved)) return saved;
  } catch { /* stockage indisponible (navigation privée, etc.) */ }
  return "en";
}

export let lang: Lang = detect();

export function t(key: Key, params: Record<string, string | number> = {}): string {
  return DICT[lang][key].replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Texte facultatif (une aide qui n'existe que pour certains périphériques et phases). */
export function tMaybe(key: string): string | undefined {
  return (DICT[lang] as Record<string, string>)[key];
}

/** Textes fixes de la page : `data-i18n` (texte), `data-i18n-aria` (aria-label), `data-i18n-title`. */
export function applyStatic(): void {
  document.documentElement.lang = lang;
  document.title = `Table Fleet · ${t("game.subtitle")}`;
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset["i18n"] as Key); });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset["i18nAria"] as Key)); });
  document.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset["i18nTitle"] as Key); });
}

/** Change de langue, l'enregistre et réécrit les textes fixes ; `onChange` réécrit le reste. */
export function setLang(next: Lang, onChange?: () => void): void {
  lang = next;
  try { localStorage.setItem(STORE, next); } catch { /* tant pis : le choix vaut pour cette visite */ }
  const url = new URL(location.href);
  if (url.searchParams.has("lang")) {
    url.searchParams.delete("lang");
    history.replaceState(null, "", url);
  }
  applyStatic();
  onChange?.();
}
