import { defineLevel, type LevelBuilder } from "@/leveldsl";

// Grid legend: # = stone block, . = corridor, S = start, E = exit.
//
// The maze is four copies of one hand-drawn 11×11 block (irregular walls,
// dead-end spurs, loops, broad halls with tables), each turned a quarter-turn
// from its neighbour and joined through the walls they share. That gives a
// 21×21 maze, 42 m square.
// You begin in a furnished study just outside the north-west corner and have to
// open its door to get in. The way out is a locked door on the far south-east
// edge, and its key is hidden in the study. In an alcove in the wall over the
// desk is a carved board with four round hollows, marked for four keepers (eye,
// sun, key, moon). The four matching wooden seals are on tables scattered through
// the maze, one in each quarter. Set all four into the board and it turns round
// on its axle, showing the key hung on its back.

const CELL = 2;
type Side = "north" | "south" | "east" | "west";
type Pt = [number, number];

const BLOCK = [
  "###########",
  "#...#.#...#",
  "#.#.#.#...#",
  "#.....#...#",
  "#.#####.#.#",
  "#...#...#.#",
  "###.#.#.###",
  "#.......#.#",
  "#...#.#.#.#",
  "#.....#...#",
  "###########",
];
const B = BLOCK.length; // 11

// Three tables per block, spread out: one in each of the block's two broad
// halls (bottom-left and top-right), and one in the corridor between them. Each
// is the open cell it stands in and the wall it's pushed flush against.
const BLOCK_TABLES: Array<{ id: string; cell: Pt; wall: Side }> = [
  { id: "hall-sw", cell: [9, 2], wall: "south" }, // bottom-left hall, against the outer wall
  { id: "hall-ne", cell: [1, 8], wall: "north" }, // top-right hall, against the outer wall
  { id: "corridor", cell: [3, 2], wall: "north" }, // upper-left corridor, under the block at (2,2)
];

// ---- Assembling the big maze ---------------------------------------------

const CW: Record<Side, Side> = { north: "east", east: "south", south: "west", west: "north" };
const DIR: Record<Side, Pt> = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] };

const turnPt = ([r, c]: Pt, k: number): Pt => {
  for (let i = 0; i < k; i++) [r, c] = [c, B - 1 - r];
  return [r, c];
};
const turnSide = (s: Side, k: number): Side => {
  for (let i = 0; i < k; i++) s = CW[s];
  return s;
};
const turnGrid = (g: string[], k: number): string[] => {
  for (let i = 0; i < k; i++) {
    const prev = g;
    g = prev.map((_, r) => prev.map((_, c) => prev[B - 1 - c][r]).join(""));
  }
  return g;
};

// North-west block as drawn, north-east a quarter-turn clockwise, and so on.
const QUADRANTS = [
  { k: 0, r0: 0, c0: 0 },
  { k: 1, r0: 0, c0: B - 1 },
  { k: 2, r0: B - 1, c0: B - 1 },
  { k: 3, r0: B - 1, c0: 0 },
];
const N = B * 2 - 1; // 29; the blocks share their border walls

const big: string[][] = Array.from({ length: N }, () => Array<string>(N).fill("#"));
for (const q of QUADRANTS) {
  const g = turnGrid(BLOCK, q.k);
  for (let r = 0; r < B; r++) {
    for (let c = 0; c < B; c++) if (g[r][c] === ".") big[q.r0 + r][q.c0 + c] = ".";
  }
}

const place = (q: (typeof QUADRANTS)[number], p: Pt): Pt => {
  const [r, c] = turnPt(p, q.k);
  return [q.r0 + r, q.c0 + c];
};

// Everything bolted to or leaning on a wall block, so the doorways punched
// through the shared walls below never remove one.
const reserved = new Set<string>();
const key = (r: number, c: number) => `${r},${c}`;

const TABLE_W = 1.2;
const TABLE_D = 0.7;
const tables = QUADRANTS.flatMap((q, qi) =>
  BLOCK_TABLES.map((t) => {
    const cell = place(q, t.cell);
    const wall = turnSide(t.wall, q.k);
    const [dr, dc] = DIR[wall];
    // The wall blocks behind a table that sits between two cells (fractional).
    const rows = dr ? [cell[0] + dr] : [Math.floor(cell[0]), Math.ceil(cell[0])];
    const cols = dc ? [cell[1] + dc] : [Math.floor(cell[1]), Math.ceil(cell[1])];
    for (const r of rows) for (const c of cols) reserved.add(key(r, c));
    return { id: `${t.id}-${qi}`, cell, wall };
  }),
);

// Doorways between blocks: two through each shared wall, spread along it.
const openings = (cells: Pt[], nbrs: (p: Pt) => [Pt, Pt]) => {
  const good = cells.filter((p) => {
    if (reserved.has(key(p[0], p[1]))) return false;
    const [a, b] = nbrs(p);
    return big[a[0]][a[1]] === "." && big[b[0]][b[1]] === ".";
  });
  for (const i of [Math.floor(good.length / 4), Math.floor((good.length * 3) / 4)]) {
    if (good[i]) big[good[i][0]][good[i][1]] = ".";
  }
};
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const m = B - 1; // the shared line, 14
openings(range(1, m - 1).map((r): Pt => [r, m]), ([r, c]) => [[r, c - 1], [r, c + 1]]);
openings(range(m + 1, N - 2).map((r): Pt => [r, m]), ([r, c]) => [[r, c - 1], [r, c + 1]]);
openings(range(1, m - 1).map((c): Pt => [m, c]), ([r, c]) => [[r - 1, c], [r + 1, c]]);
openings(range(m + 1, N - 2).map((c): Pt => [m, c]), ([r, c]) => [[r - 1, c], [r + 1, c]]);

// The start is the north-west corner; the exit is cut into the south edge near
// the south-east corner.
const exitCol = range(N - 9, N - 2).find((c) => big[N - 2][c] === "." && !reserved.has(key(N - 1, c)))!;
big[N - 1][exitCol] = "E";

// The study door is cut into the west wall beside the first cell.
big[1][0] = "D";

const GRID = big.map((row) => row.join(""));

// ---- The monster's patrol ------------------------------------------------------
// She starts in the far south-east, as far from the study as the maze goes, and
// walks a loop through nine spread-out points. She only ever walks the maze's
// own open cells: the study is outside the grid, its door cell isn't walkable,
// and she keeps clear of the few cells just inside it. Tables are no obstacle to
// the route itself; where it passes one she steps round it, off to the open side.
const walkable = (() => {
  const ok = Array.from({ length: N }, () => Array<boolean>(N).fill(false));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) ok[r][c] = big[r][c] === ".";
  // Nothing within three cells of the study door.
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (Math.abs(r - 1) <= 3 && c <= 3) ok[r][c] = false;
  return ok;
})();

// A table is pushed against one wall of its cell (or of the pair of cells it
// straddles), leaving about 0.26 m of floor in front of it before the middle of
// the cell. Walking down the middle would clip it, so in those cells she walks a
// lane shifted this far out from the wall instead.
const TABLE_LANE = 0.36;
const laneShift = new Map<string, [number, number]>();
for (const t of tables) {
  const [dr, dc] = DIR[t.wall];
  for (const r of [Math.floor(t.cell[0]), Math.ceil(t.cell[0])]) {
    for (const c of [Math.floor(t.cell[1]), Math.ceil(t.cell[1])]) laneShift.set(key(r, c), [-dc * TABLE_LANE, -dr * TABLE_LANE]);
  }
}

function bfs(from: Pt): { dist: number[][]; prev: (Pt | null)[][] } {
  const dist = Array.from({ length: N }, () => Array<number>(N).fill(-1));
  const prev: (Pt | null)[][] = Array.from({ length: N }, () => Array<Pt | null>(N).fill(null));
  dist[from[0]][from[1]] = 0;
  const queue: Pt[] = [from];
  for (let h = 0; h < queue.length; h++) {
    const [r, c] = queue[h];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= N || nc >= N || !walkable[nr][nc] || dist[nr][nc] >= 0) continue;
      dist[nr][nc] = dist[r][c] + 1;
      prev[nr][nc] = [r, c];
      queue.push([nr, nc]);
    }
  }
  return { dist, prev };
}

function makePatrol(dice: () => number) {
  // Start: the walkable cell nearest the south-east corner, to know which cells are connected.
  let corner: Pt = [1, 1];
  let best = Infinity;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const d = (r - (N - 2)) ** 2 + (c - (N - 2)) ** 2;
      if (walkable[r][c] && d < best) {
        best = d;
        corner = [r, c];
      }
    }
  }
  const { dist: fromCorner } = bfs(corner);
  const reachable: Pt[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fromCorner[r][c] >= 0) reachable.push([r, c]);
  // She can wake up anywhere in the maze, so long as it's well away from the study door.
  const far = reachable.filter(([r, c]) => Math.abs(r - 1) + c >= Math.floor(N * 0.6));
  const start: Pt = far[Math.floor(dice() * far.length)] ?? corner;

  // Spread nine waypoints out: each next one as far as possible from those chosen.
  const chosen: Pt[] = [start];
  while (chosen.length < 9) {
    let pick = reachable[0];
    let far = -1;
    for (const p of reachable) {
      const d = Math.min(...chosen.map((q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2));
      if (d > far) {
        far = d;
        pick = p;
      }
    }
    chosen.push(pick);
  }
  // Order them as a tour: always on to the nearest one not yet visited.
  const order: Pt[] = [chosen[0]];
  const left = chosen.slice(1);
  while (left.length) {
    const { dist } = bfs(order[order.length - 1]);
    left.sort((a, b) => dist[a[0]][a[1]] - dist[b[0]][b[1]]);
    order.push(left.shift()!);
  }
  // Join them with the shortest walk along corridors, and back to the start.
  const cells: Pt[] = [start];
  const stopAt: number[] = [];
  for (let i = 1; i <= order.length; i++) {
    const to = order[i % order.length];
    const { prev } = bfs(cells[cells.length - 1]);
    const leg: Pt[] = [];
    for (let p: Pt | null = to; p; p = prev[p[0]][p[1]]) leg.push(p);
    leg.reverse();
    cells.push(...leg.slice(1));
    if (i < order.length) stopAt.push(cells.length - 1);
  }
  cells.pop(); // the last cell is the start again; the loop closes by itself
  return { cells, stopAt, start, reachable: reachable.length };
}
const ROWS = GRID.length;
const COLS = GRID[0].length;

// The maze is built about this point rather than the origin, so that its
// north-west corner stays at (−29, −29) whatever its size and the study that
// sits against that corner never has to move.
const MAZE_NW = -29;
const CENTER_X = MAZE_NW + (COLS * CELL) / 2;
const CENTER_Z = MAZE_NW + (ROWS * CELL) / 2;

function cellXZ(row: number, col: number): [number, number] {
  const x = CENTER_X - (COLS * CELL) / 2 + col * CELL + CELL / 2;
  const z = CENTER_Z - (ROWS * CELL) / 2 + row * CELL + CELL / 2;
  return [x, z];
}

const [doorX, doorZ] = cellXZ(1, 0);
const [exitX, exitZ] = cellXZ(N - 1, exitCol);

// ---- The study --------------------------------------------------------------
// A cosy, lamplit room west of the maze: x −37…−29, z −29…−23. Its east wall is
// the maze's own west border (with a plain wooden door cut through it); the
// rest is built here. Warm light comes from a fire, wall sconces and candles.

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

// The four seals: mark, plain name, and the picture on the action bar. They
// stand on tables in the maze, one in each quarter, and fit hollows in the stele.
const SEALS = [
  { mark: "sun", name: "Sun", icon: "☀️", texture: "seal-sun" },
  { mark: "moon", name: "Moon", icon: "🌙", texture: "seal-moon" },
  { mark: "eye", name: "Eye", icon: "👁️", texture: "seal-eye" },
  { mark: "key", name: "Key", icon: "🗝️", texture: "seal-key" },
] as const;

/**
 * A carved board set on a vertical axle in an alcove cut into the north wall,
 * over the desk. Its face has four round hollows, one for each seal. When all
 * four are in, the board turns a half-circle on its axle (everything on it
 * pivots with it) to show a key hung on the back. The alcove is deep enough
 * for the board to swing round in.
 */
function buildStele(L: LevelBuilder) {
  const sx = -33.2;
  const sz = -29.5;
  const y = 1.95;
  const pivot: [number, number, number] = [sx, 0, sz];
  type PoseOpt = Parameters<LevelBuilder["box"]>[0]["pose"];
  // Everything on the board shares this: the half-turn is driven by one flag.
  const turns = (at: [number, number, number], rot: [number, number, number] = [0, 0, 0]): PoseOpt => ({
    stateId: "plaque-spun",
    open: { position: at, rotation: rot },
    duration: 2.8,
    spin: { pivot, angle: Math.PI },
    unblocksWhenOpen: false,
  });
  const DARKWOOD = "#2a1a0e";

  // The alcove: an opening in the wall (see the wall pieces in buildStudy), a
  // box behind it, and the axle the board turns on, top and bottom.
  const alcove = (id: string, x: number, ay: number, z: number, sxs: number, sys: number, szs: number) =>
    L.box({ id: `stele-alcove-${id}`, at: [x, ay, z], size: [sxs, sys, szs], color: "#1a1008", roughness: 0.9, castShadow: false });
  alcove("left", sx - 0.95, y, sz - 0.25, 0.1, 1.5, 1.1);
  alcove("right", sx + 0.95, y, sz - 0.25, 0.1, 1.5, 1.1);
  alcove("top", sx, y + 0.75, sz - 0.25, 2, 0.1, 1.1);
  alcove("bottom", sx, y - 0.75, sz - 0.25, 2, 0.1, 1.1);
  alcove("back", sx, y, sz - 0.85, 2, 1.5, 0.1);
  L.box({ id: "stele-axle-top", at: [sx, y + 0.47, sz], size: [0.05, 0.4, 0.05], color: DARKWOOD, roughness: 0.6, metalness: 0.4, castShadow: false });
  L.box({ id: "stele-axle-bottom", at: [sx, y - 0.47, sz], size: [0.05, 0.4, 0.05], color: DARKWOOD, roughness: 0.6, metalness: 0.4, castShadow: false });
  L.pointLight({ id: "stele-alcove-light", at: [sx, y + 0.5, sz + 0.15], color: "#ffb066", intensity: 2.2, distance: 5 });
  // The board: a dark core, a carved face and a plain back.
  const board = (id: string, name: string, z: number, rotY: number, texture: "plaque" | "plaque-back", appearsWhen?: string) =>
    L.box({
      id,
      name,
      at: [sx, y, z],
      size: [1.2, 0.47, 0.02],
      color: "#ffffff",
      roughness: 0.6,
      metalness: 0.2,
      texture,
      rotationY: rotY,
      castShadow: false,
      pose: turns([sx, y, z], [0, rotY, 0]),
      appearsWhen,
    });
  L.box({ id: "stele-core", name: "Stele", at: [sx, y, sz], size: [1.26, 0.53, 0.06], color: DARKWOOD, roughness: 0.7, pose: turns([sx, y, sz]) });
  board("stele-front", "Stele", sz + 0.04, 0, "plaque");
  board("stele-back", "Stele", sz - 0.04, Math.PI, "plaque-back");

  // Four hollows along the face, left to right, each shaped for one seal.
  const order = ["eye", "sun", "key", "moon"] as const;
  order.forEach((mark, i) => {
    const seal = SEALS.find((x) => x.mark === mark)!;
    const hx = sx + (i - 1.5) * 0.3;
    const flat: [number, number, number] = [Math.PI / 2, 0, 0]; // discs face the room
    const placed = `seal-${mark}-placed`;
    const hollow = L.cylinder({
      id: `stele-hollow-${mark}`,
      name: `${seal.name} hollow`,
      at: [hx, y, sz + 0.057],
      size: [0.2, 0.014, 0.2],
      color: "#ffffff",
      roughness: 0.8,
      texture: `indent-${mark}` as const,
      castShadow: false,
      pose: turns([hx, y, sz + 0.057], flat),
      interact: {
        lock: {
          requires: { kind: "item", itemId: `seal-${mark}`, held: true },
          lockedMessage: `A round hollow, carved with the ${mark}. A wooden seal of the ${mark} would fit it. Hold it to set it in.`,
          consumeItem: true,
        },
        behavior: { type: "setState", stateId: placed, value: true, prompt: `Set the ${mark} seal in the hollow`, sound: "place" },
      },
    });
    hollow.transform.rotation = flat;
    const obj = L.cylinder({
      id: `stele-seal-${mark}`,
      name: `${seal.name} seal`,
      at: [hx, y, sz + 0.07],
      size: [0.18, 0.026, 0.18],
      color: "#ffffff",
      roughness: 0.85,
      texture: seal.texture,
      castShadow: false,
      pose: turns([hx, y, sz + 0.07], flat),
      appearsWhen: placed,
    });
    obj.transform.rotation = flat;
  });
  // The key, on the back until the board turns.
  L.pickup({
    id: "exit-key",
    at: [sx, y, sz - 0.085],
    itemId: "exit-key",
    label: "Iron Key",
    icon: "🗝️",
    mesh: "iron-key",
    rotationY: Math.PI,
    appearsWhen: "plaque-spun",
    pose: turns([sx, y, sz - 0.085], [0, Math.PI, 0]),
  });

  L.rule({
    whenAll: order.map((m) => `seal-${m}-placed`),
    set: "plaque-spun",
    message: "The last seal sinks home. Something behind the board clicks, and it slowly turns on its axle, showing its other side...",
  });
}

function buildStudy(L: LevelBuilder, doorX: number, doorZ: number) {
  const WOOD = "#4a3322";
  const DARK = "#2a1a0e";
  const STONE = "#5b564f";
  type Extra = {
    isSolid?: boolean;
    roughness?: number;
    metalness?: number;
    emissive?: string;
    emissiveIntensity?: number;
    rotationY?: number;
    castShadow?: boolean;
  };
  const box = (id: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, extra: Extra = {}) =>
    L.box({ id: `study-${id}`, at: [x, y, z], size: [sx, sy, sz], color, roughness: 0.85, ...extra });

  // Shell: floor, ceiling with beams, three wood-panelled walls, and panelling
  // over the maze's brick on the east side, with a gap for the door.
  box("floor", -33.1, -0.05, -26, 8.4, 0.1, 6.4, "#3a2a1c", { isSolid: true, roughness: 0.7, castShadow: false });
  box("ceiling", -33.1, 3.05, -26, 8.4, 0.1, 6.4, "#241a12", { castShadow: false });
  for (const [i, x] of [-35.5, -33, -30.5].entries()) box(`beam-${i}`, x, 2.9, -26, 0.28, 0.24, 6.2, "#1b120a");
  // The north wall, with an opening over the desk (x −34.1…−32.3, y 1.25…2.65)
  // that leads into the alcove built by buildStele().
  box("wall-n-l", -35.75, 1.5, -29.1, 3.3, 3, 0.2, WOOD, { isSolid: true, castShadow: false });
  box("wall-n-r", -30.65, 1.5, -29.1, 3.3, 3, 0.2, WOOD, { isSolid: true, castShadow: false });
  box("wall-n-below", -33.2, 0.625, -29.1, 1.8, 1.25, 0.2, WOOD, { isSolid: true, castShadow: false });
  box("wall-n-above", -33.2, 2.825, -29.1, 1.8, 0.35, 0.2, WOOD, { isSolid: true, castShadow: false });
  box("wall-s", -33.2, 1.5, -22.9, 8.4, 3, 0.2, WOOD, { isSolid: true, castShadow: false });
  box("wall-w", -37.1, 1.5, -26, 0.2, 3, 6.4, WOOD, { isSolid: true, castShadow: false });
  box("panel-n", -29.04, 1.5, -28, 0.08, 3, 2, WOOD, { isSolid: true, castShadow: false });
  box("panel-s", -29.04, 1.5, -24, 0.08, 3, 2, WOOD, { isSolid: true, castShadow: false });
  // Over the door, up to the ceiling.
  box("lintel", doorX - 0.85, 2.7, doorZ, 0.3, 0.6, 2, DARK, { isSolid: true });

  // The door out to the maze: swings open into the study.
  L.door({
    id: "study-door",
    at: [doorX - 0.95, 0, doorZ],
    width: 1.9,
    height: 2.4,
    hinge: "north",
    swing: -1,
    label: "door",
    // No going out into the dark without a light.
    requiresItem: "lantern",
    lockedMessage: "It's pitch black out there. You should take the lantern from the desk first.",
  });

  // Fireplace in the middle of the west wall.
  box("hearth", -36.1, 0.03, -26, 1.3, 0.06, 2.1, STONE, { roughness: 1 });
  box("fire-jamb-l", -36.65, 0.65, -27, 0.7, 1.3, 0.7, STONE, { isSolid: true, roughness: 1 });
  box("fire-jamb-r", -36.65, 0.65, -25, 0.7, 1.3, 0.7, STONE, { isSolid: true, roughness: 1 });
  box("fire-lintel", -36.65, 1.45, -26, 0.7, 0.3, 2.7, STONE, { isSolid: true, roughness: 1 });
  box("fire-breast", -36.65, 2.3, -26, 0.7, 1.4, 2.7, STONE, { isSolid: true, roughness: 1 });
  box("fire-mantel", -36.45, 1.68, -26, 0.95, 0.09, 3.1, DARK, { isSolid: true });
  box("fire-back", -36.98, 0.65, -26, 0.05, 1.3, 1.3, "#0b0908");
  box("log-a", -36.7, 0.16, -26, 0.95, 0.15, 0.15, "#2a1a0e", { rotationY: 0.3 });
  box("log-b", -36.65, 0.16, -26, 0.15, 0.15, 0.8, "#33200f", { rotationY: -0.4 });
  box("embers", -36.72, 0.09, -26, 0.9, 0.05, 0.55, "#a02a08", { emissive: "#ff5a14", emissiveIntensity: 1.6, castShadow: false });
  L.flame({ id: "study-fire-a", at: [-36.72, 0.42, -26], size: 0.17, seed: 1 });
  L.flame({ id: "study-fire-b", at: [-36.7, 0.34, -26.28], size: 0.12, seed: 2 });
  L.flame({ id: "study-fire-c", at: [-36.7, 0.34, -25.72], size: 0.12, seed: 3 });
  L.pointLight({ id: "study-fire-light", at: [-36.1, 0.8, -26], color: "#ff8a3c", intensity: 9, distance: 18, flicker: { amount: 0.35, speed: 8 } });
  // A soft glow so the far corners aren't black.
  L.pointLight({ id: "study-glow", at: [-33, 2.5, -26], color: "#ffb066", intensity: 2, distance: 11 });
  // Pictures on the chimney breast and over the desk.
  buildStele(L);

  // Rug and a big green armchair turned to the fire.
  box("rug", -34.1, 0.012, -26, 3.4, 0.02, 2.4, "#6a2323", { roughness: 1, castShadow: false });
  box("rug-inner", -34.1, 0.022, -26, 2.6, 0.02, 1.6, "#8a5a2b", { roughness: 1, castShadow: false });
  {
    const x = -34.1;
    const z = -26;
    box("armchair-seat", x, 0.3, z, 1.05, 0.3, 1.05, "#2f5a3a", { isSolid: true, roughness: 0.9 });
    box("armchair-cushion", x - 0.04, 0.5, z, 0.9, 0.12, 0.9, "#3c6e48", { roughness: 0.95 });
    box("armchair-back", x + 0.44, 0.82, z, 0.24, 0.95, 1.05, "#2f5a3a", { isSolid: true, roughness: 0.9 });
    box("armchair-headrest", x + 0.38, 1.36, z, 0.2, 0.2, 0.55, "#3c6e48", { roughness: 0.95 });
    for (const dz of [-0.6, 0.6]) box(`armchair-arm${dz}`, x, 0.58, z + dz, 1.05, 0.28, 0.2, "#264a30", { isSolid: true, roughness: 0.9 });
    for (const [i, [dx, dz]] of [[-0.45, -0.5], [-0.45, 0.5], [0.45, -0.5], [0.45, 0.5]].entries()) {
      box(`armchair-foot${i}`, x + dx, 0.07, z + dz, 0.1, 0.14, 0.1, "#1d120a");
    }
  }

  // The desk against the north wall, a chair, and what's on it.
  L.table({ id: "study-desk", at: [-33.2, 0, -28.45], top: [1.9, 0.08, 0.8], topColor: "#3b2415", legColor: "#25160b" });
  // The chair is pushed right in under the desk (its low back clears the top).
  box("desk-chair-seat", -33.2, 0.46, -28.42, 0.5, 0.06, 0.5, "#4a2f1c", { isSolid: true });
  box("desk-chair-back", -33.2, 0.62, -28.18, 0.5, 0.24, 0.05, "#4a2f1c", { isSolid: true });
  for (const [i, [dx, dz]] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].entries()) {
    box(`desk-chair-leg${i}`, -33.2 + dx, 0.23, -28.42 + dz, 0.05, 0.46, 0.05, "#25160b");
  }
  L.pickup({ id: "lantern", at: [-33.95, 0.83, -28.4], itemId: "lantern", label: "Lantern", icon: "🏮", mesh: "lantern", rotationY: 0.4 });
  L.candle({ id: "study-desk-candle", at: [-32.45, 0.83, -28.55] });
  L.readable({
    id: "study-note",
    at: [-33.15, 0.84, -28.25],
    size: [0.32, 0.012, 0.22],
    rotationY: 0.2,
    text: "Take the lantern. Whatever you do, don't let it go out.\n\nFour wooden seals were scattered through the maze, one for each of the keepers who came before you. Bring them back and set them in the board in the wall above this desk. It keeps what you need to get out.",
  });
  box("desk-book-a", -32.75, 0.87, -28.3, 0.28, 0.05, 0.2, "#6a2a2a", { rotationY: 0.3 });
  box("desk-book-b", -32.75, 0.915, -28.3, 0.26, 0.04, 0.19, "#2d4a3a", { rotationY: 0.15 });

  // Bookshelves on the north and south walls, stocked with books in mixed colours.
  const rand = mulberry32(11);
  const BOOK_COLORS = ["#5a2323", "#2d4a3a", "#2f3a5a", "#6a5a2a", "#3a2a4a", "#4a3a2a", "#7a3a2a", "#222a2a"];
  const bookshelf = (id: string, cx: number, wall: "north" | "south", width: number) => {
    const depth = 0.38;
    const cz = wall === "north" ? -29 + depth / 2 : -23 - depth / 2;
    const open = wall === "north" ? 1 : -1; // which way the shelf faces
    box(`${id}-back`, cx, 1.15, cz - open * (depth / 2 - 0.02), width, 2.3, 0.04, DARK);
    for (const dx of [-width / 2, width / 2]) box(`${id}-side${dx}`, cx + dx, 1.15, cz, 0.05, 2.3, depth, DARK, { isSolid: true });
    for (const [i, y] of [0.05, 0.5, 0.95, 1.4, 1.85, 2.3].entries()) box(`${id}-board${i}`, cx, y, cz, width, 0.04, depth, DARK, { isSolid: true });
    for (const [row, y] of [0.05, 0.5, 0.95, 1.4, 1.85].entries()) {
      let x = cx - width / 2 + 0.06;
      for (let i = 0; x < cx + width / 2 - 0.1; i++) {
        const w = 0.04 + rand() * 0.05;
        const h = 0.22 + rand() * 0.16;
        if (rand() > 0.12) {
          box(`${id}-book${row}-${i}`, x + w / 2, y + 0.02 + h / 2, cz + open * 0.03, w, h, 0.24, BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)], { roughness: 0.9, castShadow: false });
        }
        x += w + 0.005;
      }
    }
  };
  bookshelf("shelf-nw", -35.6, "north", 1.7);
  bookshelf("shelf-ne", -30.7, "north", 1.7);
  bookshelf("shelf-s", -33.2, "south", 2.6);

  // Wall sconces along the south wall.
  for (const [i, x] of [-35.6, -30.8].entries()) {
    L.sconce({ id: `study-sconce-${i}`, at: [x, 2.0, -23.18], side: "south", intensity: 4.5, distance: 12, castShadow: false });
  }
}

// ---- Table dressing ---------------------------------------------------------

type OrnamentContext = {
  id: string;
  x: number; // table centre
  z: number;
  rot: number; // the table's rotationY
  s: 1 | -1; // which way (along the table's own z) is out from the wall
  top: number; // height of the top of the cloth
  interact: Parameters<LevelBuilder["box"]>[0]["interact"];
};

const ORNAMENTS = ["fruit", "frame", "vase", "tea", "books", "skull", "bottle", "watch"] as const;
type OrnamentKind = (typeof ORNAMENTS)[number];

// One small ornament standing at (lx, lz) on a table, in the table's own
// coordinates. Every piece carries the table's "hide under it" interaction so
// none of it gets in the way of looking at the table.
function ornament(L: LevelBuilder, c: OrnamentContext, kind: OrnamentKind, lx: number, lz: number) {
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const part = (
    shape: "box" | "cylinder" | "sphere",
    key: string,
    name: string,
    dx: number,
    dy: number,
    dz: number,
    size: [number, number, number],
    color: string,
    o: { roughness?: number; metalness?: number; yaw?: number } = {},
  ) => {
    const px = lx + dx;
    const pz = lz + dz;
    L[shape]({
      id: `${c.id}-${kind}-${key}`,
      name,
      at: [c.x + px * cos + pz * sin, c.top + dy, c.z - px * sin + pz * cos],
      size,
      color,
      roughness: o.roughness ?? 0.8,
      metalness: o.metalness ?? 0,
      rotationY: c.rot + (o.yaw ?? 0),
      castShadow: false,
      interact: c.interact,
    });
  };
  const s = c.s;
  const facing = s > 0 ? 0 : Math.PI; // so a picture looks out into the hall

  switch (kind) {
    case "fruit": {
      part("cylinder", "foot", "Fruit bowl", 0, 0.02, 0, [0.12, 0.04, 0.12], "#6b4a2a", { roughness: 0.6 });
      part("cylinder", "bowl", "Fruit bowl", 0, 0.075, 0, [0.28, 0.07, 0.28], "#7a5530", { roughness: 0.6 });
      const fruit: Array<[number, number, number, string]> = [
        [0, 0.15, 0, "#a3261f"],
        [0.075, 0.13, 0.03, "#c9701c"],
        [-0.07, 0.13, 0.04, "#b9a62a"],
        [0.02, 0.13, -0.08, "#7a9a2a"],
        [-0.03, 0.13, 0.09, "#8a2a20"],
        [0.05, 0.19, -0.02, "#c9701c"],
      ];
      for (const [i, [dx, dy, dz, col]] of fruit.entries()) part("sphere", `f${i}`, "Fruit", dx, dy, dz, [0.08, 0.08, 0.08], col, { roughness: 0.5 });
      break;
    }
    case "frame": {
      // An old portrait in a gilded frame, propped up and facing the hall.
      part("box", "prop", "Picture frame", 0, 0.1, -s * 0.03, [0.04, 0.2, 0.02], "#2a1a0e", { yaw: facing });
      part("box", "frame", "Picture frame", 0, 0.15, 0, [0.22, 0.28, 0.025], "#8a6a2a", { metalness: 0.4, roughness: 0.5, yaw: facing });
      part("box", "canvas", "Picture frame", 0, 0.15, s * 0.009, [0.17, 0.22, 0.014], "#6a5a46", { roughness: 0.6, yaw: facing });
      part("sphere", "head", "Picture frame", 0, 0.185, s * 0.018, [0.06, 0.07, 0.03], "#2a2118", { yaw: facing });
      part("box", "body", "Picture frame", 0, 0.12, s * 0.017, [0.11, 0.1, 0.01], "#2a2118", { yaw: facing });
      break;
    }
    case "vase": {
      part("cylinder", "vase", "Vase of dried flowers", 0, 0.085, 0, [0.095, 0.17, 0.095], "#4a5a64", { roughness: 0.35 });
      part("cylinder", "neck", "Vase of dried flowers", 0, 0.2, 0, [0.055, 0.06, 0.055], "#4a5a64", { roughness: 0.35 });
      const stems: Array<[number, number, string]> = [[0, 0, "#8a3a3a"], [0.022, 0.01, "#b0a060"], [-0.022, -0.008, "#7a4a6a"], [0.01, -0.02, "#8a3a3a"]];
      for (const [i, [dx, dz, col]] of stems.entries()) {
        part("cylinder", `stem${i}`, "Vase of dried flowers", dx, 0.33 + i * 0.01, dz, [0.007, 0.2 + i * 0.02, 0.007], "#6b5a2a");
        part("sphere", `bloom${i}`, "Vase of dried flowers", dx, 0.44 + i * 0.02, dz, [0.04, 0.035, 0.04], col, { roughness: 0.9 });
      }
      break;
    }
    case "tea": {
      part("cylinder", "saucer", "Tea cup", 0, 0.006, 0, [0.14, 0.012, 0.14], "#e8e4d8", { roughness: 0.3 });
      part("cylinder", "cup", "Tea cup", 0, 0.042, 0, [0.08, 0.06, 0.08], "#f0ece0", { roughness: 0.3 });
      part("cylinder", "tea", "Tea cup", 0, 0.0735, 0, [0.062, 0.003, 0.062], "#4a2a12", { roughness: 0.2 });
      part("box", "handle", "Tea cup", 0.05, 0.045, 0, [0.03, 0.035, 0.01], "#f0ece0", { roughness: 0.3 });
      break;
    }
    case "books": {
      part("box", "a", "Stack of books", 0, 0.0225, 0, [0.26, 0.045, 0.19], "#5a2323", { roughness: 0.9, yaw: 0.1 });
      part("box", "b", "Stack of books", 0.01, 0.065, 0, [0.24, 0.04, 0.18], "#2d4a3a", { roughness: 0.9, yaw: -0.15 });
      part("box", "c", "Stack of books", -0.005, 0.1, 0, [0.2, 0.035, 0.15], "#6a5a2a", { roughness: 0.9, yaw: 0.3 });
      break;
    }
    case "skull": {
      part("box", "stand", "Skull", 0, 0.01, 0, [0.1, 0.02, 0.1], "#2a1a0e");
      part("sphere", "cranium", "Skull", 0, 0.095, 0, [0.12, 0.12, 0.12], "#d9d2bc", { roughness: 0.7 });
      part("box", "jaw", "Skull", 0, 0.045, s * 0.018, [0.07, 0.04, 0.08], "#d2cbb4", { roughness: 0.7 });
      for (const sx of [-1, 1]) part("sphere", `eye${sx}`, "Skull", sx * 0.026, 0.1, s * 0.05, [0.03, 0.034, 0.03], "#120d08");
      break;
    }
    case "bottle": {
      part("cylinder", "bottle", "Bottle of wine", 0, 0.12, 0, [0.075, 0.24, 0.075], "#1f3a2a", { roughness: 0.2, metalness: 0.1 });
      part("cylinder", "neck", "Bottle of wine", 0, 0.29, 0, [0.034, 0.1, 0.034], "#1f3a2a", { roughness: 0.2 });
      part("cylinder", "cork", "Bottle of wine", 0, 0.348, 0, [0.03, 0.025, 0.03], "#8a6a3a");
      part("cylinder", "glass", "Wine glass", 0.13, 0.045, 0.02, [0.06, 0.09, 0.06], "#c9d6d0", { roughness: 0.1 });
      part("cylinder", "wine", "Wine glass", 0.13, 0.0915, 0.02, [0.048, 0.003, 0.048], "#5a1520", { roughness: 0.2 });
      break;
    }
    case "watch": {
      part("cylinder", "case", "Pocket watch", 0, 0.007, 0, [0.07, 0.012, 0.07], "#c9a14a", { metalness: 0.8, roughness: 0.3 });
      part("cylinder", "face", "Pocket watch", 0, 0.0145, 0, [0.056, 0.003, 0.056], "#e8e0cc", { roughness: 0.4 });
      part("box", "hand-a", "Pocket watch", 0.004, 0.017, -0.008, [0.004, 0.002, 0.022], "#1a1a1a");
      part("box", "hand-b", "Pocket watch", 0.01, 0.017, 0.002, [0.017, 0.002, 0.004], "#1a1a1a");
      part("cylinder", "crown", "Pocket watch", 0, 0.007, -0.042, [0.014, 0.02, 0.014], "#c9a14a", { metalness: 0.8, roughness: 0.3 });
      break;
    }
  }
}

/**
 * Builds the level. Everything is fixed except where the four seals lie, which
 * is drawn from `seed`: each seal goes on a table in a different quarter of the
 * maze (so they're always spread out), on a random one of that quarter's tables,
 * and which seal goes in which quarter is shuffled too.
 */
type Obj = LevelBuilder["objects"][number];

function makeLevel(seed: number) {
  const dice = mulberry32(seed);
  const sealOrder = [0, 1, 2, 3];
  for (let i = sealOrder.length - 1; i > 0; i--) {
    const j = Math.floor(dice() * (i + 1));
    [sealOrder[i], sealOrder[j]] = [sealOrder[j], sealOrder[i]];
  }
  // Per quarter: which seal it holds, and which of its tables carries it.
  const sealIn = QUADRANTS.map((_, qi) => ({ seal: sealOrder[qi], table: Math.floor(dice() * BLOCK_TABLES.length) }));
  return defineLevel({
  id: "level-secret",
  name: "Level 02 — The One You Run",
  tags: ["medium", "scary"],
  background: "#020203",
  // In the study, a few steps in from the door, looking towards the desk and fire.
  playerStart: { position: [-31.2, 1.7, -24.6], rotationY: 0.3 },
  build(L) {
    buildStudy(L, doorX, doorZ);

    L.labyrinth({
      grid: GRID,
      cellSize: CELL,
      center: [CENTER_X, CENTER_Z],
      wallHeight: 3,
      // Walls use a procedural brick texture (see engine/textures.ts); the
      // tint here only multiplies into the texture — kept near-white so the
      // brick palette shows through. Floor/ceiling remain untextured, so their
      // colors are the actual surface colors.
      wallColor: "#ffffff",
      floorColor: "#38302a",
      ceilingColor: "#1a1612",
    });

    // ---- Wear and damp -----------------------------------------------------
    // Moss creeping up the walls and shallow pools on the floor, scattered with
    // a fixed seed so the maze is the same every time. They steer clear of the
    // tables, the exit and the monster's spot, and moss never grows on the wall
    // behind a table or on the study's wall.
    {
      const rnd = mulberry32(2024);
      const clear = (r: number, c: number, d: number) => {
        const [x, z] = cellXZ(r, c);
        const near = (px: number, pz: number) => Math.hypot(px - x, pz - z) < d;
        return !(tables.some((t) => near(...cellXZ(t.cell[0], t.cell[1]))) || near(exitX, exitZ) || near(...cellXZ(3, 3)));
      };
      const sides: Array<[Side, number, number, number]> = [
        ["north", -1, 0, 0],
        ["south", 1, 0, Math.PI],
        ["west", 0, -1, Math.PI / 2],
        ["east", 0, 1, -Math.PI / 2],
      ];
      let mossN = 0;
      const MOSS = ["moss", "moss-b", "moss-c"] as const;
      for (let r = 1; r < N - 1; r++) {
        for (let c = 1; c < N - 1; c++) {
          if (big[r][c] !== ".") continue;
          for (const [, dr, dc, rot] of sides) {
            if (big[r + dr][c + dc] !== "#" || rnd() > 0.3 || !clear(r, c, 1.8)) continue;
            const [cx, cz] = cellXZ(r, c);
            // One overlay for the whole wall face; the texture itself decides where moss grows.
            const o = L.box({
              id: `moss-${mossN++}`,
              name: "Moss",
              at: [cx + dc * (CELL / 2 - 0.015), 1.5, cz + dr * (CELL / 2 - 0.015)],
              size: [CELL, 3, 0.02],
              color: "#a4b09a",
              roughness: 1,
              texture: MOSS[Math.floor(rnd() * MOSS.length)],
              cutout: true,
              rotationY: rot,
              castShadow: false,
              receiveShadow: false,
            });
            if (rnd() < 0.5) o.transform.scale = [-1, 1, 1]; // mirror, so repeats don't look alike
          }
        }
      }

      // Puddles: each its own lumpy outline, some wide, some long and thin, and
      // a few of them small ones spilling off a bigger one.
      let poolN = 0;
      const cells: Pt[] = [];
      for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) if (big[r][c] === "." && clear(r, c, 2.2)) cells.push([r, c]);
      for (let k = 0; k < 16 && cells.length; k++) {
        const [r, c] = cells.splice(Math.floor(rnd() * cells.length), 1)[0];
        const [cx, cz] = cellXZ(r, c);
        const shape = rnd();
        // wide and round, long and thin (a trickle), or middling
        const [w, d] = shape < 0.3 ? [1.3 + rnd() * 0.8, 0.9 + rnd() * 0.6] : shape < 0.6 ? [1.6 + rnd() * 0.7, 0.35 + rnd() * 0.3] : [0.7 + rnd() * 0.6, 0.5 + rnd() * 0.5];
        const px = cx + (rnd() - 0.5) * 0.5;
        const pz = cz + (rnd() - 0.5) * 0.5;
        L.puddle({ id: `pool-${poolN++}`, at: [px, 0, pz], seed: Math.floor(rnd() * 1e6), width: w, depth: d });
        if (rnd() < 0.45) {
          // A couple of smaller ones nearby, as if the water had run on.
          for (let i = 0; i < 1 + Math.floor(rnd() * 2); i++) {
            L.puddle({
              id: `pool-${poolN++}`,
              at: [px + (rnd() - 0.5) * 1.5, 0, pz + (rnd() - 0.5) * 1.5],
              seed: Math.floor(rnd() * 1e6),
              width: 0.25 + rnd() * 0.35,
              depth: 0.2 + rnd() * 0.3,
            });
          }
        }
      }
    }

    // Faint ambient floor — just enough that the darkest corners of the maze
    // are a bruised blue instead of pitch black. Otherwise it's your lantern.
    L.ambient({ color: "#2a2a3a", intensity: 0.14 });

    // The only wall lights in the maze: two sconces either side of the exit door.
    for (const dc of [-1, 1]) {
      const c = exitCol + dc;
      if (big[N - 2][c] !== "." || big[N - 1][c] !== "#") continue;
      const [cx, cz] = cellXZ(N - 2, c);
      L.sconce({ at: [cx, 2.2, cz + CELL / 2 - 0.18], side: "south", intensity: 8, distance: 40, castShadow: dc < 0 });
    }

    // Warm glow above the exit door — reads from across the maze and
    // tells the player "this is the way out".
    L.pointLight({
      at: [exitX, 2.1, exitZ - 0.9],
      color: "#ffcc80",
      intensity: 3.2,
      distance: 22,
      flicker: { amount: 0.08, speed: 6 },
    });

    // She only turns up once the study door has been opened, far across the maze
    // from it, and then patrols her loop.
    // The route, with the lane shift for table cells. Where it moves between a
    // shifted cell and an unshifted one, an extra point at the shared edge holds
    // the shifted lane until she's well past the table, so she doesn't cut the corner.
    const PATROL = makePatrol(mulberry32(seed ^ 0x9e3779b9));
    const route: Array<[number, number]> = [];
    const centreIndex: number[] = []; // index in `route` of each cell's centre
    const base = PATROL.cells.map(([r, c]) => cellXZ(r, c));
    const lane = PATROL.cells.map(([r, c]) => laneShift.get(key(r, c)));
    const at = (i: number): [number, number] => [base[i][0] + (lane[i]?.[0] ?? 0), base[i][1] + (lane[i]?.[1] ?? 0)];
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      centreIndex.push(route.length);
      route.push(at(i));
      const edge: [number, number] = [(base[i][0] + base[j][0]) / 2, (base[i][1] + base[j][1]) / 2];
      if (lane[i] && !lane[j]) route.push([edge[0] + lane[i]![0], edge[1] + lane[i]![1]]);
      else if (!lane[i] && lane[j]) route.push([edge[0] + lane[j]![0], edge[1] + lane[j]![1]]);
    }
    const stops = PATROL.stopAt.map((i) => centreIndex[i]);
    L.monster({
      id: "samara",
      at: [route[0][0], 0, route[0][1]],
      rotationY: 0,
      appearsWhen: "study-door-open",
      patrol: {
        points: route,
        speed: 1.1,
        stops,
        nav: {
          origin: cellXZ(0, 0),
          cell: CELL,
          // Every open cell of the maze. The study isn't in the grid, so she can't go in.
          open: big.map((row) => row.map((ch) => (ch === "." ? "." : "#")).join("")),
          lanes: [...laneShift].map(([k, [dx, dz]]) => {
            const [r, c] = k.split(",").map(Number);
            return [r, c, dx, dz] as [number, number, number, number];
          }),
          centres: centreIndex,
        },
      },
    });

    // A table in each broad hall, pushed flush against a solid wall (long side
    // to the wall) rather than floating in the middle, dressed with a few
    // ornaments and a handwritten letter you can pick up.
    const GAP = 0.04;
    const TABLE_TOP = 0.842; // tabletop plus cloth
    const PER_BLOCK = BLOCK_TABLES.length;
    for (const [k, t] of tables.entries()) {
      const [tx, tz] = cellXZ(t.cell[0], t.cell[1]);
      const [dr, dc] = DIR[t.wall];
      const off = CELL / 2 - TABLE_D / 2 - GAP;
      const x = tx + dc * off;
      const z = tz + dr * off;
      // Long side along the wall: x for north/south walls, z for east/west.
      const rot = dc ? Math.PI / 2 : 0;
      // Pressing E on any part of the table (or the candle) crawls the player
      // underneath. `out` points from the wall into the hall, `side` runs along
      // the table; the player sits off to one side so the cloth's hanging point
      // isn't in the middle of the view.
      const out: Pt = [-dc, -dr];
      const side: Pt = [out[1], -out[0]];
      const at = (along: number, outward: number, y: number): [number, number, number] => [
        x + side[0] * along + out[0] * outward,
        y,
        z + side[1] * along + out[1] * outward,
      ];
      const hide = {
        behavior: {
          type: "hide" as const,
          edge: at(-0.28, 0.85, 0.62),
          deep: at(-0.28, -0.12, 0.5),
          spot: at(-0.28, 0.02, 0.56),
          exit: at(0, 1.2, 1.7),
          outYaw: Math.atan2(-out[0], -out[1]),
          // If the monster sees you crawl in here, she comes and overturns the table.
          group: t.id,
          approach: at(0, 1.15, 0),
        },
      };
      L.table({ id: `${t.id}-table`, at: [x, 0, z], top: [TABLE_W, 0.08, TABLE_D], rotationY: rot, cloth: "#e8e0cc", interact: hide });
      // Which way is "out of the wall" along the table's own z axis.
      const s: 1 | -1 = t.wall === "north" || t.wall === "west" ? 1 : -1;
      const ctx: OrnamentContext = { id: t.id, x, z, rot, s, top: TABLE_TOP, interact: hide };
      // Three different ornaments per table, a letter in the middle.
      const i0 = k % ORNAMENTS.length;
      ornament(L, ctx, ORNAMENTS[i0], -0.37, 0);
      ornament(L, ctx, ORNAMENTS[(i0 + 3) % ORNAMENTS.length], 0, -s * 0.2);
      ornament(L, ctx, ORNAMENTS[(i0 + 5) % ORNAMENTS.length], 0.37, 0);
      const [lx, lz] = [0.02, s * 0.1];
      const yaw = rot + (k % 2 ? 0.25 : -0.3);
      // One table in each quarter holds that quarter's seal, where the middle of
      // the table would be; the rest are just dressed.
      const qi = Math.floor(k / PER_BLOCK);
      let sealObjId: string | null = null;
      if (k % PER_BLOCK === sealIn[qi].table) {
        const seal = SEALS[sealIn[qi].seal];
        sealObjId = `seal-${seal.mark}`;
        L.pickup({
          id: `seal-${seal.mark}`,
          at: [x + lx * Math.cos(rot) + lz * Math.sin(rot), TABLE_TOP + 0.017, z - lx * Math.sin(rot) + lz * Math.cos(rot)],
          itemId: `seal-${seal.mark}`,
          label: `${seal.name} seal`,
          icon: seal.icon,
          mesh: { shape: "cylinder", size: [0.16, 0.03, 0.16], color: "#ffffff", roughness: 0.85, texture: seal.texture },
          rotationY: yaw,
        });
      }

      // What happens when she overturns this table (the flag "flip-<table id>" is set).
      // The table, its legs and its cloth swing over about the middle of the table, so
      // it ends up upside down on the floor, shoved a little outwards. Each ornament is
      // knocked off as a whole: turned over and thrown to the floor in front of it.
      {
        const flag = `flip-${t.id}`;
        const sideAxis: [number, number, number] = [side[0], 0, side[1]];
        const isTable = (o: Obj) => o.id.startsWith(`${t.id}-table`);
        const mine = L.objects.filter((o) => o.id.startsWith(`${t.id}-`) || o.id === sealObjId);
        for (const o of mine.filter(isTable)) {
          o.pose = {
            stateId: flag,
            open: { position: o.transform.position, rotation: o.transform.rotation },
            duration: 0.55,
            unblocksWhenOpen: true,
            spin: { pivot: [x, 0.42, z], angle: Math.PI, axis: sideAxis, shift: [out[0] * 0.3, 0, out[1] * 0.3] },
          };
        }
        const units = new Map<string, Obj[]>();
        for (const o of mine.filter((o) => !isTable(o))) {
          const unit = o.id === sealObjId ? o.id : o.id.slice(t.id.length + 1).split("-")[0];
          units.set(unit, [...(units.get(unit) ?? []), o]);
        }
        for (const parts of units.values()) {
          const ys = parts.map((o) => o.transform.position[1]);
          const c = parts.reduce((a, o) => [a[0] + o.transform.position[0] / parts.length, a[1] + o.transform.position[1] / parts.length, a[2] + o.transform.position[2] / parts.length], [0, 0, 0]);
          const half = Math.max(0.05, (Math.max(...ys) - Math.min(...ys)) / 2 + 0.04);
          const throwOut = 0.5 + dice() * 0.6;
          const throwSide = (dice() - 0.5) * 0.7;
          for (const o of parts) {
            o.pose = {
              stateId: flag,
              open: { position: o.transform.position, rotation: o.transform.rotation },
              duration: 0.55,
              unblocksWhenOpen: false,
              spin: {
                pivot: [c[0], c[1], c[2]],
                angle: Math.PI * (dice() < 0.5 ? 1 : -1),
                axis: sideAxis,
                shift: [out[0] * throwOut + side[0] * throwSide, -c[1] + half, out[1] * throwOut + side[1] * throwSide],
              },
            };
          }
        }
      }
    }

    // The way out. Door sits on the south border opening.
    L.keyedDoor({
      at: [exitX, 0, exitZ],
      // Hung on the back of the stele in the study.
      keyItemId: "exit-key",
      lockedMessage: "The door is locked. The key must be somewhere back in the study.",
      color: "#2a1a14",
      frameColor: "#5a4a30",
      handleSide: "north", // the maze side, facing the player
    });
  },
  });
}

// Each time the level is started it's built afresh, so the seals fall on new tables.
export const reroll = () => makeLevel(Math.floor(Math.random() * 2 ** 32));
export default makeLevel(1);
