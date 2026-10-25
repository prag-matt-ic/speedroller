import { Quaternion } from 'three'
import type { Entrant, Pose } from '../../shared/multiplayer/protocol.mts'

export const INTERPOLATION_DELAY_MS = 100
export const MAX_POSE_SAMPLES = 8
export const MAX_PREDICTION_MS = 100
export const CORRECTION_MS = 100
const MIN_VELOCITY_INTERVAL_MS = 50
export type PoseSample = { pose: Pose; time: number; status?: Entrant['status'] }
export type PoseOutput = { position: [number, number, number]; rotation: [number, number, number, number] }

export function appendPose(samples: PoseSample[], entrant: Entrant) {
  const previous = samples.at(-1)
  if (previous && entrant.pose.sequence <= previous.pose.sequence) {
    if (entrant.pose.sequence === previous.pose.sequence) previous.status = entrant.status
    return
  }
  if (previous && entrant.pose.respawn !== previous.pose.respawn) samples.length = 0
  samples.push({ pose: entrant.pose, time: Math.max(previous?.time ?? 0, entrant.receivedAt), status: entrant.status })
  if (samples.length > MAX_POSE_SAMPLES) samples.shift()
}

// Writes into caller-owned tuples; no allocation or extrapolation in the render loop.
export function samplePose(samples: readonly PoseSample[], time: number, output: PoseOutput) {
  if (!samples.length) return false
  let before = samples[0]
  let after = before
  for (let index = 1; index < samples.length; index++) {
    after = samples[index]
    if (after.time >= time) break
    before = after
  }
  const duration = after.time - before.time
  const alpha = duration > 0 ? Math.max(0, Math.min(1, (time - before.time) / duration)) : 1
  for (let axis = 0; axis < 3; axis++) {
    output.position[axis] = before.pose.position[axis] + (after.pose.position[axis] - before.pose.position[axis]) * alpha
  }
  Quaternion.slerpFlat(output.rotation, 0, before.pose.rotation, 0, after.pose.rotation, 0, alpha)
  return true
}

export function createPlayback() {
  return {
    position: [0, 0, 0] as PoseOutput['position'], rotation: [0, 0, 0, 1] as PoseOutput['rotation'],
    velocity: [0, 0, 0], correction: [0, 0, 0], time: -Infinity,
    latest: null as PoseSample | null, correctionAt: -Infinity, predictionMs: 0, correctionDistance: 0,
  }
}
export type Playback = ReturnType<typeof createPlayback>

// Prediction is presentation-only: never feed guessed positions back into physics or results.
// shortcut: linear prediction cannot anticipate collisions; revisit if bounded corrections remain visible.
export function samplePlayback(samples: readonly PoseSample[], time: number, output: Playback) {
  const latest = samples.at(-1)
  if (!latest) return false
  const previous = output.latest
  const reset = !previous || previous.pose.respawn !== latest.pose.respawn
  const terminal = latest.status !== undefined && latest.status !== 'racing'
  time = reset ? time : Math.max(time, output.time)
  const newSample = latest !== previous
  const correcting = !reset && !terminal && newSample && output.predictionMs > 0
  const remaining = Math.max(0, 1 - (time - output.correctionAt) / CORRECTION_MS)
  // Save the old predicted trajectory at this same time, before sampling the new history.
  if (correcting) {
    const advance = Math.max(0, Math.min(time, previous.time + MAX_PREDICTION_MS) - output.time)
    for (let axis = 0; axis < 3; axis++) {
      output.correction[axis] = output.position[axis] + output.velocity[axis] * advance
    }
  }
  samplePose(samples, time, output)
  if (terminal) {
    for (let axis = 0; axis < 3; axis++) output.position[axis] = latest.pose.position[axis]
    for (let axis = 0; axis < 4; axis++) output.rotation[axis] = latest.pose.rotation[axis]
  }
  output.predictionMs = terminal ? 0 : Math.min(MAX_PREDICTION_MS, Math.max(0, time - latest.time))
  let baseline: PoseSample | undefined
  // Receipt bursts can share a timestamp; use a full update interval to avoid explosive velocities.
  for (let index = samples.length - 2; index >= 0; index--) {
    if (latest.time - samples[index].time >= MIN_VELOCITY_INTERVAL_MS) { baseline = samples[index]; break }
  }
  for (let axis = 0; axis < 3; axis++) {
    output.velocity[axis] = baseline && !terminal
      ? (latest.pose.position[axis] - baseline.pose.position[axis]) / (latest.time - baseline.time) : 0
    output.position[axis] += output.velocity[axis] * output.predictionMs
    if (reset || terminal) output.correction[axis] = 0
    else if (correcting) output.correction[axis] -= output.position[axis]
    output.position[axis] += output.correction[axis] * (correcting ? 1 : remaining)
  }
  output.correctionDistance = correcting ? Math.hypot(output.correction[0], output.correction[1], output.correction[2]) : 0
  if (correcting) output.correctionAt = time
  if (reset || terminal) output.correctionAt = -Infinity
  output.latest = latest; output.time = time
  return true
}

export function createPresentationClock() {
  let previousLocal: number | null = null
  let presentation = 0
  return {
    sample(local: number, offset: number) {
      const target = local + offset - INTERPOLATION_DELAY_MS
      if (previousLocal === null) presentation = target
      else {
        const elapsed = Math.max(0, local - previousLocal)
        const expected = presentation + elapsed
        // Slew only presentation time, by at most 10% of elapsed time in either direction.
        presentation = expected + Math.max(-elapsed * 0.1, Math.min(elapsed * 0.1, target - expected))
      }
      previousLocal = local
      return presentation
    },
    reset() { previousLocal = null },
  }
}
