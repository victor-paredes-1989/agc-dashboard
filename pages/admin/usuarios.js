import { useState, useEffect, useCallback, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../api/auth/[...nextauth]'
import { resolveAccess, normalizeEmail } from '../../lib/sheets-users'

// Proteção server-side própria desta página — o menu (pages/index.js) só ESCONDE o link
// para quem não é ADMIN, isso nunca é a proteção real. Aqui consultamos USUARIOS_ACESSO ao
// vivo (mesmos primitivos que lib/auth-guard.js usa), então mesmo alguém que descubra a URL
// diretamente é barrado antes de qualquer HTML da página ser enviado — não usamos
// requireAdmin() diretamente porque ele responde via res.json() (rotas de API), não via
// redirect (páginas).
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

// Tradução fixa de `reason` (vindo de /api/admin/users*) para mensagem humana — nunca exibe
// mensagem crua de exceção, nome de env var ou detalhe interno do Google/Sheets.
const ERROR_MESSAGES = {
  last_admin_protected: 'Não é possível alterar o último administrador ativo.',
  self_action_forbidden: 'Você não pode executar essa ação sobre o próprio acesso.',
  invalid_transition: 'Esta alteração de status não é permitida.',
  already_exists: 'Este e-mail já está cadastrado.',
  not_found: 'Usuário não encontrado.',
  writer_unavailable: 'Não foi possível atualizar os usuários agora. Tente novamente.',
  sheet_error: 'Não foi possível atualizar os usuários agora. Tente novamente.',
  invalid_schema: 'Não foi possível atualizar os usuários agora. Tente novamente.',
  invalid_name: 'Informe um nome válido.',
  invalid_email: 'E-mail inválido.',
  invalid_action: 'Ação inválida.',
  invalid_perfil: 'Perfil inválido.',
  invalid_input: 'Dados inválidos. Verifique o nome e o e-mail informados.',
  cross_origin_forbidden: 'Requisição bloqueada por segurança. Recarregue a página e tente novamente.',
  method_not_allowed: 'Operação não permitida.',
  admin_required: 'Acesso restrito a administradores.',
  access_denied: 'Sessão expirada ou acesso negado. Faça login novamente.',
  not_authenticated: 'Sessão expirada. Faça login novamente.',
}
function translateError(reason) {
  return ERROR_MESSAGES[reason] || 'Ocorreu um erro inesperado. Tente novamente.'
}

const STATUS_LABELS = { ATIVO: 'Ativo', PENDENTE: 'Pendente', BLOQUEADO: 'Bloqueado', NEGADO: 'Negado' }
const STATUS_CLASS = { ATIVO: 'ativo', PENDENTE: 'pendente', BLOQUEADO: 'bloqueado', NEGADO: 'negado' }

function StatusBadge({ status }) {
  return <span className={`u-status u-status-${STATUS_CLASS[status] || 'default'}`}>{STATUS_LABELS[status] || status || '—'}</span>
}

// Tenta ordenar por data quando parseável; se o formato vindo da planilha não for
// reconhecido pelo Date(), simplesmente não força ordenação por essa coluna em vez de
// quebrar ou exibir uma ordem sem sentido (simplificação permitida pelo pedido).
function parseDateSafe(v) {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.getTime()
}

function normalizeEmailClient(email) {
  return (email || '').trim().toLowerCase()
}

export default function AdminUsuarios() {
  const { data: session } = useSession()
  const myEmail = normalizeEmailClient(session?.user?.email)

  const [users, setUsers] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busyMap, setBusyMap] = useState({})
  const [modalOpen, setModalOpen] = useState(false)
  // editName: { email } — qual célula de nome está em modo edição (um por vez)
  const [editName, setEditName] = useState(null)

  const busyRef = useRef({})
  const noticeTimer = useRef(null)

  const showNotice = (msg) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(null), 4000)
  }

  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current) }, [])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        throw new Error(translateError(body?.error))
      }
      setUsers(body.users || [])
    } catch (e) {
      // Falha de carregamento nunca apaga a tabela já exibida — só mostra o aviso e
      // mantém `users` como estava (não chamamos setUsers aqui).
      setLoadError(e.message || translateError())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const setBusy = (key, val) => {
    const next = { ...busyRef.current, [key]: val }
    busyRef.current = next
    setBusyMap(next)
  }

  const runAction = async (key, fn, successMsg) => {
    if (busyRef.current[key]) return // guarda contra duplo-clique
    setBusy(key, true)
    setActionError(null)
    try {
      const result = await fn()
      if (!result || !result.ok) {
        setActionError(translateError(result?.error))
        return
      }
      if (successMsg) showNotice(successMsg)
      await loadUsers()
    } catch (e) {
      setActionError(translateError())
    } finally {
      setBusy(key, false)
    }
  }

  const postJson = (url, payload) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(async (r) => {
      const body = await r.json().catch(() => null)
      return body || { ok: false, error: 'unknown_error' }
    })

  const handleStatusAction = (email, action, successMsg) => {
    const key = `${email}:${action}`
    runAction(key, () => postJson(`/api/admin/users/${encodeURIComponent(email)}/action`, { action }), successMsg)
  }

  const handlePerfilChange = (email, perfil) => {
    const key = `${email}:perfil`
    runAction(key, () => postJson(`/api/admin/users/${encodeURIComponent(email)}/perfil`, { perfil }), `Perfil de ${email} atualizado.`)
  }

  const handleNameSave = (email, name, onDone) => {
    const key = `${email}:name`
    runAction(
      key,
      () => postJson(`/api/admin/users/${encodeURIComponent(email)}/name`, { name }),
      `Nome atualizado.`,
    ).then(() => { onDone && onDone() })
  }

  const list = users || []
  const activeAdminCount = list.filter(u => u.perfil === 'ADMIN' && u.status === 'ATIVO').length

  const pendentes = list
    .filter(u => u.status === 'PENDENTE')
    .slice()
    .sort((a, b) => {
      const da = parseDateSafe(a.dataCadastro)
      const db = parseDateSafe(b.dataCadastro)
      if (da !== null && db !== null) return db - da
      return 0
    })

  const todos = list
    .slice()
    .sort((a, b) => {
      if (a.perfil !== b.perfil) return a.perfil === 'ADMIN' ? -1 : 1
      const an = (a.nome || a.email || '').toLowerCase()
      const bn = (b.nome || b.email || '').toLowerCase()
      return an.localeCompare(bn)
    })

  const isSelf = (email) => normalizeEmailClient(email) === myEmail
  const isLastActiveAdmin = (u) => u.perfil === 'ADMIN' && u.status === 'ATIVO' && activeAdminCount <= 1

  return (
    <>
      <Head><title>Admin · Usuários</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>

      <div className="u-shell">
        <header className="top-bar">
          <div className="top-bar-title"><span>◆</span>Admin · Usuários</div>
          <Link href="/" className="u-btn u-btn-ghost">← Dashboard</Link>
          <button className="u-btn u-btn-secondary" onClick={loadUsers} disabled={loading}>
            <span style={{ display: 'inline-block', animation: loading ? 'spin 1s linear infinite' : 'none' }}>↻</span> Atualizar
          </button>
        </header>

        <div className="page">
          {notice && <div className="u-notice">{notice}</div>}
          {actionError && (
            <div className="error" style={{ margin: '0 0 20px' }}>
              {actionError}
              <button className="u-dismiss" onClick={() => setActionError(null)}>×</button>
            </div>
          )}
          {loadError && (
            <div className="error" style={{ margin: '0 0 20px' }}>
              {loadError}
              <button className="u-dismiss" onClick={() => setLoadError(null)}>×</button>
            </div>
          )}

          {loading && users === null && (
            <div className="loading"><span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span> Carregando usuários…</div>
          )}

          {users !== null && (
            <>
              {/* ── Solicitações Pendentes ── */}
              <div className="section-title">Solicitações Pendentes</div>
              {pendentes.length === 0 ? (
                <div className="u-empty">Nenhuma solicitação pendente.</div>
              ) : (
                <div className="u-table-wrap">
                  <table className="u-table">
                    <thead>
                      <tr>
                        <th>Nome</th><th>Email</th><th>Data de cadastro</th><th>Perfil</th><th>Status</th><th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendentes.map(u => {
                        const busyApprove = !!busyMap[`${u.email}:approve`]
                        const busyDeny = !!busyMap[`${u.email}:deny`]
                        const self = isSelf(u.email)
                        return (
                          <tr key={u.email}>
                            <td>{u.nome || '—'}</td>
                            <td className="u-email">{u.email}</td>
                            <td>{u.dataCadastro || '—'}</td>
                            <td>{u.perfil || '—'}</td>
                            <td><StatusBadge status={u.status} /></td>
                            <td>
                              <div className="u-actions">
                                <button
                                  className="u-btn u-btn-primary u-btn-sm"
                                  disabled={self || busyApprove || busyDeny}
                                  title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : undefined}
                                  onClick={() => handleStatusAction(u.email, 'approve', `${u.nome || u.email} aprovado.`)}
                                >{busyApprove ? '…' : 'Aprovar'}</button>
                                <button
                                  className="u-btn u-btn-danger u-btn-sm"
                                  disabled={self || busyApprove || busyDeny}
                                  title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : undefined}
                                  onClick={() => handleStatusAction(u.email, 'deny', `${u.nome || u.email} negado.`)}
                                >{busyDeny ? '…' : 'Negar'}</button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Todos os Usuários ── */}
              <div className="u-section-header">
                <div className="section-title" style={{ margin: 0 }}>Todos os Usuários</div>
                <button className="u-btn u-btn-primary u-btn-sm" onClick={() => setModalOpen(true)}>+ Adicionar usuário</button>
              </div>
              {todos.length === 0 ? (
                <div className="u-empty">Nenhum usuário cadastrado.</div>
              ) : (
                <div className="u-table-wrap">
                  <table className="u-table">
                    <thead>
                      <tr>
                        <th>Nome</th><th>Email</th><th>Status</th><th>Perfil</th><th>Data de cadastro</th><th>Última alteração</th><th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todos.map(u => {
                        const self = isSelf(u.email)
                        const lastAdmin = isLastActiveAdmin(u)
                        const perfilBusy = !!busyMap[`${u.email}:perfil`]
                        const perfilLocked = self || lastAdmin || perfilBusy
                        const perfilTitle = self
                          ? 'Você não pode alterar o próprio perfil.'
                          : lastAdmin
                            ? 'Não é possível alterar o último administrador ativo.'
                            : undefined

                        let rowAction = null
                        if (u.status === 'PENDENTE') {
                          const busyApprove = !!busyMap[`${u.email}:approve`]
                          const busyDeny = !!busyMap[`${u.email}:deny`]
                          rowAction = (
                            <div className="u-actions">
                              <button className="u-btn u-btn-primary u-btn-sm" disabled={self || busyApprove || busyDeny}
                                title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : undefined}
                                onClick={() => handleStatusAction(u.email, 'approve', `${u.nome || u.email} aprovado.`)}>{busyApprove ? '…' : 'Aprovar'}</button>
                              <button className="u-btn u-btn-danger u-btn-sm" disabled={self || busyApprove || busyDeny}
                                title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : undefined}
                                onClick={() => handleStatusAction(u.email, 'deny', `${u.nome || u.email} negado.`)}>{busyDeny ? '…' : 'Negar'}</button>
                            </div>
                          )
                        } else if (u.status === 'ATIVO') {
                          const busyBlock = !!busyMap[`${u.email}:block`]
                          const blockLocked = self || lastAdmin || busyBlock
                          rowAction = (
                            <div className="u-actions">
                              <button className="u-btn u-btn-danger u-btn-sm" disabled={blockLocked}
                                title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : lastAdmin ? 'Não é possível alterar o último administrador ativo.' : undefined}
                                onClick={() => handleStatusAction(u.email, 'block', `${u.nome || u.email} bloqueado.`)}>{busyBlock ? '…' : 'Bloquear'}</button>
                            </div>
                          )
                        } else if (u.status === 'BLOQUEADO' || u.status === 'NEGADO') {
                          const busyReact = !!busyMap[`${u.email}:reactivate`]
                          rowAction = (
                            <div className="u-actions">
                              <button className="u-btn u-btn-primary u-btn-sm" disabled={self || busyReact}
                                title={self ? 'Você não pode executar essa ação sobre o próprio acesso.' : undefined}
                                onClick={() => handleStatusAction(u.email, 'reactivate', `${u.nome || u.email} reativado.`)}>{busyReact ? '…' : 'Reativar'}</button>
                            </div>
                          )
                        }

                        const nameBusy = !!busyMap[`${u.email}:name`]
                        const nameEditing = editName === u.email

                        return (
                          <tr key={u.email}>
                            <td>
                              {nameEditing ? (
                                <NameEditor
                                  initialValue={u.nome || ''}
                                  busy={nameBusy}
                                  onSave={(val) => {
                                    handleNameSave(u.email, val, () => setEditName(null))
                                  }}
                                  onCancel={() => setEditName(null)}
                                />
                              ) : (
                                <span className="u-name-cell">
                                  <span className="u-name-text">{u.nome || '—'}</span>
                                  <button
                                    className="u-btn-edit"
                                    title="Editar nome"
                                    onClick={() => setEditName(u.email)}
                                  >✎</button>
                                </span>
                              )}
                            </td>
                            <td className="u-email">{u.email}</td>
                            <td><StatusBadge status={u.status} /></td>
                            <td>
                              <select
                                className="field-input u-perfil-select"
                                value={u.perfil || 'USUARIO'}
                                disabled={perfilLocked}
                                title={perfilTitle}
                                onChange={(e) => handlePerfilChange(u.email, e.target.value)}
                              >
                                <option value="USUARIO">Usuário</option>
                                <option value="ADMIN">Admin</option>
                              </select>
                            </td>
                            <td>{u.dataCadastro || '—'}</td>
                            <td>{u.ultimaAlteracao || '—'}</td>
                            <td>{rowAction}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {modalOpen && (
        <AddUserModal
          onClose={() => setModalOpen(false)}
          onCreated={(msg) => { setModalOpen(false); showNotice(msg); loadUsers() }}
        />
      )}

      <style jsx>{`
        .u-shell { min-height: 100vh; background: var(--bg-primary); }
        .u-section-header { display: flex; align-items: center; justify-content: space-between; margin-top: 32px; margin-bottom: 14px; }
        .u-section-header .section-title { margin-top: 0; }

        .u-empty {
          color: var(--text-muted); font-size: 13px; padding: 20px;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-card);
          text-align: center; margin-bottom: 8px;
        }

        .u-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 8px;
          border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--bg-card); }
        .u-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
        .u-table th {
          text-align: left; color: var(--text-muted); font-weight: 600; font-size: 10.5px;
          letter-spacing: 0.05em; text-transform: uppercase; padding: 10px 14px;
          border-bottom: 1px solid var(--border); white-space: nowrap;
        }
        .u-table td { padding: 10px 14px; color: var(--text-primary); border-bottom: 1px solid var(--border); font-weight: 500; vertical-align: middle; }
        .u-table tr:last-child td { border-bottom: none; }
        .u-table tr:hover td { background: var(--bar-track); }
        .u-email { color: var(--text-secondary); font-weight: 400; }

        .u-status { display: inline-block; padding: 2px 9px; border-radius: 100px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .u-status-ativo { background: var(--green-bg); color: var(--green); }
        .u-status-pendente { background: var(--amber-bg); color: var(--amber); }
        .u-status-bloqueado { background: var(--red-bg); color: var(--red); }
        .u-status-negado { background: var(--bar-track); color: var(--text-muted); }
        .u-status-default { background: var(--bar-track); color: var(--text-muted); }

        .u-perfil-select { min-width: 110px; padding: 6px 10px; font-size: 12.5px; }

        .u-name-cell { display: inline-flex; align-items: center; gap: 6px; }
        .u-name-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
        .u-btn-edit {
          background: none; border: none; cursor: pointer; color: var(--text-muted);
          font-size: 13px; padding: 2px 4px; border-radius: 4px; line-height: 1;
          opacity: 0; transition: opacity 0.1s;
        }
        .u-table tr:hover .u-btn-edit { opacity: 1; }
        .u-btn-edit:hover { color: var(--accent); background: var(--bar-track); }

        .u-name-editor { display: flex; align-items: center; gap: 6px; }
        .u-name-input { flex: 1; min-width: 0; }

        .u-actions { display: flex; gap: 6px; flex-wrap: nowrap; }

        .u-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          border-radius: var(--radius-btn); border: 1px solid transparent; cursor: pointer;
          font-family: inherit; font-weight: 600; padding: 7px 13px; font-size: 12.5px;
          white-space: nowrap; text-decoration: none; transition: all 0.15s ease;
        }
        .u-btn:disabled { opacity: 0.45; cursor: default; }
        .u-btn-sm { padding: 5px 10px; font-size: 12px; }
        .u-btn-primary { background: var(--accent); color: #fff; }
        .u-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
        .u-btn-danger { background: var(--red-bg); color: var(--red); border-color: rgba(239,68,68,0.25); }
        .u-btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.18); }
        .u-btn-secondary { background: var(--bg-card); color: var(--text-secondary); border-color: var(--border-strong); }
        .u-btn-secondary:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
        .u-btn-ghost { background: transparent; color: var(--text-secondary); border-color: var(--border); }
        .u-btn-ghost:hover { color: var(--text-primary); background: var(--bar-track); }

        .u-notice {
          background: var(--green-bg); border: 1px solid rgba(16,185,129,0.25); color: var(--green);
          border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; font-weight: 500;
        }
        .u-dismiss { background: none; border: none; color: inherit; cursor: pointer; font-size: 16px; line-height: 1; opacity: 0.7; float: right; margin-left: 12px; }
        .u-dismiss:hover { opacity: 1; }

        @media (max-width: 768px) {
          .top-bar { flex-wrap: wrap; height: auto; padding: 10px 14px; gap: 8px; }
          .u-section-header { flex-wrap: wrap; gap: 10px; }
        }
      `}</style>
    </>
  )
}

function NameEditor({ initialValue, busy, onSave, onCancel }) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSave(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel() }
  }

  return (
    <form className="u-name-editor" onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        className="field-input u-name-input"
        value={value}
        maxLength={100}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button type="submit" className="u-btn u-btn-primary u-btn-sm" disabled={busy || !value.trim()}>
        {busy ? '…' : 'Salvar'}
      </button>
      <button type="button" className="u-btn u-btn-ghost u-btn-sm" disabled={busy} onClick={onCancel}>
        Cancelar
      </button>
    </form>
  )
}

function AddUserModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const submittingRef = useRef(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submittingRef.current) return // guarda contra duplo-clique/duplo-submit
    submittingRef.current = true
    setSubmitting(true)
    setModalError('')
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        setModalError(translateError(body?.error))
        return
      }
      onCreated(`${name.trim() || body.email} cadastrado com sucesso.`)
    } catch (err) {
      setModalError(translateError())
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return (
    <div className="m-overlay" onClick={onClose}>
      <div className="m-box" onClick={(e) => e.stopPropagation()}>
        <div className="m-title">Adicionar usuário</div>
        <p className="m-sub">Cria um acesso já com status Ativo e perfil Usuário. Alterações de perfil podem ser feitas depois, na lista.</p>
        <form onSubmit={handleSubmit}>
          <label className="m-label">Nome</label>
          <input className="field-input m-input" value={name} onChange={(e) => setName(e.target.value)} required disabled={submitting} autoFocus />
          <label className="m-label">Email</label>
          <input className="field-input m-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={submitting} />
          {modalError && (
            <div className="m-error" role="alert">{modalError}</div>
          )}
          <div className="m-buttons">
            <button type="button" className="u-btn u-btn-ghost" onClick={onClose} disabled={submitting}>Cancelar</button>
            <button type="submit" className="u-btn u-btn-primary" disabled={submitting}>{submitting ? 'Cadastrando…' : 'Cadastrar'}</button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .m-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex;
          align-items: center; justify-content: center; z-index: 300; padding: 16px;
          animation: fadeIn 0.15s ease;
        }
        .m-box {
          background: var(--bg-card); border: 1px solid var(--border-strong); border-radius: var(--radius-card);
          padding: 24px; width: 100%; max-width: 380px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .m-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .m-sub { font-size: 12.5px; color: var(--text-muted); line-height: 1.5; margin-bottom: 18px; }
        .m-label { display: block; font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .m-input { width: 100%; margin-bottom: 14px; box-sizing: border-box; }
        .m-error { background: var(--red-bg); color: var(--red); border-radius: 8px; padding: 10px 12px; font-size: 12.5px; margin-bottom: 12px; }
        .m-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
      `}</style>
    </div>
  )
}
