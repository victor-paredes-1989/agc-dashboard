import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

const fmt = (n) => { const num = Number(n); return isNaN(num) ? '0' : num.toLocaleString('pt-BR') }
const fmtDec = (n) => { const num = Number(n); return isNaN(num) ? '0,0' : num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) }
const fmtR = (n) => { const num = Number(n) || 0; return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
const fmtR1 = (n) => { const num = Number(n) || 0; return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` }
const fmtNum1 = (n) => { const num = Number(n) || 0; return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`
const parseDisplayNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0
  let s = String(value).trim()
  let negative = false

  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.replace(/[()]/g, '')
  }

  s = s.replace(/−/g, '-')
  if (s.startsWith('-')) {
    negative = true
    s = s.slice(1)
  }

  s = s
    .replace(/R\$\s*/gi, '')
    .replace(/%/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9.,]/g, '')

  if (!s) return 0

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1
    if (decimals === 3) s = s.replace(/\./g, '')
  }

  const n = Number(s)
  if (Number.isNaN(n)) return 0
  return negative ? -n : n
}

// Colors by CONCEPT — same concept = same color everywhere
const CONCEPT_COLORS = {
  'IB': '#3b82f6',        // blue
  'SS': '#10b981',        // green
  'REC. BASE': '#8b5cf6', // purple
  'INDICAÇÃO': '#f59e0b', // amber
  'MQL': '#14b8a6',       // teal
  'LIVE': '#ec4899',      // pink
  'API': '#f97316',       // orange
  'CHURN': '#ef4444',     // red
  'RECUP': '#6366f1',     // indigo
  'INDIC': '#f59e0b',     // amber (same as INDICAÇÃO)
  'SEM ORIGEM': '#64748b',
}

const STATUS_COLORS = {
  PAGO: '#10b981', FORA: '#ef4444', FUP: '#3b82f6',
  PM: '#f59e0b', FUGIU: '#f97316', OUTROS: '#64748b',
  FECHOU: '#10b981', RECALL: '#8b5cf6', CONTRATO: '#14b8a6', ASSINADO: '#6366f1'
}

const CLOSER_COLORS = ['#3b82f6','#8b5cf6','#14b8a6','#f59e0b','#ec4899','#f97316','#6366f1']
const SDR_COLORS = ['#10b981','#3b82f6','#8b5cf6','#f59e0b','#14b8a6','#f97316']

function getConceptColor(nome, fallbackArr, idx) {
  const upper = String(nome).toUpperCase().trim()
  for (const [key, color] of Object.entries(CONCEPT_COLORS)) {
    if (upper === key || upper.startsWith(key)) return color
  }
  return fallbackArr[idx % fallbackArr.length]
}

function BarChart({ data, valueKey = 'qtd', labelKey = 'nome', colorArr = null, formatVal, showPct = false, conceptColor = false, extraValueKey = null, formatExtraVal = null }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0)
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0))
  return (
    <div>
      {data.slice(0, 10).map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const pct = max > 0 ? (val / max) * 100 : 0
        const pctOfTotal = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0'
        const displayVal = formatVal ? formatVal(val, d) : val
        const extraVal = extraValueKey ? (Number(d[extraValueKey]) || 0) : null
        const displayExtra = extraValueKey ? (formatExtraVal ? formatExtraVal(extraVal) : extraVal) : null
        const finalLabel = extraValueKey
          ? `${displayVal} - ${displayExtra}${showPct ? ` - ${pctOfTotal}%` : ''}`
          : `${displayVal}${showPct ? ` (${pctOfTotal}%)` : ''}`
        const color = conceptColor
          ? getConceptColor(d[labelKey], colorArr || CLOSER_COLORS, i)
          : (colorArr ? colorArr[i % colorArr.length] : '#3b82f6')
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 80, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d[labelKey]}>{d[labelKey]}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.85, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', width: extraValueKey ? 150 : (showPct ? 90 : 36), textAlign: 'right', flexShrink: 0 }}>
              {finalLabel}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PieChart({ data }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const total = data.reduce((s, d) => s + d.qtd, 0)
  let cumAngle = -90
  const cx = 50, cy = 50, r = 42
  const slices = data.map((d, i) => {
    const angle = (d.qtd / total) * 360
    const startAngle = (cumAngle * Math.PI) / 180
    cumAngle += angle
    const endAngle = (cumAngle * Math.PI) / 180
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle)
    const large = angle > 180 ? 1 : 0
    const color = STATUS_COLORS[d.nome] || CLOSER_COLORS[i % CLOSER_COLORS.length]
    return { ...d, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color, pct: ((d.qtd/total)*100).toFixed(1) }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#1a1d27" strokeWidth="1" />)}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span>{s.nome} — {s.qtd} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChartWithTooltip({ data, color = '#14b8a6' }) {
  const [tooltip, setTooltip] = useState(null)
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const vals = data.map(d => d.qtd)
  const max = Math.max(...vals, 1)
  const w = 300, h = 80
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * w,
    y: h - (d.qtd / max) * (h - 10) - 2,
    data: d, i
  }))
  const pts = points.map(p => `${p.x},${p.y}`).join(' ')
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} style={{ cursor: 'pointer' }}
            onMouseEnter={(e) => setTooltip({ x: p.x, y: p.y, label: p.data.data, qtd: p.data.qtd })}
            onMouseLeave={() => setTooltip(null)} />
        ))}
      </svg>
      {tooltip && (
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: '#1e2235', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#e2e8f0', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
          <div style={{ color: 'var(--text-muted)' }}>{tooltip.label}</div>
          <div style={{ fontWeight: 600 }}>{tooltip.qtd} reuniões</div>
        </div>
      )}
    </div>
  )
}

function MiniLineChartTooltip({ dados, metrica, color }) {
  const [tooltip, setTooltip] = useState(null)
  const isReais = metrica === 'nmrr' || metrica === 'tkm'
  if (!dados || dados.length === 0) return null
  const vals = dados.map(d => Number(d[metrica]) || 0)
  const max = Math.max(...vals, 1)
  const w = 280, h = 70
  const points = dados.map((d, i) => ({
    x: (i / Math.max(dados.length - 1, 1)) * w,
    y: h - ((Number(d[metrica]) || 0) / max) * (h - 10) - 2,
    semana: d.semana,
    val: Number(d[metrica]) || 0
  }))
  const pts = points.map(p => `${p.x},${p.y}`).join(' ')
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 70 }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="5" fill={color} style={{ cursor: 'pointer' }}
            onMouseEnter={() => setTooltip(p)}
            onMouseLeave={() => setTooltip(null)} />
        ))}
      </svg>
      {tooltip && (
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: '#1e2235', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#e2e8f0', pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
          <div style={{ color: 'var(--text-muted)' }}>{tooltip.semana}</div>
          <div style={{ fontWeight: 600 }}>{isReais ? fmtR(tooltip.val) : fmt(tooltip.val)}</div>
        </div>
      )}
    </div>
  )
}

function SemanasComparativo({ semanas }) {
  const [metrica, setMetrica] = useState('contratosPagos')
  if (!semanas || semanas.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de semanas</div>

  const monthMeta = {
    JAN: { label: 'Janeiro', order: 1 },
    FEV: { label: 'Fevereiro', order: 2 },
    MAR: { label: 'Março', order: 3 },
    ABR: { label: 'Abril', order: 4 },
    MAI: { label: 'Maio', order: 5 },
    JUN: { label: 'Junho', order: 6 },
    JUL: { label: 'Julho', order: 7 },
    AGO: { label: 'Agosto', order: 8 },
    SET: { label: 'Setembro', order: 9 },
    OUT: { label: 'Outubro', order: 10 },
    NOV: { label: 'Novembro', order: 11 },
    DEZ: { label: 'Dezembro', order: 12 },
  }

  const getMonthKey = (semana) => {
    const txt = String(semana || '').toUpperCase()
    return Object.keys(monthMeta).find(k => txt.includes(k)) || 'OUTROS'
  }

  const grupos = Object.entries(semanas.reduce((acc, item) => {
    const key = getMonthKey(item.semana)
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})).map(([key, dados]) => ({
    key,
    dados,
    label: monthMeta[key]?.label || key,
    order: monthMeta[key]?.order || 99,
  })).sort((a, b) => a.order - b.order)

  const metricaOpts = [
    { key: 'leads', label: 'Leads' },
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'realizadas', label: 'Realizadas' },
    { key: 'contratosPagos', label: 'Contratos' },
    { key: 'nmrr', label: 'NMRR' },
    { key: 'tkm', label: 'TKM' },
  ]

  const chartColors = ['#8b5cf6', '#14b8a6', '#3b82f6', '#f59e0b', '#ec4899', '#f97316', '#6366f1']

  const TableMes = ({ dados, titulo }) => (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>{titulo}</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Semana','Leads','MQL','L.MQL','CPL','Agend.','%Agd','Realiz.','%Rlzd','Contratos','%Conv','NMRR','TKM'].map(h => (
                <th key={h} style={{ textAlign: h === 'Semana' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.semana}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmt(s.leads)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.mql || '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.leadsMql || '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.cpl ? fmtR(s.cpl) : '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmt(s.agendamentos)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.pctAgd || '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmt(s.realizadas)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.pctRlzd || '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(s.contratosPagos)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{s.pctConv || '-'}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#f59e0b' }}>{fmtR(s.nmrr)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#8b5cf6' }}>{fmtR(s.tkm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Evolução Comparativa</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {metricaOpts.map(m => (
          <button key={m.key} onClick={() => setMetrica(m.key)}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: 12, cursor: 'pointer',
              background: metrica === m.key ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderColor: metrica === m.key ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              color: metrica === m.key ? '#e2e8f0' : '#94a3b8' }}>
            {m.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 28 }}>
        {grupos.map((grupo, idx) => (
          <div key={grupo.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{grupo.label} — {metricaOpts.find(m => m.key === metrica)?.label}</div>
            <MiniLineChartTooltip dados={grupo.dados} metrica={metrica} color={chartColors[idx % chartColors.length]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {grupo.dados.map((d, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{String(d.semana).replace(` ${grupo.key}`, '')}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {grupos.map(grupo => <TableMes key={grupo.key} dados={grupo.dados} titulo={`${grupo.label} 2026`} />)}
    </div>
  )
}

function MetricCards({ metricas }) {
  if (!metricas || metricas.leads === undefined) return null
  const gap = metricas.gap || ''
  const gapNumber = parseDisplayNumber(gap)
  const gapPositive = gapNumber < 0
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Métricas do Mês</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {[
          { label: 'Leads', value: fmt(metricas.leads), sub: `MQL: ${fmtPct(metricas.mql)}`, color: 'blue' },
          { label: 'Agendamentos', value: fmt(metricas.agendamentos), sub: `Taxa: ${fmtPct(metricas.taxaAgendamento)}`, color: '' },
          { label: 'Realizadas', value: fmt(metricas.realizadas), sub: `Comparec.: ${fmtPct(metricas.taxaRealizadas)}`, color: '' },
          { label: 'Contratos Pagos', value: fmt(metricas.contratosPagos), sub: `Vendidos: ${fmt(metricas.contratosVendidos)}`, color: 'green' },
          { label: 'NMRR', value: fmtR(metricas.nmrr), sub: `TKM: ${fmtR(metricas.tkm)}`, color: 'amber' },
          { label: 'Investimento', value: fmtR(metricas.investimento), sub: `CPL: ${fmtR(metricas.cpl)}`, color: 'purple' },
          { label: 'CAC', value: fmtR(metricas.cac), sub: `por contrato | TKM: ${fmtR(metricas.tkm)}`, color: 'teal' },
          { label: 'Gap da Meta', value: gap, sub: gapPositive ? '✓ Meta ultrapassada' : '⚠ Abaixo da meta', color: gapPositive ? 'green' : 'red' },
        ].map((c, i) => (
          <div key={i} className={`card ${c.color}`}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">{c.value}</div>
            <div className="card-sub">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReuniaoCards({ cards }) {
  if (!cards || !cards.total) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, marginTop: 28 }}>Resumo das Reuniões</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div className="card"><div className="card-label">Total Reuniões</div><div className="card-value">{fmt(cards.total)}</div></div>
        <div className="card green"><div className="card-label">Fechamentos (PAGO)</div><div className="card-value">{fmt(cards.pagos)}</div><div className="card-sub">Taxa: {fmtPct(cards.taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Total</div><div className="card-value">{fmtR(cards.valorTotal)}</div></div>
        <div className="card amber"><div className="card-label">NMRR (sem DSV/DSO)</div><div className="card-value">{fmtR(cards.nmrr)}</div><div className="card-sub">TKM: {fmtR(cards.tkm)}</div></div>
        {cards.dsvTotal > 0 && <div className="card blue"><div className="card-label">DSV / DSO</div><div className="card-value">{fmtR(cards.dsvTotal)}</div><div className="card-sub">{cards.dsvCount} contratos</div></div>}
        <div className="card blue"><div className="card-label">FUP + PM</div><div className="card-value">{fmt((cards.fup||0)+(cards.pm||0))}</div></div>
        <div className="card red"><div className="card-label">Perdidos (FORA)</div><div className="card-value">{fmt(cards.fora)}</div></div>
        <div className="card"><div className="card-label">Fugiram</div><div className="card-value">{fmt(cards.fugiu)}</div></div>
      </div>
    </div>
  )
}

function ReuniaoGraficos({ graficos }) {
  if (!graficos) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, marginTop: 28 }}>Análise das Reuniões</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="chart-card"><div className="chart-title">Valor Pago por Origem (R$)</div>
          <BarChart data={graficos.valorPagoPorOrigem} valueKey="valor" conceptColor formatVal={v=>`R$${(v/1000).toFixed(1).replace('.', ',')}k`} showPct /></div>
        <div className="chart-card"><div className="chart-title">Qtd de Pagos por Origem</div>
          <BarChart data={graficos.qtdPagosPorOrigem} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Pipeline Ativo por Status</div>
          <BarChart data={graficos.pipeline} valueKey="qtd" colorArr={Object.values(STATUS_COLORS)} showPct extraValueKey="valor" formatExtraVal={v=>fmtR1(v)} /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por Closer</div>
          <BarChart data={graficos.reunioesPorCloser} valueKey="qtd" colorArr={CLOSER_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Fechado por Closer (R$)</div>
          <BarChart data={graficos.valorPorCloser} valueKey="valor" colorArr={CLOSER_COLORS} formatVal={v=>`R$${(v/1000).toFixed(1).replace('.', ',')}k`} showPct /></div>
        <div className="chart-card"><div className="chart-title">Taxa de Conversão por Closer (%)</div>
          <BarChart data={graficos.taxaCloser} valueKey="taxa" colorArr={CLOSER_COLORS} formatVal={v=>`${v}%`} /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por Origem</div>
          <BarChart data={graficos.reunioesPorOrigem} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por SDR</div>
          <BarChart data={graficos.reunioesPorSdr} valueKey="qtd" colorArr={SDR_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Contratos Pagos por SDR</div>
          <BarChart data={graficos.contratosPorSdr} valueKey="pagos" colorArr={SDR_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Status das Reuniões</div><PieChart data={graficos.status} /></div>
        <div className="chart-card"><div className="chart-title">Evolução de Reuniões por Data</div>
          <LineChartWithTooltip data={graficos.evolucao} color="#14b8a6" /></div>
        <div className="chart-card"><div className="chart-title">Perdidos (FORA) por Origem</div>
          <BarChart data={graficos.foraPorOrigem} valueKey="qtd" conceptColor showPct /></div>
      </div>
    </div>
  )
}



function DadosEspecificosView({ registros }) {
  const [filtros, setFiltros] = useState({
    empresa: 'TODAS', mes: 'TODOS', ano: 'TODOS', sdr: 'TODOS', closer: 'TODOS',
    origem: 'TODAS', status: 'TODOS', servico: 'TODOS', dataIni: '', dataFim: '', busca: ''
  })

  const rows = registros || []
  const setFiltro = (key, value) => setFiltros(prev => ({ ...prev, [key]: value }))

  const norm = (v) => String(v || '').trim().toUpperCase()
  const unique = (key) => [...new Set(rows.map(r => String(r[key] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const parseDate = (value) => {
    if (!value) return null
    const s = String(value).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`)
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/)
    if (m) {
      const y = m[3].length === 2 ? `20${m[3]}` : m[3]
      return new Date(Number(y), Number(m[2]) - 1, Number(m[1]))
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }

  const dataIni = parseDate(filtros.dataIni)
  const dataFim = parseDate(filtros.dataFim)

  const filtrados = rows.filter(r => {
    if (filtros.empresa !== 'TODAS' && norm(r.empresa) !== norm(filtros.empresa)) return false
    if (filtros.mes !== 'TODOS' && norm(r.mes) !== norm(filtros.mes)) return false
    if (filtros.ano !== 'TODOS' && String(r.ano || '') !== filtros.ano) return false
    if (filtros.sdr !== 'TODOS' && norm(r.sdr) !== norm(filtros.sdr)) return false
    if (filtros.closer !== 'TODOS' && norm(r.closer) !== norm(filtros.closer)) return false
    if (filtros.origem !== 'TODAS' && norm(r.origem) !== norm(filtros.origem)) return false
    if (filtros.status !== 'TODOS' && norm(r.status) !== norm(filtros.status)) return false
    if (filtros.servico !== 'TODOS' && norm(r.servico) !== norm(filtros.servico)) return false

    const d = parseDate(r.data)
    if (dataIni && d && d < dataIni) return false
    if (dataFim && d && d > dataFim) return false

    const busca = norm(filtros.busca)
    if (busca) {
      const texto = norm(`${r.cliente} ${r.informacao} ${r.sdr} ${r.closer} ${r.origem} ${r.status} ${r.servico}`)
      if (!texto.includes(busca)) return false
    }
    return true
  })

  const isPago = r => norm(r.status) === 'PAGO'
  const isDsvDso = r => ['DSV', 'DSO'].includes(norm(r.servico))
  const pipelineStatuses = ['FECHOU', 'PM', 'RECALL', 'CONTRATO', 'ASSINADO', 'FUP']
  const isPipeline = r => pipelineStatuses.includes(norm(r.status))
  const sum = (arr, key = 'valor') => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)

  const pagos = filtrados.filter(isPago)
  const pagosNmrr = pagos.filter(r => !isDsvDso(r))
  const dsvDso = pagos.filter(isDsvDso)
  const pipelineRows = filtrados.filter(isPipeline)
  const total = filtrados.length
  const nmrr = sum(pagosNmrr)
  const tkm = pagosNmrr.length ? nmrr / pagosNmrr.length : 0
  const taxa = total ? (pagos.length / total) * 100 : 0

  const countBy = (arr, key, fallback = 'SEM DADO') => {
    const mapa = {}
    arr.forEach(r => {
      const k = String(r[key] || fallback).trim() || fallback
      mapa[k] = (mapa[k] || 0) + 1
    })
    return Object.entries(mapa).sort((a,b)=>b[1]-a[1]).map(([nome,qtd])=>({ nome, qtd }))
  }

  const valueBy = (arr, key, fallback = 'SEM DADO') => {
    const mapa = {}
    arr.forEach(r => {
      const k = String(r[key] || fallback).trim() || fallback
      mapa[k] = (mapa[k] || 0) + (Number(r.valor) || 0)
    })
    return Object.entries(mapa).sort((a,b)=>b[1]-a[1]).map(([nome,valor])=>({ nome, valor }))
  }

  const pipelineByStatus = () => {
    const mapa = {}
    pipelineStatuses.forEach(s => { mapa[s] = { qtd: 0, valor: 0 } })
    pipelineRows.forEach(r => {
      const s = norm(r.status)
      if (!mapa[s]) mapa[s] = { qtd: 0, valor: 0 }
      mapa[s].qtd++
      mapa[s].valor += Number(r.valor) || 0
    })
    return Object.entries(mapa).filter(([,v]) => v.qtd > 0).map(([nome,v]) => ({ nome, qtd: v.qtd, valor: v.valor }))
  }

  const evolucao = () => {
    const mapa = {}
    filtrados.forEach(r => {
      const k = r.data || 'SEM DATA'
      mapa[k] = (mapa[k] || 0) + 1
    })
    return Object.entries(mapa).sort((a,b) => {
      const da = parseDate(a[0]); const db = parseDate(b[0])
      if (da && db) return da - db
      return a[0].localeCompare(b[0], 'pt-BR')
    }).map(([data, qtd]) => ({ data, qtd }))
  }

  const SelectFiltro = ({ label, value, onChange, options, allLabel = 'Todos' }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
      {label}
      <select value={value} onChange={e => onChange(e.target.value)} style={{ background: 'var(--bg-card)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12 }}>
        <option value={value.startsWith('TOD') ? value : (allLabel === 'Todas' ? 'TODAS' : 'TODOS')}>{allLabel}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )

  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados na aba REUNIOES_GERAL</div>

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Filtros — Dados Específicos</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <SelectFiltro label="Empresa" value={filtros.empresa} onChange={v=>setFiltro('empresa', v)} options={unique('empresa')} allLabel="Todas" />
          <SelectFiltro label="Mês" value={filtros.mes} onChange={v=>setFiltro('mes', v)} options={unique('mes')} />
          <SelectFiltro label="Ano" value={filtros.ano} onChange={v=>setFiltro('ano', v)} options={unique('ano')} />
          <SelectFiltro label="SDR" value={filtros.sdr} onChange={v=>setFiltro('sdr', v)} options={unique('sdr')} />
          <SelectFiltro label="Closer" value={filtros.closer} onChange={v=>setFiltro('closer', v)} options={unique('closer')} />
          <SelectFiltro label="Origem" value={filtros.origem} onChange={v=>setFiltro('origem', v)} options={unique('origem')} allLabel="Todas" />
          <SelectFiltro label="Status" value={filtros.status} onChange={v=>setFiltro('status', v)} options={unique('status')} />
          <SelectFiltro label="Serviço" value={filtros.servico} onChange={v=>setFiltro('servico', v)} options={unique('servico')} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>Data inicial
            <input type="date" value={filtros.dataIni} onChange={e=>setFiltro('dataIni', e.target.value)} style={{ background: 'var(--bg-card)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>Data final
            <input type="date" value={filtros.dataFim} onChange={e=>setFiltro('dataFim', e.target.value)} style={{ background: 'var(--bg-card)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12 }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', gridColumn: 'span 2' }}>Buscar cliente/informação
            <input value={filtros.busca} onChange={e=>setFiltro('busca', e.target.value)} placeholder="Digite um nome, origem, SDR..." style={{ background: 'var(--bg-card)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 10px', fontSize: 12 }} />
          </label>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Resumo filtrado</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div className="card"><div className="card-label">Total Reuniões</div><div className="card-value">{fmt(total)}</div></div>
        <div className="card green"><div className="card-label">Pagos</div><div className="card-value">{fmt(pagos.length)}</div><div className="card-sub">Taxa: {fmtPct(taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Pago Total</div><div className="card-value">{fmtR(sum(pagos))}</div></div>
        <div className="card amber"><div className="card-label">NMRR</div><div className="card-value">{fmtR(nmrr)}</div><div className="card-sub">TKM: {fmtR(tkm)}</div></div>
        <div className="card blue"><div className="card-label">DSV / DSO</div><div className="card-value">{fmtR(sum(dsvDso))}</div><div className="card-sub">{fmt(dsvDso.length)} contratos</div></div>
        <div className="card blue"><div className="card-label">FUP + PM</div><div className="card-value">{fmt(filtrados.filter(r => ['FUP','PM'].includes(norm(r.status))).length)}</div></div>
        <div className="card purple"><div className="card-label">Valor Pipeline</div><div className="card-value">{fmtR(sum(pipelineRows))}</div><div className="card-sub">{fmt(pipelineRows.length)} oportunidades</div></div>
        <div className="card red"><div className="card-label">Perdidos/Fugiram</div><div className="card-value">{fmt(filtrados.filter(r => ['FORA','FUGIU'].includes(norm(r.status))).length)}</div></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Gráficos filtrados</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="chart-card"><div className="chart-title">Status das Reuniões</div><PieChart data={countBy(filtrados, 'status')} /></div>
        <div className="chart-card"><div className="chart-title">Pipeline por Status</div><BarChart data={pipelineByStatus()} valueKey="qtd" colorArr={Object.values(STATUS_COLORS)} showPct extraValueKey="valor" formatExtraVal={v=>fmtR1(v)} /></div>
        <div className="chart-card"><div className="chart-title">Evolução por Data</div><LineChartWithTooltip data={evolucao()} color="#14b8a6" /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por SDR</div><BarChart data={countBy(filtrados, 'sdr')} valueKey="qtd" colorArr={SDR_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por SDR</div><BarChart data={valueBy(pagos, 'sdr')} valueKey="valor" colorArr={SDR_COLORS} formatVal={v=>fmtR1(v)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por Closer</div><BarChart data={valueBy(pagos, 'closer')} valueKey="valor" colorArr={CLOSER_COLORS} formatVal={v=>fmtR1(v)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por Origem</div><BarChart data={countBy(filtrados, 'origem')} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Pagos por Origem</div><BarChart data={countBy(pagos, 'origem')} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por Origem</div><BarChart data={valueBy(pagos, 'origem')} valueKey="valor" conceptColor formatVal={v=>fmtR1(v)} showPct /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Registros filtrados</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['Empresa','Mês','Ano','Origem','SDR','Closer','Data','Serviço','Cliente','Nota','Valor','Status','Data FUP'].map(h => (
                <th key={h} style={{ textAlign: h === 'Cliente' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.slice(0, 200).map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{r.empresa}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.mes}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.ano}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.origem}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.sdr}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.closer}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.data}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.servico}</td>
                <td style={{ padding: '9px 8px', textAlign: 'left', minWidth: 140 }}>{r.cliente}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{r.nota}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: '#f59e0b' }}>{fmtR(r.valor)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', color: STATUS_COLORS[norm(r.status)] || 'var(--text-secondary)', fontWeight: 600 }}>{r.status}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{r.dataFup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtrados.length > 200 && <div style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12 }}>Mostrando os primeiros 200 registros de {fmt(filtrados.length)} filtrados.</div>}
    </div>
  )
}


function MetasOrigemView({ performance, empresaSelecionada }) {
  const [filters, setFilters] = useState({ empresa: empresaSelecionada || 'TODOS', ano: 'TODOS', mes: 'TODOS', origem: 'TODOS' })

  useEffect(() => {
    if (empresaSelecionada) setFilters(f => ({ ...f, empresa: empresaSelecionada }))
  }, [empresaSelecionada])

  const norm = (v) => String(v || '').trim().toUpperCase()
  const list = Array.isArray(performance) ? performance : []
  const unique = (key) => [...new Set(list.map(r => norm(r[key])).filter(Boolean))].sort()
  const opts = {
    empresa: unique('empresa'),
    ano: unique('ano').sort((a,b)=>Number(b)-Number(a)),
    mes: unique('mes'),
    origem: unique('origem'),
  }

  const setFilter = (key, value) => setFilters(f => ({ ...f, [key]: value }))

  const filtrados = list.filter(r =>
    (filters.empresa === 'TODOS' || norm(r.empresa) === filters.empresa) &&
    (filters.ano === 'TODOS' || norm(r.ano) === filters.ano) &&
    (filters.mes === 'TODOS' || norm(r.mes) === filters.mes) &&
    (filters.origem === 'TODOS' || norm(r.origem) === filters.origem)
  )

  const temMeta = (r) =>
    (Number(r.metaReunioes) || 0) > 0 ||
    (Number(r.metaPagos) || 0) > 0 ||
    (Number(r.metaNmrr) || 0) > 0

  const filtradosComMeta = filtrados.filter(temMeta)
  const filtradosSemMeta = filtrados.filter(r => !temMeta(r))

  const sumFrom = (arr, key) => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
  const sum = (key) => sumFrom(filtradosComMeta, key)

  // Cards principais comparam apenas origens que possuem meta cadastrada.
  // Origens sem meta aparecem separadas como resultado adicional.
  const metaReunioes = sum('metaReunioes')
  const realReunioes = sum('realReunioes')
  const metaPagos = sum('metaPagos')
  const realPagos = sum('realPagos')
  const metaNmrr = sum('metaNmrr')
  const realNmrr = sum('realNmrr')

  const realReunioesAdicional = sumFrom(filtradosSemMeta, 'realReunioes')
  const realPagosAdicional = sumFrom(filtradosSemMeta, 'realPagos')
  const realNmrrAdicional = sumFrom(filtradosSemMeta, 'realNmrr')

  const pct = (real, meta) => meta > 0 ? (real / meta) * 100 : 0
  const pctReunioes = pct(realReunioes, metaReunioes)
  const pctPagos = pct(realPagos, metaPagos)
  const pctNmrr = pct(realNmrr, metaNmrr)
  const cardClass = (real, meta) => meta > 0 && real >= meta ? 'green' : 'red'
  const gapClass = (gap) => Number(gap || 0) >= 0 ? 'green' : 'red'

  const progressoContratos = [...filtradosComMeta]
    .filter(r => (Number(r.metaPagos) || 0) > 0)
    .sort((a, b) => (Number(b.pctPagos) || 0) - (Number(a.pctPagos) || 0))
    .map(r => ({
      nome: r.origem,
      pct: Number(r.pctPagos) || 0,
      realPagos: Number(r.realPagos) || 0,
      metaPagos: Number(r.metaPagos) || 0,
      realNmrr: Number(r.realNmrr) || 0,
      metaNmrr: Number(r.metaNmrr) || 0,
    }))

  const progressoNmrr = [...filtradosComMeta]
    .filter(r => (Number(r.metaNmrr) || 0) > 0)
    .sort((a, b) => (Number(b.pctNmrr) || 0) - (Number(a.pctNmrr) || 0))
    .map(r => ({
      nome: r.origem,
      pct: Number(r.pctNmrr) || 0,
      realPagos: Number(r.realPagos) || 0,
      metaPagos: Number(r.metaPagos) || 0,
      realNmrr: Number(r.realNmrr) || 0,
      metaNmrr: Number(r.metaNmrr) || 0,
    }))

  const adicionaisSemMeta = [...filtradosSemMeta]
    .filter(r => (Number(r.realReunioes) || 0) > 0 || (Number(r.realPagos) || 0) > 0 || (Number(r.realNmrr) || 0) > 0)
    .sort((a, b) => (Number(b.realNmrr) || 0) - (Number(a.realNmrr) || 0))
    .map(r => ({
      nome: r.origem,
      valor: Number(r.realNmrr) || 0,
      realReunioes: Number(r.realReunioes) || 0,
      realPagos: Number(r.realPagos) || 0,
      realNmrr: Number(r.realNmrr) || 0,
    }))

  if (!list.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de metas por origem. Atualize a aba PERFORMANCE_ORIGEM na planilha.</div>

  const Select = ({ label, value, options, onChange }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{ background: 'var(--bg-card)', color: '#e2e8f0', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', minWidth: 150 }}>
        <option value="TODOS">Todos</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Filtros — Metas por Origem</div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <Select label="Empresa" value={filters.empresa} options={opts.empresa} onChange={v=>setFilter('empresa', v)} />
        <Select label="Ano" value={filters.ano} options={opts.ano} onChange={v=>setFilter('ano', v)} />
        <Select label="Mês" value={filters.mes} options={opts.mes} onChange={v=>setFilter('mes', v)} />
        <Select label="Origem" value={filters.origem} options={opts.origem} onChange={v=>setFilter('origem', v)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div className={`card ${cardClass(realReunioes, metaReunioes)}`}><div className="card-label">Reuniões</div><div className="card-value">{fmtNum1(realReunioes)} / {fmtNum1(metaReunioes)}</div><div className="card-sub">{fmtPct(pctReunioes)} da meta</div></div>
        <div className={`card ${gapClass(realReunioes - metaReunioes)}`}><div className="card-label">Gap Reuniões</div><div className="card-value">{(realReunioes - metaReunioes) >= 0 ? '+' : ''}{fmtNum1(realReunioes - metaReunioes)}</div><div className="card-sub">real - meta</div></div>
        <div className={`card ${cardClass(realPagos, metaPagos)}`}><div className="card-label">Pagos</div><div className="card-value">{fmtNum1(realPagos)} / {fmtNum1(metaPagos)}</div><div className="card-sub">{fmtPct(pctPagos)} da meta</div></div>
        <div className={`card ${gapClass(realPagos - metaPagos)}`}><div className="card-label">Gap Pagos</div><div className="card-value">{(realPagos - metaPagos) >= 0 ? '+' : ''}{fmtNum1(realPagos - metaPagos)}</div><div className="card-sub">real - meta</div></div>
        <div className={`card ${cardClass(realNmrr, metaNmrr)}`}><div className="card-label">NMRR</div><div className="card-value">{fmtR1(realNmrr)}</div><div className="card-sub">Meta: {fmtR1(metaNmrr)} · {fmtPct(pctNmrr)}</div></div>
        <div className={`card ${gapClass(realNmrr - metaNmrr)}`}><div className="card-label">Gap NMRR</div><div className="card-value">{fmtR1(realNmrr - metaNmrr)}</div><div className="card-sub">real - meta</div></div>
        <div className="card blue"><div className="card-label">Adicional sem Meta</div><div className="card-value">{fmtR1(realNmrrAdicional)}</div><div className="card-sub">{fmtNum1(realReunioesAdicional)} reuniões · {fmtNum1(realPagosAdicional)} pagos</div></div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
        Os gráficos abaixo mostram o progresso real contra a meta. Exemplo: SS → 1 - R$ 2.000,0 - 20,0% significa 1 contrato pago, R$ 2.000,0 de NMRR e 20,0% da meta batida.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="chart-card"><div className="chart-title">Progresso de Contratos por Origem</div>
          <BarChart data={progressoContratos} valueKey="pct" conceptColor formatVal={(v,d)=>`${fmtNum1(d.realPagos)} - ${fmtR1(d.realNmrr)} - ${fmtPct(v)}`} /></div>
        <div className="chart-card"><div className="chart-title">Progresso de NMRR por Origem</div>
          <BarChart data={progressoNmrr} valueKey="pct" conceptColor formatVal={(v,d)=>`${fmtNum1(d.realPagos)} - ${fmtR1(d.realNmrr)} - ${fmtPct(v)}`} /></div>
        <div className="chart-card"><div className="chart-title">Adicionais sem Meta</div>
          <BarChart data={adicionaisSemMeta} valueKey="valor" conceptColor formatVal={(v,d)=>`${fmtNum1(d.realPagos)} - ${fmtR1(d.realNmrr)} - sem meta`} /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Detalhamento por Origem</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{['Empresa','Ano','Mês','Origem','Meta Reuniões','Real Reuniões','Gap','%','Meta Pagos','Real Pagos','Gap','%','Meta NMRR','Real NMRR','Gap','%'].map((h, i) => <th key={i} style={{ textAlign: i < 4 ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtrados.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '9px 8px' }}>{r.empresa}</td><td style={{ padding: '9px 8px' }}>{r.ano}</td><td style={{ padding: '9px 8px' }}>{r.mes}</td><td style={{ padding: '9px 8px', fontWeight: 600 }}>{r.origem}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtNum1(r.metaReunioes)}</td><td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtNum1(r.realReunioes)}</td><td style={{ padding: '9px 8px', textAlign: 'right', color: Number(r.gapReunioes) >= 0 ? '#10b981' : '#ef4444' }}>{Number(r.gapReunioes) >= 0 ? '+' : ''}{fmtNum1(r.gapReunioes)}</td><td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtPct(r.pctReunioes)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtNum1(r.metaPagos)}</td><td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtNum1(r.realPagos)}</td><td style={{ padding: '9px 8px', textAlign: 'right', color: Number(r.gapPagos) >= 0 ? '#10b981' : '#ef4444' }}>{Number(r.gapPagos) >= 0 ? '+' : ''}{fmtNum1(r.gapPagos)}</td><td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtPct(r.pctPagos)}</td>
                <td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtR1(r.metaNmrr)}</td><td style={{ padding: '9px 8px', textAlign: 'right', color: '#f59e0b' }}>{fmtR1(r.realNmrr)}</td><td style={{ padding: '9px 8px', textAlign: 'right', color: Number(r.gapNmrr) >= 0 ? '#10b981' : '#ef4444' }}>{fmtR1(r.gapNmrr)}</td><td style={{ padding: '9px 8px', textAlign: 'right' }}>{fmtPct(r.pctNmrr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ForecastView({ forecast }) {
  const [mesSel, setMesSel] = useState(null)

  if (!forecast || forecast.length === 0) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de forecast</div>
  )

  const dados = mesSel ? forecast.filter(f => f.mes === mesSel) : forecast
  const gapIsPositive = (v) => Number(v || 0) < 0
  const gapCardClass = (v) => gapIsPositive(v) ? 'green' : 'red'
  const gapSub = (v, label = 'da meta') => gapIsPositive(v) ? `✓ Acima ${label}` : `⚠ Abaixo ${label}`
  const signedNumber = (v) => `${Number(v || 0) > 0 ? '+' : ''}${fmtNum1(v)}`

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Filtrar:</span>
        <button onClick={() => setMesSel(null)}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: 12, cursor: 'pointer',
            background: mesSel === null ? 'rgba(255,255,255,0.12)' : 'transparent',
            borderColor: mesSel === null ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
            color: mesSel === null ? '#e2e8f0' : '#94a3b8' }}>
          Todos os meses
        </button>
        {forecast.map(f => (
          <button key={f.mes} onClick={() => setMesSel(f.mes)}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid', fontSize: 12, cursor: 'pointer',
              background: mesSel === f.mes ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderColor: mesSel === f.mes ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              color: mesSel === f.mes ? '#e2e8f0' : '#94a3b8' }}>
            {f.mes}
          </button>
        ))}
      </div>

      {dados.map((f, idx) => {
        const hasMeta = Number(f.meta || 0) > 0
        const mrrAbaixoDaMeta = hasMeta && Number(f.mrrPago || 0) < Number(f.meta || 0)
        return (
          <div key={idx} style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 14, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>{f.mes} 2026</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div className="card blue">
                <div className="card-label">Meta</div>
                <div className="card-value">{fmtR1(f.meta)}</div>
                <div className="card-sub">meta do mês</div>
              </div>
              <div className={`card ${mrrAbaixoDaMeta ? 'red' : 'green'}`}>
                <div className="card-label">MRR Pago Projetado</div>
                <div className="card-value">{fmtR1(f.mrrPago)}</div>
                <div className="card-sub">{fmtPct(f.pctPago)} da meta {mrrAbaixoDaMeta ? '⚠ abaixo' : '✓ acima'}</div>
              </div>
              <div className={`card ${gapCardClass(f.gapPago)}`}>
                <div className="card-label">Gap Pago</div>
                <div className="card-value">{fmtR1(f.gapPago)}</div>
                <div className="card-sub">{gapSub(f.gapPago)}</div>
              </div>
              <div className="card amber">
                <div className="card-label">Projeção Vendido</div>
                <div className="card-value">{fmtR1(f.projecaoVendido)}</div>
                <div className="card-sub">{fmtPct(f.pctVendido)} do projetado</div>
              </div>
              <div className={`card ${gapCardClass(f.gapNmrr)}`}>
                <div className="card-label">Gap NMRR</div>
                <div className="card-value">{fmtR1(f.gapNmrr)}</div>
                <div className="card-sub">{gapSub(f.gapNmrr)}</div>
              </div>
              <div className={`card ${gapCardClass(f.gapContratos)}`}>
                <div className="card-label">Gap Contratos</div>
                <div className="card-value">{signedNumber(f.gapContratos)}</div>
                <div className="card-sub">{gapSub(f.gapContratos, 'vs meta')}</div>
              </div>
              <div className={`card ${gapCardClass(f.gapRlzd)}`}>
                <div className="card-label">Gap Realizadas</div>
                <div className="card-value">{signedNumber(f.gapRlzd)}</div>
                <div className="card-sub">{gapSub(f.gapRlzd, 'vs meta')}</div>
              </div>
              <div className={`card ${gapCardClass(f.gapAgd)}`}>
                <div className="card-label">Gap Agendadas</div>
                <div className="card-value">{signedNumber(f.gapAgd)}</div>
                <div className="card-sub">{gapSub(f.gapAgd, 'vs meta')}</div>
              </div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Metas Diárias</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <div className="card blue">
                <div className="card-label">Meta Dia — Pago</div>
                <div className="card-value">{fmtR1(f.metaDiaPago)}</div>
              </div>
              <div className="card">
                <div className="card-label">Meta Dia — Agend.</div>
                <div className="card-value">{fmtNum1(f.metaAgdDia)}</div>
              </div>
              <div className="card">
                <div className="card-label">Meta Dia — Realiz.</div>
                <div className="card-value">{fmtNum1(f.metaRlzdDia)}</div>
              </div>
              <div className="card purple">
                <div className="card-label">Meta Dia — Contratos</div>
                <div className="card-value">{fmtNum1(f.metaContPagoDia)}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [empresa, setEmpresa] = useState('AI')
  const [periodo, setPeriodo] = useState(null)

  useEffect(() => {
    fetch('/api/data').then(r=>r.json()).then(d=>{setData(d);setLoading(false)}).catch(e=>{setError(e.message);setLoading(false)})
  }, [])

  useEffect(() => {
    if (data && !periodo) {
      const primeiroPeriodo = data?.PERIODOS?.[0]?.key
      setPeriodo(primeiroPeriodo || 'DADOS')
    }
  }, [data, periodo])

  useEffect(() => {
    const empresas = data?.CONFIG?.empresas || []
    if (empresas.length && !empresas.some(e => e.codigo === empresa)) {
      setEmpresa(empresas[0].codigo)
    }
  }, [data, empresa])

  const empresasConfig = data?.CONFIG?.empresas || [['AI','Acelera Imob'],['MO','Mundo Ótico']].map(([codigo,nome]) => ({ codigo, nome }))
  const dashboardNome = data?.CONFIG?.dashboardNome || 'AGC Dashboard'
  const currentData = data ? data[empresa] : null
  const periodosDinamicos = data?.PERIODOS || []
  const periodoData = currentData && periodo && !['SEMANAS','FORECAST','DADOS','METAS_ORIGEM'].includes(periodo) ? currentData[periodo] : null

  return (
    <>
      <Head><title>{dashboardNome}</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <nav className="nav">
        <div className="nav-logo">📊 {dashboardNome}</div>
        <div className="nav-tabs">
          {empresasConfig.map(({codigo,nome})=>(
            <button key={codigo} className={`nav-tab ${empresa===codigo?'active':''}`} onClick={()=>setEmpresa(codigo)}>{nome}</button>
          ))}
        </div>
      </nav>
      <div className="sub-nav">
        {[...periodosDinamicos.map(p => [p.key, p.label]), ['SEMANAS','Por Semana'], ['FORECAST','Forecast'], ['DADOS','Dados Específicos'], ['METAS_ORIGEM','Metas por Origem']].map(([p,label])=>(
          <button key={p} className={`sub-tab ${periodo===p?'active':''}`} onClick={()=>setPeriodo(p)}>{label}</button>
        ))}
      </div>
      {loading && <div className="loading">Carregando dados...</div>}
      {error && <div className="error">Erro ao carregar: {error}</div>}
      {!loading && !error && data && (
        <div className="page">
          {periodo==='SEMANAS' ? <SemanasComparativo semanas={currentData?.SEMANAS} /> :
           periodo==='FORECAST' ? <ForecastView forecast={currentData?.FORECAST} /> :
           periodo==='DADOS' ? <DadosEspecificosView registros={data?.GERAL} /> :
           periodo==='METAS_ORIGEM' ? <MetasOrigemView performance={data?.PERFORMANCE_ORIGEM} empresaSelecionada={empresa} /> :
           periodoData ? <>
             <MetricCards metricas={periodoData.metricas} />
             <ReuniaoCards cards={periodoData.reunioes?.cards} />
             <ReuniaoGraficos graficos={periodoData.reunioes?.graficos} />
           </> : <div className="loading">Sem dados para este período</div>}
        </div>
      )}
    </>
  )
}
