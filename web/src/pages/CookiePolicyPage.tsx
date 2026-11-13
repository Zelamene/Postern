import { LegalLayout } from '../components/legal/LegalLayout'
import type { ThemeMode } from '../types'

interface LegalPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function CookiePolicyPage({ theme, onThemeChange }: Readonly<LegalPageProps>) {
  return (
    <LegalLayout
      theme={theme}
      onThemeChange={onThemeChange}
      title="Cookie Policy"
      summary="The one cookie and two browser-storage keys Postern uses, what each is for, and how to remove them."
    >
      <h2>1. What this policy covers</h2>
      <p>
        This policy explains how Postern uses cookies and similar browser storage (such as
        <code>localStorage</code> and <code>sessionStorage</code>) on this website and in the app.
        It should be read together with our <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>2. What we use</h2>
      <p>
        Postern uses only storage that is strictly necessary to operate the service. We do not use
        analytics, advertising, personalisation, or third-party tracking cookies.
      </p>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Purpose</th>
            <th scope="col">Lifetime and settings</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>Postern.Auth</code>
            </td>
            <td>Cookie</td>
            <td>
              Keeps you signed in and authenticates requests to the API. It contains a signed token
              with your account identifier, email address, and a unique token ID.
            </td>
            <td>
              HttpOnly, SameSite=Strict, Secure in production, path <code>/</code>. Expires after 1
              hour for standard accounts and 15 minutes for administrators.
            </td>
          </tr>
          <tr>
            <td>
              <code>Postern.AdminMfa</code>
            </td>
            <td>Cookie</td>
            <td>
              Holds a short-lived challenge after an administrator enters a password, until
              two-factor authentication is completed.
            </td>
            <td>
              HttpOnly, SameSite=Strict, Secure in production, path{' '}
              <code>/api/auth/admin-mfa</code>. Expires after 5 minutes.
            </td>
          </tr>
          <tr>
            <td>
              <code>postern-theme</code>
            </td>
            <td>
              <code>localStorage</code>
            </td>
            <td>
              Remembers whether you chose the light or dark theme, so the site does not flash the
              wrong theme on load.
            </td>
            <td>Stays on your device until you clear site data.</td>
          </tr>
          <tr>
            <td>
              <code>postern-pending-recovery-key</code>
            </td>
            <td>
              <code>sessionStorage</code>
            </td>
            <td>
              Carries a newly generated recovery key from the sign-in step to the screen that shows
              it to you once.
            </td>
            <td>
              Removed as soon as it is read, and cleared when you close the tab. It is never sent to
              our servers.
            </td>
          </tr>
        </tbody>
      </table>

      <h2>3. Why there is no consent banner</h2>
      <p>
        Consent is not required for storage that is strictly necessary to provide a service you
        asked for. The authentication cookies are needed to sign you in, and the two storage keys
        only remember a display preference or hand a recovery key to the screen that displays it.
        Because nothing else is loaded, a consent banner would have nothing to ask you about.
      </p>
      <p>
        If we ever add optional analytics, advertising, or embedded third-party content, we will ask
        for your consent first and update this policy.
      </p>

      <h2>4. Managing or removing storage</h2>
      <p>
        You can view, block, and delete cookies and site data in your browser settings. Blocking the{' '}
        <code>Postern.Auth</code> cookie will prevent you from signing in, and clearing site data
        will reset your theme choice. Deleting the <code>postern-pending-recovery-key</code> entry
        before you save the key may mean you cannot recover your account, so save the key first.
      </p>

      <h2>5. Third parties</h2>
      <p>
        This site does not set third-party cookies and does not load third-party scripts. Our
        hosting and infrastructure providers are listed in the <a href="/privacy">Privacy Policy</a>. Licensing information for
        the software and fonts we use is published in the{' '}
        <a href="/THIRD-PARTY-NOTICES.txt">third-party notices</a>.
      </p>

      <h2>6. Changes to this policy</h2>
      <p>
        If our use of cookies or browser storage changes, we will update this page and the “last
        updated” date above. Material changes will be announced in the app.
      </p>
    </LegalLayout>
  )
}
