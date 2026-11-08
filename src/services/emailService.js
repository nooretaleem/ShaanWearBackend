const nodemailer = require('nodemailer');
const prisma = require('../config/database');

/**
 * SHAANWEAR Automated Email Service
 * Manages SMTP transport, luxury email templating, and Wishlist automation triggers:
 * 1. Back-in-Stock Alerts
 * 2. Price Drop Alerts
 */

// Global in-memory log for testing & audit inspection
const sentEmailHistory = [];

/**
 * Create Nodemailer Transporter
 * Uses SMTP settings from process.env if available, otherwise initializes test transport / console logger.
 */
let transporter = null;

const initTransporter = () => {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10) || 587,
      secure: parseInt(SMTP_PORT, 10) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  } else {
    // Development / Test transporter: logs to console and memory
    transporter = {
      sendMail: async (mailOptions) => {
        const record = {
          to: mailOptions.to,
          from: mailOptions.from || process.env.EMAIL_FROM || 'concierge@shaanwear.pk',
          subject: mailOptions.subject,
          text: mailOptions.text,
          html: mailOptions.html,
          timestamp: new Date(),
          isSimulated: true
        };
        sentEmailHistory.push(record);
        console.log(`[EmailService] 📧 Simulated Email Sent to <${mailOptions.to}> | Subject: "${mailOptions.subject}"`);
        return { messageId: `simulated-${Date.now()}`, ...record };
      }
    };
  }

  return transporter;
};

const fmtPKR = (num) => 'PKR ' + Number(num || 0).toLocaleString('en-PK');

/**
 * Common luxury SHAANWEAR email HTML layout wrapper
 */
const wrapEmailTemplate = ({ eyebrow, title, bodyContent, ctaText, ctaUrl }) => {
  const brandGold = '#B79A68';
  const brandDark = '#111111';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #F8F7F4; color: #333; }
    .email-container { max-width: 600px; margin: 30px auto; background: #FFFFFF; border: 1px solid #E5E3DE; border-radius: 4px; overflow: hidden; }
    .email-header { background: ${brandDark}; padding: 30px 24px; text-align: center; }
    .email-logo { color: #FFFFFF; font-size: 20px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; margin: 0; }
    .email-body { padding: 40px 32px; }
    .email-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: ${brandGold}; margin-bottom: 8px; display: block; }
    .email-title { font-size: 22px; font-weight: 700; color: ${brandDark}; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.04em; }
    .product-box { border: 1px solid #E2E8F0; border-radius: 4px; padding: 20px; margin: 24px 0; background: #FAFAF8; display: flex; gap: 20px; align-items: center; }
    .product-img { width: 100px; height: 100px; object-fit: cover; border-radius: 3px; border: 1px solid #E2E8F0; background: #FFF; }
    .btn-cta { display: inline-block; background: ${brandDark}; color: #FFFFFF !important; text-decoration: none; padding: 14px 28px; font-size: 12px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; border-radius: 2px; margin-top: 24px; }
    .email-footer { background: #FAFAF8; padding: 24px; text-align: center; font-size: 11px; color: #718096; border-top: 1px solid #E5E3DE; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1 class="email-logo">SHAANWEAR</h1>
    </div>
    <div class="email-body">
      <span class="email-eyebrow">${eyebrow}</span>
      <h2 class="email-title">${title}</h2>
      ${bodyContent}
      ${ctaText && ctaUrl ? `
        <div style="text-align: center;">
          <a href="${ctaUrl}" class="btn-cta">${ctaText}</a>
        </div>
      ` : ''}
    </div>
    <div class="email-footer">
      <p>&copy; ${new Date().getFullYear()} SHAANWEAR. All rights reserved.</p>
      <p>You received this automated notification because this product is saved in your Wishlist.</p>
    </div>
  </div>
</body>
</html>
  `;
};

/**
 * 1. BACK-IN-STOCK EMAIL ALERT
 * Sends an email when a product's inventory returns to > 0.
 */
const sendBackInStockEmail = async ({ to, userName, product, variantInfo }) => {
  const mailer = initTransporter();
  const from = process.env.EMAIL_FROM || 'SHAANWEAR Alerts <alerts@shaanwear.pk>';
  const subject = `Back in Stock: ${product.name} is available now!`;

  const primaryImage = product.images?.[0]?.secureUrl || 'https://images.unsplash.com/photo-1578932750294-f5075e85f44a';
  const priceDisplay = fmtPKR(product.basePrice);

  const bodyContent = `
    <p>Dear ${userName || 'Valued Customer'},</p>
    <p>Good news! An essential piece from your SHAANWEAR Wishlist is back in stock.</p>
    
    <div class="product-box">
      <img src="${primaryImage}" alt="${product.name}" class="product-img" />
      <div>
        <h3 style="margin: 0 0 6px; font-size: 16px; color: #111;">${product.name}</h3>
        <p style="margin: 0 0 4px; font-size: 12px; color: #718096; text-transform: uppercase;">
          ${product.category?.name || 'Exclusive Surplus'}
          ${variantInfo?.size ? ` &bull; Size: ${variantInfo.size}` : ''}
          ${variantInfo?.color ? ` &bull; Color: ${variantInfo.color}` : ''}
        </p>
        <p style="margin: 0; font-size: 15px; font-weight: 700; color: #111;">${priceDisplay}</p>
        ${variantInfo?.stock ? `<p style="margin: 4px 0 0; font-size: 11px; color: #0E9F6E; font-weight: 600;">Only ${variantInfo.stock} units restocked</p>` : ''}
      </div>
    </div>

    <p style="font-size: 13px; color: #4A5568;">
      Due to high demand and limited factory surplus allocations, sizes and quantities sell out rapidly. 
      Secure yours directly through your dashboard wishlist.
    </p>
  `;

  const frontendUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0] : 'http://localhost:5500').replace(/\/+$/, '');
  const ctaUrl = `${frontendUrl}/account.html#wishlist`;

  const html = wrapEmailTemplate({
    eyebrow: 'Wishlist Restock Alert',
    title: 'Your Saved Item is Back in Stock',
    bodyContent,
    ctaText: 'Claim Yours Before It Sells Out',
    ctaUrl
  });

  return mailer.sendMail({
    to,
    from,
    subject,
    text: `Good news! ${product.name} is back in stock at SHAANWEAR. Visit your wishlist to claim yours: ${ctaUrl}`,
    html
  });
};

/**
 * 2. PRICE DROP EMAIL ALERT
 * Sends an email when a product's price is reduced.
 */
const sendPriceDropEmail = async ({ to, userName, product, oldPrice, newPrice }) => {
  const mailer = initTransporter();
  const from = process.env.EMAIL_FROM || 'SHAANWEAR Alerts <alerts@shaanwear.pk>';
  const subject = `Price Drop Alert: ${product.name} is now ${fmtPKR(newPrice)}!`;

  const primaryImage = product.images?.[0]?.secureUrl || 'https://images.unsplash.com/photo-1578932750294-f5075e85f44a';
  const oldPriceFormatted = fmtPKR(oldPrice);
  const newPriceFormatted = fmtPKR(newPrice);
  const savings = Math.max(0, parseFloat(oldPrice) - parseFloat(newPrice));
  const savingsPercent = Math.round((savings / parseFloat(oldPrice)) * 100);

  const bodyContent = `
    <p>Dear ${userName || 'Valued Customer'},</p>
    <p>An item on your Wishlist has just been marked down in our latest surplus inventory revision!</p>
    
    <div class="product-box">
      <img src="${primaryImage}" alt="${product.name}" class="product-img" />
      <div>
        <h3 style="margin: 0 0 6px; font-size: 16px; color: #111;">${product.name}</h3>
        <p style="margin: 0 0 8px; font-size: 12px; color: #718096; text-transform: uppercase;">
          ${product.category?.name || 'Exclusive Surplus'}
        </p>
        <div>
          <span style="text-decoration: line-through; color: #A0AEC0; font-size: 13px; margin-right: 8px;">
            ${oldPriceFormatted}
          </span>
          <span style="font-size: 17px; font-weight: 700; color: #E53E3E;">
            ${newPriceFormatted}
          </span>
          ${savingsPercent > 0 ? `
            <span style="background: #DEF7EC; color: #03543F; padding: 2px 6px; border-radius: 2px; font-size: 11px; font-weight: 700; margin-left: 6px;">
              SAVE ${savingsPercent}%
            </span>
          ` : ''}
        </div>
      </div>
    </div>

    <p style="font-size: 13px; color: #4A5568;">
      Enjoy this direct saving of <strong>${fmtPKR(savings)}</strong>. Move it straight to your bag from your wishlist.
    </p>
  `;

  const frontendUrl = (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0] : 'http://localhost:5500').replace(/\/+$/, '');
  const ctaUrl = `${frontendUrl}/account.html#wishlist`;

  const html = wrapEmailTemplate({
    eyebrow: 'Exclusive Price Drop Alert',
    title: 'A Saved Favorite Just Dropped in Price',
    bodyContent,
    ctaText: 'View in Wishlist & Buy Now',
    ctaUrl
  });

  return mailer.sendMail({
    to,
    from,
    subject,
    text: `Price Drop Alert: ${product.name} was ${oldPriceFormatted}, now ${newPriceFormatted}. View it now: ${ctaUrl}`,
    html
  });
};

/**
 * 3. WISHLIST QUERY & NOTIFICATION DISPATCHERS
 */

/**
 * Find all users who saved a product in their WishlistItem table and notify them that it is back in stock.
 */
const notifyWishlistUsersForBackInStock = async (productId, variantInfo = null) => {
  try {
    const savedItems = await prisma.wishlistItem.findMany({
      where: { productId },
      include: {
        wishlist: {
          include: {
            user: {
              select: { id: true, name: true, email: true, isActive: true }
            }
          }
        },
        product: {
          include: {
            images: { orderBy: { displayOrder: 'asc' }, take: 1 },
            category: true
          }
        }
      }
    });

    if (!savedItems.length) {
      console.log(`[EmailService] No users have product ${productId} in their wishlist.`);
      return { notifiedCount: 0, recipients: [] };
    }

    const notifiedRecipients = [];
    const seenUserIds = new Set();

    for (const item of savedItems) {
      const user = item.wishlist?.user;
      if (user && user.email && user.isActive && !seenUserIds.has(user.id)) {
        seenUserIds.add(user.id);

        try {
          await sendBackInStockEmail({
            to: user.email,
            userName: user.name,
            product: item.product,
            variantInfo
          });
          notifiedRecipients.push({ userId: user.id, email: user.email });
        } catch (emailErr) {
          console.error(`[EmailService] Error sending restock alert to ${user.email}:`, emailErr.message);
        }
      }
    }

    console.log(`[EmailService] ✔ Dispatched ${notifiedRecipients.length} Back-in-Stock alerts for product ${productId}.`);
    return { notifiedCount: notifiedRecipients.length, recipients: notifiedRecipients };
  } catch (err) {
    console.error(`[EmailService] Error in notifyWishlistUsersForBackInStock:`, err.message || err);
    return { notifiedCount: 0, recipients: [], error: err.message };
  }
};

/**
 * Find all users who saved a product in their WishlistItem table and notify them of a price drop.
 */
const notifyWishlistUsersForPriceDrop = async (productId, oldPrice, newPrice) => {
  try {
    // Only alert if price genuinely decreased
    if (parseFloat(newPrice) >= parseFloat(oldPrice)) {
      return { notifiedCount: 0, recipients: [] };
    }

    const savedItems = await prisma.wishlistItem.findMany({
      where: { productId },
      include: {
        wishlist: {
          include: {
            user: {
              select: { id: true, name: true, email: true, isActive: true }
            }
          }
        },
        product: {
          include: {
            images: { orderBy: { displayOrder: 'asc' }, take: 1 },
            category: true
          }
        }
      }
    });

    if (!savedItems.length) {
      console.log(`[EmailService] No users have product ${productId} in their wishlist for price drop.`);
      return { notifiedCount: 0, recipients: [] };
    }

    const notifiedRecipients = [];
    const seenUserIds = new Set();

    for (const item of savedItems) {
      const user = item.wishlist?.user;
      if (user && user.email && user.isActive && !seenUserIds.has(user.id)) {
        seenUserIds.add(user.id);

        try {
          await sendPriceDropEmail({
            to: user.email,
            userName: user.name,
            product: item.product,
            oldPrice,
            newPrice
          });
          notifiedRecipients.push({ userId: user.id, email: user.email });
        } catch (emailErr) {
          console.error(`[EmailService] Error sending price drop alert to ${user.email}:`, emailErr.message);
        }
      }
    }

    console.log(`[EmailService] ✔ Dispatched ${notifiedRecipients.length} Price Drop alerts for product ${productId}.`);
    return { notifiedCount: notifiedRecipients.length, recipients: notifiedRecipients };
  } catch (err) {
    console.error(`[EmailService] Error in notifyWishlistUsersForPriceDrop:`, err.message || err);
    return { notifiedCount: 0, recipients: [], error: err.message };
  }
};

module.exports = {
  initTransporter,
  sendBackInStockEmail,
  sendPriceDropEmail,
  notifyWishlistUsersForBackInStock,
  notifyWishlistUsersForPriceDrop,
  sentEmailHistory
};

