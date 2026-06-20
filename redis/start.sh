#!/bin/sh
set -e
exec redis-server \
  --requirepass "$REDIS_PASSWORD" \
  --appendonly yes \
  --dir /data \
  --bind 0.0.0.0 :: \
  --protected-mode no
