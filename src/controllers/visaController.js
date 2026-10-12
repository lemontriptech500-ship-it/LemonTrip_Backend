import { pool } from '../config/db.js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3Client } from '../config/s3.js'
import { env } from '../config/env.js'

const serviceFields = `
  id, country,
  visa_type AS "visaType",
  processing_time AS "processingTime",
  starting_from AS "startingFrom",
  image_url AS "imageUrl",
  documents
`

export async function listServices(request, response, next) {
  try {
    const country = String(request.query.country || '').toLowerCase()
    const visaType = String(request.query.visaType || '').toLowerCase()
    const filters = []
    const values = []

    if (country) {
      values.push(`%${country}%`)
      filters.push(`LOWER(country) LIKE $${values.length}`)
    }
    if (visaType) {
      values.push(`%${visaType}%`)
      filters.push(`LOWER(visa_type) LIKE $${values.length}`)
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const result = await pool.query(`SELECT ${serviceFields} FROM visa_services ${where} ORDER BY country`, values)

    return response.json({ success: true, data: { services: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getService(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${serviceFields} FROM visa_services WHERE id = $1 LIMIT 1`, [request.params.serviceId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Visa service not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}

function parseJsonField(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

export async function createApplication(request, response, next) {
  try {
    const serviceId = request.body.serviceId
    const personalDetails = parseJsonField(request.body.personalDetails)
    const passportDetails = parseJsonField(request.body.passportDetails)
    const travelDetails = parseJsonField(request.body.travelDetails)

    if (!serviceId || !personalDetails || !passportDetails || !travelDetails) {
      return response.status(400).json({ success: false, error: { message: 'Visa service and application details are required' } })
    }

    const service = await pool.query('SELECT id FROM visa_services WHERE id = $1', [serviceId])
    if (!service.rows[0]) {
      return response.status(404).json({ success: false, error: { message: 'Visa service not found' } })
    }

    const files = request.files || {}
    const applicationId = `LT-VISA-${Date.now().toString(36).toUpperCase()}`

    await pool.query(
      `INSERT INTO visa_applications (
        id, service_id, user_id, full_name, email, passport_number,
        intended_entry_date, passport_front_path, passport_back_path, photograph_path, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'submitted')`,
      [
        applicationId, serviceId, request.user?.id ?? null,
        personalDetails.fullName, personalDetails.email, passportDetails.passportNumber,
        travelDetails.intendedEntryDate || null,
        // multerS3 populates file.location with the full S3 object URL —
        // this is what gets stored in Postgres now instead of a local disk path.
        files.passportFront?.[0]?.location ?? null,
        files.passportBack?.[0]?.location ?? null,
        files.photograph?.[0]?.location ?? null,
      ],
    )

    return response.status(201).json({ success: true, data: { applicationId, status: 'submitted' } })
  } catch (error) {
    return next(error)
  }
}

export async function trackApplication(request, response, next) {
  try {
    const result = await pool.query(
      `SELECT a.id, s.country, s.visa_type AS "visaType",
              a.full_name AS "applicantName", a.status,
              TO_CHAR(a.submitted_at, 'YYYY-MM-DD') AS "submittedDate"
       FROM visa_applications a
       JOIN visa_services s ON s.id = a.service_id
       WHERE a.id = $1 AND a.user_id = $2`,
      [request.params.applicationId, request.user.id],
    )
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Application not found' } })

    return response.json({
      success: true,
      data: { ...result.rows[0], documents: ['Passport', 'Photograph'] },
    })
  } catch (error) {
    return next(error)
  }
}

export async function listApplications(request, response, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(request.query.limit, 10) || 50))
    const offset = Math.max(0, Number.parseInt(request.query.offset, 10) || 0)
    const [items, count] = await Promise.all([
      pool.query(
        `SELECT a.id, s.country, s.visa_type AS "visaType", a.status,
                a.submitted_at AS "submittedAt", a.passport_front_path,
                a.passport_back_path, a.photograph_path
         FROM visa_applications a JOIN visa_services s ON s.id = a.service_id
         WHERE a.user_id = $1 ORDER BY a.submitted_at DESC LIMIT $2 OFFSET $3`,
        [request.user.id, limit, offset],
      ),
      pool.query('SELECT count(*)::int AS total FROM visa_applications WHERE user_id = $1', [request.user.id]),
    ])
    const total = count.rows[0]?.total ?? 0
    return response.json({
      items: items.rows.map((row) => ({
        id: row.id, referenceId: row.id, country: row.country, visaType: row.visaType,
        status: row.status, createdAt: new Date(row.submittedAt).toISOString(),
        documents: {
          passportFront: Boolean(row.passport_front_path),
          passportBack: Boolean(row.passport_back_path),
          applicantPhoto: Boolean(row.photograph_path),
        },
      })),
      pagination: { total, hasMore: offset + items.rows.length < total },
    })
  } catch (error) {
    return next(error)
  }
}

/**
 * Returns a short-lived signed URL (5 min) to view a private visa document.
 * documentType must be one of: passport_front | passport_back | photograph
 */
export async function getApplicationDocument(request, response, next) {
  try {
    const { applicationId } = request.params
    const documentMap = { passportFront: 'passport_front', passportBack: 'passport_back', applicantPhoto: 'photograph', passport_front: 'passport_front', passport_back: 'passport_back', photograph: 'photograph' }
    const column = documentMap[request.params.documentType]
    if (!column) {
      return response.status(400).json({ success: false, error: { message: 'Invalid document type' } })
    }

    const result = await pool.query(
      'SELECT passport_front_path, passport_back_path, photograph_path FROM visa_applications WHERE id = $1 AND user_id = $2',
      [applicationId, request.user.id],
    )
    const row = result.rows[0]
    if (!row) return response.status(404).json({ success: false, error: { message: 'Application not found' } })

    const columnMap = {
      passport_front: row.passport_front_path,
      passport_back: row.passport_back_path,
      photograph: row.photograph_path,
    }
    const fileUrl = columnMap[column]
    if (!fileUrl) return response.status(404).json({ success: false, error: { message: 'Document not found' } })

    // Extract the S3 object key from the stored full URL
    const key = new URL(fileUrl).pathname.replace(/^\//, '')

    const command = new GetObjectCommand({ Bucket: env.awsS3Bucket, Key: key })
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 })

    // Keep the legacy website envelope and expose the flat mobile contract too.
    return response.json({ success: true, data: { url, expiresIn: 300 }, url, expiresIn: 300 })
  } catch (error) {
    return next(error)
  }
}
