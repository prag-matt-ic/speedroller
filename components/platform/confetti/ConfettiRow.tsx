'use client'

import { ActiveCollisionTypes } from '@dimforge/rapier3d-compat'
import {
  CuboidCollider,
  type IntersectionEnterHandler,
  RigidBody,
} from '@react-three/rapier'
import { type FC, useCallback, useMemo, useRef } from 'react'
import { type Vector3Tuple } from 'three'

import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import {
  default as ConfettiParticleEmitter,
  ConfettiParticleEmitterHandle,
} from '@/components/platform/confetti/ConfettiParticleEmitter'
import { PLAYER_RADIUS } from '@/components/player/PlayerHUD'
import { ConfettiUserData, type RigidBodyUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { TILE_SIZE } from '@/utils/tiles'

type Props = {
  position: Vector3Tuple
  width: number
  depth: number
  index: number
}

const EMITTER_EDGE_PADDING = TILE_SIZE * 0.5

const ConfettiRow: FC<Props> = ({ position, width, depth, index }) => {
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const leftEmitterRef = useRef<ConfettiParticleEmitterHandle>(null)
  const rightEmitterRef = useRef<ConfettiParticleEmitterHandle>(null)

  const emitterOffset = useMemo(() => width * 0.5 + EMITTER_EDGE_PADDING, [width])

  const leftEmitterPosition = useMemo<Vector3Tuple>(
    () => [-emitterOffset, 0, 0],
    [emitterOffset],
  )
  const rightEmitterPosition = useMemo<Vector3Tuple>(
    () => [emitterOffset, 0, 0],
    [emitterOffset],
  )

  const userData = useMemo<ConfettiUserData>(
    () => ({
      type: 'confetti',
      confettiIndex: index,
    }),
    [index],
  )

  const triggerBurst = useCallback(() => {
    leftEmitterRef.current?.burst()
    rightEmitterRef.current?.burst()
    playSoundFX(SoundFX.CONFETTI_BURST)
  }, [leftEmitterRef, rightEmitterRef, playSoundFX])

  const onIntersectionEnter = useCallback<IntersectionEnterHandler>(
    (event) => {
      const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
      if (!otherUserData || otherUserData.type !== 'player') return
      triggerBurst()
    },
    [triggerBurst],
  )

  return (
    <RigidBody
      type="fixed"
      position={position}
      colliders={false}
      userData={userData}>
      <CuboidCollider
        args={[width / 2, PLAYER_RADIUS, depth / 2]}
        sensor={true}
        activeCollisionTypes={ActiveCollisionTypes.DEFAULT | ActiveCollisionTypes.KINEMATIC_FIXED}
        mass={0}
        friction={0}
        collisionGroups={COLLISION_GROUPS.confettiSensor}
        onIntersectionEnter={onIntersectionEnter}
      />

      <ConfettiParticleEmitter
        ref={leftEmitterRef}
        position={leftEmitterPosition}
        isVisible={true}
        confettiIndex={index}
        seedOffset={index * 2}
      />
      <ConfettiParticleEmitter
        ref={rightEmitterRef}
        position={rightEmitterPosition}
        isVisible={true}
        confettiIndex={index}
        seedOffset={index * 5 + 1}
      />
    </RigidBody>
  )
}

export default ConfettiRow
