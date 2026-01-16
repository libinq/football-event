import dotenv from 'dotenv'
import express from 'express'
import multer from 'multer'
import fetch from 'node-fetch'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'
import { analyzeFrames, generateCartoon } from './services/openrouter.js'
import { sampleFrames, buildSummaryPoster, buildAnimatedCompare, mergeIntroAndOverlay } from './services/pipeline.js'
import { generateQRCode } from './services/qrcode.js'

dotenv.config()
ffmpeg.setFfmpegPath(ffmpegInstaller.path)
ffmpeg.setFfprobePath(ffprobeInstaller.path)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(express.json())

const storageRoot = path.join(__dirname, '..', 'storage')
const uploadsDir = path.join(storageRoot, 'uploads')
const outputsDir = path.join(storageRoot, 'outputs')
const publicDir = path.join(__dirname, '..', 'public')

for (const d of [storageRoot, uploadsDir, outputsDir, publicDir]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
}

app.use(express.static(publicDir))
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const id = uuidv4()
      const ext = path.extname(file.originalname || '.mp4') || '.mp4'
      cb(null, `${id}${ext}`)
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/api/result/:id', (req, res) => {
  const workId = req.params.id
  const workDir = path.join(outputsDir, workId)
  const analysisPath = path.join(workDir, 'analysis.json')
  if (!fs.existsSync(analysisPath)) return res.status(404).json({ error: 'not_found' })

  function getDateKey(iso) {
    if (!iso) return null
    return iso.slice(0, 10)
  }

  function buildDailyRanking(targetId, targetSpeed, targetDateKey) {
    if (!targetDateKey) return null
    const entries = []
    const dirs = fs.readdirSync(outputsDir, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const dirent of dirs) {
      const id = dirent.name
      const p = path.join(outputsDir, id, 'analysis.json')
      if (!fs.existsSync(p)) continue
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
        let createdAt = raw.created_at
        if (!createdAt) {
          const st = fs.statSync(p)
          createdAt = st.mtime.toISOString()
        }
        const key = getDateKey(createdAt)
        if (key !== targetDateKey) continue
        const speed = Number(raw?.analysis?.speed_kmh || 0)
        if (!Number.isFinite(speed) || speed <= 0) continue
        entries.push({ id, speed_kmh: speed })
      } catch {
      }
    }
    if (entries.length === 0) return null
    entries.sort((a, b) => b.speed_kmh - a.speed_kmh)
    const myIndex = entries.findIndex(e => e.id === targetId)
    const myRank = myIndex === -1 ? null : myIndex + 1
    const total = entries.length

    let baseList
    if (myRank && myRank <= 10) {
      baseList = entries.slice(0, 10)
    } else {
      baseList = entries.slice(0, 9)
      if (myIndex === -1 && Number.isFinite(targetSpeed) && targetSpeed > 0) {
        baseList.push({ id: targetId, speed_kmh: targetSpeed })
      } else if (myIndex >= 0 && !baseList.some(e => e.id === targetId)) {
        baseList.push(entries[myIndex])
      }
    }

    const top = baseList.map(item => {
      const idx = entries.findIndex(e => e.id === item.id)
      return {
        id: item.id,
        rank: idx === -1 ? null : idx + 1,
        speed_kmh: item.speed_kmh,
        is_you: item.id === targetId
      }
    })

    return {
      date: targetDateKey,
      total_today: total,
      my_speed_kmh: targetSpeed,
      my_rank: myRank,
      top
    }
  }

  try {
    const data = JSON.parse(fs.readFileSync(analysisPath, 'utf8'))
    const createdAt = data.created_at || fs.statSync(analysisPath).mtime.toISOString()
    const dateKey = getDateKey(createdAt)
    const mySpeed = Number(data?.analysis?.speed_kmh || 0)
    const rankings = buildDailyRanking(workId, mySpeed, dateKey)
    if (rankings) data.rankings = rankings
    if (!data.created_at) data.created_at = createdAt
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: 'read_failed' })
  }
})

app.post('/api/analyze', upload.single('video'), async (req, res) => {
  try {
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
    const cartoonModel = process.env.OPENROUTER_CARTOON_MODEL || 'openai/dall-e-3'
    const token = process.env.OPENROUTER_API_KEY || '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'
    const inputPath = req.file?.path
    if (!inputPath) return res.status(400).json({ error: 'no_video' })
    const workId = path.parse(req.file.filename).name
    const workDir = path.join(outputsDir, workId)
    if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true })
    const framesDir = path.join(workDir, 'frames')
    const posterPath = path.join(workDir, 'poster.png')
    const overlayPath = path.join(workDir, 'overlay.mp4')
    const outputVideoPath = path.join(workDir, 'output.mp4')
    console.log('start sampleFrames', { inputPath, framesDir })
    await sampleFrames(inputPath, framesDir)
    console.log('frames sampled')
    const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.png')).map(f => path.join(framesDir, f))
    if (frameFiles.length === 0) return res.status(500).json({ error: 'no_frames' })
    console.log('start analyzeFrames', frameFiles.length)
    const analysis = await analyzeFrames(frameFiles.slice(0, 12), { model, token })
    
    // Start cartoon generation in parallel with video processing
    let cartoonPromise = null;
    /* User requested to skip real-time generation and use default Messi avatars
    if (analysis.cartoon_prompt) {
      console.log('start generateCartoon async', cartoonModel)
      cartoonPromise = generateCartoon({
        prompt: analysis.cartoon_prompt,
        model: cartoonModel,
        token
      })
    }
    */
    
    const allComparisons = [
      { label: 'Usain Bolt', speed_kmh: 44 },
      { label: 'Pro Cyclist', speed_kmh: 50 },
      { label: 'Greyhound', speed_kmh: 70 },
      { label: 'Race Horse', speed_kmh: 88 },
      { label: 'Cheetah', speed_kmh: 120 },
      { label: 'Roberto Carlos Kick', speed_kmh: 137 },
      { label: 'Pro Tennis Serve', speed_kmh: 200 },
      { label: 'Peregrine Falcon', speed_kmh: 390 },
      { label: 'Sound', speed_kmh: 1235 }
    ]
    const randomComps = allComparisons.sort(() => 0.5 - Math.random()).slice(0, 4)
    analysis.comparisons = randomComps

    const compare = {
      sound_mps: 343,
      bullet_mps: 400,
      cheetah_mps: 29
    }
    console.log('start buildSummaryPoster', posterPath)
    await buildSummaryPoster({ analysis, compare, outPath: posterPath })
    console.log('start buildAnimatedCompare', overlayPath)
    await buildAnimatedCompare({ analysis, compare, outPath: overlayPath })
    console.log('start mergeIntroAndOverlay', outputVideoPath)
    await mergeIntroAndOverlay({ inputVideo: inputPath, introImage: posterPath, overlayVideo: overlayPath, outPath: outputVideoPath })
    const publicId = uuidv4()
    const publicVideoDir = path.join(publicDir, 'videos')
    if (!fs.existsSync(publicVideoDir)) fs.mkdirSync(publicVideoDir, { recursive: true })
    const publicVideoPath = path.join(publicVideoDir, `${publicId}.mp4`)
    fs.copyFileSync(outputVideoPath, publicVideoPath)
    const urlBase = process.env.PUBLIC_BASE_URL || 'http://localhost:3000'
    const videoUrl = `${urlBase}/videos/${publicId}.mp4`

    // Resolve cartoon generation and save
    /* User requested to skip real-time generation
    if (cartoonPromise) {
      try {
        console.log('waiting for cartoon generation...')
        const tempCartoonUrl = await cartoonPromise
        if (tempCartoonUrl) {
           console.log('cartoon generated, downloading...', tempCartoonUrl)
           const resp = await fetch(tempCartoonUrl)
           if (resp.ok) {
              const arrayBuffer = await resp.arrayBuffer()
              const buffer = Buffer.from(arrayBuffer)
              const publicCartoonDir = path.join(publicDir, 'cartoons')
              if (!fs.existsSync(publicCartoonDir)) fs.mkdirSync(publicCartoonDir, { recursive: true })
              const cartoonFilename = `${publicId}.png`
              const localPath = path.join(publicCartoonDir, cartoonFilename)
              fs.writeFileSync(localPath, buffer)
              
              analysis.cartoon_url = `${urlBase}/cartoons/${cartoonFilename}`
              console.log('cartoon saved to', localPath)
           }
        }
      } catch (e) {
        console.error('Error handling cartoon generation:', e)
      }
    }
    */

    const qrPath = path.join(workDir, 'qr.png')
    await generateQRCode(videoUrl, qrPath)
    const publicQrDir = path.join(publicDir, 'qrcodes')
    if (!fs.existsSync(publicQrDir)) fs.mkdirSync(publicQrDir, { recursive: true })
    const publicQrPath = path.join(publicQrDir, `${publicId}.png`)
    fs.copyFileSync(qrPath, publicQrPath)
    const qrUrl = `${urlBase}/qrcodes/${publicId}.png`

    const resultData = {
      id: workId,
      analysis,
      created_at: new Date().toISOString(),
      video_url: videoUrl,
      qr_image_path: qrPath,
      qr_url: qrUrl
    }
    
    fs.writeFileSync(path.join(workDir, 'analysis.json'), JSON.stringify(resultData, null, 2))

    res.json(resultData)
  } catch (e) {
    console.error('Analyze error', e)
    res.status(500).json({ error: 'processing_failed', message: String(e) })
  }
})

app.use('/videos', express.static(path.join(publicDir, 'videos')))

async function listenWithFallback(startPort, maxTries = 10) {
  return new Promise((resolve, reject) => {
    let port = Number(startPort) || 3000
    let tries = 0
    function tryListen() {
      const srv = app.listen(port, () => resolve(port))
      srv.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && tries < maxTries) {
          tries++
          port++
          tryListen()
        } else {
          reject(err)
        }
      })
    }
    tryListen()
  })
}

const base = process.env.PORT || 3000
listenWithFallback(base).then((port) => {
  const urlBase = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`
  console.log(`server listening on ${urlBase}`)
}).catch((err) => {
})
