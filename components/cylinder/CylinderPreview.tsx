'use client'

import { useFrame } from '@react-three/fiber'
import {
  BallCollider,
  Physics,
  type RapierCollider,
  type RapierRigidBody,
  RigidBody,
  TrimeshCollider,
  useBeforePhysicsStep,
} from '@react-three/rapier'
import Link from 'next/link'
import { type RefObject, useMemo, useRef } from 'react'
import { type BufferGeometry, Matrix4, Mesh, Quaternion, Vector3 } from 'three'

import WebGPUCanvas from '@/components/WebGPUCanvas'
import Button from '@/components/ui/Button'
import Joystick from '@/components/ui/controls/Joystick'
import usePlayerController from '@/hooks/usePlayerController'
import { PLAYER_RADIUS } from '@/utils/player'

import {
  createMovementState,
  createTrackGeometry,
  courseFrame,
  cylinderPosition,
  needsRespawn,
  stepCylinderMovement,
} from './cylinder'
import CylinderScenery from './CylinderScenery'
import { useCylinderInput } from './useCylinderInput'

const PHYSICS_STEP = 1 / 60
const MAX_FRAME_DELTA = 1 / 15
const CAMERA_HEIGHT = 4.5
const CAMERA_DISTANCE = 10
const LOOK_HEIGHT = 5
const LOOK_DISTANCE = 10
const CAMERA_DAMPING = 8
const SPAWN_HEIGHT = PLAYER_RADIUS + 0.1
const SPAWN_POSITION: [number, number, number] = [0, SPAWN_HEIGHT, 0]

type BallProps = {
  input: RefObject<{ sideways: number; forward: number }>
  restartRef: RefObject<boolean>
}

function Track() {
  const { vertices, indices } = useMemo(() => createTrackGeometry(), [])
  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} friction={0} />
      <mesh>
        <bufferGeometry ref={(geometry: BufferGeometry | null) => geometry?.computeVertexNormals()}>
          <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
          <bufferAttribute attach="index" args={[indices, 1]} />
        </bufferGeometry>
        <meshStandardMaterial color="#79b1b8" roughness={0.6} metalness={0.15} />
      </mesh>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[vertices, 3]} />
          <bufferAttribute attach="index" args={[indices, 1]} />
        </bufferGeometry>
        <meshBasicMaterial color="#183e50" wireframe transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </RigidBody>
  )
}

function Ball({ input, restartRef }: BallProps) {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const marble = useRef<Mesh>(null)
  const { controllerRef } = usePlayerController()
  const movement = useRef(createMovementState())
  const cameraState = useRef({
    position: new Vector3(),
    goal: new Vector3(),
    target: new Vector3(),
    up: new Vector3(),
    tangent: new Vector3(),
    forward: new Vector3(),
    matrix: new Matrix4(),
    rotation: new Quaternion(),
    snap: true,
  })
  const rollAxis = useRef(new Vector3())
  const rollingMovement = useRef(new Vector3())

  useBeforePhysicsStep((world) => {
    if (!body.current || !collider.current || !controllerRef.current || document.hidden) return
    const position = body.current.translation()
    const state = movement.current
    if (restartRef.current || needsRespawn(position)) {
      cylinderPosition(0, 0, SPAWN_HEIGHT, state.nextPosition)
      body.current.setTranslation(state.nextPosition, true)
      body.current.setNextKinematicTranslation(state.nextPosition)
      state.fallSpeed = 0
      if (marble.current) marble.current.quaternion.identity()
      restartRef.current = false
      cameraState.current.snap = true
      return
    }

    stepCylinderMovement(
      controllerRef.current, collider.current, position,
      input.current.sideways, input.current.forward,
      Math.min(world.timestep, MAX_FRAME_DELTA), state,
    )
    body.current.setNextKinematicTranslation(state.nextPosition)
    rollingMovement.current.copy(state.displacement)
      .addScaledVector(state.up, -state.displacement.dot(state.up))
    const distance = rollingMovement.current.length()
    if (marble.current && distance > 0.000001) {
      rollAxis.current.copy(state.up).cross(rollingMovement.current).normalize()
      marble.current.rotateOnWorldAxis(rollAxis.current, distance / PLAYER_RADIUS)
      marble.current.quaternion.normalize()
    }
  })

  useFrame(({ camera }, delta) => {
    if (!body.current) return
    const state = cameraState.current
    state.position.copy(body.current.translation())
    courseFrame(state.position, state.up, state.tangent, state.forward)
    state.goal.copy(state.position).addScaledVector(state.up, CAMERA_HEIGHT)
    state.goal.addScaledVector(state.forward, -CAMERA_DISTANCE)
    state.target.copy(state.position).addScaledVector(state.up, LOOK_HEIGHT)
    state.target.addScaledVector(state.forward, LOOK_DISTANCE)
    state.matrix.lookAt(state.goal, state.target, state.up)
    state.rotation.setFromRotationMatrix(state.matrix)
    const blend = state.snap ? 1 : 1 - Math.exp(-CAMERA_DAMPING * Math.min(delta, MAX_FRAME_DELTA))
    camera.position.lerp(state.goal, blend)
    camera.quaternion.slerp(state.rotation, blend)
    state.snap = false
  })

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={SPAWN_POSITION}>
      <BallCollider ref={collider} args={[PLAYER_RADIUS]} />
      <mesh ref={marble}>
        <sphereGeometry args={[PLAYER_RADIUS, 32, 24]} />
        <meshStandardMaterial color="#fff0cc" roughness={0.24} metalness={0.25} />
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[PLAYER_RADIUS, 0.018, 8, 48]} />
          <meshStandardMaterial color="#ee705b" />
        </mesh>
        <mesh>
          <torusGeometry args={[PLAYER_RADIUS, 0.018, 8, 48]} />
          <meshStandardMaterial color="#ee705b" />
        </mesh>
      </mesh>
    </RigidBody>
  )
}

export default function CylinderPreview() {
  const { input, onJoystickMove, clearInput } = useCylinderInput()
  const restart = useRef(false)

  return (
    <main className="fixed inset-0 bg-slate-950 text-white">
      <WebGPUCanvas camera={{ position: [0, CAMERA_HEIGHT, CAMERA_DISTANCE], fov: 75, far: 240 }} dpr={[1, 1.5]}>
        <color attach="background" args={['#101d30']} />
        <fog attach="fog" args={['#101d30', 75, 190]} />
        <ambientLight intensity={0.8} />
        <pointLight position={[0, 22, -30]} intensity={180} decay={1} />
        <directionalLight position={[8, 15, 5]} intensity={1.5} />
        <CylinderScenery />
        <Physics gravity={[0, 0, 0]} timeStep={PHYSICS_STEP}>
          <Track />
          <Ball input={input} restartRef={restart} />
        </Physics>
      </WebGPUCanvas>
      <header className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-linear-to-b from-slate-950/90 to-transparent p-5 sm:p-8">
        <div>
          <p className="text-xs tracking-[0.25em] text-teal-300 uppercase">Speedroller / Experiment 01</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Inside the cylinder</h1>
          <p className="mt-2 max-w-sm text-sm text-slate-300">Hold W or ↑ to follow the full loop. A/D or ←/→ steer across the winding path. Joystick works too; falling returns you to the start.</p>
        </div>
        <div className="pointer-events-auto flex shrink-0 flex-col items-end gap-3">
          <Button variant="primary" size="sm" onClick={() => { clearInput(); restart.current = true }}>Restart</Button>
          <Link href="/" className="text-xs text-slate-300 underline underline-offset-4">Back to game</Link>
        </div>
      </header>
      <Joystick x="56px" y="56px" radius={44} joystickRadius={26} maxRange={50} onMove={onJoystickMove} />
      <p className="pointer-events-none absolute bottom-6 left-5 rounded bg-slate-950/80 px-3 py-2 text-xs tracking-widest text-teal-200 uppercase">360° winding course / Surface gravity</p>
    </main>
  )
}
