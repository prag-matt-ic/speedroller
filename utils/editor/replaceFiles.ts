import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

type Output = { path: string; content: string | Buffer }

/** Stage beside each destination so rename stays on the same filesystem. */
export async function replaceFiles(outputs: readonly Output[]) {
  const transaction = randomUUID()
  const staged: { path: string; temporary: string; previous: Buffer | null }[] = []
  const installed: typeof staged = []
  try {
    for (const output of outputs) {
      await fs.mkdir(path.dirname(output.path), { recursive: true })
      const previous = await fs.readFile(output.path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      const temporary = `${output.path}.${transaction}.tmp`
      staged.push({ path: output.path, temporary, previous })
      await fs.writeFile(temporary, output.content, { flag: 'wx' })
    }
    for (const file of staged) {
      await fs.rename(file.temporary, file.path)
      installed.push(file)
    }
  } catch (error) {
    const failures: unknown[] = []
    for (const file of installed.reverse()) {
      try {
        if (file.previous === null) await fs.unlink(file.path)
        else {
          await fs.writeFile(file.temporary, file.previous)
          await fs.rename(file.temporary, file.path)
        }
      } catch (rollbackError) { failures.push(rollbackError) }
    }
    if (failures.length) throw new Error(`Save failed and rollback was incomplete; inspect the working tree: ${[error, ...failures].join('; ')}`)
    throw error
  } finally {
    await Promise.all(staged.map(file => fs.rm(file.temporary, { force: true })))
  }
}
