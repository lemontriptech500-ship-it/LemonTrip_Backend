import multer from 'multer'
import { PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3Client } from '../config/s3.js'
import { env } from '../config/env.js'
import { pool } from '../config/db.js'

const FILE_MAX_BYTES = 5 * 1024 * 1024
const PHOTOGRAPH_MAX_BYTES = 2 * 1024 * 1024

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

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

const allowedTypes = {
  passportFront: ['application/pdf', 'image/jpeg', 'image/png'],
  passportBack: ['application/pdf', 'image/jpeg', 'image/png'],
  photograph: ['image/jpeg', 'image/png'],
}

const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']

function visaFileFilter(req, file, cb) {
  const types = allowedTypes[file.fieldname] || []
  const ext = extname(file.originalname).toLowerCase()
  if (!types.includes(file.mimetype) || !allowedExtensions.includes(ext)) {
    return cb(badRequest('Unsupported file type. Use PDF, JPG or PNG (photograph: JPG or PNG).'))
  }
  return cb(null, true)
}

// Files are held in memory first, so size and type are checked before anything reaches S3.
const visaUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: visaFileFilter,
  limits: { fileSize: FILE_MAX_BYTES },
}).fields([
  { name: 'passportFront', maxCount: 1 },
  { name: 'passportBack', maxCount: 1 },
  { name: 'photograph', maxCount: 1 },
])

// Key format: visa/<country-visa_type>/<applicant>/<field>-<time>-<rand>.<ext>
async function buildKey(req, file) {
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

  let applicantSlug = 'unknown-applicant'
  if (req.body.personalDetails) {
    try {
      const personalDetails = JSON.parse(req.body.personalDetails)
      applicantSlug = slugify(personalDetails.fullName)
    } catch {
      // malformed JSON: fall back to 'unknown-applicant'
    }
  }

  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
  return `visa/${visaTypeSlug}/${applicantSlug}/${file.fieldname}-${unique}${extname(file.originalname).toLowerCase()}`
}

function publicUrl(key) {
  return `https://${env.awsS3Bucket}.s3.${env.awsRegion}.amazonaws.com/${key}`
}

async function removeUploaded(keys) {
  if (!keys.length) return
  try {
    await s3Client.send(
      new DeleteObjectsCommand({ Bucket: env.awsS3Bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }),
    )
  } catch (error) {
    console.error('Could not remove partially uploaded visa files', error)
  }
}

export function uploadVisaDocuments(request, response, next) {
  visaUpload(request, response, async (error) => {
    if (error) {
      if (error.name === 'MulterError') {
        return next(badRequest(error.code === 'LIMIT_FILE_SIZE'
          ? 'File is too large. Maximum size is 5 MB.'
          : 'Unexpected file upload field.'))
      }
      return next(error)
    }

    const files = Object.values(request.files || {}).flat()
    if (!files.length) return next()

    const photo = request.files?.photograph?.[0]
    if (photo && photo.size > PHOTOGRAPH_MAX_BYTES) {
      return next(badRequest('Photograph must be 2 MB or smaller.'))
    }

    const uploadedKeys = []
    try {
      await Promise.all(files.map(async (file) => {
        const key = await buildKey(request, file)
        await s3Client.send(new PutObjectCommand({
          Bucket: env.awsS3Bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }))
        uploadedKeys.push(key)
        file.key = key
        file.location = publicUrl(key)
        file.buffer = undefined
      }))
    } catch (uploadError) {
      console.error('Visa document upload to S3 failed', uploadError)
      await removeUploaded(uploadedKeys)
      const failure = new Error('Could not store documents. Please try again.')
      failure.status = 502
      return next(failure)
    }

    return next()
  })
}