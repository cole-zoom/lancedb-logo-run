// Shared by the Vercel function (api/feedback.ts) and the Vite dev server (vite.config.ts).

export interface FeedbackEnv {
  QUIVER_BOT_TOKEN?: string
  COLE_CHANNEL_ID?: string
}

export async function handleFeedback(body: unknown, env: FeedbackEnv): Promise<{ status: number; json: object }> {
  const { vote, page } = (body ?? {}) as { vote?: unknown; page?: unknown }
  if (vote !== 'up' && vote !== 'down') return { status: 400, json: { ok: false, error: 'invalid vote' } }
  if (!env.QUIVER_BOT_TOKEN || !env.COLE_CHANNEL_ID) return { status: 500, json: { ok: false, error: 'slack not configured' } }

  const where = typeof page === 'string' ? page.slice(0, 200) : 'unknown page'
  const text = vote === 'up' ? `:thumbsup: Someone found the LanceDB Run page helpful (${where})` : `:thumbsdown: Someone didn't find the LanceDB Run page helpful (${where})`

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.QUIVER_BOT_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: env.COLE_CHANNEL_ID, text, unfurl_links: false }),
  })
  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) return { status: 502, json: { ok: false, error: data.error ?? 'slack error' } }
  return { status: 200, json: { ok: true } }
}
