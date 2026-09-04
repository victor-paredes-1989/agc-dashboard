import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../api/auth/[...nextauth]'
import { resolveAccess, normalizeEmail } from '../../lib/sheets-users'

// Mesma proteção server-side de pages/admin/usuarios.js — consulta USUARIOS_ACESSO ao vivo
// antes de enviar qualquer HTML, não depende de esconder um link no menu.
export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions)
  const email = normalizeEmail(session?.user?.email)
  if (!email) {
    return { redirect: { destination: '/login', permanent: false } }
  }
  const decision = await resolveAccess(email)
  if (!decision.allowed || decision.perfil !== 'ADMIN') {
    return { redirect: { destination: '/', permanent: false } }
  }
  return { props: {} }
}

const ERROR_MESSAGES = {
  sheet_error: 'Não foi possível carregar os dados de acesso agora. Tente novamente.',
  admin_required: 'Acesso restrito a administradores.',
  access_denied: 'Sessão expirada ou acesso negado. Faça login novamente.',
  not_authenticated: 'Sessão expirada. Faça login novamente.',
}
function translateError(reason) {
  return ERROR_MESSAGES[reason] || 'Ocorreu um erro inesperado. Tente novamente.'
}

const PERIODO_OPTIONS = [
  { key: 'todos', label: 'Todo o período', dias: null },
  { key: '7d', label: 'Últimos 7 dias', dias: 7 },
  { key: '30d', label: 'Últimos 30 dias', dias: 30 },
  { key: 'hoje', label: 'Hoje', dias: 1 },
]

function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return '< 1min'
}

function fmtDateTime(iso) {
  const t = Date.parse(iso)
  if (isNaN(t)) return '—'
  return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function SessaoStatusChip({ efetivamenteAtiva, statusSessao }) {
  if (statusSessao === 'ENCERRADA') return <span style={{ color: 'var(--text-muted)' }}>Encerrada</span>
  if (efetivamenteAtiva) return <span style={{ color: 'var(--green)', fontWeight: 600 }}>● Ativa agora</span>
  return <span style={{ color: 'var(--text-muted)' }}>Inativa</span>
}

export default function AdminAnalytics() {
  const [sessions, setSessions] = useState(null)
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [periodo, setPeriodo] = useState('todos')
  const [usuarioFiltro, setUsuarioFiltro] = useState('TODOS')
  const [expandido, setExpandido] = useState(null) // email do usuário com histórico aberto

  const loadSessions = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/analytics', { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        throw new Error(translateError(body?.error))
      }
      setSessions(body.sessions || [])
      setConfigured(body.configured !== false)
    } catch (e) {
      setLoadError(e.message || translateError())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])

  const list = sessions || []

  const usuariosDisponiveis = useMemo(() => {
    const map = new Map()
    list.forEach(s => { if (s.email && !map.has(s.email)) map.set(s.email, s.nome || s.email) })
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [list])

  const sessoesFiltradas = useMemo(() => {
    const periodoCfg = PERIODO_OPTIONS.find(p => p.key === periodo)
    const corteMs = periodoCfg?.dias ? Date.now() - periodoCfg.dias * 24 * 60 * 60 * 1000 : null
    return list.filter(s => {
      if (usuarioFiltro !== 'TODOS' && s.email !== usuarioFiltro) return false
      if (corteMs !== null) {
        const t = Date.parse(s.inicio)
        if (isNaN(t) || t < corteMs) return false
      }
      return true
    })
  }, [list, periodo, usuarioFiltro])

  const porUsuario = useMemo(() => {
    const map = new Map()
    sessoesFiltradas.forEach(s => {
      if (!s.email) return
      if (!map.has(s.email)) {
        map.set(s.email, { email: s.email, nome: s.nome || s.email, sessoes: [], tempoAtivoTotal: 0, ultimoAcessoTs: null, ultimoAcesso: null })
      }
      const u = map.get(s.email)
      u.sessoes.push(s)
      u.tempoAtivoTotal += Number(s.tempoAtivoSegundos) || 0
      if (s.nome) u.nome = s.nome // última linha com nome preenchido "vence"
      const ts = Date.parse(s.ultimaAtividade)
      if (!isNaN(ts) && (u.ultimoAcessoTs === null || ts > u.ultimoAcessoTs)) {
        u.ultimoAcessoTs = ts
        u.ultimoAcesso = s.ultimaAtividade
      }
    })
    return [...map.values()]
      .map(u => ({ ...u, sessoesCount: u.sessoes.length, tempoMedio: u.sessoes.length ? u.tempoAtivoTotal / u.sessoes.length : 0 }))
      .sort((a, b) => (b.ultimoAcessoTs || 0) - (a.ultimoAcessoTs || 0))
  }, [sessoesFiltradas])

  const resumo = useMemo(() => {
    const usuariosUnicos = porUsuario.length
    const totalSessoes = sessoesFiltradas.length
    const tempoAtivoTotal = sessoesFiltradas.reduce((s, x) => s + (Number(x.tempoAtivoSegundos) || 0), 0)
    const tempoMedioPorSessao = totalSessoes ? tempoAtivoTotal / totalSessoes : 0
    return { usuariosUnicos, totalSessoes, tempoAtivoTotal, tempoMedioPorSessao }
  }, [porUsuario, sessoesFiltradas])

  return (
    <>
      <Head><title>Admin · Analytics</title></Head>

      <div className="u-shell">
        <header className="top-bar">
          <div className="top-bar-title"><span>◆</span>Admin · Analytics</div>
          <Link href="/admin/usuarios" className="u-btn u-btn-ghost">Usuários</Link>
          <Link href="/" className="u-btn u-btn-ghost">← Dashboard</Link>
          <button className="u-btn u-btn-secondary" onClick={loadSessions} disabled={loading}>
            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span> Atualizar
          </button>
        </header>

        <div className="page">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5, maxWidth: 720 }}>
            Quem acessou o VP Dash, quando, e por quanto tempo aproximadamente. O tempo é medido por heartbeat
            (a cada ~60s enquanto a aba está visível) — é uma <strong>aproximação operacional</strong>, não uma
            medição exata: navegadores não garantem um evento de encerramento perfeito.
          </div>

          {loadError && <div className="error" style={{ margin: '0 0 20px' }}>{loadError}</div>}

          {loading && sessions === null && (
            <div className="loading"><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span> Carregando acessos…</div>
          )}

          {sessions !== null && !configured && (
            <div className="u-empty">
              A aba <strong>ACESSOS_DASHBOARD</strong> ainda não foi configurada na planilha. Assim que ela existir
              (com o cabeçalho SESSION_ID / EMAIL / NOME / PERFIL / INICIO / ULTIMA_ATIVIDADE / TEMPO_ATIVO_SEGUNDOS /
              STATUS_SESSAO), os acessos aparecem aqui automaticamente.
            </div>
          )}

          {sessions !== null && configured && (
            <>
              {/* ── Filtros ── */}
              <div className="filter-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px', marginBottom: 24 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="field-label" style={{ marginBottom: 0 }}>Período</span>
                  <select value={periodo} onChange={e => setPeriodo(e.target.value)} className="field-input" style={{ minWidth: 160 }}>
                    {PERIODO_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="field-label" style={{ marginBottom: 0 }}>Usuário</span>
                  <select value={usuarioFiltro} onChange={e => setUsuarioFiltro(e.target.value)} className="field-input" style={{ minWidth: 200 }}>
                    <option value="TODOS">Todos os usuários</option>
                    {usuariosDisponiveis.map(([email, nome]) => <option key={email} value={email}>{nome}</option>)}
                  </select>
                </label>
              </div>

              {/* ── Resumo ── */}
              <div className="stagger-children" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 16, marginBottom: 32 }}>
                <div className="card"><div className="card-label">Usuários únicos</div><div className="card-value">{resumo.usuariosUnicos}</div></div>
                <div className="card blue"><div className="card-label">Sessões</div><div className="card-value">{resumo.totalSessoes}</div></div>
                <div className="card teal"><div className="card-label">Tempo ativo total aprox.</div><div className="card-value">{fmtDuration(resumo.tempoAtivoTotal)}</div></div>
                <div className="card purple"><div className="card-label">Tempo médio por sessão aprox.</div><div className="card-value">{fmtDuration(resumo.tempoMedioPorSessao)}</div></div>
              </div>

              {/* ── Tabela por usuário ── */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16 }}>
                Por usuário
              </div>
              {porUsuario.length === 0 ? (
                <div className="u-empty">Nenhum acesso registrado para esse filtro.</div>
              ) : (
                <div className="table-shell" style={{ marginBottom: 32 }}>
                  <table className="data-table zebra">
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Email</th>
                        <th className="is-numeric">Último acesso</th>
                        <th className="is-numeric">Sessões</th>
                        <th className="is-numeric">Tempo ativo total aprox.</th>
                        <th className="is-numeric">Tempo médio/sessão aprox.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porUsuario.map(u => (
                        <Fragment key={u.email}>
                          <tr
                            onClick={() => setExpandido(expandido === u.email ? null : u.email)}
                            style={{ cursor: 'pointer' }}
                            title="Clique para ver o histórico de sessões"
                          >
                            <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.nome}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                            <td className="is-numeric">{fmtDateTime(u.ultimoAcesso)}</td>
                            <td className="is-numeric">{u.sessoesCount}</td>
                            <td className="is-numeric">{fmtDuration(u.tempoAtivoTotal)}</td>
                            <td className="is-numeric">{fmtDuration(u.tempoMedio)}</td>
                          </tr>
                          {expandido === u.email && (
                            <tr>
                              <td colSpan={6} style={{ padding: 0, background: 'var(--surface-1)' }}>
                                <div style={{ padding: '12px 16px' }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Histórico de sessões — {u.nome}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {[...u.sessoes].sort((a, b) => (Date.parse(b.inicio) || 0) - (Date.parse(a.inicio) || 0)).map(s => (
                                      <div key={s.sessionId} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span style={{ color: 'var(--text-muted)', minWidth: 110 }}>Início: <span style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(s.inicio)}</span></span>
                                        <span style={{ color: 'var(--text-muted)', minWidth: 150 }}>Última atividade: <span style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(s.ultimaAtividade)}</span></span>
                                        <span style={{ color: 'var(--text-muted)' }}>Duração aprox.: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fmtDuration(s.tempoAtivoSegundos)}</span></span>
                                        <span><SessaoStatusChip efetivamenteAtiva={s.efetivamenteAtiva} statusSessao={s.statusSessao} /></span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .u-shell { min-height: 100vh; background: var(--bg-primary); }
        .page { padding: 24px; max-width: 1200px; margin: 0 auto; }
        .u-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: var(--radius-btn); border: 1px solid transparent; cursor: pointer;
          font-family: inherit; font-weight: 600; padding: 7px 13px; font-size: 12.5px;
          white-space: nowrap; text-decoration: none; transition: all 0.15s ease;
        }
        .u-btn:disabled { opacity: 0.45; cursor: default; }
        .u-btn-ghost { background: transparent; border-color: var(--border); color: var(--text-secondary); }
        .u-btn-ghost:hover { border-color: var(--border-strong); color: var(--text-primary); }
        .u-btn-secondary { background: var(--bg-card); border-color: var(--border); color: var(--text-primary); margin-left: auto; }
        .u-btn-secondary:hover { border-color: var(--border-strong); }
        .u-empty {
          color: var(--text-muted); font-size: 13px; padding: 32px 20px; text-align: center;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-md);
        }
        .error {
          background: var(--red-bg); color: var(--red); border: 1px solid var(--red);
          border-radius: var(--radius-md); padding: 12px 16px; font-size: 13px;
        }
        .loading { color: var(--text-muted); font-size: 13px; padding: 40px 0; text-align: center; }
        @media (max-width: 640px) {
          .page { padding: 14px; }
          .top-bar { flex-wrap: wrap; height: auto; padding: 10px 14px; gap: 8px; }
        }
      `}</style>
    </>
  )
}
