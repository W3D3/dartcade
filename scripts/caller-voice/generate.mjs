#!/usr/bin/env node
// Generates the "English (Adam)" built-in caller voice: one or more spoken clips per key in
// lines.json, synthesised once with Kokoro-82M (through kokoro-js) and encoded to small mono
// MP3s. Run this on a developer machine; the app only ships the resulting clips and manifest.
//
// Usage: node generate.mjs
// (ffmpeg is invoked as `nix shell nixpkgs#ffmpeg -c ffmpeg ...`; see README.md.)

import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { KokoroTTS } from 'kokoro-js'

const run = promisify(execFile)

const HERE = dirname(fileURLToPath(import.meta.url))
const VOICE_ID = 'en-adam'
const VOICE_NAME = 'English (Adam)'
const KOKORO_VOICE = 'am_adam'
const OUT_DIR = join(HERE, '..', '..', 'backend', 'frontend', 'public', 'voices', VOICE_ID)

/** Filenames for a key's variants: a single clip is "<key>.mp3"; several are "<key>-1.mp3", … */
function filenames(key, count) {
  return count === 1 ? [`${key}.mp3`] : Array.from({ length: count }, (_, i) => `${key}-${i + 1}.mp3`)
}

async function synthesize(tts, text, wavPath) {
  const audio = await tts.generate(text, { voice: KOKORO_VOICE })
  await audio.save(wavPath)
}

/**
 * Trims leading/trailing silence, normalises loudness, downmixes to mono and encodes to a
 * small MP3 — all in one ffmpeg pass, run through `nix shell` so it never needs a network
 * fetch once the derivation is in the Nix store.
 */
async function encode(wavPath, mp3Path) {
  const filter = [
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1:detection=peak',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1:detection=peak',
    'areverse',
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].join(',')
  await run('nix', [
    'shell',
    'nixpkgs#ffmpeg',
    '-c',
    'ffmpeg',
    '-y',
    '-i',
    wavPath,
    '-af',
    filter,
    '-ac',
    '1',
    '-ar',
    '22050',
    '-b:a',
    '48k',
    mp3Path,
  ])
}

async function main() {
  console.log(`Loading Kokoro-82M (voice ${KOKORO_VOICE})…`)
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' })

  const lines = JSON.parse(await readFile(join(HERE, 'lines.json'), 'utf8'))
  const tmp = await mkdtemp(join(tmpdir(), 'caller-voice-'))
  await mkdir(OUT_DIR, { recursive: true })

  const manifestClips = {}
  const keys = Object.keys(lines)
  let done = 0

  for (const key of keys) {
    const texts = lines[key]
    const names = filenames(key, texts.length)
    manifestClips[key] = names
    for (let i = 0; i < texts.length; i++) {
      const wavPath = join(tmp, `${key}-${i}.wav`)
      const mp3Path = join(OUT_DIR, names[i])
      await synthesize(tts, texts[i], wavPath)
      await encode(wavPath, mp3Path)
    }
    done++
    if (done % 20 === 0 || done === keys.length) console.log(`  ${done}/${keys.length} keys done`)
  }

  await rm(tmp, { recursive: true, force: true })

  const manifest = { id: VOICE_ID, name: VOICE_NAME, clips: manifestClips }
  await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

  let totalBytes = 0
  for (const names of Object.values(manifestClips)) {
    for (const name of names) totalBytes += (await stat(join(OUT_DIR, name))).size
  }
  console.log(`Wrote ${Object.values(manifestClips).flat().length} clips, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB total.`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
