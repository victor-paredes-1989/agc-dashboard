import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { resolveAccess, normalizeEmail } from '../../../lib/sheets-users'

// Fase 1 da gestão dinâmica de acessos: a autorização de login deixou de depender de
// ALLOWED_EMAILS (allowlist estática) e passa a consultar a aba USUARIOS_ACESSO, com
// SUPER_ADMIN_EMAILS funcionando exclusivamente como fallback de emergência (break-glass)
// para falha técnica da planilha — ver lib/sheets-users.js:resolveAccess().
//
// ALLOWED_EMAILS permanece definida no Vercel (não removida) apenas para permitir rollback
// rápido: revertendo este arquivo para a versão anterior, ela volta a funcionar imediatamente.

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      const email = normalizeEmail(user?.email)
      if (!email) return false

      const decision = await resolveAccess(email)
      if (decision.allowed) return true

      // Redireciona para a tela de login existente com o motivo identificável na URL.
      // pages/login.js não foi alterado nesta fase — o parâmetro extra `reason` é
      // simplesmente ignorado pelo código atual, sem quebrar nada.
      return `/login?error=AccessDenied&reason=${encodeURIComponent(decision.reason)}`
    },

    // IMPORTANTE: perfil/status abaixo (token e session.user) existem apenas para UX
    // (ex.: mostrar/ocultar um futuro menu Admin). Podem estar desatualizados por até
    // THROTTLE_MS. NUNCA são a fonte de verdade de autorização — toda API sensível deve
    // usar requireActiveUser()/requireAdmin() (lib/auth-guard.js), que sempre consulta
    // USUARIOS_ACESSO ao vivo, independente do que está gravado no JWT.
    async jwt({ token, user }) {
      const now = Date.now()

      if (user) {
        // Login: o signIn acima já validou o acesso. Esta segunda consulta só popula o
        // token para exibição — ocorre uma vez por login (evento raro), não por request.
        const email = normalizeEmail(user.email)
        const decision = await resolveAccess(email)
        token.email = email
        token.perfil = decision.perfil || 'USUARIO'
        token.status = decision.status || (decision.breakGlass ? 'ATIVO' : 'NEGADO')
        token.lastAccessCheck = now
        return token
      }

      // Toda leitura de sessão (useSession/getSession no cliente, getServerSession no
      // servidor) passa por aqui em NextAuth v4 com estratégia JWT — não existe um
      // "updateAge" nativo para essa estratégia. O throttle abaixo é só para não bater na
      // planilha a cada request; não é, e não pretende ser, um controle de acesso.
      const THROTTLE_MS = 5 * 60 * 1000
      if (token.email && (!token.lastAccessCheck || now - token.lastAccessCheck > THROTTLE_MS)) {
        const decision = await resolveAccess(token.email)
        token.status = decision.status || (decision.breakGlass ? 'ATIVO' : 'NEGADO')
        token.perfil = decision.perfil || token.perfil || 'USUARIO'
        token.lastAccessCheck = now
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email || session.user.email
        session.user.perfil = token.perfil || 'USUARIO'
        session.user.status = token.status || null
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
}

export default NextAuth(authOptions)
