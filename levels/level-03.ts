import { defineLevel, type LevelBuilder, type Vec3 } from "@/leveldsl";

// The doll-maker's house, at night.
//
// You come to in his workshop at the west end of the house. Down the hallway,
// in the foyer by the front door, sits Clementine: a life-size porcelain doll in
// an armchair, facing you. She wakes when the workshop door is opened, and from
// then on she moves whenever she isn't seen: when you look away, when you
// blink, and when the lights fail. She opens shut doors too, though it takes
// her a moment and you'll hear it.
//
// The front door is chained with a four-dial padlock. Its numbers are chalked
// on four slates, one in each room off the hallway (nursery, dining room,
// parlour, study), numbered I to IV. Which room has which numeral, and the
// digits, change every time. Entering the code means taking your eyes off her.
//
// Plan (x east, z south; metres):
//
//        x -12      -6          1          8     12
//   z -9          +----------+----------+
//                 | nursery  ) dining   |
//   z -5   +------+          |          D-----+
//          |      +--D-------+--D-------+ fo  |
//   z  0   | work D   hallway             yer  |
//          |      +----D-----+-----D----+     |
//   z  5   +------+ parlour  ) study    D--X--+
//                 |          |          |
//   z  9          +----------+----------+
//
//   D = door, ) = open archway, X = the front door (the way out).

const H = 3; // ceiling
const T = 0.2; // wall thickness
const DOOR_H = 2.3;
const DOOR_W = 1.1;

const WALL = "#4c443b";
const DADO = "#2a1c13";
const TRIM = "#1d140d";
const WOOD = "#3f2a1a";
const DARK = "#24180f";

type Gap = { at: number; w: number; arch?: boolean };

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Walls ----------------------------------------------------------------------
// A plastered wall with a dark wooden dado and rail, cut by doorways (with a
// lintel and a moulded frame) or wider open archways.

function wall(L: LevelBuilder, id: string, axis: "x" | "z", fixed: number, from: number, to: number, gaps: Gap[] = []) {
  // Turn (along, across, y) into world coordinates and (length, height, depth) into a size.
  const at = (along: number, y: number, across = 0): Vec3 => (axis === "x" ? [along, y, fixed + across] : [fixed + across, y, along]);
  const size = (len: number, h: number, d: number): Vec3 => (axis === "x" ? [len, h, d] : [d, h, len]);
  let n = 0;
  const seg = (a: number, b: number) => {
    const m = (a + b) / 2;
    const len = b - a;
    L.box({ id: `${id}-${n}`, name: "Wall", at: at(m, H / 2), size: size(len, H, T), color: WALL, roughness: 0.95, isSolid: true, castShadow: false });
    L.box({ id: `${id}-${n}-dado`, name: "Wall", at: at(m, 0.45), size: size(len, 0.9, T + 0.04), color: DADO, roughness: 0.7, castShadow: false });
    L.box({ id: `${id}-${n}-rail`, name: "Wall", at: at(m, 0.92), size: size(len, 0.05, T + 0.07), color: TRIM, roughness: 0.6, castShadow: false });
    L.box({ id: `${id}-${n}-cornice`, name: "Wall", at: at(m, H - 0.06), size: size(len, 0.12, T + 0.08), color: "#3a332c", roughness: 0.9, castShadow: false });
    n++;
  };
  let cur = from;
  for (const g of [...gaps].sort((a, b) => a.at - b.at)) {
    const a = g.at - g.w / 2;
    const b = g.at + g.w / 2;
    if (a > cur) seg(cur, a);
    const top = g.arch ? 2.6 : DOOR_H;
    L.box({ id: `${id}-lintel-${n}`, name: "Wall", at: at(g.at, (top + H) / 2), size: size(g.w, H - top, T), color: WALL, roughness: 0.95, isSolid: true, castShadow: false });
    // Moulded frame round the opening, both faces.
    for (const s of [-1, 1]) {
      L.box({ id: `${id}-jamb-${n}-${s}`, name: "Door frame", at: at(g.at + s * (g.w / 2 + 0.04), top / 2), size: size(0.08, top, T + 0.06), color: TRIM, roughness: 0.6, castShadow: false });
    }
    L.box({ id: `${id}-head-${n}`, name: "Door frame", at: at(g.at, top + 0.04), size: size(g.w + 0.16, 0.08, T + 0.06), color: TRIM, roughness: 0.6, castShadow: false });
    cur = b;
    n++;
  }
  if (to > cur) seg(cur, to);
}

/**
 * A panelled door that turns on its hinge. `axis` is the wall it's in (along x
 * or along z), `hinge` which end of the opening it hangs from (-1 = the low
 * end) and `swing` which way it turns (try the other if it opens the wrong way).
 * She can open these too.
 */
function door(L: LevelBuilder, id: string, axis: "x" | "z", cx: number, cz: number, hinge: 1 | -1, swing: 1 | -1) {
  const w = DOOR_W - 0.03;
  const stateId = `${id}-open`;
  const along = axis === "x" ? cx : cz;
  const hingeAt = along + hinge * (w / 2);
  const pivot: Vec3 = axis === "x" ? [hingeAt, 0, cz] : [cx, 0, hingeAt];
  const rot = axis === "x" ? 0 : Math.PI / 2;
  const interact = { behavior: { type: "toggleState" as const, stateId, label: "door" } };
  const part = (key: string, dAlong: number, y: number, dAcross: number, size: Vec3, color: string, solid: boolean, metal = false) => {
    const pos: Vec3 = axis === "x" ? [cx + dAlong, y, cz + dAcross] : [cx + dAcross, y, cz + dAlong];
    L.box({
      id: `${id}-${key}`,
      name: "Door",
      at: pos,
      size,
      color,
      roughness: metal ? 0.3 : 0.7,
      metalness: metal ? 0.85 : 0,
      rotationY: rot,
      isSolid: solid,
      castShadow: false,
      interact,
      pose: { stateId, open: { position: pos, rotation: [0, rot, 0] }, duration: 0.9, spin: { pivot, angle: swing * (Math.PI / 2) }, unblocksWhenOpen: solid },
    });
  };
  part("leaf", 0, DOOR_H / 2, 0, [w, DOOR_H - 0.02, 0.06], WOOD, true);
  for (const s of [-1, 1]) {
    part(`panel-t${s}`, 0, 1.62, s * 0.034, [w - 0.36, 0.8, 0.012], DARK, false);
    part(`panel-b${s}`, 0, 0.62, s * 0.034, [w - 0.36, 0.8, 0.012], DARK, false);
    part(`knob${s}`, -hinge * (w / 2 - 0.12), 1.0, s * 0.06, [0.06, 0.06, 0.06], "#9a7a3a", false, true);
  }
  return stateId;
}

/** A dark sash window with moonlight behind it, set into an outside wall. `rotY` faces it into the room. */
function moonWindow(L: LevelBuilder, id: string, at: Vec3, rotY: number) {
  const [x, y, z] = at;
  const off = (d: number): Vec3 => [x + Math.sin(rotY) * d, y, z + Math.cos(rotY) * d];
  L.box({ id: `${id}-pane`, name: "Window", at: off(0), size: [1.0, 1.4, 0.02], color: "#0c111b", emissive: "#3e5576", emissiveIntensity: 0.45, roughness: 0.1, rotationY: rotY, castShadow: false });
  const bar = (key: string, dx: number, dy: number, size: Vec3) => {
    const p = off(0.02);
    L.box({ id: `${id}-${key}`, name: "Window", at: [p[0] + Math.cos(rotY) * dx, y + dy, p[2] - Math.sin(rotY) * dx], size, color: TRIM, roughness: 0.7, rotationY: rotY, castShadow: false });
  };
  bar("frame-t", 0, 0.72, [1.12, 0.07, 0.06]);
  bar("frame-b", 0, -0.72, [1.12, 0.07, 0.06]);
  bar("frame-l", -0.53, 0, [0.07, 1.5, 0.06]);
  bar("frame-r", 0.53, 0, [0.07, 1.5, 0.06]);
  bar("mullion", 0, 0, [0.04, 1.4, 0.04]);
  bar("transom", 0, 0.05, [1.0, 0.04, 0.04]);
  const sill = off(0.08);
  L.box({ id: `${id}-sill`, name: "Window sill", at: [sill[0], y - 0.78, sill[2]], size: [1.25, 0.05, 0.18], color: TRIM, rotationY: rotY, castShadow: false });
  // Cold light falling in. Not on the house circuit: it stays when the power goes.
  const glow = off(1.0);
  L.pointLight({ id: `${id}-light`, at: [glow[0], y + 0.2, glow[2]], color: "#7f9ad0", intensity: 1.3, distance: 7 });
}

/** A plain wooden chair. `rotY` 0 faces +z (the back is on the -z side). */
function chair(L: LevelBuilder, id: string, x: number, z: number, rotY: number, color = WOOD, solid = true) {
  const c = Math.cos(rotY);
  const s = Math.sin(rotY);
  const at = (lx: number, y: number, lz: number): Vec3 => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  L.box({ id: `${id}-seat`, name: "Chair", at: at(0, 0.44, 0), size: [0.46, 0.05, 0.44], color, roughness: 0.7, rotationY: rotY, isSolid: solid });
  L.box({ id: `${id}-back`, name: "Chair", at: at(0, 0.78, -0.2), size: [0.46, 0.62, 0.04], color, roughness: 0.7, rotationY: rotY, isSolid: solid });
  for (const [i, [lx, lz]] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].entries()) {
    L.box({ id: `${id}-leg${i}`, name: "Chair", at: at(lx, 0.21, lz), size: [0.04, 0.42, 0.04], color: DARK, rotationY: rotY });
  }
}

/** A child-sized doll sitting on something whose top is at `seatY`. */
function seatedDoll(L: LevelBuilder, id: string, x: number, seatY: number, z: number, rotY: number, scale: number, pose: "sit" | "slump" = "sit") {
  L.doll({ id, role: "still", pose, scale, at: [x, seatY - 0.47 * scale, z], rotationY: rotY });
}

// ---- Rooms -------------------------------------------------------------------------

function buildShell(L: LevelBuilder) {
  L.box({ id: "floor", name: "Floor", at: [0, -0.05, 0], size: [24.4, 0.1, 18.4], color: "#3a2a1d", roughness: 0.72, isSolid: true, castShadow: false });
  L.box({ id: "ceiling", name: "Ceiling", at: [0, H + 0.05, 0], size: [24.4, 0.1, 18.4], color: "#1c1814", roughness: 1, castShadow: false });
  // Floorboards: dark seams every 20 cm, running east-west.
  for (let i = 0; i < 90; i++) {
    const z = -9 + i * 0.2;
    L.box({ id: `board-${i}`, name: "Floor", at: [0, 0.002, z], size: [24, 0.004, 0.012], color: "#1e140c", roughness: 1, castShadow: false, receiveShadow: true });
  }

  // Outside walls.
  wall(L, "w-work-w", "z", -12, -4, 4);
  wall(L, "w-work-n", "x", -4, -12, -6);
  wall(L, "w-work-s", "x", 4, -12, -6);
  wall(L, "w-north", "x", -9, -6, 8);
  wall(L, "w-south", "x", 9, -6, 8);
  wall(L, "w-dining-e", "z", 8, -9, -1, [{ at: -3, w: DOOR_W }]);
  wall(L, "w-study-e", "z", 8, 1, 9, [{ at: 3, w: DOOR_W }]);
  wall(L, "w-foyer-n", "x", -5, 8, 12);
  wall(L, "w-foyer-s", "x", 5, 8, 12, [{ at: 10, w: 1.3 }]);
  wall(L, "w-foyer-e", "z", 12, -5, 5);
  // The workshop's east wall runs on north and south as the nursery's and parlour's west walls.
  wall(L, "w-west", "z", -6, -9, 9, [{ at: 0, w: DOOR_W }]);
  // The hallway, and the walls between rooms.
  wall(L, "w-hall-n", "x", -1, -6, 8, [{ at: -2.5, w: DOOR_W }, { at: 4.5, w: DOOR_W }]);
  wall(L, "w-hall-s", "x", 1, -6, 8, [{ at: -2, w: DOOR_W }, { at: 5.5, w: DOOR_W }]);
  wall(L, "w-nursery-dining", "z", 1, -9, -1, [{ at: -5, w: 1.5, arch: true }]);
  wall(L, "w-parlour-study", "z", 3, 1, 9, [{ at: 6, w: 1.5, arch: true }]);

  door(L, "workshop-door", "z", -6, 0, -1, -1);
  door(L, "nursery-door", "x", -2.5, -1, -1, 1);
  door(L, "dining-door", "x", 4.5, -1, -1, 1);
  door(L, "parlour-door", "x", -2, 1, -1, -1);
  door(L, "study-door", "x", 5.5, 1, -1, -1);
  door(L, "dining-foyer-door", "z", 8, -3, 1, 1);
  door(L, "study-foyer-door", "z", 8, 3, -1, -1);

  L.ambient({ color: "#1e2130", intensity: 0.1 });
}

function buildWorkshop(L: LevelBuilder) {
  L.bulb({ id: "work-bulb", at: [-9, H, 0.4], drop: 0.75, intensity: 8.5, distance: 9, castShadow: true });
  L.box({ id: "work-rug", name: "Rug", at: [-8.6, 0.01, 0.6], size: [2.6, 0.02, 3.4], color: "#3a2626", roughness: 1, castShadow: false });

  // The workbench along the west wall, with what's left of his work on it.
  const bx = -11.25;
  L.table({ id: "bench", at: [bx, 0, 0.2], top: [2.6, 0.08, 0.95], rotationY: Math.PI / 2, topColor: "#4a3220", legColor: DARK });
  const top = 0.83;
  L.readable({
    id: "bench-note",
    name: "Note",
    at: [bx + 0.12, top + 0.006, 0.55],
    size: [0.24, 0.012, 0.32],
    rotationY: 0.25,
    text:
      "If you're reading this, she knows you're in the house.\n\n" +
      "Clementine was the last doll I made, and the best. She will not move while she is being watched. Not a hair. So watch her. The moment you look away, or blink, or the lights fail, she comes for you.\n\n" +
      "She sleeps until the workshop door is opened.\n\n" +
      "The front door is chained. I chalked the numbers of the lock on four slates, one in each room off the hall, marked I to IV. Read them in that order.\n\n" +
      "Shut doors slow her. She opens them, but it takes her a moment, and you'll hear it.",
  });
  L.candle({ id: "bench-candle", at: [bx - 0.2, top, -0.75], intensity: 1.3, distance: 5 });
  L.pickup({ id: "lantern", at: [bx + 0.1, top, 1.15], itemId: "lantern", label: "Oil lamp", icon: "🏮", mesh: "lantern", rotationY: 0.5 });
  L.readable({
    id: "lamp-tag",
    name: "Tag",
    at: [bx + 0.3, top + 0.004, 1.3],
    size: [0.1, 0.006, 0.06],
    rotationY: -0.3,
    color: "#c9b48a",
    text: "Keep the lamp lit. When the lights go, it's the only way to keep her in sight. And only if she's near.",
  });
  // A half-finished doll: a bare porcelain head, an arm, a hand, tools.
  L.sphere({ id: "bench-head", name: "Doll's head", at: [bx - 0.15, top + 0.09, 0.05], size: [0.17, 0.17, 0.17], color: "#ece4da", roughness: 0.3 });
  L.sphere({ id: "bench-head-hole", name: "Doll's head", at: [bx - 0.06, top + 0.11, 0.05], size: [0.05, 0.05, 0.05], color: "#110b08", roughness: 0.9 });
  L.cylinder({ id: "bench-arm", name: "Doll's arm", at: [bx + 0.05, top + 0.03, -0.35], size: [0.05, 0.38, 0.05], color: "#e6ded3", roughness: 0.3, rotationY: 0.4 }).transform.rotation = [Math.PI / 2, 0.4, 0];
  L.sphere({ id: "bench-joint", name: "Doll's arm", at: [bx + 0.02, top + 0.03, -0.55], size: [0.06, 0.06, 0.06], color: "#d8cfc3", roughness: 0.3 });
  L.box({ id: "bench-chisel", name: "Tools", at: [bx + 0.25, top + 0.01, -0.1], size: [0.02, 0.02, 0.22], color: "#6a6a6a", metalness: 0.8, roughness: 0.4, rotationY: 0.2 });
  L.box({ id: "bench-mallet", name: "Tools", at: [bx + 0.2, top + 0.035, -1.05], size: [0.08, 0.07, 0.16], color: "#5a3a22", rotationY: -0.4 });
  L.box({ id: "bench-cloth", name: "Cloth", at: [bx - 0.1, top + 0.005, -1.0], size: [0.4, 0.01, 0.3], color: "#7f5559", roughness: 1, rotationY: 0.3 });

  // Shelves on the north wall with little dolls sitting along them, legs out.
  const sz = -3.72;
  for (const [i, y] of [0.9, 1.5, 2.1].entries()) {
    L.box({ id: `work-shelf-${i}`, name: "Shelf", at: [-9, y, sz], size: [3.6, 0.04, 0.4], color: WOOD, roughness: 0.7 });
  }
  for (const s of [-1, 1]) L.box({ id: `work-shelf-side${s}`, name: "Shelf", at: [-9 + s * 1.8, 1.25, sz], size: [0.05, 2.5, 0.4], color: DARK, isSolid: true });
  L.doll({ id: "shelf-doll-a", role: "still", pose: "sitFloor", scale: 0.32, at: [-10.1, 1.5 + 0.02, sz + 0.02], rotationY: 0 });
  L.doll({ id: "shelf-doll-b", role: "still", pose: "sitFloor", scale: 0.3, at: [-8.3, 2.1 + 0.02, sz + 0.02], rotationY: 0.2 });
  // Heads waiting for bodies.
  for (const [i, x] of [-10.4, -9.9, -9.4, -8.8, -8.2, -7.6].entries()) {
    L.sphere({ id: `work-shelf-head-${i}`, name: "Doll's head", at: [x, 0.98, sz + 0.02], size: [0.14, 0.15, 0.14], color: i % 3 ? "#e9e1d6" : "#d8cfc2", roughness: 0.3 });
  }
  // Marionettes hung from a rod across the south side of the room, on their strings.
  L.cylinder({ id: "work-rod", name: "Rod", at: [-9, 2.45, 3.55], size: [0.04, 3.6, 0.04], color: DARK, metalness: 0.4 }).transform.rotation = [0, 0, Math.PI / 2];
  for (const [i, x] of [-10.2, -9.2, -8.2].entries()) {
    const sc = 0.3;
    L.doll({ id: `marionette-${i}`, role: "still", pose: "stand", scale: sc, at: [x, 1.25, 3.55], rotationY: Math.PI + (i - 1) * 0.3 });
    for (const [k, dx] of [-0.14, 0, 0.14].entries()) {
      const y0 = 1.25 + (k === 1 ? 1.75 : 1.2) * sc;
      L.cylinder({ id: `marionette-${i}-string-${k}`, name: "String", at: [x + dx * sc * 2, (y0 + 2.45) / 2, 3.55], size: [0.004, 2.45 - y0, 0.004], color: "#bfb6a0", castShadow: false });
    }
  }
  chair(L, "work-chair", -10.3, 1.6, -Math.PI / 2);
}

function buildHallway(L: LevelBuilder) {
  L.bulb({ id: "hall-bulb-a", at: [-3.5, H, 0], drop: 0.55, intensity: 6.8, distance: 8, castShadow: true });
  L.bulb({ id: "hall-bulb-b", at: [1.5, H, 0], drop: 0.55, intensity: 6.1, distance: 8, flicker: { amount: 0.45, speed: 5 } });
  L.bulb({ id: "hall-bulb-c", at: [6.3, H, 0], drop: 0.55, intensity: 6.5, distance: 8 });
  L.box({ id: "hall-runner", name: "Rug", at: [1, 0.01, 0], size: [12.5, 0.02, 0.9], color: "#4a1e1e", roughness: 1, castShadow: false });
  L.box({ id: "hall-runner-border", name: "Rug", at: [1, 0.006, 0], size: [12.7, 0.012, 1.05], color: "#2a1210", roughness: 1, castShadow: false });
  // Dark portraits along the walls: dolls, all of them.
  for (const [i, [x, side]] of ([[-4.2, -1], [0.2, 1], [2.6, -1], [7.0, 1]] as const).entries()) {
    const z = side * 0.88;
    const rot = side < 0 ? 0 : Math.PI;
    L.box({ id: `hall-frame-${i}`, name: "Portrait", at: [x, 1.75, z], size: [0.62, 0.8, 0.04], color: "#5a4322", metalness: 0.5, roughness: 0.45, rotationY: rot, castShadow: false });
    L.box({ id: `hall-canvas-${i}`, name: "Portrait", at: [x, 1.75, z - side * 0.022], size: [0.5, 0.68, 0.01], color: "#2a2420", roughness: 0.8, rotationY: rot, castShadow: false });
    L.sphere({ id: `hall-face-${i}`, name: "Portrait", at: [x, 1.86, z - side * 0.03], size: [0.16, 0.16, 0.16], color: "#b8b0a4", roughness: 0.8, castShadow: false }).transform.scale = [1, 1.25, 0.08];
    L.box({ id: `hall-dress-${i}`, name: "Portrait", at: [x, 1.6, z - side * 0.03], size: [0.3, 0.26, 0.01], color: "#4a2e30", roughness: 0.9, castShadow: false });
  }
  // A narrow table with a vase of dead flowers.
  L.table({ id: "hall-table", at: [-1, 0, -0.68], top: [0.9, 0.05, 0.3], legHeight: 0.8 });
  L.cylinder({ id: "hall-vase", name: "Vase", at: [-1, 0.95, -0.68], size: [0.1, 0.22, 0.1], color: "#3a4a52", roughness: 0.35 });
  for (let i = 0; i < 4; i++) {
    L.cylinder({ id: `hall-stem-${i}`, name: "Dead flowers", at: [-1 + (i - 1.5) * 0.02, 1.15, -0.68 + ((i % 2) - 0.5) * 0.02], size: [0.006, 0.25, 0.006], color: "#4a3a1e", castShadow: false });
    L.sphere({ id: `hall-bloom-${i}`, name: "Dead flowers", at: [-1 + (i - 1.5) * 0.03, 1.28 + (i % 2) * 0.03, -0.68 + ((i % 2) - 0.5) * 0.03], size: [0.05, 0.04, 0.05], color: "#4a2a20", castShadow: false });
  }
}

function buildNursery(L: LevelBuilder) {
  L.bulb({ id: "nursery-bulb", at: [-2.5, H, -6.3], drop: 0.6, intensity: 6.5, distance: 8 });
  moonWindow(L, "nursery-window", [-5.89, 1.65, -6.8], Math.PI / 2);
  L.box({ id: "nursery-rug", name: "Rug", at: [-2.5, 0.01, -5], size: [3, 0.02, 2.4], color: "#566a7a", roughness: 1, castShadow: false });
  // A cot with bars, against the east wall.
  const cx = 0.25;
  const cz = -6.5;
  L.box({ id: "cot-base", name: "Cot", at: [cx, 0.42, cz], size: [0.75, 0.06, 1.35], color: "#d8d0c0", roughness: 0.7, isSolid: true });
  L.box({ id: "cot-mattress", name: "Cot", at: [cx, 0.5, cz], size: [0.68, 0.1, 1.28], color: "#a9b4bd", roughness: 1 });
  for (const s of [-1, 1]) {
    L.box({ id: `cot-end${s}`, name: "Cot", at: [cx, 0.55, cz + s * 0.66], size: [0.78, 1.1, 0.05], color: "#d8d0c0", roughness: 0.7, isSolid: true });
    L.box({ id: `cot-rail${s}`, name: "Cot", at: [cx + s * 0.36, 0.98, cz], size: [0.04, 0.04, 1.32], color: "#d8d0c0", roughness: 0.7 });
    for (let k = 0; k < 9; k++) L.box({ id: `cot-bar${s}-${k}`, name: "Cot", at: [cx + s * 0.36, 0.73, cz - 0.56 + k * 0.14], size: [0.025, 0.5, 0.025], color: "#d8d0c0", roughness: 0.7, castShadow: false });
  }
  // A mobile turning over it.
  L.cylinder({ id: "mobile-rod", name: "Mobile", at: [cx, 2.3, cz], size: [0.01, 1.4, 0.01], color: "#2a2018", castShadow: false });
  for (const [i, a] of [0, 1.6, 3.2, 4.8].entries()) {
    L.sphere({ id: `mobile-${i}`, name: "Mobile", at: [cx + Math.cos(a) * 0.22, 1.55 - (i % 2) * 0.08, cz + Math.sin(a) * 0.22], size: [0.07, 0.07, 0.07], color: ["#c9a14a", "#8a3a3a", "#5a7a9a", "#e8e0cc"][i], roughness: 0.6, castShadow: false });
  }
  // A rocking chair with a doll in it, turned towards the door.
  const rx = -4.4;
  const rz = -3.2;
  const rot = Math.PI * 0.8;
  chair(L, "rocker", rx, rz, rot, "#5a3a24");
  for (const s of [-1, 1]) {
    const lx = s * 0.22;
    L.box({ id: `rocker-runner${s}`, name: "Chair", at: [rx + lx * Math.cos(rot), 0.03, rz - lx * Math.sin(rot)], size: [0.04, 0.05, 0.85], color: DARK, rotationY: rot });
  }
  seatedDoll(L, "rocker-doll", rx, 0.465, rz, rot, 0.48, "slump");
  // Wooden blocks spilt on the rug.
  const rnd = mulberry32(7);
  for (let i = 0; i < 9; i++) {
    const col = ["#a83a2a", "#2a5a8a", "#c9a14a", "#3a7a4a"][i % 4];
    L.box({ id: `block-${i}`, name: "Toy blocks", at: [-2.8 + rnd() * 1.4, 0.04 + (i === 4 ? 0.08 : 0), -4.3 + rnd() * 1.0], size: [0.08, 0.08, 0.08], color: col, roughness: 0.8, rotationY: rnd() * 3, castShadow: false });
  }
  // A wardrobe in the north-west corner.
  L.box({ id: "nursery-wardrobe", name: "Wardrobe", at: [-5.25, 1.1, -8.5], size: [1.1, 2.2, 0.6], color: "#4a3020", roughness: 0.7, isSolid: true });
  L.box({ id: "nursery-wardrobe-seam", name: "Wardrobe", at: [-5.25, 1.1, -8.19], size: [0.01, 2.0, 0.01], color: "#120a06", castShadow: false });
}

function buildDining(L: LevelBuilder) {
  L.bulb({ id: "dining-bulb", at: [4.0, H, -6.3], drop: 0.7, intensity: 6.8, distance: 8, castShadow: true });
  L.box({ id: "dining-rug", name: "Rug", at: [4.5, 0.01, -5.4], size: [4.4, 0.02, 2.8], color: "#3d2a3a", roughness: 1, castShadow: false });
  // A long table laid for a tea party that never ended.
  const tz = -5.4;
  L.table({ id: "dining-table", at: [4.5, 0, tz], top: [3.0, 0.08, 1.1], cloth: "#d8d0bc", clothSpin: 0 });
  const top = 0.842;
  const seats: Array<[number, number, number, boolean]> = [
    [3.3, tz - 0.85, 0, true],
    [4.5, tz - 0.85, 0, false],
    [5.7, tz - 0.85, 0, true],
    [3.3, tz + 0.85, Math.PI, false],
    [4.5, tz + 0.85, Math.PI, true],
    [5.7, tz + 0.85, Math.PI, false],
  ];
  for (const [i, [x, z, rot, guest]] of seats.entries()) {
    chair(L, `dining-chair-${i}`, x, z, rot);
    if (guest) seatedDoll(L, `tea-doll-${i}`, x, 0.465, z, rot, 0.62);
    const pz = z + (rot === 0 ? 0.42 : -0.42);
    L.cylinder({ id: `plate-${i}`, name: "Plate", at: [x, top + 0.008, pz], size: [0.22, 0.014, 0.22], color: "#e8e2d4", roughness: 0.3, castShadow: false });
    L.cylinder({ id: `cup-${i}`, name: "Teacup", at: [x + 0.16, top + 0.035, pz], size: [0.07, 0.06, 0.07], color: "#e8e2d4", roughness: 0.3, castShadow: false });
  }
  L.cylinder({ id: "teapot", name: "Teapot", at: [4.5, top + 0.1, tz], size: [0.2, 0.2, 0.2], color: "#d0c8b6", roughness: 0.3 });
  L.sphere({ id: "teapot-lid", name: "Teapot", at: [4.5, top + 0.2, tz], size: [0.12, 0.12, 0.12], color: "#d0c8b6", roughness: 0.3 }).transform.scale = [1, 0.5, 1];
  // A candelabrum at each end, burning low. Not on the circuit.
  for (const [i, x] of [3.05, 5.95].entries()) {
    L.cylinder({ id: `candelabrum-${i}`, name: "Candelabrum", at: [x, top + 0.13, tz], size: [0.03, 0.26, 0.03], color: "#8a7040", metalness: 0.8, roughness: 0.35 });
    L.candle({ id: `dining-candle-${i}`, at: [x, top + 0.26, tz], height: 0.1, intensity: 0.9, distance: 4.5 });
  }
  // A sideboard against the north wall.
  L.box({ id: "sideboard", name: "Sideboard", at: [6.4, 0.5, -8.6], size: [2.0, 1.0, 0.5], color: "#3a2618", roughness: 0.65, isSolid: true });
  L.box({ id: "sideboard-top", name: "Sideboard", at: [6.4, 1.02, -8.58], size: [2.1, 0.04, 0.56], color: DARK, roughness: 0.5 });
}

function buildParlour(L: LevelBuilder) {
  L.bulb({ id: "parlour-bulb", at: [-1.8, H, 6.2], drop: 0.6, intensity: 6.1, distance: 8 });
  moonWindow(L, "parlour-window", [-5.89, 1.65, 6.6], Math.PI / 2);
  L.box({ id: "parlour-rug", name: "Rug", at: [-1.6, 0.01, 5.6], size: [3.6, 0.02, 2.6], color: "#5a2a22", roughness: 1, castShadow: false });
  // Fireplace in the south wall, its fire nearly out.
  const fx = -2;
  const fz = 8.9;
  const STONE = "#4f4a44";
  L.box({ id: "fire-jamb-l", name: "Fireplace", at: [fx - 0.85, 0.65, fz - 0.3], size: [0.4, 1.3, 0.6], color: STONE, roughness: 1, isSolid: true });
  L.box({ id: "fire-jamb-r", name: "Fireplace", at: [fx + 0.85, 0.65, fz - 0.3], size: [0.4, 1.3, 0.6], color: STONE, roughness: 1, isSolid: true });
  L.box({ id: "fire-lintel", name: "Fireplace", at: [fx, 1.2, fz - 0.3], size: [2.1, 0.2, 0.6], color: STONE, roughness: 1, isSolid: true });
  L.box({ id: "fire-mantel", name: "Fireplace", at: [fx, 1.34, fz - 0.36], size: [2.4, 0.08, 0.72], color: DARK, roughness: 0.6, isSolid: true });
  L.box({ id: "fire-back", name: "Fireplace", at: [fx, 0.55, fz - 0.05], size: [1.3, 1.1, 0.05], color: "#0b0908", roughness: 1 });
  L.box({ id: "fire-embers", name: "Fireplace", at: [fx, 0.05, fz - 0.3], size: [1.0, 0.05, 0.4], color: "#7a1e06", emissive: "#ff4a10", emissiveIntensity: 1.2, castShadow: false });
  L.flame({ id: "fire-flame-a", at: [fx - 0.15, 0.2, fz - 0.3], size: 0.1, seed: 4 });
  L.flame({ id: "fire-flame-b", at: [fx + 0.2, 0.17, fz - 0.28], size: 0.08, seed: 5 });
  L.pointLight({ id: "fire-light", at: [fx, 0.7, fz - 0.9], color: "#ff7a30", intensity: 3.5, distance: 9, flicker: { amount: 0.4, speed: 8 } });
  // Two armchairs facing the fire, and a sofa with a doll lolling on it.
  const armchair = (id: string, x: number, z: number, rot: number, color: string) => {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const at = (lx: number, y: number, lz: number): Vec3 => [x + lx * c + lz * s, y, z - lx * s + lz * c];
    L.box({ id: `${id}-seat`, name: "Armchair", at: at(0, 0.28, 0), size: [0.85, 0.36, 0.8], color, roughness: 0.9, rotationY: rot, isSolid: true });
    L.box({ id: `${id}-back`, name: "Armchair", at: at(0, 0.75, -0.34), size: [0.85, 0.95, 0.18], color, roughness: 0.9, rotationY: rot, isSolid: true });
    for (const sx of [-1, 1]) L.box({ id: `${id}-arm${sx}`, name: "Armchair", at: at(sx * 0.4, 0.55, 0), size: [0.14, 0.26, 0.8], color, roughness: 0.9, rotationY: rot });
  };
  armchair("parlour-chair-a", -3.2, 6.3, 0.45, "#2f4a3a");
  armchair("parlour-chair-b", -0.8, 6.3, -0.45, "#2f4a3a");
  // Sofa against the north wall, its back to the hall, clear of the door.
  L.box({ id: "sofa-seat", name: "Sofa", at: [1.2, 0.26, 1.65], size: [2.2, 0.34, 0.8], color: "#5a3236", roughness: 0.9, isSolid: true });
  L.box({ id: "sofa-back", name: "Sofa", at: [1.2, 0.72, 1.3], size: [2.2, 0.62, 0.16], color: "#5a3236", roughness: 0.9, isSolid: true });
  seatedDoll(L, "sofa-doll", 1.8, 0.43, 1.75, 0, 0.52, "slump");
  // An upright piano against the west wall.
  L.box({ id: "piano", name: "Piano", at: [-5.55, 0.65, 3.6], size: [0.6, 1.3, 1.5], color: "#140d0a", roughness: 0.25, isSolid: true });
  L.box({ id: "piano-keys", name: "Piano", at: [-5.18, 0.74, 3.6], size: [0.18, 0.04, 1.3], color: "#e6e0d0", roughness: 0.3, castShadow: false });
}

function buildStudy(L: LevelBuilder) {
  L.bulb({ id: "study-bulb", at: [5.3, H, 6.4], drop: 0.6, intensity: 6.1, distance: 8 });
  L.box({ id: "study-rug", name: "Rug", at: [5.5, 0.01, 5.2], size: [2.6, 0.02, 2.2], color: "#3a3424", roughness: 1, castShadow: false });
  // His desk, and the diary he kept.
  L.table({ id: "study-desk", at: [6.9, 0, 6.6], top: [0.8, 0.07, 1.5], topColor: "#3a2414", legColor: DARK });
  chair(L, "study-chair", 6.35, 6.6, -Math.PI / 2);
  L.candle({ id: "study-candle", at: [7.05, 0.82, 7.15], intensity: 0.9, distance: 4.5 });
  L.readable({
    id: "study-diary",
    name: "Diary",
    at: [6.85, 0.83, 6.4],
    size: [0.26, 0.04, 0.34],
    rotationY: 0.15,
    color: "#5a2a22",
    text:
      "October 2nd. I finished her today. Glass eyes from Lauscha, hair from my own daughter's ribbons. She's perfect.\n\n" +
      "October 9th. I keep finding her in rooms I didn't put her in. I tell myself I'm tired.\n\n" +
      "October 14th. I watched her all night. She never moved. Then the lamp guttered and when it caught again she was at the foot of my bed.\n\n" +
      "October 15th. You cannot watch a thing forever. Sooner or later your eyes close. That is all she's waiting for.",
  });
  // A bookshelf on the east wall, between the foyer door and the desk.
  L.box({ id: "study-shelf", name: "Bookshelf", at: [7.7, 1.1, 4.95], size: [0.4, 2.2, 1.3], color: DARK, roughness: 0.7, isSolid: true });
  const rnd = mulberry32(31);
  const COLORS = ["#5a2323", "#2d4a3a", "#2f3a5a", "#6a5a2a", "#3a2a4a"];
  for (const [r, y] of [0.25, 0.75, 1.25, 1.75].entries()) {
    let z = 4.35;
    for (let i = 0; z < 5.5; i++) {
      const w = 0.04 + rnd() * 0.05;
      const h = 0.22 + rnd() * 0.14;
      if (rnd() > 0.15) L.box({ id: `study-book-${r}-${i}`, name: "Books", at: [7.47, y + h / 2, z + w / 2], size: [0.06, h, w], color: COLORS[Math.floor(rnd() * COLORS.length)], castShadow: false });
      z += w + 0.006;
    }
  }
  // A dress form in the corner, wearing a half-made copy of her dress.
  L.cylinder({ id: "dress-form-stand", name: "Dress form", at: [3.7, 0.55, 8.4], size: [0.04, 1.1, 0.04], color: DARK });
  L.cylinder({ id: "dress-form-body", name: "Dress form", at: [3.7, 1.35, 8.4], size: [0.32, 0.6, 0.32], color: "#7f5559", roughness: 0.9 });
  L.sphere({ id: "dress-form-top", name: "Dress form", at: [3.7, 1.65, 8.4], size: [0.32, 0.32, 0.32], color: "#7f5559", roughness: 0.9 }).transform.scale = [1, 0.4, 1];
}

function buildFoyer(L: LevelBuilder, code: string) {
  L.bulb({ id: "foyer-bulb", at: [10.4, H, 0], drop: 0.7, intensity: 8.0, distance: 9, castShadow: true });
  L.box({ id: "foyer-rug", name: "Rug", at: [10, 0.01, 0], size: [3, 0.02, 4.6], color: "#2c3a2c", roughness: 1, castShadow: false });
  // Her chair, by the door, facing down the hall. Not solid: she has to get out of it.
  const cx = 10.9;
  const c = (dx: number): number => cx + dx;
  L.box({ id: "her-chair-seat", name: "Armchair", at: [c(0), 0.24, 0], size: [0.8, 0.4, 0.85], color: "#5a1e24", roughness: 0.9 });
  L.box({ id: "her-chair-back", name: "Armchair", at: [c(0.36), 0.8, 0], size: [0.16, 1.15, 0.85], color: "#5a1e24", roughness: 0.9 });
  for (const s of [-1, 1]) L.box({ id: `her-chair-arm${s}`, name: "Armchair", at: [c(0), 0.55, s * 0.4], size: [0.8, 0.26, 0.14], color: "#4a161c", roughness: 0.9 });
  // A grandfather clock, stopped, and a coat stand.
  L.box({ id: "clock-case", name: "Clock", at: [11.65, 1.05, -3.2], size: [0.45, 2.1, 0.55], color: "#2e1c10", roughness: 0.55, isSolid: true });
  L.cylinder({ id: "clock-face", name: "Clock", at: [11.42, 1.75, -3.2], size: [0.32, 0.02, 0.32], color: "#e6dcc4", roughness: 0.6 }).transform.rotation = [0, 0, Math.PI / 2];
  L.cylinder({ id: "coat-stand", name: "Coat stand", at: [8.6, 0.9, -4.5], size: [0.05, 1.8, 0.05], color: DARK, isSolid: true });
  L.sphere({ id: "coat", name: "Coat", at: [8.6, 1.35, -4.5], size: [0.4, 0.4, 0.4], color: "#1e1e22", roughness: 1 }).transform.scale = [1, 1.9, 0.75];
  // The front door: chained, with a four-dial padlock.
  L.keyedDoor({
    id: "front-door",
    at: [10, 0, 5],
    size: [1.1, 2.3],
    code,
    color: "#2a1a12",
    frameColor: "#4a3a26",
    handleSide: "north",
  });
  // Chains across it.
  for (const [i, y] of [1.2, 1.6].entries()) {
    L.box({ id: `front-chain-${i}`, name: "Chain", at: [10, y, 4.9], size: [1.2, 0.03, 0.03], color: "#5a5a5a", metalness: 0.9, roughness: 0.4, castShadow: false }).transform.rotation = [0, 0, (i ? -1 : 1) * 0.12];
  }
  L.readable({
    id: "door-note",
    name: "Note",
    at: [10.75, 1.5, 4.88],
    size: [0.18, 0.24, 0.01],
    color: "#d8caa6",
    text: "Four numbers. I, II, III, IV.\n\nDon't stand here turning the dials with her behind you.",
  });
  // Moonlight through the fanlight over the door. Not on the circuit.
  L.box({ id: "fanlight", name: "Window", at: [10, 2.62, 4.89], size: [1.0, 0.36, 0.02], color: "#0c111b", emissive: "#2a3a52", emissiveIntensity: 0.45, castShadow: false });
  // A candle on a little table by the door, so the dials can be read even when the power's gone.
  L.table({ id: "door-table", at: [11.3, 0, 4.45], top: [0.5, 0.05, 0.5], legHeight: 0.85, topColor: "#3a2414", legColor: DARK });
  L.candle({ id: "door-candle", at: [11.3, 0.9, 4.45], height: 0.18, intensity: 2.2, distance: 5 });
  L.pointLight({ id: "fanlight-light", at: [10, 2.2, 3.9], color: "#8aa2d0", intensity: 3, distance: 7 });
}

// ---- The slates ---------------------------------------------------------------------

const NUMERALS = ["I", "II", "III", "IV"];
// One in each room, on the wall you face coming in through its door from the hall.
const SLATE_SPOTS: Array<{ room: string; at: Vec3; rotY: number }> = [
  { room: "nursery", at: [-2.5, 1.65, -8.88], rotY: 0 },
  { room: "dining", at: [3.4, 1.7, -8.88], rotY: 0 },
  { room: "parlour", at: [-2, 2.05, 8.88], rotY: Math.PI },
  { room: "study", at: [5.2, 1.65, 8.88], rotY: Math.PI },
];

function makeLevel(seed: number) {
  const dice = mulberry32(seed);
  const digits = NUMERALS.map(() => Math.floor(dice() * 10));
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(dice() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const code = digits.join("");

  return defineLevel({
    id: "level-03",
    name: "Level 03 — The One You Watch",
    tags: ["hard", "scary"],
    background: "#020203",
    // At the workshop door end of the room, facing the bench and its note.
    playerStart: { position: [-8.2, 1.7, 1.2], rotationY: Math.PI / 2 - 0.2 },
    build(L) {
      buildShell(L);
      buildWorkshop(L);
      buildHallway(L);
      buildNursery(L);
      buildDining(L);
      buildParlour(L);
      buildStudy(L);
      buildFoyer(L, code);

      // Numeral k goes in room order[k].
      order.forEach((spot, k) => {
        const s = SLATE_SPOTS[spot];
        const numeral = NUMERALS[k];
        L.box({
          id: `slate-${s.room}`,
          name: "Slate",
          at: s.at,
          size: [0.78, 0.58, 0.03],
          color: "#ffffff",
          roughness: 0.9,
          texture: `chalk:${numeral}:${digits[k]}`,
          rotationY: s.rotY,
          castShadow: false,
          interact: { behavior: { type: "readable", text: `Chalked on the slate: ${numeral}. And under it, large: ${digits[k]}.` } },
        });
      });

      L.doll({
        id: "clementine",
        role: "hunter",
        // Sitting in her chair in the foyer, facing down the hall.
        start: [10.85, 0, -Math.PI / 2],
        wakeFlag: "workshop-door-open",
        bounds: [-12.2, -9.2, 12.2, 9.2],
      });
    },
  });
}

// Each time the level is started it's built afresh: new numbers on new slates.
export const reroll = () => makeLevel(Math.floor(Math.random() * 2 ** 32));
export default makeLevel(3);
