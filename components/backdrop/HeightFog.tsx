import { useLocalNodes } from '@react-three/tsl'
import {
  Fn,
  backgroundIntensity,
  backgroundRotation,
  cameraPosition,
  exponentialHeightFogFactor,
  float,
  mix,
  nodeObject,
  output,
  positionWorld,
  texture,
  vec4,
  vertexStage,
} from 'three/tsl'
import { AdditiveBlending, CubeMapNode, type Node, type NodeBuilder, type Texture } from 'three/webgpu'

import { HEIGHT_FOG_DENSITY, HEIGHT_FOG_TOP_Y } from '@/utils/sceneDistances'

export default function HeightFog({ map }: { map: Texture }) {
  useLocalNodes(({ scene }) => {
    const sky = nodeObject(new CubeMapNode(texture(map))) as unknown as Node<'vec3'>
    const direction = vertexStage(backgroundRotation.mul(positionWorld.sub(cameraPosition)).xyz)
    const skyColor = sky.context({ getUV: () => direction }).rgb.mul(backgroundIntensity)
    const factor = exponentialHeightFogFactor(float(HEIGHT_FOG_DENSITY), float(HEIGHT_FOG_TOP_Y)) as Node<'float'>
    const node = Fn((builder: NodeBuilder) => {
      // Additive sprites must lose light, not gain a sky-coloured rectangle.
      const rgb = builder.material?.blending === AdditiveBlending
        ? output.rgb.mul(factor.oneMinus())
        : mix(output.rgb, skyColor, factor)
      return vec4(rgb, output.a)
    })()
    return () => {
      const previous = scene.fogNode
      scene.fogNode = node
      return () => { if (scene.fogNode === node) scene.fogNode = previous }
    }
  }, [map])
  return null
}
