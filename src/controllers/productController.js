const prisma = require('../config/database');
const { slugify } = require('../utils/slugify');

const VALID_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

/**
 * GET /api/products
 * Paginated product listing with search, category, status, and sorting filters.
 */
const getProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, categoryId, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const where = {};

    // Search across name, description, and variant SKUs
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { description: { contains: term } },
        { variants: { some: { sku: { contains: term } } } }
      ];
    }

    // Category filter
    if (categoryId && typeof categoryId === 'string' && categoryId.trim()) {
      where.categoryId = categoryId.trim();
    }

    // Status filter
    if (status && typeof status === 'string' && status.trim()) {
      const upperStatus = status.trim().toUpperCase();
      if (VALID_STATUSES.includes(upperStatus)) {
        where.status = upperStatus;
      }
    }

    // Sorting
    const validSortFields = ['createdAt', 'name', 'basePrice', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          category: {
            select: { id: true, name: true, slug: true }
          },
          variants: {
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              colorHex: true,
              price: true,
              stock: true
            }
          },
          images: {
            select: {
              id: true,
              cloudinaryPublicId: true,
              secureUrl: true,
              altText: true,
              displayOrder: true,
              productVariantId: true
            },
            orderBy: { displayOrder: 'asc' }
          },
          _count: {
            select: { orderItems: true }
          }
        }
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        products,
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
    console.error('[Product Controller - Get Products Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/products/:id
 * Retrieve single product details including full variants and images.
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid product identifier provided.', statusCode: 400 }
      });
    }

    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: id },
          { slug: id }
        ]
      },
      include: {
        category: true,
        variants: {
          include: {
            images: {
              orderBy: { displayOrder: 'asc' }
            }
          }
        },
        images: {
          orderBy: { displayOrder: 'asc' }
        },
        _count: {
          select: { orderItems: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: `Product with identifier '${id}' was not found.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    console.error('[Product Controller - Get Product By Id Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/products
 * Create a new product with optional initial variants and Cloudinary image metadata.
 */
const createProduct = async (req, res, next) => {
  try {
    const {
      name,
      slug,
      categoryId,
      description,
      status = 'DRAFT',
      basePrice = 0,
      variants = [],
      images = []
    } = req.body;

    // 1. Validate Product Name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Product name is required and must be a string.', statusCode: 400 }
      });
    }
    const trimmedName = name.trim();
    if (trimmedName.length > 255) {
      return res.status(400).json({
        success: false,
        error: { message: 'Product name must not exceed 255 characters.', statusCode: 400 }
      });
    }

    // 2. Validate Category
    if (!categoryId || typeof categoryId !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'categoryId is required and must be a valid ID.', statusCode: 400 }
      });
    }
    const categoryExists = await prisma.category.findUnique({
      where: { id: categoryId.trim() }
    });
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        error: { message: `Category with ID '${categoryId}' does not exist.`, statusCode: 400 }
      });
    }

    // 3. Validate Slug
    const targetSlug = slugify(slug && typeof slug === 'string' && slug.trim() ? slug : trimmedName);
    if (!targetSlug) {
      return res.status(400).json({
        success: false,
        error: { message: 'Could not generate a valid URL slug for product.', statusCode: 400 }
      });
    }
    const slugExists = await prisma.product.findUnique({
      where: { slug: targetSlug }
    });
    if (slugExists) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Product slug '${targetSlug}' is already in use. Please provide a distinct name or slug.`,
          statusCode: 409
        }
      });
    }

    // 4. Validate Status
    const upperStatus = typeof status === 'string' ? status.trim().toUpperCase() : 'DRAFT';
    if (!VALID_STATUSES.includes(upperStatus)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid product status '${status}'. Allowed: ${VALID_STATUSES.join(', ')}`,
          statusCode: 400
        }
      });
    }

    // 5. Validate Base Price
    const parsedBasePrice = parseFloat(basePrice);
    if (isNaN(parsedBasePrice) || parsedBasePrice < 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'basePrice must be a valid non-negative number.', statusCode: 400 }
      });
    }

    // 6. Validate Variants & Unique SKUs
    if (!Array.isArray(variants)) {
      return res.status(400).json({
        success: false,
        error: { message: 'variants must be an array of variant objects.', statusCode: 400 }
      });
    }

    const skuSet = new Set();
    const formattedVariants = [];

    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v || typeof v !== 'object') {
        return res.status(400).json({
          success: false,
          error: { message: `Variant at index ${i} is invalid.`, statusCode: 400 }
        });
      }

      if (!v.sku || typeof v.sku !== 'string' || !v.sku.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: `Variant at index ${i} is missing a required SKU.`, statusCode: 400 }
        });
      }

      const trimmedSku = v.sku.trim().toUpperCase();
      if (skuSet.has(trimmedSku)) {
        return res.status(400).json({
          success: false,
          error: { message: `Duplicate SKU '${trimmedSku}' within the request variants.`, statusCode: 400 }
        });
      }
      skuSet.add(trimmedSku);

      // Check SKU uniqueness in DB
      const existingSku = await prisma.productVariant.findUnique({
        where: { sku: trimmedSku }
      });
      if (existingSku) {
        return res.status(409).json({
          success: false,
          error: { message: `SKU '${trimmedSku}' is already assigned to another variant.`, statusCode: 409 }
        });
      }

      const stockNum = v.stock !== undefined ? parseInt(v.stock, 10) : 0;
      if (isNaN(stockNum) || stockNum < 0) {
        return res.status(400).json({
          success: false,
          error: { message: `Stock for SKU '${trimmedSku}' must be a non-negative integer.`, statusCode: 400 }
        });
      }

      let priceVal = null;
      if (v.price !== undefined && v.price !== null && v.price !== '') {
        const parsedVPrice = parseFloat(v.price);
        if (isNaN(parsedVPrice) || parsedVPrice < 0) {
          return res.status(400).json({
            success: false,
            error: { message: `Price for SKU '${trimmedSku}' must be a valid non-negative number.`, statusCode: 400 }
          });
        }
        priceVal = parsedVPrice;
      }

      formattedVariants.push({
        sku: trimmedSku,
        size: v.size && typeof v.size === 'string' ? v.size.trim() : null,
        color: v.color && typeof v.color === 'string' ? v.color.trim() : null,
        colorHex: v.colorHex && typeof v.colorHex === 'string' ? v.colorHex.trim() : null,
        price: priceVal,
        stock: stockNum
      });
    }

    // 7. Validate Images
    if (!Array.isArray(images)) {
      return res.status(400).json({
        success: false,
        error: { message: 'images must be an array of image objects.', statusCode: 400 }
      });
    }

    const formattedImages = [];
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      if (!img || typeof img !== 'object') {
        return res.status(400).json({
          success: false,
          error: { message: `Image metadata at index ${i} is invalid.`, statusCode: 400 }
        });
      }

      const publicId = (img.cloudinaryPublicId || img.publicId);
      if (!publicId || typeof publicId !== 'string' || !publicId.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: `Image at index ${i} is missing required cloudinaryPublicId.`, statusCode: 400 }
        });
      }

      const url = (img.secureUrl || img.url);
      if (!url || typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
        return res.status(400).json({
          success: false,
          error: { message: `Image at index ${i} is missing a valid secureUrl.`, statusCode: 400 }
        });
      }

      formattedImages.push({
        cloudinaryPublicId: publicId.trim(),
        secureUrl: url.trim(),
        altText: img.altText && typeof img.altText === 'string' ? img.altText.trim() : null,
        displayOrder: typeof img.displayOrder === 'number' ? img.displayOrder : i,
        variantSku: img.variantSku && typeof img.variantSku === 'string' ? img.variantSku.trim().toUpperCase() : null
      });
    }

    // 8. Execute Database Creation within Transaction with 25s timeout
    const createdProductId = await prisma.$transaction(async (tx) => {
      // Create product core record
      const prod = await tx.product.create({
        data: {
          name: trimmedName,
          slug: targetSlug,
          description: description && typeof description === 'string' ? description.trim() : null,
          status: upperStatus,
          basePrice: parsedBasePrice,
          categoryId: categoryId.trim()
        }
      });

      // Map to track variant IDs by SKU
      const variantIdMap = new Map();

      // Create variants
      for (const vData of formattedVariants) {
        const createdVariant = await tx.productVariant.create({
          data: {
            productId: prod.id,
            sku: vData.sku,
            size: vData.size,
            color: vData.color,
            colorHex: vData.colorHex,
            price: vData.price,
            stock: vData.stock
          }
        });
        variantIdMap.set(vData.sku, createdVariant.id);
      }

      // Create images linked to product and optionally to variant
      for (const imgData of formattedImages) {
        let variantId = null;
        if (imgData.variantSku && variantIdMap.has(imgData.variantSku)) {
          variantId = variantIdMap.get(imgData.variantSku);
        }

        await tx.productImage.create({
          data: {
            productId: prod.id,
            productVariantId: variantId,
            cloudinaryPublicId: imgData.cloudinaryPublicId,
            secureUrl: imgData.secureUrl,
            altText: imgData.altText,
            displayOrder: imgData.displayOrder
          }
        });
      }

      return prod.id;
    }, {
      maxWait: 10000,
      timeout: 25000
    });

    const createdProduct = await prisma.product.findUnique({
      where: { id: createdProductId },
      include: {
        category: true,
        variants: true,
        images: { orderBy: { displayOrder: 'asc' } }
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully with variants and image metadata.',
      data: { product: createdProduct }
    });
  } catch (error) {
    console.error('[Product Controller - Create Product Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/products/:id
 * Partially update product attributes, variants, and image metadata.
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      categoryId,
      description,
      status,
      basePrice,
      variants,
      images
    } = req.body;

    // Check existing product
    const existingProduct = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
        images: true
      }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        error: { message: `Product with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    const updateFields = {};

    // Validate and update name
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'Product name must be a non-empty string.', statusCode: 400 }
        });
      }
      if (name.trim().length > 255) {
        return res.status(400).json({
          success: false,
          error: { message: 'Product name must not exceed 255 characters.', statusCode: 400 }
        });
      }
      updateFields.name = name.trim();
    }

    // Validate and update slug
    if (slug !== undefined) {
      const targetSlug = slugify(slug);
      if (!targetSlug) {
        return res.status(400).json({
          success: false,
          error: { message: 'Product slug must be a valid string.', statusCode: 400 }
        });
      }

      const conflictSlug = await prisma.product.findFirst({
        where: {
          slug: targetSlug,
          NOT: { id: id }
        }
      });
      if (conflictSlug) {
        return res.status(409).json({
          success: false,
          error: { message: `Product slug '${targetSlug}' is already taken by another product.`, statusCode: 409 }
        });
      }
      updateFields.slug = targetSlug;
    }

    // Validate and update categoryId
    if (categoryId !== undefined) {
      if (typeof categoryId !== 'string' || !categoryId.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'categoryId must be a valid ID string.', statusCode: 400 }
        });
      }
      const categoryExists = await prisma.category.findUnique({
        where: { id: categoryId.trim() }
      });
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          error: { message: `Category with ID '${categoryId}' does not exist.`, statusCode: 400 }
        });
      }
      updateFields.categoryId = categoryId.trim();
    }

    // Description
    if (description !== undefined) {
      updateFields.description = typeof description === 'string' ? description.trim() : null;
    }

    // Status
    if (status !== undefined) {
      const upperStatus = typeof status === 'string' ? status.trim().toUpperCase() : '';
      if (!VALID_STATUSES.includes(upperStatus)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Invalid product status '${status}'. Allowed: ${VALID_STATUSES.join(', ')}`,
            statusCode: 400
          }
        });
      }
      updateFields.status = upperStatus;
    }

    // Base price
    if (basePrice !== undefined) {
      const parsedBasePrice = parseFloat(basePrice);
      if (isNaN(parsedBasePrice) || parsedBasePrice < 0) {
        return res.status(400).json({
          success: false,
          error: { message: 'basePrice must be a valid non-negative number.', statusCode: 400 }
        });
      }
      updateFields.basePrice = parsedBasePrice;
    }

    // Execute atomic update
    await prisma.$transaction(async (tx) => {
      // 1. Update core product attributes
      await tx.product.update({
        where: { id },
        data: updateFields
      });

      // 2. Handle variants update if provided
      if (Array.isArray(variants)) {
        for (const v of variants) {
          if (v && v.sku && typeof v.sku === 'string') {
            const trimmedSku = v.sku.trim().toUpperCase();

            // Check if variant already exists on this product
            const existingVariant = await tx.productVariant.findFirst({
              where: {
                productId: id,
                sku: trimmedSku
              }
            });

            const stockNum = v.stock !== undefined ? Math.max(0, parseInt(v.stock, 10)) : undefined;
            const priceVal = v.price !== undefined && v.price !== null && v.price !== '' ? parseFloat(v.price) : undefined;

            if (existingVariant) {
              await tx.productVariant.update({
                where: { id: existingVariant.id },
                data: {
                  size: v.size !== undefined ? v.size : existingVariant.size,
                  color: v.color !== undefined ? v.color : existingVariant.color,
                  colorHex: v.colorHex !== undefined ? v.colorHex : existingVariant.colorHex,
                  price: priceVal !== undefined ? priceVal : existingVariant.price,
                  stock: stockNum !== undefined ? stockNum : existingVariant.stock
                }
              });
            } else {
              // Check if SKU is used by another product
              const globalSkuConflict = await tx.productVariant.findUnique({
                where: { sku: trimmedSku }
              });
              if (globalSkuConflict) {
                const err = new Error(`SKU '${trimmedSku}' is already assigned to another product variant.`);
                err.statusCode = 409;
                throw err;
              }

              await tx.productVariant.create({
                data: {
                  productId: id,
                  sku: trimmedSku,
                  size: v.size || null,
                  color: v.color || null,
                  colorHex: v.colorHex || null,
                  price: priceVal !== undefined ? priceVal : null,
                  stock: stockNum !== undefined ? stockNum : 0
                }
              });
            }
          }
        }
      }

      // 3. Handle images update if provided (replaces product image list safely)
      if (Array.isArray(images)) {
        // Remove previous image records (does not delete assets from Cloudinary)
        await tx.productImage.deleteMany({
          where: { productId: id }
        });

        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const publicId = img.cloudinaryPublicId || img.publicId;
          const url = img.secureUrl || img.url;

          if (publicId && url) {
            await tx.productImage.create({
              data: {
                productId: id,
                cloudinaryPublicId: publicId.trim(),
                secureUrl: url.trim(),
                altText: img.altText ? img.altText.trim() : null,
                displayOrder: typeof img.displayOrder === 'number' ? img.displayOrder : i,
                productVariantId: img.productVariantId || null
              }
            });
          }
        }
      }

      return id;
    }, {
      maxWait: 10000,
      timeout: 25000
    });

    const updated = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: true,
        images: { orderBy: { displayOrder: 'asc' } }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      data: { product: updated }
    });
  } catch (error) {
    console.error('[Product Controller - Update Product Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/products/:id
 * Safe deletion: Deletes if no order/inventory history exists, otherwise archives safely.
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            _count: {
              select: {
                inventoryMovements: true,
                orderItems: true
              }
            }
          }
        },
        _count: {
          select: {
            orderItems: true
          }
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: `Product with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    // Check if product or any of its variants have sales or inventory history
    let hasInventoryHistory = false;
    let hasOrderHistory = product._count.orderItems > 0;

    for (const v of product.variants) {
      if (v._count.inventoryMovements > 0) hasInventoryHistory = true;
      if (v._count.orderItems > 0) hasOrderHistory = true;
    }

    // If historical order or inventory records exist, archive instead of hard delete to preserve referential integrity
    if (hasInventoryHistory || hasOrderHistory) {
      const archived = await prisma.product.update({
        where: { id },
        data: { status: 'ARCHIVED' }
      });

      return res.status(200).json({
        success: true,
        message: 'Product has linked order or inventory history. It has been safely archived instead of permanent deletion.',
        data: {
          id: archived.id,
          name: archived.name,
          status: archived.status,
          archived: true
        }
      });
    }

    // If no historical records exist, hard delete safely (variants and images cascade)
    await prisma.product.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: `Product '${product.name}' and its variants/image records were permanently deleted.`,
      data: {
        id: product.id,
        name: product.name,
        deleted: true
      }
    });
  } catch (error) {
    console.error('[Product Controller - Delete Product Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct
};
