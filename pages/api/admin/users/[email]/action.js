import { requireAdmin } from '../../../../../lib/auth-guard'
import { updateUserStatus } from '../../../../../lib/sheets-write'
import { sendHelperError, isSameOriginPost, rejectCrossOrigin } from '../../../../../lib/admin-api'

const MAX_EMAIL_LEN = 320
const VALID_ACTIONS = ['approve', 'deny', 'block', 'reactivate']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return

  res.setHeader('Cache-Control', 'no-store')

  if (!isSameOriginPost(req)) { rejectCrossOrigin(res); return }

  // Next.js já faz o decode do segmento dinâmico [email] antes de popular req.query.email
  // (@, +, . não precisam de tratamento manual aqui) — normalização de fato é feita dentro
  // de updateUserStatus, nunca duplicada nesta camada.
  const targetEmail = typeof req.query.email === 'string' ? req.query.email.trim() : ''
  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const action = typeof body.action === 'string' ? body.action : ''

  if (!targetEmail || targetEmail.length > MAX_EMAIL_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_email' })
    return
  }
  if (!VALID_ACTIONS.includes(action)) {
    res.status(400).json({ ok: false, error: 'invalid_action' })
    return
  }

  // actorEmail vem EXCLUSIVAMENTE da identidade autenticada devolvida por requireAdmin —
  // nunca de req.body/req.query. Mesmo que o cliente envie um actorEmail no corpo, ele é
  // ignorado: nem é lido acima.
  const result = await updateUserStatus({ email: targetEmail, action, actorEmail: admin.email })
  if (!result.updated) {
    sendHelperError(res, result)
    return
  }
  res.status(200).json({ ok: true, email: result.email, status: result.status, perfil: result.perfil })
}
