import { createSign } from 'crypto'

// Suporta tanto o nome antigo (SHEET_ID) quanto o novo (GOOGLE_SHEET_ID)
const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
const PRIVATE_KEY_RAW = process.env.GOOGLE_PRIVATE_KEY
// Fallback: chave de API simples usada na versão anterior (funciona com planilhas públicas)
const API_KEY = process.env.GOOGLE_API_KEY

// ── Base64url (compatível com Node 14+) ───────────────────────
function toBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ── Service Account JWT auth ───────────────────────────────────
let _cachedToken = null
let _tokenExpiry = 0

function hasServiceAccountConfig() {
  const pk = String(PRIVATE_KEY_RAW || '').replace(/\\n/g, '\n')
  return !!(SERVICE_ACCOUNT_EMAIL && pk && pk.includes('PRIVATE KEY'))
}

async function getAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken

  const privateKey = String(PRIVATE_KEY_RAW || '').replace(/\\n/g, '\n')
  const email = SERVICE_ACCOUNT_EMAIL

  if (!email || !privateKey || !privateKey.includes('PRIVATE KEY')) {
    throw new Error(
      'Configuração Service Account inválida. ' +
      `GOOGLE_SHEET_ID=${SHEET_ID ? 'ok' : 'FALTANDO'}, ` +
      `GOOGLE_SERVICE_ACCOUNT_EMAIL=${email ? 'ok' : 'FALTANDO'}, ` +
      `GOOGLE_PRIVATE_KEY=${privateKey ? 'ok (len=' + privateKey.length + ')' : 'FALTANDO'}`
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const header = toBase64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64url(Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })))

  const sign = createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = toBase64url(sign.sign(privateKey))
  const jwt = `${header}.${payload}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const json = await res.json()
  if (!json.access_token) {
    throw new Error(`Token OAuth falhou: ${json.error || ''} — ${json.error_description || JSON.stringify(json)}`)
  }

  _cachedToken = json.access_token
  _tokenExpiry = Date.now() + (json.expires_in || 3600) * 1000
  return _cachedToken
}

// ── Server-side data cache (25 min) ───────────────────────────
let _dataCache = null
let _dataCacheAt = 0
const CACHE_TTL = 25 * 60 * 1000

// ── Constants ─────────────────────────────────────────────────
const RANGES = {
  CONFIG: 'CONFIG!A1:C100',
  FORECAST_EQUIPE: 'FORECAST_EQUIPE!A1:G5000',
  PERFORMANCE_ORIGEM: 'PERFORMANCE_ORIGEM!A1:P5000',
}

const MONTHS = {
  JAN: { numero: 1, nome: 'JANEIRO', label: 'Janeiro' },
  FEV: { numero: 2, nome: 'FEVEREIRO', label: 'Fevereiro' },
  MAR: { numero: 3, nome: 'MARÇO', label: 'Março' },
  ABR: { numero: 4, nome: 'ABRIL', label: 'Abril' },
  MAI: { numero: 5, nome: 'MAIO', label: 'Maio' },
  JUN: { numero: 6, nome: 'JUNHO', label: 'Junho' },
  JUL: { numero: 7, nome: 'JULHO', label: 'Julho' },
  AGO: { numero: 8, nome: 'AGOSTO', label: 'Agosto' },
  SET: { numero: 9, nome: 'SETEMBRO', label: 'Setembro' },
  OUT: { numero: 10, nome: 'OUTUBRO', label: 'Outubro' },
  NOV: { numero: 11, nome: 'NOVEMBRO', label: 'Novembro' },
  DEZ: { numero: 12, nome: 'DEZEMBRO', label: 'Dezembro' },
}

const DEFAULT_CONFIG = {
  dashboardNome: 'AGC Dashboard',
  reunioesGeral: 'REUNIOES_GERAL',
  empresas: [
    { codigo: 'AI', nome: 'Acelera Imob', semanasSheet: 'SEMANAS AI', forecastSheet: 'FORECAST_AI' },
    { codigo: 'MO', nome: 'Mundo Ótico', semanasSheet: 'SEMANAS MO', forecastSheet: 'FORECAST_MO' },
  ],
}

// ── Estrutura vazia de fallback ────────────────────────────────
// IMPORTANTE: usa `error` (não `_error`) para que o frontend possa detectar e exibir
function emptyDashData(errorMsg) {
  return {
    GERAL: [],
    PERFORMANCE_ORIGEM: [],
    FORECAST_EQUIPE: [],
    PERIODOS: [],
    syncedAt: new Date().toISOString(),
    error: errorMsg || null,
    CONFIG: {
      dashboardNome: 'AGC Dashboard',
      anoAtual: '',
      moeda: 'BRL',
      reunioesGeral: 'REUNIOES_GERAL',
      empresas: DEFAULT_CONFIG.empresas.map(({ codigo, nome }) => ({ codigo, nome })),
    },
    AI: { SEMANAS: [], FORECAST: [] },
    MO: { SEMANAS: [], FORECAST: [] },
  }
}

// ── Fetch helpers — suporta Service Account e API Key ─────────
async function fetchRange(range) {
  if (!SHEET_ID) throw new Error('SHEET_ID não configurado (defina GOOGLE_SHEET_ID no Vercel)')

  if (hasServiceAccountConfig()) {
    // Autenticação via Service Account (planilha privada)
    const token = await getAccessToken()
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Sheets API ${res.status} para "${range}": ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.values || []
  } else if (API_KEY) {
    // Fallback: chave de API simples (planilha pública)
    console.warn('[sheets] Usando GOOGLE_API_KEY (planilha deve ser pública)')
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Sheets API (key) ${res.status} para "${range}": ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.values || []
  } else {
    throw new Error(
      'Nenhum método de autenticação configurado. ' +
      'Defina GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY (planilha privada) ' +
      'ou GOOGLE_API_KEY (planilha pública).'
    )
  }
}

async function fetchRangeSafe(range) {
  try { return await fetchRange(range) }
  catch (err) { console.warn(`[sheets] range safe-fail: ${range} —`, err.message); return [] }
}

async function fetchSheetTitles() {
  try {
    if (!SHEET_ID) return []
    if (hasServiceAccountConfig()) {
      const token = await getAccessToken()
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { console.warn(`[sheets] fetchSheetTitles ${res.status}`); return [] }
      const data = await res.json()
      return (data.sheets || []).map(s => s?.properties?.title).filter(Boolean)
    } else if (API_KEY) {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title&key=${API_KEY}`
      const res = await fetch(url)
      if (!res.ok) { console.warn(`[sheets] fetchSheetTitles (key) ${res.status}`); return [] }
      const data = await res.json()
      return (data.sheets || []).map(s => s?.properties?.title).filter(Boolean)
    }
    return []
  } catch (err) {
    console.warn('[sheets] fetchSheetTitles error:', err.message)
    return []
  }
}

// ── Parsing helpers ────────────────────────────────────────────
function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-' || val === '#DIV/0!') return 0
  let s = String(val).trim()
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.replace(/[()]/g, '') }
  s = s.replace(/−/g, '-') // minus sign
  if (s.startsWith('-')) { negative = true; s = s.slice(1) }
  s = s.replace(/R\$\s*/gi, '').replace(/%/g, '').replace(/\s/g, '').replace(/[^0-9.,]/g, '')
  if (!s) return 0
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma !== -1) {
    s = (s.length - lastComma - 1) === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1) {
    if ((s.length - lastDot - 1) === 3) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return negative ? -n : n
}

function parsePct(val) { return parseNum(val) }
function parsePercentMeta(val) { const n = parseNum(val); if (!n) return 0; return Math.abs(n) <= 1 ? n * 100 : n }

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove combining diacritics
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function findColumn(headers, possibleNames, fallbackIndex = null) {
  const normH = headers.map(normalizeHeader)
  const normN = possibleNames.map(normalizeHeader)
  for (const name of normN) { const idx = normH.indexOf(name); if (idx !== -1) return idx }
  return fallbackIndex
}

function escapeRegExp(v) { return String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// ── Config ─────────────────────────────────────────────────────
function parseConfig(rows) {
  const map = {}
  ;(rows || []).slice(1).forEach(r => {
    const chave = String(r[0] || '').trim().toUpperCase()
    const valor = String(r[1] || '').trim()
    if (chave) map[chave] = valor
  })
  const empresas = []
  for (let i = 1; i <= 10; i++) {
    const codigo = String(map[`EMPRESA_${i}_CODIGO`] || '').trim().toUpperCase()
    const nome = String(map[`EMPRESA_${i}_NOME`] || '').trim()
    if (!codigo) continue
    empresas.push({
      codigo, nome: nome || codigo,
      semanasSheet: map[`SEMANAS_EMPRESA_${i}`] || `SEMANAS ${codigo}`,
      forecastSheet: map[`FORECAST_EMPRESA_${i}`] || `FORECAST_${codigo}`,
    })
  }
  return {
    dashboardNome: map.DASHBOARD_NOME || DEFAULT_CONFIG.dashboardNome,
    anoAtual: map.ANO_ATUAL || '',
    moeda: map.MOEDA || 'BRL',
    reunioesGeral: map.REUNIOES_GERAL || DEFAULT_CONFIG.reunioesGeral,
    empresas: empresas.length ? empresas : DEFAULT_CONFIG.empresas,
    raw: map,
  }
}

// ── Semanas ────────────────────────────────────────────────────
function parseSemanasRow(headers, row) {
  return {
    semana: row[0] || '',
    leads: parseNum(row[1]),
    mql: row[2] || '-',
    leadsMql: parseNum(row[3]),
    cpl: parseNum(row[4]),
    agendamentos: parseNum(row[5]),
    pctAgd: row[6] || '-',
    realizadas: parseNum(row[7]),
    pctRlzd: row[8] || '-',
    contratosPagos: parseNum(row[9]),
    pctConv: row[10] || '-',
    nmrr: parseNum(row[11]),
    tkm: parseNum(row[12]),
  }
}

// ── DASH row ───────────────────────────────────────────────────
function parseDashRow(headers, row) {
  const obj = {}
  headers.forEach((h, i) => { obj[h] = row[i] || '' })
  return {
    empresa: obj['Empresa'] || '',
    mes: obj['Mes'] || obj['Mês'] || '',
    leads: parseNum(obj['Leads']),
    agendamentos: parseNum(obj['Agendamentos'] || obj['Agendamento']),
    taxaAgendamento: parseFloat((parseNum(obj['Taxa_Agendamento']) * 100).toFixed(1)),
    realizadas: parseNum(obj['Realizadas']),
    taxaRealizadas: parseFloat((parseNum(obj['Taxa_Realizadas']) * 100).toFixed(1)),
    contratosVendidos: parseNum(obj['Contratos_Vendidos']),
    valorVendido: parseNum(obj['Valor_Vendido']),
    contratosPagos: parseNum(obj['Contratos_Pagos']),
    nmrr: parseNum(obj['NMRR']),
    tkm: parseNum(obj['TKM']),
    investimento: parseNum(obj['Investimento_Ads']),
    cpl: parseNum(obj['CPL']),
    cac: parseNum(obj['CAC']),
    mql: parsePct(obj['MQL']),
    gap: obj['Gap_Mês'] || obj['Gap_MÊs'] || obj['Gap_Mes'] || '',
  }
}

// ── Reunioes Geral ─────────────────────────────────────────────
const VALID_STATUSES = new Set(['PAGO','FORA','FUP','PM','FUGIU','FECHOU','RECALL','CONTRATO','ASSINADO'])

function normalizarStatus(v) {
  const s = String(v||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toUpperCase()
  return VALID_STATUSES.has(s) ? s : ''
}

function looksLikeMoneyOrNumber(v) {
  const raw = String(v||'').trim()
  if (!raw) return false
  if (normalizarStatus(raw)) return false
  return /[0-9]/.test(raw) && parseNum(raw) !== 0
}

function parseReunioesGeral(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0] || []
  const col = (names, fallback) => findColumn(headers, names, fallback)
  const idx = {
    empresa: col(['EMPRESA'], 0), mes: col(['MES','MÊS'], 1), ano: col(['ANO'], 2),
    origem: col(['ORIGEM'], 3), sdr: col(['SDR'], 4), closer: col(['CLOSER'], 5),
    data: col(['DATA'], 6), servico: col(['SERVIÇO','SERVICO'], 7), cliente: col(['CLIENTE'], 8),
    informacao: col(['INFORMAÇÃO','INFORMACAO','INFORMAÇÕES','INFORMACOES'], 9),
    nota: col(['NOTA'], 10), valor: col(['VALOR'], 11), status: col(['STATUS'], 12),
    dataFup: col(['DATA FUP','DATA_FUP','FUP'], 13),
  }
  return rows.slice(1)
    .filter(r => r && String(r[idx.empresa]||'').trim() !== '' && String(r[idx.empresa]||'').toUpperCase().trim() !== 'EMPRESA')
    .map((r, ri) => {
      let valorRaw = r[idx.valor], statusRaw = r[idx.status]
      let status = normalizarStatus(statusRaw)
      if (!status) {
        const si = r.findIndex(cell => normalizarStatus(cell))
        if (si !== -1) {
          const prev = statusRaw; statusRaw = r[si]; status = normalizarStatus(statusRaw)
          if (looksLikeMoneyOrNumber(prev)) valorRaw = prev
          else if (!looksLikeMoneyOrNumber(valorRaw)) {
            const before = r[si-1], after = r[si+1]
            if (looksLikeMoneyOrNumber(before)) valorRaw = before
            else if (looksLikeMoneyOrNumber(after)) valorRaw = after
          }
        }
      }
      return {
        id: ri + 1,
        empresa: String(r[idx.empresa]||'').trim().toUpperCase(),
        mes: String(r[idx.mes]||'').trim().toUpperCase(),
        ano: String(r[idx.ano]||'').trim(),
        origem: String(r[idx.origem]||'SEM ORIGEM').trim() || 'SEM ORIGEM',
        sdr: String(r[idx.sdr]||'').trim(),
        closer: String(r[idx.closer]||'').trim(),
        data: String(r[idx.data]||'').trim(),
        servico: String(r[idx.servico]||'').trim(),
        cliente: String(r[idx.cliente]||'').trim(),
        informacao: String(r[idx.informacao]||'').trim(),
        nota: String(r[idx.nota]||'').trim(),
        valor: parseNum(valorRaw),
        status: status || 'SEM STATUS',
        dataFup: String(r[idx.dataFup]||'').trim(),
      }
    })
    .filter(r => r.empresa || r.cliente || r.sdr || r.closer || r.status)
}

// ── Reunioes processadas ───────────────────────────────────────
function buildReunioesRowsFromGeral(registros, empresa, mesNome, ano) {
  const filtered = registros.filter(r =>
    String(r.empresa||'').toUpperCase() === empresa &&
    String(r.mes||'').toUpperCase() === String(mesNome||'').toUpperCase() &&
    String(r.ano||'') === String(ano||'')
  )
  const header = ['ORIGEM','SDR','CLOSER','DATA','SERVIÇO','CLIENTE','INFORMAÇÃO','NOTA','VALOR','STATUS','DATA FUP']
  const rows = filtered.map(r => [r.origem,r.sdr,r.closer,r.data,r.servico,r.cliente,r.informacao,r.nota,r.valor,r.status,r.dataFup])
  return [header, ...rows]
}

function processReunioes(rows) {
  if (!rows || rows.length < 2) return { cards: {}, graficos: {} }
  const data = rows.slice(1).filter(r => r[2] && r[2] !== '' && r[2] !== 'CLOSER')
  const total = data.length
  const pagos  = data.filter(r => String(r[9]||'').toUpperCase().trim() === 'PAGO').length
  const fora   = data.filter(r => String(r[9]||'').toUpperCase().trim() === 'FORA').length
  const fup    = data.filter(r => String(r[9]||'').toUpperCase().trim() === 'FUP').length
  const pm     = data.filter(r => String(r[9]||'').toUpperCase().trim() === 'PM').length
  const fugiu  = data.filter(r => String(r[9]||'').toUpperCase().trim() === 'FUGIU').length
  const outros = total - pagos - fora - fup - pm - fugiu

  let valorTotal = 0, nmrr = 0, nmrrCount = 0, dsvTotal = 0, dsvCount = 0
  data.forEach(r => {
    if (String(r[9]||'').toUpperCase().trim() !== 'PAGO') return
    const v = parseNum(r[8])
    const servico = String(r[4]||'').toUpperCase().trim()
    valorTotal += v
    if (servico === 'DSV' || servico === 'DSO') { dsvTotal += v; dsvCount++ }
    else { nmrr += v; nmrrCount++ }
  })

  const tkm  = nmrrCount > 0 ? parseFloat((nmrr / nmrrCount).toFixed(2)) : 0
  const taxa  = total > 0 ? parseFloat(((pagos / total) * 100).toFixed(1)) : 0

  const contarPor = (colIdx) => {
    const mapa = {}
    data.forEach(r => { const k = String(r[colIdx]||'').trim(); if (!k) return; mapa[k] = (mapa[k]||0)+1 })
    return Object.entries(mapa).sort((a,b)=>b[1]-a[1]).map(([nome,qtd])=>({nome,qtd}))
  }
  const valorPorCloser = () => {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9]||'').toUpperCase().trim() !== 'PAGO') return
      const k = String(r[2]||'').trim(); if (!k) return
      mapa[k] = (mapa[k]||0) + parseNum(r[8])
    })
    return Object.entries(mapa).sort((a,b)=>b[1]-a[1]).map(([nome,valor])=>({nome,valor}))
  }
  const taxaCloser = () => {
    const mapa = {}
    data.forEach(r => {
      const k = String(r[2]||'').trim(); if (!k||k==='CLOSER') return
      if (!mapa[k]) mapa[k] = {total:0,pagos:0}
      mapa[k].total++
      if (String(r[9]||'').toUpperCase().trim() === 'PAGO') mapa[k].pagos++
    })
    return Object.entries(mapa).map(([nome,v])=>({nome,taxa:v.total>0?parseFloat(((v.pagos/v.total)*100).toFixed(1)):0})).sort((a,b)=>b.taxa-a.taxa)
  }
  const pagosPorOrigem = () => {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9]||'').toUpperCase().trim() !== 'PAGO') return
      const k = String(r[0]||'SEM ORIGEM').trim()||'SEM ORIGEM'
      if (!mapa[k]) mapa[k] = {qtd:0,valor:0}
      mapa[k].qtd++; mapa[k].valor += parseNum(r[8])
    })
    return Object.entries(mapa).sort((a,b)=>b[1].valor-a[1].valor).map(([nome,v])=>({nome,qtd:v.qtd,valor:v.valor}))
  }
  const foraPorOrigem = () => {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9]||'').toUpperCase().trim() !== 'FORA') return
      const k = String(r[0]||'SEM ORIGEM').trim()||'SEM ORIGEM'
      mapa[k] = (mapa[k]||0)+1
    })
    return Object.entries(mapa).sort((a,b)=>b[1]-a[1]).map(([nome,qtd])=>({nome,qtd}))
  }
  const pipeline = () => {
    const alvo = ['FECHOU','PM','RECALL','CONTRATO','ASSINADO','FUP']
    const mapa = {}; alvo.forEach(s => { mapa[s] = {qtd:0,valor:0} })
    data.forEach(r => {
      const s = String(r[9]||'').toUpperCase().trim()
      if (!Object.prototype.hasOwnProperty.call(mapa, s)) return
      mapa[s].qtd++; mapa[s].valor += parseNum(r[8])
    })
    return alvo.filter(s=>mapa[s].qtd>0).map(s=>({nome:s,qtd:mapa[s].qtd,valor:mapa[s].valor}))
  }
  const contratosPorSdr = () => {
    const mapa = {}
    data.forEach(r => {
      const k = String(r[1]||'').trim(); if (!k||k==='SDR') return
      if (!mapa[k]) mapa[k] = {total:0,pagos:0}
      mapa[k].total++
      if (String(r[9]||'').toUpperCase().trim() === 'PAGO') mapa[k].pagos++
    })
    return Object.entries(mapa).sort((a,b)=>b[1].pagos-a[1].pagos).map(([nome,v])=>({nome,pagos:v.pagos,total:v.total,taxa:v.total>0?parseFloat(((v.pagos/v.total)*100).toFixed(1)):0}))
  }
  const evolucaoPorData = () => {
    const mapa = {}
    data.forEach(r => { const d=String(r[3]||'').trim(); if(!d) return; mapa[d]=(mapa[d]||0)+1 })
    return Object.entries(mapa).sort((a,b)=>a[0].localeCompare(b[0])).map(([data,qtd])=>({data,qtd}))
  }
  const statusArr = [{nome:'PAGO',qtd:pagos},{nome:'FORA',qtd:fora},{nome:'FUP',qtd:fup},{nome:'PM',qtd:pm},{nome:'FUGIU',qtd:fugiu},{nome:'OUTROS',qtd:outros}].filter(x=>x.qtd>0)

  return {
    cards: {total,pagos,fora,fup,pm,fugiu,outros,valorTotal,nmrr,tkm,dsvTotal,dsvCount,nmrrCount,taxa},
    graficos: {
      reunioesPorSdr: contarPor(1), reunioesPorCloser: contarPor(2), valorPorCloser: valorPorCloser(),
      reunioesPorOrigem: contarPor(0), status: statusArr, evolucao: evolucaoPorData(),
      qtdPagosPorOrigem: pagosPorOrigem(), valorPagoPorOrigem: pagosPorOrigem(),
      foraPorOrigem: foraPorOrigem(), taxaCloser: taxaCloser(), pipeline: pipeline(),
      contratosPorSdr: contratosPorSdr(),
    }
  }
}

// ── Performance Origem ─────────────────────────────────────────
function normalizeOrigemPerformance(v) {
  const clean = String(v||'').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
  if (!clean) return 'SEM ORIGEM'
  if (['MQL','F/MQL','FMQL','F MQL'].includes(clean)) return 'IB'
  if (['RECUP','RECUPERACAO','MES PAS','MES PASSADO'].includes(clean)) return 'RECUPERAÇÃO'
  if (['INDIC','INDICACAO'].includes(clean)) return 'INDICAÇÃO'
  return String(v||'').trim().toUpperCase()
}

function parsePerformanceOrigem(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0] || []
  const col = (names, fallback) => findColumn(headers, names, fallback)
  const idx = {
    empresa: col(['EMPRESA'],0), ano: col(['ANO'],1), mes: col(['MES','MÊS'],2), origem: col(['ORIGEM'],3),
    metaReunioes: col(['META_REUNIOES','META REUNIOES','META REUNIÕES'],4),
    realReunioes: col(['REAL_REUNIOES','REAL REUNIOES','REAL REUNIÕES'],5),
    gapReunioes: col(['GAP_REUNIOES','GAP REUNIOES','GAP REUNIÕES'],6),
    pctReunioes: col(['% REUNIOES','% REUNIÕES','PCT_REUNIOES','PCT REUNIOES'],7),
    metaPagos: col(['META_PAGOS','META PAGOS'],8), realPagos: col(['REAL_PAGOS','REAL PAGOS'],9),
    gapPagos: col(['GAP_PAGOS','GAP PAGOS'],10), pctPagos: col(['% PAGOS','PCT_PAGOS','PCT PAGOS'],11),
    metaNmrr: col(['META_NMRR','META NMRR'],12), realNmrr: col(['REAL_NMRR','REAL NMRR'],13),
    gapNmrr: col(['GAP_NMRR','GAP NMRR'],14), pctNmrr: col(['% NMRR','PCT_NMRR','PCT NMRR'],15),
  }
  return rows.slice(1)
    .filter(r => r && String(r[idx.empresa]||'').trim() !== '' && String(r[idx.empresa]||'').toUpperCase() !== 'EMPRESA')
    .map((r, ri) => ({
      id: ri+1,
      empresa: String(r[idx.empresa]||'').trim().toUpperCase(),
      ano: String(r[idx.ano]||'').trim(),
      mes: String(r[idx.mes]||'').trim().toUpperCase(),
      origem: normalizeOrigemPerformance(r[idx.origem]),
      metaReunioes: parseNum(r[idx.metaReunioes]), realReunioes: parseNum(r[idx.realReunioes]),
      gapReunioes: parseNum(r[idx.gapReunioes]), pctReunioes: parsePercentMeta(r[idx.pctReunioes]),
      metaPagos: parseNum(r[idx.metaPagos]), realPagos: parseNum(r[idx.realPagos]),
      gapPagos: parseNum(r[idx.gapPagos]), pctPagos: parsePercentMeta(r[idx.pctPagos]),
      metaNmrr: parseNum(r[idx.metaNmrr]), realNmrr: parseNum(r[idx.realNmrr]),
      gapNmrr: parseNum(r[idx.gapNmrr]), pctNmrr: parsePercentMeta(r[idx.pctNmrr]),
    }))
    .filter(r => r.empresa && r.mes && r.ano && r.origem)
}

// ── Forecast Equipe ────────────────────────────────────────────
function parseForecastEquipe(rows) {
  if (!rows || rows.length < 2) return []
  const headers = rows[0] || []
  const col = (names, fallback) => findColumn(headers, names, fallback)
  const idx = {
    empresa: col(['EMPRESA'],0), ano: col(['ANO'],1), mes: col(['MES','MÊS'],2),
    tipo: col(['TIPO'],3), nome: col(['NOME','PESSOA'],4), meta: col(['META'],5),
    supermeta: col(['SUPERMETA','SUPER META'],6),
  }
  return rows.slice(1)
    .filter(r => r && String(r[idx.empresa]||'').trim() !== '' && String(r[idx.empresa]||'').toUpperCase() !== 'EMPRESA')
    .map((r, ri) => ({
      id: ri+1,
      empresa: String(r[idx.empresa]||'').trim().toUpperCase(),
      ano: String(r[idx.ano]||'').trim(),
      mes: String(r[idx.mes]||'').trim().toUpperCase(),
      tipo: String(r[idx.tipo]||'').trim().toUpperCase(),
      nome: String(r[idx.nome]||'').trim().toUpperCase(),
      meta: parseNum(r[idx.meta]), supermeta: parseNum(r[idx.supermeta]),
    }))
    .filter(r => r.empresa && r.ano && r.mes && r.tipo && r.nome)
}

// ── Forecast mensal ────────────────────────────────────────────
function parseForecast(rows) {
  if (!rows || rows.length === 0) return []
  const headerIndex = rows.findIndex(r => {
    const first = normalizeHeader(r && r[0])
    return first === 'MES' || first === 'MES' // normalizeHeader strips diacritics
  })
  const headers = headerIndex >= 0 ? rows[headerIndex] : []
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows
  const hasHeaders = headers.length > 0

  const pick = (r, names, fallback) => {
    if (!hasHeaders) return r[fallback]
    const idx = findColumn(headers, names, fallback)
    return idx === null || idx === undefined ? '' : r[idx]
  }

  return dataRows
    .filter(r => r && r[0] && String(r[0]).trim() !== '' && normalizeHeader(r[0]) !== 'MES')
    .map(r => ({
      mes: String(r[0]||'').trim(),
      meta: parseNum(pick(r,['META','META PAGO','META MRR','META NMRR','META MRR PAGO','META DO MES'],null)),
      mrrPago: parseNum(pick(r,['MRR PAGO PROJETADO','MRR PAGO PROJ','MRR PROJETADO PAGO'],2)),
      pctPago: parseNum(pick(r,['% PAGO PROJETADO','PAGO PROJETADO','PERCENTUAL PAGO PROJETADO'],3)),
      gapPago: parseNum(pick(r,['GAP PAGO PROJETADO','GAP PAGO','GAP META PAGO'],4)),
      projecaoVendido: parseNum(pick(r,['PROJEÇÃO VENDIDO','PROJECAO VENDIDO','PROJEÇÃO DE VENDIDO','PROJECAO DE VENDIDO'],5)),
      pctVendido: parseNum(pick(r,['% VENDIDO PROJETADO','VENDIDO PROJETADO','PERCENTUAL VENDIDO PROJETADO'],6)),
      gapNmrr: parseNum(pick(r,['GAP NMRR','GAP MRR','GAP VENDIDO'],7)),
      gapContratos: parseNum(pick(r,['GAP CONTRATOS','GAP CONT','GAP CONTRATO'],8)),
      gapRlzd: parseNum(pick(r,['GAP RLZD','GAP REALIZADAS','GAP REALIZADA'],9)),
      gapAgd: parseNum(pick(r,['GAP AGD','GAP AGENDADAS','GAP AGENDAMENTOS'],10)),
      metaDiaPago: parseNum(pick(r,['META DIA PAGO','META PAGO DIA'],11)),
      metaAgdDia: parseNum(pick(r,['META AGD DIA','META AGENDAMENTO DIA','META AGENDAMENTOS DIA'],12)),
      metaRlzdDia: parseNum(pick(r,['META RLZD DIA','META REALIZADAS DIA','META REALIZADA DIA'],13)),
      metaContPagoDia: parseNum(pick(r,['META CONT. PAGO DIA','META CONT PAGO DIA','META CONTRATOS DIA','META CONTRATOS PAGOS DIA'],14)),
    }))
}

// ── Sheet discovery ────────────────────────────────────────────
function discoverDashPeriods(sheetTitles, empresas = DEFAULT_CONFIG.empresas) {
  const found = []
  const codes = empresas.map(e => e.codigo).filter(Boolean)
  const codePattern = codes.length ? codes.map(escapeRegExp).join('|') : 'AI|MO'
  const regex = new RegExp(`^DASH\\s+(${codePattern})\\s+([A-ZÇ]{3})\\s+(\\d{2})$`, 'i')

  sheetTitles.forEach(title => {
    const match = String(title||'').trim().match(regex)
    if (!match) return
    const empresa = match[1].toUpperCase()
    const mesAbbr = match[2].toUpperCase()
    const ano2 = match[3]
    const meta = MONTHS[mesAbbr]
    if (!meta) return
    const ano = 2000 + Number(ano2)
    const key = `${mesAbbr}${ano2}`
    found.push({
      key, empresa, mesAbbr, mesNome: meta.nome, label: `${meta.label} ${ano}`,
      ano: String(ano), order: ano * 100 + meta.numero,
      title: String(title).trim(), range: `${String(title).trim()}!A1:W2`,
    })
  })

  const byKey = new Map()
  found.forEach(p => {
    if (!byKey.has(p.key)) byKey.set(p.key, { key: p.key, label: p.label, mesAbbr: p.mesAbbr, mesNome: p.mesNome, ano: p.ano, order: p.order })
  })
  return {
    sheets: found.sort((a,b) => b.order - a.order),
    periodos: [...byKey.values()].sort((a,b) => b.order - a.order),
  }
}

function discoverSemanasSheets(sheetTitles, empresas = DEFAULT_CONFIG.empresas) {
  const titles = sheetTitles.map(title => String(title||'').trim())
  const found = []
  empresas.forEach(emp => {
    const configuredTitle = emp.semanasSheet || `SEMANAS ${emp.codigo}`
    const exact = titles.find(t => t.toUpperCase() === configuredTitle.toUpperCase())
    const prefixRegex = new RegExp(`^SEMANAS\\s+${escapeRegExp(emp.codigo)}(?:\\s+.*)?$`, 'i')
    const prefixMatches = titles.filter(t => prefixRegex.test(t))
    const selected = exact ? [exact, ...prefixMatches.filter(t => t !== exact)] : prefixMatches
    if (selected.length === 0) { found.push({ empresa: emp.codigo, title: configuredTitle, range: `${configuredTitle}!A1:M500` }); return }
    selected.forEach(title => { found.push({ empresa: emp.codigo, title, range: `${title}!A1:M500` }) })
  })
  return found
}

// ── Main export ────────────────────────────────────────────────
export async function getAllDashData({ force = false } = {}) {
  // Return server-side cache if fresh
  if (!force && _dataCache && Date.now() - _dataCacheAt < CACHE_TTL) {
    return _dataCache
  }

  try {
    const rawConfig = await fetchRangeSafe(RANGES.CONFIG)
    const config = parseConfig(rawConfig)

    const sheetTitles = await fetchSheetTitles() // always safe now
    const { sheets: dashSheets, periodos } = discoverDashPeriods(sheetTitles, config.empresas)
    const semanasSheets = discoverSemanasSheets(sheetTitles, config.empresas)

    const forecastRanges = config.empresas.map(emp => ({
      empresa: emp.codigo,
      title: emp.forecastSheet || `FORECAST_${emp.codigo}`,
      range: `${emp.forecastSheet || `FORECAST_${emp.codigo}`}!A1:Z200`,
    }))

    const [rawReunioesGeral, rawPerformanceOrigem, ...restRaw] = await Promise.all([
      // REUNIOES_GERAL agora é safe — não quebra tudo se a aba não existir
      fetchRangeSafe(`${config.reunioesGeral}!A1:O20000`),
      fetchRangeSafe(RANGES.PERFORMANCE_ORIGEM),
      fetchRangeSafe(RANGES.FORECAST_EQUIPE),
      ...forecastRanges.map(f => fetchRangeSafe(f.range)),
      ...semanasSheets.map(s => fetchRangeSafe(s.range)),
      ...dashSheets.map(s => fetchRangeSafe(s.range)),
    ])

    const rawForecastEquipe = restRaw[0] || []
    const forecastRaw = restRaw.slice(1, 1 + forecastRanges.length)
    const semanasRaw = restRaw.slice(1 + forecastRanges.length, 1 + forecastRanges.length + semanasSheets.length)
    const dashRaw = restRaw.slice(1 + forecastRanges.length + semanasSheets.length)

    const parseSemanasSet = (empresa) => semanasSheets
      .map((sheet, idx) => ({ sheet, raw: semanasRaw[idx] }))
      .filter(item => item.sheet.empresa === empresa)
      .flatMap(item => item.raw && item.raw.length > 1
        ? item.raw.slice(1).map(r => parseSemanasRow(item.raw[0], r)).filter(r => r.semana)
        : [])

    const reunioesGeral = parseReunioesGeral(rawReunioesGeral)
    const performanceOrigem = parsePerformanceOrigem(rawPerformanceOrigem)
    const forecastEquipe = parseForecastEquipe(rawForecastEquipe)

    const result = {
      GERAL: reunioesGeral,
      PERFORMANCE_ORIGEM: performanceOrigem,
      FORECAST_EQUIPE: forecastEquipe,
      PERIODOS: periodos,
      syncedAt: new Date().toISOString(),
      CONFIG: {
        dashboardNome: config.dashboardNome,
        anoAtual: config.anoAtual,
        moeda: config.moeda,
        reunioesGeral: config.reunioesGeral,
        empresas: config.empresas.map(({ codigo, nome }) => ({ codigo, nome })),
      },
    }

    config.empresas.forEach((emp, idx) => {
      result[emp.codigo] = {
        SEMANAS: parseSemanasSet(emp.codigo),
        FORECAST: parseForecast(forecastRaw[idx]),
      }
    })

    dashSheets.forEach((sheet, idx) => {
      const raw = dashRaw[idx]
      const metricas = raw && raw.length >= 2 ? parseDashRow(raw[0], raw[1]) : {}
      const reunioesRows = buildReunioesRowsFromGeral(reunioesGeral, sheet.empresa, sheet.mesNome, sheet.ano)
      if (!result[sheet.empresa]) result[sheet.empresa] = {}
      result[sheet.empresa][sheet.key] = {
        metricas, reunioes: processReunioes(reunioesRows),
        label: sheet.label, mes: sheet.mesNome, ano: sheet.ano,
      }
    })

    _dataCache = result
    _dataCacheAt = Date.now()
    return result

  } catch (err) {
    // Nunca retornar 500 — logar o erro e retornar estrutura com campo `error` para o frontend exibir
    console.error('[sheets] getAllDashData FATAL:', err.message)
    // Se há cache anterior válido, retorná-lo mesmo vencido (melhor que vazio)
    if (_dataCache) {
      console.warn('[sheets] Retornando cache anterior após erro fatal')
      return { ..._dataCache, _stale: true }
    }
    return emptyDashData(err.message)
  }
}

// ── Debug helper ───────────────────────────────────────────────
export async function getDebugInfo() {
  const pk = String(PRIVATE_KEY_RAW || '').replace(/\\n/g, '\n')
  const envCheck = {
    SHEET_ID_usado: SHEET_ID ? `ok (${SHEET_ID.slice(0,10)}...)` : 'FALTANDO',
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID ? 'definido' : 'não definido',
    SHEET_ID_legado: process.env.SHEET_ID ? 'definido' : 'não definido',
    GOOGLE_SERVICE_ACCOUNT_EMAIL: SERVICE_ACCOUNT_EMAIL ? `ok (${SERVICE_ACCOUNT_EMAIL})` : 'não definido',
    GOOGLE_PRIVATE_KEY: PRIVATE_KEY_RAW
      ? `ok (len=${String(PRIVATE_KEY_RAW).length}, has_header=${pk.includes('PRIVATE KEY')})`
      : 'não definido',
    GOOGLE_API_KEY: API_KEY ? `ok (len=${API_KEY.length})` : 'não definido',
    metodo_auth: hasServiceAccountConfig() ? 'ServiceAccount' : (API_KEY ? 'APIKey' : 'NENHUM'),
  }

  let authTest = null
  if (hasServiceAccountConfig()) {
    try {
      const token = await getAccessToken()
      authTest = `ServiceAccount ok (token len=${token.length})`
    } catch (e) {
      authTest = `ServiceAccount ERRO: ${e.message}`
    }
  } else if (API_KEY) {
    authTest = 'APIKey configurada (não testada aqui)'
  } else {
    authTest = 'NENHUM método de auth configurado'
  }

  let titlesTest = []
  try {
    titlesTest = await fetchSheetTitles()
  } catch (e) {
    titlesTest = [`ERRO: ${e.message}`]
  }

  let sampleRange = null
  try {
    const rows = await fetchRange('CONFIG!A1:C5')
    sampleRange = { range: 'CONFIG!A1:C5', rows: rows.length, sample: rows.slice(0, 3) }
  } catch (e) {
    sampleRange = { error: e.message }
  }

  return { envCheck, authTest, sheetTitles: titlesTest, sampleRange }
}
