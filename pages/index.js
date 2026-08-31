import { useState, useEffect, useRef, useId } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useAnalyticsSession } from '../hooks/useAnalyticsSession'

const fmt = (n) => { const num = Number(n); return isNaN(num) ? '0' : num.toLocaleString('pt-BR') }
const fmtDec = (n) => { const num = Number(n); return isNaN(num) ? '0,0' : num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) }
const fmtR = (n) => { const num = Number(n) || 0; return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
const fmtR1 = (n) => { const num = Number(n) || 0; return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` }
const fmtNum1 = (n) => { const num = Number(n) || 0; return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }
const fmtPct = (n) => `${Number(n || 0).toFixed(1)}%`

// ── Motion: trigger de animação por viewport ───────────────────────────────
// Observa se um elemento está visível na tela agora, via IntersectionObserver
// — usado pelos componentes de barra abaixo pra só disparar a animação quando
// o gráfico entra em tela, em vez de "gastar" a animação enquanto ainda está
// fora de tela (abas com blocos/gráficos abaixo da dobra). Reflete a
// visibilidade ATUAL (não só "já viu uma vez"): se o elemento sai de tela e
// os dados mudam (troca de filtro) enquanto ele está fora, a barra some da
// tela sem animar e retoma a animação (do valor antigo pro novo) quando volta
// a ficar visível. Sem IntersectionObserver no ambiente, assume sempre
// visível (mesmo comportamento de antes).
function useInView(ref) {
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref])
  return inView
}

// ── Motion: count-up de KPIs (PR H) ───────────────────────────────────────
// Anima um valor numérico bruto de 0 (na primeira montagem) — ou do valor
// exibido anteriormente, em trocas de filtro — até o valor final, via
// requestAnimationFrame com ease-out cúbica. Devolve só o número interpolado;
// quem usa aplica o MESMO formatador já existente (fmt/fmtR1/fmtPct/...), de
// forma que o valor final exibido é sempre idêntico ao estático de antes — só
// os quadros de transição mudam, nenhuma regra de cálculo/formatação é
// duplicada ou alterada. Respeita prefers-reduced-motion (pula a animação,
// mostra o valor final direto, sem nenhum rAF rodando, independente de
// `active`). `active` (default true — usado pelos componentes de barra via
// useInView) trava o disparo da animação enquanto false: o valor fica
// congelado no último exibido até virar true.
function useAnimatedNumber(target, duration = 350, active = true) {
  const safeTarget = Number.isFinite(target) ? target : 0
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const rafRef = useRef(null)
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion) {
      displayRef.current = safeTarget
      setDisplay(safeTarget)
      return
    }
    if (!active) return
    const from = displayRef.current
    if (from === safeTarget) return
    let start = null
    const step = (ts) => {
      if (start === null) start = ts
      const t = Math.min(1, (ts - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const value = from + (safeTarget - from) * eased
      displayRef.current = value
      setDisplay(value)
      if (t < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeTarget, duration, active])
  return display
}

// Wrapper de exibição — recebe o valor BRUTO (não formatado) e a mesma função
// de formatação já usada no resto da view (fmt/fmtR1/fmtR/fmtPct/fmtDec/
// fmtNum1...). Nenhuma lógica de cálculo/formatação nova; só anima o número
// que alimenta o formatador de sempre.
function AnimatedNumber({ value, format = fmt, duration }) {
  const animated = useAnimatedNumber(value, duration)
  return format(animated)
}

// Barra de progresso animada (PR H — motion, §2) — mesmo visual de sempre
// (.metric-progress/.metric-progress-fill), largura controlada pelo mesmo
// hook de count-up dos KPIs (useAnimatedNumber) em vez do @keyframes CSS
// que só animava no mount. Cresce 0→valor tanto na primeira renderização
// quanto em qualquer troca de filtro que mude o percentual — sem duplicar
// nenhum cálculo: quem chama continua responsável por calcular pct/status,
// este componente só recebe o valor já pronto (0–100) e anima a largura.
function AnimatedBar({ pct, statusClass, small, style, fillStyle }) {
  const ref = useRef(null)
  const inView = useInView(ref)
  const clamped = Math.min(Math.max(Number(pct) || 0, 0), 100)
  const animated = useAnimatedNumber(clamped, undefined, inView)
  return (
    <div ref={ref} className={`metric-progress${small ? ' metric-progress-sm' : ''}`} style={style}>
      <div className={`metric-progress-fill${statusClass ? ` ${statusClass}` : ''}`} style={{ width: `${animated}%`, ...fillStyle }} />
    </div>
  )
}

// Preenchimento horizontal animado (0→valor) para os mini-gráficos de barra
// simples (BarChart, ProgressByOriginChart, AdditionalOriginChart) — mesmo
// hook de count-up dos KPIs/AnimatedBar; cresce tanto no mount quanto em
// qualquer troca de filtro/dado que mude o percentual, mas só dispara quando
// visível na tela (useInView). O wrapper (ref) tem sempre 100% do tamanho do
// track do chamador, independente da largura animada — mira estável pro
// IntersectionObserver, já que a barra em si começa com largura 0.
function AnimatedFillDiv({ pct, color, style }) {
  const ref = useRef(null)
  const inView = useInView(ref)
  const clamped = Math.min(Math.max(Number(pct) || 0, 0), 100)
  const animated = useAnimatedNumber(clamped, undefined, inView)
  return (
    <div ref={ref} style={{ width: '100%', height: '100%' }}>
      <div style={{ width: `${animated}%`, height: '100%', borderRadius: 5, background: color, opacity: 0.85, ...style }} />
    </div>
  )
}

// Equivalente vertical do AnimatedFillDiv, para colunas (VerticalBarChart).
// Diferente do AnimatedFillDiv, aqui o tamanho do wrapper participa do layout
// do chamador (coluna flex com os rótulos empilhados por cima) — por isso o
// wrapper usa a altura FINAL (clamped%, igual ao valor final não-animado),
// preservando exatamente a mesma altura total de conteúdo de antes. Dentro
// dele, um <div> invisível (inset:0, alvo estável pro IntersectionObserver) e
// a barra visível (absoluta, ancorada embaixo, altura normalizada em relação
// ao próprio wrapper) crescem sem alterar o tamanho do wrapper.
function AnimatedColumnFill({ pct, color, style }) {
  const ref = useRef(null)
  const inView = useInView(ref)
  const clamped = Math.min(Math.max(Number(pct) || 0, 0), 100)
  const animated = useAnimatedNumber(clamped, undefined, inView)
  const innerPct = clamped > 0 ? (animated / clamped) * 100 : 0
  return (
    <div style={{ position: 'relative', width: 34, height: `${clamped}%` }}>
      <div ref={ref} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: `${innerPct}%`, borderRadius: '5px 5px 0 0', background: color, opacity: 0.85, ...style }} />
    </div>
  )
}

// Coluna de barra SVG animada, usada por VerticalBarChartMonths e
// VerticalBarChartMonthsGeral — anima a altura via o mesmo hook de count-up;
// a posição Y é derivada da altura animada, então a barra cresce a partir da
// base do eixo (não do topo). Um <rect> invisível, com altura fixa (do topo
// até a base do eixo — não muda com a animação), serve de alvo pro
// IntersectionObserver, já que o <rect> visível some (altura 0) antes de
// entrar em tela.
function SvgBarColumn({ x, barW, chartBottom, targetH, rx, fill, opacity, value, formatVal, valFontSize, valDy, xFontSize, xLabel, xY, onMouseEnter, onMouseLeave }) {
  const ref = useRef(null)
  const inView = useInView(ref)
  const h = useAnimatedNumber(targetH, undefined, inView)
  const y = chartBottom - h
  const cx = x + barW / 2
  return (
    <g style={{ cursor: 'pointer' }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <rect ref={ref} x={x} y={0} width={barW} height={chartBottom} fill="transparent" pointerEvents="none" />
      <rect x={x} y={y} width={barW} height={h} rx={rx} fill={fill} opacity={opacity} />
      {h > 16 && <text x={cx} y={y - valDy} textAnchor="middle" fontSize={valFontSize} fill={fill} opacity="0.95" fontWeight="600">{formatVal(value)}</text>}
      <text x={cx} y={xY} textAnchor="middle" fontSize={xFontSize} fill="var(--text-muted)">{xLabel}</text>
    </g>
  )
}

// ── Charts 2.0: motion para gráficos de linha ──────────────────────────────
function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduce(mq.matches)
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange)
    return () => { mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange) }
  }, [])
  return reduce
}

// Revela um grupo de elementos SVG (linhas + marcadores) progressivamente da
// esquerda pra direita via clip-path animado — cresce de largura 0 até a
// largura total do gráfico, dando o efeito de "a linha nasce do primeiro
// ponto e se desenha até o último" pedido no briefing. Deliberadamente NÃO
// usa stroke-dasharray na própria linha (a técnica mais comum pra isso):
// aqui várias linhas já usam stroke-dasharray como PADRÃO VISUAL (Meta/
// Supermeta/Forecast tracejados vs. Real sólido) — usar a mesma propriedade
// pra animação colidiria com esse padrão. O clip-path revela todas as séries
// em sincronia sem tocar no dasharray de nenhuma. Só dispara quando `active`
// (via useInView do gráfico-pai); com prefers-reduced-motion, revela tudo
// de uma vez, sem transição.
function ChartDrawReveal({ width, height, active, duration = 550, children }) {
  const clipId = useId()
  const rectRef = useRef(null)
  const reduceMotion = usePrefersReducedMotion()
  useEffect(() => {
    const el = rectRef.current
    if (!el) return
    if (reduceMotion) {
      el.style.transition = 'none'
      el.style.width = `${width}px`
      return
    }
    if (!active) {
      el.style.transition = 'none'
      el.style.width = '0px'
      return
    }
    el.style.transition = 'none'
    el.style.width = '0px'
    // Força o browser a "commitar" a largura 0 antes de animar — senão as duas
    // mudanças de estilo colapsam num único frame e a linha aparece pronta.
    void el.getBoundingClientRect()
    el.style.transition = `width ${duration}ms var(--ease-standard, cubic-bezier(0.4,0,0.2,1))`
    el.style.width = `${width}px`
  }, [width, active, duration, reduceMotion])
  return (
    <>
      <clipPath id={clipId}>
        <rect ref={rectRef} x={0} y={0} width={reduceMotion ? width : 0} height={height} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{children}</g>
    </>
  )
}

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
            <div style={{ flex: 1, background: 'var(--bar-track)', borderRadius: 5, height: 18, overflow: 'hidden' }}>
              <AnimatedFillDiv pct={pct} color={color} />
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
            <div style={{ flex: '0 1 68%', background: 'var(--bar-track)', borderRadius: 5, height: 18, overflow: 'hidden' }}>
              <AnimatedFillDiv pct={barPct} color={color} />
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
  // Filtro só de apresentação: uma origem com reuniões=0, pagos=0 e NMRR=0 não acrescenta
  // leitura a este gráfico — mas continua existindo normalmente nos dados e na tabela
  // "Detalhamento por Origem" (esta função nunca toca a lista original).
  const comResultado = (data || []).filter(d =>
    (Number(d.realReunioes) || 0) > 0 || (Number(d.realPagos) || 0) > 0 || (Number(d.realNmrr) || 0) > 0
  )
  if (comResultado.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>Sem adicionais sem meta</div>
  }
  const max = Math.max(...comResultado.map(d => Number(d.realNmrr) || 0), 1)
  // Cor única e neutra (mesma família do card "Adicional sem Meta", que já usa .card.blue) —
  // "sem meta" não é sucesso nem fracasso, então não deve usar as cores verde/vermelho que
  // no resto do dashboard já significam "acima/abaixo da meta".
  const color = 'var(--blue)'
  return (
    <div>
      {comResultado.slice(0, 12).map((d, i) => {
        const val = Number(d.realNmrr) || 0
        const barPct = max > 0 ? (val / max) * 100 : 0
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', width: 86, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.nome}>{d.nome}</div>
            <div style={{ flex: '0 1 68%', background: 'var(--bar-track)', borderRadius: 5, height: 18, overflow: 'hidden' }}>
              <AnimatedFillDiv pct={barPct} color={color} />
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
  const wrapRef = useRef(null)
  const inView = useInView(wrapRef)
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
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 80 }} preserveAspectRatio="none">
        <ChartDrawReveal width={w} height={h} active={inView}>
          <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const isHovered = tooltip?.i === i
            return (
              <circle key={i} cx={p.x} cy={p.y} r={isHovered ? 6 : 3.5} fill={color} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ x: p.x, y: p.y, label: p.data.data, qtd: p.data.qtd, i })}
                onMouseLeave={() => setTooltip(null)} />
            )
          })}
        </ChartDrawReveal>
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
    <div className="semana-card" style={{ '--semana-color': cor }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: cor, marginBottom: 2 }}>Semana</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>{s.semana}</div>
      </div>

      {/* Bloco Marketing */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '6px 0 4px' }}>Marketing</div>
      <Row label="Leads"           value={<AnimatedNumber value={Number(s.leads) || 0} format={fmt} />}       color="#3b82f6" bold />
      <Row label="MQL %"           value={s.mql || '-'}                             color="#8b5cf6" />
      <Row label="Leads MQL"       value={s.leadsMql ? fmt(s.leadsMql) : '-'}       color="#8b5cf6" />
      <Row label="CPL"             value={s.cpl ? fmtR1(s.cpl) : '-'}              color="var(--text-secondary)" />
      <Row label="CPMQL"           value={s.cpmql != null ? fmtR1(s.cpmql) : '-'}  color="var(--text-secondary)" />
      <Row label="Invest. Ads"     value={s.investSemanal != null ? fmtR1(s.investSemanal) : '-'} color="#f97316" />

      {/* Bloco Comercial */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 4px' }}>Comercial</div>
      <Row label="Agendamentos"    value={<AnimatedNumber value={Number(s.agendamentos) || 0} format={fmt} />} color="var(--text-primary)" bold />
      <Row label="% Agend."        value={s.pctAgd || '-'}                          color="var(--text-secondary)" />
      <Row label="Realizadas"      value={<AnimatedNumber value={Number(s.realizadas) || 0} format={fmt} />}  color="var(--text-primary)" bold />
      <Row label="% Realizadas"    value={s.pctRlzd || '-'}                         color="var(--text-secondary)" />
      <Row label="Vendas"          value={<AnimatedNumber value={Number(s.contratosPagos) || 0} format={fmt} />} color="var(--green)" bold />
      <Row label="% Conv. Venda"   value={s.pctConv || '-'}                         color="var(--text-secondary)" />

      {/* Bloco Resultado */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '10px 0 4px' }}>Resultado</div>
      <Row label="Valor Vendas"    value={<AnimatedNumber value={Number(s.nmrr) || 0} format={fmtR1} />}       color="var(--amber)" bold />
      <Row label="TKM"             value={s.tkm ? fmtR1(s.tkm) : '-'}              color="var(--text-secondary)" />
      {temMeta && <>
        <Row label="Meta"          value={fmtR1(s.metaNmrr)}                        color="var(--text-secondary)" />
        <Row label="Gap"           value={gap != null ? fmtR1(Math.abs(gap)) : '-'} color={acima ? 'var(--green)' : 'var(--red)'} />
        <Row label="% Ating. Meta" value={pctAtng != null ? `${pctAtng.toFixed(1)}%` : '-'} color={acima ? 'var(--green)' : 'var(--amber)'} bold />
        {pctAtng != null && <AnimatedBar pct={pctAtng} statusClass={acima ? 'positive' : 'negative'} small style={{ margin: '2px 0 6px' }} />}
        <Row label="% Gap Restante"value={pctGap != null ? `${Math.abs(pctGap).toFixed(1)}%` : '-'} color={acima ? 'var(--green)' : 'var(--red)'} />
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

  // PR N: mesmo ToggleButton (teal/accent) já usado em Comparativo Mensal e Forecast —
  // antes esse toggle usava preenchimento sólido (var(--accent) + texto branco), um
  // terceiro visual de toggle só nesta view. Unificado ao .toggle-pill do resto do app.
  const ToggleButton = ({ ativo, onClick, children }) => (
    <button onClick={onClick} className="toggle-pill toggle-pill-sm"
      style={{ background: ativo ? 'var(--accent-light)' : 'transparent', borderColor: ativo ? 'var(--accent-border)' : 'var(--border)', color: ativo ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {children}
    </button>
  )

  return (
    <div style={{ width: '100%' }}>
      <div className="view-header">
        <div className="view-header-title">Por Semana</div>
      </div>

      {/* Barra de filtros */}
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 24, padding: '12px 16px' }}>
        <span className="field-label" style={{ display: 'inline', marginBottom: 0, marginRight: 4 }}>Visualizar</span>
        <ToggleButton ativo={modo === 'mes'} onClick={() => setModo('mes')}>Mês selecionado</ToggleButton>
        <ToggleButton ativo={modo === 'comparar'} onClick={() => setModo('comparar')}>Comparar semana</ToggleButton>
        <div className="topbar-divider" />
        {modo === 'mes' ? (
          <select className="field-input" value={mesFinal} onChange={e => setMesSel(e.target.value)}>
            {mesesDisp.map(mk => (
              <option key={mk} value={mk}>{monthMeta[mk]?.label || mk}</option>
            ))}
          </select>
        ) : (
          <select className="field-input" value={semanaFinal} onChange={e => setSemanaSel(e.target.value)}>
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
          <div key={grupo.key} className="semanas-grid stagger-children">
            {grupo.dados.map((s, si) => (
              <SemanaCard key={si} s={s} cor={grupo.cor} />
            ))}
          </div>
        ))
      ) : (
        /* Modo comparar: cards compactos lado a lado */
        <div className="semanas-grid-comparar stagger-children">
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
  // Regra granular de Origem (MQL/FMQL separados) — usada só nos blocos "por Origem"
  // abaixo. Painel Geral não é a Visão do Mês, então não usa o agrupamento em "IB".
  const gfGranular = periodoData.reunioes?.graficosGranular || {}
  const mesLabel = periodoAtivo?.label || ''

  // helpers
  const v   = (n) => (n == null || n === '') ? '-' : n
  const r1  = (n) => { const x = Number(n); return isNaN(x) || x === 0 ? '-' : fmtR1(x) }
  const f0  = (n) => { const x = Number(n); return isNaN(x) || x === 0 ? '-' : fmt(x) }
  const pct = (n) => { const x = Number(n); return isNaN(x) ? '-' : `${x.toFixed(1)}%` }

  // ── Tops — corrigido: campo é .nome, não .label ──
  const origemReunioes = (gfGranular.reunioesPorOrigem  || []).filter(o => o.nome).sort((a,b) => (b.qtd||0)-(a.qtd||0))[0]
  const origemNmrr     = (gfGranular.valorPagoPorOrigem || []).filter(o => o.nome).sort((a,b) => (b.valor||0)-(a.valor||0))[0]
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
  const origemRows = (gfGranular.valorPagoPorOrigem || [])
    .filter(o => o.nome && o.nome !== 'SEM ORIGEM')
    .map(o => {
      const reus = (gfGranular.reunioesPorOrigem || []).find(r => r.nome === o.nome)
      return { origem: o.nome, reunioes: reus?.qtd || 0, pagos: o.qtd || 0, nmrr: o.valor || 0 }
    })
    .sort((a, b) => b.nmrr - a.nmrr)
  const totalNmrrOrigem = origemRows.reduce((s, r) => s + r.nmrr, 0)

  // ── Componentes internos ──
  // raw/format (opcional) anima o número principal de cada bloco via AnimatedNumber;
  // value (string já formatada, comportamento de sempre) continua funcionando igual
  // para todo o resto — raw/format é só usado nos stats "big" desta view.
  const Stat = ({ label, value, raw, format, color, big, sub }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: big ? 22 : 15, fontWeight: 700, color: color || 'var(--text-primary)', lineHeight: 1.1 }}>
        {raw !== undefined ? <AnimatedNumber value={raw} format={format} /> : value}
      </span>
      {sub && <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', marginTop: 2 }}>{sub}</span>}
    </div>
  )

  // Depth 2.0 (§6, accent glow): mapeia a cor sólida já usada no título/strip de cada
  // Block para o token "-glow" (rgba) correspondente, definido em globals.css — mesma
  // paleta semântica de sempre (Marketing=azul, Comercial=verde, Resultado=âmbar,
  // Pace/Performance por Origem=teal/roxo), só acrescenta o halo do .concept-block.
  const CONCEPT_GLOW = {
    '#3b82f6': 'var(--blue-glow)',
    '#10b981': 'var(--green-glow)',
    '#f59e0b': 'var(--amber-glow)',
    '#14b8a6': 'var(--teal-glow)',
    '#8b5cf6': 'var(--purple-glow)',
  }
  const Block = ({ title, color, children }) => (
    <div className="concept-block" style={{ '--concept-color': color || 'var(--accent)', '--concept-glow': CONCEPT_GLOW[color] || 'var(--accent-glow)', padding: '20px 22px' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Cabeçalho executivo ── */}
      <div className="hero-elevated" style={{ borderRadius: 16, padding: '22px 26px' }}>
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
            { label: 'Investimento', raw: m.investimento, format: r1, color: '#f97316', big: true },
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
            { label: `Agendamentos${m.taxaAgendamento ? ` (${pct(m.taxaAgendamento)})` : ''}`, raw: m.agendamentos, format: f0, big: true },
            { label: `Realizadas${m.taxaRealizadas ? ` (${pct(m.taxaRealizadas)})` : ''}`,     value: f0(m.realizadas) },
          ]} />
          <Divider />
          <Row2 items={[
            { label: `Pagos${c.taxa ? ` (${pct(c.taxa)} conv.)` : ''}`, raw: c.pagos, format: f0, color: '#10b981', big: true },
            { label: 'Pipeline Ativo', value: valorNaMesa > 0 ? r1(valorNaMesa) : '-', sub: 'Valor na Mesa' },
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
            { label: 'NMRR', raw: m.nmrr, format: r1, color: '#f59e0b', big: true },
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
          {pctMeta != null && (
            <AnimatedBar pct={pctMeta} statusClass={pctMeta >= 100 ? 'positive' : 'warning'} style={{ marginTop: 8 }} />
          )}
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
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  {['Origem','Reuniões','Pagos','NMRR','% do Total'].map(h => (
                    <th key={h} className={h === 'Origem' ? '' : 'is-numeric'}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {origemRows.map((row, i) => {
                  const pctNmrr = totalNmrrOrigem > 0 ? (row.nmrr / totalNmrrOrigem * 100).toFixed(1) : '0.0'
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.origem}</td>
                      <td className="is-numeric">{fmt(row.reunioes)}</td>
                      <td className="is-numeric" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(row.pagos)}</td>
                      <td className="is-numeric" style={{ color: 'var(--amber)', fontWeight: 700 }}>{fmtR1(row.nmrr)}</td>
                      <td className="is-numeric">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <div style={{ width: 60, height: 5, background: 'var(--bar-track)', borderRadius: 9 }}>
                            <AnimatedFillDiv pct={Number(pctNmrr)} color="#8b5cf6" style={{ borderRadius: 9 }} />
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
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 20 }}>Métricas do Mês</div>
      <div className="cards-grid">
        {[
          { label: 'Leads', raw: metricas.leads, format: fmt, sub: `MQL: ${fmtPct(metricas.mql)}`, color: 'blue' },
          { label: 'Agendamentos', raw: metricas.agendamentos, format: fmt, sub: `Taxa: ${fmtPct(metricas.taxaAgendamento)}`, color: 'blue' },
          { label: 'Realizadas', raw: metricas.realizadas, format: fmt, sub: `Comparec.: ${fmtPct(metricas.taxaRealizadas)}`, color: '' },
          { label: 'Contratos Pagos', raw: metricas.contratosPagos, format: fmt, sub: `Vendidos: ${fmt(metricas.contratosVendidos)}`, color: 'green' },
          { label: 'NMRR', raw: metricas.nmrr, format: fmtR1, sub: `TKM: ${fmtR1(metricas.tkm)}`, color: 'amber' },
          { label: 'Investimento', raw: metricas.investimento, format: fmtR1, sub: `CPL: ${fmtR1(metricas.cpl)}`, color: 'purple' },
          { label: 'CAC', raw: metricas.cac, format: fmtR1, sub: `por contrato | TKM: ${fmtR1(metricas.tkm)}`, color: 'teal' },
          { label: 'Gap da Meta', value: gap, sub: gapPositive ? '✓ Meta ultrapassada' : '⚠ Abaixo da meta', color: gapPositive ? 'green' : 'red' },
        ].map((c, i) => (
          <div key={i} className={`card ${c.color}`}>
            <div className="card-label">{c.label}</div>
            <div className="card-value">{c.raw !== undefined ? <AnimatedNumber value={c.raw} format={c.format} /> : c.value}</div>
            <div className="card-sub">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReuniaoCards({ cards, empresa, graficos }) {
  if (!cards || !cards.total) return null
  const isMO = String(empresa||'').toUpperCase() === 'MO'
  const dsoLabel = isMO ? 'DSO Vendido' : 'DSV Vendido'
  const dsoValor = isMO ? (cards.dsoTotal || 0) : (cards.dsvOnlyTotal || 0)
  const PIPELINE_STATUSES = ['PM','FECHOU','RECALL','R2','CONTRATO','ASSINADO']
  const valorPipelineAtivo = (graficos?.pipeline || [])
    .filter(p => PIPELINE_STATUSES.includes(String(p.nome||'').toUpperCase()))
    .reduce((s, p) => s + (p.valor || 0), 0)
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 20, marginTop: 40 }}>Resumo das Reuniões</div>
      <div className="cards-grid">
        <div className="card"><div className="card-label">Total Reuniões</div><div className="card-value"><AnimatedNumber value={cards.total} format={fmt} /></div></div>
        <div className="card green"><div className="card-label">Fechamentos (PAGO)</div><div className="card-value"><AnimatedNumber value={cards.pagos} format={fmt} /></div><div className="card-sub">Taxa: {fmtPct(cards.taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Total</div><div className="card-value"><AnimatedNumber value={cards.valorTotal} format={fmtR1} /></div></div>
        <div className="card amber"><div className="card-label">Pipeline Ativo</div><div className="card-value">{valorPipelineAtivo > 0 ? <AnimatedNumber value={valorPipelineAtivo} format={fmtR1} /> : '-'}</div><div className="card-sub">Valor na Mesa</div></div>
        <div className="card blue"><div className="card-label">{dsoLabel}</div><div className="card-value">{dsoValor > 0 ? <AnimatedNumber value={dsoValor} format={fmtR1} /> : '-'}</div></div>
        <div className="card"><div className="card-label">Fugiram</div><div className="card-value"><AnimatedNumber value={cards.fugiu} format={fmt} /></div></div>
        <div className="card red"><div className="card-label">Perdidos (FORA)</div><div className="card-value"><AnimatedNumber value={cards.fora} format={fmt} /></div></div>
      </div>
    </div>
  )
}

function FunilPrincipal({ metricas }) {
  if (!metricas || metricas.leads === undefined) return null
  const leads          = Number(metricas.leads)          || 0
  const agendamentos   = Number(metricas.agendamentos)   || 0
  const realizadas     = Number(metricas.realizadas)     || 0
  const contratosPagos = Number(metricas.contratosPagos) || 0
  const nmrr           = Number(metricas.nmrr)           || 0

  // Fontes e fórmulas — inalteradas desde a primeira versão do Funil Principal.
  const pct = (num, den) => den > 0 ? (num / den) * 100 : null
  const fmtTaxa = (v) => v === null ? '—' : fmtPct(v)
  // var(--accent)/var(--text-muted) têm bom contraste nos dois temas — nada aqui é
  // concatenado com sufixo de alpha, então usar var(--...) diretamente é seguro.
  const taxaColor = (v) => v === null ? 'var(--text-muted)' : v > 100 ? '#f97316' : 'var(--accent)'

  const t1 = pct(agendamentos, leads)
  const t2 = pct(realizadas, agendamentos)
  const t3 = pct(contratosPagos, realizadas)
  const tTotal = pct(contratosPagos, leads)

  // Largura de cada etapa do funil (topo de cada faixa) — puramente estética, nunca usada em
  // nenhuma conversão exibida. Representa o volume da etapa em relação a Leads (100%), com
  // piso mínimo só para a faixa não desaparecer visualmente, e sempre não-crescente entre
  // etapas (mesmo se o dado da planilha vier fora de ordem). Como o texto agora fica FORA da
  // silhueta (não mais dentro dela), o piso pode ser bem mais baixo que na versão anterior.
  const WIDTH_MIN = 8
  const stageWidth = (valor, prevWidth) =>
    leads > 0 ? Math.min(prevWidth, Math.max(WIDTH_MIN, (valor / leads) * 100)) : prevWidth

  const wLeads        = 100
  const wAgendamentos = stageWidth(agendamentos, wLeads)
  const wRealizadas   = stageWidth(realizadas, wAgendamentos)
  const wContratos    = stageWidth(contratosPagos, wRealizadas)
  // Fecho visual da última faixa — desce um pouco além do próprio topo pra a base do funil
  // terminar numa ponta, sem representar nenhum dado novo.
  const wFecho = Math.max(4, wContratos - 6)

  // Topo/base de cada faixa: a base da faixa N é sempre igual ao topo da faixa N+1, então as
  // faixas se encaixam sem nenhuma emenda/gap — uma silhueta contínua de funil de verdade.
  const ETAPAS = [
    { key: 'leads',        label: 'Leads',           raw: leads,          top: wLeads,        bottom: wAgendamentos, taxa: null },
    { key: 'agendamentos', label: 'Agendamentos',    raw: agendamentos,   top: wAgendamentos, bottom: wRealizadas,   taxa: t1 },
    { key: 'realizadas',   label: 'Realizadas',      raw: realizadas,     top: wRealizadas,   bottom: wContratos,    taxa: t2 },
    { key: 'pagos',        label: 'Contratos Pagos', raw: contratosPagos, top: wContratos,    bottom: wFecho,        taxa: t3 },
  ]
  const clipFor = (top, bottom) => {
    const tl = (100 - top) / 2, tr = 100 - tl
    const bl = (100 - bottom) / 2, br = 100 - bl
    return `polygon(${tl}% 0, ${tr}% 0, ${br}% 100%, ${bl}% 100%)`
  }

  return (
    <div className="funil-wrap">
      <div className="funil-header">
        <div className="funil-title">Funil Principal</div>
        <div className="funil-subtitle">{fmt(leads)} leads até {fmt(contratosPagos)} contratos pagos</div>
      </div>

      <div className="chart-card funil-card">
        <div className="funil-grid">
          {ETAPAS.map((e, i) => (
            <div className="funil-grid-row" key={e.key} style={{ '--i': i }}>
              <div className="funil-label-cell">
                <span className="funil-label-name">{e.label}</span>
                <span className="funil-label-value"><AnimatedNumber value={e.raw} format={fmt} /></span>
              </div>
              <div className="funil-shape-cell">
                <div className="funil-band" style={{ clipPath: clipFor(e.top, e.bottom) }} />
              </div>
              <div className="funil-pct-cell">
                {/* Leads (i===0) não tem conversão de entrada — as demais sempre mostram um
                    valor, com "—" quando o denominador da etapa anterior for zero. */}
                {i > 0 && <span style={{ color: taxaColor(e.taxa) }}>{fmtTaxa(e.taxa)}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* NMRR — resultado financeiro final; fecha o funil como base de destaque, sem
            seguir o afunilamento das etapas de contagem acima. */}
        <div className="funil-nmrr">
          <span className="funil-nmrr-label">NMRR · resultado do mês</span>
          <span className="funil-nmrr-value">{nmrr > 0 ? <AnimatedNumber value={nmrr} format={fmtR1} /> : '—'}</span>
        </div>

        <div className="funil-footer">
          <span>Conversão total do funil</span>
          <strong style={{ color: tTotal !== null ? 'var(--accent)' : 'var(--text-muted)' }}>{fmtTaxa(tTotal)}</strong>
          <span className="funil-footer-note">Contratos Pagos ÷ Leads</span>
        </div>
      </div>

      <style>{`
        .funil-wrap { margin-top: 40px; margin-bottom: 8px; }
        .funil-header { margin-bottom: 16px; }
        .funil-title { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); }
        .funil-subtitle { font-size: 12px; color: var(--text-secondary); margin-top: 3px; }

        .funil-card { padding: 30px 26px 26px; display: flex; flex-direction: column; align-items: center; }

        .funil-grid {
          --funil-row-h: 60px;
          width: 100%; max-width: 620px;
          display: flex; flex-direction: column;
        }
        .funil-grid-row {
          display: grid;
          grid-template-columns: minmax(96px, 150px) 1fr minmax(52px, 76px);
          align-items: stretch;
          column-gap: 18px;
          height: var(--funil-row-h);
        }

        .funil-label-cell { display: flex; flex-direction: column; justify-content: center; }
        .funil-label-name { font-size: 12px; color: var(--text-secondary); }
        .funil-label-value { font-size: 21px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.25; }

        .funil-shape-cell { position: relative; }
        .funil-band {
          position: absolute; inset: 0;
          /* PR M: tokens em vez de hex fixo — mesmo teal visual, reage ao tema. */
          background-image: linear-gradient(180deg, var(--teal) 0%, var(--accent) 100%);
          background-size: 100% calc(var(--funil-row-h) * 4);
          background-position: 0 calc(var(--funil-row-h) * var(--i) * -1);
        }

        .funil-pct-cell { display: flex; align-items: center; justify-content: flex-end; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }

        .funil-nmrr {
          width: 100%; max-width: 620px; margin-top: 14px; box-sizing: border-box;
          background: linear-gradient(135deg, rgba(245,158,11,0.14) 0%, rgba(245,158,11,0.04) 100%);
          border: 1.5px solid rgba(245,158,11,0.35);
          border-radius: 10px;
          padding: 14px 20px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .funil-nmrr-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
        .funil-nmrr-value { font-size: 24px; font-weight: 800; color: var(--amber); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }

        .funil-footer {
          margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border);
          width: 100%; max-width: 620px; box-sizing: border-box;
          display: flex; align-items: baseline; justify-content: center; gap: 8px;
          font-size: 12px; color: var(--text-muted);
        }
        .funil-footer strong { font-size: 15px; }
        .funil-footer-note { opacity: 0.65; }

        @media (max-width: 640px) {
          .funil-card { padding: 20px 14px 18px; }
          .funil-grid { --funil-row-h: 42px; }
          .funil-grid-row { grid-template-columns: minmax(72px, 108px) 1fr minmax(40px, 56px); column-gap: 10px; }
          .funil-label-name { font-size: 10.5px; }
          .funil-label-value { font-size: 16px; }
          .funil-pct-cell { font-size: 12.5px; }
          .funil-nmrr { flex-direction: column; align-items: flex-start; gap: 4px; padding: 12px 14px; }
          .funil-nmrr-label { white-space: nowrap; }
          .funil-nmrr-value { font-size: 19px; }
          .funil-footer { flex-direction: column; align-items: center; gap: 2px; }
          .funil-footer-note { display: block; }
        }
      `}</style>
    </div>
  )
}

function ReuniaoGraficos({ graficos }) {
  if (!graficos) return null
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 20, marginTop: 40 }}>Análise das Reuniões</div>
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
              <AnimatedColumnFill pct={pct} color={color} />
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
  // Origem granular (MQL/FMQL separados) — Comparativo Mensal não é a Visão do Mês,
  // então não usa o agrupamento em "IB". Reaplica sobre origemRaw.
  const rows = (registros || []).map(r => ({ ...r, origem: normalizarOrigemGranular(r.origemRaw || r.origem) }))
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
      className="toggle-pill"
      style={{
        background: active ? 'var(--accent-light)' : 'transparent',
        borderColor: active ? 'var(--accent-border)' : 'var(--border)',
        color: active ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {label}
    </button>
  )

  const eventoLabel = evento === 'REUNIAO' ? 'Reuniões' : 'Vendas'

  if (!rows.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados na aba REUNIOES_GERAL</div>

  return (
    <div>
      <div className="view-header">
        <div className="view-header-title">Comparativo Mensal</div>
        <div className="view-header-sub">{empresaAtiva} · {eventoLabel}</div>
      </div>

      <div className="filter-bar" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div className="field-label">Empresa</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {empresas.map(e => (
                <ToggleButton key={e} active={empresaAtiva === e} label={e} onClick={() => { setEmpresaSel(e); setPessoaSel(''); setOrigemSel('') }} />
              ))}
            </div>
          </div>

          <div>
            <div className="field-label">Posição</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COMPARATIVO_POSICOES.map(p => (
                <ToggleButton key={p.key} active={posicaoKey === p.key} label={p.label} onClick={() => { setPosicaoKey(p.key); setPessoaSel(''); setOrigemSel('') }} />
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>{posicao.label}</span>
              <select value={pessoaAtiva} onChange={e => { setPessoaSel(e.target.value); setOrigemSel('') }} className="field-input">
                {pessoas.length === 0 && <option value="">Sem dados</option>}
                {pessoas.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>

            <div>
              <div className="field-label">Evento</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ToggleButton active={evento === 'REUNIAO'} label="Reunião" onClick={() => setEvento('REUNIAO')} />
                <ToggleButton active={evento === 'VENDAS'} label="Vendas" onClick={() => setEvento('VENDAS')} />
              </div>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="field-label" style={{ marginBottom: 0 }}>Origem</span>
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
          <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div className="card"><div className="card-label">Total no Período</div><div className="card-value"><AnimatedNumber value={totalQtd} format={fmt} /></div><div className="card-sub">{eventoLabel.toLowerCase()}</div></div>
            <div className="card blue"><div className="card-label">Média Mensal</div><div className="card-value"><AnimatedNumber value={mediaMensal} format={fmtDec} /></div></div>
            <div className="card green"><div className="card-label">Melhor Mês</div><div className="card-value">{melhorMes ? <AnimatedNumber value={melhorMes.qtd} format={fmt} /> : '-'}</div><div className="card-sub">{melhorMes?.nome || ''}</div></div>
            {evento === 'VENDAS' && (
              <div className="card amber"><div className="card-label">Valor Total Pago</div><div className="card-value"><AnimatedNumber value={totalValor} format={fmtR} /></div></div>
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
              color={evento === 'VENDAS' ? 'var(--green)' : 'var(--blue)'}
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

  // Origem granular (MQL/FMQL separados) — Dados Específicos não é a Visão do Mês,
  // então não usa o agrupamento em "IB". Reaplica sobre origemRaw, sem alterar
  // nenhum outro campo do registro.
  const rows = (registros || []).map(r => ({ ...r, origem: normalizarOrigemGranular(r.origemRaw || r.origem) }))
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

  // Nota: origem já chega granular (MQL/FMQL separados) via o remap de `rows` acima,
  // então canonical() não reagrupa Origem em "IB" — só RECUPERACAO/INDICACAO/status,
  // que não mudaram.
  const canonical = (key, value) => {
    const v = norm(value)
    if (!v) return ''
    if (key === 'origem') {
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
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
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
      {/* Mesmo .view-header das demais análises — antes só existia um eyebrow de
          filtro ("Filtros — Dados Específicos"), sem nenhum título de página. */}
      <div className="view-header">
        <div className="view-header-title">Dados Específicos</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Filtros</div>
      <div className="filter-bar" style={{ padding: 16, marginBottom: 32 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          <SelectFiltro label="Empresa" value={filtros.empresa} onChange={v=>setFiltro('empresa', v)} options={unique('empresa')} allLabel="Todas" />
          <SelectFiltro label="Mês" value={filtros.mes} onChange={v=>setFiltro('mes', v)} options={unique('mes')} />
          <SelectFiltro label="Ano" value={filtros.ano} onChange={v=>setFiltro('ano', v)} options={unique('ano')} />
          <SelectFiltro label="SDR" value={filtros.sdr} onChange={v=>setFiltro('sdr', v)} options={unique('sdr')} />
          <SelectFiltro label="Closer" value={filtros.closer} onChange={v=>setFiltro('closer', v)} options={unique('closer')} />
          <SelectFiltro label="Origem" value={filtros.origem} onChange={v=>setFiltro('origem', v)} options={unique('origem')} allLabel="Todas" />
          <SelectFiltro label="Status" value={filtros.status} onChange={v=>setFiltro('status', v)} options={unique('status')} />
          <SelectFiltro label="Serviço" value={filtros.servico} onChange={v=>setFiltro('servico', v)} options={unique('servico')} />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="field-label" style={{ marginBottom: 0 }}>Data inicial</span>
            <input type="date" value={filtros.dataIni} onChange={e=>setFiltro('dataIni', e.target.value)} className="field-input" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="field-label" style={{ marginBottom: 0 }}>Data final</span>
            <input type="date" value={filtros.dataFim} onChange={e=>setFiltro('dataFim', e.target.value)} className="field-input" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: 'span 2' }}>
            <span className="field-label" style={{ marginBottom: 0 }}>Buscar cliente/informação</span>
            <input value={filtros.busca} onChange={e=>setFiltro('busca', e.target.value)} placeholder="Digite um nome, origem, SDR..." className="field-input" />
          </label>
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Resumo filtrado</div>
      <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div className="card"><div className="card-label">Total de Reuniões</div><div className="card-value"><AnimatedNumber value={total} format={fmt} /></div></div>
        <div className="card green"><div className="card-label">Contratos Pagos</div><div className="card-value"><AnimatedNumber value={pagos.length} format={fmt} /></div><div className="card-sub">Taxa de conversão: {fmtPct(taxa)}</div></div>
        <div className="card amber"><div className="card-label">Valor Pago Total</div><div className="card-value"><AnimatedNumber value={sum(pagos)} format={fmtR} /></div></div>
        <div className="card amber"><div className="card-label">NMRR</div><div className="card-value"><AnimatedNumber value={nmrr} format={fmtR} /></div><div className="card-sub">TKM: {fmtR(tkm)}</div></div>
        <div className="card blue"><div className="card-label">DSV / DSO</div><div className="card-value"><AnimatedNumber value={sum(dsvDso)} format={fmtR} /></div><div className="card-sub">{fmt(dsvDso.length)} contratos</div></div>
        <div className="card blue"><div className="card-label">Pipeline Ativo</div><div className="card-value"><AnimatedNumber value={pipelineRows.length} format={fmt} /></div></div>
        <div className="card purple"><div className="card-label">Valor Pipeline</div><div className="card-value"><AnimatedNumber value={sum(pipelineRows)} format={fmtR} /></div><div className="card-sub">{fmt(pipelineRows.length)} oportunidades</div></div>
        <div className="card red"><div className="card-label">Perdidos/Fugiram</div><div className="card-value"><AnimatedNumber value={filtrados.filter(r => ['FORA','FUGIU'].includes(norm(r.status))).length} format={fmt} /></div></div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Gráficos filtrados</div>
      <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
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

      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Registros filtrados</div>
      <div className="table-shell">
        <table className="data-table zebra">
          <thead>
            <tr>
              {[
                { label: 'Empresa', key: 'empresa' }, { label: 'Mês', key: 'mes' }, { label: 'Ano', key: null },
                { label: 'Origem', key: 'origem' }, { label: 'SDR', key: 'sdr' }, { label: 'Closer', key: 'closer' },
                { label: 'Data', key: 'data' }, { label: 'Serviço', key: null }, { label: 'Cliente', key: 'cliente' },
                { label: 'Nota', key: null }, { label: 'Valor', key: 'valor', numeric: true }, { label: 'Status', key: 'status' },
                { label: 'Data FUP', key: null },
              ].map(({ label, key, numeric }) => (
                <th key={label} onClick={key ? () => handleSort(key) : undefined}
                  className={`${numeric ? 'is-numeric ' : ''}${key ? 'is-sortable' : ''}`}>
                  {label}{key && sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginaRows.map((r, i) => (
              <tr key={i}>
                <td>{r.empresa}</td>
                <td>{r.mes}</td>
                <td>{r.ano}</td>
                <td>{r.origem}</td>
                <td>{r.sdr}</td>
                <td>{r.closer}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.data}</td>
                <td>{r.servico}</td>
                <td style={{ minWidth: 140 }}>{r.cliente}</td>
                <td>{r.nota}</td>
                <td className="is-numeric" style={{ color: 'var(--amber)' }}>{fmtR(r.valor)}</td>
                <td style={{ color: STATUS_COLORS[norm(r.status)] || 'var(--text-secondary)', fontWeight: 600 }}>{r.status}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{r.dataFup}</td>
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


function MetasOrigemView({ performance, empresaSelecionada, periodoAtivo }) {
  const [filters, setFilters] = useState({
    empresa: empresaSelecionada || 'TODOS',
    ano: periodoAtivo?.ano || 'TODOS',
    mes: periodoAtivo?.mesNome || 'TODOS',
    origem: 'TODOS',
  })
  const [ordenarPor, setOrdenarPor] = useState('pctNmrr')
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  // Sincroniza Empresa/Ano/Mês com o período selecionado no topo do dashboard — mesmo
  // padrão já usado em DadosEspecificosView. "TODOS" continua disponível nos 3 selects para
  // quem quiser uma leitura histórica; "Origem" nunca é sincronizado (não existe seleção de
  // origem fora desta aba).
  useEffect(() => {
    setFilters(f => ({
      ...f,
      empresa: empresaSelecionada || 'TODOS',
      ano: periodoAtivo?.ano || 'TODOS',
      mes: periodoAtivo?.mesNome || 'TODOS',
    }))
  }, [empresaSelecionada, periodoAtivo?.key])

  const clean = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const norm = (v) => String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Nota: origem já chega granular (MQL/FMQL separados) via normalizarOrigem() abaixo
  // (usa origemRaw), então canonical() não reagrupa Origem em "IB" — só
  // RECUPERACAO/INDICACAO/status, que não mudaram.
  const canonical = (key, value) => {
    const v = norm(value)
    if (!v) return ''
    if (key === 'origem') {
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

  // Metas por Origem não é a Visão do Mês — regra granular (MQL/FMQL separados),
  // via a mesma normalizarOrigemGranular() usada nas demais views (função de
  // módulo, definida perto de normalizarOrigemForecast). Usa origemRaw (preservado
  // por parsePerformanceOrigem em lib/sheets.js) quando disponível; se a aba
  // PERFORMANCE_ORIGEM só chegar com valores já agrupados (ex.: "IB") na fonte,
  // origemRaw será igual a esse valor agrupado e a separação real depende de a
  // planilha ter linhas próprias por origem — nada aqui inventa dado.
  const normalizarOrigem = (v) => normalizarOrigemGranular(v)

  // Soma real/meta de um grupo de linhas de PERFORMANCE_ORIGEM e recalcula gap/% — mesma
  // fórmula de sempre (real-meta; real/meta*100 quando meta>0), só reaproveitada tanto para
  // agregar por empresa×ano×mês×origem (list) quanto por origem sozinha (performance por
  // origem, abaixo). Nenhum cálculo novo.
  const withGapPct = (r) => ({
    ...r,
    gapReunioes: r.realReunioes - r.metaReunioes,
    pctReunioes: r.metaReunioes > 0 ? (r.realReunioes / r.metaReunioes) * 100 : 0,
    gapPagos: r.realPagos - r.metaPagos,
    pctPagos: r.metaPagos > 0 ? (r.realPagos / r.metaPagos) * 100 : 0,
    gapNmrr: r.realNmrr - r.metaNmrr,
    pctNmrr: r.metaNmrr > 0 ? (r.realNmrr / r.metaNmrr) * 100 : 0,
  })

  const rawList = Array.isArray(performance) ? performance : []
  const list = Object.values(rawList.reduce((acc, r) => {
    const empresa = norm(r.empresa)
    const ano = String(r.ano || '').trim()
    const mes = norm(r.mes)
    const origem = normalizarOrigem(r.origemRaw || r.origem)
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
  }, {})).map(withGapPct)

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
  // Meta agregada 0 não é "0% de performance" — é ausência de meta para o recorte atual.
  // Card fica neutro (sem verde/vermelho) nesse caso, em vez de cair em vermelho por padrão.
  const cardClass = (real, meta) => meta > 0 ? (real >= meta ? 'green' : 'red') : ''
  // Sinal +/- consistente nos 3 Gaps (Reuniões, Pagos e agora também NMRR).
  const fmtGap = (gap, fmtFn) => `${Number(gap || 0) >= 0 ? '+' : ''}${fmtFn(gap)}`
  const gapColor = (gap) => Number(gap || 0) >= 0 ? 'var(--green)' : 'var(--red)'

  // Performance por Origem — uma linha por origem, somando todas as combinações ano/mês que
  // passarem pelos filtros atuais (com um único mês selecionado, que é o padrão agora, cada
  // origem já corresponde a exatamente 1 linha, então esta soma não muda nada na prática; ela
  // só evita origem duplicada quando o usuário escolhe "TODOS" em Ano/Mês para uma leitura
  // histórica). Mesmo critério "tem meta" (temMeta) já usado para separar Adicional sem Meta
  // — inclui a origem se qualquer uma das 3 metas estiver configurada.
  const performancePorOrigemBase = Object.values(
    filtradosComMeta.reduce((acc, r) => {
      const k = r.origem
      if (!acc[k]) acc[k] = { origem: k, metaReunioes: 0, realReunioes: 0, metaPagos: 0, realPagos: 0, metaNmrr: 0, realNmrr: 0 }
      acc[k].metaReunioes += r.metaReunioes
      acc[k].realReunioes += r.realReunioes
      acc[k].metaPagos += r.metaPagos
      acc[k].realPagos += r.realPagos
      acc[k].metaNmrr += r.metaNmrr
      acc[k].realNmrr += r.realNmrr
      return acc
    }, {})
  ).map(withGapPct)

  const ORDER_OPTIONS = [
    { key: 'pctNmrr', label: '% NMRR' },
    { key: 'pctPagos', label: '% Pagos' },
    { key: 'pctReunioes', label: '% Reuniões' },
    { key: 'realNmrr', label: 'NMRR Real' },
    { key: 'origem', label: 'Origem' },
  ]

  const adicionaisSemMeta = [...filtradosSemMeta]
    .filter(r => (Number(r.realReunioes) || 0) > 0 || (Number(r.realPagos) || 0) > 0 || (Number(r.realNmrr) || 0) > 0)
    .sort((a, b) => (Number(b.realNmrr) || 0) - (Number(a.realNmrr) || 0))
    .map(r => ({ nome: r.origem, valor: Number(r.realNmrr) || 0, realReunioes: Number(r.realReunioes) || 0, realPagos: Number(r.realPagos) || 0, realNmrr: Number(r.realNmrr) || 0 }))
  // Mesma condição usada para decidir se o gráfico "Adicionais sem Meta" tem algo a mostrar
  // — reaproveitada aqui para decidir se o realizado "sem meta" precisa ser absorvido.
  const temOutras = adicionaisSemMeta.length > 0

  // "Outras" (AI) / "Outros" (MO) é o card de origem com meta que funciona como cesta
  // catch-all — o realizado das origens sem meta própria (mesmo agregado do card
  // "Adicional sem Meta" do topo) pertence a essa cesta, não a um card à parte. Fundimos
  // aqui, no lado realizado, mantendo a meta do card OUTRAS/OUTROS como está; se essa
  // origem não tiver meta configurada no recorte atual, não há em que fundir e o card
  // avulso "sem meta" volta a aparecer no grid (fallback abaixo, comportamento anterior).
  const outrasComMetaIdx = performancePorOrigemBase.findIndex(r => r.origem === 'OUTRAS' || r.origem === 'OUTROS')
  const outrasAbsorveuSemMeta = temOutras && outrasComMetaIdx !== -1
  const performancePorOrigemMerged = !outrasAbsorveuSemMeta ? performancePorOrigemBase : performancePorOrigemBase.map((r, i) =>
    i !== outrasComMetaIdx ? r : withGapPct({
      ...r,
      realReunioes: r.realReunioes + realReunioesAdicional,
      realPagos: r.realPagos + realPagosAdicional,
      realNmrr: r.realNmrr + realNmrrAdicional,
    })
  )

  const performancePorOrigem = [...performancePorOrigemMerged].sort((a, b) => {
    if (ordenarPor === 'origem') return a.origem.localeCompare(b.origem, 'pt-BR')
    return (Number(b[ordenarPor]) || 0) - (Number(a[ordenarPor]) || 0)
  })

  // Ordenação da tabela de detalhamento — mesmo padrão já usado em DadosEspecificosView
  // (clique no cabeçalho ordena; clique de novo inverte a direção).
  const TEXT_COLUMNS = new Set(['empresa', 'ano', 'mes', 'origem'])
  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const filtradosOrdenados = !sortKey ? filtrados : [...filtrados].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (TEXT_COLUMNS.has(sortKey)) return dir * String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'pt-BR')
    return dir * ((Number(a[sortKey]) || 0) - (Number(b[sortKey]) || 0))
  })

  if (!list.length) return <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: '32px 0', textAlign: 'center' }}>Sem dados de metas por origem. Atualize a aba PERFORMANCE_ORIGEM na planilha.</div>

  const Select = ({ label, value, options, onChange }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>
      <select value={value} onChange={e=>onChange(e.target.value)} className="field-input" style={{ minWidth: 150 }}>
        <option value="TODOS">Todos</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )

  // Um dos 3 cards de resumo (Reuniões/Pagos/NMRR) — mesmo padrão visual para os três:
  // título, Real em destaque, Meta, Gap e % da meta. Quando a meta agregada é 0 (nenhuma
  // meta configurada para o recorte atual), mostra "Meta não configurada" em vez de
  // Gap/% — nunca trata meta 0 como 0% de performance.
  const ResumoCard = ({ label, real, meta, gap, pctVal, fmtFn }) => (
    <div className={`card ${cardClass(real, meta)}`}>
      <div className="card-label">{label}</div>
      <div className="card-value"><AnimatedNumber value={real} format={fmtFn} /></div>
      {meta > 0 ? (
        <>
          <div className="card-sub">Meta: {fmtFn(meta)}</div>
          <div className="card-sub" style={{ color: gapColor(gap) }}>Gap: {fmtGap(gap, fmtFn)} · {fmtPct(pctVal)} da meta</div>
          <AnimatedBar pct={pctVal} statusClass={real >= meta ? 'positive' : 'negative'} style={{ marginTop: 8 }} />
        </>
      ) : (
        <div className="card-sub">Meta não configurada</div>
      )}
    </div>
  )

  // Um bloco de origem no grid "Performance por Origem" — 3 linhas (Reuniões/Pagos/NMRR),
  // cada uma com status independente (verde = meta atingida, vermelho = abaixo, neutro =
  // sem meta configurada para aquela métrica específica nesta origem).
  const OrigemMetricRow = ({ label, real, meta, pctVal, fmtFn }) => {
    const status = meta > 0 ? (real >= meta ? 'positive' : 'negative') : 'neutral'
    return (
      <div className="mo-metric-row">
        <span className="mo-metric-label">{label}</span>
        <span className="mo-metric-values">{fmtFn(real)} / {meta > 0 ? fmtFn(meta) : '—'}</span>
        <span className={`mo-metric-pct ${status}`}>{meta > 0 ? fmtPct(pctVal) : '—'}</span>
        {meta > 0 && (
          <AnimatedBar pct={pctVal} statusClass={status} small />
        )}
      </div>
    )
  }

  return (
    <div>
      {/* Mesmo .view-header das demais análises — mesma correção de Dados Específicos. */}
      <div className="view-header">
        <div className="view-header-title">Metas por Origem</div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Filtros</div>
      <div className="filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px', marginBottom: 32 }}>
        <Select label="Empresa" value={filters.empresa} options={opts.empresa} onChange={v=>setFilter('empresa', v)} />
        <Select label="Ano" value={filters.ano} options={opts.ano} onChange={v=>setFilter('ano', v)} />
        <Select label="Mês" value={filters.mes} options={opts.mes} onChange={v=>setFilter('mes', v)} />
        <Select label="Origem" value={filters.origem} options={opts.origem} onChange={v=>setFilter('origem', v)} />
      </div>

      {/* ── Cards de resumo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 32 }}>
        <ResumoCard label="Reuniões" real={realReunioes} meta={metaReunioes} gap={realReunioes - metaReunioes} pctVal={pctReunioes} fmtFn={fmtNum1} />
        <ResumoCard label="Pagos" real={realPagos} meta={metaPagos} gap={realPagos - metaPagos} pctVal={pctPagos} fmtFn={fmtNum1} />
        <ResumoCard label="NMRR" real={realNmrr} meta={metaNmrr} gap={realNmrr - metaNmrr} pctVal={pctNmrr} fmtFn={fmtR1} />
        <div className="card blue"><div className="card-label">Adicional sem Meta</div><div className="card-value">{fmtR1(realNmrrAdicional)}</div><div className="card-sub">{fmtNum1(realReunioesAdicional)} reuniões · {fmtNum1(realPagosAdicional)} pagos</div></div>
      </div>

      {/* ── Performance por Origem ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Performance por Origem</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          Ordenar por
          <select value={ordenarPor} onChange={e => setOrdenarPor(e.target.value)} className="field-input" style={{ minWidth: 160 }}>
            {ORDER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>
      {performancePorOrigem.length === 0 && !temOutras ? (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>Nenhuma origem com meta configurada para os filtros atuais.</div>
      ) : (
        <div className="mo-perf-grid stagger-children" style={{ marginBottom: 32 }}>
          {performancePorOrigem.map(r => (
            <div className="mo-perf-card" key={r.origem}>
              <div className="mo-perf-title">{r.origem}</div>
              <OrigemMetricRow label="Reuniões" real={r.realReunioes} meta={r.metaReunioes} pctVal={r.pctReunioes} fmtFn={fmtNum1} />
              <OrigemMetricRow label="Pagos" real={r.realPagos} meta={r.metaPagos} pctVal={r.pctPagos} fmtFn={fmtNum1} />
              <OrigemMetricRow label="NMRR" real={r.realNmrr} meta={r.metaNmrr} pctVal={r.pctNmrr} fmtFn={fmtR1} />
            </div>
          ))}
          {/* Fallback: só aparece um card avulso "sem meta" quando NÃO existe origem
              OUTRAS/OUTROS com meta configurada no recorte atual para absorver esse
              realizado (outrasAbsorveuSemMeta === false) — caso normal, esses números já
              estão somados dentro do card OUTRAS/OUTROS acima, no mesmo formato dos
              demais cards da grade (Reuniões/Pagos/NMRR real ÷ meta). */}
          {temOutras && !outrasAbsorveuSemMeta && (
            <div className="mo-perf-card mo-perf-card-outras" key="outras">
              <div className="mo-perf-title">Outras <span className="mo-perf-outras-tag">sem meta</span></div>
              <div className="mo-metric-row"><span className="mo-metric-label">Reuniões</span><span className="mo-metric-values">{fmtNum1(realReunioesAdicional)}</span></div>
              <div className="mo-metric-row"><span className="mo-metric-label">Pagos</span><span className="mo-metric-values">{fmtNum1(realPagosAdicional)}</span></div>
              <div className="mo-metric-row"><span className="mo-metric-label">NMRR</span><span className="mo-metric-values">{fmtR1(realNmrrAdicional)}</span></div>
            </div>
          )}
        </div>
      )}

      {/* Adicionais sem meta — só acrescenta leitura (quais origens específicas, sem meta,
          geraram receita) além do card agregado acima; por isso continua existindo. */}
      {adicionaisSemMeta.length > 0 && (
        <div className="chart-card" style={{ marginBottom: 32 }}>
          <div className="chart-title">Adicionais sem Meta — detalhamento por origem</div>
          <AdditionalOriginChart data={adicionaisSemMeta} />
        </div>
      )}

      {/* ── Detalhamento por Origem ── */}
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Detalhamento por Origem</div>
      <div className="table-shell">
        <table className="data-table">
          <thead>
            <tr>
              {[
                ['Empresa','empresa'], ['Ano','ano'], ['Mês','mes'], ['Origem','origem'],
                ['Meta Reuniões','metaReunioes'], ['Real Reuniões','realReunioes'], ['Gap','gapReunioes'], ['%','pctReunioes'],
                ['Meta Pagos','metaPagos'], ['Real Pagos','realPagos'], ['Gap','gapPagos'], ['%','pctPagos'],
                ['Meta NMRR','metaNmrr'], ['Real NMRR','realNmrr'], ['Gap','gapNmrr'], ['%','pctNmrr'],
              ].map(([h, key], i) => (
                <th key={h} onClick={() => handleSort(key)}
                  className={`is-sortable${i < 4 ? '' : ' is-numeric'}`}>
                  {h}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradosOrdenados.map((r, i) => (
              <tr key={i}>
                <td>{r.empresa}</td><td>{r.ano}</td><td>{r.mes}</td><td style={{ fontWeight: 600 }}>{r.origem}</td>
                <td className="is-numeric">{fmtNum1(r.metaReunioes)}</td><td className="is-numeric">{fmtNum1(r.realReunioes)}</td><td className="is-numeric" style={{ color: gapColor(r.gapReunioes) }}>{fmtGap(r.gapReunioes, fmtNum1)}</td><td className="is-numeric" style={{ color: r.metaReunioes > 0 ? (r.pctReunioes >= 100 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' }}>{r.metaReunioes > 0 ? fmtPct(r.pctReunioes) : '—'}</td>
                <td className="is-numeric">{fmtNum1(r.metaPagos)}</td><td className="is-numeric">{fmtNum1(r.realPagos)}</td><td className="is-numeric" style={{ color: gapColor(r.gapPagos) }}>{fmtGap(r.gapPagos, fmtNum1)}</td><td className="is-numeric" style={{ color: r.metaPagos > 0 ? (r.pctPagos >= 100 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' }}>{r.metaPagos > 0 ? fmtPct(r.pctPagos) : '—'}</td>
                <td className="is-numeric">{fmtR1(r.metaNmrr)}</td><td className="is-numeric" style={{ color: 'var(--amber)' }}>{fmtR1(r.realNmrr)}</td><td className="is-numeric" style={{ color: gapColor(r.gapNmrr) }}>{fmtGap(r.gapNmrr, fmtR1)}</td><td className="is-numeric" style={{ color: r.metaNmrr > 0 ? (r.pctNmrr >= 100 ? 'var(--green)' : 'var(--red)') : 'var(--text-muted)' }}>{r.metaNmrr > 0 ? fmtPct(r.pctNmrr) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        /* 3 colunas fixas no desktop — evita o desequilíbrio de um grid auto-fit (ex.: 5
           cards numa linha + 1 "órfão" sozinho na linha seguinte, com 6 origens). Não
           depende de quantas origens existem: sempre 3 colunas até 900px, 2 até 480px,
           1 abaixo disso — a última linha simplesmente fica parcial se a contagem não for
           múltipla da coluna, como qualquer grid comum. */
        .mo-perf-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .mo-perf-card {
          /* Depth 2.0 §11: hierarquia Resumo > Origem > Tabela — este card fica um
             degrau abaixo dos cards de Resumo (.card, shadow-md), por isso usa
             shadow-sm como base; hover sobe até shadow-md, nunca ultrapassa o Resumo. */
          background: linear-gradient(150deg, var(--surface-2) 0%, var(--surface-1) 65%);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-card);
          box-shadow: var(--shadow-sm), var(--card-highlight-sm);
          padding: 16px 18px;
          transition: box-shadow var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
          animation: fadeIn var(--duration-normal) var(--ease-entrance) both;
        }
        .mo-perf-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-md), var(--card-highlight); }
        .mo-perf-card-outras { border-style: dashed; }
        .mo-perf-outras-tag { font-size: 9.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-left: 6px; }
        .mo-perf-title { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .mo-metric-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--border); }
        .mo-metric-row:first-of-type { border-top: none; }
        .mo-metric-row .metric-progress { flex-basis: 100%; margin-top: 2px; }
        .mo-metric-label { font-size: 11px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; width: 62px; flex-shrink: 0; }
        .mo-metric-values { font-size: 12px; color: var(--text-secondary); flex: 1; text-align: right; font-variant-numeric: tabular-nums; }
        .mo-metric-pct { font-size: 13px; font-weight: 700; width: 58px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .mo-metric-pct.positive { color: var(--green); }
        .mo-metric-pct.negative { color: var(--red); }
        .mo-metric-pct.neutral { color: var(--text-muted); }
        @media (max-width: 900px) { .mo-perf-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) {
          .mo-perf-grid { grid-template-columns: 1fr; }
          .mo-metric-label { width: 50px; font-size: 10px; }
          .mo-metric-values { font-size: 11px; }
        }
      `}</style>
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

// ── Helpers para Forecast por Indicador ──────────────────────────────────────
// Funções novas, isoladas. NÃO alteram isOperationalDay/countOperationalDays/
// buildDailyForecast — o Forecast atual continua intacto.

// Data atual no fuso América/São Paulo via offset fixo UTC-3.
// Vercel roda em UTC; sem biblioteca, subtrair 3h é conservador e correto
// durante horário padrão (BRST não é considerado nesta versão simples).
function todayBRT() {
  const now = new Date()
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  return { year: brt.getUTCFullYear(), month: brt.getUTCMonth() + 1, day: brt.getUTCDate() }
}

// Algoritmo de Meeus/Jones/Butcher para calcular a data da Páscoa.
function easterDate(year) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

// Feriados nacionais oficiais brasileiros.
// Fixos: Lei 9.093/95, CF/88, Lei 14.759/2023.
// Móvel: Sexta-feira Santa = Páscoa − 2 (feriado nacional, Lei 9.093/95).
// Corpus Christi NÃO incluído — é ponto facultativo federal, não feriado nacional.
// Carnaval NÃO incluído — ponto facultativo federal, não feriado nacional.
function isNationalHoliday(year, month, day) {
  // Fixos (mes, dia)
  const fixed = [[1,1],[4,21],[5,1],[9,7],[10,12],[11,2],[11,15],[11,20],[12,25]]
  if (fixed.some(([m, d]) => m === month && d === day)) return true
  // Móvel: apenas Sexta-feira Santa (Páscoa − 2)
  const easter = easterDate(year)
  const easterMs = Date.UTC(year, easter.month - 1, easter.day)
  const targetMs = Date.UTC(year, month - 1, day)
  const diff = Math.round((targetMs - easterMs) / 86400000)
  return diff === -2
}

// Dia útil: segunda a sexta, excluindo feriados nacionais.
function isWorkingDay(year, month, day) {
  const dt = new Date(year, month - 1, day)
  const dow = dt.getDay()
  if (dow === 0 || dow === 6) return false
  return !isNationalHoliday(year, month, day)
}

// Conta dias úteis (segunda-sexta, sem feriados) em [start, end] de um mês/ano.
function countWorkingDays({ year, month, start = 1, end }) {
  const total = new Date(year, month, 0).getDate()
  const ini = Math.max(1, Number(start) || 1)
  const fim = Math.min(total, Number(end) || total)
  let count = 0
  for (let d = ini; d <= fim; d++) {
    if (isWorkingDay(year, month, d)) count++
  }
  return count
}

// Calcula stats de um indicador pré-agregado (sem série histórica diária real).
// realizado: total acumulado no mês até a data de corte da planilha.
// ano/mesNome: para calcular dias totais do mês e decorridos até hoje (BRT).
// dayMode: 'calendar' (todos os dias) | 'working' (dias úteis Mon–Sex excl. feriados nacionais)
// Retorna: { realizado, mediaDia, projecao, diasDecorridos, diasTotais, estado, dayMode }
//   estado: 'current' | 'past' | 'future'
function calcIndicatorStats({ realizado, anoStr, mesNome, dayMode = 'working' }) {
  const year = Number(anoStr)
  const month = monthNumberFromName(mesNome)
  const brt = todayBRT()
  const isCurrent = year === brt.year && month === brt.month
  const isPast    = year < brt.year || (year === brt.year && month < brt.month)
  const estado    = isCurrent ? 'current' : isPast ? 'past' : 'future'
  const totalDiasCalendario = new Date(year, month, 0).getDate()
  const diasTotais = dayMode === 'calendar'
    ? totalDiasCalendario
    : countWorkingDays({ year, month, start: 1 })
  const diasDecorridos = isCurrent
    ? (dayMode === 'calendar'
        ? brt.day
        : countWorkingDays({ year, month, start: 1, end: brt.day }))
    : 0
  const val = Number(realizado) || 0
  const mediaDia = isCurrent && diasDecorridos > 0 ? val / diasDecorridos : 0
  const projecao = isCurrent && mediaDia > 0 ? mediaDia * diasTotais : null
  return { realizado: val, mediaDia, projecao, diasDecorridos, diasTotais, estado, dayMode }
}
// ─────────────────────────────────────────────────────────────────────────────

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
// unidade: 'qty' = quantidade (fmtNum1), 'money' = monetário (fmtR/fmtR1).
// Quando omitido, mantém comportamento original via `tipo`.
function ForecastCurveChart({ dados, tipo, unidade }) {
  const [tooltip, setTooltip] = useState(null)
  const wrapRef = useRef(null)
  const inView = useInView(wrapRef)

  if (!dados) return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Sem dados</div>

  const w = 720, h = 260, padX = 34, padY = 22
  const hasMeta = dados.meta > 0
  const hasSuper = dados.supermeta > 0

  // Para indicadores com série diária: cortar real no último dia com dado real
  // (evita linha horizontal entrando no futuro)
  const realSeries = dados.singlePoint
    ? dados.real
    : dados.real.filter(p => p.dia <= (dados.ultimoDiaComDado || dados.cutoffDia || dados.totalDias))

  const allVals = [
    ...realSeries.map(p => p.valor),
    ...(hasMeta ? dados.metaLine.map(p => p.valor) : []),
    ...(hasSuper ? dados.superLine.map(p => p.valor) : []),
    ...dados.previsaoLine.map(p => p.valor),
  ]
  const max = Math.max(...allVals, 1)
  const xPos = (dia) => padX + ((dia - 1) / Math.max(dados.totalDias - 1, 1)) * (w - padX * 2)
  const yPos = (valor) => h - padY - (valor / max) * (h - padY * 2)
  const line = (arr) => arr.map(p => `${xPos(p.dia)},${yPos(p.valor)}`).join(' ')
  const isQty = unidade === 'qty' || tipo === 'SDR'
  const fmtAxis = isQty ? fmtNum1 : fmtR1
  const fmtVal  = isQty ? fmtNum1 : fmtR

  const lastReal = realSeries.length > 0 ? realSeries[realSeries.length - 1] : null
  const lastMeta = hasMeta ? dados.metaLine[dados.metaLine.length - 1] : null
  const lastSuper = hasSuper ? dados.superLine[dados.superLine.length - 1] : null
  const lastPrevisao = dados.previsaoLine.length > 0 ? dados.previsaoLine[dados.previsaoLine.length - 1] : null

  // Paleta semântica (Charts 2.0, §14/§5/§6): Real = accent (sólido, maior
  // contraste, "cor principal"); Meta = neutro/teal discreto (tracejado —
  // corrige o traço sólido de antes, que não distinguia Meta de Real por
  // forma, só por cor); Supermeta = tratamento parecido com Meta mas
  // visualmente distinguível (traço mais fechado); Forecast/Previsão = âmbar
  // suave, tracejado. Real vs Forecast nunca dependem só da cor — sólido vs.
  // tracejado já resolve isso (§27, acessibilidade).
  const COLOR_REAL = 'var(--accent)'
  const COLOR_META = 'var(--text-secondary)'
  const COLOR_SUPER = 'var(--purple)'
  const COLOR_FORECAST = 'var(--amber)'

  const endPoints = [
    lastReal && { key: 'real', label: 'Realizado', color: COLOR_REAL, last: lastReal },
    lastMeta && { key: 'meta', label: 'Meta', color: COLOR_META, last: lastMeta },
    lastSuper && { key: 'super', label: 'Supermeta', color: COLOR_SUPER, last: lastSuper },
    lastPrevisao && { key: 'prev', label: 'Previsão', color: COLOR_FORECAST, last: lastPrevisao },
  ].filter(Boolean)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 280 }} preserveAspectRatio="none">
        {/* Grid — suporte, nunca protagonista: opacity baixa, tokens de tema
            (não hexadecimais fixos), então acompanha dark/light automaticamente. */}
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <g key={i}>
            <line x1={padX} x2={w-padX} y1={padY + g*(h-padY*2)} y2={padY + g*(h-padY*2)} stroke="var(--border-subtle)" />
            <text x="4" y={padY + g*(h-padY*2) + 4} fill="var(--text-muted)" fontSize="10" fontVariantNumeric="tabular-nums">{fmtAxis(max * (1-g))}</text>
          </g>
        ))}

        {/* Lines — somente séries com valor real; desenho animado (nasce do
            primeiro ponto, "varre" até o último) via ChartDrawReveal, disparado
            só quando o gráfico entra na viewport (useInView). */}
        <ChartDrawReveal width={w} height={h} active={inView}>
          {hasMeta && <polyline points={line(dados.metaLine)} fill="none" stroke={COLOR_META} strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />}
          {hasSuper && <polyline points={line(dados.superLine)} fill="none" stroke={COLOR_SUPER} strokeWidth="2" strokeDasharray="2 4" strokeLinecap="round" opacity="0.85" />}
          {dados.previsaoLine.length > 1 && <polyline points={line(dados.previsaoLine)} fill="none" stroke={COLOR_FORECAST} strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" opacity="0.85" />}
          {/* Realizado: para singlePoint somente o ponto; para séries diárias, linha até ultimoDiaComDado */}
          {!dados.singlePoint && realSeries.length > 1 && <polyline points={line(realSeries)} fill="none" stroke={COLOR_REAL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Pontos intermediários da série real — discretos (§11: não dezenas de
              círculos enormes) */}
          {!dados.singlePoint && realSeries.map((p, i) => i < realSeries.length - 1 && p.valor > 0 && (
            <circle key={i} cx={xPos(p.dia)} cy={yPos(p.valor)} r="2.5" fill={COLOR_REAL} />
          ))}

          {/* Marcadores finais com hover — padrão discreto, mais evidente no hover */}
          {endPoints.map((s) => {
            const cx = xPos(s.last.dia)
            const cy = yPos(s.last.valor)
            const isHovered = tooltip?.key === s.key
            return (
              <g key={s.key}>
                <circle cx={cx} cy={cy} r={isHovered ? 9 : 7} fill="none" stroke={s.color} strokeWidth="1.5" opacity={isHovered ? 0.8 : 0.45} />
                <circle cx={cx} cy={cy} r={isHovered ? 6 : 5} fill={s.color}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setTooltip({ key: s.key, label: s.label, valor: s.last.valor, color: s.color, meta: dados.meta })}
                  onMouseLeave={() => setTooltip(null)}
                />
              </g>
            )
          })}
        </ChartDrawReveal>

        {/* Rótulos de dia */}
        {[1, 5, 10, 15, 20, 25, dados.totalDias].filter((d, i, arr) => d <= dados.totalDias && arr.indexOf(d) === i).map(d => (
          <text key={d} x={xPos(d)} y={h-4} fill="var(--text-muted)" fontSize="10" textAnchor="middle" fontVariantNumeric="tabular-nums">{d}</text>
        ))}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="tooltip-box" style={{ position: 'absolute', top: 8, right: 8, borderLeft: `3px solid ${tooltip.color}` }}>
          <div className="tooltip-label">{tooltip.label} — valor final</div>
          <div className="tooltip-value" style={{ color: tooltip.color }}>
            {fmtVal(tooltip.valor)}
            {(tooltip.key === 'real' || tooltip.key === 'prev') && tooltip.meta > 0 && (
              <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6 }}>
                → {Math.round((tooltip.valor / tooltip.meta) * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legenda dinâmica — somente séries que realmente existem */}
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'center', fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
        {lastReal && <span><b style={{ color: COLOR_REAL }}>●</b> Realizado</span>}
        {lastMeta && <span><b style={{ color: COLOR_META }}>--</b> Meta</span>}
        {lastSuper && <span><b style={{ color: COLOR_SUPER }}>··</b> Supermeta</span>}
        {lastPrevisao && <span><b style={{ color: COLOR_FORECAST }}>--</b> Previsão</span>}
      </div>
    </div>
  )
}

// ── Normalização de Origem — regra granular (MQL e FMQL separados) ──────────
// Usada em todas as views EXCETO Visão do Mês (que mantém MQL+FMQL agrupados em
// "IB" via normalizeOrigem, em lib/sheets.js). Idêntica à regra agrupada, exceto
// que MQL vira "MQL" e as variantes de FMQL viram "FMQL". RECUPERAÇÃO e INDICAÇÃO
// permanecem exatamente como na regra agrupada — só a separação MQL/FMQL muda.
// Não confundir com normalizarOrigemForecast() abaixo: aquela função também separa
// "MÊS PAS" de "RECUPERAÇÃO", uma regra própria do Forecast/Evolução Mensal que
// não deve se espalhar para as demais views.
function normalizarOrigemGranular(v) {
  const s = String(v || '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!s) return 'SEM ORIGEM'
  if (s === 'MQL') return 'MQL'
  if (['FMQL', 'F/MQL', 'F MQL'].includes(s)) return 'FMQL'
  if (['RECUP', 'RECUPERACAO', 'REC. BASE', 'MES PAS', 'MES PASSADO'].includes(s)) return 'RECUPERAÇÃO'
  if (['INDIC', 'INDICACAO'].includes(s)) return 'INDICAÇÃO'
  return s || 'SEM ORIGEM'
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

// ── Helpers de gráfico para Forecast por Indicador ───────────────────────────

// Indicadores SEM série diária real: produz ponto único no dia corrente + linha de forecast.
// NÃO distribui o total pelos dias anteriores.
function buildSinglePointForecastData({ realizado, projecao, meta, dayMode, anoStr, mesNome, estado }) {
  const year = Number(anoStr)
  const month = monthNumberFromName(mesNome)
  const totalDias = new Date(year, month, 0).getDate()
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1)
  const brt = todayBRT()
  const isCurrent = estado === 'current'
  const cutoffDia = isCurrent ? Math.min(brt.day, totalDias) : totalDias
  const metaNum = Number(meta) || 0
  const val = Number(realizado) || 0
  const proj = (isCurrent && projecao !== null) ? Number(projecao) || 0 : val

  // real: somente o ponto atual — sem linha histórica, sem zeros antes
  const real = [{ dia: cutoffDia, valor: val }]

  // previsaoLine: só do cutoff em diante (não fabricar pontos antes)
  const gapFuturo = proj - val
  const opRestantes = isCurrent
    ? (dayMode === 'calendar'
        ? Math.max(totalDias - cutoffDia, 0)
        : countWorkingDays({ year, month, start: cutoffDia + 1, end: totalDias }))
    : 0
  const previsaoLine = isCurrent
    ? dias.filter(d => d >= cutoffDia).map(d => {
        if (d === cutoffDia) return { dia: d, valor: val }
        const avanco = dayMode === 'calendar'
          ? (d - cutoffDia)
          : countWorkingDays({ year, month, start: cutoffDia + 1, end: d })
        return { dia: d, valor: val + (opRestantes > 0 ? gapFuturo * avanco / opRestantes : 0) }
      })
    : [{ dia: cutoffDia, valor: val }]

  // metaLine: linear proporcional ao dayMode
  const metaTotais = dayMode === 'calendar' ? totalDias : countWorkingDays({ year, month, start: 1 })
  const metaLine = dias.map(d => {
    if (metaNum === 0) return { dia: d, valor: 0 }
    const ate = dayMode === 'calendar' ? d : countWorkingDays({ year, month, start: 1, end: d })
    return { dia: d, valor: metaTotais > 0 ? (metaNum / metaTotais) * ate : 0 }
  })

  const diasDecorridos = isCurrent
    ? (dayMode === 'calendar' ? cutoffDia : countWorkingDays({ year, month, start: 1, end: brt.day }))
    : 0
  const diasTotais = dayMode === 'calendar' ? totalDias : countWorkingDays({ year, month, start: 1 })

  return {
    dias, totalDias, realizado: val, meta: metaNum, supermeta: 0,
    pctMeta: metaNum > 0 ? (val / metaNum) * 100 : 0,
    previsaoFinal: proj, mediaDia: 0, cutoffDia, ultimoDiaComDado: cutoffDia,
    diasOperacionaisMes: diasTotais, diasOperacionaisDecorridos: diasDecorridos,
    diasOperacionaisRestantes: opRestantes,
    real, metaLine, superLine: dias.map(d => ({ dia: d, valor: 0 })), previsaoLine,
    singlePoint: true,
  }
}

// NMRR: série diária real via REUNIOES_GERAL usando countWorkingDays (Mon–Sex + feriados nacionais).
// NÃO usa buildDailyForecast — esse helper usa countOperationalDays (exclui só domingo).
// Shape de retorno idêntico ao de buildDailyForecast para compatibilidade com ForecastCurveChart.
function buildNmrrIndicadorData({ registros, empresa, mes, ano, meta }) {
  const empNorm = String(empresa).toUpperCase()
  const mesNorm = String(mes).toUpperCase()
  const anoNorm = String(ano)
  const year = Number(anoNorm)
  const month = monthNumberFromName(mesNorm)
  const totalDias = new Date(year, month, 0).getDate()
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1)
  const porDia = Object.fromEntries(dias.map(d => [d, 0]))

  // Acumular NMRR por dia (PAGO, excluindo DSV e DSO — mesmo critério do cards/sheets.js)
  ;(registros || []).forEach(r => {
    if (String(r.empresa || '').toUpperCase() !== empNorm) return
    if (String(r.mes || '').toUpperCase() !== mesNorm) return
    if (String(r.ano || '') !== anoNorm) return
    if (String(r.status || '').toUpperCase().trim() !== 'PAGO') return
    const servico = String(r.servico || '').toUpperCase().trim()
    if (servico === 'DSV' || servico === 'DSO') return
    const d = dayFromDate(r.data)
    if (!d || d > totalDias) return
    porDia[d] += Number(r.valor) || 0
  })

  let acum = 0, ultimoDiaComDado = 0
  const real = dias.map(d => {
    acum += porDia[d] || 0
    if (porDia[d] > 0) ultimoDiaComDado = d
    return { dia: d, valor: acum }
  })
  const realizado = acum

  // cutoff via todayBRT — consistente com calcIndicatorStats do card
  const brt = todayBRT()
  const isCurrent = year === brt.year && month === brt.month
  const isPast = year < brt.year || (year === brt.year && month < brt.month)
  const cutoffDia = isCurrent ? Math.min(brt.day, totalDias) : (ultimoDiaComDado || totalDias)

  // Dias úteis via countWorkingDays (Mon–Sex + feriados nacionais) — mesma regra do card
  const diasTotaisWD = countWorkingDays({ year, month, start: 1 })
  const diasDecWD = isCurrent
    ? countWorkingDays({ year, month, start: 1, end: brt.day })
    : (isPast ? diasTotaisWD : 0)
  const diasRestWD = isCurrent ? countWorkingDays({ year, month, start: cutoffDia + 1, end: totalDias }) : 0

  const metaNum = Number(meta) || 0
  const mediaDia = diasDecWD > 0 ? realizado / diasDecWD : 0
  // forecast = mesma fórmula que calcIndicatorStats usa: mediaDia * diasTotais
  const previsaoFinal = isCurrent && mediaDia > 0 ? mediaDia * diasTotaisWD : realizado

  const gapFuturo = previsaoFinal - realizado
  const previsaoLine = dias.map(d => {
    if (d <= cutoffDia) return { dia: d, valor: real[d - 1].valor }
    if (!isCurrent) return { dia: d, valor: realizado }
    const op = countWorkingDays({ year, month, start: cutoffDia + 1, end: d })
    return { dia: d, valor: realizado + (diasRestWD > 0 ? gapFuturo * op / diasRestWD : 0) }
  })

  const metaLine = dias.map(d => {
    if (metaNum === 0) return { dia: d, valor: 0 }
    const ate = countWorkingDays({ year, month, start: 1, end: d })
    return { dia: d, valor: diasTotaisWD > 0 ? (metaNum / diasTotaisWD) * ate : 0 }
  })

  return {
    dias, totalDias, realizado, meta: metaNum, supermeta: 0,
    pctMeta: metaNum > 0 ? (realizado / metaNum) * 100 : 0,
    previsaoFinal, mediaDia, cutoffDia, ultimoDiaComDado,
    diasOperacionaisMes: diasTotaisWD, diasOperacionaisDecorridos: diasDecWD, diasOperacionaisRestantes: diasRestWD,
    real, metaLine, superLine: dias.map(d => ({ dia: d, valor: 0 })), previsaoLine,
    singlePoint: false,
  }
}

// Reuniões: adapta evolucao [{data, qtd}] em curva acumulada para ForecastCurveChart.
function buildReunioesIndicadorData({ evolucao, anoStr, mesNome, estado }) {
  const year = Number(anoStr)
  const month = monthNumberFromName(mesNome)
  const totalDias = new Date(year, month, 0).getDate()
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1)
  const brt = todayBRT()
  const isCurrent = estado === 'current'

  const porDia = {}
  ;(evolucao || []).forEach(e => {
    const d = dayFromDate(e.data)
    if (d && d >= 1 && d <= totalDias) porDia[d] = (porDia[d] || 0) + (e.qtd || 0)
  })

  let acum = 0, ultimoDiaComDado = 0
  const real = dias.map(d => {
    acum += porDia[d] || 0
    if (porDia[d]) ultimoDiaComDado = d
    return { dia: d, valor: acum }
  })
  const realizado = acum
  const cutoffDia = isCurrent ? Math.min(brt.day, totalDias) : (ultimoDiaComDado || totalDias)

  const diasTotaisWD = countWorkingDays({ year, month, start: 1 })
  const diasDecWD = isCurrent ? countWorkingDays({ year, month, start: 1, end: brt.day }) : diasTotaisWD
  const diasRestWD = isCurrent ? countWorkingDays({ year, month, start: cutoffDia + 1, end: totalDias }) : 0
  const mediaDia = diasDecWD > 0 ? realizado / diasDecWD : 0
  const previsaoFinal = isCurrent ? realizado + mediaDia * diasRestWD : realizado
  const gapFuturo = previsaoFinal - realizado

  const previsaoLine = dias.map(d => {
    if (d <= cutoffDia) return { dia: d, valor: real[d - 1].valor }
    if (!isCurrent) return { dia: d, valor: realizado }
    const op = countWorkingDays({ year, month, start: cutoffDia + 1, end: d })
    return { dia: d, valor: realizado + (diasRestWD > 0 ? gapFuturo * op / diasRestWD : 0) }
  })

  return {
    dias, totalDias, realizado, meta: 0, supermeta: 0, pctMeta: 0,
    previsaoFinal, mediaDia, cutoffDia, ultimoDiaComDado,
    diasOperacionaisMes: diasTotaisWD, diasOperacionaisDecorridos: diasDecWD, diasOperacionaisRestantes: diasRestWD,
    real, metaLine: dias.map(d => ({ dia: d, valor: 0 })),
    superLine: dias.map(d => ({ dia: d, valor: 0 })), previsaoLine,
    singlePoint: false,
  }
}

// DSV (AI) / DSO (MO): curva acumulada real via REUNIOES_GERAL filtrado por serviço.
function buildDsvIndicadorData({ registros, empresa, mes, ano, isMO }) {
  const servicoAlvo = isMO ? 'DSO' : 'DSV'
  const empNorm = String(empresa).toUpperCase()
  const mesNorm = String(mes).toUpperCase()
  const anoNorm = String(ano)
  const totalDias = daysInMonth(anoNorm, mesNorm)
  const dias = Array.from({ length: totalDias }, (_, i) => i + 1)
  const porDia = Object.fromEntries(dias.map(d => [d, 0]))

  ;(registros || []).forEach(r => {
    if (String(r.empresa || '').toUpperCase() !== empNorm) return
    if (String(r.mes || '').toUpperCase() !== mesNorm) return
    if (String(r.ano || '') !== anoNorm) return
    if (String(r.status || '').toUpperCase().trim() !== 'PAGO') return
    if (String(r.servico || '').toUpperCase().trim() !== servicoAlvo) return
    const d = dayFromDate(r.data)
    if (!d || d > totalDias) return
    porDia[d] += Number(r.valor) || 0
  })

  let acum = 0, ultimoDiaComDado = 0
  const real = dias.map(d => {
    acum += porDia[d] || 0
    if (porDia[d] > 0) ultimoDiaComDado = d
    return { dia: d, valor: acum }
  })
  const realizado = acum
  const mesAtual = isCurrentSelectedMonth(anoNorm, mesNorm)
  const today = new Date()
  const cutoffDia = mesAtual ? Math.min(today.getDate(), totalDias) : (ultimoDiaComDado || totalDias)

  // Usar countWorkingDays (Mon–Sex + feriados nacionais) consistente com o card
  const year = Number(anoNorm)
  const month = monthNumberFromName(mesNorm)
  const diasTotaisWD = countWorkingDays({ year, month, start: 1 })
  const diasDecWD = mesAtual ? countWorkingDays({ year, month, start: 1, end: today.getDate() }) : diasTotaisWD
  const diasRestWD = mesAtual ? countWorkingDays({ year, month, start: cutoffDia + 1, end: totalDias }) : 0
  const mediaDia = diasDecWD > 0 ? realizado / diasDecWD : 0
  const previsaoFinal = mesAtual ? realizado + mediaDia * diasRestWD : realizado
  const gapFuturo = previsaoFinal - realizado

  const previsaoLine = dias.map(d => {
    if (d <= cutoffDia) return { dia: d, valor: real[d - 1].valor }
    if (!mesAtual) return { dia: d, valor: realizado }
    const op = countWorkingDays({ year, month, start: cutoffDia + 1, end: d })
    return { dia: d, valor: realizado + (diasRestWD > 0 ? gapFuturo * op / diasRestWD : 0) }
  })

  return {
    dias, totalDias, realizado, meta: 0, supermeta: 0, pctMeta: 0,
    previsaoFinal, mediaDia, cutoffDia, ultimoDiaComDado,
    diasOperacionaisMes: diasTotaisWD, diasOperacionaisDecorridos: diasDecWD, diasOperacionaisRestantes: diasRestWD,
    real, metaLine: dias.map(d => ({ dia: d, valor: 0 })),
    superLine: dias.map(d => ({ dia: d, valor: 0 })), previsaoLine,
    singlePoint: false,
  }
}

// ── Forecast por Indicador ────────────────────────────────────────────────────
// Props:
//   periodoAtivo  — objeto { mesNome, ano, key, label } do mês selecionado
//   periodoData   — dados do mês: { metricas, reunioes }
//   empresaSelecionada — 'AI' | 'MO'
//   registros     — data.GERAL (REUNIOES_GERAL) para indicadores com série real
function ForecastIndicadorView({ periodoAtivo, periodoData, forecast, empresaSelecionada, registros = [] }) {
  const [filtro, setFiltro] = useState('Todos')

  if (!periodoAtivo || !periodoData) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 32, textAlign: 'center' }}>Selecione um mês para ver o Forecast por Indicador.</div>
  }

  const m = periodoData.metricas || {}
  const cards = periodoData.reunioes?.cards || {}
  const mesNome = periodoAtivo.mesNome
  const anoStr  = String(periodoAtivo.ano)
  const isMO    = String(empresaSelecionada || '').toUpperCase() === 'MO'

  // Meta mensal de NMRR — mesma fonte do Forecast atual (FORECAST_AI/MO col B).
  // Busca pelo prefixo de 3 letras do mês, idêntico ao PainelGeralView.
  const fcList = Array.isArray(forecast) ? forecast : []
  const mesPfx = String(mesNome).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0,3)
  const fcEntry = fcList.find(e => String(e.mes||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').slice(0,3) === mesPfx) || {}
  const metaNmrr = Number(fcEntry.meta) || 0

  // Leads MQL — mesma lógica de EvolucaoMensalView:
  // MQL chega como fração (0.32) ou percentual (32) — normalizar para percentual.
  const leadsVal  = Number(m.leads)  || 0
  const mqlN      = Number(m.mql) || 0
  const mqlRaw    = mqlN && Math.abs(mqlN) <= 1 ? mqlN * 100 : mqlN
  const mqlFrac   = mqlRaw > 0 ? mqlRaw / 100 : 0
  const leadsMqlVal = leadsVal && mqlFrac > 0 ? Math.round(leadsVal * mqlFrac) : 0

  // DSV/DSO — mesma lógica de ReuniaoCards (linha 748+)
  const dsvLabel = isMO ? 'DSO Vendido' : 'DSV Vendido'
  const dsvVal   = isMO ? (Number(cards.dsoTotal) || 0) : (Number(cards.dsvOnlyTotal) || 0)

  // Contratos Pagos — EXCLUSIVAMENTE metricas.contratosPagos (DASH/MASTER)
  const contratosVal = Number(m.contratosPagos) || 0

  // NMRR — metricas.nmrr (DASH)
  const nmrrVal = Number(m.nmrr) || 0

  // Investimento
  const investVal = Number(m.investimento) || 0

  // Reuniões — cards.total de REUNIOES_GERAL
  const reunioesVal = Number(cards.total) || 0

  // Calcular stats para cada indicador
  const sLeads       = calcIndicatorStats({ realizado: leadsVal,      anoStr, mesNome, dayMode: 'calendar' })
  const sLeadsMql    = calcIndicatorStats({ realizado: leadsMqlVal,   anoStr, mesNome, dayMode: 'calendar' })
  const sAgend       = calcIndicatorStats({ realizado: Number(m.agendamentos) || 0, anoStr, mesNome, dayMode: 'working' })
  const sReunioes    = calcIndicatorStats({ realizado: reunioesVal,    anoStr, mesNome, dayMode: 'working' })
  const sContratos   = calcIndicatorStats({ realizado: contratosVal,   anoStr, mesNome, dayMode: 'working' })
  const sNmrr        = calcIndicatorStats({ realizado: nmrrVal,        anoStr, mesNome, dayMode: 'working' })
  const sDsv         = calcIndicatorStats({ realizado: dsvVal,         anoStr, mesNome, dayMode: 'working' })
  const sInvest      = calcIndicatorStats({ realizado: investVal,      anoStr, mesNome, dayMode: 'calendar' })

  const INDICADORES = [
    { id: 'Leads',           label: 'Leads',           stats: sLeads,     fmt: fmt,     fmtMedia: fmtNum1 },
    { id: 'Leads MQL',       label: 'Leads MQL',       stats: sLeadsMql,  fmt: fmt,     fmtMedia: fmtNum1 },
    { id: 'Agendamentos',    label: 'Agendamentos',    stats: sAgend,     fmt: fmt,     fmtMedia: fmtNum1 },
    { id: 'Reuniões',        label: 'Reuniões',        stats: sReunioes,  fmt: fmt,     fmtMedia: fmtNum1 },
    { id: 'Contratos Pagos', label: 'Contratos Pagos', stats: sContratos, fmt: fmt,     fmtMedia: fmtNum1 },
    { id: 'NMRR',            label: 'NMRR',            stats: sNmrr,      fmt: fmtR1,   fmtMedia: fmtR,   meta: metaNmrr },
    { id: 'DSV/DSO',         label: dsvLabel,          stats: sDsv,       fmt: fmtR1,   fmtMedia: fmtR },
    { id: 'Investimento',    label: 'Investimento',    stats: sInvest,    fmt: fmtR1,   fmtMedia: fmtR },
  ]

  const opcoesDropdown = ['Todos', ...INDICADORES.map(i => i.id)]
  const visiveis = filtro === 'Todos' ? INDICADORES : INDICADORES.filter(i => i.id === filtro)
  const estadoAtual = visiveis[0]?.stats.estado

  // ── Gráfico: somente quando um indicador específico está selecionado ──────
  const indicadorSelecionado = filtro !== 'Todos' && visiveis.length === 1 ? visiveis[0] : null
  const mesUpper = String(mesNome).toUpperCase()

  let chartDados = null
  let chartUnidade = 'qty'

  if (indicadorSelecionado && estadoAtual !== 'future') {
    const { id, stats } = indicadorSelecionado

    if (id === 'NMRR') {
      chartDados = buildNmrrIndicadorData({
        registros,
        empresa: String(empresaSelecionada).toUpperCase(),
        mes: mesUpper,
        ano: anoStr,
        meta: metaNmrr,
      })
      chartUnidade = 'money'

    } else if (id === 'Reuniões') {
      chartDados = buildReunioesIndicadorData({
        evolucao: periodoData.reunioes?.graficos?.evolucao || [],
        anoStr, mesNome, estado: stats.estado,
      })
      chartUnidade = 'qty'

    } else if (id === 'DSV/DSO') {
      chartDados = buildDsvIndicadorData({
        registros, empresa: String(empresaSelecionada).toUpperCase(),
        mes: mesUpper, ano: anoStr, isMO,
      })
      chartUnidade = 'money'

    } else {
      // Leads, Leads MQL, Agendamentos, Contratos Pagos, Investimento — sem série diária
      chartDados = buildSinglePointForecastData({
        realizado: stats.realizado,
        projecao: stats.projecao,
        meta: indicadorSelecionado.meta || 0,
        dayMode: stats.dayMode,
        anoStr, mesNome, estado: stats.estado,
      })
      chartUnidade = id === 'Investimento' ? 'money' : 'qty'
    }
  }

  return (
    <div style={{ maxWidth: 940, margin: '0 auto' }}>
      {/* Cabeçalho — mesmo .view-header das demais análises (Por Semana, Comparativo
          Mensal, Forecast, Evolução Mensal); antes era um eyebrow menor isolado, único
          na tela sem o título de página que todas as outras views recebem. */}
      <div className="view-header" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <div className="view-header-title">Forecast por Indicador</div>
          <div className="view-header-sub">{periodoAtivo.label} · {String(empresaSelecionada).toUpperCase()}</div>
        </div>
        <select
          className="period-select has-selection"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          style={{ marginLeft: 'auto', minWidth: 170 }}
        >
          {opcoesDropdown.map(op => <option key={op} value={op}>{op}</option>)}
        </select>
      </div>

      {/* Aviso contextual por tipo de mês */}
      {estadoAtual === 'past' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, fontStyle: 'italic' }}>
          Mês encerrado — exibindo apenas o realizado.
        </div>
      )}
      {estadoAtual === 'future' && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, fontStyle: 'italic' }}>
          Mês futuro — sem dados disponíveis ainda.
        </div>
      )}

      {/* Grid de cards — 4 colunas fixas no desktop, responsivo em telas menores */}
      <style>{`
        .ind-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          max-width: 900px;
        }
        @media (max-width: 900px) {
          .ind-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
          .ind-grid { grid-template-columns: 1fr; }
        }
        .ind-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 20px 20px 16px;
          border-radius: 12px;
          border: 1px solid var(--border-default);
          background: linear-gradient(150deg, var(--surface-2) 0%, var(--surface-1) 65%);
          min-height: 172px;
          box-shadow: var(--shadow-md), var(--card-highlight);
          transition: box-shadow var(--duration-fast) var(--ease-standard),
                      border-color var(--duration-fast) var(--ease-standard),
                      transform 220ms var(--ease-standard);
          animation: fadeIn var(--duration-normal) var(--ease-entrance) both;
        }
        .ind-card:hover {
          border-color: var(--border-strong);
          box-shadow: var(--shadow-lg), var(--card-highlight-hover);
          transform: translateY(-3px);
        }
      `}</style>
      <div className="ind-grid stagger-children">
        {visiveis.map(({ id, label, stats, fmt: fmtVal, fmtMedia, meta }) => (
          <IndicadorCard key={id} label={label} stats={stats} fmtVal={fmtVal} fmtMedia={fmtMedia} meta={meta} />
        ))}
      </div>

      {/* Gráfico detalhado — somente quando um indicador específico está selecionado */}
      {chartDados && (
        <div style={{ marginTop: 32 }}>
          <div className="chart-card">
            <div className="chart-title">
              {chartDados.singlePoint ? 'Forecast' : 'Evolução e Forecast'} — {indicadorSelecionado?.label}
            </div>
            <ForecastCurveChart dados={chartDados} unidade={chartUnidade} />
            {chartDados.singlePoint && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                Histórico diário não disponível. A projeção parte do resultado atual.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nota de metodologia */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 18, lineHeight: 1.6 }}>
        Leads, Leads MQL e Investimento usam dias corridos (calendário). Agendamentos, Reuniões, Contratos, NMRR e DSV/DSO usam dias úteis (Seg–Sex, excluindo feriados nacionais).
      </div>
    </div>
  )
}

// Card individual de indicador.
// meta: meta mensal real (opcional) — exibida apenas no mês atual.
function IndicadorCard({ label, stats, fmtVal, fmtMedia, meta }) {
  const { realizado, mediaDia, projecao, diasDecorridos, diasTotais, estado, dayMode } = stats
  const isCurrent = estado === 'current'
  const metaVal   = Number(meta) || 0
  const pctMeta   = isCurrent && projecao !== null && metaVal > 0
    ? Math.round((projecao / metaVal) * 100)
    : null
  const diasLabel = dayMode === 'calendar' ? 'dias' : 'dias úteis'

  return (
    <div className="ind-card">
      {/* Topo: label + realizado (contexto secundário) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent)' }}>
          {label}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>Realizado</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
            {fmtVal(realizado)}
          </div>
        </div>
      </div>

      {/* Centro: Forecast em destaque */}
      <div style={{ marginTop: 10 }}>
        {isCurrent && projecao !== null ? (
          <>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Forecast</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.05, letterSpacing: '-0.01em' }}>
              <AnimatedNumber value={Math.round(projecao)} format={fmtVal} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
              {fmtMedia(mediaDia)}/{dayMode === 'calendar' ? 'dia' : 'dia útil'}
            </div>
          </>
        ) : isCurrent ? (
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.05 }}>
            <AnimatedNumber value={realizado} format={fmtVal} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>—</div>
        )}
      </div>

      {/* Rodapé: meta + % + dias */}
      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {isCurrent && metaVal > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Meta {fmtVal(metaVal)}</span>
              {pctMeta !== null && (
                <span style={{ fontSize: 12, fontWeight: 700, color: pctMeta >= 100 ? 'var(--green)' : pctMeta >= 80 ? 'var(--amber)' : 'var(--red)' }}>
                  {pctMeta}%
                </span>
              )}
            </div>
            {pctMeta !== null && (
              <AnimatedBar pct={pctMeta} statusClass={pctMeta >= 100 ? 'positive' : pctMeta >= 80 ? 'warning' : 'negative'} small />
            )}
          </>
        )}
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {isCurrent ? `${diasDecorridos}/${diasTotais} ${diasLabel}` : ' '}
        </div>
      </div>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

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
      className="toggle-pill toggle-pill-sm"
      style={{
        background: tipoVisao === value ? 'var(--accent-light)' : 'transparent',
        borderColor: tipoVisao === value ? 'var(--accent-border)' : 'var(--border)',
        color: tipoVisao === value ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      {label}
    </button>
  )

  return (
    <div>
      <div className="view-header">
        <div className="view-header-title">Forecast</div>
        <div className="view-header-sub">{mesAtivo} {anoAtivo} · {empresaSelecionada}</div>
      </div>

      <div className="filter-bar" style={{ padding: '14px 20px', marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Month dropdown */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>Mês do forecast:</label>
          <select value={mesAtivo} onChange={e => setMesSel(e.target.value)} className="field-input" style={{ minWidth: 160 }}>
            {meses.map(m => <option key={m} value={m}>{m} {anoAtivo}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
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
      </div>

      <div className="chart-card" style={{ marginBottom: 32 }}>
        <div className="forecast-chart-grid">
          <div>
            <div className="chart-title">Evolução do Forecast — {tipoVisao === 'GERAL' ? empresaSelecionada : nomeAtivo} · {mesAtivo} {anoAtivo}</div>
            <ForecastCurveChart dados={dadosGrafico} tipo={tipoVisao} />
          </div>
          <div className="forecast-chart-side" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
            <div>
              <div className="card-label">Realizado no mês</div>
              <div className="card-value"><AnimatedNumber value={dadosGrafico.realizado} format={valorFmt} /></div>
              <div className="card-sub">Previsão final: {valorFmt(dadosGrafico.previsaoFinal)} · média/dia: {valorFmt(dadosGrafico.mediaDia)}</div>
            </div>
            <div>
              <div className="card-label">Objetivo do mês</div>
              <div className="card-value"><AnimatedNumber value={metaGrafico} format={valorFmt} /></div>
              <AnimatedBar pct={dadosGrafico.pctMeta} style={{ margin: '8px 0' }} fillStyle={{ background: 'var(--purple)' }} />
              <div className="card-sub">{fmtPct(dadosGrafico.pctMeta)} realizado</div>
            </div>
            {supermetaGrafico > 0 && (
              <div>
                <div className="card-label">Supermeta</div>
                <div className="card-value"><AnimatedNumber value={supermetaGrafico} format={valorFmt} /></div>
              </div>
            )}
            <div>
              <div className="card-label">Necessário por dia útil/sábado restante</div>
              <div className="card-value"><AnimatedNumber value={necessario} format={valorFmt} /></div>
              <div className="card-sub">{dadosGrafico.diasOperacionaisRestantes} dias restantes · Unidade: {unidade}</div>
            </div>
          </div>
        </div>
      </div>

      {forecastMes && forecastMes.mes && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>Resumo do Forecast Mensal</div>
          <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div className="card blue"><div className="card-label">Meta</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.meta) || 0} format={fmtR1} /></div><div className="card-sub">meta do mês</div></div>
            <div className={`card ${Number(forecastMes.meta || 0) > 0 && Number(forecastMes.mrrPago || 0) < Number(forecastMes.meta || 0) ? 'red' : 'green'}`}><div className="card-label">MRR Pago Projetado</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.mrrPago) || 0} format={fmtR1} /></div><div className="card-sub">{fmtPct(forecastMes.pctPago)} da meta</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapPago)}`}><div className="card-label">Gap Pago</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.gapPago) || 0} format={fmtR1} /></div><div className="card-sub">{gapSub(forecastMes.gapPago)}</div></div>
            <div className="card amber"><div className="card-label">Projeção Vendido</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.projecaoVendido) || 0} format={fmtR1} /></div><div className="card-sub">{fmtPct(forecastMes.pctVendido)} do projetado</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapContratos)}`}><div className="card-label">Gap Contratos</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.gapContratos) || 0} format={signedNumber} /></div><div className="card-sub">{gapSub(forecastMes.gapContratos, 'vs meta')}</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapRlzd)}`}><div className="card-label">Gap Realizadas</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.gapRlzd) || 0} format={signedNumber} /></div><div className="card-sub">{gapSub(forecastMes.gapRlzd, 'vs meta')}</div></div>
            <div className={`card ${gapCardClass(forecastMes.gapAgd)}`}><div className="card-label">Gap Agendadas</div><div className="card-value"><AnimatedNumber value={Number(forecastMes.gapAgd) || 0} format={signedNumber} /></div><div className="card-sub">{gapSub(forecastMes.gapAgd, 'vs meta')}</div></div>
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
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
              Por Origem — {mesAtivo} {anoAtivo}
            </div>
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    {['Origem','Reuniões','Pagos','NMRR Pago','Tx Conv.','TKM'].map(h => (
                      <th key={h} className={h === 'Origem' ? '' : 'is-numeric'}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordered.map(o => {
                    const tx = o.realizadas > 0 ? (o.pagos / o.realizadas) * 100 : 0
                    const tkm = o.pagos > 0 ? o.valor / o.pagos : 0
                    return (
                      <tr key={o.origem}>
                        <td style={{ color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>{o.origem}</td>
                        <td className="is-numeric" style={{ color: '#6366f1', fontWeight: 500 }}>{fmt(o.realizadas)}</td>
                        <td className="is-numeric" style={{ color: 'var(--green)', fontWeight: 500 }}>{fmt(o.pagos)}</td>
                        <td className="is-numeric" style={{ color: 'var(--amber)', fontWeight: 500 }}>{fmtR1(o.valor)}</td>
                        <td className="is-numeric" style={{ color: 'var(--blue)', fontWeight: 500 }}>{fmtPct(tx)}</td>
                        <td className="is-numeric" style={{ color: '#ec4899', fontWeight: 500 }}>{o.pagos > 0 ? fmtR1(tkm) : '—'}</td>
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
  barWMax: 32, barWFrac: 0.5,
  valFontSize: 10, valDy: 8, xFontSize: 9, xDy: 8, rectRx: 4,
}

function VerticalBarChartMonths({ data, color = '#3b82f6', formatVal = String }) {
  const [tooltip, setTooltip] = useState(null)
  if (!data || !data.length || data.every(d => !(Number(d.valor) || 0))) {
    return <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: '24px 0' }}>Sem dados</div>
  }
  const vals = data.map(d => Number(d.valor) || 0)
  const max = Math.max(...vals, 1)
  const { W, H, padL, padR, padTop, padBot, barWMax, barWFrac, valFontSize, valDy, xFontSize, xDy, rectRx } = EVOLUCAO_BAR_CHART
  const chartW = W - padL - padR, chartH = H - padTop - padBot
  const n = data.length
  const slotW = chartW / n
  const barW = Math.max(6, Math.min(barWMax, slotW * barWFrac))
  const bX = (i) => padL + i * slotW + slotW / 2 - barW / 2
  const bH = (v) => Math.max(2, (Number(v) || 0) / max * chartH)
  const chartBottom = padTop + chartH
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padTop + g * chartH} y2={padTop + g * chartH} stroke="var(--border-subtle)" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const isHov = tooltip?.i === i
          return (
            <SvgBarColumn key={i}
              x={bX(i)} barW={barW} chartBottom={chartBottom} targetH={bH(d.valor)}
              rx={rectRx} fill={color} opacity={isHov ? 1 : 0.78}
              value={d.valor} formatVal={formatVal} valFontSize={valFontSize} valDy={valDy}
              xFontSize={xFontSize} xLabel={d.mes} xY={H - xDy}
              onMouseEnter={() => setTooltip({ i, label: d.label || d.mes, valor: d.valor })}
              onMouseLeave={() => setTooltip(null)}
            />
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
  const { W, H, padL, padR, padTop, padBot, barWMax, barWFrac, valFontSize, valDy, xFontSize, xDy, rectRx } = EVOLUCAO_BAR_CHART
  const chartW = W - padL - padR, chartH = H - padTop - padBot
  const n = data.length
  const slotW = chartW / n
  const barW = Math.max(6, Math.min(barWMax, slotW * barWFrac))
  const bX = (i) => padL + i * slotW + slotW / 2 - barW / 2
  const bH = (v) => Math.max(2, (Number(v) || 0) / max * chartH)
  const chartBottom = padTop + chartH
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H }} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padTop + g * chartH} y2={padTop + g * chartH} stroke="var(--border-subtle)" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const isHov = tooltip?.i === i
          return (
            <SvgBarColumn key={i}
              x={bX(i)} barW={barW} chartBottom={chartBottom} targetH={bH(d.valor)}
              rx={rectRx} fill={color} opacity={isHov ? 1 : 0.78}
              value={d.valor} formatVal={formatVal} valFontSize={valFontSize} valDy={valDy}
              xFontSize={xFontSize} xLabel={d.mes} xY={H - xDy}
              onMouseEnter={() => setTooltip({ i, label: d.label || d.mes, valor: d.valor, pagos: d.pagos, valorPago: d.valorPago })}
              onMouseLeave={() => setTooltip(null)}
            />
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
    { key: 'taxaConversao',   label: 'Taxa de Conversão',       color: '#10b981', fmt: fmtPct, desc: 'Contratos Pagos ÷ Reuniões Realizadas × 100.' },
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
        <div className="table-shell" style={{ marginTop: 32 }}>
          <table className="data-table zebra">
            <thead>
              <tr>
                <th>Mês</th>
                {displayVals.map((v, vi) => (
                  <th key={v} className="is-numeric" style={{ color: colorArr[vi % colorArr.length], fontWeight: 600 }}>{v}</th>
                ))}
              </tr>
              <tr>
                <th style={{ padding: '6px 12px', fontSize: 10 }}>{metrAtiva.label}</th>
                {displayVals.map(v => (
                  <th key={v} className="is-numeric" style={{ color: metrAtiva.color, fontWeight: 500, fontSize: 10, padding: '6px 8px' }}>—</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...mesesG].reverse().map(mg => (
                <tr key={mg.key}>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mg.label}</td>
                  {displayVals.map(v => {
                    const s = geralStats(mg, field, v)
                    const val = geralMetricVal(s, metrAtiva.key)
                    return <td key={v} className="is-numeric" style={{ color: metrAtiva.color, fontWeight: 500 }}>{metrAtiva.fmt(val)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <div className="table-shell" style={{ marginTop: 32 }}>
        <table className="data-table zebra">
          <thead>
            <tr>
              <th>Mês</th>
              {displayVals.map((v, vi) => (
                <th key={v} colSpan={3} style={{ textAlign: 'center', color: colorArr[vi % colorArr.length], fontWeight: 600 }}>{v}</th>
              ))}
            </tr>
            <tr>
              <th></th>
              {displayVals.map((v) => (
                ['Realizadas','Pagos','Valor Pago'].map(h => (
                  <th key={`${v}-${h}`} className="is-numeric" style={{ fontSize: 10, padding: '6px 8px' }}>{h}</th>
                ))
              ))}
            </tr>
          </thead>
          <tbody>
            {[...mesesG].reverse().map(mg => (
              <tr key={mg.key}>
                <td style={{ color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mg.label}</td>
                {displayVals.map((v, vi) => {
                  const s = geralStats(mg, field, v)
                  const c = colorArr[vi % colorArr.length]
                  return [
                    <td key={`${v}-r`} className="is-numeric" style={{ color: c, fontWeight: 500 }}>{fmt(s.realizadas)}</td>,
                    <td key={`${v}-p`} className="is-numeric" style={{ color: 'var(--green)', fontWeight: 500 }}>{fmt(s.pagos)}</td>,
                    <td key={`${v}-v`} className="is-numeric" style={{ color: 'var(--amber)', fontWeight: 500 }}>{fmtR1(s.valor)}</td>,
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
      <div className="view-header">
        <div className="view-header-title">Evolução Mensal</div>
        <div className="view-header-sub">{empresaSelecionada}</div>
      </div>

      {/* Dropdowns row — alignItems: flex-start mantém labels alinhados pelo topo */}
      <div className="filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', padding: '14px 20px', marginBottom: 16 }}>
        <div>
          <span className="field-label">Categoria</span>
          <select className="field-input" value={categoria} onChange={e => changeCategoria(e.target.value)}>
            {CATEGORIAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <span className="field-label">Ano</span>
          <select className="field-input" value={anoFiltro} onChange={e => setAnoFiltro(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anosDisp.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {isGeral && (
          <div>
            <span className="field-label">
              {categoria === 'origem' ? 'Origem' : categoria === 'closer' ? 'Closer' : 'SDR'}
            </span>
            <select className="field-input" value={subFiltro} onChange={e => setSubFiltro(e.target.value)}>
              <option value="todos">Ver todos</option>
              {geralVals.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        {isGeral && (
          <div>
            <span className="field-label">Métrica</span>
            <select className="field-input" value={metricaGeral} onChange={e => setMetricaGeral(e.target.value)}>
              {METRICAS_GERAL.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
        )}
        {!isGeral && (
          <div>
            <span className="field-label">Métrica</span>
            <select className="field-input" value={metrica} onChange={e => setMetrica(e.target.value)}>
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
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
            Tabela resumo — {metricaAtiva.label} · {empresaSelecionada}
          </div>
          <div className="table-shell">
            <table className="data-table zebra">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="is-numeric">{metricaAtiva.label}</th>
                </tr>
              </thead>
              <tbody>
                {[...currentMeses].reverse().map(mes => (
                  <tr key={mes.key}>
                    <td style={{ color: 'var(--text-secondary)', fontWeight: 500, whiteSpace: 'nowrap' }}>{mes.label}</td>
                    <td className="is-numeric" style={{ color: metricaAtiva.color, fontWeight: 500 }}>
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
  // session.user.perfil existe só para UX (mostrar/ocultar este item de menu) — a proteção
  // real de /admin/usuarios é feita no próprio getServerSideProps da página (consulta ao
  // vivo a USUARIOS_ACESSO), nunca aqui.
  const { data: session, status: sessionStatus } = useSession()
  const isAdmin = session?.user?.perfil === 'ADMIN'

  // Analytics de acesso/tempo de uso (heartbeat leve) — só inicia depois que o NextAuth
  // confirma sessão autenticada; falha aqui nunca afeta o resto do dashboard (ver
  // hooks/useAnalyticsSession.js).
  useAnalyticsSession(sessionStatus === 'authenticated')

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
  // fetchInFlight: guarda TÉCNICA interna contra duas chamadas de rede simultâneas —
  // cobre automática×automática, manual×automática e manual×manual.
  // pendingForceRefresh: quando um clique manual (force=true) chega enquanto já existe uma
  // chamada em andamento, o clique NUNCA é descartado — fica marcado aqui e dispara
  // exatamente UM force refresh assim que a chamada atual terminar. Não é uma fila: vários
  // cliques nesse meio tempo só mantêm a mesma flag em true (um único refresh ao final).
  // Uma automática que chega com outra chamada em andamento continua sendo simplesmente
  // ignorada (nunca vira pendente — só cliques manuais precisam dessa garantia).
  const fetchInFlight = useRef(false)
  const pendingForceRefresh = useRef(false)
  fetchData.current = async (force = false) => {
    if (fetchInFlight.current) {
      if (force) {
        pendingForceRefresh.current = true
        // Feedback imediato do clique: liga o indicador visual já aqui, sem esperar a
        // chamada atual terminar para o usuário perceber que o clique foi recebido.
        setSyncing(true)
        setSyncError(null)
      }
      return
    }

    fetchInFlight.current = true
    // syncing é só o indicador VISUAL do botão manual — refresh automático roda em
    // silêncio (sem animar/desabilitar o botão); só liga para force=true.
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
      // Falha de refresh (automático ou manual) nunca apaga dados já carregados — só
      // mostra aviso e mantém o que já estava na tela. Também nunca impede atualizações
      // futuras: fetchInFlight é sempre liberado abaixo, sucesso ou falha.
      if (!data) setError(e.message)
      else setSyncError('Falha ao sincronizar — usando dados anteriores')
    } finally {
      setLoading(false)
      fetchInFlight.current = false
      if (pendingForceRefresh.current) {
        // Havia um clique manual pendente registrado durante esta chamada: dispara agora,
        // exatamente uma vez. Chamada assíncrona nova e independente (não recursão
        // síncrona) — fetchInFlight já está false, então segue o fluxo normal do guard.
        // Mantém `syncing` ligado (não desliga abaixo) para não piscar o indicador entre
        // o fim desta chamada e o início do force pendente.
        pendingForceRefresh.current = false
        fetchData.current(true)
      } else if (force) {
        setSyncing(false)
      }
    }
  }

  // Initial load + auto-refresh every 5 minutes — coordenado com o cache do servidor
  // (CACHE_TTL em lib/sheets.js e s-maxage em pages/api/data.js, ambos também 5 min) e com
  // o trigger automático da Master Dashboard (Apps Script, a cada 10 min): o próximo poll
  // daqui encontra o cache do servidor já expirado, então já traz o dado novo da planilha.
  useEffect(() => {
    fetchData.current(false)
    const interval = setInterval(() => fetchData.current(false), 5 * 60 * 1000)
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
  const dashboardNome = data?.CONFIG?.dashboardNome || 'VP Dash'
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
    ['FORECAST_IND','Forecast por Indicador'],
  ]

  // isSpecialView: true quando a aba ativa é uma análise especial (não a visão mensal padrão)
  const isSpecialView = specialViews.some(([k]) => k === periodo)
  // activeMesKey: chave do mês para buscar dados — independe da aba ativa
  const activeMesKey = isSpecialView ? mesSelAtivo : periodo
  const periodoData = currentData && activeMesKey && !['SEMANAS','FORECAST','DADOS','METAS_ORIGEM','COMPARATIVO','EVOLUCAO','FORECAST_IND'].includes(periodo)
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
      <Head><title>{dashboardNome}</title></Head>

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
            </button>
          ))}

          <div className="sidebar-divider" />

          <div className="sidebar-footer">
            {isAdmin && (
              <Link href="/admin/usuarios" className="sidebar-action" title="Admin · Usuários">
                👤
              </Link>
            )}
            <button
              className="sidebar-action"
              onClick={() => fetchData.current(true)}
              disabled={syncing}
              title={syncing ? 'Sincronizando…' : 'Sincronizar'}
            >
              <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
            </button>
          </div>
        </aside>

        {/* ── Main area ── */}
        <div className="main-area">
          {/* Top bar */}
          <header className="top-bar">
            {/* Esquerda: identidade da empresa + seletor de mês */}
            <div className="topbar-left" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, minWidth: 0 }}>
              <div className="topbar-brand">
                <span className="topbar-brand-mark">◆</span>
                <span className="topbar-brand-name">{nomeEmpresa}</span>
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

            <div className="topbar-divider" />

            {/* Centro: dropdown de análises */}
            <div className="topbar-center" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', gap: 8 }}>
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
            <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {lastSync && !syncing && <span className="last-sync" style={{ fontSize: 10 }}>Às {lastSync}</span>}
              <div className="topbar-actions">
                <button className="sidebar-action" onClick={() => fetchData.current(true)} disabled={syncing} title={syncing ? 'Sincronizando…' : 'Sincronizar'}>
                  <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none', fontSize: 15 }}>↻</span>
                </button>
                <button className="sidebar-action" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Tema claro' : 'Tema escuro'}>
                  <span style={{ fontSize: 15 }}>{darkMode ? '☀️' : '🌙'}</span>
                </button>
              </div>
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
              {periodo==='PAINEL' ? <PainelGeralView key={`painel-${empresa}-${periodoAtivo?.key}`} periodoData={periodoData} periodoAtivo={periodoAtivo} nomeEmpresa={nomeEmpresa} forecast={currentData?.FORECAST} /> :
               periodo==='SEMANAS' ? <SemanasComparativo semanas={currentData?.SEMANAS} /> :
               periodo==='FORECAST' ? <ForecastView forecast={currentData?.FORECAST} forecastEquipe={data?.FORECAST_EQUIPE} registros={data?.GERAL} empresaSelecionada={empresa} /> :
               periodo==='EVOLUCAO' ? <EvolucaoMensalView periodos={periodosDinamicos} getData={(emp, key) => data?.[emp]?.[key]} empresaSelecionada={empresa} geralData={data?.GERAL || []} /> :
               periodo==='DADOS' ? <DadosEspecificosView registros={data?.GERAL} empresaAtiva={empresa} periodoAtivo={periodoAtivo} /> :
               periodo==='METAS_ORIGEM' ? <MetasOrigemView performance={data?.PERFORMANCE_ORIGEM} empresaSelecionada={empresa} periodoAtivo={periodoAtivo} /> :
               periodo==='COMPARATIVO' ? <ComparativoMensalDashboard registros={data?.GERAL} empresaSelecionada={empresa} /> :
               periodo==='FORECAST_IND' ? <ForecastIndicadorView periodoAtivo={periodoAtivo} periodoData={currentData?.[activeMesKey]} forecast={currentData?.FORECAST} empresaSelecionada={empresa} registros={data?.GERAL} /> :
               periodoData ? (
                 // key troca a cada empresa/mês — remonta este bloco (nenhum dos 4
                 // componentes abaixo guarda estado local próprio) só para retrigar o
                 // fadeIn/stagger já existente nos cards, dando uma transição suave de
                 // conteúdo ao trocar os filtros principais (PR H — motion, §5).
                 <div key={`visao-mes-${empresa}-${periodoAtivo?.key}`}>
                   <MetricCards metricas={periodoData.metricas} />
                   <ReuniaoCards cards={periodoData.reunioes?.cards} empresa={empresa} graficos={periodoData.reunioes?.graficos} />
                   <FunilPrincipal metricas={periodoData.metricas} />
                   <ReuniaoGraficos graficos={periodoData.reunioes?.graficos} />
                 </div>
               ) : <div className="loading">Sem dados para este período</div>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
