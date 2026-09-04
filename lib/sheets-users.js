// Leitura de autorização (aba USUARIOS_ACESSO) — Fase 1 da gestão dinâmica de acessos.
//
// Deliberadamente separado de getAllDashData()/CACHE_TTL (lib/sheets.js): autorização
// nunca pode ficar presa atrás do cache de ~25min usado para os dados do dashboard.
// getUserFromSheet() faz uma leitura ao vivo (sem cache) a cada chamada nesta fase.
//
// fetchRange() (lib/sheets.js) não aplica cache algum e lança exceção em caso de falha —
// é isso que permite distinguir "usuário não cadastrado" (SHEET_ERROR nunca ocorreu) de
// "a planilha/aba falhou tecnicamente" (SHEET_ERROR), essencial para o fallback SUPER_ADMIN.

import { fetchRange, normalizeHeader, findColumn } from './sheets'

// Exportado para que lib/sheets-write.js (Fase 2) leia o cabeçalho a partir do mesmo
// limite de colunas usado aqui — evita duas definições divergentes do "shape" da aba.
export const USUARIOS_ACESSO_RANGE = 'USUARIOS_ACESSO!A1:F2000'

const STATUS_VALUES = ['ATIVO', 'PENDENTE', 'BLOQUEADO', 'NEGADO']
const PERFIL_VALUES = ['ADMIN', 'SENIOR', 'USUARIO']

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

// Exportadas para reuso em lib/sheets-write.js (helpers administrativos — PR A da área
// Admin > Usuários) — evita uma terceira reimplementação da mesma normalização.
export function normalizeStatus(raw) {
  const s = String(raw || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  return STATUS_VALUES.includes(s) ? s : null
}

export function normalizePerfil(raw) {
  const s = String(raw || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  // Fail-safe: um valor de PERFIL desconhecido/mal formatado nunca vira ADMIN por acidente.
  return PERFIL_VALUES.includes(s) ? s : 'USUARIO'
}

// Resolve os índices de coluna de USUARIOS_ACESSO a partir do cabeçalho, sempre por nome
// (nunca posição fixa). Retorna null se algum dos três críticos (EMAIL/STATUS/PERFIL)
// estiver ausente — chamador deve tratar como schema inválido (fail-closed). Extraído como
// helper próprio para ser reaproveitado por listUsers() aqui e pelos helpers de escrita
// administrativa em lib/sheets-write.js, sem duplicar a lógica pela terceira vez.
//
// getUserFromSheet() abaixo mantém sua própria resolução inline, intencionalmente
// intocada nesta mudança — é código já validado no caminho de autenticação (Fase 1/2) e
// não há necessidade de reescrevê-lo para este PR.
export function resolveUsuariosAcessoColumns(headers) {
  const idxEmail = findColumn(headers, ['EMAIL'])
  const idxStatus = findColumn(headers, ['STATUS'])
  const idxPerfil = findColumn(headers, ['PERFIL'])
  if (idxEmail === null || idxStatus === null || idxPerfil === null) return null
  return {
    email: idxEmail,
    status: idxStatus,
    perfil: idxPerfil,
    nome: findColumn(headers, ['NOME']),
    dataCadastro: findColumn(headers, ['DATA_CADASTRO', 'DATA CADASTRO']),
    ultimaAlteracao: findColumn(headers, ['ULTIMA_ALTERACAO', 'ÚLTIMA_ALTERAÇÃO', 'ULTIMA ALTERACAO']),
  }
}

// Retorna sempre um destes três resultados — nunca um genérico "não encontrado" em caso
// de falha técnica, e nunca um "ok" silencioso quando a aba está indisponível:
//   USER_FOUND     — linha encontrada, status/perfil normalizados
//   USER_NOT_FOUND — planilha respondeu normalmente, e-mail não está cadastrado
//   SHEET_ERROR    — falha ao consultar a planilha, OU schema inválido (ver abaixo)
//
// EMAIL/STATUS/PERFIL são a base da decisão de autorização e por isso são localizados
// exclusivamente pelo nome do cabeçalho — nunca por posição. Se algum estiver ausente
// (coluna renomeada/apagada/aba corrompida), isso é tratado como SHEET_ERROR: a fonte de
// autorização está tecnicamente inválida, não que "o usuário não existe". Campos não
// críticos (NOME/DATA_CADASTRO/ULTIMA_ALTERACAO) seguem opcionais e viram string vazia
// quando ausentes, sem afetar a decisão de acesso.
export async function getUserFromSheet(email) {
  const target = normalizeEmail(email)
  if (!target) return { result: 'USER_NOT_FOUND', email: target }

  let rows
  try {
    rows = await fetchRange(USUARIOS_ACESSO_RANGE)
  } catch (err) {
    console.error('[sheets-users] SHEET_ERROR ao consultar USUARIOS_ACESSO:', err.message)
    return { result: 'SHEET_ERROR', email: target, error: err.message }
  }

  if (!rows || rows.length < 2) {
    // Aba existe e respondeu, mas está vazia (só cabeçalho ou nada) — ninguém cadastrado ainda.
    return { result: 'USER_NOT_FOUND', email: target }
  }

  const headers = rows[0] || []
  const idxEmail = findColumn(headers, ['EMAIL'])
  const idxStatus = findColumn(headers, ['STATUS'])
  const idxPerfil = findColumn(headers, ['PERFIL'])
  if (idxEmail === null || idxStatus === null || idxPerfil === null) {
    console.error('[sheets-users] SHEET_ERROR: schema inválido em USUARIOS_ACESSO — cabeçalho(s) obrigatório(s) ausente(s) entre EMAIL/STATUS/PERFIL')
    return { result: 'SHEET_ERROR', email: target, error: 'invalid_schema' }
  }

  const idx = {
    email: idxEmail,
    status: idxStatus,
    perfil: idxPerfil,
    nome: findColumn(headers, ['NOME']),
    dataCadastro: findColumn(headers, ['DATA_CADASTRO', 'DATA CADASTRO']),
    ultimaAlteracao: findColumn(headers, ['ULTIMA_ALTERACAO', 'ÚLTIMA_ALTERAÇÃO', 'ULTIMA ALTERACAO']),
  }

  const match = rows.slice(1).find(r => normalizeEmail(r[idx.email]) === target)
  if (!match) return { result: 'USER_NOT_FOUND', email: target }

  return {
    result: 'USER_FOUND',
    email: target,
    nome: String(match[idx.nome] || '').trim(),
    // Status bruto fora de STATUS_VALUES é tratado como null (fail-closed em resolveAccess),
    // mas preservado em statusRaw para diagnóstico/logs.
    status: normalizeStatus(match[idx.status]),
    statusRaw: String(match[idx.status] || '').trim(),
    perfil: normalizePerfil(match[idx.perfil]),
    dataCadastro: String(match[idx.dataCadastro] || '').trim(),
    ultimaAlteracao: String(match[idx.ultimaAlteracao] || '').trim(),
  }
}

export function getSuperAdminEmails() {
  return (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(normalizeEmail)
    .filter(Boolean)
}

export function isSuperAdmin(email) {
  return getSuperAdminEmails().includes(normalizeEmail(email))
}

// Ponto único de decisão de autorização, usado tanto pelo callback signIn/jwt do NextAuth
// quanto pelos guards de API (lib/auth-guard.js) — evita duas implementações divergentes
// da mesma regra (BLOQUEADO/PENDENTE/NEGADO nega; SUPER_ADMIN só cobre falha técnica).
export async function resolveAccess(email) {
  const target = normalizeEmail(email)
  const record = await getUserFromSheet(target)

  if (record.result === 'SHEET_ERROR') {
    if (isSuperAdmin(target)) {
      return { allowed: true, perfil: 'ADMIN', status: 'ATIVO', breakGlass: true, reason: 'sheet_error_super_admin' }
    }
    // Fail-closed: falha técnica nunca libera usuário comum.
    return { allowed: false, perfil: null, status: null, breakGlass: false, reason: 'sheet_error_denied' }
  }

  if (record.result === 'USER_NOT_FOUND') {
    // Fail-closed também para SUPER_ADMIN aqui: break-glass é exclusivamente para falha
    // técnica da planilha, nunca para "e-mail ainda não cadastrado" — mesmo que esteja em
    // SUPER_ADMIN_EMAILS, um cadastro ausente não é uma falha de leitura da planilha.
    return { allowed: false, perfil: null, status: null, breakGlass: false, reason: 'user_not_found' }
  }

  // USER_FOUND — a linha explícita da planilha sempre vence, inclusive sobre SUPER_ADMIN_EMAILS.
  if (record.status === 'ATIVO') {
    return { allowed: true, perfil: record.perfil, status: record.status, breakGlass: false, reason: 'ok' }
  }
  return {
    allowed: false,
    perfil: record.perfil,
    status: record.status, // pode ser null se o valor da planilha não bater com STATUS_VALUES
    breakGlass: false,
    reason: 'status_not_ativo',
  }
}

// listUsers() — leitura completa e ao vivo de USUARIOS_ACESSO para a área Admin > Usuários
// (PR A: só o helper; endpoint e UI ficam para PRs seguintes). Usa exclusivamente a
// credencial Reader (fetchRange), igual a toda leitura de autorização já existente — não
// há necessidade de Writer para listar. Sem cache: mesma regra já estabelecida na Fase 1
// para esta aba (autorização nunca fica presa atrás do cache de dashboard).
//
// Retorna sempre { result, users } — nunca lança. `result` distingue OK/SHEET_ERROR pelo
// mesmo motivo de getUserFromSheet: uma falha técnica não pode ser confundida com "lista
// vazia" por quem for decidir, por exemplo, se uma ação deixaria o sistema sem ADMIN.
export async function listUsers() {
  let rows
  try {
    rows = await fetchRange(USUARIOS_ACESSO_RANGE)
  } catch (err) {
    console.error('[sheets-users] SHEET_ERROR ao listar USUARIOS_ACESSO:', err.message)
    return { result: 'SHEET_ERROR', users: [], error: err.message }
  }

  if (!rows || rows.length < 2) {
    return { result: 'OK', users: [] }
  }

  const headers = rows[0] || []
  const idx = resolveUsuariosAcessoColumns(headers)
  if (!idx) {
    console.error('[sheets-users] SHEET_ERROR: schema inválido em USUARIOS_ACESSO — cabeçalho(s) obrigatório(s) ausente(s) entre EMAIL/STATUS/PERFIL')
    return { result: 'SHEET_ERROR', users: [], error: 'invalid_schema' }
  }

  const users = rows.slice(1)
    .filter(r => r && String(r[idx.email] || '').trim() !== '')
    .map(r => ({
      email: normalizeEmail(r[idx.email]),
      nome: String(r[idx.nome] ?? '').trim(),
      status: normalizeStatus(r[idx.status]),
      statusRaw: String(r[idx.status] ?? '').trim(),
      perfil: normalizePerfil(r[idx.perfil]),
      dataCadastro: String(r[idx.dataCadastro] ?? '').trim(),
      ultimaAlteracao: String(r[idx.ultimaAlteracao] ?? '').trim(),
    }))

  return { result: 'OK', users }
}
