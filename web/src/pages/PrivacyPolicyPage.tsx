import { LegalLayout } from '../components/legal/LegalLayout'
import type { ThemeMode } from '../types'

interface LegalPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function PrivacyPolicyPage({ theme, onThemeChange }: Readonly<LegalPageProps>) {
  return (
    <LegalLayout
      theme={theme}
      onThemeChange={onThemeChange}
      title="Privacy Policy"
      summary="What personal data Postern processes, why we process it, how long we keep it, and the rights you can exercise."
    >
      <h2>1. Scope</h2>
      <p>
        Postern is an invite-only email alias and forwarding service. This policy explains how the
        operator of Postern (“Postern”, “we”, “us”) handles personal data when you browse this
        website, request or accept an invitation, sign in, or use the app.
      </p>
      <p>
        It does not cover the websites and services you use an alias with. Those services have
        their own privacy policies, and using an alias does not change how they treat the data you
        give them.
      </p>

      <h2>2. Data we process</h2>
      <p>
        We keep the data needed to create aliases, forward mail, keep accounts secure, and
        investigate abuse. In practice that means the following.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">What it includes</th>
            <th scope="col">Why we process it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account data</td>
            <td>
              Email address, password hash, forwarding address, recovery key hash, account status,
              and account timestamps.
            </td>
            <td>
              To create and secure your account, forward mail to your chosen destination, and let
              you recover access.
            </td>
          </tr>
          <tr>
            <td>Alias data</td>
            <td>
              Alias address and its one-way hash, label, category, any free-text purpose note you
              add, status, and timestamps.
            </td>
            <td>To create, route, filter, and retire aliases.</td>
          </tr>
          <tr>
            <td>Message metadata</td>
            <td>
              Sender header, envelope sender, Message-ID, subject, received time, authentication
              results (such as SPF, DKIM, and DMARC), and any blocked or flagged status.
            </td>
            <td>
              To show your activity, filter abusive mail, and troubleshoot delivery. Message bodies
              and attachments are not included — see below.
            </td>
          </tr>
          <tr>
            <td>Invitations and requests</td>
            <td>
              The invited or requesting email address, the inviter’s name, request status, and
              timestamps.
            </td>
            <td>To issue and review invitations and prevent invite abuse.</td>
          </tr>
          <tr>
            <td>Notifications</td>
            <td>Notification type, title, short body, link, and read time.</td>
            <td>To show in-app notifications about account and alias events.</td>
          </tr>
          <tr>
            <td>Security and operations</td>
            <td>
              Administrative audit entries, short-lived rate-limit counters keyed by IP address, and
              server logs.
            </td>
            <td>To secure the service, investigate abuse, and keep an audit trail.</td>
          </tr>
          <tr>
            <td>Preferences</td>
            <td>Your light or dark theme choice, stored in your browser.</td>
            <td>To remember how the site should look on your device.</td>
          </tr>
        </tbody>
      </table>

      <h3>What we do not collect</h3>
      <ul>
        <li>
          <strong>Message bodies and attachments.</strong> Forwarded mail is relayed, not archived.
          The body and any attachments are discarded after delivery.
        </li>
        <li>
          <strong>Advertising, analytics, and tracking data.</strong> There are no analytics
          scripts, advertising pixels, session recordings, or third-party marketing cookies on this
          site.
        </li>
        <li>
          <strong>Persistent IP addresses.</strong> We use the connecting IP address in memory for
          rate limiting and in short-lived server logs, but we do not store it against your account.
        </li>
        <li>
          <strong>Payment data.</strong> Postern is free and takes no payments, so we never receive
          card or bank details.
        </li>
        <li>
          <strong>Special category data.</strong> We do not ask for health, biometric, political,
          religious, or similar data.
        </li>
      </ul>

      <h2>3. Why we are allowed to process it</h2>
      <p>Where data protection law requires a legal basis, we rely on:</p>
      <ul>
        <li>
          <strong>Contract</strong> — to provide the account and forwarding service you signed up
          for.
        </li>
        <li>
          <strong>Legitimate interests</strong> — to keep the service secure and reliable, prevent
          spam and abuse, and enforce our Terms of Service.
        </li>
        <li>
          <strong>Legal obligation</strong> — to respond to lawful requests and keep records we are
          required to keep.
        </li>
        <li>
          <strong>Consent</strong> — only where we ask for it. We do not currently run any optional
          processing that relies on consent.
        </li>
      </ul>

      <h2>4. Who we share it with</h2>
      <p>
        We do not sell personal data and we do not share it for advertising. We use a small number
        of service providers that process data on our instructions:
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Provider</th>
            <th scope="col">Purpose</th>
            <th scope="col">Data involved</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cloudflare</td>
            <td>Email routing, edge network, and the alias key-value store</td>
            <td>Alias records and message routing metadata</td>
          </tr>
          <tr>
            <td>Neon</td>
            <td>Managed PostgreSQL database</td>
            <td>Account, alias, invitation, and message metadata</td>
          </tr>
          <tr>
            <td>Render</td>
            <td>API hosting</td>
            <td>Transient processing of requests to the API</td>
          </tr>
          <tr>
            <td>Vercel</td>
            <td>Website hosting</td>
            <td>Transient request logs for this website</td>
          </tr>
          <tr>
            <td>Resend</td>
            <td>Delivery of invitation emails</td>
            <td>Recipient email address, inviter name, and invite link</td>
          </tr>
        </tbody>
      </table>
      <p>
        Each provider processes data under its own standard data processing terms. We may also
        disclose data where we are legally required to, or where it is necessary to protect the
        rights, safety, or security of Postern, our users, or the public.
      </p>

      <h2>5. International transfers</h2>
      <p>
        Some of these providers process data in the United States and other countries. Where
        required, international transfers rely on the provider’s standard contractual clauses or an
        equivalent legal safeguard.
      </p>

      <h2>6. How long we keep it</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Retention</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account, alias, invitation, and notification records</td>
            <td>While your account is open.</td>
          </tr>
          <tr>
            <td>Message and blocked-message metadata</td>
            <td>
              Up to 90 days, then removed by a nightly purge. Deleted immediately when you delete
              your account.
            </td>
          </tr>
          <tr>
            <td>Delivery webhook events</td>
            <td>Up to 30 days.</td>
          </tr>
          <tr>
            <td>Pending invite requests</td>
            <td>Up to 30 days. Reviewed requests are kept while the invitation is administered.</td>
          </tr>
          <tr>
            <td>Pending, unverified accounts</td>
            <td>7 days from creation.</td>
          </tr>
          <tr>
            <td>Authentication cookie</td>
            <td>1 hour for standard accounts, 15 minutes for administrators.</td>
          </tr>
          <tr>
            <td>Administrator MFA challenge</td>
            <td>5 minutes.</td>
          </tr>
          <tr>
            <td>Server logs</td>
            <td>Short-lived, as managed by our hosting providers.</td>
          </tr>
        </tbody>
      </table>
      <p>
        When you delete your account, we remove your account record, message metadata, blocked
        messages, and expected-sender records. Your aliases are retired rather than reissued: the
        alias address itself is cleared, but a one-way hash and a “deleted” status remain so the
        same address can never be assigned to another account. That remaining record does not
        identify you.
      </p>

      <h2>7. Security</h2>
      <p>
        Passwords are stored as one-way hashes, never as plain text. The session cookie is
        HttpOnly, SameSite=Strict, and Secure in production. Administrator authenticator secrets are
        encrypted at rest, authentication and ingest endpoints are rate limited, and administrative
        actions are recorded in an audit log. Traffic to the website and API uses TLS.
      </p>
      <p>
        No service can promise perfect security. If we become aware of a breach that affects your
        personal data, we will notify you and the relevant authority where the law requires it.
      </p>

      <h2>8. Your rights</h2>
      <p>Depending on where you live, you may have the right to:</p>
      <ul>
        <li>ask for a copy of the personal data we hold about you;</li>
        <li>ask us to correct data that is inaccurate or incomplete;</li>
        <li>ask us to delete your data;</li>
        <li>ask us to restrict or object to certain processing;</li>
        <li>receive your data in a portable format;</li>
        <li>withdraw consent where processing relies on it; and</li>
        <li>complain to your local data protection authority.</li>
      </ul>
      <p>
        You can delete your account and its data yourself at any time from{' '}
        <strong>Account settings → Delete account</strong> in the app. That action removes your
        account record, message metadata, and alias assignments as described above. For any other
        request, contact your administrator; we respond within the period required by law, normally
        one month.
      </p>

      <h2>9. Cookies and local storage</h2>
      <p>
        Postern uses one essential authentication cookie and a small amount of browser storage. The{' '}
        <a href="/cookies">Cookie Policy</a> lists each item, its purpose, and how to remove it.
      </p>

      <h2>10. Children</h2>
      <p>
        Postern is not directed at children. You must be at least 16 years old to hold an account,
        and we do not knowingly collect data from anyone under that age. If you believe a child has
        given us personal data, contact your administrator so the account can be removed.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy as the service changes. The “last updated” date above always
        reflects the current version. If a change materially affects how we use your data, we will
        tell you in the app or by email before it takes effect.
      </p>
    </LegalLayout>
  )
}
