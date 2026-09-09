const visaServices = [
  { id: 'visa_france_tourist', country: 'France', visaType: 'Tourist Visa' },
  { id: 'visa_uk_tourist', country: 'United Kingdom', visaType: 'Tourist Visa' },
]

export function listServices(request, response) {
  const country = String(request.query.country || '').toLowerCase()
  const services = country
    ? visaServices.filter((service) => service.country.toLowerCase().includes(country))
    : visaServices

  return response.json({ success: true, data: { services, total: services.length } })
}

export function createApplication(request, response) {
  const { serviceId, personalDetails, passportDetails, travelDetails } = request.body
  if (!serviceId || !personalDetails || !passportDetails || !travelDetails) {
    return response.status(400).json({ success: false, error: { message: 'Visa service and application details are required' } })
  }

  return response.status(201).json({
    success: true,
    data: {
      applicationId: `visa_${Date.now()}`,
      status: 'submitted',
      serviceId,
      submittedBy: request.user.id,
    },
  })
}
