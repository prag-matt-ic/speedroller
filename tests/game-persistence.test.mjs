import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { createGameStore } = loadTypeScript('stores/createGameStore.ts', {
  gsap: { fromTo: () => ({ kill() {} }), to: () => ({ kill() {} }) },
  '@/components/SoundProvider': { SoundFX: {} },
  '@/components/palette': { clampPaletteIndexSafe: (index) => Math.max(0, Math.min(5, index)) },
  '@/resources/content/hud': { getOutOfBoundsMessage: () => null, MOVE_HUD_CONFIG: {} },
})

const storageKey = 'speedroller-game'
const params = { isMobile: false, insertSpeedRun: () => null, playSoundFX() {}, stopSoundFX() {} }

function setup(t, saved) {
  const previousWindow = globalThis.window
  const items = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : [])
  const storage = {
    getItem: (name) => items.get(name) ?? null,
    setItem: (name, value) => items.set(name, value),
    removeItem: (name) => items.delete(name),
  }
  globalThis.window = { localStorage: storage }
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })
  const store = createGameStore(params)
  return { store, storage, items }
}

test('frame updates neither serialize nor persist unchanged saved fields', (t) => {
  const { store, storage } = setup(t)
  const stringify = t.mock.method(JSON, 'stringify')
  const write = t.mock.method(storage, 'setItem')
  for (let frame = 0; frame < 60; frame++) {
    store.getState().setPlayerPosition({ x: frame, y: 0, z: -frame })
    store.getState().setPlayerSpeedUnits(frame)
    store.getState().setPlayerBoostUnits(frame / 2)
  }
  store.getState().setPlayerPosition({ x: 59, y: 0, z: -59 })
  assert.equal(write.mock.callCount(), 0)
  assert.equal(stringify.mock.callCount(), 0)
  assert.deepEqual(store.getState().playerPosition, [59, 0, -59])
})

test('every saved field still writes immediately and survives hydration', (t) => {
  const { store, storage, items } = setup(t)
  const write = t.mock.method(storage, 'setItem')
  const savedFields = {
    username: 'racer123', isSubscribed: true, totalTimeS: 123,
    completedSpeedRuns: { course: [{ id: 1, time: 12.34 }] },
    inputType: 'joystick', joystickPosition: 'left', paletteIndex: 2,
  }
  for (const [key, value] of Object.entries(savedFields)) store.setState({ [key]: value })
  assert.equal(write.mock.callCount(), Object.keys(savedFields).length)
  assert.deepEqual(JSON.parse(items.get(storageKey)), { state: savedFields, version: 2 })
  const hydrated = createGameStore(params)
  for (const [key, value] of Object.entries(savedFields)) {
    assert.deepEqual(hydrated.getState()[key], value)
  }
  assert.equal(hydrated.getState()._isHydrated, true)
})

test('legacy saves migrate without losing preferences or results', (t) => {
  const { store, items } = setup(t, {
    version: 1,
    state: { username: 'legacy', paletteIndex: 3, completedSpeedRuns: { old: [{ id: 9 }] }, mode: 'learn' },
  })
  assert.equal(store.getState().username, 'legacy')
  assert.equal(store.getState().mode, 'speedrun')
  const saved = JSON.parse(items.get(storageKey))
  assert.equal(saved.version, 2)
  assert.equal(saved.state.paletteIndex, 3)
  assert.deepEqual(saved.state.completedSpeedRuns, { old: [{ id: 9 }] })
  assert.equal('mode' in saved.state, false)
})

test('failed writes can retry and clearing storage invalidates the saved snapshot', (t) => {
  const { store, storage, items } = setup(t)
  const write = storage.setItem
  storage.setItem = () => { throw new Error('quota exceeded') }
  assert.throws(() => store.getState().setUsername('retry123'), /quota exceeded/)
  storage.setItem = write
  store.getState().setUsername('retry123')
  assert.equal(JSON.parse(items.get(storageKey)).state.username, 'retry123')
  store.persist.clearStorage()
  assert.equal(items.has(storageKey), false)
  store.getState().setUsername('retry123')
  assert.equal(JSON.parse(items.get(storageKey)).state.username, 'retry123')
})
