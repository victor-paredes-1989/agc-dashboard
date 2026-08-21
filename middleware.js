export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    // /aguardando (Fase 2) é destino de login negado (usuário PENDENTE) — precisa ficar
    // acessível sem sessão ativa, assim como /login já era.
    '/((?!login|aguardando|_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
