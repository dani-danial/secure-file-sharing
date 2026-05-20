import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchFileMetadata, requestDownload } from '../services/api.js'
import { Icon, formatFileSize } from '../lib/ui.jsx'

const formatRelativeExpiry = (iso) => {
  if (!iso) return null
  const target = new Date(iso).getTime()
  const diffMs = target - Date.now()
  if (diffMs <= 0) return 'expired'

  const minutes = Math.round(diffMs / 60_000)
  if (minutes < 60) return `expires in ${minutes} minute${minutes === 1 ? '' : 's'}`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `expires in ${hours} hour${hours === 1 ? '' : 's'}`
  const days = Math.round(hours / 24)
  return `expires in ${days} day${days === 1 ? '' : 's'}`
}

const triggerBrowserDownload = (url) => {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.rel = 'noopener'
  anchor.target = '_self'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export default function SharePage() {
  const { shareToken } = useParams()
  const [phase, setPhase] = useState('loading')
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(null)
  const [downloaded, setDownloaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setPhase('loading')
      setError(null)
      setMeta(null)
      try {
        const data = await fetchFileMetadata(shareToken)
        if (cancelled) return
        setMeta(data)
        setPhase('ready')
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load file')
        setPhase('not_found')
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [shareToken])

  const handleDownload = async (event) => {
    event.preventDefault()
    if (!meta) return
    if (meta.hasPassword && password.length === 0) {
      setDownloadError('Please enter the password.')
      return
    }

    setDownloading(true)
    setDownloadError(null)
    setDownloaded(false)

    try {
      const { url, downloadsLeft } = await requestDownload({ shareToken, password })
      triggerBrowserDownload(url)
      setDownloaded(true)
      if (downloadsLeft != null) {
        setMeta((current) =>
          current ? { ...current, downloadsLeft } : current
        )
        if (downloadsLeft === 0) {
          setPhase('exhausted')
        }
      }
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_38%,#ecfeff_100%)] px-4 py-10 text-slate-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            <Icon className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" />
            </Icon>
            Back to upload
          </Link>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            Private share link
          </div>
        </header>

        <section className="rounded-lg border border-white/80 bg-white/85 p-6 shadow-2xl shadow-slate-300/40 backdrop-blur-xl">
          {phase === 'loading' && <LoadingCard />}

          {phase === 'not_found' && (
            <EmptyCard
              title="Link unavailable"
              description={
                error?.toLowerCase().includes('not found')
                  ? 'This file may have expired, hit its download limit, or never existed.'
                  : error ?? 'Could not load this share link.'
              }
            />
          )}

          {phase === 'exhausted' && (
            <EmptyCard
              title="No downloads remaining"
              description="The maximum number of downloads for this share link has been reached."
            />
          )}

          {phase === 'ready' && meta && (
            <FileDetails
              meta={meta}
              password={password}
              setPassword={setPassword}
              downloading={downloading}
              downloadError={downloadError}
              downloaded={downloaded}
              onSubmit={handleDownload}
            />
          )}
        </section>

        <p className="text-center text-xs text-slate-500">
          Secure File Sharing — links are private and expire automatically.
        </p>
      </div>
    </main>
  )
}

function LoadingCard() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-2/3 animate-pulse rounded-md bg-slate-100" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-slate-100" />
      <div className="h-32 animate-pulse rounded-md bg-slate-100" />
      <div className="h-10 w-full animate-pulse rounded-md bg-slate-100" />
    </div>
  )
}

function EmptyCard({ title, description }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
        <Icon className="h-7 w-7">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </Icon>
      </div>
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      <Link
        to="/"
        className="mt-2 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        Share your own file
      </Link>
    </div>
  )
}

function FileDetails({
  meta,
  password,
  setPassword,
  downloading,
  downloadError,
  downloaded,
  onSubmit,
}) {
  const expiryLabel = formatRelativeExpiry(meta.expiresAt)
  const isExpired = expiryLabel === 'expired'

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
          <Icon className="h-6 w-6">
            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
            <path d="M14 2v5h5" />
          </Icon>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-normal text-teal-700">
            Shared with you
          </p>
          <h2 className="mt-1 truncate text-2xl font-semibold text-slate-950">
            {meta.name}
          </h2>
          <p className="mt-1 truncate text-sm text-slate-500">
            {formatFileSize(meta.sizeBytes)} / {meta.mimeType}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs uppercase tracking-normal text-slate-500">Expires</dt>
          <dd className={`mt-1 font-medium ${isExpired ? 'text-rose-600' : 'text-slate-950'}`}>
            {expiryLabel ?? new Date(meta.expiresAt).toLocaleString()}
          </dd>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs uppercase tracking-normal text-slate-500">Downloads left</dt>
          <dd className="mt-1 font-medium text-slate-950">
            {meta.downloadsLeft == null ? 'Unlimited' : meta.downloadsLeft}
          </dd>
        </div>
      </dl>

      {meta.hasPassword && (
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="share-password">
            Password
          </label>
          <input
            id="share-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
            placeholder="Enter the password the sender gave you"
            required
          />
        </div>
      )}

      <button
        type="submit"
        disabled={downloading || isExpired}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon className="h-4 w-4">
          <path d="M12 4v12" />
          <path d="M7 11l5 5 5-5" />
          <path d="M4 20h16" />
        </Icon>
        {downloading
          ? 'Preparing download...'
          : isExpired
            ? 'Link expired'
            : 'Download file'}
      </button>

      {downloadError && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {downloadError}
        </p>
      )}

      {downloaded && !downloadError && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Download started. If nothing happened, check that pop-ups are allowed and try again.
        </p>
      )}
    </form>
  )
}
