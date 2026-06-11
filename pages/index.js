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

const CONCEPT_COLORS = {
  'IB': '#3b82f6',
  'SS': '#10b981',
  'REC. BASE': '#8b5cf6',
  'INDICAÇÃO': '#f59e0b',
  'MQL': '#14b8a6',
  'LIVE': '#ec4899',
  'API': '#f97316',
  'CHURN': '#ef4444',
  'RECUP': '#6366f1',
  'INDIC': '#f59e0b',
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
            <div style={{ flex: 1, background: 'var(--bar-track)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
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


function ProgressByOriginChart({ data, emptyLabel = 'Sem dados' }) {
  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>{emptyLabel}</div>
  }
  return (
    <div>
      {data.slice(0, 12).map((d, i) => {
        const pct = Number(d.pct) || 0
        const barPct = Math.max(0, Math.min(pct, 100))
        const color = getConceptColor(d.nome, CLOSER_COLORS, i)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 86, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.nome}>{d.nome}</div>
            <div style={{ flex: '0 1 68%', background: 'var(--bar-track)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.85, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 120, textAlign: 'right', flexShrink: 0, lineHeight: 1.25 }}>
              <div>{fmtNum1(d.realPagos)} - {fmtR1(d.realNmrr)}</div>
              <div>{fmtPct(pct)}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AdditionalOriginChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem adicionais sem meta</div>
  }
  const max = Math.max(...data.map(d => Number(d.realNmrr) || 0), 1)
  return (
    <div>
      {data.slice(0, 12).map((d, i) => {
        const val = Number(d.realNmrr) || 0
        const barPct = max > 0 ? (val / max) * 100 : 0
        const color = getConceptColor(d.nome, CLOSER_COLORS, i)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 86, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.nome}>{d.nome}</div>
            <div style={{ flex: '0 1 68%', background: 'var(--bar-track)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.85, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', width: 120, textAlign: 'right', flexShrink: 0, lineHeight: 1.25 }}>
              <div>{fmtNum1(d.realPagos)} - {fmtR1(d.realNmrr)}</div>
              <div>sem meta</div>
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
      <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, flexShrink: 0 }} className="pie-chart-svg">
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} strokeWidth="1" />)}
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
            onMouseEnter={() => setTooltip({ x: p.x, y: p.y, label: p.data.data, qtd: p.data.qtd })}
            onMouseLeave={() => setTooltip(null)} />
        ))}
      </svg>
      {tooltip && (
        <div className="tooltip-box" style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="tooltip-label">{tooltip.label}</div>
          <div className="tooltip-value">{tooltip.qtd} reuniões</div>
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
        <div className="tooltip-box" style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="tooltip-label">{tooltip.semana}</div>
          <div className="tooltip-value">{isReais ? fmtR(tooltip.val) : fmt(tooltip.val)}</div>
        </div>
      )}
    </div>
  )
}

function SemanasComparativo({ semanas }) {
  const [metrica, setMetrica] = useState('contratosPagos')
  if (!semanas || semanas.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de semanas</div>

  const monthMeta = {
    JAN: { label: 'Janeiro', order: 1 }, FEV: { label: 'Fevereiro', order: 2 }, MAR: { label: 'Março', order: 3 },
    ABR: { label: 'Abril', order: 4 }, MAI: { label: 'Maio', order: 5 }, JUN: { label: 'Junho', order: 6 },
    JUL: { label: 'Julho', order: 7 }, AGO: { label: 'Agosto', order: 8 }, SET: { label: 'Setembro', order: 9 },
    OUT: { label: 'Outubro', order: 10 }, NOV: { label: 'Novembro', order: 11 }, DEZ: { label: 'Dezembro', order: 12 },
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
    key, dados, label: monthMeta[key]?.label || key, order: monthMeta[key]?.order || 99,
  })).sort((a, b) => a.order - b.order)

  const metricaOpts = [
    { key: 'leads', label: 'Leads' }, { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'realizadas', label: 'Realizadas' }, { key: 'contratosPagos', label: 'Contratos' },
    { key: 'nmrr', label: 'NMRR' }, { key: 'tkm', label: 'TKM' },
  ]
  const chartColors = ['#8b5cf6','#14b8a6','#3b82f6','#f59e0b','#ec4899','#f97316','#6366f1']

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
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
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
              background: metrica === m.key ? 'rgba(99,102,241,0.15)' : 'transparent',
              borderColor: metrica === m.key ? 'rgba(99,102,241,0.4)' : 'var(--border)',
              color: metrica === m.key ? 'var(--text-primary)' : 'var(--text-muted)' }}>
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

  const norm = (v) => String(v || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  const canonical = (key, value) => {
    const v = norm(value)
    if (!v) return ''
    if (key === 'origem') {
      if (['MQL', 'F/MQL', 'FMQL', 'F MQL'].includes(v)) return 'IB'
      if (['RECUP', 'RECUPERACAO', 'MES PAS', 'MES PASSADO'].includes(v)) return 'RECUPERACAO'
      if (['INDIC', 'INDICACAO'].includes(v)) return 'INDICACAO'
    }
    if (key === 'status') {
      if (['CONTRATOS', 'EM CONTRATO', 'CLIENTE EM CONTRATO'].includes(v)) return 'CONTRATO'
      if (['PAGO', 'PAGOS'].includes(v)) return 'PAGO'
      if (['FORA', 'PERDIDO', 'PERDIDOS'].includes(v)) return 'FORA'
    }
    return v
  }

  const matchFiltro = (key, rowValue, filtroValue, allValues = ['TODOS']) => {
    if (allValues.includes(filtroValue)) return true
    const r = canonical(key, rowValue)
    const f = canonical(key, filtroValue)
    if (!f) return true
    if (!r) return false
    return r === f || r.includes(f) || f.includes(r)
  }
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
    if (!matchFiltro('empresa', r.empresa, filtros.empresa, ['TODAS'])) return false
    if (!matchFiltro('mes', r.mes, filtros.mes, ['TODOS'])) return false
    if (filtros.ano !== 'TODOS' && String(r.ano || '').trim() !== String(filtros.ano || '').trim()) return false
    if (!matchFiltro('sdr', r.sdr, filtros.sdr, ['TODOS'])) return false
    if (!matchFiltro('closer', r.closer, filtros.closer, ['TODOS'])) return false
    if (!matchFiltro('origem', r.origem, filtros.origem, ['TODAS'])) return false
    if (!matchFiltro('status', r.status, filtros.status, ['TODOS'])) return false
    if (!matchFiltro('servico', r.servico, filtros.servico, ['TODOS'])) return false
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

  const SelectFiltro = ({ label, value, onChange, options, allLabel = 'Todos' }) => {
    const allValue = allLabel === 'Todas' ? 'TODAS' : 'TODOS'
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
        {label}
        <select value={value} onChange={e => onChange(e.target.value)} className="field-input">
          <option value={allValue}>{allLabel}</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
    )
  }

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
            <input type="date" value={filtros.dataIni} onChange={e=>setFiltro('dataIni', e.target.value)} className="field-input" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>Data final
            <input type="date" value={filtros.dataFim} onChange={e=>setFiltro('dataFim', e.target.value)} className="field-input" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', gridColumn: 'span 2' }}>Buscar cliente/informação
            <input value={filtros.busca} onChange={e=>setFiltro('busca', e.target.value)} placeholder="Digite um nome, origem, SDR..." className="field-input" />
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
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
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

  const clean = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const norm = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const canonical = (key, value) => {
    const v = norm(value)
    if (!v) return ''
    if (key === 'origem') {
      if (['MQL', 'F/MQL', 'FMQL', 'F MQL'].includes(v)) return 'IB'
      if (['RECUP', 'RECUPERACAO', 'MES PAS', 'MES PASSADO'].includes(v)) return 'RECUPERACAO'
      if (['INDIC', 'INDICACAO'].includes(v)) return 'INDICACAO'
    }
    if (key === 'status') {
      if (['CONTRATOS', 'EM CONTRATO', 'CLIENTE EM CONTRATO'].includes(v)) return 'CONTRATO'
      if (['PAGO', 'PAGOS'].includes(v)) return 'PAGO'
      if (['FORA', 'PERDIDO', 'PERDIDOS'].includes(v)) return 'FORA'
    }
    return v
  }

  const normalizarOrigem = (v) => {
    const o = clean(v)
    if (!o) return 'SEM ORIGEM'
    if (['MQL', 'F/MQL', 'FMQL', 'F MQL'].includes(o)) return 'IB'
    if (['RECUP', 'RECUPERACAO', 'MES PAS', 'MES PASSADO'].includes(o)) return 'RECUPERAÇÃO'
    if (['INDIC', 'INDICACAO'].includes(o)) return 'INDICAÇÃO'
    return norm(v)
  }

  const rawList = Array.isArray(performance) ? performance : []
  const list = Object.values(rawList.reduce((acc, r) => {
    const empresa = norm(r.empresa)
    const ano = String(r.ano || '').trim()
    const mes = norm(r.mes)
    const origem = normalizarOrigem(r.origem)
    if (!empresa || !ano || !mes || !origem) return acc
    const key = `${empresa}|${ano}|${mes}|${origem}`
    if (!acc[key]) {
      acc[key] = { empresa, ano, mes, origem, metaReunioes: 0, realReunioes: 0, metaPagos: 0, realPagos: 0, metaNmrr: 0, realNmrr: 0 }
    }
    acc[key].metaReunioes += Number(r.metaReunioes) || 0
    acc[key].realReunioes += Number(r.realReunioes) || 0
    acc[key].metaPagos += Number(r.metaPagos) || 0
    acc[key].realPagos += Number(r.realPagos) || 0
    acc[key].metaNmrr += Number(r.metaNmrr) || 0
    acc[key].realNmrr += Number(r.realNmrr) || 0
    return acc
  }, {})).map(r => ({
    ...r,
    gapReunioes: r.realReunioes - r.metaReunioes,
    pctReunioes: r.metaReunioes > 0 ? (r.realReunioes / r.metaReunioes) * 100 : 0,
    gapPagos: r.realPagos - r.metaPagos,
    pctPagos: r.metaPagos > 0 ? (r.realPagos / r.metaPagos) * 100 : 0,
    gapNmrr: r.realNmrr - r.metaNmrr,
    pctNmrr: r.metaNmrr > 0 ? (r.realNmrr / r.metaNmrr) * 100 : 0,
  }))

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
    (Number(r.metaReunioes) || 0) > 0 || (Number(r.metaPagos) || 0) > 0 || (Number(r.metaNmrr) || 0) > 0

  const filtradosComMeta = filtrados.filter(temMeta)
  const filtradosSemMeta = filtrados.filter(r => !temMeta(r))

  const sumFrom = (arr, key) => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0)
  const sum = (key) => sumFrom(filtradosComMeta, key)

  const metaReunioes = sum('metaReunioes'), realReunioes = sum('realReunioes')
  const metaPagos = sum('metaPagos'), realPagos = sum('realPagos')
  const metaNmrr = sum('metaNmrr'), realNmrr = sum('realNmrr')
  const realReunioesAdicional = sumFrom(filtradosSemMeta, 'realReunioes')
  const realPagosAdicional = sumFrom(filtradosSemMeta, 'realPagos')
  const realNmrrAdicional = sumFrom(filtradosSemMeta, 'realNmrr')

  const pct = (real, meta) => meta > 0 ? (real / meta) * 100 : 0
  const pctReunioes = pct(realReunioes, metaReunioes)
  const pctPagos = pct(realPagos, metaPagos)
  const pctNmrr = pct(realNmrr, metaNmrr)
  const cardClass = (real, meta) => meta > 0 && real >= meta ? 'green' : 'red'
  const gapClass = (gap) => Number(gap || 0) >= 0 ? 'green' : 'red'

  const progressoOrigem = [...filtradosComMeta]
    .filter(r => (Number(r.metaNmrr) || 0) > 0 || (Number(r.metaPagos) || 0) > 0)
    .sort((a, b) => (Number(b.pctNmrr) || 0) - (Number(a.pctNmrr) || 0))
    .map(r => ({ nome: r.origem, pct: Number(r.pctNmrr) || 0, pctPagos: Number(r.pctPagos) || 0, realPagos: Number(r.realPagos) || 0, metaPagos: Number(r.metaPagos) || 0, realNmrr: Number(r.realNmrr) || 0, metaNmrr: Number(r.metaNmrr) || 0 }))

  const adicionaisSemMeta = [...filtradosSemMeta]
    .filter(r => (Number(r.realReunioes) || 0) > 0 || (Number(r.realPagos) || 0) > 0 || (Number(r.realNmrr) || 0) > 0)
    .sort((a, b) => (Number(b.realNmrr) || 0) - (Number(a.realNmrr) || 0))
    .map(r => ({ nome: r.origem, valor: Number(r.realNmrr) || 0, realReunioes: Number(r.realReunioes) || 0, realPagos: Number(r.realPagos) || 0, realNmrr: Number(r.realNmrr) || 0 }))

  if (!list.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de metas por origem. Atualize a aba PERFORMANCE_ORIGEM na planilha.</div>

  const Select = ({ label, value, options, onChange }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
      <select value={value} onChange={e=>onChange(e.target.value)} className="field-input" style={{ minWidth: 150 }}>
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
        O gráfico abaixo mostra o progresso real por origem. Exemplo: SS → 1 - R$ 2.000,0 / 20,0% significa 1 contrato pago, R$ 2.000,0 de NMRR e 20,0% da meta de NMRR batida.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16, marginBottom: 28 }}>
        <div className="chart-card"><div className="chart-title">Progresso por Origem</div><ProgressByOriginChart data={progressoOrigem} /></div>
        <div className="chart-card"><div className="chart-title">Adicionais sem Meta</div><AdditionalOriginChart data={adicionaisSemMeta} /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Detalhamento por Origem</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr>{['Empresa','Ano','Mês','Origem','Meta Reuniões','Real Reuniões','Gap','%','Meta Pagos','Real Pagos','Gap','%','Meta NMRR','Real NMRR','Gap','%'].map((h, i) => <th key={i} style={{ textAlign: i < 4 ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
          <tbody>
            {filtrados.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
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


function monthNumberFromName(mes) {
  const key = String(mes || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const map = { JANEIRO:1, FEVEREIRO:2, MARCO:3, ABRIL:4, MAIO:5, JUNHO:6, JULHO:7, AGOSTO:8, SETEMBRO:9, OUTUBRO:10, NOVEMBRO:11, DEZEMBRO:12 }
  return map[key] || 1
}

function daysInMonth(ano, mes) {
  return new Date(Number(ano || new Date().getFullYear()), monthNumberFromName(mes), 0).getDate()
}

function dayFromDate(value) {
  if (!value) return null
  if (value instanceof Date && !isNaN(value)) return value.getDate()
  const s = String(value).trim()
  const matchBR = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (matchBR) return Math.max(1, Math.min(31, Number(matchBR[1]) || 1))
  const matchISO = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
  if (matchISO) return Math.max(1, Math.min(31, Number(matchISO[3]) || 1))
  return null
}

function isOperationalDay(ano, mes, dia) {
  const dt = new Date(Number(ano), monthNumberFromName(mes) - 1, Number(dia))
  return dt.getDay() !== 0
}

function countOperationalDays({ ano, mes, start = 1, end }) {
  const totalDias = daysInMonth(ano, mes)
  const ini = Math.max(1, Number(start) || 1)
  const fim = Math.min(totalDias, Number(end) || totalDias)
  let total = 0
  for (let d = ini; d <= fim; d++) {
    if (isOperationalDay(ano, mes, d)) total++
  }
  return total
}

function isCurrentSelectedMonth(ano, mes) {
  const today = new Date()
  return Number(ano) === today.getFullYear() && monthNumberFromName(mes) === today.getMonth() + 1
}

function buildDailyForecast({ registros, empresa, mes, ano, tipo, nome, meta, supermeta }) {
  const totalDias = daysInMonth(ano, mes)
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1)
  const porDia = Object.fromEntries(dias.map(d => [d, 0]))
  const tipoNorm = String(tipo || 'GERAL').toUpperCase()
  const nomeNorm = String(nome || '').toUpperCase()
  const empresaNorm = String(empresa || '').toUpperCase()
  const mesNorm = String(mes || '').toUpperCase()
  const anoNorm = String(ano || '')

  ;(registros || []).forEach(r => {
    if (String(r.empresa || '').toUpperCase() !== empresaNorm) return
    if (String(r.mes || '').toUpperCase() !== mesNorm) return
    if (String(r.ano || '') !== anoNorm) return

    const status = String(r.status || '').toUpperCase().trim()
    const dia = dayFromDate(r.data)
    if (!dia || dia > totalDias) return

    if (tipoNorm === 'SDR') {
      if (String(r.sdr || '').toUpperCase().trim() !== nomeNorm) return
      porDia[dia] += 1
      return
    }

    if (tipoNorm === 'CLOSER') {
      if (String(r.closer || '').toUpperCase().trim() !== nomeNorm) return
      if (status !== 'PAGO') return
      porDia[dia] += Number(r.valor) || 0
      return
    }

    if (status !== 'PAGO') return
    porDia[dia] += Number(r.valor) || 0
  })

  let acumulado = 0
  let ultimoDiaComDado = 0
  const real = dias.map(d => {
    acumulado += Number(porDia[d]) || 0
    if ((Number(porDia[d]) || 0) > 0) ultimoDiaComDado = d
    return { dia: d, valor: acumulado }
  })

  const today = new Date()
  const mesAtual = isCurrentSelectedMonth(ano, mes)
  const cutoffDia = mesAtual
    ? Math.min(today.getDate(), totalDias)
    : (ultimoDiaComDado ? totalDias : 1)

  const realizado = acumulado
  const metaNum = Number(meta) || 0
  const superNum = Number(supermeta) || 0
  const diasOperacionaisMes = countOperationalDays({ ano, mes, start: 1, end: totalDias })
  const diasOperacionaisDecorridos = countOperationalDays({ ano, mes, start: 1, end: cutoffDia })
  const diasOperacionaisRestantes = mesAtual
    ? countOperationalDays({ ano, mes, start: cutoffDia + 1, end: totalDias })
    : 0

  const mediaDia = diasOperacionaisDecorridos > 0 ? realizado / diasOperacionaisDecorridos : 0
  const previsaoFinal = mesAtual ? realizado + (mediaDia * diasOperacionaisRestantes) : realizado

  const operationalCountUntil = (dia) => countOperationalDays({ ano, mes, start: 1, end: dia })
  const operationalCountBetween = (start, end) => countOperationalDays({ ano, mes, start, end })

  return {
    dias, totalDias, realizado, meta: metaNum, supermeta: superNum,
    pctMeta: metaNum > 0 ? (realizado / metaNum) * 100 : 0,
    previsaoFinal, mediaDia, cutoffDia, ultimoDiaComDado,
    diasOperacionaisMes, diasOperacionaisDecorridos, diasOperacionaisRestantes,
    real,
    metaLine: dias.map(d => ({ dia: d, valor: diasOperacionaisMes > 0 ? (metaNum / diasOperacionaisMes) * operationalCountUntil(d) : 0 })),
    superLine: dias.map(d => ({ dia: d, valor: diasOperacionaisMes > 0 ? (superNum / diasOperacionaisMes) * operationalCountUntil(d) : 0 })),
    previsaoLine: dias.map(d => {
      if (d <= cutoffDia) return { dia: d, valor: real[d - 1]?.valor || 0 }
      return { dia: d, valor: realizado + (mediaDia * operationalCountBetween(cutoffDia + 1, d)) }
    }),
  }
}

// ── Forecast chart with hover tooltips on last points ─────────
function ForecastCurveChart({ dados, tipo }) {
  const [tooltip, setTooltip] = useState(null)

  if (!dados) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Sem dados</div>

  const w = 720, h = 260, padX = 34, padY = 22
  const allVals = [
    ...dados.real.map(p => p.valor),
    ...dados.metaLine.map(p => p.valor),
    ...dados.superLine.map(p => p.valor),
    ...dados.previsaoLine.map(p => p.valor),
  ]
  const max = Math.max(...allVals, 1)
  const xPos = (dia) => padX + ((dia - 1) / Math.max(dados.totalDias - 1, 1)) * (w - padX * 2)
  const yPos = (valor) => h - padY - (valor / max) * (h - padY * 2)
  const line = (arr) => arr.map(p => `${xPos(p.dia)},${yPos(p.valor)}`).join(' ')
  const fmtAxis = tipo === 'SDR' ? fmtNum1 : fmtR1
  const fmtVal = tipo === 'SDR' ? fmtNum1 : fmtR

  // Find last meaningful data point for each series
  const realPoints = dados.real.filter(p => p.valor > 0)
  const lastReal = realPoints[realPoints.length - 1]
  const lastMeta = dados.metaLine[dados.metaLine.length - 1]
  const lastSuper = dados.supermeta > 0 ? dados.superLine[dados.superLine.length - 1] : null
  const lastPrevisao = dados.previsaoLine[dados.previsaoLine.length - 1]

  const endPoints = [
    lastReal && { key: 'real', label: 'Realizado', color: '#ef4444', last: lastReal },
    { key: 'meta', label: 'Meta', color: '#8b5cf6', last: lastMeta },
    lastSuper && { key: 'super', label: 'Supermeta', color: '#f59e0b', last: lastSuper },
    lastPrevisao && { key: 'prev', label: 'Previsão', color: '#94a3b8', last: lastPrevisao },
  ].filter(Boolean)

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 280 }} preserveAspectRatio="none">
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <g key={i}>
            <line x1={padX} x2={w-padX} y1={padY + g*(h-padY*2)} y2={padY + g*(h-padY*2)} stroke="rgba(148,163,184,0.15)" />
            <text x="4" y={padY + g*(h-padY*2) + 4} fill="#94a3b8" fontSize="10">{fmtAxis(max * (1-g))}</text>
          </g>
        ))}

        {/* Lines */}
        <polyline points={line(dados.metaLine)} fill="none" stroke="#8b5cf6" strokeWidth="2" />
        {dados.supermeta > 0 && <polyline points={line(dados.superLine)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="5 5" />}
        <polyline points={line(dados.previsaoLine)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 6" />
        <polyline points={line(dados.real)} fill="none" stroke="#ef4444" strokeWidth="3" />

        {/* Regular real dots (excluding last) */}
        {realPoints.map((p, i) => i < realPoints.length - 1 && (
          <circle key={i} cx={xPos(p.dia)} cy={yPos(p.valor)} r="3" fill="#ef4444" />
        ))}

        {/* Last-point markers with hover for all series */}
        {endPoints.map((s) => {
          const cx = xPos(s.last.dia)
          const cy = yPos(s.last.valor)
          const isHovered = tooltip?.key === s.key
          return (
            <g key={s.key}>
              <circle cx={cx} cy={cy} r={isHovered ? 9 : 7} fill="none" stroke={s.color} strokeWidth="1.5" opacity={isHovered ? 0.8 : 0.45} />
              <circle cx={cx} cy={cy} r={isHovered ? 6 : 5} fill={s.color}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ key: s.key, label: s.label, valor: s.last.valor, color: s.color })}
                onMouseLeave={() => setTooltip(null)}
              />
            </g>
          )
        })}

        {/* Day labels */}
        {[1, 5, 10, 15, 20, 25, dados.totalDias].filter((d, i, arr) => d <= dados.totalDias && arr.indexOf(d) === i).map(d => (
          <text key={d} x={xPos(d)} y={h-4} fill="#94a3b8" fontSize="10" textAnchor="middle">{d}</text>
        ))}
      </svg>

      {/* Tooltip shown top-right when hovering a last point */}
      {tooltip && (
        <div className="tooltip-box" style={{ position: 'absolute', top: 8, right: 8, borderLeft: `3px solid ${tooltip.color}` }}>
          <div className="tooltip-label">{tooltip.label} — valor final</div>
          <div className="tooltip-value" style={{ color: tooltip.color }}>{fmtVal(tooltip.valor)}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
        <span><b style={{ color: '#ef4444' }}>●</b> Realizado</span>
        <span><b style={{ color: '#8b5cf6' }}>—</b> Meta</span>
        <span><b style={{ color: '#f59e0b' }}>--</b> Supermeta</span>
        <span><b style={{ color: '#94a3b8' }}>--</b> Previsão</span>
      </div>
    </div>
  )
}

// ── Forecast view with month dropdown ─────────────────────────
function ForecastView({ forecast, forecastEquipe = [], registros = [], empresaSelecionada = 'AI' }) {
  const [mesSel, setMesSel] = useState(null)
  const [tipoVisao, setTipoVisao] = useState('GERAL')
  const [nomeSel, setNomeSel] = useState('')

  const forecastList = Array.isArray(forecast) ? forecast : []
  const equipeList = Array.isArray(forecastEquipe) ? forecastEquipe : []
  const meses = [...new Set([
    ...forecastList.map(f => String(f.mes || '').toUpperCase()).filter(Boolean),
    ...equipeList.filter(e => String(e.empresa || '').toUpperCase() === String(empresaSelecionada).toUpperCase()).map(e => String(e.mes || '').toUpperCase()).filter(Boolean),
  ])]

  const mesAtivo = mesSel || meses[0] || ''
  const anoAtivo = String((forecastList.find(f => String(f.mes || '').toUpperCase() === mesAtivo)?.ano) || (equipeList.find(e => String(e.mes || '').toUpperCase() === mesAtivo)?.ano) || new Date().getFullYear())
  const forecastMes = forecastList.find(f => String(f.mes || '').toUpperCase() === mesAtivo) || forecastList[0] || {}

  const pessoas = equipeList
    .filter(e => String(e.empresa || '').toUpperCase() === String(empresaSelecionada).toUpperCase())
    .filter(e => String(e.mes || '').toUpperCase() === mesAtivo)
    .filter(e => String(e.tipo || '').toUpperCase() === tipoVisao)

  const nomes = pessoas.map(e => e.nome).filter(Boolean)
  const nomeAtivo = tipoVisao === 'GERAL' ? '' : (nomes.includes(nomeSel) ? nomeSel : (nomes[0] || ''))
  const metaPessoa = pessoas.find(e => e.nome === nomeAtivo) || {}

  if (!forecastList.length && !equipeList.length) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de forecast</div>
  )

  const metaGrafico = tipoVisao === 'GERAL' ? Number(forecastMes.meta || 0) : Number(metaPessoa.meta || 0)
  const supermetaGrafico = tipoVisao === 'GERAL' ? 0 : Number(metaPessoa.supermeta || 0)
  const dadosGrafico = buildDailyForecast({ registros, empresa: empresaSelecionada, mes: mesAtivo, ano: anoAtivo, tipo: tipoVisao, nome: nomeAtivo, meta: metaGrafico, supermeta: supermetaGrafico })

  const unidade = tipoVisao === 'SDR' ? 'reuniões' : 'NMRR pago'
  const valorFmt = tipoVisao === 'SDR' ? fmtNum1 : fmtR1
  const necessario = Math.max((metaGrafico - dadosGrafico.realizado) / Math.max(dadosGrafico.diasOperacionaisRestantes, 1), 0)

  const gapIsPositive = (v) => Number(v || 0) < 0
  const gapCardClass = (v) => gapIsPositive(v) ? 'green' : 'red'
  const gapSub = (v, label = 'da meta') => gapIsPositive(v) ? `✓ Acima ${label}` : `⚠ Abaixo ${label}`
  const signedNumber = (v) => `${Number(v || 0) > 0 ? '+' : ''}${fmtNum1(v)}`

  const FilterButton = ({ value, label }) => (
    <button onClick={() => { setTipoVisao(value); setNomeSel('') }}
      style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid', fontSize: 12, cursor: 'pointer',
        background: tipoVisao === value ? 'rgba(99,102,241,0.15)' : 'transparent',
        borderColor: tipoVisao === value ? 'rgba(99,102,241,0.4)' : 'var(--border)',
        color: tipoVisao === value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {label}
    </button>
  )

  return (
    <div>
      {/* Month dropdown */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Mês do forecast:</label>
        <select value={mesAtivo} onChange={e => setMesSel(e.target.value)} className="field-input" style={{ minWidth: 160 }}>
          {meses.map(m => <option key={m} value={m}>{m} {anoAtivo}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Visão:</span>
        <FilterButton value="GERAL" label="Forecast mensal" />
        <FilterButton value="CLOSER" label="Por Closer" />
        <FilterButton value="SDR" label="Por SDR" />
        {tipoVisao !== 'GERAL' && (
          <select value={nomeAtivo} onChange={e => setNomeSel(e.target.value)} className="field-input" style={{ minWidth: 180 }}>
            {nomes.length === 0 && <option value="">Sem pessoas cadastradas</option>}
            {nomes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
      </div>

      <div className="chart-card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 0.75fr)', gap: 18, alignItems: 'stretch' }}>
          <div>
            <div className="chart-title">Evolução do Forecast — {tipoVisao === 'GERAL' ? empresaSelecionada : nomeAtivo} · {mesAtivo} {anoAtivo}</div>
            <ForecastCurveChart dados={dadosGrafico} tipo={tipoVisao} />
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 18, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
            <div>
              <div className="card-label">Realizado no mês</div>
              <div className="card-value">{valorFmt(dadosGrafico.realizado)}</div>
              <div className="card-sub">Previsão final: {valorFmt(dadosGrafico.previsaoFinal)} · média/dia: {valorFmt(dadosGrafico.mediaDia)}</div>
            </div>
            <div>
              <div className="card-label">Objetivo do mês</div>
              <div className="card-value">{valorFmt(metaGrafico)}</div>
              <div style={{ width: '100%', background: 'var(--bar-track)', height: 8, borderRadius: 999, margin: '8px 0' }}>
                <div style={{ width: `${Math.min(Math.max(dadosGrafico.pctMeta, 0), 100)}%`, height: '100%', borderRadius: 999, background: '#8b5cf6' }} />
              </div>
              <div className="card-sub">{fmtPct(dadosGrafico.pctMeta)} realizado</div>
            </div>
            {supermetaGrafico > 0 && (
              <div>
                <div className="card-label">Supermeta</div>
                <div className="card-value">{valorFmt(supermetaGrafico)}</div>
              </div>
            )}
            <div>
              <div className="card-label">Necessário por dia útil/sábado restante</div>
              <div className="card-value">{valorFmt(necessario)}</div>
              <div className="card-sub">{dadosGrafico.diasOperacionaisRestantes} dias restantes · Unidade: {unidade}</div>
            </div>
          </div>
        </div>
      </div>

      {forecastMes && forecastMes.mes && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Resumo do Forecast Mensal</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div className="card blue"><div className="card-label">Meta</div><div className="card-value">{fmtR1(forecastMes.meta)}</div><div className="card-sub">meta do mês</div></div>
            <div className={`card ${Number(forecastMes.meta || 0) > 0 && Number(forecastMes.mrrPago || 0) < Number(forecastMes.meta || 0) ? 'red' : 'green'}`}><div className="card-label">MRR Pago Projetado</div><div className="card-value">{fmtR1(forecastMes.mrrPago)}</div><div className="card-sub">{fmtPct(forecastMes.pctPago)} da meta</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapPago)}`}><div className="card-label">Gap Pago</div><div className="card-value">{fmtR1(forecastMes.gapPago)}</div><div className="card-sub">{gapSub(forecastMes.gapPago)}</div></div>
            <div className="card amber"><div className="card-label">Projeção Vendido</div><div className="card-value">{fmtR1(forecastMes.projecaoVendido)}</div><div className="card-sub">{fmtPct(forecastMes.pctVendido)} do projetado</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapContratos)}`}><div className="card-label">Gap Contratos</div><div className="card-value">{signedNumber(forecastMes.gapContratos)}</div><div className="card-sub">{gapSub(forecastMes.gapContratos, 'vs meta')}</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapRlzd)}`}><div className="card-label">Gap Realizadas</div><div className="card-value">{signedNumber(forecastMes.gapRlzd)}</div><div className="card-sub">{gapSub(forecastMes.gapRlzd, 'vs meta')}</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapAgd)}`}><div className="card-label">Gap Agendadas</div><div className="card-value">{signedNumber(forecastMes.gapAgd)}</div><div className="card-sub">{gapSub(forecastMes.gapAgd, 'vs meta')}</div></div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [empresa, setEmpresa] = useState('AI')
  const [periodo, setPeriodo] = useState(null)
  const [darkMode, setDarkMode] = useState(true)

  // Load saved theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('agc-theme')
    if (saved) setDarkMode(saved === 'dark')
  }, [])

  // Apply theme attribute to <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('agc-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

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

  const specialViews = [
    ['SEMANAS', 'Por Semana'],
    ['FORECAST', 'Forecast'],
    ['DADOS', 'Dados Específicos'],
    ['METAS_ORIGEM', 'Metas por Origem'],
  ]

  // True when the active period is a monthly period (not a special view)
  const isMesAtivo = periodosDinamicos.some(p => p.key === periodo)

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
        {/* Light / dark theme toggle */}
        <button className="theme-toggle" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Mudar para tema claro' : 'Mudar para tema escuro'}>
          <span className="theme-toggle-icon">{darkMode ? '☀️' : '🌙'}</span>
          <span>{darkMode ? 'Claro' : 'Escuro'}</span>
        </button>
      </nav>

      <div className="sub-nav">
        {/* Month dropdown — replaces the inline month buttons */}
        {periodosDinamicos.length > 0 && (
          <div className="period-select-wrapper">
            <select
              className={`period-select${isMesAtivo ? ' has-selection' : ''}`}
              value={isMesAtivo ? periodo : ''}
              onChange={e => e.target.value && setPeriodo(e.target.value)}
            >
              {!isMesAtivo && <option value="" disabled>Selecionar mês…</option>}
              {periodosDinamicos.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
        )}

        {periodosDinamicos.length > 0 && <div className="nav-divider" />}

        {/* Special view tabs */}
        {specialViews.map(([p, label]) => (
          <button key={p} className={`sub-tab ${periodo===p?'active':''}`} onClick={()=>setPeriodo(p)}>{label}</button>
        ))}
      </div>

      {loading && <div className="loading">Carregando dados...</div>}
      {error && <div className="error">Erro ao carregar: {error}</div>}
      {!loading && !error && data && (
        <div className="page">
          {periodo==='SEMANAS' ? <SemanasComparativo semanas={currentData?.SEMANAS} /> :
           periodo==='FORECAST' ? <ForecastView forecast={currentData?.FORECAST} forecastEquipe={data?.FORECAST_EQUIPE} registros={data?.GERAL} empresaSelecionada={empresa} /> :
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
