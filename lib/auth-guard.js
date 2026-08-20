// Guards centralizados de autorização para rotas de API — Fase 1.
//
// Objetivo: nenhuma rota deve reimplementar a checagem de STATUS/PERFIL. O JWT/sessão
// (ver callbacks em pages/api/auth/[...nextauth].js) pode estar desatualizado — quem
// decide se uma request pode receber dado é sempre uma consulta ao vivo a USUARIOS_ACESSO
// feita aqui, nunca o valor cacheado dentro do token.

import { getServerSession } from 'next-auth/next'
import { authOptions } from '../pages/api/auth/[...nextauth]'
import { resolveAccess, normalizeEmail } from './sheets-users'

// Valida a sessão E o status atual (ao vivo) do usuário. Em caso de falha, já escreve a
// resposta HTTP apropriada em `res` e retorna null — o chamador só precisa fazer:
//   const user = await requireActiveUser(req, res)
//   if (!user) return
export async function requireActiveUser(req, res) {
  const session = await getServerSession(req, res, authOptions)
  const email = normalizeEmail(session?.user?.email)
  if (!email) {
    res.status(401).json({ error: 'not_authenticated' })
    return null
  }

  const decision = await resolveAccess(email)
  if (!decision.allowed) {
    // Falha técnica da planilha (sem SUPER_ADMIN) vira 503 — não é "acesso negado" no
    // sentido de permissão, é indisponibilidade. Todo o resto (BLOQUEADO/PENDENTE/NEGADO/
    // não cadastrado) é 403.
    const status = decision.reason === 'sheet_error_denied' ? 503 : 403
    res.status(status).json({
      error: 'access_denied',
      reason: decision.reason,
      status: decision.status || null,
    })
    return null
  }

  return { email, perfil: decision.perfil, status: decision.status, breakGlass: decision.breakGlass }
}

// requireAdmin reaproveita requireActiveUser em vez de reimplementar a checagem de STATUS,
// para que as duas regras nunca divirjam ao longo do tempo.
export async function requireAdmin(req, res) {
  const user = await requireActiveUser(req, res)
  if (!user) return null // resposta já enviada por requireActiveUser

  if (user.perfil !== 'ADMIN') {
    res.status(403).json({ error: 'admin_required' })
    return null
  }
  return user
}
