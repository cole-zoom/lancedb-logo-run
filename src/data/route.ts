// Street-intersection coordinates pulled from OpenStreetMap (node shared by both ways).
// [lng, lat] order, as MapLibre / GeoJSON expect.
export type LngLat = [number, number]

export const INTERSECTIONS = {
  'Jackson|Davis': [-122.398358, 37.797093],
  'Jackson|Front': [-122.399515, 37.796942],
  'Jackson|Battery': [-122.400702, 37.796781],
  'Jackson|Sansome': [-122.401877, 37.796633],
  'Jackson|Montgomery': [-122.403513, 37.796426],
  'Washington|Davis': [-122.398191, 37.796184],
  'Washington|Front': [-122.399347, 37.796071],
  'Washington|Battery': [-122.400508, 37.795874],
  'Washington|Sansome': [-122.401694, 37.795725],
  'Washington|Montgomery': [-122.403327, 37.795535],
  'Clay|Davis': [-122.39801, 37.79534],
  'Clay|Front': [-122.399179, 37.7952],
  'Clay|Battery': [-122.400332, 37.794998],
  'Clay|Sansome': [-122.401516, 37.794856],
  'Clay|Montgomery': [-122.403158, 37.794676],
  'Sacramento|Davis': [-122.397816, 37.794441],
  'Sacramento|Front': [-122.398992, 37.794292],
  'Sacramento|Battery': [-122.400164, 37.794144],
  'Sacramento|Sansome': [-122.401337, 37.793996],
  'Sacramento|Montgomery': [-122.402976, 37.793788],
  'California|Davis': [-122.397627, 37.793513],
  'California|Front': [-122.398801, 37.793365],
  'California|Battery': [-122.399977, 37.793216],
  'California|Sansome': [-122.401152, 37.793067],
  'California|Montgomery': [-122.402791, 37.792859],
} satisfies Record<string, LngLat>

export type Corner = keyof typeof INTERSECTIONS

export const ROUTE_NAME = 'FiDi Loop × 2'

export const HQ = {
  name: '2 Embarcadero Center',
  coord: [-122.39848, 37.79478] as LngLat,
}

export const START: Corner = 'Clay|Davis'
export const START_NAME = 'Clay & Davis'

// Walk from HQ: straight out to the corner of Clay & Davis.
export const WALK: LngLat[] = [HQ.coord, INTERSECTIONS[START] as LngLat]
export const WALK_MIN = 1

// How the grid is laid out, for rotating the map and placing street labels.
export const GRID = {
  ewAxis: ['Clay|Montgomery', 'Clay|Davis'] as const, // west → east along one street
  westEnd: 'Montgomery',
  eastEnd: 'Davis',
  southEnd: 'California',
  northEnd: 'Jackson',
}

export type Dir = 'N' | 'S' | 'E' | 'W'

export interface StepDef {
  dir: Dir
  street: string
  to: string
  blocks: number
  via: Corner[] // corners passed through, last one is where the step ends
  doubled?: boolean
  note?: string
}

export const STEPS: StepDef[] = [
  { dir: 'W', street: 'Clay', to: 'Front', blocks: 1, via: ['Clay|Front'] },
  { dir: 'S', street: 'Front', to: 'California', blocks: 2, via: ['Sacramento|Front', 'California|Front'] },
  { dir: 'E', street: 'California', to: 'Davis', blocks: 1, via: ['California|Davis'] },
  { dir: 'N', street: 'Davis', to: 'Sacramento', blocks: 1, via: ['Sacramento|Davis'] },
  { dir: 'W', street: 'Sacramento', to: 'Battery', blocks: 2, via: ['Sacramento|Front', 'Sacramento|Battery'] },
  { dir: 'S', street: 'Battery', to: 'California', blocks: 1, via: ['California|Battery'] },
  { dir: 'W', street: 'California', to: 'Sansome', blocks: 1, via: ['California|Sansome'] },
  { dir: 'N', street: 'Sansome', to: 'Sacramento', blocks: 1, via: ['Sacramento|Sansome'] },
  { dir: 'W', street: 'Sacramento', to: 'Montgomery', blocks: 1, via: ['Sacramento|Montgomery'] },
  { dir: 'N', street: 'Montgomery', to: 'Washington', blocks: 2, via: ['Clay|Montgomery', 'Washington|Montgomery'] },
  {
    dir: 'E', street: 'Washington', to: 'Battery', blocks: 2, via: ['Washington|Sansome', 'Washington|Battery'],
    doubled: true, note: 'First pass over the doubled connector',
  },
  { dir: 'S', street: 'Battery', to: 'Clay', blocks: 1, via: ['Clay|Battery'] },
  { dir: 'W', street: 'Clay', to: 'Sansome', blocks: 1, via: ['Clay|Sansome'] },
  { dir: 'N', street: 'Sansome', to: 'Washington', blocks: 1, via: ['Washington|Sansome'] },
  {
    dir: 'W', street: 'Washington', to: 'Montgomery', blocks: 1, via: ['Washington|Montgomery'],
    doubled: true, note: 'Second pass, which draws the hole in the middle',
  },
  { dir: 'N', street: 'Montgomery', to: 'Jackson', blocks: 1, via: ['Jackson|Montgomery'] },
  { dir: 'E', street: 'Jackson', to: 'Front', blocks: 3, via: ['Jackson|Sansome', 'Jackson|Battery', 'Jackson|Front'] },
  { dir: 'S', street: 'Front', to: 'Washington', blocks: 1, via: ['Washington|Front'] },
  { dir: 'E', street: 'Washington', to: 'Davis', blocks: 1, via: ['Washington|Davis'] },
  { dir: 'S', street: 'Davis', to: 'Clay', blocks: 1, via: ['Clay|Davis'], note: 'Back at the start line, lap done' },
]

// The doubled connector: Washington between Montgomery and Sansome.
export const DOUBLED: LngLat[] = [INTERSECTIONS['Washington|Montgomery'], INTERSECTIONS['Washington|Sansome']]

export const LAPS = 2

export const STREETS_EW = ['Jackson', 'Washington', 'Clay', 'Sacramento', 'California'] as const
export const STREETS_NS = ['Davis', 'Front', 'Battery', 'Sansome', 'Montgomery'] as const

export const LANDMARKS: { name: string; coord: LngLat; kind: 'poi' | 'transit' }[] = [
  { name: 'Transamerica Pyramid', coord: [-122.40276, 37.79518], kind: 'poi' },
  { name: 'Ferry Building', coord: [-122.39352, 37.79552], kind: 'poi' },
  { name: 'Embarcadero BART', coord: [-122.39697, 37.79286], kind: 'transit' },
  { name: 'Sue Bierman Park', coord: [-122.39626, 37.79655], kind: 'poi' },
]
