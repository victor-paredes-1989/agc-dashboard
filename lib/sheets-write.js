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
import {
  USUARIOS_ACESSO_RANGE,
  getUserFromSheet,
  listUsers,
  normalizeEmail,
  normalizeStatus,
  normalizePerfil,
  resolveUsuariosAcessoColumns,
} from './sheets-users'

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

// 0-based column index -> letra de coluna A1 ('A', 'Z', 'AA', ...). USUARIOS_ACESSO tem
// só 6 colunas hoje, mas a conversão é genérica por segurança/clareza.
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

// Atualiza células específicas (não a linha inteira) via values:batchUpdate — usado pelos
// helpers de aprovação/bloqueio/perfil abaixo, que só devem tocar STATUS/PERFIL/
// ULTIMA_ALTERACAO de uma linha já existente, nunca reescrever EMAIL/NOME/DATA_CADASTRO.
async function batchUpdateCells(cells) {
  if (!SHEET_ID) throw new Error('SHEET_ID não configurado (defina GOOGLE_SHEET_ID no Vercel).')
  const token = await getWriterAccessToken()
  const data = cells.map(c => ({
    range: `USUARIOS_ACESSO!${columnLetter(c.colIndex)}${c.rowNumber}`,
    values: [[c.value]],
  }))
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values:batchUpdate`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'RAW', data }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Sheets API batchUpdate ${res.status} em USUARIOS_ACESSO: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// Localiza a linha atual de um e-mail em USUARIOS_ACESSO, ao vivo (credencial Reader) —
// nunca por um número de linha guardado de uma leitura anterior. Chamado imediatamente
// antes de qualquer escrita administrativa, para que a operação sempre atue sobre o
// estado real mais recente, não sobre uma suposição.
//
//   found:false, reason:'not_found'      — schema ok, e-mail não está na planilha
//   found:false, reason:'sheet_error'    — falha técnica ao ler
//   found:false, reason:'invalid_schema' — cabeçalho crítico ausente
//   found:true                            — rowNumber (1-based, linha real na aba), idx
//                                           (colunas resolvidas) e record (status/perfil
//                                           normalizados) do estado atual
async function findUserRow(email) {
  const target = normalizeEmail(email)
  let rows
  try {
    rows = await fetchRange(USUARIOS_ACESSO_RANGE)
  } catch (err) {
    return { found: false, reason: 'sheet_error', error: err.message }
  }
  if (!rows || rows.length < 2) return { found: false, reason: 'not_found' }

  const headers = rows[0] || []
  const idx = resolveUsuariosAcessoColumns(headers)
  if (!idx) return { found: false, reason: 'invalid_schema' }

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (normalizeEmail(r[idx.email]) === target) {
      return {
        found: true,
        rowNumber: i + 1, // rows[0] é a linha 1 (cabeçalho) da aba real
        idx,
        record: {
          email: target,
          nome: String(r[idx.nome] ?? '').trim(),
          status: normalizeStatus(r[idx.status]),
          perfil: normalizePerfil(r[idx.perfil]),
        },
      }
    }
  }
  return { found: false, reason: 'not_found' }
}

// true se, excluindo excludeEmail, não sobrar nenhum outro PERFIL=ADMIN com STATUS=ATIVO.
// Fail-closed: se a leitura falhar tecnicamente, trata como "removeria o último ADMIN"
// (bloqueia a operação) em vez de assumir que é seguro prosseguir.
async function wouldRemoveLastActiveAdmin(excludeEmail) {
  const { result, users } = await listUsers()
  if (result !== 'OK') return true
  const target = normalizeEmail(excludeEmail)
  const otherActiveAdmins = users.filter(
    u => u.perfil === 'ADMIN' && u.status === 'ATIVO' && u.email !== target
  )
  return otherActiveAdmins.length === 0
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers administrativos — PR A da área Admin > Usuários (só os helpers; endpoints
// /api/admin/users/* e a UI ficam para PRs seguintes, nada disso é chamável publicamente
// ainda). Mesma filosofia de segurança da Fase 2: nenhum destes helpers confia no
// chamador para as invariantes — cada um revalida por conta própria antes de escrever.
// ─────────────────────────────────────────────────────────────────────────────

const VALID_STATUS_ACTIONS = ['approve', 'deny', 'block', 'reactivate']
const VALID_PERFIS = ['ADMIN', 'SENIOR', 'USUARIO']
const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Matriz de transição aprovada — a ÚNICA fonte de verdade de quais mudanças de STATUS
// existem. Não há caminho para setar um STATUS arbitrário: só estas cinco combinações
// (ação, status atual) resultam em escrita; qualquer outra combinação é inválida.
function resolveStatusTransition(action, currentStatus) {
  if (action === 'approve' && currentStatus === 'PENDENTE') return 'ATIVO'
  if (action === 'deny' && currentStatus === 'PENDENTE') return 'NEGADO'
  if (action === 'block' && currentStatus === 'ATIVO') return 'BLOQUEADO'
  if (action === 'reactivate' && currentStatus === 'BLOQUEADO') return 'ATIVO'
  // NEGADO reativado volta para PENDENTE (não direto a ATIVO): NEGADO foi uma rejeição
  // explícita, então reabrir para nova avaliação é mais seguro que restaurar acesso direto.
  if (action === 'reactivate' && currentStatus === 'NEGADO') return 'PENDENTE'
  return null
}

// updateUserStatus({ email, action, actorEmail })
//
// action ∈ {'approve','deny','block','reactivate'} — nunca um STATUS literal. O valor de
// destino é sempre decidido aqui (resolveStatusTransition), nunca recebido do chamador.
//
// actorEmail é OBRIGATÓRIO: sem ele não é possível aplicar a guarda de auto-alvo, então a
// operação falha fechada (reason 'missing_actor') em vez de prosseguir sem essa checagem.
//
// Guardas, nesta ordem:
//   1. e-mail alvo == actorEmail          -> sempre proibido (nenhuma ação de status sobre
//                                             si mesmo; ambíguo para approve/reactivate,
//                                             então bloqueado por padrão também nesses casos)
//   2. Writer não configurada             -> writer_unavailable
//   3. usuário não encontrado / schema    -> not_found / invalid_schema / sheet_error
//   4. transição inválida para o STATUS atual -> invalid_transition
//   5. ação block sobre um ADMIN que é o único ADMIN ATIVO restante -> last_admin_protected
//
// Após escrever, relê a linha e devolve o estado real (mitigação de corrida — ver
// findUserRow/README do PR: sem lock distribuído, a resposta sempre reflete o que
// efetivamente ficou gravado, não o que a chamada assumiu que aconteceria).
export async function updateUserStatus({ email, action, actorEmail }) {
  const target = normalizeEmail(email)
  const actor = normalizeEmail(actorEmail)

  if (!target) return { updated: false, reason: 'invalid_email' }
  if (!VALID_STATUS_ACTIONS.includes(action)) return { updated: false, reason: 'invalid_action' }
  if (!actor) return { updated: false, reason: 'missing_actor' }
  if (target === actor) return { updated: false, reason: 'self_action_forbidden' }

  if (!hasWriterConfig()) {
    console.error('[sheets-write] Writer Service Account não configurada — não é possível alterar STATUS.')
    return { updated: false, reason: 'writer_unavailable' }
  }

  const found = await findUserRow(target)
  if (!found.found) {
    return { updated: false, reason: found.reason }
  }

  const currentStatus = found.record.status
  const nextStatus = resolveStatusTransition(action, currentStatus)
  if (!nextStatus) {
    return { updated: false, reason: 'invalid_transition', currentStatus }
  }

  if (action === 'block' && found.record.perfil === 'ADMIN') {
    const wouldOrphan = await wouldRemoveLastActiveAdmin(target)
    if (wouldOrphan) return { updated: false, reason: 'last_admin_protected' }
  }

  const idx = found.idx
  const cells = [{ rowNumber: found.rowNumber, colIndex: idx.status, value: nextStatus }]
  if (idx.ultimaAlteracao !== null) {
    cells.push({ rowNumber: found.rowNumber, colIndex: idx.ultimaAlteracao, value: todayIsoDate() })
  }

  try {
    await batchUpdateCells(cells)
  } catch (err) {
    console.error('[sheets-write] Falha ao atualizar STATUS:', err.message)
    return { updated: false, reason: 'sheet_error' }
  }

  const after = await findUserRow(target)
  return {
    updated: true,
    email: target,
    status: after.found ? after.record.status : nextStatus,
    perfil: after.found ? after.record.perfil : found.record.perfil,
  }
}

// updateUserPerfil({ email, perfil, actorEmail })
//
// perfil ∈ {'ADMIN','SENIOR','USUARIO'} — qualquer outro valor é rejeitado antes de tocar
// a planilha. actorEmail é OBRIGATÓRIO pelo mesmo motivo de updateUserStatus.
//
// Guardas, nesta ordem:
//   1. e-mail alvo == actorEmail                     -> self_action_forbidden (ninguém
//                                                        altera o próprio PERFIL, nem ADMIN)
//   2. Writer não configurada                        -> writer_unavailable
//   3. usuário não encontrado / schema                -> not_found / invalid_schema / sheet_error
//   4. já está no perfil pedido                       -> updated:true, noop:true (idempotente)
//   5. rebaixar ADMIN ATIVO que é o único restante    -> last_admin_protected (qualquer
//                                                        perfil de destino que não seja
//                                                        ADMIN conta como rebaixamento —
//                                                        SENIOR não administra usuários,
//                                                        então perder o último ADMIN para
//                                                        SENIOR é tão inseguro quanto para
//                                                        USUARIO)
export async function updateUserPerfil({ email, perfil, actorEmail }) {
  const target = normalizeEmail(email)
  const actor = normalizeEmail(actorEmail)
  const nextPerfil = String(perfil || '').trim().toUpperCase()

  if (!target) return { updated: false, reason: 'invalid_email' }
  if (!VALID_PERFIS.includes(nextPerfil)) return { updated: false, reason: 'invalid_perfil' }
  if (!actor) return { updated: false, reason: 'missing_actor' }
  if (target === actor) return { updated: false, reason: 'self_action_forbidden' }

  if (!hasWriterConfig()) {
    console.error('[sheets-write] Writer Service Account não configurada — não é possível alterar PERFIL.')
    return { updated: false, reason: 'writer_unavailable' }
  }

  const found = await findUserRow(target)
  if (!found.found) {
    return { updated: false, reason: found.reason }
  }

  if (found.record.perfil === nextPerfil) {
    return { updated: true, email: target, status: found.record.status, perfil: nextPerfil, noop: true }
  }

  if (found.record.perfil === 'ADMIN' && nextPerfil !== 'ADMIN' && found.record.status === 'ATIVO') {
    const wouldOrphan = await wouldRemoveLastActiveAdmin(target)
    if (wouldOrphan) return { updated: false, reason: 'last_admin_protected' }
  }

  const idx = found.idx
  const cells = [{ rowNumber: found.rowNumber, colIndex: idx.perfil, value: nextPerfil }]
  if (idx.ultimaAlteracao !== null) {
    cells.push({ rowNumber: found.rowNumber, colIndex: idx.ultimaAlteracao, value: todayIsoDate() })
  }

  try {
    await batchUpdateCells(cells)
  } catch (err) {
    console.error('[sheets-write] Falha ao atualizar PERFIL:', err.message)
    return { updated: false, reason: 'sheet_error' }
  }

  const after = await findUserRow(target)
  return {
    updated: true,
    email: target,
    status: after.found ? after.record.status : found.record.status,
    perfil: after.found ? after.record.perfil : nextPerfil,
  }
}

// updateUserName({ email, name, actorEmail })
//
// Altera APENAS o campo NOME de um usuário existente — nunca toca EMAIL, STATUS, PERFIL,
// DATA_CADASTRO. actorEmail é OBRIGATÓRIO (mesma regra dos demais helpers administrativos).
//
// Validações antes de qualquer I/O:
//   - name deve ser string não vazia após trim (não aceita objeto/array)
//   - name com no máximo MAX_NOME_LEN caracteres (proteção básica de schema)
//   - actorEmail obrigatório — actorEmail == target é permitido aqui (o admin pode
//     corrigir o próprio nome — não há ambiguidade de segurança nesse caso)
//
// Localiza a linha ao vivo (nunca índice cacheado), encontra a coluna NOME por cabeçalho
// (nunca por posição fixa), e atualiza NOME + ULTIMA_ALTERACAO via batchUpdate.
// Após escrever, relê o usuário e retorna o estado atual.
const MAX_NOME_LEN = 100

export async function updateUserName({ email, name, actorEmail }) {
  const target = normalizeEmail(email)
  const actor = normalizeEmail(actorEmail)

  if (!target) return { updated: false, reason: 'invalid_email' }
  if (!actor) return { updated: false, reason: 'missing_actor' }

  const rawName = typeof name === 'string' ? name : null
  if (rawName === null) return { updated: false, reason: 'invalid_name' }
  const trimmedName = rawName.trim()
  if (!trimmedName) return { updated: false, reason: 'invalid_name' }
  if (trimmedName.length > MAX_NOME_LEN) return { updated: false, reason: 'invalid_name' }

  if (!hasWriterConfig()) {
    console.error('[sheets-write] Writer Service Account não configurada — não é possível alterar NOME.')
    return { updated: false, reason: 'writer_unavailable' }
  }

  const found = await findUserRow(target)
  if (!found.found) {
    return { updated: false, reason: found.reason }
  }

  const idx = found.idx
  if (idx.nome === null) {
    console.error('[sheets-write] Coluna NOME ausente em USUARIOS_ACESSO — abortando updateUserName.')
    return { updated: false, reason: 'invalid_schema' }
  }

  const cells = [{ rowNumber: found.rowNumber, colIndex: idx.nome, value: trimmedName }]
  if (idx.ultimaAlteracao !== null) {
    cells.push({ rowNumber: found.rowNumber, colIndex: idx.ultimaAlteracao, value: todayIsoDate() })
  }

  try {
    await batchUpdateCells(cells)
  } catch (err) {
    console.error('[sheets-write] Falha ao atualizar NOME:', err.message)
    return { updated: false, reason: 'sheet_error' }
  }

  const after = await findUserRow(target)
  return {
    updated: true,
    email: target,
    nome: after.found ? after.record.nome : trimmedName,
    status: after.found ? after.record.status : found.record.status,
    perfil: after.found ? after.record.perfil : found.record.perfil,
  }
}

// createUserManually({ email, name })
//
// Cadastro manual feito por um ADMIN (via futura UI) já representa uma autorização
// explícita — decisão aprovada: entra direto como ATIVO/USUARIO, sem passar pela fila de
// PENDENTE. Nunca cria ADMIN diretamente: promover é uma ação separada
// (updateUserPerfil), sempre depois do usuário já existir.
//
// Mesmo padrão de read-before-write/fail-closed de insertPendingUser: revalida
// duplicidade e schema aqui, nunca confia no chamador.
export async function createUserManually({ email, name }) {
  const target = normalizeEmail(email)
  if (!target || !BASIC_EMAIL_RE.test(target)) {
    return { inserted: false, reason: 'invalid_email' }
  }

  if (!hasWriterConfig()) {
    console.error('[sheets-write] Writer Service Account não configurada — não é possível cadastrar usuário.')
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
  const idx = resolveUsuariosAcessoColumns(headers)
  if (!idx) {
    console.error('[sheets-write] Schema inválido em USUARIOS_ACESSO — abortando createUserManually.')
    return { inserted: false, reason: 'invalid_schema' }
  }

  const row = new Array(headers.length).fill('')
  row[idx.email] = target
  row[idx.status] = 'ATIVO'
  row[idx.perfil] = 'USUARIO'
  if (idx.nome !== null) row[idx.nome] = String(name || '').trim()
  if (idx.dataCadastro !== null) row[idx.dataCadastro] = todayIsoDate()
  if (idx.ultimaAlteracao !== null) row[idx.ultimaAlteracao] = todayIsoDate()

  try {
    await appendRow(row)
  } catch (err) {
    console.error('[sheets-write] Falha ao cadastrar usuário manualmente:', err.message)
    return { inserted: false, reason: 'sheet_error' }
  }

  return { inserted: true, email: target, status: 'ATIVO', perfil: 'USUARIO' }
}
