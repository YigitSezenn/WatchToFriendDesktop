import type { CSSProperties } from 'react'

export const PROFILE_NAME_COLORS = [
  '',
  '#FFFFFF',
  '#FF9500',
  '#FF6B9D',
  '#A855F7',
  '#3B82F6',
  '#06B6D4',
  '#FACC15',
  '#EF4444',
  '#F97316',
  '#8B5CF6',
  '#14B8A6'
] as const

export function nameColorStyle(hex?: string | null): CSSProperties | undefined {
  const v = (hex ?? '').trim()
  if (!v) return undefined
  return { color: v }
}
