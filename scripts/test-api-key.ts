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
  } catch (err: any) {
    console.log('FAILED:', err.message)
    console.log('Status:', err.status)
    console.log('Error type:', err.constructor.name)
  }
}

test()
