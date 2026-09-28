import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RunMap } from './components/RunMap'
import { Icon } from './components/Icon'
import { Callout, CodeBlock, Feedback, PaceCalc, TurnList } from './components/Docs'
import { EVENT } from './config'
import { HQ, LAPS, START_NAME } from './data/route'
import { fmtDist, fmtDuration, fmtShort, LAP_M, stepAt, steps, TOTAL_M, WALK_M, type Units } from './lib/geo'
import { buildGpx, downloadGpx } from './lib/gpx'

function useStored<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (nv: T) => {
      setV(nv)
      try {
        localStorage.setItem(key, nv)
      } catch {
        /* storage unavailable */
      }
    },
    [key],
  )
  return [v, set]
}

export default function App() {
  const [units, setUnits] = useStored<Units>('lr-units', 'km')
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const [hoverStep, setHoverStep] = useState<number | null>(null)
  const [flyKey, setFlyKey] = useState(0)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [paceSec, setPaceSec] = useState(330)
  const mapWrap = useRef<HTMLDivElement>(null)

  // playback loop
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (t: number) => {
      const dt = (t - last) / 1000
      last = t
      setProgress((p) => {
        const next = p + dt * speed * (1000 / paceSec)
        if (next >= TOTAL_M) {
          setPlaying(false)
          return TOTAL_M
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, paceSec])

  const showMap = useCallback(() => {
    const r = mapWrap.current?.getBoundingClientRect()
    if (r && (r.bottom < 120 || r.top > window.innerHeight - 120)) {
      mapWrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const selectStep = useCallback(
    (n: number | null) => {
      setActiveStep(n)
      if (n) {
        setFlyKey((k) => k + 1)
        showMap()
      }
    },
    [showMap],
  )

  const liveStep = progress > 0 ? stepAt(progress).step.n : null
  const highlight = hoverStep ?? activeStep

  const gpx = useMemo(() => {
    const full = buildGpx().split('\n')
    return [...full.slice(0, 13), '      <!-- …' + (full.length - 20) + ' more points… -->', ...full.slice(-6)].join('\n').trimEnd()
  }, [])

  return (
    <>
      <div className="bg-glow" aria-hidden />

      <header className="nav">
        <div className="nav-row">
          <a className="brand" href="#">
            <span className="brand-logo" aria-label="LanceDB" />
            <span className="brand-sep" />
            <span className="brand-run">Run</span>
          </a>
          <div className="nav-right">
            <div className="seg" role="group" aria-label="Units">
              {(['km', 'mi'] as const).map((u) => (
                <button key={u} className={units === u ? 'on' : ''} onClick={() => setUnits(u)}>
                  {u}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={downloadGpx}>
              <Icon name="download" size={15} />
              <span>GPX</span>
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <section id="overview" className="section hero">
          <div className="eyebrow">LanceDB Run · {EVENT.city}</div>
          <h1>The Route</h1>
          <p className="lead">
            {EVENT.tagline} Walk out of <b>{HQ.name}</b> to {START_NAME} and you're on the start line. It finishes in the same place.
          </p>
          <div className="chips">
            <span className="chip"><Icon name="clock" size={14} />{EVENT.date}</span>
            <span className="chip"><Icon name="pin" size={14} />{EVENT.meet}</span>
            <span className="chip"><Icon name="route" size={14} />{fmtDist(TOTAL_M, units)}</span>
            <span className="chip"><Icon name="repeat" size={14} />{LAPS} laps</span>
          </div>
        </section>

        <div className="map-panel" ref={mapWrap}>
          <RunMap
            theme="light"
            units={units}
            highlight={highlight}
            activeStep={activeStep}
            onSelectStep={selectStep}
            onHoverStep={setHoverStep}
            flyKey={flyKey}
            progress={progress}
            setProgress={setProgress}
            playing={playing}
            setPlaying={setPlaying}
            speed={speed}
            setSpeed={setSpeed}
            paceSec={paceSec}
          />
        </div>

        <div className="stats">
          <div className="stat">
            <div className="stat-value">{fmtDist(TOTAL_M, units)}</div>
            <div className="stat-label">Distance</div>
          </div>
          <div className="stat">
            <div className="stat-value">{steps.length}</div>
            <div className="stat-label">Turns per lap</div>
          </div>
          <div className="stat">
            <div className="stat-value">{LAPS}</div>
            <div className="stat-label">Laps</div>
          </div>
          <div className="stat">
            <div className="stat-value">{fmtDuration((TOTAL_M / 1000) * paceSec)}</div>
            <div className="stat-label">Finish at {fmtDuration(paceSec * (units === 'km' ? 1 : 1.609344))}/{units}</div>
          </div>
        </div>

        <div className="content">

          <section id="start" className="section">
            <h2>Getting to the start</h2>
            <p>
              Meet at the office, then walk out to the corner of {START_NAME}. It's about {fmtShort(WALK_M, units)} away (the dotted line on the map).
            </p>
            <ol className="steps compact">
              <li className="step"><div className="step-btn static"><span className="step-num"><Icon name="pin" size={13} /></span><span className="step-main"><span className="step-title">Meet at <b>{HQ.name}</b></span><span className="step-meta">{EVENT.meet}</span></span></div></li>
              <li className="step"><div className="step-btn static"><span className="step-num"><Icon name="flag" size={13} /></span><span className="step-main"><span className="step-title">Walk to <b>{START_NAME}</b>, the start line</span><span className="step-meta">~{fmtShort(WALK_M, units)} walk</span></span></div></li>
              <li className="step"><div className="step-btn static"><span className="step-num"><Icon name="zap" size={13} /></span><span className="step-main"><span className="step-title">Start your watch and head <b>west on Clay</b></span><span className="step-meta">Wait for a GPS lock before you go</span></span></div></li>
            </ol>
          </section>

          <section id="turns" className="section">
            <h2>Turn-by-turn</h2>
            <p>
              One lap, {fmtDist(LAP_M, units)}, run twice. Click a step to fly the map to it. Hovering a step highlights it on the map, and hovering the map highlights it here.
            </p>
            <TurnList units={units} activeStep={highlight} liveStep={liveStep} onSelect={selectStep} onHover={setHoverStep} />
          </section>

          <section id="pace" className="section">
            <h2>Pace calculator</h2>
            <p>Drag to set your pace. The flyover's elapsed clock uses it too.</p>
            <PaceCalc units={units} paceSec={paceSec} setPaceSec={setPaceSec} />
          </section>

          <section id="raceday" className="section">
            <h2>Race day notes</h2>
            <Callout kind="warning" title="There's a signal at every block">
              This is the Financial District, so expect a light at nearly every corner. Early morning or a weekend makes it much easier to keep a rhythm, and gives cleaner GPS between the towers.
            </Callout>
          </section>

          <section id="gpx" className="section">
            <h2>Download the GPX</h2>
            <p>
              The file has both laps, {fmtDist(TOTAL_M, units)} in total, and follows the shape exactly. Load it onto your watch or into Strava as a route.
            </p>
            <CodeBlock filename="lancedb-run.gpx" code={gpx} onDownload={downloadGpx} />
          </section>

          <Feedback />
          <footer className="footer">
            <span className="brand-logo small" aria-label="LanceDB" />
            <span>© {new Date().getFullYear()} LanceDB · Run club</span>
            <span className="footer-dim">Map © CARTO © OpenStreetMap contributors</span>
          </footer>
        </div>
      </main>
    </>
  )
}
