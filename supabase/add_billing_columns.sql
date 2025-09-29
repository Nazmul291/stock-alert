-- Add missing billing columns to billing_records table
ALTER TABLE public.billing_records
ADD COLUMN IF NOT EXISTS billing_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS confirmation_url TEXT;

-- Add index for billing_on for better query performance
CREATE INDEX IF NOT EXISTS idx_billing_records_billing_on ON public.billing_records(billing_on);

-- Add comment for documentation
COMMENT ON COLUMN public.billing_records.billing_on IS 'The date when the billing cycle starts or was activated';
COMMENT ON COLUMN public.billing_records.confirmation_url IS 'Shopify confirmation URL for the charge';