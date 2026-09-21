export const HEADING_Y = 3
export const HEADING_WIDTH = 14
export const HEADING_HEIGHT = 7

// The text sits on a cylinder, which makes it read as further away than it is, so the mesh is parked
// this far back from the row it belongs to. The shader's fade subtracts it again, so the heading
// fades against the row's z rather than the mesh origin's.
export const HEADING_POSITION_OFFSET_Z = 7
