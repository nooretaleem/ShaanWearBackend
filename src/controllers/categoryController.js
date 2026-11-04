const prisma = require('../config/database');
const { slugify } = require('../utils/slugify');

/**
 * GET /api/categories
 * Paginated category listing with search and active status filtering.
 */
const getCategories = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { search, isActive, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const where = {};

    // Search filter across name and description
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { description: { contains: term } }
      ];
    }

    // Active status filter
    if (isActive !== undefined && isActive !== '') {
      where.isActive = isActive === 'true' || isActive === true;
    }

    // Allowed sort fields
    const validSortFields = ['name', 'createdAt', 'updatedAt'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const [total, categories] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDirection },
        include: {
          _count: {
            select: { products: true }
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
    console.error('[Category Controller - Get Categories Error]:', error.message || error);
    next(error);
  }
};

/**
 * GET /api/categories/:id
 * Retrieve a specific category by its UUID or unique slug.
 */
const getCategoryById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({
        success: false,
        error: { message: 'Invalid category identifier provided.', statusCode: 400 }
      });
    }

    // Support lookup by UUID or slug
    const category = await prisma.category.findFirst({
      where: {
        OR: [
          { id: id },
          { slug: id }
        ]
      },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: { message: `Category with identifier '${id}' was not found.`, statusCode: 404 }
      });
    }

    return res.status(200).json({
      success: true,
      data: { category }
    });
  } catch (error) {
    console.error('[Category Controller - Get Category By Id Error]:', error.message || error);
    next(error);
  }
};

/**
 * POST /api/categories
 * Create a new category with a unique slug.
 */
const createCategory = async (req, res, next) => {
  try {
    const { name, slug, description, isActive, imageUrl, image, cloudinaryPublicId } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'Category name is required and must be a string.', statusCode: 400 }
      });
    }

    const trimmedName = name.trim();
    if (trimmedName.length > 128) {
      return res.status(400).json({
        success: false,
        error: { message: 'Category name must not exceed 128 characters.', statusCode: 400 }
      });
    }

    // Auto-generate slug from name if not provided
    const targetSlug = slugify(slug && typeof slug === 'string' && slug.trim() ? slug : trimmedName);

    if (!targetSlug) {
      return res.status(400).json({
        success: false,
        error: { message: 'Could not generate a valid URL slug for category.', statusCode: 400 }
      });
    }

    // Check slug uniqueness
    const existing = await prisma.category.findUnique({
      where: { slug: targetSlug }
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Category slug '${targetSlug}' is already in use. Please provide a unique slug or name.`,
          statusCode: 409
        }
      });
    }

    const targetImageUrl = (imageUrl || image) && typeof (imageUrl || image) === 'string'
      ? (imageUrl || image).trim()
      : null;
    const targetPublicId = cloudinaryPublicId && typeof cloudinaryPublicId === 'string'
      ? cloudinaryPublicId.trim()
      : null;

    const category = await prisma.category.create({
      data: {
        name: trimmedName,
        slug: targetSlug,
        description: description && typeof description === 'string' ? description.trim() : null,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        imageUrl: targetImageUrl,
        cloudinaryPublicId: targetPublicId
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully.',
      data: { category }
    });
  } catch (error) {
    console.error('[Category Controller - Create Category Error]:', error.message || error);
    next(error);
  }
};

/**
 * PATCH /api/categories/:id
 * Partially update category attributes (name, slug, description, isActive, imageUrl, cloudinaryPublicId).
 */
const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, slug, description, isActive, imageUrl, image, cloudinaryPublicId } = req.body;

    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        error: { message: `Category with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          success: false,
          error: { message: 'Category name must be a non-empty string.', statusCode: 400 }
        });
      }
      if (name.trim().length > 128) {
        return res.status(400).json({
          success: false,
          error: { message: 'Category name must not exceed 128 characters.', statusCode: 400 }
        });
      }
      updateData.name = name.trim();
    }

    if (slug !== undefined) {
      const targetSlug = slugify(slug);
      if (!targetSlug) {
        return res.status(400).json({
          success: false,
          error: { message: 'Category slug must be a valid URL string.', statusCode: 400 }
        });
      }

      // Check if another category is using this slug
      const slugConflict = await prisma.category.findFirst({
        where: {
          slug: targetSlug,
          NOT: { id: id }
        }
      });

      if (slugConflict) {
        return res.status(409).json({
          success: false,
          error: {
            message: `Category slug '${targetSlug}' is already in use by another category.`,
            statusCode: 409
          }
        });
      }

      updateData.slug = targetSlug;
    }

    if (description !== undefined) {
      updateData.description = typeof description === 'string' ? description.trim() : null;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    if (imageUrl !== undefined || image !== undefined) {
      const imgVal = imageUrl !== undefined ? imageUrl : image;
      updateData.imageUrl = imgVal && typeof imgVal === 'string' ? imgVal.trim() : null;
    }

    if (cloudinaryPublicId !== undefined) {
      updateData.cloudinaryPublicId = cloudinaryPublicId && typeof cloudinaryPublicId === 'string'
        ? cloudinaryPublicId.trim()
        : null;
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: updateData
    });

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully.',
      data: { category: updatedCategory }
    });
  } catch (error) {
    console.error('[Category Controller - Update Category Error]:', error.message || error);
    next(error);
  }
};

/**
 * DELETE /api/categories/:id
 * Safe deletion only when no associated products exist; otherwise returns 409 Conflict.
 */
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        error: { message: `Category with ID '${id}' was not found.`, statusCode: 404 }
      });
    }

    // Safe deletion check: prevent deletion if products are linked
    if (category._count.products > 0) {
      return res.status(409).json({
        success: false,
        error: {
          message: `Cannot delete category '${category.name}' because it contains ${category._count.products} associated product(s). Reassign or remove all products first.`,
          statusCode: 409
        }
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    return res.status(200).json({
      success: true,
      message: `Category '${category.name}' was successfully deleted.`,
      data: {
        id: category.id,
        name: category.name
      }
    });
  } catch (error) {
    console.error('[Category Controller - Delete Category Error]:', error.message || error);
    next(error);
  }
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
};
