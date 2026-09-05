import { requireAdmin } from '../../../../../lib/auth-guard'
import { updateUserPerfil } from '../../../../../lib/sheets-write'
import { sendHelperError, isSameOriginPost, rejectCrossOrigin } from '../../../../../lib/admin-api'

const MAX_EMAIL_LEN = 320
const VALID_PERFIS = ['ADMIN', 'SENIOR', 'USUARIO']

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

  const targetEmail = typeof req.query.email === 'string' ? req.query.email.trim() : ''
  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const perfilInput = typeof body.perfil === 'string' ? body.perfil.trim().toUpperCase() : ''

  if (!targetEmail || targetEmail.length > MAX_EMAIL_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_email' })
    return
  }
  if (!VALID_PERFIS.includes(perfilInput)) {
    res.status(400).json({ ok: false, error: 'invalid_perfil' })
    return
  }

  // actorEmail vem exclusivamente de requireAdmin — mesma regra de action.js.
  const result = await updateUserPerfil({ email: targetEmail, perfil: perfilInput, actorEmail: admin.email })
  if (!result.updated) {
    sendHelperError(res, result)
    return
  }
  res.status(200).json({ ok: true, email: result.email, status: result.status, perfil: result.perfil })
}
