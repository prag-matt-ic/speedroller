// Upload only the service and shared protocol, never frontend files or local environment files.
import { mkdtemp, mkdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const destination = await mkdtemp(join(tmpdir(), 'speedroller-multiplayer-'))
const files = [
  'server/multiplayer/Dockerfile', 'server/multiplayer/package.json', 'server/multiplayer/package-lock.json',
  'server/multiplayer/tsconfig.json', 'server/multiplayer/main.mts', 'server/multiplayer/relay.mts',
  'server/multiplayer/queue.mts', 'server/multiplayer/clientIp.mts', 'server/multiplayer/logging.mts',
  'shared/multiplayer/protocol.mts', 'shared/multiplayer/clock.mts',
]
for (const directory of ['server/multiplayer', 'shared/multiplayer']) await mkdir(join(destination, directory), { recursive: true })
for (const file of files) await copyFile(join(root, file), join(destination, file))
console.log(destination)
