-- Create billing_records table
CREATE TABLE IF NOT EXISTS public.billing_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  charge_id BIGINT,
  plan VARCHAR(50) NOT NULL CHECK (plan IN ('free', 'pro')),
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'active', 'cancelled', 'declined')),
  amount DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'USD',
  activated_on TIMESTAMP WITH TIME ZONE,
  cancelled_on TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_billing_records_store_id ON public.billing_records(store_id);
CREATE INDEX idx_billing_records_status ON public.billing_records(status);
CREATE INDEX idx_billing_records_charge_id ON public.billing_records(charge_id);

-- Add RLS (Row Level Security) policies
ALTER TABLE public.billing_records ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows the service role to manage billing records
CREATE POLICY "Service role can manage billing records" ON public.billing_records
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_billing_records_updated_at BEFORE UPDATE
  ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.billing_records IS 'Stores billing information and charge records for Shopify app subscriptions';