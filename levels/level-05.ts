import { defineLevel, type LevelBuilder, type Vec3 } from "@/leveldsl";

// Apartment 19.
//
// A fan-made tribute: Joey and Chandler's apartment, rebuilt from memory of the
// series. The couch, the two recliners, the foosball table, the entertainment
// center, the kitchen with the fridge in the corner, the hallway to the two
// bedrooms. Everything in the puzzles is original.
//
// The deadbolt wants a spare key, and the key hook by the door is empty. Joey
// froze it, behind a four-number lock he split between his friends so no one of
// them could get at his food.
//
//   LIVING ROOM
//    1. Phoebe left her guitar case and a chord sheet: the chords are the
//       case's code.                                              (music, A=1)
//       Inside: Joey's bedroom key, and the first number.
//   JOEY'S ROOM
//    2. A script page lists the faces Drake Ramoray pulls; five headshots on
//       the wall are numbered. The faces, in order, open the footlocker.
//                                                                 (acting)
//       Inside: the second number.
//   CHANDLER'S ROOM
//    3. His memo of quarterly figures has to be "reconfigured" before the
//       briefcase will open.                                      (the job)
//       Inside: the third number.
//   LIVING ROOM
//    4. Chick (Joey's room) and Duck (Chandler's room) go back in their
//       basket by the TV: the fourth number turns up.             (pets)
//   KITCHEN
//    5. The four numbers open the freezer; the key is inside.     (code)
//   THE DOOR
//    6. The key opens the front door.                             (exit)
//
// Plan (x east, z south; metres):
//
//   z -3.5 +--------------------------------+---------------+
//          | window  table        KITCHEN   |  JOEY'S ROOM  |
//          | foosball                       |               |
//          |                  peninsula     +-----+   +-----+
//          |            [couch]    [recliners]  hall: HALLWAY |
//   z  1.2 D (front door)                    =>  +-----+   +-----+
//          |       coffee table  TV         |  CHANDLER'S ROOM |
//   z  3.5 +--------------------------------+                  |
//         x 0                             9.0             12.4

const H = 2.7;
const T = 0.2;

const WALL = "#d3c19a";
const TRIM = "#efe6cf";
const FLOOR = "#7a5535";
const CEIL = "#eee7d6";
const STEEL = "#aeb2b5";
const DARK = "#2a2622";
const WOOD = "#6a4a2c";
const LEATHER = "#6b3e26";
const FABRIC = "#b08a58";
const BRASS = "#c49a3a";

type BoxOpts = Parameters<LevelBuilder["box"]>[0];
type Interact = NonNullable<BoxOpts["interact"]>;
type Pose = NonNullable<BoxOpts["pose"]>;
type Extra = Omit<BoxOpts, "id" | "at" | "size" | "color" | "pose"> & {
  slide?: { state: string; by: Vec3; solid?: boolean; duration?: number };
  spin?: { state: string; pivot: Vec3; angle: number; axis?: Vec3; solid?: boolean; duration?: number };
};

const mid = (a: number, b: number) => (a + b) / 2;

/** A box given by its extents: [x0, x1], [y0, y1], [z0, z1]. */
function ext(L: LevelBuilder, id: string, xs: [number, number], ys: [number, number], zs: [number, number], color: string, extra: Extra = {}) {
  const { slide, spin, ...rest } = extra;
  const at: Vec3 = [mid(...xs), mid(...ys), mid(...zs)];
  let pose: Pose | undefined;
  if (slide) {
    pose = {
      stateId: slide.state,
      open: { position: [at[0] + slide.by[0], at[1] + slide.by[1], at[2] + slide.by[2]], rotation: [0, rest.rotationY ?? 0, 0] },
      duration: slide.duration ?? 0.9,
      unblocksWhenOpen: slide.solid ?? false,
    };
  }
  if (spin) {
    pose = {
      stateId: spin.state,
      open: { position: at, rotation: [0, rest.rotationY ?? 0, 0] },
      duration: spin.duration ?? 0.9,
      spin: { pivot: spin.pivot, angle: spin.angle, axis: spin.axis },
      unblocksWhenOpen: spin.solid ?? false,
    };
  }
  return L.box({ id, at, size: [xs[1] - xs[0], ys[1] - ys[0], zs[1] - zs[0]], color, roughness: 0.85, ...rest, pose });
}

// ---- Interactions -------------------------------------------------------------------

const readable = (text: string): Interact => ({ behavior: { type: "readable", text } });

const codeLock = (code: string, stateId: string, lockedMessage: string, prompt: string): Interact => ({
  lock: { requires: { kind: "code", code }, lockedMessage, consumeItem: false },
  behavior: { type: "setState", stateId, value: true, prompt, sound: "open" },
});

const itemLock = (itemId: string, stateId: string, lockedMessage: string, prompt: string): Interact => ({
  lock: { requires: { kind: "item", itemId, held: true }, lockedMessage, consumeItem: false },
  behavior: { type: "setState", stateId, value: true, prompt, sound: "open" },
});

const toggle = (stateId: string, label: string): Interact => ({ behavior: { type: "toggleState", stateId, label } });

// ---- Shared pieces ----------------------------------------------------------------------

type Gap = { a: number; b: number; top: number };
const PLASTER = { isSolid: true, roughness: 1, castShadow: false };

/** A wall along x, centred on depth `z`, cut by openings that run up to `top`. */
function wallX(L: LevelBuilder, id: string, z: number, x0: number, x1: number, gaps: Gap[] = []) {
  let cur = x0;
  let n = 0;
  for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
    if (g.a > cur) ext(L, `${id}-${n++}`, [cur, g.a], [0, H], [z - T / 2, z + T / 2], WALL, PLASTER);
    if (g.top < H) ext(L, `${id}-${n++}`, [g.a, g.b], [g.top, H], [z - T / 2, z + T / 2], WALL, PLASTER);
    cur = g.b;
  }
  if (x1 > cur) ext(L, `${id}-${n++}`, [cur, x1], [0, H], [z - T / 2, z + T / 2], WALL, PLASTER);
}

/** A wall along z, centred on `x`. */
function wallZ(L: LevelBuilder, id: string, x: number, z0: number, z1: number, gaps: Gap[] = []) {
  let cur = z0;
  let n = 0;
  for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
    if (g.a > cur) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [0, H], [cur, g.a], WALL, PLASTER);
    if (g.top < H) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [g.top, H], [g.a, g.b], WALL, PLASTER);
    cur = g.b;
  }
  if (z1 > cur) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [0, H], [cur, z1], WALL, PLASTER);
}

function shell(L: LevelBuilder, id: string, xs: [number, number], zs: [number, number]) {
  ext(L, `${id}-floor`, xs, [-0.1, 0], zs, FLOOR, { isSolid: true, roughness: 0.7, castShadow: false });
  ext(L, `${id}-ceiling`, xs, [H, H + 0.1], zs, CEIL, { roughness: 1, castShadow: false });
}

/** A flush ceiling light and what it throws. */
function lamp(L: LevelBuilder, id: string, x: number, z: number, intensity: number, distance: number, shadow = false) {
  L.cylinder({ id: `${id}-fixture`, at: [x, H - 0.04, z], size: [0.4, 0.08, 0.4], color: "#fff4dc", emissive: "#ffe2a8", emissiveIntensity: 1.6, castShadow: false });
  L.pointLight({ id: `${id}-light`, at: [x, H - 0.3, z], color: "#ffe2b0", intensity, distance, castShadow: shadow });
}

/** An armchair facing south (+z), the back on its north side. */
function armchair(L: LevelBuilder, id: string, cx: number, cz: number, color: string, w = 0.9) {
  const hw = w / 2;
  const ix = readable("A recliner, well broken in.");
  const o = { isSolid: true, roughness: 0.55, interact: ix };
  ext(L, `${id}-base`, [cx - hw + 0.04, cx + hw - 0.04], [0, 0.22], [cz - 0.4, cz + 0.4], DARK, { isSolid: true });
  ext(L, `${id}-seat`, [cx - hw + 0.08, cx + hw - 0.08], [0.22, 0.46], [cz - 0.4, cz + 0.45], color, o);
  ext(L, `${id}-back`, [cx - hw, cx + hw], [0.46, 1.15], [cz - 0.5, cz - 0.28], color, o);
  ext(L, `${id}-arm-l`, [cx - hw, cx - hw + 0.14], [0.3, 0.68], [cz - 0.5, cz + 0.45], color, o);
  ext(L, `${id}-arm-r`, [cx + hw - 0.14, cx + hw], [0.3, 0.68], [cz - 0.5, cz + 0.45], color, o);
}

/**
 * A hinged door in a wall that runs along x, in the doorway [x0, x1] at depth z.
 * `hingeX` is the edge it hangs from, `angle` the way it swings (+ towards -z).
 */
function hingedDoor(L: LevelBuilder, id: string, x0: number, x1: number, z: number, hingeX: number, angle: number, state: string, ix: Interact, color: string) {
  const spin = { state, pivot: [hingeX, 0, z] as Vec3, angle, solid: true };
  ext(L, `${id}-leaf`, [x0, x1], [0, 2.1], [z - 0.05, z + 0.05], color, { isSolid: true, roughness: 0.6, interact: ix, spin });
  const kx = hingeX === x0 ? x1 - 0.14 : x0 + 0.14;
  ext(L, `${id}-knob`, [kx - 0.04, kx + 0.04], [0.95, 1.03], [z - 0.1, z + 0.1], BRASS, { metalness: 0.5, roughness: 0.3, interact: ix, spin, castShadow: false });
}

// ---- THE LIVING ROOM -------------------------------------------------------------------

function buildShell(L: LevelBuilder) {
  shell(L, "liv", [-0.1, 9.1], [-3.6, 3.6]);
  shell(L, "joey", [9.1, 12.5], [-3.6, 0.4]);
  shell(L, "hall", [9.1, 12.5], [0.4, 2.1]);
  shell(L, "chan", [9.1, 12.5], [2.1, 5.6]);

  // North wall: one long run over the living room, kitchen and Joey's room, with the window in it.
  wallX(L, "n", -3.5, -0.1, 12.5, [{ a: 1.4, b: 3.2, top: 2.1 }]);
  ext(L, "window-sill", [1.4, 3.2], [0, 0.9], [-3.6, -3.4], WALL, PLASTER);
  ext(L, "window-pane", [1.4, 3.2], [0.9, 2.1], [-3.54, -3.5], "#1d2c4c", { isSolid: true, emissive: "#4f6aa0", emissiveIntensity: 0.9, castShadow: false });
  for (const [i, x] of [1.4, 3.15].entries()) ext(L, `window-frame-${i}`, [x - 0.025, x + 0.025], [0.9, 2.1], [-3.5, -3.4], TRIM, { castShadow: false });
  for (const [i, y] of [0.9, 2.05].entries()) ext(L, `window-rail-${i}`, [1.4, 3.2], [y - 0.025, y + 0.025], [-3.5, -3.4], TRIM, { castShadow: false });
  ext(L, "window-mullion", [2.28, 2.32], [0.9, 2.1], [-3.5, -3.4], TRIM, { castShadow: false });
  // Blinds, half drawn up.
  for (let k = 0; k < 7; k++) ext(L, `blind-${k}`, [1.42, 3.18], [1.6 + k * 0.07, 1.64 + k * 0.07], [-3.46, -3.42], "#e4dcc6", { castShadow: false });
  // The city at night, beyond the glass.
  for (const [i, [x, w, h]] of ([[0.4, 2.4, 7], [3.0, 2.2, 9], [5.4, 3.0, 6], [8.6, 2.6, 8]] as Array<[number, number, number]>).entries()) {
    ext(L, `skyline-${i}`, [x, x + w], [0, h], [-9.0, -8.6], "#161b2a", { emissive: "#2a3350", emissiveIntensity: 0.5, castShadow: false });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ext(L, `skyline-${i}-w-${r}-${c}`, [x + 0.3 + c * (w / 3.4), x + 0.55 + c * (w / 3.4)], [1.6 + r * 1.3, 1.95 + r * 1.3], [-8.6, -8.58], "#f4d98a", { emissive: "#f4d98a", emissiveIntensity: 1.2, castShadow: false });
  }
  ext(L, "backdrop", [-6, 18], [0, 14], [-9.4, -9.0], "#10162a", { emissive: "#1e2848", emissiveIntensity: 0.7, castShadow: false });

  // The south wall, and the west wall with the front door in it.
  wallX(L, "s", 3.5, -0.1, 9.1);
  wallX(L, "cs", 5.5, 9.1, 12.5);
  wallZ(L, "w", 0, -3.6, 3.6, [{ a: 1.6, b: 2.6, top: 2.2 }]);
  // The east wall: an opening into the hallway, and Chandler's room's west wall beyond it.
  wallZ(L, "e", 9, -3.6, 5.6, [{ a: 0.6, b: 1.9, top: 2.3 }]);
  wallZ(L, "end", 12.4, -3.6, 5.6);
  // The hallway's walls, with a doorway into each bedroom.
  wallX(L, "hn", 0.5, 9.0, 12.4, [{ a: 10.2, b: 11.1, top: 2.1 }]);
  wallX(L, "hs", 2.0, 9.0, 12.4, [{ a: 10.2, b: 11.1, top: 2.1 }]);
  // Baseboards along the living-room walls.
  ext(L, "board-n", [-0.1, 9.0], [0, 0.12], [-3.4, -3.38], TRIM, { castShadow: false });
  ext(L, "board-s", [0, 9.0], [0, 0.12], [3.4, 3.42], TRIM, { castShadow: false });

  lamp(L, "liv-a", 2.6, 0.2, 6.5, 9, true);
  lamp(L, "liv-b", 6.2, 0.2, 6, 9);
  lamp(L, "kitchen", 6.8, -2.0, 5, 7);
  lamp(L, "hall", 10.8, 1.25, 3.4, 5);
  lamp(L, "joey", 10.7, -1.7, 5, 7);
  lamp(L, "chan", 10.7, 3.8, 5, 7);
  L.pointLight({ id: "moon", at: [2.3, 1.6, -3.0], color: "#8aa0d0", intensity: 1.2, distance: 5 });
}

function buildFrontDoor(L: LevelBuilder) {
  // A yellow frame round a wooden door, with a deadbolt, a chain and a peephole.
  const ix: Interact = {
    lock: { requires: { kind: "item", itemId: "apartment-key", held: true }, lockedMessage: "Deadbolted. The key hook beside it is empty.", consumeItem: false },
    behavior: { type: "exit" },
  };
  ext(L, "front-door", [-0.04, 0.06], [0, 2.2], [1.6, 2.6], "#8c5a2e", { isSolid: true, roughness: 0.6, interact: ix });
  const FR = "#e0b72a";
  ext(L, "front-frame-t", [-0.12, 0.12], [2.2, 2.3], [1.5, 2.7], FR, { castShadow: false });
  ext(L, "front-frame-n", [-0.12, 0.12], [0, 2.3], [1.5, 1.6], FR, { castShadow: false });
  ext(L, "front-frame-s", [-0.12, 0.12], [0, 2.3], [2.6, 2.7], FR, { castShadow: false });
  ext(L, "peephole-frame", [0.06, 0.1], [1.52, 1.64], [2.04, 2.16], FR, { castShadow: false });
  ext(L, "peephole", [0.1, 0.11], [1.55, 1.61], [2.07, 2.13], DARK, { castShadow: false });
  ext(L, "deadbolt", [0.06, 0.12], [1.15, 1.27], [1.7, 1.82], BRASS, { metalness: 0.8, roughness: 0.3, interact: ix, castShadow: false });
  ext(L, "chain", [0.06, 0.09], [1.5, 1.52], [1.66, 1.82], STEEL, { metalness: 0.8, interact: ix, castShadow: false });
  ext(L, "front-knob", [0.06, 0.14], [1.0, 1.08], [2.4, 2.48], BRASS, { metalness: 0.7, roughness: 0.3, interact: ix, castShadow: false });
  L.setExit("front-door");
  // The key hook, empty, and the coat hooks next to it.
  const hookIx = readable("Two hooks. One has a lanyard on it. The other, marked SPARE in Chandler's block capitals, has nothing.");
  ext(L, "hook-board", [0.1, 0.16], [1.45, 1.75], [0.8, 1.4], WOOD, { interact: hookIx, castShadow: false });
  for (const z of [0.95, 1.25]) ext(L, `hook-${z}`, [0.16, 0.24], [1.58, 1.62], [z - 0.02, z + 0.02], BRASS, { interact: hookIx, castShadow: false });
}

const LEATHER_DARK = "#5a3320";

function buildSeating(L: LevelBuilder) {
  // The couch, facing the TV, between the two recliners.
  const cx = 5.0;
  const cz = 1.3;
  const ix = readable("The couch. It has seen things.");
  ext(L, "couch-base", [cx - 1.4, cx + 1.4], [0, 0.4], [cz - 0.4, cz + 0.4], FABRIC, { isSolid: true, interact: ix });
  ext(L, "couch-back", [cx - 1.4, cx + 1.4], [0.4, 1.0], [cz - 0.45, cz - 0.25], FABRIC, { isSolid: true, interact: ix });
  for (const [i, x] of [cx - 1.4, cx + 1.3].entries()) ext(L, `couch-arm-${i}`, [x, x + 0.1], [0.4, 0.62], [cz - 0.45, cz + 0.4], FABRIC, { isSolid: true, interact: ix });
  for (const [i, x] of [cx - 1.3, cx - 0.4, cx + 0.5].entries()) ext(L, `couch-cushion-${i}`, [x + 0.04, x + 0.86], [0.4, 0.5], [cz - 0.25, cz + 0.38], "#bf9a66", { interact: ix, castShadow: false });
  // The two Barcaloungers.
  armchair(L, "recliner-joey", 2.4, 1.4, LEATHER);
  armchair(L, "recliner-chandler", 7.6, 1.4, LEATHER_DARK);
  // The coffee table in front of the couch.
  ext(L, "coffee-top", [4.1, 5.9], [0.38, 0.44], [2.05, 2.75], WOOD, { isSolid: true });
  for (const x of [4.15, 5.8]) for (const z of [2.1, 2.7]) ext(L, `coffee-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.38], [z - 0.03, z + 0.03], "#3e2a16", { castShadow: false });
  // On it: Phoebe's chord sheet, and a pizza box.
  ext(L, "chord-sheet", [4.4, 4.72], [0.44, 0.452], [2.25, 2.6], "#f1ead4", {
    rotationY: 0.25,
    castShadow: false,
    interact: readable(
      "SMELLY CAT (take 2)    — P.B.\n\n" +
        "G     Smelly cat, smelly cat\n" +
        "C     la la la, la la la\n" +
        "G     Smelly cat, smelly cat\n" +
        "D     la la la, la la la\n\n" +
        "(Joey, please stop eating the capo.)",
    ),
  });
  ext(L, "pizza-box", [5.2, 5.75], [0.44, 0.5], [2.25, 2.7], "#c8b48a", { interact: readable("Empty. Not even a crust. There's a name on the lid: JOEY."), castShadow: false });
}

function buildTV(L: LevelBuilder) {
  // The entertainment center on the south wall.
  ext(L, "ent-base", [3.8, 6.2], [0, 0.6], [3.0, 3.4], "#3e2c1c", { isSolid: true });
  for (const [i, x] of [3.82, 4.62, 5.42].entries()) ext(L, `ent-door-${i}`, [x, x + 0.76], [0.06, 0.54], [2.97, 3.0], "#4c3724", { castShadow: false });
  ext(L, "ent-top", [3.75, 6.25], [0.6, 0.64], [2.98, 3.42], "#2f2013", { isSolid: true });
  ext(L, "tv-body", [4.2, 5.8], [0.64, 1.3], [3.05, 3.38], DARK, { isSolid: true, interact: readable("The TV is off. The reflection of the room looks back, a bit more together than it is.") });
  ext(L, "tv-screen", [4.28, 5.72], [0.72, 1.24], [3.03, 3.05], "#101820", { emissive: "#1c2a3a", emissiveIntensity: 0.6, castShadow: false });
  ext(L, "vcr", [4.4, 5.6], [0.64, 0.72], [2.98, 3.3], "#3a3a3a", { castShadow: false });
  // Shelves of tapes either side.
  for (const [i, [x0, x1]] of ([[0.4, 1.4], [7.6, 8.6]] as Array<[number, number]>).entries()) {
    ext(L, `shelf-${i}`, [x0, x1], [0, 1.9], [3.1, 3.4], "#4a3420", { isSolid: true });
    for (let r = 0; r < 4; r++) ext(L, `shelf-${i}-row-${r}`, [x0 + 0.04, x1 - 0.04], [0.3 + r * 0.45, 0.62 + r * 0.45], [3.05, 3.1], ["#7a2d2d", "#2d4a7a", "#7a6a2d", "#3a6a4a"][(r + i) % 4], { castShadow: false });
  }
  // The pets' basket, by the TV.
  const ix: Interact = {
    behavior: {
      type: "combine",
      groups: [
        { label: "Chick", itemIds: ["chick"] },
        { label: "Duck", itemIds: ["duck"] },
      ],
      stateId: "pets-home",
      prompt: "Put them in the basket",
      done: "Chick and Duck settle down in the basket, side by side. Something slides out from under the blanket.",
      missing: "A wicker basket with a blanket in it, lined with feathers. Still missing:",
      already: "The basket's occupied.",
    },
  };
  ext(L, "basket", [6.5, 7.1], [0, 0.3], [2.4, 2.9], "#a78a4e", { isSolid: true, interact: ix });
  ext(L, "basket-blanket", [6.55, 7.05], [0.3, 0.33], [2.45, 2.85], "#8c3a3a", { interact: ix, castShadow: false });
  ext(L, "basket-card", [6.68, 6.92], [0.331, 0.34], [2.55, 2.75], "#f1ead4", {
    appearsWhen: "pets-home",
    castShadow: false,
    interact: readable("A vet's appointment card, folded over twice. On the back, in Joey's handwriting:\n\n_ _ _ 7"),
  });
}

function buildGuitar(L: LevelBuilder) {
  // The guitar, lying on the couch cushion by the chord sheet's end.
  const ix = readable("A guitar, tuned to something that isn't quite a chord.");
  L.cylinder({ id: "guitar-lower", at: [3.9, 0.55, 1.3], size: [0.4, 0.09, 0.4], color: "#b57a3a", roughness: 0.4, interact: ix, castShadow: false });
  L.cylinder({ id: "guitar-upper", at: [4.2, 0.55, 1.3], size: [0.3, 0.09, 0.3], color: "#b57a3a", roughness: 0.4, interact: ix, castShadow: false });
  L.cylinder({ id: "guitar-hole", at: [4.0, 0.605, 1.3], size: [0.1, 0.01, 0.1], color: DARK, interact: ix, castShadow: false });
  ext(L, "guitar-neck", [4.3, 4.85], [0.5, 0.57], [1.275, 1.325], "#3a2a1a", { interact: ix, castShadow: false });

  // Her case, on the floor by the west recliner.
  L.codedChest({
    id: "guitar-case",
    at: [1.25, 0, 0.1],
    code: "7374",
    size: [0.95, 0.18, 0.38],
    bodyColor: "#2a2420",
    lidColor: "#332c26",
    lockedMessage: "A guitar case with a four-digit combination lock.",
  });
  L.pickup({ id: "penguin-key", at: [1.0, 0.09, 0.1], itemId: "penguin-key", label: "Penguin key", icon: "🐧", mesh: { shape: "box", size: [0.07, 0.012, 0.03], color: "#d9d9d9", metalness: 0.7, roughness: 0.3, emissive: "#8f969c", emissiveIntensity: 0.3 }, rotationY: 0.3 });
  ext(L, "napkin-phoebe", [1.4, 1.62], [0.065, 0.075], [0.02, 0.2], "#f4efe0", {
    castShadow: false,
    interact: readable("A Central Perk napkin, in purple pen.\n\n3 _ _ _\n\n(Don't tell Chandler I know. — P)"),
  });
}

function buildFoosball(L: LevelBuilder) {
  const ix = readable("The foosball table. The score has been written on the side in marker, and crossed out, and written again. Both of them say they're winning.");
  ext(L, "foos-body", [0.5, 1.25], [0.72, 0.92], [-2.8, -1.2], "#2b4a2e", { isSolid: true, interact: ix });
  ext(L, "foos-field", [0.58, 1.17], [0.92, 0.94], [-2.72, -1.28], "#3f7a46", { interact: ix, castShadow: false });
  for (const [i, z] of [-2.55, -2.25, -1.95, -1.65, -1.45].entries()) {
    ext(L, `foos-rod-${i}`, [0.35, 1.4], [1.0, 1.04], [z - 0.015, z + 0.015], STEEL, { metalness: 0.7, interact: ix, castShadow: false });
    ext(L, `foos-grip-${i}`, [1.4, 1.52], [0.98, 1.06], [z - 0.03, z + 0.03], DARK, { interact: ix, castShadow: false });
  }
  for (const x of [0.54, 1.2]) for (const z of [-2.76, -1.24]) ext(L, `foos-leg-${x}-${z}`, [x - 0.04, x + 0.04], [0, 0.72], [z - 0.04, z + 0.04], "#1d1914", { castShadow: false });
}

function buildKitchen(L: LevelBuilder) {
  // Base cabinets, the counter, the sink and the stove along the north wall.
  const cab = readable("Cabinets. Mostly cereal, mostly Joey's. A lot of mugs.");
  ext(L, "cab-base", [5.2, 8.2], [0, 0.9], [-3.4, -2.75], "#d8cfb6", { isSolid: true, interact: cab });
  ext(L, "counter", [5.2, 8.2], [0.9, 0.95], [-3.4, -2.7], "#4a4a48", { isSolid: true });
  ext(L, "sink", [5.5, 6.4], [0.9, 0.96], [-3.3, -2.85], STEEL, { metalness: 0.5, interact: cab, castShadow: false });
  L.cylinder({ id: "tap", at: [5.95, 1.05, -3.35], size: [0.04, 0.2, 0.04], color: STEEL, metalness: 0.9, castShadow: false });
  ext(L, "stove", [6.8, 7.5], [0.9, 0.95], [-3.35, -2.8], "#d9d9d6", { isSolid: true, interact: cab, castShadow: false });
  for (const [i, [x, z]] of ([[6.95, -3.2], [7.35, -3.2], [6.95, -2.95], [7.35, -2.95]] as Array<[number, number]>).entries()) ext(L, `burner-${i}`, [x - 0.07, x + 0.07], [0.95, 0.97], [z - 0.07, z + 0.07], DARK, { castShadow: false });
  ext(L, "cab-upper", [5.2, 8.2], [1.5, 2.15], [-3.4, -3.05], "#d8cfb6", { isSolid: true, interact: cab });
  // The peninsula, with a pair of stools.
  ext(L, "peninsula", [5.2, 7.8], [0, 0.9], [-1.8, -1.2], "#d8cfb6", { isSolid: true, interact: cab });
  ext(L, "peninsula-top", [5.2, 7.9], [0.9, 0.95], [-1.85, -1.15], "#4a4a48", { isSolid: true });
  for (const [i, x] of [5.9, 7.0].entries()) {
    L.cylinder({ id: `stool-${i}-seat`, at: [x, 0.68, -0.85], size: [0.36, 0.06, 0.36], color: LEATHER, castShadow: false });
    L.cylinder({ id: `stool-${i}-leg`, at: [x, 0.33, -0.85], size: [0.06, 0.66, 0.06], color: STEEL, metalness: 0.6, isSolid: true, castShadow: false });
  }
  // The round table under the window, with its two chairs.
  L.cylinder({ id: "round-top", at: [2.3, 0.73, -2.3], size: [0.95, 0.05, 0.95], color: "#8a6a3e", isSolid: true });
  L.cylinder({ id: "round-leg", at: [2.3, 0.36, -2.3], size: [0.1, 0.72, 0.1], color: "#3a2a1a", castShadow: false });
  for (const [i, x] of [1.6, 3.0].entries()) {
    ext(L, `chair-${i}-seat`, [x - 0.2, x + 0.2], [0.42, 0.46], [-2.5, -2.1], "#8a6a3e", { isSolid: true });
    ext(L, `chair-${i}-back`, [x - 0.2, x + 0.2], [0.46, 0.95], [i === 0 ? -2.5 : -2.14, i === 0 ? -2.46 : -2.1], "#8a6a3e", { castShadow: false });
  }
  ext(L, "table-mug", [2.2, 2.3], [0.755, 0.83], [-2.35, -2.25], "#f0ede4", { castShadow: false, interact: readable("A mug of coffee, still warm. Nobody is around.") });
}

function buildFridge(L: LevelBuilder) {
  // Corner of the kitchen. The freezer on top is hollow, so what's in it can't be reached with the door shut.
  const fx: [number, number] = [8.2, 8.9];
  const fz: [number, number] = [-3.4, -2.7];
  const body = "#dedbd2";
  ext(L, "fridge-lower", fx, [0, 1.25], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fridge-lower-door-line", [8.2, 8.9], [1.24, 1.26], [-2.72, -2.7], DARK, { castShadow: false });
  ext(L, "fz-back", fx, [1.25, 1.9], [-3.4, -3.36], body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-left", [8.2, 8.24], [1.25, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-right", [8.86, 8.9], [1.25, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-top", fx, [1.86, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-bottom", fx, [1.25, 1.29], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fridge-top", fx, [1.9, 2.1], fz, body, { roughness: 0.4 });
  // The freezer door, with a lock on it, hinged on the west side.
  const ix = codeLock("3817", "freezer-open", "A combination lock, brand new, hasp-and-staple on the freezer door. Someone has written MINE on a piece of tape.", "Try the lock");
  const spin = { state: "freezer-open", pivot: [8.2, 0, -2.7] as Vec3, angle: -1.9 };
  ext(L, "fz-door", fx, [1.25, 1.9], [-2.74, -2.7], body, { isSolid: true, roughness: 0.4, interact: ix, spin });
  ext(L, "fz-handle", [8.8, 8.84], [1.45, 1.75], [-2.7, -2.64], STEEL, { metalness: 0.7, interact: ix, spin, castShadow: false });
  ext(L, "fz-lock", [8.7, 8.82], [1.55, 1.68], [-2.7, -2.62], BRASS, { metalness: 0.8, roughness: 0.3, interact: ix, spin, castShadow: false });
  ext(L, "fz-tape", [8.4, 8.66], [1.6, 1.64], [-2.7, -2.695], "#f4efe0", { interact: ix, spin, castShadow: false });
  L.pickup({ id: "apartment-key", at: [8.55, 1.31, -3.05], itemId: "apartment-key", label: "Apartment key", icon: "🔑", mesh: "key", rotationY: 0.5 });
  // The fridge door, covered in magnets and a Magna Doodle.
  const mx = readable("A MAGNA DOODLE, scrawled with a face, a sandwich and a half-erased list: MILK, MILK, MILK. Joey's and Chandler's handwriting argue with each other down the whole board.");
  ext(L, "magna", [8.3, 8.8], [0.65, 1.1], [-2.7, -2.68], "#d8d6c8", { interact: mx, castShadow: false });
  ext(L, "magna-border", [8.28, 8.82], [0.63, 0.65], [-2.7, -2.68], "#c63a2a", { interact: mx, castShadow: false });
  ext(L, "fridge-handle", [8.8, 8.84], [0.4, 0.95], [-2.7, -2.64], STEEL, { metalness: 0.7, castShadow: false });
  for (const [i, [x, y, c]] of ([[8.35, 0.45, "#d0261c"], [8.5, 0.5, "#2a5ad8"], [8.65, 0.4, "#e8c020"]] as Array<[number, number, string]>).entries()) ext(L, `magnet-${i}`, [x, x + 0.08], [y, y + 0.08], [-2.7, -2.67], c, { castShadow: false });
}

function buildLiving(L: LevelBuilder) {
  buildFrontDoor(L);
  buildSeating(L);
  buildTV(L);
  buildGuitar(L);
  buildFoosball(L);
  buildKitchen(L);
  buildFridge(L);
  // A lamp on a side table by the east recliner, and a plant by the door.
  ext(L, "side-table", [8.2, 8.7], [0, 0.55], [1.2, 1.6], WOOD, { isSolid: true });
  L.cylinder({ id: "side-lamp-base", at: [8.45, 0.65, 1.4], size: [0.12, 0.2, 0.12], color: "#d9c9a0", castShadow: false });
  L.cylinder({ id: "side-lamp-shade", at: [8.45, 0.88, 1.4], size: [0.3, 0.2, 0.3], color: "#f2e3b8", emissive: "#f2d38a", emissiveIntensity: 0.9, castShadow: false });
  L.pointLight({ id: "side-lamp-light", at: [8.45, 0.95, 1.4], color: "#ffd28a", intensity: 1.6, distance: 4 });
  L.cylinder({ id: "plant-pot", at: [0.45, 0.2, 3.0], size: [0.3, 0.4, 0.3], color: "#7a4a2a", isSolid: true });
  L.sphere({ id: "plant-leaves", at: [0.45, 0.75, 3.0], size: [0.6, 0.6, 0.6], color: "#3a6a34", castShadow: false });
}

// ---- THE HALLWAY ------------------------------------------------------------------------------

function buildHallway(L: LevelBuilder) {
  ext(L, "hall-door-bath", [12.3, 12.4], [0, 2.1], [0.8, 1.7], "#c9b58a", { interact: readable("The bathroom. The fan's been left on."), castShadow: false });
  ext(L, "hall-door-bath-knob", [12.25, 12.3], [0.98, 1.06], [1.5, 1.58], BRASS, { castShadow: false });
  ext(L, "hall-rug", [9.4, 12.0], [0, 0.01], [0.8, 1.7], "#7a3a3a", { castShadow: false });
  // Joey's door is locked; Chandler's isn't.
  const joeyLocked = itemLock("penguin-key", "joey-door-open", "Locked. A sticker of a penguin is stuck to the keyhole. Under it, in marker: KEEP OUT.", "Unlock the door");
  hingedDoor(L, "joey-door", 10.2, 11.1, 0.5, 10.2, 1.6, "joey-door-open", joeyLocked, "#b0803f");
  hingedDoor(L, "chan-door", 10.2, 11.1, 2.0, 10.2, -1.6, "chan-door-open", toggle("chan-door-open", "door"), "#b0803f");
  ext(L, "joey-nameplate", [10.4, 10.9], [1.55, 1.7], [0.44, 0.45], BRASS, { castShadow: false });
  ext(L, "chan-nameplate", [10.4, 10.9], [1.55, 1.7], [2.05, 2.06], BRASS, { castShadow: false });
}

// ---- JOEY'S ROOM -----------------------------------------------------------------------------------

const FACES: Array<[string, string]> = [
  ["😀", "1"],
  ["😮", "2"],
  ["😠", "3"],
  ["😢", "4"],
  ["😏", "5"],
];

function buildJoeyRoom(L: LevelBuilder) {
  // The bed, along the north wall.
  ext(L, "j-bed-frame", [9.3, 11.3], [0.15, 0.4], [-3.4, -1.5], "#4a3420", { isSolid: true });
  ext(L, "j-bed-mattress", [9.35, 11.25], [0.4, 0.58], [-3.35, -1.55], "#d9d1bc", { isSolid: true, roughness: 1 });
  ext(L, "j-bed-blanket", [9.35, 11.25], [0.58, 0.64], [-2.7, -1.55], "#6a3030", { roughness: 1, castShadow: false });
  ext(L, "j-bed-pillow", [9.5, 10.2], [0.58, 0.7], [-3.3, -2.9], "#efe7d3", { roughness: 1, castShadow: false });
  // Hugsy, on the pillow.
  const hugsy = readable("Hugsy. A stuffed penguin with a lot of miles on him.");
  L.sphere({ id: "hugsy-body", at: [9.95, 0.8, -3.1], size: [0.22, 0.28, 0.2], color: "#1f1f24", interact: hugsy, castShadow: false });
  L.sphere({ id: "hugsy-belly", at: [9.95, 0.79, -3.0], size: [0.15, 0.2, 0.1], color: "#f1efe6", interact: hugsy, castShadow: false });
  // Nightstand, lamp, and Chick.
  ext(L, "j-nightstand", [11.4, 11.9], [0, 0.55], [-3.4, -2.9], WOOD, { isSolid: true });
  L.cylinder({ id: "j-lamp-base", at: [11.65, 0.68, -3.15], size: [0.1, 0.25, 0.1], color: "#d9c9a0", castShadow: false });
  L.cylinder({ id: "j-lamp-shade", at: [11.65, 0.92, -3.15], size: [0.28, 0.2, 0.28], color: "#f2e3b8", emissive: "#f2d38a", emissiveIntensity: 0.9, castShadow: false });
  L.pointLight({ id: "j-lamp-light", at: [11.65, 1.0, -3.1], color: "#ffd28a", intensity: 1.5, distance: 4 });
  L.pickup({ id: "chick", at: [11.8, 0.6, -3.0], itemId: "chick", label: "Chick", icon: "🐥", mesh: { shape: "sphere", size: [0.11, 0.1, 0.11], color: "#f2d13a", roughness: 0.9 }, rotationY: 0.4 });

  // Headshots on the east wall, over a dresser.
  ext(L, "j-dresser", [11.8, 12.3], [0, 0.85], [-2.6, -1.3], WOOD, { isSolid: true });
  for (const [i, [emoji, num]] of FACES.entries()) {
    const z = -3.25 + i * 0.42;
    ext(L, `headshot-${i + 1}`, [12.255, 12.3], [1.35, 1.8], [z, z + 0.34], "#ffffff", {
      texture: `face:${emoji}:${num}`,
      castShadow: false,
      interact: readable(`Headshot, number ${num}, signed across the bottom: "Joey Tribbiani."`),
    });
  }
  // The script on a little desk by the west wall.
  ext(L, "j-desk", [9.3, 9.9], [0.7, 0.75], [-1.2, -0.2], WOOD, { isSolid: true });
  for (const [x, z] of [[9.35, -1.15], [9.85, -1.15], [9.35, -0.25], [9.85, -0.25]]) ext(L, `j-desk-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.7], [z - 0.03, z + 0.03], "#3e2a16", { castShadow: false });
  ext(L, "j-script", [9.4, 9.72], [0.75, 0.762], [-0.9, -0.55], "#f1ead4", {
    rotationY: 0.2,
    castShadow: false,
    interact: readable(
      "DAYS OF OUR LIVES — scene 14, Dr. Drake Ramoray\n\n" +
        "Drake wakes from the coma.\n" +
        "He's told he'll never operate again. (stunned)\n" +
        "He remembers the elevator shaft. (crushed)\n" +
        "He faces the man who pushed him. (furious)\n" +
        "The nurse comes in. (that look)\n\n" +
        "— Joey: DO NOT CHANGE the faces, I have them marked on the wall.",
    ),
  });
  // The footlocker, by the door.
  L.codedChest({
    id: "j-footlocker",
    at: [11.7, 0, -0.55],
    code: "2435",
    size: [0.9, 0.45, 0.5],
    bodyColor: "#3a3f4a",
    lidColor: "#2f333c",
    lockedMessage: "A footlocker with a four-digit combination lock. A sticker on the lid says PROP DEPARTMENT: DO NOT TOUCH.",
  });
  ext(L, "j-note", [11.55, 11.8], [0.065, 0.075], [-0.62, -0.46], "#f4efe0", {
    castShadow: false,
    interact: readable("In Joey's handwriting, on the back of a headshot:\n\n_ 8 _ _\n\n(Hands off, Chandler. This is mine.)"),
  });
}

// ---- CHANDLER'S ROOM ---------------------------------------------------------------------------------

function buildChandlerRoom(L: LevelBuilder) {
  // The bed, along the south wall.
  ext(L, "c-bed-frame", [9.3, 11.3], [0.15, 0.4], [3.5, 5.4], "#3a2a1a", { isSolid: true });
  ext(L, "c-bed-mattress", [9.35, 11.25], [0.4, 0.58], [3.55, 5.35], "#c9d0d8", { isSolid: true, roughness: 1 });
  ext(L, "c-bed-blanket", [9.35, 11.25], [0.58, 0.64], [4.2, 5.35], "#2f4a6a", { roughness: 1, castShadow: false });
  ext(L, "c-bed-pillow", [9.5, 10.2], [0.58, 0.7], [5.0, 5.3], "#efe7d3", { roughness: 1, castShadow: false });
  L.pickup({ id: "duck", at: [10.0, 0.76, 4.7], itemId: "duck", label: "Duck", icon: "🦆", mesh: { shape: "sphere", size: [0.14, 0.12, 0.14], color: "#ece5c8", roughness: 0.9 }, rotationY: 0.4 });

  // A desk on the east wall with a computer, and the briefcase.
  ext(L, "c-desk-top", [11.6, 12.3], [0.72, 0.77], [2.4, 3.9], "#d8d4c6", { isSolid: true });
  for (const [x, z] of [[11.65, 2.45], [12.25, 2.45], [11.65, 3.85], [12.25, 3.85]]) ext(L, `c-desk-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.72], [z - 0.03, z + 0.03], STEEL, { castShadow: false });
  ext(L, "c-monitor", [12.0, 12.28], [0.9, 1.3], [2.5, 3.0], "#d8d4c6", { isSolid: true, interact: readable("A computer monitor, off. A yellow sticky note is stuck to the bezel: RECONFIGURE, THEN ANALYZE.") });
  ext(L, "c-screen", [11.98, 12.0], [0.95, 1.25], [2.54, 2.96], "#1a2a2a", { castShadow: false });
  ext(L, "c-keyboard", [11.7, 11.9], [0.77, 0.79], [2.55, 2.95], "#b8b4a6", { castShadow: false });
  ext(L, "c-sticky", [11.97, 11.98], [1.2, 1.28], [3.05, 3.15], "#f2e24a", { castShadow: false });
  ext(L, "c-memo", [11.7, 12.0], [0.77, 0.782], [3.2, 3.55], "#f1ead4", {
    rotationY: -0.15,
    castShadow: false,
    interact: readable(
      "TRANSPONDER SERVICES — INTERNAL\n" +
        "Statistical Analysis and Data Reconfiguration\n\n" +
        "Quarterly figures\n" +
        "Q1   3\nQ2   8\nQ3   1\nQ4   5\n\n" +
        "Do not circulate. Do not ask what it means. — C.M.B.",
    ),
  });
  L.codedChest({
    id: "c-briefcase",
    at: [12.0, 0.77, 3.75],
    code: "5183",
    size: [0.4, 0.14, 0.22],
    bodyColor: "#26211c",
    lidColor: "#2b251f",
    lockedMessage: "A briefcase with a four-digit combination lock.",
  });
  ext(L, "c-note", [11.9, 12.1], [0.835, 0.842], [3.65, 3.8], "#f4efe0", {
    castShadow: false,
    interact: readable("Typed, double-spaced, on company letterhead:\n\n_ _ 1 _\n\n(Joey will say this is his. It's mine.)"),
  });
  // A dresser, a wardrobe, a poster.
  ext(L, "c-dresser", [9.3, 9.8], [0, 0.9], [2.3, 3.3], WOOD, { isSolid: true });
  ext(L, "c-wardrobe", [9.3, 9.8], [0, 2.0], [3.4, 4.2], "#5a4128", { isSolid: true, interact: readable("A wardrobe. Mostly sweaters. A lot of sweaters.") });
  ext(L, "c-poster", [9.1, 9.14], [1.3, 1.9], [4.5, 5.1], "#5a7a9a", { castShadow: false, interact: readable("A framed poster of the skyline. It's the same view as the window out front, minus the pigeons.") });
}

// ---- Level ---------------------------------------------------------------------------------------------

export default defineLevel({
  id: "level-05",
  name: "Level 05 — Apartment 19",
  tags: ["medium", "puzzle", "friends"],
  background: "#0a0e1a",
  // By the front door, looking in across the room.
  playerStart: { position: [1.0, 1.7, 0.9], rotationY: -1.0 },
  build(L) {
    L.ambient({ color: "#8a7a64", intensity: 0.85 });
    buildShell(L);
    buildLiving(L);
    buildHallway(L);
    buildJoeyRoom(L);
    buildChandlerRoom(L);
  },
});
