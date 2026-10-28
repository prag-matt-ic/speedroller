import type { Vector3Tuple } from 'three'

import { Overlay, SpeedRunStage, type GameStore } from '../../stores/types'

export type CameraPose = {
  position: Vector3Tuple
  target: Vector3Tuple
  up: Vector3Tuple
  zoom: number
}
export type CameraPoseOverride = { id: string; pose: CameraPose }

export const selectCameraPoseOverride = (state: GameStore): CameraPoseOverride | null =>
  state.overlay === Overlay.NONE && state.speedRunStage === SpeedRunStage.LOBBY &&
  state.playerStatus === 'safe' && !state.isSpectating
    ? state.cameraPoseOverrides.at(-1) ?? null
    : null

export const isLocalPlayerContact = (event: { other: { rigidBodyObject?: { userData?: { type?: string } } | null } }): boolean =>
  event.other.rigidBodyObject?.userData?.type === 'player'
