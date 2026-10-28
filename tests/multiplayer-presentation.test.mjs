import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './loadTypeScript.mjs'

test('spectator consumers read the shared rendered pose each frame, switch immediately and restore the grid', () => {
  const effects = [], frames = [], updates = []
  let subscription
  const state = { isSpectating: true, playerPosition: [0, 0, 0] }
  const room = { followId: 'a' }
  const poses = { a: { latest: {}, position: [1, 2, 3] }, b: { latest: {}, position: [4, 5, 6] } }
  const session = { store: { getState: () => room }, getRenderedPose: id => poses[id] }
  const { usePlayerPosition } = loadTypeScript('hooks/usePlayerPosition.ts', {
    react: { useRef: value => ({ current: value }), useEffect: effect => effects.push(effect) },
    '@react-three/fiber': { useFrame: (callback, priority) => { assert.equal(priority, -90); frames.push(callback) } },
    '@/components/GameProvider': { useGameStoreAPI: () => ({ getState: () => state, subscribe: (_, callback) => { subscription = callback; return () => {} } }) },
    '@/components/multiplayer/MultiplayerProvider': { useOptionalMultiplayer: () => ({ session }) },
  })
  const { playerPosition } = usePlayerPosition(value => updates.push(value))
  effects.forEach(effect => effect())
  frames[0]()
  assert.equal(playerPosition.current, poses.a.position, 'same tuple used by remote marble, not a separate sampler')
  poses.a.position[0] = 1.5; frames[0]()
  assert.equal(playerPosition.current[0], 1.5, 'moves between network updates')
  subscription([90, 0, 0]); assert.equal(playerPosition.current, poses.a.position)
  room.followId = 'b'; frames[0](); assert.equal(playerPosition.current, poses.b.position)
  room.followId = null; frames[0](); assert.equal(playerPosition.current, state.playerPosition)
  state.isSpectating = false
  const local = [9, 8, 7]; subscription(local); frames[0]()
  assert.equal(playerPosition.current, local)
  assert.equal(updates.at(-1), local)
})
