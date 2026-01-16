import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prompts = [
  '3D Pixar-style cartoon of Lionel Messi in FC Barcelona jersey, kicking a football in a crowded stadium, dynamic angle, bright colors, highly detailed, cute style',
  '3D Pixar-style cartoon of Lionel Messi in Argentina jersey, celebrating a goal, running with arms wide open, stadium background, cute style',
  '3D Pixar-style cartoon of Lionel Messi dribbling a football, close up action shot, intense focus, dynamic lighting, stadium background, cute style',
  '3D Pixar-style cartoon of Lionel Messi taking a free kick, focused expression, stadium lights, detailed grass, cute style'
];

async function main() {
  const outputDir = path.join(__dirname, 'public', 'avatars');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Starting batch generation of Messi avatars via Pollinations...');

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`Generating image ${i + 1}/${prompts.length}: ${prompt}`);
    
    try {
      const seed = Math.floor(Math.random() * 10000);
      const encodedPrompt = encodeURIComponent(prompt);
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&seed=${seed}&nologo=true&model=flux`;
      
      console.log(`  Downloading from: ${url}`);
      const resp = await fetch(url);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const filename = `messi_${i + 1}.png`;
        const filepath = path.join(outputDir, filename);
        fs.writeFileSync(filepath, Buffer.from(buffer));
        console.log(`  Saved to ${filepath}`);
      } else {
        console.error('  Failed to download image');
      }
    } catch (e) {
      console.error('  Error:', e);
    }
    
    // small delay
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log('Done!');
}

main();
