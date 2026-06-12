import { en } from './en'
import { formatLocale } from './format'
import { tr, type LocaleKey } from './tr'
import { resolveLocaleTag } from '../utils/localePref'

/** Non-React i18n helper (hooks, utils). Re-reads locale pref on each call. */
export function translate(key: LocaleKey, ...args: (string | number)[]): string {
  const raw = (resolveLocaleTag() === 'en' ? en : tr)[key]
  return args.length ? formatLocale(raw, ...args) : raw
}
