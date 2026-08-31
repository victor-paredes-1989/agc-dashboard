import { requireAdmin } from '../../../lib/auth-guard'
import { listSessions } from '../../../lib/sheets-analytics'

// Leitura administrativa — só ADMIN (ao vivo, via requireAdmin -> USUARIOS_ACESSO), nunca
// pública. Devolve a lista bruta de sessões (mesmo padrão de pages/api/admin/users/index.js
// com listUsers()) — resumo, agrupamento por usuário e filtros de período/usuário são
// calculados no cliente (pages/admin/analytics.js), exatamente como a tela de Usuários já
// faz com a lista de usuários.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ ok: false, error: 'method_not_allowed' })
    return
  }

  const admin = await requireAdmin(req, res)
  if (!admin) return // 401/403/503 já escrito por requireAdmin

  res.setHeader('Cache-Control', 'no-store')

  const result = await listSessions()
  if (result.result === 'NOT_CONFIGURED') {
    // Aba ACESSOS_DASHBOARD ainda não existe/sem cabeçalho — não é uma falha técnica, é
    // configuração pendente. 200 com sessions:[] + flag, para a UI mostrar uma mensagem
    // clara em vez de um erro genérico.
    res.status(200).json({ ok: true, configured: false, sessions: [] })
    return
  }
  if (result.result !== 'OK') {
    res.status(503).json({ ok: false, error: 'sheet_error' })
    return
  }
  res.status(200).json({ ok: true, configured: true, sessions: result.sessions })
}
