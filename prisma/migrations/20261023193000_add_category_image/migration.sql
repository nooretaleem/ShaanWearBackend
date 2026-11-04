-- AlterTable
ALTER TABLE `categories` ADD COLUMN `image_url` VARCHAR(512) NULL,
    ADD COLUMN `cloudinary_public_id` VARCHAR(255) NULL;
