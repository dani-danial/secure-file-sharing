import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { supabase, BUCKET } from '../lib/supabase.js'
import { downloadLimiter } from '../middleware/rateLimit.js'
import { HttpError } from '../utils/httpError.js'
import { verifyPassword } from '../utils/password.js'

const router = Router()

const downloadBodySchema = z.object({
  password: z.string().min(1).max(128).optional(),
})

const isExpired = (file) => new Date(file.expires_at).getTime() <= Date.now()

const isDownloadCapped = (file) =>
  file.max_downloads != null && file.download_count >= file.max_downloads

const fetchFileByShareToken = async (shareToken) => {
  const result = await supabase
    .from('files')
    .select(
      'id, share_token, storage_path, original_name, mime_type, size_bytes, password_hash, max_downloads, download_count, expires_at, created_at'
    )
    .eq('share_token', shareToken)
    .maybeSingle()

  if (result.error) {
    throw new HttpError(500, `Lookup failed: ${result.error.message}`)
  }
  return result.data
}

router.get('/:shareToken', async (req, res, next) => {
  try {
    const file = await fetchFileByShareToken(req.params.shareToken)
    if (!file || isExpired(file) || isDownloadCapped(file)) {
      throw new HttpError(404, 'File not found or no longer available.')
    }

    res.json({
      shareToken: file.share_token,
      name: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
      hasPassword: Boolean(file.password_hash),
      expiresAt: file.expires_at,
      createdAt: file.created_at,
      downloadsLeft:
        file.max_downloads == null ? null : Math.max(0, file.max_downloads - file.download_count),
    })
  } catch (err) {
    next(err)
  }
})

router.post('/:shareToken/download', downloadLimiter, async (req, res, next) => {
  try {
    const { password } = downloadBodySchema.parse(req.body ?? {})
    const file = await fetchFileByShareToken(req.params.shareToken)

    if (!file || isExpired(file) || isDownloadCapped(file)) {
      throw new HttpError(404, 'File not found or no longer available.')
    }

    if (file.password_hash) {
      if (!password) {
        throw new HttpError(401, 'Password required.')
      }
      const ok = await verifyPassword(password, file.password_hash)
      if (!ok) {
        throw new HttpError(401, 'Incorrect password.')
      }
    }

    const updateQuery = supabase
      .from('files')
      .update({ download_count: file.download_count + 1 })
      .eq('id', file.id)
      .eq('download_count', file.download_count)

    if (file.max_downloads != null) {
      updateQuery.lt('download_count', file.max_downloads)
    }

    const updateResult = await updateQuery.select('download_count').maybeSingle()

    if (updateResult.error) {
      throw new HttpError(500, `Failed to update counter: ${updateResult.error.message}`)
    }
    if (!updateResult.data) {
      throw new HttpError(409, 'Download limit reached. Please try again.')
    }

    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_path, env.SIGNED_URL_TTL_SECONDS, {
        download: file.original_name,
      })

    if (signed.error || !signed.data?.signedUrl) {
      throw new HttpError(502, `Could not create signed URL: ${signed.error?.message ?? 'unknown'}`)
    }

    res.json({
      url: signed.data.signedUrl,
      expiresInSeconds: env.SIGNED_URL_TTL_SECONDS,
      downloadsLeft:
        file.max_downloads == null
          ? null
          : Math.max(0, file.max_downloads - updateResult.data.download_count),
    })
  } catch (err) {
    next(err)
  }
})

router.delete('/:shareToken', async (req, res, next) => {
  try {
    const ownerToken = req.header('x-owner-token')
    if (!ownerToken) {
      throw new HttpError(401, 'Missing x-owner-token header.')
    }

    const lookup = await supabase
      .from('files')
      .select('id, storage_path, owner_token')
      .eq('share_token', req.params.shareToken)
      .maybeSingle()

    if (lookup.error) {
      throw new HttpError(500, `Lookup failed: ${lookup.error.message}`)
    }
    if (!lookup.data) {
      throw new HttpError(404, 'File not found.')
    }
    if (lookup.data.owner_token !== ownerToken) {
      throw new HttpError(403, 'Invalid owner token.')
    }

    const removeResult = await supabase.storage.from(BUCKET).remove([lookup.data.storage_path])
    if (removeResult.error) {
      throw new HttpError(502, `Failed to remove file: ${removeResult.error.message}`)
    }

    const deleteResult = await supabase.from('files').delete().eq('id', lookup.data.id)
    if (deleteResult.error) {
      throw new HttpError(500, `Failed to delete metadata: ${deleteResult.error.message}`)
    }

    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

export default router
