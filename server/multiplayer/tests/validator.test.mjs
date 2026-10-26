import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS, PROTOCOL_VERSION } from '../../../shared/multiplayer/protocol.mts'

const run = promisify(execFile)
const validator = new URL('../validate.mjs', import.meta.url).pathname

test('validator rejects durations that leave no spectator setup budget', async () => {
  const maximumSeconds = (LIMITS.raceMs - 30000) / 1000
  for (const seconds of [maximumSeconds + 1, 300]) {
    await assert.rejects(run(process.execPath, [validator], {
      env: { ...process.env, SPIKE_SECONDS: String(seconds) }, timeout: 5000,
    }), error => error.stderr.includes(`SPIKE_SECONDS must be between 3 and ${maximumSeconds}`))
  }
})

test('validator saves the shared protocol version after a real short race', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'multiplayer-validator-'))
  try {
    const report = join(directory, 'results.json')
    await run(process.execPath, [validator, report], {
      env: { ...process.env, SPIKE_SECONDS: '3' }, timeout: 15000,
    })
    const result = JSON.parse(await readFile(report, 'utf8'))
    assert.equal(result.protocolVersion, PROTOCOL_VERSION)
    assert.equal(result.durationSeconds, 3)
    assert.equal(result.batchesPerClient.length, 25)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
