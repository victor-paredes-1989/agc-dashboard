import { getServerSession } from 'next-auth/next'
import { authOptions } from '../../auth/[...nextauth]'
import { requireActiveUser } from '../../../../lib/auth-guard'
import { startSession } from '../../../../lib/sheets-analytics'
import { isSameOriginPost, rejectCrossOrigin } from '../../../../lib/admin-api'

// Cria uma sessão de analytics para o usuário AUTENTICADO atual. Não recebe email/nome/
// perfil do corpo da requisição — email/perfil vêm de requireActiveUser() (consulta ao
// vivo a USUARIOS_ACESSO), nome vem de getServerSession() (perfil OAuth do Google já
// decodificado no JWT da sessão). SESSION_ID é gerado no servidor (crypto.randomUUID()),
// nunca aceito do cliente — impossível a um usuário "escolher" o id de outra sessão.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const user = await requireActiveUser(req, res)
  if (!user) return // resposta já escrita (401/403/503)

  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOriginPost(req)) { rejectCrossOrigin(res); return }

  const session = await getServerSession(req, res, authOptions)
  const nome = String(session?.user?.name || '').trim()

  const result = await startSession({ email: user.email, nome, perfil: user.perfil })
  if (!result.started) {
    // Falha aqui (aba ausente, writer indisponível, erro técnico) nunca deve derrubar o
    // dashboard — devolve um erro claro e o cliente simplesmente não ativa o heartbeat.
    res.status(503).json({ ok: false, error: result.reason })
    return
  }
  res.status(201).json({
    ok: true,
    sessionId: result.sessionId,
    inicio: result.inicio,
    heartbeatIntervalSeconds: result.heartbeatIntervalSeconds,
  })
}
