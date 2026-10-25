import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './loadTypeScript.mjs'
const { followTarget, raceProgress } = loadTypeScript('utils/multiplayer/spectating.ts')
test('follow selection survives snapshots, falls back after finish/DNF and clears for rematch', () => {
  const snapshot = { entrants: [{ id: 'a', status: 'finished' }, { id: 'b', status: 'racing' }, { id: 'c', status: 'racing' }] }
  assert.equal(followTarget(snapshot, null), 'b')
  assert.equal(followTarget(snapshot, 'c'), 'c')
  assert.equal(followTarget(snapshot, 'a'), 'b')
  snapshot.entrants[1].status = 'dnf'; snapshot.entrants[2].status = 'finished'
  assert.equal(followTarget(snapshot, 'c'), 'c')
  assert.equal(followTarget({ entrants: [] }, 'c'), null)
  assert.equal(followTarget(null, 'c'), null)
  assert.equal(raceProgress(-500, -100, -900), 50)
  assert.equal(raceProgress(0, -100, -900), 0)
  assert.equal(raceProgress(-1000, -100, -900), 100)
  assert.equal(raceProgress(1, 0, 0), 0)
})
