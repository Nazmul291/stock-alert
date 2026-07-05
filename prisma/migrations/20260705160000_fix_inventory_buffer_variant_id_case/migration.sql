-- Bugfix: the earlier "add_variant_id_expand" migration added inventory_buffer's
-- column as snake_case "variant_id", but this table's other columns
-- (productId, alertType, jobId, eventKey, ...) are all camelCase with no
-- @map in schema.prisma — Prisma looked for a "variantId" column and failed
-- with P2022 at runtime. Rename to match the table's actual convention.
ALTER TABLE "inventory_buffer" RENAME COLUMN "variant_id" TO "variantId";
