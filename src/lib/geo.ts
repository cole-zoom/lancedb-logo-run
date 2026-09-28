import { INTERSECTIONS, LAPS, START, STEPS, WALK, type Corner, type LngLat, type StepDef } from '../data/route'

const R = 6371008.8

export function haversine(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLng = (b[0] - a[0]) * toRad
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function bearing(a: LngLat, b: LngLat): number {
  const toRad = Math.PI / 180
  const y = Math.sin((b[0] - a[0]) * toRad) * Math.cos(b[1] * toRad)
  const x =
    Math.cos(a[1] * toRad) * Math.sin(b[1] * toRad) -
    Math.sin(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.cos((b[0] - a[0]) * toRad)
  return (Math.atan2(y, x) * 180) / Math.PI
}

export interface Step extends StepDef {
  n: number
  from: Corner
  coords: LngLat[]
  length: number // metres
  startAt: number // metres into the lap
}

export const steps: Step[] = (() => {
  let from: Corner = START
  let acc = 0
  return STEPS.map((s, i) => {
    const coords = [from, ...s.via].map((c) => INTERSECTIONS[c] as LngLat)
    let length = 0
    for (let k = 1; k < coords.length; k++) length += haversine(coords[k - 1], coords[k])
    const step: Step = { ...s, n: i + 1, from, coords, length, startAt: acc }
    acc += length
    from = s.via[s.via.length - 1]
    return step
  })
})()

export const lapCoords: LngLat[] = [
  INTERSECTIONS[START] as LngLat,
  ...STEPS.flatMap((s) => s.via.map((c) => INTERSECTIONS[c] as LngLat)),
]

export const LAP_M = steps.reduce((a, s) => a + s.length, 0)
export const TOTAL_M = LAP_M * LAPS
export const WALK_M = WALK.slice(1).reduce((a, c, i) => a + haversine(WALK[i], c), 0)

/** Coordinates for the full run (all laps chained). */
export const runCoords: LngLat[] = Array.from({ length: LAPS }, (_, i) => (i === 0 ? lapCoords : lapCoords.slice(1))).flat()

const runCum: number[] = (() => {
  const out = [0]
  for (let i = 1; i < runCoords.length; i++) out.push(out[i - 1] + haversine(runCoords[i - 1], runCoords[i]))
  return out
})()

/** Point + heading at a given distance along the whole run, plus the trail travelled so far. */
export function along(dist: number): { point: LngLat; heading: number; trail: LngLat[] } {
  const d = Math.max(0, Math.min(dist, runCum[runCum.length - 1]))
  let i = 1
  while (i < runCum.length - 1 && runCum[i] < d) i++
  const a = runCoords[i - 1]
  const b = runCoords[i]
  const seg = runCum[i] - runCum[i - 1] || 1
  const t = (d - runCum[i - 1]) / seg
  const point: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  return { point, heading: bearing(a, b), trail: [...runCoords.slice(0, i), point] }
}

/** Which step (and lap) a distance along the run falls in. */
export function stepAt(dist: number): { step: Step; lap: number } {
  const lap = Math.min(LAPS, Math.floor(dist / LAP_M) + 1)
  const inLap = dist - (lap - 1) * LAP_M
  const step = steps.find((s) => inLap < s.startAt + s.length) ?? steps[steps.length - 1]
  return { step, lap }
}

export type Units = 'km' | 'mi'
export const fmtDist = (m: number, u: Units, digits = 2) =>
  u === 'km' ? `${(m / 1000).toFixed(digits)} km` : `${(m / 1609.344).toFixed(digits)} mi`
export const fmtShort = (m: number, u: Units) => (u === 'km' ? `${Math.round(m)} m` : `${Math.round(m * 1.09361)} yd`)

export function fmtDuration(total: number): string {
  const sec = Math.round(total)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (x: number) => String(x).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

const bbox = (pts: LngLat[]) => {
  const lngs = pts.map((c) => c[0])
  const lats = pts.map((c) => c[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ] as [LngLat, LngLat]
}

/** The loop itself. */
export const bounds = bbox(lapCoords)
/** The loop plus the walk from HQ, used for the opening view. */
export const fitAllBounds = bbox([...lapCoords, ...WALK])
