import { EVENT } from '../config'
import { runCoords } from './geo'

export function buildGpx(): string {
  const pts = runCoords
    .map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="LanceDB Run" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${EVENT.name}</name>
    <desc>${EVENT.tagline}</desc>
  </metadata>
  <trk>
    <name>${EVENT.name}</name>
    <type>running</type>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`
}

export function downloadGpx() {
  const blob = new Blob([buildGpx()], { type: 'application/gpx+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lancedb-run.gpx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
