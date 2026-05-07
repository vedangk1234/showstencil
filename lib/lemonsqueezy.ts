import { lemonSqueezySetup, createCheckout } from '@lemonsqueezy/lemonsqueezy.js'

lemonSqueezySetup({ apiKey: process.env.LEMONSQUEEZY_API_KEY! })

export async function createCheckoutSession(
  userId: string,
  variantId: string,
  userEmail: string
): Promise<string> {
  const response = await createCheckout(
    process.env.LEMONSQUEEZY_STORE_ID!,
    variantId,
    {
      checkoutOptions: { embed: false },
      checkoutData: {
        email: userEmail,
        custom: { user_id: userId },
      },
      productOptions: {
        redirectUrl: 'https://showstencil.com/dashboard?upgrade=success',
        receiptLinkUrl: 'https://showstencil.com/dashboard',
        enabledVariants: [Number(variantId)],
      },
    }
  )

  if (response.error) {
    throw new Error(`Lemon Squeezy error: ${response.error.message}`)
  }

  const url = response.data?.data?.attributes?.url
  if (!url) {
    throw new Error('No checkout URL returned from Lemon Squeezy')
  }

  return url
}

export function getVariantId(plan: 'starter' | 'pro'): string {
  if (plan === 'starter') {
    return process.env.LEMONSQUEEZY_STARTER_VARIANT_ID!
  }
  return process.env.LEMONSQUEEZY_PRO_VARIANT_ID!
}
