import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { createStore } from 'zustand/vanilla'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Loads the TypeScript modules under test in memory, resolving `@/` aliases and relative `.ts`
// imports. Browser-only dependencies of the player slice are stubbed so the store logic runs in
// Node without GSAP or sound.
function createTypeScriptLoader(overrides = {}) {
  const cache = new Map()

  function load(relativePath) {
    const filename = path.resolve(projectRoot, relativePath)
    if (cache.has(filename)) return cache.get(filename).exports
    const loaded = new Module(filename)
    loaded.filename = filename
    loaded.paths = Module._nodeModulePaths(path.dirname(filename))
    cache.set(filename, loaded)
    const nativeRequire = createRequire(filename)
    loaded.require = (specifier) => {
      if (Object.hasOwn(overrides, specifier)) return overrides[specifier]
      if (specifier.startsWith('@/')) return load(`${specifier.slice(2)}.ts`)
      if (specifier.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), specifier)
        const candidates = [`${resolved}.ts`, path.join(resolved, 'index.ts')]
        const match = candidates.find((candidate) => {
          try {
            readFileSync(candidate)
            return true
          } catch {
            return false
          }
        })
        if (match) return load(path.relative(projectRoot, match))
      }
      return nativeRequire(specifier)
    }
    const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    })
    loaded._compile(outputText, filename)
    return loaded.exports
  }

  return load
}

const load = createTypeScriptLoader({
  gsap: {
    default: {
      fromTo: () => ({ kill: () => {} }),
      to: () => ({ kill: () => {} }),
    },
  },
  '@/components/SoundProvider': {
    SoundFX: {
      CHANGE_COLOUR: 'change-colour',
      OPEN_INFO: 'open-info',
      OUT_OF_BOUNDS: 'out-of-bounds',
    },
  },
  '@/components/palette': {
    clampPaletteIndexSafe: (index) => Math.max(0, Math.min(5, index)),
  },
  '@/resources/content/hud': {
    getOutOfBoundsMessage: () => null,
  },
})

const { createPlayerSlice } = load('stores/playerSlice.ts')
const { SpeedRunStage } = load('stores/types.ts')

const RING_COUNT = 60

function createPlayerStore() {
  const playerSlice = createPlayerSlice({
    isMobile: false,
    insertSpeedRun: () => null,
    playSoundFX: () => {},
    stopSoundFX: () => {},
  })

  return createStore((set, get) => ({
    ...playerSlice(set, get),
    speedRunStage: SpeedRunStage.LOBBY,
    totalCounts: { rings: RING_COUNT },
  }))
}

test('lobby rings count towards the attempt but never grant race boost', () => {
  const store = createPlayerStore()

  store.getState().onRingCollected([10, 5])

  assert.equal(store.getState().collectedRings['10:5'], true)
  assert.equal(store.getState().ringBoostTick, 0)
})

test('each newly collected race ring advances the boost tick exactly once', () => {
  const store = createPlayerStore()
  store.setState({ speedRunStage: SpeedRunStage.RUNNING })

  store.getState().onRingCollected([10, 5])
  assert.equal(store.getState().ringBoostTick, 1)

  // A repeated contact for the same ring must not grant a second boost.
  store.getState().onRingCollected([10, 5])
  assert.equal(store.getState().ringBoostTick, 1)

  store.getState().onRingCollected([12, 5])
  assert.equal(store.getState().ringBoostTick, 2)
})

test('reset clears the published speed and boost but keeps the tick monotonic', () => {
  const store = createPlayerStore()
  store.setState({
    speedRunStage: SpeedRunStage.RUNNING,
    playerSpeedUnits: 23.4,
    playerBoostUnits: 6,
  })
  store.getState().onRingCollected([10, 5])
  const tickBeforeReset = store.getState().ringBoostTick

  store.getState().resetPlayerSpeedState()

  assert.equal(store.getState().playerSpeedUnits, 0)
  assert.equal(store.getState().playerBoostUnits, 0)
  // The player rebases its cursor on respawn; a reset must not replay the last ring's boost.
  assert.equal(store.getState().ringBoostTick, tickBeforeReset)
})

test('a fall clears momentum and boost', () => {
  const store = createPlayerStore()
  store.setState({
    speedRunStage: SpeedRunStage.RUNNING,
    playerStatus: 'safe',
    playerSpeedUnits: 27,
    playerBoostUnits: 8,
  })

  store.getState().onOutOfBounds()

  assert.equal(store.getState().playerStatus, 'out-of-bounds')
  assert.equal(store.getState().playerSpeedUnits, 0)
  assert.equal(store.getState().playerBoostUnits, 0)
})

test('the speed setters ignore repeated identical values', () => {
  const store = createPlayerStore()
  let notifications = 0
  const unsubscribe = store.subscribe(() => {
    notifications += 1
  })

  store.getState().setPlayerSpeedUnits(12.5)
  store.getState().setPlayerSpeedUnits(12.5)
  store.getState().setPlayerBoostUnits(3)
  store.getState().setPlayerBoostUnits(3)

  unsubscribe()
  assert.equal(notifications, 2)
  assert.equal(store.getState().playerSpeedUnits, 12.5)
  assert.equal(store.getState().playerBoostUnits, 3)
})
