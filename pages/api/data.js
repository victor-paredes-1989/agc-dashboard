import { getServerSession } from 'next-auth/next'
import { authOptions } from './auth/[...nextauth]'
import { getAllDashData } from '../../lib/sheets'

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: 'Não autenticado' })

  try {
    const force = req.query.force === '1'
    const data = await getAllDashData({ force })

    if (force) {
      res.setHeader('Cache-Control', 'no-store, max-age=0')
    } else {
      res.setHeader('Cache-Control', 's-maxage=1500, stale-while-revalidate=60')
    }

    res.status(200).json(data)
  } catch (err) {
    console.error('Sheets API error:', err)
    res.status(500).json({ error: err.message })
  }
}
