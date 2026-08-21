// Tela de destino para usuários PENDENTE (recém-registrados ou já cadastrados assim).
// Acessível sem sessão ativa: o callback signIn em [...nextauth].js redireciona para cá
// ANTES de qualquer sessão/JWT ser criado (login negado com destino customizado), então
// esta página nunca pode depender de useSession()/getServerSession() para renderizar.
export default function Aguardando() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary, #0f172a)', fontFamily: 'sans-serif',
    }}>
      <div style={{
        background: 'var(--bg-card, #1e293b)', borderRadius: 12, padding: '48px 40px',
        textAlign: 'center', maxWidth: 380, width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⏳</div>
        <h1 style={{ color: 'var(--text-primary, #f1f5f9)', fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>
          Seu acesso está aguardando aprovação
        </h1>
        <p style={{ color: 'var(--text-muted, #64748b)', fontSize: 13, margin: '16px 0 32px', lineHeight: 1.6 }}>
          Seu e-mail foi registrado. Assim que um administrador liberar o acesso,
          você poderá entrar no dashboard.
        </p>

        <a
          href="/login"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '12px 20px', borderRadius: 8, border: 'none',
            background: '#fff', color: '#1e293b', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box',
          }}
        >
          Voltar ao login
        </a>
      </div>
    </div>
  )
}
