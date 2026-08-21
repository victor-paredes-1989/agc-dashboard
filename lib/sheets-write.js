// Módulo de ESCRITA em USUARIOS_ACESSO — Fase 2 da gestão dinâmica de acessos.
//
// Usa EXCLUSIVAMENTE a Service Account WRITER (GOOGLE_WRITER_SERVICE_ACCOUNT_EMAIL /
// GOOGLE_WRITER_PRIVATE_KEY, escopo completo 'spreadsheets') para a única operação que
// escreve de fato (appendRow). A leitura de apoio (checagem de duplicidade, descoberta do
// cabeçalho) continua usando fetchRange/getUserFromSheet — ou seja, a credencial Reader —
// para manter o uso da Writer restrito ao mínimo necessário. Nenhuma função de leitura do
// dashboard (lib/sheets.js) importa este módulo, e este módulo nunca é chamado a partir de
// uma rota pública sem passar antes pelo NextAuth (só é invocado dentro do callback signIn).

import { createSign } from 'crypto'
import { fetchRange, findColumn } from './sheets'
import { USUARIOS_ACESSO_RANGE, getUserFromSheet, normalizeEmail } from './sheets-users'

const SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.SHEET_ID
const WRITER_EMAIL = process.env.GOOGLE_WRITER_SERVICE_ACCOUNT_EMAIL
const WRITER_PRIVATE_KEY_RAW = process.env.GOOGLE_WRITER_PRIVATE_KEY

// Mesmo limite de colunas (A:F) usado pela leitura em USUARIOS_ACESSO_RANGE — o append
// nunca deve escrever fora do intervalo que o resto do sistema considera parte do schema.
const USUARIOS_ACESSO_APPEND_RANGE = 'USUARIOS_ACESSO!A:F'

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
    throw new Error(
      'Writer Service Account não configurada ' +
      '(defina GOOGLE_WRITER_SERVICE_ACCOUNT_EMAIL e GOOGLE_WRITER_PRIVATE_KEY no Vercel).'
    )
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
    throw new Error(`Token OAuth (writer) falhou: ${json.error || ''} — ${json.error_description || JSON.stringify(json)}`)
  }

  _cachedToken = json.access_token
  _tokenExpiry = Date.now() + (json.expires_in || 3600) * 1000
  return _cachedToken
}

async function appendRow(values) {
  if (!SHEET_ID) throw new Error('SHEET_ID não configurado (defina GOOGLE_SHEET_ID no Vercel).')
  const token = await getWriterAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(USUARIOS_ACESSO_APPEND_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets API append ${res.status} em USUARIOS_ACESSO: ${body.slice(0, 300)}`)
  }
  return res.json()
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

// insertPendingUser({ email, name })
//
// Só deve ser chamada quando resolveAccess() já determinou reason === 'user_not_found'
// (schema válido, e-mail não cadastrado) — mas revalida ambas as condições aqui de novo,
// nunca confiando no chamador para invariantes de segurança:
//
//   - se o e-mail já existir em QUALQUER STATUS -> não insere, retorna o registro existente;
//   - se o schema estiver inválido (EMAIL/STATUS/PERFIL sem cabeçalho) -> não insere;
//   - se a Writer não estiver configurada ou o append falhar -> não insere;
//   - em qualquer caminho de falha, quem chamou (signIn) trata como "não conseguiu
//     registrar" e nega o acesso — nunca como sucesso.
//
// STATUS e PERFIL da linha criada são SEMPRE 'PENDENTE'/'USUARIO', fixos neste código.
// Nenhum parâmetro de entrada pode alterar esses dois valores — email/name vêm do perfil
// OAuth do Google já autenticado (nunca de input livre do cliente).
//
// Mitigação de duplicidade (Google Sheets não tem transações/lock distribuído): email
// normalizado (trim+lowercase), e a checagem abaixo é feita o mais perto possível do
// append, sem nenhum I/O adicional entre a leitura e a escrita. Ainda existe uma janela de
// corrida teórica se dois primeiros logins do mesmo e-mail chegarem em paralelo dentro de
// poucos milissegundos — ambos podem passar na checagem e gerar duas linhas PENDENTE para
// o mesmo e-mail. Risco aceito nesta fase (documentado no PR): não justifica Redis/lock
// distribuído, e o pior caso é uma linha duplicada removível manualmente, nunca acesso
// indevido.
export async function insertPendingUser({ email, name }) {
  const target = normalizeEmail(email)
  if (!target) return { inserted: false, reason: 'invalid_email' }

  if (!hasWriterConfig()) {
    console.error('[sheets-write] Writer Service Account não configurada — não é possível registrar PENDENTE.')
    return { inserted: false, reason: 'writer_unavailable' }
  }

  const existing = await getUserFromSheet(target)
  if (existing.result === 'SHEET_ERROR') {
    return { inserted: false, reason: 'sheet_error' }
  }
  if (existing.result === 'USER_FOUND') {
    return { inserted: false, reason: 'already_exists', record: existing }
  }

  let headerRows
  try {
    headerRows = await fetchRange(USUARIOS_ACESSO_RANGE)
  } catch (err) {
    console.error('[sheets-write] Falha ao ler cabeçalho de USUARIOS_ACESSO:', err.message)
    return { inserted: false, reason: 'sheet_error' }
  }
  const headers = (headerRows && headerRows[0]) || []
  const idxEmail = findColumn(headers, ['EMAIL'])
  const idxStatus = findColumn(headers, ['STATUS'])
  const idxPerfil = findColumn(headers, ['PERFIL'])
  if (idxEmail === null || idxStatus === null || idxPerfil === null) {
    console.error('[sheets-write] Schema inválido em USUARIOS_ACESSO — abortando insertPendingUser.')
    return { inserted: false, reason: 'invalid_schema' }
  }
  const idxNome = findColumn(headers, ['NOME'])
  const idxDataCadastro = findColumn(headers, ['DATA_CADASTRO', 'DATA CADASTRO'])
  const idxUltimaAlteracao = findColumn(headers, ['ULTIMA_ALTERACAO', 'ÚLTIMA_ALTERAÇÃO', 'ULTIMA ALTERACAO'])

  const row = new Array(headers.length).fill('')
  row[idxEmail] = target
  row[idxStatus] = 'PENDENTE'
  row[idxPerfil] = 'USUARIO'
  if (idxNome !== null) row[idxNome] = String(name || '').trim()
  if (idxDataCadastro !== null) row[idxDataCadastro] = todayIsoDate()
  if (idxUltimaAlteracao !== null) row[idxUltimaAlteracao] = todayIsoDate()

  try {
    await appendRow(row)
  } catch (err) {
    console.error('[sheets-write] Falha ao inserir linha PENDENTE:', err.message)
    return { inserted: false, reason: 'sheet_error' }
  }

  return { inserted: true, email: target, status: 'PENDENTE', perfil: 'USUARIO' }
}
