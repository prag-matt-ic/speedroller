import { loadTypeScript } from './loadTypeScript.mjs'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import { createStore } from 'zustand/vanilla'
import { subscribeWithSelector } from 'zustand/middleware'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Loads the TypeScript modules under test in memory, resolving `@/` aliases and relative
// `.ts` imports. Overrides replace browser-only sound/player dependencies with small stubs.
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

const MOVE_HUD_CONFIG_STUB = {
  keyboard: { id: 'move-keys' },
  joystick: { id: 'move-joystick' },
}

function createRaceStore({ username = 'racer123', insertSpeedRun } = {}) {
  const load = createTypeScriptLoader({
    '@/resources/content/hud': { MOVE_HUD_CONFIG: MOVE_HUD_CONFIG_STUB },
    '@/stores/playerSlice': {
      PLAYER_INITIAL_POSITION: [0, 4, 0],
    },
  })

  const { PLATFORM_DATA } = load('resources/rowsData.ts')
  const { createTimeSlice, RESET_TIME_STATE } = load('stores/timeSlice.ts')
  const { Overlay, SpeedRunStage, Stage } = load('stores/types.ts')
  const { PLAYER_RESTING_Y } = load('utils/player.ts')
  const { rowToWorldZ } = load('utils/tiles.ts')
  const { findRaceMarkers } = load('utils/platform/raceMarkers.ts')

  const rowsData = PLATFORM_DATA.modes.speedrun.rows
  const markers = findRaceMarkers(rowsData)
  const submissionCalls = []
  const playerResetCalls = { confirmation: 0, speed: 0 }

  const insertStub = (submission) => {
    submissionCalls.push(submission)
    return insertSpeedRun(submission)
  }

  const baseState = {
    ...RESET_TIME_STATE,
    attemptId: 0,
    attemptInputType: null,
    totalTimeS: 0,
    completedSpeedRuns: {},
    platformVersion: PLATFORM_DATA.version,
    rowsData,
    courseSurface: PLATFORM_DATA.modes.speedrun.surface,
    totalCounts: PLATFORM_DATA.modes.speedrun.totalCounts,
    speedRunStage: SpeedRunStage.LOBBY,
    overlay: Overlay.NONE,
    stage: Stage.HOME,
    currentRow: 0,
    isPlatformReady: true,
    isWarmupComplete: true,
    username,
    playerStatus: 'safe',
    playerRespawnTick: 0,
    playerPosition: [0, 4, 0],
    spawnPosition: null,
    playerSpeedUnits: 8,
    inputType: 'keyboard',
    collectedRings: {},
    hasCollectedAllRings: false,
    outOfBoundsEvents: [],
    confirmingCollectible: null,
    confirmingPaletteIndex: null,
    confirmationProgress: 0,
    hudIndicator: null,
    cameraLookAtPosition: null,
    stopConfirmation: () => {
      playerResetCalls.confirmation += 1
    },
    resetPlayerSpeedState: () => {
      playerResetCalls.speed += 1
    },
  }

  const store = createStore(
    subscribeWithSelector((set, get) => ({
      ...baseState,
      ...createTimeSlice(insertStub)(set, get, undefined),
    })),
  )

  return {
    store,
    rowsData,
    markers,
    PLATFORM_DATA,
    Overlay,
    SpeedRunStage,
    Stage,
    PLAYER_RESTING_Y,
    rowToWorldZ,
    submissionCalls,
    playerResetCalls,
  }
}

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const flushAsync = () => new Promise((resolve) => setTimeout(resolve, 0))

const createSavedRun = (overrides = {}) => ({
  id: 77,
  username: 'racer123',
  time: 12.34,
  date: new Date().toISOString(),
  attempt: 1,
  input_type: 'keyboard',
  level_id: '1.3.0',
  accidents: 0,
  rings: 0,
  ip: '127.0.0.1',
  country: null,
  flag: null,
  ...overrides,
})

test('race lifecycle: valid name starts countdown, GO sets the timing origin', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, markers, SpeedRunStage, Overlay, PLAYER_RESTING_Y } = race

  store.getState().enterStartLine()
  let state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.COUNTDOWN)
  assert.equal(state.overlay, Overlay.SPEEDRUN_COUNTDOWN)
  assert.equal(state.attemptId, 1)
  assert.equal(state.playerStatus, 'respawning')
  const { getStartGridPosition } = loadTypeScript('utils/platform/raceMarkers.ts')
  assert.deepEqual(state.spawnPosition, getStartGridPosition(race.rowsData, PLAYER_RESTING_Y, race.PLATFORM_DATA.modes.speedrun.surface))
  assert.equal(state.collectedRings && Object.keys(state.collectedRings).length, 0)

  // A stale countdown from another attempt must be ignored.
  state.onCountdownComplete(99)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.COUNTDOWN)

  state.onCountdownComplete(1)
  state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.RUNNING)
  assert.equal(state.overlay, Overlay.NONE)
  assert.ok(typeof state.attemptStartedAtMs === 'number')
  assert.equal(state.speedRunTimeCS, 0)
})

test('race lifecycle: finish snapshots the result once, saves it, and reaches END', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage, submissionCalls } = race

  store.getState().enterStartLine()
  store.getState().onCountdownComplete(1)
  await new Promise((resolve) => setTimeout(resolve, 20))

  store.getState().finishSpeedRun(999) // Wrong attempt: ignored.
  assert.equal(store.getState().speedRunStage, SpeedRunStage.RUNNING)

  store.getState().finishSpeedRun(1)
  let state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.SUBMITTING)
  assert.equal(state.saveStatus, 'saving')
  assert.ok(state.attemptResult)
  assert.ok(state.attemptResult.timeSeconds > 0)
  assert.equal(state.attemptResult.username, 'racer123')
  assert.equal(submissionCalls.length, 1)
  assert.equal(submissionCalls[0].level_id, '1.3.0')

  // Repeated finish contacts cannot submit twice.
  store.getState().finishSpeedRun(1)
  assert.equal(submissionCalls.length, 1)

  submission.resolve(createSavedRun())
  await flushAsync()
  state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.END)
  assert.equal(state.saveStatus, 'saved')
  assert.equal(state.completedSpeedRuns['1.3.0'].length, 1)
  assert.equal(state.completedSpeedRuns['1.3.0'][0].id, 77)
})

test('race lifecycle: retry resets the attempt and a late save cannot change it', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage, Overlay, markers, PLAYER_RESTING_Y } = race

  store.setState({ paletteIndex: 2 })
  store.getState().enterStartLine()
  store.getState().onCountdownComplete(1)
  await new Promise((resolve) => setTimeout(resolve, 20))
  store.getState().finishSpeedRun(1)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.SUBMITTING)

  store.getState().retryRace()
  let state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.COUNTDOWN)
  assert.equal(state.overlay, Overlay.SPEEDRUN_COUNTDOWN)
  assert.equal(state.attemptId, 2)
  assert.equal(state.attemptResult, null)
  assert.equal(state.saveStatus, 'idle')
  assert.equal(state.speedRunTimeCS, 0)
  assert.equal(state.paletteIndex, 2)
  assert.deepEqual(Object.keys(state.collectedRings), [])
  const { getStartGridPosition } = loadTypeScript('utils/platform/raceMarkers.ts')
  assert.deepEqual(state.spawnPosition, getStartGridPosition(race.rowsData, PLAYER_RESTING_Y, race.PLATFORM_DATA.modes.speedrun.surface))

  submission.resolve(createSavedRun({ id: 88 }))
  await flushAsync()
  state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.COUNTDOWN)
  assert.equal(state.saveStatus, 'idle')
  assert.equal(state.attemptResult, null)
  // A late successful response still appends to history.
  assert.equal(state.completedSpeedRuns['1.3.0'].length, 1)
  assert.equal(state.completedSpeedRuns['1.3.0'][0].id, 88)
})

test('race lifecycle: missing name opens setup, cancel returns to lobby row 22', () => {
  const submission = deferred()
  const race = createRaceStore({ username: null, insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage, Overlay, rowToWorldZ, PLAYER_RESTING_Y } = race

  store.getState().enterStartLine()
  let state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.START)
  assert.equal(state.overlay, Overlay.SPEEDRUN_START)
  assert.equal(state.attemptId, 1)

  // The form must be valid before a countdown begins.
  store.getState().startCountdown()
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)

  store.getState().cancelStartLine()
  state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.LOBBY)
  assert.equal(state.overlay, Overlay.NONE)
  assert.equal(state.attemptId, 2)
  assert.deepEqual(state.spawnPosition, [0, PLAYER_RESTING_Y, rowToWorldZ(22)])
  assert.equal(state.speedRunTimeCS, 0)
})

test('race lifecycle: back to lobby restores the entrance spawn and clears the attempt', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage, Overlay } = race

  store.getState().enterStartLine()
  store.getState().onCountdownComplete(1)
  store.setState({ collectedRings: { '32:16': true }, outOfBoundsEvents: [{ hudId: null, timestamp: 1 }] })
  assert.equal(store.getState().collectedRings['32:16'], true)

  store.getState().returnToLobby()
  const state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.LOBBY)
  assert.equal(state.overlay, Overlay.NONE)
  assert.deepEqual(state.spawnPosition, [0, 4, 0])
  assert.deepEqual(Object.keys(state.collectedRings), [])
  assert.deepEqual(state.outOfBoundsEvents, [])
  assert.equal(state.attemptResult, null)
  assert.equal(state.speedRunTimeCS, 0)
  assert.equal(state.attemptId, 2)
})

test('race lifecycle: lobby contacts and pre-GO finish contacts are ignored', () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage } = race

  store.getState().finishSpeedRun()
  assert.equal(store.getState().speedRunStage, SpeedRunStage.LOBBY)

  store.getState().enterStartLine()
  store.getState().enterStartLine() // repeated contact must not restart the attempt
  assert.equal(store.getState().attemptId, 1)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.COUNTDOWN)

  store.getState().finishSpeedRun(1)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.COUNTDOWN)
})

test('race lifecycle: a failed save keeps the current result and shows Time not saved', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage } = race

  store.getState().enterStartLine()
  store.getState().onCountdownComplete(1)
  await new Promise((resolve) => setTimeout(resolve, 20))
  store.getState().finishSpeedRun(1)

  const submittedResult = store.getState().attemptResult
  const submittedCentiseconds = store.getState().speedRunTimeCS
  assert.ok(submittedResult)

  const originalConsoleError = console.error
  console.error = () => {}
  submission.reject(new Error('database unavailable'))
  await flushAsync()
  console.error = originalConsoleError

  const state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.END)
  assert.equal(state.saveStatus, 'failed')
  assert.equal(state.attemptResult, submittedResult)
  assert.equal(state.speedRunTimeCS, submittedCentiseconds)
  assert.deepEqual(state.completedSpeedRuns, {})
})
