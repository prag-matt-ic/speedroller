import assert from 'node:assert/strict'
import test from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

function fixture() {
  const state = { attemptResult: { inputType: 'keyboard', platformVersion: 'course-a' }, savedRunId: 42,
    saveStatus: 'saved', multiplayerRaceId: 'race-a' }
  const room = { snapshot: { raceId: 'race-a', selfId: 'me', phase: 'racing', entrants: [{ id: 'me', status: 'finished' }] } }
  let query
  let response = { data: { position: 123 }, isPending: false, isError: false }
  let saved = { run: { id: 42 }, position: 123 }
  const calls = []
  const { MultiplayerGlobalRank } = loadTypeScript('components/multiplayer/MultiplayerGlobalRank.tsx', {
    '@/components/GameProvider': { useGameStore: select => select(state) },
    './MultiplayerProvider': { useRoomState: select => select(room) },
    '@tanstack/react-query': { useQuery: options => { query = options; return response } },
    '@/app/actions': { getSpeedrunPosition: async (...args) => { calls.push(args); return saved } },
  })
  return { state, room, calls, render: MultiplayerGlobalRank, query: () => query,
    response: value => { response = value }, saved: value => { saved = value } }
}

test('global rank uses the current saved ID and frozen category, and refreshes for final results', async () => {
  const f = fixture()
  assert.equal(f.render().props.children, 'Global rank #123 · Keyboard')
  assert.equal(f.query().enabled, true)
  await f.query().queryFn()
  assert.deepEqual(f.calls, [[42, 'keyboard', 'course-a']])
  const racingKey = f.query().queryKey
  f.room.snapshot.phase = 'results'; f.render()
  assert.notDeepEqual(f.query().queryKey, racingKey)
  f.state.attemptResult.inputType = 'joystick'
  assert.equal(f.render().props.children, 'Global rank #123 · Joystick')
  f.state.multiplayerRaceId = 'next-race'
  assert.equal(f.render(), null)
  assert.equal(f.query().enabled, false)
})

test('global rank distinguishes saving, save failure and lookup failure without showing old ranks', async () => {
  const f = fixture()
  f.state.saveStatus = 'saving'
  assert.equal(f.render().props.children, 'Saving…')
  assert.equal(f.query().enabled, false)
  f.state.saveStatus = 'failed'
  assert.match(f.render().props.children, /Time not saved/)
  f.state.saveStatus = 'saved'
  f.response({ isPending: true })
  assert.match(f.render().props.children, /loading global rank/)
  f.saved(null)
  await assert.rejects(f.query().queryFn(), /unavailable/)
  f.saved({ run: { id: 999 }, position: 1 })
  await assert.rejects(f.query().queryFn(), /unavailable/)
  f.response({ isError: true })
  assert.equal(f.render().props.children, 'Time saved · global rank unavailable.')
  f.room.snapshot.entrants[0].status = 'dnf'
  assert.match(f.render().props.children, /DNF/)
  assert.equal(f.query().enabled, false)
  f.room.snapshot.selfId = 'spectator'
  assert.equal(f.render(), null)
})
