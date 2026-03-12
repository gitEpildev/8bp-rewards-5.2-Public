-- Migration: Add verification fields to registrations table
-- This adds account_level, account_rank, verified_at, and ensures discord_id exists

-- Add account_level column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'registrations' AND column_name = 'account_level'
    ) THEN
        ALTER TABLE registrations ADD COLUMN account_level INTEGER;
    END IF;
END $$;

-- Add account_rank column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'registrations' AND column_name = 'account_rank'
    ) THEN
        ALTER TABLE registrations ADD COLUMN account_rank VARCHAR(255);
    END IF;
END $$;

-- Add verified_at column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'registrations' AND column_name = 'verified_at'
    ) THEN
        ALTER TABLE registrations ADD COLUMN verified_at TIMESTAMP;
    END IF;
END $$;

-- Ensure discord_id column exists (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'registrations' AND column_name = 'discord_id'
    ) THEN
        ALTER TABLE registrations ADD COLUMN discord_id VARCHAR(255);
    END IF;
END $$;

-- Create indexes (if not exist)
CREATE INDEX IF NOT EXISTS idx_registrations_discord_id ON registrations(discord_id);
CREATE INDEX IF NOT EXISTS idx_registrations_account_level ON registrations(account_level);
CREATE INDEX IF NOT EXISTS idx_registrations_verified_at ON registrations(verified_at);

-- Add comments for documentation
COMMENT ON COLUMN registrations.account_level IS '8BP account level from verification system';
COMMENT ON COLUMN registrations.account_rank IS '8BP rank name from verification system';
COMMENT ON COLUMN registrations.verified_at IS 'Timestamp when account was verified';
COMMENT ON COLUMN registrations.discord_id IS 'Discord user ID linked to this account';












