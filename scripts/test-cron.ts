const CRON_SECRET = process.env.CRON_SECRET ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

const CRON_ROUTES = [
  '/api/cron/refresh-data',
  '/api/cron/weekly-digest',
  '/api/cron/trend-detection',
]

async function testCron(path: string) {
  console.log(`\nTesting ${path} ...`)
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const data = await res.json()
    console.log(`  Status: ${res.status}`)
    console.log(`  Response:`, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(`  ERROR:`, err)
  }
}

async function main() {
  if (!CRON_SECRET) {
    console.error('CRON_SECRET is not set — run with --env-file=.env.local')
    process.exit(1)
  }
  console.log(`App URL: ${APP_URL}`)
  console.log(`CRON_SECRET: ${CRON_SECRET.slice(0, 8)}...`)

  for (const route of CRON_ROUTES) {
    await testCron(route)
  }
}

export {}

main()
