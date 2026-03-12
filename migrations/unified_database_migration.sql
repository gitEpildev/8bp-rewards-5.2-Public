-- Unified Database Migration Script
-- Merges verification database tables into rewards database
-- Preserves existing data and ensures no duplicates

-- ============================================================
-- STEP 1: Create verification tables in rewards database
-- ============================================================

-- Create verifications table (if not exists)
CREATE TABLE IF NOT EXISTS verifications (
  discord_id VARCHAR(255) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  rank_name VARCHAR(255) NOT NULL,
  level_detected INTEGER NOT NULL,
  role_id_assigned VARCHAR(255),
  verified_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create verification_events table (if not exists)
CREATE TABLE IF NOT EXISTS verification_events (
  id VARCHAR(255) PRIMARY KEY,
  discord_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  confidence FLOAT,
  ocr_unique_id VARCHAR(255),
  screenshot_hash VARCHAR(255),
  message_id VARCHAR(255),
  attachment_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create screenshot_locks table (if not exists)
CREATE TABLE IF NOT EXISTS screenshot_locks (
  id VARCHAR(255) PRIMARY KEY,
  screenshot_hash VARCHAR(255) UNIQUE NOT NULL,
  ocr_unique_id VARCHAR(255) UNIQUE,
  discord_user_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create blocked_users table (if not exists)
CREATE TABLE IF NOT EXISTS blocked_users (
  id VARCHAR(255) PRIMARY KEY,
  discord_id VARCHAR(255) UNIQUE NOT NULL,
  reason TEXT,
  blocked_at TIMESTAMP DEFAULT NOW(),
  blocked_by VARCHAR(255)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_verifications_discord_id ON verifications(discord_id);
CREATE INDEX IF NOT EXISTS idx_verification_events_discord_user_id ON verification_events(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_verification_events_status ON verification_events(status);
CREATE INDEX IF NOT EXISTS idx_screenshot_locks_discord_user_id ON screenshot_locks(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_discord_id ON blocked_users(discord_id);

-- ============================================================
-- STEP 2: Migrate data from verification database
-- NOTE: This assumes verification database is 'accountchecker'
-- Run this from verification database connection, then copy data
-- ============================================================

-- Function to copy data from verification DB to rewards DB
-- This will be executed via dblink or manual copy

-- ============================================================
-- STEP 3: Merge pool_accounts into registrations
-- ============================================================

-- Update registrations with data from pool_accounts (if exists in verification DB)
-- Note: This assumes pool_accounts data is copied to a temp table first
-- Or run this via dblink connection

-- Update username from verification users table where it's more recent
-- This ensures usernames detected from verification images take precedence
UPDATE registrations r
SET 
  username = COALESCE(v.username, r.username),
  account_level = COALESCE(pa.level, r.account_level),
  account_rank = COALESCE(pa.rank_name, r.account_rank),
  verified_at = COALESCE(pa.verified_at, r.verified_at),
  updated_at = NOW()
FROM (
  SELECT 
    u.discord_id,
    u.username,
    pa.unique_id,
    pa.level,
    pa.rank_name,
    pa.verified_at,
    ROW_NUMBER() OVER (PARTITION BY pa.unique_id ORDER BY pa.verified_at DESC) as rn
  FROM dblink('host=postgres dbname=accountchecker user=admin password=' || current_setting('app.db_password', true),
    'SELECT discord_id, username FROM users'
  ) AS u(discord_id VARCHAR, username VARCHAR)
  LEFT JOIN dblink('host=postgres dbname=accountchecker user=admin password=' || current_setting('app.db_password', true),
    'SELECT owner_discord_id, unique_id, level, rank_name, verified_at FROM pool_accounts'
  ) AS pa(owner_discord_id VARCHAR, unique_id VARCHAR, level INTEGER, rank_name VARCHAR, verified_at TIMESTAMP)
  ON u.discord_id = pa.owner_discord_id
  WHERE pa.rn = 1 OR pa.rn IS NULL
) AS v
WHERE r.discord_id = v.discord_id 
  OR r.eight_ball_pool_id = v.unique_id;

-- ============================================================
-- STEP 4: Ensure all registrations have usernames
-- ============================================================

-- Update registrations where username is null (shouldn't happen after fixes)
-- This is a safety check
UPDATE registrations 
SET username = 'User_' || eight_ball_pool_id::text
WHERE username IS NULL 
  AND eight_ball_pool_id IS NOT NULL;

-- ============================================================
-- STEP 5: Create unique constraints
-- ============================================================

-- Ensure eight_ball_pool_id uniqueness in registrations (if not already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'registrations_eight_ball_pool_id_key'
  ) THEN
    ALTER TABLE registrations ADD CONSTRAINT registrations_eight_ball_pool_id_key 
    UNIQUE (eight_ball_pool_id);
  END IF;
END $$;

-- ============================================================
-- STEP 6: Add comments for documentation
-- ============================================================

COMMENT ON TABLE verifications IS 'Verification records from verification bot';
COMMENT ON TABLE verification_events IS 'Verification event history/logs';
COMMENT ON TABLE screenshot_locks IS 'Screenshot deduplication locks';
COMMENT ON TABLE blocked_users IS 'Blocked users from verification system';

COMMENT ON COLUMN registrations.username IS '8BP account username from registration or verification image (used as user_id)';
COMMENT ON COLUMN registrations.account_level IS '8BP account level from verification system';
COMMENT ON COLUMN registrations.account_rank IS '8BP rank name from verification system';
COMMENT ON COLUMN registrations.verified_at IS 'Timestamp when account was verified via Discord bot';

-- ============================================================
-- STEP 7: Data validation queries (run after migration)
-- ============================================================

-- Check for registrations without usernames (should be 0)
SELECT COUNT(*) as registrations_without_username 
FROM registrations 
WHERE username IS NULL;

-- Check for duplicate eight_ball_pool_ids (should be 0)
SELECT eight_ball_pool_id, COUNT(*) 
FROM registrations 
GROUP BY eight_ball_pool_id 
HAVING COUNT(*) > 1;

-- Check verification data sync
SELECT 
  COUNT(*) as total_registrations,
  COUNT(account_level) as verified_registrations,
  COUNT(verified_at) as verified_at_count
FROM registrations;











