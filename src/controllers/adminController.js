import { pool } from '../config/db.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '../config/s3.js'
import { env } from '../config/env.js'

// ---------- helpers ----------

function pageParams(request, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(request.query.page, 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(request.query.limit, 10) || defaultLimit))
  return { page, limit, offset: (page - 1) * limit }
}

function meta(total, page, limit) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) }
}

// ---------- dashboard overview ----------

export async function getStats(_request, response, next) {
  try {
    const [
      users,
      flightBookings,
      travelBookings,
      busBookings,
      revenue,
      activeCoupons,
      pendingVisaApplications,
      unreadMessages,
      newsletterSubscribers,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM users'),
      pool.query("SELECT COUNT(*)::int AS count FROM flight_bookings WHERE status = 'confirmed'"),
      pool.query("SELECT COUNT(*)::int AS count FROM travel_bookings WHERE status ILIKE 'confirmed%' OR status = 'CONFIRMED'"),
      pool.query("SELECT COUNT(*)::int AS count FROM bus_bookings WHERE status = 'confirmed'"),
      pool.query(`
        SELECT ROUND((
          COALESCE((SELECT SUM(amount_paise) FROM flight_bookings WHERE status = 'confirmed'), 0) +
          COALESCE((SELECT SUM(amount_paise) FROM travel_bookings WHERE status ILIKE 'confirmed%' OR status = 'CONFIRMED'), 0) +
          COALESCE((SELECT SUM(amount_paise) FROM bus_bookings WHERE status = 'confirmed'), 0)
        ) / 100.0, 2)::float AS total
      `),
      pool.query("SELECT COUNT(*)::int AS count FROM coupons WHERE active = TRUE AND valid_until >= CURRENT_DATE"),
      pool.query("SELECT COUNT(*)::int AS count FROM visa_applications WHERE status = 'submitted'"),
      pool.query("SELECT COUNT(*)::int AS count FROM contact_messages WHERE status = 'received'"),
      pool.query('SELECT COUNT(*)::int AS count FROM newsletter_subscribers WHERE active = TRUE'),
    ])

    return response.json({
      success: true,
      data: {
        totalUsers: users.rows[0].count,
        totalBookings: flightBookings.rows[0].count + travelBookings.rows[0].count + busBookings.rows[0].count,
        confirmedRevenue: revenue.rows[0].total,
        activeCoupons: activeCoupons.rows[0].count,
        pendingVisaApplications: pendingVisaApplications.rows[0].count,
        unreadContactMessages: unreadMessages.rows[0].count,
        newsletterSubscribers: newsletterSubscribers.rows[0].count,
      },
    })
  } catch (error) {
    return next(error)
  }
}

// ---------- users ----------

export async function listUsers(request, response, next) {
  try {
    const { page, limit, offset } = pageParams(request)
    const search = String(request.query.search || '').trim()
    const values = []
    let where = ''
    if (search) {
      values.push(`%${search}%`)
      where = `WHERE name ILIKE $${values.length} OR email ILIKE $${values.length}`
    }

    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM users ${where}`, values)
    values.push(limit, offset)
    const result = await pool.query(
      `SELECT id, name, email, phone, provider, created_at AS "createdAt"
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )

    return response.json({ success: true, data: result.rows, meta: meta(countResult.rows[0].count, page, limit) })
  } catch (error) {
    return next(error)
  }
}

export async function getUser(request, response, next) {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, provider, created_at AS "createdAt" FROM users WHERE id = $1',
      [request.params.userId],
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'User not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

// ---------- bookings (all users) ----------

export async function listBookings(request, response, next) {
  try {
    const { page, limit, offset } = pageParams(request)
    const type = String(request.query.type || 'all').toLowerCase()
    const status = String(request.query.status || '').trim()

    const unionSql = `
      SELECT b.id, b.booking_reference AS "bookingReference", 'flight' AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency, b.user_id AS "userId", u.name AS "userName", u.email AS "userEmail",
        CONCAT(COALESCE(f.origin, 'Unknown'), ' to ', COALESCE(f.destination, 'Unknown')) AS title
      FROM flight_bookings b
      LEFT JOIN flights f ON f.id = b.flight_id
      LEFT JOIN users u ON u.id = b.user_id
      UNION ALL
      SELECT b.id, b.booking_reference AS "bookingReference", b.item_type AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency, b.user_id AS "userId", u.name AS "userName", u.email AS "userEmail",
        CASE
          WHEN b.item_type = 'hotel' THEN COALESCE(h.name, 'Hotel booking')
          WHEN b.item_type = 'train' THEN COALESCE(ts.name, 'Train booking')
          WHEN b.item_type = 'package' THEN COALESCE(tp.destination, 'Package booking')
          ELSE INITCAP(b.item_type) || ' booking'
        END AS title
      FROM travel_bookings b
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN hotels h ON b.item_type = 'hotel' AND h.id = b.item_id
      LEFT JOIN train_services ts ON b.item_type = 'train' AND ts.id = b.item_id
      LEFT JOIN travel_packages tp ON b.item_type = 'package' AND tp.id = b.item_id
      UNION ALL
      SELECT b.id, b.booking_reference AS "bookingReference", 'bus' AS type,
        b.status, b.created_at AS date, ROUND(b.amount_paise / 100.0, 2)::float AS amount,
        b.currency, b.user_id AS "userId", u.name AS "userName", u.email AS "userEmail",
        CONCAT(COALESCE(bs.origin, 'Unknown'), ' to ', COALESCE(bs.destination, 'Unknown')) AS title
      FROM bus_bookings b
      LEFT JOIN bus_services bs ON bs.id = b.bus_id
      LEFT JOIN users u ON u.id = b.user_id
    `

    const filters = []
    const values = []
    if (type !== 'all') {
      values.push(type)
      filters.push(`type = $${values.length}`)
    }
    if (status) {
      values.push(status)
      filters.push(`status = $${values.length}`)
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''

    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM (${unionSql}) all_bookings ${where}`, values)
    values.push(limit, offset)
    const result = await pool.query(
      `SELECT * FROM (${unionSql}) all_bookings ${where}
       ORDER BY date DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )

    return response.json({ success: true, data: result.rows, meta: meta(countResult.rows[0].count, page, limit) })
  } catch (error) {
    return next(error)
  }
}

// ---------- coupons ----------

export async function listCoupons(_request, response, next) {
  try {
    const result = await pool.query(`
      SELECT id, code, discount_type AS "discountType", discount_value AS "discountValue",
        min_order_paise AS "minOrderPaise", max_discount_paise AS "maxDiscountPaise",
        TO_CHAR(valid_until, 'YYYY-MM-DD') AS "validUntil", applicable_on AS "applicableOn",
        active, created_at AS "createdAt"
      FROM coupons ORDER BY created_at DESC
    `)
    return response.json({ success: true, data: result.rows })
  } catch (error) {
    return next(error)
  }
}

export async function createCoupon(request, response, next) {
  try {
    const { code, discountType, discountValue, minOrderPaise = 0, maxDiscountPaise, validUntil, applicableOn = [] } = request.body
    if (!code || !['percentage', 'flat'].includes(discountType) || !discountValue || !maxDiscountPaise || !validUntil) {
      return response.status(400).json({ success: false, error: { message: 'code, discountType, discountValue, maxDiscountPaise and validUntil are required' } })
    }
    const result = await pool.query(
      `INSERT INTO coupons (code, discount_type, discount_value, min_order_paise, max_discount_paise, valid_until, applicable_on)
       VALUES (UPPER($1), $2, $3, $4, $5, $6, $7)
       RETURNING id, code, discount_type AS "discountType", discount_value AS "discountValue",
         min_order_paise AS "minOrderPaise", max_discount_paise AS "maxDiscountPaise",
         TO_CHAR(valid_until, 'YYYY-MM-DD') AS "validUntil", applicable_on AS "applicableOn", active`,
      [code.trim(), discountType, discountValue, minOrderPaise, maxDiscountPaise, validUntil, applicableOn],
    )
    return response.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ success: false, error: { message: 'A coupon with this code already exists' } })
    return next(error)
  }
}

export async function updateCoupon(request, response, next) {
  try {
    const fields = { discount_type: 'discountType', discount_value: 'discountValue', min_order_paise: 'minOrderPaise', max_discount_paise: 'maxDiscountPaise', valid_until: 'validUntil', applicable_on: 'applicableOn', active: 'active' }
    const sets = []
    const values = []
    for (const [column, key] of Object.entries(fields)) {
      if (request.body[key] !== undefined) {
        values.push(request.body[key])
        sets.push(`${column} = $${values.length}`)
      }
    }
    if (!sets.length) return response.status(400).json({ success: false, error: { message: 'No fields to update' } })
    values.push(request.params.couponId)
    const result = await pool.query(
      `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${values.length}
       RETURNING id, code, discount_type AS "discountType", discount_value AS "discountValue",
         min_order_paise AS "minOrderPaise", max_discount_paise AS "maxDiscountPaise",
         TO_CHAR(valid_until, 'YYYY-MM-DD') AS "validUntil", applicable_on AS "applicableOn", active`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Coupon not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function deleteCoupon(request, response, next) {
  try {
    const result = await pool.query('DELETE FROM coupons WHERE id = $1', [request.params.couponId])
    if (!result.rowCount) return response.status(404).json({ success: false, error: { message: 'Coupon not found' } })
    return response.json({ success: true, data: { deleted: true } })
  } catch (error) {
    return next(error)
  }
}

// ---------- blog ----------

const adminPostFields = `
  id, category, title, excerpt, content,
  image_fallback_color AS "imageFallbackColor",
  image_url AS "imageUrl",
  TO_CHAR(published_at, 'YYYY-MM-DD') AS "publishedAt",
  read_time AS "readTime"
`

export async function listBlogPostsAdmin(_request, response, next) {
  try {
    const result = await pool.query(`SELECT ${adminPostFields} FROM blog_posts ORDER BY published_at DESC`)
    return response.json({ success: true, data: result.rows })
  } catch (error) {
    return next(error)
  }
}

function slugify(title) {
  return String(title).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 70)
}

export async function createBlogPost(request, response, next) {
  try {
    const { category, title, excerpt, content, imageFallbackColor = 'bg-[var(--color-primary-soft)]', imageUrl = null, publishedAt, readTime = '5 min read' } = request.body
    if (!category || !title || !excerpt || !content || !publishedAt) {
      return response.status(400).json({ success: false, error: { message: 'category, title, excerpt, content and publishedAt are required' } })
    }
    const id = `blog-${slugify(title)}-${Date.now().toString(36)}`
    const result = await pool.query(
      `INSERT INTO blog_posts (id, category, title, excerpt, content, image_fallback_color, image_url, published_at, read_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${adminPostFields}`,
      [id, category, title, excerpt, content, imageFallbackColor, imageUrl, publishedAt, readTime],
    )
    return response.status(201).json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function updateBlogPost(request, response, next) {
  try {
    const fields = { category: 'category', title: 'title', excerpt: 'excerpt', content: 'content', image_fallback_color: 'imageFallbackColor', image_url: 'imageUrl', published_at: 'publishedAt', read_time: 'readTime' }
    const sets = []
    const values = []
    for (const [column, key] of Object.entries(fields)) {
      if (request.body[key] !== undefined) {
        values.push(request.body[key])
        sets.push(`${column} = $${values.length}`)
      }
    }
    if (!sets.length) return response.status(400).json({ success: false, error: { message: 'No fields to update' } })
    values.push(request.params.postId)
    const result = await pool.query(
      `UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${adminPostFields}`,
      values,
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Blog post not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function deleteBlogPost(request, response, next) {
  try {
    const result = await pool.query('DELETE FROM blog_posts WHERE id = $1', [request.params.postId])
    if (!result.rowCount) return response.status(404).json({ success: false, error: { message: 'Blog post not found' } })
    return response.json({ success: true, data: { deleted: true } })
  } catch (error) {
    return next(error)
  }
}

// ---------- visa applications ----------

export async function listVisaApplications(request, response, next) {
  try {
    const { page, limit, offset } = pageParams(request)
    const status = String(request.query.status || '').trim()
    const values = []
    let where = ''
    if (status) {
      values.push(status)
      where = `WHERE a.status = $${values.length}`
    }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM visa_applications a ${where}`, values)
    values.push(limit, offset)
    const result = await pool.query(
      `SELECT a.id, s.country, s.visa_type AS "visaType", a.full_name AS "applicantName",
              a.email, a.passport_number AS "passportNumber", a.status,
              TO_CHAR(a.submitted_at, 'YYYY-MM-DD HH24:MI') AS "submittedAt"
       FROM visa_applications a
       JOIN visa_services s ON s.id = a.service_id
       ${where}
       ORDER BY a.submitted_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
    return response.json({ success: true, data: result.rows, meta: meta(countResult.rows[0].count, page, limit) })
  } catch (error) {
    return next(error)
  }
}

export async function getVisaApplicationAdmin(request, response, next) {
  try {
    const result = await pool.query(
      `SELECT a.id, s.country, s.visa_type AS "visaType", a.full_name AS "applicantName",
              a.email, a.passport_number AS "passportNumber", a.status,
              a.intended_entry_date AS "intendedEntryDate",
              TO_CHAR(a.submitted_at, 'YYYY-MM-DD HH24:MI') AS "submittedAt"
       FROM visa_applications a
       JOIN visa_services s ON s.id = a.service_id
       WHERE a.id = $1`,
      [request.params.applicationId],
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Application not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function updateVisaApplicationStatus(request, response, next) {
  try {
    const status = String(request.body.status || '')
    const allowed = ['submitted', 'in_review', 'approved', 'rejected']
    if (!allowed.includes(status)) {
      return response.status(400).json({ success: false, error: { message: `status must be one of: ${allowed.join(', ')}` } })
    }
    const result = await pool.query(
      'UPDATE visa_applications SET status = $1 WHERE id = $2 RETURNING id, status',
      [status, request.params.applicationId],
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Application not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

export async function getVisaApplicationDocumentAdmin(request, response, next) {
  try {
    const { applicationId, documentType } = request.params
    const allowedTypes = ['passport_front', 'passport_back', 'photograph']
    if (!allowedTypes.includes(documentType)) {
      return response.status(400).json({ success: false, error: { message: 'Invalid document type' } })
    }
    const result = await pool.query(
      'SELECT passport_front_path, passport_back_path, photograph_path FROM visa_applications WHERE id = $1',
      [applicationId],
    )
    const row = result.rows[0]
    if (!row) return response.status(404).json({ success: false, error: { message: 'Application not found' } })
    const columnMap = { passport_front: row.passport_front_path, passport_back: row.passport_back_path, photograph: row.photograph_path }
    const fileUrl = columnMap[documentType]
    if (!fileUrl) return response.status(404).json({ success: false, error: { message: 'Document not found' } })
    const key = new URL(fileUrl).pathname.replace(/^\//, '')
    const command = new GetObjectCommand({ Bucket: env.awsS3Bucket, Key: key })
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 })
    return response.json({ success: true, data: { url } })
  } catch (error) {
    return next(error)
  }
}

// ---------- contact messages ----------

export async function listContactMessages(request, response, next) {
  try {
    const { page, limit, offset } = pageParams(request)
    const status = String(request.query.status || '').trim()
    const values = []
    let where = ''
    if (status) {
      values.push(status)
      where = `WHERE status = $${values.length}`
    }
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM contact_messages ${where}`, values)
    values.push(limit, offset)
    const result = await pool.query(
      `SELECT id, name, email, phone, subject, message, status, created_at AS "createdAt"
       FROM contact_messages ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
    return response.json({ success: true, data: result.rows, meta: meta(countResult.rows[0].count, page, limit) })
  } catch (error) {
    return next(error)
  }
}

export async function updateContactMessageStatus(request, response, next) {
  try {
    const status = String(request.body.status || '')
    const allowed = ['received', 'email_sent', 'email_failed', 'resolved']
    if (!allowed.includes(status)) {
      return response.status(400).json({ success: false, error: { message: `status must be one of: ${allowed.join(', ')}` } })
    }
    // 'resolved' is an admin-only status not in the original DB check constraint;
    // store it as email_sent if the constraint rejects it, otherwise store as-is.
    try {
      const result = await pool.query('UPDATE contact_messages SET status = $1 WHERE id = $2 RETURNING id, status', [status, request.params.messageId])
      if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Message not found' } })
      return response.json({ success: true, data: result.rows[0] })
    } catch (error) {
      if (error.code === '23514') {
        return response.status(400).json({ success: false, error: { message: "This backend's contact_messages status column does not yet allow 'resolved'. Run: ALTER TABLE contact_messages DROP CONSTRAINT contact_messages_status_check, then re-add it including 'resolved'." } })
      }
      throw error
    }
  } catch (error) {
    return next(error)
  }
}

// ---------- newsletter subscribers ----------

export async function listNewsletterSubscribers(request, response, next) {
  try {
    const { page, limit, offset } = pageParams(request)
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM newsletter_subscribers')
    const result = await pool.query(
      `SELECT id, email, active, source, subscribed_at AS "subscribedAt", unsubscribed_at AS "unsubscribedAt"
       FROM newsletter_subscribers
       ORDER BY subscribed_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    return response.json({ success: true, data: result.rows, meta: meta(countResult.rows[0].count, page, limit) })
  } catch (error) {
    return next(error)
  }
}
