import type { CSSProperties, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { IconMail, IconShield } from '../common/Icons'

const EASE = [0.16, 1, 0.3, 1] as const


const SIZES = '(min-width: 1024px) 58vw, 100vw'

const SOURCES = {
  light: '/media/hero/hero-light',
  dark: '/media/hero/hero-dark',
} as const


const EDGE_MASK: CSSProperties = {
  maskImage: 'linear-gradient(to right, transparent 0%, #000 18%, #000 94%, transparent 100%)',
  WebkitMaskImage:
    'linear-gradient(to right, transparent 0%, #000 18%, #000 94%, transparent 100%)',
}

const CHIP =
  'flex items-center gap-2.5 rounded-2xl border border-white/70 bg-white/65 px-3 py-2.5 shadow-[0_12px_32px_-16px_rgba(92,16,34,0.5)] backdrop-blur-md dark:border-white/15 dark:bg-white/8 dark:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.85)]'

function HeroPicture({ variant }: Readonly<{ variant: keyof typeof SOURCES }>) {
  const base = SOURCES[variant]
  const avif = `${base}-1200.avif 1200w, ${base}.avif 1672w`
  const webp = `${base}-1200.webp 1200w, ${base}.webp 1672w`

  return (
    <picture className="block size-full">
      <source type="image/avif" srcSet={avif} sizes={SIZES} />
      <source type="image/webp" srcSet={webp} sizes={SIZES} />
      <img
        src={`${base}.webp`}
        srcSet={webp}
        sizes={SIZES}
        alt=""
        width={1672}
        height={941}
        fetchPriority="high"
        decoding="async"
        className="size-full object-contain object-bottom"
      />
    </picture>
  )
}

function Monogram({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 font-mono text-[0.7rem] font-bold text-primary uppercase dark:text-primary-on-inverse">
      {children}
    </span>
  )
}

type ChipProps = Readonly<{
  className: string
  delay: number
  reduced: boolean
  children: ReactNode
}>

function Chip({ className, delay, reduced, children }: ChipProps) {
  return (
    <motion.div
      className={`pointer-events-auto absolute ${className}`}
      animate={reduced ? undefined : { y: [0, -6, 0] }}
      transition={
        reduced
          ? undefined
          : { duration: 6.5 + delay, repeat: Infinity, ease: 'easeInOut', delay }
      }
    >
      <motion.div
        whileHover={reduced ? undefined : { y: -3 }}
        transition={{ duration: 0.25, ease: EASE }}
        className={CHIP}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

export function HeroVisual() {
  const reduced = useReducedMotion() ?? false

  return (
    <div
      className="hero-visual absolute right-0 bottom-0 aspect-[1672/941] w-[76%] max-w-[60rem] select-none"
      aria-hidden="true"
    >
      <div className="relative h-full w-full overflow-hidden">
        <div className="absolute inset-0" style={EDGE_MASK}>
          <div className="absolute inset-0 opacity-100 transition-opacity duration-300 dark:opacity-0">
            <HeroPicture variant="light" />
          </div>
          <div className="absolute inset-0 opacity-0 transition-opacity duration-300 dark:opacity-100">
            <HeroPicture variant="dark" />
          </div>

          <div className="hero-grain pointer-events-none absolute inset-0" />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#e9e9ea] to-transparent dark:from-[#0f090d]" />
      </div>

      <Chip
        className="top-[8%] left-[52%]"
        delay={0}
        reduced={reduced}
      >
        <Monogram>N</Monogram>
        <span className="min-w-0">
          <span className="block text-[0.78rem] leading-tight font-bold text-text">Netflix</span>
          <span className="block font-mono text-[0.62rem] text-text-muted">netflix.k7q2@xyz.uk</span>
        </span>
      </Chip>

      <Chip
        className="top-[46%] left-[38%] hidden xl:block"
        delay={1.2}
        reduced={reduced}
      >
        <Monogram>S</Monogram>
        <span className="min-w-0">
          <span className="block text-[0.78rem] leading-tight font-bold text-text">Spotify</span>
          <span className="block font-mono text-[0.62rem] text-text-muted">spotify.f9m3@xyz.uk</span>
        </span>
      </Chip>

      <Chip
        className="top-[18%] right-[2%]"
        delay={0.6}
        reduced={reduced}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary dark:text-primary-on-inverse">
          <IconMail size={15} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[0.78rem] leading-tight font-bold text-text">
            New message
            <span className="size-1.5 shrink-0 rounded-full bg-primary dark:bg-primary-on-inverse" />
          </span>
          <span className="block text-[0.62rem] text-text-muted">From Netflix (via alias)</span>
        </span>
      </Chip>

      <Chip
        className="top-[54%] right-[4%] hidden xl:block"
        delay={1.8}
        reduced={reduced}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary dark:text-primary-on-inverse">
          <IconShield size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-[0.78rem] leading-tight font-bold text-text">
            Alias protected
          </span>
          <span className="block text-[0.62rem] text-text-muted">Your real address is hidden</span>
        </span>
      </Chip>
    </div>
  )
}
