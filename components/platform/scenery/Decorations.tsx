import { useCourseSurface } from '@/hooks/useCourseSurface'
import { courseToWorld, surfaceRotation } from '@/utils/platform/courseSurface'
import { type FC, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Euler, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import type { Vector3Tuple } from 'three'

import { ON_TILE_Y, type RowData, TILE_SIZE, colToX, rowToWorldZ } from '@/utils/tiles'

const DECORATION_SCALE = 0.84
const DECORATION_Y = ON_TILE_Y + 0.012
const DECORATION_COLOR = '#1a5f58'
const DECORATION_OPACITY = 0.5
const FLAT_QUAD_ROTATION = new Euler(-Math.PI / 2, 0, 0)

type Props = {
  rows: readonly RowData[]
  onReadyChange: (isReady: boolean) => void
}

const collectDecorationPositions = (rows: readonly RowData[]): Vector3Tuple[] => {
  const positions: Vector3Tuple[] = []
  rows.forEach((row, rowIndex) => {
    ;(row.decorationColumns ?? []).forEach((columnIndex) => {
      if (columnIndex < 0 || columnIndex >= row.isRaised.length) return
      positions.push([colToX(columnIndex, row.isRaised.length), DECORATION_Y, rowToWorldZ(rowIndex)])
    })
  })
  return positions
}

/**
 * Detached checker/chevron scenery. These cells are parsed from their own masks and never enter
 * the collidable floor, ring placement, or safe-respawn search.
 */
const Decorations: FC<Props> = ({ rows, onReadyChange }) => {
  const surface = useCourseSurface()
  const positions = useMemo(() => collectDecorationPositions(rows), [rows])
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || positions.length === 0) return

    const matrix = new Matrix4()
    const position = new Vector3()
    const quaternion = new Quaternion()
    const flatRotation = new Quaternion().setFromEuler(FLAT_QUAD_ROTATION)
    const scale = new Vector3(DECORATION_SCALE, DECORATION_SCALE, 1)

    positions.forEach(([x, y, z], index) => {
      courseToWorld(x, y, z, surface, position)
      surfaceRotation(x, surface, quaternion)
      quaternion.multiply(flatRotation)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(index, matrix)
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingBox()
    mesh.computeBoundingSphere()
  }, [positions, surface])

  useEffect(() => {
    onReadyChange(true)
    return () => onReadyChange(false)
  }, [onReadyChange])

  if (positions.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      count={positions.length}
      frustumCulled>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial
        color={DECORATION_COLOR}
        transparent
        opacity={DECORATION_OPACITY}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  )
}

export default Decorations
