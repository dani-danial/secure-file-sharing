import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteFile, uploadFile } from '../services/api.js'
import { Icon, formatFileSize } from '../lib/ui.jsx'

const SHARE_OPTIONS_STORAGE_KEY = 'sfs:share-options:v1'

const loadStoredShareOptions = () => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SHARE_OPTIONS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return null
    return {
      password: typeof parsed.password === 'string' ? parsed.password : '',
      expiryDays:
        typeof parsed.expiryDays === 'string' || typeof parsed.expiryDays === 'number'
          ? String(parsed.expiryDays)
          : '',
      maxDownloads:
        typeof parsed.maxDownloads === 'string' || typeof parsed.maxDownloads === 'number'
          ? String(parsed.maxDownloads)
          : '',
    }
  } catch {
    return null
  }
}

const saveStoredShareOptions = (options) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SHARE_OPTIONS_STORAGE_KEY, JSON.stringify(options))
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded) — silently skip.
  }
}

const createUploadItem = (file, options) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
  file,
  name: file.name,
  size: file.size,
  type: file.type || 'Unknown file',
  previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
  status: 'pending',
  progress: 0,
  error: null,
  shareToken: null,
  ownerToken: null,
  shareUrl: null,
  expiresAt: null,
  copied: false,
  options,
})

const DEFAULT_OPTIONS = {
  password: '',
  expiryDays: '',
  maxDownloads: '',
}

const MAX_EXPIRY_DAYS = 30

const snapshotOptions = (options) => {
  const expiryDaysNum = options.expiryDays === '' ? null : Number(options.expiryDays)
  const maxDownloadsNum = options.maxDownloads === '' ? null : Number(options.maxDownloads)

  return {
    password: options.password.trim() === '' ? null : options.password,
    expiryDays:
      expiryDaysNum != null && Number.isFinite(expiryDaysNum) && expiryDaysNum > 0
        ? Math.min(Math.floor(expiryDaysNum), MAX_EXPIRY_DAYS)
        : null,
    maxDownloads:
      maxDownloadsNum != null && Number.isFinite(maxDownloadsNum) && maxDownloadsNum > 0
        ? Math.floor(maxDownloadsNum)
        : null,
  }
}

const validateOptions = (options) => {
  const errors = {}
  if (options.password !== '' && options.password.length < 4) {
    errors.password = 'Use at least 4 characters.'
  }
  if (options.expiryDays !== '') {
    const value = Number(options.expiryDays)
    if (!Number.isInteger(value) || value < 1 || value > MAX_EXPIRY_DAYS) {
      errors.expiryDays = `Enter a whole number between 1 and ${MAX_EXPIRY_DAYS}.`
    }
  }
  if (options.maxDownloads !== '') {
    const value = Number(options.maxDownloads)
    if (!Number.isInteger(value) || value < 1) {
      errors.maxDownloads = 'Enter a positive whole number.'
    }
  }
  return errors
}

const summarizeOptions = (options) => {
  const parts = []
  if (options.password.trim() !== '') parts.push('password protected')
  if (options.expiryDays !== '') parts.push(`${options.expiryDays}d expiry`)
  if (options.maxDownloads !== '') parts.push(`${options.maxDownloads} downloads max`)
  return parts.length === 0 ? 'Defaults: 7d expiry, unlimited downloads' : parts.join(' · ')
}

const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600',
  uploading: 'bg-amber-100 text-amber-800',
  success: 'bg-emerald-100 text-emerald-800',
  error: 'bg-rose-100 text-rose-700',
  deleting: 'bg-slate-100 text-slate-600',
}

const STATUS_LABELS = {
  pending: 'Queued',
  uploading: 'Uploading',
  success: 'Shared',
  error: 'Failed',
  deleting: 'Removing',
}

const PROGRESS_STYLES = {
  pending: 'bg-slate-300',
  uploading: 'bg-amber-500',
  success: 'bg-emerald-500',
  error: 'bg-rose-500',
  deleting: 'bg-slate-300',
}

export default function Home() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState([])
  const [shareOptions, setShareOptions] = useState(
    () => loadStoredShareOptions() ?? DEFAULT_OPTIONS
  )
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    saveStoredShareOptions(shareOptions)
  }, [shareOptions])
  const fileInputRef = useRef(null)
  const abortControllersRef = useRef(new Map())

  const optionErrors = validateOptions(shareOptions)
  const hasOptionErrors = Object.keys(optionErrors).length > 0

  const updateOption = (key, value) => {
    setShareOptions((current) => ({ ...current, [key]: value }))
  }

  const resetOptions = () => {
    setShareOptions(DEFAULT_OPTIONS)
    setShowPassword(false)
  }

  const updateUpload = useCallback((id, patch) => {
    setUploads((current) =>
      current.map((upload) =>
        upload.id === id
          ? { ...upload, ...(typeof patch === 'function' ? patch(upload) : patch) }
          : upload
      )
    )
  }, [])

  const startUpload = useCallback(
    async (item) => {
      const controller = new AbortController()
      abortControllersRef.current.set(item.id, controller)
      updateUpload(item.id, { status: 'uploading', progress: 0, error: null })

      try {
        const result = await uploadFile({
          file: item.file,
          password: item.options?.password ?? undefined,
          expiryDays: item.options?.expiryDays ?? undefined,
          maxDownloads: item.options?.maxDownloads ?? undefined,
          onProgress: (progress) => updateUpload(item.id, { progress }),
          signal: controller.signal,
        })

        updateUpload(item.id, {
          status: 'success',
          progress: 100,
          shareToken: result.shareToken,
          ownerToken: result.ownerToken,
          shareUrl: result.shareUrl,
          expiresAt: result.expiresAt,
        })
      } catch (err) {
        if (controller.signal.aborted) return
        updateUpload(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Upload failed',
        })
      } finally {
        abortControllersRef.current.delete(item.id)
      }
    },
    [updateUpload]
  )

  const addFiles = (fileList) => {
    if (hasOptionErrors) return
    const snapshot = snapshotOptions(shareOptions)
    const nextFiles = Array.from(fileList).map((file) => createUploadItem(file, snapshot))

    setUploads((currentUploads) => [...nextFiles, ...currentUploads])
    nextFiles.forEach(startUpload)
  }

  const removeFile = async (id) => {
    const target = uploads.find((upload) => upload.id === id)
    if (!target) return

    const controller = abortControllersRef.current.get(id)
    if (controller) controller.abort()

    if (target.previewUrl) {
      URL.revokeObjectURL(target.previewUrl)
    }

    if (target.status === 'success' && target.shareToken && target.ownerToken) {
      updateUpload(id, { status: 'deleting' })
      try {
        await deleteFile({ shareToken: target.shareToken, ownerToken: target.ownerToken })
      } catch (err) {
        updateUpload(id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to delete on server',
        })
        return
      }
    }

    setUploads((current) => current.filter((upload) => upload.id !== id))
  }

  const retryUpload = (id) => {
    const target = uploads.find((upload) => upload.id === id)
    if (!target) return
    startUpload(target)
  }

  const copyShareUrl = async (id, shareUrl) => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      updateUpload(id, { copied: true })
      setTimeout(() => updateUpload(id, { copied: false }), 1500)
    } catch {
      updateUpload(id, { error: 'Could not copy to clipboard' })
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const imageCount = uploads.filter((upload) => upload.previewUrl).length
  const totalSize = uploads.reduce((total, upload) => total + upload.size, 0)
  const sharedCount = uploads.filter((upload) => upload.status === 'success').length

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef2ff_38%,#ecfeff_100%)] px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[0.88fr_1.12fr]">
        <aside className="space-y-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            End-to-end encrypted transfer
          </div>

          <div className="max-w-xl space-y-4">
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-slate-950 sm:text-5xl">
              Securely share files with clean upload control.
            </h1>
            <p className="text-base leading-7 text-slate-600 sm:text-lg">
              Drag files into the vault, preview images before sending, and keep
              transfer details visible across every screen size.
            </p>
          </div>

          <div className="grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              ['256-bit', 'session keys'],
              ['7 days', 'auto expiry'],
              ['Zero', 'public indexing'],
            ].map(([value, label]) => (
              <div
                className="rounded-lg border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur"
                key={label}
              >
                <p className="text-2xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-sm text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-lg border border-white/80 bg-white/85 p-4 shadow-2xl shadow-slate-300/40 backdrop-blur-xl sm:p-6">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-normal text-teal-700">
                Secure file room
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
                Upload package
              </h2>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <Icon className="h-4 w-4 text-emerald-600">
                <path d="M12 3l7 4v5c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V7l7-4z" />
                <path d="M9.5 12l1.8 1.8 3.7-4" />
              </Icon>
              Private link ready
            </div>
          </div>

          <div
            className={`relative flex min-h-72 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition sm:p-8 ${
              isDragging
                ? 'border-teal-500 bg-teal-50 shadow-inner'
                : 'border-slate-300 bg-slate-50/80 hover:border-slate-400 hover:bg-white'
            }`}
            onDragEnter={(event) => {
              event.preventDefault()
              setIsDragging(true)
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return
              setIsDragging(false)
            }}
            onDrop={handleDrop}
            onClick={handleBrowseClick}
            role="button"
            tabIndex="0"
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleBrowseClick()
              }
            }}
          >
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              onChange={(event) => addFiles(event.target.files)}
            />

            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-slate-950 text-white shadow-lg shadow-slate-300">
              <Icon className="h-8 w-8">
                <path d="M12 16V4" />
                <path d="M7 9l5-5 5 5" />
                <path d="M20 16.5v1.75A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V16.5" />
              </Icon>
            </div>
            <p className="text-xl font-semibold text-slate-950">
              Drop files here to encrypt and share
            </p>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
              Image previews appear automatically. PDFs, documents, sheets, and
              archives stay listed with their transfer details.
            </p>
            <button
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2"
              type="button"
            >
              <Icon className="h-4 w-4">
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </Icon>
              Choose files
            </button>
          </div>

          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              onClick={() => setOptionsOpen((open) => !open)}
              aria-expanded={optionsOpen}
            >
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-slate-500">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </Icon>
                Sharing options
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                <span className="hidden sm:inline">{summarizeOptions(shareOptions)}</span>
                <Icon className={`h-4 w-4 transition-transform ${optionsOpen ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" />
                </Icon>
              </span>
            </button>

            {optionsOpen && (
              <div className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-3">
                  <span className="flex items-center justify-between">
                    Password (optional)
                    {shareOptions.password !== '' && (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline"
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Leave empty for no password"
                    className={`rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                      optionErrors.password
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200'
                    }`}
                    value={shareOptions.password}
                    onChange={(event) => updateOption('password', event.target.value)}
                  />
                  {optionErrors.password && (
                    <span className="text-[11px] text-rose-600">{optionErrors.password}</span>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Expiry (days)
                  <input
                    type="number"
                    min="1"
                    max={MAX_EXPIRY_DAYS}
                    placeholder="7"
                    className={`rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                      optionErrors.expiryDays
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200'
                    }`}
                    value={shareOptions.expiryDays}
                    onChange={(event) => updateOption('expiryDays', event.target.value)}
                  />
                  {optionErrors.expiryDays ? (
                    <span className="text-[11px] text-rose-600">{optionErrors.expiryDays}</span>
                  ) : (
                    <span className="text-[11px] font-normal text-slate-400">
                      Default 7, max {MAX_EXPIRY_DAYS}.
                    </span>
                  )}
                </label>

                <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                  Max downloads
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    className={`rounded-md border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 ${
                      optionErrors.maxDownloads
                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200'
                    }`}
                    value={shareOptions.maxDownloads}
                    onChange={(event) => updateOption('maxDownloads', event.target.value)}
                  />
                  {optionErrors.maxDownloads ? (
                    <span className="text-[11px] text-rose-600">{optionErrors.maxDownloads}</span>
                  ) : (
                    <span className="text-[11px] font-normal text-slate-400">
                      Leave empty for unlimited.
                    </span>
                  )}
                </label>

                <div className="flex items-center justify-between sm:col-span-3">
                  <p className="text-[11px] text-slate-500">
                    Applied to new uploads only. Existing links keep their original options.
                  </p>
                  <button
                    type="button"
                    onClick={resetOptions}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-white"
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {hasOptionErrors && (
            <p className="mt-2 text-xs text-rose-600">
              Fix the sharing options above before uploading.
            </p>
          )}

          <div className="mt-5 grid grid-cols-4 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">{uploads.length}</p>
              <p className="text-slate-500">files</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">{imageCount}</p>
              <p className="text-slate-500">previews</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">{sharedCount}</p>
              <p className="text-slate-500">shared</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">
                {formatFileSize(totalSize)}
              </p>
              <p className="text-slate-500">total</p>
            </div>
          </div>

          {uploads.length > 0 && (
            <div className="mt-5 space-y-3">
              {uploads.map((upload) => (
                <article
                  className="grid grid-cols-[56px_1fr_auto] items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  key={upload.id}
                >
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md bg-cyan-50 text-cyan-700">
                    {upload.previewUrl ? (
                      <img
                        className="h-full w-full object-cover"
                        src={upload.previewUrl}
                        alt={`Preview of ${upload.name}`}
                      />
                    ) : (
                      <Icon className="h-6 w-6">
                        <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
                        <path d="M14 2v5h5" />
                      </Icon>
                    )}
                  </div>

                  <div className="min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {upload.name}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[upload.status]}`}
                      >
                        {STATUS_LABELS[upload.status]}
                        {upload.status === 'uploading' ? ` ${upload.progress}%` : ''}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {formatFileSize(upload.size)} / {upload.type}
                    </p>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${PROGRESS_STYLES[upload.status]}`}
                        style={{
                          width: `${upload.status === 'success' ? 100 : upload.progress}%`,
                        }}
                      />
                    </div>

                    {upload.status === 'success' && upload.shareUrl && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={upload.shareUrl}
                          className="truncate rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          title={upload.shareUrl}
                        >
                          {upload.shareUrl}
                        </a>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                          onClick={(event) => {
                            event.stopPropagation()
                            copyShareUrl(upload.id, upload.shareUrl)
                          }}
                        >
                          {upload.copied ? 'Copied!' : 'Copy link'}
                        </button>
                        {upload.expiresAt && (
                          <span className="text-[11px] text-slate-500">
                            expires {new Date(upload.expiresAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    )}

                    {upload.status === 'error' && upload.error && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-rose-600">{upload.error}</p>
                        <button
                          type="button"
                          className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                          onClick={(event) => {
                            event.stopPropagation()
                            retryUpload(upload.id)
                          }}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    className="rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeFile(upload.id)
                    }}
                    aria-label={`Remove ${upload.name}`}
                    disabled={upload.status === 'deleting'}
                  >
                    <Icon className="h-5 w-5">
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </Icon>
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
