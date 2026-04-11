import { execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations() {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma')
  // Search for the prisma binary from the app root outward — works in both
  // Docker (/app/node_modules/.bin/prisma) and dev (workspace root node_modules)
  const candidates = [
    path.resolve(__dirname, '../../../node_modules/.bin/prisma'),   // Docker: /app
    path.resolve(__dirname, '../../../../node_modules/.bin/prisma'), // dev: workspace root
  ]
  const prismaBin = candidates.find((p) => fs.existsSync(p)) ?? 'prisma'
  const env = { ...process.env }
  try {
    execSync(`"${prismaBin}" migrate deploy --schema="${schemaPath}"`, {
      stdio: 'inherit',
      env,
    })
  } catch {
    execSync(`"${prismaBin}" db push --schema="${schemaPath}" --accept-data-loss`, {
      stdio: 'inherit',
      env,
    })
  }
}
