import { handleFeedback } from './_slack'

// Vercel Function: POST /api/feedback { vote: 'up' | 'down', page?: string }
export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }
  const { status, json } = await handleFeedback(body, process.env)
  return Response.json(json, { status })
}
