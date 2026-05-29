import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

const fmt = (n) => { const num = Number(n); return isNaN(num) ? '0' : num.toLocaleString('pt-BR') }
const fmtR = (n) => `R$ ${fmt(Math.round(Number(n) || 0))}`
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`

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

function BarChart({ data, valueKey = 'qtd', labelKey = 'nome', colorArr = null, formatVal, showPct = false, conceptColor = false }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0)
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0))
  return (
    <div>
      {data.slice(0, 10).map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const pct = max > 0 ? (val / max) * 100 : 0
        const pctOfTotal = total > 0 ? ((val / total) * 100).toFixed(1) : '0.0'
        const displayVal = formatVal ? formatVal(val) : val
        const color = conceptColor
          ? getConceptColor(d[labelKey], colorArr || CLOSER_COLORS, i)
          : (colorArr ? colorArr[i % colorArr.length] : '#3b82f6')
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 80, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d[labelKey]}>{d[labelKey]}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 18, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.85, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', width: showPct ? 90 : 36, textAlign: 'right', flexShrink: 0 }}>
              {displayVal}{showPct ? ` (${pctOfTotal}%)` : ''}
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

  const abr = semanas.filter(s => String(s.semana).toUpperCase().includes('ABR'))
  const mai = semanas.filter(s => String(s.semana).toUpperCase().includes('MAI'))

  const metricaOpts = [
    { key: 'leads', label: 'Leads' },
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'realizadas', label: 'Realizadas' },
    { key: 'contratosPagos', label: 'Contratos' },
    { key: 'nmrr', label: 'NMRR' },
    { key: 'tkm', label: 'TKM' },
  ]
  const isReais = metrica === 'nmrr' || metrica === 'tkm'

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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        {[{ dados: abr, titulo: 'Abril 2026', color: '#8b5cf6' }, { dados: mai, titulo: 'Maio 2026', color: '#14b8a6' }].map(({ dados, titulo, color }) => (
          <div key={titulo} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{titulo} — {metricaOpts.find(m => m.key === metrica)?.label}</div>
            <MiniLineChartTooltip dados={dados} metrica={metrica} color={color} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
              {dados.map((d, i) => (
                <div key={i} style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>{d.semana.replace(' ABR','').replace(' MAI','')}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <TableMes dados={abr} titulo="Abril 2026" />
      <TableMes dados={mai} titulo="Maio 2026" />
    </div>
  )
}

function MetricCards({ metricas }) {
  if (!metricas || metricas.leads === undefined) return null
  const gap = metricas.gap || ''
  const gapPositive = !String(gap).includes('-')
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
          { label: 'CAC', value: fmtR(metricas.cac), sub: 'por contrato pago', color: 'teal' },
          { label: 'Gap da Meta', value: gap, sub: gapPositive ? '✓ Meta atingida' : '⚠ Abaixo da meta', color: gapPositive ? 'green' : 'red' },
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
          <BarChart data={graficos.valorPagoPorOrigem} valueKey="valor" conceptColor formatVal={v=>`R$${Math.round(v/1000)}k`} showPct /></div>
        <div className="chart-card"><div className="chart-title">Qtd de Pagos por Origem</div>
          <BarChart data={graficos.qtdPagosPorOrigem} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Pipeline Ativo por Status</div>
          <BarChart data={graficos.pipeline} valueKey="qtd" colorArr={Object.values(STATUS_COLORS)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por Closer</div>
          <BarChart data={graficos.reunioesPorCloser} valueKey="qtd" colorArr={CLOSER_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Fechado por Closer (R$)</div>
          <BarChart data={graficos.valorPorCloser} valueKey="valor" colorArr={CLOSER_COLORS} formatVal={v=>`R$${Math.round(v/1000)}k`} showPct /></div>
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

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [empresa, setEmpresa] = useState('AI')
  const [periodo, setPeriodo] = useState('MAI')

  useEffect(() => {
    fetch('/api/data').then(r=>r.json()).then(d=>{setData(d);setLoading(false)}).catch(e=>{setError(e.message);setLoading(false)})
  }, [])

  const currentData = data ? data[empresa] : null
  const periodoData = currentData && periodo !== 'SEMANAS' ? currentData[periodo] : null

  return (
    <>
      <Head><title>AGC Dashboard</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <nav className="nav">
        <div className="nav-logo">📊 AGC Dashboard</div>
        <div className="nav-tabs">
          {[['AI','Acelera Imob'],['MO','Mundo Ótico']].map(([e,label])=>(
            <button key={e} className={`nav-tab ${empresa===e?'active':''}`} onClick={()=>setEmpresa(e)}>{label}</button>
          ))}
        </div>
      </nav>
      <div className="sub-nav">
        {[['MAI','Maio 2026'],['ABR','Abril 2026'],['SEMANAS','Por Semana']].map(([p,label])=>(
          <button key={p} className={`sub-tab ${periodo===p?'active':''}`} onClick={()=>setPeriodo(p)}>{label}</button>
        ))}
      </div>
      {loading && <div className="loading">Carregando dados...</div>}
      {error && <div className="error">Erro ao carregar: {error}</div>}
      {!loading && !error && data && (
        <div className="page">
          {periodo==='SEMANAS' ? <SemanasComparativo semanas={currentData?.SEMANAS} /> :
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
