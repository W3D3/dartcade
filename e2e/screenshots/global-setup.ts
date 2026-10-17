import { compose, reuse } from './compose.js'

// A fresh stack each run, with the preview seed (backend/src/seed): the same games, friends and lobby every time
export default async function setup() {
  if (reuse) {
    compose('up -d --wait')
    return
  }
  compose('down -v')
  compose('up -d --wait')
  compose('exec -T backend npx tsx src/seed/main.ts')
}
