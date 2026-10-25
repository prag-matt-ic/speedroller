'use client'

import { useThree } from '@react-three/fiber'
import { type FC, type RefObject, Suspense, useMemo, useEffect } from 'react'
import { Mesh, type Vector3Tuple } from 'three'
import { type CourseSurface, FLAT_SURFACE } from '@/utils/platform/courseSurface'
import { createCoursePlaneGeometry } from '@/utils/platform/coursePlaneGeometry'

import {
  TEXT_CANVAS_SCALE,
  TRANSPARENT_TEXTURE,
  type TextCanvasOptions,
  useTextCanvas,
} from '@/hooks/useTextCanvas'

type Props = {
  surface?: CourseSurface
  ref?: RefObject<Mesh | null>
  text: string
  position: Vector3Tuple
  width: number
  height: number
  textCanvasOptions?: Partial<TextCanvasOptions>
}

export const Text: FC<Props> = ({
  text,
  position,
  width,
  height,
  textCanvasOptions = {},
  ref,
  surface = FLAT_SURFACE,
}) => {
  const [x, y, z] = position
  const geometry = useMemo(() => createCoursePlaneGeometry(width, height, x, y, surface), [width, height, x, y, surface])
  useEffect(() => () => geometry.dispose(), [geometry])
  const dpr = useThree((s) => s.viewport.dpr)

  const canvasState = useTextCanvas(text, {
    width: width * dpr * TEXT_CANVAS_SCALE,
    height: height * dpr * TEXT_CANVAS_SCALE,
    color: '#000000',
    ...textCanvasOptions,
    fontSize: 30 * dpr,
  })

  return (
    <Suspense fallback={null}>
      <mesh ref={ref} position={[0, 0, z]} renderOrder={2}>
        <primitive object={geometry} attach="geometry" />
        <meshBasicMaterial
          map={canvasState?.texture ?? TRANSPARENT_TEXTURE}
          transparent={true}
          depthTest={true}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </Suspense>
  )
}
