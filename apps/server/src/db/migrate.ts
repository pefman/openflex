import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function runMigrations() {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma')
  // Use local prisma binary directly to avoid npx invoking npm (which emits
  // warnings about pnpm-specific .npmrc keys npm doesn't recognise)
  const prismaBin = path.resolve(__dirname, '../../../../node_modules/.bin/prisma')
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
