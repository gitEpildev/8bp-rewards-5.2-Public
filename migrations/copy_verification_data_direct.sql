-- Copy Verification Data Direct SQL
-- Run this to copy data from verification DB to rewards DB using direct SQL
-- Connects to both databases via psql

-- ============================================================
-- STEP 1: Copy verifications table
-- ============================================================

INSERT INTO verifications (discord_id, username, rank_name, level_detected, role_id_assigned, verified_at, updated_at)
SELECT 
  discord_id,
  username,
  rank_name,
  level_detected,
  role_id_assigned,
  verified_at,
  updated_at
FROM dblink(
  'host=postgres port=5432 dbname=accountchecker user=admin password=' || current_setting('app.db_password', true),
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
ON CONFLICT (discord_id) DO UPDATE SET
  username = EXCLUDED.username,
  rank_name = EXCLUDED.rank_name,
  level_detected = EXCLUDED.level_detected,
  role_id_assigned = EXCLUDED.role_id_assigned,
  verified_at = EXCLUDED.verified_at,
  updated_at = EXCLUDED.updated_at;











