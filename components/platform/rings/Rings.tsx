import {
  BallCollider,
  type IntersectionEnterHandler,
  type RapierRigidBody,
  RigidBody,
} from '@react-three/rapier'
import gsap from 'gsap'
import {
  type FC,
  type RefObject,
  createRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { type RingIndex, useGameStore } from '@/components/GameProvider'
import { SoundFX, useSoundStore } from '@/components/SoundProvider'
import Ring, { type RingMaterial } from '@/components/platform/rings/ring/Ring'
import type { RigidBodyUserData, RingUserData } from '@/model/schema'
import { COLLISION_GROUPS } from '@/utils/collisionGroups'
import { getRingKey } from '@/utils/rings'
import { HIDDEN_POSITION, ON_TILE_Y, type RowData, colToX } from '@/utils/tiles'

const MAX_RING_INSTANCES = 20
const instancesArray = Array.from({ length: MAX_RING_INSTANCES }, (_, i) => i)
const RING_MAJOR_RADIUS = 0.32
const RING_TUBE_RADIUS = 0.06
const RING_WORLD_Y = ON_TILE_Y + RING_MAJOR_RADIUS * 2

const IS_DEV_ENV = process.env.NODE_ENV !== 'production'
const RAND_SEED_X = 12.98
const RAND_SEED_Y = 4375.54
const TAU = Math.PI * 2

const hashSlotIndex = (slotIndex: number): number => {
  const seed = slotIndex + 1
  const raw = Math.sin(seed * RAND_SEED_X) * RAND_SEED_Y
  return raw - Math.floor(raw)
}

export type RingsHandle = {
  moveElements: (zStep: number) => void
  positionElementsIfNeeded: (row: RowData, rowZ: number) => void
  hideElementsIfNeeded: (row: RowData) => void
}

/**
 * One pool slot: the ring it holds, and where that ring belongs in the world.
 *
 * Keeping the target here rather than only on the rigid body is what lets the pool be reconciled
 * every frame — see {@link Rings}'s `applySlot`.
 */
type RingSlot = {
  indexes: RingIndex
  /** World X of the ring's column, from `colToX`. */
  x: number
  /** Target world Z. The platform scroll advances it. */
  z: number
}

type Props = {
  ref: RefObject<RingsHandle | null>
  onReadyChange: (isReady: boolean) => void
}

const Rings: FC<Props> = ({ ref, onReadyChange }) => {
  const playSoundFX = useSoundStore((s) => s.playSoundFX)
  const collectedRings = useGameStore((s) => s.collectedRings)
  const onRingCollected = useGameStore((s) => s.onRingCollected)

  const [rigidBodyRefs] = useState<RefObject<RapierRigidBody | null>[]>(
    instancesArray.map(() => createRef<RapierRigidBody | null>()),
  )

  const [shaderRefs] = useState<RefObject<RingMaterial | null>[]>(() =>
    instancesArray.map(() => createRef<RingMaterial | null>()),
  )

  const slotAssignments = useRef<(RingSlot | null)[]>(Array(MAX_RING_INSTANCES).fill(null))
  // Render reads occupancy to decide what each slot draws. The ref stays the source of truth for the
  // imperative pool, and this mirror keeps render from reading a ref.
  const [occupiedSlots, setOccupiedSlots] = useState<(RingIndex | null)[]>(() =>
    Array(MAX_RING_INSTANCES).fill(null),
  )
  const rowToSlots = useRef<Map<number, number[]>>(new Map())
  const translation = useRef({ x: 0, y: 0, z: 0 })

  /**
   * Pushes a slot's target onto its rigid body.
   *
   * Every write goes through the slot rather than through its own running total, so a slot whose
   * body was not available when it was claimed — or whose body was moved behind its back — is put
   * back on target by the next frame's scroll instead of staying at `HIDDEN_POSITION` forever with
   * the pool still counting it as placed.
   */
  const applySlot = useCallback(
    (slotIndex: number) => {
      const slot = slotAssignments.current[slotIndex]
      const body = rigidBodyRefs[slotIndex].current
      if (!slot || !body) return
      translation.current.x = slot.x
      translation.current.y = RING_WORLD_Y
      translation.current.z = slot.z
      body.setTranslation(translation.current, true)
    },
    [rigidBodyRefs],
  )

  const hideSlot = useCallback(
    (slotIndex: number) => {
      const body = rigidBodyRefs[slotIndex].current
      if (!body) return
      translation.current.x = HIDDEN_POSITION[0]
      translation.current.y = HIDDEN_POSITION[1]
      translation.current.z = HIDDEN_POSITION[2]
      body.setTranslation(translation.current, true)
    },
    [rigidBodyRefs],
  )

  const releaseRow = useCallback(
    (rowIndex: number) => {
      if (rowIndex < 0) return
      const slots = rowToSlots.current.get(rowIndex)
      if (!slots) return
      slots.forEach((slotIndex) => {
        slotAssignments.current[slotIndex] = null
        setOccupiedSlots((previous) => {
          const next = [...previous]
          next[slotIndex] = null
          return next
        })
        hideSlot(slotIndex)
      })
      rowToSlots.current.delete(rowIndex)
    },
    [hideSlot],
  )

  const ensureRingForColumn = useCallback(
    (rowIndex: number, columnIndex: number, rowZ: number) => {
      if (rowIndex < 0) return
      const x = colToX(columnIndex)

      const existingSlot = slotAssignments.current.findIndex(
        (slot) => slot !== null && slot.indexes[0] === rowIndex && slot.indexes[1] === columnIndex,
      )

      if (existingSlot >= 0) {
        slotAssignments.current[existingSlot] = { indexes: [rowIndex, columnIndex], x, z: rowZ }
        applySlot(existingSlot)
        return
      }

      const availableSlot = slotAssignments.current.findIndex((slot) => slot === null)
      if (availableSlot === -1) {
        if (IS_DEV_ENV) {
          console.error(
            '[RingElements] Exceeded ring pool capacity. Increase MAX_RING_INSTANCES.',
          )
        }
        return
      }

      const indexes: RingIndex = [rowIndex, columnIndex]
      slotAssignments.current[availableSlot] = { indexes, x, z: rowZ }
      setOccupiedSlots((previous) => {
        const next = [...previous]
        next[availableSlot] = indexes
        return next
      })
      const slotsForRow = rowToSlots.current.get(rowIndex) ?? []
      slotsForRow.push(availableSlot)
      rowToSlots.current.set(rowIndex, slotsForRow)
      applySlot(availableSlot)
    },
    [applySlot],
  )

  const positionElementsIfNeeded = useCallback(
    (row: RowData, rowZ: number) => {
      if (!row.rings) return
      const rowIndex = row.rowIndex ?? -1
      if (rowIndex < 0) return
      for (let columnIndex = 0; columnIndex < row.rings.length; columnIndex++) {
        if (row.rings[columnIndex] !== 1) continue
        if (collectedRings[getRingKey(rowIndex, columnIndex)]) continue
        ensureRingForColumn(rowIndex, columnIndex, rowZ)
      }
    },
    [collectedRings, ensureRingForColumn],
  )

  const hideElementsIfNeeded = useCallback(
    (row: RowData) => {
      if (!row.rings) return
      releaseRow(row.rowIndex ?? -1)
    },
    [releaseRow],
  )

  const moveElements = useCallback(
    (zStep: number) => {
      if (zStep === 0) return
      for (let slotIndex = 0; slotIndex < slotAssignments.current.length; slotIndex++) {
        const slot = slotAssignments.current[slotIndex]
        if (!slot) continue
        // The slot carries its own Z rather than integrating the body's, so a slot whose body was
        // never written still advances from where it belongs.
        slot.z += zStep
        applySlot(slotIndex)
      }
    },
    [applySlot],
  )

  useImperativeHandle(
    ref,
    () => ({
      moveElements,
      positionElementsIfNeeded,
      hideElementsIfNeeded,
    }),
    [moveElements, positionElementsIfNeeded, hideElementsIfNeeded],
  )

  useEffect(() => {
    onReadyChange(true)
    return () => {
      onReadyChange(false)
    }
  }, [onReadyChange])

  const onIntersectionEnter: IntersectionEnterHandler = (event) => {
    const otherUserData = event.other.rigidBodyObject?.userData as RigidBodyUserData
    if (!otherUserData) return
    if (otherUserData.type !== 'player') return
    const slotIndex = (event.target.rigidBodyObject?.userData as RingUserData).slotIndex
    const slot = slotAssignments.current[slotIndex]
    if (!slot) return

    if (collectedRings[getRingKey(slot.indexes[0], slot.indexes[1])]) return

    const material = shaderRefs[slotIndex].current
    if (!material) return

    playSoundFX(SoundFX.RING_COLLECTED)
    // Animate the ring out then mark it as collected
    gsap.to(material.uExitProgress, {
      value: 1,
      duration: 0.4,
      ease: 'power1.out',
      onComplete: () => {
        onRingCollected(slot.indexes)
        setTimeout(() => {
          material.uExitProgress.value = 0
        }, 100)
      },
    })
  }

  return (
    <>
      {rigidBodyRefs.map((rigidBody, slotIndex) => {
        const assignedIndexes = occupiedSlots[slotIndex]
        const ringKey = !!assignedIndexes
          ? getRingKey(assignedIndexes[0], assignedIndexes[1])
          : null
        const isCollected = ringKey ? Boolean(collectedRings[ringKey]) : false
        const baseSeed = hashSlotIndex(slotIndex)
        const rotationSpeed = 0.6 + baseSeed * 0.7
        const rotationPhase = baseSeed * TAU
        const userData = { type: 'ring', slotIndex: slotIndex } as RingUserData
        return (
          <RigidBody
            key={`ring-slot-${slotIndex}`}
            ref={rigidBody}
            type="dynamic"
            canSleep={true}
            position={HIDDEN_POSITION}
            userData={userData}
            colliders={false}
            gravityScale={0}>
            <BallCollider
              args={[RING_MAJOR_RADIUS + RING_TUBE_RADIUS * 0.5]}
              sensor={true}
              onIntersectionEnter={onIntersectionEnter}
              collisionGroups={COLLISION_GROUPS.ringSensor}
            />
            <Ring
              isVisible={!isCollected}
              shaderRef={shaderRefs[slotIndex]}
              uniformScope={`ringSlot${slotIndex}`}
              rotationSpeed={rotationSpeed}
              rotationPhase={rotationPhase}
              radius={RING_MAJOR_RADIUS}
              tubeRadius={RING_TUBE_RADIUS}
            />
          </RigidBody>
        )
      })}
    </>
  )
}

export default Rings
