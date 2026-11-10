import { defineLevel, type LevelBuilder, type Vec3 } from "@/leveldsl";

// Cell Seventeen.
//
// You wake in a prison cell. The door is solid and the guard has the only key,
// but whoever had this cell before you was digging: Eli left a tunnel behind
// the brickwork, a trail of puzzles to find it, and more of them further in.
//
// The way out, in order:
//
//   THE CELL
//    1. Three rows of tally marks give the footlocker's code.            (count)
//    2. The footlocker has matches. A blank letter is under the mattress;
//       heat it and Eli's message appears.                               (invisible ink)
//    3. The desk drawer opens to HOPE, spelled on the telephone keys.    (keypad cipher)
//    4. The drawer's spoon pries up a loose tile; a photo scrap is under it. (tool use)
//    5. Three torn scraps (footlocker, drawer, tile) mend the photograph. (assembly)
//    6. The photo's four flags are the colours to set on the wall dials
//       behind the poster, then pull the lever: a slab sinks.            (colour code)
//   THE TUNNEL
//    7. Three riddles carved on the beams give a three-digit gate code.  (riddles)
//   THE LAUNDRY
//    8. A roster of clues places darks, whites and oranges in the three
//       machines; the cycle codes in that order open the locker.         (logic grid)
//    9. Turning the winch wheel raises the shutter to the office.        (winch)
//   THE OFFICE
//   10. The clock stopped at a time; that time opens the safe.           (clock)
//   11. Rivet the locker's key bow to the safe's key shaft at the bench. (combine)
//   12. The tower lamp outside the window flashes Morse: the keypad door's
//       code.                                                            (Morse)
//   THE GATE
//   13. The forged key opens the gate.                                   (exit)
//
// Plan (x east, z south; metres; the whole route runs west to east):
//
//      corridor       (bars)
//   z -3  +-----------+
//         |   CELL    |=== tunnel ===>[ LAUNDRY ]--shutter--[ OFFICE ]--door--[ GATE ]--> out
//   z  1  +-----------+
//   x    -2.2        2.2             6.8        12.1                17.1                21.5

const H = 2.8; // cell and corridor ceiling
const HL = 3.0; // laundry and office ceiling
const T = 0.2; // wall thickness

const WALL = "#d6d0c2";
const FLOOR = "#47453f";
const CEIL = "#2f2d2a";
const STEEL = "#8d9296";
const DARK = "#26231f";
const WOOD = "#5a4128";
const EARTH = "#4a3b2d";
const BRASS = "#c49a3a";

type BoxOpts = Parameters<LevelBuilder["box"]>[0];
type Interact = NonNullable<BoxOpts["interact"]>;
type Pose = NonNullable<BoxOpts["pose"]>;
type Extra = Omit<BoxOpts, "id" | "at" | "size" | "color" | "pose"> & {
  /** Slides `by` when the flag `state` is set. `solid` means it stops blocking you then. */
  slide?: { state: string; by: Vec3; solid?: boolean; duration?: number };
  /** Turns about `pivot` (an axis through it, up by default) when `state` is set. */
  spin?: { state: string; pivot: Vec3; angle: number; axis?: Vec3; solid?: boolean; duration?: number };
};

const mid = (a: number, b: number) => (a + b) / 2;

/** A box given by its extents: [x0, x1], [y0, y1], [z0, z1]. */
const ext = (...a: Parameters<typeof baseExt>) => baseExt(...a);
function baseExt(L: LevelBuilder, id: string, xs: [number, number], ys: [number, number], zs: [number, number], color: string, extra: Extra = {}) {
  // Nothing here has an environment to reflect, so metal goes dark; keep it subtle.
  const { slide, spin, metalness, ...rest } = extra;
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
  return L.box({ id, at, size: [xs[1] - xs[0], ys[1] - ys[0], zs[1] - zs[0]], color, roughness: 0.85, ...rest, metalness: metalness === undefined ? undefined : metalness * 0.45, pose });
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

const press = (stateId: string, prompt: string): Interact => ({ behavior: { type: "setState", stateId, value: true, prompt, sound: "open" } });

// ---- Walls ----------------------------------------------------------------------------

type Gap = { a: number; b: number; top: number };
const BRICK = { isSolid: true, roughness: 1, texture: "brick" as const, castShadow: false };

/** A wall along x, centred on depth `z`, from x0 to x1, cut by openings that run up to `top`. */
function wallX(L: LevelBuilder, id: string, z: number, x0: number, x1: number, h: number, gaps: Gap[] = [], color = WALL) {
  let cur = x0;
  let n = 0;
  for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
    if (g.a > cur) ext(L, `${id}-${n++}`, [cur, g.a], [0, h], [z - T / 2, z + T / 2], color, BRICK);
    if (g.top < h) ext(L, `${id}-${n++}`, [g.a, g.b], [g.top, h], [z - T / 2, z + T / 2], color, BRICK);
    cur = g.b;
  }
  if (x1 > cur) ext(L, `${id}-${n++}`, [cur, x1], [0, h], [z - T / 2, z + T / 2], color, BRICK);
}

/** A wall along z, centred on `x`, from z0 to z1. */
function wallZ(L: LevelBuilder, id: string, x: number, z0: number, z1: number, h: number, gaps: Gap[] = [], color = WALL) {
  let cur = z0;
  let n = 0;
  for (const g of [...gaps].sort((p, q) => p.a - q.a)) {
    if (g.a > cur) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [0, h], [cur, g.a], color, BRICK);
    if (g.top < h) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [g.top, h], [g.a, g.b], color, BRICK);
    cur = g.b;
  }
  if (z1 > cur) ext(L, `${id}-${n++}`, [x - T / 2, x + T / 2], [0, h], [cur, z1], color, BRICK);
}

/** Floor and ceiling slabs for a room. */
function shell(L: LevelBuilder, id: string, xs: [number, number], zs: [number, number], h: number, floor = FLOOR, ceil = CEIL) {
  ext(L, `${id}-floor`, xs, [-0.1, 0], zs, floor, { isSolid: true, roughness: 0.95, castShadow: false });
  ext(L, `${id}-ceiling`, xs, [h, h + 0.1], zs, ceil, { roughness: 1, castShadow: false });
}

/** A hanging bulb: a cord, a glass, and its light. */
function bulb(L: LevelBuilder, id: string, at: Vec3, color: string, intensity: number, distance: number, shadow = false) {
  const [x, y, z] = at;
  L.cylinder({ id: `${id}-cord`, at: [x, y + 0.2, z], size: [0.015, 0.4, 0.015], color: "#111", castShadow: false });
  L.sphere({ id: `${id}-glass`, at: [x, y - 0.02, z], size: [0.16, 0.16, 0.16], color: "#fff1c8", emissive: color, emissiveIntensity: 1.8, castShadow: false });
  L.pointLight({ id: `${id}-light`, at: [x, y - 0.12, z], color, intensity, distance, castShadow: shadow });
}

/**
 * A metal locker with a hinged door and a code lock, hollow inside so what's in
 * it can't be reached until the door's open. `face` is the way the door faces
 * (0 = +z, π = -z); `hinge` is the side of the door it hangs from (-1 = left as
 * you face it). `put` turns a spot inside (across, up, in from the front... as
 * local coordinates) into a world position, so the caller can place things in it.
 */
function locker(
  L: LevelBuilder,
  id: string,
  cx: number,
  cz: number,
  face: number,
  o: { w: number; h: number; d: number; color: string; code: string; stateId: string; hinge: 1 | -1; lockedMessage: string; prompt: string },
) {
  const c = Math.cos(face);
  const s = Math.sin(face);
  const at = (lx: number, y: number, lz: number): Vec3 => [cx + lx * c + lz * s, y, cz - lx * s + lz * c];
  const { w, h, d, color } = o;
  const th = 0.03;
  const part = (key: string, lx: number, y: number, lz: number, size: Vec3, col: string, extra: Partial<BoxOpts> = {}) =>
    L.box({ id: `${id}-${key}`, at: at(lx, y, lz), size, color: col, roughness: 0.6, metalness: 0.2, rotationY: face, isSolid: true, ...extra });
  part("back", 0, h / 2, -d / 2 + th / 2, [w, h, th], color);
  part("side-l", -w / 2 + th / 2, h / 2, 0, [th, h, d], color);
  part("side-r", w / 2 - th / 2, h / 2, 0, [th, h, d], color);
  part("top", 0, h - th / 2, 0, [w, th, d], color);
  part("floor", 0, th / 2, 0, [w - 2 * th, th, d - th], color);
  const hingeLx = (o.hinge * (w - 0.04)) / 2;
  const doorAt = at(0, h / 2, d / 2 - th / 2);
  // The door has the lock. It swings open about its hinge edge, towards you.
  const pivot = at(hingeLx, 0, d / 2 - th / 2);
  const interact = codeLock(o.code, o.stateId, o.lockedMessage, o.prompt);
  L.box({
    id: `${id}-door`,
    name: "Door",
    at: doorAt,
    size: [w - 0.04, h - 0.04, th],
    color: o.color,
    roughness: 0.55,
    metalness: 0.25,
    rotationY: face,
    isSolid: true,
    interact,
    pose: {
      stateId: o.stateId,
      open: { position: doorAt, rotation: [0, face, 0] },
      duration: 0.9,
      spin: { pivot, angle: o.hinge === -1 ? -1.9 : 1.9, axis: [0, 1, 0] },
      unblocksWhenOpen: false,
    },
  });
  // The lock itself, and a handle, riding on the door.
  const pose = (p: Vec3): Pose => ({ stateId: o.stateId, open: { position: p, rotation: [0, face, 0] }, duration: 0.9, spin: { pivot, angle: o.hinge === -1 ? -1.9 : 1.9, axis: [0, 1, 0] }, unblocksWhenOpen: false });
  const lockAt = at(-o.hinge * (w / 2 - 0.14), h * 0.55, d / 2 + 0.02);
  L.box({ id: `${id}-lock`, name: "Lock", at: lockAt, size: [0.1, 0.12, 0.03], color: BRASS, roughness: 0.3, metalness: 0.85, rotationY: face, interact, pose: pose(lockAt) });
  return { at };
}

// ---- THE CELL -------------------------------------------------------------------------------

const TALLY = "#e2dcc8";

function buildCell(L: LevelBuilder) {
  shell(L, "cell", [-2.2, 2.2], [-1.8, 1.8], H);
  wallX(L, "cell-n", -1.7, -2.2, 2.2, H, [{ a: -0.65, b: 0.65, top: H }]);
  wallX(L, "cell-s-w", 1.7, -2.2, -0.45, H);
  wallX(L, "cell-s-e", 1.7, 0.45, 2.2, H);
  ext(L, "cell-s-below", [-0.45, 0.45], [0, 1.7], [1.6, 1.8], WALL, BRICK);
  ext(L, "cell-s-above", [-0.45, 0.45], [2.3, H], [1.6, 1.8], WALL, BRICK);
  wallZ(L, "cell-w", -2.1, -1.8, 1.8, H);
  // The east wall, and in it the patch: a slab that will sink into the floor.
  wallZ(L, "cell-e", 2.1, -1.8, 1.8, H, [{ a: 0.1, b: 1.1, top: 2.0 }]);
  ext(L, "slab", [2.0, 2.2], [0, 2.0], [0.1, 1.1], "#9a948a", {
    ...BRICK,
    slide: { state: "slab-open", by: [0, -2.15, 0], solid: true, duration: 2.6 },
    interact: readable("The mortar along this stretch of wall is paler than the rest, and the bricks sit a hair proud."),
  });
  L.rule({ whenAll: ["slab-open"], set: "slab-heard", message: "Stone grinds against stone, and a cold draught breathes in from the wall." });

  // Light: a bare bulb on a cord, and moonlight through the window.
  bulb(L, "cell-bulb", [0.2, 2.55, 0], "#ffd9a0", 7, 9, true);
  L.pointLight({ id: "cell-moon", at: [0, 2.0, 2.4], color: "#7f9ad0", intensity: 1.6, distance: 6 });

  // The door: bars, a lock, and a glimpse of the corridor and the guard's keys.
  const doorIx = readable("Locked, and thick. The guard's keys hang on a hook at the far end of the corridor, well out of reach.");
  for (let k = 0; k < 7; k++) L.cylinder({ id: `bar-${k}`, at: [-0.6 + 0.2 * k, H / 2, -1.7], size: [0.05, H, 0.05], color: STEEL, metalness: 0.7, roughness: 0.4, interact: doorIx, castShadow: false });
  for (const [i, y] of [0.5, 1.0, 1.9].entries()) ext(L, `bar-rail-${i}`, [-0.65, 0.65], [y, y + 0.06], [-1.74, -1.66], STEEL, { isSolid: true, metalness: 0.7, interact: doorIx, castShadow: false });
  ext(L, "cell-lock", [0.45, 0.62], [0.95, 1.2], [-1.74, -1.58], BRASS, { metalness: 0.85, roughness: 0.3, interact: doorIx });
  // The window, high in the south wall: bars, and the night behind them.
  for (let k = 0; k < 4; k++) ext(L, `window-bar-${k}`, [-0.31 + 0.2 * k, -0.27 + 0.2 * k], [1.7, 2.3], [1.62, 1.66], STEEL, { metalness: 0.7, castShadow: false });
  ext(L, "window-sky", [-0.5, 0.5], [1.65, 2.35], [1.78, 1.8], "#10192a", { emissive: "#2c4470", emissiveIntensity: 0.8, castShadow: false });
  ext(L, "window-sill", [-0.55, 0.55], [1.66, 1.7], [1.5, 1.7], DARK, { castShadow: false });

  // The corridor beyond the bars.
  shell(L, "corr", [-3.1, 3.1], [-3.8, -1.8], H);
  wallX(L, "corr-back", -3.7, -3.1, 3.1, H);
  wallZ(L, "corr-w", -3.0, -3.8, -1.6, H);
  wallZ(L, "corr-e", 3.0, -3.8, -1.6, H);
  wallX(L, "corr-s-w", -1.7, -3.1, -2.2, H);
  wallX(L, "corr-s-e", -1.7, 2.2, 3.1, H);
  bulb(L, "corr-bulb", [0, 2.5, -2.7], "#ffe0a8", 3.4, 7);
  ext(L, "key-board", [1.3, 2.3], [1.1, 1.9], [-3.6, -3.55], WOOD, { interact: doorIx });
  for (let k = 0; k < 3; k++) {
    ext(L, `guard-key-${k}`, [1.5 + 0.3 * k, 1.58 + 0.3 * k], [1.35, 1.7], [-3.55, -3.52], BRASS, { metalness: 0.8, roughness: 0.3, interact: doorIx, castShadow: false });
  }

  buildBunk(L);
  buildDesk(L);
  buildFixtures(L);
  buildPhotoFrame(L);
  buildWallDials(L);
  buildTally(L);
  buildHope(L);

  // The way the footlocker locks, and what's inside.
  L.codedChest({
    id: "footlocker",
    at: [-1.4, 0, -1.35],
    code: "472",
    size: [0.9, 0.45, 0.5],
    bodyColor: "#3d4636",
    lidColor: "#343c2e",
    lockedMessage: "A three-digit combination lock.",
  });
  L.pickup({ id: "matches", at: [-1.62, 0.075, -1.33], itemId: "matches", label: "Matchbook", icon: "🔥", mesh: { shape: "box", size: [0.07, 0.015, 0.05], color: "#b3342a" }, rotationY: 0.4 });
  L.pickup({ id: "scrap-a", at: [-1.2, 0.07, -1.3], itemId: "scrap-a", label: "Torn photo (1/3)", icon: "🖼️", mesh: { shape: "box", size: [0.1, 0.008, 0.08], color: "#d9cfb4" }, rotationY: -0.3 });
}

function buildBunk(L: LevelBuilder) {
  // A steel bunk along the west wall: x -2.0…-1.05, z -0.35…1.55.
  const X: [number, number] = [-2.0, -1.05];
  const Z: [number, number] = [-0.35, 1.55];
  for (const x of [-1.97, -1.08]) for (const z of [-0.32, 1.52]) ext(L, `bunk-post-${x}-${z}`, [x - 0.03, x + 0.03], [0, 1.9], [z - 0.03, z + 0.03], STEEL, { isSolid: true, metalness: 0.6 });
  ext(L, "bunk-base", X, [0.36, 0.4], Z, "#4a4a46", { metalness: 0.5 });
  // The lower mattress lifts, hinged along the wall.
  ext(L, "mattress", [-2.0, -1.07], [0.4, 0.52], [-0.33, 1.53], "#7b7666", {
    isSolid: true,
    roughness: 1,
    spin: { state: "mattress-up", pivot: [-2.0, 0.4, 0], angle: 1.1, axis: [0, 0, 1] },
    interact: press("mattress-up", "Lift the mattress"),
  });
  ext(L, "bunk-upper", X, [1.4, 1.46], Z, "#4a4a46", { isSolid: true, metalness: 0.5 });
  ext(L, "mattress-upper", [-2.0, -1.07], [1.46, 1.56], [-0.33, 1.53], "#6e6a5c", { isSolid: true, roughness: 1 });
  for (const [i, y] of [0.5, 0.8, 1.1, 1.4].entries()) ext(L, `bunk-rung-${i}`, [-1.08, -1.03], [y, y + 0.04], [1.0, 1.3], STEEL, { metalness: 0.6, castShadow: false });
  // What's under the mattress: a letter that looks blank.
  ext(L, "letter-blank", [-1.65, -1.37], [0.4, 0.412], [0.4, 0.6], "#eadfc0", {
    roughness: 0.95,
    castShadow: false,
    interact: itemLock(
      "matches",
      "letter-heated",
      "A folded sheet of paper, blank on both sides. It smells faintly of lemons.",
      "Hold a lit match under the paper",
    ),
  });
  ext(L, "letter-revealed", [-1.65, -1.37], [0.412, 0.424], [0.4, 0.6], "#e8d8a8", {
    roughness: 0.95,
    castShadow: false,
    appearsWhen: "letter-heated",
    interact: readable(
      "Brown writing has crept out across the page, as if it had been waiting.\n\n" +
        "Whoever finds this: you're in my old cell.\n\n" +
        "I tore my sister's photograph in three and hid the pieces. One is in the footlocker, one is in the desk drawer, and one is under the loose tile.\n\n" +
        "Count my days. Spell what they can't take from you. A spoon pries up a tile as well as it eats soup.\n\n" +
        "Good luck. — E.",
    ),
  });
}

function buildDesk(L: LevelBuilder) {
  // A steel desk against the north wall: x 0.85…1.95, z -1.6…-1.08.
  ext(L, "desk-top", [0.85, 1.95], [0.74, 0.78], [-1.6, -1.06], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "desk-side-l", [0.85, 0.89], [0, 0.74], [-1.6, -1.1], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "desk-side-r", [1.91, 1.95], [0, 0.74], [-1.6, -1.1], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "desk-back", [0.89, 1.91], [0, 0.74], [-1.6, -1.57], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "desk-apron", [0.89, 1.91], [0.7, 0.74], [-1.6, -1.1], STEEL, { metalness: 0.5 });
  // The drawer: five boards that slide out together once the code is in.
  const ix = codeLock("4673", "drawer-open", "A four-digit combination lock.", "Try the lock");
  const slide = { state: "drawer-open", by: [0, 0, 0.38] as Vec3 };
  const D = { metalness: 0.4, interact: ix, slide, castShadow: false };
  ext(L, "drawer-front", [0.92, 1.88], [0.5, 0.7], [-1.12, -1.08], "#7d8286", D);
  ext(L, "drawer-bottom", [0.92, 1.88], [0.5, 0.52], [-1.55, -1.12], "#6f7377", D);
  ext(L, "drawer-l", [0.92, 0.94], [0.5, 0.64], [-1.55, -1.12], "#6f7377", D);
  ext(L, "drawer-r", [1.86, 1.88], [0.5, 0.64], [-1.55, -1.12], "#6f7377", D);
  ext(L, "drawer-back", [0.92, 1.88], [0.5, 0.64], [-1.55, -1.53], "#6f7377", D);
  ext(L, "drawer-knob", [1.35, 1.45], [0.58, 0.64], [-1.16, -1.1], BRASS, { ...D, metalness: 0.8 });
  // Inside it, in the open position.
  L.pickup({ id: "spoon", at: [1.15, 0.535, -0.96], itemId: "spoon", label: "Spoon", icon: "🥄", mesh: { shape: "box", size: [0.03, 0.01, 0.17], color: "#c0c5c9", metalness: 0.3, roughness: 0.4, emissive: "#8f969c", emissiveIntensity: 0.35 }, rotationY: 0.5, appearsWhen: "drawer-open" });
  L.pickup({ id: "scrap-b", at: [1.6, 0.53, -1.0], itemId: "scrap-b", label: "Torn photo (2/3)", icon: "🖼️", mesh: { shape: "box", size: [0.1, 0.008, 0.08], color: "#d9cfb4" }, rotationY: 0.3, appearsWhen: "drawer-open" });

  // On the desk, and above it: a cup, a book, and the telephone card.
  ext(L, "desk-cup", [1.65, 1.73], [0.78, 0.86], [-1.5, -1.42], "#8a5a3a", { roughness: 0.6 });
  ext(L, "desk-book", [1.0, 1.28], [0.78, 0.83], [-1.5, -1.3], "#4a5a6a", { rotationY: 0.3, roughness: 0.9 });
  ext(L, "phone-card", [1.15, 1.65], [1.35, 1.75], [-1.6, -1.585], "#d8d2bd", {
    castShadow: false,
    interact: readable(
      "INMATE TELEPHONE: PRIVILEGE CARD\n\n" +
        "Calls are limited to ten minutes. All calls are recorded.\n\n" +
        "Keypad (letters beside the numbers):\n" +
        "1\n2 ABC\n3 DEF\n4 GHI\n5 JKL\n6 MNO\n7 PQRS\n8 TUV\n9 WXYZ\n0",
    ),
  });
}

function buildFixtures(L: LevelBuilder) {
  // A steel basin on a pedestal, and a toilet, in the south-east corner.
  ext(L, "sink-pedestal", [0.7, 0.9], [0, 0.78], [1.4, 1.58], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "sink-basin", [0.55, 1.05], [0.78, 0.9], [1.25, 1.58], STEEL, { isSolid: true, metalness: 0.5 });
  L.cylinder({ id: "sink-tap", at: [0.8, 0.98, 1.5], size: [0.03, 0.14, 0.03], color: STEEL, metalness: 0.9, roughness: 0.2, castShadow: false });
  ext(L, "toilet-base", [1.3, 1.75], [0, 0.42], [1.1, 1.58], STEEL, { isSolid: true, metalness: 0.5 });
  ext(L, "toilet-tank", [1.3, 1.75], [0.42, 0.9], [1.45, 1.58], STEEL, { isSolid: true, metalness: 0.5 });
  // The loose tile. A scrap of photograph is under it.
  ext(L, "tile-gap", [0.55, 1.05], [0.001, 0.006], [0.75, 1.25], "#0f0e0c", { castShadow: false });
  ext(L, "tile", [0.575, 1.025], [0.002, 0.03], [0.775, 1.225], "#6a685f", {
    roughness: 0.9,
    castShadow: false,
    slide: { state: "tile-up", by: [-0.6, 0, 0] },
    interact: itemLock("spoon", "tile-up", "One tile rocks under your finger, its grout scraped clean. You can't get a grip on it.", "Pry up the tile"),
  });
  L.pickup({ id: "scrap-c", at: [0.8, 0.03, 1.0], itemId: "scrap-c", label: "Torn photo (3/3)", icon: "🖼️", mesh: { shape: "box", size: [0.1, 0.008, 0.08], color: "#d9cfb4" }, rotationY: 0.7, appearsWhen: "tile-up" });
}

function buildPhotoFrame(L: LevelBuilder) {
  // An empty frame on the south wall above the toilet, clear of the bunk.
  const DX = 2.6;
  const ext = (L: LevelBuilder, id: string, xs: [number, number], ys: [number, number], zs: [number, number], color: string, extra: Extra = {}) =>
    baseExt(L, id, [xs[0] + DX, xs[1] + DX], ys, zs, color, extra);
  const ix: Interact = {
    behavior: {
      type: "combine",
      groups: [
        { label: "torn photo (1/3)", itemIds: ["scrap-a"] },
        { label: "torn photo (2/3)", itemIds: ["scrap-b"] },
        { label: "torn photo (3/3)", itemIds: ["scrap-c"] },
      ],
      stateId: "photo-restored",
      prompt: "Fit the torn scraps into the frame",
      done: "The three scraps fit together, edge to edge.",
      missing: "An empty frame. Pieces still missing:",
      already: "The photograph is whole again.",
    },
  };
  const F = { color: "#3a2a1a", castShadow: false };
  ext(L, "frame-t", [-1.42, -0.78], [1.72, 1.77], [1.56, 1.6], "#3a2a1a", { ...F, interact: ix });
  ext(L, "frame-b", [-1.42, -0.78], [1.13, 1.18], [1.56, 1.6], "#3a2a1a", { ...F, interact: ix });
  ext(L, "frame-l", [-1.42, -1.37], [1.18, 1.72], [1.56, 1.6], "#3a2a1a", { ...F, interact: ix });
  ext(L, "frame-r", [-0.83, -0.78], [1.18, 1.72], [1.56, 1.6], "#3a2a1a", { ...F, interact: ix });
  ext(L, "frame-back", [-1.37, -0.83], [1.18, 1.72], [1.585, 1.6], "#2b2723", { castShadow: false, interact: ix });
  // The mended photograph, in front of the backing.
  const photoIx = readable(
    "A sailboat in a harbour, four signal flags snapping from its mast. On the back, in pencil: \"Our colours.\"",
  );
  const P = { castShadow: false, appearsWhen: "photo-restored", interact: photoIx };
  ext(L, "photo", [-1.36, -0.84], [1.19, 1.71], [1.565, 1.585], "#e7dcc0", { ...P, roughness: 1 });
  ext(L, "photo-sea", [-1.36, -0.84], [1.19, 1.3], [1.555, 1.565], "#35566e", { ...P, roughness: 0.6 });
  ext(L, "photo-hull", [-1.28, -0.92], [1.28, 1.34], [1.55, 1.565], "#4a2e1c", P);
  ext(L, "photo-mast", [-1.12, -1.09], [1.3, 1.68], [1.55, 1.565], "#3a2a1a", P);
  // Four flags, top to bottom: blue, red, yellow, green.
  for (const [i, col] of ["#2a5ad8", "#d0261c", "#e8c020", "#2fa040"].entries()) {
    const y = 1.62 - i * 0.085;
    ext(L, `photo-flag-${i}`, [-1.09, -0.92], [y - 0.035, y + 0.035], [1.548, 1.565], col, P);
  }
}

// The colours behind the poster: indexes into this list, top flag first.
const DIAL_COLORS = ["#d0261c", "#2fa040", "#2a5ad8", "#e8c020"]; // red, green, blue, yellow
const DIAL_ANSWER = [2, 0, 3, 1]; // blue, red, yellow, green

function buildWallDials(L: LevelBuilder) {
  // The poster: hangs over a plate of four colour dials and a lever. Flip it up to see them.
  const posterIx = press("poster-up", "Lift the poster");
  const pivot: Vec3 = [1.865, 2.1, -0.55];
  const spin = { state: "poster-up", pivot, angle: -1.3, axis: [0, 0, 1] as Vec3 };
  const P = { castShadow: false, spin, interact: posterIx };
  ext(L, "poster", [1.86, 1.87], [0.9, 2.1], [-1.05, -0.05], "#5d7f96", P);
  ext(L, "poster-sea", [1.85, 1.86], [0.9, 1.35], [-1.05, -0.05], "#2e4a63", P);
  ext(L, "poster-sun", [1.85, 1.86], [1.55, 1.85], [-0.7, -0.4], "#e8b04a", P);

  ext(L, "dial-plate", [1.96, 2.0], [0.9, 1.95], [-1.0, -0.1], DARK, { metalness: 0.5, castShadow: false });
  for (let k = 0; k < 4; k++) {
    L.dial({ id: `wall-dial-${k}`, at: [1.955, 1.45, -0.85 + 0.2 * k], rotationY: -Math.PI / 2, valueId: `wd${k}`, colors: DIAL_COLORS, prompt: "Turn the dial" });
  }
  // The lever below them. It only moves when the four colours are right.
  ext(L, "lever", [1.9, 1.96], [0.98, 1.14], [-0.62, -0.48], "#a02b22", {
    castShadow: false,
    spin: { state: "slab-open", pivot: [1.95, 1.14, -0.55], angle: -0.9, axis: [0, 0, 1] },
    interact: {
      lock: {
        requires: { kind: "values", valueIds: [0, 1, 2, 3].map((k) => `wd${k}`), equals: DIAL_ANSWER },
        lockedMessage: "The lever won't budge.",
        consumeItem: false,
      },
      behavior: { type: "setState", stateId: "slab-open", value: true, prompt: "Pull the lever", sound: "open" },
    },
  });
}

function buildTally(L: LevelBuilder) {
  // Three rows of tally marks on the wall above the footlocker: 4, 7 and 2. Days, scratched in.
  const stroke = (id: string, x: number, y: number) => ext(L, id, [x, x + 0.012], [y, y + 0.13], [-1.605, -1.597], TALLY, { castShadow: false });
  const row = (n: string, y: number, count: number) => {
    let x = -1.88;
    let left = count;
    while (left > 0) {
      const k = Math.min(5, left);
      for (let i = 0; i < Math.min(4, k); i++) stroke(`tally-${n}-${x.toFixed(2)}-${i}`, x + i * 0.04, y);
      if (k === 5) {
        const slash = ext(L, `tally-${n}-${x.toFixed(2)}-slash`, [x - 0.01, x + 0.17], [y + 0.06, y + 0.072], [-1.605, -1.597], TALLY, { castShadow: false });
        slash.transform.rotation = [0, 0, 0.5];
        x += 0.24;
      } else {
        x += k * 0.04 + 0.1;
      }
      left -= k;
    }
  };
  row("a", 1.45, 4);
  row("b", 1.27, 7);
  row("c", 1.09, 2);
}

// A tiny stroke font for H, O, P, E: rectangles [x, y, w, h] in a 0.1 × 0.16 box.
const LETTERS: Record<string, Array<[number, number, number, number]>> = {
  H: [[0, 0, 0.02, 0.16], [0.08, 0, 0.02, 0.16], [0, 0.07, 0.1, 0.02]],
  O: [[0, 0, 0.1, 0.02], [0, 0.14, 0.1, 0.02], [0, 0, 0.02, 0.16], [0.08, 0, 0.02, 0.16]],
  P: [[0, 0, 0.02, 0.16], [0, 0.14, 0.1, 0.02], [0, 0.07, 0.1, 0.02], [0.08, 0.07, 0.02, 0.09]],
  E: [[0, 0, 0.02, 0.16], [0, 0, 0.1, 0.02], [0, 0.07, 0.08, 0.02], [0, 0.14, 0.1, 0.02]],
};

function buildHope(L: LevelBuilder) {
  // Scratched into the plaster over the bunk, on the west wall. Read left to right, that's towards -z.
  const ix = readable("Scratched into the plaster, again and again, until it cut through the paint: HOPE.");
  [..."HOPE"].forEach((ch, i) => {
    LETTERS[ch].forEach(([x, y, w, h], j) => {
      const z1 = 0.95 - i * 0.18 - x;
      ext(L, `hope-${i}-${j}`, [-2.0, -1.993], [1.95 + y, 1.95 + y + h], [z1 - w, z1], TALLY, { castShadow: false, interact: ix });
    });
  });
}

// ---- THE TUNNEL -----------------------------------------------------------------------------

function buildTunnel(L: LevelBuilder) {
  // x 2.2…6.8, z 0.1…1.1, a man's height and a bit.
  const TH = 2.1;
  ext(L, "tun-floor", [2.0, 7.0], [-0.1, 0], [-0.1, 1.3], "#3a3128", { isSolid: true, roughness: 1, castShadow: false });
  ext(L, "tun-ceiling", [2.2, 6.8], [TH, TH + 0.2], [-0.1, 1.3], EARTH, { roughness: 1, castShadow: false });
  ext(L, "tun-wall-n", [2.2, 6.8], [0, TH + 0.2], [-0.1, 0.1], EARTH, { isSolid: true, roughness: 1, castShadow: false });
  ext(L, "tun-wall-s", [2.2, 6.8], [0, TH + 0.2], [1.1, 1.3], EARTH, { isSolid: true, roughness: 1, castShadow: false });
  // Timbers every metre and a bit.
  for (const x of [3.2, 4.4, 5.6]) {
    ext(L, `tun-post-n-${x}`, [x - 0.06, x + 0.06], [0, TH], [0.1, 0.18], WOOD, { roughness: 0.9, castShadow: false });
    ext(L, `tun-post-s-${x}`, [x - 0.06, x + 0.06], [0, TH], [1.02, 1.1], WOOD, { roughness: 0.9, castShadow: false });
    ext(L, `tun-beam-${x}`, [x - 0.06, x + 0.06], [TH - 0.1, TH], [0.1, 1.1], WOOD, { roughness: 0.9, castShadow: false });
  }
  L.candle({ id: "tun-candle-a", at: [2.8, 1.35, 0.12], height: 0.14, intensity: 2.4, distance: 5.5 });
  L.candle({ id: "tun-candle-b", at: [4.9, 1.35, 1.08], height: 0.14, intensity: 2.4, distance: 5.5 });
  L.candle({ id: "tun-candle-c", at: [6.3, 1.35, 0.12], height: 0.14, intensity: 2.2, distance: 5 });
  for (const [x, z] of [[2.8, 0.115], [4.9, 1.085], [6.3, 0.115]]) ext(L, `tun-shelf-${x}`, [x - 0.1, x + 0.1], [1.3, 1.35], [z - 0.05, z + 0.05], WOOD, { castShadow: false });

  const plank = (id: string, x: number, wall: "n" | "s", text: string, w = 0.5) => {
    const z: [number, number] = wall === "n" ? [0.1, 0.125] : [1.075, 1.1];
    ext(L, id, [x - w / 2, x + w / 2], [1.1, 1.55], z, "#6a4e30", { roughness: 0.9, castShadow: false, interact: readable(text) });
  };
  plank(
    "tun-sign",
    2.55,
    "s",
    "Scratched into the earth, in the same hand as the letter:\n\n\"You're through. Good. The gate ahead has a three-digit lock.\"",
  );
  plank("tun-riddle-1", 3.7, "n", "FIRST BEAM\n\n\"I am an odd number. Take away one letter and I become even. What number am I?\"");
  plank("tun-riddle-2", 4.2, "s", "SECOND BEAM\n\n\"A farmer has seventeen sheep. All but nine run away. How many does he have left?\"");
  plank("tun-riddle-3", 5.9, "n", "THIRD BEAM\n\n\"You are in a race, and you overtake the runner in second place. What place are you in now?\"");

  // The gate: bars that rise into the ceiling once the three digits are in.
  const ix = codeLock("792", "tunnel-gate-open", "A three-digit padlock.", "Try the padlock");
  const slide = { state: "tunnel-gate-open", by: [0, 2.25, 0] as Vec3, solid: true, duration: 1.6 };
  for (let k = 0; k < 8; k++) ext(L, `gate-bar-${k}`, [6.62, 6.68], [0, TH], [0.15 + 0.13 * k - 0.02, 0.15 + 0.13 * k + 0.02], STEEL, { isSolid: true, metalness: 0.7, roughness: 0.4, interact: ix, slide, castShadow: false });
  for (const [i, y] of [0.5, 1.4, 1.95].entries()) ext(L, `gate-rail-${i}`, [6.6, 6.7], [y, y + 0.06], [0.1, 1.1], STEEL, { isSolid: true, metalness: 0.7, interact: ix, slide, castShadow: false });
  ext(L, "gate-lock", [6.55, 6.62], [0.92, 1.12], [0.52, 0.68], BRASS, { metalness: 0.85, roughness: 0.3, interact: ix, slide, castShadow: false });
}

// ---- THE LAUNDRY -----------------------------------------------------------------------------

const LAUNDRY_CODE = "148";

function buildLaundry(L: LevelBuilder) {
  shell(L, "lau", [6.8, 12.2], [-2.7, 2.7], HL, "#55534e");
  wallX(L, "lau-n", -2.6, 6.8, 12.2, HL);
  wallX(L, "lau-s", 2.6, 6.8, 12.2, HL);
  wallZ(L, "lau-w", 6.9, -2.7, 2.7, HL, [{ a: 0.1, b: 1.1, top: 2.1 }]);
  wallZ(L, "lau-e", 12.1, -2.7, 2.7, HL, [{ a: -0.6, b: 0.6, top: 2.4 }]);
  bulb(L, "lau-bulb-a", [8.5, 2.75, 0.3], "#fff0cc", 6.5, 9);
  bulb(L, "lau-bulb-b", [10.9, 2.75, -0.2], "#fff0cc", 6, 9);
  L.pointLight({ id: "lau-wheel-lamp", at: [11.3, 2.0, -1.3], color: "#ffcf8a", intensity: 2.6, distance: 4.5 });

  // Pipes along the ceiling, and a boiler in the corner.
  for (const [i, [z, y]] of [[-2.25, 2.75], [2.2, 2.65], [-2.05, 2.55]].entries()) {
    L.cylinder({ id: `lau-pipe-${i}`, at: [9.5, y, z], size: [0.12, 5.2, 0.12], color: "#6a5a4a", metalness: 0.6, roughness: 0.6, castShadow: false }).transform.rotation = [0, 0, Math.PI / 2];
  }
  L.cylinder({ id: "boiler", name: "Boiler", at: [11.3, 1.0, 1.8], size: [0.9, 2.0, 0.9], color: "#6b4a36", metalness: 0.6, roughness: 0.7, isSolid: true });
  L.cylinder({ id: "boiler-flue", name: "Boiler", at: [11.3, 2.5, 1.8], size: [0.2, 1.0, 0.2], color: "#4a4038", metalness: 0.6, castShadow: false });

  // Three washing machines in a row along the north wall: no. 1 on your left as you face them.
  for (const [i, x] of [8.1, 9.3, 10.5].entries()) {
    const ix = readable(`Washing machine no. ${i + 1}. A paper tag on the door says only: "LOAD FOR TOMORROW."`);
    ext(L, `washer-${i + 1}`, [x - 0.5, x + 0.5], [0, 1.0], [-2.5, -1.85], "#a9aeb2", { isSolid: true, metalness: 0.4, roughness: 0.45, interact: ix });
    L.cylinder({ id: `washer-${i + 1}-door`, at: [x, 0.55, -1.84], size: [0.5, 0.04, 0.5], color: "#27323d", metalness: 0.3, roughness: 0.2, interact: ix, castShadow: false }).transform.rotation = [Math.PI / 2, 0, 0];
    ext(L, `washer-${i + 1}-plate`, [x - 0.17, x + 0.17], [1.25, 1.5], [-2.5, -2.48], "#ffffff", { texture: `chalk:No.:${i + 1}`, castShadow: false, interact: ix });
  }
  // The roster, on the west wall by the tunnel, and the cycle card at the east end of the north wall.
  ext(L, "lau-roster", [7.0, 7.02], [1.3, 1.85], [-1.95, -1.15], "#d8d2bd", {
    castShadow: false,
    interact: readable(
      "LAUNDRY ROSTER\n\nThree machines, three loads, one load each: WHITES, DARKS and ORANGES (the jumpsuits). Machines are numbered 1 to 3, left to right as you face them.\n\n" +
        "• The oranges never run in the middle machine.\n" +
        "• The whites do not run in machine 1.\n" +
        "• The darks run in a machine to the left of the oranges.\n\n" +
        "Load them right or the foreman has my hide.",
    ),
  });
  ext(L, "lau-cycles", [11.2, 11.7], [1.3, 1.8], [-2.5, -2.48], "#d8d2bd", {
    castShadow: false,
    interact: readable("CYCLE SELECTOR\n\nSet the dial for the load:\n\n  DARKS . . . . 1  (cold)\n  WHITES . . . 4  (warm)\n  ORANGES . . . 8  (hot)"),
  });

  // The locker on the south wall, facing north. The key's bow is inside.
  const lk = locker(L, "locker", 9.3, 2.25, Math.PI, {
    w: 0.9,
    h: 1.9,
    d: 0.5,
    color: "#5d6e63",
    code: LAUNDRY_CODE,
    stateId: "locker-open",
    hinge: -1,
    lockedMessage: "A three-digit combination lock.",
    prompt: "Try the lock",
  });
  L.pickup({ id: "key-bow", at: lk.at(0, 0.07, 0.05), itemId: "key-bow", label: "Key bow", icon: "🗝️", mesh: { shape: "cylinder", size: [0.11, 0.018, 0.11], color: BRASS, metalness: 0.3, roughness: 0.4, emissive: "#8a6a20", emissiveIntensity: 0.5 }, rotationY: 0.4 });
  // Baskets, a line of washing, a mop bucket.
  ext(L, "basket-a", [10.0, 10.6], [0, 0.5], [1.9, 2.45], "#7a8a95", { isSolid: true, roughness: 0.7 });
  ext(L, "basket-b", [7.2, 7.7], [0, 0.45], [-0.9, -0.5], "#8a7a6a", { isSolid: true, roughness: 0.7 });
  L.cylinder({ id: "mop-bucket", at: [8.2, 0.2, 1.5], size: [0.35, 0.4, 0.35], color: "#9a9d3a", isSolid: true });
  for (const [i, x] of [7.3, 7.8, 8.3].entries()) ext(L, `jumpsuit-${i}`, [x, x + 0.4], [1.2, 2.2], [2.18, 2.22], "#d9731c", { roughness: 1, castShadow: false });
  ext(L, "washing-line", [7.2, 8.8], [2.25, 2.27], [2.19, 2.21], "#2a2520", { castShadow: false });

  // The shutter to the office, and the wheel that raises it.
  const sh = { state: "shutter-done", by: [0, 2.5, 0] as Vec3, solid: true, duration: 2.4 };
  const hint = readable("A steel roller shutter, solid and cold. There's no handle.");
  ext(L, "shutter", [12.02, 12.18], [0, 2.4], [-0.6, 0.6], "#6d7276", { isSolid: true, metalness: 0.6, roughness: 0.5, interact: hint, slide: sh });
  for (let k = 0; k < 6; k++) ext(L, `shutter-rib-${k}`, [11.99, 12.02], [0.3 + k * 0.4, 0.36 + k * 0.4], [-0.58, 0.58], "#565a5e", { metalness: 0.6, castShadow: false, interact: hint, slide: sh });
  L.wheel({ id: "shutter-wheel", at: [11.98, 1.35, -1.55], rotationY: -Math.PI / 2, valueId: "shutter", color: "#d9a21c", seconds: 5, prompt: "Hold to turn the winch", done: "The shutter rattles upward." });
}

// ---- THE OFFICE --------------------------------------------------------------------------------

// The clock stopped at 7:20.
const CLOCK_CODE = "0720";
// Tower lamp: 2, 6, 3 in Morse.
const MORSE_CODE = "263";
const MORSE: Record<string, string> = { "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----." };

function buildOffice(L: LevelBuilder) {
  shell(L, "off", [12.2, 17.2], [-2.7, 2.7], HL, "#4a4640");
  wallX(L, "off-n-w", -2.6, 12.2, 14.5, HL);
  wallX(L, "off-n-e", -2.6, 15.9, 17.2, HL);
  ext(L, "off-n-below", [14.5, 15.9], [0, 1.2], [-2.7, -2.5], WALL, BRICK);
  ext(L, "off-n-above", [14.5, 15.9], [2.3, HL], [-2.7, -2.5], WALL, BRICK);
  wallX(L, "off-s", 2.6, 12.2, 17.2, HL);
  wallZ(L, "off-e", 17.1, -2.7, 2.7, HL, [{ a: -0.6, b: 0.6, top: 2.4 }]);
  bulb(L, "off-bulb", [14.6, 2.75, 0], "#ffe4b8", 7, 10, true);
  bulb(L, "off-bulb-2", [13.8, 2.7, 1.5], "#ffe4b8", 4.2, 6);

  // The window on the yard, and the tower with the signal lamp beyond it.
  for (let k = 0; k < 3; k++) ext(L, `off-window-bar-${k}`, [14.9 + 0.3 * k, 14.94 + 0.3 * k], [1.2, 2.3], [-2.62, -2.58], STEEL, { metalness: 0.7, castShadow: false });
  ext(L, "off-window-sill", [14.45, 15.95], [1.17, 1.21], [-2.75, -2.45], DARK, { castShadow: false });
  ext(L, "tower-post", [15.1, 15.3], [0, 2.4], [-6.2, -6.0], "#2a2c30", { castShadow: false });
  ext(L, "tower-platform", [14.7, 15.7], [2.2, 2.26], [-6.5, -5.6], "#2a2c30", { castShadow: false });
  L.blinker({ id: "tower-lamp", at: [15.2, 2.55, -5.9], scale: 2, pattern: [..."263"].map((d) => MORSE[d]).join("/"), unit: 0.45, color: "#ffe9a0" });
  L.pointLight({ id: "off-moon", at: [15.2, 2.0, -3.2], color: "#7f9ad0", intensity: 1.2, distance: 6 });

  // The Morse chart, and the clock, on the north wall.
  ext(L, "morse-chart", [13.5, 14.2], [1.3, 1.9], [-2.5, -2.48], "#d8d2bd", {
    castShadow: false,
    interact: readable(
      "SIGNAL LAMP: DIGITS\n\n" +
        Object.entries(MORSE)
          .map(([d, m]) => `${d}   ${m}`)
          .join("\n"),
    ),
  });
  const cx = 12.95;
  const cy = 2.0;
  L.cylinder({ id: "clock-face", name: "Clock", at: [cx, cy, -2.46], size: [0.6, 0.04, 0.6], color: "#e6dcc4", roughness: 0.6, interact: readable("The wall clock has stopped. A brass plate under it reads: \"WINDING: FIRST OF THE MONTH.\" Nobody has wound it in years.") }).transform.rotation = [Math.PI / 2, 0, 0];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const big = i % 3 === 0;
    const tick = ext(L, `clock-tick-${i}`, [0, 0.02], [0, big ? 0.07 : 0.04], [-2.435, -2.43], "#1b1712", { castShadow: false });
    tick.transform.position = [cx + Math.sin(a) * 0.25, cy + Math.cos(a) * 0.25, -2.43];
    tick.transform.rotation = [0, 0, -a];
  }
  // 7:20: the minute hand at 120°, the hour hand a third of the way from 7 to 8 (220°).
  const hand = (id: string, len: number, w: number, deg: number, z: number) => {
    const a = (deg * Math.PI) / 180;
    const h = ext(L, id, [0, w], [0, len], [z, z + 0.008], "#14110d", { castShadow: false });
    h.transform.position = [cx + (Math.sin(a) * len) / 2, cy + (Math.cos(a) * len) / 2, z + 0.004];
    h.transform.rotation = [0, 0, -a];
  };
  hand("clock-minute", 0.23, 0.014, 120, -2.425);
  hand("clock-hour", 0.15, 0.026, 220, -2.415);

  // The safe on the south wall, facing north: the key's shaft is inside.
  const safe = locker(L, "safe", 13.7, 2.25, Math.PI, {
    w: 0.7,
    h: 0.85,
    d: 0.5,
    color: "#5a5f64",
    code: CLOCK_CODE,
    stateId: "safe-open",
    hinge: 1,
    lockedMessage: "A four-digit dial.",
    prompt: "Try the dial",
  });
  L.pickup({ id: "key-shaft", at: safe.at(0, 0.06, 0.05), itemId: "key-shaft", label: "Key shaft", icon: "🔩", mesh: { shape: "box", size: [0.025, 0.025, 0.2], color: "#9aa0a6", metalness: 0.3, roughness: 0.4, emissive: "#7a8086", emissiveIntensity: 0.35 }, rotationY: 0.4 });

  // The warden's desk, with the memo.
  ext(L, "off-desk", [14.0, 15.7], [0.72, 0.77], [0.5, 1.3], "#3a2616", { isSolid: true, roughness: 0.6 });
  for (const [x, z] of [[14.1, 0.6], [15.6, 0.6], [14.1, 1.2], [15.6, 1.2]]) ext(L, `off-desk-leg-${x}-${z}`, [x - 0.04, x + 0.04], [0, 0.72], [z - 0.04, z + 0.04], "#24160b", { castShadow: false });
  ext(L, "off-chair-seat", [14.6, 15.0], [0.44, 0.49], [1.5, 1.9], "#3a2a1a", { isSolid: true });
  ext(L, "off-chair-back", [14.6, 15.0], [0.49, 1.0], [1.88, 1.92], "#3a2a1a", { isSolid: true });
  ext(L, "off-memo", [14.7, 15.0], [0.77, 0.782], [0.7, 0.95], "#e4dcc4", {
    rotationY: 0.2,
    castShadow: false,
    interact: readable(
      "MEMO, from the warden\n\n" +
        "The safe code is the time on the office clock, which stopped on the night of the escape.\n\n" +
        "The key to the gate is made in two parts so no one man can carry all of it. The bow is kept in the laundry locker. The shaft is in this safe.",
    ),
  });
  L.pointLight({ id: "off-desk-lamp", at: [15.4, 1.25, 0.9], color: "#ffb36b", intensity: 2.4, distance: 5 });
  ext(L, "off-desk-lamp-body", [15.33, 15.47], [0.77, 0.95], [0.84, 0.96], "#3d5a3a", { castShadow: false });
  // A filing cabinet and a notice board.
  ext(L, "filing", [12.25, 12.85], [0, 1.3], [-2.4, -1.8], "#53585c", { isSolid: true, metalness: 0.5 });
  ext(L, "notice-board", [12.2, 12.22], [1.2, 1.9], [0.9, 2.0], "#7a5a38", { castShadow: false, interact: readable("A cork notice board of pins and torn corners. Everything useful was taken down long ago.") });

  // The bench with the vise, on the east wall.
  ext(L, "bench-top", [16.2, 16.95], [0.88, 0.94], [-2.4, -1.2], "#5a4128", { isSolid: true });
  for (const z of [-2.35, -1.25]) for (const x of [16.25, 16.9]) ext(L, `bench-leg-${x}-${z}`, [x - 0.04, x + 0.04], [0, 0.88], [z - 0.04, z + 0.04], "#24160b", { castShadow: false });
  const vise: Interact = {
    behavior: {
      type: "combine",
      groups: [
        { label: "key bow", itemIds: ["key-bow"] },
        { label: "key shaft", itemIds: ["key-shaft"] },
      ],
      stateId: "key-forged",
      prompt: "Rivet the key together",
      done: "You set the shaft in the vise, slot the bow over it and hammer the rivet home. A heavy iron key.",
      missing: "A locksmith's vise, with a rivet and a hammer beside it. Parts still missing:",
      already: "The key is already made.",
    },
  };
  ext(L, "vise-base", [16.55, 16.8], [0.94, 1.02], [-1.95, -1.65], "#3a3d40", { metalness: 0.7, interact: vise });
  ext(L, "vise-jaw", [16.55, 16.8], [1.02, 1.12], [-1.8, -1.7], "#2b2e31", { metalness: 0.7, interact: vise });
  ext(L, "vise-handle", [16.4, 16.55], [1.04, 1.07], [-1.84, -1.8], "#2b2e31", { metalness: 0.7, interact: vise, castShadow: false });
  L.pickup({ id: "gate-key", at: [16.45, 0.965, -1.4], itemId: "gate-key", label: "Gate key", icon: "🔑", mesh: "iron-key", rotationY: 0.8, appearsWhen: "key-forged" });

  // The keypad door, and the keypad beside it.
  const ix = codeLock(MORSE_CODE, "keypad-door-open", "A keypad on a steel door.", "Use the keypad");
  const slide = { state: "keypad-door-open", by: [0, 2.6, 0] as Vec3, solid: true, duration: 2.0 };
  ext(L, "keypad-door", [17.02, 17.18], [0, 2.4], [-0.6, 0.6], "#5d6266", { isSolid: true, metalness: 0.6, interact: ix, slide });
  for (const [i, y] of [0.3, 1.9].entries()) ext(L, `keypad-door-stripe-${i}`, [17.0, 17.02], [y, y + 0.14], [-0.58, 0.58], "#c9a21f", { interact: ix, slide, castShadow: false });
  ext(L, "keypad-panel", [16.93, 17.0], [1.05, 1.5], [0.72, 0.98], "#2a2c30", { metalness: 0.6, interact: ix });
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ext(L, `keypad-key-${r}-${c}`, [16.91, 16.93], [1.1 + r * 0.1, 1.15 + r * 0.1], [0.75 + c * 0.07, 0.79 + c * 0.07], "#b9bec2", { interact: ix, castShadow: false });
}

// ---- THE GATE -------------------------------------------------------------------------------

function buildGate(L: LevelBuilder) {
  // A last corridor, x 17.2…21.4, and the gate across its end.
  shell(L, "gate", [17.2, 22.0], [-1.2, 1.2], H);
  wallX(L, "gate-n", -1.1, 17.2, 22.0, H);
  wallX(L, "gate-s", 1.1, 17.2, 22.0, H);
  bulb(L, "gate-bulb", [19.2, 2.5, 0], "#ffe0a8", 5, 9);
  L.pointLight({ id: "gate-lamp", at: [20.8, 2.2, 0], color: "#ffd9a0", intensity: 3, distance: 5 });
  // Warning stripes on the floor, a barrel, a crate.
  for (let k = 0; k < 6; k++) ext(L, `gate-stripe-${k}`, [18.2 + k * 0.6, 18.5 + k * 0.6], [0.001, 0.006], [-1.0, 1.0], k % 2 ? "#2a2a2a" : "#c9a21f", { castShadow: false });
  L.cylinder({ id: "gate-barrel", at: [20.2, 0.45, -0.75], size: [0.55, 0.9, 0.55], color: "#7a2d1e", isSolid: true, metalness: 0.4 });
  ext(L, "gate-crate", [19.6, 20.2], [0, 0.55], [0.5, 1.0], WOOD, { isSolid: true });

  // The gate itself: bars across the whole width, and a heavy lock plate in the middle.
  const GX = 21.6;
  for (let k = 0; k < 10; k++) ext(L, `exit-bar-${k}`, [GX - 0.03, GX + 0.03], [0, 2.6], [-1.0 + 0.2 * k - 0.025, -1.0 + 0.2 * k + 0.025], STEEL, { isSolid: true, metalness: 0.7, roughness: 0.4, castShadow: false });
  for (const [i, y] of [0.4, 1.3, 2.5].entries()) ext(L, `exit-rail-${i}`, [GX - 0.05, GX + 0.05], [y, y + 0.07], [-1.1, 1.1], STEEL, { isSolid: true, metalness: 0.7, castShadow: false });
  ext(L, "exit-gate", [GX - 0.12, GX - 0.05], [0.7, 1.55], [-0.3, 0.3], "#6a7076", {
    isSolid: true,
    metalness: 0.7,
    roughness: 0.4,
    interact: {
      lock: { requires: { kind: "item", itemId: "gate-key", held: true }, lockedMessage: "A heavy iron lock, the size of a fist. It wants a key, and it wants it in your hand.", consumeItem: false },
      behavior: { type: "exit" },
    },
  });
  L.setExit("exit-gate");

  // Outside: moonlit yard, a fence line, a moon.
  ext(L, "yard", [22.0, 46], [-0.1, 0], [-14, 14], "#3d4a38", { roughness: 1, emissive: "#1d2a1c", emissiveIntensity: 0.7, castShadow: false });
  ext(L, "yard-sky", [46, 46.5], [0, 30], [-30, 30], "#16213a", { emissive: "#2c426e", emissiveIntensity: 0.9, castShadow: false });
  ext(L, "yard-fence", [30, 30.2], [0, 3.5], [-12, 12], "#1a1d22", { castShadow: false });
  L.sphere({ id: "moon", at: [38, 18, -6], size: [3, 3, 3], color: "#e8efff", emissive: "#cfdcff", emissiveIntensity: 1.4, castShadow: false });
  L.pointLight({ id: "yard-moon", at: [23.5, 3.0, 0], color: "#9db8e8", intensity: 6, distance: 13 });
}

export default defineLevel({
  id: "level-04",
  name: "Level 04 — Cell Seventeen",
  tags: ["medium", "puzzle"],
  background: "#05060a",
  // Mid-cell, looking towards the bunk and the corner where the days are scratched.
  playerStart: { position: [0.8, 1.7, 0.4], rotationY: Math.PI / 3 },
  build(L) {
    L.ambient({ color: "#4a5266", intensity: 0.6 });
    buildCell(L);
    buildTunnel(L);
    buildLaundry(L);
    buildOffice(L);
    buildGate(L);
  },
});
