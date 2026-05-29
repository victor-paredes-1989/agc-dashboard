import { getAllDashData, getDebugForecastData } from '../../lib/sheets'

export default async function handler(req, res) {
  try {
    const forecast = await getDebugForecastData()
    const allData = await getAllDashData()
    res.setHeader('Cache-Control', 'no-store')
    res.status(200).json({
      forecast,
      reunioesGeral: {
        totalRegistros: allData?.GERAL?.length || 0,
        primeirosRegistros: (allData?.GERAL || []).slice(0, 5),
      },
    })
  } catch (err) {
    console.error('Debug API error:', err)
    res.status(500).json({ error: err.message })
  }
}
