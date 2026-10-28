import { loadTypeScript } from './loadTypeScript.mjs'

const { PLATFORM_VERSION } = loadTypeScript('resources/rowsData.ts')
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
  level_id: PLATFORM_VERSION,
  accidents: 0,
  rings: 0,
  ip: '127.0.0.1',
  country: null,
  flag: null,
  ...overrides,
})

test('race lifecycle: saved name sees mode choice, solo selection starts countdown', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, markers, SpeedRunStage, Overlay, PLAYER_RESTING_Y } = race

  store.getState().enterStartLine()
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  assert.equal(store.getState().overlay, Overlay.SPEEDRUN_START)
  store.getState().startCountdown()
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
  store.getState().startCountdown()
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
  assert.equal(submissionCalls[0].level_id, PLATFORM_VERSION)

  // Repeated finish contacts cannot submit twice.
  store.getState().finishSpeedRun(1)
  assert.equal(submissionCalls.length, 1)

  submission.resolve(createSavedRun())
  await flushAsync()
  state = store.getState()
  assert.equal(state.speedRunStage, SpeedRunStage.END)
  assert.equal(state.saveStatus, 'saved')
  assert.equal(state.completedSpeedRuns[PLATFORM_VERSION].length, 1)
  assert.equal(state.completedSpeedRuns[PLATFORM_VERSION][0].id, 77)
})

test('race lifecycle: retry resets the attempt and a late save cannot change it', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage, Overlay, markers, PLAYER_RESTING_Y } = race

  store.setState({ paletteIndex: 2 })
  store.getState().enterStartLine()
  store.getState().startCountdown()
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
  assert.equal(state.completedSpeedRuns[PLATFORM_VERSION].length, 1)
  assert.equal(state.completedSpeedRuns[PLATFORM_VERSION][0].id, 88)
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
  store.getState().startCountdown()
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
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  store.getState().startCountdown()

  store.getState().finishSpeedRun(1)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.COUNTDOWN)
})

test('race lifecycle: a failed save keeps the current result and shows Time not saved', async () => {
  const submission = deferred()
  const race = createRaceStore({ insertSpeedRun: () => submission.promise })
  const { store, SpeedRunStage } = race

  store.getState().enterStartLine()
  store.getState().startCountdown()
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


test('race lifecycle: multiplayer room freezes the attempt and cannot submit solo results', () => {
  const race = createRaceStore({ insertSpeedRun: () => Promise.resolve(null) })
  const { store, SpeedRunStage, Overlay, submissionCalls } = race
  store.getState().prepareMultiplayer()
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  assert.equal(store.getState().overlay, Overlay.MULTIPLAYER)
  store.getState().startCountdown()
  store.getState().onCountdownComplete(store.getState().attemptId)
  store.getState().finishSpeedRun()
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  assert.equal(submissionCalls.length, 0)
  store.getState().returnToLobby()
  assert.equal(store.getState().overlay, Overlay.NONE)
})

test('multiplayer GO preserves the shared origin; unconfirmed finishes do not save', () => {
  const { store, Overlay, SpeedRunStage, submissionCalls } = createRaceStore()
  store.getState().prepareMultiplayer()
  store.setState({ playerStatus: 'safe' })
  const start = performance.now() - 1000
  store.getState().scheduleMultiplayerRace('race-one', start)
  const attempt = store.getState().attemptId
  store.getState().onCountdownComplete(attempt)
  store.getState().startMultiplayerRace('old-race', start + 1)
  store.getState().startMultiplayerRace('race-one', start - 1)
  assert.equal(store.getState().overlay, Overlay.MULTIPLAYER_COUNTDOWN)
  store.getState().startMultiplayerRace('race-one', start + 1000)
  assert.equal(store.getState().attemptStartedAtMs, start)
  store.getState().finishSpeedRun(attempt - 1)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.RUNNING)
  store.getState().finishSpeedRun(attempt)
  const result = store.getState().multiplayerFinish
  assert.ok(result.elapsedMs >= 1000)
  store.getState().finishSpeedRun(attempt)
  store.getState().retryRace()
  assert.equal(store.getState().multiplayerFinish, result)
  assert.equal(store.getState().overlay, Overlay.MULTIPLAYER)
  assert.equal(submissionCalls.length, 0)
  assert.deepEqual(store.getState().completedSpeedRuns, {})
  store.getState().prepareMultiplayer()
  assert.equal(store.getState().multiplayerFinish, null)
  assert.equal(store.getState().multiplayerRaceId, null)
  store.getState().stopMultiplayerRace('race-one')
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
})

test('multiplayer bridge handles hidden GO, countdown cancellation, rematch and connection loss', () => {
  const { bindMultiplayerRace } = loadTypeScript('utils/multiplayer/raceBridge.ts')
  const { store, SpeedRunStage } = createRaceStore()
  store.getState().prepareMultiplayer()
  store.setState({ _isHydrated: true, playerStatus: 'safe' })
  let hidden = true
  let now = 1100
  const snapshot = { selfId: 'me', members: [{ id: 'me', role: 'racer' }], raceId: 'first', startAt: 1500, phase: 'countdown', entrants: [{ id: 'me', status: 'racing' }] }
  const room = createStore(() => ({ status: 'joined', clockOffset: 500, snapshot }))
  const poses = []; const readiness = []
  const session = { store: room, setReady: ready => readiness.push(ready), publishPose: (...args) => poses.push(args), finish() {} }
  const bridge = bindMultiplayerRace(store, session, { now: () => now, hidden: () => hidden, automaticTick: false })
  assert.equal(store.getState().speedRunStage, SpeedRunStage.COUNTDOWN)
  hidden = false; bridge.tick()
  assert.equal(store.getState().attemptStartedAtMs, 1000)
  assert.equal(poses.length, 1)
  room.setState({ snapshot: { ...snapshot, phase: 'waiting', raceId: null } })
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  assert.equal(readiness.at(-1), false, 'rematch must wait for grid placement')
  store.setState({ playerStatus: 'safe' }); bridge.tick()
  assert.equal(readiness.at(-1), true)
  room.setState({ snapshot: { ...snapshot, raceId: 'second' } })
  assert.equal(store.getState().multiplayerRaceId, 'second')
  room.setState({ status: 'error' })
  assert.equal(store.getState().speedRunStage, SpeedRunStage.END)
  bridge.dispose()
})

test('spectator bridge bootstraps late poses without racing, follows switches and resets on rematch', () => {
  const { bindMultiplayerRace } = loadTypeScript('utils/multiplayer/raceBridge.ts')
  const { store, Overlay, SpeedRunStage, submissionCalls } = createRaceStore()
  store.setState({ _isHydrated: true, setOverlay: overlay => store.setState({ overlay }) })
  const snapshot = { selfId: 'watcher', members: [{ id: 'watcher', role: 'spectator' }], raceId: 'late', startAt: 100,
    phase: 'racing', entrants: [{ id: 'one', status: 'racing' }, { id: 'two', status: 'racing' }] }
  const room = createStore(() => ({ status: 'joined', clockOffset: 0, followId: 'one', snapshot }))
  const buffer = [{ time: 900, pose: { sequence: 4, respawn: 0, position: [4, 1, -200], rotation: [0, 0, 0, 1] } }]
  let published = 0
  const session = { store: room, getPoseBuffer: () => buffer, setReady: () => { throw Error('spectator must not ready') },
    publishPose: () => published++, finish: () => published++ }
  const bridge = bindMultiplayerRace(store, session, { now: () => 1000, automaticTick: false })
  assert.equal(store.getState().isSpectating, true)
  assert.equal(store.getState().overlay, Overlay.SPECTATING)
  assert.equal(store.getState().speedRunStage, SpeedRunStage.START)
  assert.deepEqual(store.getState().playerPosition, [4, 1, -200])
  const firstTick = store.getState().playerRespawnTick
  room.setState({ followId: 'two' })
  assert.equal(store.getState().playerRespawnTick, firstTick + 1)
  buffer[0] = { ...buffer[0], pose: { ...buffer[0].pose, respawn: 1, position: [5, 2, -1000] } }
  bridge.tick()
  assert.equal(store.getState().playerRespawnTick, firstTick + 2)
  assert.deepEqual(store.getState().playerPosition, [5, 2, -1000])
  store.getState().finishSpeedRun(); bridge.tick()
  assert.equal(submissionCalls.length, 0); assert.equal(published, 0)
  room.setState({ snapshot: { ...snapshot, phase: 'results' } })
  assert.equal(store.getState().overlay, Overlay.SPECTATING)
  room.setState({ followId: null, snapshot: { ...snapshot, phase: 'waiting', raceId: null, entrants: [] } })
  assert.notDeepEqual(store.getState().playerPosition, [5, 2, -1000])
  assert.equal(store.getState().isSpectating, true)
  room.setState({ status: 'error' })
  assert.equal(store.getState().overlay, Overlay.MULTIPLAYER)
  bridge.dispose()
  store.getState().returnToLobby()
  assert.equal(store.getState().isSpectating, false)
})

test('spectator asset loading uses the newest snapshot, never the race seen before a rematch', () => {
  const { bindMultiplayerRace } = loadTypeScript('utils/multiplayer/raceBridge.ts')
  const { store, Overlay } = createRaceStore()
  store.setState({ _isHydrated: true, isWarmupComplete: false })
  const snapshot = { selfId: 'watcher', members: [{ id: 'watcher', role: 'spectator' }], raceId: 'old', phase: 'racing' }
  const room = createStore(() => ({ status: 'joined', clockOffset: 0, followId: 'old-racer', snapshot }))
  const bridge = bindMultiplayerRace(store, { store: room, getPoseBuffer: () => undefined }, { automaticTick: false })
  assert.equal(store.getState().isSpectating, false)
  room.setState({ followId: null, snapshot: { ...snapshot, phase: 'waiting', raceId: null } })
  store.setState({ isWarmupComplete: true }); bridge.tick()
  assert.equal(store.getState().isSpectating, true)
  assert.equal(store.getState().overlay, Overlay.SPECTATING)
  assert.equal(store.getState().multiplayerRaceId, null)
  assert.equal(store.getState().attemptStartedAtMs, null)
  bridge.dispose()
})

function startMultiplayerAttempt(store) {
  store.getState().prepareMultiplayer()
  store.setState({ playerStatus: 'safe', _isHydrated: true })
  const start = performance.now() - 15000
  store.getState().scheduleMultiplayerRace('ranked-race', start)
  store.getState().startMultiplayerRace('ranked-race', performance.now())
}

test('confirmed multiplayer finish saves frozen metadata and accepted time exactly once', async () => {
  const submission = deferred()
  const { store, submissionCalls, Overlay } = createRaceStore({ insertSpeedRun: () => submission.promise })
  startMultiplayerAttempt(store)
  store.setState({ collectedRings: { one: true, two: true }, outOfBoundsEvents: [{ timestamp: 1 }], inputType: 'joystick' })
  store.getState().finishSpeedRun()
  const captured = store.getState().attemptResult
  assert.equal(submissionCalls.length, 0)
  store.setState({ username: 'changed123', collectedRings: {}, outOfBoundsEvents: [] })
  store.getState().confirmMultiplayerFinish('old-race', 12000)
  assert.equal(submissionCalls.length, 0)
  store.getState().confirmMultiplayerFinish('ranked-race', 12345)
  store.getState().confirmMultiplayerFinish('ranked-race', 12345)
  store.getState().finishSpeedRun()
  assert.equal(submissionCalls.length, 1)
  assert.deepEqual(submissionCalls[0], { username: captured.username, date: captured.date, time: 12.35,
    input_type: 'keyboard', level_id: PLATFORM_VERSION, accidents: 1, rings: 2 })
  assert.equal(store.getState().overlay, Overlay.MULTIPLAYER)
  submission.resolve(createSavedRun({ id: 123, time: 12.35 }))
  await flushAsync()
  assert.equal(store.getState().savedRunId, 123)
  assert.equal(store.getState().saveStatus, 'saved')
  store.getState().confirmMultiplayerFinish('ranked-race', 12345)
  assert.equal(submissionCalls.length, 1)
})

test('bridge submits only server-confirmed local finishes, never DNF or unconfirmed results', async () => {
  const { bindMultiplayerRace } = loadTypeScript('utils/multiplayer/raceBridge.ts')
  for (const status of ['racing', 'dnf', 'finished']) {
    const { store, submissionCalls } = createRaceStore({ insertSpeedRun: async () => createSavedRun() })
    startMultiplayerAttempt(store)
    store.getState().finishSpeedRun()
    const snapshot = { selfId: 'me', members: [{ id: 'me', role: 'racer' }], raceId: 'ranked-race', startAt: 0,
      phase: 'racing', entrants: [{ id: 'me', status, elapsedMs: status === 'finished' ? 12340 : null }] }
    const room = createStore(() => ({ status: 'joined', clockOffset: 0, snapshot }))
    const bridge = bindMultiplayerRace(store, { store: room, finish() {} }, { automaticTick: false })
    bridge.tick(); room.setState({ snapshot: { ...snapshot } }); bridge.tick()
    assert.equal(submissionCalls.length, status === 'finished' ? 1 : 0)
    bridge.dispose()
    await flushAsync()
  }
})

test('late multiplayer saves append history without changing a rematch or lobby result', async () => {
  for (const leave of [false, true]) {
    const submission = deferred()
    const { store } = createRaceStore({ insertSpeedRun: () => submission.promise })
    startMultiplayerAttempt(store)
    store.getState().finishSpeedRun()
    store.getState().confirmMultiplayerFinish('ranked-race', 12340)
    if (leave) store.getState().returnToLobby()
    else store.getState().prepareMultiplayer()
    submission.resolve(createSavedRun({ id: 321 }))
    await flushAsync()
    assert.equal(store.getState().savedRunId, null)
    assert.equal(store.getState().attemptResult, null)
    assert.equal(store.getState().saveStatus, 'idle')
    assert.equal(store.getState().completedSpeedRuns[PLATFORM_VERSION][0].id, 321)
  }
})

test('multiplayer save failures keep the result and cannot trigger automatic resubmission', async () => {
  const { store, submissionCalls } = createRaceStore({ insertSpeedRun: async () => null })
  startMultiplayerAttempt(store)
  store.getState().confirmMultiplayerFinish('ranked-race', 12340)
  assert.equal(submissionCalls.length, 0, 'no local finish')
  store.getState().finishSpeedRun()
  store.getState().confirmMultiplayerFinish('ranked-race', 12340)
  await flushAsync()
  assert.equal(store.getState().saveStatus, 'failed')
  assert.equal(store.getState().savedRunId, null)
  assert.equal(store.getState().attemptResult.timeSeconds, 12.34)
  store.getState().confirmMultiplayerFinish('ranked-race', 12340)
  assert.equal(submissionCalls.length, 1)
})
