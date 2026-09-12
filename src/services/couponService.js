const SERVICE_ALIASES = {
  flight: 'flights',
  hotel: 'hotels',
  bus: 'bus',
  train: 'trains',
  package: 'packages',
}

export function normalizeCouponServiceType(serviceType) {
  return SERVICE_ALIASES[serviceType] || serviceType
}

export async function calculateCouponDiscount(client, code, serviceType, subtotalPaise) {
  if (!code) return { coupon: null, discountPaise: 0 }

  const result = await client.query(
    `SELECT code, discount_type AS "discountType", discount_value AS "discountValue",
            min_order_paise AS "minOrderPaise", max_discount_paise AS "maxDiscountPaise",
            valid_until AS "validUntil", applicable_on AS "applicableOn"
     FROM coupons
     WHERE UPPER(code) = UPPER($1) AND active = TRUE AND valid_until >= CURRENT_DATE
     LIMIT 1`,
    [String(code).trim()],
  )
  const coupon = result.rows[0]
  if (!coupon) {
    const error = new Error('Invalid or expired coupon code')
    error.status = 400
    throw error
  }

  const service = normalizeCouponServiceType(serviceType)
  if (!coupon.applicableOn.includes(service)) {
    const error = new Error('Coupon not applicable on this service')
    error.status = 400
    throw error
  }

  if (subtotalPaise < Number(coupon.minOrderPaise)) {
    const error = new Error(`Minimum order amount is INR ${Number(coupon.minOrderPaise) / 100}`)
    error.status = 400
    throw error
  }

  const rawDiscount = coupon.discountType === 'percentage'
    ? Math.round((subtotalPaise * Number(coupon.discountValue)) / 100)
    : Math.round(Number(coupon.discountValue) * 100)
  const discountPaise = Math.min(rawDiscount, Number(coupon.maxDiscountPaise), subtotalPaise)

  return { coupon, discountPaise }
}
