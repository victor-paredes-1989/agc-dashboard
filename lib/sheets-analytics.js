// Leitura/escrita da aba ACESSOS_DASHBOARD — analytics de acesso e tempo de uso do VP Dash.
//
// Deliberadamente ISOLADO de lib/sheets-write.js (que só trata USUARIOS_ACESSO, caminho
// crítico de autenticação/autorização). Este módulo tem seu próprio cliente JWT da Writer
// Service Account, copiado do mesmo padrão já usado em lib/sheets-write.js — a duplicação é
// intencional: qualquer bug aqui nunca pode afetar o fluxo de login/aprovação/bloqueio de
// usuários, e vice-versa. Leitura usa fetchRange()/findColumn() (lib/sheets.js), que já são
// genéricos e não precisaram de nenhuma alteração.
//
// Identidade (EMAIL/NOME/PERFIL) nunca vem do corpo da requisição — todas as funções de
// escrita aqui recebem esses valores já resolvidos pelo chamador a partir da sessão
// NextAuth/requireActiveUser (ver pages/api/analytics/session/*.js). Este módulo não faz
// nenhuma checagem de autenticação/autorização — isso é responsabilidade exclusiva de quem
// chama (lib/auth-guard.js), igual ao padrão já usado em lib/sheets-write.js.

import { createSign } from 'crypto'
import { randomUUID } from 'crypto'
import { fetchRange, findColumn } from './sheets'

const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID
const WRITER_EMAIL = process.env.GOOGLE_WRITER_SERVICE_ACCOUNT_EMAIL
const WRITER_PRIVATE_KEY_RAW = process.env.GOOGLE_WRITER_PRIVATE_KEY

const SHEET_NAME = 'ACESSOS_DASHBOARD'
// Cabeçalho esperado, nesta ordem, na linha 1 da aba (criar manualmente na planilha —
// este módulo nunca cria a aba/cabeçalho sozinho, só falha graciosamente se ausente):
//   SESSION_ID | EMAIL | NOME | PERFIL | INICIO | ULTIMA_ATIVIDADE | TEMPO_ATIVO_SEGUNDOS | STATUS_SESSAO
export const ACESSOS_DASHBOARD_RANGE = `${SHEET_NAME}!A1:H20000`
const APPEND_RANGE = `${SHEET_NAME}!A:H`

// Intervalo de heartbeat combinado com o cliente (hooks/useAnalyticsSession.js) — usado
// aqui só para documentar/limitar o incremento por heartbeat, nunca lido dinamicamente do
// cliente (o servidor nunca confia num "intervalo" enviado pelo front).
export const HEARTBEAT_INTERVAL_SECONDS = 60
// Teto de incremento por heartbeat/encerramento — se o gap entre ULTIMA_ATIVIDADE e agora
// for maior que isso (aba dormiu, laptop hibernou, heartbeat atrasou), só creditamos até
// este valor, nunca o gap inteiro. Cálculo "conservador" pedido no brief.
const MAX_HEARTBEAT_GAP_SECONDS = 90
// Sessão sem heartbeat há mais que isso é tratada como inativa/abandonada na LEITURA
// (admin), sem precisar reescrever a aba — nenhum job em segundo plano.
export const INACTIVITY_THRESHOLD_SECONDS = 5 * 60

function toBase64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function hasWriterConfig() {
  const pk = String(WRITER_PRIVATE_KEY_RAW || '').replace(/\\n/g, '\n')
  return !!(WRITER_EMAIL && pk && pk.includes('PRIVATE KEY'))
}

let _cachedToken = null
let _tokenExpiry = 0

async function getWriterAccessToken() {
  if (_cachedToken && Date.now() < _tokenExpiry - 60_000) return _cachedToken

  const privateKey = String(WRITER_PRIVATE_KEY_RAW || '').replace(/\\n/g, '\n')
  if (!WRITER_EMAIL || !privateKey || !privateKey.includes('PRIVATE KEY')) {
    throw new Error('Writer Service Account não configurada (GOOGLE_WRITER_SERVICE_ACCOUNT_EMAIL / GOOGLE_WRITER_PRIVATE_KEY).')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = toBase64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const payload = toBase64url(Buffer.from(JSON.stringify({
    iss: WRITER_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
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
    throw new Error(`Token OAuth (writer/analytics) falhou: ${json.error || ''} — ${json.error_description || JSON.stringify(json)}`)
  }
  _cachedToken = json.access_token
  _tokenExpiry = Date.now() + (json.expires_in || 3600) * 1000
  return _cachedToken
}

async function appendRow(values) {
  if (!SHEET_ID) throw new Error('SHEET_ID não configurado.')
  const token = await getWriterAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(APPEND_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets API append ${res.status} em ${SHEET_NAME}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

function columnLetter(index) {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function batchUpdateCells(rowNumber, cellsByColIndex) {
  if (!SHEET_ID) throw new Error('SHEET_ID não configurado.')
  const token = await getWriterAccessToken()
  const data = Object.entries(cellsByColIndex).map(([colIndex, value]) => ({
    range: `${SHEET_NAME}!${columnLetter(Number(colIndex))}${rowNumber}`,
    values: [[value]],
  }))
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets API batchUpdate ${res.status} em ${SHEET_NAME}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// Resolve os índices de coluna a partir do cabeçalho real da aba — nunca por posição fixa,
// mesmo princípio já usado em USUARIOS_ACESSO. Retorna null se a aba não existir/estiver
// vazia/tiver cabeçalho incompleto (fail-closed: não escreve/lê em schema desconhecido).
function resolveColumns(headers) {
  const idx = {
    sessionId: findColumn(headers, ['SESSION_ID']),
    email: findColumn(headers, ['EMAIL']),
    nome: findColumn(headers, ['NOME']),
    perfil: findColumn(headers, ['PERFIL']),
    inicio: findColumn(headers, ['INICIO', 'INÍCIO']),
    ultimaAtividade: findColumn(headers, ['ULTIMA_ATIVIDADE', 'ÚLTIMA_ATIVIDADE']),
    tempoAtivo: findColumn(headers, ['TEMPO_ATIVO_SEGUNDOS']),
    statusSessao: findColumn(headers, ['STATUS_SESSAO']),
  }
  const required = ['sessionId', 'email', 'inicio', 'ultimaAtividade', 'tempoAtivo', 'statusSessao']
  if (required.some(k => idx[k] === null)) return null
  return idx
}

async function readSheet() {
  let rows
  try {
    rows = await fetchRange(ACESSOS_DASHBOARD_RANGE)
  } catch (err) {
    return { ok: false, reason: 'sheet_error', error: err.message }
  }
  if (!rows || rows.length === 0) {
    // Aba provavelmente não existe ainda (fetchRange só lança em erro HTTP; uma aba vazia
    // de verdade também cai aqui, tratado da mesma forma — nada para ler/escrever).
    return { ok: false, reason: 'sheet_not_configured' }
  }
  const headers = rows[0] || []
  const idx = resolveColumns(headers)
  if (!idx) return { ok: false, reason: 'sheet_not_configured' }
  return { ok: true, headers, idx, rows: rows.slice(1) }
}

function parseTimestamp(v) {
  const t = Date.parse(v)
  return isNaN(t) ? null : t
}

function clampNonNegative(n) {
  return Number.isFinite(n) && n > 0 ? n : 0
}

// startSession — cria uma nova linha de sessão. email/nome/perfil SEMPRE vêm já resolvidos
// pelo chamador a partir de requireActiveUser()/getServerSession() (nunca do body da
// requisição) — ver pages/api/analytics/session/start.js.
export async function startSession({ email, nome, perfil }) {
  if (!email) return { started: false, reason: 'invalid_email' }
  if (!hasWriterConfig()) return { started: false, reason: 'writer_unavailable' }

  const sheet = await readSheet()
  if (!sheet.ok) return { started: false, reason: sheet.reason }

  const sessionId = randomUUID()
  const nowIso = new Date().toISOString()
  const row = new Array(sheet.headers.length).fill('')
  row[sheet.idx.sessionId] = sessionId
  row[sheet.idx.email] = email
  if (sheet.idx.nome !== null) row[sheet.idx.nome] = String(nome || '').trim()
  if (sheet.idx.perfil !== null) row[sheet.idx.perfil] = perfil || ''
  row[sheet.idx.inicio] = nowIso
  row[sheet.idx.ultimaAtividade] = nowIso
  row[sheet.idx.tempoAtivo] = 0
  row[sheet.idx.statusSessao] = 'ATIVA'

  try {
    await appendRow(row)
  } catch (err) {
    console.error('[sheets-analytics] Falha ao criar sessão:', err.message)
    return { started: false, reason: 'sheet_error' }
  }
  return { started: true, sessionId, inicio: nowIso, heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS }
}

// Localiza a linha de uma sessão, exigindo que EMAIL bata com o dono autenticado da
// requisição — este é o controle central que impede um usuário de atualizar/encerrar a
// sessão de outro, mesmo que descubra/adivinhe um SESSION_ID alheio (requisito de
// segurança explícito do brief).
async function findOwnedSessionRow(sessionId, ownerEmail) {
  const sheet = await readSheet()
  if (!sheet.ok) return { found: false, reason: sheet.reason }

  const targetId = String(sessionId || '').trim()
  const targetEmail = String(ownerEmail || '').trim().toLowerCase()
  if (!targetId || !targetEmail) return { found: false, reason: 'invalid_input' }

  for (let i = 0; i < sheet.rows.length; i++) {
    const r = sheet.rows[i]
    if (String(r[sheet.idx.sessionId] || '').trim() !== targetId) continue
    const rowEmail = String(r[sheet.idx.email] || '').trim().toLowerCase()
    if (rowEmail !== targetEmail) return { found: false, reason: 'session_owner_mismatch' }
    return {
      found: true,
      rowNumber: i + 2, // +1 pelo cabeçalho, +1 porque i é 0-based
      idx: sheet.idx,
      ultimaAtividade: String(r[sheet.idx.ultimaAtividade] || '').trim(),
      tempoAtivoAtual: Number(r[sheet.idx.tempoAtivo]) || 0,
      statusSessao: String(r[sheet.idx.statusSessao] || '').trim(),
    }
  }
  return { found: false, reason: 'session_not_found' }
}

// Incremento conservador: min(gap real desde ULTIMA_ATIVIDADE, MAX_HEARTBEAT_GAP_SECONDS).
// Gap não-parseável ou negativo (relógio de cliente bagunçado, primeira leitura) conta 0 —
// nunca soma um valor especulativo.
function computeDelta(ultimaAtividadeRaw) {
  const nowMs = Date.now()
  const lastMs = parseTimestamp(ultimaAtividadeRaw)
  if (lastMs === null) return 0
  const gapSeconds = (nowMs - lastMs) / 1000
  return clampNonNegative(Math.min(gapSeconds, MAX_HEARTBEAT_GAP_SECONDS))
}

// heartbeatSession — atualiza ULTIMA_ATIVIDADE e acumula TEMPO_ATIVO_SEGUNDOS na MESMA
// linha (nunca cria linha nova). Só continua contando se a sessão ainda estiver ATIVA —
// um heartbeat que chega depois de um /end (aba reaberta com sessionId antigo em memória,
// por exemplo) não deve reabrir/reanimar uma sessão já encerrada.
export async function heartbeatSession({ sessionId, email }) {
  if (!hasWriterConfig()) return { updated: false, reason: 'writer_unavailable' }
  const found = await findOwnedSessionRow(sessionId, email)
  if (!found.found) return { updated: false, reason: found.reason }
  if (found.statusSessao !== 'ATIVA') return { updated: false, reason: 'session_already_ended' }

  const delta = computeDelta(found.ultimaAtividade)
  const novoTempoAtivo = found.tempoAtivoAtual + delta
  const nowIso = new Date().toISOString()

  try {
    await batchUpdateCells(found.rowNumber, {
      [found.idx.ultimaAtividade]: nowIso,
      [found.idx.tempoAtivo]: novoTempoAtivo,
    })
  } catch (err) {
    console.error('[sheets-analytics] Falha no heartbeat:', err.message)
    return { updated: false, reason: 'sheet_error' }
  }
  return { updated: true, tempoAtivoSegundos: novoTempoAtivo }
}

// endSession — mesmo incremento final de tempo ativo do heartbeat, e marca STATUS_SESSAO
// = ENCERRADA. Chamado tanto pelo fluxo normal (usuário navega para fora do dashboard)
// quanto por sendBeacon em beforeunload/pagehide (melhor esforço, nunca garantido).
export async function endSession({ sessionId, email }) {
  if (!hasWriterConfig()) return { ended: false, reason: 'writer_unavailable' }
  const found = await findOwnedSessionRow(sessionId, email)
  if (!found.found) return { ended: false, reason: found.reason }
  if (found.statusSessao !== 'ATIVA') return { ended: true, reason: 'already_ended' } // idempotente

  const delta = computeDelta(found.ultimaAtividade)
  const novoTempoAtivo = found.tempoAtivoAtual + delta
  const nowIso = new Date().toISOString()

  try {
    await batchUpdateCells(found.rowNumber, {
      [found.idx.ultimaAtividade]: nowIso,
      [found.idx.tempoAtivo]: novoTempoAtivo,
      [found.idx.statusSessao]: 'ENCERRADA',
    })
  } catch (err) {
    console.error('[sheets-analytics] Falha ao encerrar sessão:', err.message)
    return { ended: false, reason: 'sheet_error' }
  }
  return { ended: true, tempoAtivoSegundos: novoTempoAtivo }
}

// listSessions — leitura completa para a área Admin > Analytics. Só usa a credencial
// Reader (fetchRange) — leitura nunca precisa da Writer. `efetivamenteAtiva` é derivado na
// leitura (sem reescrever a aba): STATUS_SESSAO=ATIVA mas sem heartbeat há mais que
// INACTIVITY_THRESHOLD_SECONDS é tratada como abandonada/inativa só para exibição.
export async function listSessions() {
  const sheet = await readSheet()
  if (!sheet.ok) return { result: sheet.reason === 'sheet_not_configured' ? 'NOT_CONFIGURED' : 'SHEET_ERROR' }

  const nowMs = Date.now()
  const sessions = sheet.rows
    .filter(r => String(r[sheet.idx.sessionId] || '').trim())
    .map(r => {
      const ultimaAtividade = String(r[sheet.idx.ultimaAtividade] || '').trim()
      const lastMs = parseTimestamp(ultimaAtividade)
      const statusSessao = String(r[sheet.idx.statusSessao] || '').trim() || 'ATIVA'
      const efetivamenteAtiva = statusSessao === 'ATIVA'
        && lastMs !== null
        && (nowMs - lastMs) / 1000 < INACTIVITY_THRESHOLD_SECONDS
      return {
        sessionId: String(r[sheet.idx.sessionId] || '').trim(),
        email: String(r[sheet.idx.email] || '').trim().toLowerCase(),
        nome: sheet.idx.nome !== null ? String(r[sheet.idx.nome] || '').trim() : '',
        perfil: sheet.idx.perfil !== null ? String(r[sheet.idx.perfil] || '').trim() : '',
        inicio: String(r[sheet.idx.inicio] || '').trim(),
        ultimaAtividade,
        tempoAtivoSegundos: Number(r[sheet.idx.tempoAtivo]) || 0,
        statusSessao,
        efetivamenteAtiva,
      }
    })
  return { result: 'OK', sessions }
}
