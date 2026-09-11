import { pool } from '../config/db.js'

const postFields = `
  id, category, title, excerpt, content,
  image_fallback_color AS "imageFallbackColor",
  image_url AS "imageUrl",
  TO_CHAR(published_at, 'Mon DD, YYYY') AS date,
  read_time AS "readTime"
`

export async function listPosts(_request, response, next) {
  try {
    const result = await pool.query(`SELECT ${postFields} FROM blog_posts ORDER BY published_at DESC`)
    return response.json({ success: true, data: { posts: result.rows, total: result.rowCount } })
  } catch (error) {
    return next(error)
  }
}

export async function getPost(request, response, next) {
  try {
    const result = await pool.query(`SELECT ${postFields} FROM blog_posts WHERE id = $1 LIMIT 1`, [request.params.postId])
    if (!result.rows[0]) return response.status(404).json({ success: false, error: { message: 'Blog post not found' } })
    return response.json({ success: true, data: result.rows[0] })
  } catch (error) {
    return next(error)
  }
}