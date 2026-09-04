import { getInvestEquipeData } from '../../lib/sheets'
import { requireSeniorOrAdmin } from '../../lib/auth-guard'

// Endpoint dedicado à área restrita "Investimento em Equipe" — deliberadamente separado de
// /api/data.js. requireSeniorOrAdmin() consulta USUARIOS_ACESSO ao vivo (nunca confia no
// PERFIL do JWT/sessão) e nega ADMIN/SENIOR-only aqui, server-side, antes de qualquer dado
// sair do servidor — a diferença de /api/debug.js é só a exigência de perfil (ADMIN ou
// SENIOR aqui, qualquer usuário ATIVO lá).
//
// Cache-Control: no-store/private — este payload é sensível a PERFIL (dado restrito), então
// nunca pode ser cacheado pela CDN de forma compartilhada entre usuários com perfis
// diferentes (ver comentário de _investEquipeCache em lib/sheets.js). getInvestEquipeData()
// já tem seu próprio cache em memória no servidor (5min), então isso não gera carga extra na
// API do Google Sheets — só impede que a CDN sirva a mesma resposta HTTP para todo mundo.
export default async function handler(req, res) {
  const user = await requireSeniorOrAdmin(req, res)
  if (!user) return

  try {
    const force = req.query.force === '1'
    const investEquipe = await getInvestEquipeData({ force })
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).json({ INVEST_EQUIPE: investEquipe })
  } catch (err) {
    console.error('Invest Equipe API error:', err)
    res.status(500).json({ error: err.message })
  }
}
