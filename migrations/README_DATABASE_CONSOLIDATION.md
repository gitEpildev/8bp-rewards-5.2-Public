# Database Consolidation: Verification DB → Rewards DB

This migration merges the verification database (`accountchecker`) into the rewards database (`8bp_rewards`) to create a unified database structure.

## Overview

**Current State:**
- Rewards DB: `8bp_rewards` (has `registrations`, `claim_records`, etc.)
- Verification DB: `accountchecker` (has `verifications`, `pool_accounts`, `users`, etc.)

**Target State:**
- Unified DB: `8bp_rewards` (all tables in one database)

## Migration Steps

### Step 1: Create New Tables in Rewards DB

Run `unified_database_migration.sql` to create the verification tables in rewards database:

```bash
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /app/migrations/unified_database_migration.sql
```

Or copy the SQL file to the container and run it:

```bash
docker cp migrations/unified_database_migration.sql 8bp-postgres:/tmp/
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /tmp/unified_database_migration.sql
```

### Step 2: Copy Data from Verification DB

Run `copy_verification_data.sql` to copy data from verification database:

**Option A: Using psql COPY (recommended for large datasets)**

```bash
# Export from verification DB
docker-compose exec postgres psql -U admin -d accountchecker -c "\COPY (SELECT * FROM verifications) TO '/tmp/verifications.csv' CSV HEADER;"

# Import into rewards DB
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "\COPY verifications FROM '/tmp/verifications.csv' CSV HEADER;"
```

**Option B: Using dblink (if extension is available)**

Enable dblink extension first:

```bash
docker-compose exec postgres psql -U admin -d 8bp_rewards -c "CREATE EXTENSION IF NOT EXISTS dblink;"
```

Then run the copy script:

```bash
docker cp migrations/copy_verification_data.sql 8bp-postgres:/tmp/
docker-compose exec postgres psql -U admin -d 8bp_rewards -f /tmp/copy_verification_data.sql
```

### Step 3: Update Registrations with Verification Data

The migration script will:
- Update `registrations.username` from verification `users` table (username from image detection takes precedence)
- Update `registrations.account_level` from `pool_accounts.level`
- Update `registrations.account_rank` from `pool_accounts.rank_name`
- Update `registrations.verified_at` from `pool_accounts.verified_at`

### Step 4: Verify Migration

Run validation queries:

```sql
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
```

## After Migration

### Option A: Keep Separate Databases (Recommended Initially)

Keep verification bot using its own database for now, but ensure sync works:
- Verification bot writes to `accountchecker` database
- Sync service copies data to `8bp_rewards` database
- Both databases stay in sync

### Option B: Switch Verification Bot to Unified Database

Update verification bot to use rewards database:

1. Update `VERIFICATION_DATABASE_URL` in `.env`:
   ```
   VERIFICATION_DATABASE_URL=postgresql://admin:password@postgres:5432/8bp_rewards
   ```

2. Update Prisma schema to point to rewards database:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("VERIFICATION_DATABASE_URL")
   }
   ```

3. Restart verification bot:
   ```bash
   docker-compose restart verification-bot
   ```

## Rollback Plan

If issues occur:

1. Verification bot still has its own database (`accountchecker`)
2. Rewards system uses `8bp_rewards` database
3. Both can operate independently
4. Remove migrated tables if needed:
   ```sql
   DROP TABLE IF EXISTS verifications CASCADE;
   DROP TABLE IF EXISTS verification_events CASCADE;
   DROP TABLE IF EXISTS screenshot_locks CASCADE;
   DROP TABLE IF EXISTS blocked_users CASCADE;
   ```

## Important Notes

1. **Username Priority**: Username from verification image detection always takes precedence over registration username
2. **No Data Loss**: All data is preserved during migration (uses `ON CONFLICT DO NOTHING`)
3. **Backup First**: Always backup both databases before running migration
4. **Test Environment**: Test migration on staging/test environment first

## Tables Migrated

- `verifications` → `verifications` (same name, same schema)
- `verification_events` → `verification_events`
- `screenshot_locks` → `screenshot_locks`
- `blocked_users` → `blocked_users`
- `pool_accounts` → merged into `registrations` (one-to-many mapping)
- `users` → merged into `registrations` via `discord_id`
- `unique_links` → enforced via unique constraint on `registrations.eight_ball_pool_id`











