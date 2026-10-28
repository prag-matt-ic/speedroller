import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { z } from 'zod'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_AUDIENCE_ID =
  process.env.RESEND_CONTACT_SEGMENT_ID ?? 'abc861b4-3b2f-4809-871b-61c8dcfdb8bc'

const contactPayloadSchema = z.object({
  email: z.email(),
  firstName: z.string().trim().min(1),
})

const resendClient = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export async function POST(request: Request) {
  if (!resendClient) {
    return NextResponse.json({ error: 'Resend API key is not configured.' }, { status: 500 })
  }

  if (!RESEND_AUDIENCE_ID) {
    return NextResponse.json(
      { error: 'Resend audience ID is not configured.' },
      { status: 500 },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const parsedBody = contactPayloadSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid contact payload.', details: parsedBody.error.flatten().fieldErrors },
      { status: 400 },
    )
  }

  const { email, firstName } = parsedBody.data

  const { data, error } = await resendClient.contacts.create({
    email,
    firstName,
    lastName: '',
    audienceId: RESEND_AUDIENCE_ID,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode ?? 500 })
  }

  return NextResponse.json({ id: data?.id }, { status: 201 })
}
