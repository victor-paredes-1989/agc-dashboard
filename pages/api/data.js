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
      // force=1 sempre ignora as duas camadas de cache (memória em lib/sheets.js e CDN
      // aqui) e nunca é armazenado pela CDN — é o caminho da atualização manual.
      res.setHeader('Cache-Control', 'no-store, max-age=0')
    } else {
      // s-maxage coordenado com CACHE_TTL (lib/sheets.js) — as duas camadas precisam do
      // mesmo TTL, senão a CDN serve uma resposta mais velha do que o cache em memória já
      // permitiria. stale-while-revalidate=60 mantido: acrescenta no máximo 60s de
      // staleness adicional após o s-maxage expirar (enquanto a CDN revalida em segundo
      // plano), o que não é significativo frente ao objetivo de ~5 min.
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    }

    res.status(200).json(data)
  } catch (err) {
    console.error('Sheets API error:', err)
    res.status(500).json({ error: err.message })
  }
}
