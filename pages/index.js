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
  // O sinal de negativo pode vir em qualquer posição, não só no início da string
  // (ex.: "R$ -1.234,56", onde o prefixo "R$ " vem antes do "-") — por isso verifica
  // a presença do "-" em qualquer lugar, em vez de só startsWith.
  if (s.includes('-')) {
    negative = true
    s = s.replace(/-/g, '')
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

function SemanaCard({ s, cor }) {
  const temMeta = s.metaNmrr != null && s.metaNmrr > 0
  const gap     = temMeta ? s.metaNmrr - s.nmrr : null
  const pctAtng = temMeta ? (s.nmrr / s.metaNmrr) * 100 : null
  const pctGap  = temMeta ? (gap / s.metaNmrr) * 100 : null
  const acima   = temMeta && gap <= 0

  const Row = ({ label, value, color, bold }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: bold ? 700 : 600, color: color || 'var(--text-primary)' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderTop: `3px solid ${cor}`, borderRadius: 14, padding: '16px 14px', boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cor, marginBottom: 2 }}>Semana</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{s.semana}</div>
      </div>

      {/* Bloco Marketing */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '6px 0 4px' }}>Marketing</div>
      <Row label="Leads"           value={fmt(s.leads)}                             color="#3b82f6" bold />
      <Row label="MQL %"           value={s.mql || '-'}                             color="#8b5cf6" />
      <Row label="Leads MQL"       value={s.leadsMql ? fmt(s.leadsMql) : '-'}       color="#8b5cf6" />
      <Row label="CPL"             value={s.cpl ? fmtR1(s.cpl) : '-'}              color="var(--text-secondary)" />
      <Row label="CPMQL"           value={s.cpmql != null ? fmtR1(s.cpmql) : '-'}  color="var(--text-secondary)" />
      <Row label="Invest. Ads"     value={s.investSemanal != null ? fmtR1(s.investSemanal) : '-'} color="#f97316" />

      {/* Bloco Comercial */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 4px' }}>Comercial</div>
      <Row label="Agendamentos"    value={fmt(s.agendamentos)}                      color="var(--text-primary)" bold />
      <Row label="% Agend."        value={s.pctAgd || '-'}                          color="var(--text-secondary)" />
      <Row label="Realizadas"      value={fmt(s.realizadas)}                        color="var(--text-primary)" bold />
      <Row label="% Realizadas"    value={s.pctRlzd || '-'}                         color="var(--text-secondary)" />
      <Row label="Vendas"          value={fmt(s.contratosPagos)}                    color="#10b981" bold />
      <Row label="% Conv. Venda"   value={s.pctConv || '-'}                         color="var(--text-secondary)" />

      {/* Bloco Resultado */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 4px' }}>Resultado</div>
      <Row label="Valor Vendas"    value={fmtR1(s.nmrr)}                            color="#f59e0b" bold />
      <Row label="TKM"             value={s.tkm ? fmtR1(s.tkm) : '-'}              color="var(--text-secondary)" />
      {temMeta && <>
        <Row label="Meta"          value={fmtR1(s.metaNmrr)}                        color="var(--text-secondary)" />
        <Row label="Gap"           value={gap != null ? fmtR1(Math.abs(gap)) : '-'} color={acima ? '#10b981' : '#ef4444'} />
        <Row label="% Ating. Meta" value={pctAtng != null ? `${pctAtng.toFixed(1)}%` : '-'} color={acima ? '#10b981' : '#f59e0b'} bold />
        <Row label="% Gap Restante"value={pctGap != null ? `${Math.abs(pctGap).toFixed(1)}%` : '-'} color={acima ? '#10b981' : '#ef4444'} />
      </>}
    </div>
  )
}

function SemanasComparativo({ semanas }) {
  const [modo, setModo] = useState('mes')
  const [mesSel, setMesSel] = useState('')
  const [semanaSel, setSemanaSel] = useState('')

  const monthMeta = {
    JAN: { label: 'Janeiro', order: 1 }, FEV: { label: 'Fevereiro', order: 2 }, MAR: { label: 'Março', order: 3 },
    ABR: { label: 'Abril', order: 4 },   MAI: { label: 'Maio', order: 5 },     JUN: { label: 'Junho', order: 6 },
    JUL: { label: 'Julho', order: 7 },   AGO: { label: 'Agosto', order: 8 },   SET: { label: 'Setembro', order: 9 },
    OUT: { label: 'Outubro', order: 10 },NOV: { label: 'Novembro', order: 11 },DEZ: { label: 'Dezembro', order: 12 },
  }
  const mesColors = ['#8b5cf6','#14b8a6','#3b82f6','#f59e0b','#ec4899','#f97316','#6366f1','#10b981','#ef4444','#0ea5e9','#a78bfa','#34d399']

  const getMonthKey = (semana) => {
    const txt = String(semana || '').toUpperCase()
    return Object.keys(monthMeta).find(k => txt.includes(k)) || null
  }
  const getSemanaNum = (semana) => {
    const m = String(semana || '').toUpperCase().match(/S(\d)/)
    return m ? `S${m[1]}` : null
  }

  if (!semanas || semanas.length === 0) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de semanas</div>
  )

  // meses disponíveis nos dados
  const mesesDisp = [...new Set(semanas.map(s => getMonthKey(s.semana)).filter(Boolean))]
    .sort((a, b) => (monthMeta[a]?.order || 99) - (monthMeta[b]?.order || 99))

  // semanas S1-S5 disponíveis nos dados
  const semanasDisp = [...new Set(semanas.map(s => getSemanaNum(s.semana)).filter(Boolean))].sort()

  // inicializar seleções com último mês disponível / S1
  const mesFinal = mesSel || mesesDisp[mesesDisp.length - 1] || ''
  const semanaFinal = semanaSel || semanasDisp[0] || ''

  // filtrar dados conforme modo
  let grupos = []
  if (modo === 'mes') {
    const dados = semanas.filter(s => getMonthKey(s.semana) === mesFinal)
    if (dados.length > 0) {
      const gi = mesesDisp.indexOf(mesFinal)
      grupos = [{ key: mesFinal, label: monthMeta[mesFinal]?.label || mesFinal, dados, cor: mesColors[gi % mesColors.length] }]
    }
  } else {
    // comparar: uma semana por mês
    mesesDisp.forEach((mk, gi) => {
      const dados = semanas.filter(s => getMonthKey(s.semana) === mk && getSemanaNum(s.semana) === semanaFinal)
      if (dados.length > 0) {
        grupos.push({ key: mk, label: monthMeta[mk]?.label || mk, dados, cor: mesColors[gi % mesColors.length] })
      }
    })
  }

  const btnStyle = (ativo) => ({
    padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border)',
    background: ativo ? 'var(--accent)' : 'var(--bg-card)',
    color: ativo ? '#fff' : 'var(--text-secondary)',
    fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
  })
  const selStyle = {
    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    fontSize: 12, cursor: 'pointer',
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Barra de filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 24,
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                    padding: '12px 16px' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>Visualizar</span>
        <button style={btnStyle(modo === 'mes')} onClick={() => setModo('mes')}>Mês selecionado</button>
        <button style={btnStyle(modo === 'comparar')} onClick={() => setModo('comparar')}>Comparar semana</button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        {modo === 'mes' ? (
          <select style={selStyle} value={mesFinal} onChange={e => setMesSel(e.target.value)}>
            {mesesDisp.map(mk => (
              <option key={mk} value={mk}>{monthMeta[mk]?.label || mk}</option>
            ))}
          </select>
        ) : (
          <select style={selStyle} value={semanaFinal} onChange={e => setSemanaSel(e.target.value)}>
            {semanasDisp.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
      </div>

      {/* Cards */}
      {grupos.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>
          Sem dados para este filtro.
        </div>
      ) : modo === 'mes' ? (
        /* Modo mês: grid amplo responsivo */
        grupos.map((grupo) => (
          <div key={grupo.key} className="semanas-grid">
            {grupo.dados.map((s, si) => (
              <SemanaCard key={si} s={s} cor={grupo.cor} />
            ))}
          </div>
        ))
      ) : (
        /* Modo comparar: cards compactos lado a lado */
        <div className="semanas-grid-comparar">
          {grupos.map((grupo) =>
            grupo.dados.map((s, si) => (
              <SemanaCard key={`${grupo.key}-${si}`} s={s} cor={grupo.cor} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Painel Geral ───────────────────────────────────────────
function PainelGeralView({ periodoData, periodoAtivo, nomeEmpresa, forecast }) {
  if (!periodoData) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
      Selecione um mês para ver o Painel Geral.
    </div>
  )

  const m  = periodoData.metricas || {}
  const c  = periodoData.reunioes?.cards || {}
  const gf = periodoData.reunioes?.graficos || {}
  const mesLabel = periodoAtivo?.label || ''

  // helpers
  const v   = (n) => (n == null || n === '') ? '-' : n
  const r1  = (n) => { const x = Number(n); return isNaN(x) || x === 0 ? '-' : fmtR1(x) }
  const f0  = (n) => { const x = Number(n); return isNaN(x) || x === 0 ? '-' : fmt(x) }
  const pct = (n) => { const x = Number(n); return isNaN(x) ? '-' : `${x.toFixed(1)}%` }

  // ── Tops — corrigido: campo é .nome, não .label ──
  const origemReunioes = (gf.reunioesPorOrigem  || []).filter(o => o.nome).sort((a,b) => (b.qtd||0)-(a.qtd||0))[0]
  const origemNmrr     = (gf.valorPagoPorOrigem || []).filter(o => o.nome).sort((a,b) => (b.valor||0)-(a.valor||0))[0]
  const melhorCloserV  = (gf.valorPorCloser     || []).filter(o => o.nome).sort((a,b) => (b.valor||0)-(a.valor||0))[0]
  const melhorSdr      = (gf.contratosPorSdr    || []).filter(o => o.nome).sort((a,b) => (b.pagos||0)-(a.pagos||0))[0]

  // ── Métricas calculadas no front ──
  const mqlFrac  = m.mql != null ? (m.mql > 1 ? m.mql / 100 : m.mql) : 0
  const leadsMql = m.leads && mqlFrac > 0 ? Math.round(m.leads * mqlFrac) : 0
  const cpmql    = m.investimento && leadsMql > 0 ? m.investimento / leadsMql : null
  const cpr      = m.investimento && m.realizadas ? m.investimento / m.realizadas : null

  // Valor na Mesa: pipeline PM + FECHOU + R2 + RECALL + CONTRATO + ASSINADO
  const valorNaMesa = (gf.pipeline || [])
    .filter(p => ['PM','FECHOU','R2','RECALL','CONTRATO','ASSINADO'].includes(String(p.nome||'').toUpperCase()))
    .reduce((s, p) => s + (p.valor || 0), 0)

  // ── Forecast: array por mês — encontra o mês correto ──
  const fcEntries = Array.isArray(forecast) ? forecast : []
  const mesPrefixo = String(periodoAtivo?.mesNome || '').toUpperCase().slice(0, 3)
  const fcEntry = fcEntries.find(e =>
    String(e.mes || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0, 3) === mesPrefixo
  ) || {}
  const metaMrr    = fcEntry.meta || 0
  const pctMeta    = m.nmrr && metaMrr ? (m.nmrr / metaMrr) * 100 : null
  // Forecast da Meta / Projeção NMRR — vem de PROJEÇÃO VENDIDO (coluna F) e
  // % VENDIDO PROJETADO (coluna G). Nunca usa mrrPago (MRR Pago Projetado, coluna C).
  const projetado    = fcEntry.projecaoVendido || null
  const pctForecast  = projetado
    ? (fcEntry.pctVendidoProjetado || (metaMrr ? (projetado / metaMrr) * 100 : null))
    : null
  const forecastDisplay = projetado != null ? `${r1(projetado)}${pctForecast != null ? ` — ${pctForecast.toFixed(0)}%` : ''}` : '-'

  // Pace Diário
  const pace = {
    mrrDia:     fcEntry.metaDiaPago      || null,
    agdDia:     fcEntry.metaAgdDia       || null,
    rlzdDia:    fcEntry.metaRlzdDia      || null,
    contPagoDia:fcEntry.metaContPagoDia  || null,
  }
  const temPace = Object.values(pace).some(Boolean)

  // ── Performance por Origem — corrigido: .nome em vez de .label ──
  const origemRows = (gf.valorPagoPorOrigem || [])
    .filter(o => o.nome && o.nome !== 'SEM ORIGEM')
    .map(o => {
      const reus = (gf.reunioesPorOrigem || []).find(r => r.nome === o.nome)
      return { origem: o.nome, reunioes: reus?.qtd || 0, pagos: o.qtd || 0, nmrr: o.valor || 0 }
    })
    .sort((a, b) => b.nmrr - a.nmrr)
  const totalNmrrOrigem = origemRows.reduce((s, r) => s + r.nmrr, 0)

  // ── Componentes internos ──
  const Stat = ({ label, value, color, big }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: big ? 22 : 15, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</span>
    </div>
  )

  const Block = ({ title, color, children }) => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
                  padding: '20px 22px', boxShadow: 'var(--shadow-card)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
                    color: color || 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-block', width: 3, height: 14, borderRadius: 2, background: color || 'var(--accent)' }} />
        {title}
      </div>
      {children}
    </div>
  )

  const Row2 = ({ items }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: '12px 24px' }}>
      {items.map((it, i) => <Stat key={i} {...it} />)}
    </div>
  )

  const Divider = () => <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Cabeçalho executivo ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16,
                    padding: '22px 26px', boxShadow: 'var(--shadow-card)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
                      color: 'var(--text-muted)', marginBottom: 6 }}>
          {nomeEmpresa} · {mesLabel}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 8 }}>
          {r1(m.nmrr)} em {f0(m.contratosPagos)} contratos pagos
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
          {[
            c.total            && `${fmt(c.total)} reuniões`,
            m.taxaRealizadas   && `${pct(m.taxaRealizadas)} comparecimento`,
            c.taxa             && `${pct(c.taxa)} conversão`,
            m.tkm              && `TKM ${r1(m.tkm)}`,
            m.cpl              && `CPL ${r1(m.cpl)}`,
          ].filter(Boolean).map((t, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── Grid 3 blocos principais ── */}
      <div className="painel-blocos-grid">

        {/* Marketing */}
        <Block title="Marketing" color="#3b82f6">
          <Row2 items={[
            { label: 'Investimento', value: r1(m.investimento), color: '#f97316', big: true },
            { label: 'CPL',          value: r1(m.cpl) },
          ]} />
          <Divider />
          <Row2 items={[
            { label: 'Leads',   value: f0(m.leads),  color: '#3b82f6' },
            { label: 'MQL %',   value: pct(m.mql),   color: '#8b5cf6' },
          ]} />
          <Divider />
          <Row2 items={[
            { label: 'Leads MQL', value: leadsMql > 0 ? f0(leadsMql) : '-' },
            { label: 'CPMQL',     value: cpmql ? r1(cpmql) : '-' },
          ]} />
          {(origemReunioes || origemNmrr) && <><Divider />
          <Row2 items={[
            origemReunioes
              ? { label: 'Top Origem Reuniões', value: `${origemReunioes.nome} (${f0(origemReunioes.qtd)})` }
              : { label: '', value: '' },
            origemNmrr
              ? { label: 'Top Origem NMRR', value: `${origemNmrr.nome} · ${r1(origemNmrr.valor)}` }
              : { label: '', value: '' },
          ]} /></>}
        </Block>

        {/* Comercial */}
        <Block title="Comercial" color="#10b981">
          <Row2 items={[
            { label: `Agendamentos${m.taxaAgendamento ? ` (${pct(m.taxaAgendamento)})` : ''}`, value: f0(m.agendamentos), big: true },
            { label: `Realizadas${m.taxaRealizadas ? ` (${pct(m.taxaRealizadas)})` : ''}`,     value: f0(m.realizadas) },
          ]} />
          <Divider />
          <Row2 items={[
            { label: `Pagos${c.taxa ? ` (${pct(c.taxa)} conv.)` : ''}`, value: f0(c.pagos), color: '#10b981', big: true },
            { label: 'Pipeline Ativo', value: valorNaMesa > 0 ? r1(valorNaMesa) : '-' },
          ]} />
          <Divider />
          <Row2 items={[
            { label: 'CPR',      value: cpr ? r1(cpr) : '-' },
            { label: 'Perdidos', value: f0(c.fora), color: '#ef4444' },
          ]} />
          {(melhorCloserV || melhorSdr) && <><Divider />
          <Row2 items={[
            melhorCloserV
              ? { label: 'Top Closer', value: `${melhorCloserV.nome} · ${r1(melhorCloserV.valor)}` }
              : { label: '', value: '' },
            melhorSdr
              ? { label: 'Top SDR', value: `${melhorSdr.nome} · ${f0(melhorSdr.pagos)} pagos` }
              : { label: '', value: '' },
          ]} /></>}
        </Block>

        {/* Resultado */}
        <Block title="Resultado" color="#f59e0b">
          <Row2 items={[
            { label: 'NMRR', value: r1(m.nmrr), color: '#f59e0b', big: true },
            { label: 'TKM',  value: r1(m.tkm) },
          ]} />
          <Divider />
          <Row2 items={[
            { label: 'Contratos Pagos', value: f0(m.contratosPagos) },
            {
              label: '% da Meta',
              value: pctMeta != null ? `${pctMeta.toFixed(1)}%` : '-',
              color: pctMeta != null ? (pctMeta >= 100 ? '#10b981' : '#f59e0b') : undefined,
            },
          ]} />
          {m.gap !== undefined && m.gap !== '' && <><Divider />
          <Stat label="Gap da Meta" value={v(m.gap)}
            color={parseDisplayNumber(m.gap||'') <= 0 ? '#10b981' : '#ef4444'} /></>}
          <Divider />
          <Stat label="Forecast da Meta / Projeção NMRR" value={forecastDisplay}
            color={pctForecast != null ? (pctForecast >= 100 ? '#10b981' : '#f59e0b') : undefined} />
        </Block>
      </div>

      {/* ── Pace Diário ── */}
      {temPace && (
        <Block title="Pace Diário" color="#14b8a6">
          <Row2 items={[
            { label: 'MRR / dia',          value: pace.mrrDia      ? r1(pace.mrrDia)      : '-' },
            { label: 'Agendamentos / dia',  value: pace.agdDia      ? f0(pace.agdDia)      : '-' },
            { label: 'Realizadas / dia',    value: pace.rlzdDia     ? f0(pace.rlzdDia)     : '-' },
            { label: 'Pagos / dia',         value: pace.contPagoDia ? f0(pace.contPagoDia) : '-' },
          ]} />
        </Block>
      )}

      {/* ── Performance por Origem ── */}
      {origemRows.length > 0 && (
        <Block title="Performance por Origem" color="#8b5cf6">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  {['Origem','Reuniões','Pagos','NMRR','% do Total'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Origem' ? 'left' : 'right',
                                         fontSize: 10, fontWeight: 700, letterSpacing: '0.07em',
                                         textTransform: 'uppercase', color: 'var(--text-muted)',
                                         borderBottom: '1px solid var(--border)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {origemRows.map((row, i) => {
                  const pctNmrr = totalNmrrOrigem > 0 ? (row.nmrr / totalNmrrOrigem * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.origem}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>{fmt(row.reunioes)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{fmt(row.pagos)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 700 }}>{fmtR1(row.nmrr)}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 60, height: 5, background: 'var(--bar-track)', borderRadius: 9 }}>
                            <div style={{ width: `${Math.min(Number(pctNmrr), 100)}%`, height: '100%', borderRadius: 9, background: '#8b5cf6' }} />
                          </div>
                          <span style={{ color: 'var(--text-secondary)', minWidth: 38, textAlign: 'right' }}>{pctNmrr}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Block>
      )}
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
          { label: 'NMRR', value: fmtR1(metricas.nmrr), sub: `TKM: ${fmtR1(metricas.tkm)}`, color: 'amber' },
          { label: 'Investimento', value: fmtR1(metricas.investimento), sub: `CPL: ${fmtR1(metricas.cpl)}`, color: 'purple' },
          { label: 'CAC', value: fmtR1(metricas.cac), sub: `por contrato | TKM: ${fmtR1(metricas.tkm)}`, color: 'teal' },
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

function ReuniaoCards({ cards, graficos }) {
  const PIPELINE_STATUSES = ['PM','FECHOU','RECALL','R2','CONTRATO','ASSINADO']
  const valorPipelineAtivo = (graficos?.pipeline || [])
    .filter(p => PIPELINE_STATUSES.includes(String(p.nome||'').toUpperCase()))
    .reduce((s, p) => s + (p.valor || 0), 0)
  if (!cards || !cards.total) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, marginTop: 28 }}>Resumo das Reuniões</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        <div className="card"><div className="card-label">Total Reuniões</div><div className="card-value">{fmt(cards.total)}</div></div>
        <div className="card green"><div className="card-label">Fechamentos (PAGO)</div><div className="card-value">{fmt(cards.pagos)}</div><div className="card-sub">Taxa: {fmtPct(cards.taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Total</div><div className="card-value">{fmtR1(cards.valorTotal)}</div></div>
        <div className="card amber"><div className="card-label">NMRR (sem DSV/DSO)</div><div className="card-value">{fmtR1(cards.nmrr)}</div><div className="card-sub">TKM: {fmtR1(cards.tkm)}</div></div>
        {cards.dsvTotal > 0 && <div className="card blue"><div className="card-label">DSV / DSO</div><div className="card-value">{fmtR1(cards.dsvTotal)}</div><div className="card-sub">{cards.dsvCount} contratos</div></div>}
        <div className="card blue"><div className="card-label">FUP + PM</div><div className="card-value">{fmt((cards.fup||0)+(cards.pm||0))}</div></div>
        <div className="card red"><div className="card-label">Perdidos (FORA)</div><div className="card-value">{fmt(cards.fora)}</div></div>
        <div className="card amber"><div className="card-label">Pipeline Ativo</div><div className="card-value">{fmtR1(valorPipelineAtivo)}</div></div>
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


const COMPARATIVO_MES_LABEL = {
  JANEIRO: 'Jan', FEVEREIRO: 'Fev', MARCO: 'Mar', ABRIL: 'Abr', MAIO: 'Mai', JUNHO: 'Jun',
  JULHO: 'Jul', AGOSTO: 'Ago', SETEMBRO: 'Set', OUTUBRO: 'Out', NOVEMBRO: 'Nov', DEZEMBRO: 'Dez',
}

function VerticalBarChart({ data, valueKey = 'qtd', labelKey = 'nome', extraValueKey = null, formatExtraVal = null, color = '#3b82f6' }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '32px 0' }}>Sem dados</div>
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 240, padding: '12px 4px 0', overflowX: 'auto', borderBottom: '1px solid var(--border)' }}>
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0
          const pct = max > 0 ? Math.max((val / max) * 100, val > 0 ? 3 : 0) : 0
          const extraVal = extraValueKey ? (Number(d[extraValueKey]) || 0) : null
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', flex: '0 0 60px' }}>
              {extraValueKey && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2, whiteSpace: 'nowrap' }}>{formatExtraVal ? formatExtraVal(extraVal) : extraVal}</div>}
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 6, whiteSpace: 'nowrap' }}>{fmt(val)}</div>
              <div style={{ width: 34, height: `${pct}%`, borderRadius: '5px 5px 0 0', background: color, opacity: 0.85, transition: 'height 0.5s' }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, padding: '8px 4px 0' }}>
        {data.map((d, i) => (
          <div key={i} style={{ flex: '0 0 60px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d[labelKey]}</div>
        ))}
      </div>
    </div>
  )
}

const COMPARATIVO_POSICOES = [
  { key: 'CLOSER', label: 'Closer', campo: 'closer' },
  { key: 'SDR', label: 'SDR', campo: 'sdr' },
]

function ComparativoMensalDashboard({ registros, empresaSelecionada }) {
  const rows = registros || []
  const norm = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  const [empresaSel, setEmpresaSel] = useState('')
  const [posicaoKey, setPosicaoKey] = useState('CLOSER')
  const [pessoaSel, setPessoaSel] = useState('')
  const [evento, setEvento] = useState('REUNIAO')
  const [origemSel, setOrigemSel] = useState('')

  const empresas = [...new Set(rows.map(r => norm(r.empresa)).filter(Boolean))].sort()
  const empresaAtiva = empresas.includes(empresaSel) ? empresaSel : (empresas.includes(norm(empresaSelecionada)) ? norm(empresaSelecionada) : (empresas[0] || ''))

  const posicao = COMPARATIVO_POSICOES.find(p => p.key === posicaoKey) || COMPARATIVO_POSICOES[0]

  const pessoas = [...new Set(
    rows.filter(r => norm(r.empresa) === empresaAtiva).map(r => String(r[posicao.campo] || '').trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const pessoaAtiva = pessoas.includes(pessoaSel) ? pessoaSel : (pessoas[0] || '')

  const registrosPessoa = rows.filter(r => norm(r.empresa) === empresaAtiva && norm(r[posicao.campo]) === norm(pessoaAtiva))

  const origens = [...new Set(registrosPessoa.map(r => String(r.origem || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const origemAtiva = origens.includes(origemSel) ? origemSel : ''

  const registrosFiltrados = registrosPessoa.filter(r => {
    if (origemAtiva && norm(r.origem) !== norm(origemAtiva)) return false
    if (evento === 'VENDAS' && norm(r.status) !== 'PAGO') return false
    return true
  })

  const porMes = {}
  registrosFiltrados.forEach(r => {
    const ano = String(r.ano || '').trim()
    if (!ano) return
    const mesKey = norm(r.mes)
    const mesNum = monthNumberFromName(r.mes)
    const chave = `${ano}${String(mesNum).padStart(2, '0')}`
    if (!porMes[chave]) porMes[chave] = { nome: `${COMPARATIVO_MES_LABEL[mesKey] || r.mes}/${ano.slice(-2)}`, qtd: 0, valor: 0 }
    porMes[chave].qtd += 1
    porMes[chave].valor += Number(r.valor) || 0
  })
  const comparativo = Object.keys(porMes).sort().map(k => porMes[k])

  const totalQtd = comparativo.reduce((s, d) => s + d.qtd, 0)
  const totalValor = comparativo.reduce((s, d) => s + d.valor, 0)
  const mediaMensal = comparativo.length ? totalQtd / comparativo.length : 0
  const melhorMes = comparativo.reduce((best, d) => (!best || d.qtd > best.qtd) ? d : best, null)

  const ToggleButton = ({ active, onClick, label }) => (
    <button onClick={onClick}
      style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid', fontSize: 13, cursor: 'pointer',
        background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
        borderColor: active ? 'rgba(99,102,241,0.4)' : 'var(--border)',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {label}
    </button>
  )

  const eventoLabel = evento === 'REUNIAO' ? 'Reuniões' : 'Vendas'

  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados na aba REUNIOES_GERAL</div>

  return (
    <div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Empresa</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {empresas.map(e => (
                <ToggleButton key={e} active={empresaAtiva === e} label={e} onClick={() => { setEmpresaSel(e); setPessoaSel(''); setOrigemSel('') }} />
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Posição</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COMPARATIVO_POSICOES.map(p => (
                <ToggleButton key={p.key} active={posicaoKey === p.key} label={p.label} onClick={() => { setPosicaoKey(p.key); setPessoaSel(''); setOrigemSel('') }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>{posicao.label}
              <select value={pessoaAtiva} onChange={e => { setPessoaSel(e.target.value); setOrigemSel('') }} className="field-input">
                {pessoas.length === 0 && <option value="">Sem dados</option>}
                {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>Evento</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ToggleButton active={evento === 'REUNIAO'} label="Reunião" onClick={() => setEvento('REUNIAO')} />
                <ToggleButton active={evento === 'VENDAS'} label="Vendas" onClick={() => setEvento('VENDAS')} />
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>Origem
              <select value={origemAtiva} onChange={e => setOrigemSel(e.target.value)} className="field-input">
                <option value="">Todas as origens</option>
                {origens.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      {comparativo.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem registros para essa combinação</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div className="card"><div className="card-label">Total no Período</div><div className="card-value">{fmt(totalQtd)}</div><div className="card-sub">{eventoLabel.toLowerCase()}</div></div>
            <div className="card blue"><div className="card-label">Média Mensal</div><div className="card-value">{fmtDec(mediaMensal)}</div></div>
            <div className="card green"><div className="card-label">Melhor Mês</div><div className="card-value">{melhorMes ? fmt(melhorMes.qtd) : '-'}</div><div className="card-sub">{melhorMes?.nome || ''}</div></div>
            {evento === 'VENDAS' && (
              <div className="card amber"><div className="card-label">Valor Total Pago</div><div className="card-value">{fmtR(totalValor)}</div></div>
            )}
          </div>
          <div className="chart-card">
            <div className="chart-title">{posicao.label} — {pessoaAtiva} · {empresaAtiva}{origemAtiva ? ` · ${origemAtiva}` : ''} · {eventoLabel} mês a mês</div>
            <VerticalBarChart
              data={comparativo}
              valueKey="qtd"
              labelKey="nome"
              extraValueKey={evento === 'VENDAS' ? 'valor' : null}
              formatExtraVal={v => fmtR1(v)}
              color={evento === 'VENDAS' ? '#10b981' : '#3b82f6'}
            />
          </div>
        </>
      )}
    </div>
  )
}

function DadosEspecificosView({ registros, empresaAtiva, periodoAtivo }) {
  // Estado inicial já sincronizado com a empresa/mês selecionados no topo do dashboard
  // (evita abrir a aba com todo o histórico acumulado — ver Etapa "sync com topo").
  const [filtros, setFiltros] = useState({
    empresa: empresaAtiva || 'TODAS', mes: periodoAtivo?.mesNome || 'TODOS', ano: periodoAtivo?.ano || 'TODOS',
    sdr: 'TODOS', closer: 'TODOS',
    origem: 'TODAS', status: 'TODOS', servico: 'TODOS', dataIni: '', dataFim: '', busca: ''
  })

  // Se o usuário trocar empresa/mês no topo enquanto está nesta aba, os 3 filtros
  // principais acompanham. Depende só de valores primitivos (não do objeto periodoAtivo
  // inteiro, que é recriado a cada render do pai) para não disparar em loop nem sobrescrever
  // os demais filtros/edições manuais do usuário a cada refresh de dados.
  useEffect(() => {
    setFiltros(prev => ({
      ...prev,
      empresa: empresaAtiva || 'TODAS',
      mes: periodoAtivo?.mesNome || 'TODOS',
      ano: periodoAtivo?.ano || 'TODOS',
    }))
  }, [empresaAtiva, periodoAtivo?.key])

  const rows = registros || []
  const setFiltro = (key, value) => setFiltros(prev => ({ ...prev, [key]: value }))

  // Paginação da tabela de registros filtrados — volta para a página 1 sempre
  // que qualquer filtro mudar (inclui a sincronização automática com o topo).
  const PAGE_SIZE = 50
  const [pagina, setPagina] = useState(1)
  useEffect(() => { setPagina(1) }, [filtros])

  // Ordenação da tabela por coluna. Ao trocar de filtro, a ordenação escolhida
  // é preservada de propósito (não volta ao padrão) — é uma preferência de
  // visualização do usuário, independente de quais registros estão na lista.
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

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

  // Comparação exata (após normalizar acentos/maiúsculas e aplicar canonical()) — não usa
  // includes/substring, para SDR/Closer/Origem/Status/Serviço/Empresa/Mês não vazarem
  // registros de nomes/valores parecidos (ex.: filtrar "Ana" não deve trazer "Ana Paula").
  const matchFiltro = (key, rowValue, filtroValue, allValues = ['TODOS']) => {
    if (allValues.includes(filtroValue)) return true
    const r = canonical(key, rowValue)
    const f = canonical(key, filtroValue)
    if (!f) return true
    return r === f
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
  // Fonte única de status de pipeline — usada tanto pelo card "Valor Pipeline" quanto pelo
  // gráfico "Pipeline por Status", para as duas visões nunca divergirem. Mesma definição de
  // "Valor na Mesa" do Painel Geral. FUP fica de fora: não há regra que o inclua no pipeline.
  const pipelineStatuses = ['PM', 'FECHOU', 'RECALL', 'R2', 'CONTRATO', 'ASSINADO']
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

  // Ordenação da tabela — aplicada sobre TODOS os `filtrados` (não só a página
  // atual), antes da paginação fatiar o resultado. Data usa data real (parseDate,
  // a mesma função já usada pelo filtro de data), Valor usa número (r.valor já
  // vem numérico do parser), os demais campos ordenam por texto (localeCompare
  // pt-BR, igual ao padrão já usado em unique()). `filtrados` (cards/gráficos)
  // não é alterado — só a cópia ordenada usada pela tabela.
  const SORT_TYPE = { data: 'date', valor: 'number' }
  const filtradosOrdenados = !sortKey ? filtrados : [...filtrados].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const tipo = SORT_TYPE[sortKey] || 'text'
    if (tipo === 'date') {
      const va = parseDate(a.data)?.getTime() ?? -Infinity
      const vb = parseDate(b.data)?.getTime() ?? -Infinity
      return dir * (va - vb)
    }
    if (tipo === 'number') {
      return dir * ((Number(a.valor) || 0) - (Number(b.valor) || 0))
    }
    return dir * String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'pt-BR')
  })

  // Paginação da tabela — não afeta cards/gráficos, que continuam usando `filtrados` inteiro.
  const totalRegistros = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE))
  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas)
  const inicioRegistro = totalRegistros === 0 ? 0 : (paginaAtual - 1) * PAGE_SIZE + 1
  const fimRegistro = Math.min(paginaAtual * PAGE_SIZE, totalRegistros)
  const paginaRows = filtradosOrdenados.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE)

  const PagBtn = ({ onClick, disabled, children }) => (
    <button onClick={onClick} disabled={disabled} className="field-input"
      style={{ padding: '5px 10px', fontSize: 12, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1 }}>
      {children}
    </button>
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
        <div className="card"><div className="card-label">Total de Reuniões</div><div className="card-value">{fmt(total)}</div></div>
        <div className="card green"><div className="card-label">Contratos Pagos</div><div className="card-value">{fmt(pagos.length)}</div><div className="card-sub">Taxa de conversão: {fmtPct(taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Pago Total</div><div className="card-value">{fmtR(sum(pagos))}</div></div>
        <div className="card amber"><div className="card-label">NMRR</div><div className="card-value">{fmtR(nmrr)}</div><div className="card-sub">TKM: {fmtR(tkm)}</div></div>
        <div className="card blue"><div className="card-label">DSV / DSO</div><div className="card-value">{fmtR(sum(dsvDso))}</div><div className="card-sub">{fmt(dsvDso.length)} contratos</div></div>
        <div className="card blue"><div className="card-label">FUP + PM</div><div className="card-value">{fmt(filtrados.filter(r => ['FUP','PM'].includes(norm(r.status))).length)}</div></div>
        <div className="card purple"><div className="card-label">Valor Pipeline</div><div className="card-value">{fmtR(sum(pipelineRows))}</div><div className="card-sub">{fmt(pipelineRows.length)} oportunidades</div></div>
        <div className="card red"><div className="card-label">Perdidos/Fugiram</div><div className="card-value">{fmt(filtrados.filter(r => ['FORA','FUGIU'].includes(norm(r.status))).length)}</div></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Gráficos filtrados</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <div className="chart-card"><div className="chart-title">Reuniões por Origem</div><BarChart data={countBy(filtrados, 'origem')} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Pagos por Origem</div><BarChart data={countBy(pagos, 'origem')} valueKey="qtd" conceptColor showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por Origem</div><BarChart data={valueBy(pagos, 'origem')} valueKey="valor" conceptColor formatVal={v=>fmtR1(v)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Reuniões por SDR</div><BarChart data={countBy(filtrados, 'sdr')} valueKey="qtd" colorArr={SDR_COLORS} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por SDR</div><BarChart data={valueBy(pagos, 'sdr')} valueKey="valor" colorArr={SDR_COLORS} formatVal={v=>fmtR1(v)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Valor Pago por Closer</div><BarChart data={valueBy(pagos, 'closer')} valueKey="valor" colorArr={CLOSER_COLORS} formatVal={v=>fmtR1(v)} showPct /></div>
        <div className="chart-card"><div className="chart-title">Status das Reuniões</div><PieChart data={countBy(filtrados, 'status')} /></div>
        <div className="chart-card"><div className="chart-title">Pipeline por Status</div><BarChart data={pipelineByStatus()} valueKey="qtd" colorArr={Object.values(STATUS_COLORS)} showPct extraValueKey="valor" formatExtraVal={v=>fmtR1(v)} /></div>
        <div className="chart-card"><div className="chart-title">Evolução por Data</div><LineChartWithTooltip data={evolucao()} color="#14b8a6" /></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>Registros filtrados</div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {[
                { label: 'Empresa', key: 'empresa' }, { label: 'Mês', key: 'mes' }, { label: 'Ano', key: null },
                { label: 'Origem', key: 'origem' }, { label: 'SDR', key: 'sdr' }, { label: 'Closer', key: 'closer' },
                { label: 'Data', key: 'data' }, { label: 'Serviço', key: null }, { label: 'Cliente', key: 'cliente' },
                { label: 'Nota', key: null }, { label: 'Valor', key: 'valor' }, { label: 'Status', key: 'status' },
                { label: 'Data FUP', key: null },
              ].map(({ label, key }) => (
                <th key={label} onClick={key ? () => handleSort(key) : undefined}
                  style={{ textAlign: label === 'Cliente' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', cursor: key ? 'pointer' : 'default', userSelect: 'none' }}>
                  {label}{key && sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginaRows.map((r, i) => (
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {totalRegistros > 0
            ? <>Mostrando {fmt(inicioRegistro)}–{fmt(fimRegistro)} de {fmt(totalRegistros)} registros</>
            : 'Nenhum registro para os filtros atuais.'}
        </div>
        {totalPaginas > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PagBtn onClick={() => setPagina(1)} disabled={paginaAtual <= 1}>« Primeira</PagBtn>
            <PagBtn onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaAtual <= 1}>‹ Anterior</PagBtn>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '0 4px' }}>Página {paginaAtual} de {totalPaginas}</span>
            <PagBtn onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas}>Próxima ›</PagBtn>
            <PagBtn onClick={() => setPagina(totalPaginas)} disabled={paginaAtual >= totalPaginas}>Última »</PagBtn>
          </div>
        )}
      </div>
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

function buildDailyForecast({ registros, empresa, mes, ano, tipo, nome, meta, supermeta, projecaoVendido }) {
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

  // Se a planilha já fornece projecaoVendido (col F), usá-la como valor terminal da
  // linha de previsão — não recalcular por extrapolação linear, pois a planilha tem
  // lógica própria (ex: sazonalidade, pipeline). Apenas meses em andamento têm linha futura.
  const projecaoNum = Number(projecaoVendido) || 0
  const previsaoFinal = projecaoNum > 0 && mesAtual
    ? projecaoNum
    : (mesAtual ? realizado + (mediaDia * diasOperacionaisRestantes) : realizado)

  const operationalCountUntil = (dia) => countOperationalDays({ ano, mes, start: 1, end: dia })
  const operationalCountBetween = (start, end) => countOperationalDays({ ano, mes, start, end })

  // Linha de previsão: parte do realizado no cutoff e sobe linearmente até projecaoFinal no último dia
  const gapFuturo = previsaoFinal - realizado
  const diasFuturosOp = diasOperacionaisRestantes
  const previsaoLine = dias.map(d => {
    if (d <= cutoffDia) return { dia: d, valor: real[d - 1]?.valor || 0 }
    if (!mesAtual) return { dia: d, valor: realizado }
    const opAte = operationalCountBetween(cutoffDia + 1, d)
    return { dia: d, valor: realizado + (diasFuturosOp > 0 ? (gapFuturo / diasFuturosOp) * opAte : 0) }
  })

  return {
    dias, totalDias, realizado, meta: metaNum, supermeta: superNum,
    pctMeta: metaNum > 0 ? (realizado / metaNum) * 100 : 0,
    previsaoFinal, mediaDia, cutoffDia, ultimoDiaComDado,
    diasOperacionaisMes, diasOperacionaisDecorridos, diasOperacionaisRestantes,
    real,
    metaLine: dias.map(d => ({ dia: d, valor: diasOperacionaisMes > 0 ? (metaNum / diasOperacionaisMes) * operationalCountUntil(d) : 0 })),
    superLine: dias.map(d => ({ dia: d, valor: diasOperacionaisMes > 0 ? (superNum / diasOperacionaisMes) * operationalCountUntil(d) : 0 })),
    previsaoLine,
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

// ── Normalização de origem específica do Forecast mensal ──────
// Difere da normalização global (normalizeOrigem em lib/sheets.js):
// MQL e FMQL aparecem separados (não agrupados como IB).
// MÊS PAS aparece separado de RECUPERAÇÃO.
// Usa r.origemRaw (campo bruto antes da normalização global).
function normalizarOrigemForecast(v) {
  const s = String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!s) return 'SEM ORIGEM'
  if (s === 'MQL') return 'MQL'
  if (['FMQL', 'F/MQL', 'F MQL'].includes(s)) return 'FMQL'
  if (['RECUP', 'RECUPERACAO', 'REC. BASE'].includes(s)) return 'RECUPERAÇÃO'
  if (['MES PAS', 'MES PASSADO'].includes(s)) return 'MÊS PAS'
  if (['INDIC', 'INDICACAO'].includes(s)) return 'INDICAÇÃO'
  return s || 'SEM ORIGEM'
}
const FORECAST_ORIGEM_ORDER = ['MQL','FMQL','RECUPERAÇÃO','MÊS PAS','SS','INDICAÇÃO','LIVE','API','CHURN','MIP','TROCA','SEM ORIGEM']

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
  const dadosGrafico = buildDailyForecast({ registros, empresa: empresaSelecionada, mes: mesAtivo, ano: anoAtivo, tipo: tipoVisao, nome: nomeAtivo, meta: metaGrafico, supermeta: supermetaGrafico, projecaoVendido: tipoVisao === 'GERAL' ? forecastMes.projecaoVendido : null })

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

      {(() => {
        const regMes = (registros || []).filter(r =>
          String(r.empresa || '').toUpperCase() === String(empresaSelecionada || '').toUpperCase() &&
          String(r.mes || '').toUpperCase() === mesAtivo &&
          String(r.ano || '') === anoAtivo
        )
        if (!regMes.length) return null
        const stats = {}
        regMes.forEach(r => {
          const orig = normalizarOrigemForecast(r.origemRaw || r.origem)
          if (!stats[orig]) stats[orig] = { realizadas: 0, pagos: 0, valor: 0 }
          stats[orig].realizadas += 1
          if (String(r.status || '').toUpperCase().trim() === 'PAGO') {
            stats[orig].pagos += 1
            stats[orig].valor += Number(r.valor) || 0
          }
        })
        const ordered = [
          ...FORECAST_ORIGEM_ORDER.filter(o => stats[o]),
          ...Object.keys(stats).filter(o => !FORECAST_ORIGEM_ORDER.includes(o)),
        ].map(o => ({ origem: o, ...stats[o] }))
        if (!ordered.length) return null
        return (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              Por Origem — {mesAtivo} {anoAtivo}
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Origem','Reuniões','Pagos','NMRR Pago','Tx Conv.','TKM'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Origem' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(o => {
                    const tx = o.realizadas > 0 ? (o.pagos / o.realizadas) * 100 : 0
                    const tkm = o.pagos > 0 ? o.valor / o.pagos : 0
                    return (
                      <tr key={o.origem} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.origem}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#6366f1', fontWeight: 500 }}>{fmt(o.realizadas)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#10b981', fontWeight: 500 }}>{fmt(o.pagos)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#f59e0b', fontWeight: 500 }}>{fmtR1(o.valor)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#3b82f6', fontWeight: 500 }}>{fmtPct(tx)}</td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', color: '#ec4899', fontWeight: 500 }}>{o.pagos > 0 ? fmtR1(tkm) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}


// ── Evolução Mensal — gráfico de barras verticais simples ──────
// Geometria única compartilhada por todos os gráficos de barra mensal da aba Evolução
// (VerticalBarChartMonths e VerticalBarChartMonthsGeral) — muda aqui, muda em todos.
// W bem maior que a largura "de papel" (900 em vez de 600): com preserveAspectRatio="none"
// (necessário para width:100% real sem sobrar espaço vazio nas laterais em cards largos),
// o viewBox é esticado horizontalmente até a largura real do card — quanto mais próximo W
// estiver dessa largura real, menor a distorção de barras e texto.
const EVOLUCAO_BAR_CHART = {
  W: 900, H: 220, padL: 20, padR: 20, padTop: 34, padBot: 40,
  barWMax: 32, barWFrac: 0.5, gridOpacity: 0.08,
  valFontSize: 10, valDy: 8, xFontSize: 9, xDy: 8, rectRx: 4,
}

function VerticalBarChartMonths({ data, color = '#3b82f6', formatVal = String }) {
  const [tooltip, setTooltip] = useState(null)
  if (!data || !data.length || data.every(d => !(Number(d.valor) || 0))) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Sem dados</div>
  }
  const vals = data.map(d => Number(d.valor) || 0)
  const max = Math.max(...vals, 1)
  const { W, H, padL, padR, padTop, padBot, barWMax, barWFrac, gridOpacity, valFontSize, valDy, xFontSize, xDy, rectRx } = EVOLUCAO_BAR_CHART
  const chartW = W - padL - padR, chartH = H - padTop - padBot
  const n = data.length
  const slotW = chartW / n
  const barW = Math.max(6, Math.min(barWMax, slotW * barWFrac))
  const bX = (i) => padL + i * slotW + slotW / 2 - barW / 2
  const bH = (v) => Math.max(2, (Number(v) || 0) / max * chartH)
  const bY = (v) => padTop + chartH - bH(v)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padTop + g * chartH} y2={padTop + g * chartH} stroke={`rgba(148,163,184,${gridOpacity})`} strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = bX(i), bh = bH(d.valor), by = bY(d.valor), cx = x + barW / 2
          const isHov = tooltip?.i === i
          return (
            <g key={i} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({ i, label: d.label || d.mes, valor: d.valor })}
              onMouseLeave={() => setTooltip(null)}>
              <rect x={x} y={by} width={barW} height={bh} rx={rectRx} fill={color} opacity={isHov ? 1 : 0.78} />
              {bh > 16 && <text x={cx} y={by - valDy} textAnchor="middle" fontSize={valFontSize} fill={color} opacity="0.95" fontWeight="600">{formatVal(d.valor)}</text>}
              <text x={cx} y={H - xDy} textAnchor="middle" fontSize={xFontSize} fill="#64748b">{d.mes}</text>
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div className="tooltip-box" style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="tooltip-label">{tooltip.label}</div>
          <div className="tooltip-value" style={{ color }}>{formatVal(tooltip.valor)}</div>
        </div>
      )}
    </div>
  )
}

function VerticalBarChartMonthsGeral({ data, color = '#3b82f6', formatVal = fmt, tooltipLabel = 'Realizadas' }) {
  const [tooltip, setTooltip] = useState(null)
  if (!data || !data.length || data.every(d => !(Number(d.valor) || 0))) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Sem dados</div>
  }
  const vals = data.map(d => Number(d.valor) || 0)
  const max = Math.max(...vals, 1)
  const { W, H, padL, padR, padTop, padBot, barWMax, barWFrac, gridOpacity, valFontSize, valDy, xFontSize, xDy, rectRx } = EVOLUCAO_BAR_CHART
  const chartW = W - padL - padR, chartH = H - padTop - padBot
  const n = data.length
  const slotW = chartW / n
  const barW = Math.max(6, Math.min(barWMax, slotW * barWFrac))
  const bX = (i) => padL + i * slotW + slotW / 2 - barW / 2
  const bH = (v) => Math.max(2, (Number(v) || 0) / max * chartH)
  const bY = (v) => padTop + chartH - bH(v)
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padTop + g * chartH} y2={padTop + g * chartH} stroke={`rgba(148,163,184,${gridOpacity})`} strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = bX(i), bh = bH(d.valor), by = bY(d.valor), cx = x + barW / 2
          const isHov = tooltip?.i === i
          return (
            <g key={i} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setTooltip({ i, label: d.label || d.mes, valor: d.valor, pagos: d.pagos, valorPago: d.valorPago })}
              onMouseLeave={() => setTooltip(null)}>
              <rect x={x} y={by} width={barW} height={bh} rx={rectRx} fill={color} opacity={isHov ? 1 : 0.78} />
              {bh > 16 && <text x={cx} y={by - valDy} textAnchor="middle" fontSize={valFontSize} fill={color} opacity="0.95" fontWeight="600">{formatVal(d.valor)}</text>}
              <text x={cx} y={H - xDy} textAnchor="middle" fontSize={xFontSize} fill="#64748b">{d.mes}</text>
            </g>
          )
        })}
      </svg>
      {tooltip && (
        <div className="tooltip-box" style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', minWidth: 160 }}>
          <div className="tooltip-label">{tooltip.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tooltipLabel}</span>
              <span style={{ fontSize: 12, color, fontWeight: 600 }}>{formatVal(tooltip.valor)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Pagos</span>
              <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>{fmt(tooltip.pagos)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Valor Pago</span>
              <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>{fmtR1(tooltip.valorPago)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const SEL_STYLE = {
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text-primary)', padding: '7px 12px', fontSize: 13, cursor: 'pointer', outline: 'none',
}

function EvolucaoMensalView({ periodos, getData, empresaSelecionada, geralData }) {
  const CATEGORIAS = [
    { key: 'comercial',   label: 'Dados Comerciais' },
    { key: 'marketing',   label: 'Dados Marketing' },
    { key: 'calculadas',  label: 'Métricas Calculadas' },
    { key: 'forecast',    label: 'Forecast' },
    { key: 'origem',      label: 'Origem' },
    { key: 'closer',      label: 'Closer' },
    { key: 'sdr',         label: 'SDR' },
  ]

  // Indicadores prontos em d.metricas (parseDashRow) — sem cálculo no front, sem tocar parser.
  const COMERCIAL = [
    { key: 'agendamentos',    label: 'Agendamentos',            color: '#6366f1', fmt: fmt,    desc: 'Total de reuniões agendadas no mês.' },
    { key: 'realizadas',      label: 'Realizadas',              color: '#14b8a6', fmt: fmt,    desc: 'Total de reuniões realizadas no mês.' },
    { key: 'contratosPagos',  label: 'Contratos Pagos',         color: '#10b981', fmt: fmt,    desc: 'Total de contratos com status pago no mês.' },
    { key: 'nmrr',            label: 'NMRR',                    color: '#f59e0b', fmt: fmtR1,  desc: 'Receita recorrente nova gerada no mês.' },
    { key: 'tkm',             label: 'TKM',                     color: '#8b5cf6', fmt: fmtR1,  desc: 'Ticket médio dos contratos pagos.' },
    { key: 'taxaAgendamento', label: 'Taxa de Agendamento',     color: '#3b82f6', fmt: fmtPct, desc: 'Percentual de leads que viraram agendamento.' },
    { key: 'taxaRealizadas',  label: 'Taxa de Comparecimento',  color: '#14b8a6', fmt: fmtPct, desc: 'Percentual de agendamentos que foram realizados.' },
    { key: 'gap',             label: 'Gap',                     color: '#ef4444', fmt: fmtR1,  desc: 'Diferença em relação à meta do mês.' },
  ]
  const MARKETING = [
    { key: 'investimento', label: 'Investimento', color: '#f97316', fmt: fmtR1,  desc: 'Valor investido em mídia paga no mês.' },
    { key: 'leads',        label: 'Leads',        color: '#3b82f6', fmt: fmt,    desc: 'Total de leads gerados no mês.' },
    { key: 'cpl',          label: 'CPL',          color: '#ec4899', fmt: fmtR1,  desc: 'Custo por lead.' },
    { key: 'cac',          label: 'CAC',          color: '#14b8a6', fmt: fmtR1,  desc: 'Custo de aquisição de cliente.' },
    { key: 'mql',          label: 'MQL %',        color: '#8b5cf6', fmt: fmtPct, desc: 'Percentual de leads qualificados como MQL.' },
  ]
  // Métricas de Forecast — fonte: FORECAST_AI / FORECAST_MO via getData(emp, 'FORECAST')
  // Campos: projecaoVendido (col F), pctVendidoProjetado (col G), gapNmrr (col H),
  //         meta (col B), metaDiaPago (col L), metaAgdDia (col M), metaRlzdDia (col N), metaContPagoDia (col O)
  // mrrPago NÃO é usado aqui — não representa Forecast.
  const FORECAST_METRICS = [
    { key: 'fc_meta',              label: 'Meta',                    color: '#6366f1', fmt: fmtR1,  desc: 'Meta de NMRR do mês.' },
    { key: 'fc_projecaoVendido',   label: 'Projeção Vendido',        color: '#f59e0b', fmt: fmtR1,  desc: 'Projeção de valor vendido vinda da aba FORECAST.' },
    { key: 'fc_pctVendidoProjetado', label: '% Vendido Projetado',   color: '#10b981', fmt: fmtPct, desc: 'Percentual projetado da meta.' },
    { key: 'fc_gapNmrr',           label: 'Gap NMRR',               color: '#ef4444', fmt: fmtR1,  desc: 'Diferença projetada em relação à meta de NMRR.' },
    { key: 'fc_metaDiaPago',       label: 'Meta Dia Pago',           color: '#3b82f6', fmt: fmtR1,  desc: 'Meta diária necessária de valor pago.' },
    { key: 'fc_metaAgdDia',        label: 'Meta Agendamentos/Dia',   color: '#8b5cf6', fmt: v => v != null ? Number(v).toFixed(1) : '-', desc: 'Quantidade média necessária de agendamentos por dia.' },
    { key: 'fc_metaRlzdDia',       label: 'Meta Realizadas/Dia',     color: '#14b8a6', fmt: v => v != null ? Number(v).toFixed(1) : '-', desc: 'Quantidade média necessária de reuniões realizadas por dia.' },
    { key: 'fc_metaContPagoDia',   label: 'Meta Contratos Pagos/Dia',color: '#ec4899', fmt: v => v != null ? Number(v).toFixed(1) : '-', desc: 'Quantidade média necessária de contratos pagos por dia.' },
  ]

  // Métricas derivadas calculadas no front — CPM excluído por falta de fonte confiável.
  const CALCULADAS = [
    { key: 'cpr',           label: 'CPR',              color: '#f97316', fmt: fmtR1,  desc: 'Custo por reunião realizada. Fórmula: investimento / realizadas.' },
    { key: 'leadsMql',      label: 'Leads MQL',        color: '#3b82f6', fmt: fmt,    desc: 'Estimativa de leads qualificados. Fórmula: leads × MQL%.' },
    { key: 'cpmql',         label: 'CPMQL',            color: '#ec4899', fmt: fmtR1,  desc: 'Custo por lead MQL. Fórmula: investimento / leads MQL.' },
    { key: 'taxaConversao', label: 'Taxa de Conversão', color: '#10b981', fmt: fmtPct, desc: 'Contratos pagos / reuniões realizadas.' },
    { key: 'valorPipeline', label: 'Valor Pipeline',   color: '#8b5cf6', fmt: fmtR1,  desc: 'Soma dos valores em status de pipeline: PM, FECHOU, RECALL, R2, CONTRATO e ASSINADO.' },
  ]

  const METRICAS_GERAL = [
    { key: 'realizadas',    label: 'Reuniões realizadas', color: '#6366f1', fmt: fmt,    desc: 'Total de reuniões registradas no REUNIOES_GERAL.' },
    { key: 'pagos',         label: 'Contratos pagos',     color: '#10b981', fmt: fmt,    desc: 'Total de reuniões com status PAGO.' },
    { key: 'valorPago',     label: 'Valor pago',          color: '#f59e0b', fmt: fmtR1,  desc: 'Soma dos valores das reuniões com status PAGO.' },
    { key: 'taxaConversao', label: 'Taxa de conversão',   color: '#3b82f6', fmt: fmtPct, desc: 'Contratos pagos / reuniões realizadas.' },
    { key: 'tkm',           label: 'TKM',                 color: '#ec4899', fmt: fmtR1,  desc: 'Valor pago / contratos pagos.' },
  ]

  const [categoria, setCategoria] = useState('comercial')
  const [anoFiltro, setAnoFiltro] = useState('todos')
  const [subFiltro, setSubFiltro] = useState('todos')
  const [metrica, setMetrica] = useState('agendamentos')
  const [metricaGeral, setMetricaGeral] = useState('realizadas')

  // Normalização defensiva de percentuais — protege gráfico, label da barra e tabela
  // (todos os três leem o mesmo valor daqui) contra dupla multiplicação por 100, caso
  // algum valor já chegue em escala percentual. Mesma regra já usada em parsePercentMeta
  // (lib/sheets.js): fração (|v|<=1) vira v*100; o que já é percentual passa direto.
  const normalizarPercentual = (v) => {
    const n = Number(v) || 0
    if (!n) return 0
    return Math.abs(n) <= 1 ? n * 100 : n
  }

  // Months from periodos (oldest first) filtered by year
  const mesesBase = [...periodos].reverse()
  const anosDisp = [...new Set(mesesBase.map(p => p.ano))].sort()

  const mesesFiltrados = anoFiltro === 'todos' ? mesesBase : mesesBase.filter(p => p.ano === anoFiltro)

  const PIPELINE_STATUSES_CALC = ['PM','FECHOU','RECALL','R2','CONTRATO','ASSINADO']

  const meses = mesesFiltrados.map(p => {
    const d = getData(empresaSelecionada, p.key)
    const m = d?.metricas || {}, c = d?.reunioes?.cards || {}
    const investimento = Number(m.investimento) || 0
    const realizadas   = Number(m.realizadas)   || 0
    const contratosPagos = Number(m.contratosPagos) || 0
    const nmrr         = Number(m.nmrr)         || 0
    const leads        = Number(m.leads)         || 0
    const mqlRaw       = normalizarPercentual(m.mql)
    const mqlFrac      = mqlRaw > 0 ? mqlRaw / 100 : 0
    const leadsMql     = leads && mqlFrac > 0 ? Math.round(leads * mqlFrac) : 0
    const valorPipeline = (d?.reunioes?.graficos?.pipeline || [])
      .filter(p2 => PIPELINE_STATUSES_CALC.includes(String(p2.nome || '').toUpperCase()))
      .reduce((s, p2) => s + (p2.valor || 0), 0)
    return {
      key: p.key, mes: `${p.mesAbbr}/${p.ano.slice(-2)}`, label: p.label, ano: p.ano,
      agendamentos: Number(m.agendamentos) || 0,
      realizadas,
      contratosPagos,
      nmrr,
      tkm: Number(m.tkm) || 0,
      taxaAgendamento: normalizarPercentual(m.taxaAgendamento),
      taxaRealizadas: normalizarPercentual(m.taxaRealizadas),
      gap: parseDisplayNumber(m.gap || ''),
      investimento,
      cpl: Number(m.cpl) || 0,
      cac: Number(m.cac) || 0,
      mql: mqlRaw,
      leads,
      // Métricas calculadas
      cpr:           investimento && realizadas   ? investimento / realizadas   : 0,
      leadsMql,
      cpmql:         investimento && leadsMql > 0 ? investimento / leadsMql     : 0,
      taxaConversao: realizadas ? (contratosPagos / realizadas) * 100 : 0,
      valorPago:     nmrr,
      valorPipeline,
    }
  })

  // Forecast — match mês do período com entrada do array FORECAST pelo prefixo de 3 letras
  // (mesma lógica validada no Painel Geral para evitar usar mrrPago como projeção).
  const normMes3 = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0,3)
  // Tenta casar pelo mesNome (ex: "AGOSTO"), pelo mesAbbr (ex: "AGO") e pelo label (ex: "Agosto 2026")
  const fcEntries = Array.isArray(getData(empresaSelecionada, 'FORECAST')) ? getData(empresaSelecionada, 'FORECAST') : []

  const mesesForecast = mesesFiltrados.map(p => {
    const pNorm = normMes3(p.mesNome || p.mesAbbr || p.label)
    const fcEntry = fcEntries.find(e => normMes3(e.mes) === pNorm) || {}
    // parseNum retorna 0 para células vazias/fórmulas — tratar 0 como ausente (|| null)
    const projecao = fcEntry.projecaoVendido || null
    const meta     = fcEntry.meta            || null
    const rawPct   = fcEntry.pctVendidoProjetado || null
    // % Vendido Projetado: usa valor pronto da col G; fallback: projecao/meta*100
    const pct = rawPct
      ? normalizarPercentual(rawPct)
      : (projecao && meta ? (projecao / meta) * 100 : null)
    return {
      key: p.key, mes: `${p.mesAbbr}/${p.ano.slice(-2)}`, label: p.label, ano: p.ano,
      fc_meta:                meta,
      fc_projecaoVendido:     projecao,
      fc_pctVendidoProjetado: pct,
      fc_gapNmrr:             fcEntry.gapNmrr        || null,
      fc_metaDiaPago:         fcEntry.metaDiaPago     || null,
      fc_metaAgdDia:          fcEntry.metaAgdDia      || null,
      fc_metaRlzdDia:         fcEntry.metaRlzdDia     || null,
      fc_metaContPagoDia:     fcEntry.metaContPagoDia || null,
    }
  })

  // For GERAL-based categories (origem/closer/sdr), aggregate month-over-month
  const geralEmpresa = (geralData || []).filter(r => {
    const emp = String(r.empresa || '').toUpperCase().trim()
    return emp === empresaSelecionada.toUpperCase().trim() || emp === ''
  })

  const MES_ORDER = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO']
  const MES_ABBR  = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ']

  // Unique months present in GERAL for filtered year, sorted chronologically
  function geralMeses() {
    const mesSet = new Map()
    geralEmpresa.forEach(r => {
      const ano = String(r.ano || '').trim()
      const mes = String(r.mes || '').trim().toUpperCase()
      if (!ano || !mes) return
      if (anoFiltro !== 'todos' && ano !== anoFiltro) return
      const k = `${ano}-${mes}`
      if (!mesSet.has(k)) {
        const mi = MES_ORDER.indexOf(mes)
        const abbr = mi >= 0 ? MES_ABBR[mi] : mes.slice(0,3)
        mesSet.set(k, { key: k, mes: `${abbr}/${ano.slice(-2)}`, label: `${mes} ${ano}`, ano, mesRaw: mes, sortKey: `${ano}-${String(mi+1).padStart(2,'0')}` })
      }
    })
    return [...mesSet.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }

  function buildGeralSeries(field) {
    const mesesG = geralMeses()
    if (field === 'origem') {
      // Origem usa origemRaw + normalização específica (MQL/FMQL separados, não agrupados como IB)
      const uniqueVals = [...new Set(geralEmpresa.map(r => normalizarOrigemForecast(r.origemRaw || r.origem)).filter(Boolean))]
      const vals = [
        ...FORECAST_ORIGEM_ORDER.filter(o => uniqueVals.includes(o)),
        ...uniqueVals.filter(o => !FORECAST_ORIGEM_ORDER.includes(o)),
      ]
      return { mesesG, vals }
    }
    const vals = [...new Set(geralEmpresa.map(r => String(r[field] || '').trim()).filter(Boolean))].sort()
    return { mesesG, vals }
  }

  function geralStats(mg, field, val) {
    const rows = geralEmpresa.filter(r => {
      const ano = String(r.ano || '').trim()
      const mes = String(r.mes || '').trim().toUpperCase()
      if (anoFiltro !== 'todos' && ano !== anoFiltro) return false
      if (`${ano}-${mes}` !== mg.key) return false
      if (field === 'origem') return normalizarOrigemForecast(r.origemRaw || r.origem) === val
      return String(r[field] || '').trim() === val
    })
    const pagos = rows.filter(r => String(r.status || '').trim().toUpperCase() === 'PAGO')
    const valor = pagos.reduce((s, r) => s + (Number(r.valor) || 0), 0)
    return { realizadas: rows.length, pagos: pagos.length, valor }
  }

  // Reset subFiltro/metrica when category changes
  function changeCategoria(cat) {
    setCategoria(cat)
    setSubFiltro('todos')
    setMetricaGeral('realizadas')
    const lista = cat === 'comercial' ? COMERCIAL : cat === 'marketing' ? MARKETING : cat === 'calculadas' ? CALCULADAS : cat === 'forecast' ? FORECAST_METRICS : null
    if (lista) setMetrica(lista[0].key)
  }

  const dropdownStyle = { ...SEL_STYLE, minWidth: 160 }

  function geralMetricVal(s, key) {
    if (key === 'realizadas') return s.realizadas
    if (key === 'pagos') return s.pagos
    if (key === 'valorPago') return s.valor
    if (key === 'taxaConversao') return s.realizadas > 0 ? (s.pagos / s.realizadas) * 100 : 0
    if (key === 'tkm') return s.pagos > 0 ? s.valor / s.pagos : 0
    return 0
  }

  const renderGeralCharts = (field, colorArr, metricaKey = null) => {
    const { mesesG, vals } = buildGeralSeries(field)
    if (!mesesG.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Sem dados em GERAL para filtros selecionados.</div>
    const displayVals = subFiltro === 'todos' ? vals : [subFiltro]
    if (!displayVals.length) return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '32px 0', textAlign: 'center' }}>Nenhum item encontrado.</div>
    const metrAtiva = metricaKey ? (METRICAS_GERAL.find(m => m.key === metricaKey) || METRICAS_GERAL[0]) : null

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
        {displayVals.map((val, vi) => {
          const color = metrAtiva ? metrAtiva.color : colorArr[vi % colorArr.length]
          const chartData = mesesG.map(mg => {
            const s = geralStats(mg, field, val)
            const valor = metrAtiva ? geralMetricVal(s, metrAtiva.key) : s.realizadas
            return { mes: mg.mes, label: mg.label, valor, pagos: s.pagos, valorPago: s.valor }
          })
          const titulo = metrAtiva ? `${val} · ${metrAtiva.label} mês a mês` : `${val} · reuniões mês a mês`
          return (
            <div key={val} className="chart-card">
              <div className="chart-title">{titulo}</div>
              <VerticalBarChartMonthsGeral data={chartData} color={color} formatVal={metrAtiva ? metrAtiva.fmt : fmt} tooltipLabel={metrAtiva ? metrAtiva.label : 'Realizadas'} />
            </div>
          )
        })}
      </div>
    )
  }

  const renderGeralTable = (field, colorArr, metricaKey = null) => {
    const { mesesG, vals } = buildGeralSeries(field)
    const displayVals = subFiltro === 'todos' ? vals : [subFiltro]
    if (!mesesG.length || !displayVals.length) return null
    const metrAtiva = metricaKey ? (METRICAS_GERAL.find(m => m.key === metricaKey) || METRICAS_GERAL[0]) : null

    if (metrAtiva) {
      return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto', marginTop: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Mês</th>
                {displayVals.map((v, vi) => (
                  <th key={v} style={{ textAlign: 'right', color: colorArr[vi % colorArr.length], fontWeight: 600, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{v}</th>
                ))}
              </tr>
              <tr>
                <th style={{ borderBottom: '1px solid var(--border)', padding: '6px 12px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 10 }}>{metrAtiva.label}</th>
                {displayVals.map(v => (
                  <th key={v} style={{ textAlign: 'right', color: metrAtiva.color, fontWeight: 500, fontSize: 10, padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>—</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...mesesG].reverse().map(mg => (
                <tr key={mg.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mg.label}</td>
                  {displayVals.map(v => {
                    const s = geralStats(mg, field, v)
                    const val = geralMetricVal(s, metrAtiva.key)
                    return <td key={v} style={{ padding: '9px 8px', textAlign: 'right', color: metrAtiva.color, fontWeight: 500 }}>{metrAtiva.fmt(val)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto', marginTop: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Mês</th>
              {displayVals.map((v, vi) => (
                <th key={v} colSpan={3} style={{ textAlign: 'center', color: colorArr[vi % colorArr.length], fontWeight: 600, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{v}</th>
              ))}
            </tr>
            <tr>
              <th style={{ borderBottom: '1px solid var(--border)' }}></th>
              {displayVals.map((v) => (
                ['Realizadas','Pagos','Valor Pago'].map(h => (
                  <th key={`${v}-${h}`} style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 10, padding: '6px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {[...mesesG].reverse().map(mg => (
              <tr key={mg.key} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mg.label}</td>
                {displayVals.map((v, vi) => {
                  const s = geralStats(mg, field, v)
                  const c = colorArr[vi % colorArr.length]
                  return [
                    <td key={`${v}-r`} style={{ padding: '9px 8px', textAlign: 'right', color: c, fontWeight: 500 }}>{fmt(s.realizadas)}</td>,
                    <td key={`${v}-p`} style={{ padding: '9px 8px', textAlign: 'right', color: '#10b981', fontWeight: 500 }}>{fmt(s.pagos)}</td>,
                    <td key={`${v}-v`} style={{ padding: '9px 8px', textAlign: 'right', color: '#f59e0b', fontWeight: 500 }}>{fmtR1(s.valor)}</td>,
                  ]
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (!mesesBase.length) return (
    <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '48px 0', textAlign: 'center' }}>
      Sem períodos mensais. Verifique se existem abas "DASH AI XXX XX" / "DASH MO XXX XX" na planilha.
    </div>
  )

  const isGeral = ['origem', 'closer', 'sdr'].includes(categoria)
  const isForecast = categoria === 'forecast'
  const geralField = categoria === 'origem' ? 'origem' : categoria === 'closer' ? 'closer' : 'sdr'
  const geralColors = categoria === 'closer' ? CLOSER_COLORS : SDR_COLORS

  const { vals: geralVals } = isGeral ? buildGeralSeries(geralField) : { vals: [] }

  const currentMetrics = categoria === 'comercial' ? COMERCIAL : categoria === 'marketing' ? MARKETING : categoria === 'calculadas' ? CALCULADAS : FORECAST_METRICS
  const metricaAtiva = currentMetrics.find(m => m.key === metrica) || currentMetrics[0]
  const currentMeses = isForecast ? mesesForecast : meses

  return (
    <div>
      {/* Dropdowns row — alignItems: flex-start mantém labels alinhados pelo topo */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Categoria</label>
          <select style={dropdownStyle} value={categoria} onChange={e => changeCategoria(e.target.value)}>
            {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Ano</label>
          <select style={dropdownStyle} value={anoFiltro} onChange={e => setAnoFiltro(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {isGeral && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              {categoria === 'origem' ? 'Origem' : categoria === 'closer' ? 'Closer' : 'SDR'}
            </label>
            <select style={dropdownStyle} value={subFiltro} onChange={e => setSubFiltro(e.target.value)}>
              <option value="todos">Ver todos</option>
              {geralVals.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        {isGeral && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Métrica</label>
            <select style={dropdownStyle} value={metricaGeral} onChange={e => setMetricaGeral(e.target.value)}>
              {METRICAS_GERAL.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        )}
        {!isGeral && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Métrica</label>
            <select style={dropdownStyle} value={metrica} onChange={e => setMetrica(e.target.value)}>
              {currentMetrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'flex-end', paddingBottom: 2 }}>
          {empresaSelecionada} &nbsp;·&nbsp; {isGeral ? `${geralEmpresa.filter(r => anoFiltro === 'todos' || String(r.ano||'').trim() === anoFiltro).length} reuniões` : `${currentMeses.length} ${currentMeses.length === 1 ? 'mês' : 'meses'}`}
        </div>
      </div>
      {/* Descrição da métrica selecionada — fora do flex row para não desalinhar os dropdowns */}
      {isGeral && METRICAS_GERAL.find(m => m.key === metricaGeral)?.desc && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>{METRICAS_GERAL.find(m => m.key === metricaGeral).desc}</div>
      )}
      {!isGeral && metricaAtiva?.desc && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>{metricaAtiva.desc}</div>
      )}

      {/* Charts */}
      {!isGeral ? (
        <>
          <div className="chart-card" style={{ marginBottom: 32 }}>
            <div className="chart-title">{metricaAtiva.label} — {empresaSelecionada} · mês a mês</div>
            <VerticalBarChartMonths
              data={currentMeses.map(mes => ({ mes: mes.mes, label: mes.label, valor: mes[metricaAtiva.key] ?? 0 }))}
              color={metricaAtiva.color} formatVal={metricaAtiva.fmt}
            />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            Tabela resumo — {metricaAtiva.label} · {empresaSelecionada}
          </div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 12px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>Mês</th>
                  <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, padding: '10px 8px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{metricaAtiva.label}</th>
                </tr>
              </thead>
              <tbody>
                {[...currentMeses].reverse().map(mes => (
                  <tr key={mes.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mes.label}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'right', color: metricaAtiva.color, fontWeight: 500 }}>
                      {mes[metricaAtiva.key] == null ? '-' : metricaAtiva.fmt(mes[metricaAtiva.key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {renderGeralCharts(geralField, geralColors, metricaGeral)}
          {renderGeralTable(geralField, geralColors, metricaGeral)}
        </>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const [lastSync, setLastSync] = useState(null)
  const [empresa, setEmpresa] = useState('AI')
  const [periodo, setPeriodo] = useState(null)
  const [mesSelAtivo, setMesSelAtivo] = useState('')
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

  const fetchData = useRef(null)
  fetchData.current = async (force = false) => {
    if (force) { setSyncing(true); setSyncError(null) }
    try {
      const url = force ? '/api/data?force=1' : '/api/data'
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d = await res.json()
      // `d.error` indica falha total de auth/leitura sem cache anterior
      if (d.error && !d.GERAL) throw new Error(d.error)
      setData(d)
      setError(null)
      const ts = d.syncedAt ? new Date(d.syncedAt) : new Date()
      setLastSync(ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      // Avisar se os dados vieram do cache stale (erro na última atualização)
      if (d.error || d._stale) setSyncError(`Dados em cache — última leitura falhou: ${d.error || 'erro desconhecido'}`)
    } catch (e) {
      if (!data) setError(e.message)
      else setSyncError('Falha ao sincronizar — usando dados anteriores')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  // Initial load + auto-refresh every 30 minutes
  useEffect(() => {
    fetchData.current(false)
    const interval = setInterval(() => fetchData.current(false), 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!data) return
    const periodos = data?.PERIODOS || []
    const empData = data[empresa] || {}
    // Valida empresa configurada
    const empresas = data?.CONFIG?.empresas || []
    if (empresas.length && !empresas.some(e => e.codigo === empresa)) {
      setEmpresa(empresas[0].codigo)
      return
    }
    // Seleciona período inicial se nenhum ativo
    const maisRecente = periodos[0]?.key
    if (!periodo) setPeriodo(maisRecente || 'DADOS')
    // Auto-seleciona ou corrige mesSelAtivo para a empresa atual
    if (!mesSelAtivo || !empData[mesSelAtivo]) {
      const disponivel = periodos.find(p => empData[p.key])
      if (disponivel) setMesSelAtivo(disponivel.key)
    }
  }, [data, empresa])

  const empresasConfig = data?.CONFIG?.empresas || [['AI','Acelera Imob'],['MO','Mundo Ótico']].map(([codigo,nome]) => ({ codigo, nome }))
  const dashboardNome = data?.CONFIG?.dashboardNome || 'AGC Dashboard'
  const currentData = data ? data[empresa] : null
  const periodosDinamicos = data?.PERIODOS || []
  const specialViews = [
    ['MES',         'Visão do Mês'],
    ['PAINEL',      'Painel Geral'],
    ['SEMANAS',     'Por Semana'],
    ['FORECAST',    'Forecast'],
    ['EVOLUCAO',    'Evolução Mensal'],
    ['COMPARATIVO', 'Comparativo Mensal'],
    ['DADOS',       'Dados Específicos'],
    ['METAS_ORIGEM','Metas por Origem'],
  ]

  // isSpecialView: true quando a aba ativa é uma análise especial (não a visão mensal padrão)
  const isSpecialView = specialViews.some(([k]) => k === periodo)
  // activeMesKey: chave do mês para buscar dados — independe da aba ativa
  const activeMesKey = isSpecialView ? mesSelAtivo : periodo
  const periodoData = currentData && activeMesKey && !['SEMANAS','FORECAST','DADOS','METAS_ORIGEM','COMPARATIVO','EVOLUCAO'].includes(periodo)
    ? (currentData[activeMesKey] ?? null)
    : null

  // isMesAtivo: true apenas na visão mensal padrão (não em análises especiais)
  const isMesAtivo = !isSpecialView && periodosDinamicos.some(p => p.key === periodo)
  const periodoAtivo = periodosDinamicos.find(p => p.key === activeMesKey)
  const nomeEmpresa = empresasConfig.find(e => e.codigo === empresa)?.nome || empresa

  // Hero section data
  const heroMetricas = periodoData?.metricas || {}
  const nmrr = Number(heroMetricas.nmrr) || 0
  const investimento = Number(heroMetricas.investimento) || 0
  const contratosPagos = Number(heroMetricas.contratosPagos) || 0
  const leads = Number(heroMetricas.leads) || 0

  return (
    <>
      <Head><title>{dashboardNome}</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>

      <div className="app-layout">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="sidebar-logo">◆</div>

          {empresasConfig.map(({ codigo, nome }) => (
            <button
              key={codigo}
              className={`sidebar-item ${empresa === codigo ? 'active' : ''}`}
              onClick={() => setEmpresa(codigo)}
              title={nome}
            >
              <span className="sidebar-icon">{codigo}</span>
              <span className="sidebar-label">{nome.split(' ')[0]}</span>
            </button>
          ))}

          <div className="sidebar-divider" />

          <div className="sidebar-footer">
            <button
              className="sidebar-action"
              onClick={() => fetchData.current(true)}
              disabled={syncing}
              title={syncing ? 'Sincronizando…' : 'Sincronizar'}
            >
              <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            </button>
            <button
              className="sidebar-action"
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? 'Tema claro' : 'Tema escuro'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="main-area">
          {/* Top bar */}
          <header className="top-bar">
            {/* Esquerda: nome da empresa + seletor de mês */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--accent)' }}>◆</span>{nomeEmpresa}
              </div>
              {periodosDinamicos.length > 0 && (
                <select
                  className={`period-select${mesSelAtivo ? ' has-selection' : ''}`}
                  value={mesSelAtivo || ''}
                  onChange={e => {
                    if (!e.target.value) return
                    setMesSelAtivo(e.target.value)
                    if (!isSpecialView) setPeriodo(e.target.value)
                  }}
                  style={{ flexShrink: 0 }}
                >
                  {!mesSelAtivo && <option value="" disabled>Mês…</option>}
                  {periodosDinamicos.map(p => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Centro: dropdown de análises */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', gap: 8 }}>
              <select
                className={`period-select${isSpecialView ? ' has-selection' : ''}`}
                value={isSpecialView ? periodo : ''}
                onChange={e => {
                  if (!e.target.value) return
                  if (e.target.value === 'MES') {
                    setPeriodo(mesSelAtivo || periodosDinamicos[0]?.key || 'DADOS')
                  } else {
                    setPeriodo(e.target.value)
                  }
                }}
                style={{ flexShrink: 0, minWidth: 180 }}
              >
                {!isSpecialView && <option value="" disabled>Análises…</option>}
                {specialViews.map(([p, label]) => (
                  <option key={p} value={p}>{label}</option>
                ))}
              </select>
            </div>

            {/* Direita: sync + tema */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {lastSync && !syncing && <span className="last-sync" style={{ fontSize: 10 }}>Às {lastSync}</span>}
              <button className="sidebar-action" onClick={() => fetchData.current(true)} disabled={syncing} title={syncing ? 'Sincronizando…' : 'Sincronizar'}>
                <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none', fontSize: 15 }}>↻</span>
              </button>
              <button className="sidebar-action" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Tema claro' : 'Tema escuro'}>
                <span style={{ fontSize: 15 }}>{darkMode ? '☀️' : '🌙'}</span>
              </button>
            </div>
          </header>

          {syncError && (
            <div className="sync-banner">
              <span>⚠ {syncError}</span>
              <button onClick={() => setSyncError(null)}>×</button>
            </div>
          )}

          {/* Hero — apenas nas abas mensais */}
          {periodoData && periodoAtivo && periodo !== 'PAINEL' && (
            <div className="hero">
              <div className="hero-left">
                <div className="hero-eyebrow">Visão do mês · {nomeEmpresa}</div>
                <div className="hero-headline">
                  {contratosPagos > 0
                    ? <>{contratosPagos} <span className="accent">contratos pagos</span> em {periodoAtivo.label}.</>
                    : <>{periodoAtivo.label} — <span className="accent">{nomeEmpresa}</span></>
                  }
                </div>
                {leads > 0 && (
                  <div className="hero-sub">
                    {fmt(leads)} leads · {fmt(Number(heroMetricas.agendamentos)||0)} agendamentos · {fmt(Number(heroMetricas.realizadas)||0)} realizadas
                  </div>
                )}
              </div>
              <div className="hero-right">
                {investimento > 0 && (
                  <div className="hero-stat">
                    <div className="hero-stat-label">Investido</div>
                    <div className="hero-stat-value" style={{ color: 'var(--text-secondary)' }}>{fmtR1(investimento)}</div>
                  </div>
                )}
                {nmrr > 0 && (
                  <div className="hero-stat">
                    <div className="hero-stat-label">MRR Pago</div>
                    <div className="hero-stat-value" style={{ color: 'var(--accent)' }}>{fmtR1(nmrr)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && <div className="loading"><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span> Carregando dados…</div>}
          {error && <div className="error" style={{ margin: 24 }}>Erro ao carregar: {error}</div>}
          {!loading && !error && data && (
            <div className="page">
              {periodo==='PAINEL' ? <PainelGeralView periodoData={periodoData} periodoAtivo={periodoAtivo} nomeEmpresa={nomeEmpresa} forecast={currentData?.FORECAST} /> :
               periodo==='SEMANAS' ? <SemanasComparativo semanas={currentData?.SEMANAS} /> :
               periodo==='FORECAST' ? <ForecastView forecast={currentData?.FORECAST} forecastEquipe={data?.FORECAST_EQUIPE} registros={data?.GERAL} empresaSelecionada={empresa} /> :
               periodo==='EVOLUCAO' ? <EvolucaoMensalView periodos={periodosDinamicos} getData={(emp, key) => data?.[emp]?.[key]} empresaSelecionada={empresa} geralData={data?.GERAL || []} /> :
               periodo==='DADOS' ? <DadosEspecificosView registros={data?.GERAL} empresaAtiva={empresa} periodoAtivo={periodoAtivo} /> :
               periodo==='METAS_ORIGEM' ? <MetasOrigemView performance={data?.PERFORMANCE_ORIGEM} empresaSelecionada={empresa} /> :
               periodo==='COMPARATIVO' ? <ComparativoMensalDashboard registros={data?.GERAL} empresaSelecionada={empresa} /> :
               periodoData ? <>
                 <MetricCards metricas={periodoData.metricas} />
                 <ReuniaoCards cards={periodoData.reunioes?.cards} graficos={periodoData.reunioes?.graficos} />
                 <ReuniaoGraficos graficos={periodoData.reunioes?.graficos} />
               </> : <div className="loading">Sem dados para este período</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
