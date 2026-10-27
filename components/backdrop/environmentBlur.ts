import { color, float, min, mix, smoothstep, texture, uv, vec2, vec3, vec4 } from 'three/tsl'
import {
  ClampToEdgeWrapping,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  NoBlending,
  NoToneMapping,
  NodeMaterial,
  QuadMesh,
  RenderTarget,
  RendererUtils,
  RepeatWrapping,
  type Texture,
  type Node,
  type WebGPURenderer,
} from 'three/webgpu'

export const ENVIRONMENT_BLUR = { sigma: 1.5, referenceWidth: 1024 } as const

// Baked into the existing blur pass; background, fog and reflections share the same sunset.
export const sunsetEnvironment = (source: Node<'vec3'>, coordinate: Node<'vec2'>) => {
  const cloudBrightness = source.dot(vec3(0.2126, 0.7152, 0.0722))
  const sky = mix(color('#a84c22'), color('#ffdb9f'), smoothstep(0.08, 0.72, cloudBrightness))
  const longitude = coordinate.x.sub(0.25).abs()
  const sunOffset = vec2(min(longitude, longitude.oneMinus()).mul(2), coordinate.y.sub(0.49))
  const sunDistance = sunOffset.dot(sunOffset)
  const halo = sunDistance.mul(-90).exp().mul(0.8)
  const sun = float(1).sub(smoothstep(0.000025, 0.00009, sunDistance)).mul(3)
  return sky.add(color('#ffb957').mul(halo)).add(color('#fff3ce').mul(sun))
}

/** One source generation, two passes. The caller owns the returned target. */
export const bakeEnvironmentMap = (renderer: WebGPURenderer, source: Texture) => {
  const image = source.image
  if (!image || typeof image !== 'object' || !('width' in image) || !('height' in image)) {
    throw new Error('Environment source has no image dimensions')
  }
  const width = Number(image.width)
  const height = Number(image.height)
  if (!(width > 0 && height > 0)) throw new Error('Environment source is empty')
  const sigma = ENVIRONMENT_BLUR.sigma * (width / ENVIRONMENT_BLUR.referenceWidth)
  const radius = Math.ceil(3 * sigma)
  const weights = Array.from({ length: radius * 2 + 1 }, (_, i) =>
    Math.exp(-((i - radius) ** 2) / (2 * sigma ** 2)),
  )
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const options = {
    type: HalfFloatType,
    colorSpace: LinearSRGBColorSpace,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapS: RepeatWrapping,
    wrapT: ClampToEdgeWrapping,
    depthBuffer: false,
    generateMipmaps: false,
  }
  const scratch = new RenderTarget(width, height, options)
  const result = new RenderTarget(width, height, options)
  result.texture.mapping = EquirectangularReflectionMapping
  result.texture.name = 'EnvironmentBlur'
  // CubeMapNode listens to texture disposal, not its render target's disposal.
  result.addEventListener('dispose', () => result.texture.dispose())
  const materials = [source, scratch.texture].map((map, axis) => {
    const material = new NodeMaterial()
    Object.assign(material, {
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      blending: NoBlending,
    })
    const samples = weights.map((weight, i) => {
      const offset = i - radius
      const coordinate = uv().add(
        vec2(axis === 0 ? offset / width : 0, axis === 1 ? offset / height : 0),
      )
      const sample = texture(map, axis === 0 ? coordinate.add(vec2(0.4, 0)) : coordinate)
        .level(float(0))
        .rgb
      return (axis === 0 ? sunsetEnvironment(sample, coordinate) : sample).mul(weight / total)
    })
    material.fragmentNode = vec4(
      samples.reduce((sum, sample) => sum.add(sample)),
      1,
    )
    return material
  })
  const state = RendererUtils.resetRendererState(
    renderer,
    RendererUtils.saveRendererState(renderer),
  )
  try {
    renderer.toneMapping = NoToneMapping
    const quad = new QuadMesh(materials[0])
    renderer.setRenderTarget(scratch)
    quad.render(renderer)
    quad.material = materials[1]
    renderer.setRenderTarget(result)
    quad.render(renderer)
    return result
  } catch (error) {
    result.dispose()
    throw error
  } finally {
    RendererUtils.restoreRendererState(renderer, state)
    scratch.dispose()
    materials.forEach((material) => material.dispose())
  }
}
