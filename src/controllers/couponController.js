import { pool } from '../config/db.js'
import { calculateCouponDiscount } from '../services/couponService.js'

export async function validateCoupon(request, response, next) {
  try {
    const { code, serviceType, orderAmount } = request.body
    if (!code || !serviceType) {
      return response.status(400).json({ success: false, error: { message: 'Coupon code and service type are required' } })
    }
    const subtotalPaise = Math.max(0, Math.round(Number(orderAmount || 0) * 100))
    const result = await calculateCouponDiscount(pool, code, serviceType, subtotalPaise)
    return response.json({
      success: true,
      data: {
        valid: true,
        code: result.coupon.code,
        discountType: result.coupon.discountType,
        discountValue: Number(result.coupon.discountValue),
        discountAmount: result.discountPaise / 100,
      },
    })
  } catch (error) {
    return next(error)
  }
}
