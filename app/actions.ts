'use server'
import { neon } from '@neondatabase/serverless'
import { headers } from 'next/headers'
import { z } from 'zod'

import {
  type FeedbackSubmission,
  type InsertFeedbackResponse,
  type InsertSpeedRunResponse,
  type ServerSpeedRunSubmission,
  type SpeedRunDatabase,
  type SpeedRunDatabaseInsert,
  podiumEntrySchema,
  type PodiumEntry,
  paletteIndexSchema,
  feedbackDatabaseSchema,
  feedbackSubmissionSchema,
  speedrunDatabaseInsertSchema,
  speedrunDatabaseSchema,
} from '@/model/schema'
import { PLATFORM_VERSION } from '@/resources/rowsData'
import { InputType } from '@/stores/types'

export async function getSpeedrunData(
  count: number,
  inputType: 'keyboard' | 'joystick',
  levelId: string = PLATFORM_VERSION,
): Promise<SpeedRunDatabase[]> {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    const wherePlayerInput = inputType
      ? sql`WHERE level_id = ${levelId} AND input_type = ${inputType}`
      : sql`WHERE level_id = ${levelId}`

    const speedrun = await sql`
      SELECT id, username, time, date, ip, country, flag, attempt, input_type, level_id, accidents, rings, palette_index
      FROM "speedroller" 
      ${wherePlayerInput}
      ORDER BY time ASC
      LIMIT ${count}
    `
    return speedrunDatabaseSchema.array().parse(speedrun)
  } catch (error) {
    console.error('Error fetching speedrun data:', error)
    return []
  }
}

export type RunWithPosition = {
  run: SpeedRunDatabase
  position: number
}

export async function getSpeedrunPosition(
  id: number,
  inputType: InputType,
  levelId: string = PLATFORM_VERSION,
): Promise<RunWithPosition | null> {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    const wherePlayerInput = inputType
      ? sql`WHERE level_id = ${levelId} AND input_type = ${inputType}`
      : sql`WHERE level_id = ${levelId}`

    const result = await sql`
      WITH ranked_runs AS (
        SELECT 
          id,
          username,
          time,
          date,
          ip,
          country,
          flag,
          attempt,
          input_type,
          level_id,
          accidents,
          rings,
          palette_index,
          ROW_NUMBER() OVER (ORDER BY time ASC) as position
        FROM "speedroller"
        ${wherePlayerInput}
      )
      SELECT id, username, time, date, ip, country, flag, attempt, position, input_type, level_id, accidents, rings, palette_index
      FROM ranked_runs
      WHERE id = ${id}
    `

    if (!result || result.length === 0) return null
    const run = speedrunDatabaseSchema.parse(result[0])
    const position = result[0].position as number
    return { run, position }
  } catch (error) {
    console.error('Error fetching player position:', error)
    return null
  }
}

const LEVEL_ID = PLATFORM_VERSION

export async function insertSpeedRun({
  username,
  date,
  time,
  input_type,
  level_id = LEVEL_ID,
  palette_index = null,
  accidents,
  rings,
}: ServerSpeedRunSubmission): InsertSpeedRunResponse {
  try {
    paletteIndexSchema.nullable().parse(palette_index)
    const headersList = await headers()

    // TODO: This doesnt work on windows
    const getFlagEmoji = (countryCode: string) => {
      const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map((char) => 127397 + char.charCodeAt(0))
      return String.fromCodePoint(...codePoints)
    }

    const ip = headersList.get('x-forwarded-for')?.split(',')[0] || '127.0.0.1'
    const country = headersList.get('x-vercel-ip-country') ?? 'GB'
    const flag = !!country ? getFlagEmoji(country) : null

    const sql = neon(process.env.DATABASE_URL!)

    // Calculate attempt number based on username AND IP
    const previousAttempts = await sql`
      SELECT COUNT(*) as count
      FROM "speedroller"
      WHERE username = ${username}
      AND ip = ${ip}
    `

    const attempt = (Number(previousAttempts[0]?.count) || 0) + 1

    const insert: SpeedRunDatabaseInsert = {
      username,
      time,
      date,
      ip,
      country: country ?? null,
      attempt,
      flag: flag ?? null,
      input_type,
      level_id,
      accidents,
      rings,
      palette_index,
    }

    const validatedInsert = speedrunDatabaseInsertSchema.parse(insert)

    // TODO: Rename this table.
    const insertResult = await sql`
      INSERT INTO "speedroller" (username, time, date, ip, country, flag, attempt, input_type, level_id, accidents, rings, palette_index)
      VALUES (${validatedInsert.username}, ${validatedInsert.time}, ${validatedInsert.date}, ${validatedInsert.ip}, ${validatedInsert.country}, ${validatedInsert.flag}, ${validatedInsert.attempt}, ${validatedInsert.input_type}, ${validatedInsert.level_id}, ${validatedInsert.accidents}, ${validatedInsert.rings}, ${validatedInsert.palette_index ?? null})
      RETURNING id, username, time, date, ip, country, flag, attempt, input_type, level_id, accidents, rings, palette_index
    `
    if (!insertResult || insertResult.length === 0)
      throw new Error('No data returned from insert')

    const parsedInsert = speedrunDatabaseSchema.parse(insertResult[0])
    console.warn('Inserted speedrun:', parsedInsert)

    return parsedInsert
  } catch (error) {
    console.error('Error submitting speedrun:', error)

    if (error instanceof z.ZodError) {
      console.error('Zod validation error:', JSON.stringify(error.issues, null, 2))
      return null
    }

    return null
  }
}

export async function deleteAllSpeedRuns(): Promise<number> {
  try {
    const sql = neon(process.env.DATABASE_URL!)
    const deletedRows = await sql`
      DELETE FROM "speedroller"
      RETURNING id
    `
    console.warn('Deleted speedrun rows:', deletedRows.length)
    return deletedRows.length
  } catch (error) {
    console.error('Error resetting speedruns:', error)
    return 0
  }
}

export async function submitFeedback(data: FeedbackSubmission): InsertFeedbackResponse {
  try {
    const validatedData = feedbackSubmissionSchema.parse(data)
    const sql = neon(process.env.DATABASE_URL!)

    const result = await sql`
      INSERT INTO "feedback" 
        (username, message, ip)
      VALUES 
        (${validatedData.username}, ${validatedData.message}, 'client')
      RETURNING id, username, message, ip, created_at
    `

    return feedbackDatabaseSchema.parse(result[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.issues)
    } else {
      console.error('Error submitting feedback:', error)
    }
    return null
  }
}

/** Editor playtests deliberately do not create leaderboard or personal-best records. */
export async function skipEditorSpeedRun(): InsertSpeedRunResponse {
  return null
}

export async function getPodiumData(inputType: InputType, levelId: string = PLATFORM_VERSION): Promise<PodiumEntry[]> {
  z.nativeEnum(InputType).parse(inputType)
  z.string().min(1).parse(levelId)
  const sql = neon(process.env.DATABASE_URL!)
  const entries = await sql`
    SELECT id, username, time, palette_index
    FROM (
      SELECT DISTINCT ON (username) id, username, time, palette_index
      FROM "speedroller"
      WHERE level_id = ${levelId} AND input_type = ${inputType}
      ORDER BY username, time ASC, id ASC
    ) AS best_runs
    ORDER BY time ASC, id ASC
    LIMIT 3
  `
  return podiumEntrySchema.array().parse(entries)
}
