import type { PillarPlacement } from '../../utils/platform/architecture'
import { colToX, type RowData } from '../../utils/tiles'

export function architecturePreview(pillars: PillarPlacement[], rows: readonly RowData[]) {
  const x = (value: number) => 30 + (value + 80) * 4
  const y = (distance: number) => 70 + (760 - distance) * 4
  const marks: string[] = []
  rows.forEach((row, index) => {
    const distance = index - 32
    if (distance < 600 || distance > 759) return
    row.isRaised.forEach((raised, column) => {
      if (raised) marks.push(`<rect x="${x(colToX(column)-0.5)}" y="${y(distance+0.5)}" width="4" height="4" fill="${row.isHighlighted?.[column] ? '#fff4d6' : '#9f998d'}"/>`)
    })
    row.rings?.forEach((hasRing, column) => hasRing && marks.push(`<circle cx="${x(colToX(column))}" cy="${y(distance)}" r="4" fill="none" stroke="#ffbb43" stroke-width="2"/>`))
  })
  pillars.forEach((pillar,index) => {
    const [px,,] = pillar.position, [width,height,depth] = pillar.dimensions
    marks.push(`<g><rect x="${x(px-width/2)}" y="${y(pillar.distance+depth/2)}" width="${width*4}" height="${depth*4}" fill="#e8ddc9" stroke="#847a6b"/><text x="${x(px)}" y="${y(pillar.distance)+4}" text-anchor="middle" fill="#222">P${index+1}</text><text x="${x(px)}" y="${y(pillar.distance-depth/2)+16}" text-anchor="middle">${width}×${depth} · top ${Math.round(height-32)}m</text></g>`)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="704" height="800" viewBox="0 0 704 800"><rect width="704" height="800" fill="#20252c"/><g font-family="sans-serif" font-size="12" fill="#ede9df"><text x="30" y="26" font-size="20">Recovery pillars · footprint blockout</text><text x="30" y="49">Forward ↑ · square metres · holes remain open gaps · rings in gold</text>${marks.join('')}<text x="30" y="747">Eight non-collidable pillars · bases at Y −32 · red/green/blue = +12/+24/+40m</text><text x="30" y="770">Top elevations are relative to the track. Final pair frames the future gateway.</text></g></svg>`
}
