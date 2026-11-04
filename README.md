# SHAANWEAR Backend API Server

Clean, production-oriented Node.js & Express REST API server for the SHAANWEAR e-commerce platform.

## Architecture & Technology Stack

- **Runtime**: Node.js (CommonJS `require`/`module.exports`)
- **Web Framework**: Express.js
- **Database ORM**: Prisma ORM v5 with MySQL provider (Aiven MySQL compatible)
- **Authentication**: JWT (JSON Web Tokens) with standard Bearer authorization header
- **Password Hashing**: `bcrypt` (12 salt rounds)
- **Rate Limiting**: `express-rate-limit` (10 requests per 15 min on login)
- **Image Processing & Storage**: Cloudinary Node.js SDK (with automated format and quality optimization)
- **Upload Parser**: `multer` with in-memory buffering (no disk persistence, strict SVG rejection)
- **Security**: Helmet HTTP security headers & configurable CORS origin allowlist
- **Process Management**: Graceful SIGTERM/SIGINT shutdown with safe Prisma disconnect

## Directory Structure

```
backendserver/
├── prisma/
│   ├── migrations/           # Versioned migration history
│   └── schema.prisma         # Prisma MySQL schema & data models
├── src/
│   ├── config/
│   │   ├── env.js            # Environment validator & config loader
│   │   └── database.js       # Singleton Prisma client instance
│   ├── controllers/
│   │   ├── authController.js     # Login, profile retrieval, and logout handlers
│   │   ├── categoryController.js # Category CRUD, unique slugs, and safe deletion
│   │   ├── healthController.js   # API health verification
│   │   ├── productController.js  # Product CRUD, variant management, and archiving
│   │   └── uploadController.js   # Cloudinary product image upload and deletion
│   ├── middleware/
│   │   ├── authMiddleware.js   # JWT authentication & RBAC authorization guards
│   │   ├── errorMiddleware.js  # Centralized 404 & error handlers
│   │   └── uploadMiddleware.js # Multer in-memory upload parser and SVG validator
│   ├── routes/
│   │   ├── authRoutes.js       # Admin authentication endpoints & rate limiting
│   │   ├── categoryRoutes.js   # Category management endpoints
│   │   ├── healthRoutes.js     # Health check route definitions
│   │   ├── productRoutes.js    # Product & variant management endpoints
│   │   └── uploadRoutes.js     # Authenticated Cloudinary image upload routes
│   ├── services/
│   │   ├── cloudinaryService.js # Reusable Cloudinary upload and destroy operations
│   │   └── tokenService.js     # JWT signing and verification utilities
│   ├── utils/
│   │   ├── provisionAdmin.js   # Secure CLI utility to bootstrap admin credentials
│   │   └── slugify.js          # URL slug generation utility
│   ├── app.js                  # Express app configuration & middleware
│   └── server.js               # HTTP server bootstrap & shutdown lifecycle
├── tests/
│   ├── auth.test.js            # Automated auth & RBAC test suite (9 tests)
│   ├── catalog.test.js         # Automated Category & Product CRUD test suite (19 tests)
│   └── upload.test.js          # Automated Cloudinary upload & RBAC test suite (14 tests)
├── .env.example                # Environment variables template
├── .gitignore                  # Node modules and secrets exclusion
├── package.json                # NPM dependencies & operational scripts
└── README.md
```

## Available Scripts

- `npm run dev`: Start the API server in development mode with Nodemon.
- `npm start`: Start the API server in production mode with Node.js.
- `npm run prisma:generate`: Generate Prisma Client based on `prisma/schema.prisma`.
- `npm run prisma:migrate`: Run Prisma database migrations.
- `npm run admin:init`: Secure interactive CLI to provision or update the initial Super Administrator.
- `npm test`: Run the complete 42-test automated suite (Auth + Uploads + Catalog).
- `npm run test:auth`: Run only the authentication and RBAC test suite.
- `npm run test:upload`: Run only the Cloudinary upload and validation test suite.
- `npm run test:catalog`: Run only the Category & Product CRUD test suite.

## Initial Setup & Environment Configuration

### 1. Environment Variables

Copy `.env.example` to `.env` and configure your credentials:

```bash
cp .env.example .env
```

Ensure the following variables are defined in `.env`:
- `PORT`: Server listening port (default: `5000`)
- `DATABASE_URL`: MySQL connection URI
- `JWT_SECRET`: High-entropy secret key for JWT signing
- `JWT_EXPIRES_IN`: JWT expiration (e.g. `24h`)
- `CLOUDINARY_CLOUD_NAME`: Cloudinary cloud name
- `CLOUDINARY_API_KEY`: Cloudinary API key
- `CLOUDINARY_API_SECRET`: Cloudinary API secret

### 2. Provision Initial Administrator

Run the secure CLI provisioning tool:

```bash
npm run admin:init
```

The script will prompt for:
- **Full Name**
- **Email Address**
- **Password** (min 8 characters)

Alternatively, provide environment variables non-interactively:
```bash
ADMIN_INIT_NAME="Super Administrator" ADMIN_INIT_EMAIL="admin@shaanwear.pk" ADMIN_INIT_PASSWORD="YourSecurePassword" npm run admin:init
```

---

## API Endpoints Reference

All administrative endpoints require a valid JWT Bearer token in the `Authorization` header.

### 1. Authentication Endpoints

| Method | Route | Permission Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | Public (Rate-limited) | Authenticate admin via email and password |
| `GET` | `/api/auth/me` | Authenticated | Retrieve current user profile and RBAC permissions |
| `POST` | `/api/auth/logout` | Authenticated | Invalidate authentication session |

---

### 2. Category APIs

| Method | Route | Permission Required | Description |
|---|---|---|---|
| `GET` | `/api/categories` | `products:read` | Paginated listing with search & active status filter |
| `GET` | `/api/categories/:id` | `products:read` | Category details by UUID or slug |
| `POST` | `/api/categories` | `products:write` | Create category with unique slug |
| `PATCH` | `/api/categories/:id` | `products:write` | Update category attributes |
| `DELETE` | `/api/categories/:id` | `products:write` | Safe delete (returns 409 if products are linked) |

#### Category Query Parameters:
- `page`: Page number (default: `1`)
- `limit`: Records per page (default: `20`, max: `100`)
- `search`: Substring match on category `name` or `description`
- `isActive`: Boolean filter (`true` or `false`)
- `sortBy`: `name`, `createdAt`, `updatedAt` (default: `createdAt`)
- `sortOrder`: `asc` or `desc` (default: `desc`)

#### Create Category Example:
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jackets & Coats",
    "description": "Outerwear, bombers, and varsity jackets."
  }'
```

---

### 3. Product APIs

| Method | Route | Permission Required | Description |
|---|---|---|---|
| `GET` | `/api/products` | `products:read` | Paginated product listing with filters and sorting |
| `GET` | `/api/products/:id` | `products:read` | Full product details with variants and images |
| `POST` | `/api/products` | `products:write` | Create product with variants and image metadata |
| `PATCH` | `/api/products/:id` | `products:write` | Partial update of product attributes and variants |
| `DELETE` | `/api/products/:id` | `products:write` | Safe deletion or audit-preserving archiving |

#### Product Query Parameters:
- `page`: Page number (default: `1`)
- `limit`: Records per page (default: `20`, max: `100`)
- `search`: Searches product `name`, `description`, or variant `sku`
- `categoryId`: Filter by Category UUID
- `status`: Filter by `DRAFT`, `PUBLISHED`, `ARCHIVED`
- `sortBy`: `createdAt`, `name`, `basePrice`, `updatedAt` (default: `createdAt`)
- `sortOrder`: `asc` or `desc` (default: `desc`)

#### Create Product Example:
```bash
curl -X POST http://localhost:5000/api/products \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aviator Leather Jacket",
    "categoryId": "<CATEGORY_UUID>",
    "description": "Handcrafted sheepskin leather with shearling collar.",
    "status": "DRAFT",
    "basePrice": 14999.00,
    "variants": [
      {
        "sku": "SW-JKT-AVT-BRN-M",
        "size": "M",
        "color": "Dark Brown",
        "colorHex": "#3D2314",
        "price": 14999.00,
        "stock": 25
      },
      {
        "sku": "SW-JKT-AVT-BRN-L",
        "size": "L",
        "color": "Dark Brown",
        "colorHex": "#3D2314",
        "price": 15499.00,
        "stock": 18
      }
    ],
    "images": [
      {
        "cloudinaryPublicId": "shaanwear/products/sample_front",
        "secureUrl": "https://res.cloudinary.com/.../shaanwear/products/sample_front.webp",
        "altText": "Front view of Aviator Leather Jacket",
        "displayOrder": 0,
        "variantSku": "SW-JKT-AVT-BRN-M"
      }
    ]
  }'
```

#### Safe Deletion & Archiving Rules:
- **Empty Category Deletion**: Permitted only when `_count.products === 0`. If products are assigned, the API responds with `409 Conflict`.
- **Product Deletion**:
  - If the product has **no order history and no inventory lot movements**, it is permanently hard-deleted (variants and images cascade).
  - If the product has **historical orders (`orderItems > 0`) or inventory movements (`inventoryMovements > 0`)**, it is automatically and safely set to `status = 'ARCHIVED'`. This prevents referential integrity violations and preserves complete financial and audit records.

---

### 4. Cloudinary Product Image Service

| Method | Route | Permission Required | Description |
|---|---|---|---|
| `POST` | `/api/uploads/product-images` | `products:write` | Upload image buffer directly to Cloudinary |
| `DELETE` | `/api/uploads/product-images` | `products:write` | Destroy asset on Cloudinary by public ID |

---

## Automated Test Suites

Run the complete test suite:
```bash
npm test
```

- **Authentication Suite (`tests/auth.test.js`)**: 9 tests validating login rate limits, credentials, token guards, inactive user rejections, and RBAC permissions.
- **Cloudinary Service Suite (`tests/upload.test.js`)**: 14 tests validating multipart image parsing, SVG security rejection, 5MB file limits, Cloudinary mock streaming, and deletion handling.
- **Category & Product CRUD Suite (`tests/catalog.test.js`)**: 19 tests validating pagination, category uniqueness, duplicate SKU detection, nested atomic transactions, safe category conflict checks, clean product deletion, and audit-safe product archiving.
