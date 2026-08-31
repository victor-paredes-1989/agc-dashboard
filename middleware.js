export { default } from 'next-auth/middleware'

export const config = {
  matcher: [
    // /aguardando (Fase 2) é destino de login negado (usuário PENDENTE) — precisa ficar
    // acessível sem sessão ativa, assim como /login já era.
    // manifest.webmanifest e os ícones (favicon*/apple-touch-icon/icon-*) também
    // precisam ficar de fora do gate de auth: o navegador/SO busca esses arquivos
    // por conta própria (checagem de instalabilidade do PWA, geração do ícone de
    // atalho) sem enviar sessão — antes disso caía no matcher genérico e o
    // middleware redirecionava (307) essas requisições para /login, então o Chrome
    // nunca recebia o manifest/ícone de verdade e caía no fallback de monograma.
    '/((?!login|aguardando|_next/static|_next/image|favicon.ico|favicon.svg|favicon-16.png|favicon-32.png|apple-touch-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|manifest.webmanifest|api/auth).*)',
  ],
}
