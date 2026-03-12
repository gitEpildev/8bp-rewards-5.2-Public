import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { getDiscordAvatarUrl, getRandom8BPAvatar } from '../utils/avatarUtils';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Simple in-memory cache for leaderboard results (60-second TTL to reduce lag)
const leaderboardCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds

/**
 * Clear the leaderboard cache - call this when verification data changes
 */
export function clearLeaderboardCache(): void {
  leaderboardCache.clear();
  logger.info('Leaderboard cache cleared', {
    action: 'leaderboard_cache_cleared'
  });
}

// Get leaderboard
router.get('/', async (req, res): Promise<void> => {
  try {
    // Cache for 60 seconds to reduce load and lag
    res.set('Cache-Control', 'public, max-age=60');
    
    const timeframe = req.query.timeframe as string || '7d';
    const limit = parseInt(req.query.limit as string) || 50;
    
    // Check cache first
    const cacheKey = `${timeframe}-${limit}`;
    const cached = leaderboardCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      logger.info('Returning cached leaderboard data', {
        action: 'leaderboard_cache_hit',
        timeframe,
        limit,
        cacheAge: Date.now() - cached.timestamp
      });
      res.json(cached.data);
      return;
    }
    
    // Calculate date range based on timeframe
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Use optimised SQL aggregation instead of fetching all records
    let leaderboardData: any[] = [];
    let totalStats = {
      totalUsers: 0,
      totalSuccessfulClaims: 0,
      totalFailedClaims: 0
    };
    
    try {
      // Optimised SQL query that aggregates in the database
      // Exclude failed claims where user has successful claim on same day (duplicate attempts, not real failures)
      // user_id = username (8BP account username from registration or verification image)
      const leaderboardQuery = `
        SELECT 
          r.username as user_id,
          r.username,
          r.eight_ball_pool_id,
          r.account_level,
          r.account_rank,
          r.discord_id,
          r.use_discord_username,
          r.use_discord_avatar,
          r.leaderboard_image_url,
          r.eight_ball_pool_avatar_filename,
          r.profile_image_url,
          r.discord_avatar_hash,
          COUNT(*) FILTER (
            WHERE cr.status = 'success' 
            OR (cr.status = 'failed' AND NOT EXISTS (
              SELECT 1 FROM claim_records cr2 
              WHERE cr2.eight_ball_pool_id = cr.eight_ball_pool_id 
              AND cr2.status = 'success' 
              AND DATE(cr2.claimed_at) = DATE(cr.claimed_at)
              AND cr2.claimed_at >= $1
            ))
          ) as total_claims,
          COUNT(*) FILTER (WHERE cr.status = 'success') as successful_claims,
          COUNT(*) FILTER (WHERE cr.status = 'failed' AND NOT EXISTS (
            SELECT 1 FROM claim_records cr2 
            WHERE cr2.eight_ball_pool_id = cr.eight_ball_pool_id 
            AND cr2.status = 'success' 
            AND DATE(cr2.claimed_at) = DATE(cr.claimed_at)
            AND cr2.claimed_at >= $1
          )) as failed_claims,
          COALESCE(SUM(ARRAY_LENGTH(cr.items_claimed, 1)) FILTER (WHERE cr.status = 'success'), 0) as total_items_claimed,
          MAX(cr.claimed_at) as last_claimed
        FROM claim_records cr
        INNER JOIN registrations r ON cr.eight_ball_pool_id = r.eight_ball_pool_id
        WHERE cr.claimed_at >= $1
          AND r.username IS NOT NULL
        GROUP BY r.eight_ball_pool_id, r.username, r.account_level, r.account_rank, r.discord_id,
                 r.use_discord_username, r.use_discord_avatar, r.leaderboard_image_url,
                 r.eight_ball_pool_avatar_filename, r.profile_image_url, r.discord_avatar_hash
        ORDER BY total_items_claimed DESC
        LIMIT $2
      `;
      
      const result = await Promise.race([
        dbService.executeQuery(leaderboardQuery, [startDate, limit]),
        new Promise<any>((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), 15000)
        )
      ]);
      
      // Also get total user count and aggregate stats (without limit) for summary
      const totalStatsQuery = `
        SELECT 
          COUNT(DISTINCT r.eight_ball_pool_id) as total_users,
          COUNT(*) FILTER (WHERE cr.status = 'success') as total_successful_claims,
          COUNT(*) FILTER (WHERE cr.status = 'failed') as total_failed_claims
        FROM claim_records cr
        INNER JOIN registrations r ON cr.eight_ball_pool_id = r.eight_ball_pool_id
        WHERE cr.claimed_at >= $1
          AND r.username IS NOT NULL
      `;
      
      const totalStatsResult = await dbService.executeQuery(totalStatsQuery, [startDate]);
      totalStats = {
        totalUsers: parseInt(totalStatsResult.rows[0]?.total_users || 0),
        totalSuccessfulClaims: parseInt(totalStatsResult.rows[0]?.total_successful_claims || 0),
        totalFailedClaims: parseInt(totalStatsResult.rows[0]?.total_failed_claims || 0)
      };
      
      leaderboardData = result.rows.map((row: any) => {
        const successfulClaims = parseInt(row.successful_claims);
        const failedClaims = parseInt(row.failed_claims);
        const totalClaims = parseInt(row.total_claims); // Now correctly excludes duplicate failed claims
        
        // Validate that totalClaims = successfulClaims + failedClaims
        // This should always be true now, but keeping as a safety check
        const expectedTotal = successfulClaims + failedClaims;
        if (totalClaims !== expectedTotal) {
          logger.warn('Total claims mismatch', {
            eightBallPoolId: row.eight_ball_pool_id,
            totalClaims,
            expectedTotal,
            successfulClaims,
            failedClaims
          });
        }
        
        // Compute username based on toggle
        // NOTE: Leaderboard is public and doesn't have access to Discord session data
        // When use_discord_username is true, we should show Discord username, but we don't have it here
        // Current limitation: We use registration username in both cases until Discord username is stored in registration
        // TODO: Store Discord username in registration table during OAuth to support this feature
        const computedUsername = row.use_discord_username && row.discord_id 
          ? row.username // Fallback to registration username (Discord username not available in leaderboard context)
          : row.username;

        // Compute avatarUrl based on priority (matches user-dashboard.ts logic)
        let avatarUrl: string | null = null;
        if (row.leaderboard_image_url) {
          avatarUrl = row.leaderboard_image_url;
        } else if (row.use_discord_avatar && row.discord_id) {
          // Use utility function to handle both custom and default Discord avatars
          avatarUrl = getDiscordAvatarUrl(row.discord_id, row.discord_avatar_hash);
        } else if (row.eight_ball_pool_avatar_filename) {
          avatarUrl = `/8bp-rewards/avatars/${row.eight_ball_pool_avatar_filename}`;
        } else if (row.profile_image_url) {
          avatarUrl = row.profile_image_url;
        }
        // Default to random 8BP avatar when no avatar set (plan: leaderboard default to random assigned avatars)
        if (!avatarUrl) {
          const randomAvatar = getRandom8BPAvatar();
          if (randomAvatar) {
            avatarUrl = `/8bp-rewards/avatars/${randomAvatar}`;
          }
        }

        // Debug logging for specific user
        if (row.eight_ball_pool_id === '1826254746') {
          logger.info('Leaderboard avatar computation for GamingWithBlake', {
            action: 'leaderboard_avatar_debug',
            eightBallPoolId: row.eight_ball_pool_id,
            leaderboard_image_url: row.leaderboard_image_url,
            eight_ball_pool_avatar_filename: row.eight_ball_pool_avatar_filename,
            profile_image_url: row.profile_image_url,
            use_discord_avatar: row.use_discord_avatar,
            computed_avatarUrl: avatarUrl
          });
        }

        return {
          user_id: row.user_id, // username from registration or verification
          username: computedUsername,
          eightBallPoolId: row.eight_ball_pool_id,
          account_level: row.account_level || null,
          account_rank: row.account_rank || null,
          discord_id: row.discord_id || null,
          avatarUrl: avatarUrl,
          totalClaims: totalClaims, // Use SQL-calculated total (already excludes duplicates)
          successfulClaims: successfulClaims,
          failedClaims: failedClaims,
          totalItemsClaimed: parseInt(row.total_items_claimed || 0),
          lastClaimed: row.last_claimed
        };
      });
      
    } catch (error) {
      logger.error('Leaderboard query timeout or error', {
        action: 'leaderboard_query_error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Return empty leaderboard instead of failing
      res.json({
        timeframe,
        period: `${days} days`,
        totalUsers: 0,
        leaderboard: []
      });
      return;
    }

      // Build leaderboard response (usernames, levels, and ranks are already included in the query)
      // user_id = username (8BP account username from registration or verification image)
      const leaderboard = leaderboardData.map((entry: any, index: number) => ({
        rank: index + 1,
        user_id: entry.user_id, // username from registration or verification
        username: entry.username, // Already computed with Discord toggle
        eightBallPoolId: entry.eightBallPoolId,
        account_level: entry.account_level || null,
        account_rank: entry.account_rank || null,
        discord_id: entry.discord_id || null,
        avatarUrl: entry.avatarUrl || null, // Already computed with priority
        totalClaims: entry.totalClaims,
        successfulClaims: entry.successfulClaims,
        failedClaims: entry.failedClaims,
        totalItemsClaimed: entry.totalItemsClaimed,
        successRate: entry.totalClaims > 0 
          ? Math.round((entry.successfulClaims / entry.totalClaims) * 100) 
          : 0,
        lastClaimed: entry.lastClaimed
      }));

    const responseData = {
      timeframe,
      period: `${days} days`,
      totalUsers: totalStats.totalUsers,
      totalSuccessfulClaims: totalStats.totalSuccessfulClaims,
      totalFailedClaims: totalStats.totalFailedClaims,
      leaderboard
    };
    
    // Cache the result
    leaderboardCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    
    // Clean up old cache entries (keep only last 10 entries)
    if (leaderboardCache.size > 10) {
      const oldestKey = Array.from(leaderboardCache.keys())[0];
      leaderboardCache.delete(oldestKey);
    }
    
    res.json(responseData);

  } catch (error) {
    logger.error('Failed to retrieve leaderboard', {
      action: 'leaderboard_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timeframe: req.query.timeframe
    });

    res.status(500).json({
      error: 'Failed to retrieve leaderboard'
    });
  }
});

// Get user's ranking
router.get('/user/:eightBallPoolId', async (req, res): Promise<void> => {
  try {
    const { eightBallPoolId } = req.params;
    const timeframe = req.query.timeframe as string || '7d';
    
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get user's claim records within timeframe
    const userClaims = await dbService.findClaimRecords({
      eightBallPoolId,
      claimedAt: { $gte: startDate }
    });

    if (userClaims.length === 0) {
      res.status(404).json({
        error: 'No claims found for this user in the specified timeframe'
      });
      return;
    }

    // Calculate user stats - exclude failed claims where user has successful claim on same day
    let totalClaims = 0;
    let successfulClaims = 0;
    let failedClaims = 0;
    let totalItemsClaimed = 0;
    let lastClaimed: string | null = null;

    // Group claims by date to check for same-day duplicates
    const claimsByDate = new Map<string, any[]>();
    userClaims.forEach((claim: any) => {
      const claimDate = new Date(claim.claimedAt).toISOString().split('T')[0];
      if (!claimsByDate.has(claimDate)) {
        claimsByDate.set(claimDate, []);
      }
      claimsByDate.get(claimDate)!.push(claim);
    });

    userClaims.forEach((claim: any) => {
      const claimDate = new Date(claim.claimedAt).toISOString().split('T')[0];
      const dateClaims = claimsByDate.get(claimDate) || [];
      
      // Check if user has successful claim on same day
      const hasSameDaySuccess = dateClaims.some((c: any) => 
        c.status === 'success' && c.id !== claim.id
      );
      
      if (claim.status === 'success') {
        totalClaims++;
        successfulClaims++;
        totalItemsClaimed += claim.itemsClaimed?.length || 0;
      } else if (claim.status === 'failed') {
        // Only count as failed if user doesn't have successful claim on same day
        if (!hasSameDaySuccess) {
          totalClaims++;
          failedClaims++;
        }
        // Skip duplicate failed claims (don't count them in total)
      }
      
      if (!lastClaimed || new Date(claim.claimedAt) > new Date(lastClaimed)) {
        lastClaimed = claim.claimedAt;
      }
    });

    // Get user's rank by getting all users and finding position
    const allClaims = await dbService.findClaimRecords({
      claimedAt: { $gte: startDate }
    });

    const allUserStats: { [key: string]: number } = {};
    allClaims.forEach((claim: any) => {
      const userId = claim.eightBallPoolId;
      if (!allUserStats[userId]) {
        allUserStats[userId] = 0;
      }
      if (claim.status === 'success') {
        allUserStats[userId] += claim.itemsClaimed?.length || 0;
      }
    });

    const sortedUsers = Object.entries(allUserStats)
      .sort(([,a], [,b]) => b - a)
      .map(([userId]) => userId);

    const rank = sortedUsers.indexOf(eightBallPoolId) + 1;

    // Get user registration details
    const registration = await dbService.findRegistration({ eightBallPoolId });

    res.json({
      rank,
      user_id: registration?.username || null, // username from registration or verification
      username: registration?.username || null,
      eightBallPoolId,
      totalClaims,
      successfulClaims,
      failedClaims,
      totalItemsClaimed,
      successRate: totalClaims > 0 
        ? Math.round((successfulClaims / totalClaims) * 100) 
        : 0,
      lastClaimed,
      timeframe,
      period: `${days} days`
    });

  } catch (error) {
    logger.error('Failed to retrieve user ranking', {
      action: 'user_ranking_error',
      eightBallPoolId: req.params.eightBallPoolId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve user ranking'
    });
  }
});

// Get leaderboard statistics
router.get('/stats', async (req, res) => {
  try {
    const timeframe = req.query.timeframe as string || '7d';
    const days = getDaysFromTimeframe(timeframe);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all claim records within timeframe
    const claimRecords = await dbService.findClaimRecords({
      claimedAt: { $gte: startDate }
    });

    // Group claims by user and date to identify duplicate attempts
    const userDateClaims = new Map<string, Map<string, any[]>>();
    claimRecords.forEach((claim: any) => {
      const userId = claim.eightBallPoolId;
      const claimDate = new Date(claim.claimedAt).toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!userDateClaims.has(userId)) {
        userDateClaims.set(userId, new Map());
      }
      const dateClaims = userDateClaims.get(userId)!;
      if (!dateClaims.has(claimDate)) {
        dateClaims.set(claimDate, []);
      }
      dateClaims.get(claimDate)!.push(claim);
    });

    // Calculate overall statistics, excluding failed claims where user has successful claim on same day
    let totalClaims = 0;
    let successfulClaims = 0;
    let failedClaims = 0;
    let totalItemsClaimed = 0;
    const uniqueUsers = new Set<string>();

    claimRecords.forEach((claim: any) => {
      const userId = claim.eightBallPoolId;
      const claimDate = new Date(claim.claimedAt).toISOString().split('T')[0];
      const dateClaims = userDateClaims.get(userId)?.get(claimDate) || [];
      
      // Check if user has successful claim on same day
      const hasSameDaySuccess = dateClaims.some((c: any) => 
        c.status === 'success' && c.id !== claim.id
      );
      
      uniqueUsers.add(userId);
      
      if (claim.status === 'success') {
        totalClaims++; // Count successful claims
        successfulClaims++;
        totalItemsClaimed += claim.itemsClaimed?.length || 0;
      } else if (claim.status === 'failed') {
        // Only count as failed (and in total) if user doesn't have successful claim on same day
        if (!hasSameDaySuccess) {
          totalClaims++; // Only count non-duplicate failed claims
          failedClaims++;
        }
        // Skip duplicate failed claims (don't count them in total)
      }
    });

    const successRate = totalClaims > 0 
      ? Math.round((successfulClaims / totalClaims) * 100) 
      : 0;

    res.json({
      timeframe,
      period: `${days} days`,
      totalClaims,
      successfulClaims,
      failedClaims,
      totalItemsClaimed,
      uniqueUsers: uniqueUsers.size,
      successRate
    });

  } catch (error) {
    logger.error('Failed to retrieve leaderboard statistics', {
      action: 'leaderboard_stats_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    res.status(500).json({
      error: 'Failed to retrieve leaderboard statistics'
    });
  }
});

// Helper function to get days from timeframe string
function getDaysFromTimeframe(timeframe: string): number {
  const timeframes: { [key: string]: number } = {
    '1d': 1,
    '7d': 7,
    '14d': 14,
    '28d': 28,
    '30d': 30,
    '90d': 90,
    '1y': 365
  };

  return timeframes[timeframe] || 7;
}

export default router;



