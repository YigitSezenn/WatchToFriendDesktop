/** Android-style placeholders: %1$s, %2$d */
export function formatLocale(template: string, ...args: (string | number)[]): string {
  return template.replace(/%(\d+)\$[sd]/g, (_, n) => {
    const idx = parseInt(n, 10) - 1
    return idx >= 0 && idx < args.length ? String(args[idx]) : ''
  })
}
