SHOWSTENCIL — DEFERRED UNTIL GO LIVE
=====================================
Last updated: Day 9

DOMAIN AND URLS
[ ] Buy showstencil.com on Namecheap (~$10-15/year)
[ ] Add showstencil.com to Vercel as custom domain
[ ] Update NEXTAUTH_URL to https://showstencil.com
[ ] Update NEXT_PUBLIC_APP_URL to https://showstencil.com
[ ] Update Google OAuth redirect URI to https://showstencil.com/api/auth/callback/google
[ ] Update Lemon Squeezy webhook URL to https://showstencil.com/api/webhooks/lemonsqueezy
[ ] Update RESEND_FROM_EMAIL to digest@showstencil.com
[ ] Verify showstencil.com domain in Resend dashboard
[ ] Delete nixlytics-u6k1.vercel.app alias from Vercel after custom domain is live

Thumbnail Feature — Deferred Improvements
1. No regeneration allowed
User gets one thumbnail per idea. No regenerate button. They use it or they don't. This is intentional to control Gemini API costs. If regeneration is added later, gate it behind a quota (e.g. 1 regeneration per idea max).
2. Download button opens image instead of downloading
Currently the download button opens the image in a new tab / full screen instead of saving to the user's local device. Fix: use an anchor tag with the download attribute or fetch the image as a blob and trigger a programmatic download. The file should save as showstencil-thumbnail-[idea-id].jpg to the user's Downloads folder.
3. Wrong aspect ratio — image is square, not YouTube thumbnail size
YouTube thumbnails must be 16:9 ratio (1280x720px). The current Gemini output is square (1:1). This means if a user puts it on YouTube it will be cropped or letterboxed. Fix: either prompt Gemini with explicit 1280x720 or 16:9 instructions, or post-process the image to crop/pad to 16:9 before showing it to the user. Until fixed, add a warning label under the thumbnail: "Note: resize to 1280×720 before uploading to YouTube."

PAYMENTS
[ ] Switch Lemon Squeezy from test mode to live mode
[ ] Complete any remaining Lemon Squeezy account verification
[ ] Do a real $1 test transaction with your own card to confirm payouts work
LEMON SQUEEZY
[ ] Wait for identity verification approval (1-3 business days)
[ ] After approval — activate store for live payments
[ ] After activation — update Email settings:
    Company name: ShowStencil
    Default sender name: ShowStencil
    Add Pune address for CAN-SPAM compliance
LEMON SQUEEZY — Before Go Live
[ ] Record a 3-5 minute demo video of the full product flow
[ ] Reply to Tanushree with website, demo video, pricing, social profiles
[ ] Wait for identity verification approval
[ ] Activate store after approval

MONITORING
[ ] Add Sentry.io for error monitoring (free tier)
[ ] Add UptimeRobot for uptime monitoring (free tier, pings every 5 minutes)

LEGAL
[ ] Generate Privacy Policy at termly.io (10 minutes)
[ ] Generate Terms of Service at termly.io (10 minutes)
[ ] Add Privacy Policy page to app at /privacy
[ ] Add Terms of Service page to app at /terms
[ ] Add links to both in the footer of every page
[ ] Add links to both in the Lemon Squeezy checkout

GOOGLE
[ ] Wait for Google OAuth verification approval (2-4 weeks)
[ ] Update Google Console app name to ShowStencil after approval
[ ] Update Google Console homepage URL to https://showstencil.com
[ ] Update Google Console privacy policy URL to https://showstencil.com/privacy
[ ] Update Google Console terms of service URL to https://showstencil.com/terms
[ ] Add showstencil.com to authorized domains in Branding page
[ ] Remove nixlytics-u6k1.vercel.app from authorized domains after domain is live
[ ] Remove nixlytics-u6k1.vercel.app from OAuth redirect URIs
[ ] Add https://showstencil.com/api/auth/callback/google to OAuth redirect URIs
[ ] Add 100 beta user emails to Google Console test users list before approval
[ ] Reply to YouTube API quota increase email confirming contact email is vedangk2912@gmail.com
[ ] Once quota approved — update YouTube API daily limit from 10K to 100K units

GEMINI BILLING — Before Go Live
[ ] Go to Google Cloud Console and add payment method to nixlytics project
[ ] Enable billing for Gemini API
[ ] Set a monthly spend cap of $5 as safety net
[ ] Test thumbnail generation end to end after billing is enabled
[ ] Verify generated thumbnail appears in ideas card and download works

VERCEL
[ ] Upgrade to Vercel Pro ($20/month) when revenue justifies it
[ ] Update trend detection cron from daily to every 6 hours after Pro upgrade

PERFORMANCE
[ ] Wrap digest + ideas generation in Promise.all for parallel execution
[ ] Confirm pipeline drops from ~54s to ~26s after parallelisation
[ ] Any page taking over 3 seconds — fix before public launch

SECURITY
[ ] Run: grep -r 'ANTHROPIC\|LEMONSQUEEZY\|SUPABASE' .next/ and confirm zero results
[ ] Add rate limiting to all API endpoints (max 60 requests per minute per user)
[ ] Add input validation and sanitisation on all user inputs
[ ] Confirm Supabase RLS — user A cannot see user B data
[ ] Add input sanitisation on all user inputs and YouTube URLs
[ ] Add /api/health endpoint
[ ] Add rate limiting — max 60 requests per minute per user
[ ] Add DB indexes on user_id columns across all tables
[ ] Add startup env validation
[ ] Set up Sentry error tracking

BUGS TO FIX
[ ] Pricing page redirect bug after browser back button
[ ] Pipeline timing warning (54s total — above 30s target)

BRANDING
[ ] Rename GitHub repo from nixlytics to showstencil
[ ] Update local git remote URL after GitHub rename
[ ] Rename Supabase project display name to ShowStencil (cosmetic only)
[ ] Delete old nixlytics-u6k1.vercel.app deployment URL alias

RESEND
[ ] Add showstencil.com as verified sending domain in Resend
[ ] Update from email across all templates to digest@showstencil.com
[ ] Update alerts from email to alerts@showstencil.com

BETA LAUNCH CHECKLIST
[ ] Manually add first 20-30 beta user emails to Google Console test users
[ ] Post in r/youtubers and r/NewTubers for beta users
[ ] Post in YouTube creator Discord servers
[ ] Personally onboard first 5 users via Zoom if possible
[ ] Send personal welcome message to every signup


DOMAIN — Before Go Live
[ ] Buy showstencil.com on BigRock (~₹1,130/year)
[ ] Follow the 8-step domain connection checklist above
[ ] Takes 30-40 minutes total
[ ] Do this on Day 18 before switching Lemon Squeezy to live mode

POST LAUNCH
[ ] Fix top issues from beta user feedback
[ ] Submit to ProductHunt (Week 5 — not on launch day)
[ ] Write IndieHackers launch story post
[ ] Screenshot first paying customer moment
=====================================