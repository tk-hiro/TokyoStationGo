import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const csvPath = resolve(__dirname, 'station.csv')
const linePath = resolve(__dirname, 'line20260409free.csv')
const outPath = resolve(__dirname, '..', 'src', 'data', 'stations.json')

const TOKYO_PREF_CD = 13
const ACTIVE_STATUS = 0

const indexer = (header) => (name) => {
  const i = header.indexOf(name)
  if (i === -1) throw new Error(`列が見つかりません: ${name}`)
  return i
}

const lineRows = readFileSync(linePath, 'utf8').split(/\r?\n/)
const lineHeader = lineRows[0].split(',')
const lineIdx = indexer(lineHeader)
const lLineCd = lineIdx('line_cd')
const lLineName = lineIdx('line_name')
const lineNameByCd = new Map()
for (let n = 1; n < lineRows.length; n++) {
  const row = lineRows[n]
  if (!row) continue
  const cols = row.split(',')
  lineNameByCd.set(Number(cols[lLineCd]), cols[lLineName])
}

const lines = readFileSync(csvPath, 'utf8').split(/\r?\n/)
const header = lines[0].split(',')
const idx = indexer(header)
const iGCd = idx('station_g_cd')
const iName = idx('station_name')
const iLine = idx('line_cd')
const iPref = idx('pref_cd')
const iLon = idx('lon')
const iLat = idx('lat')
const iStatus = idx('e_status')

const groups = new Map()
for (let n = 1; n < lines.length; n++) {
  const row = lines[n]
  if (!row) continue
  const cols = row.split(',')
  if (Number(cols[iPref]) !== TOKYO_PREF_CD) continue
  if (Number(cols[iStatus]) !== ACTIVE_STATUS) continue

  const gCd = Number(cols[iGCd])
  const lineCd = Number(cols[iLine])
  const lat = Number(cols[iLat])
  const lng = Number(cols[iLon])

  const existing = groups.get(gCd)
  if (existing) {
    existing.latSum += lat
    existing.lngSum += lng
    existing.count += 1
    if (!existing.lines.includes(lineCd)) existing.lines.push(lineCd)
  } else {
    groups.set(gCd, {
      id: gCd,
      name: cols[iName],
      latSum: lat,
      lngSum: lng,
      count: 1,
      lines: [lineCd],
    })
  }
}

const missingLineCds = new Set()
const stations = [...groups.values()].map((g) => ({
  id: g.id,
  name: g.name,
  lat: g.latSum / g.count,
  lng: g.lngSum / g.count,
  lines: g.lines,
  line_names: g.lines.map((cd) => {
    const name = lineNameByCd.get(cd)
    if (name === undefined) {
      missingLineCds.add(cd)
      return String(cd)
    }
    return name
  }),
}))

if (missingLineCds.size > 0) {
  console.warn(`警告: line_name が見つからない line_cd: ${[...missingLineCds].join(', ')}`)
}

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(stations, null, 2) + '\n', 'utf8')
console.log(`集約 ${stations.length} 駅 → ${outPath}`)
