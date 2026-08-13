-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address1" VARCHAR(255),
ADD COLUMN     "address2" VARCHAR(255),
ADD COLUMN     "city" VARCHAR(255),
ADD COLUMN     "contact_name" VARCHAR(255),
ADD COLUMN     "country" VARCHAR(255),
ADD COLUMN     "currency" VARCHAR(10),
ADD COLUMN     "payment_terms" VARCHAR(100),
ADD COLUMN     "province" VARCHAR(255),
ADD COLUMN     "website" VARCHAR(255),
ADD COLUMN     "zip" VARCHAR(30);
