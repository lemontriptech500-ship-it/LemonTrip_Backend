import multer from 'multer'
import multerS3 from 'multer-s3'
import { s3Client } from '../config/s3.js'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

function slugify(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'unknown'
  )
}

function extname(filename) {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot)
}

const storage = multerS3({
  s3: s3Client,
  bucket: env.awsS3Bucket,
  key: async (req, file, cb) => {
    try {
      // Look up the visa type/country so the folder name is human-readable,
      // e.g. "france-schengen-tourist-visa" instead of the raw serviceId.
      let visaTypeSlug = 'unknown-visa-type'
      if (req.body.serviceId) {
        const result = await pool.query(
          'SELECT country, visa_type FROM visa_services WHERE id = $1',
          [req.body.serviceId],
        )
        const service = result.rows[0]
        if (service) {
          visaTypeSlug = slugify(`${service.country}-${service.visa_type}`)
        }
      }

      // personalDetails arrives as a JSON string field, not yet parsed —
      // parse it here to pull the applicant's name for the folder.
      let applicantSlug = 'unknown-applicant'
      if (req.body.personalDetails) {
        try {
          const personalDetails = JSON.parse(req.body.personalDetails)
          applicantSlug = slugify(personalDetails.fullName)
        } catch {
          // malformed JSON — fall back to 'unknown-applicant' rather than fail the upload
        }
      }

      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
      const key = `visa/${visaTypeSlug}/${applicantSlug}/${file.fieldname}-${unique}${extname(file.originalname)}`
      cb(null, key)
    } catch (error) {
      cb(error)
    }
  },
})

export const uploadVisaDocuments = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
}).fields([
  { name: 'passportFront', maxCount: 1 },
  { name: 'passportBack', maxCount: 1 },
  { name: 'photograph', maxCount: 1 },
])