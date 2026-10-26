'use client'

import { useFrame } from '@react-three/fiber'
import { useCallback, useMemo, type RefObject } from 'react'
import type { Mesh, MeshBasicNodeMaterial } from 'three/webgpu'
import { uniform } from 'three/tsl'

import { usePerformanceStore } from '@/components/PerformanceProvider'
import { useCourseSurface } from '@/hooks/useCourseSurface'
import { PLAYER_RADIUS } from '@/utils/player'
import { createMarbleNodes } from './createMarbleNodes'

export function RemoteMarble({ ref, colour }: { ref: RefObject<Mesh | null>; colour: string }) {
  const surface = useCourseSurface()
  const { segments, isFlat, enableVeins } = usePerformanceStore(state => state.sceneConfig.marble)
  const nodes = useMemo(() => {
    const uTime = uniform(0)
    return {
      uTime,
      ...createMarbleNodes({
        uTime,
        // Remote speed and colour-confirmation effects are not synchronized.
        uSpeed: uniform(0),
        uConfirmingProgress: uniform(0),
        uPaletteIndex: uniform(0, 'int'),
        uConfirmingPaletteIndex: uniform(-1, 'int'),
      }, { colour, surface, isFlat, enableVeins }),
    }
  }, [colour, surface, isFlat, enableVeins])

  useFrame((_, deltaTime) => {
    // TSL uniforms are mutable GPU inputs, not React state.
    // eslint-disable-next-line react-hooks/immutability
    nodes.uTime.value += deltaTime
  })
  const attachMaterial = useCallback((material: MeshBasicNodeMaterial | null) => {
    if (!material) return
    Object.assign(material, { emissiveNode: nodes.emissiveNode })
    material.needsUpdate = true
  }, [nodes.emissiveNode])

  return <mesh ref={ref} visible={false}>
    <sphereGeometry args={[PLAYER_RADIUS, segments, segments]} />
    <meshBasicNodeMaterial ref={attachMaterial} colorNode={nodes.colorNode} opacityNode={nodes.opacityNode} transparent />
  </mesh>
}
