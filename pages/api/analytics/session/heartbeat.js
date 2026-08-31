import { requireActiveUser } from '../../../../lib/auth-guard'
import { heartbeatSession } from '../../../../lib/sheets-analytics'
import { isSameOriginPost, rejectCrossOrigin } from '../../../../lib/admin-api'

const MAX_SESSION_ID_LEN = 100 // UUID v4 tem 36 chars; folga generosa, só para rejeitar lixo cedo

// Atualiza a MESMA linha da sessão (nunca cria linha nova). sessionId vem do corpo (o
// cliente precisa dizer QUAL sessão está viva), mas o e-mail contra o qual ele é validado
// vem exclusivamente de requireActiveUser() — heartbeatSession() rejeita (session_owner_
// mismatch) se o sessionId enviado pertencer a outro e-mail, então não é possível um
// usuário manter viva/alterar a sessão de outro mesmo enviando um sessionId alheio.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const user = await requireActiveUser(req, res)
  if (!user) return

  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOriginPost(req)) { rejectCrossOrigin(res); return }

  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  if (!sessionId || sessionId.length > MAX_SESSION_ID_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_session_id' })
    return
  }

  const result = await heartbeatSession({ sessionId, email: user.email })
  if (!result.updated) {
    // 404 para "não achei essa sessão desse usuário" (inclui dono errado) — o cliente
    // trata isso como "preciso iniciar uma sessão nova" (ver useAnalyticsSession).
    const status = result.reason === 'session_not_found' || result.reason === 'session_owner_mismatch'
      ? 404 : (result.reason === 'writer_unavailable' || result.reason === 'sheet_error' ? 503 : 400)
    res.status(status).json({ ok: false, error: result.reason })
    return
  }
  res.status(200).json({ ok: true, tempoAtivoSegundos: result.tempoAtivoSegundos })
}
