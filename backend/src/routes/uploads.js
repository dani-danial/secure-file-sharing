import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { env } from '../config/env.js'
import { supabase, BUCKET } from '../lib/supabase.js'
import { uploadLimiter } from '../middleware/rateLimit.js'
import { HttpError } from '../utils/httpError.js'
import { hashPassword } from '../utils/password.js'
import {
  newFileId,
  newOwnerToken,
  newShareToken,
  sanitizeFileName,
} from '../utils/tokens.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_BYTES, files: 1 },
})

const bodySchema = z.object({
  password: z
    .string()
    .min(4)
    .max(128)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  maxDownloads: z
    .preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().positive().max(10_000))
    .optional(),
  expiryDays: z
    .preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().int().positive().max(env.MAX_EXPIRY_DAYS))
    .optional(),
})

const router = Router()

router.post('/', uploadLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new HttpError(400, 'A file is required in the "file" field.')
    }

    const parsed = bodySchema.parse(req.body ?? {})

    const id = newFileId()
    const safeName = sanitizeFileName(req.file.originalname)
    const storagePath = `${id}/${safeName}`

    const uploadResult = await supabase.storage.from(BUCKET).upload(storagePath, req.file.buffer, {
      contentType: req.file.mimetype || 'application/octet-stream',
      upsert: false,
    })

    if (uploadResult.error) {
      throw new HttpError(502, `Storage upload failed: ${uploadResult.error.message}`)
    }

    const shareToken = newShareToken()
    const ownerToken = newOwnerToken()
    const expiryDays = parsed.expiryDays ?? env.DEFAULT_EXPIRY_DAYS
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    const passwordHash = parsed.password ? await hashPassword(parsed.password) : null

    const insertResult = await supabase
      .from('files')
      .insert({
        id,
        share_token: shareToken,
        owner_token: ownerToken,
        storage_path: storagePath,
        original_name: req.file.originalname,
        mime_type: req.file.mimetype || 'application/octet-stream',
        size_bytes: req.file.size,
        password_hash: passwordHash,
        max_downloads: parsed.maxDownloads ?? null,
        expires_at: expiresAt.toISOString(),
      })
      .select('share_token, owner_token, expires_at')
      .single()

    if (insertResult.error) {
      await supabase.storage.from(BUCKET).remove([storagePath])
      throw new HttpError(500, `Failed to save file metadata: ${insertResult.error.message}`)
    }

    res.status(201).json({
      shareToken: insertResult.data.share_token,
      ownerToken: insertResult.data.owner_token,
      expiresAt: insertResult.data.expires_at,
      shareUrl: `${env.PUBLIC_SHARE_BASE_URL}/${insertResult.data.share_token}`,
      hasPassword: Boolean(passwordHash),
      maxDownloads: parsed.maxDownloads ?? null,
    })
  } catch (err) {
    next(err)
  }
})

export default router
