import { useCourseSurface } from '@/hooks/useCourseSurface'
import { useLocalNodes } from '@react-three/tsl'
import {
  Fn,
  smoothstep,
  distance,
  backgroundIntensity,
  backgroundRotation,
  cameraPosition,
  exponentialHeightFogFactor,
  float,
  mix,
  nodeObject,
  output,
  positionWorld,
  positionView,
  texture,
  vec4,
  vertexStage,
} from 'three/tsl'
import { AdditiveBlending, CubeMapNode, type Node, type NodeBuilder, type Texture } from 'three/webgpu'

import { worldCourseNode } from '@/resources/tsl/courseSurface'

import { HEIGHT_FOG_DENSITY, HEIGHT_FOG_TOP_Y, CAMERA_FAR } from '@/utils/sceneDistances'

export default function HeightFog({ map }: { map: Texture }) {
  const surface = useCourseSurface()
  useLocalNodes(({ scene }) => {
    const sky = nodeObject(new CubeMapNode(texture(map))) as unknown as Node<'vec3'>
    const direction = vertexStage(backgroundRotation.mul(positionWorld.sub(cameraPosition)).xyz)
    const skyColor = sky.context({ getUV: () => direction }).rgb.mul(backgroundIntensity)
    // Radial height keeps the fog below the road, including on the walls and ceiling.
    const cylinderFog = () => {
      const heightBelowFog = float(HEIGHT_FOG_TOP_Y).sub(worldCourseNode(positionWorld, surface).y).max(0)
      const opticalDepth = heightBelowFog.mul(positionView.z.negate().max(0)).mul(HEIGHT_FOG_DENSITY)
      return opticalDepth.mul(opticalDepth).negate().exp().oneMinus().max(
          smoothstep(float(CAMERA_FAR * 0.6), float(CAMERA_FAR), distance(positionWorld, cameraPosition)),
        )
    }
    const factor = surface.topology === 'cylinder'
      ? cylinderFog()
      : exponentialHeightFogFactor(float(HEIGHT_FOG_DENSITY), float(HEIGHT_FOG_TOP_Y)) as Node<'float'>
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
  }, [map, surface])
  return null
}
