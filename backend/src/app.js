import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import uploadsRouter from './routes/uploads.js'
import filesRouter from './routes/files.js'

export const createApp = () => {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((value) => value.trim()),
      credentials: false,
    })
  )
  app.use(express.json({ limit: '256kb' }))

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() })
  })

  app.use('/api/uploads', uploadsRouter)
  app.use('/api/files', filesRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
