import assert from 'node:assert/strict'
import test from 'node:test'
import * as protocol from '../shared/multiplayer/protocol.mts'
import { loadTypeScript } from './loadTypeScript.mjs'

const palette = loadTypeScript('components/palette.ts')
const hooks = {
  useRef: current => ({ current }), useEffect: () => {},
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useCallback: callback => callback, useMemo: create => create(),
  createContext: () => 'context',
}
const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]

test('join profile reads the current saved colour, including a selection made after rendering', () => {
  const sent = []
  const session = { join: (role, profile) => sent.push({ role, profile }) }
  let stateIndex = 0
  const state = { username: 'PlayerOne', paletteIndex: 0, prepareMultiplayer() {} }
  const { MultiplayerProvider } = loadTypeScript('components/multiplayer/MultiplayerProvider.tsx', {
    react: { ...hooks, useState: initial => [stateIndex++ === 0 ? session : initial, () => {}] },
    zustand: {}, 'zustand/vanilla': { createStore: () => ({}) },
    '@/components/GameProvider': { useGameStore: select => select(state), useGameStoreAPI: () => ({ getState: () => state }) },
    '@/utils/platform/raceMarkers': {}, '@/utils/player': {},
    '@/utils/multiplayer/session': {}, '@/utils/multiplayer/raceBridge': {},
    './MultiplayerCountdown': {}, './SpectatorControls': {}, './MultiplayerOverlay': {},
  })
  const { join } = MultiplayerProvider({}).props.value
  for (let index = 0; index < palette.PLAYER_BASE_COLOURS.length; index++) {
    state.paletteIndex = index
    join('racer')
    assert.deepEqual(sent.at(-1), { role: 'racer', profile: { name: 'PlayerOne', colour: palette.PLAYER_BASE_COLOURS[index] } })
  }
  join('spectator')
  assert.equal(sent.at(-1).profile.colour, palette.PLAYER_BASE_COLOURS.at(-1))
})

test('join swatches show the saved selection and update the store without changing name validation', () => {
  const state = { username: 'PlayerOne', paletteIndex: 3, setPaletteIndex: index => { state.paletteIndex = index } }
  let isValid = false
  const { MultiplayerOverlay } = loadTypeScript('components/multiplayer/MultiplayerOverlay.tsx', {
    react: hooks,
    '@/shared/multiplayer/protocol.mts': protocol,
    '@/components/GameProvider': { useGameStore: select => select(state) },
    '@/components/ui/Button': { default: 'button' }, '@/components/ui/PointerProvider': { PointerProvider: 'div' },
    '@/components/ui/input/Input': { Input: 'input' },
    '@/components/ui/input/useUsernameInput': { useUsernameInput: () => ({ isValid }) },
    '@/utils/multiplayer/session': { canStartRace: () => false },
    './MultiplayerProvider': {
      useMultiplayer: () => ({}),
      useRoomState: select => select({ status: 'preview', info: { phase: 'waiting', racers: 1, spectators: 0 } }),
    },
  })
  const render = () => elements(MultiplayerOverlay())
  const buttons = render().filter(node => node.props?.['aria-pressed'] !== undefined)
  assert.equal(buttons.length, 8)
  assert.equal(buttons.filter(button => button.props['aria-pressed']).length, 1)
  assert.equal(buttons[3].props['aria-pressed'], true)
  for (const button of buttons) {
    assert.equal(button.type, 'button')
    assert.equal(button.props.type, 'button')
    assert.ok(button.props['aria-label'])
  }
  buttons[6].props.onClick()
  assert.equal(state.paletteIndex, 6)
  assert.equal(render().find(node => node.props?.['aria-label'] === 'Pink').props['aria-pressed'], true)
  assert.equal(render().find(node => node.props?.children === 'Join race').props.disabled, true)
  isValid = true
  assert.equal(render().find(node => node.props?.children === 'Join race').props.disabled, false)
})

// Evaluate the shared shader's colour path numerically without requiring a GPU.
class Value {
  constructor(value) { this.value = value }
  op(other, operation) {
    const right = other instanceof Value ? other.value : other
    return new Value(Array.isArray(this.value) ? this.value.map((value, index) => operation(value, Array.isArray(right) ? right[index] : right)) : operation(this.value, right))
  }
  add(other) { return this.op(other, (a, b) => a + b) }
  sub(other) { return this.op(other, (a, b) => a - b) }
  mul(other) { return this.op(other, (a, b) => a * b) }
  div(other) { return this.op(other, (a, b) => a / b) }
  clamp(low, high) { return new Value(Math.max(Number(low), Math.min(Number(high), this.value))) }
  greaterThanEqual(other) { return new Value(this.value >= other) }
  greaterThan(other) { return new Value(this.value > other) }
  and(other) { return new Value(this.value && other.value) }
  normalize() { return this }
  toConst() { return this }
  valueOf() { return this.value }
}

test('remote marble shading keeps each supplied colour independent, including legacy teal', () => {
  let sample = 0
  const { createMarbleNodes } = loadTypeScript('components/player/marble/createMarbleNodes.ts', {
    'three/tsl': {
      vec3: (...values) => new Value(values.length === 1 ? Array(3).fill(values[0]) : values),
      vec4: () => ({}), float: value => new Value(value),
      clamp: (value, low, high) => value.clamp(low, high),
      mix: (a, b, amount) => a.add(b.sub(a).mul(amount)),
      positionGeometry: new Value([0, 0, 0]),
      mx_noise_float: () => new Value(sample * 2 - 1),
      modelWorldMatrix: { mul: () => ({ xyz: {} }) },
      vertexStage: value => value,
    },
    '@/resources/tsl/courseSurface': { worldCourseNode: () => ({ y: new Value(0) }) },
    '@/resources/tsl/playerPalette': { getColourFromPalette: () => { throw new Error('Remote colours must not read the local palette') } },
  })
  const uniforms = { uTime: new Value(0), uSpeed: new Value(0), uConfirmingProgress: new Value(1), uConfirmingPaletteIndex: new Value(4) }
  for (const colour of [...palette.PLAYER_BASE_COLOURS, '#37d6c7']) {
    const stops = palette.createPaletteStops(colour)
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      sample = t
      const nodes = createMarbleNodes(uniforms, { colour, isFlat: true, enableVeins: false, surface: { topology: 'flat', columns: 33 } })
      const segment = Math.min(1, Math.floor(t * 2))
      const expected = stops[segment].map((value, channel) => value + (stops[segment + 1][channel] - value) * (t * 2 - segment))
      nodes.colorNode.value.forEach((value, channel) => assert.ok(Math.abs(value - expected[channel]) < 1e-10))
      nodes.emissiveNode.value.forEach((value, channel) => assert.ok(Math.abs(value - expected[channel] * 0.35) < 1e-10))
    }
  }
})
