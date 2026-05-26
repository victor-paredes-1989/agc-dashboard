import { getAllDashData } from '../../lib/sheets'

export default async function handler(req, res) {
  try {
    const data = await getAllDashData()
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')
    res.status(200).json(data)
  } catch (err) {
    console.error('Sheets API error:', err)
    res.status(500).json({ error: err.message })
  }
}
