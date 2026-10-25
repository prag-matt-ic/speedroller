import { Quaternion } from 'three'
import type { Entrant, Pose } from '../../shared/multiplayer/protocol.mts'

export const INTERPOLATION_DELAY_MS = 100
export const MAX_POSE_SAMPLES = 8
export type PoseSample = { pose: Pose; time: number }
export type PoseOutput = { position: [number, number, number]; rotation: [number, number, number, number] }

export function appendPose(samples: PoseSample[], entrant: Entrant) {
  const previous = samples.at(-1)
  if (previous && entrant.pose.sequence <= previous.pose.sequence) return
  if (previous && entrant.pose.respawn !== previous.pose.respawn) samples.length = 0
  samples.push({ pose: entrant.pose, time: entrant.receivedAt })
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
