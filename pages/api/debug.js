import { getDebugForecastData } from '../../lib/sheets'

export default async function handler(req, res) {
  try {
    const data = await getDebugForecastData()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json(data)
  } catch (err) {
    console.error('Debug Forecast API error:', err)
    res.status(500).json({ error: err.message })
  }
}
