import { smoothstep } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Port of resources/glsl/cameraFadeNear.glsl.
//
//   const float CAMERA_FADE_NEAR_START = 8.0;
//   const float CAMERA_FADE_NEAR_END = 14.0;
//   float cameraFadeNear(float cameraZ, float worldZ) {
//     return smoothstep(CAMERA_FADE_NEAR_START, CAMERA_FADE_NEAR_END, cameraZ - worldZ);
//   }
export const CAMERA_FADE_NEAR_START = 8.0
export const CAMERA_FADE_NEAR_END = 14.0

export const cameraFadeNear = (cameraZ: Node<'float'>, worldZ: Node<'float'>) =>
  smoothstep(CAMERA_FADE_NEAR_START, CAMERA_FADE_NEAR_END, cameraZ.sub(worldZ))
