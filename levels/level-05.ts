import { defineLevel, type LevelBuilder, type Vec3 } from "@/leveldsl";

// Apartment 19.
//
// A fan-made tribute: Joey and Chandler's apartment, laid out after a floor plan
// of it. One big room (sofa under the bay windows, two recliners facing the TV on
// the west wall, the kitchen in the north-east, the foosball table in the south-
// east), two bedrooms off its west side and the bathroom to the north.
// Everything in the puzzles is original.
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
//       Inside: the second number. Chick is on the nightstand.
//   CHANDLER'S ROOM
//    3. His memo of quarterly figures has to be "reconfigured" before the
//       briefcase will open.                                      (the job)
//       Inside: the third number.
//   BATHROOM
//    4. Duck is on the edge of the tub. Chick and Duck go back in their
//       basket by the TV: the fourth number turns up.             (pets)
//   KITCHEN
//    5. The four numbers open the freezer; the key is inside.     (code)
//   THE DOOR
//    6. The key opens the front door in the south wall.           (exit)
//
// Plan (x east, z south; metres; origin at the main room's north-west corner):
//
//                        +--------+
//                        | BATH   |
//                  bay   +--/ /---+
//   +-------------+ ====+---------+--+
//   |  JOEY'S     D     SOFA         | KITCHEN   (fridge in the corner)
//   +-------------+       coffee     +-----------+
//   |  CHANDLER'S |TV  R1 R2          foosball  |
//   |             D                              |
//   |             |   bench          [front door]|
//   +-------------+------------------------------+

const H = 2.7;
const T = 0.2;

const WALL = "#d3c19a";
const TRIM = "#efe6cf";
const FLOOR = "#7a5535";
const CEIL = "#eee7d6";
const STEEL = "#aeb2b5";
const DARK = "#2a2622";
const WOOD = "#6a4a2c";
const LEATHER = "#2d2a28";
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
type R = [number, number];

/** A box given by its extents: [x0, x1], [y0, y1], [z0, z1]. */
function ext(L: LevelBuilder, id: string, xs: R, ys: R, zs: R, color: string, extra: Extra = {}) {
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

/** The window opening in an x-wall (the wall runs along x at depth z): sill, glass and frame. */
function windowInX(L: LevelBuilder, id: string, x0: number, x1: number, z: number) {
  ext(L, `${id}-sill`, [x0, x1], [0, 0.9], [z - T / 2, z + T / 2], WALL, PLASTER);
  ext(L, `${id}-pane`, [x0, x1], [0.9, 2.1], [z - 0.03, z + 0.03], "#1d2c4c", { isSolid: true, emissive: "#4f6aa0", emissiveIntensity: 0.9, castShadow: false });
  for (const [i, x] of [x0 + 0.02, x1 - 0.02].entries()) ext(L, `${id}-frame-${i}`, [x - 0.025, x + 0.025], [0.9, 2.1], [z - 0.07, z + 0.07], TRIM, { castShadow: false });
  for (const [i, y] of [0.92, 2.08].entries()) ext(L, `${id}-rail-${i}`, [x0, x1], [y - 0.025, y + 0.025], [z - 0.07, z + 0.07], TRIM, { castShadow: false });
  ext(L, `${id}-mullion`, [mid(x0, x1) - 0.02, mid(x0, x1) + 0.02], [0.9, 2.1], [z - 0.07, z + 0.07], TRIM, { castShadow: false });
}

/** The same in a z-wall (the wall runs along z at depth x). */
function windowInZ(L: LevelBuilder, id: string, z0: number, z1: number, x: number) {
  ext(L, `${id}-sill`, [x - T / 2, x + T / 2], [0, 0.9], [z0, z1], WALL, PLASTER);
  ext(L, `${id}-pane`, [x - 0.03, x + 0.03], [0.9, 2.1], [z0, z1], "#1d2c4c", { isSolid: true, emissive: "#4f6aa0", emissiveIntensity: 0.9, castShadow: false });
  for (const [i, z] of [z0 + 0.02, z1 - 0.02].entries()) ext(L, `${id}-frame-${i}`, [x - 0.07, x + 0.07], [0.9, 2.1], [z - 0.025, z + 0.025], TRIM, { castShadow: false });
  for (const [i, y] of [0.92, 2.08].entries()) ext(L, `${id}-rail-${i}`, [x - 0.07, x + 0.07], [y - 0.025, y + 0.025], [z0, z1], TRIM, { castShadow: false });
}

/** One floor slab and the ceiling over it, edge to edge with its neighbours. */
function slab(L: LevelBuilder, id: string, xs: R, zs: R) {
  ext(L, `${id}-floor`, xs, [-0.1, 0], zs, FLOOR, { isSolid: true, roughness: 0.7, castShadow: false });
  ext(L, `${id}-ceiling`, xs, [H, H + 0.1], zs, CEIL, { roughness: 1, castShadow: false });
}

/** A flush ceiling light and what it throws. */
function lamp(L: LevelBuilder, id: string, x: number, z: number, intensity: number, distance: number, shadow = false) {
  L.cylinder({ id: `${id}-fixture`, at: [x, H - 0.03, z], size: [0.4, 0.06, 0.4], color: "#fff4dc", emissive: "#ffe2a8", emissiveIntensity: 1.6, castShadow: false });
  L.pointLight({ id: `${id}-light`, at: [x, H - 0.3, z], color: "#ffe2b0", intensity, distance, castShadow: shadow });
}

/** A recliner facing west (-x), its back on the east side. */
function reclinerW(L: LevelBuilder, id: string, cx: number, cz: number, color: string) {
  const ix = readable("A recliner, well broken in.");
  const o = { isSolid: true, roughness: 0.55, interact: ix };
  ext(L, `${id}-base`, [cx - 0.38, cx + 0.38], [0, 0.2], [cz - 0.38, cz + 0.38], DARK, { isSolid: true });
  ext(L, `${id}-seat`, [cx - 0.45, cx + 0.3], [0.2, 0.46], [cz - 0.3, cz + 0.3], color, o);
  ext(L, `${id}-back`, [cx + 0.3, cx + 0.5], [0.2, 1.15], [cz - 0.44, cz + 0.44], color, o);
  ext(L, `${id}-arm-n`, [cx - 0.45, cx + 0.3], [0.2, 0.68], [cz - 0.44, cz - 0.3], color, o);
  ext(L, `${id}-arm-s`, [cx - 0.45, cx + 0.3], [0.2, 0.68], [cz + 0.3, cz + 0.44], color, o);
}

/**
 * A hinged door in a wall that runs along z, in the doorway [z0, z1] at depth x.
 * It hangs from z0 and `angle` swings it (negative: towards -x).
 */
function hingedDoorZ(L: LevelBuilder, id: string, x: number, z0: number, z1: number, angle: number, state: string, ix: Interact, color: string) {
  const spin = { state, pivot: [x, 0, z0] as Vec3, angle, solid: true };
  ext(L, `${id}-leaf`, [x - 0.05, x + 0.05], [0, 2.1], [z0, z1], color, { isSolid: true, roughness: 0.6, interact: ix, spin });
  ext(L, `${id}-knob`, [x - 0.1, x + 0.1], [0.95, 1.03], [z1 - 0.18, z1 - 0.1], BRASS, { metalness: 0.5, roughness: 0.3, interact: ix, spin, castShadow: false });
}

/** A few lit windows behind a dark block: the city outside. */
function tower(L: LevelBuilder, id: string, xs: R, h: number, zs: R, faceZ: boolean) {
  ext(L, id, xs, [0, h], zs, "#161b2a", { emissive: "#2a3350", emissiveIntensity: 0.4, castShadow: false });
  const w = faceZ ? xs[1] - xs[0] : zs[1] - zs[0];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const o = 0.3 + c * (w / 3.4);
      const y: R = [1.6 + r * 1.3, 1.95 + r * 1.3];
      if (faceZ) ext(L, `${id}-w-${r}-${c}`, [xs[0] + o, xs[0] + o + 0.25], y, [zs[1], zs[1] + 0.02], "#f4d98a", { emissive: "#f4d98a", emissiveIntensity: 1.2, castShadow: false });
      else ext(L, `${id}-w-${r}-${c}`, [xs[1], xs[1] + 0.02], y, [zs[0] + o, zs[0] + o + 0.25], "#f4d98a", { emissive: "#f4d98a", emissiveIntensity: 1.2, castShadow: false });
    }
  }
}

// ---- THE SHELL -----------------------------------------------------------------------------

// Chandler's room, the north-west one: two windows in its north wall.
const CHAN_WIN: R[] = [[-3.55, -2.85], [-1.8, -1.1]];
// The bay's windows, in its north wall.
const BAY_WIN: R[] = [[0.35, 1.15], [1.95, 2.6]];

function buildShell(L: LevelBuilder) {
  // Floor and ceiling, room by room, edge to edge.
  slab(L, "main", [-0.1, 4.6], [0, 6.2]);
  slab(L, "kitchen", [4.6, 7.1], [1.2, 6.2]);
  slab(L, "bay", [-0.1, 2.7], [-0.9, 0]);
  slab(L, "bath", [2.7, 5.3], [-3.9, 0]);
  slab(L, "chan", [-3.9, -0.1], [-0.1, 4.1]);
  slab(L, "joey", [-4.4, -0.1], [4.1, 8.3]);

  // The west wall of the living room: a door into each bedroom, and the bay's west wall in line with it.
  wallZ(L, "w", -0.1, -0.9, 8.3, [{ a: 1.1, b: 2.0, top: 2.1 }, { a: 4.6, b: 5.5, top: 2.1 }]);
  // The bay: windows in its north wall, open to the room.
  wallX(L, "bay-n", -0.9, -0.1, 2.8, BAY_WIN.map(([a, b]) => ({ a, b, top: 2.1 })));
  BAY_WIN.forEach(([a, b], i) => windowInX(L, `bay-win-${i}`, a, b, -0.9));
  // A white window seat under each.
  BAY_WIN.forEach(([a, b], i) => ext(L, `bay-seat-${i}`, [a, b], [0, 0.45], [-0.85, -0.3], "#efe9da", { isSolid: true, interact: readable("A window seat, with a cushion that's lost its shape.") }));
  // The wall across the north of the living room, east of the bay, with the doorway to the bathroom in it.
  wallX(L, "main-n", 0, 2.7, 5.3, [{ a: 3.3, b: 4.3, top: 2.2 }]);
  // The bathroom.
  wallZ(L, "bath-w", 2.7, -3.9, 0);
  wallZ(L, "bath-e", 5.3, -3.9, 0);
  wallX(L, "bath-n", -3.9, 2.7, 5.3);
  // The kitchen alcove: a jog in the north wall.
  wallZ(L, "jog", 4.6, 0, 1.2);
  wallX(L, "kitchen-n", 1.2, 4.6, 7.1);
  wallZ(L, "e", 7.1, 1.2, 6.3);
  // The south wall, with the front door.
  wallX(L, "s", 6.2, -0.1, 7.1, [{ a: 3.9, b: 4.9, top: 2.2 }]);
  // Chandler's room (north-west).
  wallX(L, "jn", -0.1, -3.9, -0.1, CHAN_WIN.map(([a, b]) => ({ a, b, top: 2.1 })));
  CHAN_WIN.forEach(([a, b], i) => windowInX(L, `chan-win-${i}`, a, b, -0.1));
  wallZ(L, "jw", -3.9, -0.1, 4.1);
  // Joey's room (south-west), and the wall it shares with Chandler's.
  wallX(L, "cn", 4.1, -4.4, -0.1);
  wallZ(L, "cw", -4.4, 4.1, 8.3, [{ a: 5.95, b: 6.8, top: 2.1 }]);
  windowInZ(L, "joey-win", 5.95, 6.8, -4.4);
  wallX(L, "cs", 8.3, -4.4, -0.1);
  // Baseboards along the long walls of the living room.
  ext(L, "board-s", [0.1, 7.0], [0, 0.12], [6.08, 6.1], TRIM, { castShadow: false });

  // The city, through the windows.
  ext(L, "backdrop-n", [-9, 12], [0, 16], [-14.4, -14], "#10162a", { emissive: "#1e2848", emissiveIntensity: 0.7, castShadow: false });
  tower(L, "skyline-a", [-6, -3.6], 9, [-14, -13.6], true);
  tower(L, "skyline-b", [-1.5, 1.0], 12, [-14, -13.6], true);
  tower(L, "skyline-c", [3.0, 6.2], 8, [-14, -13.6], true);
  ext(L, "backdrop-w", [-14.4, -14], [0, 16], [-2, 14], "#10162a", { emissive: "#1e2848", emissiveIntensity: 0.7, castShadow: false });
  tower(L, "skyline-d", [-14, -13.6], 10, [4, 7], false);

  lamp(L, "main-a", 1.8, 1.8, 6.5, 9, true);
  lamp(L, "main-b", 2.4, 4.4, 6, 9);
  lamp(L, "kitchen", 5.6, 3.0, 5.5, 8);
  lamp(L, "foos", 5.5, 5.0, 4.5, 7);
  lamp(L, "bath", 4.0, -2.0, 4, 6);
  lamp(L, "chan", -2.0, 2.0, 5, 7);
  lamp(L, "joey", -2.3, 6.2, 5, 7);
  L.pointLight({ id: "moon", at: [1.3, 1.7, -0.5], color: "#8aa0d0", intensity: 1.2, distance: 5 });
}

// ---- THE LIVING ROOM -------------------------------------------------------------------

function buildFrontDoor(L: LevelBuilder) {
  // A yellow frame round a wooden door in the south wall, with a deadbolt, a chain and a peephole.
  const ix: Interact = {
    lock: { requires: { kind: "item", itemId: "apartment-key", held: true }, lockedMessage: "Deadbolted. The key hook beside it is empty.", consumeItem: false },
    behavior: { type: "exit" },
  };
  ext(L, "front-door", [3.9, 4.9], [0, 2.2], [6.15, 6.25], "#8c5a2e", { isSolid: true, roughness: 0.6, interact: ix });
  const FR = "#e0b72a";
  ext(L, "front-frame-t", [3.8, 5.0], [2.2, 2.3], [6.05, 6.35], FR, { castShadow: false });
  ext(L, "front-frame-w", [3.8, 3.9], [0, 2.2], [6.05, 6.35], FR, { castShadow: false });
  ext(L, "front-frame-e", [4.9, 5.0], [0, 2.2], [6.05, 6.35], FR, { castShadow: false });
  ext(L, "peephole-frame", [4.34, 4.46], [1.52, 1.64], [6.11, 6.15], FR, { castShadow: false });
  ext(L, "peephole", [4.37, 4.43], [1.55, 1.61], [6.105, 6.11], DARK, { castShadow: false });
  ext(L, "deadbolt", [4.1, 4.22], [1.15, 1.27], [6.1, 6.15], BRASS, { metalness: 0.8, roughness: 0.3, interact: ix, castShadow: false });
  ext(L, "chain", [4.1, 4.3], [1.5, 1.52], [6.11, 6.15], STEEL, { metalness: 0.8, interact: ix, castShadow: false });
  ext(L, "front-knob", [4.7, 4.78], [1.0, 1.08], [6.07, 6.15], BRASS, { metalness: 0.7, roughness: 0.3, interact: ix, castShadow: false });
  ext(L, "doormat", [3.95, 4.85], [0, 0.012], [5.7, 6.05], "#4a3a2a", { castShadow: false });
  L.setExit("front-door");
  // The key hook, empty, and the coat hooks next to it.
  const hookIx = readable("Two hooks. One has a lanyard on it. The other, marked SPARE in Chandler's block capitals, has nothing.");
  ext(L, "hook-board", [5.25, 5.85], [1.45, 1.75], [6.0, 6.1], WOOD, { interact: hookIx, castShadow: false });
  for (const x of [5.4, 5.7]) ext(L, `hook-${x}`, [x - 0.02, x + 0.02], [1.58, 1.62], [5.94, 6.0], BRASS, { interact: hookIx, castShadow: false });
  // The shoe bench and a console along the south wall, and a ball on the floor.
  ext(L, "bench", [0.34, 1.2], [0, 0.45], [5.7, 6.08], "#e8e4d8", { isSolid: true, interact: readable("A bench by the door, buried in shoes.") });
  ext(L, "console", [1.45, 2.4], [0, 0.8], [5.7, 6.08], "#6a4a3a", { isSolid: true, interact: readable("A console table. Keys, takeout menus, a bowl of loose change.") });
  L.sphere({ id: "ball", at: [3.0, 0.11, 5.1], size: [0.22, 0.22, 0.22], color: "#efeee8", castShadow: false });
}

function buildSeating(L: LevelBuilder) {
  // The couch, along the north side, facing south; the bay windows behind it.
  const ix = readable("The couch. It has seen things.");
  ext(L, "couch-base", [0.7, 3.2], [0, 0.4], [0.5, 1.15], FABRIC, { isSolid: true, interact: ix });
  ext(L, "couch-back", [0.7, 3.2], [0.4, 1.0], [0.3, 0.5], FABRIC, { isSolid: true, interact: ix });
  for (const [i, x] of [0.7, 3.1].entries()) ext(L, `couch-arm-${i}`, [x, x + 0.1], [0.4, 0.62], [0.3, 1.15], FABRIC, { isSolid: true, interact: ix });
  for (const [i, x] of [0.8, 1.65, 2.5].entries()) ext(L, `couch-cushion-${i}`, [x + 0.02, x + 0.8], [0.4, 0.48], [0.52, 1.13], "#bf9a66", { interact: ix, castShadow: false });
  // The two recliners, side by side, facing the TV on the west wall, on a rug.
  ext(L, "rug", [1.35, 2.7], [0, 0.012], [2.4, 4.9], "#6e6a64", { castShadow: false });
  reclinerW(L, "recliner-joey", 2.0, 3.1, LEATHER);
  reclinerW(L, "recliner-chandler", 2.0, 4.3, LEATHER);
  // Side tables either end of the couch, a lamp on the right one, a plant, and an orange stool by the bathroom door.
  ext(L, "side-table-w", [0.15, 0.6], [0, 0.55], [0.35, 0.8], WOOD, { isSolid: true });
  ext(L, "side-table-e", [3.3, 3.75], [0, 0.55], [0.35, 0.8], WOOD, { isSolid: true });
  L.cylinder({ id: "side-lamp-base", at: [3.52, 0.68, 0.57], size: [0.1, 0.25, 0.1], color: "#d9c9a0", castShadow: false });
  L.cylinder({ id: "side-lamp-shade", at: [3.52, 0.92, 0.57], size: [0.28, 0.2, 0.28], color: "#f2e3b8", emissive: "#f2d38a", emissiveIntensity: 0.9, castShadow: false });
  L.pointLight({ id: "side-lamp-light", at: [3.52, 1.0, 0.57], color: "#ffd28a", intensity: 1.6, distance: 4 });
  L.cylinder({ id: "plant-pot", at: [3.55, 0.2, 1.0], size: [0.3, 0.4, 0.3], color: "#7a4a2a", isSolid: true });
  L.sphere({ id: "plant-leaves", at: [3.55, 0.7, 1.0], size: [0.55, 0.55, 0.55], color: "#3a6a34", castShadow: false });
  L.cylinder({ id: "orange-stool", at: [4.36, 0.22, 0.4], size: [0.24, 0.44, 0.24], color: "#d4561f", isSolid: true, interact: readable("A round orange stool. Nobody can remember where it came from.") });
  // The coffee table in front of the couch.
  ext(L, "coffee-top", [1.35, 2.4], [0.38, 0.44], [1.45, 1.9], WOOD, { isSolid: true });
  for (const x of [1.4, 2.35]) for (const z of [1.5, 1.85]) ext(L, `coffee-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.38], [z - 0.03, z + 0.03], "#3e2a16", { castShadow: false });
  // On it: Phoebe's chord sheet, and a pizza box.
  ext(L, "chord-sheet", [1.45, 1.78], [0.44, 0.452], [1.52, 1.82], "#f1ead4", {
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
  ext(L, "pizza-box", [1.9, 2.3], [0.44, 0.5], [1.55, 1.85], "#c8b48a", { interact: readable("Empty. Not even a crust. There's a name on the lid: JOEY."), castShadow: false });
}

function buildTV(L: LevelBuilder) {
  // The entertainment center along the west wall, the TV looking east.
  ext(L, "ent-base", [0.0, 0.5], [0, 0.6], [2.4, 4.7], "#3e2c1c", { isSolid: true });
  for (const [i, z] of [2.45, 3.2, 3.95].entries()) ext(L, `ent-door-${i}`, [0.5, 0.52], [0.06, 0.54], [z, z + 0.7], "#4c3724", { castShadow: false });
  ext(L, "ent-top", [0.0, 0.52], [0.6, 0.64], [2.38, 4.72], "#2f2013", { isSolid: true });
  ext(L, "tv-body", [0.05, 0.3], [0.64, 1.3], [3.0, 4.1], DARK, { isSolid: true, interact: readable("The TV is off. The reflection of the room looks back, a bit more together than it is.") });
  ext(L, "tv-screen", [0.3, 0.32], [0.72, 1.24], [3.07, 4.03], "#101820", { emissive: "#1c2a3a", emissiveIntensity: 0.6, castShadow: false });
  ext(L, "vcr", [0.1, 0.45], [0.64, 0.72], [4.2, 4.65], "#3a3a3a", { castShadow: false });
  // The pets' basket, by the entertainment center.
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
  ext(L, "basket", [0.7, 1.3], [0, 0.3], [4.95, 5.45], "#a78a4e", { isSolid: true, interact: ix });
  ext(L, "basket-blanket", [0.75, 1.25], [0.3, 0.33], [5.0, 5.4], "#8c3a3a", { interact: ix, castShadow: false });
  ext(L, "basket-card", [0.88, 1.12], [0.331, 0.34], [5.1, 5.3], "#f1ead4", {
    appearsWhen: "pets-home",
    castShadow: false,
    interact: readable("A vet's appointment card, folded over twice. On the back, in Joey's handwriting:\n\n_ _ _ 7"),
  });
}

function buildGuitar(L: LevelBuilder) {
  // The guitar, lying on the couch.
  const ix = readable("A guitar, tuned to something that isn't quite a chord.");
  L.cylinder({ id: "guitar-lower", at: [1.1, 0.5, 0.82], size: [0.4, 0.09, 0.4], color: "#b57a3a", roughness: 0.4, interact: ix, castShadow: false });
  L.cylinder({ id: "guitar-upper", at: [1.4, 0.5, 0.82], size: [0.3, 0.09, 0.3], color: "#b57a3a", roughness: 0.4, interact: ix, castShadow: false });
  L.cylinder({ id: "guitar-hole", at: [1.2, 0.552, 0.82], size: [0.1, 0.01, 0.1], color: DARK, interact: ix, castShadow: false });
  ext(L, "guitar-neck", [1.5, 2.05], [0.46, 0.53], [0.795, 0.845], "#3a2a1a", { interact: ix, castShadow: false });

  // Her case, on the floor beside the recliners.
  L.codedChest({
    id: "guitar-case",
    at: [3.35, 0, 3.5],
    code: "7374",
    size: [0.95, 0.18, 0.38],
    bodyColor: "#2a2420",
    lidColor: "#332c26",
    lockedMessage: "A guitar case with a four-digit combination lock.",
  });
  L.pickup({ id: "penguin-key", at: [3.0, 0.09, 3.5], itemId: "penguin-key", label: "Penguin key", icon: "🐧", mesh: { shape: "box", size: [0.07, 0.012, 0.03], color: "#d9d9d9", metalness: 0.7, roughness: 0.3, emissive: "#8f969c", emissiveIntensity: 0.3 }, rotationY: 0.3 });
  ext(L, "napkin-phoebe", [3.5, 3.72], [0.065, 0.075], [3.4, 3.58], "#f4efe0", {
    castShadow: false,
    interact: readable("A Central Perk napkin, in purple pen.\n\n3 _ _ _\n\n(Don't tell Chandler I know. — P)"),
  });
}

function buildFoosball(L: LevelBuilder) {
  const ix = readable("The foosball table. The score has been written on the side in marker, and crossed out, and written again. Both of them say they're winning.");
  ext(L, "foos-body", [4.85, 6.25], [0.72, 0.92], [3.7, 4.45], "#2b4a2e", { isSolid: true, interact: ix });
  ext(L, "foos-field", [4.93, 6.17], [0.92, 0.935], [3.78, 4.37], "#3f7a46", { interact: ix, castShadow: false });
  for (const [i, x] of [5.1, 5.35, 5.6, 5.85, 6.05].entries()) {
    ext(L, `foos-rod-${i}`, [x - 0.015, x + 0.015], [1.0, 1.04], [3.55, 4.6], STEEL, { metalness: 0.7, interact: ix, castShadow: false });
    ext(L, `foos-grip-${i}`, [x - 0.03, x + 0.03], [0.98, 1.06], [4.6, 4.72], DARK, { interact: ix, castShadow: false });
  }
  for (const x of [4.9, 6.2]) for (const z of [3.74, 4.41]) ext(L, `foos-leg-${x}-${z}`, [x - 0.04, x + 0.04], [0, 0.72], [z - 0.04, z + 0.04], "#1d1914", { castShadow: false });
  // A bookshelf against the east wall.
  ext(L, "bookshelf", [6.6, 7.0], [0, 1.9], [4.2, 5.4], "#3a2a1a", { isSolid: true, interact: readable("Paperbacks, VHS tapes, and a trophy for something nobody will explain.") });
}

function buildKitchen(L: LevelBuilder) {
  // Base cabinets, the counter, the sink and the stove along the north wall, and a peninsula.
  const cab = readable("Cabinets. Mostly cereal, mostly Joey's. A lot of mugs.");
  ext(L, "cab-base", [4.7, 6.3], [0, 0.9], [1.3, 1.95], "#d8cfb6", { isSolid: true, interact: cab });
  ext(L, "counter", [4.7, 6.3], [0.9, 0.95], [1.3, 2.0], "#4a4a48", { isSolid: true });
  ext(L, "sink", [4.9, 5.6], [0.9, 0.96], [1.45, 1.85], STEEL, { metalness: 0.5, interact: cab, castShadow: false });
  L.cylinder({ id: "tap", at: [5.25, 1.05, 1.38], size: [0.04, 0.2, 0.04], color: STEEL, metalness: 0.9, castShadow: false });
  ext(L, "stove", [5.7, 6.2], [0.9, 0.955], [1.35, 1.9], "#d9d9d6", { interact: cab, castShadow: false });
  for (const [i, [x, z]] of ([[5.85, 1.5], [6.05, 1.5], [5.85, 1.75], [6.05, 1.75]] as Array<[number, number]>).entries()) ext(L, `burner-${i}`, [x - 0.07, x + 0.07], [0.955, 0.975], [z - 0.07, z + 0.07], DARK, { castShadow: false });
  ext(L, "cab-upper", [4.7, 6.3], [1.5, 2.15], [1.3, 1.65], "#d8cfb6", { isSolid: true, interact: cab });
  ext(L, "peninsula", [3.9, 4.6], [0, 0.9], [1.3, 2.9], "#d8cfb6", { isSolid: true, interact: cab });
  ext(L, "peninsula-top", [3.85, 4.65], [0.9, 0.95], [1.3, 2.95], "#4a4a48", { isSolid: true });
  for (const [i, z] of [2.0, 2.65].entries()) {
    L.cylinder({ id: `stool-${i}-seat`, at: [3.6, 0.68, z], size: [0.36, 0.06, 0.36], color: "#c9532a", castShadow: false });
    L.cylinder({ id: `stool-${i}-leg`, at: [3.6, 0.33, z], size: [0.06, 0.66, 0.06], color: STEEL, metalness: 0.6, isSolid: true, castShadow: false });
  }
}

function buildFridge(L: LevelBuilder) {
  // Corner of the kitchen. The freezer on top is hollow, so what's in it can't be reached with the door shut.
  const fx: R = [6.3, 7.0];
  const fz: R = [1.3, 2.0];
  const body = "#dedbd2";
  ext(L, "fridge-lower", fx, [0, 1.25], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-back", fx, [1.25, 1.9], [1.3, 1.34], body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-left", [6.3, 6.34], [1.25, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-right", [6.96, 7.0], [1.25, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-top", fx, [1.86, 1.9], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fz-bottom", fx, [1.25, 1.29], fz, body, { isSolid: true, roughness: 0.4 });
  ext(L, "fridge-top", fx, [1.9, 2.1], fz, body, { roughness: 0.4 });
  // The freezer door, with a lock on it, hinged on the west side.
  const ix = codeLock("3817", "freezer-open", "A combination lock, brand new, hasp-and-staple on the freezer door. Someone has written MINE on a piece of tape.", "Try the lock");
  const spin = { state: "freezer-open", pivot: [6.3, 0, 2.0] as Vec3, angle: -1.9 };
  ext(L, "fz-door", fx, [1.25, 1.9], [2.0, 2.04], body, { isSolid: true, roughness: 0.4, interact: ix, spin });
  ext(L, "fz-handle", [6.9, 6.94], [1.45, 1.75], [2.04, 2.1], STEEL, { metalness: 0.7, interact: ix, spin, castShadow: false });
  ext(L, "fz-lock", [6.8, 6.92], [1.55, 1.68], [2.04, 2.12], BRASS, { metalness: 0.8, roughness: 0.3, interact: ix, spin, castShadow: false });
  ext(L, "fz-tape", [6.5, 6.76], [1.6, 1.64], [2.04, 2.05], "#f4efe0", { interact: ix, spin, castShadow: false });
  L.pickup({ id: "apartment-key", at: [6.65, 1.31, 1.7], itemId: "apartment-key", label: "Apartment key", icon: "🔑", mesh: "key", rotationY: 0.5 });
  // The fridge door, covered in magnets and a Magna Doodle.
  const mx = readable("A MAGNA DOODLE, scrawled with a face, a sandwich and a half-erased list: MILK, MILK, MILK. Joey's and Chandler's handwriting argue with each other down the whole board.");
  ext(L, "fridge-door-line", fx, [1.24, 1.26], [2.0, 2.02], DARK, { castShadow: false });
  ext(L, "magna", [6.4, 6.9], [0.65, 1.1], [2.0, 2.02], "#d8d6c8", { interact: mx, castShadow: false });
  ext(L, "magna-border", [6.38, 6.92], [0.63, 0.65], [2.0, 2.025], "#c63a2a", { interact: mx, castShadow: false });
  ext(L, "fridge-handle", [6.9, 6.94], [0.4, 0.95], [2.0, 2.06], STEEL, { metalness: 0.7, castShadow: false });
  for (const [i, [x, y, c]] of ([[6.45, 0.45, "#d0261c"], [6.6, 0.5, "#2a5ad8"], [6.75, 0.4, "#e8c020"]] as Array<[number, number, string]>).entries()) ext(L, `magnet-${i}`, [x, x + 0.08], [y, y + 0.08], [2.0, 2.03], c, { castShadow: false });
}

function buildLiving(L: LevelBuilder) {
  buildFrontDoor(L);
  buildSeating(L);
  buildTV(L);
  buildGuitar(L);
  buildFoosball(L);
  buildKitchen(L);
  buildFridge(L);
  // A round pouf by the door.
  L.cylinder({ id: "pouf", at: [3.4, 0.2, 5.75], size: [0.5, 0.4, 0.5], color: "#efe9da", isSolid: true, interact: readable("A pouf. Mostly used as a footrest, a table, and a place to throw things.") });
}

// ---- THE BATHROOM -----------------------------------------------------------------------------

function buildBathroom(L: LevelBuilder) {
  const tile = "#cfd8d6";
  // The tub along the north wall, with a curtain pulled back, and Duck on its rim.
  ext(L, "tub", [3.3, 5.1], [0, 0.55], [-3.8, -3.0], "#f1f1ec", { isSolid: true, roughness: 0.3, interact: readable("A bathtub. The tub's got a ring around it, and a lot of rubber ducks' worth of history.") });
  ext(L, "tub-water", [3.4, 5.0], [0.5, 0.52], [-3.7, -3.1], "#7fa8b8", { roughness: 0.1, castShadow: false });
  ext(L, "curtain-rod", [3.2, 5.2], [2.0, 2.04], [-3.05, -3.0], STEEL, { metalness: 0.7, castShadow: false });
  ext(L, "curtain", [3.2, 3.6], [0.6, 2.0], [-3.05, -2.99], "#6a8aa8", { castShadow: false });
  L.pickup({ id: "duck", at: [4.2, 0.6, -3.0], itemId: "duck", label: "Duck", icon: "🦆", mesh: { shape: "sphere", size: [0.14, 0.12, 0.14], color: "#ece5c8", roughness: 0.9 }, rotationY: 0.4 });
  // A pedestal sink with a mirror, and the toilet.
  ext(L, "bsink-pedestal", [2.85, 3.05], [0, 0.78], [-2.0, -1.6], "#f1f1ec", { isSolid: true });
  ext(L, "bsink-basin", [2.8, 3.25], [0.78, 0.88], [-2.15, -1.45], "#f1f1ec", { isSolid: true });
  ext(L, "mirror", [2.8, 2.84], [1.2, 1.9], [-2.1, -1.5], "#c8d4dc", { metalness: 0.6, roughness: 0.1, interact: readable("The mirror is fogged. Someone has drawn a face on it, and underneath: 'HEY.'"), castShadow: false });
  ext(L, "toilet-base", [4.55, 5.05], [0, 0.42], [-1.7, -1.15], "#f1f1ec", { isSolid: true });
  ext(L, "toilet-tank", [4.8, 5.05], [0.42, 0.95], [-1.7, -1.15], "#f1f1ec", { isSolid: true });
  ext(L, "bath-rug", [3.3, 4.5], [0, 0.012], [-1.3, -0.5], "#4a6a84", { castShadow: false });
  ext(L, "bath-tile", [2.8, 5.2], [0, 1.1], [-3.84, -3.8], tile, { castShadow: false });
}

// ---- JOEY'S ROOM (south-west: the TV console, the orange throw) -------------------------------------

const FACES: Array<[string, string]> = [
  ["😀", "1"],
  ["😮", "2"],
  ["😠", "3"],
  ["😢", "4"],
  ["😏", "5"],
];

const BLUE = "#2c4a8c";

function buildJoeyRoom(L: LevelBuilder) {
  // Joey's door off the living room: locked.
  const locked = itemLock("penguin-key", "joey-door-open", "Locked. A sticker of a penguin is stuck to the keyhole. Under it, in marker: KEEP OUT.", "Unlock the door");
  hingedDoorZ(L, "joey-door", -0.1, 4.6, 5.5, -1.6, "joey-door-open", locked, "#b0803f");
  // The bed, blue with an orange throw over its west end, the window beside it.
  ext(L, "j-bed-frame", [-3.75, -1.5], [0.15, 0.4], [5.75, 7.4], "#3a2a1a", { isSolid: true });
  ext(L, "j-bed-mattress", [-3.7, -1.55], [0.4, 0.58], [5.8, 7.35], BLUE, { isSolid: true, roughness: 1 });
  ext(L, "j-bed-throw", [-3.7, -3.0], [0.58, 0.62], [5.8, 7.35], "#e07a28", { roughness: 1, castShadow: false });
  ext(L, "j-bed-pillow", [-2.1, -1.6], [0.58, 0.7], [6.0, 7.15], "#efe7d3", { roughness: 1, castShadow: false });
  // Hugsy, on the pillow.
  const hugsy = readable("Hugsy. A stuffed penguin with a lot of miles on him.");
  L.sphere({ id: "hugsy-body", at: [-1.85, 0.82, 6.55], size: [0.22, 0.28, 0.2], color: "#1f1f24", interact: hugsy, castShadow: false });
  L.sphere({ id: "hugsy-belly", at: [-1.95, 0.81, 6.55], size: [0.1, 0.2, 0.15], color: "#f1efe6", interact: hugsy, castShadow: false });
  // The window seat on the west wall.
  ext(L, "j-seat", [-4.3, -3.8], [0, 0.45], [5.95, 6.8], "#efe9da", { isSolid: true, interact: readable("A window seat. Joey's dry cleaning is piled up on it.") });
  // The TV console on the north wall, and Chick on it.
  ext(L, "j-console", [-3.06, -1.02], [0, 0.55], [4.3, 4.8], "#1f1b17", { isSolid: true });
  ext(L, "j-tv", [-2.7, -1.4], [0.55, 1.1], [4.4, 4.6], DARK, { isSolid: true, interact: readable("A TV with a stack of VHS tapes beside it, every one labeled in Joey's handwriting. Half of them just say: ME.") });
  L.pickup({ id: "chick", at: [-3.3, 0.6, 4.55], itemId: "chick", label: "Chick", icon: "🐥", mesh: { shape: "sphere", size: [0.11, 0.1, 0.11], color: "#f2d13a", roughness: 0.9 }, rotationY: 0.4 });

  // Headshots on the south wall, over a desk.
  for (const [i, [emoji, num]] of FACES.entries()) {
    const x = -3.9 + i * 0.5;
    ext(L, `headshot-${i + 1}`, [x, x + 0.34], [1.35, 1.8], [8.155, 8.2], "#ffffff", {
      texture: `face:${emoji}:${num}`,
      castShadow: false,
      interact: readable(`Headshot, number ${num}, signed across the bottom: "Joey Tribbiani."`),
    });
  }
  ext(L, "j-desk", [-3.9, -2.2], [0.7, 0.75], [7.6, 8.15], WOOD, { isSolid: true });
  for (const [x, z] of [[-3.85, 7.65], [-2.25, 7.65], [-3.85, 8.1], [-2.25, 8.1]]) ext(L, `j-desk-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.7], [z - 0.03, z + 0.03], "#3e2a16", { castShadow: false });
  ext(L, "j-script", [-3.3, -2.98], [0.75, 0.762], [7.75, 8.08], "#f1ead4", {
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
  // The footlocker, east of the bed.
  L.codedChest({
    id: "j-footlocker",
    at: [-0.95, 0, 6.4],
    code: "2435",
    size: [0.9, 0.45, 0.5],
    bodyColor: "#3a3f4a",
    lidColor: "#2f333c",
    lockedMessage: "A footlocker with a four-digit combination lock. A sticker on the lid says PROP DEPARTMENT: DO NOT TOUCH.",
  });
  ext(L, "j-note", [-1.1, -0.85], [0.065, 0.075], [6.33, 6.49], "#f4efe0", {
    castShadow: false,
    interact: readable("In Joey's handwriting, on the back of a headshot:\n\n_ 8 _ _\n\n(Hands off, Chandler. This is mine.)"),
  });
}

// ---- CHANDLER'S ROOM (north-west: the desk and the computer) -------------------------------------------

function buildChandlerRoom(L: LevelBuilder) {
  hingedDoorZ(L, "chan-door", -0.1, 1.1, 2.0, -1.6, "chan-door-open", toggle("chan-door-open", "door"), "#b0803f");
  // Window seats under the two north windows.
  for (const [i, [a, b]] of CHAN_WIN.entries()) ext(L, `c-seat-${i}`, [a, b], [0, 0.45], [0.0, 0.55], "#efe9da", { isSolid: true, interact: readable("A window seat, empty for once.") });
  // The bed, blue, head to the north.
  ext(L, "c-bed-frame", [-3.0, -1.2], [0.15, 0.4], [0.85, 2.85], "#3a2a1a", { isSolid: true });
  ext(L, "c-bed-mattress", [-2.95, -1.25], [0.4, 0.58], [0.9, 2.8], BLUE, { isSolid: true, roughness: 1 });
  ext(L, "c-bed-pillow", [-2.8, -1.4], [0.58, 0.7], [0.95, 1.35], "#efe7d3", { roughness: 1, castShadow: false });
  // The briefcase, on the foot of the bed where he dropped it.
  L.codedChest({
    id: "c-briefcase",
    at: [-2.1, 0.58, 2.3],
    code: "5183",
    size: [0.4, 0.14, 0.22],
    bodyColor: "#26211c",
    lidColor: "#2b251f",
    lockedMessage: "A briefcase with a four-digit combination lock.",
  });
  ext(L, "c-note", [-2.2, -2.0], [0.655, 0.662], [2.25, 2.4], "#f4efe0", {
    castShadow: false,
    interact: readable("Typed, double-spaced, on company letterhead:\n\n_ _ 1 _\n\n(Joey will say this is his. It's mine.)"),
  });
  // A nightstand with a lamp, and a dark dresser on the west wall.
  ext(L, "c-nightstand", [-1.0, -0.55], [0, 0.55], [0.4, 0.85], WOOD, { isSolid: true });
  L.cylinder({ id: "c-lamp-base", at: [-0.78, 0.68, 0.62], size: [0.1, 0.25, 0.1], color: "#d9c9a0", castShadow: false });
  L.cylinder({ id: "c-lamp-shade", at: [-0.78, 0.92, 0.62], size: [0.28, 0.2, 0.28], color: "#f2e3b8", emissive: "#f2d38a", emissiveIntensity: 0.9, castShadow: false });
  L.pointLight({ id: "c-lamp-light", at: [-0.78, 1.0, 0.62], color: "#ffd28a", intensity: 1.5, distance: 4 });
  ext(L, "c-dresser", [-3.8, -3.35], [0, 0.95], [1.45, 2.7], "#5a2a24", { isSolid: true, interact: readable("A dresser. Every drawer is half-open, and every sleeve is hanging out of one.") });
  // The desk and the computer against the south wall, a bench beside it.
  ext(L, "c-desk-top", [-3.45, -1.9], [0.72, 0.77], [3.5, 4.0], "#2a2622", { isSolid: true });
  for (const [x, z] of [[-3.4, 3.55], [-1.95, 3.55], [-3.4, 3.95], [-1.95, 3.95]]) ext(L, `c-desk-leg-${x}-${z}`, [x - 0.03, x + 0.03], [0, 0.72], [z - 0.03, z + 0.03], "#1a1816", { castShadow: false });
  ext(L, "c-monitor", [-3.2, -2.7], [0.77, 1.15], [3.85, 3.95], "#d8d4c6", { isSolid: true, interact: readable("A computer monitor, off. A yellow sticky note is stuck to the bezel: RECONFIGURE, THEN ANALYZE.") });
  ext(L, "c-keyboard", [-3.15, -2.75], [0.77, 0.79], [3.6, 3.78], "#b8b4a6", { castShadow: false });
  ext(L, "c-sticky", [-2.65, -2.55], [0.95, 1.03], [3.94, 3.96], "#f2e24a", { castShadow: false });
  ext(L, "c-memo", [-2.5, -2.1], [0.77, 0.782], [3.55, 3.85], "#f1ead4", {
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
  ext(L, "c-chair", [-3.1, -2.7], [0.42, 0.46], [3.05, 3.4], "#efe9da", { isSolid: true });
  ext(L, "c-chair-back", [-3.1, -2.7], [0.46, 0.95], [3.02, 3.06], "#efe9da", { castShadow: false });
  ext(L, "c-bench", [-1.85, -0.7], [0, 0.45], [3.45, 4.0], "#7a3a2a", { isSolid: true, interact: readable("A bench at the foot of nothing. Chandler keeps his shoes on it, which is where the shoes were going anyway.") });
}

// ---- Level ---------------------------------------------------------------------------------------------

// The whole apartment is drawn at plan scale and then opened up: wider and deeper
// (KXZ) and a little taller (KY), so there's room to walk between the furniture.
const KXZ = 1.4;
const KY = 1.1;

function enlarge(L: LevelBuilder) {
  const sc = (v: Vec3): Vec3 => [v[0] * KXZ, v[1] * KY, v[2] * KXZ];
  for (const o of L.objects) {
    o.transform.position = sc(o.transform.position);
    if (o.mesh.kind === "primitive") o.mesh.size = sc(o.mesh.size);
    if (o.pose) {
      o.pose.open.position = sc(o.pose.open.position);
      if (o.pose.spin) {
        o.pose.spin.pivot = sc(o.pose.spin.pivot);
        if (o.pose.spin.shift) o.pose.spin.shift = sc(o.pose.spin.shift);
      }
    }
  }
  for (const l of L.lights) {
    l.position = sc(l.position);
    if (l.distance) l.distance *= KXZ;
    if (l.type === "point") l.intensity *= 1.3;
  }
}

export default defineLevel({
  id: "level-05",
  name: "Level 05 — Apartment 19",
  tags: ["medium", "puzzle", "friends"],
  background: "#0a0e1a",
  // By the front door, looking in towards the couch.
  playerStart: { position: [4.4 * KXZ, 1.7, 5.3 * KXZ], rotationY: 0.45 },
  build(L) {
    L.ambient({ color: "#8a7a64", intensity: 0.85 });
    buildShell(L);
    buildLiving(L);
    buildBathroom(L);
    buildJoeyRoom(L);
    buildChandlerRoom(L);
    enlarge(L);
  },
});
