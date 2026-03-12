-- Copy Verification Data Script
-- Run this to copy data from verification DB (accountchecker) to rewards DB (8bp_rewards)
-- This script should be run from the rewards database connection

-- ============================================================
-- OPTION 1: Using psql COPY (if databases are on same server)
-- ============================================================

-- First, export data from verification database:
-- psql -U admin -d accountchecker -c "\COPY (SELECT * FROM verifications) TO '/tmp/verifications.csv' CSV HEADER;"
-- psql -U admin -d accountchecker -c "\COPY (SELECT * FROM verification_events) TO '/tmp/verification_events.csv' CSV HEADER;"
-- psql -U admin -d accountchecker -c "\COPY (SELECT * FROM screenshot_locks) TO '/tmp/screenshot_locks.csv' CSV HEADER;"
-- psql -U admin -d accountchecker -c "\COPY (SELECT * FROM blocked_users) TO '/tmp/blocked_users.csv' CSV HEADER;"

-- Then, import into rewards database:
-- psql -U admin -d 8bp_rewards -c "\COPY verifications FROM '/tmp/verifications.csv' CSV HEADER;"
-- psql -U admin -d 8bp_rewards -c "\COPY verification_events FROM '/tmp/verification_events.csv' CSV HEADER;"
-- psql -U admin -d 8bp_rewards -c "\COPY screenshot_locks FROM '/tmp/screenshot_locks.csv' CSV HEADER;"
-- psql -U admin -d 8bp_rewards -c "\COPY blocked_users FROM '/tmp/blocked_users.csv' CSV HEADER;"

-- ============================================================
-- OPTION 2: Manual SQL (if using dblink extension)
-- ============================================================

-- Enable dblink extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS dblink;

-- Copy verifications table
INSERT INTO verifications (discord_id, username, rank_name, level_detected, role_id_assigned, verified_at, updated_at)
SELECT * FROM dblink(
  'host=postgres dbname=accountchecker user=admin',
  'SELECT discord_id, username, rank_name, level_detected, role_id_assigned, verified_at, updated_at FROM verifications'
) AS t(
  discord_id VARCHAR(255),
  username VARCHAR(255),
  rank_name VARCHAR(255),
  level_detected INTEGER,
  role_id_assigned VARCHAR(255),
  verified_at TIMESTAMP,
  updated_at TIMESTAMP
)
ON CONFLICT (discord_id) DO NOTHING;

-- Copy verification_events table
INSERT INTO verification_events (id, discord_user_id, status, confidence, ocr_unique_id, screenshot_hash, message_id, attachment_url, metadata, created_at)
SELECT * FROM dblink(
  'host=postgres dbname=accountchecker user=admin',
  'SELECT id, discord_user_id, status::text, confidence, ocr_unique_id, screenshot_hash, message_id, attachment_url, metadata, created_at FROM verification_events'
) AS t(
  id VARCHAR(255),
  discord_user_id VARCHAR(255),
  status VARCHAR(50),
  confidence FLOAT,
  ocr_unique_id VARCHAR(255),
  screenshot_hash VARCHAR(255),
  message_id VARCHAR(255),
  attachment_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Copy screenshot_locks table
INSERT INTO screenshot_locks (id, screenshot_hash, ocr_unique_id, discord_user_id, created_at, updated_at)
SELECT * FROM dblink(
  'host=postgres dbname=accountchecker user=admin',
  'SELECT id, screenshot_hash, ocr_unique_id, discord_user_id, created_at, updated_at FROM screenshot_locks'
) AS t(
  id VARCHAR(255),
  screenshot_hash VARCHAR(255),
  ocr_unique_id VARCHAR(255),
  discord_user_id VARCHAR(255),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
ON CONFLICT (id) DO NOTHING;

-- Copy blocked_users table
INSERT INTO blocked_users (id, discord_id, reason, blocked_at, blocked_by)
SELECT * FROM dblink(
  'host=postgres dbname=accountchecker user=admin',
  'SELECT id, discord_id, reason, blocked_at, blocked_by FROM blocked_users'
) AS t(
  id VARCHAR(255),
  discord_id VARCHAR(255),
  reason TEXT,
  blocked_at TIMESTAMP,
  blocked_by VARCHAR(255)
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- OPTION 3: Update registrations with pool_accounts data
-- ============================================================

-- Update registrations with username from verification users table
-- Username from verification takes precedence (from image detection)
WITH verification_data AS (
  SELECT 
    u.discord_id,
    u.username as verification_username,
    pa.unique_id,
    pa.level,
    pa.rank_name,
    pa.verified_at,
    ROW_NUMBER() OVER (PARTITION BY pa.unique_id ORDER BY pa.verified_at DESC) as rn
  FROM dblink(
    'host=postgres dbname=accountchecker user=admin',
    'SELECT discord_id, username FROM users'
  ) AS u(discord_id VARCHAR, username VARCHAR)
  LEFT JOIN dblink(
    'host=postgres dbname=accountchecker user=admin',
    'SELECT owner_discord_id, unique_id, level, rank_name, verified_at FROM pool_accounts'
  ) AS pa(owner_discord_id VARCHAR, unique_id VARCHAR, level INTEGER, rank_name VARCHAR, verified_at TIMESTAMP)
  ON u.discord_id = pa.owner_discord_id
  WHERE pa.rn = 1 OR pa.rn IS NULL
)
UPDATE registrations r
SET 
  username = COALESCE(v.verification_username, r.username),
  account_level = COALESCE(v.level, r.account_level),
  account_rank = COALESCE(v.rank_name, r.account_rank),
  verified_at = COALESCE(v.verified_at, r.verified_at),
  discord_id = COALESCE(r.discord_id, v.discord_id),
  updated_at = NOW()
FROM verification_data v
WHERE (r.discord_id = v.discord_id OR r.eight_ball_pool_id = v.unique_id)
  AND (v.verification_username IS NOT NULL OR v.level IS NOT NULL OR v.rank_name IS NOT NULL);











