import { useState, useEffect } from 'react'
import Head from 'next/head'
import '../styles/globals.css'

const fmt = (n) => isNaN(n) ? '0' : Number(n).toLocaleString('pt-BR')
const fmtR = (n) => `R$ ${fmt(Math.round(n))}`
const fmtPct = (n) => `${Number(n).toFixed(1)}%`

const COLORS = {
  green: '#10b981', purple: '#8b5cf6', amber: '#f59e0b',
  blue: '#3b82f6', teal: '#14b8a6', red: '#ef4444',
  indigo: '#6366f1', orange: '#f97316', pink: '#ec4899', gray: '#64748b'
}

const STATUS_COLORS = {
  PAGO: COLORS.green, FORA: COLORS.red, FUP: COLORS.blue,
  PM: COLORS.amber, FUGIU: COLORS.orange, OUTROS: COLORS.gray
}

const CHART_COLORS = [COLORS.blue, COLORS.purple, COLORS.teal, COLORS.green, COLORS.amber, COLORS.red, COLORS.indigo]

function BarChart({ data, valueKey = 'qtd', labelKey = 'nome', color = COLORS.blue, formatVal }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
  const max = Math.max(...data.map(d => d[valueKey]))
  return (
    <div>
      {data.slice(0, 10).map((d, i) => {
        const pct = max > 0 ? (d[valueKey] / max) * 100 : 0
        const displayVal = formatVal ? formatVal(d[valueKey]) : d[valueKey]
        return (
          <div key={i} className="bar-row">
            <div className="bar-label" title={d[labelKey]}>{d[labelKey]}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${pct}%`, background: color, opacity: 0.85 }} />
            </div>
            <div className="bar-count">{displayVal}</div>
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
    <div className="pie-container">
      <svg viewBox="0 0 100 100" style={{ width: 90, height: 90, flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#1a1d27" strokeWidth="1" />)}
      </svg>
      <div className="pie-legend">
        {slices.map((s, i) => (
          <div key={i} className="pie-legend-item">
            <div className="pie-dot" style={{ background: s.color }} />
            <span>{s.nome} ({s.pct}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LineChart({ data }) {
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

function MetricCards({ metricas }) {
  if (!metricas || !metricas.leads) return null
  const gap = metricas.gap || ''
  const gapNum = parseFloat(String(gap).replace(/[^0-9.-]/g, ''))
  const gapPositive = gapNum >= 0
  return (
    <div>
      <div className="section-title">Métricas do Mês</div>
      <div className="cards-grid">
        <div className="card blue">
          <div className="card-label">Leads</div>
          <div className="card-value">{fmt(metricas.leads)}</div>
          <div className="card-sub">MQL: {fmtPct(metricas.mql * 100)}</div>
        </div>
        <div className="card">
          <div className="card-label">Agendamentos</div>
          <div className="card-value">{fmt(metricas.agendamentos)}</div>
          <div className="card-sub">Taxa: {fmtPct(metricas.taxaAgendamento)}</div>
        </div>
        <div className="card">
          <div className="card-label">Realizadas</div>
          <div className="card-value">{fmt(metricas.realizadas)}</div>
          <div className="card-sub">Comparec.: {fmtPct(metricas.taxaRealizadas)}</div>
        </div>
        <div className="card green">
          <div className="card-label">Contratos Pagos</div>
          <div className="card-value">{fmt(metricas.contratosPagos)}</div>
          <div className="card-sub">Vendidos: {fmt(metricas.contratosVendidos)}</div>
        </div>
        <div className="card amber">
          <div className="card-label">NMRR</div>
          <div className="card-value">{fmtR(metricas.nmrr)}</div>
          <div className="card-sub">TKM: {fmtR(metricas.tkm)}</div>
        </div>
        <div className="card purple">
          <div className="card-label">Investimento</div>
          <div className="card-value">{fmtR(metricas.investimento)}</div>
          <div className="card-sub">CPL: {fmtR(metricas.cpl)}</div>
        </div>
        <div className="card teal">
          <div className="card-label">CAC</div>
          <div className="card-value">{fmtR(metricas.cac)}</div>
          <div className="card-sub">por contrato pago</div>
        </div>
        <div className={`card ${gapPositive ? 'green' : 'red'}`}>
          <div className="card-label">Gap da Meta</div>
          <div className="card-value">{gap}</div>
          <div className="card-sub">{gapPositive ? '✓ Meta atingida' : '⚠ Abaixo da meta'}</div>
        </div>
      </div>
    </div>
  )
}

function ReuniaoCards({ cards }) {
  if (!cards || !cards.total) return null
  return (
    <div>
      <div className="section-title">Resumo das Reuniões</div>
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Total Reuniões</div>
          <div className="card-value">{fmt(cards.total)}</div>
        </div>
        <div className="card green">
          <div className="card-label">Fechamentos (PAGO)</div>
          <div className="card-value">{fmt(cards.pagos)}</div>
          <div className="card-sub">Taxa: {fmtPct(cards.taxa)}</div>
        </div>
        <div className="card amber">
          <div className="card-label">Valor Total</div>
          <div className="card-value">{fmtR(cards.valorTotal)}</div>
        </div>
        <div className="card blue">
          <div className="card-label">FUP + PM</div>
          <div className="card-value">{fmt((cards.fup || 0) + (cards.pm || 0))}</div>
        </div>
        <div className="card red">
          <div className="card-label">Perdidos (FORA)</div>
          <div className="card-value">{fmt(cards.fora)}</div>
        </div>
        <div className="card">
          <div className="card-label">Fugiram</div>
          <div className="card-value">{fmt(cards.fugiu)}</div>
        </div>
      </div>
    </div>
  )
}

function ReuniaoGraficos({ graficos }) {
  if (!graficos) return null
  return (
    <div>
      <div className="section-title">Análise das Reuniões</div>
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-title">Valor Pago por Origem (R$)</div>
          <BarChart data={graficos.valorPagoPorOrigem} valueKey="valor" color={COLORS.green} formatVal={v => `R$${Math.round(v/1000)}k`} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Qtd de Pagos por Origem</div>
          <BarChart data={graficos.qtdPagosPorOrigem} valueKey="qtd" color={COLORS.blue} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Pipeline Ativo por Status</div>
          <BarChart data={graficos.pipeline} valueKey="qtd" color={COLORS.teal} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Reuniões por Closer</div>
          <BarChart data={graficos.reunioesPorCloser} valueKey="qtd" color={COLORS.purple} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Valor Fechado por Closer (R$)</div>
          <BarChart data={graficos.valorPorCloser} valueKey="valor" color={COLORS.green} formatVal={v => `R$${Math.round(v/1000)}k`} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Taxa de Conversão por Closer (%)</div>
          <BarChart data={graficos.taxaCloser} valueKey="taxa" color={COLORS.indigo} formatVal={v => `${v}%`} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Reuniões por Origem</div>
          <BarChart data={graficos.reunioesPorOrigem} valueKey="qtd" color={COLORS.amber} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Reuniões por SDR</div>
          <BarChart data={graficos.reunioesPorSdr} valueKey="qtd" color={COLORS.blue} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Contratos Pagos por SDR</div>
          <BarChart data={graficos.contratosPorSdr} valueKey="pagos" color={COLORS.green} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Status das Reuniões</div>
          <PieChart data={graficos.status} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Evolução de Reuniões por Data</div>
          <LineChart data={graficos.evolucao} />
        </div>
        <div className="chart-card">
          <div className="chart-title">Perdidos (FORA) por Origem</div>
          <BarChart data={graficos.foraPorOrigem} valueKey="qtd" color={COLORS.red} />
        </div>
      </div>
    </div>
  )
}

function SemanasView({ semanas }) {
  if (!semanas || semanas.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de semanas</div>
  }
  return (
    <div>
      <div className="section-title">Desempenho por Semana</div>
      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="semanas-table">
          <thead>
            <tr>
              <th>Semana</th>
              <th>Leads</th>
              <th>Agend.</th>
              <th>Realiz.</th>
              <th>Contratos</th>
              <th>NMRR</th>
              <th>TKM</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s, i) => (
              <tr key={i}>
                <td>{s.semana}</td>
                <td>{fmt(s.leads)}</td>
                <td>{fmt(s.agendamentos)}</td>
                <td>{fmt(s.realizadas)}</td>
                <td>{fmt(s.contratosPagos)}</td>
                <td>{fmtR(s.nmrr)}</td>
                <td>{fmtR(s.tkm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <button className={`nav-tab ${empresa === 'AI' ? 'active' : ''}`} onClick={() => setEmpresa('AI')}>
            Acelera Imob
          </button>
          <button className={`nav-tab ${empresa === 'MO' ? 'active' : ''}`} onClick={() => setEmpresa('MO')}>
            Mundo Ótico
          </button>
        </div>
      </nav>

      <div className="sub-nav">
        {['MAI', 'ABR', 'SEMANAS'].map(p => (
          <button key={p} className={`sub-tab ${periodo === p ? 'active' : ''}`} onClick={() => setPeriodo(p)}>
            {p === 'MAI' ? 'Maio 2026' : p === 'ABR' ? 'Abril 2026' : 'Por Semana'}
          </button>
        ))}
      </div>

      {loading && <div className="loading">Carregando dados...</div>}
      {error && <div className="error">Erro ao carregar dados: {error}</div>}

      {!loading && !error && data && (
        <div className="page">
          {periodo === 'SEMANAS' ? (
            <SemanasView semanas={currentData?.SEMANAS} />
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
