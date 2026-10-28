import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './loadTypeScript.mjs'
const { appendPose, samplePose, MAX_POSE_SAMPLES, createPlayback, samplePlayback, createPresentationClock } = loadTypeScript('utils/multiplayer/interpolation.ts')
const entrant = (sequence, respawn = 0) => ({ receivedAt: sequence * 50, pose: { sequence, respawn, position: [sequence, 0, 0], rotation: [0, 0, 0, 1] } })
test('remote poses interpolate in place, reject old sequences, bound history and snap respawns', () => {
  const samples = []; const output = { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
  const position = output.position; const rotation = output.rotation
  assert.equal(samplePose(samples, 0, output), false)
  appendPose(samples, entrant(1)); appendPose(samples, entrant(2))
  samples[1].pose.rotation = [0, 1, 0, 0]
  samplePose(samples, 75, output)
  assert.equal(output.position[0], 1.5)
  assert.ok(Math.abs(Math.hypot(...output.rotation) - 1) < 1e-8)
  assert.equal(output.position, position); assert.equal(output.rotation, rotation)
  appendPose(samples, entrant(1)); assert.equal(samples.length, 2)
  samplePose(samples, 10000, output); assert.equal(output.position[0], 2)
  for (let i = 3; i < 30; i++) appendPose(samples, entrant(i))
  assert.equal(samples.length, MAX_POSE_SAMPLES)
  appendPose(samples, entrant(30, 1)); assert.equal(samples.length, 1)
  samplePose(samples, 0, output); assert.equal(output.position[0], 30)
})

const motion = (sequence, time, x, status = 'racing', respawn = 0) => ({
  ...entrant(sequence, respawn), receivedAt: time, status,
  pose: { ...entrant(sequence, respawn).pose, position: [x, 0, 0] },
})
test('playback interpolates irregular timing, predicts at most 100 ms and holds rotation', () => {
  const samples = [], output = createPlayback()
  assert.equal(samplePlayback(samples, 0, output), false)
  appendPose(samples, motion(1, 0, 0)); appendPose(samples, motion(2, 70, 7))
  const position = output.position, rotation = output.rotation
  samplePlayback(samples, 35, output); assert.equal(output.position[0], 3.5)
  samplePlayback(samples, 120, output); assert.equal(output.position[0], 12)
  samplePlayback(samples, 500, output); assert.equal(output.position[0], 17)
  assert.equal(output.predictionMs, 100)
  assert.equal(output.position, position); assert.equal(output.rotation, rotation)
  assert.deepEqual(output.rotation, [0, 0, 0, 1])
})
test('resumed updates blend prediction errors over 100 ms, respawns snap', () => {
  const samples = [], output = createPlayback()
  appendPose(samples, motion(1, 0, 0)); appendPose(samples, motion(2, 50, 5))
  samplePlayback(samples, 100, output); assert.equal(output.position[0], 10)
  appendPose(samples, motion(3, 100, 5))
  samplePlayback(samples, 100, output); assert.equal(output.position[0], 10)
  assert.equal(output.correctionDistance, 5)
  samplePlayback(samples, 150, output); assert.equal(output.position[0], 7.5)
  samplePlayback(samples, 200, output); assert.equal(output.position[0], 5)
  appendPose(samples, motion(4, 210, 100, 'racing', 1))
  samplePlayback(samples, 210, output); assert.equal(output.position[0], 100)
  assert.equal(output.correction[0], 0)
})
test('duplicate timestamps do not produce infinite velocity; finish and DNF stop prediction', () => {
  for (const status of ['finished', 'dnf']) {
    const samples = [], output = createPlayback()
    appendPose(samples, motion(1, 50, 1)); appendPose(samples, motion(2, 50, 2))
    samplePlayback(samples, 100, output); assert.equal(output.position[0], 2)
    assert.equal(output.velocity[0], 0)
    appendPose(samples, motion(3, 100, 3))
    samplePlayback(samples, 150, output); assert.equal(output.predictionMs, 50)
    appendPose(samples, motion(3, 100, 3, status))
    samplePlayback(samples, 200, output); assert.equal(output.position[0], 3)
    assert.equal(output.predictionMs, 0)
  }
})
test('presentation clock slews offset corrections without rewinding or jumping', () => {
  const clock = createPresentationClock()
  assert.equal(clock.sample(1000, 0), 900)
  assert.equal(clock.sample(1010, -500), 909)
  assert.equal(clock.sample(1020, 500), 920)
  assert.equal(clock.sample(1020, 500), 920)
  clock.reset(); assert.equal(clock.sample(0, 0), -100)
})
