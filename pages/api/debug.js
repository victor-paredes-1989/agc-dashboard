import { getDebugInfo } from '../../lib/sheets'
import { requireActiveUser } from '../../lib/auth-guard'

export default async function handler(req, res) {
  // Validação ao vivo do STATUS atual em USUARIOS_ACESSO — não confia no valor do JWT.
  const user = await requireActiveUser(req, res)
  if (!user) return

  try {
    const info = await getDebugInfo()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(info)
  } catch (err) {
    console.error('Debug API error:', err)
    res.status(500).json({ error: err.message })
  }
}
