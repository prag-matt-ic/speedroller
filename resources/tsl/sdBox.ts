import { max, min, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Port of resources/glsl/sdBox.glsl.
//
//   float sdBox(in vec2 position, in vec2 bounds) {
//     vec2 d = abs(position) - bounds;
//     return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
//   }
export const sdBox = (position: Node<'vec2'>, bounds: Node<'vec2'>) => {
  const d = position.abs().sub(bounds)
  return max(d, vec2(0)).length().add(min(max(d.x, d.y), 0))
}
