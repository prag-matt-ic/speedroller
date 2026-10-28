/**
 * Automatic race speed and braking on flat terrain.
 *
 * The player loop owns one mutable `RaceSpeedState` and advances it once per frame. Keeping the
 * rules here, free of Three.js and React, lets them be unit-tested and keeps the hot loop free of
 * allocations.
 *
 * Contract:
 * - Forward travel is automatic while racing; zero input means cruise, never a stop.
 * - Braking wins over cruise and ring boost, and floors at exactly 0 so the ball cannot reverse.
 * - Ring boost raises the allowed ceiling and decays on every racing step, braking included.
 * - Releasing the brake accelerates toward the currently allowed cruise/boost speed.
 */

/** Automatic speed with no boost, in world units per second. */
export const RACE_CRUISE_SPEED = 19
/** Hard cap, reachable only with ring boost. */
export const RACE_MAX_SPEED = 32
/** Sideways travel while racing, independent of forward speed. */
export const RACE_STEER_SPEED = 8
/** Forward acceleration and brake-release ramp, in units per second squared. */
export const RACE_FORWARD_ACCELERATION = 14
/** Braking deceleration in units per second squared: cruise to a stop in roughly 0.9 s. */
export const RACE_BRAKE_DECELERATION = 22
/** Speed added per collected ring. */
export const RING_BOOST_SPEED = 2
/** Boost ceiling, so boost alone can reach `RACE_MAX_SPEED`. */
export const RING_BOOST_MAX = RACE_MAX_SPEED - RACE_CRUISE_SPEED
/** Boost lost per second. Lower values keep collected ring speed for longer. */
export const RING_BOOST_DECAY = 1.2
/** Manual movement speed outside the race, matching the lobby feel. */
export const LOBBY_SPEED = 8
/** Downward joystick displacement below this is noise rather than a brake. */
export const BRAKE_DEADZONE = 0.15

export type RaceSpeedState = {
  /** Current forward speed, 0…`RACE_MAX_SPEED`. */
  forwardSpeed: number
  /** Speed currently allowed above cruise, 0…`RING_BOOST_MAX`. */
  boostUnits: number
}

export const createRaceSpeedState = (): RaceSpeedState => ({
  forwardSpeed: 0,
  boostUnits: 0,
})

/** Speed the ball accelerates toward: cruise plus whatever boost it still has, capped. */
export const getRaceTargetSpeed = (boostUnits: number): number =>
  Math.min(RACE_MAX_SPEED, RACE_CRUISE_SPEED + boostUnits)

/**
 * Credits rings collected since the previous frame. `count` can exceed one when several rings are
 * crossed in the same frame, so a single step never drops a ring's boost.
 */
export function addRingBoost(state: RaceSpeedState, count: number): void {
  if (count <= 0) return
  state.boostUnits = Math.min(RING_BOOST_MAX, state.boostUnits + RING_BOOST_SPEED * count)
}

/** Clears a run's momentum before the next attempt starts from rest. */
export function resetRaceSpeed(state: RaceSpeedState): void {
  state.forwardSpeed = 0
  state.boostUnits = 0
}

/**
 * Moves `current` toward `target` by at most `maxDelta`, landing exactly on the target rather than
 * overshooting. Used for both speeding up and shedding expired boost.
 */
function moveTowards(current: number, target: number, maxDelta: number): number {
  const difference = target - current
  if (Math.abs(difference) <= maxDelta) return target
  return difference > 0 ? current + maxDelta : current - maxDelta
}

/**
 * Advances the model by one frame. The caller supplies the same clamped delta it uses for
 * movement, so a slow frame cannot integrate a whole stalled gap.
 */
export function stepRaceSpeed(
  state: RaceSpeedState,
  isBraking: boolean,
  deltaSeconds: number,
): void {
  if (deltaSeconds <= 0) return

  // Boost is a timed allowance from the last ring, not a charge: braking spends it too.
  state.boostUnits = Math.max(0, state.boostUnits - RING_BOOST_DECAY * deltaSeconds)

  if (isBraking) {
    state.forwardSpeed = Math.max(
      0,
      state.forwardSpeed - RACE_BRAKE_DECELERATION * deltaSeconds,
    )
    return
  }

  const targetSpeed = getRaceTargetSpeed(state.boostUnits)
  state.forwardSpeed = moveTowards(
    state.forwardSpeed,
    targetSpeed,
    RACE_FORWARD_ACCELERATION * deltaSeconds,
  )
}
