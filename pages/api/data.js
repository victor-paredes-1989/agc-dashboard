import { getAllDashData } from '../../lib/sheets'
import { requireActiveUser } from '../../lib/auth-guard'

export default async function handler(req, res) {
  // Validação ao vivo do STATUS atual em USUARIOS_ACESSO — não confia no valor do JWT.
  // Se o usuário foi bloqueado enquanto logado, esta chamada já nega (ver lib/auth-guard.js).
  const user = await requireActiveUser(req, res)
  if (!user) return

  try {
    const force = req.query.force === '1'
    const data = await getAllDashData({ force })

    if (force) {
      res.setHeader('Cache-Control', 'no-store, max-age=0')
    } else {
      res.setHeader('Cache-Control', 's-maxage=1500, stale-while-revalidate=60')
    }

    res.status(200).json(data)
  } catch (err) {
    console.error('Sheets API error:', err)
    res.status(500).json({ error: err.message })
  }
}
