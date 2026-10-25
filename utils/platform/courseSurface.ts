import { COLUMNS, TILE_SIZE, TILE_SURFACE_Y } from '../tiles'

export type CourseSurface = { topology: 'flat' | 'cylinder'; columns: number }
export const FLAT_SURFACE: CourseSurface = { topology: 'flat', columns: COLUMNS }
export const CYLINDER_SURFACE: CourseSurface = { topology: 'cylinder', columns: 132 }

type Position = { x: number; y: number; z: number }
type Rotation = { set: (x: number, y: number, z: number, w: number) => unknown }

export const surfaceRadius = (surface: CourseSurface) => surface.columns * TILE_SIZE / (2 * Math.PI)
export const wrapColumn = (column: number, columns: number) => ((column % columns) + columns) % columns

/** Signed shortest distance in unrolled surface units; never wraps the forward axis. */
export function surfaceDeltaX(from: number, to: number, surface: CourseSurface) {
  const distance = to - from
  if (surface.topology === 'flat') return distance
  const circumference = surface.columns * TILE_SIZE
  return wrapColumn(distance + circumference / 2, circumference) - circumference / 2
}

export function courseToWorld(x: number, y: number, z: number, surface: CourseSurface, target: Position) {
  if (surface.topology === 'flat') {
    target.x = x; target.y = y; target.z = z
    return target
  }
  const radius = surfaceRadius(surface)
  const angle = x / radius
  const distance = radius - (y - TILE_SURFACE_Y)
  target.x = distance * Math.sin(angle)
  target.y = radius + TILE_SURFACE_Y - distance * Math.cos(angle)
  target.z = z
  return target
}

export function worldToCourse(position: Position, surface: CourseSurface, target: Position) {
  if (surface.topology === 'flat') {
    target.x = position.x; target.y = position.y; target.z = position.z
    return target
  }
  const radius = surfaceRadius(surface)
  const radialX = position.x
  const radialY = radius + TILE_SURFACE_Y - position.y
  target.x = Math.atan2(radialX, radialY) * radius
  target.y = radius + TILE_SURFACE_Y - Math.hypot(radialX, radialY)
  target.z = position.z
  return target
}

export function surfaceFrame(x: number, surface: CourseSurface, up: Position, right: Position) {
  const angle = surface.topology === 'cylinder' ? x / surfaceRadius(surface) : 0
  up.x = -Math.sin(angle); up.y = Math.cos(angle); up.z = 0
  right.x = up.y; right.y = -up.x; right.z = 0
}

export function surfaceRotation(x: number, surface: CourseSurface, target: Rotation) {
  const halfAngle = surface.topology === 'cylinder' ? x / surfaceRadius(surface) / 2 : 0
  target.set(0, 0, Math.sin(halfAngle), Math.cos(halfAngle))
}
