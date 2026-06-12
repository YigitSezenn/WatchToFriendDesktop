export type ToastType = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

type Listener = (toasts: ToastItem[]) => void

let nextId = 1
let toasts: ToastItem[] = []
const listeners = new Set<Listener>()

function emit() {
  listeners.forEach((fn) => fn([...toasts]))
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener([...toasts])
  return () => listeners.delete(listener)
}

export function showToast(message: string, type: ToastType = 'info', ms = 3200) {
  const id = nextId++
  toasts = [...toasts, { id, message, type }]
  emit()
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id)
    emit()
  }, ms)
}
