import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createStore } from 'zustand/vanilla'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createGameSlice } = loadTypeScript('stores/gameSlice.ts', {
  './playerSlice': { PLAYER_INITIAL_POSITION: [0, 4, 0], RESET_PLAYER_STATE: {} },
  './timeSlice': { RESET_TIME_STATE: {} },
})
const { selectCameraPoseOverride, isLocalPlayerContact } = loadTypeScript('utils/camera/cameraPose.ts')
const pose = { position: [0, 2, 9], target: [0, 0, 0], up: [0, 1, 0], zoom: 1 }
const makeStore = () => createStore((set, get) => ({
  ...createGameSlice()(set, get), overlay: 'none', speedRunStage: 'lobby', playerStatus: 'safe', isSpectating: false,
}))

test('latest sensor wins; late exits and duplicate entries preserve the active pose', () => {
  const store = makeStore(), setPose = store.getState().setCameraPoseOverride
  setPose('first', pose); setPose('second', { ...pose, zoom: 2 })
  setPose('first', pose)
  assert.equal(selectCameraPoseOverride(store.getState()).id, 'second')
  setPose('first', null)
  assert.equal(selectCameraPoseOverride(store.getState()).id, 'second')
  setPose('second', null)
  assert.equal(selectCameraPoseOverride(store.getState()), null)
  setPose('first', pose); setPose('second', { ...pose, zoom: 2 }); setPose('second', null)
  assert.equal(selectCameraPoseOverride(store.getState()).id, 'first')
})

test('modal views suspend poses; gameplay, respawn and spectator states cannot use them', () => {
  const store = makeStore()
  store.getState().setCameraPoseOverride('podium', pose)
  for (const patch of [{ overlay: 'dashboard' }, { speedRunStage: 'running' }, { playerStatus: 'respawning' }, { isSpectating: true }]) {
    const state = store.getState()
    assert.equal(selectCameraPoseOverride({ ...state, ...patch }), null)
    assert.equal(selectCameraPoseOverride(state).id, 'podium')
  }
  store.setState({ stopConfirmation() {} })
  store.getState().setRowsData([], {})
  assert.deepEqual(store.getState().cameraPoseOverrides, [])
})

test('shared sensor covers its floor area, filters contacts, and releases on unmount and disable', async () => {
  const { default: Rapier } = await import('@dimforge/rapier3d-compat')
  const { Quaternion } = await import('three')
  await Rapier.init()
  const { CYLINDER_SURFACE: surface, courseToWorld } = loadTypeScript('utils/platform/courseSurface.ts')
  const { useCoursePlacement: placeOnCourse } = loadTypeScript('hooks/useCoursePlacement.ts', {
    react: { useMemo: compute => compute() },
    './useCourseSurface': { useCourseSurface: () => surface },
  })
  const store = makeStore(), effects = []
  const RigidBody = () => null, CuboidCollider = () => null
  const { CameraPoseSensor } = loadTypeScript('components/CameraPoseSensor.tsx', {
    react: { useId: () => 'sensor', useCallback: fn => fn, useEffect: fn => effects.push(fn), useMemo: fn => fn(), useState: () => [false, () => {}] },
    '@gsap/react': { useGSAP() {} },
    '@react-three/tsl': { useUniforms: () => ({ uShowProgress: { value: 0 } }), useLocalNodes: () => ({}) },
    '@/components/PerformanceProvider': { usePerformanceStore: selector => selector({ sceneConfig: { isDistanceFadeEnabled: false } }) },
    '@/hooks/useCourseSurface': { useCourseSurface: () => ({}) },
    '@/utils/platform/coursePlaneGeometry': { createLocalCoursePanelGeometry: () => ({ dispose() {} }) },
    '@/components/coreUniforms': { CORE_UNIFORM_SCOPE: 'core' },
    '@/resources/tsl/fadeInOut': {},
    '@/resources/tsl/paintCorners': {},
    '@react-three/rapier': { RigidBody, CuboidCollider },
    '@/components/GameProvider': { useGameStoreAPI: () => store, useGameStore: selector => selector(store.getState()) },
    '@/hooks/useCoursePlacement': { useCoursePlacement: placeOnCourse },
    '@/utils/collisionGroups': { COLLISION_GROUPS: { infoZoneSensor: 1 } },
  })
  const { LOBBY_PODIUM_SENSOR, lobbyPosition } = loadTypeScript('utils/platform/lobbyLayout.ts')
  let enters = 0, exits = 0
  const props = { onEnter: () => enters++, onExit: () => exits++, position: lobbyPosition(LOBBY_PODIUM_SENSOR, surface.columns), halfExtents: [2.5, 1, 1.5], pose }
  const tree = CameraPoseSensor(props)
  const { onIntersectionEnter: enter, onIntersectionExit: exit } = tree.props.children[0].props
  const world = new Rapier.World({ x: 0, y: 0, z: 0 })
  try {
    const rotation = new Quaternion().setFromEuler(tree.props.rotation)
    const position = tree.props.position
    const fixed = world.createRigidBody(Rapier.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z).setRotation(rotation))
    const sensor = world.createCollider(Rapier.ColliderDesc.cuboid(...tree.props.children[0].props.args)
      .setSensor(true).setActiveCollisionTypes(Rapier.ActiveCollisionTypes.DEFAULT | Rapier.ActiveCollisionTypes.KINEMATIC_FIXED), fixed)
    const player = world.createRigidBody(Rapier.RigidBodyDesc.kinematicPositionBased())
    const ball = world.createCollider(Rapier.ColliderDesc.ball(0.45), player)
    for (const [x, z, expected] of [[-2, -1, true], [2, -1, true], [-2, 1, true], [2, 1, true], [0, 0, true], [-3.5, 0, false], [3.5, 0, false], [0, -2.5, false], [0, 2.5, false]]) {
      const target = courseToWorld(props.position[0] + x, props.position[1] + 0.45, props.position[2] + z, surface, { x: 0, y: 0, z: 0 })
      player.setNextKinematicTranslation(target)
      world.step()
      world.step()
      assert.equal(world.intersectionPair(sensor, ball), expected, `sensor footprint at ${x}, ${z}`)
    }
  } finally {
    world.free()
  }
  const contact = type => ({ other: { rigidBodyObject: { userData: { type } } } })
  assert.equal(isLocalPlayerContact({ other: {} }), false)
  enter(contact('remote-player')); enter(contact('ring'))
  assert.equal(store.getState().cameraPoseOverrides.length, 0)
  enter(contact('player')); assert.equal(store.getState().cameraPoseOverrides.length, 1)
  exit(contact('ring')); assert.equal(store.getState().cameraPoseOverrides.length, 1)
  exit(contact('player')); assert.equal(store.getState().cameraPoseOverrides.length, 0)
  enter(contact('player'))
  const cleanups = effects.map(effect => effect())
  cleanups.forEach(cleanup => cleanup?.())
  assert.equal(store.getState().cameraPoseOverrides.length, 0)
  enter(contact('player')); effects.length = 0
  const disabled = CameraPoseSensor({ ...props, enabled: false })
  assert.equal(disabled.props.children[0], false)
  assert.equal(disabled.props.children[1].type, 'mesh')
  effects.forEach(effect => effect())
  assert.equal(store.getState().cameraPoseOverrides.length, 0)
  assert.equal(enters, 3)
  assert.equal(exits, 1)
  const info = CameraPoseSensor({ ...props, pose: undefined })
  info.props.children[0].props.onIntersectionEnter(contact('player'))
  assert.equal(enters, 4)
  assert.equal(store.getState().cameraPoseOverrides.length, 0)
  info.props.children[0].props.onIntersectionExit(contact('player'))
  assert.equal(exits, 2)
})
