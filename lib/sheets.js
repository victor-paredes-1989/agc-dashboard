const SHEET_ID = process.env.SHEET_ID
const API_KEY = process.env.GOOGLE_API_KEY

const RANGES = {
  DASH_AI_MAI: 'DASH AI MAI 26!A1:W2',
  DASH_AI_ABR: 'DASH AI ABR 26!A1:W2',
  DASH_MO_MAI: 'DASH MO MAI 26!A1:W2',
  DASH_MO_ABR: 'DASH MO ABR 26!A1:W2',
  SEMANAS_AI:  'SEMANAS AI!A1:L30',
  SEMANAS_MO:  'SEMANAS MO!A1:L30',
  REUNIOES_AI_04: 'REUNIOES_AI_04!A1:K500',
  REUNIOES_AI_05: 'REUNIOES_AI_05!A1:K500',
  REUNIOES_MO_04: 'REUNIOES_MO_04!A1:K500',
  REUNIOES_MO_05: 'REUNIOES_MO_05!A1:K500',
}

async function fetchRange(range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) throw new Error(`Sheets API error: ${res.status} for range ${range}`)
  const data = await res.json()
  return data.values || []
}

function parseNum(val) {
  if (!val || val === '-' || val === '#DIV/0!') return 0
  const clean = String(val).replace(/[R$\s,.]/g, '').replace(',', '.')
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
}

function parsePct(val) {
  if (!val || val === '-' || val === '#DIV/0!') return 0
  const clean = String(val).replace('%', '').trim()
  const n = parseFloat(clean)
  return isNaN(n) ? 0 : n
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
    agendamentos: parseNum(row[4]),
    realizadas: parseNum(row[6]),
    contratosPagos: parseNum(row[8]),
    nmrr: parseNum(row[10]),
    tkm: parseNum(row[11]),
  }
}

function processReunioes(rows) {
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
  data.forEach(r => {
    if (String(r[9] || '').toUpperCase().trim() === 'PAGO') {
      const v = parseFloat(String(r[8] || '0').replace(/[^0-9.]/g, ''))
      if (!isNaN(v)) valorTotal += v
    }
  })
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
      const v = parseFloat(String(r[8] || '0').replace(/[^0-9.]/g, '')) || 0
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
      const v = parseFloat(String(r[8] || '0').replace(/[^0-9.]/g, '')) || 0
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
    alvo.forEach(s => { mapa[s] = 0 })
    data.forEach(r => {
      const s = String(r[9] || '').toUpperCase().trim()
      if (mapa.hasOwnProperty(s)) mapa[s]++
    })
    return alvo.filter(s => mapa[s] > 0).map(s => ({ nome: s, qtd: mapa[s] }))
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
    cards: { total, pagos, fora, fup, pm, fugiu, outros, valorTotal, taxa },
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

export async function getAllDashData() {
  const [
    rawAiMai, rawAiAbr, rawMoMai, rawMoAbr,
    rawSemanasAi, rawSemanasMo,
    rawReuAi04, rawReuAi05, rawReuMo04, rawReuMo05
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

  return {
    AI: {
      MAI: { metricas: aiMai, reunioes: processReunioes(rawReuAi05) },
      ABR: { metricas: aiAbr, reunioes: processReunioes(rawReuAi04) },
      SEMANAS: semanasAi,
    },
    MO: {
      MAI: { metricas: moMai, reunioes: processReunioes(rawReuMo05) },
      ABR: { metricas: moAbr, reunioes: processReunioes(rawReuMo04) },
      SEMANAS: semanasMo,
    }
  }
}
