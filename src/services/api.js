const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '')

const readErrorMessage = async (response) => {
  try {
    const data = await response.json()
    if (data?.error) return data.error
  } catch {
    // not JSON
  }
  return `Request failed with status ${response.status}`
}

export const uploadFile = ({
  file,
  password,
  expiryDays,
  maxDownloads,
  onProgress,
  signal,
}) =>
  new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', file)
    if (password) form.append('password', password)
    if (expiryDays != null) form.append('expiryDays', String(expiryDays))
    if (maxDownloads != null) form.append('maxDownloads', String(maxDownloads))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/api/uploads`)
    xhr.responseType = 'json'

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    xhr.addEventListener('load', () => {
      const status = xhr.status
      const body = xhr.response

      if (status >= 200 && status < 300) {
        resolve(body)
        return
      }
      reject(new Error(body?.error ?? `Upload failed with status ${status}`))
    })

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    if (signal) {
      if (signal.aborted) {
        xhr.abort()
        return
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(form)
  })

export const deleteFile = async ({ shareToken, ownerToken }) => {
  const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(shareToken)}`, {
    method: 'DELETE',
    headers: { 'x-owner-token': ownerToken },
  })

  if (response.status === 204) return
  if (!response.ok) throw new Error(await readErrorMessage(response))
}

export const fetchFileMetadata = async (shareToken) => {
  const response = await fetch(`${API_BASE_URL}/api/files/${encodeURIComponent(shareToken)}`)
  if (!response.ok) throw new Error(await readErrorMessage(response))
  return response.json()
}

export const requestDownload = async ({ shareToken, password }) => {
  const response = await fetch(
    `${API_BASE_URL}/api/files/${encodeURIComponent(shareToken)}/download`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(password ? { password } : {}),
    }
  )
  if (!response.ok) throw new Error(await readErrorMessage(response))
  return response.json()
}

export { API_BASE_URL }
