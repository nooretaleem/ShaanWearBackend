const prisma = require('../config/database');

/**
 * GET /api/customers
 * Lists customers with order stats.
 * Query: limit (1-100, default 20), page (default 1), search (name/email/phone).
 * totalOrders = number of orders; totalSpent = sum of order totals excluding CANCELLED orders.
 */
const getCustomers = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {};
    const { search } = req.query;
    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim();
      where.OR = [
        { name: { contains: term } },
        { email: { contains: term } },
        { phone: { contains: term } }
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          _count: { select: { orders: true } }
        }
      })
    ]);

    // Aggregate spend for just the customers on this page
    const ids = rows.map(c => c.id);
    const sums = ids.length
      ? await prisma.order.groupBy({
          by: ['customerId'],
          where: { customerId: { in: ids }, fulfillmentStatus: { not: 'CANCELLED' } },
          _sum: { total: true }
        })
      : [];
    const spentById = new Map(sums.map(s => [s.customerId, Number(s._sum.total) || 0]));

    const customers = rows.map(c => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      createdAt: c.createdAt,
      totalOrders: c._count.orders,
      totalSpent: spentById.get(c.id) ?? 0
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return res.status(200).json({
      success: true,
      data: {
        customers,
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
    console.error('[Customer Controller - Get Customers Error]:', error.message || error);
    next(error);
  }
};

module.exports = { getCustomers };

