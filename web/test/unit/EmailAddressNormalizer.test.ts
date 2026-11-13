import { describe, expect, it } from 'vitest'
import { EmailAddressNormalizer } from '../../src/services/EmailAddressNormalizer'

describe('EmailAddressNormalizer', () => {
  it('validates emails and sender values', () => {
    expect(EmailAddressNormalizer.IsValidEmail('user@example.com')).toBe(true)
    expect(EmailAddressNormalizer.IsValidEmail('bad')).toBe(false)
    expect(EmailAddressNormalizer.IsValidSender('user@example.com')).toBe(true)
    expect(EmailAddressNormalizer.IsValidSender('example.com')).toBe(true)
    expect(EmailAddressNormalizer.IsValidSender('')).toBe(false)
  })

  it('normalizes and extracts sender hosts', () => {
    expect(EmailAddressNormalizer.Normalize('  USER@Example.COM ')).toBe('user@example.com')
    expect(EmailAddressNormalizer.SenderHost('Shop <Info@Example.com>')).toBe('example.com')
    expect(EmailAddressNormalizer.SenderHost('example.com')).toBe('example.com')
    expect(EmailAddressNormalizer.SenderHost('[Example.com.]')).toBe('example.com')
    expect(EmailAddressNormalizer.SenderHost('')).toBeNull()
  })

  it('extracts the full sender address when the header carries one', () => {
    expect(EmailAddressNormalizer.SenderAddress('Shop <Info@Example.com>')).toBe('info@example.com')
    expect(EmailAddressNormalizer.SenderAddress('"Doe, Jane" <Jane@Sub.Example.com>')).toBe(
      'jane@sub.example.com',
    )
    expect(EmailAddressNormalizer.SenderAddress('  Orders@Shop.Example.com ')).toBe(
      'orders@shop.example.com',
    )
    expect(EmailAddressNormalizer.SenderAddress('example.com')).toBeNull()
    expect(EmailAddressNormalizer.SenderAddress('Shop')).toBeNull()
    expect(EmailAddressNormalizer.SenderAddress('')).toBeNull()
  })
})
