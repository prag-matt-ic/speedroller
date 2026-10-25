import test from 'node:test'
import assert from 'node:assert/strict'
import { loadTypeScript } from './loadTypeScript.mjs'
const { appendPose, samplePose, MAX_POSE_SAMPLES } = loadTypeScript('utils/multiplayer/interpolation.ts')
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
