interface EditorialLogoProps {
  size?: number
  className?: string
}

export function EditorialLogo({ size = 32, className }: Readonly<EditorialLogoProps>) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect className="editorial-logo__tile" width="32" height="32" rx="7" />
      <g className="editorial-logo__mark" fill="none" strokeLinecap="butt">
        <path d="M6.5 30V15a9.5 9.5 0 0 1 19 0v15" strokeWidth="3" />
        <path d="M16.8 30v-7.4a2.7 2.7 0 0 1 5.4 0V30" strokeWidth="2" />
      </g>
    </svg>
  )
}
