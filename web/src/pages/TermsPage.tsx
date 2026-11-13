import { LegalLayout } from '../components/legal/LegalLayout'
import type { ThemeMode } from '../types'

interface LegalPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function TermsPage({ theme, onThemeChange }: Readonly<LegalPageProps>) {
  return (
    <LegalLayout
      theme={theme}
      onThemeChange={onThemeChange}
      title="Terms of Service"
      summary="The rules for using Postern, what you can expect from the service, and the limits of our responsibility."
    >
      <h2>1. Agreement to these terms</h2>
      <p>
        These Terms of Service (“Terms”) are a binding agreement between you and the operator of
        Postern (“Postern”, “we”, “us”). By requesting an invitation, accepting an invitation,
        creating an account, or using the service, you agree to these Terms and to our{' '}
        <a href="/privacy">Privacy Policy</a>. If you do not agree, do not use Postern.
      </p>

      <h2>2. What Postern is</h2>
      <p>
        Postern lets you create email aliases that forward incoming mail to a destination address
        you control. It is an invite-only, single-purpose service. We relay messages; we do not
        store message bodies or attachments, and we are not an email archive, a backup service, or a
        general-purpose mailbox provider.
      </p>

      <h2>3. Eligibility and invitations</h2>
      <ul>
        <li>You must be at least 16 years old and able to form a binding contract.</li>
        <li>
          Access is by invitation. Invitations are personal, single-use, and expire seven days after
          they are issued.
        </li>
        <li>
          You must provide accurate information and keep your destination address up to date. We may
          refuse or revoke an invitation if we believe it was obtained or used improperly.
        </li>
        <li>
          You are responsible for making sure that forwarding your mail to your destination address
          is lawful and permitted by that provider.
        </li>
      </ul>

      <h2>4. Your account</h2>
      <ul>
        <li>Keep your password and recovery key confidential and do not share your account.</li>
        <li>
          You are responsible for activity that happens under your account. Tell your administrator
          promptly if you believe it has been compromised.
        </li>
        <li>
          You may delete your account at any time from <strong>Account settings</strong>. Deletion is
          permanent.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You must not use Postern to:</p>
      <ul>
        <li>break any law or regulation, or infringe anyone else’s rights;</li>
        <li>
          send, request, or facilitate spam, unsolicited bulk mail, phishing, fraud, malware, or
          harassment;
        </li>
        <li>
          evade a ban, block, or lawful request imposed by another service or by us, or use an alias
          to impersonate someone;
        </li>
        <li>
          probe, scan, or attempt to bypass our security, rate limits, or access controls, or
          interfere with the service or other users;
        </li>
        <li>
          resell, sublicense, or provide the service to third parties as your own; or
        </li>
        <li>use the service in a way that could damage its reputation or availability.</li>
      </ul>
      <p>
        We may suspend or terminate an account that we reasonably believe is being used in breach of
        this section, and we may report unlawful activity to the relevant authorities.
      </p>

      <h2>6. Email forwarding and content</h2>
      <ul>
        <li>
          You are responsible for the mail sent to your aliases and for what you do with it. We do
          not control senders and cannot guarantee that a message is safe, genuine, or free of
          malware.
        </li>
        <li>
          We do not guarantee delivery. Delivery can be delayed or fail because of the sender, your
          destination provider, network conditions, or maintenance.
        </li>
        <li>
          We process message metadata (such as sender, subject, and authentication results) to route
          mail, show activity, and filter abuse, as described in the{' '}
          <a href="/privacy">Privacy Policy</a>. Message bodies and attachments are not retained.
        </li>
        <li>
          Do not use Postern as the only copy of important mail. Keep your own backups with your
          destination provider.
        </li>
      </ul>

      <h2>7. Aliases and retirement</h2>
      <p>
        You can disable or delete an alias at any time. Disabled aliases drop incoming mail. Deleted
        aliases are permanently retired: the address is cleared and is not issued to another
        account. A one-way hash is kept so the same address cannot be reassigned.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        Postern is provided on an “as available” basis. We may change, suspend, or discontinue any
        part of the service, including features, limits, and supported providers. We aim to give
        reasonable notice of material changes that affect active accounts, but we do not offer a
        service-level agreement or an uptime guarantee.
      </p>

      <h2>9. Fees</h2>
      <p>
        Postern is currently free of charge. We do not take payments and there are no paid plans,
        subscriptions, or hidden charges. If we introduce paid features in future, we will describe
        the price and terms clearly before you are asked to pay anything.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        You may stop using Postern at any time and delete your account. We may suspend or terminate
        your access if you breach these Terms, if we are required to by law, or if continuing to
        provide the service would create a security or legal risk. Where practical, we will explain
        why.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        Postern, its name, logo, and software are owned by us or our licensors and are protected by
        intellectual property law. We grant you a limited, non-exclusive, non-transferable right to
        use the service for its intended purpose while these Terms apply. You keep all rights in the
        data you put into the service, and you grant us the limited licence needed to process it as
        described in the <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        To the maximum extent permitted by law, Postern is provided “as is” and “as available”,
        without warranties of any kind, whether express or implied, including implied warranties of
        merchantability, fitness for a particular purpose, and non-infringement. We do not warrant
        that the service will be uninterrupted, error-free, or that it will detect every unwanted,
        malicious, or misdirected message.
      </p>

      <h2>13. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, we are not liable for indirect, incidental, special,
        consequential, or punitive damages, or for lost profits, lost revenue, lost data, or
        business interruption, arising from or relating to your use of Postern. Our total liability
        for any claim relating to the service is limited to the amount you paid us in the twelve
        months before the claim. Because the service is free, that amount is zero.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or
        limited, including liability for death or personal injury caused by negligence, fraud, or
        fraudulent misrepresentation.
      </p>

      <h2>14. Indemnity</h2>
      <p>
        To the extent permitted by law, you agree to indemnify us against claims, losses, and costs
        arising from your breach of these Terms or your misuse of the service, except to the extent
        the claim is caused by our own negligence or wilful misconduct.
      </p>

      <h2>15. Governing law</h2>
      <p>
        These Terms are governed by the laws of the country in which the operator of Postern is
        established, and the courts of that country have exclusive jurisdiction. If you are a
        consumer, this does not deprive you of the protection of mandatory consumer law in your
        country of residence, including any right to bring a claim in your local courts.
      </p>

      <h2>16. Changes to these terms</h2>
      <p>
        We may update these Terms as the service changes. The “last updated” date above reflects the
        current version. If a change materially affects your rights or obligations, we will give
        reasonable notice in the app or by email. Continuing to use Postern after a change takes
        effect means you accept the updated Terms.
      </p>

      <h2>17. General</h2>
      <p>
        If any provision of these Terms is found unenforceable, the rest remains in force. Our
        failure to enforce a provision is not a waiver of it. These Terms, together with the{' '}
        <a href="/privacy">Privacy Policy</a> and <a href="/cookies">Cookie Policy</a>, are the
        entire agreement between us about the service.
      </p>
    </LegalLayout>
  )
}
