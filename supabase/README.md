# Supabase Database Schema

This directory contains the complete database schema for the Stock Alert Shopify app.

## File Structure

- `schema.sql` - Complete production-ready database schema

## Setup Instructions

### Option 1: Supabase Dashboard (Recommended)

1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **SQL Editor**
4. Copy the entire contents of `schema.sql`
5. Paste into the SQL Editor
6. Click **Run**

### Option 2: Supabase CLI

```bash
# Connect to your project
supabase db reset --db-url "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"

# Or push the schema
supabase db push --db-url "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres" < schema.sql
```

## What's Included

The schema includes:

- **9 Tables**: All required tables for the application
- **Performance Indexes**: Optimized for common queries
- **Stored Functions**: Dashboard stats, bulk operations
- **Triggers**: Auto-update timestamps
- **Row Level Security**: RLS enabled on all tables
- **Migration Helpers**: Auto-fixes column names from old schemas

## Performance Features

- `get_inventory_stats()` - Dashboard stats in 1 query instead of 6
- `bulk_upsert_inventory()` - Bulk product updates
- `inventory_item_mapping` - O(1) webhook lookups
- Optimized indexes for all common queries

## Important Notes

- This schema is idempotent (safe to run multiple times)
- It includes migration helpers that automatically rename old columns
- All column names match the application code expectations
- The schema is production-ready and fully optimized

## Support

For issues with the database schema, check:
1. Supabase Dashboard logs for detailed errors
2. Ensure you have proper permissions
3. Verify you're connected to the correct project