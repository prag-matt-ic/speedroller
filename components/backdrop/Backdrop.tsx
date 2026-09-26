'use client'

import { useTexture } from '@react-three/drei'
import { useLocalNodes } from '@react-three/fiber/webgpu'
import { type FC, useCallback, useLayoutEffect, useRef } from 'react'
import { float, smoothstep, texture, uv, vec2 } from 'three/tsl'
import { BufferAttribute, type Mesh, type PlaneGeometry, type Vector3Tuple } from 'three'

import backdrop from '@/assets/textures/backdrop/bg-03.webp'
import { usePlayerPosition } from '@/hooks/usePlayerPosition'
import { TILE_SIZE } from '@/utils/tiles'

const BACKDROP_SEGMENT_COUNT = 6
const BACKDROP_FLOOR_RATIO = 1
const BACKDROP_WIDTH_TILES = 88
const BACKDROP_DEPTH_TILES = 20
const BACKDROP_HEIGHT = 32
const BACKDROP_WIDTH = TILE_SIZE * BACKDROP_WIDTH_TILES
const BACKDROP_DEPTH = TILE_SIZE * BACKDROP_DEPTH_TILES
const BACKDROP_POSITION: [number, number, number] = [0, -5, -14]
const BACKDROP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, Math.PI / 2]

// Tuning constants carried over from backdrop.frag.
const DARKNESS = 0.1
const EDGE_FADE = 0.2

const easeInExpo = (value: number) =>
  value <= 0 ? 0 : Math.pow(2, 10 * Math.min(value, 1) - 10)

const Backdrop: FC = () => {
  const backdropColour = useTexture(backdrop.src)
  const meshRef = useRef<Mesh>(null)
  const geometryRef = useRef<PlaneGeometry | null>(null)
  const followPlayer = useCallback((position: Vector3Tuple) => {
    if (!meshRef.current) return
    // This decorative horizon travels with the view while the playable course stays fixed.
    meshRef.current.position.z = BACKDROP_POSITION[2] + position[2]
  }, [])
  usePlayerPosition(followPlayer)

  // Port of backdrop.frag: sample the backdrop, darken it, then fade both U edges.
  const { colorNode } = useLocalNodes(() => {
    const backdropUv = uv()
    const sampled = texture(backdropColour, backdropUv).rgb.mul(1 - DARKNESS)
    const fadeWidth = float(Math.max(EDGE_FADE, 1e-4))
    const edgeMask = smoothstep(
      vec2(0),
      vec2(fadeWidth),
      vec2(backdropUv.x, backdropUv.x.oneMinus()),
    )
    return { colorNode: sampled.mul(edgeMask.x.mul(edgeMask.y)) }
  })

  useLayoutEffect(() => {
    const geometry = geometryRef.current
    if (!geometry) return

    // Create curved backdrop geometry

    const segmentCount = BACKDROP_SEGMENT_COUNT
    let i = 0
    const offset = 0.5
    const position = geometry.attributes.position as BufferAttribute
    const uvAttribute = geometry.attributes.uv as BufferAttribute
    const rowLength = segmentCount + 1
    const arcLengths: number[] = new Array(rowLength).fill(0)

    for (let x = 0; x <= segmentCount; x++) {
      for (let y = 0; y <= segmentCount; y++) {
        // Calculate normalized depth (x-axis in grid)
        // offset centers the grid.
        // BACKDROP_FLOOR_RATIO adds extra length to the start (floor) of the curve
        const depthNormalized =
          x / segmentCount - offset + (x === 0 ? -BACKDROP_FLOOR_RATIO : 0)

        // Calculate normalized width (y-axis in grid)
        const widthNormalized = y / segmentCount - offset

        position.setXYZ(
          i++,
          depthNormalized * BACKDROP_DEPTH, // X coordinate: Depth
          widthNormalized * BACKDROP_WIDTH, // Y coordinate: Width
          easeInExpo(x / segmentCount) * BACKDROP_HEIGHT, // Z coordinate: Height (curved upwards)
        )
      }

      if (x > 0) {
        const previousIndex = (x - 1) * rowLength
        const currentIndex = x * rowLength
        const deltaDepth = position.getX(currentIndex) - position.getX(previousIndex)
        const deltaHeight = position.getZ(currentIndex) - position.getZ(previousIndex)
        arcLengths[x] = arcLengths[x - 1] + Math.hypot(deltaDepth, deltaHeight)
      }
    }

    const totalArcLength = arcLengths[rowLength - 1] || 1

    // Log the optimal aspect ratio for the texture
    // This helps in preparing the texture image with the correct dimensions to avoid stretching
    if (process.env.NODE_ENV === 'development') {
      console.warn('Backdrop Aspect Ratio (Width / Height):', BACKDROP_WIDTH / totalArcLength)
      // CURRENT: 1.38
    }
    for (let x = 0; x <= segmentCount; x++) {
      const v = arcLengths[x] / totalArcLength
      for (let y = 0; y <= segmentCount; y++) {
        const index = x * rowLength + y
        const u = y / segmentCount
        uvAttribute.setXY(index, u, v)
      }
    }
    position.needsUpdate = true
    uvAttribute.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }, [])

  return (
    <mesh ref={meshRef} position={BACKDROP_POSITION} rotation={BACKDROP_ROTATION}>
      <planeGeometry
        ref={geometryRef}
        args={[1, 1, BACKDROP_SEGMENT_COUNT, BACKDROP_SEGMENT_COUNT]}
      />
      <meshBasicNodeMaterial colorNode={colorNode} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

export default Backdrop
