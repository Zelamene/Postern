import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

interface TotpQrCodeProps {
  authenticatorUri: string
}

export function TotpQrCode({ authenticatorUri }: Readonly<TotpQrCodeProps>) {
  const [result, setResult] = useState<{
    authenticatorUri: string
    imageUrl?: string
    error?: true
  } | null>(null)

  useEffect(() => {
    let isCurrent = true

    void QRCode.toDataURL(authenticatorUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: { dark: '#211c1b', light: '#ffffff' },
    }).then(
      (url) => {
        if (isCurrent) {
          setResult({ authenticatorUri, imageUrl: url })
        }
      },
      (error: unknown) => {
        console.error('Authenticator QR code could not be generated', error)
        if (isCurrent) {
          setResult({ authenticatorUri, error: true })
        }
      },
    )

    return () => {
      isCurrent = false
    }
  }, [authenticatorUri])

  const currentResult =
    result?.authenticatorUri === authenticatorUri ? result : null

  return (
    <div className="flex flex-col items-center gap-2">
      {currentResult?.imageUrl ? (
        <img
          src={currentResult.imageUrl}
          alt="Authenticator setup QR code"
          width={220}
          height={220}
          className="rounded-lg border border-hairline bg-white p-2"
        />
      ) : (
        <div
          className="flex size-[220px] items-center justify-center rounded-lg border border-hairline bg-surface text-center text-sm text-text-muted"
          role={currentResult?.error ? 'alert' : 'status'}
        >
          {currentResult?.error
            ? 'QR code unavailable. Enter the setup key below.'
            : 'Preparing QR code…'}
        </div>
      )}
      <p className="text-xs text-text-muted">Scan this code with your authenticator app.</p>
    </div>
  )
}
