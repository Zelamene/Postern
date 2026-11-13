const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i
const EDGE_BRACKETS = /^\[|\]$/g
const MAX_ADDRESS_LENGTH = 254
const MAX_DOMAIN_LENGTH = 253

function IsValidEmail(email: string): boolean {
  if (!email || email.length > MAX_ADDRESS_LENGTH) {
    return false
  }

  return EMAIL_PATTERN.test(email)
}

/** Accepts either a full address or a bare domain, as the API does. */
function IsValidSender(value: string): boolean {
  const candidate = value.trim()
  if (!candidate || candidate.length > MAX_ADDRESS_LENGTH) {
    return false
  }

  return IsValidEmail(candidate) || DOMAIN_PATTERN.test(candidate)
}

function Normalize(email: string): string {
  return email.trim().toLowerCase()
}

/** Pulls the host out of a `From` header, envelope sender, or bare domain. */
function SenderHost(value: string): string | null {
  const candidate = value.trim()
  if (!candidate) {
    return null
  }

  const openBracket = candidate.lastIndexOf('<')
  const address = openBracket >= 0 ? candidate.slice(openBracket + 1) : candidate
  const withoutBrackets = address.replace(/[<>]/g, '')
  const separator = withoutBrackets.lastIndexOf('@')
  const host =
    separator >= 0 ? withoutBrackets.slice(separator + 1) : withoutBrackets

  let cleaned = host.trim().toLowerCase().replace(EDGE_BRACKETS, '')
  while (cleaned.endsWith('.')) {
    cleaned = cleaned.slice(0, -1)
  }

  if (!cleaned || cleaned.length > MAX_DOMAIN_LENGTH) {
    return null
  }

  return cleaned
}

export const EmailAddressNormalizer = {
  IsValidEmail,
  IsValidSender,
  Normalize,
  SenderHost,
}
