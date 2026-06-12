import React, { useEffect, useState } from 'react'
import { subscribeToasts, type ToastItem } from '../utils/toast'

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setItems), [])

  if (items.length === 0) return null

  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`}>{t.message}</div>
      ))}
    </div>
  )
}
