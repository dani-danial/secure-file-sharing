import { useRef, useState } from 'react'

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'

  const units = ['Bytes', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / 1024 ** index

  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
}

const createUploadItem = (file) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
  file,
  name: file.name,
  size: file.size,
  type: file.type || 'Unknown file',
  previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
})

const Icon = ({ children, className = '' }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    {children}
  </svg>
)

function App() {
  const [isDragging, setIsDragging] = useState(false)
  const [uploads, setUploads] = useState([])
  const fileInputRef = useRef(null)

  const addFiles = (fileList) => {
    const nextFiles = Array.from(fileList).map(createUploadItem)

    setUploads((currentUploads) => [...nextFiles, ...currentUploads])
  }

  const removeFile = (id) => {
    setUploads((currentUploads) => {
      const fileToRemove = currentUploads.find((upload) => upload.id === id)

      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl)
      }

      return currentUploads.filter((upload) => upload.id !== id)
    })
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

          <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">{uploads.length}</p>
              <p className="text-slate-500">files</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-950">{imageCount}</p>
              <p className="text-slate-500">previews</p>
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
                  className="grid grid-cols-[56px_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
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
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {upload.name}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {formatFileSize(upload.size)} / {upload.type}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full w-4/5 rounded-full bg-emerald-500"></div>
                    </div>
                  </div>

                  <button
                    className="rounded-md p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      removeFile(upload.id)
                    }}
                    aria-label={`Remove ${upload.name}`}
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

export default App
