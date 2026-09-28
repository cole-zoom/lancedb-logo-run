import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { DOUBLED, GRID, HQ, INTERSECTIONS, LANDMARKS, LAPS, ROUTE_NAME, START, STREETS_EW, STREETS_NS, WALK, type Corner, type LngLat } from '../data/route'
import { along, bearing, fmtDist, fmtDuration, lapCoords, LAP_M, stepAt, steps, TOTAL_M, type Units } from '../lib/geo'
import { Icon } from './Icon'

export type Theme = 'light' | 'dark'

const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
const PRIMARY = '#FF6B35'
const PRIMARY_LIGHT = '#FF8A5C'

const PALETTE = {
  dark: {
    bg: '#070605', land: '#0b0908', park: '#0d110c', water: '#0a1216', building: '#141110', buildingTop: '#1a1614',
    road: '#1d1917', roadMajor: '#2a2523', roadCase: '#0f0c0b', rail: '#221d1b', extrude: '#1c1816',
    core: '#FAF5F0', dash: 'rgba(255,255,255,0.85)', walk: '#a6a1a0', doubled: '#FAF5F0',
  },
  light: {
    bg: '#f3ece4', land: '#efe7de', park: '#e3e6d6', water: '#cfdde2', building: '#e6ddd3', buildingTop: '#ece4db',
    road: '#fdfbf8', roadMajor: '#ffffff', roadCase: '#e0d8d0', rail: '#d5cdc6', extrude: '#e2d8cd',
    core: '#ffffff', dash: 'rgba(255,255,255,0.95)', walk: '#776f6b', doubled: '#1e1a18',
  },
} as const

const OURS = 'lr-'

// Rotate the camera so the downtown grid sits square on screen and the drawing reads upright.
const corner = (c: string) => INTERSECTIONS[c as Corner] as LngLat
const GRID_BEARING = bearing(corner(GRID.ewAxis[0]), corner(GRID.ewAxis[1])) - 90
type Pad = { top: number; bottom: number; left: number; right: number }

/**
 * Camera that fits `pts` on a map rotated to `bear`. MapLibre's fitBounds fits the
 * unrotated lng/lat box, which wastes a lot of space on a grid 45° off north.
 */
function camFor(pts: LngLat[], w: number, h: number, pad: Pad, bear: number, maxZoom = 18) {
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180)
  const ky = 110540
  const b = (bear * Math.PI) / 180
  const o = pts[0]
  // screen right = compass bear+90, screen up = compass bear
  const uv = pts.map(([lng, lat]) => {
    const dx = (lng - o[0]) * kx
    const dy = (lat - o[1]) * ky
    return [dx * Math.cos(b) - dy * Math.sin(b), dx * Math.sin(b) + dy * Math.cos(b)]
  })
  const us = uv.map((p) => p[0])
  const vs = uv.map((p) => p[1])
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  const cu = (u0 + u1) / 2
  const cv = (v0 + v1) / 2
  const dx = cu * Math.cos(b) + cv * Math.sin(b)
  const dy = -cu * Math.sin(b) + cv * Math.cos(b)
  const center: LngLat = [o[0] + dx / kx, o[1] + dy / ky]
  const mpp = Math.max((u1 - u0) / Math.max(40, w - pad.left - pad.right), (v1 - v0) / Math.max(40, h - pad.top - pad.bottom))
  const zoom = Math.min(maxZoom, Math.log2((40075016.686 * Math.cos((lat0 * Math.PI) / 180)) / (512 * Math.max(mpp, 0.01))))
  return { center, zoom, bearing: bear, padding: pad }
}

const fitPad = (w: number): Pad =>
  w < 520 ? { top: 96, bottom: 150, left: 96, right: 40 } : { top: 100, bottom: 180, left: 120, right: 120 }

export interface RunMapProps {
  theme: Theme
  units: Units
  highlight: number | null
  activeStep: number | null
  onSelectStep: (n: number | null) => void
  onHoverStep: (n: number | null) => void
  flyKey: number
  progress: number
  setProgress: (m: number) => void
  playing: boolean
  setPlaying: (p: boolean) => void
  speed: number
  setSpeed: (s: number) => void
  paceSec: number
}

function paintBasemap(map: MLMap, theme: Theme) {
  const P = PALETTE[theme]
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id
    if (id.startsWith(OURS)) continue
    const set = (prop: string, v: unknown) => {
      try {
        ;(map.setPaintProperty as (l: string, p: string, v: unknown) => void).call(map, id, prop, v)
      } catch {
        /* layer doesn't support prop */
      }
    }
    if (layer.type === 'background') set('background-color', P.bg)
    else if (id.startsWith('boundary')) map.setLayoutProperty(id, 'visibility', 'none')
    else if (id.startsWith('water')) set(layer.type === 'line' ? 'line-color' : 'fill-color', P.water)
    else if (id.startsWith('park')) set('fill-color', P.park)
    else if (id.startsWith('landcover') || id.startsWith('landuse')) set('fill-color', P.land)
    else if (id === 'building') set('fill-color', P.building), set('fill-outline-color', P.roadCase)
    else if (id === 'building-top') set('fill-color', P.buildingTop), set('fill-outline-color', P.building)
    else if (layer.type === 'line') {
      if (/rail/.test(id)) set('line-color', P.rail)
      else if (/case/.test(id)) set('line-color', P.roadCase)
      else if (/(pri|sec|trunk|mot)/.test(id)) set('line-color', P.roadMajor)
      else set('line-color', P.road)
    }
  }
  if (map.getLayer(`${OURS}bldg-3d`)) map.setPaintProperty(`${OURS}bldg-3d`, 'fill-extrusion-color', P.extrude)
  map.setPaintProperty(`${OURS}active-core`, 'line-color', P.core)
  map.setPaintProperty(`${OURS}flow`, 'line-color', P.dash)
  map.setPaintProperty(`${OURS}walk`, 'line-color', P.walk)
  map.setPaintProperty(`${OURS}doubled`, 'line-color', P.doubled)
}

function arrowImage(): ImageData {
  const s = 48
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(18, 12)
  ctx.lineTo(30, 24)
  ctx.lineTo(18, 36)
  ctx.stroke()
  return ctx.getImageData(0, 0, s, s)
}

const line = (coords: LngLat[], props: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  properties: props,
  geometry: { type: 'LineString' as const, coordinates: coords },
})

/** Point `metres` beyond `a`, continuing the line from `b` through `a`. */
function extend(a: LngLat, b: LngLat, metres: number): LngLat {
  const kx = 111320 * Math.cos((a[1] * Math.PI) / 180)
  const ky = 110540
  const dx = (a[0] - b[0]) * kx
  const dy = (a[1] - b[1]) * ky
  const len = Math.hypot(dx, dy) || 1
  return [a[0] + ((dx / len) * metres) / kx, a[1] + ((dy / len) * metres) / ky]
}

function el(className: string, html: string) {
  const d = document.createElement('div')
  d.className = className
  d.innerHTML = html
  return d
}

export function RunMap(props: RunMapProps) {
  const {
    theme, units, highlight, activeStep, onSelectStep, onHoverStep, flyKey,
    progress, setProgress, playing, setPlaying, speed, setSpeed, paceSec,
  } = props
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const runnerRef = useRef<maplibregl.Marker | null>(null)
  const turnEls = useRef(new Map<number, HTMLElement>())
  const cb = useRef({ onSelectStep, onHoverStep })
  cb.current = { onSelectStep, onHoverStep }
  const [ready, setReady] = useState(false)
  const [threeD, setThreeD] = useState(false)
  const [follow, setFollow] = useState(false)
  const [layers, setLayers] = useState({ turns: true, arrows: true, streets: true })
  const [menu, setMenu] = useState(false)

  // ---------- init ----------
  useEffect(() => {
    let cancelled = false
    let raf = 0
    let map: MLMap | null = null
    ;(async () => {
      const style: StyleSpecification = await fetch(STYLE_URL).then((r) => r.json())
      if (cancelled || !container.current) return
      const m = new maplibregl.Map({
        container: container.current,
        style,
        ...camFor([...lapCoords, ...WALK], container.current.clientWidth, container.current.clientHeight, fitPad(container.current.clientWidth), GRID_BEARING),
        attributionControl: { compact: true },
        cooperativeGestures: true,
        maxZoom: 19,
        minZoom: 12,
      })
      map = m
      m.jumpTo(camFor([...lapCoords, ...WALK], container.current.clientWidth, container.current.clientHeight, fitPad(container.current.clientWidth), GRID_BEARING))
      mapRef.current = m
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
      m.addControl(new maplibregl.FullscreenControl({ container: container.current.parentElement! }), 'top-right')

      m.on('load', () => {
        if (!map) return
        map.addImage('lr-arrow', arrowImage(), { pixelRatio: 2 })

        const stepFC = {
          type: 'FeatureCollection' as const,
          features: steps.map((s) => ({ ...line(s.coords, { n: s.n }), id: s.n })),
        }
        map.addSource('lr-lap', { type: 'geojson', lineMetrics: true, data: line(lapCoords) })
        map.addSource('lr-steps', { type: 'geojson', data: stepFC })
        map.addSource('lr-doubled', { type: 'geojson', data: line(DOUBLED) })
        map.addSource('lr-walk', { type: 'geojson', data: line(WALK) })
        map.addSource('lr-trail', { type: 'geojson', lineMetrics: true, data: line([lapCoords[0], lapCoords[0]]) })

        map.addLayer({
          id: 'lr-bldg-3d', type: 'fill-extrusion', source: 'carto', 'source-layer': 'building', minzoom: 14,
          layout: { visibility: 'none' },
          paint: {
            'fill-extrusion-color': PALETTE[theme].extrude,
            'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 12],
            'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
            'fill-extrusion-opacity': 0.88,
          },
        })
        map.addLayer({
          id: 'lr-walk', type: 'line', source: 'lr-walk',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': PALETTE[theme].walk, 'line-width': 2.5, 'line-dasharray': [0.5, 2] },
        })
        map.addLayer({
          id: 'lr-glow', type: 'line', source: 'lr-lap',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PRIMARY, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 10, 18, 28], 'line-blur': 14, 'line-opacity': 0.45 },
        })
        map.addLayer({
          id: 'lr-base', type: 'line', source: 'lr-lap',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 9],
            'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, '#FF4F1A', 0.5, PRIMARY, 1, '#FFB08A'],
          },
        })
        map.addLayer({
          id: 'lr-doubled', type: 'line', source: 'lr-doubled',
          layout: { 'line-cap': 'butt' },
          paint: { 'line-color': PALETTE[theme].doubled, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 9], 'line-dasharray': [1, 1], 'line-opacity': 0.9 },
        })
        map.addLayer({
          id: 'lr-flow', type: 'line', source: 'lr-lap',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PALETTE[theme].dash, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1, 18, 3], 'line-dasharray': [0, 4, 3], 'line-opacity': 0.75 },
        })
        map.addLayer({
          id: 'lr-trail-glow', type: 'line', source: 'lr-trail',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PRIMARY_LIGHT, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 12, 18, 30], 'line-blur': 10, 'line-opacity': 0.7 },
        })
        map.addLayer({
          id: 'lr-trail', type: 'line', source: 'lr-trail',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#FFD9C7', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 8] },
        })
        map.addLayer({
          id: 'lr-active-glow', type: 'line', source: 'lr-steps', filter: ['==', ['get', 'n'], -1],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PRIMARY, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 16, 18, 40], 'line-blur': 8, 'line-opacity': 0.9 },
        })
        map.addLayer({
          id: 'lr-active-core', type: 'line', source: 'lr-steps', filter: ['==', ['get', 'n'], -1],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PALETTE[theme].core, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 8] },
        })
        map.addLayer({
          id: 'lr-arrows', type: 'symbol', source: 'lr-steps',
          layout: {
            'symbol-placement': 'line', 'symbol-spacing': 70, 'icon-image': 'lr-arrow',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 18, 1], 'icon-allow-overlap': true,
            'icon-rotation-alignment': 'map', 'icon-offset': [0, 7],
          },
          paint: { 'icon-opacity': 0.95 },
        })
        map.addLayer({
          id: 'lr-hit', type: 'line', source: 'lr-steps',
          paint: { 'line-color': '#000', 'line-width': 22, 'line-opacity': 0 },
        })

        // hover + click on route segments
        const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12, className: 'lr-tip' })
        map.on('mousemove', 'lr-hit', (e) => {
          const n = e.features?.[0]?.properties?.n as number | undefined
          if (!n || !map) return
          map.getCanvas().style.cursor = 'pointer'
          const s = steps[n - 1]
          tip.setLngLat(e.lngLat)
            .setHTML(`<span class="tip-n">${n}</span><span>${s.dir} on <b>${s.street}</b> → ${s.to}</span>`)
            .addTo(map)
          cb.current.onHoverStep(n)
        })
        map.on('mouseleave', 'lr-hit', () => {
          if (!map) return
          map.getCanvas().style.cursor = ''
          tip.remove()
          cb.current.onHoverStep(null)
        })
        map.on('click', 'lr-hit', (e) => {
          const n = e.features?.[0]?.properties?.n as number | undefined
          if (n) cb.current.onSelectStep(n)
        })

        addMarkers(map)
        paintBasemap(map, theme)

        // marching-ants dash animation
        const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]]
        let last = -1
        const tick = (t: number) => {
          const i = Math.floor(t / 60) % seq.length
          if (i !== last && map?.getLayer('lr-flow')) {
            map.setPaintProperty('lr-flow', 'line-dasharray', seq[i])
            last = i
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        setReady(true)
      })
    })()

    function addMarkers(map: MLMap) {
      // HQ
      const hq = el('mk-hq', `<span class="mk-hq-logo"></span><span class="mk-hq-text"><b>2 Embarcadero Center</b><small>Meet here, then walk to the start</small></span>`)
      new maplibregl.Marker({ element: hq, anchor: 'center' }).setLngLat(HQ.coord).addTo(map)

      // start / finish
      const sf = el('mk-start', `<span class="mk-pulse"></span><span class="mk-start-flag">START · FINISH</span>`)
      new maplibregl.Marker({ element: sf, anchor: 'center' }).setLngLat(INTERSECTIONS[START] as LngLat).addTo(map)

      // turn chips grouped by corner (a corner can host two turns)
      const groups = new Map<string, number[]>()
      for (const s of steps.slice(1)) groups.set(s.from, [...(groups.get(s.from) ?? []), s.n])
      for (const [corner, ns] of groups) {
        const chip = el('mk-turn', ns.map((n) => `<button data-n="${n}">${n}</button>`).join(''))
        chip.querySelectorAll('button').forEach((b) => {
          const n = Number(b.dataset.n)
          turnEls.current.set(n, b)
          b.addEventListener('click', (ev) => {
            ev.stopPropagation()
            cb.current.onSelectStep(n)
          })
          b.addEventListener('mouseenter', () => cb.current.onHoverStep(n))
          b.addEventListener('mouseleave', () => cb.current.onHoverStep(null))
        })
        new maplibregl.Marker({ element: chip }).setLngLat(INTERSECTIONS[corner as keyof typeof INTERSECTIONS] as LngLat).addTo(map)
      }

      // doubled connector badge
      const mid: LngLat = [(DOUBLED[0][0] + DOUBLED[1][0]) / 2, (DOUBLED[0][1] + DOUBLED[1][1]) / 2]
      new maplibregl.Marker({ element: el('mk-badge', '×2 · doubled'), anchor: 'bottom', offset: [0, -12] }).setLngLat(mid).addTo(map)

      // street labels along the edges of the grid, rotated with the streets
      const ew = (st: string) => {
        const a = corner(`${st}|${GRID.westEnd}`)
        const b = corner(`${st}|${GRID.eastEnd}`)
        const rot = bearing(a, b) - 90
        const lbl = el('mk-street', `${st}<span class="mk-street-sfx"> St</span>`)
        new maplibregl.Marker({ element: lbl, rotationAlignment: 'map', rotation: rot, anchor: 'right' })
          .setLngLat(extend(a, b, 40)).addTo(map)
      }
      const ns = (st: string) => {
        const a = corner(`${GRID.southEnd}|${st}`)
        const b = corner(`${GRID.northEnd}|${st}`)
        const rot = bearing(a, b) - 90
        const lbl = el('mk-street', `${st}<span class="mk-street-sfx"> St</span>`)
        new maplibregl.Marker({ element: lbl, rotationAlignment: 'map', rotation: rot, anchor: 'right' })
          .setLngLat(extend(a, b, 44)).addTo(map)
      }
      STREETS_EW.forEach(ew)
      STREETS_NS.forEach(ns)

      for (const l of LANDMARKS) {
        new maplibregl.Marker({ element: el(`mk-poi mk-${l.kind}`, `<i></i>${l.name}`), anchor: 'left', offset: [-3, 0] }).setLngLat(l.coord).addTo(map)
      }

      // runner
      const runner = el('mk-runner', `<span class="mk-runner-ring"></span><span class="mk-runner-dot"><svg viewBox="0 0 24 24"><path d="M12 3l6 16-6-4-6 4z"/></svg></span>`)
      runnerRef.current = new maplibregl.Marker({ element: runner, rotationAlignment: 'map' })
        .setLngLat(INTERSECTIONS[START] as LngLat)
        .addTo(map)
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      map?.remove()
      mapRef.current = null
      turnEls.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- theme ----------
  useEffect(() => {
    if (ready && mapRef.current) paintBasemap(mapRef.current, theme)
  }, [theme, ready])

  // ---------- highlight ----------
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const f = ['==', ['get', 'n'], highlight ?? -1] as maplibregl.FilterSpecification
    map.setFilter('lr-active-glow', f)
    map.setFilter('lr-active-core', f)
    map.setPaintProperty('lr-base', 'line-opacity', highlight ? 0.55 : 1)
    map.setPaintProperty('lr-glow', 'line-opacity', highlight ? 0.2 : 0.45)
    turnEls.current.forEach((b, n) => b.classList.toggle('on', n === highlight))
  }, [highlight, ready])

  // ---------- fly to selected step ----------
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !activeStep) return
    const s = steps[activeStep - 1]
    const c = map.getContainer()
    const p = c.clientWidth < 520 ? 70 : 140
    map.easeTo({
      ...camFor(s.coords, c.clientWidth, c.clientHeight, { top: p, bottom: p + 60, left: p, right: p }, map.getBearing(), 17.2),
      pitch: threeD ? 55 : 0,
      duration: 900,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyKey, ready])

  // ---------- runner / trail ----------
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const { point, heading, trail } = along(progress)
    runnerRef.current?.setLngLat(point).setRotation(heading)
    runnerRef.current?.getElement().classList.toggle('show', progress > 0)
    ;(map.getSource('lr-trail') as GeoJSONSource).setData(line(trail.length > 1 ? trail : [point, point]))
    const lit = progress > 0
    map.setPaintProperty('lr-flow', 'line-opacity', lit ? 0.25 : 0.75)
    if (follow && playing) map.easeTo({ center: point, bearing: heading, pitch: 60, zoom: 17, duration: 300, easing: (t) => t })
  }, [progress, ready, follow, playing])

  // ---------- 3D ----------
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('lr-bldg-3d', 'visibility', threeD ? 'visible' : 'none')
    ;['building', 'building-top'].forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', threeD ? 'none' : 'visible'))
    map.easeTo({ pitch: threeD ? 58 : 0, bearing: GRID_BEARING + (threeD ? -24 : 0), duration: 1000 })
  }, [threeD, ready])

  // ---------- layer toggles ----------
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('lr-arrows', 'visibility', layers.arrows ? 'visible' : 'none')
    container.current?.classList.toggle('hide-turns', !layers.turns)
    container.current?.classList.toggle('hide-streets', !layers.streets)
  }, [layers, ready])

  const fit = () => {
    const map = mapRef.current
    if (!map) return
    setFollow(false)
    const c = map.getContainer()
    map.easeTo({
      ...camFor([...lapCoords, ...WALK], c.clientWidth, c.clientHeight, fitPad(c.clientWidth), GRID_BEARING + (threeD ? -24 : 0)),
      pitch: threeD ? 50 : 0,
      duration: 900,
    })
    onSelectStep(null)
  }

  const cur = useMemo(() => stepAt(progress), [progress])
  const pct = (progress / TOTAL_M) * 100
  const elapsed = (progress / 1000) * paceSec

  return (
    <div className={`runmap ${theme}`}>
      <div ref={container} className="runmap-canvas" />
      {!ready && (
        <div className="runmap-loading">
          <span className="spinner" /> Loading map…
        </div>
      )}

      {/* HUD */}
      <div className="hud hud-tl">
        <div className="hud-eyebrow">
          <span className="live-dot" /> {progress > 0 ? (LAPS > 1 ? `Lap ${cur.lap} of ${LAPS}` : 'On course') : 'Route preview'}
        </div>
        {progress > 0 ? (
          <>
            <div className="hud-title">
              <span className="hud-n">{cur.step.n}</span> {cur.step.dir} on {cur.step.street} → {cur.step.to}
            </div>
            <div className="hud-meta">
              <span>{fmtDist(progress, units)}</span>
              <span>·</span>
              <span>{fmtDuration(elapsed)} elapsed</span>
            </div>
          </>
        ) : (
          <>
            <div className="hud-title">{ROUTE_NAME}</div>
            <div className="hud-meta">
              <span>{LAPS > 1 ? `${fmtDist(LAP_M, units)} / lap` : `${fmtDist(LAP_M, units)} loop`}</span>
              <span>·</span>
              <span>{steps.length} turns</span>
            </div>
          </>
        )}
      </div>

      <div className="hud hud-tools">
        <button className={`tool ${threeD ? 'on' : ''}`} onClick={() => setThreeD((v) => !v)} title="Toggle 3D buildings">
          <Icon name="cube" /> 3D
        </button>
        <button className={`tool ${follow ? 'on' : ''}`} onClick={() => setFollow((v) => !v)} title="Camera follows the runner">
          <Icon name="video" /> Follow
        </button>
        <button className="tool" onClick={fit} title="Fit route">
          <Icon name="expand" /> Fit
        </button>
        <div className="tool-wrap">
          <button className={`tool ${menu ? 'on' : ''}`} onClick={() => setMenu((v) => !v)} title="Layers">
            <Icon name="layers" /> Layers
          </button>
          {menu && (
            <div className="tool-menu">
              {(['turns', 'arrows', 'streets'] as const).map((k) => (
                <label key={k}>
                  <input type="checkbox" checked={layers[k]} onChange={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} />
                  <span className="switch" />
                  {k === 'turns' ? 'Turn numbers' : k === 'arrows' ? 'Direction arrows' : 'Street names'}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Player */}
      <div className="hud player">
        <button
          className="play"
          onClick={() => {
            if (progress >= TOTAL_M) setProgress(0)
            setPlaying(!playing)
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <div className="scrub">
          <div className="scrub-track">
            <div className="scrub-fill" style={{ width: `${pct}%` }} />
            {Array.from({ length: LAPS - 1 }, (_, i) => (
              <div key={i} className="scrub-lap" style={{ left: `${((i + 1) / LAPS) * 100}%` }} />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={TOTAL_M}
            step={1}
            value={progress}
            onChange={(e) => {
              setPlaying(false)
              setProgress(Number(e.target.value))
            }}
            aria-label="Scrub along route"
          />
        </div>
        <div className="speed">
          {[30, 60, 120].map((s) => (
            <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
              {s}×
            </button>
          ))}
        </div>
        <button className="reset" onClick={() => (setPlaying(false), setProgress(0))} aria-label="Reset">
          <Icon name="reset" />
        </button>
      </div>
    </div>
  )
}
