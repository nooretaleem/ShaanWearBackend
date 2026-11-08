const prisma = require('../config/database');

const VALID_PAYMENT_STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
const VALID_FULFILLMENT_STATUSES = ['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

/**
 * GET /api/orders
 * Paginated order listing with search, payment status, fulfillment status, and sorting filters.
 */
const getOrders = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const {
      search,
      paymentStatus,
      fulfillmentStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const where = {};

    // Search filter across orderNumber, shippingName, shippingPhone, and customer name/email
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { orderNumber: { contains: term } },
        { shippingName: { contains: term } },
        { shippingPhone: { contains: term } },
        { shippingCity: { contains: term } },
        { customer: { name: { contains: term } } },
        { customer: { email: { contains: term } } }
      ];
    }

    // Payment status filter
    if (paymentStatus && typeof paymentStatus === 'string' && paymentStatus.trim()) {
      const upperPayment = paymentStatus.trim().toUpperCase();
      if (VALID_PAYMENT_STATUSES.includes(upperPayment)) {
        where.paymentStatus = upperPayment;
      }
    }

    // Fulfillment status filter
    if (fulfillmentStatus && typeof fulfillmentStatus === 'string' && fulfillmentStatus.trim()) {
      const upperFulfillment = fulfillmentStatus.trim().toUpperCase();
      if (VALID_FULFILLMENT_STATUSES.includes(upperFulfillment)) {
        where.fulfillmentStatus = upperFulfillment;
      }
    }

    // Allowed sort fields
    const validSortFields = ['createdAt', 'total', 'orderNumber', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          discount: {
            select: {
              id: true,
              code: true,
              discountType: true,
              value: true
            }
          },
          items: {
            select: {
              id: true,
              productName: true,
              sku: true,
              unitPrice: true,
              quantity: true,
              lineTotal: true
            }
          },
          _count: {
            select: { items: true }
          }
        }
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        orders,
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
    console.error('[Order Controller - Get Orders Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/orders/:id
 * Retrieve detailed information for a single order by UUID or orderNumber.
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid order identifier provided.', statusCode: 400 }
      });
    }

    const order = await prisma.order.findFirst({
      where: {
        OR: [
          { id: id },
          { orderNumber: id }
        ]
      },
      include: {
        customer: true,
        discount: true,
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true
              }
            },
            variant: {
              select: {
                id: true,
                sku: true,
                size: true,
                color: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { message: `Order with identifier '${id}' was not found.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: { order }
    });
  } catch (error) {
    console.error('[Order Controller - Get Order By Id Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/status
 * Update fulfillmentStatus and/or paymentStatus with lifecycle validation.
 */
const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paymentStatus, fulfillmentStatus } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid order identifier provided.', statusCode: 400 }
      });
    }

    if (!paymentStatus && !fulfillmentStatus) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'At least one of paymentStatus or fulfillmentStatus must be provided.',
          statusCode: 400
        }
      });
    }

    // Verify existing order
    const existingOrder = await prisma.order.findFirst({
      where: {
        OR: [
          { id: id },
          { orderNumber: id }
        ]
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        error: { message: `Order with identifier '${id}' was not found.`, statusCode: 404 }
      });
    }

    const updateData = {};

    // Validate paymentStatus
    if (paymentStatus !== undefined) {
      if (typeof paymentStatus !== 'string') {
        return res.status(400).json({
          success: false,
          error: { message: 'paymentStatus must be a valid string.', statusCode: 400 }
        });
      }
      const upperPayment = paymentStatus.trim().toUpperCase();
      if (!VALID_PAYMENT_STATUSES.includes(upperPayment)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid payment status '${paymentStatus}'. Allowed values: ${VALID_PAYMENT_STATUSES.join(', ')}`,
            statusCode: 400
          }
        });
      }
      updateData.paymentStatus = upperPayment;
    }

    // Validate fulfillmentStatus & lifecycle rules
    if (fulfillmentStatus !== undefined) {
      if (typeof fulfillmentStatus !== 'string') {
        return res.status(400).json({
          success: false,
          error: { message: 'fulfillmentStatus must be a valid string.', statusCode: 400 }
        });
      }
      const upperFulfillment = fulfillmentStatus.trim().toUpperCase();
      if (!VALID_FULFILLMENT_STATUSES.includes(upperFulfillment)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid fulfillment status '${fulfillmentStatus}'. Allowed values: ${VALID_FULFILLMENT_STATUSES.join(', ')}`,
            statusCode: 400
          }
        });
      }

      // Lifecycle constraints
      if (existingOrder.fulfillmentStatus === 'CANCELLED' && upperFulfillment !== 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'A cancelled order cannot be reactivated. Please create a new order.',
            statusCode: 400
          }
        });
      }

      if (existingOrder.fulfillmentStatus === 'DELIVERED' && (upperFulfillment === 'UNFULFILLED' || upperFulfillment === 'PROCESSING')) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'A delivered order cannot be reverted to unfulfilled or processing.',
            statusCode: 400
          }
        });
      }

      updateData.fulfillmentStatus = upperFulfillment;
    }

    const updatedOrder = await prisma.order.update({
      where: { id: existingOrder.id },
      data: updateData,
      include: {
        customer: true,
        discount: true,
        items: true
      }
    });

    return res.status(200).json({
      success: true,
      message: `Order ${updatedOrder.orderNumber} status updated successfully.`,
      data: { order: updatedOrder }
    });
  } catch (error) {
    console.error('[Order Controller - Update Order Status Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/orders
 * Public storefront endpoint: Place a new customer order with server-side pricing,
 * coupon validation, shipping fee computation, and customer linkage.
 */
const createStorefrontOrder = async (req, res, next) => {
  try {
    const {
      shippingName,
      shippingPhone,
      shippingAddress,
      shippingCity,
      shippingProvince = 'Punjab',
      shippingPostalCode = '',
      customerEmail,
      customerName,
      email,
      items,
      couponCode
    } = req.body;

    // Validate required delivery fields
    if (!shippingName || typeof shippingName !== 'string' || !shippingName.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Recipient name (shippingName) is required.', statusCode: 400 }
      });
    }

    if (!shippingPhone || typeof shippingPhone !== 'string' || !shippingPhone.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Contact phone number (shippingPhone) is required.', statusCode: 400 }
      });
    }

    if (!shippingAddress || typeof shippingAddress !== 'string' || !shippingAddress.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Street address (shippingAddress) is required.', statusCode: 400 }
      });
    }

    if (!shippingCity || typeof shippingCity !== 'string' || !shippingCity.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Destination city (shippingCity) is required.', statusCode: 400 }
      });
    }

    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'Order must contain at least one item.', statusCode: 400 }
      });
    }

    const processedItems = [];
    let subtotal = 0;

    for (const item of items) {
      const quantity = Math.max(1, parseInt(item.quantity || item.qty, 10) || 1);
      let unitPrice = parseFloat(item.unitPrice !== undefined ? item.unitPrice : item.price);
      let productName = (item.productName || item.name || '').trim();
      let sku = (item.sku || '').trim();

      // If price or name missing, fallback to product record in database
      if ((isNaN(unitPrice) || !productName) && item.productId) {
        const prod = await prisma.product.findUnique({
          where: { id: item.productId },
          include: { variants: true }
        });
        if (prod) {
          if (isNaN(unitPrice)) {
            unitPrice = parseFloat(prod.basePrice || 0);
          }
          if (!productName) {
            productName = prod.name;
          }
          if (!sku) {
            sku = prod.variants?.[0]?.sku || `SW-${prod.slug.toUpperCase()}`;
          }
        }
      }

      if (isNaN(unitPrice) || unitPrice < 0) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid price for item '${productName || 'Unknown'}'.`, statusCode: 400 }
        });
      }

      const lineTotal = Math.round(unitPrice * quantity);
      subtotal += lineTotal;

      processedItems.push({
        productId: item.productId || null,
        productVariantId: item.productVariantId || null,
        productName: (productName || 'SHAANWEAR Item').trim(),
        sku: (sku || `SW-ITEM-${Math.floor(1000 + Math.random() * 9000)}`).trim(),
        unitPrice,
        quantity,
        lineTotal
      });
    }

    // Server-side coupon verification
    let discountAmount = 0;
    let appliedDiscount = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim()) {
      const cleanCode = couponCode.trim().toUpperCase();
      const discount = await prisma.discount.findUnique({
        where: { code: cleanCode }
      });

      if (!discount) {
        return res.status(400).json({
          success: false,
          error: { message: `Coupon code '${cleanCode}' is invalid.`, statusCode: 400 }
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
          error: { message: `Coupon '${cleanCode}' has reached its usage limit.`, statusCode: 400 }
        });
      }

      if (discount.minOrderAmount) {
        const minOrder = parseFloat(discount.minOrderAmount);
        if (subtotal < minOrder) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Coupon '${cleanCode}' requires a minimum subtotal of PKR ${minOrder.toLocaleString('en-PK')}.`,
              statusCode: 400
            }
          });
        }
      }

      const discountVal = parseFloat(discount.value);
      if (discount.discountType === 'PERCENTAGE') {
        discountAmount = Math.min(subtotal, Math.round((subtotal * discountVal) / 100));
      } else if (discount.discountType === 'FIXED_AMOUNT') {
        discountAmount = Math.min(subtotal, discountVal);
      }

      appliedDiscount = discount;
    }

    // Authoritative Shipping Calculation: Free delivery over PKR 4999, else standard PKR 250
    const FREE_SHIPPING_THRESHOLD = 4999;
    const STANDARD_SHIPPING_FEE = 250;
    const shippingAmount = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_FEE;

    const grandTotal = Math.max(0, subtotal - discountAmount + shippingAmount);

    // Customer upsert or lookup
    let customerId = null;
    const rawEmail = customerEmail || email || req.body.customer?.email;
    const emailToUse = (rawEmail && typeof rawEmail === 'string' && rawEmail.trim())
      ? rawEmail.trim().toLowerCase()
      : null;
    const rawName = customerName || req.body.name || req.body.customer?.name;
    const nameToUse = (rawName && typeof rawName === 'string' && rawName.trim())
      ? rawName.trim()
      : shippingName.trim();
    const phoneToUse = shippingPhone.trim();

    if (emailToUse) {
      const existingCustomer = await prisma.customer.findUnique({
        where: { email: emailToUse }
      });

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const newCustomer = await prisma.customer.create({
          data: {
            name: nameToUse,
            email: emailToUse,
            phone: phoneToUse
          }
        });
        customerId = newCustomer.id;
      }
    } else {
      const newCustomer = await prisma.customer.create({
        data: {
          name: nameToUse,
          phone: phoneToUse
        }
      });
      customerId = newCustomer.id;
    }

    // Detect authenticated customer or link to registered user by email
    let orderUserId = req.user?.id || null;
    if (!orderUserId && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const { verifyToken } = require('../services/tokenService');
        const decoded = verifyToken(req.headers.authorization.split(' ')[1]);
        if (decoded?.userId) orderUserId = decoded.userId;
      } catch (_) {}
    }
    if (!orderUserId && emailToUse) {
      const matchedUser = await prisma.user.findUnique({ where: { email: emailToUse } });
      if (matchedUser) orderUserId = matchedUser.id;
    }

    // Generate unique order number: SW-XXXXXX
    let orderNumber = `SW-${Math.floor(100000 + Math.random() * 900000)}`;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      const existing = await prisma.order.findUnique({ where: { orderNumber } });
      if (!existing) {
        isUnique = true;
      } else {
        orderNumber = `SW-${Math.floor(100000 + Math.random() * 900000)}`;
        attempts++;
      }
    }

    // Atomic order creation transaction
    const newOrder = await prisma.$transaction(async (tx) => {
      // 1. Create order
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          userId: orderUserId,
          discountId: appliedDiscount ? appliedDiscount.id : null,
          subtotal,
          discountAmount,
          shippingAmount,
          total: grandTotal,
          currency: 'PKR',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'UNFULFILLED',
          shippingName: shippingName.trim(),
          shippingPhone: shippingPhone.trim(),
          shippingAddress: shippingAddress.trim(),
          shippingCity: shippingCity.trim(),
          shippingProvince: shippingProvince ? shippingProvince.trim() : null,
          shippingPostalCode: shippingPostalCode ? shippingPostalCode.trim() : null,
          items: {
            create: processedItems
          }
        },
        include: {
          customer: true,
          discount: true,
          items: true
        }
      });

      // 2. Increment coupon used count if discount was applied
      if (appliedDiscount) {
        await tx.discount.update({
          where: { id: appliedDiscount.id },
          data: { usedCount: { increment: 1 } }
        });
      }

      return order;
    });

    const totalNum = parseFloat(newOrder.total);
    const subtotalNum = parseFloat(newOrder.subtotal);
    const shippingNum = parseFloat(newOrder.shippingAmount);
    const discountNum = parseFloat(newOrder.discountAmount);

    const formattedOrder = {
      ...newOrder,
      total: totalNum,
      totalAmount: totalNum,
      subtotal: subtotalNum,
      shippingAmount: shippingNum,
      discountAmount: discountNum
    };

    return res.status(201).json({
      success: true,
      message: `Order ${newOrder.orderNumber} placed successfully.`,
      data: { order: formattedOrder }
    });
  } catch (error) {
    console.error('[Order Controller - Create Storefront Order Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  getOrders,
  getOrderById,
  updateOrderStatus,
  createStorefrontOrder,
  VALID_PAYMENT_STATUSES,
  VALID_FULFILLMENT_STATUSES
};

