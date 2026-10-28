import { interactionGroups } from '@react-three/rapier'

// https://rapier.rs/docs/user_guides/javascript/colliders/#active-collision-types

const PLAYER_GROUP = 0
const RING_GROUP = 1
const COLLECTIBLE_GROUP = 2
const INFO_ZONE_GROUP = 3
const OUT_OF_BOUNDS_GROUP = 4
const CONFETTI_GROUP = 5
const COLOUR_TILE_GROUP = 6

export const COLLISION_GROUPS = {
  // Player colliders stay in their own group but filter against everything.
  player: interactionGroups([PLAYER_GROUP]),
  // Rings belong to their own group and only report intersections with the player.
  ringSensor: interactionGroups([RING_GROUP], [PLAYER_GROUP]),
  // Collectible tiles should only react to the player as well.
  collectibleSensor: interactionGroups([COLLECTIBLE_GROUP], [PLAYER_GROUP]),
  // Info zones should stay isolated from other sensors too.
  infoZoneSensor: interactionGroups([INFO_ZONE_GROUP], [PLAYER_GROUP]),
  // Finish line should only react to the player.
  finishLineSensor: interactionGroups([INFO_ZONE_GROUP], [PLAYER_GROUP]),
  // Out of bounds sensor
  outOfBoundsSensor: interactionGroups([OUT_OF_BOUNDS_GROUP], [PLAYER_GROUP]),
  // Confetti sensors also only care about the player.
  confettiSensor: interactionGroups([CONFETTI_GROUP], [PLAYER_GROUP]),
  // Colour tile sensors only need to interact with the player.
  colourTileSensor: interactionGroups([COLOUR_TILE_GROUP], [PLAYER_GROUP]),
} as const
