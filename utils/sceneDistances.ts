// World units. Keep the reveal window inside the far plane, allowing for the trailing
// camera, pillar depth/height and the course's diagonal spread.
export const CAMERA_FAR = 110
export const TILE_PLAYER_FADE_FULL_RADIUS = 64
export const TILE_PLAYER_FADE_MIN_RADIUS = 88
export const TILE_PLAYER_FADE_MIN_ALPHA = 0
export const ELEMENT_FADE_DISTANCE = TILE_PLAYER_FADE_MIN_RADIUS

// Optional near-camera fade used by signage; preserve its existing ramp.
export const FADE_OUT_START = 8
export const FADE_OUT_END = 14

// Height fog is clear above this course height (world Y on flat terrain, radial on a cylinder).
// Three also multiplies depth below this height by camera-space distance.
export const HEIGHT_FOG_TOP_Y = -8
export const HEIGHT_FOG_DENSITY = 0.003
