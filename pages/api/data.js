import { getAllDashData } from '../../lib/sheets'

export default async function handler(req, res) {
  try {
    const force = req.query.force === '1'
    const data = await getAllDashData({ force })

    // Cache 25 min no CDN, servir stale durante revalidação.
    // Com ?force=1, sem cache para forçar nova busca imediata.
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
