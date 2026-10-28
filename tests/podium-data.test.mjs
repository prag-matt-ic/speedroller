import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadTypeScript } from './loadTypeScript.mjs'

const { paletteIndexSchema, speedRunSubmissionSchema, podiumEntrySchema } = loadTypeScript('model/schema.ts')

test('palette validation accepts old submissions and rejects invalid supplied colours', () => {
  const run = { username: 'racer123', time: 12, attempt: 1, date: new Date().toISOString(), input_type: 'keyboard', level_id: '1.4.0', accidents: 0, rings: 0 }
  for (const palette_index of [undefined, null, 0, 7]) assert.ok(speedRunSubmissionSchema.safeParse({ ...run, palette_index }).success)
  for (const palette_index of [-1, 8, 1.5, '2', NaN, Infinity]) assert.equal(paletteIndexSchema.safeParse(palette_index).success, false)
  assert.deepEqual(podiumEntrySchema.parse({ id: 1, username: 'racer123', time: 12, palette_index: 2, ip: 'private', country: 'GB' }),
    { id: 1, username: 'racer123', time: 12, palette_index: 2 })
})

test('podium action validates filters, parameterizes the query and propagates failures', async () => {
  let calls = 0
  const { getPodiumData } = loadTypeScript('app/actions.ts', {
    '@neondatabase/serverless': { neon: () => async (strings, ...values) => {
      calls++
      assert.deepEqual(values, ['1.4.0', 'keyboard'])
      throw new Error('database offline')
    } },
    'next/headers': {},
  })
  await assert.rejects(getPodiumData('invalid', '1.4.0'))
  assert.equal(calls, 0)
  await assert.rejects(getPodiumData('keyboard', '1.4.0'), /database offline/)
  assert.equal(calls, 1)
})

// Opt in to exercising the actual SQL against Neon; fixtures are CTEs and temporary tables only.
test('Postgres ranks distinct names, resolves ties, filters courses/inputs and round-trips palettes', { skip: process.env.PODIUM_DATABASE_TESTS !== '1' }, async () => {
  const { default: nextEnv } = await import('@next/env')
  nextEnv.loadEnvConfig(process.cwd())
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const fixture = `WITH speedroller(id, username, time, palette_index, level_id, input_type) AS (VALUES
    (1, 'repeat', 14.0::real, 1, '1.4.0', 'keyboard'),
    (2, 'repeat', 10.0, 2, '1.4.0', 'keyboard'),
    (3, 'second', 10.0, 3, '1.4.0', 'keyboard'),
    (4, 'third1', 11.0, NULL::smallint, '1.4.0', 'keyboard'),
    (5, 'fourth', 12.0, 5, '1.4.0', 'keyboard'),
    (6, 'older1', 1.0, 6, '1.3.0', 'keyboard'),
    (7, 'mobile', 2.0, 7, '1.4.0', 'joystick'),
    (8, 'repeat', 10.0, 4, '1.4.0', 'keyboard'))`
  const { getPodiumData } = loadTypeScript('app/actions.ts', {
    '@neondatabase/serverless': { neon: () => (strings, ...values) => {
      const query = strings.reduce((text, part, index) => text + (index ? `$${index}` : '') + part, '')
      return sql.query(`${fixture} ${query}`, values)
    } },
    'next/headers': {},
  })
  assert.deepEqual(await getPodiumData('keyboard', '1.4.0'), [
    { id: 2, username: 'repeat', time: 10, palette_index: 2 },
    { id: 3, username: 'second', time: 10, palette_index: 3 },
    { id: 4, username: 'third1', time: 11, palette_index: null },
  ])
  assert.deepEqual(await getPodiumData('joystick', '1.4.0'), [{ id: 7, username: 'mobile', time: 2, palette_index: 7 }])
  assert.deepEqual(await getPodiumData('keyboard', 'missing'), [])
  const [, , saved] = await sql.transaction([
    sql.query('CREATE TEMP TABLE podium_palette_test (LIKE speedroller INCLUDING CONSTRAINTS) ON COMMIT DROP'),
    sql.query("INSERT INTO podium_palette_test (id, username, time, palette_index, date, ip, attempt, rings) VALUES (-1, 'test-only', 12, 5, NOW(), 'test', 1, 0), (-2, 'legacy', 13, NULL, NOW(), 'test', 1, 0)"),
    sql.query('SELECT palette_index FROM podium_palette_test ORDER BY time'),
  ])
  assert.deepEqual(saved, [{ palette_index: 5 }, { palette_index: null }])
  await assert.rejects(sql.transaction([
    sql.query('CREATE TEMP TABLE podium_palette_test (LIKE speedroller INCLUDING CONSTRAINTS) ON COMMIT DROP'),
    sql.query("INSERT INTO podium_palette_test (id, username, time, palette_index, date, ip, attempt, rings) VALUES (-1, 'invalid', 12, 8, NOW(), 'test', 1, 0)"),
  ]), /check constraint/)
})
