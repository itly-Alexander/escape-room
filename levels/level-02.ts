import { defineLevel } from "@/leveldsl";

// Grid legend: # = stone block, . = corridor, S = start, K = iron key, E = exit.
// 15×15 cells × 2m = 30m square. Hand-drawn asymmetric labyrinth — irregular
// walls, dead-end spurs, and no straight sight line from the key to the exit.
// Multiple loops so the player can double back on a pursuer; the broad south
// corridor (row 13) stitches both halves together right in front of the door.
const CELL = 2;
const GRID = [
  "###############",
  "#S..#.........#",
  "##.##.####.##.#",
  "#....#....#.#.#",
  "#.##.#.##.#.#.#",
  "#.#....#..#...#",
  "#.#.####.####.#",
  "#.....#.K.....#",
  "#.####.#.####.#",
  "#...#.......#.#",
  "##.##.#####.#.#",
  "#..#..#.....#.#",
  "#.##.##.###.#.#",
  "#.............#",
  "#######E#######",
];
const ROWS = GRID.length;
const COLS = GRID[0].length;

function cellXZ(row: number, col: number): [number, number] {
  const x = -(COLS * CELL) / 2 + col * CELL + CELL / 2;
  const z = -(ROWS * CELL) / 2 + row * CELL + CELL / 2;
  return [x, z];
}

const [startX, startZ] = cellXZ(1, 1);
const [exitX, exitZ] = cellXZ(14, 7);
const [keyX, keyZ] = cellXZ(7, 8);

export default defineLevel({
  id: "level-secret",
  name: "Level 02 — The One You Run",
  background: "#020203",
  playerStart: { position: [startX, 1.7, startZ], rotationY: Math.PI }, // face into the maze
  build(L) {
    L.labyrinth({
      grid: GRID,
      cellSize: CELL,
      wallHeight: 3,
      // Walls use a procedural brick texture (see engine/textures.ts); the
      // tint here only multiplies into the texture — kept near-white so the
      // brick palette shows through. Floor/ceiling remain untextured, so their
      // colors are the actual surface colors.
      wallColor: "#ffffff",
      floorColor: "#38302a",
      ceilingColor: "#1a1612",
    });

    // Faint ambient floor — just enough that the darkest corners of the maze
    // are a bruised blue instead of pitch black. Everything you actually
    // see is still thrown by a sconce.
    L.ambient({ color: "#2a2a3a", intensity: 0.14 });

    // Sconces ringing the perimeter and dotted through the crossbars —
    // enough light to run by, but not enough to see every intersection
    // at once. Mounted on the stone block adjacent to each marked cell.
    const sconces: Array<{
      cell: [number, number];
      side: "north" | "south" | "east" | "west";
    }> = [
      { cell: [1, 2], side: "north" }, // just inside the entrance
      { cell: [1, 8], side: "north" }, // top corridor, mid
      { cell: [1, 12], side: "north" }, // top-right dead-end approach
      { cell: [3, 2], side: "south" }, // upper-west chamber
      { cell: [3, 8], side: "north" }, // approach to the key from the north
      { cell: [3, 12], side: "north" }, // upper-east branch, previously black
      { cell: [5, 1], side: "west" }, // west spine
      { cell: [5, 5], side: "north" }, // mid-upper branch
      { cell: [7, 3], side: "south" }, // key cross-corridor, west side
      { cell: [7, 10], side: "south" }, // key cross-corridor, east side
      { cell: [9, 1], side: "west" }, // mid-west corridor
      { cell: [9, 6], side: "south" }, // mid-lower corridor
      { cell: [11, 4], side: "north" }, // lower-west loop
      { cell: [11, 9], side: "north" }, // lower-east loop
      { cell: [11, 11], side: "south" }, // south-east pocket
      { cell: [13, 3], side: "south" }, // bottom corridor, west
      { cell: [13, 6], side: "south" }, // flanking the exit, left
      { cell: [13, 8], side: "south" }, // flanking the exit, right
      { cell: [13, 12], side: "south" }, // bottom corridor, east
    ];
    for (const s of sconces) {
      const [cx, cz] = cellXZ(s.cell[0], s.cell[1]);
      const off = CELL / 2 - 0.18;
      const at: [number, number, number] =
        s.side === "north"
          ? [cx, 2.2, cz - off]
          : s.side === "south"
            ? [cx, 2.2, cz + off]
            : s.side === "east"
              ? [cx + off, 2.2, cz]
              : [cx - off, 2.2, cz];
      // Long `distance` so the inverse-square tail trails off very gently —
      // the far end of a corridor still catches a faint glow instead of
      // cutting to black. Intensity stays modest so the near field doesn't
      // blow out.
      L.sconce({ at, side: s.side, intensity: 11, distance: 40 });
    }

    // Warm glow above the exit door — reads from across the maze and
    // tells the player "this is the way out" even before the sconces
    // either side resolve.
    L.pointLight({
      at: [exitX, 2.1, exitZ - 0.9],
      color: "#ffcc80",
      intensity: 3.2,
      distance: 22,
      flicker: { amount: 0.08, speed: 6 },
    });

    // The iron key — sitting at the very centre of the maze.
    L.pickup({
      id: "maze-key",
      at: [keyX, 0.07, keyZ],
      itemId: "maze-key",
      label: "Iron Key",
      icon: "🗝️",
      mesh: {
        shape: "cylinder",
        size: [0.09, 0.025, 0.09],
        color: "#8a7a68",
        metalness: 0.85,
        roughness: 0.4,
        emissive: "#5a4a38",
        emissiveIntensity: 0.3,
      },
    });

    // The way out. Door sits on the south border opening.
    L.keyedDoor({
      at: [exitX, 0, exitZ],
      keyItemId: "maze-key",
      lockedMessage: "The door is bolted shut. You need an iron key.",
      color: "#2a1a14",
      frameColor: "#5a4a30",
    });
  },
});
