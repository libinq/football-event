import path from 'path'
import fs from 'fs'
import { sampleFrames, buildSummaryPoster, buildAnimatedCompare, mergeIntroAndOverlay } from './services/pipeline.js'

async function main() {
  const inputPath = path.resolve('sample.mp4')
  const workDir = path.resolve('tmp-test')
  const framesDir = path.join(workDir, 'frames')
  const posterPath = path.join(workDir, 'poster.png')
  const overlayPath = path.join(workDir, 'overlay.mp4')
  const outPath = path.join(workDir, 'out.mp4')
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true })
  await sampleFrames(inputPath, framesDir)
  const analysis = {
    speed_mps: 25,
    speed_kmh: 90,
    contact_force_N: 900,
    posture_score: 70,
    posture_notes: 'Default estimation',
    confidence: 0.3
  }
  const compare = { sound_mps: 343, bullet_mps: 400, cheetah_mps: 29 }
  await buildSummaryPoster({ analysis, compare, outPath: posterPath })
  await buildAnimatedCompare({ analysis, compare, outPath: overlayPath })
  await mergeIntroAndOverlay({ inputVideo: inputPath, introImage: posterPath, overlayVideo: overlayPath, outPath })
  console.log('done', { posterPath, overlayPath, outPath })
}

main().catch(e => {
  console.error('failed', e)
  process.exit(1)
})
