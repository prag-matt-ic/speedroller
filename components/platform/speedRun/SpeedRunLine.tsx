import { useCourseSurface } from '@/hooks/useCourseSurface'
import { createSurfaceColliders } from '@/utils/platform/surfaceColliders'
import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import { TrimeshCollider, type IntersectionEnterHandler, RigidBody } from '@react-three/rapier'
import { type FC, useMemo } from 'react'
import type { Vector3Tuple } from 'three'

import { useGameStore, useGameStoreAPI } from '@/components/GameProvider'
import { Text } from '@/components/platform/Text'
import { UNBOUNDED_FONT_FAMILY } from '@/components/platform/fonts'
import type { RigidBodyUserData, SpeedRunLineUserData } from '@/model/schema'
import { SpeedRunStage } from '@/stores/types'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { PLAYER_RADIUS } from '@/utils/player'
import { TILE_SIZE } from '@/utils/tiles'

// Tall enough for the resting ball's centre to sit inside the band; nothing here is solid.
const LINE_SENSOR_HEIGHT = PLAYER_RADIUS * 4

const LINE_LABEL_Z_OFFSET = 3
const LINE_LABEL_WIDTH = 6
const LINE_LABEL_HEIGHT = 1.6
const LINE_LABEL_COLOR = '#eafffb'

type Props = {
  kind: 'start' | 'finish'
  /** Band anchor: centre column, tile surface and the anchor row's world Z. */
  position: Vector3Tuple
  /** Tile centres covered by the painted band, relative to the group. */
  cells: readonly Vector3Tuple[]
}

/**
 * The visible line is painted into the floor tiles; this component owns only the trigger and the
 * label. Its sensor covers exactly the cells the paint covers, so the two cannot drift apart.
 */
const SpeedRunLine: FC<Props> = ({ kind, position, cells }) => {
  const surface = useCourseSurface()
  const [x, y, z] = position
  const collision = useMemo(
    () => createSurfaceColliders(cells, surface, TILE_SIZE, LINE_SENSOR_HEIGHT, TILE_SIZE),
    [cells, surface],
  )
  const enterStartLine = useGameStore((s) => s.enterStartLine)
  const finishSpeedRun = useGameStore((s) => s.finishSpeedRun)
  const gameStoreAPI = useGameStoreAPI()
  const isStartLine = kind === 'start'

  const userData: SpeedRunLineUserData = useMemo(
    () => ({
      type: 'speed-run-line',
    }),
    [],
  )

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData | undefined
    if (otherUserData?.type !== 'player') return

    const state = gameStoreAPI.getState()
    if (isStartLine) {
      if (state.speedRunStage !== SpeedRunStage.LOBBY) return
      enterStartLine()
      return
    }

    if (state.speedRunStage !== SpeedRunStage.RUNNING) return
    finishSpeedRun(state.attemptId)
  }

  // The course has already been validated to carry both markers, so this only guards a degenerate
  // regeneration. It runs after the hooks so their order stays stable.
  if (cells.length === 0) return null

  return (
    <group position={[0, 0, z]}>
      <RigidBody
        type="fixed"
        colliders={false}
        userData={userData}>
        <TrimeshCollider
          args={[collision.vertices, collision.indices]}
          sensor={true}
          activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
          mass={0}
          friction={0}
          onIntersectionEnter={onIntersectionEnter}
          collisionGroups={COLLISION_GROUPS.finishLineSensor}
        />
      </RigidBody>
      <Text
        text={isStartLine ? 'START' : 'FINISH'}
        position={[x, y + 0.02, LINE_LABEL_Z_OFFSET]}
        surface={surface}
        width={LINE_LABEL_WIDTH}
        height={LINE_LABEL_HEIGHT}
        textCanvasOptions={{
          color: isStartLine ? '#ffffff' : LINE_LABEL_COLOR,
          fontFamily: UNBOUNDED_FONT_FAMILY,
        }}
      />
    </group>
  )
}

export default SpeedRunLine