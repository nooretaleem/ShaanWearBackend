const prisma = require('../config/database');

// Authoritative Storefront Defaults
const FREE_SHIPPING_THRESHOLD = 4999;
const STANDARD_SHIPPING_FEE = 250;

/**
 * Helper: Format a Cart with hydrated items and accurate financial summaries
 */
const formatCart = (cart) => {
  if (!cart) return null;

  let subtotal = 0;
  const items = (cart.items || []).map((item) => {
    // Determine item unit price: Variant price > Product base price
    const unitPrice = item.variant?.price
      ? parseFloat(item.variant.price)
      : parseFloat(item.product?.basePrice || 0);

    const lineTotal = unitPrice * item.quantity;
    subtotal += lineTotal;

    // Pick primary thumbnail
    const primaryImage =
      item.variant?.images?.[0]?.secureUrl ||
      item.product?.images?.find((img) => img.displayOrder === 0)?.secureUrl ||
      item.product?.images?.[0]?.secureUrl ||
      null;

    return {
      id: item.id,
      productId: item.productId,
      productVariantId: item.productVariantId,
      name: item.product?.name || 'Garment',
      slug: item.product?.slug || '',
      category: item.product?.category?.name || 'Collection',
      size: item.size || item.variant?.size || null,
      color: item.color || item.variant?.color || null,
      colorHex: item.variant?.colorHex || null,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      image: primaryImage,
      stock: item.variant?.stock ?? 10
    };
  });

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_FEE;
  const grandTotal = subtotal + shipping;

  return {
    id: cart.id,
    userId: cart.userId,
    items,
    itemCount: items.reduce((acc, it) => acc + it.quantity, 0),
    subtotal,
    shipping,
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    qualifiesForFreeShipping: subtotal >= FREE_SHIPPING_THRESHOLD,
    total: grandTotal,
    updatedAt: cart.updatedAt
  };
};

/**
 * Helper: Include definition for Cart queries
 */
const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { displayOrder: 'asc' } }
        }
      },
      variant: {
        include: {
          images: { orderBy: { displayOrder: 'asc' } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  }
};

/**
 * Helper: Include definition for Wishlist queries
 */
const wishlistInclude = {
  items: {
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { displayOrder: 'asc' } },
          variants: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  }
};

/* ==============================================================================
 * 1. ADDRESS BOOK CONTROLLERS
 * ============================================================================== */

/**
 * GET /api/customer/addresses
 * Retrieves all saved delivery addresses for the logged-in customer.
 */
const getAddresses = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });

    return res.status(200).json({
      success: true,
      data: { addresses }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Get Addresses Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/customer/addresses
 * Creates a new shipping address. If isDefault is true or this is the first address,
 * it becomes the default address.
 */
const addAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const {
      name,
      phone,
      address,
      city,
      province = 'Punjab',
      postalCode = '',
      isDefault = false
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Recipient name is required.', statusCode: 400 }
      });
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Phone number is required.', statusCode: 400 }
      });
    }

    if (!address || typeof address !== 'string' || !address.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Street address is required.', statusCode: 400 }
      });
    }

    if (!city || typeof city !== 'string' || !city.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'City is required.', statusCode: 400 }
      });
    }

    const existingCount = await prisma.address.count({ where: { userId } });
    const shouldBeDefault = isDefault || existingCount === 0;

    const result = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault && existingCount > 0) {
        await tx.address.updateMany({
          where: { userId },
          data: { isDefault: false }
        });
      }

      return tx.address.create({
        data: {
          userId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          city: city.trim(),
          province: province ? province.trim() : 'Punjab',
          postalCode: postalCode ? postalCode.trim() : '',
          isDefault: shouldBeDefault
        }
      });
    });

    return res.status(201).json({
      success: true,
      message: 'Address added successfully.',
      data: { address: result }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Add Address Error]:', error.message || error);
    next(error);
  }
};

/**
 * PUT /api/customer/addresses/:id
 * Updates an existing delivery address.
 */
const updateAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name,
      phone,
      address,
      city,
      province,
      postalCode,
      isDefault
    } = req.body;

    const existing = await prisma.address.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: 'Address not found.', statusCode: 404 }
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({
          where: { userId, id: { not: id } },
          data: { isDefault: false }
        });
      }

      return tx.address.update({
        where: { id },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(phone !== undefined && { phone: phone.trim() }),
          ...(address !== undefined && { address: address.trim() }),
          ...(city !== undefined && { city: city.trim() }),
          ...(province !== undefined && { province: province ? province.trim() : null }),
          ...(postalCode !== undefined && { postalCode: postalCode ? postalCode.trim() : null }),
          ...(isDefault !== undefined && { isDefault: Boolean(isDefault) })
        }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Address updated successfully.',
      data: { address: updated }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Update Address Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/customer/addresses/:id
 * Removes an address. If the deleted address was default, marks the newest address as default.
 */
const deleteAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: 'Address not found.', statusCode: 404 }
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (existing.isDefault) {
        const nextAddress = await tx.address.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' }
        });
        if (nextAddress) {
          await tx.address.update({
            where: { id: nextAddress.id },
            data: { isDefault: true }
          });
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Address deleted successfully.'
    });
  } catch (error) {
    console.error('[Customer Dashboard - Delete Address Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/customer/addresses/:id/default
 * Sets an address as the default delivery address.
 */
const setDefaultAddress = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existing = await prisma.address.findFirst({
      where: { id, userId }
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { message: 'Address not found.', statusCode: 404 }
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId },
        data: { isDefault: false }
      });

      return tx.address.update({
        where: { id },
        data: { isDefault: true }
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Default shipping address updated.',
      data: { address: updated }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Set Default Address Error]:', error.message || error);
    next(error);
  }
};

/* ==============================================================================
 * 2. ORDER HISTORY CONTROLLERS
 * ============================================================================== */

/**
 * GET /api/customer/orders
 * Retrieves list of past orders for the authenticated customer.
 * Supports pagination, status filtering, and matching by userId or customer email.
 */
const getCustomerOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase();

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    // Filter by payment or fulfillment status if provided
    const { status } = req.query;
    let statusFilter = null;
    if (status && typeof status === 'string' && status.trim()) {
      const s = status.trim().toUpperCase();
      const VALID_PAYMENT = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];
      const VALID_FULFILLMENT = ['UNFULFILLED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

      const conditions = [];
      if (VALID_PAYMENT.includes(s)) {
        conditions.push({ paymentStatus: s });
      }
      if (VALID_FULFILLMENT.includes(s)) {
        conditions.push({ fulfillmentStatus: s });
      }
      // Customer UI alias: 'PENDING' also maps to 'UNFULFILLED' orders
      if (s === 'PENDING' && !conditions.some(c => c.fulfillmentStatus === 'UNFULFILLED')) {
        conditions.push({ fulfillmentStatus: 'UNFULFILLED' });
      }

      if (conditions.length === 1) {
        statusFilter = conditions[0];
      } else if (conditions.length > 1) {
        statusFilter = { OR: conditions };
      }
    }

    // Match orders belonging to this user account or placed with their verified email
    const where = {
      AND: [
        {
          OR: [
            { userId },
            ...(userEmail ? [{ customer: { email: userEmail } }] : [])
          ]
        },
        ...(statusFilter ? [statusFilter] : [])
      ]
    };

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: { orderBy: { displayOrder: 'asc' }, take: 1 }
                }
              }
            }
          }
        }
      })
    ]);

    const formattedOrders = orders.map((order) => {
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        total: parseFloat(order.total),
        subtotal: parseFloat(order.subtotal),
        shippingAmount: parseFloat(order.shippingAmount),
        discountAmount: parseFloat(order.discountAmount),
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        shippingRecipient: {
          name: order.shippingName,
          phone: order.shippingPhone,
          city: order.shippingCity,
          address: order.shippingAddress
        },
        itemCount: order.items.reduce((acc, it) => acc + it.quantity, 0),
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          sku: item.sku,
          unitPrice: parseFloat(item.unitPrice),
          quantity: item.quantity,
          lineTotal: parseFloat(item.lineTotal),
          thumbnail: item.product?.images?.[0]?.secureUrl || null
        }))
      };
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        orders: formattedOrders,
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
    console.error('[Customer Dashboard - Get Orders Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/customer/orders/:id
 * Detailed order view with full line items, product variants, and shipment snapshots.
 */
const getCustomerOrderById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const userEmail = (req.user.email || '').toLowerCase();
    const { id } = req.params;

    const order = await prisma.order.findFirst({
      where: {
        AND: [
          { OR: [{ id }, { orderNumber: id }] },
          {
            OR: [
              { userId },
              ...(userEmail ? [{ customer: { email: userEmail } }] : [])
            ]
          }
        ]
      },
      include: {
        customer: true,
        discount: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
                images: { orderBy: { displayOrder: 'asc' } }
              }
            },
            variant: {
              include: {
                images: { orderBy: { displayOrder: 'asc' } }
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: { message: 'Order not found or does not belong to your account.', statusCode: 404 }
      });
    }

    const formattedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      financials: {
        subtotal: parseFloat(order.subtotal),
        discountAmount: parseFloat(order.discountAmount),
        shippingAmount: parseFloat(order.shippingAmount),
        total: parseFloat(order.total),
        discountCode: order.discount?.code || null
      },
      shippingDetails: {
        name: order.shippingName,
        phone: order.shippingPhone,
        address: order.shippingAddress,
        city: order.shippingCity,
        province: order.shippingProvince,
        postalCode: order.shippingPostalCode
      },
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productVariantId: item.productVariantId,
        productName: item.productName,
        category: item.product?.category?.name || 'Collection',
        sku: item.sku,
        size: item.variant?.size || null,
        color: item.variant?.color || null,
        unitPrice: parseFloat(item.unitPrice),
        quantity: item.quantity,
        lineTotal: parseFloat(item.lineTotal),
        thumbnail:
          item.variant?.images?.[0]?.secureUrl ||
          item.product?.images?.[0]?.secureUrl ||
          null
      }))
    };

    return res.status(200).json({
      success: true,
      data: { order: formattedOrder }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Get Order By Id Error]:', error.message || error);
    next(error);
  }
};

/* ==============================================================================
 * 3. CART & CART MIGRATION CONTROLLERS
 * ============================================================================== */

/**
 * GET /api/customer/cart
 * Fetches the customer's persistent database cart.
 */
const getCart = async (req, res, next) => {
  try {
    const userId = req.user.id;

    let cart = await prisma.cart.findUnique({
      where: { userId },
      include: cartInclude
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId },
        include: cartInclude
      });
    }

    return res.status(200).json({
      success: true,
      data: { cart: formatCart(cart) }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Get Cart Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/customer/cart/migrate (or POST /api/customer/cart/merge)
 * Merges guest cart items (from localStorage upon login) into the database-persisted cart.
 */
const migrateCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { guestItems = [] } = req.body;

    if (!Array.isArray(guestItems)) {
      return res.status(400).json({
        success: false,
        error: { message: 'guestItems must be an array of cart items.', statusCode: 400 }
      });
    }

    // Ensure user has a cart
    let cart = await prisma.cart.findUnique({
      where: { userId }
    });

    if (!cart) {
      cart = await prisma.cart.create({ data: { userId } });
    }

    if (guestItems.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const guestItem of guestItems) {
          if (!guestItem.productId) continue;

          // Resolve product validity
          const product = await tx.product.findUnique({
            where: { id: guestItem.productId }
          });
          if (!product || product.status !== 'PUBLISHED') continue;

          const size = guestItem.size ? String(guestItem.size).trim() : null;
          const color = guestItem.color ? String(guestItem.color).trim() : null;
          const quantity = Math.max(1, parseInt(guestItem.quantity, 10) || 1);
          const productVariantId = guestItem.productVariantId || null;

          // Check if same product/size/color already exists in cart
          const existingItem = await tx.cartItem.findFirst({
            where: {
              cartId: cart.id,
              productId: product.id,
              size: size,
              color: color
            }
          });

          if (existingItem) {
            await tx.cartItem.update({
              where: { id: existingItem.id },
              data: { quantity: existingItem.quantity + quantity }
            });
          } else {
            await tx.cartItem.create({
              data: {
                cartId: cart.id,
                productId: product.id,
                productVariantId,
                size,
                color,
                quantity
              }
            });
          }
        }
      });
    }

    // Retrieve fully hydrated merged cart
    const finalCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: cartInclude
    });

    return res.status(200).json({
      success: true,
      message: 'Cart migrated and synchronized successfully.',
      data: { cart: formatCart(finalCart) }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Migrate Cart Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/customer/cart/items
 * Adds a single product or variant to the customer's cart.
 */
const addToCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId, productVariantId, size, color, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: { message: 'productId is required.', statusCode: 400 }
      });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product || product.status !== 'PUBLISHED') {
      return res.status(404).json({
        success: false,
        error: { message: 'Product not found or unavailable.', statusCode: 404 }
      });
    }

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const normalizedSize = size ? String(size).trim() : null;
    const normalizedColor = color ? String(color).trim() : null;

    let cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId } });
    }

    await prisma.$transaction(async (tx) => {
      const existing = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: product.id,
          size: normalizedSize,
          color: normalizedColor
        }
      });

      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + qty }
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            productVariantId: productVariantId || null,
            size: normalizedSize,
            color: normalizedColor,
            quantity: qty
          }
        });
      }
    });

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: cartInclude
    });

    return res.status(200).json({
      success: true,
      message: 'Product added to cart.',
      data: { cart: formatCart(updatedCart) }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Add to Cart Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/customer/cart/items/:id
 * Updates item quantity in the customer's cart.
 */
const updateCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity } = req.body;

    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: { message: 'Cart not found.', statusCode: 404 }
      });
    }

    let item = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id }
    });

    if (!item) {
      item = await prisma.cartItem.findFirst({
        where: { productId: id, cartId: cart.id }
      });
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { message: 'Cart item not found.', statusCode: 404 }
      });
    }

    const newQty = parseInt(quantity, 10);
    if (newQty <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await prisma.cartItem.update({
        where: { id: item.id },
        data: { quantity: newQty }
      });
    }

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: cartInclude
    });

    return res.status(200).json({
      success: true,
      message: 'Cart updated.',
      data: { cart: formatCart(updatedCart) }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Update Cart Item Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/customer/cart/items/:id
 * Removes a specific line item from the cart.
 */
const removeCartItem = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (!cart) {
      return res.status(404).json({
        success: false,
        error: { message: 'Cart not found.', statusCode: 404 }
      });
    }

    let item = await prisma.cartItem.findFirst({
      where: { id, cartId: cart.id }
    });

    if (!item) {
      item = await prisma.cartItem.findFirst({
        where: { productId: id, cartId: cart.id }
      });
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { message: 'Cart item not found.', statusCode: 404 }
      });
    }

    await prisma.cartItem.delete({ where: { id: item.id } });

    const updatedCart = await prisma.cart.findUnique({
      where: { id: cart.id },
      include: cartInclude
    });

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart.',
      data: { cart: formatCart(updatedCart) }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Remove Cart Item Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/customer/cart
 * Clears the entire cart for the customer.
 */
const clearCart = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const cart = await prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully.'
    });
  } catch (error) {
    console.error('[Customer Dashboard - Clear Cart Error]:', error.message || error);
    next(error);
  }
};

/* ==============================================================================
 * 4. WISHLIST & MOVE TO CART CONTROLLERS
 * ============================================================================== */

/**
 * GET /api/customer/wishlist
 * Retrieves the customer's persistent wishlist.
 */
const getWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;

    let wishlist = await prisma.wishlist.findUnique({
      where: { userId },
      include: wishlistInclude
    });

    if (!wishlist) {
      wishlist = await prisma.wishlist.create({
        data: { userId },
        include: wishlistInclude
      });
    }

    const formattedItems = wishlist.items.map((item) => {
      const p = item.product;
      const primaryImage =
        p.images?.find((img) => img.displayOrder === 0)?.secureUrl ||
        p.images?.[0]?.secureUrl ||
        null;

      return {
        id: item.id,
        productId: item.productId,
        name: p.name,
        slug: p.slug,
        category: p.category?.name || 'Collection',
        basePrice: parseFloat(p.basePrice || 0),
        image: primaryImage,
        variants: (p.variants || []).map((v) => ({
          id: v.id,
          sku: v.sku,
          size: v.size,
          color: v.color,
          price: v.price ? parseFloat(v.price) : parseFloat(p.basePrice),
          stock: v.stock
        })),
        createdAt: item.createdAt
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        wishlist: {
          id: wishlist.id,
          userId: wishlist.userId,
          itemCount: formattedItems.length,
          items: formattedItems
        }
      }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Get Wishlist Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/customer/wishlist/items
 * Adds a product to the customer's wishlist.
 */
const addToWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: { message: 'productId is required.', statusCode: 400 }
      });
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: 'Product not found.', statusCode: 404 }
      });
    }

    let wishlist = await prisma.wishlist.findUnique({ where: { userId } });
    if (!wishlist) {
      wishlist = await prisma.wishlist.create({ data: { userId } });
    }

    await prisma.wishlistItem.upsert({
      where: {
        wishlistId_productId: {
          wishlistId: wishlist.id,
          productId: product.id
        }
      },
      update: {},
      create: {
        wishlistId: wishlist.id,
        productId: product.id
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Product added to wishlist.'
    });
  } catch (error) {
    console.error('[Customer Dashboard - Add to Wishlist Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/customer/wishlist/items/:productId
 * Removes an item from the customer's wishlist.
 */
const removeFromWishlist = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const wishlist = await prisma.wishlist.findUnique({ where: { userId } });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        error: { message: 'Wishlist not found.', statusCode: 404 }
      });
    }

    await prisma.wishlistItem.deleteMany({
      where: {
        wishlistId: wishlist.id,
        productId
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Product removed from wishlist.'
    });
  } catch (error) {
    console.error('[Customer Dashboard - Remove from Wishlist Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/customer/wishlist/move-to-cart
 * Atomically moves a product from the Wishlist directly to the Cart.
 * 1. Verifies product is in wishlist.
 * 2. Adds/merges item in customer cart.
 * 3. Deletes item from wishlist.
 * 4. Returns updated cart and wishlist.
 */
const moveToCart = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { productId, productVariantId, size, color, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: { message: 'productId is required to move item to cart.', statusCode: 400 }
      });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        variants: true,
        images: true
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: 'Product not found or is currently unavailable.', statusCode: 404 }
      });
    }

    // Ensure user has both cart and wishlist records
    let [cart, wishlist] = await Promise.all([
      prisma.cart.findUnique({ where: { userId } }),
      prisma.wishlist.findUnique({ where: { userId } })
    ]);

    if (!cart) cart = await prisma.cart.create({ data: { userId } });
    if (!wishlist) wishlist = await prisma.wishlist.create({ data: { userId } });

    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const normalizedSize = size ? String(size).trim() : (product.variants?.[0]?.size || 'M');
    const normalizedColor = color ? String(color).trim() : (product.variants?.[0]?.color || 'Standard');
    const resolvedVariantId = productVariantId || product.variants?.[0]?.id || null;

    // Single atomic transaction: add to cart & remove from wishlist
    await prisma.$transaction(async (tx) => {
      // 1. Upsert or increment in Cart
      const existingCartItem = await tx.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: product.id,
          size: normalizedSize,
          color: normalizedColor
        }
      });

      if (existingCartItem) {
        await tx.cartItem.update({
          where: { id: existingCartItem.id },
          data: { quantity: existingCartItem.quantity + qty }
        });
      } else {
        await tx.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            productVariantId: resolvedVariantId,
            size: normalizedSize,
            color: normalizedColor,
            quantity: qty
          }
        });
      }

      // 2. Safely remove from Wishlist if present
      await tx.wishlistItem.deleteMany({
        where: {
          wishlistId: wishlist.id,
          productId: product.id
        }
      });
    });

    // Fetch updated structures
    const [updatedCart, updatedWishlist] = await Promise.all([
      prisma.cart.findUnique({ where: { id: cart.id }, include: cartInclude }),
      prisma.wishlist.findUnique({ where: { id: wishlist.id }, include: wishlistInclude })
    ]);

    return res.status(200).json({
      success: true,
      message: 'Item moved from wishlist to cart successfully.',
      data: {
        cart: formatCart(updatedCart),
        wishlist: {
          id: updatedWishlist.id,
          itemCount: updatedWishlist.items.length
        }
      }
    });
  } catch (error) {
    console.error('[Customer Dashboard - Move To Cart Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  // Address Book
  getAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,

  // Order History
  getCustomerOrders,
  getCustomerOrderById,

  // Cart & Cart Migration
  getCart,
  migrateCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,

  // Wishlist & Move to Cart
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  moveToCart
};

