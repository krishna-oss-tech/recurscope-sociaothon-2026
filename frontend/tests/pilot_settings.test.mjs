import test from 'node:test'
import assert from 'node:assert/strict'

// Validation logic mirror matching PilotSettings component and backend schema
function validatePilotFields(vals) {
  const errors = {}

  // Name
  const trimmedName = (vals.name || '').trim()
  if (!trimmedName) {
    errors.name = 'Pilot area name is required.'
  } else if (trimmedName.length > 100) {
    errors.name = 'Pilot area name must be 100 characters or fewer.'
  }

  // Latitude
  const trimmedLat = (vals.latitude !== undefined && vals.latitude !== null ? String(vals.latitude) : '').trim()
  if (!trimmedLat) {
    errors.latitude = 'Latitude is required.'
  } else {
    const numLat = Number(trimmedLat)
    if (isNaN(numLat) || !isFinite(numLat)) {
      errors.latitude = 'Latitude must be a valid number.'
    } else if (numLat < -90 || numLat > 90) {
      errors.latitude = 'Latitude must be between -90.0 and +90.0 degrees.'
    }
  }

  // Longitude
  const trimmedLng = (vals.longitude !== undefined && vals.longitude !== null ? String(vals.longitude) : '').trim()
  if (!trimmedLng) {
    errors.longitude = 'Longitude is required.'
  } else {
    const numLng = Number(trimmedLng)
    if (isNaN(numLng) || !isFinite(numLng)) {
      errors.longitude = 'Longitude must be a valid number.'
    } else if (numLng < -180 || numLng > 180) {
      errors.longitude = 'Longitude must be between -180.0 and +180.0 degrees.'
    }
  }

  // Radius in km
  const trimmedRad = (vals.radiusKm !== undefined && vals.radiusKm !== null ? String(vals.radiusKm) : '').trim()
  if (!trimmedRad) {
    errors.radius_km = 'Monitoring radius is required.'
  } else {
    const numRad = Number(trimmedRad)
    if (isNaN(numRad) || !isFinite(numRad)) {
      errors.radius_km = 'Monitoring radius must be a valid number.'
    } else if (numRad <= 0 || numRad > 200) {
      errors.radius_km = 'Radius must be between 0.1 and 200.0 km.'
    }
  }

  // Default Ward
  const trimmedWard = (vals.defaultWard || '').trim()
  if (!trimmedWard) {
    errors.default_ward = 'Default ward is required.'
  } else if (trimmedWard.length > 80) {
    errors.default_ward = 'Default ward must be 80 characters or fewer.'
  }

  return errors
}

// Dirty state checker matching PilotSettings component
function isFormModified(current, baseline) {
  if (!baseline) return false
  return (
    current.name.trim() !== baseline.name ||
    (current.latitude.trim() !== '' && Number(current.latitude) !== baseline.latitude) ||
    (current.longitude.trim() !== '' && Number(current.longitude) !== baseline.longitude) ||
    (current.radiusKm.trim() !== '' && Number(current.radiusKm) !== baseline.radius_km) ||
    current.defaultWard.trim() !== baseline.default_ward
  )
}

// Reset helper matching PilotSettings component
function resetFormToBaseline(baseline) {
  if (!baseline) return null
  return {
    name: baseline.name || '',
    latitude: baseline.latitude !== undefined ? String(baseline.latitude) : '',
    longitude: baseline.longitude !== undefined ? String(baseline.longitude) : '',
    radiusKm: baseline.radius_km !== undefined ? String(baseline.radius_km) : '',
    defaultWard: baseline.default_ward || '',
  }
}

// Payload construction matching PilotSettings component
function buildPatchPayload(current) {
  return {
    name: current.name.trim(),
    latitude: Number(current.latitude),
    longitude: Number(current.longitude),
    radius_km: Number(current.radiusKm),
    default_ward: current.defaultWard.trim(),
  }
}

// API error message extractor matching frontend request() implementation
function formatApiError(responseStatus, payload) {
  let errorMsg = payload.message || `Request failed (${responseStatus})`
  if (typeof payload.detail === 'string') {
    errorMsg = payload.detail
  } else if (Array.isArray(payload.detail)) {
    errorMsg = payload.detail
      .map(item => item.msg || item.message || JSON.stringify(item))
      .join('; ')
  } else if (payload.detail && typeof payload.detail === 'object') {
    errorMsg = JSON.stringify(payload.detail)
  }
  return errorMsg
}

// Authorization check matching PilotSettings role guard
function canAccessPilotSettings(user) {
  return Boolean(user && user.role === 'admin')
}


test('Role Guard: only admin user can access pilot settings', () => {
  assert.equal(canAccessPilotSettings({ role: 'admin', username: 'admin' }), true)
  assert.equal(canAccessPilotSettings({ role: 'resident', username: 'resident' }), false)
  assert.equal(canAccessPilotSettings({ role: 'worker', username: 'worker' }), false)
  assert.equal(canAccessPilotSettings({ role: 'receiver', username: 'receiver' }), false)
  assert.equal(canAccessPilotSettings(null), false)
  assert.equal(canAccessPilotSettings(undefined), false)
})

test('Field Validation: accepts valid pilot configuration', () => {
  const valid = {
    name: 'Nagpur Central Pilot',
    latitude: '21.1458',
    longitude: '79.0882',
    radiusKm: '15.0',
    defaultWard: 'Ward 01',
  }
  const errors = validatePilotFields(valid)
  assert.deepEqual(errors, {})
})

test('Field Validation: name constraints', () => {
  // Empty
  assert.equal(validatePilotFields({ name: '', latitude: '21.1', longitude: '79.0', radiusKm: '10', defaultWard: 'W1' }).name, 'Pilot area name is required.')
  // Whitespace only
  assert.equal(validatePilotFields({ name: '    ', latitude: '21.1', longitude: '79.0', radiusKm: '10', defaultWard: 'W1' }).name, 'Pilot area name is required.')
  // Over 100 characters
  const longName = 'A'.repeat(101)
  assert.equal(validatePilotFields({ name: longName, latitude: '21.1', longitude: '79.0', radiusKm: '10', defaultWard: 'W1' }).name, 'Pilot area name must be 100 characters or fewer.')
})

test('Field Validation: latitude constraints (-90 to +90)', () => {
  const base = { name: 'Pilot', longitude: '79.0', radiusKm: '10', defaultWard: 'W1' }
  // Required
  assert.ok(validatePilotFields({ ...base, latitude: '' }).latitude)
  // Non-numeric
  assert.equal(validatePilotFields({ ...base, latitude: 'invalid' }).latitude, 'Latitude must be a valid number.')
  assert.equal(validatePilotFields({ ...base, latitude: 'NaN' }).latitude, 'Latitude must be a valid number.')
  // Out of range
  assert.equal(validatePilotFields({ ...base, latitude: '-90.1' }).latitude, 'Latitude must be between -90.0 and +90.0 degrees.')
  assert.equal(validatePilotFields({ ...base, latitude: '90.1' }).latitude, 'Latitude must be between -90.0 and +90.0 degrees.')
  // Boundary valid values
  assert.equal(validatePilotFields({ ...base, latitude: '-90' }).latitude, undefined)
  assert.equal(validatePilotFields({ ...base, latitude: '90' }).latitude, undefined)
  assert.equal(validatePilotFields({ ...base, latitude: '0' }).latitude, undefined)
})

test('Field Validation: longitude constraints (-180 to +180)', () => {
  const base = { name: 'Pilot', latitude: '21.0', radiusKm: '10', defaultWard: 'W1' }
  // Required
  assert.ok(validatePilotFields({ ...base, longitude: '' }).longitude)
  // Non-numeric
  assert.equal(validatePilotFields({ ...base, longitude: 'abc' }).longitude, 'Longitude must be a valid number.')
  // Out of range
  assert.equal(validatePilotFields({ ...base, longitude: '-180.1' }).longitude, 'Longitude must be between -180.0 and +180.0 degrees.')
  assert.equal(validatePilotFields({ ...base, longitude: '180.1' }).longitude, 'Longitude must be between -180.0 and +180.0 degrees.')
  // Boundary valid values
  assert.equal(validatePilotFields({ ...base, longitude: '-180' }).longitude, undefined)
  assert.equal(validatePilotFields({ ...base, longitude: '180' }).longitude, undefined)
  assert.equal(validatePilotFields({ ...base, longitude: '0' }).longitude, undefined)
})

test('Field Validation: radius constraints (0.1 to 200.0 km)', () => {
  const base = { name: 'Pilot', latitude: '21.0', longitude: '79.0', defaultWard: 'W1' }
  // Required
  assert.ok(validatePilotFields({ ...base, radiusKm: '' }).radius_km)
  // Non-numeric
  assert.equal(validatePilotFields({ ...base, radiusKm: 'ten' }).radius_km, 'Monitoring radius must be a valid number.')
  // Zero or negative
  assert.equal(validatePilotFields({ ...base, radiusKm: '0' }).radius_km, 'Radius must be between 0.1 and 200.0 km.')
  assert.equal(validatePilotFields({ ...base, radiusKm: '-5.0' }).radius_km, 'Radius must be between 0.1 and 200.0 km.')
  // Greater than 200
  assert.equal(validatePilotFields({ ...base, radiusKm: '200.1' }).radius_km, 'Radius must be between 0.1 and 200.0 km.')
  // Boundary valid values
  assert.equal(validatePilotFields({ ...base, radiusKm: '0.1' }).radius_km, undefined)
  assert.equal(validatePilotFields({ ...base, radiusKm: '200' }).radius_km, undefined)
  assert.equal(validatePilotFields({ ...base, radiusKm: '15.5' }).radius_km, undefined)
})

test('Field Validation: default ward constraints', () => {
  const base = { name: 'Pilot', latitude: '21.0', longitude: '79.0', radiusKm: '10' }
  // Empty
  assert.equal(validatePilotFields({ ...base, defaultWard: '' }).default_ward, 'Default ward is required.')
  // Whitespace
  assert.equal(validatePilotFields({ ...base, defaultWard: '   ' }).default_ward, 'Default ward is required.')
  // Over 80 characters
  assert.equal(validatePilotFields({ ...base, defaultWard: 'W'.repeat(81) }).default_ward, 'Default ward must be 80 characters or fewer.')
  // Valid
  assert.equal(validatePilotFields({ ...base, defaultWard: 'Ward 01' }).default_ward, undefined)
})

test('Modified State & Reset Action', () => {
  const baseline = {
    name: 'Nagpur Central Pilot',
    latitude: 21.1458,
    longitude: 79.0882,
    radius_km: 15.0,
    default_ward: 'Ward 01',
  }

  // Initial state identical to baseline: not modified
  const initial = {
    name: 'Nagpur Central Pilot',
    latitude: '21.1458',
    longitude: '79.0882',
    radiusKm: '15',
    defaultWard: 'Ward 01',
  }
  assert.equal(isFormModified(initial, baseline), false)

  // Modified state: changed radius
  const modifiedRadius = { ...initial, radiusKm: '20.0' }
  assert.equal(isFormModified(modifiedRadius, baseline), true)

  // Modified state: changed name
  const modifiedName = { ...initial, name: 'Dharampeth Zone' }
  assert.equal(isFormModified(modifiedName, baseline), true)

  // Resetting restores baseline values exactly
  const restored = resetFormToBaseline(baseline)
  assert.deepEqual(restored, initial)
  assert.equal(isFormModified(restored, baseline), false)
})

test('PATCH Payload Construction: formats numeric fields correctly', () => {
  const current = {
    name: '  South Nagpur Pilot Area  ',
    latitude: '21.123456',
    longitude: '79.054321',
    radiusKm: '12.5',
    defaultWard: '  Ward 04  ',
  }
  const payload = buildPatchPayload(current)
  assert.strictEqual(payload.name, 'South Nagpur Pilot Area')
  assert.strictEqual(payload.latitude, 21.123456)
  assert.strictEqual(payload.longitude, 79.054321)
  assert.strictEqual(payload.radius_km, 12.5)
  assert.strictEqual(payload.default_ward, 'Ward 04')
})

test('API Error Formatting: handles string, array, and fallback details', () => {
  // String detail (e.g. HTTPException(422, "Invalid latitude"))
  assert.equal(
    formatApiError(422, { detail: 'Invalid latitude' }),
    'Invalid latitude'
  )

  // Pydantic validation error list
  const pydanticErrors = {
    detail: [
      { loc: ['body', 'latitude'], msg: 'Input should be greater than or equal to -90', type: 'greater_than_equal' },
      { loc: ['body', 'radius_km'], msg: 'Input should be less than or equal to 200', type: 'less_than_equal' }
    ]
  }
  const formatted = formatApiError(422, pydanticErrors)
  assert.ok(formatted.includes('Input should be greater than or equal to -90'))
  assert.ok(formatted.includes('Input should be less than or equal to 200'))

  // 403 Forbidden default
  assert.equal(
    formatApiError(403, { detail: 'Your role cannot perform this action' }),
    'Your role cannot perform this action'
  )

  // Fallback to message or status
  assert.equal(
    formatApiError(500, {}),
    'Request failed (500)'
  )
})
