import crypto from 'node:crypto'
import Razorpay from 'razorpay'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

const MIN_TOPUP_PAISE = 10000
const MAX_TOPUP_PAISE = 10000000

function getRazorpay() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const error = new Error('Razorpay is not configured on the server')
    error.status = 503
    throw error
  }
  return new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret })
}

function makeReference(prefix) {
  return `LT-${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

function parseAmountPaise(value) {
  const amount = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(Math.round(amount * 100))) return null
  const amountPaise = Math.round(amount * 100)
  return amountPaise >= MIN_TOPUP_PAISE && amountPaise <= MAX_TOPUP_PAISE ? amountPaise : null
}

async function ensureWallet(client, userId) {
  const result = await client.query(
    `INSERT INTO wallets (user_id) VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, user_id AS "userId", balance_paise AS "balancePaise", currency, status`,
    [userId],
  )
  return result.rows[0]
}

export async function getWallet(request, response, next) {
  const client = await pool.connect()
  try {
    const wallet = await ensureWallet(client, request.user.id)
    return response.json({
      success: true,
      data: {
        id: wallet.id,
        balance: Number(wallet.balancePaise) / 100,
        currency: wallet.currency,
        status: wallet.status,
      },
    })
  } catch (error) {
    return next(error)
  } finally {
    client.release()
  }
}

export async function createTopupOrder(request, response, next) {
  const client = await pool.connect()
  try {
    const amountPaise = parseAmountPaise(request.body.amount)
    if (!amountPaise) {
      return response.status(400).json({ success: false, error: { message: 'Top-up amount must be between INR 100 and INR 100,000' } })
    }

    const wallet = await ensureWallet(client, request.user.id)
    if (wallet.status !== 'active') {
      return response.status(403).json({ success: false, error: { message: 'Wallet is not active' } })
    }

    const topupReference = makeReference('WTU')
    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: wallet.currency,
      receipt: topupReference,
      notes: { topupReference, userId: request.user.id },
    })

    const result = await client.query(
      `INSERT INTO wallet_topups (user_id, wallet_id, topup_reference, amount_paise, razorpay_order_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, topup_reference AS "topupReference"`,
      [request.user.id, wallet.id, topupReference, amountPaise, order.id],
    )

    return response.status(201).json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: env.razorpayKeyId,
        topupId: result.rows[0].id,
        topupReference: result.rows[0].topupReference,
      },
    })
  } catch (error) {
    return next(error)
  } finally {
    client.release()
  }
}

export async function verifyTopup(request, response, next) {
  const client = await pool.connect()
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = request.body
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return response.status(400).json({ success: false, error: { message: 'Payment verification details are required' } })
    }
    if (!env.razorpayKeySecret) {
      const error = new Error('Razorpay is not configured on the server')
      error.status = 503
      throw error
    }

    const expectedSignature = crypto.createHmac('sha256', env.razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex')
    const signaturesMatch = expectedSignature.length === razorpaySignature.length
      && crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(razorpaySignature))
    if (!signaturesMatch) {
      return response.status(400).json({ success: false, error: { message: 'Invalid payment signature' } })
    }

    await client.query('BEGIN')
    const topupResult = await client.query(
      `SELECT id, wallet_id, topup_reference, amount_paise, status
       FROM wallet_topups
       WHERE user_id = $1 AND razorpay_order_id = $2
       FOR UPDATE`,
      [request.user.id, razorpayOrderId],
    )
    const topup = topupResult.rows[0]
    if (!topup) {
      await client.query('ROLLBACK')
      return response.status(404).json({ success: false, error: { message: 'Top-up order not found' } })
    }
    if (topup.status === 'SUCCESS') {
      const wallet = await client.query('SELECT balance_paise AS "balancePaise", currency FROM wallets WHERE id = $1', [topup.wallet_id])
      await client.query('COMMIT')
      return response.json({ success: true, data: { status: 'SUCCESS', balance: Number(wallet.rows[0].balancePaise) / 100, currency: wallet.rows[0].currency } })
    }
    if (topup.status !== 'PENDING') {
      await client.query('ROLLBACK')
      return response.status(409).json({ success: false, error: { message: 'Top-up is not payable' } })
    }

    const walletResult = await client.query(
      `SELECT id, balance_paise AS "balancePaise", currency, status
       FROM wallets WHERE id = $1 FOR UPDATE`,
      [topup.wallet_id],
    )
    const wallet = walletResult.rows[0]
    if (!wallet || wallet.status !== 'active') {
      await client.query('ROLLBACK')
      return response.status(403).json({ success: false, error: { message: 'Wallet is not active' } })
    }

    const balanceBefore = BigInt(wallet.balancePaise)
    const amount = BigInt(topup.amount_paise)
    const balanceAfter = balanceBefore + amount
    await client.query(
      `UPDATE wallets SET balance_paise = $1, updated_at = NOW() WHERE id = $2`,
      [balanceAfter.toString(), wallet.id],
    )
    await client.query(
      `INSERT INTO wallet_transactions
       (wallet_id, user_id, transaction_reference, type, source, amount_paise, balance_before_paise, balance_after_paise, status, description, payment_reference)
       VALUES ($1, $2, $3, 'CREDIT', 'TOPUP', $4, $5, $6, 'SUCCESS', $7, $8)`,
      [wallet.id, request.user.id, topup.topup_reference, topup.amount_paise, balanceBefore.toString(), balanceAfter.toString(), 'Wallet top-up', razorpayPaymentId],
    )
    await client.query(
      `UPDATE wallet_topups SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'SUCCESS', updated_at = NOW()
       WHERE id = $3`,
      [razorpayPaymentId, razorpaySignature, topup.id],
    )
    await client.query('COMMIT')
    return response.json({ success: true, data: { status: 'SUCCESS', balance: Number(balanceAfter) / 100, currency: wallet.currency } })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    return next(error)
  } finally {
    client.release()
  }
}

export async function getTransactions(request, response, next) {
  try {
    const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1)
    const limit = Math.min(50, Math.max(1, Number.parseInt(request.query.limit, 10) || 20))
    const offset = (page - 1) * limit
    const values = [request.user.id]
    const filters = ['user_id = $1']
    if (request.query.type === 'CREDIT' || request.query.type === 'DEBIT') {
      values.push(request.query.type)
      filters.push(`type = $${values.length}`)
    }
    if (request.query.status) {
      values.push(String(request.query.status).toUpperCase())
      filters.push(`status = $${values.length}`)
    }
    const count = await pool.query(`SELECT COUNT(*)::int AS total FROM wallet_transactions WHERE ${filters.join(' AND ')}`, values)
    values.push(limit, offset)
    const result = await pool.query(
      `SELECT id, transaction_reference AS "transactionReference", type, source,
              amount_paise / 100.0 AS amount, status, description,
              booking_reference AS "bookingReference", payment_reference AS "paymentReference", created_at AS date
       FROM wallet_transactions WHERE ${filters.join(' AND ')}
       ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
    return response.json({ success: true, data: { transactions: result.rows, page, limit, total: count.rows[0].total } })
  } catch (error) {
    return next(error)
  }
}
