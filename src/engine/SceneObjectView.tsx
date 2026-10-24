import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { SceneObject, Mesh as MeshSchema, Material } from '@/schema/level'
import { useWorld } from '@/state/world'
import { Flame } from './Flame'
import { getProceduralTexture } from './textures'

// Default world-space tiling per named texture, applied globally to the shared
// CanvasTexture. Current consumer (labyrinth walls, 2m × 3m faces) gets ~0.5m
// wide × 0.25m tall bricks under (1, 1.5).
const TEXTURE_REPEAT: Record<string, [number, number]> = {
  brick: [1, 1.5],
}

function resolveTexture(name: NonNullable<Material['texture']>): THREE.Texture {
  const tex = getProceduralTexture(name)
  const r = TEXTURE_REPEAT[name]
  if (r) tex.repeat.set(r[0], r[1])
  return tex
}

function primitiveGeometry(shape: 'box' | 'cylinder' | 'plane' | 'sphere', size: [number, number, number]) {
  switch (shape) {
    case 'box':
      return <boxGeometry args={size} />
    case 'cylinder':
      return <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 32]} />
    case 'plane':
      return <planeGeometry args={[size[0], size[2]]} />
    case 'sphere':
      return <sphereGeometry args={[size[0] / 2, 32, 16]} />
  }
}

function primMaterial(m: Material) {
  const map = m.texture ? resolveTexture(m.texture) : undefined
  return (
    <meshStandardMaterial
      color={m.color}
      roughness={m.roughness}
      metalness={m.metalness}
      emissive={m.emissive ?? '#000000'}
      emissiveIntensity={m.emissive ? m.emissiveIntensity : 0}
      map={map}
    />
  )
}

function renderMesh(mesh: MeshSchema, highlight?: boolean) {
  if (mesh.kind === 'primitive') {
    return {
      geometry: primitiveGeometry(mesh.shape, mesh.size),
      material: highlight ? (
        <meshStandardMaterial
          color={mesh.material.color}
          roughness={mesh.material.roughness}
          metalness={mesh.material.metalness}
          emissive={'#ffaa33'}
          emissiveIntensity={0.6}
          map={mesh.material.texture ? resolveTexture(mesh.material.texture) : undefined}
        />
      ) : (
        primMaterial(mesh.material)
      ),
    }
  }
  return {
    geometry: <boxGeometry args={[0.5, 0.5, 0.5]} />,
    material: <meshStandardMaterial color="#ff00ff" wireframe />,
  }
}

function isFlame(mesh: MeshSchema): mesh is Extract<MeshSchema, { kind: 'flame' }> {
  return mesh.kind === 'flame'
}

/**
 * Renders just the geometry + material + plane-rotation fix for a mesh schema.
 * No world transform. Caller wraps this in a positioned group.
 */
export function MeshBody({
  mesh,
  castShadow = true,
  receiveShadow = true,
}: {
  mesh: MeshSchema
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const planeRotFix = useMemo(() => {
    if (mesh.kind !== 'primitive' || mesh.shape !== 'plane') return undefined
    return new THREE.Euler(-Math.PI / 2, 0, 0)
  }, [mesh])
  if (isFlame(mesh)) return <Flame size={mesh.size} seed={mesh.seed} />
  const { geometry, material } = renderMesh(mesh)
  return (
    <group rotation={planeRotFix}>
      <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
        {geometry}
        {material}
      </mesh>
    </group>
  )
}

type Props = {
  object: SceneObject
  highlight?: boolean
  animatePose?: boolean
  onClick?: (e: THREE.Event) => void
  children?: ReactNode
}

/**
 * Renders one SceneObject. When animatePose is true (Play mode), mutates
 * the group each frame to lerp toward open/closed poses based on world flags.
 */
export function SceneObjectView({ object, highlight, animatePose, onClick, children }: Props) {
  const groupRef = useRef<THREE.Group>(null)
  const flameMesh = isFlame(object.mesh) ? object.mesh : null
  const meshEl = flameMesh ? null : renderMesh(object.mesh, highlight)

  const planeRotFix = useMemo(() => {
    if (object.mesh.kind !== 'primitive' || object.mesh.shape !== 'plane') return undefined
    return new THREE.Euler(-Math.PI / 2, 0, 0)
  }, [object.mesh])

  useFrame((_, dt) => {
    if (!animatePose || !groupRef.current) return
    const pose = object.pose
    const base = object.transform
    const g = groupRef.current
    if (!pose) {
      g.position.set(...base.position)
      g.rotation.set(...base.rotation)
      return
    }
    const open = useWorld.getState().flags[pose.stateId] === true
    const target = open ? pose.open : base
    const alpha = 1 - Math.exp(-dt / Math.max(0.05, pose.duration / 3))
    g.position.x += (target.position[0] - g.position.x) * alpha
    g.position.y += (target.position[1] - g.position.y) * alpha
    g.position.z += (target.position[2] - g.position.z) * alpha
    g.rotation.x += (target.rotation[0] - g.rotation.x) * alpha
    g.rotation.y += (target.rotation[1] - g.rotation.y) * alpha
    g.rotation.z += (target.rotation[2] - g.rotation.z) * alpha
  })

  return (
    <group
      ref={groupRef}
      position={object.transform.position}
      rotation={object.transform.rotation}
      scale={object.transform.scale}
      userData={{ sceneObjectId: object.id }}
      onClick={onClick}
    >
      {flameMesh ? (
        <Flame size={flameMesh.size} seed={flameMesh.seed} />
      ) : (
        <group rotation={planeRotFix}>
          <mesh castShadow={object.castShadow} receiveShadow={object.receiveShadow}>
            {meshEl!.geometry}
            {meshEl!.material}
          </mesh>
        </group>
      )}
      {children}
    </group>
  )
}
