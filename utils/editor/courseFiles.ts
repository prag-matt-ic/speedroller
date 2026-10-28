import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { compilePlatform } from '../../scripts/platformCompiler'
import { courseDocumentSchema, type CourseDocument } from './courseDocument'
import { replaceFiles } from './replaceFiles'

export const EDITOR_VERSION = '1.4.0'
const directory = path.resolve('assets/platform', EDITOR_VERSION)
const sourcePath = path.join(directory, 'race.course.json')
const revisionOf = (source: string) => createHash('sha256').update(source).digest('hex')
export const serializeCourse = (document: CourseDocument) => '{\n  "schemaVersion": 1,\n  "surface": ' + JSON.stringify(document.surface) + ',\n  "sections": [\n' + document.sections.map(section => '    {"id": ' + JSON.stringify(section.id) + ', "stage": ' + section.stage + ', "rows": [\n' + section.rows.map(row => '      ' + JSON.stringify(row)).join(',\n') + '\n    ]}').join(',\n') + '\n  ]\n}\n'
export class StaleCourseError extends Error {}
export async function readCourse() {
  const source = await fs.readFile(sourcePath, 'utf8')
  return { document: courseDocumentSchema.parse(JSON.parse(source)), revision: revisionOf(source), version: EDITOR_VERSION }
}
// Persist the queue through Next development-module reloads.
const globalQueue = globalThis as typeof globalThis & { courseSaveQueue?: Promise<unknown> }
export async function saveCourse(document: CourseDocument, expectedRevision: string) {
  const operation = (globalQueue.courseSaveQueue ?? Promise.resolve()).catch(() => {}).then(async () => {
    if ((await readCourse()).revision !== expectedRevision) throw new StaleCourseError('Course changed on disk. Reload before saving; your draft is retained.')
    const outputs = await compilePlatform(document, directory)
    // An external edit during compilation must not be overwritten either.
    if ((await readCourse()).revision !== expectedRevision) throw new StaleCourseError('Course changed during compilation. Reload before saving.')
    const source = serializeCourse(document)
    await replaceFiles([...outputs, { path: sourcePath, content: source }])
    return { revision: revisionOf(source), version: EDITOR_VERSION }
  })
  globalQueue.courseSaveQueue = operation
  return operation
}
