const SHEET_ID = process.env.SHEET_ID
const API_KEY = process.env.GOOGLE_API_KEY

const RANGES = {
  DASH_AI_MAI: 'DASH AI MAI 26!A1:W2',
  DASH_AI_ABR: 'DASH AI ABR 26!A1:W2',
  DASH_MO_MAI: 'DASH MO MAI 26!A1:W2',
  DASH_MO_ABR: 'DASH MO ABR 26!A1:W2',
  SEMANAS_AI:  'SEMANAS AI!A1:M30',
  SEMANAS_MO:  'SEMANAS MO!A1:M30',
  REUNIOES_AI_04: 'REUNIOES_AI_04!A1:K500',
  REUNIOES_AI_05: 'REUNIOES_AI_05!A1:K500',
  REUNIOES_MO_04: 'REUNIOES_MO_04!A1:K500',
  REUNIOES_MO_05: 'REUNIOES_MO_05!A1:K500',
  FORECAST_AI: 'FORECAST_AI!A1:Z50',
  FORECAST_MO: 'FORECAST_MO!A1:Z50',
  REUNIOES_GERAL: 'REUNIOES_GERAL!A1:N5000',
}

async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error(`Sheets API error: ${res.status} for range ${range}`)
  const data = await res.json()
  return data.values || []
}

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-' || val === '#DIV/0!') return 0

  let s = String(val).trim()
  let negative = false

  // Handles formats like (R$ 1.234,56), unicode minus and normal negative values.
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.replace(/[()]/g, '')
  }
  if (s.includes('−')) s = s.replace(/−/g, '-')
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
    // If the last separator is comma, assume BR format: 46.664,7 -> 46664.7
    // If the last separator is dot, assume US/API format: 46,664.7 -> 46664.7
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1
    // 46,6 or 46,66 = decimal. 46,664 = thousand separator.
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1
    // 46.664 = thousand separator. 46.6 or 46.66 = decimal.
    if (decimals === 3) s = s.replace(/\./g, '')
  }

  const n = parseFloat(s)
  if (isNaN(n)) return 0
  return negative ? -n : n
}

function parsePct(val) {
  return parseNum(val)
}

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
    cac: parseFloat(String(obj['CAC'] || '0').replace(/[^0-9.,]/g,'').replace(',','.')) || 0,
    mql: parsePct(obj['MQL']),
    gap: obj['Gap_Mês'] || obj['Gap_MÊs'] || obj['Gap_Mes'] || '',
  }
}

function parseSemanasRow(headers, row) {
  // Cols: A=SEMANA, B=LEADS, C=MQL, D=LEADS_MQL, E=CPL, F=AGENDAMENTOS, G=%AGD, H=REALIZADAS, I=%RLZD, J=CONTRATOS_PAGOS, K=%CONV, L=NMRR, M=TKM
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

function processReunioes(rows, servicoCol = 4) {
  if (!rows || rows.length < 2) return { cards: {}, graficos: {} }
  const data = rows.slice(1).filter(r => r[2] && r[2] !== '' && r[2] !== 'CLOSER')

  const total = data.length
  const pagos = data.filter(r => String(r[9] || '').toUpperCase().trim() === 'PAGO').length
  const fora  = data.filter(r => String(r[9] || '').toUpperCase().trim() === 'FORA').length
  const fup   = data.filter(r => String(r[9] || '').toUpperCase().trim() === 'FUP').length
  const pm    = data.filter(r => String(r[9] || '').toUpperCase().trim() === 'PM').length
  const fugiu = data.filter(r => String(r[9] || '').toUpperCase().trim() === 'FUGIU').length
  const outros = total - pagos - fora - fup - pm - fugiu

  let valorTotal = 0
  let nmrr = 0
  let nmrrCount = 0
  let dsvTotal = 0
  let dsvCount = 0

  data.forEach(r => {
    if (String(r[9] || '').toUpperCase().trim() !== 'PAGO') return
    const v = parseNum(r[8])
    const servico = String(r[servicoCol] || '').toUpperCase().trim()
    valorTotal += v
    if (servico === 'DSV' || servico === 'DSO') {
      dsvTotal += v
      dsvCount++
    } else {
      nmrr += v
      nmrrCount++
    }
  })

  const tkm = nmrrCount > 0 ? parseFloat((nmrr / nmrrCount).toFixed(2)) : 0
  const taxa = total > 0 ? parseFloat(((pagos / total) * 100).toFixed(1)) : 0

  function contarPor(colIdx) {
    const mapa = {}
    data.forEach(r => {
      const k = String(r[colIdx] || '').trim()
      if (!k) return
      mapa[k] = (mapa[k] || 0) + 1
    })
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }))
  }

  function valorPorCloser() {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9] || '').toUpperCase().trim() !== 'PAGO') return
      const k = String(r[2] || '').trim()
      if (!k) return
      const v = parseNum(r[8])
      mapa[k] = (mapa[k] || 0) + v
    })
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).map(([nome, valor]) => ({ nome, valor }))
  }

  function taxaCloser() {
    const mapa = {}
    data.forEach(r => {
      const k = String(r[2] || '').trim()
      if (!k || k === 'CLOSER') return
      if (!mapa[k]) mapa[k] = { total: 0, pagos: 0 }
      mapa[k].total++
      if (String(r[9] || '').toUpperCase().trim() === 'PAGO') mapa[k].pagos++
    })
    return Object.entries(mapa).map(([nome, v]) => ({
      nome,
      taxa: v.total > 0 ? parseFloat(((v.pagos / v.total) * 100).toFixed(1)) : 0,
      label: `${v.pagos}/${v.total}`
    })).sort((a, b) => b.taxa - a.taxa)
  }

  function pagosPorOrigem() {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9] || '').toUpperCase().trim() !== 'PAGO') return
      const k = String(r[0] || 'SEM ORIGEM').trim() || 'SEM ORIGEM'
      if (!mapa[k]) mapa[k] = { qtd: 0, valor: 0 }
      mapa[k].qtd++
      const v = parseNum(r[8])
      mapa[k].valor += v
    })
    return Object.entries(mapa).sort((a, b) => b[1].valor - a[1].valor).map(([nome, v]) => ({ nome, qtd: v.qtd, valor: v.valor }))
  }

  function foraPorOrigem() {
    const mapa = {}
    data.forEach(r => {
      if (String(r[9] || '').toUpperCase().trim() !== 'FORA') return
      const k = String(r[0] || 'SEM ORIGEM').trim() || 'SEM ORIGEM'
      mapa[k] = (mapa[k] || 0) + 1
    })
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]).map(([nome, qtd]) => ({ nome, qtd }))
  }

  function pipeline() {
    const alvo = ['FECHOU', 'PM', 'RECALL', 'CONTRATO', 'ASSINADO', 'FUP']
    const mapa = {}
    alvo.forEach(s => { mapa[s] = { qtd: 0, valor: 0 } })
    data.forEach(r => {
      const s = String(r[9] || '').toUpperCase().trim()
      if (!mapa.hasOwnProperty(s)) return
      mapa[s].qtd++
      mapa[s].valor += parseNum(r[8])
    })
    return alvo
      .filter(s => mapa[s].qtd > 0)
      .map(s => ({ nome: s, qtd: mapa[s].qtd, valor: mapa[s].valor }))
  }

  function contratosPorSdr() {
    const mapa = {}
    data.forEach(r => {
      const k = String(r[1] || '').trim()
      if (!k || k === 'SDR') return
      if (!mapa[k]) mapa[k] = { total: 0, pagos: 0 }
      mapa[k].total++
      if (String(r[9] || '').toUpperCase().trim() === 'PAGO') mapa[k].pagos++
    })
    return Object.entries(mapa).sort((a, b) => b[1].pagos - a[1].pagos).map(([nome, v]) => ({
      nome, pagos: v.pagos, total: v.total,
      taxa: v.total > 0 ? parseFloat(((v.pagos / v.total) * 100).toFixed(1)) : 0
    }))
  }

  function evolucaoPorData() {
    const mapa = {}
    data.forEach(r => {
      const d = String(r[3] || '').trim()
      if (!d) return
      mapa[d] = (mapa[d] || 0) + 1
    })
    return Object.entries(mapa).sort((a, b) => a[0].localeCompare(b[0])).map(([data, qtd]) => ({ data, qtd }))
  }

  const statusArr = [
    { nome: 'PAGO', qtd: pagos },
    { nome: 'FORA', qtd: fora },
    { nome: 'FUP', qtd: fup },
    { nome: 'PM', qtd: pm },
    { nome: 'FUGIU', qtd: fugiu },
    { nome: 'OUTROS', qtd: outros },
  ].filter(x => x.qtd > 0)

  return {
    cards: { total, pagos, fora, fup, pm, fugiu, outros, valorTotal, nmrr, tkm, dsvTotal, dsvCount, nmrrCount, taxa },
    graficos: {
      reunioesPorSdr: contarPor(1),
      reunioesPorCloser: contarPor(2),
      valorPorCloser: valorPorCloser(),
      reunioesPorOrigem: contarPor(0),
      status: statusArr,
      evolucao: evolucaoPorData(),
      qtdPagosPorOrigem: pagosPorOrigem(),
      valorPagoPorOrigem: pagosPorOrigem(),
      foraPorOrigem: foraPorOrigem(),
      taxaCloser: taxaCloser(),
      pipeline: pipeline(),
      contratosPorSdr: contratosPorSdr(),
    }
  }
}


function parseReunioesGeral(rows) {
  // Expected columns:
  // A=EMPRESA, B=MES, C=ANO, D=ORIGEM, E=SDR, F=CLOSER, G=DATA,
  // H=SERVIÇO, I=CLIENTE, J=INFORMAÇÃO, K=NOTA, L=VALOR, M=STATUS, N=DATA FUP
  if (!rows || rows.length < 2) return []

  return rows.slice(1)
    .filter(r => r && String(r[0] || '').trim() !== '' && String(r[0] || '').toUpperCase().trim() !== 'EMPRESA')
    .map((r, idx) => ({
      id: idx + 1,
      empresa: String(r[0] || '').trim().toUpperCase(),
      mes: String(r[1] || '').trim().toUpperCase(),
      ano: String(r[2] || '').trim(),
      origem: String(r[3] || 'SEM ORIGEM').trim() || 'SEM ORIGEM',
      sdr: String(r[4] || '').trim(),
      closer: String(r[5] || '').trim(),
      data: String(r[6] || '').trim(),
      servico: String(r[7] || '').trim(),
      cliente: String(r[8] || '').trim(),
      informacao: String(r[9] || '').trim(),
      nota: String(r[10] || '').trim(),
      valor: parseNum(r[11]),
      status: String(r[12] || '').trim().toUpperCase(),
      dataFup: String(r[13] || '').trim(),
    }))
    .filter(r => r.empresa || r.cliente || r.sdr || r.closer || r.status)
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function findColumn(headers, possibleNames, fallbackIndex = null) {
  const normalizedHeaders = headers.map(normalizeHeader)
  const normalizedNames = possibleNames.map(normalizeHeader)
  for (const name of normalizedNames) {
    const idx = normalizedHeaders.indexOf(name)
    if (idx !== -1) return idx
  }
  return fallbackIndex
}

function getForecastValue(row, headers, possibleNames, fallbackIndex = null) {
  const idx = findColumn(headers, possibleNames, fallbackIndex)
  return idx === null || idx === undefined ? '' : row[idx]
}

function parseForecast(rows) {
  if (!rows || rows.length === 0) return []

  const headerIndex = rows.findIndex(r => {
    const first = normalizeHeader(r && r[0])
    return first === 'MES' || first === 'MÊS'
  })

  const headers = headerIndex >= 0 ? rows[headerIndex] : []
  const dataRows = headerIndex >= 0 ? rows.slice(headerIndex + 1) : rows
  const hasHeaders = headers.length > 0

  return dataRows
    .filter(r => r && r[0] && String(r[0]).trim() !== '')
    .filter(r => {
      const mes = normalizeHeader(r[0])
      return mes !== 'MES' && mes !== 'MÊS'
    })
    .map(r => {
      const pick = (names, fallback) => hasHeaders ? getForecastValue(r, headers, names, fallback) : r[fallback]

      return {
        mes: String(r[0] || '').trim(),
        meta: parseNum(pick(['META', 'META PAGO', 'META MRR', 'META NMRR', 'META MRR PAGO', 'META DO MES'], null)),
        mrrPago: parseNum(pick(['MRR PAGO PROJETADO', 'MRR PAGO PROJ', 'MRR PROJETADO PAGO'], 2)),
        pctPago: parseNum(pick(['% PAGO PROJETADO', 'PAGO PROJETADO', 'PERCENTUAL PAGO PROJETADO'], 3)),
        gapPago: parseNum(pick(['GAP PAGO PROJETADO', 'GAP PAGO', 'GAP META PAGO'], 4)),
        projecaoVendido: parseNum(pick(['PROJEÇÃO VENDIDO', 'PROJECAO VENDIDO', 'PROJEÇÃO DE VENDIDO', 'PROJECAO DE VENDIDO'], 5)),
        pctVendido: parseNum(pick(['% VENDIDO PROJETADO', 'VENDIDO PROJETADO', 'PERCENTUAL VENDIDO PROJETADO'], 6)),
        gapNmrr: parseNum(pick(['GAP NMRR', 'GAP MRR', 'GAP VENDIDO'], 7)),
        gapContratos: parseNum(pick(['GAP CONTRATOS', 'GAP CONT', 'GAP CONTRATO'], 8)),
        gapRlzd: parseNum(pick(['GAP RLZD', 'GAP REALIZADAS', 'GAP REALIZADA'], 9)),
        gapAgd: parseNum(pick(['GAP AGD', 'GAP AGENDADAS', 'GAP AGENDAMENTOS'], 10)),
        metaDiaPago: parseNum(pick(['META DIA PAGO', 'META PAGO DIA'], 11)),
        metaAgdDia: parseNum(pick(['META AGD DIA', 'META AGENDAMENTO DIA', 'META AGENDAMENTOS DIA'], 12)),
        metaRlzdDia: parseNum(pick(['META RLZD DIA', 'META REALIZADAS DIA', 'META REALIZADA DIA'], 13)),
        metaContPagoDia: parseNum(pick(['META CONT. PAGO DIA', 'META CONT PAGO DIA', 'META CONTRATOS DIA', 'META CONTRATOS PAGOS DIA'], 14)),
      }
    })
}

export async function getAllDashData() {
  const [
    rawAiMai, rawAiAbr, rawMoMai, rawMoAbr,
    rawSemanasAi, rawSemanasMo,
    rawReuAi04, rawReuAi05, rawReuMo04, rawReuMo05,
    rawForecastAi, rawForecastMo, rawReunioesGeral
  ] = await Promise.all([
    fetchRange(RANGES.DASH_AI_MAI),
    fetchRange(RANGES.DASH_AI_ABR),
    fetchRange(RANGES.DASH_MO_MAI),
    fetchRange(RANGES.DASH_MO_ABR),
    fetchRange(RANGES.SEMANAS_AI),
    fetchRange(RANGES.SEMANAS_MO),
    fetchRange(RANGES.REUNIOES_AI_04),
    fetchRange(RANGES.REUNIOES_AI_05),
    fetchRange(RANGES.REUNIOES_MO_04),
    fetchRange(RANGES.REUNIOES_MO_05),
    fetchRange(RANGES.FORECAST_AI),
    fetchRange(RANGES.FORECAST_MO),
    fetchRange(RANGES.REUNIOES_GERAL),
  ])

  const aiMai = rawAiMai.length >= 2 ? parseDashRow(rawAiMai[0], rawAiMai[1]) : {}
  const aiAbr = rawAiAbr.length >= 2 ? parseDashRow(rawAiAbr[0], rawAiAbr[1]) : {}
  const moMai = rawMoMai.length >= 2 ? parseDashRow(rawMoMai[0], rawMoMai[1]) : {}
  const moAbr = rawMoAbr.length >= 2 ? parseDashRow(rawMoAbr[0], rawMoAbr[1]) : {}

  const semanasAi = rawSemanasAi.length > 1
    ? rawSemanasAi.slice(1).map(r => parseSemanasRow(rawSemanasAi[0], r)).filter(r => r.semana)
    : []
  const semanasMo = rawSemanasMo.length > 1
    ? rawSemanasMo.slice(1).map(r => parseSemanasRow(rawSemanasMo[0], r)).filter(r => r.semana)
    : []

  const forecastAi = parseForecast(rawForecastAi)
  const forecastMo = parseForecast(rawForecastMo)
  const reunioesGeral = parseReunioesGeral(rawReunioesGeral)

  return {
    AI: {
      MAI: { metricas: aiMai, reunioes: processReunioes(rawReuAi05) },
      ABR: { metricas: aiAbr, reunioes: processReunioes(rawReuAi04) },
      SEMANAS: semanasAi,
      FORECAST: forecastAi,
    },
    MO: {
      MAI: { metricas: moMai, reunioes: processReunioes(rawReuMo05) },
      ABR: { metricas: moAbr, reunioes: processReunioes(rawReuMo04) },
      SEMANAS: semanasMo,
      FORECAST: forecastMo,
    },
    GERAL: reunioesGeral
  }
}


export async function getDebugForecastData() {
  const [rawForecastAi, rawForecastMo] = await Promise.all([
    fetchRange(RANGES.FORECAST_AI),
    fetchRange(RANGES.FORECAST_MO),
  ])

  return {
    ranges: {
      FORECAST_AI: RANGES.FORECAST_AI,
      FORECAST_MO: RANGES.FORECAST_MO,
    },
    raw: {
      AI: rawForecastAi,
      MO: rawForecastMo,
    },
    parsed: {
      AI: parseForecast(rawForecastAi),
      MO: parseForecast(rawForecastMo),
    },
  }
}
