import { requireAdmin } from '../../../../lib/auth-guard'
import { listUsers } from '../../../../lib/sheets-users'
import { createUserManually } from '../../../../lib/sheets-write'
import { sendHelperError, isSameOriginPost, rejectCrossOrigin } from '../../../../lib/admin-api'

const MAX_EMAIL_LEN = 320 // limite prático de RFC 5321, só para rejeitar input absurdo cedo
const MAX_NAME_LEN = 200

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  // ADMIN-only, ao vivo (requireAdmin -> requireActiveUser -> resolveAccess consulta
  // USUARIOS_ACESSO a cada chamada — nunca confia no PERFIL cacheado no JWT).
  const admin = await requireAdmin(req, res)
  if (!admin) return // resposta 401/403/503 já escrita por requireAdmin

  // Esta rota precisa sempre refletir o estado atual da planilha — nunca o cache de
  // ~25/5min de /api/data (esse cache é só para os dados do dashboard, não para
  // autorização/gestão de usuários).
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const result = await listUsers()
    if (result.result !== 'OK') {
      sendHelperError(res, { reason: result.error === 'invalid_schema' ? 'invalid_schema' : 'sheet_error' })
      return
    }
    // Só os campos que a UI precisa — nunca repassa o objeto do helper "as-is" (evita
    // vazar um campo interno futuro por acidente).
    const users = result.users.map(u => ({
      email: u.email,
      nome: u.nome,
      status: u.status,
      perfil: u.perfil,
      dataCadastro: u.dataCadastro,
      ultimaAlteracao: u.ultimaAlteracao,
    }))
    res.status(200).json({ ok: true, users })
    return
  }

  // POST — cadastro manual. Defesa em profundidade além do cookie SameSite=Lax do NextAuth
  // (ver lib/admin-api.js).
  if (!isSameOriginPost(req)) { rejectCrossOrigin(res); return }

  const body = (req.body && typeof req.body === 'object') ? req.body : {}
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''

  // Validação de fronteira apenas — formato de e-mail, duplicidade, normalização e o
  // fixo STATUS=ATIVO/PERFIL=USUARIO são todos responsabilidade de createUserManually.
  // Note que `perfil`/`status`/`actorEmail` no corpo, se enviados, são simplesmente
  // ignorados abaixo — createUserManually nem aceita esses parâmetros.
  if (!email || email.length > MAX_EMAIL_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_email' })
    return
  }
  if (name.length > MAX_NAME_LEN) {
    res.status(400).json({ ok: false, error: 'invalid_input' })
    return
  }

  const result = await createUserManually({ email, name })
  if (!result.inserted) {
    sendHelperError(res, result)
    return
  }
  res.status(201).json({ ok: true, email: result.email, status: result.status, perfil: result.perfil })
}
