import { z } from 'zod'

export type PlayerUserData = {
  type: 'player'
}

export type OutOfBoundsUserData = {
  type: 'out-of-bounds'
}

export type RingUserData = {
  type: 'ring'
  rowIndex: number
  columnIndex: number
}

export enum CollectibleID {
  DesignTools = 'design_tools',
  AI_Prompts = 'ai_prompts',
  Consultation = 'consultation',
}

export const COLLECTIBLE_IDS: CollectibleID[] = Object.values(CollectibleID)

export type CollectibleUserData = {
  type: 'collectible'
  collectibleType: CollectibleID
}

export type ConfettiUserData = {
  type: 'confetti'
  confettiIndex: number
}

export type InfoZoneUserData = {
  type: 'info-zone'
}

export type CtaZoneUserData = {
  type: 'cta-zone'
}

export type SpeedRunLineUserData = {
  type: 'speed-run-line'
}

export type ColourTileUserData = {
  type: 'colour-tile'
  paletteIndex: number
}

export type RigidBodyUserData =
  | PlayerUserData
  | OutOfBoundsUserData
  | CollectibleUserData
  | ConfettiUserData
  | InfoZoneUserData
  | CtaZoneUserData
  | SpeedRunLineUserData
  | ColourTileUserData

const isoDateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date string')

const databaseDateSchema = isoDateStringSchema.or(
  z.date().transform((date) => date.toISOString()),
)

export const speedRunSubmissionSchema = z.object({
  username: z.string().min(6).max(12),
  time: z.number(),
  attempt: z.number().min(1),
  date: isoDateStringSchema,
  input_type: z.enum(['keyboard', 'joystick']),
  level_id: z.string(),
  accidents: z.number().min(0).nullable(),
  rings: z.number().min(0).max(60).nullable(),
})

export const speedrunDatabaseInsertSchema = speedRunSubmissionSchema.extend({
  ip: z.string(),
  country: z.string().length(2).nullable(),
  flag: z.string().nullable(),
})

export const speedrunDatabaseSchema = speedrunDatabaseInsertSchema.extend({
  id: z.number(),
  date: databaseDateSchema,
})

export const feedbackSubmissionSchema = z.object({
  message: z.string().min(10).max(500).trim(),
  username: z.string().min(6).max(12),
})

export const feedbackDatabaseSchema = feedbackSubmissionSchema.extend({
  id: z.number(),
  username: z.string(),
  ip: z.string(),
  created_at: databaseDateSchema,
})

export type SpeedRunSubmission = z.infer<typeof speedRunSubmissionSchema>

export type ServerSpeedRunSubmission = Omit<SpeedRunSubmission, 'attempt'>

export type SpeedRunDatabaseInsert = z.infer<typeof speedrunDatabaseInsertSchema>

export type SpeedRunDatabase = z.infer<typeof speedrunDatabaseSchema>

export type InsertSpeedRunResponse = Promise<SpeedRunDatabase | null>

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>

export type FeedbackDatabase = z.infer<typeof feedbackDatabaseSchema>

export type InsertFeedbackResponse = Promise<FeedbackDatabase | null>
