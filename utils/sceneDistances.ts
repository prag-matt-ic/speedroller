// World units. The reveal is sized for the 32 u/s race maximum: 80 units of solid road is two and
// a half seconds ahead at top speed, with the fade complete at 100. The 120 far plane leaves 20
// units of margin for the trailing camera, pillar depth/height and the course's diagonal spread.
export const CAMERA_FAR = 120

// Shared by the race camera and the podium preview so the two framings match when the podium is
// folded into the main scene.
export const CAMERA_FOV = 65
export const TILE_PLAYER_FADE_FULL_RADIUS = 80
export const TILE_PLAYER_FADE_MIN_RADIUS = 100
export const TILE_PLAYER_FADE_MIN_ALPHA = 0
export const ELEMENT_FADE_DISTANCE = TILE_PLAYER_FADE_MIN_RADIUS

// Optional near-camera fade used by signage; preserve its existing ramp.
export const FADE_OUT_START = 8
export const FADE_OUT_END = 14

// Height fog is clear above this course height (world Y on flat terrain, radial on a cylinder).
// Three also multiplies depth below this height by camera-space distance.
export const HEIGHT_FOG_TOP_Y = -8
export const HEIGHT_FOG_DENSITY = 0.003
