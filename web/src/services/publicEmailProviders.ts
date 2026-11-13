const PUBLIC_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.co.uk',
  'hotmail.com',
  'hotmail.co.uk',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'rocketmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'mail.com',
  'web.de',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'fastmail.com',
  'hey.com',
  'tutanota.com',
  'tuta.io',
  'qq.com',
  '163.com',
  '126.com',
])

/** True when the domain is a shared mailbox provider, where blocking reaches far beyond one person. */
export function isPublicEmailProvider(domain: string | null): boolean {
  const normalized = domain?.trim().toLowerCase()
  return normalized ? PUBLIC_EMAIL_PROVIDERS.has(normalized) : false
}
