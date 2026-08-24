// Infraestrutura HTTP compartilhada pelas rotas /api/admin/users/* — PR B da área
// Admin > Usuários. Nenhuma regra de negócio mora aqui: cada rota continua chamando
// requireAdmin() (lib/auth-guard.js) e os helpers de dados (lib/sheets-users.js /
// lib/sheets-write.js) normalmente. Isto só padroniza duas coisas que se repetiriam em
// toda rota: como o `reason` devolvido pelos helpers vira uma resposta HTTP sanitizada, e
// uma checagem leve de mesma origem para as rotas de escrita (POST).

// Mapa fixo de reason -> status HTTP. Qualquer reason fora deste mapa cai em 500 — nunca
// silenciosamente em 200, e nunca ecoando a mensagem original do erro (que pode conter
// detalhes técnicos de rede/credencial da chamada ao Google Sheets).
const REASON_STATUS = {
  invalid_email: 400,
  invalid_action: 400,
  invalid_perfil: 400,
  invalid_name: 400,
  invalid_input: 400,
  invalid_transition: 409,
  already_exists: 409,
  last_admin_protected: 409,
  self_action_forbidden: 403,
  not_found: 404,
  // missing_actor nunca deveria ocorrer nestas rotas — actorEmail sempre vem de
  // requireAdmin(), nunca de req.body/req.query — mas se ocorrer é um erro interno, não
  // uma falha de input do cliente.
  missing_actor: 500,
  invalid_schema: 503,
  sheet_error: 503,
  writer_unavailable: 503,
}

// Recebe o objeto de resultado de um helper de escrita (updateUserStatus/updateUserPerfil/
// createUserManually), que sempre tem um campo `reason` quando a operação falha, e escreve
// a resposta HTTP correspondente. Nunca inclui result.error (mensagem crua de exceção,
// possivelmente com detalhes internos) — só o `reason`, que é sempre uma das strings fixas
// já usadas internamente pelos helpers, e o `currentStatus` quando presente (é só um dos
// quatro valores válidos de STATUS, não vaza nada).
export function sendHelperError(res, result) {
  const reason = (result && result.reason) || 'unknown_error'
  const status = REASON_STATUS[reason] || 500
  const body = { ok: false, error: reason }
  if (result && result.currentStatus !== undefined) body.currentStatus = result.currentStatus
  res.status(status).json(body)
}

// Checagem leve de mesma origem para POST administrativos — defesa em profundidade além
// do cookie de sessão do NextAuth, que por padrão usa SameSite=Lax (o navegador já não
// envia esse cookie num POST disparado a partir de outra origem, então um CSRF clássico já
// chegaria sem sessão e cairia em requireAdmin/401 antes mesmo de chegar aqui). Esta
// checagem é uma segunda camada, não a única: se o header Origin vier presente e não bater
// com o Host da própria requisição, rejeita. Se Origin estiver ausente, permite — a
// ausência sozinha não é evidência de origem cruzada (alguns clientes legítimos não a
// enviam), e a proteção primária continua sendo o cookie SameSite=Lax.
export function isSameOriginPost(req) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

export function rejectCrossOrigin(res) {
  res.status(403).json({ ok: false, error: 'cross_origin_forbidden' })
}
