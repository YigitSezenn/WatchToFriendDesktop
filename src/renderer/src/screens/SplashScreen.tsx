import React, { useEffect, useState } from 'react'
import BrandLogo from '../components/BrandLogo'
import { useLocale } from '../hooks/useLocale'

export default function SplashScreen() {
  const { t } = useLocale()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <div className={`splash-screen${visible ? ' splash-screen--visible' : ''}`}>
      <BrandLogo size={128} hero />
      <h1 className="splash-title">WatchToFriend</h1>
      <p className="splash-tagline">{t('splash_tagline')}</p>
    </div>
  )
}
