import app from './app.js'
import { env } from './config/env.js'
import { connectDatabase } from './config/db.js'

async function startServer() {
  try {
    const databaseReady = await connectDatabase()
    if (env.nodeEnv === 'production' && !databaseReady) {
      throw new Error('DATABASE_URL is required and PostgreSQL must be reachable in production')
    }
  } catch (error) {
    if (env.nodeEnv === 'production') {
      console.error('PostgreSQL connection failed:', error.message)
      process.exit(1)
    }
    console.error('PostgreSQL connection failed. The server will still start:', error.message)
  }

  app.listen(env.port, () => {
    console.log(`LemonTrip API listening on http://localhost:${env.port}`)
  })
}

startServer().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
