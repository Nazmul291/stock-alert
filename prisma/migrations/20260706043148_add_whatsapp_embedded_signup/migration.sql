-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "whatsapp_business_account_id" VARCHAR(50),
ADD COLUMN     "whatsapp_business_name" VARCHAR(200),
ADD COLUMN     "whatsapp_display_phone_number" VARCHAR(30),
ADD COLUMN     "whatsapp_template_status" VARCHAR(20) DEFAULT 'pending';
