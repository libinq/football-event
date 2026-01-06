import fetch from 'node-fetch'

export async function analyzeFrames(frames, { model, token }) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': token ? `Bearer ${token}` : ''
  }
  const images = await Promise.all(frames.map(async p => {
    const data = await import('fs').then(m => m.readFileSync(p))
    const base64 = data.toString('base64')
    return { type: 'input_image', image_url: `data:image/png;base64,${base64}` }
  }))
  const prompt = [
    { role: 'system', content: 'You are a football video analysis assistant. From multiple consecutive frames, identify the ball position and displacement per frame, estimate shot speed (m/s), estimate contact force at impact (N), and assess whether the shooting posture is standard, returning a 0–100 score with notes. Assume ball mass 0.45 kg, contact time 0.012 s, ball diameter 0.22 m for pixel calibration. Return JSON only, no explanation.' },
    { role: 'user', content: [
      { type: 'text', text: 'These are consecutive frames extracted from a video. Analyze and return JSON with schema: {"schema":{"speed_mps":number,"speed_kmh":number,"contact_force_N":number,"posture_score":number,"posture_notes":string,"confidence":number}}' },
      ...images
    ] }
  ]
  const body = {
    model,
    messages: prompt,
    temperature: 0.2
  }
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      return {
        speed_mps: 25,
        speed_kmh: 90,
        contact_force_N: 900,
        posture_score: 70,
        posture_notes: 'Default estimation',
        confidence: 0.3
      }
    }
    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content || ''
    try {
      const parsed = JSON.parse(content)
      return parsed
    } catch {
      return {
        speed_mps: 25,
        speed_kmh: 90,
        contact_force_N: 900,
        posture_score: 70,
        posture_notes: 'Default estimation',
        confidence: 0.3
      }
    }
  } catch {
    return {
      speed_mps: 25,
      speed_kmh: 90,
      contact_force_N: 900,
      posture_score: 70,
      posture_notes: 'Default estimation',
      confidence: 0.3
    }
  }
}
