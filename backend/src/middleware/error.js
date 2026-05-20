import multer from 'multer'
import { ZodError } from 'zod'
import { HttpError } from '../utils/httpError.js'

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` })
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message })
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Invalid request',
      details: err.flatten().fieldErrors,
    })
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File is too large.' })
    }
    return res.status(400).json({ error: err.message })
  }

  console.error('[unhandled error]', err)
  res.status(500).json({ error: 'Internal server error' })
}
