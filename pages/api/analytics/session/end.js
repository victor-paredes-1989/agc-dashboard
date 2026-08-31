import { requireActiveUser } from '../../../../lib/auth-guard'
import { endSession } from '../../../../lib/sheets-analytics'
import { isSameOriginPost, rejectCrossOrigin } from '../../../../lib/admin-api'

const MAX_SESSION_ID_LEN = 100

// Encerramento "melhor esforço" — chamado tanto por um fluxo normal (fetch) quanto por
// navigator.sendBeacon em beforeunload/pagehide (ver hooks/useAnalyticsSession.js). Nunca é
// a ÚNICA forma de uma sessão ser considerada encerrada: se este request não chegar (aba
// fechada à força, navegador mata o processo, offline), a sessão simplesmente para de
// receber heartbeat e a leitura administrativa (lib/sheets-analytics.js:listSessions) trata
// isso como inativa depois de INACTIVITY_THRESHOLD_SECONDS sem precisar deste endpoint.
// Idempotente: chamar de novo numa sessão já ENCERRADA não é erro.
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

  const result = await endSession({ sessionId, email: user.email })
  if (!result.ended) {
    const status = result.reason === 'session_not_found' || result.reason === 'session_owner_mismatch'
      ? 404 : (result.reason === 'writer_unavailable' || result.reason === 'sheet_error' ? 503 : 400)
    res.status(status).json({ ok: false, error: result.reason })
    return
  }
  res.status(200).json({ ok: true })
}
