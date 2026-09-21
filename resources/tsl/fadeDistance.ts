import { cameraPosition, float, smoothstep } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Port of resources/glsl/fadeDistance.glsl.
//
//   float fadeDistance(float worldZ) {
//     return 1.0 - smoothstep(FADE_DISTANCE_START, FADE_DISTANCE_END, abs(worldZ));
//   }
//
// The single most reused helper in the GLSL: 10 vertex stages glslify it in.
//
// The port originally kept the GLSL's `abs(worldZ)`, which measures from the world origin rather
// than the camera. That only looked right because the stage camera starts at z = 8, right on
// FADE_DISTANCE_START. The camera is not static (Camera.tsx drives it with setLookAt every frame),
// so the fade is now measured from the camera, matching the floating tiles.
export const FADE_DISTANCE_START = 8.0
export const FADE_DISTANCE_END = 14.0

export const fadeDistance = (worldZ: Node<'float'>): Node<'float'> =>
  float(1).sub(
    smoothstep(FADE_DISTANCE_START, FADE_DISTANCE_END, worldZ.sub(cameraPosition.z).abs()),
  )
