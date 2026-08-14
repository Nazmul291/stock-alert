-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "digest_timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC';
