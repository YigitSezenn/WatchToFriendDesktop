import { en } from '../locales/en'
import { formatLocale } from '../locales/format'
import { tr } from '../locales/tr'
import { resolveLocaleTag } from './localePref'

/** YouTube IFrame Player API error codes → localized message */
export function youtubeErrorMessage(code: number | undefined): string {
  const table = resolveLocaleTag() === 'en' ? en : tr
  switch (code) {
    case 2:
      return table.watch_yt_err_invalid
    case 5:
      return table.watch_yt_err_html5
    case 100:
      return table.watch_yt_err_not_found
    case 101:
    case 150:
      return table.watch_yt_err_embed
    default:
      return code != null
        ? formatLocale(table.watch_yt_err_generic, code)
        : table.watch_yt_err_unknown
  }
}
