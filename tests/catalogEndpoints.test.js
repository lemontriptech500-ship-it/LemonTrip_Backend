import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../src/config/db.js'
import { getPost, listPosts } from '../src/controllers/blogController.js'
import { createBlogPost } from '../src/controllers/adminController.js'
import { search as searchPackages } from '../src/controllers/packageController.js'
import { getApplicationDocument, listApplications, listServices } from '../src/controllers/visaController.js'

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('blog endpoint retains its catalog response fields', async (t) => {
  let sql = ''
  t.mock.method(pool, 'query', async (query) => { sql = query; return { rows: [{ id: 'blog-1', imageFallbackColor: 'bg', imageUrl: null, date: 'Jan 01, 2025', readTime: '5 min read' }], rowCount: 1 } })
  const response = responseRecorder()
  await listPosts({}, response, (error) => { throw error })
  assert.match(sql, /publication_status = 'published'/)
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.data, { posts: [{ id: 'blog-1', imageFallbackColor: 'bg', imageUrl: null, date: 'Jan 01, 2025', readTime: '5 min read' }], total: 1 })
})

test('admin can create a draft blog post without publishing it', async (t) => {
  let sql = ''
  let values = []
  t.mock.method(pool, 'query', async (query, params) => {
    sql = query
    values = params
    return { rows: [{ id: 'blog-draft', publicationStatus: 'draft' }], rowCount: 1 }
  })
  const response = responseRecorder()
  await createBlogPost({ body: { category: 'Guide', title: 'Draft article', excerpt: 'Excerpt', content: 'Content', publishedAt: '2026-10-04', publicationStatus: 'draft' } }, response, (error) => { throw error })
  assert.match(sql, /publication_status/)
  assert.equal(values.at(-1), 'draft')
  assert.equal(response.statusCode, 201)
  assert.equal(response.body.data.publicationStatus, 'draft')
})

test('public blog detail hides drafts', async (t) => {
  let sql = ''
  t.mock.method(pool, 'query', async (query) => { sql = query; return { rows: [] } })
  const response = responseRecorder()
  await getPost({ params: { postId: 'blog-draft' } }, response, (error) => { throw error })
  assert.match(sql, /publication_status = 'published'/)
  assert.equal(response.statusCode, 404)
})

test('public blog detail returns a published post by id', async (t) => {
  let sql = ''
  let values = []
  t.mock.method(pool, 'query', async (query, queryValues) => {
    sql = query
    values = queryValues
    return { rows: [{ id: 'blog-live', publicationStatus: 'published' }] }
  })
  const response = responseRecorder()
  await getPost({ params: { postId: 'blog-live' } }, response, (error) => { throw error })
  assert.match(sql, /publication_status = 'published'/)
  assert.deepEqual(values, ['blog-live'])
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.data.id, 'blog-live')
})

test('public blog detail returns 404 for missing ids and direct slug requests', async (t) => {
  const requestedIds = []
  t.mock.method(pool, 'query', async (_query, values) => {
    requestedIds.push(values[0])
    return { rows: [] }
  })
  for (const postId of ['missing-post', 'a-draft-post-slug']) {
    const response = responseRecorder()
    await getPost({ params: { postId } }, response, (error) => { throw error })
    assert.equal(response.statusCode, 404)
    assert.deepEqual(response.body, { success: false, error: { message: 'Blog post not found' } })
  }
  assert.deepEqual(requestedIds, ['missing-post', 'a-draft-post-slug'])
})

test('package search endpoint retains its nested collection response', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'pkg-1', startingPrice: 'From INR 10', category: 'national' }], rowCount: 1 }))
  const response = responseRecorder()
  await searchPackages({ query: { category: 'national' } }, response, (error) => { throw error })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.data, { packages: [{ id: 'pkg-1', startingPrice: 'From INR 10', category: 'national' }], total: 1 })
})

test('visa services endpoint retains its nested collection response', async (t) => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 'visa-1', visaType: 'Visitor', startingFrom: 'From INR 1', documents: ['Passport'] }], rowCount: 1 }))
  const response = responseRecorder()
  await listServices({ query: {} }, response, (error) => { throw error })
  assert.equal(response.statusCode, 200)
  assert.deepEqual(response.body.data, { services: [{ id: 'visa-1', visaType: 'Visitor', startingFrom: 'From INR 1', documents: ['Passport'] }], total: 1 })
})

test('visa application history matches the mobile response shape and scopes records to its user', async (t) => {
  const queries = []
  t.mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values })
    return queries.length === 1
      ? { rows: [{ id: 'LT-VISA-1', country: 'France', visaType: 'Visitor', status: 'submitted', submittedAt: new Date('2026-10-01T00:00:00Z'), passport_front_path: 's3://front', passport_back_path: null, photograph_path: 's3://photo' }] }
      : { rows: [{ total: 1 }] }
  })
  const response = responseRecorder()
  await listApplications({ query: { limit: '20', offset: '0' }, user: { id: 'user-1' } }, response, (error) => { throw error })
  assert.deepEqual(queries.map((entry) => entry.values[0]), ['user-1', 'user-1'])
  assert.deepEqual(response.body, {
    items: [{ id: 'LT-VISA-1', referenceId: 'LT-VISA-1', country: 'France', visaType: 'Visitor', status: 'submitted', createdAt: '2026-10-01T00:00:00.000Z', documents: { passportFront: true, passportBack: false, applicantPhoto: true } }],
    pagination: { total: 1, hasMore: false },
  })
})

test('visa document lookup rejects an application owned by another user', async (t) => {
  let sql = ''
  let values = []
  t.mock.method(pool, 'query', async (queryText, queryValues) => {
    sql = queryText
    values = queryValues
    return { rows: [] }
  })
  const response = responseRecorder()
  await getApplicationDocument({ params: { applicationId: 'LT-VISA-1', documentType: 'passportFront' }, user: { id: 'user-2' } }, response, (error) => { throw error })
  assert.match(sql, /user_id = \$2/)
  assert.deepEqual(values, ['LT-VISA-1', 'user-2'])
  assert.equal(response.statusCode, 404)
})
