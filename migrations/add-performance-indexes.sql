-- Performance Optimization: Add indexes for frequently queried columns
-- Run this migration to improve query performance

-- Indexes for claim_records table (used in leaderboard and statistics)
CREATE INDEX IF NOT EXISTS idx_claim_records_claimed_at ON claim_records(claimed_at);
CREATE INDEX IF NOT EXISTS idx_claim_records_status ON claim_records(status);
CREATE INDEX IF NOT EXISTS idx_claim_records_eight_ball_pool_id ON claim_records(eight_ball_pool_id);
CREATE INDEX IF NOT EXISTS idx_claim_records_composite ON claim_records(eight_ball_pool_id, status, claimed_at);

-- Indexes for registrations table (used in joins and lookups)
CREATE INDEX IF NOT EXISTS idx_registrations_discord_id ON registrations(discord_id);
CREATE INDEX IF NOT EXISTS idx_registrations_username ON registrations(username);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);

-- Indexes for leaderboard performance
CREATE INDEX IF NOT EXISTS idx_registrations_eight_ball_pool_id ON registrations(eight_ball_pool_id);

-- Verify indexes were created
SELECT 
    tablename, 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('claim_records', 'registrations')
ORDER BY tablename, indexname;








