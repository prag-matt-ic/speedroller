/* eslint-disable react-hooks/immutability */
'use client'

import { useGSAP } from '@gsap/react'
import { useTexture } from '@react-three/drei'
import { type CreatorState, useLocalNodes,useThree } from '@react-three/fiber/webgpu'
import gsap from 'gsap'
import { type FC, type RefObject, useCallback, useEffect, useMemo } from 'react'
import {
  clamp,
  cos,
  float,
  mat2,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  uniformTexture,
  uv,
  vec2,
  vec3,
  vertexStage,
} from 'three/tsl'
import {
  BackSide,
  Mesh,
  RepeatWrapping,
  type Vector3Tuple,
} from 'three'

import floatingHeadingNoise from '@/assets/textures/platform/heading-noise.webp'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { UNBOUNDED_FONT_FAMILY } from '@/components/platform/fonts'
import {
  TEXT_CANVAS_SCALE,
  TRANSPARENT_TEXTURE,
  type TextCanvasOptions,
  useTextCanvas,
} from '@/hooks/useTextCanvas'

import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { fadeInOut, objectWorldZ } from '@/resources/tsl/fadeInOut'
import { HEADING_POSITION_OFFSET_Z } from '@/utils/platform/floatingHeading'

gsap.registerPlugin(useGSAP)

type Props = {
  ref: RefObject<Mesh | null>
  text: string
  position: Vector3Tuple
  width: number
  height: number
  isVisible?: boolean
  textCanvasOptions?: Partial<TextCanvasOptions>
}

// Tuning carried over from floatingHeading.vert / .frag.
const HEADING_MAX_ANGLE = 0.4
const HEADING_LATERAL_RANGE = 6.0
const ALPHA_EPSILON = 0.001
const DISSOLVE_WIDTH = 0.2

const DEFAULT_FONT_SIZE = 64
const DEFAULT_LINE_HEIGHT_MULTIPLIER = 1.25
const DEFAULT_FONT_WEIGHT = 700

const BASE_TEXT_CANVAS_OPTIONS: Pick<TextCanvasOptions, 'color' | 'fontFamily'> = {
  color: '#ffffff',
  fontFamily: UNBOUNDED_FONT_FAMILY,
}

export const FloatingHeading: FC<Props> = ({
  text,
  position,
  width,
  height,
  isVisible = false,
  textCanvasOptions = {},
  ref,
}) => {
  const { shouldRotate, useNoiseFade } = usePerformanceStore(
    (s) => s.sceneConfig.floatingHeading,
  )
  const useDistanceFade = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled) // for distance faded

  const dpr = useThree((s) => s.viewport.dpr)

  const dissolveNoiseTexture = useTexture(floatingHeadingNoise.src, (texture) => {
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
  })

  const textTextureNode = useMemo(() => uniformTexture(TRANSPARENT_TEXTURE), [])

  // Port of floatingHeading.vert + floatingHeading.frag.
  //
  // The GLSL carried vMirroredUv and vCameraFade across as varyings. Both are recomputed here:
  // vMirroredUv from the geometry uv, and vCameraFade from the mesh's own world position, which is
  // the heading centre the GLSL passed in as uHeadingCenterXZ.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
      const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

      const mirroredUv = vec2(uv().x.oneMinus(), uv().y)
      const headingCenter = positionWorld

      // The three toggles are build-time props, so a JavaScript branch picks the graph and the
      // unused half never reaches the shader.
      //
      // The fade reads the row's own z, which is the centre the GLSL passed in as uHeadingCenterXZ,
      // so the whole arc fades as one: it materialises from the distance and fades back out on the
      // approach to the camera. The mesh is parked a cylinder behind its row, so the offset is
      // subtracted again here. vCameraFade was a varying in the GLSL; hoist the fade to the vertex
      // stage so the fragment only reads the interpolated result.
      const cameraFade = useDistanceFade
        ? vertexStage(
            fadeInOut(uPlayerWorldPos.z, objectWorldZ().sub(HEADING_POSITION_OFFSET_Z), {
              fadeOut: true,
            }),
          )
        : float(1)

      const texel = texture(textTextureNode, mirroredUv)

      const noiseSample = texture(dissolveNoiseTexture, mirroredUv).r
      const noiseEdge = noiseSample.mul(0.3)
      const noiseStrength = mix(float(0.65), float(1), noiseSample)
      const dissolve = useNoiseFade
        ? smoothstep(
            noiseEdge.sub(DISSOLVE_WIDTH),
            noiseEdge.add(DISSOLVE_WIDTH),
            cameraFade.mul(noiseStrength),
          )
        : cameraFade

      const alpha = texel.a.mul(dissolve)

      // Lane-style lateral tilt about the heading's own centre.
      const lateralOffset = uPlayerWorldPos.x.sub(headingCenter.x)
      const tiltT = clamp(lateralOffset.div(HEADING_LATERAL_RANGE), float(-1), float(1))
      const headingRotation = float(HEADING_MAX_ANGLE).mul(tiltT)
      const sine = sin(headingRotation)
      const cosine = cos(headingRotation)
      const rotation = mat2(cosine, sine.negate(), sine, cosine)
      const centeredXZ = positionLocal.xz.sub(headingCenter.xz)
      const tiltedXZ = rotation.mul(centeredXZ).add(headingCenter.xz)
      const rotatedPosition = shouldRotate
        ? vec3(tiltedXZ.x, positionLocal.y, tiltedXZ.y)
        : positionLocal

      return {
        positionNode: rotatedPosition,
        colorNode: texel.rgb,
        opacityNode: alpha,
      }
    },
    [useDistanceFade, useNoiseFade, shouldRotate, textTextureNode, dissolveNoiseTexture],
  )

  const { colorNode, opacityNode, positionNode } = useLocalNodes(createNodes)

  const textCanvasOptionsWithDefaults = useMemo<TextCanvasOptions>(() => {
    const baseFontSize = textCanvasOptions?.fontSize ?? DEFAULT_FONT_SIZE
    const lineHeightMultiplier =
      textCanvasOptions?.lineHeightMultiplier ?? DEFAULT_LINE_HEIGHT_MULTIPLIER
    const fontWeight = textCanvasOptions?.fontWeight ?? DEFAULT_FONT_WEIGHT

    return {
      width: width * dpr * TEXT_CANVAS_SCALE,
      height: height * dpr * TEXT_CANVAS_SCALE,
      ...BASE_TEXT_CANVAS_OPTIONS,
      ...(textCanvasOptions ?? {}),
      lineHeightMultiplier,
      fontSize: baseFontSize * dpr,
      fontWeight,
    }
  }, [dpr, height, textCanvasOptions, width])

  const canvasState = useTextCanvas(text, textCanvasOptionsWithDefaults)

  const { radius, thetaLength, thetaStart } = useMemo(() => {
    const arcLength = Math.PI * 0.8 // keeps a gentle bend without wrapping the texture
    const computedRadius = Math.max(width / arcLength, 0.001)
    const start = Math.PI / 2 - arcLength / 2
    return {
      radius: computedRadius,
      thetaLength: arcLength,
      thetaStart: start,
    }
  }, [width])

  useEffect(() => {
    textTextureNode.value = canvasState?.texture ?? TRANSPARENT_TEXTURE
  }, [canvasState, textTextureNode])

  return (
    <mesh
      ref={ref}
      visible={isVisible}
      position={position}
      renderOrder={2}
      rotation={[0, Math.PI / 2, 0]}>
      <cylinderGeometry args={[radius, radius, height, 32, 1, true, thetaStart, thetaLength]} />
      <meshBasicNodeMaterial
        colorNode={colorNode}
        opacityNode={opacityNode}
        positionNode={positionNode}
        transparent
        alphaTest={ALPHA_EPSILON}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        side={BackSide}
      />
    </mesh>
  )
}
