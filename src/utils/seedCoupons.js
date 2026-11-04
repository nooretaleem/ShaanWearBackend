const prisma = require('../config/database');

async function seedStandardCoupons() {
  const coupons = [
    { code: 'SHAAN10', discountType: 'PERCENTAGE', value: 10, isActive: true },
    { code: 'WELCOME10', discountType: 'PERCENTAGE', value: 10, isActive: true },
    { code: 'SAVE15', discountType: 'PERCENTAGE', value: 15, minOrderAmount: 2000, isActive: true },
    { code: 'SURPLUS15', discountType: 'PERCENTAGE', value: 15, minOrderAmount: 1500, isActive: true },
    { code: 'FLAT500', discountType: 'FIXED_AMOUNT', value: 500, minOrderAmount: 3000, isActive: true }
  ];

  for (const c of coupons) {
    await prisma.discount.upsert({
      where: { code: c.code },
      update: {},
      create: c
    });
  }
  console.log('✔ Standard promotional coupons seeded successfully.');
  await prisma.$disconnect();
}

seedStandardCoupons().catch((err) => {
  console.error('Failed to seed coupons:', err);
  process.exit(1);
});
