# Football Event — Shot Analysis Pipeline

An end-to-end backend service that analyzes football shot videos, generates a summary poster and animated speed comparison, overlays them onto the original footage, stores the processed outputs, and returns a shareable video URL with a QR code. Includes a minimal web UI for uploading videos and viewing results.

## Features
- Video upload API and simple web UI
- Frame sampling with ffmpeg
- Multi-frame analysis via OpenRouter (LLM), with safe fallback defaults
- Summary poster generation (SVG + sharp)
- Animated speed comparison overlay (SVG per frame + ffmpeg)
- Final video composition: intro poster + original video with overlay
- Persist outputs and expose public video URL
- Generate QR code image that links to the final video
- Automatic port fallback when 3000 is in use

## Demo
- Web UI: open http://localhost:3001/
- Upload a .mp4 video and view:
  - Analysis results (speed, force, posture score/notes, confidence)
  - Final video link
  - QR code image link

## Requirements
- Node.js (>= 18 recommended)
- ffmpeg and ffprobe are provided via npm: @ffmpeg-installer/ffmpeg and @ffprobe-installer/ffprobe

## Install
```bash
npm install
```

## Environment Variables
- OPENROUTER_API_KEY: your OpenRouter token (optional; enables real model analysis)
- OPENROUTER_MODEL: model name, default: openai/gpt-4.1-mini
- PUBLIC_BASE_URL: public base URL used in returned links and QR codes; e.g. http://localhost:3001
- PORT: preferred port to listen on (falls back to next port if occupied)

Windows PowerShell example:
```powershell
$env:OPENROUTER_API_KEY="your_token"
$env:OPENROUTER_MODEL="openai/gpt-4.1-mini"
$env:PUBLIC_BASE_URL="http://localhost:3001"
$env:PORT="3001"
```

## Run
```bash
npm start
```
- The server will try PORT or fallback: 3000 → 3001 → 3002, etc.
- Health: GET /health
- Static site: serves files in /public (home page at /)
- Videos: GET /videos/<id>.mp4

## API
- POST /api/analyze
  - Multipart form field: video (binary .mp4)
  - Response JSON:
    - id: work ID
    - analysis: { speed_mps, speed_kmh, contact_force_N, posture_score, posture_notes, confidence }
    - video_url: public URL of the final composed video
    - qr_image_path: local path to the QR image
    - qr_url: public URL to the QR image

Example using curl.exe on Windows:
```powershell
curl.exe -F "video=@C:\path\to\shot.mp4" http://localhost:3001/api/analyze
```

## Processing Pipeline
- Frame sampling: ffmpeg extracts frames from the input video
- Analysis: sends up to 12 frames to OpenRouter to estimate speed/force/posture, with safe defaults if the call fails
- Poster: generates a summary poster (SVG rendered via sharp)
- Animated overlay: generates an animated speed comparison as a short overlay video
- Composition: merges intro poster and overlaid original video into the final output
- Publication: copies the final video to public/videos and QR to public/qrcodes

## Project Structure
- src/server.js — Express server, upload API, pipeline orchestration, static serving
- src/services/pipeline.js — ffmpeg/sharp pipeline for frames, poster, overlay, and final merge
- src/services/openrouter.js — OpenRouter integration and fallback analysis
- src/services/qrcode.js — QR code generation
- public/index.html — minimal web UI to upload and view results
- src/local-test.js — local pipeline test (no network calls)
- src/test-request.js — local request to the API using sample.mp4

## Development Scripts
- Local end-to-end test:
  ```bash
  node src/test-request.js
  ```
- Local pipeline test:
  ```bash
  node src/local-test.js
  ```

## Troubleshooting
- Port in use (EADDRINUSE): server automatically falls back to the next port. You can set PORT and update PUBLIC_BASE_URL to match.
- No frames extracted: ensure the input is a playable .mp4; check that ffmpeg works.
- No OpenRouter token: the pipeline still runs with default estimates and returns usable outputs.

## Security
- Do not commit secrets (e.g., OPENROUTER_API_KEY). Use environment variables.
- .gitignore excludes generated media, storage directories, and env files.

