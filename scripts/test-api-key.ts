import { config } from 'dotenv'
config({ path: '.env.local', override: true })

import Anthropic from '@anthropic-ai/sdk'

const key = process.env.ANTHROPIC_API_KEY
console.log('Key prefix:', key?.substring(0, 20))
console.log('Key length:', key?.length)
console.log('Key loaded:', !!key)

const client = new Anthropic({ apiKey: key })

async function test() {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hi' }]
    })
    console.log('SUCCESS:', response.content[0])
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = (err as { status?: number }).status
    const errorType = err instanceof Error ? err.constructor.name : typeof err
    console.log('FAILED:', message)
    console.log('Status:', status)
    console.log('Error type:', errorType)
  }
}

test()
