import { randomBytes, randomUUID } from 'node:crypto'

export const newShareToken = () => randomBytes(12).toString('base64url')

export const newOwnerToken = () => randomBytes(24).toString('base64url')

export const newFileId = () => randomUUID()

const SAFE_NAME_RE = /[^a-zA-Z0-9._-]+/g

export const sanitizeFileName = (name) => {
  const trimmed = (name ?? '').trim().replace(SAFE_NAME_RE, '_')
  const cleaned = trimmed.replace(/^_+|_+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'file'
}
