import { getServerSession } from 'next-auth/next'
import { authOptions } from './auth/[...nextauth]'
import { getDebugInfo } from '../../lib/sheets'

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: 'Não autenticado' })

  try {
    const info = await getDebugInfo()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(info)
  } catch (err) {
    console.error('Debug API error:', err)
    res.status(500).json({ error: err.message })
  }
}
