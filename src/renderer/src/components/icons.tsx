import type { SVGProps } from 'react'

export function TokenCoin({ size = 20, className = '', ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={`token-coin ${className}`}
      {...props}
    >
      <circle cx="16" cy="16" r="13.5" fill="#FFC300" />
      <circle cx="16" cy="16" r="13.5" stroke="#0A0A0A" strokeOpacity=".18" strokeWidth="1" />
      <circle cx="16" cy="16" r="9.4" stroke="#0A0A0A" strokeOpacity=".22" strokeWidth="1.2" />
      <path d="M13.1 10.7h5.8v4.2h2.3L16 21.5l-5.2-6.6h2.3v-4.2Z" fill="#0A0A0A" />
    </svg>
  )
}

export function BrandMark({ size = 38, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="2" y="2" width="60" height="60" rx="18" fill="#0A0A0A" />
      <rect x="2.8" y="2.8" width="58.4" height="58.4" rx="17.2" stroke="#FFFFFF" strokeOpacity=".18" />
      <circle cx="32" cy="32" r="17.5" fill="#FFC300" />
      <circle cx="32" cy="32" r="17.5" stroke="#FFFFFF" strokeOpacity=".28" />
      <circle cx="32" cy="32" r="12" stroke="#0A0A0A" strokeOpacity=".18" />
      <path d="M27.8 22.6h8.4v6.3h4.1L32 40.2l-8.3-11.3h4.1v-6.3Z" fill="#0A0A0A" />
    </svg>
  )
}
