import { db } from '../db/index.js'
import { seedSample } from './sample.js'

try {
  await seedSample(db, line => {
    console.log(line)
  })
} finally {
  await db.destroy()
}
