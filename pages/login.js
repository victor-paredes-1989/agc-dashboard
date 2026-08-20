import { signIn, useSession } from 'next-auth/react'
import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function Login() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const denied = router.query.error === 'AccessDenied'

  useEffect(() => {
    if (status === 'authenticated') router.replace('/')
  }, [status, router])

  if (status === 'loading') return null

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary, #0f172a)', fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: 'var(--bg-card, #1e293b)', borderRadius: 12, padding: '48px 40px',
        textAlign: 'center', maxWidth: 360, width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <h1 style={{ color: 'var(--text-primary, #f1f5f9)', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
          AGC Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted, #64748b)', fontSize: 13, margin: '0 0 32px' }}>
          Acesso restrito a usuários autorizados
        </p>

        {denied && (
          <div style={{
            background: '#7f1d1d', color: '#fca5a5', borderRadius: 8,
            padding: '10px 14px', fontSize: 13, marginBottom: 24,
          }}>
            Seu e-mail não está na lista de acesso autorizado.
          </div>
        )}

        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
            background: '#fff', color: '#1e293b', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Entrar com Google
        </button>
      </div>
    </div>
  )
}
