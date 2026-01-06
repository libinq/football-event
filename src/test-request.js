import fs from 'fs'
import fetch from 'node-fetch'
import FormData from 'form-data'

async function main() {
  const f = new FormData()
  f.append('video', fs.createReadStream('sample.mp4'))
  const bases = [
    process.env.API_BASE_URL,
    process.env.PUBLIC_BASE_URL,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002'
  ].filter(Boolean)
  let lastErr = null
  for (const base of bases) {
    try {
      const resp = await fetch(`${base}/api/analyze`, { method: 'POST', body: f })
      const text = await resp.text()
      console.log(text)
      return
    } catch (e) {
      lastErr = e
    }
  }
  console.log(JSON.stringify({ error: 'request_failed', message: String(lastErr || 'unknown') }))
}

main()
