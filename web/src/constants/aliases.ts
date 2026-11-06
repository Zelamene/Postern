export const ALIAS_CATEGORIES = [
  { value: 'streaming', label: 'Streaming' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'finance', label: 'Finance' },
  { value: 'social', label: 'Social' },
  { value: 'other', label: 'Other' },
] as const

export type AliasCategory = (typeof ALIAS_CATEGORIES)[number]['value']

export const DEFAULT_ALIAS_CATEGORY: AliasCategory = 'other'

export function isAliasCategory(value: string): value is AliasCategory {
  return ALIAS_CATEGORIES.some((category) => category.value === value)
}
