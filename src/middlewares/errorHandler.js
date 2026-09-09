export function notFoundHandler(request, response) {
  response.status(404).json({
    success: false,
    error: { message: `Route not found: ${request.method} ${request.originalUrl}` },
  })
}

export function errorHandler(error, request, response, next) {
  console.error(error)
  if (response.headersSent) return next(error)

  response.status(error.status || 500).json({
    success: false,
    error: {
      message: error.status ? error.message : 'Internal server error',
    },
  })
}
