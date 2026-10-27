'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { twJoin } from 'tailwind-merge'
import Button from '@/components/ui/Button'
import {
  COURSE_COLUMNS, MAX_CONFETTI_ROW_WIDTH, OBJECT_TYPES, brushCells, canPlaceConfetti, confettiRowArc,
  courseDocumentSchema, courseRows, editHistory, paintCells, redo, undo, validateCourse,
  type Cell, type CourseDocument, type History, type Layer, type ObjectKind, type Paint,
} from '@/utils/editor/courseDocument'

type Loaded = { document: CourseDocument; revision: string; version: string }
type Draft = { document: CourseDocument; revision: string }
type Tool = 'paint' | 'erase' | 'rectangle' | 'pan'
type Gesture = { start: Cell; last: Cell; document: CourseDocument; paint: Paint; rectangle: boolean }
const DRAFT_KEY = 'speedroller-course-editor-1.4.0'
const LAYERS: Layer[] = ['floor', 'ghosts', 'highlights', 'confetti', 'objects']
const OBJECT_COLOURS: Record<ObjectKind, string> = { ring: '#ff637c', start: '#b6a0ff', finish: '#ffe174', paintShop: '#ffad66' }
const CONFETTI_COLOUR = '#ff0080'
const CONFETTI_BAND = 'rgba(255, 0, 128, 0.18)'
const CONTROL = 'rounded border border-white/20 bg-zinc-900 px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-amber-300'
const LABELS: Record<Layer, string> = { floor: 'Floor', ghosts: 'Ghosts', highlights: 'Highlights', confetti: 'Confetti', objects: 'Objects' }

export default function CourseEditor() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const [working, setWorking] = useState<CourseDocument | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [layer, setLayer] = useState<Layer>('ghosts')
  const [visible, setVisible] = useState<Record<Layer, boolean>>({ floor: true, ghosts: true, highlights: true, confetti: true, objects: true })
  const [tool, setTool] = useState<Tool>('paint')
  const [size, setSize] = useState(1)
  const [object, setObject] = useState<ObjectKind>('ring')
  const [zoom, setZoom] = useState(4)
  const [cursor, setCursor] = useState<Cell>({ row: 0, column: 66 })
  const [message, setMessage] = useState('Loading course…')
  const [saving, setSaving] = useState(false)
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 800, height: 600 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const panning = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const positioned = useRef(false)
  const document = working ?? history?.present ?? null
  const rows = useMemo(() => document ? courseRows(document) : [], [document])
  const confettiRowCount = useMemo(() => rows.filter(row => row.confetti?.length).length, [rows])
  const issues = useMemo(() => history ? validateCourse(history.present) : [], [history])
  const dirty = !!history && !!loaded && JSON.stringify(history.present) !== JSON.stringify(loaded.document)
  const sections = useMemo(() => {
    let row = 0
    return document?.sections.map(section => {
      const start = row
      row += section.rows.length
      return { id: section.id, start, end: row - 1 }
    }) ?? []
  }, [document])

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/dev/course-editor', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Could not load course')
      const next: Loaded = { ...result, document: courseDocumentSchema.parse(result.document) }
      setLoaded(next)
      setHistory({ past: [], present: next.document, future: [] })
      setWorking(null)
      positioned.current = false
      try {
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          const candidate = JSON.parse(saved)
          const parsed = courseDocumentSchema.safeParse(candidate.document)
          if (parsed.success && typeof candidate.revision === 'string' && JSON.stringify(parsed.data) !== JSON.stringify(next.document)) {
            setDraft({ document: parsed.data, revision: candidate.revision })
          } else localStorage.removeItem(DRAFT_KEY)
        }
      } catch { setMessage('Course loaded; the stored draft could not be read.'); return }
      setMessage('Ready. Paint one layer at a time; save to playtest.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load course') }
  }, [])
  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!history || !loaded || draft) return
    if (!dirty) {
      try { localStorage.removeItem(DRAFT_KEY) } catch { /* Storage may be disabled. */ }
      return
    }
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ document: history.present, revision: loaded.revision })) }
      catch { setMessage('Browser draft could not be stored. Keep this page open until you save.') }
    }, 250)
    return () => clearTimeout(timer)
  }, [dirty, history, loaded, draft])
  useEffect(() => {
    if (!dirty && !working) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, working])

  const updateViewport = useCallback(() => {
    const element = viewportRef.current
    if (element) setViewport({ left: element.scrollLeft, top: element.scrollTop, width: element.clientWidth, height: element.clientHeight })
  }, [])
  useLayoutEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(updateViewport)
    observer.observe(element)
    updateViewport()
    return () => observer.disconnect()
  }, [updateViewport, loaded])
  useLayoutEffect(() => {
    if (!rows.length || positioned.current || !viewportRef.current) return
    viewportRef.current.scrollTop = rows.length * zoom
    viewportRef.current.scrollLeft = 66 * zoom - viewportRef.current.clientWidth / 2
    positioned.current = true
    updateViewport()
  }, [rows.length, zoom, updateViewport])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(viewport.width * ratio)
    canvas.height = Math.round(viewport.height * ratio)
    context.scale(ratio, ratio)
    context.fillStyle = '#090e12'
    context.fillRect(0, 0, viewport.width, viewport.height)
    const first = Math.max(0, Math.floor(viewport.top / zoom))
    const last = Math.min(rows.length - 1, Math.ceil((viewport.top + viewport.height) / zoom))
    const paintCell = (column: number, y: number, colour: string) => {
      context.fillStyle = colour
      context.fillRect(column * zoom - viewport.left, y, Math.max(1, zoom - (zoom >= 8 ? 0.5 : 0)), zoom)
    }
    for (let screenRow = first; screenRow <= last; screenRow++) {
      const row = rows[rows.length - 1 - screenRow]
      const y = screenRow * zoom - viewport.top
      if (visible.floor) for (const column of row.floor) paintCell(column, y, '#c0b7a0')
      if (visible.highlights) for (const column of row.highlights) paintCell(column, y, '#f9f3df')
      if (visible.ghosts) for (const column of row.ghosts) {
        paintCell(column, y, '#237d88')
        if (zoom >= 5) {
          context.strokeStyle = '#9ee8e6'
          context.beginPath()
          context.moveTo(column * zoom - viewport.left, y + zoom)
          context.lineTo((column + 1) * zoom - viewport.left, y)
          context.stroke()
        }
      }
      if (visible.confetti && row.confetti?.length) {
        const arc = confettiRowArc(row)
        if (arc && arc.width <= MAX_CONFETTI_ROW_WIDTH) {
          const firstWidth = Math.min(arc.width, COURSE_COLUMNS - arc.start)
          const tailWidth = arc.width - firstWidth
          context.fillStyle = CONFETTI_BAND
          context.fillRect(arc.start * zoom - viewport.left, y, firstWidth * zoom, zoom)
          if (tailWidth > 0) context.fillRect(-viewport.left, y, tailWidth * zoom, zoom)
          context.fillStyle = CONFETTI_COLOUR
          const tick = Math.max(2, zoom * 0.2)
          context.fillRect(arc.start * zoom - viewport.left, y, tick, zoom)
          const endColumn = tailWidth > 0 ? tailWidth : arc.start + arc.width
          context.fillRect(endColumn * zoom - viewport.left - tick, y, tick, zoom)
        }
      }
      if (visible.objects) for (const object of row.objects) {
        context.fillStyle = OBJECT_COLOURS[object.type]
        context.beginPath()
        context.arc((object.column + 0.5) * zoom - viewport.left, y + zoom / 2, Math.max(2, zoom * 0.45), 0, Math.PI * 2)
        context.fill()
      }
    }
    context.font = '12px sans-serif'
    for (const section of sections) {
      const y = (rows.length - section.start) * zoom - viewport.top
      if (y < 0 || y > viewport.height) continue
      context.strokeStyle = '#5c8d98'
      context.beginPath(); context.moveTo(0, y); context.lineTo(viewport.width, y); context.stroke()
      context.fillStyle = '#a9d5d7'
      context.fillText(section.id.replace('race-', '') + ` · row ${section.start}`, 8, y - 6)
    }
    context.strokeStyle = '#ff405e'
    context.lineWidth = 2
    for (const issue of issues) context.strokeRect(issue.column * zoom - viewport.left, (rows.length - 1 - issue.row) * zoom - viewport.top, zoom, zoom)
    context.strokeStyle = '#ffffff'
    const cursorRow = rows[cursor.row]
    if (layer === 'confetti' && cursorRow && !canPlaceConfetti(cursorRow)) context.strokeStyle = '#fbbf24'
    context.strokeRect(cursor.column * zoom - viewport.left, (rows.length - 1 - cursor.row) * zoom - viewport.top, zoom, zoom)
  }, [rows, viewport, visible, zoom, cursor, sections, issues, layer])

  const locate = (event: React.PointerEvent<HTMLCanvasElement>): Cell => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      row: Math.max(0, Math.min(rows.length - 1, rows.length - 1 - Math.floor((event.clientY - bounds.top + viewport.top) / zoom))),
      column: Math.max(0, Math.min(COURSE_COLUMNS - 1, Math.floor((event.clientX - bounds.left + viewport.left) / zoom))),
    }
  }
  const finishGesture = (cancel = false) => {
    if (!cancel && working) setHistory(history => history ? editHistory(history, working) : history)
    gesture.current = null; panning.current = null; setWorking(null)
  }
  const jumpTo = (row: number, column = cursor.column) => {
    const element = viewportRef.current
    if (!element) return
    setCursor({ row, column })
    element.scrollTop = (rows.length - 1 - row) * zoom - element.clientHeight / 2
    element.scrollLeft = (column + 0.5) * zoom - element.clientWidth / 2
    updateViewport()
    canvasRef.current?.focus({ preventScroll: true })
  }
  const changeZoom = (next: number) => {
    const element = viewportRef.current
    if (!element) return
    const centreY = (element.scrollTop + element.clientHeight / 2) / zoom
    const centreX = (element.scrollLeft + element.clientWidth / 2) / zoom
    setZoom(next)
    requestAnimationFrame(() => {
      element.scrollTop = centreY * next - element.clientHeight / 2
      element.scrollLeft = centreX * next - element.clientWidth / 2
      updateViewport()
    })
  }
  const save = async () => {
    if (!history || !loaded || issues.length || working) return
    setSaving(true); setMessage('Validating and building course…')
    try {
      const response = await fetch('/api/dev/course-editor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document: history.present, revision: loaded.revision }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Save failed')
      setLoaded({ ...loaded, document: history.present, revision: result.revision })
      localStorage.removeItem(DRAFT_KEY)
      setMessage('Saved and built. Open Game to test the updated course.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed; your draft is retained.') }
    finally { setSaving(false) }
  }

  return <main className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
    <header className="flex flex-wrap items-center gap-3 border-b border-white/15 px-5 py-3">
      <div className="mr-auto"><h1 className="text-lg font-bold">Course editor <span className="text-xs font-normal text-amber-300">LOCAL · {loaded?.version}</span></h1><p className="text-xs text-zinc-400">Unrolled cylinder · travel ↑ · {dirty ? 'Unsaved changes' : 'Saved course'}</p></div>
      <Button variant="secondary" size="sm" disabled={!history?.past.length || saving || !!working} onClick={() => setHistory(history => history ? undo(history) : history)}>Undo</Button>
      <Button variant="secondary" size="sm" disabled={!history?.future.length || saving || !!working} onClick={() => setHistory(history => history ? redo(history) : history)}>Redo</Button>
      <Button variant="secondary" size="sm" disabled={saving} onClick={() => { if (!dirty || window.confirm('Discard unsaved edits and reload the saved course?')) { localStorage.removeItem(DRAFT_KEY); setDraft(null); void load() } }}>Reload</Button>
      <Button variant="primary" size="sm" disabled={!loaded || saving || !!working || !!draft || issues.length > 0} onClick={() => void save()}>{saving ? 'Building…' : 'Save & Build'}</Button>
      <Link className={twJoin(CONTROL, 'text-amber-200')} href="/?editor=true" target="speedroller-course-playtest" rel="noopener">Open Game ↗</Link>
    </header>
    {draft && <div className="flex flex-wrap items-center gap-3 bg-amber-950 px-5 py-3 text-sm">
      <p>A browser draft is available.{draft.revision !== loaded?.revision && ' The saved course has changed; restoring will require review before saving.'}</p>
      <button className={CONTROL} onClick={() => { setHistory(history => history ? editHistory(history, draft.document) : history); setDraft(null); setMessage('Draft restored over the current saved revision. Review changes before saving.') }}>Restore draft</button>
      <button className={CONTROL} onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraft(null) }}>Discard draft</button>
    </div>}
    <div className="flex min-h-0 flex-1">
      <aside className="w-60 shrink-0 overflow-y-auto border-r border-white/15 p-4 text-sm">
        <fieldset disabled={saving || !loaded || !!draft} className="space-y-5">
          <div><h2 className="mb-2 font-bold">Layers</h2>{LAYERS.map(value => <div className="mb-1 flex items-center gap-2" key={value}>
            <input type="checkbox" aria-label={`Show ${LABELS[value]}`} checked={visible[value]} onChange={event => setVisible({ ...visible, [value]: event.target.checked })} />
            <button aria-pressed={layer === value} className={twJoin('flex-1 rounded px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-amber-300', layer === value ? 'bg-amber-900 text-amber-100' : 'bg-white/5')} onClick={() => { setLayer(value); setVisible({ ...visible, [value]: true }) }}>{LABELS[value]}</button>
          </div>)}<p className="mt-2 text-xs text-zinc-400">Ghosts mask out floor collision. Hiding a layer only changes this view.</p></div>
          <label className="block">Tool<select className={twJoin(CONTROL, 'mt-1 w-full')} value={tool} onChange={event => setTool(event.target.value as Tool)}>{(['paint', 'erase', 'rectangle', 'pan'] as const).map(tool => <option key={tool}>{tool}</option>)}</select></label>
          {layer === 'objects' ? <label className="block">Object<select className={twJoin(CONTROL, 'mt-1 w-full')} value={object} onChange={event => setObject(event.target.value as ObjectKind)}>{OBJECT_TYPES.map(kind => <option key={kind}>{kind}</option>)}</select></label> : <label className="block">Brush size<select className={twJoin(CONTROL, 'mt-1 w-full')} value={size} onChange={event => setSize(Number(event.target.value))}>{[1, 3, 5].map(size => <option value={size} key={size}>{size} × {size}</option>)}</select></label>}
          {layer === 'confetti' && <p className="text-xs leading-relaxed text-zinc-400">{confettiRowCount} marked row{confettiRowCount === 1 ? '' : 's'} · two emitters each. One marker per row; the burst spans the solid floor. Rows wider than {MAX_CONFETTI_ROW_WIDTH} tiles are skipped.</p>}
          <label className="block">Section<select className={twJoin(CONTROL, 'mt-1 w-full')} defaultValue="" onChange={event => jumpTo(Number(event.target.value))}><option value="" disabled>Jump to section</option>{sections.map(section => <option key={section.id} value={section.start}>{section.id.replace('race-', '')}</option>)}</select></label>
          <label className="block">Zoom · {zoom}px / tile<input aria-label="Zoom" className="mt-2 w-full accent-amber-300" type="range" min="1" max="24" step="1" value={zoom} onChange={event => changeZoom(Number(event.target.value))} /></label>
        </fieldset>
        <p className="mt-6 text-xs leading-relaxed text-zinc-400">Drag to paint. Middle-drag or Pan to move. Focus the map: arrows move a cell; Space paints; Delete erases; Cmd/Ctrl Z undoes, Shift Z redoes.</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">Confetti paints whole rows; erasing anywhere in a row removes its burst.</p>
        <output className="mt-3 block text-xs" aria-live="polite">Row {cursor.row} · Column {cursor.column}</output>
        {!!issues.length && <div className="mt-5"><h2 className="text-rose-300">{issues.length} issue{issues.length === 1 ? '' : 's'}</h2><ul className="mt-2 space-y-2">{issues.slice(0, 20).map((issue, index) => <li key={index}><button className="text-left text-xs text-rose-200 underline" onClick={() => jumpTo(issue.row, issue.column)}>{issue.message} · {issue.row}:{issue.column}</button></li>)}</ul></div>}
      </aside>
      <div ref={viewportRef} onScroll={updateViewport} className="relative min-w-0 flex-1 overflow-auto" style={{ touchAction: 'none' }}>
        <div style={{ width: Math.max(COURSE_COLUMNS * zoom, viewport.width), height: Math.max(rows.length * zoom, viewport.height) }}>
          <canvas ref={canvasRef} tabIndex={0} role="application" aria-label="Course paint grid. Use arrows to select a cell, Space to paint, Delete to erase." className="sticky left-0 top-0 block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-amber-300" style={{ width: viewport.width, height: viewport.height, cursor: tool === 'pan' ? 'grab' : 'crosshair' }}
            onContextMenu={event => event.preventDefault()}
            onPointerDown={event => {
              if (!history || saving || draft) return
              event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId)
              if (tool === 'pan' || event.button === 1) { panning.current = { x: event.clientX, y: event.clientY, left: viewport.left, top: viewport.top }; return }
              if (event.button !== 0) return
              const cell = locate(event)
              setCursor(cell)
              const paint: Paint = { layer, erase: tool === 'erase', object }
              gesture.current = { start: cell, last: cell, document: history.present, paint, rectangle: tool === 'rectangle' && layer !== 'objects' }
              setWorking(paintCells(history.present, brushCells(cell, cell, layer === 'objects' ? 1 : size), paint))
            }}
            onPointerMove={event => {
              if (panning.current && viewportRef.current) {
                viewportRef.current.scrollLeft = panning.current.left - (event.clientX - panning.current.x)
                viewportRef.current.scrollTop = panning.current.top - (event.clientY - panning.current.y)
                return
              }
              const cell = locate(event); setCursor(cell)
              const active = gesture.current
              if (!active) return
              const cells = layer === 'objects' ? [cell] : brushCells(active.rectangle ? active.start : active.last, cell, size, active.rectangle)
              setWorking(previous => paintCells(active.rectangle ? active.document : previous ?? active.document, cells, active.paint))
              active.last = cell
            }}
            onPointerUp={event => { finishGesture(); event.currentTarget.releasePointerCapture(event.pointerId) }}
            onPointerCancel={() => finishGesture(true)}
            onKeyDown={event => {
              if (!history || saving || draft) return
              if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); setHistory(event.shiftKey ? redo(history) : undo(history)); return }
              const offsets: Record<string, [number, number]> = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
              if (offsets[event.key]) {
                event.preventDefault()
                const [row, column] = offsets[event.key]
                jumpTo(Math.max(0, Math.min(rows.length - 1, cursor.row + row)), (cursor.column + column + COURSE_COLUMNS) % COURSE_COLUMNS)
              } else if ([' ', 'Delete', 'Backspace'].includes(event.key)) {
                event.preventDefault()
                const next = paintCells(history.present, brushCells(cursor, cursor, layer === 'objects' ? 1 : size), { layer, object, erase: event.key !== ' ' || tool === 'erase' })
                setHistory(editHistory(history, next))
              }
            }} />
        </div>
      </div>
    </div>
    <footer role="status" className="max-h-28 overflow-auto whitespace-pre-wrap border-t border-white/15 px-5 py-2 text-xs text-amber-100">{message}</footer>
  </main>
}
