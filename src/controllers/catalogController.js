const prisma = require('../config/database');

/**
 * SHAANWEAR Public Catalog Controller
 * Safe, read-only catalog endpoints for public storefront consumers.
 * Exposes only active categories and published products.
 * Does not expose sensitive administration fields or require admin JWT.
 */

/**
 * GET /api/catalog/categories
 * Returns active categories with their assigned images and public metadata.
 */
const getPublicCategories = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const { search, sortBy = 'createdAt', sortOrder = 'asc' } = req.query;

    const where = {
      isActive: true
    };

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { description: { contains: term } }
      ];
    }

    const validSortFields = ['name', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder.toLowerCase() === 'desc' ? 'desc' : 'asc';

    const [total, categories] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          imageUrl: true,
          cloudinaryPublicId: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              products: {
                where: { status: 'PUBLISHED' }
              }
            }
          }
        }
      })
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        categories,
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
    console.error('[Catalog Controller - getPublicCategories Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/catalog/categories/:id
 * Retrieve single active category by ID or slug.
 */
const getPublicCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid category identifier provided.', statusCode: 400 }
      });
    }

    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { id: id },
          { slug: id }
        ],
        isActive: true
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        imageUrl: true,
        cloudinaryPublicId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            products: {
              where: { status: 'PUBLISHED' }
            }
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: { message: `Category '${id}' was not found or is currently inactive.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: { category }
    });
  } catch (error) {
    console.error('[Catalog Controller - getPublicCategoryById Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/catalog/products
 * Returns published products with variants and Cloudinary images.
 * Restricts results to published items in active categories.
 */
const getPublicProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, categoryId, categorySlug, category, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const where = {
      status: 'PUBLISHED',
      category: {
        isActive: true
      }
    };

    // Category filtering
    if (categoryId && typeof categoryId === 'string' && categoryId.trim()) {
      where.categoryId = categoryId.trim();
    } else if (categorySlug && typeof categorySlug === 'string' && categorySlug.trim()) {
      where.category.slug = categorySlug.trim();
    } else if (category && typeof category === 'string' && category.trim()) {
      const catParam = category.trim();
      where.category.OR = [
        { id: catParam },
        { slug: catParam }
      ];
    }

    // Keyword search across product name and description
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { description: { contains: term } }
      ];
    }

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
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          basePrice: true,
          status: true,
          categoryId: true,
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              imageUrl: true
            }
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
          createdAt: true,
          updatedAt: true
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
    console.error('[Catalog Controller - getPublicProducts Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/catalog/products/:id
 * Retrieve a single published product by UUID or slug with full variants and Cloudinary images.
 */
const getPublicProductById = async (req, res, next) => {
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
        ],
        status: 'PUBLISHED',
        category: {
          isActive: true
        }
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        basePrice: true,
        status: true,
        categoryId: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            imageUrl: true
          }
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
        createdAt: true,
        updatedAt: true
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: `Product '${id}' was not found or is not currently available.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    console.error('[Catalog Controller - getPublicProductById Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  getPublicCategories,
  getPublicCategoryById,
  getPublicProducts,
  getPublicProductById
};
