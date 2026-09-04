import { useEffect, useRef } from 'react'

// Analytics de acesso/tempo de uso — heartbeat leve enquanto o dashboard está visível.
//
// Definição de "tempo ativo" (documentada aqui e no PR): heartbeat a cada
// HEARTBEAT_INTERVAL_MS enquanto `document.visibilityState === 'visible'`. Cada heartbeat
// soma ao servidor, no máximo, o intervalo do heartbeat (o servidor recalcula e limita —
// ver lib/sheets-analytics.js:computeDelta — este arquivo nunca envia um "tempo" calculado
// no cliente, só um sinal de "ainda estou aqui"). Isso é uma APROXIMAÇÃO operacional, não
// uma medição exata de uso — não há evento de fim de sessão garantido em navegadores.
//
// Este hook nunca pode derrubar o dashboard: toda chamada de rede está em try/catch: uma
// falha (rede, 503, sessão de analytics perdida) apenas para de contar tempo
// silenciosamente, sem lançar exceção nem mostrar erro na tela.
const HEARTBEAT_INTERVAL_MS = 60_000

export function useAnalyticsSession(active) {
  const sessionIdRef = useRef(null)
  const intervalRef = useRef(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (!active) return
    // Evita disparar duas vezes (StrictMode/remounts) — só uma sessão/interval por ciclo
    // de vida real do componente.
    if (startedRef.current) return
    startedRef.current = true

    let cancelled = false

    const sendHeartbeat = async () => {
      if (document.visibilityState !== 'visible') return
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      try {
        const res = await fetch('/api/analytics/session/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        })
        if (!res.ok) {
          // Sessão perdida no servidor (aba/linha removida manualmente, etc.) — para de
          // tentar em vez de insistir indefinidamente. Simplicidade > auto-recuperação.
          if (res.status === 404 && intervalRef.current) {
            clearInterval(intervalRef.current)
            intervalRef.current = null
          }
        }
      } catch {
        // Falha de rede: silenciosa, próximo heartbeat tenta de novo naturalmente.
      }
    }

    const start = async () => {
      try {
        const res = await fetch('/api/analytics/session/start', { method: 'POST' })
        if (!res.ok || cancelled) return
        const json = await res.json()
        if (!json?.sessionId || cancelled) return
        sessionIdRef.current = json.sessionId
        // Um único interval — nunca mais de um (guardado por startedRef acima).
        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS)
      } catch {
        // Sem sessão de analytics iniciada, o hook simplesmente fica inerte — o dashboard
        // em si não é afetado.
      }
    }
    start()

    // Melhor esforço de encerramento — nunca a única forma de a sessão ser considerada
    // encerrada (ver lib/sheets-analytics.js). sendBeacon é fire-and-forget e funciona
    // mesmo durante o unload, ao contrário de um fetch() normal.
    const endBeacon = () => {
      const sessionId = sessionIdRef.current
      if (!sessionId) return
      try {
        const blob = new Blob([JSON.stringify({ sessionId })], { type: 'application/json' })
        navigator.sendBeacon('/api/analytics/session/end', blob)
      } catch {
        // sendBeacon indisponível/falhou — sem fallback aqui de propósito (ver nota acima:
        // o sistema não pode depender disso, a leitura admin já trata sessão sem heartbeat
        // recente como inativa).
      }
    }
    window.addEventListener('pagehide', endBeacon)
    window.addEventListener('beforeunload', endBeacon)

    return () => {
      cancelled = true
      if (intervalRef.current) clearInterval(intervalRef.current)
      window.removeEventListener('pagehide', endBeacon)
      window.removeEventListener('beforeunload', endBeacon)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}
