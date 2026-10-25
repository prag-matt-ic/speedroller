import { z } from 'zod'

export const PROTOCOL_VERSION = 1
export const LIMITS = {
  racers: 5, spectators: 20, rooms: 100, connections: 500,
  payloadBytes: 8192, posesPerSecond: 40, controlsPerSecond: 10,
  countdownMs: 3000, raceMs: 180000, idleRoomMs: 600000,
  heartbeatMs: 5000, deadConnectionMs: 15000, joinMs: 10000,
  softQueueBytes: 65536, hardQueueBytes: 262144, congestionMs: 5000,
  connectionsPerMinute: 60, creationsPerMinute: 10,
} as const
const id = z.uuid()
const time = z.number().finite().nonnegative()
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
// Matches the existing solo username rule; contract-tested without importing game modules.
export const profileSchema = z.object({ name: z.string().min(6).max(12), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict()
export const courseSchema = z.object({
  layoutVersion: z.string().min(1).max(128), rulesVersion: z.string().min(1).max(128),
  topology: z.enum(['flat', 'cylinder']), columns: z.number().int().min(1).max(256),
}).strict()
const coordinate = z.number().finite().min(-1000000).max(1000000)
export const poseSchema = z.object({
  sequence, position: z.tuple([coordinate, coordinate, coordinate]),
  rotation: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
    .refine(q => Math.abs(q.reduce((sum, value) => sum + value * value, 0) - 1) < 0.01, 'Expected unit quaternion'),
  respawn: sequence,
}).strict()
const command = <T extends z.ZodRawShape>(shape: T) => z.object({ protocolVersion: z.literal(PROTOCOL_VERSION), ...shape }).strict()
export const clientMessageSchema = z.discriminatedUnion('type', [
  command({ type: z.literal('create'), profile: profileSchema, course: courseSchema }),
  command({ type: z.literal('join'), roomId: id, role: z.enum(['racer', 'spectator']), profile: profileSchema, course: courseSchema }),
  command({ type: z.literal('leave') }),
  command({ type: z.literal('snapshot') }),
  command({ type: z.literal('ping'), clientTime: time }),
  command({ type: z.literal('sync'), tokens: z.array(id).length(5).refine(tokens => new Set(tokens).size === 5) }),
  command({ type: z.literal('ready'), course: courseSchema, pose: poseSchema }),
  command({ type: z.literal('start'), revision: sequence }),
  command({ type: z.literal('new-race'), raceId: id }),
  command({ type: z.literal('claim-slot') }),
  command({ type: z.literal('pose'), raceId: id, pose: poseSchema }),
  command({ type: z.literal('finish'), raceId: id, elapsedMs: time, pose: poseSchema }),
])
export const memberSchema = z.object({
  id, profile: profileSchema, role: z.enum(['racer', 'spectator']), ready: z.boolean(),
}).strict()
export const entrantSchema = z.object({
  id, profile: profileSchema, slot: z.number().int().min(1).max(5),
  status: z.enum(['racing', 'finished', 'dnf']), pose: poseSchema,
  receivedAt: time, elapsedMs: time.nullable(), place: z.number().int().min(1).max(5).nullable(),
}).strict()
export const snapshotSchema = z.object({
  type: z.literal('snapshot'), protocolVersion: z.literal(PROTOCOL_VERSION),
  selfId: id, roomId: id, revision: sequence, ownerId: id, ownerConnected: z.boolean(),
  course: courseSchema, phase: z.enum(['waiting', 'countdown', 'racing', 'results']),
  raceId: id.nullable(), startAt: time.nullable(), serverTime: time,
  members: z.array(memberSchema).max(25), entrants: z.array(entrantSchema).max(5),
}).strict()
export const errorCodes = ['invalid-message', 'protocol-mismatch', 'already-joined', 'not-joined',
  'room-missing', 'course-mismatch', 'unsupported-course', 'full', 'server-full', 'rate-limit',
  'owner-only', 'stale-room', 'entry-closed', 'not-ready', 'need-opponent', 'wrong-phase', 'stale-race',
  'racer-only', 'invalid-time', 'clock-sync-required', 'invalid-sync', 'stale-pose'] as const
export const serverMessageSchema = z.discriminatedUnion('type', [
  snapshotSchema,
  z.object({ type: z.literal('poses'), protocolVersion: z.literal(PROTOCOL_VERSION), roomId: id,
    raceId: id, revision: sequence, serverTime: time, entrants: z.array(entrantSchema).max(5) }).strict(),
  z.object({ type: z.literal('pong'), clientTime: time, serverTime: time, token: id }).strict(),
  z.object({ type: z.literal('synced') }).strict(),
  z.object({ type: z.literal('left') }).strict(),
  z.object({ type: z.literal('error'), code: z.enum(errorCodes) }).strict(),
  z.object({ type: z.literal('closed'), reason: z.enum(['owner-left', 'expired', 'shutdown']) }).strict(),
])
export type ClientMessage = z.infer<typeof clientMessageSchema>
export type ServerMessage = z.infer<typeof serverMessageSchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export type Course = z.infer<typeof courseSchema>
export type Profile = z.infer<typeof profileSchema>
export type Pose = z.infer<typeof poseSchema>
export type Entrant = z.infer<typeof entrantSchema>
export type ErrorCode = typeof errorCodes[number]

export function sameCourse(first: Course, second: Course) {
  return first.layoutVersion === second.layoutVersion && first.rulesVersion === second.rulesVersion &&
    first.topology === second.topology && first.columns === second.columns
}

export function roomUrl(baseUrl: string, roomId: string, watch = false) {
  id.parse(roomId)
  const url = new URL(baseUrl)
  url.searchParams.set('room', roomId)
  if (watch) url.searchParams.set('watch', '1')
  else url.searchParams.delete('watch')
  return url.toString()
}
