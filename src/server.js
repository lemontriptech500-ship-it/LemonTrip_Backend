import app from './app.js'
import { env } from './config/env.js'
import { connectDatabase } from './config/db.js'

async function startServer() {
  try {
    await connectDatabase()
  } catch (error) {
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
