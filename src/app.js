import express from 'express'
import cors from 'cors'
import { env } from './config/env.js'
import authRoutes from './routes/authRoutes.js'
import visaRoutes from './routes/visaRoutes.js'
import flightRoutes from './routes/flightRoutes.js'
import blogRoutes from './routes/blogRoutes.js'
import packageRoutes from './routes/packageRoutes.js'
import hotelRoutes from './routes/hotelRoutes.js'
import busRoutes from './routes/busRoutes.js'
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js'

const app = express()

app.use(cors({ origin: env.frontendUrls, credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_request, response) => {
  response.json({ success: true, data: { status: 'ok', service: 'lemontrip-backend' } })
})

app.use('/api/v1/auth', authRoutes)
app.use('/api/v1/visa', visaRoutes)
app.use('/api/v1/flights', flightRoutes)
app.use('/api/v1/blog', blogRoutes)
app.use('/api/v1/packages', packageRoutes)
app.use('/api/v1/hotels', hotelRoutes)
app.use('/api/v1/buses', busRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
