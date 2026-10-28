import { PI2, cos, Fn } from 'three/tsl'
import type { Node } from 'three/webgpu'

// Port of resources/glsl/palette.glsl
//
//   vec3 palette(in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d) {
//     return a + b * cos(6.283185 * (c * t + d));
//   }
//
// https://iquilezles.org/articles/palettes/
export const cosinePalette = /*#__PURE__*/ Fn(
  ([t, a, b, c, d]: readonly [
    t: Node<'float'>,
    a: Node<'vec3'>,
    b: Node<'vec3'>,
    c: Node<'vec3'>,
    d: Node<'vec3'>,
  ]) => {
    const angle = c.mul(t).add(d).mul(PI2)
    // TSL's `cos` is elementwise, so a single vec3 node replaces three scalar cos nodes.
    const cosine = cos(angle)
    return a.add(b.mul(cosine))
  },
).setLayout({
  name: 'palette',
  type: 'vec3',
  inputs: [
    { name: 't', type: 'float', qualifier: 'in' },
    { name: 'a', type: 'vec3', qualifier: 'in' },
    { name: 'b', type: 'vec3', qualifier: 'in' },
    { name: 'c', type: 'vec3', qualifier: 'in' },
    { name: 'd', type: 'vec3', qualifier: 'in' },
  ],
})
