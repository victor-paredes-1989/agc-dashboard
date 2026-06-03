import { getAllDashData } from '../../lib/sheets'

export default async function handler(req, res) {
  try {
    const data = await getAllDashData()

    // Durante a fase de ajustes, não cachear a API.
    // Isso faz o dashboard refletir a planilha mais rápido após atualizar dados/abas.
    res.setHeader('Cache-Control', 'no-store, max-age=0')

    res.status(200).json(data)
  } catch (err) {
    console.error('Sheets API error:', err)
    res.status(500).json({ error: err.message })
  }
}
