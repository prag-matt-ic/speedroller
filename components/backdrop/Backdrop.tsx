'use client'

import { Environment } from '@react-three/drei'
import { useTexture, useThree } from '@react-three/fiber'
import { type FC, useLayoutEffect, useState } from 'react'
import {
  ClampToEdgeWrapping,
  EquirectangularReflectionMapping,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  type RenderTarget,
  type Texture,
} from 'three/webgpu'

import HeightFog from '@/components/backdrop/HeightFog'

import backdrop from '@/assets/textures/backdrop/environment-sky-1024.webp'
import { bakeEnvironmentMap } from '@/components/backdrop/environmentBlur'

const Backdrop: FC = () => {
  const source = useTexture(backdrop.src)
  const renderer = useThree((state) => state.renderer)
  const [map, setMap] = useState<Texture | null>(null)

  useLayoutEffect(() => {
    // The loader owns its cached texture; only configure and dispose our clone.
    const prepared = source.clone()
    prepared.colorSpace = SRGBColorSpace
    prepared.mapping = EquirectangularReflectionMapping
    prepared.wrapS = RepeatWrapping
    prepared.wrapT = ClampToEdgeWrapping
    prepared.minFilter = LinearFilter
    prepared.generateMipmaps = false

    let target: RenderTarget | undefined
    try {
      target = bakeEnvironmentMap(renderer, prepared)
      prepared.dispose()
    } catch (error) {
      console.error('Environment blur failed; using source panorama.', error)
    }
    // Publish the effect-owned GPU resource before the first visible frame.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMap(target?.texture ?? prepared)

    return () => {
      if (target) target.dispose()
      else prepared.dispose()
    }
  }, [renderer, source])

  return map ? <>
    <Environment background="only" map={map} />
    <HeightFog map={map} />
  </> : null
}

export default Backdrop
