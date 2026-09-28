import { useState, type ReactNode } from 'react'
import { Icon } from './Icon'
import { LAPS } from '../data/route'
import { fmtDist, fmtDuration, fmtShort, LAP_M, steps, TOTAL_M, type Step, type Units } from '../lib/geo'

/* ---------- Callout (Mintlify <Note>/<Warning>/<Tip>/<Info>) ---------- */
const CALLOUT = {
  note: { icon: 'info', label: 'Note' },
  warning: { icon: 'alert', label: 'Heads up' },
  tip: { icon: 'bulb', label: 'Tip' },
  info: { icon: 'sparkle', label: 'Good to know' },
} as const

export function Callout({ kind, title, children }: { kind: keyof typeof CALLOUT; title?: string; children: ReactNode }) {
  const c = CALLOUT[kind]
  return (
    <div className={`callout callout-${kind}`}>
      <Icon name={c.icon} size={18} className="callout-icon" />
      <div>
        <div className="callout-title">{title ?? c.label}</div>
        <div className="callout-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- Card ---------- */
export function Card({ icon, title, value, sub, onClick }: { icon: string; title: string; value: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`card ${onClick ? 'card-link' : ''}`} onClick={onClick}>
      <div className="card-icon">
        <Icon name={icon} size={18} />
      </div>
      <div className="card-title">{title}</div>
      <div className="card-value">{value}</div>
      {sub && <div className="card-sub">{sub}</div>}
    </Tag>
  )
}

/* ---------- Turn-by-turn (Mintlify <Steps>) ---------- */
const DIR_ICON = { N: 'arrowN', S: 'arrowS', E: 'arrowE', W: 'arrowW' } as const
const DIR_WORD = { N: 'North', S: 'South', E: 'East', W: 'West' } as const

export function TurnList({
  units, activeStep, liveStep, onSelect, onHover,
}: {
  units: Units
  activeStep: number | null
  liveStep: number | null
  onSelect: (n: number) => void
  onHover: (n: number | null) => void
}) {
  return (
    <ol className="steps">
      {steps.map((s: Step) => (
        <li
          key={s.n}
          className={`step ${activeStep === s.n ? 'active' : ''} ${liveStep === s.n ? 'live' : ''}`}
          onMouseEnter={() => onHover(s.n)}
          onMouseLeave={() => onHover(null)}
        >
          <button className="step-btn" onClick={() => onSelect(s.n)}>
            <span className="step-num">{s.n}</span>
            <span className="step-main">
              <span className="step-title">
                <span className={`dir dir-${s.dir}`}>
                  <Icon name={DIR_ICON[s.dir]} size={13} />
                  {DIR_WORD[s.dir]}
                </span>
                on <b>{s.street}</b> to {s.to}
                {s.blocks > 1 && <span className="pill">{s.blocks} blocks</span>}
                {s.doubled && <span className="pill pill-primary">×2 connector</span>}
              </span>
              <span className="step-meta">
                {fmtShort(s.length, units)} <span className="sep">·</span> at {fmtDist(s.startAt, units)}
                {s.note && (
                  <>
                    <span className="sep">·</span> {s.note}
                  </>
                )}
              </span>
            </span>
            <Icon name="right" className="step-chev" />
          </button>
        </li>
      ))}
    </ol>
  )
}

/* ---------- Pace calculator ---------- */
export function PaceCalc({ units, paceSec, setPaceSec }: { units: Units; paceSec: number; setPaceSec: (s: number) => void }) {
  // paceSec is always seconds per km; the slider shows the chosen unit.
  const f = units === 'km' ? 1 : 1.609344
  const shown = paceSec * f
  const lap = (LAP_M / 1000) * paceSec
  const total = (TOTAL_M / 1000) * paceSec
  return (
    <div className="pace">
      <div className="pace-head">
        <div>
          <div className="pace-label">Your pace</div>
          <div className="pace-value">
            {fmtDuration(shown)}
            <span>/{units}</span>
          </div>
        </div>
        <div className="pace-results">
          {LAPS > 1 && (
            <div>
              <span>Per lap</span>
              <b>{fmtDuration(lap)}</b>
            </div>
          )}
          <div>
            <span>Finish time</span>
            <b>{fmtDuration(total)}</b>
          </div>
        </div>
      </div>
      <input
        className="range"
        type="range"
        min={180 / f}
        max={600 / f}
        step={5 / f}
        value={paceSec}
        onChange={(e) => setPaceSec(Number(e.target.value))}
        style={{ ['--p' as string]: `${((paceSec - 180 / f) / (600 / f - 180 / f)) * 100}%` }}
        aria-label="Pace"
      />
      <div className="pace-scale">
        <span>Fast</span>
        <span>Easy</span>
      </div>
    </div>
  )
}

/* ---------- Code block (Mintlify style) ---------- */
export function CodeBlock({ filename, code, onDownload }: { filename: string; code: string; onDownload?: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code">
      <div className="code-head">
        <span className="code-file">
          <Icon name="route" size={14} />
          {filename}
        </span>
        <div className="code-actions">
          {onDownload && (
            <button onClick={onDownload} title="Download">
              <Icon name="download" size={14} />
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard?.writeText(code)
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            }}
            title="Copy"
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}

/* ---------- Feedback + footer ---------- */
export function Feedback() {
  const [v, setV] = useState<null | 'up' | 'down'>(null)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const send = async (vote: 'up' | 'down') => {
    if (state === 'sending' || state === 'sent') return
    setV(vote)
    setState('sending')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote, page: location.pathname }),
      })
      setState(res.ok ? 'sent' : 'error')
    } catch {
      setState('error')
    }
  }
  const label =
    state === 'sent' ? 'Thanks for the feedback!'
      : state === 'error' ? "Couldn't send that, try again?"
      : 'Was this page helpful?'
  const locked = state === 'sending' || state === 'sent'
  return (
    <div className="feedback">
      <span>{label}</span>
      <div>
        <button className={v === 'up' ? 'on' : ''} disabled={locked} onClick={() => send('up')}>
          <Icon name="thumbUp" size={14} /> Yes
        </button>
        <button className={v === 'down' ? 'on' : ''} disabled={locked} onClick={() => send('down')}>
          <Icon name="thumbDown" size={14} /> No
        </button>
      </div>
    </div>
  )
}
