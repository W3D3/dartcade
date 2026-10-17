import { compose, reuse } from './compose.js'

export default async function teardown() {
  if (!reuse) compose('down -v')
}
