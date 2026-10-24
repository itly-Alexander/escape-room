import { z } from 'zod'

const Vec3 = z.tuple([z.number(), z.number(), z.number()])
const Color = z.string()

const Material = z.object({
  color: Color.default('#aaaaaa'),
  roughness: z.number().min(0).max(1).default(0.8),
  metalness: z.number().min(0).max(1).default(0),
  emissive: Color.optional(),
  emissiveIntensity: z.number().default(1),
  // Named procedural texture applied as the diffuse map. Resolved to a
  // module-cached CanvasTexture at render time (see engine/textures.ts).
  texture: z.enum(['brick']).optional(),
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

const Mesh = z.discriminatedUnion('kind', [PrimitiveMesh, GltfMesh, FlameMesh])

const Transform = z.object({
  position: Vec3.default([0, 0, 0]),
  rotation: Vec3.default([0, 0, 0]),
  scale: Vec3.default([1, 1, 1]),
})

const LockRequirement = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), itemId: z.string() }),
  z.object({ kind: z.literal('code'), code: z.string() }),
])

const Behavior = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pickup'),
    itemId: z.string(),
    label: z.string().optional(),
    icon: z.string().optional(),
  }),
  z.object({ type: z.literal('toggleState'), stateId: z.string() }),
  z.object({ type: z.literal('setState'), stateId: z.string(), value: z.boolean().default(true) }),
  z.object({ type: z.literal('readable'), text: z.string(), imageSrc: z.string().optional() }),
  z.object({ type: z.literal('exit') }),
])

const Pose = z.object({
  stateId: z.string(),
  open: z.object({ position: Vec3, rotation: Vec3 }),
  duration: z.number().default(0.6),
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
})

export const Level = z.object({
  id: z.string(),
  name: z.string(),
  version: z.literal(1),
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
