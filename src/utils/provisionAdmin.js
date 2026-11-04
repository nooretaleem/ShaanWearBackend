const readline = require('readline');
const bcrypt = require('bcrypt');
const prisma = require('../config/database');

/**
 * Standard Default Roles and Granular Permissions for SHAANWEAR
 */
const DEFAULT_PERMISSIONS = [
  { identifier: 'products:read', description: 'View product catalog and variants' },
  { identifier: 'products:write', description: 'Create, edit, or archive products' },
  { identifier: 'inventory:read', description: 'View inventory counts and lots' },
  { identifier: 'inventory:adjust', description: 'Record stock adjustments and lot movements' },
  { identifier: 'orders:read', description: 'View online orders and customer history' },
  { identifier: 'orders:manage', description: 'Update order fulfillment and payment status' },
  { identifier: 'users:manage', description: 'Manage administrators, roles, and permissions' }
];

const askQuestion = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans.trim());
  }));
};

const provisionAdmin = async () => {
  console.log('\n======================================================');
  console.log(' SHAANWEAR Admin Provisioning Utility');
  console.log('======================================================');

  // Allow parameters from ENV or prompt interactively
  let name = process.env.ADMIN_INIT_NAME;
  let email = process.env.ADMIN_INIT_EMAIL;
  let password = process.env.ADMIN_INIT_PASSWORD;

  if (!name) {
    name = await askQuestion('Enter Admin Full Name: ');
  }
  if (!email) {
    email = await askQuestion('Enter Admin Email Address: ');
  }
  if (!password) {
    password = await askQuestion('Enter Admin Secure Password (min 8 chars): ');
  }

  if (!name || !email || !password) {
    console.error('\x1b[31m[ERROR] Name, email, and password are all required.\x1b[0m');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('\x1b[31m[ERROR] Password must be at least 8 characters long.\x1b[0m');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // 1. Ensure permissions exist
    console.log('\n1. Verifying default RBAC permissions...');
    for (const perm of DEFAULT_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { identifier: perm.identifier },
        update: {},
        create: perm
      });
    }

    // 2. Ensure SUPER_ADMIN role exists
    console.log('2. Verifying SUPER_ADMIN role...');
    const superAdminRole = await prisma.role.upsert({
      where: { name: 'SUPER_ADMIN' },
      update: {},
      create: {
        name: 'SUPER_ADMIN',
        description: 'Full unrestricted access to all administration features'
      }
    });

    // 3. Associate all permissions to SUPER_ADMIN role
    const allPermissions = await prisma.permission.findMany();
    for (const perm of allPermissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: perm.id
          }
        },
        update: {},
        create: {
          roleId: superAdminRole.id,
          permissionId: perm.id
        }
      });
    }

    // 4. Hash password with bcrypt (12 salt rounds)
    console.log('3. Generating secure bcrypt password hash...');
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 5. Upsert Admin User
    console.log('4. Provisioning admin user record...');
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    let adminUser;
    if (existingUser) {
      adminUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          passwordHash,
          isActive: true
        }
      });
      console.log(`\x1b[33mUpdated existing user with ID: ${adminUser.id}\x1b[0m`);
    } else {
      adminUser = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          isActive: true
        }
      });
      console.log(`\x1b[32mCreated new admin user with ID: ${adminUser.id}\x1b[0m`);
    }

    // 6. Assign SUPER_ADMIN role to user
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: adminUser.id,
          roleId: superAdminRole.id
        }
      },
      update: {},
      create: {
        userId: adminUser.id,
        roleId: superAdminRole.id
      }
    });

    console.log('\n======================================================');
    console.log('\x1b[32m✔ SUCCESS: Admin user successfully provisioned.\x1b[0m');
    console.log(`  Name  : ${adminUser.name}`);
    console.log(`  Email : ${adminUser.email}`);
    console.log(`  Role  : SUPER_ADMIN (${allPermissions.length} permissions assigned)`);
    console.log('======================================================\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\x1b[31m[PROVISIONING FAILED]:\x1b[0m', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
};

provisionAdmin();
