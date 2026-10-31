import { z } from 'zod'

const Vec3 = z.tuple([z.number(), z.number(), z.number()])
const Color = z.string()

const Material = z.object({
  color: Color.default('#aaaaaa'),
  roughness: z.number().min(0).max(1).default(0.8),
  metalness: z.number().min(0).max(1).default(0),
  emissive: Color.optional(),
  emissiveIntensity: z.number().default(1),
  // Draw only the opaque parts of the texture (leaves, moss).
  cutout: z.boolean().optional(),
  // Named procedural texture applied as the diffuse map. Resolved to a
  // module-cached CanvasTexture at render time (see engine/textures.ts).
  texture: z
    .enum([
      'brick',
      'letter',
      'letter-moon',
      'letter-eye',
      'letter-key',
      'plaque',
      'plaque-back',
      'seal-sun',
      'seal-moon',
      'seal-eye',
      'seal-key',
      'indent-sun',
      'indent-moon',
      'indent-eye',
      'indent-key',
      'moss',
      'moss-b',
      'moss-c',
    ])
    // Or a slate with a chalked numeral and digit: "chalk:<numeral>:<digit>".
    .or(z.custom<`chalk:${string}`>((v) => typeof v === 'string' && v.startsWith('chalk:')))
    .optional(),
})

const PrimitiveMesh = z.object({
  kind: z.literal('primitive'),
  shape: z.enum(['box', 'cylinder', 'plane', 'sphere']),
  size: Vec3.default([1, 1, 1]),
  material: Material.default({ color: '#aaaaaa', roughness: 0.8, metalness: 0, emissiveIntensity: 1 }),
})

const GltfMesh = z.object({
  kind: z.literal('gltf'),
  src: z.string(),
})

const FlameMesh = z.object({
  kind: z.literal('flame'),
  size: z.number().positive().default(0.22),
  seed: z.number().default(0),
})

const MonsterMesh = z.object({
  kind: z.literal('monster'),
  // A loop she walks round (world x/z of every corner, in order, back to the
  // first), at `speed` m/s. At each index in `stops` she halts and listens a while.
  // Walk on the spot (legs and arms moving, going nowhere) without a patrol: for checking the gait.
  walkInPlace: z.boolean().optional(),
  patrol: z
    .object({
      points: z.array(z.tuple([z.number(), z.number()])).min(2),
      speed: z.number().positive().default(1.1),
      stops: z.array(z.number()).default([]),
      // The maze she runs about in when she gives chase: a grid of cells (the world
      // position of cell (0,0)'s middle, the cell size, and rows where "." is open).
      // `lanes` shifts the line she takes through a cell with a table in it, and
      // `centres` lists the indices of `points` that sit at a cell's middle.
      nav: z
        .object({
          origin: z.tuple([z.number(), z.number()]),
          cell: z.number().positive(),
          open: z.array(z.string()),
          lanes: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).default([]),
          centres: z.array(z.number()).default([]),
        })
        .optional(),
    })
    .optional(),
})

const ClothMesh = z.object({
  kind: z.literal('cloth'),
  tableSize: z.tuple([z.number(), z.number()]),
  side: z.number().positive(),
  spin: z.number().default(0),
  color: Color.default('#e8e0cc'),
})

const LanternMesh = z.object({ kind: z.literal('lantern') })
const KeyMesh = z.object({ kind: z.literal('key') })
const PuddleMesh = z.object({ kind: z.literal('puddle'), seed: z.number(), width: z.number().positive(), depth: z.number().positive() })

// The porcelain doll (engine/Doll.tsx). A `hunter` is the one that moves when
// unseen, waking once `wakeFlag` is set; a `still` one is set dressing that holds
// `pose` forever. `start` is where the hunter begins (world x, z and yaw) and
// `bounds` (x0, z0, x1, z1) is the floor she finds her way across.
const DollMesh = z.object({
  kind: z.literal('doll'),
  role: z.enum(['hunter', 'still']),
  pose: z.enum(['stand', 'sit', 'slump', 'sitFloor']).default('stand'),
  scale: z.number().positive().default(1),
  wakeFlag: z.string().optional(),
  start: z.tuple([z.number(), z.number(), z.number()]).optional(),
  bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
})
// A bare bulb hanging on its flex. On the house circuit, it dies with the lights.
const BulbMesh = z.object({ kind: z.literal('bulb'), drop: z.number().positive().default(0.6), color: Color.default('#ffd9a0') })

const Mesh = z.discriminatedUnion('kind', [PrimitiveMesh, GltfMesh, FlameMesh, MonsterMesh, ClothMesh, LanternMesh, KeyMesh, PuddleMesh, DollMesh, BulbMesh])

const Transform = z.object({
  position: Vec3.default([0, 0, 0]),
  rotation: Vec3.default([0, 0, 0]),
  scale: Vec3.default([1, 1, 1]),
})

const LockRequirement = z.discriminatedUnion('kind', [
  // `held: false` means just having the item in the inventory is enough; by
  // default it must also be the selected item.
  z.object({ kind: z.literal('item'), itemId: z.string(), held: z.boolean().default(true) }),
  z.object({ kind: z.literal('code'), code: z.string() }),
])

const Behavior = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pickup'),
    itemId: z.string(),
    label: z.string().optional(),
    icon: z.string().optional(),
    // Something to read (a letter): shown when picked up, and again whenever the
    // item is selected and E is pressed with nothing else in reach.
    readText: z.string().optional(),
    handwritten: z.boolean().optional(),
  }),
  // `label` names the thing for the prompt: "Open the door" / "Close the door".
  z.object({ type: z.literal('toggleState'), stateId: z.string(), label: z.string().optional() }),
  z.object({
    type: z.literal('setState'),
    stateId: z.string(),
    value: z.boolean().default(true),
    prompt: z.string().optional(),
    sound: z.enum(['open', 'place']).optional(),
  }),
  z.object({ type: z.literal('readable'), text: z.string(), imageSrc: z.string().optional(), handwritten: z.boolean().optional() }),
  z.object({ type: z.literal('exit') }),
  // Hand in one item from each group (each group is "any one of these"). If
  // they're all there, they're used up and `stateId` is set; if not, the
  // player is told which groups are still missing.
  z.object({
    type: z.literal('combine'),
    groups: z.array(z.object({ label: z.string(), itemIds: z.array(z.string()) })),
    stateId: z.string(),
    prompt: z.string().optional(),
    done: z.string(),
    missing: z.string().optional(),
    already: z.string().optional(),
  }),
  // Crawl in and sit hidden. All points are world positions; `spot`, `deep`
  // and `edge` carry the camera height used while crawling/sitting.
  z.object({
    type: z.literal('hide'),
    edge: Vec3, // where the player drops to hands and knees, at the hiding place's mouth
    deep: Vec3, // furthest point crawled in, before turning round
    spot: Vec3, // where the player sits looking out
    exit: Vec3, // where the player stands again afterwards
    outYaw: z.number(), // camera yaw that faces out of the hiding place
    // What a monster that has seen you hide can do about it: stand at `approach` and
    // overturn everything in `group` (its parts all pose on the flag "flip-<group>").
    group: z.string().optional(),
    approach: Vec3.optional(),
  }),
])

const Pose = z.object({
  stateId: z.string(),
  open: z.object({ position: Vec3, rotation: Vec3 }),
  duration: z.number().default(0.6),
  // Instead of sliding to `open`, turn about a vertical axis through `pivot` by
  // `angle` radians (a plaque that spins round on its post).
  // `axis` (default straight up) can be any direction; `shift` is how far the whole
  // thing has also been carried by the end (a table thrown over, things knocked off it).
  spin: z.object({ pivot: Vec3, angle: z.number(), axis: Vec3.optional(), shift: Vec3.optional() }).optional(),
  // A solid object that stops blocking the player once its state flag is set (a door).
  unblocksWhenOpen: z.boolean().default(false),
})

const Interact = z.object({
  lock: z
    .object({
      requires: LockRequirement,
      lockedMessage: z.string().optional(),
      consumeItem: z.boolean().default(false),
    })
    .optional(),
  behavior: Behavior,
})

const SceneObject = z.object({
  id: z.string(),
  name: z.string(),
  mesh: Mesh,
  transform: Transform.default({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }),
  isSolid: z.boolean().default(false),
  castShadow: z.boolean().default(true),
  receiveShadow: z.boolean().default(true),
  pose: Pose.optional(),
  interact: Interact.optional(),
  // Not in the world until this state flag has been set (and then stays).
  appearsWhen: z.string().optional(),
})

const LightFlicker = z.object({
  amount: z.number().min(0).max(1).default(0.25),
  speed: z.number().positive().default(10),
})

const Light = z.object({
  id: z.string(),
  type: z.enum(['point', 'spot', 'directional', 'ambient']),
  position: Vec3.default([0, 2, 0]),
  target: Vec3.optional(),
  color: Color.default('#ffffff'),
  intensity: z.number().default(1),
  castShadow: z.boolean().default(false),
  angle: z.number().optional(),
  penumbra: z.number().optional(),
  distance: z.number().optional(),
  flicker: LightFlicker.optional(),
  // On the house circuit: dims and dies with the power (engine/watch.ts).
  circuit: z.boolean().optional(),
})

// When every flag in `whenAll` is set, set `set` too (and say `message`).
const Rule = z.object({ whenAll: z.array(z.string()), set: z.string(), message: z.string().optional() })

export const Level = z.object({
  id: z.string(),
  name: z.string(),
  version: z.literal(1),
  tags: z.array(z.string()).default([]),
  skybox: z.string().optional(),
  ambientAudio: z.string().optional(),
  background: Color.default('#1a1a1a'),
  playerStart: z.object({
    position: Vec3.default([0, 1.7, 0]),
    rotationY: z.number().default(0),
  }),
  exitId: z.string(),
  lights: z.array(Light).default([]),
  objects: z.array(SceneObject).default([]),
  initialState: z.record(z.string(), z.boolean()).default({}),
  rules: z.array(Rule).default([]),
})

export type Level = z.infer<typeof Level>
export type SceneObject = z.infer<typeof SceneObject>
export type Light = z.infer<typeof Light>
export type Mesh = z.infer<typeof Mesh>
export type Interact = z.infer<typeof Interact>
export type Behavior = z.infer<typeof Behavior>
export type Material = z.infer<typeof Material>
export type Transform = z.infer<typeof Transform>
export type Pose = z.infer<typeof Pose>

export function parseLevel(data: unknown): Level {
  return Level.parse(data)
}
