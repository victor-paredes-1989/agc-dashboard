import { useState, useEffect } from 'react'
import Head from 'next/head'

const fmt = (n) => {
  const num = Number(n)
  if (isNaN(num)) return '0'
  return num.toLocaleString('pt-BR')
}
const fmtR = (n) => `R$ ${fmt(Math.round(Number(n) || 0))}`
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`

const COLORS = {
  green: '#10b981', purple: '#8b5cf6', amber: '#f59e0b',
  blue: '#3b82f6', teal: '#14b8a6', red: '#ef4444',
  indigo: '#6366f1', orange: '#f97316', gray: '#64748b'
}

const STATUS_COLORS = {
  PAGO: COLORS.green, FORA: COLORS.red, FUP: COLORS.blue,
  PM: COLORS.amber, FUGIU: COLORS.orange, OUTROS: COLORS.gray
}

const CHART_COLORS = [COLORS.blue, COLORS.purple, COLORS.teal, COLORS.green, COLORS.amber, COLORS.red, COLORS.indigo]

function BarChart({ data, valueKey = 'qtd', labelKey = 'nome', color = COLORS.blue, formatVal, showPct = false }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0)
  const max = Math.max(...data.map(d => d[valueKey] || 0))
  return (
    <div>
      {data.slice(0, 10).map((d, i) => {
        const pct = max > 0 ? ((d[valueKey] || 0) / max) * 100 : 0
        const pctOfTotal = total > 0 ? (((d[valueKey] || 0) / total) * 100).toFixed(1) : '0.0'
        const displayVal = formatVal ? formatVal(d[valueKey]) : d[valueKey]
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 80, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d[labelKey]}>{d[labelKey]}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 3, height: 18, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, opacity: 0.85, transition: 'width 0.5s ease' }} />
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
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const large = angle > 180 ? 1 : 0
    const color = STATUS_COLORS[d.nome] || CHART_COLORS[i % CHART_COLORS.length]
    return { ...d, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color, pct: ((d.qtd / total) * 100).toFixed(1) }
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

function LineChartSVG({ data }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const vals = data.map(d => d.qtd)
  const max = Math.max(...vals, 1)
  const w = 300, h = 80
  const pts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - (d.qtd / max) * (h - 10) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={COLORS.teal} strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => {
        const x = (i / Math.max(data.length - 1, 1)) * w
        const y = h - (d.qtd / max) * (h - 10) - 2
        return <circle key={i} cx={x} cy={y} r="3" fill={COLORS.teal} />
      })}
    </svg>
  )
}

function SemanasComparativo({ semanas }) {
  if (!semanas || semanas.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de semanas</div>

  const abr = semanas.filter(s => s.semana.includes('Abr') || s.semana.includes('ABR'))
  const mai = semanas.filter(s => s.semana.includes('Mai') || s.semana.includes('MAI'))

  const metricaOpts = [
    { key: 'leads', label: 'Leads' },
    { key: 'agendamentos', label: 'Agendamentos' },
    { key: 'realizadas', label: 'Realizadas' },
    { key: 'contratosPagos', label: 'Contratos' },
    { key: 'nmrr', label: 'NMRR (R$)' },
  ]

  const [metrica, setMetrica] = useState('contratosPagos')
  const metricaLabel = metricaOpts.find(m => m.key === metrica)?.label || ''
  const isReais = metrica === 'nmrr' || metrica === 'tkm'

  function MiniLineChart({ dados, color }) {
    if (!dados || dados.length === 0) return null
    const vals = dados.map(d => d[metrica] || 0)
    const max = Math.max(...vals, 1)
    const w = 200, h = 60
    const pts = dados.map((d, i) => {
      const x = (i / Math.max(dados.length - 1, 1)) * w
      const y = h - ((d[metrica] || 0) / max) * (h - 8) - 2
      return `${x},${y}`
    }).join(' ')
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 60 }} preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
        {dados.map((d, i) => {
          const x = (i / Math.max(dados.length - 1, 1)) * w
          const y = h - ((d[metrica] || 0) / max) * (h - 8) - 2
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />
        })}
      </svg>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abril 2026 — {metricaLabel}</div>
          <MiniLineChart dados={abr} color={COLORS.purple} />
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Maio 2026 — {metricaLabel}</div>
          <MiniLineChart dados={mai} color={COLORS.teal} />
        </div>
      </div>

      {[{ dados: abr, titulo: 'Abril 2026', color: COLORS.purple }, { dados: mai, titulo: 'Maio 2026', color: COLORS.teal }].map(({ dados, titulo, color }) => (
        <div key={titulo} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>{titulo}</div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Semana', 'Leads', 'Agend.', 'Realiz.', 'Contratos', 'NMRR', 'TKM'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Semana' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{s.semana}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(s.leads)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(s.agendamentos)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(s.realizadas)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: COLORS.green, fontWeight: 500 }}>{fmt(s.contratosPagos)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: COLORS.amber }}>{fmtR(s.nmrr)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: COLORS.purple }}>{fmtR(s.tkm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function MetricCards({ metricas }) {
  if (!metricas || metricas.leads === undefined) return null
  const gap = metricas.gap || ''
  const gapNum = parseFloat(String(gap).replace(/[^0-9.-]/g, ''))
  const gapPositive = gapNum >= 0
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Métricas do Mês</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 8 }}>
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
        <div className="card blue"><div className="card-label">FUP + PM</div><div className="card-value">{fmt((cards.fup || 0) + (cards.pm || 0))}</div></div>
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
        {[
          { title: 'Valor Pago por Origem (R$)', data: graficos.valorPagoPorOrigem, valueKey: 'valor', color: COLORS.green, formatVal: v => `R$${Math.round(v/1000)}k`, showPct: true },
          { title: 'Qtd de Pagos por Origem', data: graficos.qtdPagosPorOrigem, valueKey: 'qtd', color: COLORS.blue, showPct: true },
          { title: 'Pipeline Ativo por Status', data: graficos.pipeline, valueKey: 'qtd', color: COLORS.teal, showPct: true },
          { title: 'Reuniões por Closer', data: graficos.reunioesPorCloser, valueKey: 'qtd', color: COLORS.purple, showPct: true },
          { title: 'Valor Fechado por Closer (R$)', data: graficos.valorPorCloser, valueKey: 'valor', color: COLORS.green, formatVal: v => `R$${Math.round(v/1000)}k`, showPct: true },
          { title: 'Taxa de Conversão por Closer (%)', data: graficos.taxaCloser, valueKey: 'taxa', color: COLORS.indigo, formatVal: v => `${v}%` },
          { title: 'Reuniões por Origem', data: graficos.reunioesPorOrigem, valueKey: 'qtd', color: COLORS.amber, showPct: true },
          { title: 'Reuniões por SDR', data: graficos.reunioesPorSdr, valueKey: 'qtd', color: COLORS.blue, showPct: true },
          { title: 'Contratos Pagos por SDR', data: graficos.contratosPorSdr, valueKey: 'pagos', color: COLORS.green, showPct: true },
        ].map((c, i) => (
          <div key={i} className="chart-card">
            <div className="chart-title">{c.title}</div>
            <BarChart data={c.data} valueKey={c.valueKey} color={c.color} formatVal={c.formatVal} showPct={c.showPct} />
          </div>
        ))}
        <div className="chart-card">
          <div className="chart-title">Status das Reuniões</div>
          <PieChart data={graficos.status} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Evolução de Reuniões por Data</div>
          <LineChartSVG data={graficos.evolucao} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Perdidos (FORA) por Origem</div>
          <BarChart data={graficos.foraPorOrigem} valueKey="qtd" color={COLORS.red} showPct={true} />
        </div>
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
    fetch('/api/data')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const empresaNome = empresa === 'AI' ? 'Acelera Imob' : 'Mundo Ótico'
  const currentData = data ? data[empresa] : null
  const periodoData = currentData && periodo !== 'SEMANAS' ? currentData[periodo] : null

  return (
    <>
      <Head>
        <title>Dashboard — {empresaNome}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <nav className="nav">
        <div className="nav-logo">📊 AGC Dashboard</div>
        <div className="nav-tabs">
          {['AI', 'MO'].map(e => (
            <button key={e} className={`nav-tab ${empresa === e ? 'active' : ''}`} onClick={() => setEmpresa(e)}>
              {e === 'AI' ? 'Acelera Imob' : 'Mundo Ótico'}
            </button>
          ))}
        </div>
      </nav>

      <div className="sub-nav">
        {[['MAI', 'Maio 2026'], ['ABR', 'Abril 2026'], ['SEMANAS', 'Por Semana']].map(([p, label]) => (
          <button key={p} className={`sub-tab ${periodo === p ? 'active' : ''}`} onClick={() => setPeriodo(p)}>{label}</button>
        ))}
      </div>

      {loading && <div className="loading">Carregando dados...</div>}
      {error && <div className="error">Erro ao carregar dados: {error}</div>}

      {!loading && !error && data && (
        <div className="page">
          {periodo === 'SEMANAS' ? (
            <SemanasComparativo semanas={currentData?.SEMANAS} />
          ) : periodoData ? (
            <>
              <MetricCards metricas={periodoData.metricas} />
              <ReuniaoCards cards={periodoData.reunioes?.cards} />
              <ReuniaoGraficos graficos={periodoData.reunioes?.graficos} />
            </>
          ) : (
            <div className="loading">Sem dados para este período</div>
          )}
        </div>
      )}
    </>
  )
}
