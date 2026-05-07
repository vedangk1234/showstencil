'use client'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import './landing.css'

export default function LandingPage() {
  const { data: session } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) {
      router.push('/dashboard')
    }
  }, [session, router])

  useEffect(() => {
    // ── reveal on scroll ───────────────────────────────────────
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) (e.target as HTMLElement).classList.add('in') })
    }, { threshold: 0.15 })
    document.querySelectorAll('.reveal').forEach(el => io.observe(el))

    // ── number ticker (counts up to data-count when in view) ───
    function animateCount(el: HTMLElement) {
      if ((el as HTMLElement & { __ticked?: boolean }).__ticked) return;
      (el as HTMLElement & { __ticked?: boolean }).__ticked = true
      const target = parseFloat(el.dataset.count!)
      const prefix = el.dataset.prefix || ''
      const suffix = el.dataset.suffix || ''
      const dur = 1600
      const t0 = performance.now()
      function frame(t: number){
        const p = Math.min(1, (t - t0)/dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const v = Math.round(target * eased)
        el.textContent = prefix + v.toLocaleString() + suffix
        if (p < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }
    function animateTick(el: HTMLElement) {
      if ((el as HTMLElement & { __ticked?: boolean }).__ticked) return;
      (el as HTMLElement & { __ticked?: boolean }).__ticked = true
      const target = parseFloat(el.dataset.tick!)
      const prefix = el.dataset.prefix || ''
      const dur = 1400
      const t0 = performance.now()
      function frame(t: number){
        const p = Math.min(1, (t - t0)/dur)
        const eased = 1 - Math.pow(1 - p, 3)
        const v = Math.round(target * eased)
        el.textContent = prefix + v.toLocaleString()
        if (p < 1) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }
    const tickIO = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        if (el.dataset.count) animateCount(el)
        if (el.dataset.tick)  animateTick(el)
      })
    }, { threshold: 0.5 })
    document.querySelectorAll('[data-count],[data-tick]').forEach(el => tickIO.observe(el))

    // ── time-of-day engine (Eastern Time) ────────────────────────
    const sunEl = document.getElementById('sun')
    const moonEl = document.getElementById('moon')
    const starsEl = document.getElementById('stars')
    const shootEl = document.getElementById('shoot')
    const heroEl = document.querySelector('.hero') as HTMLElement | null
    if (!sunEl || !heroEl) return

    // Generate ~40 stars once
    const starCount = 42
    let starHTML = ''
    for (let i = 0; i < starCount; i++){
      const x = Math.random() * 100
      const y = Math.random() * 55
      const tw = (2 + Math.random() * 4).toFixed(1)
      const bright = Math.random() < 0.25 ? ' bright' : ''
      const delay = (Math.random() * 4).toFixed(1)
      starHTML += `<div class="star${bright}" style="left:${x.toFixed(2)}%; top:${y.toFixed(2)}%; --tw:${tw}s; animation-delay:-${delay}s"></div>`
    }
    if (starsEl) starsEl.innerHTML = starHTML

    function etHours(){
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
      const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]))
      let h = parseInt(parts.hour, 10)
      if (h === 24) h = 0
      const m = parseInt(parts.minute, 10)
      const s = parseInt(parts.second, 10)
      return h + m/60 + s/3600
    }

    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
    const smooth = (t: number) => t * t * (3 - 2 * t)

    function mixHex(a: string, b: string, t: number){
      const pa = [parseInt(a.slice(1,3),16), parseInt(a.slice(3,5),16), parseInt(a.slice(5,7),16)]
      const pb = [parseInt(b.slice(1,3),16), parseInt(b.slice(3,5),16), parseInt(b.slice(5,7),16)]
      const r = Math.round(lerp(pa[0], pb[0], t))
      const g = Math.round(lerp(pa[1], pb[1], t))
      const bl = Math.round(lerp(pa[2], pb[2], t))
      return `rgb(${r},${g},${bl})`
    }

    function palette(h: number){
      const dayT = clamp((h - 6) / 12, 0, 1)
      const sunX = lerp(8, 92, dayT)
      const arc = 4 * (dayT - 0.5) * (dayT - 0.5)
      const sunY = lerp(15, 75, arc)

      const isSunVisible = h >= 5.5 && h < 20.5

      let sunColor = '#FFE4B0', sunGlow = '0 0 80px 30px rgba(255,228,176,0.5)'
      if (isSunVisible){
        if (h < 7) {
          const t = (h - 5.5) / 1.5
          sunColor = mixHex('#FF5E3A', '#FFB066', t)
          sunGlow = `0 0 100px 40px rgba(255,120,80,${0.45 + t*0.15})`
        } else if (h < 10) {
          const t = (h - 7) / 3
          sunColor = mixHex('#FFB066', '#FFE0A8', t)
          sunGlow = `0 0 90px 35px rgba(255,224,168,${0.5 + t*0.1})`
        } else if (h < 15) {
          sunColor = '#FFF4D6'
          sunGlow = '0 0 110px 45px rgba(255,244,214,0.65)'
        } else if (h < 18) {
          const t = (h - 15) / 3
          sunColor = mixHex('#FFF4D6', '#FFB066', t)
          sunGlow = `0 0 95px 40px rgba(255,176,102,${0.55 + t*0.15})`
        } else {
          const t = clamp((h - 18) / 2.5, 0, 1)
          sunColor = mixHex('#FFB066', '#E83A5C', t)
          sunGlow = `0 0 110px 50px rgba(232,58,92,${0.5 + t*0.2})`
        }
      }

      let skyTint = 'transparent'
      let skyWarm = 'transparent'
      let skyWarmOp = 0
      let sceneFilter = 'none'

      if (h < 5){
        skyTint = 'linear-gradient(to bottom, #1a1f3d 0%, #2a2348 40%, #3a3050 100%)'
        sceneFilter = 'brightness(0.45) saturate(0.7) hue-rotate(-10deg)'
      } else if (h < 6){
        const t = smooth((h - 5) / 1)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#1a1f3d', '#FF8E72', t)} 0%,
          ${mixHex('#2a2348', '#FFB89C', t)} 60%,
          ${mixHex('#3a3050', '#FFD0B0', t)} 100%)`
        sceneFilter = `brightness(${lerp(0.45, 0.85, t)}) saturate(${lerp(0.7, 0.95, t)})`
      } else if (h < 8){
        const t = smooth((h - 6) / 2)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#FF8E72', '#FFD8B0', t)} 0%,
          ${mixHex('#FFB89C', '#FFE8D0', t)} 60%,
          ${mixHex('#FFD0B0', '#FFFFFF', t)} 100%)`
        skyWarm = 'radial-gradient(ellipse at 15% 70%, rgba(255,140,80,0.45), transparent 60%)'
        skyWarmOp = lerp(0.9, 0.3, t)
        sceneFilter = `brightness(${lerp(0.85, 1.0, t)}) saturate(1.05)`
      } else if (h < 11){
        const t = smooth((h - 8) / 3)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#FFD8B0', '#FFFFFF', t)} 0%,
          ${mixHex('#FFE8D0', '#FFFFFF', t)} 100%)`
        skyWarmOp = 0
        sceneFilter = 'brightness(1.0) saturate(1.0)'
      } else if (h < 15){
        skyTint = 'transparent'
        sceneFilter = 'brightness(1.0) saturate(1.0)'
      } else if (h < 17.5){
        const t = smooth((h - 15) / 2.5)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#FFFFFF', '#FFD49C', t)} 0%,
          ${mixHex('#FFFFFF', '#FFE8B8', t)} 100%)`
        skyWarm = 'radial-gradient(ellipse at 85% 60%, rgba(255,180,90,0.45), transparent 60%)'
        skyWarmOp = lerp(0, 0.6, t)
        sceneFilter = `brightness(${lerp(1.0, 0.95, t)}) saturate(${lerp(1.0, 1.1, t)})`
      } else if (h < 19.5){
        const t = smooth((h - 17.5) / 2)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#FFD49C', '#9C4A8F', t)} 0%,
          ${mixHex('#FFE8B8', '#FF7A5E', t)} 50%,
          ${mixHex('#FFFFFF', '#FFB089', t)} 100%)`
        skyWarm = 'radial-gradient(ellipse at 88% 55%, rgba(255,90,60,0.55), transparent 60%)'
        skyWarmOp = lerp(0.6, 0.95, t)
        sceneFilter = `brightness(${lerp(0.95, 0.7, t)}) saturate(${lerp(1.1, 1.15, t)}) hue-rotate(${lerp(0, -8, t)}deg)`
      } else if (h < 20.5){
        const t = smooth((h - 19.5) / 1)
        skyTint = `linear-gradient(to bottom,
          ${mixHex('#9C4A8F', '#1a1f3d', t)} 0%,
          ${mixHex('#FF7A5E', '#2a2348', t)} 50%,
          ${mixHex('#FFB089', '#3a3050', t)} 100%)`
        skyWarmOp = lerp(0.95, 0, t)
        sceneFilter = `brightness(${lerp(0.7, 0.45, t)}) saturate(${lerp(1.15, 0.7, t)}) hue-rotate(-10deg)`
      } else {
        skyTint = 'linear-gradient(to bottom, #1a1f3d 0%, #2a2348 40%, #3a3050 100%)'
        sceneFilter = 'brightness(0.45) saturate(0.7) hue-rotate(-10deg)'
      }

      let sunOp = 0, moonOp = 0
      if (h >= 5.0 && h < 5.8) sunOp = smooth((h - 5.0) / 0.8) * 0.6
      else if (h >= 5.8 && h < 19.7) sunOp = 1
      else if (h >= 19.7 && h < 20.5) sunOp = 1 - smooth((h - 19.7) / 0.8)

      if (h >= 19.5 && h < 20.3) moonOp = smooth((h - 19.5) / 0.8)
      else if (h >= 20.3 || h < 5.5) moonOp = 1
      else if (h >= 5.5 && h < 6.3) moonOp = 1 - smooth((h - 5.5) / 0.8)

      let moonH = h
      if (moonH < 7) moonH += 24
      const moonT = clamp((moonH - 19) / 12, 0, 1)
      const moonX = lerp(8, 92, moonT)
      const moonArc = 4 * (moonT - 0.5) * (moonT - 0.5)
      const moonY = lerp(15, 75, moonArc)

      let starsOp = 0
      if (h >= 19 && h < 20.5) starsOp = smooth((h - 19) / 1.5)
      else if (h >= 20.5 || h < 5) starsOp = 1
      else if (h >= 5 && h < 6.5) starsOp = 1 - smooth((h - 5) / 1.5)

      let winOp = 0
      if (h >= 17.5 && h < 19.5) winOp = smooth((h - 17.5) / 2) * 0.7
      else if (h >= 19.5 || h < 5.5) winOp = 0.95
      else if (h >= 5.5 && h < 7) winOp = 1 - smooth((h - 5.5) / 1.5)
      if (h >= 7 && h < 17.5) winOp = 0

      let cloudColor = 'rgba(255,255,255,0.85)'
      if (h < 6 || h >= 20.5) cloudColor = 'rgba(180,180,210,0.4)'
      else if (h < 7.5) cloudColor = 'rgba(255,200,160,0.85)'
      else if (h >= 18 && h < 20) cloudColor = 'rgba(255,160,140,0.85)'

      return {
        sunX, sunY, sunColor, sunGlow, sunOp,
        moonX, moonY, moonOp,
        skyTint, skyWarm, skyWarmOp,
        sceneFilter, starsOp, winOp, cloudColor
      }
    }

    function applyPalette(){
      const h = etHours()
      const p = palette(h)

      sunEl!.style.setProperty('--sun-x', p.sunX + '%')
      sunEl!.style.setProperty('--sun-y', p.sunY + '%')
      sunEl!.style.setProperty('--sun-color', p.sunColor)
      sunEl!.style.setProperty('--sun-glow', p.sunGlow)
      sunEl!.style.setProperty('--sun-opacity', String(p.sunOp))

      moonEl!.style.setProperty('--moon-x', p.moonX + '%')
      moonEl!.style.setProperty('--moon-y', p.moonY + '%')
      moonEl!.style.setProperty('--moon-opacity', String(p.moonOp))

      heroEl!.style.setProperty('--sky-tint', p.skyTint)
      heroEl!.style.setProperty('--sky-warm', p.skyWarm)
      heroEl!.style.setProperty('--sky-warm-opacity', String(p.skyWarmOp))
      heroEl!.style.setProperty('--scene-filter', p.sceneFilter)
      heroEl!.style.setProperty('--stars-opacity', String(p.starsOp))
      heroEl!.style.setProperty('--win-opacity', String(p.winOp))
      heroEl!.style.setProperty('--cloud-color', p.cloudColor)
    }

    applyPalette()
    const liveTick = setInterval(applyPalette, 60 * 1000)

    // shooting star: every 35-90s during night
    let shootTimeout: ReturnType<typeof setTimeout>
    function maybeShoot(){
      const h = etHours()
      const isNight = h < 5.5 || h >= 20
      if (isNight && shootEl){
        const top = (8 + Math.random() * 30).toFixed(1)
        shootEl.style.top = top + '%'
        shootEl.animate([
          { transform: 'translateX(0) rotate(20deg)', opacity: '0' },
          { transform: 'translateX(40vw) rotate(20deg)', opacity: '1', offset: 0.3 },
          { transform: 'translateX(120vw) rotate(20deg)', opacity: '0' }
        ], { duration: 1200, easing: 'ease-out' })
      }
      const next = 30000 + Math.random() * 60000
      shootTimeout = setTimeout(maybeShoot, next)
    }
    shootTimeout = setTimeout(maybeShoot, 8000)

    return () => {
      clearInterval(liveTick)
      clearTimeout(shootTimeout)
      io.disconnect()
      tickIO.disconnect()
    }
  }, [])

  return (
    <>
      {/* ============ NAV ============ */}
      <nav className="top">
        <Link href="/" style={{ textDecoration: 'none', cursor: 'pointer' }}>
          <span style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            <span style={{ color: '#FFFFFF' }}>SHOW</span>
            <span style={{ color: '#737373' }}>STENCIL</span>
            <span style={{ color: '#FFFFFF' }}>.</span>
          </span>
        </Link>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="#how">How it works</a>
        </div>
        <div className="nav-right">
          <a href="/api/auth/signin" className="btn">Sign in</a>
          <a href="/api/auth/signin?callbackUrl=/dashboard" className="btn primary">Connect YouTube</a>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section className="hero">
        <div className="nagai" aria-hidden="true"></div>
        <div className="sky-tint" aria-hidden="true"></div>
        <div className="sky-warm" aria-hidden="true"></div>

        <div className="stars" id="stars" aria-hidden="true"></div>
        <div className="shoot" id="shoot" aria-hidden="true"></div>

        <div className="sky-bodies" aria-hidden="true">
          <div className="sun" id="sun"></div>
          <div className="moon" id="moon"></div>
        </div>

        <div className="clouds" aria-hidden="true">
          <div className="cloud" style={{"--cd":"140s","--cdl":"-20s","top":"18%","width":"120px"} as React.CSSProperties}></div>
          <div className="cloud" style={{"--cd":"180s","--cdl":"-90s","top":"11%","width":"90px","opacity":"0.7"} as React.CSSProperties}></div>
          <div className="cloud" style={{"--cd":"220s","--cdl":"-150s","top":"26%","width":"160px","opacity":"0.85"} as React.CSSProperties}></div>
          <div className="cloud" style={{"--cd":"260s","--cdl":"-200s","top":"8%","width":"70px","opacity":"0.6"} as React.CSSProperties}></div>
        </div>

        <div className="windows" id="windows" aria-hidden="true">
          <div className="win" style={{"left":"71.5%","top":"73.5%","width":"14px","height":"10px","--wf":"6s"} as React.CSSProperties}></div>
          <div className="win" style={{"left":"75.2%","top":"73.5%","width":"14px","height":"10px","--wf":"7s"} as React.CSSProperties}></div>
          <div className="win" style={{"left":"79.0%","top":"73.0%","width":"18px","height":"12px","--wf":"5.5s"} as React.CSSProperties}></div>
          <div className="win" style={{"left":"84.5%","top":"75.0%","width":"16px","height":"14px","--wf":"8s"} as React.CSSProperties}></div>
          <div className="win" style={{"left":"89.5%","top":"75.5%","width":"18px","height":"14px","--wf":"6.5s"} as React.CSSProperties}></div>
          <div className="win" style={{"left":"93.5%","top":"76.5%","width":"14px","height":"12px","--wf":"5s"} as React.CSSProperties}></div>
        </div>

        <div style={{display:'none'}}>
          <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
            <defs>
              <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2B2D6B"/>
                <stop offset="20%" stopColor="#5E5BA8"/>
                <stop offset="50%" stopColor="#B57BC4"/>
                <stop offset="78%" stopColor="#F58CA8"/>
                <stop offset="100%" stopColor="#FFB089"/>
              </linearGradient>
              <linearGradient id="pool" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#7FD8E8"/>
                <stop offset="100%" stopColor="#2A8FA8"/>
              </linearGradient>
              <linearGradient id="poolShine" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#fff" stopOpacity="0"/>
                <stop offset="50%" stopColor="#fff" stopOpacity="0.4"/>
                <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
              </linearGradient>
              <linearGradient id="arch" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#F4E1C7"/>
                <stop offset="100%" stopColor="#E5C8A8"/>
              </linearGradient>
              <linearGradient id="archShadow" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#C49874"/>
                <stop offset="100%" stopColor="#E5C8A8"/>
              </linearGradient>
              <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#FFE4B0" stopOpacity="0.9"/>
                <stop offset="100%" stopColor="#FFE4B0" stopOpacity="0"/>
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="1440" height="600" fill="url(#sky)"/>
            <circle cx="980" cy="440" r="160" fill="url(#sunGlow)"/>
            <circle cx="980" cy="440" r="55" fill="#FFE4B0" opacity="0.95"/>
            <g className="cloud-1" opacity="0.7">
              <ellipse cx="200" cy="180" rx="80" ry="10" fill="#FFE4D0"/>
              <ellipse cx="240" cy="190" rx="50" ry="6" fill="#FFD8B8"/>
            </g>
            <g className="cloud-2" opacity="0.5">
              <ellipse cx="600" cy="120" rx="100" ry="8" fill="#FFE4D0"/>
              <ellipse cx="680" cy="130" rx="60" ry="5" fill="#FFD8B8"/>
            </g>
            <path d="M0 480 L 180 380 L 360 440 L 540 360 L 720 420 L 900 370 L 1100 430 L 1280 380 L 1440 420 L 1440 600 L 0 600 Z" fill="#5E5BA8" opacity="0.6"/>
            <path d="M0 520 L 220 460 L 440 500 L 660 440 L 880 490 L 1100 450 L 1320 490 L 1440 460 L 1440 600 L 0 600 Z" fill="#3D3F7C" opacity="0.7"/>
            <g>
              <rect x="80" y="350" width="240" height="240" fill="url(#arch)"/>
              <rect x="80" y="350" width="40" height="240" fill="url(#archShadow)"/>
              <rect x="76" y="346" width="248" height="8" fill="#C49874"/>
              <path d="M120 590 L 120 480 Q 120 460 140 460 L 170 460 Q 190 460 190 480 L 190 590 Z" fill="#1B2440" opacity="0.85"/>
              <path d="M210 590 L 210 480 Q 210 460 230 460 L 260 460 Q 280 460 280 480 L 280 590 Z" fill="#1B2440" opacity="0.85"/>
              <rect x="130" y="380" width="35" height="50" fill="#FFD89A" opacity="0.92"/>
              <rect x="180" y="380" width="35" height="50" fill="#FFD89A" opacity="0.92"/>
              <rect x="230" y="380" width="35" height="50" fill="#FFD89A" opacity="0.92"/>
            </g>
            <g>
              <rect x="1120" y="280" width="180" height="310" fill="url(#arch)"/>
              <rect x="1120" y="280" width="30" height="310" fill="url(#archShadow)"/>
              <rect x="1116" y="276" width="188" height="8" fill="#C49874"/>
              <rect x="1120" y="350" width="180" height="3" fill="#C49874" opacity="0.6"/>
              <rect x="1120" y="420" width="180" height="3" fill="#C49874" opacity="0.6"/>
              <rect x="1120" y="490" width="180" height="3" fill="#C49874" opacity="0.6"/>
              <g fill="#FFD89A" opacity="0.92">
                <rect x="1160" y="310" width="20" height="30"/>
                <rect x="1200" y="310" width="20" height="30"/>
                <rect x="1240" y="310" width="20" height="30"/>
                <rect x="1160" y="380" width="20" height="30"/>
                <rect x="1240" y="380" width="20" height="30"/>
                <rect x="1200" y="450" width="20" height="30"/>
                <rect x="1160" y="520" width="20" height="30"/>
                <rect x="1240" y="520" width="20" height="30"/>
              </g>
            </g>
            <rect x="0" y="600" width="1440" height="300" fill="#F4E1C7"/>
            <g stroke="#D8B894" strokeWidth="1" opacity="0.5">
              <line x1="0" y1="640" x2="1440" y2="640"/>
              <line x1="0" y1="680" x2="1440" y2="680"/>
              <line x1="0" y1="720" x2="1440" y2="720"/>
              <line x1="0" y1="780" x2="1440" y2="780"/>
              <line x1="0" y1="840" x2="1440" y2="840"/>
            </g>
            <rect x="380" y="640" width="720" height="180" fill="url(#pool)"/>
            <rect x="380" y="638" width="720" height="4" fill="#1B2440"/>
            <rect x="378" y="640" width="4" height="180" fill="#1B2440"/>
            <rect x="1098" y="640" width="4" height="180" fill="#1B2440"/>
            <rect x="380" y="818" width="720" height="4" fill="#1B2440"/>
            <g className="pool-shimmer" opacity="0.6">
              <rect x="420" y="680" width="120" height="2" fill="#FFF" opacity="0.7"/>
              <rect x="600" y="700" width="200" height="2" fill="#FFF" opacity="0.5"/>
              <rect x="850" y="720" width="80" height="2" fill="#FFF" opacity="0.6"/>
              <rect x="500" y="750" width="150" height="2" fill="#FFF" opacity="0.4"/>
              <rect x="700" y="780" width="180" height="2" fill="#FFF" opacity="0.5"/>
              <rect x="900" y="800" width="100" height="2" fill="#FFF" opacity="0.4"/>
            </g>
            <ellipse cx="980" cy="730" rx="40" ry="6" fill="#FFE4B0" opacity="0.5" className="pool-ripple"/>
          </svg>
        </div>

        <div className="hero-veil"></div>
        <div className="grain"></div>

        <div className="hero-content">
          <span className="eyebrow"><span className="pulse"></span> ShowStencil · competitor intelligence for creators</span>
          <h1 className="hero-h">For YouTubers <em>who want to win.</em></h1>
          <p className="hero-sub">Real-time viral alerts the moment a competitor breaks out. Deep AI breakdowns of every competitor channel — hook patterns, pacing, thumbnails, retention. And a Monday digest that tells you exactly what to make next. Score your gap, study your niche, ship better videos. That&apos;s the loop.</p>
          <div className="hero-cta">
            <a
              href="/api/auth/signin?callbackUrl=/dashboard"
              className="btn-hero"
            >
              Connect your YouTube channel
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </a>
            <a href="#how" className="btn-hero-ghost">See how it works</a>
          </div>
          <div className="hero-meta">7-day free trial · no credit card · cancel anytime</div>
        </div>

        <div className="ribbon">
          <div className="ribbon-item">
            <span className="ribbon-k">Viral alerts</span>
            <span className="ribbon-v">Real-time</span>
          </div>
          <div className="ribbon-item">
            <span className="ribbon-k">AI competitor breakdowns</span>
            <span className="ribbon-v">Per video</span>
          </div>
          <div className="ribbon-item">
            <span className="ribbon-k">Niche intelligence</span>
            <span className="ribbon-v">Continuous</span>
          </div>
          <div className="ribbon-item">
            <span className="ribbon-k">Strategy digest</span>
            <span className="ribbon-v">Every Monday</span>
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="how" id="how">
        <div className="container">
          <span className="section-eye reveal">How it works</span>
          <h2 className="section-h reveal">Three steps. <em>One unfair advantage.</em></h2>
          <p className="section-sub reveal">Connect once. We watch your competitors 24/7 — viral alerts the second they pop, deep AI breakdowns of every video they publish, niche detection, gap scoring, idea generation. The Monday digest ties it all together.</p>

          <div className="steps">
            <div className="step reveal">
              <div className="step-num">01</div>
              <div className="step-title">Connect your channel</div>
              <div className="step-desc">Read-only Google sign-in. We pull your videos, your analytics, your last 90 days. Zero configuration. We never post.</div>
              <div className="step-visual">
                <div className="step-meta">
                  <span className="chip on">YouTube OAuth</span>
                  <span className="chip">Read-only</span>
                  <span className="chip">~10s sync</span>
                </div>
              </div>
            </div>
            <div className="step reveal">
              <div className="step-num">02</div>
              <div className="step-title">We map your niche</div>
              <div className="step-desc">Your topics get classified, your top 3–10 competitors auto-detected and tiered. We watch what they ship, what works, and what gaps they leave open.</div>
              <div className="step-visual">
                <div className="step-meta">
                  <span className="chip">Niche detection</span>
                  <span className="chip">Competitor tracking</span>
                  <span className="chip on">Tier 1 · Tier 2 · Dominator</span>
                </div>
              </div>
            </div>
            <div className="step reveal">
              <div className="step-num">03</div>
              <div className="step-title">Ship better videos</div>
              <div className="step-desc">Real-time viral alerts when competitors pop. Deep AI breakdowns of each competitor channel&apos;s hooks, pacing, thumbnails. Plus a Monday digest with gap score, uncovered topics, and ranked ideas you can shoot this week.</div>
              <div className="step-visual">
                <div className="step-meta">
                  <span className="chip">Weekly digest</span>
                  <span className="chip on">Mon · 9am UTC</span>
                  <span className="chip">Email + dashboard</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURE GRID ============ */}
      <section className="features" id="features">
        <div className="container">
          <span className="section-eye reveal">What you get</span>
          <h2 className="section-h reveal">Five things, <em>obsessively built.</em></h2>
          <p className="section-sub reveal">Not a dashboard with a hundred charts you&apos;ll never look at. Five sharp tools, each tuned for one decision a creator makes every week.</p>

          <div className="feat-grid">

            {/* Gap score (large) */}
            <div className="feat span-3 span-tall reveal">
              <span className="feat-eye">01 · Gap score</span>
              <h3 className="feat-h">Know exactly <em>where you&apos;re losing.</em></h3>
              <p className="feat-d">A 0–100 score per dimension: views, CTR, watch time, upload frequency, topic coverage. The bigger the gap, the bigger the opportunity.</p>
              <div className="feat-art">
                <div className="gauge">
                  <div className="gauge-num" data-tick="62">0</div>
                  <div className="gauge-bars">
                    <div className="gauge-row"><span>Avg views</span><span className="gauge-bar"><span className="gauge-fill fail" style={{width:'78%'}}></span></span><span className="gauge-val" data-tick="78">0</span></div>
                    <div className="gauge-row"><span>CTR</span><span className="gauge-bar"><span className="gauge-fill warn" style={{width:'54%'}}></span></span><span className="gauge-val" data-tick="54">0</span></div>
                    <div className="gauge-row"><span>Watch time</span><span className="gauge-bar"><span className="gauge-fill" style={{width:'38%'}}></span></span><span className="gauge-val" data-tick="38">0</span></div>
                    <div className="gauge-row"><span>Upload freq.</span><span className="gauge-bar"><span className="gauge-fill warn" style={{width:'61%'}}></span></span><span className="gauge-val" data-tick="61">0</span></div>
                    <div className="gauge-row"><span>Topic coverage</span><span className="gauge-bar"><span className="gauge-fill" style={{width:'42%'}}></span></span><span className="gauge-val" data-tick="42">0</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Trends (medium) */}
            <div className="feat span-3 reveal">
              <span className="feat-eye">02 · Viral alerts</span>
              <h3 className="feat-h">The second a competitor <em>pops.</em></h3>
              <p className="feat-d">Real-time push the moment a competitor&apos;s video starts trending. Topic shifts when your niche pivots. Uncovered topics nobody is making yet.</p>
              <div className="feat-art">
                <div className="trend-list">
                  <div className="trend-row" data-t="viral">
                    <div className="trend-rail"></div>
                    <div className="trend-text"><strong>Competitor channel</strong> just went viral with <span className="obj">a new hook angle</span></div>
                    <span className="trend-time">live</span>
                  </div>
                  <div className="trend-row" data-t="topic">
                    <div className="trend-rail"></div>
                    <div className="trend-text">Niche shift detected — rising interest in <span className="obj">a tangent topic</span></div>
                    <span className="trend-time">today</span>
                  </div>
                  <div className="trend-row" data-t="gap">
                    <div className="trend-rail"></div>
                    <div className="trend-text">Coverage gap — <span className="obj">a topic nobody owns yet</span></div>
                    <span className="trend-time">new</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Ideas (medium) */}
            <div className="feat span-2 reveal">
              <span className="feat-eye">03 · Ideas</span>
              <h3 className="feat-h">Ranked by <em>opportunity.</em></h3>
              <p className="feat-d">A short list of ideas you can shoot this week. Each comes with the format, length, hook angle, and why it matters now.</p>
              <div className="feat-art">
                <div className="idea-stack">
                  <div className="idea-row">
                    <div className="idea-rank">01</div>
                    <div className="idea-title">A title built from what&apos;s working in your niche this week</div>
                    <div className="idea-score">—</div>
                  </div>
                  <div className="idea-row">
                    <div className="idea-rank">02</div>
                    <div className="idea-title">A second angle on a topic your competitors keep winning with</div>
                    <div className="idea-score">—</div>
                  </div>
                  <div className="idea-row">
                    <div className="idea-rank">03</div>
                    <div className="idea-title">A coverage-gap idea nobody in your niche has touched yet</div>
                    <div className="idea-score">—</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Digest (medium) */}
            <div className="feat span-2 reveal">
              <span className="feat-eye">04 · Monday digest</span>
              <h3 className="feat-h">Monday <em>at 9am.</em></h3>
              <p className="feat-d">One email. One read. Your gap, your top alerts, your ideas. Nothing else.</p>
              <div className="feat-art">
                <div className="digest">
                  <div><span className="ink">→ Gap score:</span> <span className="warn">your number</span> <span style={{color:'var(--ink-3)'}}>(vs last week)</span></div>
                  <div><span className="ink">→ Bottleneck:</span> <span>where you&apos;re bleeding</span></div>
                  <div><span className="ink">→ Viral alerts:</span> <span>fresh competitor pops</span></div>
                  <div><span className="ink">→ AI breakdowns:</span> <span>hooks, pacing, thumbs</span></div>
                  <div><span className="ink">→ Ideas ready:</span> <span className="ok">your shortlist</span></div>
                </div>
              </div>
            </div>

            {/* AI breakdowns (medium) */}
            <div className="feat span-2 reveal">
              <span className="feat-eye">05 · AI competitor breakdowns</span>
              <h3 className="feat-h">Every channel, <em>dissected.</em></h3>
              <p className="feat-d">A deep AI breakdown of each competitor channel — their hook patterns, pacing rhythm, retention shape, thumbnail psychology, title structure, and the through-line on why their channel works.</p>
              <div className="feat-art">
                <div className="digest">
                  <div><span className="ink">→ Hook patterns:</span> <span>their opening DNA</span></div>
                  <div><span className="ink">→ Pacing rhythm:</span> <span>cut tempo + retention shape</span></div>
                  <div><span className="ink">→ Thumbnails:</span> <span>visual hierarchy + contrast</span></div>
                  <div><span className="ink">→ Titles:</span> <span>structure + curiosity gap</span></div>
                  <div><span className="ink">→ Verdict:</span> <span className="ok">why their channel works</span></div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="cta">
        <div className="cta-inner">
          <h2 className="cta-h reveal">Close <em>the gap.</em></h2>
          <p className="cta-sub reveal">7 days free. Connect your channel in under a minute. Your first digest ships next Monday.</p>
          <a
            href="/api/auth/signin?callbackUrl=/dashboard"
            className="btn-cta reveal"
          >
            Connect your YouTube channel
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </a>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer>
        <div className="foot-grid">
          <div className="foot-brand">
            <div>
              <Link href="/" style={{ textDecoration: 'none', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 700, fontSize: 16, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  <span style={{ color: '#FFFFFF' }}>SHOW</span>
                  <span style={{ color: '#737373' }}>STENCIL</span>
                  <span style={{ color: '#FFFFFF' }}>.</span>
                </span>
              </Link>
            </div>
            <p className="foot-tag">YouTube competitor intelligence for creators who want to win.</p>
          </div>
          <div className="foot-col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="/pricing">Pricing</a>
            <a href="#">Sample digest</a>
            <a href="#">Changelog</a>
          </div>
          <div className="foot-col">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Contact</a>
            <a href="#">Twitter</a>
          </div>
          <div className="foot-col">
            <h4>Legal</h4>
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="#">Security</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 ShowStencil</span>
          <span>Built for creators · made with care</span>
        </div>
        <div style={{
          textAlign: 'center',
          paddingTop: '12px',
          paddingBottom: '8px',
          fontFamily: 'var(--mono)',
          fontSize: '11px',
          color: 'var(--ink-3)',
        } as React.CSSProperties}>
          © 2026 ShowStencil. All rights reserved.&nbsp;·&nbsp;
          <a href="/privacy" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Privacy Policy</a>
          &nbsp;·&nbsp;
          <a href="/terms" style={{ color: 'var(--ink-2)', textDecoration: 'none' }}>Terms of Use</a>
        </div>
      </footer>
    </>
  )
}
