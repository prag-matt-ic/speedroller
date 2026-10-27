import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Module, { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Loads the TypeScript modules under test in memory, resolving `@/` aliases and relative `.ts`
// imports. Mirrors the race-lifecycle loader so the two suites share one convention.
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

const load = createTypeScriptLoader()
const {
  BRAKE_DEADZONE,
  LOBBY_SPEED,
  RACE_BRAKE_DECELERATION,
  RACE_CRUISE_SPEED,
  RACE_FORWARD_ACCELERATION,
  RACE_MAX_SPEED,
  RACE_STEER_SPEED,
  RING_BOOST_DECAY,
  RING_BOOST_MAX,
  RING_BOOST_SPEED,
  addRingBoost,
  createRaceSpeedState,
  getRaceTargetSpeed,
  resetRaceSpeed,
  stepRaceSpeed,
} = load('utils/platform/raceSpeed.ts')

const FRAME_60 = 1 / 60

/** Advances `state` by whole frames, the way the player loop does. */
function simulate(state, seconds, { brake = false, frame = FRAME_60 } = {}) {
  const steps = Math.round(seconds / frame)
  for (let step = 0; step < steps; step += 1) stepRaceSpeed(state, brake, frame)
  return state
}

test('the trial constants stay inside the design targets', () => {
  assert.ok(RACE_CRUISE_SPEED >= 18 && RACE_CRUISE_SPEED <= 20)
  assert.equal(RACE_MAX_SPEED, 32)
  assert.equal(RACE_STEER_SPEED, 8)
  assert.equal(RING_BOOST_SPEED, 2)
  assert.equal(RING_BOOST_MAX, RACE_MAX_SPEED - RACE_CRUISE_SPEED)
  assert.equal(RING_BOOST_DECAY, 1.2)
  assert.equal(LOBBY_SPEED, 8)
  assert.ok(BRAKE_DEADZONE > 0 && BRAKE_DEADZONE < 1)
})

test('the solid course preview covers two seconds at maximum speed', () => {
  const { ELEMENT_FADE_DISTANCE, TILE_PLAYER_FADE_FULL_RADIUS, TILE_PLAYER_FADE_MIN_RADIUS } =
    load('utils/sceneDistances.ts')

  const solidPreviewSeconds = TILE_PLAYER_FADE_FULL_RADIUS / RACE_MAX_SPEED
  const fadePreviewSeconds = TILE_PLAYER_FADE_MIN_RADIUS / RACE_MAX_SPEED

  // The design requirement is at least two seconds of useful forward preview at the race maximum.
  assert.ok(solidPreviewSeconds >= 2, `solid preview is ${solidPreviewSeconds.toFixed(2)} s`)
  assert.ok(fadePreviewSeconds > solidPreviewSeconds)
  assert.equal(ELEMENT_FADE_DISTANCE, TILE_PLAYER_FADE_MIN_RADIUS)
})

test('neutral input accelerates from rest to cruise and stops there', () => {
  const state = createRaceSpeedState()
  assert.equal(state.forwardSpeed, 0)

  simulate(state, 1)
  assert.ok(Math.abs(state.forwardSpeed - RACE_FORWARD_ACCELERATION) < 1e-9)

  // 19 / 14 is about 1.36 s; give the model a couple of frames either side.
  simulate(state, 2)
  assert.equal(state.forwardSpeed, RACE_CRUISE_SPEED)
  assert.equal(state.boostUnits, 0)
})

test('acceleration reaches cruise in the expected time', () => {
  const state = createRaceSpeedState()
  const expectedSeconds = RACE_CRUISE_SPEED / RACE_FORWARD_ACCELERATION
  let elapsed = 0
  while (state.forwardSpeed < RACE_CRUISE_SPEED && elapsed < 5) {
    stepRaceSpeed(state, false, FRAME_60)
    elapsed += FRAME_60
  }
  assert.ok(Math.abs(elapsed - expectedSeconds) <= FRAME_60)
})

test('braking reaches exactly zero and never reverses', () => {
  const state = createRaceSpeedState()
  state.forwardSpeed = RACE_MAX_SPEED

  let elapsed = 0
  while (state.forwardSpeed > 0 && elapsed < 5) {
    stepRaceSpeed(state, true, FRAME_60)
    assert.ok(state.forwardSpeed >= 0)
    elapsed += FRAME_60
  }

  assert.equal(state.forwardSpeed, 0)
  assert.ok(Math.abs(elapsed - RACE_MAX_SPEED / RACE_BRAKE_DECELERATION) <= FRAME_60)

  // Holding the brake at a stop must not start moving again.
  simulate(state, 2, { brake: true })
  assert.equal(state.forwardSpeed, 0)
})

test('braking overrides a fresh maximum boost', () => {
  const state = createRaceSpeedState()
  addRingBoost(state, 10)
  state.forwardSpeed = RACE_MAX_SPEED
  assert.equal(state.boostUnits, RING_BOOST_MAX)

  simulate(state, 2, { brake: true })
  assert.equal(state.forwardSpeed, 0)

  // Releasing accelerates toward whatever boost is left, not past it.
  simulate(state, 0.1)
  assert.ok(state.forwardSpeed > 0)
  assert.ok(state.forwardSpeed <= getRaceTargetSpeed(state.boostUnits))
})

test('a held brake wins even when the ring boost arrived while stopped', () => {
  const state = createRaceSpeedState()
  addRingBoost(state, 5)
  stepRaceSpeed(state, true, FRAME_60)
  assert.equal(state.forwardSpeed, 0)
})

test('ring boost raises the ceiling and clamps at the maximum', () => {
  const state = createRaceSpeedState()
  addRingBoost(state, 1)
  assert.equal(state.boostUnits, RING_BOOST_SPEED)
  assert.equal(getRaceTargetSpeed(state.boostUnits), RACE_CRUISE_SPEED + RING_BOOST_SPEED)

  addRingBoost(state, 100)
  assert.equal(state.boostUnits, RING_BOOST_MAX)
  assert.equal(getRaceTargetSpeed(state.boostUnits), RACE_MAX_SPEED)
})

test('boost decays to zero after its full allowance and speed follows it down', () => {
  const state = createRaceSpeedState()
  addRingBoost(state, Math.ceil(RING_BOOST_MAX / RING_BOOST_SPEED))
  state.forwardSpeed = RACE_MAX_SPEED

  const fullAllowanceSeconds = RING_BOOST_MAX / RING_BOOST_DECAY
  simulate(state, fullAllowanceSeconds - FRAME_60)
  assert.ok(state.boostUnits > 0)

  simulate(state, 2 * FRAME_60)
  assert.equal(state.boostUnits, 0)
  assert.equal(state.forwardSpeed, RACE_CRUISE_SPEED)
})

test('speed never exceeds the maximum, even with repeated rings', () => {
  const state = createRaceSpeedState()
  let peak = 0
  for (let ring = 0; ring < 100; ring += 1) {
    addRingBoost(state, 1)
    for (let step = 0; step < 6; step += 1) {
      stepRaceSpeed(state, false, FRAME_60)
      peak = Math.max(peak, state.forwardSpeed)
    }
  }
  assert.ok(peak <= RACE_MAX_SPEED)
  assert.ok(peak > RACE_CRUISE_SPEED)
})

test('one 33 ms step and two 16.5 ms steps agree', () => {
  const coarse = createRaceSpeedState()
  const fine = createRaceSpeedState()
  addRingBoost(coarse, 3)
  addRingBoost(fine, 3)

  for (let second = 0; second < 10; second += 1) {
    stepRaceSpeed(coarse, false, 1 / 30)
    stepRaceSpeed(fine, false, 1 / 60)
    stepRaceSpeed(fine, false, 1 / 60)
  }

  assert.ok(Math.abs(coarse.forwardSpeed - fine.forwardSpeed) < 1e-9)
  assert.ok(Math.abs(coarse.boostUnits - fine.boostUnits) < 1e-9)
})

test('reset clears momentum and boost for the next attempt', () => {
  const state = createRaceSpeedState()
  addRingBoost(state, 3)
  state.forwardSpeed = RACE_MAX_SPEED

  resetRaceSpeed(state)
  assert.deepEqual(state, { forwardSpeed: 0, boostUnits: 0 })
})

test('zero and negative deltas are ignored', () => {
  const state = createRaceSpeedState()
  state.forwardSpeed = RACE_CRUISE_SPEED
  addRingBoost(state, 1)

  stepRaceSpeed(state, false, 0)
  stepRaceSpeed(state, false, -1)

  assert.equal(state.forwardSpeed, RACE_CRUISE_SPEED)
  assert.equal(state.boostUnits, RING_BOOST_SPEED)
})
