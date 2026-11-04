const prisma = require('../config/database');

const VALID_DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'];

/**
 * POST /api/discounts/validate
 * Public storefront endpoint for coupon code validation and discount calculation.
 */
const validateCoupon = async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Coupon code is required.', statusCode: 400 }
      });
    }

    const cleanCode = code.trim().toUpperCase();
    const numericSubtotal = Math.max(0, parseFloat(subtotal) || 0);

    const discount = await prisma.discount.findUnique({
      where: { code: cleanCode }
    });

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: { message: `Coupon code '${cleanCode}' is invalid or does not exist.`, statusCode: 404 }
      });
    }

    if (!discount.isActive) {
      return res.status(400).json({
        success: false,
        error: { message: `Coupon '${cleanCode}' is no longer active.`, statusCode: 400 }
      });
    }

    const now = new Date();

    if (discount.startDate && new Date(discount.startDate) > now) {
      return res.status(400).json({
        success: false,
        error: { message: `Coupon '${cleanCode}' is not yet valid.`, statusCode: 400 }
      });
    }

    if (discount.expiryDate && new Date(discount.expiryDate) < now) {
      return res.status(400).json({
        success: false,
        error: { message: `Coupon '${cleanCode}' has expired.`, statusCode: 400 }
      });
    }

    if (discount.usageLimit !== null && discount.usageLimit !== undefined && discount.usedCount >= discount.usageLimit) {
      return res.status(400).json({
        success: false,
        error: { message: `Coupon '${cleanCode}' has reached its maximum redemption limit.`, statusCode: 400 }
      });
    }

    if (discount.minOrderAmount) {
      const minAmount = parseFloat(discount.minOrderAmount);
      if (numericSubtotal < minAmount) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Coupon '${cleanCode}' requires a minimum order subtotal of PKR ${minAmount.toLocaleString('en-PK')}.`,
            statusCode: 400
          }
        });
      }
    }

    // Calculate discount amount authoritatively
    let discountAmount = 0;
    const discountVal = parseFloat(discount.value);

    if (discount.discountType === 'PERCENTAGE') {
      discountAmount = Math.min(numericSubtotal, Math.round((numericSubtotal * discountVal) / 100));
    } else if (discount.discountType === 'FIXED_AMOUNT') {
      discountAmount = Math.min(numericSubtotal, discountVal);
    }

    return res.status(200).json({
      success: true,
      message: `Coupon '${discount.code}' successfully verified!`,
      data: {
        discount: {
          id: discount.id,
          code: discount.code,
          discountType: discount.discountType,
          value: discountVal,
          discountAmount,
          minOrderAmount: discount.minOrderAmount ? parseFloat(discount.minOrderAmount) : null
        }
      }
    });
  } catch (error) {
    console.error('[Discount Controller - Validate Coupon Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/discounts
 * Admin endpoint: Paginated list of promotional coupons with search and filtering.
 */
const getDiscounts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, status } = req.query;
    const where = {};

    if (search && typeof search === 'string' && search.trim()) {
      where.code = { contains: search.trim() };
    }

    if (status === 'active') {
      where.isActive = true;
    } else if (status === 'inactive') {
      where.isActive = false;
    }

    const [total, discounts] = await Promise.all([
      prisma.discount.count({ where }),
      prisma.discount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { orders: true }
          }
        }
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        discounts: discounts.map(d => ({
          ...d,
          value: parseFloat(d.value),
          minOrderAmount: d.minOrderAmount ? parseFloat(d.minOrderAmount) : null
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('[Discount Controller - Get Discounts Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/discounts/:id
 * Admin endpoint: Retrieve single coupon by UUID or Code.
 */
const getDiscountById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const discount = await prisma.discount.findFirst({
      where: {
        OR: [
          { id },
          { code: id.toUpperCase() }
        ]
      },
      include: {
        _count: { select: { orders: true } }
      }
    });

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: { message: `Discount coupon '${id}' was not found.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        discount: {
          ...discount,
          value: parseFloat(discount.value),
          minOrderAmount: discount.minOrderAmount ? parseFloat(discount.minOrderAmount) : null
        }
      }
    });
  } catch (error) {
    console.error('[Discount Controller - Get Discount By Id Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/discounts
 * Admin endpoint: Create new promotional discount coupon.
 */
const createDiscount = async (req, res, next) => {
  try {
    const {
      code,
      discountType,
      value,
      minOrderAmount,
      usageLimit,
      startDate,
      expiryDate,
      isActive = true
    } = req.body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Coupon code is required.', statusCode: 400 }
      });
    }

    const cleanCode = code.trim().toUpperCase();

    if (!discountType || !VALID_DISCOUNT_TYPES.includes(discountType)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid discountType '${discountType}'. Allowed: ${VALID_DISCOUNT_TYPES.join(', ')}`,
          statusCode: 400
        }
      });
    }

    const numericVal = parseFloat(value);
    if (isNaN(numericVal) || numericVal <= 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Discount value must be a positive number.', statusCode: 400 }
      });
    }

    if (discountType === 'PERCENTAGE' && (numericVal < 1 || numericVal > 100)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Percentage discount must be between 1% and 100%.', statusCode: 400 }
      });
    }

    // Check duplicate code
    const existing = await prisma.discount.findUnique({
      where: { code: cleanCode }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: { message: `Coupon with code '${cleanCode}' already exists.`, statusCode: 409 }
      });
    }

    let parsedExpiry = null;
    if (expiryDate) {
      parsedExpiry = new Date(expiryDate);
      if (isNaN(parsedExpiry.getTime())) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid expiryDate timestamp format.', statusCode: 400 }
        });
      }
    }

    let parsedStart = new Date();
    if (startDate) {
      parsedStart = new Date(startDate);
      if (isNaN(parsedStart.getTime())) {
        return res.status(400).json({
          success: false,
          error: { message: 'Invalid startDate timestamp format.', statusCode: 400 }
        });
      }
    }

    const newDiscount = await prisma.discount.create({
      data: {
        code: cleanCode,
        discountType,
        value: numericVal,
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
        usageLimit: usageLimit ? parseInt(usageLimit, 10) : null,
        startDate: parsedStart,
        expiryDate: parsedExpiry,
        isActive: Boolean(isActive)
      }
    });

    return res.status(201).json({
      success: true,
      message: `Coupon '${newDiscount.code}' created successfully.`,
      data: {
        discount: {
          ...newDiscount,
          value: parseFloat(newDiscount.value),
          minOrderAmount: newDiscount.minOrderAmount ? parseFloat(newDiscount.minOrderAmount) : null
        }
      }
    });
  } catch (error) {
    console.error('[Discount Controller - Create Discount Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/discounts/:id
 * Admin endpoint: Update coupon properties or active state.
 */
const updateDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      value,
      discountType,
      minOrderAmount,
      usageLimit,
      startDate,
      expiryDate,
      isActive
    } = req.body;

    const existing = await prisma.discount.findUnique({
      where: { id }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: `Discount coupon with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    const updateData = {};

    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    if (discountType !== undefined) {
      if (!VALID_DISCOUNT_TYPES.includes(discountType)) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid discountType. Allowed: ${VALID_DISCOUNT_TYPES.join(', ')}`, statusCode: 400 }
        });
      }
      updateData.discountType = discountType;
    }

    if (value !== undefined) {
      const numVal = parseFloat(value);
      if (isNaN(numVal) || numVal <= 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'Discount value must be a positive number.', statusCode: 400 }
        });
      }
      const typeToCheck = updateData.discountType || existing.discountType;
      if (typeToCheck === 'PERCENTAGE' && (numVal < 1 || numVal > 100)) {
        return res.status(400).json({
          success: false,
          error: { message: 'Percentage discount must be between 1% and 100%.', statusCode: 400 }
        });
      }
      updateData.value = numVal;
    }

    if (minOrderAmount !== undefined) {
      updateData.minOrderAmount = minOrderAmount === null ? null : parseFloat(minOrderAmount);
    }

    if (usageLimit !== undefined) {
      updateData.usageLimit = usageLimit === null ? null : parseInt(usageLimit, 10);
    }

    if (startDate !== undefined) {
      updateData.startDate = startDate ? new Date(startDate) : new Date();
    }

    if (expiryDate !== undefined) {
      updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
    }

    const updated = await prisma.discount.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: `Coupon '${updated.code}' updated successfully.`,
      data: {
        discount: {
          ...updated,
          value: parseFloat(updated.value),
          minOrderAmount: updated.minOrderAmount ? parseFloat(updated.minOrderAmount) : null
        }
      }
    });
  } catch (error) {
    console.error('[Discount Controller - Update Discount Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/discounts/:id
 * Admin endpoint: Delete coupon or deactivate if historical orders are associated.
 */
const deleteDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;

    const discount = await prisma.discount.findUnique({
      where: { id },
      include: {
        _count: { select: { orders: true } }
      }
    });

    if (!discount) {
      return res.status(404).json({
        success: false,
        error: { message: `Discount coupon with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    // Historical integrity: if associated with orders, soft-deactivate instead of hard delete
    if (discount._count.orders > 0) {
      await prisma.discount.update({
        where: { id },
        data: { isActive: false }
      });

      return res.status(200).json({
        success: true,
        message: `Coupon '${discount.code}' is linked to ${discount._count.orders} order(s). It has been deactivated to preserve audit integrity.`
      });
    }

    await prisma.discount.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: `Coupon '${discount.code}' was permanently deleted.`
    });
  } catch (error) {
    console.error('[Discount Controller - Delete Discount Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  validateCoupon,
  getDiscounts,
  getDiscountById,
  createDiscount,
  updateDiscount,
  deleteDiscount,
  VALID_DISCOUNT_TYPES
};
