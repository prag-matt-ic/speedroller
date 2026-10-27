import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const react = { useRef: (current) => ({ current }), useMemo: (create) => create() }
const GalaxyMarble = () => null
const surface = { topology: 'cylinder', columns: 132 }
const confirmationProgress = { current: 0.4 }
const game = { paletteIndex: 2, confirmingPaletteIndex: 5 }
const { SCENE_CONFIGS, SceneQuality } = loadTypeScript('components/PerformanceProvider.tsx')
const performance = {
  sceneConfig: SCENE_CONFIGS[SceneQuality.MEDIUM],
  sceneQuality: SceneQuality.MEDIUM,
}
const shared = {
  react,
  './GalaxyMarble': { GalaxyMarble },
  '@/hooks/useCourseSurface': { useCourseSurface: () => surface },
  '@/components/PerformanceProvider': {
    SceneQuality,
    usePerformanceStore: (select) => select(performance),
  },
}

test('local galaxy preserves mesh ref, palette confirmation, course fade inputs and game clock', () => {
  let frame
  const { Marble } = loadTypeScript('components/player/marble/Marble.tsx', {
    ...shared,
    '@/components/GameProvider': { useGameStore: (select) => select(game) },
    '@/hooks/useConfirmationProgress': {
      useConfirmationProgress: () => ({ confirmationProgress }),
    },
    '@/hooks/usePlayerSpeed': {
      __esModule: true,
      default: () => ({ speedUnits: { current: 100 } }),
    },
    '@/hooks/useGameFrame': {
      __esModule: true,
      default: (callback) => {
        frame = callback
      },
    },
    '@/utils/platform/raceSpeed': { RACE_MAX_SPEED: 100 },
  })
  const ref = { current: null }
  const rendered = Marble({ ref })
  assert.equal(rendered.type, GalaxyMarble)
  assert.equal(rendered.props.ref, ref)
  assert.equal(rendered.props.settings.paletteIndex, 2)
  assert.equal(rendered.props.confirmingPaletteIndex, 5)
  assert.equal(rendered.props.confirmationProgress, confirmationProgress)
  assert.equal(rendered.props.surface, surface)
  assert.equal(rendered.props.segments, 40)
  assert.equal(rendered.props.samples, 4)
  assert.equal(rendered.props.starCount, 16)
  assert.equal(rendered.props.rotation, undefined, 'controller owns rotation')
  assert.equal(rendered.props.animationTime.current, 0)
  frame({}, 0.5)
  assert.equal(rendered.props.animationTime.current, 0.5)
  assert.ok(rendered.props.speed.current > 0 && rendered.props.speed.current < 1)
})

test('remote galaxy preserves explicit colour, mesh ref and initial hidden visibility', () => {
  let frame
  const { RemoteMarble } = loadTypeScript('components/player/marble/RemoteMarble.tsx', {
    ...shared,
    '@react-three/fiber': {
      useFrame: (callback) => {
        frame = callback
      },
    },
  })
  const ref = { current: null }
  const rendered = RemoteMarble({ ref, colour: '#DE171B' })
  assert.equal(rendered.type, GalaxyMarble)
  assert.equal(rendered.props.ref, ref)
  assert.equal(rendered.props.colour, '#DE171B')
  assert.equal(rendered.props.samples, 4)
  assert.equal(rendered.props.starCount, 16)
  assert.equal(rendered.props.visible, false)
  assert.equal(rendered.props.rotation, undefined)
  assert.equal(rendered.props.surface, surface)
  frame({}, 0.25)
  assert.equal(rendered.props.animationTime.current, 0.25)
})

test('quality tiers reduce actual marble shader work and drop obsolete surface flags', () => {
  const high = SCENE_CONFIGS[SceneQuality.HIGH].marble
  const medium = SCENE_CONFIGS[SceneQuality.MEDIUM].marble
  const low = SCENE_CONFIGS[SceneQuality.LOW].marble
  assert.deepEqual(high, { segments: 64, samples: 6, starCount: 24 })
  assert.deepEqual(medium, { segments: 40, samples: 4, starCount: 16 })
  assert.deepEqual(low, { segments: 24, samples: 3, starCount: 8 })
})
