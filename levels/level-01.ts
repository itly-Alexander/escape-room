import { defineLevel } from "@/leveldsl";

export default defineLevel({
  id: "level-01",
  name: "Level 01 — The One You Test",
  background: "#07050a",
  playerStart: { position: [0, 1.7, 3] },
  build(L) {
    L.room({
      size: [8, 3, 8],
      floor: "#2e2822",
      ceiling: "#1a1612",
      walls: "#3a3228",
    });
    L.ambient({ color: "#5a6a80", intensity: 0.1 });

    // Flanking wall sconces throw warm flickering light across the chamber.
    L.sconce({ id: "sconce-w", at: [-3.55, 2.1, -1.0], side: "west" });
    L.sconce({ id: "sconce-e", at: [3.55, 2.1, -1.0], side: "east" });

    // A soft warm glow above the chest to draw the eye.
    L.pointLight({
      id: "chest-glow",
      at: [-1.8, 1.2, -1.0],
      color: "#ffcc80",
      intensity: 1.2,
      distance: 3,
    });

    // Table + diary. Diary tells you the digits.
    L.table({ id: "table", at: [1.8, 0, -1.2] });
    L.readable({
      id: "diary",
      name: "Diary",
      at: [1.8, 0.87, -1.2],
      size: [0.3, 0.06, 0.4],
      rotationY: 0.3,
      color: "#b8582a",
      text: "…the keeper hid the brass key in his oaken chest. The lid resists all but the right digits. He left me the number — three, then one, then five — but never said in what order…",
    });

    // A small warm candle on the table lifts the diary out of the shadow.
    L.pointLight({
      id: "desk-candle",
      at: [1.8, 1.15, -1.2],
      color: "#ffb470",
      intensity: 1.1,
      distance: 2.5,
      flicker: { amount: 0.25, speed: 11 },
    });

    // Flavour note on the west wall; corroborates the code.
    L.readable({
      id: "wall-note",
      name: "Note (wall)",
      at: [-3.88, 1.6, -1.5],
      size: [0.3, 0.4, 0.01],
      rotationY: Math.PI / 2,
      text: "A caretaker's prayer, scratched into the plaster: 'When the light flickers low, I count my steps and remember the dial. Three. One. Five.'",
    });

    // Code-locked chest. The lid physically occludes the key inside until opened.
    L.codedChest({ id: "chest", at: [-1.8, 0, -1.5], code: "315" });
    L.pickup({
      id: "brass-key",
      at: [-1.8, 0.07, -1.5],
      itemId: "brass-key",
      label: "Brass Key",
      icon: "🔑",
      mesh: "key",
    });

    // Keyed exit door — needs the brass key.
    L.keyedDoor({
      at: [0, 0, -3.78],
      keyItemId: "brass-key",
      lockedMessage: "The door is locked. You need a brass key.",
    });
  },
});
