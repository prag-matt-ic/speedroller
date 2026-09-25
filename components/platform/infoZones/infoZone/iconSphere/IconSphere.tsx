/* eslint-disable react-hooks/immutability */
'use client'

import { useGSAP } from '@gsap/react'
import { useTexture } from '@react-three/drei'
import { type CreatorState, useLocalNodes, useUniforms } from '@react-three/fiber/webgpu'
import gsap from 'gsap'
import { type FC, Suspense, useCallback, useRef } from 'react'
import {
  clamp,
  float,
  mix,
  mx_noise_float,
  normalView,
  positionGeometry,
  positionView,
  smoothstep,
  sqrt,
  texture,
  time,
  vec2,
  vec3,
  vertexStage,
} from 'three/tsl'
import { AdditiveBlending, Color, SpriteMaterial, type Vector3Tuple } from 'three'
import type { Node, UniformNode } from 'three/webgpu'

import noise from '@/assets/textures/iconSphere/noise.webp'
import { usePerformanceStore } from '@/components/PerformanceProvider'
import { CORE_UNIFORM_SCOPE, type CoreUniforms } from '@/components/coreUniforms'
import { INFO_ZONE_SPHERE_COLOUR } from '@/resources/colours'
import { fadeInOut, objectWorldZ } from '@/resources/tsl/fadeInOut'

const ICON_SPHERE_RADIUS = 1
const ICON_SPHERE_GLOW_STRENGTH = 4.0
const ICON_SPHERE_POSITION: Vector3Tuple = [0, 3, 0]

const SURFACE_COLOR = new Color(INFO_ZONE_SPHERE_COLOUR) // teal accent
const LINE_COLOR = SURFACE_COLOR.clone()
LINE_COLOR.offsetHSL(0, 0, 0.16)

// uOpacity and uGlowStrength were declared in the GLSL but never set from JS, so they stayed at
// their initial values. They remain constants here.
const ICON_SPHERE_OPACITY = 0.16

// iconSphere.frag's early `if (alpha <= 0.01) discard;`. A discard needs a statement stack, which a
// material graph built at React render time does not have, so the material's alpha test does it.
const ALPHA_TEST = 0.01

const ICON_SPHERE_UNIFORM_SCOPE = 'iconSphere'

// Mineral vein tuning carried over from iconSphere.frag.
const VEIN_NOISE_FREQUENCY = 0.66
const VEIN_ANIMATION_SPEED = 0.1
const VEIN_INTENSITY = 0.5
const VEIN_BRIGHTEN_STRENGTH = 0.3

// Animation time comes from TSL's built-in `time` node, which the renderer updates itself.
type IconSphereUniforms = {
  uHiddenProgress: UniformNode<'float', number>
}

const createIconSphereUniforms = () => ({
  uHiddenProgress: 0,
})

export type IconSphereProps = {
  iconSrc: string
  shouldHide: boolean
  isVisible: boolean
  /** Stable, unique per info zone: its uniforms are registered under a scope derived from this. */
  zoneKey: string
}

const IconSphere: FC<IconSphereProps> = ({ iconSrc, shouldHide, isVisible, zoneKey }) => {
  const isDistanceFadeEnabled = usePerformanceStore((s) => s.sceneConfig.isDistanceFadeEnabled)
  const sphereSegments = usePerformanceStore((s) => s.sceneConfig.infoZoneSphere.segments)
  const enableVeins = usePerformanceStore((s) => s.sceneConfig.infoZoneSphere.enableVeins)

  const hasInitialized = useRef(false)

  const [iconTexture, noiseTexture] = useTexture([iconSrc, noise.src])
  const spriteMaterialRef = useRef<SpriteMaterial>(null)

  // One sphere per zone: a shared scope would make every sphere show/hide together.
  const sphereScope = `${ICON_SPHERE_UNIFORM_SCOPE}_${zoneKey}`

  const { uHiddenProgress } = useUniforms(
    createIconSphereUniforms,
    sphereScope,
  )

  // Port of iconSphere.vert + iconSphere.frag.
  //
  // The GLSL carried vNormal, vViewPosition, vCameraFade, vHiddenOpacity and vLocalPos as varyings.
  // All are recomputed in-graph here: the normal/view direction come from the view stage, and the
  // local position from the sphere's own geometry, which a uniform scale does not alter in
  // direction. The animated scale is applied through positionNode.
  const createNodes = useCallback(
    ({ uniforms: scopedUniforms }: CreatorState) => {
        const scoped = scopedUniforms.scope<IconSphereUniforms>(sphereScope)
        const { uPlayerWorldPos } = scopedUniforms.scope<CoreUniforms>(CORE_UNIFORM_SCOPE)

        const visibility = float(1).sub(smoothstep(float(0), float(1), scoped.uHiddenProgress))
        const scale = mix(float(0.33), float(1), visibility)

        const surfaceColor = vec3(SURFACE_COLOR.r, SURFACE_COLOR.g, SURFACE_COLOR.b)
        const lineColor = vec3(LINE_COLOR.r, LINE_COLOR.g, LINE_COLOR.b)

        const viewDirection = positionView.negate().normalize()
        const fresnel = float(1).sub(normalView.dot(viewDirection).max(0)).pow(2)
        const glowContribution = float(ICON_SPHERE_GLOW_STRENGTH).mul(fresnel)
        const lambert = normalView.y.max(0)

        const unitLocalPosition = positionGeometry.normalize()
        // Equirectangular mapping of the local direction: the atan/normalize math depends only on
        // geometry, so it is computed per vertex and the fragment stage just samples with the
        // interpolated UV.
        const noiseUv = vertexStage(
          vec2(
            unitLocalPosition.z.atan(unitLocalPosition.x).mul(0.15915494).add(0.5),
            unitLocalPosition.y.mul(0.5).add(0.5),
          ),
        )
        const noiseFactor = texture(noiseTexture, noiseUv).r

        const litSurface = surfaceColor.mul(float(0.6).add(lambert.mul(0.4))).mul(noiseFactor)
        const glowColor = lineColor.mul(float(0.4).add(glowContribution))

        // Veins are a build-time toggle: branch at graph-build time so disabling them omits the 3D
        // noise, sqrt and abs instead of multiplying their result by zero.
        let veinContribution: Node<'vec3'> = vec3(0)
        let veinAlphaContribution: Node<'float'> = float(0)
        if (enableVeins) {
          const animatedTime = time.mul(VEIN_ANIMATION_SPEED)
          const veinNoise = mx_noise_float(
            positionGeometry.mul(VEIN_NOISE_FREQUENCY).add(animatedTime),
          )
          const rawVeinMask = clamp(float(1).sub(veinNoise.abs()), float(0), float(1))
          // x^2.5 without pow.
          const veinMask = rawVeinMask.mul(rawVeinMask).mul(sqrt(rawVeinMask))
          const veinColour = glowColor.mul(1 - VEIN_BRIGHTEN_STRENGTH).add(VEIN_BRIGHTEN_STRENGTH)
          veinContribution = veinColour.mul(veinMask).mul(VEIN_INTENSITY)
          veinAlphaContribution = veinMask.mul(0.2)
        }

        const finalColor = litSurface.add(glowColor.mul(0.2)).add(veinContribution)

        const baseAlpha = float(ICON_SPHERE_OPACITY)
        // The sphere's own z, so it ramps in and out with the zone it floats over.
        const fadedAlpha = isDistanceFadeEnabled
          ? baseAlpha.mul(
              vertexStage(fadeInOut(uPlayerWorldPos.z, objectWorldZ(), { fadeOut: true })),
            )
          : baseAlpha
        const withEffects = clamp(
          fadedAlpha.add(veinAlphaContribution).add(glowContribution.mul(0.15)),
          float(0),
          float(1),
        )
        const alpha = withEffects.mul(visibility)

        return {
          positionNode: positionGeometry.mul(scale),
          colorNode: finalColor,
          opacityNode: alpha as Node<'float'>,
        }
    },
    [enableVeins, isDistanceFadeEnabled, noiseTexture, sphereScope],
  )

  const { colorNode, opacityNode, positionNode } = useLocalNodes(createNodes)


  useGSAP(
    () => {
      const spriteMaterial = spriteMaterialRef.current
      if (!spriteMaterial) return

      const target = shouldHide ? 1 : 0

      if (!hasInitialized.current) {
        uHiddenProgress.value = target
        hasInitialized.current = true
        return
      }

      gsap.to(uHiddenProgress, {
        duration: 0.6,
        value: shouldHide ? 1 : 0,
        ease: 'power2.out',
        overwrite: true,
      })
      gsap.to(spriteMaterial, {
        duration: 0.3,
        opacity: shouldHide ? 0 : 1,
        ease: 'power2.out',
        overwrite: true,
      })
    },
    { dependencies: [shouldHide] },
  )

  return (
    <group
      renderOrder={2}
      position={[0, 0, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      visible={isVisible}>
      <mesh position={ICON_SPHERE_POSITION}>
        <sphereGeometry args={[ICON_SPHERE_RADIUS, sphereSegments, sphereSegments]} />
        <meshBasicNodeMaterial
          colorNode={colorNode}
          opacityNode={opacityNode}
          positionNode={positionNode}
          transparent
          alphaTest={ALPHA_TEST}
          depthWrite={false}
          depthTest
          toneMapped={false}
          blending={AdditiveBlending}
        />
      </mesh>

      <Suspense>
        <sprite position={ICON_SPHERE_POSITION} scale={[0.8, 0.8, 1]}>
          <spriteMaterial
            ref={spriteMaterialRef}
            map={iconTexture}
            transparent={true}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </sprite>
      </Suspense>
    </group>
  )
}

export default IconSphere
