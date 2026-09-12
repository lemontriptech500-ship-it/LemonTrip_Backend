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
import trainRoutes from './routes/trainRoutes.js'
import paymentRoutes from './routes/paymentRoutes.js'
import bookingRoutes from './routes/bookingRoutes.js'
import walletRoutes from './routes/walletRoutes.js'
import { notFoundHandler, errorHandler } from './middlewares/errorHandler.js'

const app = express()

const isAllowedOrigin = (origin) => {
  if (!origin || env.frontendUrls.includes(origin)) return true
  return env.nodeEnv !== 'production' && /^https?:\/\/localhost:\d+$/.test(origin)
}

app.use(cors({ origin: (origin, callback) => callback(null, isAllowedOrigin(origin)), credentials: true }))
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
app.use('/api/v1/trains', trainRoutes)
app.use('/api/v1/payments', paymentRoutes)
app.use('/api/v1/bookings', bookingRoutes)
app.use('/api/v1/wallet', walletRoutes)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
