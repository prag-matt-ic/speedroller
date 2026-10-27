import { abs, color, float, fwidth, length, max, min, mix, smoothstep, step, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'

/** Keep chunky column panels upright; rotate fittings on wide bridge faces. */
export const industrialPanelMasks = (coordinate: Node<'vec2'>, size: Node<'vec2'>) => {
  const vertical = step(size.x, size.y.mul(1.8))
  const panelUv = mix(coordinate.yx, coordinate, vertical)
  const panelSize = mix(size.yx, size, vertical)
  const edge = min(panelUv, panelUv.oneMinus()).mul(panelSize)
  const seam = float(1).sub(smoothstep(0.025, 0.07, min(edge.x, edge.y)))
  const rim = float(1).sub(smoothstep(0.07, 0.14, min(edge.x, edge.y))).mul(seam.oneMinus())
  const boltDistance = length(edge.sub(vec2(0.22)))
  const bolts = float(1).sub(smoothstep(0.055, 0.085, boltDistance))
  const stripDistance = abs(panelUv.x.sub(0.19)).mul(panelSize.x)
  const antialias = max(fwidth(stripDistance), 0.008)
  const stripEnds = smoothstep(0.14, 0.18, panelUv.y).mul(float(1).sub(smoothstep(0.82, 0.86, panelUv.y)))
  const strip = float(1).sub(smoothstep(float(0.07).sub(antialias), float(0.07).add(antialias), stripDistance)).mul(stripEnds)
  const housing = float(1).sub(smoothstep(0.16, 0.2, stripDistance)).mul(stripEnds)
  const spill = float(1).sub(smoothstep(0.12, 0.65, stripDistance)).mul(stripEnds)
  return { seam, rim, bolts, strip, housing, spill }
}

export const industrialSurface = (albedo: Node<'vec3'>, coordinate: Node<'vec2'>, size: Node<'vec2'>) => {
  const masks = industrialPanelMasks(coordinate, size)
  const grain = albedo.r
  const steel = mix(color('#171d27'), color('#484b50'), smoothstep(0.25, 0.85, grain))
  const wornSteel = mix(steel, color('#575451'), masks.rim.mul(grain))
  const panel = mix(wornSteel, color('#101217'), masks.seam.max(masks.housing))
  return {
    colorNode: mix(panel, color('#66635e'), masks.bolts),
    // shortcut: spill stays on its panel; use pooled lights if nearby surfaces must be illuminated.
    emissiveNode: color('#ff790d').mul(masks.strip.mul(4).add(masks.spill.mul(0.07))),
  }
}
