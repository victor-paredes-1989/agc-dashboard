import { requireAdmin } from '../../../../../lib/auth-guard'
import { updateUserName } from '../../../../../lib/sheets-write'
import { sendHelperError, isSameOriginPost, rejectCrossOrigin } from '../../../../../lib/admin-api'

const MAX_EMAIL_LEN = 320
const MAX_NAME_LEN = 100

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
  if (!targetEmail || targetEmail.length > MAX_EMAIL_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_email' })
    return
  }

  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const nameInput = typeof body.name === 'string' ? body.name : null

  if (nameInput === null) {
    res.status(400).json({ ok: false, error: 'invalid_name' })
    return
  }
  const trimmedName = nameInput.trim()
  if (!trimmedName || trimmedName.length > MAX_NAME_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_name' })
    return
  }

  // actorEmail vem exclusivamente de requireAdmin — nunca de body/query.
  const result = await updateUserName({ email: targetEmail, name: trimmedName, actorEmail: admin.email })
  if (!result.updated) {
    sendHelperError(res, result)
    return
  }
  res.status(200).json({ ok: true, email: result.email, nome: result.nome })
}
