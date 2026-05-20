import { env } from './config/env.js'
import { createApp } from './app.js'

const app = createApp()

const server = app.listen(env.PORT, () => {
  console.log(`Backend listening on http://localhost:${env.PORT}`)
})

const shutdown = (signal) => {
  console.log(`\nReceived ${signal}. Closing server...`)
  server.close((err) => {
    if (err) {
      console.error('Error during shutdown:', err)
      process.exit(1)
    }
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
