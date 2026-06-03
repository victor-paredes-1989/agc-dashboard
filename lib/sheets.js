const SHEET_ID = process.env.SHEET_ID
const API_KEY = process.env.GOOGLE_API_KEY

const RANGES = {
  SEMANAS_AI: 'SEMANAS AI!A1:M500',
  SEMANAS_MO: 'SEMANAS MO!A1:M500',
  FORECAST_AI: 'FORECAST_AI!A1:Z200',
  FORECAST_MO: 'FORECAST_MO!A1:Z200',
  REUNIOES_GERAL: 'REUNIOES_GERAL!A1:N20000',
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

async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error(`Sheets API error: ${res.status} for range ${range}`)
  const data = await res.json()
  return data.values || []
}

async function fetchSheetTitles() {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties.title&key=${API_KEY}`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error(`Sheets metadata error: ${res.status}`)
  const data = await res.json()
  return (data.sheets || []).map(s => s?.properties?.title).filter(Boolean)
}

function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === '-' || val === '#DIV/0!') return 0

  let s = String(val).trim()
  let negative = false

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
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    const decimals = s.length - lastComma - 1
    s = decimals === 3 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot !== -1) {
    const decimals = s.length - lastDot - 1
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
    cac: parseNum(obj['CAC']),
    mql: parsePct(obj['MQL']),
    gap: obj['Gap_Mês'] || obj['Gap_MÊs'] || obj['Gap_Mes'] || '',
  }
}

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

function discoverDashPeriods(sheetTitles) {
  const found = []

  sheetTitles.forEach(title => {
    const match = String(title || '').trim().match(/^DASH\s+(AI|MO)\s+([A-ZÇ]{3})\s+(\d{2})$/i)
    if (!match) return

    const empresa = match[1].toUpperCase()
    const mesAbbr = match[2].toUpperCase()
    const ano2 = match[3]
    const meta = MONTHS[mesAbbr]
    if (!meta) return

    const ano = 2000 + Number(ano2)
    const key = `${mesAbbr}${ano2}`

    found.push({
      key,
      empresa,
      mesAbbr,
      mesNome: meta.nome,
      label: `${meta.label} ${ano}`,
      ano: String(ano),
      order: ano * 100 + meta.numero,
      title: String(title).trim(),
      range: `${String(title).trim()}!A1:W2`,
    })
  })

  const byKey = new Map()
  found.forEach(p => {
    if (!byKey.has(p.key)) {
      byKey.set(p.key, {
        key: p.key,
        label: p.label,
        mesAbbr: p.mesAbbr,
        mesNome: p.mesNome,
        ano: p.ano,
        order: p.order,
      })
    }
  })

  return {
    sheets: found.sort((a, b) => b.order - a.order),
    periodos: [...byKey.values()].sort((a, b) => b.order - a.order),
  }
}

function buildReunioesRowsFromGeral(registros, empresa, mesNome, ano) {
  const filtered = registros.filter(r =>
    String(r.empresa || '').toUpperCase() === empresa &&
    String(r.mes || '').toUpperCase() === String(mesNome || '').toUpperCase() &&
    String(r.ano || '') === String(ano || '')
  )

  const header = ['ORIGEM', 'SDR', 'CLOSER', 'DATA', 'SERVIÇO', 'CLIENTE', 'INFORMAÇÃO', 'NOTA', 'VALOR', 'STATUS', 'DATA FUP']
  const rows = filtered.map(r => [
    r.origem,
    r.sdr,
    r.closer,
    r.data,
    r.servico,
    r.cliente,
    r.informacao,
    r.nota,
    r.valor,
    r.status,
    r.dataFup,
  ])

  return [header, ...rows]
}

export async function getAllDashData() {
  const sheetTitles = await fetchSheetTitles()
  const { sheets: dashSheets, periodos } = discoverDashPeriods(sheetTitles)

  const [rawSemanasAi, rawSemanasMo, rawForecastAi, rawForecastMo, rawReunioesGeral, ...dashRaw] = await Promise.all([
    fetchRange(RANGES.SEMANAS_AI),
    fetchRange(RANGES.SEMANAS_MO),
    fetchRange(RANGES.FORECAST_AI),
    fetchRange(RANGES.FORECAST_MO),
    fetchRange(RANGES.REUNIOES_GERAL),
    ...dashSheets.map(s => fetchRange(s.range)),
  ])

  const semanasAi = rawSemanasAi.length > 1
    ? rawSemanasAi.slice(1).map(r => parseSemanasRow(rawSemanasAi[0], r)).filter(r => r.semana)
    : []
  const semanasMo = rawSemanasMo.length > 1
    ? rawSemanasMo.slice(1).map(r => parseSemanasRow(rawSemanasMo[0], r)).filter(r => r.semana)
    : []

  const forecastAi = parseForecast(rawForecastAi)
  const forecastMo = parseForecast(rawForecastMo)
  const reunioesGeral = parseReunioesGeral(rawReunioesGeral)

  const result = {
    AI: { SEMANAS: semanasAi, FORECAST: forecastAi },
    MO: { SEMANAS: semanasMo, FORECAST: forecastMo },
    GERAL: reunioesGeral,
    PERIODOS: periodos,
    META: {
      dashSheets: dashSheets.map(({ key, empresa, title, range, label }) => ({ key, empresa, title, range, label })),
      source: 'dynamic-sheet-discovery',
    }
  }

  dashSheets.forEach((sheet, idx) => {
    const raw = dashRaw[idx]
    const metricas = raw && raw.length >= 2 ? parseDashRow(raw[0], raw[1]) : {}
    const reunioesRows = buildReunioesRowsFromGeral(reunioesGeral, sheet.empresa, sheet.mesNome, sheet.ano)

    if (!result[sheet.empresa]) result[sheet.empresa] = {}
    result[sheet.empresa][sheet.key] = {
      metricas,
      reunioes: processReunioes(reunioesRows),
      label: sheet.label,
      mes: sheet.mesNome,
      ano: sheet.ano,
    }
  })

  return result
}

export async function getDebugForecastData() {
  const sheetTitles = await fetchSheetTitles()
  const { sheets: dashSheets, periodos } = discoverDashPeriods(sheetTitles)
  const [rawForecastAi, rawForecastMo, rawReunioesGeral] = await Promise.all([
    fetchRange(RANGES.FORECAST_AI),
    fetchRange(RANGES.FORECAST_MO),
    fetchRange(RANGES.REUNIOES_GERAL),
  ])

  return {
    detectedPeriods: periodos,
    detectedDashSheets: dashSheets.map(s => ({ key: s.key, empresa: s.empresa, title: s.title, range: s.range, label: s.label })),
    ranges: {
      FORECAST_AI: RANGES.FORECAST_AI,
      FORECAST_MO: RANGES.FORECAST_MO,
      REUNIOES_GERAL: RANGES.REUNIOES_GERAL,
    },
    raw: {
      AI: rawForecastAi,
      MO: rawForecastMo,
      REUNIOES_GERAL_SAMPLE: rawReunioesGeral.slice(0, 10),
    },
    parsed: {
      AI: parseForecast(rawForecastAi),
      MO: parseForecast(rawForecastMo),
      reunioesGeralCount: parseReunioesGeral(rawReunioesGeral).length,
    },
  }
}
