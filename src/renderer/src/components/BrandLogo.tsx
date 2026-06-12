import React from 'react'
import brandLogo from '../assets/brand-logo.png'

interface Props {
  size?: number
  hero?: boolean
  className?: string
}

export default function BrandLogo({ size = 96, hero = false, className = '' }: Props) {
  const radius = Math.round(size * 0.2)

  if (hero) {
    return (
      <div className={`brand-logo-hero ${className}`.trim()} style={{ width: size, height: size }}>
        <div className="brand-logo-glow" aria-hidden />
        <img
          src={brandLogo}
          alt="WatchToFriend"
          width={size}
          height={size}
          style={{ borderRadius: radius }}
          draggable={false}
        />
      </div>
    )
  }

  return (
    <img
      src={brandLogo}
      alt="WatchToFriend"
      className={`brand-logo ${className}`.trim()}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: radius }}
      draggable={false}
    />
  )
}
