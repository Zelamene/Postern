export const EmailAddressNormalizer = {
  IsValidEmail(email: string): boolean {
    if (!email || email.length > 254) return false
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    return emailRegex.test(email)
  },

  Normalize(email: string): string {
    return email.trim().toLowerCase()
  }
}