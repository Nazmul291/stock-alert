-- AlterTable
ALTER TABLE "store_settings" DROP COLUMN "whatsapp_phone_number_id",
DROP COLUMN "whatsapp_access_token",
DROP COLUMN "whatsapp_business_account_id",
DROP COLUMN "whatsapp_display_phone_number",
DROP COLUMN "whatsapp_business_name",
DROP COLUMN "whatsapp_template_status",
ADD COLUMN     "whatsapp_phone_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_verification_code" VARCHAR(10),
ADD COLUMN     "whatsapp_verification_expires_at" TIMESTAMPTZ;
