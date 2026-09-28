# LanceDB Run

Event site for the LanceDB FiDi Loop: two laps around the Financial District, starting and finishing at 2 Embarcadero Center.

- Interactive MapLibre map with turn markers, direction arrows, the doubled connector, a playable runner, 3D buildings and follow-cam
- Turn-by-turn steps linked to the map (hover or click either side)
- Pace calculator and km/mi toggle
- GPX download generated from the same coordinates the map uses

Theme tokens come from docs.lancedb.com. The typeface is Aeonik Fono from lancedb.com.

## Develop

```bash
npm install
npm run dev
```

## Edit the event

- Date, meeting point and copy: `src/config.ts`
- Route and turn list: `src/data/route.ts` (intersection coordinates are from OpenStreetMap)

## Deploy to Vercel

Push the repo and import it in Vercel, or run `npx vercel`. `vercel.json` already sets the Vite build (`npm run build` → `dist`).

Basemap tiles come from CARTO (free, no API key; attribution is shown on the map).

## Feedback → Slack

The "Was this page helpful?" buttons POST to `/api/feedback` (a Vercel Function in `api/feedback.ts`), which posts the vote to Slack with the Quiver bot. In dev, Vite serves the same route.

Set these in `.env` locally and in Vercel → Project → Settings → Environment Variables:

- `QUIVER_BOT_TOKEN`: the bot token (`xoxb-…`, needs `chat:write`)
- `COLE_CHANNEL_ID`: the channel or DM to post to

The tokens stay on the server and never reach the browser.
