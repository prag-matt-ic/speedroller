'use client'

import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { type FC } from 'react'

import { useGameStore } from '@/components/GameProvider'
import type { OutOfBoundsUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { COLUMNS, TILE_SIZE, rowToWorldZ } from '@/utils/tiles'

const userData: OutOfBoundsUserData = { type: 'out-of-bounds' }
const COURSE_MARGIN = 10

const OutOfBounds: FC = () => {
  const rowCount = useGameStore((s) => s.rowsData.length)
  const firstRowZ = rowToWorldZ(0)
  const lastRowZ = rowToWorldZ(Math.max(0, rowCount - 1))
  const courseCenterZ = (firstRowZ + lastRowZ) / 2
  const courseHalfLength = (Math.abs(firstRowZ - lastRowZ) + TILE_SIZE) / 2

  return (
    <RigidBody
      type="fixed"
      friction={0}
      colliders={false}
      position={[0, -4, courseCenterZ]}
      userData={userData}>
      {/* Large, sensor plane below the playable tiles to trigger game over / reset */}
      <CuboidCollider
        position={[0, 0, 0]}
        args={[(COLUMNS * TILE_SIZE) / 2 + COURSE_MARGIN, 1, courseHalfLength + COURSE_MARGIN]}
        sensor={true}
        collisionGroups={COLLISION_GROUPS.outOfBoundsSensor}
        activeCollisionTypes={
          ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED
        }
      />
    </RigidBody>
  )
}

export default OutOfBounds
