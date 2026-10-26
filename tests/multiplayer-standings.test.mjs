import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { raceStandings } = loadTypeScript('utils/multiplayer/standings.ts')
const racer = (slot, z, status = 'racing', place = null) => ({ id: String(slot), slot, status, place,
  pose: { position: [0, 0, z] }, profile: { name: `Racer${slot}`, colour: '#abcdef' } })
const order = rows => rows.map(row => [row.entrant.id, row.position])

test('standings use continuous progress, server samples and respawns on flat and cylinder courses', () => {
  for (const topology of ['flat', 'cylinder']) {
    const snapshot = { course: { topology }, entrants: [racer(1, -10), racer(2, -10), racer(3, -5)] }
    const samples = new Map([['1', -50.1], ['2', -50.2]])
    const standings = () => raceStandings(snapshot, 0, -100, id => samples.get(id))
    assert.deepEqual(order(standings()), [['2', 1], ['1', 2], ['3', 3]])
    samples.set('1', -60)
    assert.equal(standings()[0].entrant.id, '1', 'overtake')
    samples.set('1', -2)
    assert.deepEqual(order(standings()), [['2', 1], ['3', 2], ['1', 3]], 'respawn loses progress')
    samples.clear()
    assert.deepEqual(order(standings()), [['1', 1], ['2', 2], ['3', 3]], 'missing samples use snapshot; ties use slot')
  }
})

test('finish ties stay authoritative, DNF is unnumbered, late snapshots and rematches need no history', () => {
  const snapshot = { entrants: [racer(5, -100, 'dnf'), racer(4, -99), racer(3, 0, 'finished', 1), racer(2, 0, 'finished', 1), racer(1, -10)] }
  const rows = raceStandings(snapshot, 0, -100, () => undefined)
  assert.deepEqual(order(rows), [['2', 1], ['3', 1], ['4', 3], ['1', 4], ['5', null]])
  assert.deepEqual(raceStandings({ entrants: [] }, 0, -100, () => -100), [])
  assert.deepEqual(order(raceStandings({ entrants: [racer(1, 0), racer(2, 0)] }, 0, -100, () => undefined)), [['1', 1], ['2', 2]])
})
