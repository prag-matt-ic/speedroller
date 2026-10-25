import { NextResponse } from 'next/server'
import { z } from 'zod'
import { courseDocumentSchema } from '@/utils/editor/courseDocument'
import { readCourse, saveCourse, StaleCourseError } from '@/utils/editor/courseFiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const saveSchema = z.object({ document: courseDocumentSchema, revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const MAX_BODY_BYTES = 2_000_000

export async function GET() {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  try { return NextResponse.json(await readCourse(), { headers: { 'Cache-Control': 'no-store' } }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read course' }, { status: 500 }) }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Same-origin requests only' }, { status: 403 })
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) return new NextResponse(null, { status: 415 })
  try {
    const reader = request.body?.getReader()
    if (!reader) return new NextResponse(null, { status: 400 })
    const chunks: Uint8Array[] = []
    let length = 0
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      length += chunk.value.byteLength
      if (length > MAX_BODY_BYTES) { await reader.cancel(); return new NextResponse(null, { status: 413 }) }
      chunks.push(chunk.value)
    }
    const parsed = saveSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid document' }, { status: 400 })
    return NextResponse.json(await saveCourse(parsed.data.document, parsed.data.revision))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not save course' }, { status: error instanceof StaleCourseError ? 409 : 400 })
  }
}
