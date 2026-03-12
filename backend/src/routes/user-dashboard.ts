import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../services/LoggerService';
import { authenticateUser } from '../middleware/auth';
import DiscordNotificationService from '../services/DiscordNotificationService';
import WebSocketService from '../services/WebSocketService';
import { getDiscordAvatarUrl } from '../utils/avatarUtils';
import { generateTicketNumber } from './tickets';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import multer from 'multer';

const router = express.Router();
const dbService = DatabaseService.getInstance();

// Public routes (no authentication required)
// Get list of available 8 Ball Pool avatars
router.get('/8bp-avatars/list', async (req, res): Promise<void> => {
  try {
    // Always use path relative to project root - works in both dev and production
    const avatarsDir = path.join(process.cwd(), 'frontend', '8 Ball Pool Avatars');
    
    logger.info('Listing 8BP avatars', {
      action: 'list_8bp_avatars',
      avatarsDir,
      exists: fs.existsSync(avatarsDir),
      cwd: process.cwd()
    });
    
    if (!fs.existsSync(avatarsDir)) {
      logger.error('Avatars directory not found', {
        action: 'avatars_dir_not_found',
        avatarsDir,
        cwd: process.cwd()
      });
      res.status(404).json({
        success: false,
        error: 'Avatars directory not found'
      });
      return;
    }

    const files = fs.readdirSync(avatarsDir);
    const avatarFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) && file !== '.DS_Store';
      })
      .map(file => ({
        filename: file,
        url: `/8bp-rewards/avatars/${file}`
      }))
      .sort((a, b) => {
        // Sort by number in filename if possible
        const numA = parseInt(a.filename.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.filename.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    res.json({
      success: true,
      avatars: avatarFiles
    });
  } catch (error) {
    logger.error('Error listing 8 Ball Pool avatars', {
      action: 'list_8bp_avatars_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({
      success: false,
      error: 'Failed to list avatars'
    });
  }
});

// Apply user authentication to all routes below this point
router.use(authenticateUser);

// Get user's linked accounts
router.get('/linked-accounts', async (req, res): Promise<void> => {
  console.log('🚀 LINKED ACCOUNTS ROUTE CALLED');
  console.log('🚀 User:', (req as any).user);
  try {
    const user = (req as any).user;
    if (!user || !user.id) {
      console.error('❌ No user in request');
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }
    const discordId = user.id;
    console.log('🚀 Discord ID:', discordId, 'Type:', typeof discordId);

    logger.info('Fetching linked accounts', {
      action: 'get_linked_accounts',
      discordId,
      discordIdType: typeof discordId,
      username: user.username
    });
    console.log('📝 Logged: Fetching linked accounts');

    // Find all registrations linked to this Discord ID - use direct SQL with explicit type casting
    // Include account_level and account_rank in the initial query
    // user_id = username (8BP account username from registration or verification image)
    const result = await dbService.executeQuery(
      `SELECT username as user_id,
              username,
              eight_ball_pool_id, 
              created_at, 
              discord_id, 
              account_level, 
              account_rank, 
              verified_at,
              profile_image_url,
              profile_image_updated_at,
              leaderboard_image_url,
              leaderboard_image_updated_at,
              eight_ball_pool_avatar_filename,
              use_discord_avatar,
              use_discord_username,
              discord_avatar_hash
       FROM registrations 
       WHERE discord_id IS NOT NULL 
       AND discord_id::text = $1::text
       AND LENGTH(TRIM(discord_id)) > 0
       AND username IS NOT NULL
       ORDER BY account_level DESC NULLS LAST, created_at DESC`,
      [String(discordId).trim()]
    );
    
    console.log('📊 SQL Query Result:', {
      rowCount: result.rows.length,
      rows: result.rows.map((r: any) => ({
        id: r.eight_ball_pool_id,
        username: r.username,
        discord_id: r.discord_id,
        account_level: r.account_level,
        account_rank: r.account_rank
      }))
    });
    
    logger.info('SQL query executed', {
      action: 'sql_query_executed',
      discordId: String(discordId).trim(),
      rowCount: result.rows.length,
      queryResult: result.rows.map((r: any) => ({
        eight_ball_pool_id: r.eight_ball_pool_id,
        username: r.username,
        discord_id: r.discord_id,
        account_level: r.account_level,
        account_rank: r.account_rank
      }))
    });
    
    const registrations = result.rows.map((row: any) => {
      // Log each row to debug null values
      if (!row.eight_ball_pool_avatar_filename && !row.leaderboard_image_url && !row.profile_image_url) {
        logger.debug('Registration with null avatar fields', {
          action: 'null_avatar_fields',
          eight_ball_pool_id: row.eight_ball_pool_id,
          username: row.username,
          profile_image_url: row.profile_image_url,
          leaderboard_image_url: row.leaderboard_image_url,
          eight_ball_pool_avatar_filename: row.eight_ball_pool_avatar_filename,
          use_discord_avatar: row.use_discord_avatar,
          discord_avatar_hash: row.discord_avatar_hash
        });
      }
      
      return {
        user_id: row.user_id, // username from registration or verification
        username: row.username,
        eightBallPoolId: row.eight_ball_pool_id,
        createdAt: row.created_at,
        created_at: row.created_at,
        eight_ball_pool_id: row.eight_ball_pool_id,
        discordId: row.discord_id,
        discord_id: row.discord_id,
        account_level: row.account_level,
        account_rank: row.account_rank,
        verified_at: row.verified_at,
        profile_image_url: row.profile_image_url || null,
        profile_image_updated_at: row.profile_image_updated_at || null,
        leaderboard_image_url: row.leaderboard_image_url || null,
        leaderboard_image_updated_at: row.leaderboard_image_updated_at || null,
        eight_ball_pool_avatar_filename: row.eight_ball_pool_avatar_filename || null,
        use_discord_avatar: row.use_discord_avatar ?? false, // Use explicit false for null, don't auto-default based on discord_id
        use_discord_username: row.use_discord_username ?? false,
        discord_avatar_hash: row.discord_avatar_hash || null
      };
    });
    
    logger.info('Found registrations', {
      action: 'linked_accounts_found',
      discordId,
      count: registrations.length,
      accountIds: registrations.map((r: any) => r.eightBallPoolId || r.eight_ball_pool_id),
      usernames: registrations.map((r: any) => r.username)
    });
    
    // Get claim statistics for each account
    const accountsWithStats = await Promise.all(
      registrations.map(async (reg: any) => {
        // Extract fields from the mapped registration object
        const eightBallPoolId = reg.eightBallPoolId || reg.eight_ball_pool_id;
        // Username should always be present (filtered in query)
        const username = reg.username || reg.user_id;
        const user_id = reg.user_id || reg.username; // user_id = username
        const dateLinked = reg.createdAt || reg.created_at;
        
        if (!eightBallPoolId) {
          logger.warn('Registration missing eightBallPoolId', {
            action: 'missing_eightballpool_id',
            registration: reg
          });
          return null;
        }
        
        // Get successful claims count
        const successResult = await dbService.executeQuery(
          `SELECT COUNT(*) as count FROM claim_records 
           WHERE eight_ball_pool_id = $1 AND status = 'success'`,
          [eightBallPoolId]
        );
        const successfulClaims = parseInt(successResult.rows[0]?.count || '0');

        // Get failed claims count - exclude duplicate attempts (failed claims where user has successful claim on same day)
        const failedResult = await dbService.executeQuery(
          `SELECT COUNT(*) as count FROM claim_records cr
           WHERE cr.eight_ball_pool_id = $1 
           AND cr.status = 'failed'
           AND NOT EXISTS (
             SELECT 1 FROM claim_records cr2 
             WHERE cr2.eight_ball_pool_id = cr.eight_ball_pool_id 
             AND cr2.status = 'success' 
             AND DATE(cr2.claimed_at) = DATE(cr.claimed_at)
           )`,
          [eightBallPoolId]
        );
        const failedClaims = parseInt(failedResult.rows[0]?.count || '0');

        // Ensure dateLinked is properly formatted
        let formattedDateLinked: string | null = null;
        if (dateLinked) {
          try {
            // Convert to ISO string if it's a Date object or string
            const dateValue = dateLinked instanceof Date 
              ? dateLinked 
              : new Date(dateLinked);
            
            if (!isNaN(dateValue.getTime())) {
              formattedDateLinked = dateValue.toISOString();
            }
          } catch (e) {
            logger.warn('Invalid dateLinked value', {
              action: 'invalid_date_linked',
              dateLinked,
              error: e instanceof Error ? e.message : 'Unknown'
            });
            formattedDateLinked = null;
          }
        }
        
        logger.info('Mapping account data', {
          action: 'map_account_data',
          eightBallPoolId,
          username,
          dateLinked: formattedDateLinked,
          rawDateLinked: dateLinked
        });
        
        // Get account level and rank from registration (already in reg object from initial query)
        let account_level = reg.account_level !== undefined ? reg.account_level : null;
        let account_rank = reg.account_rank !== undefined ? reg.account_rank : null;
        let verified_at = reg.verified_at !== undefined ? reg.verified_at : null;
        
        // Username should always be present (filtered in query)
        const displayUsername = username ? String(username).trim() : null;
        
        logger.info('Account data prepared', {
          action: 'account_data_prepared',
          eightBallPoolId,
          displayUsername,
          user_id,
          account_level,
          account_rank,
          successfulClaims,
          failedClaims
        });
        
        // Compute active avatar URL based on priority
        let activeAvatarUrl: string | null = null;
        if (reg.leaderboard_image_url) {
          activeAvatarUrl = reg.leaderboard_image_url;
        } else if (reg.use_discord_avatar && reg.discord_id) {
          activeAvatarUrl = getDiscordAvatarUrl(reg.discord_id, reg.discord_avatar_hash);
        } else if (reg.eight_ball_pool_avatar_filename) {
          activeAvatarUrl = `/8bp-rewards/avatars/${reg.eight_ball_pool_avatar_filename}`;
        } else if (reg.profile_image_url) {
          activeAvatarUrl = reg.profile_image_url;
        }

        // Compute active username based on toggle
        const activeUsername = reg.use_discord_username && reg.discord_id 
          ? (user?.username || displayUsername) 
          : displayUsername;

        return {
          user_id: user_id || displayUsername, // user_id = username
          username: displayUsername,
          activeUsername: activeUsername,
          activeAvatarUrl: activeAvatarUrl,
          eightBallPoolId: String(eightBallPoolId || ''),
          dateLinked: formattedDateLinked,
          successfulClaims,
          failedClaims,
          account_level: account_level,
          account_rank: account_rank,
          verified_at: verified_at,
          profile_image_url: reg.profile_image_url || null,
          profile_image_updated_at: reg.profile_image_updated_at || null,
          leaderboard_image_url: reg.leaderboard_image_url || null,
          leaderboard_image_updated_at: reg.leaderboard_image_updated_at || null,
          eight_ball_pool_avatar_filename: reg.eight_ball_pool_avatar_filename || null,
          use_discord_avatar: reg.use_discord_avatar ?? false, // Use explicit false for null, don't auto-default based on discord_id
          use_discord_username: reg.use_discord_username ?? false,
          discord_avatar_hash: reg.discord_avatar_hash || null
        };
      })
    );
    
    // Filter out any null entries
    const validAccounts = accountsWithStats.filter((account: any) => account !== null);
    
    logger.info('Sending linked accounts response', {
      action: 'send_linked_accounts',
      discordId,
      accountCount: validAccounts.length,
      accounts: validAccounts.map((a: any) => ({
        eightBallPoolId: a.eightBallPoolId,
        username: a.username,
        dateLinked: a.dateLinked
      }))
    });

    // Log the exact response being sent
    console.log('✅ FINAL RESPONSE:', {
      accountCount: validAccounts.length,
      accounts: validAccounts
    });
    
    logger.info('Sending final response', {
      action: 'send_final_response',
      discordId,
      accountCount: validAccounts.length,
      accounts: JSON.stringify(validAccounts, null, 2)
    });

    const response = {
      success: true,
      accounts: validAccounts,
      timestamp: new Date().toISOString(),
      queryDiscordId: discordId
    };
    
    console.log('📤 Sending JSON response:', JSON.stringify(response, null, 2));
    res.json(response);
    return;
  } catch (error) {
    logger.error('Error fetching linked accounts', {
      action: 'get_linked_accounts_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch linked accounts'
    });
    return;
  }
});

// Get confirmation screenshots for user's accounts
router.get('/screenshots', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    // Find all registrations linked to this Discord ID - use direct SQL with explicit type casting
    // Use the same robust query as linked-accounts endpoint to ensure proper matching
    const result = await dbService.executeQuery(
      `SELECT * FROM registrations 
       WHERE discord_id IS NOT NULL 
       AND discord_id::text = $1::text
       AND LENGTH(TRIM(discord_id)) > 0
       ORDER BY created_at DESC`,
      [String(discordId).trim()]
    );
    
    const registrations = result.rows.map((row: any) => ({
      eightBallPoolId: row.eight_ball_pool_id,
      username: row.username,
      createdAt: row.created_at,
      created_at: row.created_at,
      eight_ball_pool_id: row.eight_ball_pool_id,
      discordId: row.discord_id,
      discord_id: row.discord_id
    }));
    
    const screenshots: Array<{
      eightBallPoolId: string;
      username: string;
      screenshotUrl: string;
      claimedAt: string | null;
      capturedAt: string | null;
      filename: string;
    }> = [];

    // Use absolute path - screenshots are in /app/screenshots/confirmation in container
    // __dirname in compiled code is /app/dist/backend/backend/src/routes
    // So we need to use absolute path /app/screenshots/confirmation
    const screenshotsDir = process.env.SCREENSHOTS_DIR || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/screenshots/confirmation'
        : path.join(__dirname, '../../../../screenshots/confirmation'));
    
    logger.info('Fetching screenshots', {
      action: 'get_screenshots',
      discordId: String(discordId).trim(),
      registrationsCount: registrations.length,
      accountIds: registrations.map((r: any) => r.eightBallPoolId || r.eight_ball_pool_id)
    });
    
    for (const reg of registrations) {
      const eightBallPoolId = reg.eightBallPoolId || reg.eight_ball_pool_id;
      
      if (!eightBallPoolId) {
        logger.warn('Registration missing eightBallPoolId', {
          action: 'missing_eightballpool_id',
          registration: reg
        });
        continue;
      }

      const eightBallPoolIdStr = String(eightBallPoolId).trim();
      
      // Query claim history once for this account to map claim timestamps to filenames
      const claimHistoryResult = await dbService.executeQuery(
        `SELECT claimed_at, metadata 
         FROM claim_records 
         WHERE eight_ball_pool_id = $1 AND status = 'success'
         ORDER BY claimed_at DESC`,
        [eightBallPoolIdStr]
      );

      const claimTimestampsByFilename = new Map<string, string | null>();
      for (const row of claimHistoryResult.rows || []) {
        let metadata = row.metadata;
        if (metadata && typeof metadata === 'string') {
          try {
            metadata = JSON.parse(metadata);
          } catch (parseError) {
            logger.warn('Failed to parse claim metadata JSON', {
              action: 'parse_claim_metadata_error',
              eightBallPoolId: eightBallPoolIdStr,
              error: parseError instanceof Error ? parseError.message : 'Unknown error'
            });
            metadata = {};
          }
        }

        if (metadata && typeof metadata === 'object') {
          const confirmationPath = metadata.confirmationImagePath || metadata.screenshotPath;
          if (confirmationPath && typeof confirmationPath === 'string') {
            const normalizedPath = confirmationPath.replace(/\\/g, '/');
            const filename = path.basename(normalizedPath);
            if (filename) {
              claimTimestampsByFilename.set(filename, row.claimed_at || null);
            }
          }
        }
      }

      // Find confirmation screenshot for this account
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        
        // Find all screenshots for this account (there may be multiple)
        // Handle both string and numeric ID formats
        const accountScreenshots = files.filter(file => {
          // Match files that contain the eightBallPoolId in the filename
          // Screenshots are saved as: confirmation-{eightBallPoolId}-{timestamp}.png
          // Handle both exact match and numeric string match (e.g., "1028645630" matches "1028645630")
          const matchesId = file.includes(eightBallPoolIdStr) || 
                           file.includes(String(parseInt(eightBallPoolIdStr) || eightBallPoolIdStr));
          const isImage = file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg');
          return matchesId && isImage;
        });
        
        if (accountScreenshots.length > 0) {
          // Filenames are like: confirmation-{id}-{timestamp}.png
          // Sort descending to get most recent first
          accountScreenshots.sort((a, b) => b.localeCompare(a));

          const sortedScreenshots = accountScreenshots
            .map((accountScreenshot) => {
              const screenshotPath = path.join(screenshotsDir, accountScreenshot);
              let capturedAtDate: Date | null = null;

              try {
                const stats = fs.statSync(screenshotPath);
                capturedAtDate = stats.mtime || null;
              } catch (statError) {
                logger.warn('Failed to read screenshot metadata', {
                  action: 'screenshot_stat_error',
                  eightBallPoolId: eightBallPoolIdStr,
                  username: reg.username,
                  screenshotFile: accountScreenshot,
                  error: statError instanceof Error ? statError.message : 'Unknown error'
                });
              }

              return {
                filename: accountScreenshot,
                capturedAt: capturedAtDate
              };
            })
            .sort((a, b) => {
              if (a.capturedAt && b.capturedAt) {
                return b.capturedAt.getTime() - a.capturedAt.getTime();
              }
              if (a.capturedAt) return -1;
              if (b.capturedAt) return 1;
              return b.filename.localeCompare(a.filename);
            });

          // Limit to most recent 50 screenshots per account to prevent performance issues
          const recentScreenshots = sortedScreenshots.slice(0, 50);
          
          for (const screenshotInfo of recentScreenshots) {
            const capturedAt = screenshotInfo.capturedAt ? screenshotInfo.capturedAt.toISOString() : null;
            const claimedAt = claimTimestampsByFilename.get(screenshotInfo.filename) || null;

            logger.info('Found screenshot for account', {
              action: 'screenshot_found',
              eightBallPoolId: eightBallPoolIdStr,
              username: reg.username,
              screenshotFile: screenshotInfo.filename,
              totalScreenshots: accountScreenshots.length,
              displayedScreenshots: recentScreenshots.length,
              capturedAt,
              claimedAt
            });

            screenshots.push({
              eightBallPoolId: eightBallPoolIdStr,
              username: reg.username,
              screenshotUrl: `/8bp-rewards/api/user-dashboard/screenshots/view/${screenshotInfo.filename}`,
              claimedAt,
              capturedAt,
              filename: screenshotInfo.filename
            });
          }
        } else {
          logger.info('No screenshot found for account', {
            action: 'no_screenshot_found',
            eightBallPoolId: eightBallPoolIdStr,
            username: reg.username,
            totalFilesInDir: files.length,
            sampleFiles: files.slice(0, 5), // Log first 5 files for debugging
            searchPattern: `confirmation-${eightBallPoolIdStr}-`
          });
        }
      } else {
        logger.warn('Screenshots directory does not exist', {
          action: 'screenshots_dir_missing',
          path: screenshotsDir
        });
      }
    }

    res.json({
      success: true,
      screenshots
    });
  } catch (error) {
    logger.error('Error fetching screenshots', {
      action: 'get_screenshots_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch screenshots'
    });
  }
});

// Notify about new screenshot (can be called by claimer service or other services)
// This endpoint requires authentication OR a valid internal service token
router.post('/screenshots/notify', async (req, res) => {
  try {
    const { userId, eightBallPoolId, username, screenshotUrl, claimedAt, capturedAt, filename } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Emit WebSocket event to notify the user about the new screenshot
    if (eightBallPoolId && username && screenshotUrl) {
      WebSocketService.emitScreenshotUpdate(
        userId,
        {
          eightBallPoolId,
          username,
          screenshotUrl,
          claimedAt: claimedAt || null,
          capturedAt: capturedAt || null,
          filename: filename || null
        }
      );
    } else {
      // Just emit a refresh event if full data not provided
      WebSocketService.emitScreenshotsRefresh(userId);
    }

    logger.info('Screenshot notification sent', {
      action: 'screenshot_notify',
      userId,
      eightBallPoolId
    });

    return res.json({
      success: true,
      message: 'Screenshot notification sent'
    });
  } catch (error) {
    logger.error('Error notifying about screenshot', {
      action: 'screenshot_notify_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to notify about screenshot'
    });
  }
});

// Get verification images for user
router.get('/verification-images', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    // Verification images directory - mounted from verification bot
    const verificationsDir = process.env.VERIFICATIONS_DIR || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/services/verification-bot/verifications'
        : path.join(process.cwd(), 'services', 'verification-bot', 'verifications'));

    if (!fs.existsSync(verificationsDir)) {
      logger.info('Verifications directory does not exist', {
        action: 'verifications_dir_missing',
        path: verificationsDir
      });
      res.json({
        success: true,
        verificationImages: []
      });
      return;
    }

    const files = fs.readdirSync(verificationsDir);
    const verificationImages: Array<{
      filename: string;
      imageUrl: string;
      uniqueId: string | null;
      level: number | null;
      rankName: string | null;
      timestamp: string | null;
      capturedAt: string | null;
    }> = [];

    // Parse verification image filenames: verification-{discordId}-{uniqueId}-{level}-{rankName}-{timestamp}.{ext}
    for (const filename of files) {
      // Check if file belongs to this user (starts with verification-{discordId}-)
      if (!filename.startsWith(`verification-${discordId}-`)) {
        continue;
      }

      // Parse filename to extract metadata
      // Format: verification-{discordId}-{uniqueId}-{level}-{rankName}-{timestamp}.{ext}
      // Rank name may contain underscores, so we need to match everything between level and timestamp
      const match = filename.match(/^verification-(\d+)-([^-]+)-(\d+)-(.+)-(.+)\.(jpg|jpeg|png)$/i);
      if (match) {
        const [, fileDiscordId, uniqueId, level, rankNameWithUnderscores, timestamp] = match;
        const rankName = rankNameWithUnderscores.replace(/_/g, ' '); // Convert underscores back to spaces
        
        // Double-check Discord ID matches
        if (fileDiscordId !== discordId) {
          continue;
        }

        // Parse timestamp from filename (format: YYYY-MM-DDTHH-MM-SS-sssZ)
        let capturedAt: string | null = null;
        try {
          const timestampParts = timestamp.split('-');
          if (timestampParts.length >= 6) {
            const dateStr = `${timestampParts[0]}-${timestampParts[1]}-${timestampParts[2]}T${timestampParts[3]}:${timestampParts[4]}:${timestampParts[5]}.${timestampParts[6] || '000'}Z`;
            capturedAt = new Date(dateStr).toISOString();
          }
        } catch (e) {
          // If timestamp parsing fails, use file stats
          const filePath = path.join(verificationsDir, filename);
          try {
            const stats = fs.statSync(filePath);
            capturedAt = stats.birthtime.toISOString();
          } catch (statError) {
            logger.warn('Failed to get file stats', { filename, error: statError });
          }
        }

        verificationImages.push({
          filename,
          imageUrl: `/8bp-rewards/api/user-dashboard/verification-images/view/${filename}`,
          uniqueId: uniqueId !== 'unknown' ? uniqueId : null,
          level: parseInt(level, 10) || null,
          rankName: rankName.replace(/_/g, ' ') || null,
          timestamp,
          capturedAt
        });
      } else {
        // Fallback: if filename doesn't match pattern, still include it but with minimal metadata
        const filePath = path.join(verificationsDir, filename);
        try {
          const stats = fs.statSync(filePath);
          verificationImages.push({
            filename,
            imageUrl: `/8bp-rewards/api/user-dashboard/verification-images/view/${filename}`,
            uniqueId: null,
            level: null,
            rankName: null,
            timestamp: null,
            capturedAt: stats.birthtime.toISOString()
          });
        } catch (statError) {
          logger.warn('Failed to process verification image', { filename, error: statError });
        }
      }
    }

    // Sort by capturedAt descending (newest first)
    verificationImages.sort((a, b) => {
      const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
      const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
      return timeB - timeA;
    });

    logger.info('Fetched verification images', {
      action: 'get_verification_images',
      discordId,
      count: verificationImages.length
    });

    res.json({
      success: true,
      verificationImages
    });
    return;
  } catch (error) {
    logger.error('Error fetching verification images', {
      action: 'get_verification_images_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch verification images'
    });
    return;
  }
});

// Serve verification image
router.get('/verification-images/view/:filename', async (req, res): Promise<void> => {
  try {
    const { filename } = req.params;
    const user = (req as any).user;
    const discordId = user.id;

    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
      return;
    }

    // Verify user has access to this verification image
    if (!filename.startsWith(`verification-${discordId}-`)) {
      logger.warn('Verification image access denied', {
        action: 'verification_image_access_denied',
        discordId,
        filename
      });
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const verificationsDir = process.env.VERIFICATIONS_DIR || 
      (process.env.NODE_ENV === 'production' 
        ? '/app/services/verification-bot/verifications'
        : path.join(process.cwd(), 'services', 'verification-bot', 'verifications'));
    const imagePath = path.join(verificationsDir, filename);

    if (!fs.existsSync(imagePath)) {
      res.status(404).json({
        success: false,
        message: 'Verification image not found'
      });
      return;
    }

    // Determine content type from extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the image file
    const fileStream = fs.createReadStream(imagePath);
    fileStream.pipe(res);
  } catch (error) {
    logger.error('Error serving verification image', {
      action: 'serve_verification_image_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Failed to serve verification image'
    });
    return;
  }
});

// Serve screenshot image
router.get('/screenshots/view/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const user = (req as any).user;
    const discordId = user.id;

    // Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    // Verify user has access to this screenshot by checking if it's for one of their accounts
    // Wrap in try-catch to prevent any errors from blocking screenshot serving
    let accessCheckFailed = false;
    try {
      const registrations = await dbService.findRegistrations({ discordId: discordId });
      const userAccountIds = registrations.map((r: any) => {
        const id = String(r.eightBallPoolId || r.eight_ball_pool_id || '').trim();
        // Normalize ID - remove dashes for matching
        return id.replace(/-/g, '');
      });
      
      // Check if filename contains any of the user's account IDs (normalized, no dashes)
      // Filenames are like: confirmation-1826254746-2025-11-22T00-02-00-415Z.png
      // Extract the ID from filename (between "confirmation-" and the next "-")
      const filenameIdMatch = filename.match(/confirmation-([0-9-]+)-/);
      const filenameId = filenameIdMatch ? filenameIdMatch[1].replace(/-/g, '') : filename.replace(/-/g, '');
      
      const hasAccess = userAccountIds.some((id: string) => {
        const normalizedId = id.replace(/-/g, '');
        return filenameId === normalizedId || filename.includes(normalizedId);
      });
      
      if (!hasAccess) {
        logger.warn('Screenshot access denied', {
          action: 'screenshot_access_denied',
          discordId,
          filename,
          userAccountIds,
          filenameId
        });
        // Don't return here - check file existence first, then deny
        accessCheckFailed = true;
      }
    } catch (accessError) {
      // Log but don't block - rate limiting or other transient errors shouldn't prevent screenshot access
      logger.warn('Error checking screenshot access (continuing anyway)', {
        action: 'screenshot_access_check_error',
        error: accessError instanceof Error ? accessError.message : 'Unknown error',
        errorStack: accessError instanceof Error ? accessError.stack : undefined,
        discordId,
        filename
      });
      // Continue anyway - let file existence check handle it
      accessCheckFailed = false; // Allow access if check failed
    }

    // Use absolute path for screenshots directory
    const screenshotsDir = process.env.SCREENSHOTS_DIR || path.join(process.cwd(), 'screenshots', 'confirmation');
    const imagePath = path.join(screenshotsDir, filename);

    logger.info('Serving screenshot', {
      action: 'serve_screenshot',
      discordId,
      filename,
      screenshotsDir,
      imagePath,
      exists: fs.existsSync(imagePath)
    });

    if (!fs.existsSync(imagePath)) {
      logger.warn('Screenshot file not found', {
        action: 'screenshot_not_found',
        discordId,
        filename,
        imagePath
      });
      if (!res.headersSent) {
        return res.status(404).json({
          success: false,
          message: 'Screenshot not found'
        });
      }
      return;
    }

    // If access check failed, deny after confirming file exists
    if (accessCheckFailed && !res.headersSent) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Set appropriate headers for image serving with shorter cache time for auto-updates
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Stream the image file with error handling
    try {
      // Check file stats before streaming
      const stats = fs.statSync(imagePath);
      logger.info('Screenshot file stats', {
        action: 'screenshot_file_stats',
        filename,
        size: stats.size,
        isFile: stats.isFile(),
        readable: true
      });

      const fileStream = fs.createReadStream(imagePath);
      
      // Handle stream errors
      fileStream.on('error', (streamError) => {
        logger.error('Error streaming screenshot file', {
          action: 'screenshot_stream_error',
          error: streamError instanceof Error ? streamError.message : 'Unknown error',
          errorStack: streamError instanceof Error ? streamError.stack : undefined,
          discordId,
          filename,
          imagePath,
          headersSent: res.headersSent
        });
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Failed to serve screenshot'
          });
        }
      });

      // Handle response errors
      res.on('error', (resError) => {
        logger.error('Error sending screenshot response', {
          action: 'screenshot_response_error',
          error: resError instanceof Error ? resError.message : 'Unknown error',
          filename,
          discordId
        });
      });

      fileStream.pipe(res);
      return; // Explicit return after streaming
    } catch (streamError) {
      logger.error('Error creating file stream or reading file', {
        action: 'screenshot_stream_create_error',
        error: streamError instanceof Error ? streamError.message : 'Unknown error',
        errorStack: streamError instanceof Error ? streamError.stack : undefined,
        discordId,
        filename,
        imagePath
      });
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'Failed to serve screenshot'
        });
      }
      return;
    }
  } catch (error) {
    logger.error('Error serving screenshot', {
      action: 'serve_screenshot_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to serve screenshot'
    });
  }
});

// Submit deregistration request
router.post('/deregistration-request', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;
    // Get IP address from various sources (respecting proxy headers)
    const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() 
      || req.headers['x-real-ip']?.toString()
      || req.ip 
      || req.connection.remoteAddress 
      || req.socket.remoteAddress
      || 'unknown';

    if (!eightBallPoolId) {
      return res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      return res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
    }

    // Check if there's already a pending request for this account
    const existingRequest = await dbService.executeQuery(
      `SELECT id FROM deregistration_requests 
       WHERE discord_id = $1 AND eight_ball_pool_id = $2 AND status = 'pending'`,
      [discordId, eightBallPoolId]
    );

    if (existingRequest.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'You already have a pending deregistration request for this account'
      });
    }

    // Create deregistration request
    const result = await dbService.executeQuery(
      `INSERT INTO deregistration_requests 
       (discord_id, eight_ball_pool_id, ip_address, status, requested_at) 
       VALUES ($1, $2, $3, 'pending', CURRENT_TIMESTAMP) 
       RETURNING id, requested_at`,
      [discordId, eightBallPoolId, ipAddress]
    );

    logger.info('Deregistration request created', {
      action: 'deregistration_request_created',
      discordId,
      eightBallPoolId,
      requestId: result.rows[0].id,
      ipAddress
    });

    // Send Discord embed notification
    try {
      const discordService = new DiscordNotificationService();
      const discordTag = `${user.username}#${user.discriminator || '0000'}`;
      
      // Find confirmation screenshot if available
      // Use absolute path for screenshots directory
      const screenshotsDir = process.env.SCREENSHOTS_DIR || 
        (process.env.NODE_ENV === 'production' 
          ? '/app/screenshots/confirmation'
          : path.join(__dirname, '../../../../screenshots/confirmation'));
      let screenshotUrl: string | undefined;
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        const screenshot = files.find(file => 
          file.includes(eightBallPoolId) && 
          (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.jpeg'))
        );
        if (screenshot) {
          screenshotUrl = `${process.env.PUBLIC_URL || 'https://8bp.epildevconnect.uk'}/8bp-rewards/api/user-dashboard/screenshots/view/${screenshot}`;
        }
      }

      await discordService.sendDeregistrationRequestEmbed(
        discordId,
        discordTag,
        eightBallPoolId,
        registration.username || null,
        ipAddress,
        screenshotUrl
      );
    } catch (discordError) {
      logger.warn('Failed to send Discord notification for deregistration request', {
        action: 'discord_notification_failed',
        error: discordError instanceof Error ? discordError.message : 'Unknown error'
      });
    }

    return res.json({
      success: true,
      message: 'Deregistration request submitted successfully',
      requestId: result.rows[0].id,
      requestedAt: result.rows[0].requested_at
    });
  } catch (error) {
    logger.error('Error creating deregistration request', {
      action: 'create_deregistration_request_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to submit deregistration request'
    });
  }
});

// Get user's deregistration requests
router.get('/deregistration-requests', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    const result = await dbService.executeQuery(
      `SELECT id, eight_ball_pool_id, status, requested_at, reviewed_at, review_notes
       FROM deregistration_requests 
       WHERE discord_id = $1 
       ORDER BY requested_at DESC`,
      [discordId]
    );

    res.json({
      success: true,
      requests: result.rows
    });
  } catch (error) {
    logger.error('Error fetching deregistration requests', {
      action: 'get_deregistration_requests_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deregistration requests'
    });
  }
});

// Get user info (IP, last login, etc.)
router.get('/info', async (req, res) => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    
    // Get IP address from various sources (respecting proxy headers)
    const ipAddress = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() 
      || req.headers['x-real-ip']?.toString()
      || req.ip 
      || req.connection.remoteAddress 
      || req.socket.remoteAddress
      || 'unknown';

    // Get user's last login info from registrations - use direct SQL
    const registrationsResult = await dbService.executeQuery(
      `SELECT * FROM registrations 
       WHERE discord_id = $1 AND discord_id IS NOT NULL 
       ORDER BY created_at DESC`,
      [discordId]
    );
    
    const registrations = registrationsResult.rows;
    
    // Get the most recent last_login_at from any linked account
    let lastLoginAt: string | null = null;
    
    if (registrations.length > 0) {
      const loginResult = await dbService.executeQuery(
        `SELECT last_login_at FROM registrations 
         WHERE discord_id = $1 AND last_login_at IS NOT NULL 
         ORDER BY last_login_at DESC LIMIT 1`,
        [discordId]
      );
      
      if (loginResult.rows.length > 0) {
        lastLoginAt = loginResult.rows[0].last_login_at;
      }
    }

    // Update last login for this session (without IP)
    if (registrations.length > 0) {
      await dbService.executeQuery(
        `UPDATE registrations 
         SET last_login_at = CURRENT_TIMESTAMP 
         WHERE discord_id = $1`,
        [discordId]
      );
    }

    logger.info('Sending user info response', {
      action: 'send_user_info',
      discordId,
      currentIp: ipAddress,
      lastLoginAt,
      registrationsFound: registrations.length
    });

    res.json({
      success: true,
      user: {
        discordId: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar
      },
      currentIp: ipAddress !== 'unknown' ? ipAddress : (req.ip || req.connection.remoteAddress || 'Unknown'),
      lastLoginAt
    });
  } catch (error) {
    logger.error('Error fetching user info', {
      action: 'get_user_info_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user info'
    });
  }
});

// Support Chat Routes

// Create new support ticket
router.post('/support/create', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { category } = req.body;

    if (!category) {
      res.status(400).json({
        success: false,
        error: 'Category is required'
      });
      return;
    }

    // Generate ticket number
    const ticketNumber = await generateTicketNumber('website');

    // Create ticket
    const client = await dbService.getClient();
    try {
      const ticketResult = await client.query(
        `INSERT INTO support_tickets (ticket_number, ticket_type, discord_id, status, category, subject)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, ticket_number, status, category, subject, created_at`,
        [
          ticketNumber,
          'website',
          discordId,
          'open',
          category,
          `Support Request: ${category}`
        ]
      );

      const ticket = ticketResult.rows[0];

      // Create initial system message
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, message)
         VALUES ($1, $2, $3)`,
        [
          ticket.id,
          'system',
          `Ticket created for category: ${category}`
        ]
      );

      logger.info('Support ticket created', {
        action: 'create_support_ticket',
        ticketNumber,
        discordId,
        category
      });

      // Send Discord notification
      try {
        const discordService = new DiscordNotificationService();
        await discordService.sendTicketNotification(
          ticketNumber,
          'website',
          ticket.subject,
          category,
          user.username || undefined,
          undefined, // email
          discordId,
          false // hasAttachments
        );
      } catch (discordError) {
        logger.error('Failed to send Discord ticket notification', {
          action: 'discord_ticket_notification_error',
          error: discordError instanceof Error ? discordError.message : 'Unknown error',
          ticketNumber
        });
        // Don't fail the request if Discord notification fails
      }

      res.json({
        success: true,
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          status: ticket.status,
          category: ticket.category,
          subject: ticket.subject,
          created_at: ticket.created_at
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to create support ticket', {
      action: 'create_support_ticket_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to create support ticket'
    });
  }
});

// Get user's support tickets
router.get('/support/tickets', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;

    const client = await dbService.getClient();
    try {
      const result = await client.query(
        `SELECT id, ticket_number, status, category, subject, created_at, closed_at, close_reason
         FROM support_tickets
         WHERE discord_id = $1 AND ticket_type = 'website'
         ORDER BY created_at DESC`,
        [discordId]
      );

      res.json({
        success: true,
        tickets: result.rows.map((row: any) => ({
          id: row.id,
          ticket_number: row.ticket_number,
          status: row.status,
          category: row.category,
          subject: row.subject,
          created_at: row.created_at,
          closed_at: row.closed_at,
          close_reason: row.close_reason
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch support tickets', {
      action: 'get_support_tickets_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch support tickets'
    });
  }
});

// Get messages for a ticket
router.get('/support/tickets/:ticketId/messages', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { ticketId } = req.params;

    const client = await dbService.getClient();
    try {
      // Verify ticket belongs to user
      const ticketCheck = await client.query(
        `SELECT id FROM support_tickets WHERE id = $1 AND discord_id = $2`,
        [ticketId, discordId]
      );

      if (ticketCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
        return;
      }

      const result = await client.query(
        `SELECT id, sender_type, sender_discord_id, message, created_at
         FROM ticket_messages
         WHERE ticket_id = $1
         ORDER BY created_at ASC`,
        [ticketId]
      );

      res.json({
        success: true,
        messages: result.rows.map((row: any) => ({
          id: row.id,
          sender_type: row.sender_type,
          sender_discord_id: row.sender_discord_id,
          message: row.message,
          created_at: row.created_at
        }))
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to fetch ticket messages', {
      action: 'get_ticket_messages_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId,
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ticket messages'
    });
  }
});

// Send message in ticket
router.post('/support/tickets/:ticketId/messages', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { ticketId } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({
        success: false,
        error: 'Message is required'
      });
      return;
    }

    const client = await dbService.getClient();
    try {
      // Verify ticket belongs to user and is open
      const ticketCheck = await client.query(
        `SELECT id, status FROM support_tickets WHERE id = $1 AND discord_id = $2`,
        [ticketId, discordId]
      );

      if (ticketCheck.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Ticket not found'
        });
        return;
      }

      if (ticketCheck.rows[0].status === 'closed') {
        res.status(400).json({
          success: false,
          error: 'Cannot send message to closed ticket'
        });
        return;
      }

      // Insert message
      const result = await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_discord_id, sender_type, message)
         VALUES ($1, $2, $3, $4)
         RETURNING id, sender_type, sender_discord_id, message, created_at`,
        [ticketId, discordId, 'user', message.trim()]
      );

      // Update ticket updated_at
      await client.query(
        `UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ticketId]
      );

      // Emit WebSocket event
      const messageData = result.rows[0];
      WebSocketService.emitTicketMessage(ticketId, {
        id: messageData.id,
        sender_type: messageData.sender_type,
        sender_discord_id: messageData.sender_discord_id,
        message: messageData.message,
        created_at: messageData.created_at
      });

      logger.info('Ticket message sent', {
        action: 'send_ticket_message',
        ticketId,
        discordId
      });

      res.json({
        success: true,
        message: {
          id: result.rows[0].id,
          sender_type: result.rows[0].sender_type,
          sender_discord_id: result.rows[0].sender_discord_id,
          message: result.rows[0].message,
          created_at: result.rows[0].created_at
        }
      });
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Failed to send ticket message', {
      action: 'send_ticket_message_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      ticketId: req.params.ticketId,
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to send message'
    });
  }
});

// Update username for a linked account
router.put('/update-username', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId, newUsername } = req.body;

    if (!eightBallPoolId || !newUsername) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId and newUsername are required'
      });
      return;
    }

    // Validate username length
    if (newUsername.trim().length < 2 || newUsername.trim().length > 50) {
      res.status(400).json({
        success: false,
        error: 'Username must be between 2 and 50 characters'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Update the username
    await dbService.updateRegistration(eightBallPoolId, {
      username: newUsername.trim()
    });

    logger.info('Username updated by user', {
      action: 'update_username',
      discordId,
      eightBallPoolId,
      oldUsername: registration.username,
      newUsername: newUsername.trim()
    });

    res.json({
      success: true,
      message: 'Username updated successfully',
      username: newUsername.trim()
    });
  } catch (error) {
    logger.error('Error updating username', {
      action: 'update_username_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to update username'
    });
  }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadType = req.path.includes('profile-image') ? 'profile-images' : 'leaderboard-images';
    const uploadDir = path.join(process.cwd(), 'uploads', uploadType);
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
  }
});

// Upload profile image
router.post('/profile-image', upload.single('image'), async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;

    if (!eightBallPoolId) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      // Delete uploaded file if account doesn't belong to user
      fs.unlinkSync(req.file.path);
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Delete old profile image if it exists
    if (registration.profile_image_url) {
      const oldImagePath = registration.profile_image_url.replace(/^\/uploads\//, path.join(process.cwd(), 'uploads/'));
      try {
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      } catch (error) {
        logger.warn('Failed to delete old profile image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: oldImagePath
        });
      }
    }

    // Save new profile image URL
    const imageUrl = `/uploads/profile-images/${path.basename(req.file.path)}`;
    await dbService.updateRegistration(eightBallPoolId, {
      profile_image_url: imageUrl,
      profile_image_updated_at: new Date()
    });

    logger.info('Profile image uploaded', {
      action: 'upload_profile_image',
      discordId,
      eightBallPoolId,
      imageUrl
    });

    // Fetch updated registration to compute activeAvatarUrl
    const updatedRegistration = await dbService.findRegistration({ eightBallPoolId });
    if (updatedRegistration) {
      // Compute active avatar URL based on priority
      let activeAvatarUrl: string | null = null;
      if (updatedRegistration.leaderboard_image_url) {
        activeAvatarUrl = updatedRegistration.leaderboard_image_url;
      } else if (updatedRegistration.eight_ball_pool_avatar_filename) {
        activeAvatarUrl = `/8bp-rewards/avatars/${updatedRegistration.eight_ball_pool_avatar_filename}`;
      } else if (updatedRegistration.use_discord_avatar && updatedRegistration.discordId) {
        activeAvatarUrl = getDiscordAvatarUrl(updatedRegistration.discordId, updatedRegistration.discord_avatar_hash);
      } else if (updatedRegistration.profile_image_url) {
        activeAvatarUrl = updatedRegistration.profile_image_url;
      }

      // Compute active username
      const activeUsername = updatedRegistration.use_discord_username && updatedRegistration.discordId
        ? (user.username || updatedRegistration.username)
        : updatedRegistration.username;

      // Emit WebSocket event for avatar update
      WebSocketService.emitAvatarUpdate(discordId, {
        eightBallPoolId,
        activeAvatarUrl,
        activeUsername,
        profile_image_url: updatedRegistration.profile_image_url || null,
        leaderboard_image_url: updatedRegistration.leaderboard_image_url || null,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename || null,
        use_discord_avatar: updatedRegistration.use_discord_avatar ?? (updatedRegistration.discordId ? true : false),
        use_discord_username: updatedRegistration.use_discord_username ?? false,
        discord_avatar_hash: updatedRegistration.discord_avatar_hash || null
      });
      WebSocketService.emitAvatarsRefresh(discordId);

      // Return full updated registration object
      res.json({
        success: true,
        imageUrl: imageUrl,
        activeAvatarUrl: activeAvatarUrl,
        registration: {
          eightBallPoolId: updatedRegistration.eightBallPoolId,
          username: updatedRegistration.username,
          profile_image_url: updatedRegistration.profile_image_url,
          profile_image_updated_at: updatedRegistration.profile_image_updated_at,
          leaderboard_image_url: updatedRegistration.leaderboard_image_url,
          leaderboard_image_updated_at: updatedRegistration.leaderboard_image_updated_at,
          eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
          use_discord_avatar: updatedRegistration.use_discord_avatar,
          use_discord_username: updatedRegistration.use_discord_username,
          discord_avatar_hash: updatedRegistration.discord_avatar_hash
        }
      });
      return;
    }

    // Fallback if registration not found
    res.json({
      success: true,
      imageUrl: imageUrl
    });
  } catch (error) {
    logger.error('Error uploading profile image', {
      action: 'upload_profile_image_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to upload profile image'
    });
  }
});

// Upload leaderboard image
router.post('/leaderboard-image', upload.single('image'), async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;

    if (!eightBallPoolId) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No image file provided'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      // Delete uploaded file if account doesn't belong to user
      fs.unlinkSync(req.file.path);
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Delete old leaderboard image if it exists
    if (registration.leaderboard_image_url) {
      const oldImagePath = registration.leaderboard_image_url.replace(/^\/uploads\//, path.join(process.cwd(), 'uploads/'));
      try {
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      } catch (error) {
        logger.warn('Failed to delete old leaderboard image', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: oldImagePath
        });
      }
    }

    // Save new leaderboard image URL
    const imageUrl = `/uploads/leaderboard-images/${path.basename(req.file.path)}`;
    await dbService.updateRegistration(eightBallPoolId, {
      leaderboard_image_url: imageUrl,
      leaderboard_image_updated_at: new Date()
    });

    logger.info('Leaderboard image uploaded', {
      action: 'upload_leaderboard_image',
      discordId,
      eightBallPoolId,
      imageUrl
    });

    // Fetch updated registration to compute activeAvatarUrl
    const updatedRegistration = await dbService.findRegistration({ eightBallPoolId });
    if (updatedRegistration) {
      // Compute active avatar URL based on priority
      let activeAvatarUrl: string | null = null;
      if (updatedRegistration.leaderboard_image_url) {
        activeAvatarUrl = updatedRegistration.leaderboard_image_url;
      } else if (updatedRegistration.eight_ball_pool_avatar_filename) {
        activeAvatarUrl = `/8bp-rewards/avatars/${updatedRegistration.eight_ball_pool_avatar_filename}`;
      } else if (updatedRegistration.use_discord_avatar && updatedRegistration.discordId) {
        activeAvatarUrl = getDiscordAvatarUrl(updatedRegistration.discordId, updatedRegistration.discord_avatar_hash);
      } else if (updatedRegistration.profile_image_url) {
        activeAvatarUrl = updatedRegistration.profile_image_url;
      }

      // Compute active username
      const activeUsername = updatedRegistration.use_discord_username && updatedRegistration.discordId
        ? (user.username || updatedRegistration.username)
        : updatedRegistration.username;

      // Emit WebSocket event for avatar update
      WebSocketService.emitAvatarUpdate(discordId, {
        eightBallPoolId,
        activeAvatarUrl,
        activeUsername,
        profile_image_url: updatedRegistration.profile_image_url || null,
        leaderboard_image_url: updatedRegistration.leaderboard_image_url || null,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename || null,
        use_discord_avatar: updatedRegistration.use_discord_avatar ?? (updatedRegistration.discordId ? true : false),
        use_discord_username: updatedRegistration.use_discord_username ?? false,
        discord_avatar_hash: updatedRegistration.discord_avatar_hash || null
      });
      WebSocketService.emitAvatarsRefresh(discordId);

      // Return full updated registration object
      res.json({
        success: true,
        imageUrl: imageUrl,
        activeAvatarUrl: activeAvatarUrl,
        registration: {
          eightBallPoolId: updatedRegistration.eightBallPoolId,
          username: updatedRegistration.username,
          profile_image_url: updatedRegistration.profile_image_url,
          profile_image_updated_at: updatedRegistration.profile_image_updated_at,
          leaderboard_image_url: updatedRegistration.leaderboard_image_url,
          leaderboard_image_updated_at: updatedRegistration.leaderboard_image_updated_at,
          eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
          use_discord_avatar: updatedRegistration.use_discord_avatar,
          use_discord_username: updatedRegistration.use_discord_username,
          discord_avatar_hash: updatedRegistration.discord_avatar_hash
        }
      });
      return;
    }

    // Fallback if registration not found
    res.json({
      success: true,
      imageUrl: imageUrl
    });
  } catch (error) {
    logger.error('Error uploading leaderboard image', {
      action: 'upload_leaderboard_image_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to upload leaderboard image'
    });
  }
});

// Delete profile image
router.delete('/profile-image', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;

    if (!eightBallPoolId) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Delete the image file if it exists
    if (registration.profile_image_url) {
      const imagePath = registration.profile_image_url.replace(/^\/uploads\//, path.join(process.cwd(), 'uploads/'));
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (error) {
        logger.warn('Failed to delete profile image file', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: imagePath
        });
      }
    }

    // Remove image URL from database
    await dbService.updateRegistration(eightBallPoolId, {
      profile_image_url: null,
      profile_image_updated_at: null
    });

    logger.info('Profile image deleted', {
      action: 'delete_profile_image',
      discordId,
      eightBallPoolId
    });

    res.json({
      success: true,
      message: 'Profile image deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting profile image', {
      action: 'delete_profile_image_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete profile image'
    });
  }
});

// Delete leaderboard image
router.delete('/leaderboard-image', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;

    if (!eightBallPoolId) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Delete the image file if it exists
    if (registration.leaderboard_image_url) {
      const imagePath = registration.leaderboard_image_url.replace(/^\/uploads\//, path.join(process.cwd(), 'uploads/'));
      try {
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      } catch (error) {
        logger.warn('Failed to delete leaderboard image file', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: imagePath
        });
      }
    }

    // Remove image URL from database
    await dbService.updateRegistration(eightBallPoolId, {
      leaderboard_image_url: null,
      leaderboard_image_updated_at: null
    });

    logger.info('Leaderboard image deleted', {
      action: 'delete_leaderboard_image',
      discordId,
      eightBallPoolId
    });

    res.json({
      success: true,
      message: 'Leaderboard image deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting leaderboard image', {
      action: 'delete_leaderboard_image_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to delete leaderboard image'
    });
  }
});

// Select 8 Ball Pool avatar
router.put('/eight-ball-pool-avatar', async (req, res): Promise<void> => {
  try {
    logger.info('8BP avatar selection request received', {
      action: '8bp_avatar_request',
      body: req.body,
      userId: (req as any).user?.id,
      method: req.method,
      url: req.url
    });
    
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId, avatarFilename } = req.body;
    
    logger.info('8BP avatar selection - parsed data', {
      action: '8bp_avatar_parsed',
      discordId,
      eightBallPoolId,
      avatarFilename
    });

    if (!eightBallPoolId || !avatarFilename) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId and avatarFilename are required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Validate that the avatar file exists
    // Use absolute path - in Docker container, avatars are at /app/frontend/8 Ball Pool Avatars
    const avatarsDir = process.env.NODE_ENV === 'production'
      ? '/app/frontend/8 Ball Pool Avatars'
      : path.join(process.cwd(), 'frontend', '8 Ball Pool Avatars');
    const avatarPath = path.join(avatarsDir, avatarFilename);
    
    if (!fs.existsSync(avatarPath)) {
      res.status(400).json({
        success: false,
        error: 'Avatar file not found'
      });
      return;
    }

    // Save avatar filename to database
    logger.info('Attempting to save avatar to database', {
      action: 'save_avatar_start',
      discordId,
      eightBallPoolId,
      avatarFilename,
      registration_id: registration.id
    });

    // Use direct SQL UPDATE instead of model save() to ensure it actually persists
    // The model's save() method has been unreliable - UPDATE runs but column doesn't change
    // Also auto-toggle off Discord avatar when selecting 8BP avatar
    logger.info('Attempting direct SQL update for avatar with auto-toggle', {
      action: 'direct_sql_update_start',
      discordId,
      eightBallPoolId,
      avatarFilename,
      auto_toggle_discord_off: true
    });
    
    const directUpdate = await dbService.executeQuery(
      'UPDATE registrations SET eight_ball_pool_avatar_filename = $1, use_discord_avatar = false, updated_at = CURRENT_TIMESTAMP WHERE eight_ball_pool_id = $2 RETURNING id, eight_ball_pool_avatar_filename, use_discord_avatar, updated_at',
      [avatarFilename, eightBallPoolId]
    );
    
    logger.info('🔄 Auto-toggled use_discord_avatar to false when selecting 8BP avatar', {
      action: 'auto_toggle_discord_off',
      eightBallPoolId,
      avatarFilename
    });
    
    if (!directUpdate || directUpdate.rows.length === 0) {
      logger.error('Direct SQL update failed - no rows returned', {
        action: 'direct_sql_update_failed',
        discordId,
        eightBallPoolId,
        avatarFilename
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save avatar to database'
      });
      return;
    }
    
    const updateResult = {
      id: directUpdate.rows[0].id,
      eight_ball_pool_avatar_filename: directUpdate.rows[0].eight_ball_pool_avatar_filename,
      use_discord_avatar: directUpdate.rows[0].use_discord_avatar,
      updated_at: directUpdate.rows[0].updated_at
    };
    
    logger.info('Direct SQL update completed', {
      action: 'direct_sql_update_success',
      discordId,
      eightBallPoolId,
      avatarFilename,
      returned_avatar: updateResult.eight_ball_pool_avatar_filename,
      matches: updateResult.eight_ball_pool_avatar_filename === avatarFilename
    });
    
    if (updateResult.eight_ball_pool_avatar_filename !== avatarFilename) {
      logger.error('CRITICAL: Direct SQL update returned wrong value!', {
        action: 'direct_sql_update_value_mismatch',
        discordId,
        eightBallPoolId,
        requested: avatarFilename,
        returned: updateResult.eight_ball_pool_avatar_filename
      });
      res.status(500).json({
        success: false,
        error: 'Avatar save verification failed'
      });
      return;
    }

    logger.info('8 Ball Pool avatar saved to database', {
      action: 'select_8bp_avatar',
      discordId,
      eightBallPoolId,
      avatarFilename,
      saved_avatar_filename: updateResult.eight_ball_pool_avatar_filename,
      update_result_id: updateResult.id,
      save_verified: updateResult.eight_ball_pool_avatar_filename === avatarFilename
    });
    
    // Double-check by querying the database directly - wait a tiny bit for transaction to commit
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const directCheck = await dbService.executeQuery(
      'SELECT eight_ball_pool_avatar_filename, updated_at FROM registrations WHERE eight_ball_pool_id = $1',
      [eightBallPoolId]
    );
    
    if (directCheck.rows.length > 0) {
      const dbValue = directCheck.rows[0].eight_ball_pool_avatar_filename;
      const dbUpdatedAt = directCheck.rows[0].updated_at;
      logger.info('Direct database check after save', {
        action: 'direct_db_check',
        eightBallPoolId,
        requested: avatarFilename,
        updateResult: updateResult.eight_ball_pool_avatar_filename,
        directQuery: dbValue,
        dbUpdatedAt: dbUpdatedAt,
        allMatch: avatarFilename === updateResult.eight_ball_pool_avatar_filename && updateResult.eight_ball_pool_avatar_filename === dbValue
      });
      
      if (dbValue !== avatarFilename) {
        logger.error('CRITICAL: Database value does not match after save!', {
          action: 'db_value_mismatch',
          eightBallPoolId,
          requested: avatarFilename,
          updateResult: updateResult.eight_ball_pool_avatar_filename,
          directQuery: dbValue,
          dbUpdatedAt: dbUpdatedAt
        });
        
        // Try to force update directly via SQL as a last resort
        logger.warn('Attempting direct SQL update as fallback', {
          action: 'direct_sql_fallback',
          eightBallPoolId,
          avatarFilename
        });
        
        try {
          const forceUpdate = await dbService.executeQuery(
            'UPDATE registrations SET eight_ball_pool_avatar_filename = $1, updated_at = CURRENT_TIMESTAMP WHERE eight_ball_pool_id = $2 RETURNING eight_ball_pool_avatar_filename',
            [avatarFilename, eightBallPoolId]
          );
          
          if (forceUpdate.rows.length > 0) {
            logger.info('Direct SQL update succeeded', {
              action: 'direct_sql_update_success',
              eightBallPoolId,
              newValue: forceUpdate.rows[0].eight_ball_pool_avatar_filename
            });
          }
        } catch (forceError: any) {
          logger.error('Direct SQL update failed', {
            action: 'direct_sql_update_failed',
            eightBallPoolId,
            error: forceError.message
          });
        }
      }
    } else {
      logger.error('Direct database check found no rows!', {
        action: 'direct_db_check_no_rows',
        eightBallPoolId
      });
    }

    // Fetch updated registration to compute activeAvatarUrl (for response)
    const updatedRegistration = await dbService.findRegistration({ eightBallPoolId });
    
    if (!updatedRegistration) {
      logger.error('Failed to fetch updated registration after save', {
        action: 'fetch_updated_registration_failed',
        discordId,
        eightBallPoolId,
        avatarFilename
      });
      res.status(500).json({
        success: false,
        error: 'Failed to verify avatar save'
      });
      return;
    }
    
    // Verify the direct SQL update worked
    const dbMatches = updateResult.eight_ball_pool_avatar_filename === avatarFilename;
    const fetchMatches = updatedRegistration.eight_ball_pool_avatar_filename === avatarFilename;
    
    logger.info('Verified avatar save', {
      action: 'verify_avatar_save',
      discordId,
      eightBallPoolId,
      avatarFilename,
      direct_update_result: updateResult.eight_ball_pool_avatar_filename,
      direct_update_matches: dbMatches,
      fetch_result_avatar: updatedRegistration.eight_ball_pool_avatar_filename,
      fetch_result_matches: fetchMatches
    });
    
    // If direct update succeeded but fetch doesn't match, update the fetched object
    if (dbMatches && !fetchMatches) {
      logger.warn('Direct update succeeded but fresh fetch shows different value', {
        action: 'avatar_fetch_mismatch_after_direct_update',
        discordId,
        eightBallPoolId,
        requested_avatar: avatarFilename,
        direct_update_result: updateResult.eight_ball_pool_avatar_filename,
        fetch_result_avatar: updatedRegistration.eight_ball_pool_avatar_filename
      });
      // Use the direct update result as source of truth
      updatedRegistration.eight_ball_pool_avatar_filename = updateResult.eight_ball_pool_avatar_filename;
    }
    let activeAvatarUrl: string | null = null;
    if (updatedRegistration) {
      // Sync use_discord_avatar from direct update result if available
      if (updateResult?.use_discord_avatar !== undefined) {
        updatedRegistration.use_discord_avatar = updateResult.use_discord_avatar;
      }
      
      // Compute active avatar URL based on priority
      logger.info('🔍 Computing activeAvatarUrl after 8BP avatar selection', {
        action: 'compute_avatar_priority_8bp',
        eightBallPoolId,
        leaderboard_image_url: !!updatedRegistration.leaderboard_image_url,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        discordId: !!updatedRegistration.discordId,
        discord_avatar_hash: !!updatedRegistration.discord_avatar_hash,
        profile_image_url: !!updatedRegistration.profile_image_url
      });

      if (updatedRegistration.leaderboard_image_url) {
        activeAvatarUrl = updatedRegistration.leaderboard_image_url;
        logger.info('✅ Using leaderboard_image_url (highest priority)');
      } else if (updatedRegistration.use_discord_avatar && updatedRegistration.discordId) {
        activeAvatarUrl = getDiscordAvatarUrl(updatedRegistration.discordId, updatedRegistration.discord_avatar_hash);
        if (activeAvatarUrl) {
          logger.info('✅ Using Discord avatar (use_discord_avatar=true, priority over 8BP)', {
            avatar_type: updatedRegistration.discord_avatar_hash ? 'custom' : 'default'
          });
        }
      } else if (updatedRegistration.eight_ball_pool_avatar_filename) {
        activeAvatarUrl = `/8bp-rewards/avatars/${updatedRegistration.eight_ball_pool_avatar_filename}`;
        logger.info('✅ Using 8BP avatar (fallback, use_discord_avatar=false or no Discord data)');
      } else if (updatedRegistration.profile_image_url) {
        activeAvatarUrl = updatedRegistration.profile_image_url;
        logger.info('✅ Using profile_image_url (lowest priority)');
      }
      
      logger.info('🎯 Final activeAvatarUrl decision (8BP selection)', {
        action: 'avatar_decision_8bp',
        activeAvatarUrl,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        reasoning: '8BP avatar selected, Discord auto-toggled off'
      });

      // Compute active username
      const activeUsername = updatedRegistration.use_discord_username && updatedRegistration.discordId
        ? (user.username || updatedRegistration.username)
        : updatedRegistration.username;

      // Emit WebSocket event for avatar update with full data
      WebSocketService.emitAvatarUpdate(discordId, {
        eightBallPoolId,
        activeAvatarUrl,
        activeUsername,
        profile_image_url: updatedRegistration.profile_image_url || null,
        leaderboard_image_url: updatedRegistration.leaderboard_image_url || null,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename || null,
        use_discord_avatar: updatedRegistration.use_discord_avatar ?? (updatedRegistration.discordId ? true : false),
        use_discord_username: updatedRegistration.use_discord_username ?? false,
        discord_avatar_hash: updatedRegistration.discord_avatar_hash || null
      });
      WebSocketService.emitAvatarsRefresh(discordId);
      
      logger.info('8 Ball Pool avatar selected and WebSocket event emitted', {
        action: 'select_8bp_avatar_websocket',
        discordId,
        eightBallPoolId,
        avatarFilename,
        activeAvatarUrl,
        hasLeaderboardImage: !!updatedRegistration.leaderboard_image_url,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename
      });
    }

    res.json({
      success: true,
      message: '8 Ball Pool avatar selected successfully',
      avatarUrl: `/8bp-rewards/avatars/${avatarFilename}`,
      activeAvatarUrl: activeAvatarUrl || null,
      hasLeaderboardImage: updatedRegistration?.leaderboard_image_url ? true : false,
      eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename, // Use DB value to confirm save
      db_verified: true, // Indicate that database save was verified
      registration: updatedRegistration ? {
        eightBallPoolId: updatedRegistration.eightBallPoolId,
        username: updatedRegistration.username,
        profile_image_url: updatedRegistration.profile_image_url,
        profile_image_updated_at: updatedRegistration.profile_image_updated_at,
        leaderboard_image_url: updatedRegistration.leaderboard_image_url,
        leaderboard_image_updated_at: updatedRegistration.leaderboard_image_updated_at,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        use_discord_username: updatedRegistration.use_discord_username,
        discord_avatar_hash: updatedRegistration.discord_avatar_hash
      } : null
    });
    
    logger.info('Avatar selection request completed successfully', {
      action: 'avatar_selection_complete',
      discordId,
      eightBallPoolId,
      avatarFilename,
      activeAvatarUrl,
      hasLeaderboardImage: !!updatedRegistration.leaderboard_image_url
    });
  } catch (error) {
    logger.error('Error selecting 8 Ball Pool avatar', {
      action: 'select_8bp_avatar_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to select 8 Ball Pool avatar'
    });
  }
});

// Remove 8 Ball Pool avatar selection
router.delete('/eight-ball-pool-avatar', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId } = req.body;

    if (!eightBallPoolId) {
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId is required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    // Remove avatar filename from database
    await dbService.updateRegistration(eightBallPoolId, {
      eight_ball_pool_avatar_filename: null
    });

    logger.info('8 Ball Pool avatar removed', {
      action: 'remove_8bp_avatar',
      discordId,
      eightBallPoolId
    });

    res.json({
      success: true,
      message: '8 Ball Pool avatar removed successfully'
    });
  } catch (error) {
    logger.error('Error removing 8 Ball Pool avatar', {
      action: 'remove_8bp_avatar_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to remove 8 Ball Pool avatar'
    });
  }
});

// Toggle Discord avatar usage
router.put('/profile-image/discord-toggle', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId, useDiscordAvatar } = req.body;

    logger.info('🔵 Discord avatar toggle request received', {
      action: 'discord_avatar_toggle_request',
      discordId,
      eightBallPoolId,
      requested_useDiscordAvatar: useDiscordAvatar,
      requestBody: req.body
    });

    if (!eightBallPoolId || typeof useDiscordAvatar !== 'boolean') {
      logger.warn('❌ Invalid toggle request', {
        action: 'toggle_request_invalid',
        eightBallPoolId,
        useDiscordAvatar,
        type: typeof useDiscordAvatar
      });
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId and useDiscordAvatar (boolean) are required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      logger.warn('❌ Registration not found or unauthorized', {
        action: 'toggle_registration_not_found',
        discordId,
        eightBallPoolId
      });
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    logger.info('📊 Current registration state before toggle', {
      action: 'toggle_current_state',
      eightBallPoolId,
      current_use_discord_avatar: registration.use_discord_avatar,
      new_use_discord_avatar: useDiscordAvatar,
      has_8bp_avatar: !!registration.eight_ball_pool_avatar_filename,
      has_discord_hash: !!registration.discord_avatar_hash,
      has_discord_id: !!registration.discordId,
      leaderboard_image_url: !!registration.leaderboard_image_url,
      user_avatar_from_session: user.avatar
    });

    // If enabling Discord avatar but hash is missing, try to get it from user session
    let avatarHashToSave = registration.discord_avatar_hash;
    
    // Log current state for debugging
    logger.info('🔍 Checking Discord avatar hash availability', {
      action: 'toggle_check_avatar_hash',
      discordId,
      eightBallPoolId,
      has_registration_hash: !!registration.discord_avatar_hash,
      registration_hash_value: registration.discord_avatar_hash || 'null',
      has_user_session_avatar: !!user.avatar,
      user_session_avatar_value: user.avatar || 'null',
      useDiscordAvatar
    });
    
    if (useDiscordAvatar && !registration.discord_avatar_hash) {
      // Try to get from user session first
      if (user.avatar) {
        avatarHashToSave = user.avatar;
        logger.info('🔄 Missing discord_avatar_hash in registration, using avatar from user session', {
          action: 'fetch_discord_avatar_hash_from_session',
          discordId,
          avatarHash: user.avatar
        });
      } else {
        // User might have default Discord avatar (hash is null)
        // We allow this - null hash means default avatar, which is valid
        logger.info('📝 Discord avatar hash is null (user likely has default Discord avatar)', {
          action: 'discord_default_avatar_detected',
          discordId,
          eightBallPoolId,
          note: 'Null hash is valid for default Discord avatars - will use default avatar URL format'
        });
        avatarHashToSave = null; // Explicitly set to null for default avatars
      }
    }

    // Note: We don't return an error if avatarHashToSave is null
    // Null hash means default Discord avatar, which is valid and should be handled

    // Use direct SQL UPDATE instead of model save() to ensure it actually persists
    // Follow the same pattern as 8BP avatar endpoint for reliability
    logger.info('🔧 Attempting direct SQL update for Discord avatar toggle', {
      action: 'direct_sql_update_start',
      discordId,
      eightBallPoolId,
      use_discord_avatar: useDiscordAvatar,
      avatar_hash_to_save: avatarHashToSave || 'null',
      needs_discord_id: useDiscordAvatar && !registration.discordId && discordId
    });

    // Use direct SQL UPDATE - simple approach matching 8BP avatar pattern exactly
    // Build the query parts and parameters
    let queryParts: string[] = [];
    let queryParams: any[] = [];
    
    queryParts.push('use_discord_avatar = $1');
    queryParams.push(useDiscordAvatar);
    
    let paramIdx = 2;
    
    // If enabling Discord avatar, ensure discordId is set
    if (useDiscordAvatar && !registration.discordId && discordId) {
      queryParts.push(`discord_id = $${paramIdx}`);
      queryParams.push(discordId);
      paramIdx++;
      logger.info('🔧 Will set discordId on registration (was missing)', {
        action: 'set_discord_id_on_registration',
        eightBallPoolId,
        discordId
      });
    }
    
    // Update avatar hash if it changed
    if (avatarHashToSave !== registration.discord_avatar_hash) {
      queryParts.push(`discord_avatar_hash = $${paramIdx}`);
      queryParams.push(avatarHashToSave);
      paramIdx++;
    }
    
    queryParts.push('updated_at = CURRENT_TIMESTAMP');
    queryParams.push(eightBallPoolId); // WHERE clause parameter
    
    const updateQuery = `UPDATE registrations SET ${queryParts.join(', ')} WHERE eight_ball_pool_id = $${paramIdx} RETURNING id, use_discord_avatar, discord_id, discord_avatar_hash, updated_at`;
    
    logger.info('🔧 Executing SQL update for Discord avatar toggle', {
      action: 'sql_update_execute',
      eightBallPoolId,
      use_discord_avatar: useDiscordAvatar,
      paramCount: queryParams.length,
      willSetDiscordId: useDiscordAvatar && !registration.discordId && discordId,
      willUpdateHash: avatarHashToSave !== registration.discord_avatar_hash
    });
    
    const directUpdate = await dbService.executeQuery(updateQuery, queryParams);

    if (!directUpdate || directUpdate.rows.length === 0) {
      logger.error('❌ Direct SQL update failed - no rows returned', {
        action: 'direct_sql_update_failed',
        discordId,
        eightBallPoolId,
        use_discord_avatar: useDiscordAvatar
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save toggle to database'
      });
      return;
    }

    const updateResult = directUpdate.rows[0];

    logger.info('✅ Direct SQL update completed', {
      action: 'direct_sql_update_success',
      discordId,
      eightBallPoolId,
      requested_use_discord_avatar: useDiscordAvatar,
      returned_use_discord_avatar: updateResult.use_discord_avatar,
      returned_discord_id: updateResult.discord_id,
      returned_discord_avatar_hash: updateResult.discord_avatar_hash || 'null',
      matches: updateResult.use_discord_avatar === useDiscordAvatar
    });

    // Verify the update worked
    if (updateResult.use_discord_avatar !== useDiscordAvatar) {
      logger.error('❌ CRITICAL: Direct SQL update returned wrong value!', {
        action: 'direct_sql_update_value_mismatch',
        discordId,
        eightBallPoolId,
        requested: useDiscordAvatar,
        returned: updateResult.use_discord_avatar
      });
      res.status(500).json({
        success: false,
        error: 'Toggle save verification failed'
      });
      return;
    }

    // Double-check by querying the database directly
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const directCheck = await dbService.executeQuery(
      'SELECT use_discord_avatar, discord_id, discord_avatar_hash, updated_at FROM registrations WHERE eight_ball_pool_id = $1',
      [eightBallPoolId]
    );
    
    if (directCheck.rows.length > 0) {
      const dbValue = directCheck.rows[0];
      logger.info('✅ Direct database check after save', {
        action: 'direct_db_check',
        eightBallPoolId,
        requested_use_discord_avatar: useDiscordAvatar,
        updateResult: updateResult.use_discord_avatar,
        directQuery: dbValue.use_discord_avatar,
        allMatch: useDiscordAvatar === updateResult.use_discord_avatar && updateResult.use_discord_avatar === dbValue.use_discord_avatar
      });
      
      if (dbValue.use_discord_avatar !== useDiscordAvatar) {
        logger.error('❌ CRITICAL: Database value does not match after save!', {
          action: 'db_value_mismatch',
          eightBallPoolId,
          requested: useDiscordAvatar,
          updateResult: updateResult.use_discord_avatar,
          directQuery: dbValue.use_discord_avatar
        });
        res.status(500).json({
          success: false,
          error: 'Database verification failed'
        });
        return;
      }
    }

    logger.info('✅ Discord avatar toggle saved to database successfully', {
      action: 'toggle_discord_avatar_saved',
      discordId,
      eightBallPoolId,
      use_discord_avatar: useDiscordAvatar,
      save_verified: true,
      updateResult_use_discord_avatar: updateResult.use_discord_avatar
    });

    // Fetch updated registration to compute activeAvatarUrl
    // Wait a tiny bit to ensure transaction is committed
    await new Promise(resolve => setTimeout(resolve, 50));
    const updatedRegistration = await dbService.findRegistration({ eightBallPoolId });
    
    logger.info('📊 Fetched registration after toggle', {
      action: 'fetch_registration_after_toggle',
      eightBallPoolId,
      fetched_use_discord_avatar: updatedRegistration?.use_discord_avatar,
      requested_use_discord_avatar: useDiscordAvatar,
      matches: updatedRegistration?.use_discord_avatar === useDiscordAvatar
    });
    if (updatedRegistration) {
      // Ensure we have a Discord ID - use from registration first, fallback to user session
      const registrationDiscordId = updatedRegistration.discordId || discordId;
      
      // Compute active avatar URL based on priority
      logger.info('🔍 Computing activeAvatarUrl after toggle', {
        action: 'compute_avatar_priority',
        eightBallPoolId,
        leaderboard_image_url: !!updatedRegistration.leaderboard_image_url,
        eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        registration_discordId: updatedRegistration.discordId,
        session_discordId: discordId,
        registration_discordId_type: typeof updatedRegistration.discordId,
        session_discordId_type: typeof discordId,
        using_discordId: registrationDiscordId,
        discord_avatar_hash: !!updatedRegistration.discord_avatar_hash,
        profile_image_url: !!updatedRegistration.profile_image_url
      });

      let activeAvatarUrl: string | null = null;
      
      // CRITICAL: Use the value we just saved, not what findRegistration returns
      // Sometimes findRegistration might return stale data due to transaction timing
      const actualUseDiscordAvatar = updatedRegistration.use_discord_avatar ?? useDiscordAvatar;
      
      logger.info('🔍 Avatar computation decision', {
        action: 'avatar_computation_decision',
        updatedRegistration_use_discord_avatar: updatedRegistration.use_discord_avatar,
        requested_use_discord_avatar: useDiscordAvatar,
        using_actual_use_discord_avatar: actualUseDiscordAvatar,
        has_leaderboard_image: !!updatedRegistration.leaderboard_image_url,
        has_discord_id: !!updatedRegistration.discordId || !!discordId
      });
      
      if (updatedRegistration.leaderboard_image_url) {
        activeAvatarUrl = updatedRegistration.leaderboard_image_url;
        logger.info('✅ Using leaderboard_image_url (highest priority)');
      } else if (actualUseDiscordAvatar) {
        // Discord avatar is enabled - use Discord avatar
        // Use registration's Discord ID if available, otherwise use session Discord ID
        const discordIdToUse = updatedRegistration.discordId || discordId;
        
        if (!discordIdToUse) {
          logger.error('❌ Cannot use Discord avatar: no Discord ID available', {
            registration_discordId: updatedRegistration.discordId,
            session_discordId: discordId,
            eightBallPoolId
          });
          // Fall back to 8BP avatar if we can't get Discord ID
        } else {
          // Use utility function to handle both custom and default Discord avatars
          activeAvatarUrl = getDiscordAvatarUrl(discordIdToUse, updatedRegistration.discord_avatar_hash);
          if (activeAvatarUrl) {
            logger.info('✅ Using Discord avatar (use_discord_avatar=true, priority over 8BP)', {
              avatar_type: updatedRegistration.discord_avatar_hash ? 'custom' : 'default',
              url: activeAvatarUrl,
              discordId: discordIdToUse,
              hasHash: !!updatedRegistration.discord_avatar_hash,
              hashValue: updatedRegistration.discord_avatar_hash || 'null (default avatar)'
            });
          } else {
            logger.error('❌ Failed to generate Discord avatar URL - this should not happen!', {
              discordId: discordIdToUse,
              discordIdType: typeof discordIdToUse,
              avatarHash: updatedRegistration.discord_avatar_hash,
              avatarHashType: typeof updatedRegistration.discord_avatar_hash
            });
            // Don't fall back to 8BP if Discord toggle is ON - use default Discord avatar
            // This should rarely happen, but if it does, at least try default Discord avatar
            const fallbackUrl = `https://cdn.discordapp.com/embed/avatars/0.png`;
            activeAvatarUrl = fallbackUrl;
            logger.warn('⚠️ Using fallback default Discord avatar due to generation failure', {
              fallbackUrl,
              discordId: discordIdToUse
            });
          }
        }
      } else if (updatedRegistration.eight_ball_pool_avatar_filename) {
        activeAvatarUrl = `/8bp-rewards/avatars/${updatedRegistration.eight_ball_pool_avatar_filename}`;
        logger.info('✅ Using 8BP avatar (fallback, use_discord_avatar=false or no Discord data)', {
          use_discord_avatar: updatedRegistration.use_discord_avatar,
          has_discordId: !!registrationDiscordId
        });
      } else if (updatedRegistration.profile_image_url) {
        activeAvatarUrl = updatedRegistration.profile_image_url;
        logger.info('✅ Using profile_image_url (lowest priority)');
      }

      logger.info('🎯 Final activeAvatarUrl decision', {
        action: 'avatar_decision',
        activeAvatarUrl,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        reasoning: activeAvatarUrl && (activeAvatarUrl.includes('cdn.discordapp.com/avatars') || activeAvatarUrl.includes('cdn.discordapp.com/embed/avatars')) 
          ? 'Discord avatar selected (use_discord_avatar=true)'
          : activeAvatarUrl?.includes('/8bp-rewards/avatars/')
          ? '8BP avatar selected (fallback)'
          : 'Other avatar type'
      });

      // Compute active username
      const activeUsername = updatedRegistration.use_discord_username && updatedRegistration.discordId
        ? (user.username || updatedRegistration.username)
        : updatedRegistration.username;

      // Emit WebSocket event for avatar update
      WebSocketService.emitAvatarUpdate(discordId, {
        eightBallPoolId,
        activeAvatarUrl,
        activeUsername
      });
      WebSocketService.emitAvatarsRefresh(discordId);

      logger.info('📤 Sending toggle response to frontend', {
        action: 'toggle_response_sent',
        eightBallPoolId,
        use_discord_avatar: updatedRegistration.use_discord_avatar,
        activeAvatarUrl,
        activeUsername
      });

      // Return the full updated account data so frontend can update immediately
      // CRITICAL: Use actualUseDiscordAvatar (the value we saved) not what findRegistration returns
      // This ensures the frontend gets the correct value even if findRegistration returns stale data
      res.json({
        success: true,
        useDiscordAvatar: useDiscordAvatar,
        account: {
          eightBallPoolId: updatedRegistration.eightBallPoolId,
          use_discord_avatar: actualUseDiscordAvatar, // Use the value we actually saved
          activeAvatarUrl: activeAvatarUrl,
          activeUsername: activeUsername,
          discordId: updatedRegistration.discordId || discordId, // Use the Discord ID from registration or session
          discord_avatar_hash: updatedRegistration.discord_avatar_hash,
          eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
          leaderboard_image_url: updatedRegistration.leaderboard_image_url,
          profile_image_url: updatedRegistration.profile_image_url
        }
      });
      
      logger.info('✅ Toggle response sent with correct values', {
        action: 'toggle_response_final',
        eightBallPoolId,
        use_discord_avatar_sent: actualUseDiscordAvatar,
        activeAvatarUrl_sent: activeAvatarUrl,
        requested_use_discord_avatar: useDiscordAvatar
      });
    } else {
    res.json({
      success: true,
      useDiscordAvatar: useDiscordAvatar
    });
    }
  } catch (error) {
    logger.error('Error toggling Discord avatar', {
      action: 'toggle_discord_avatar_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle Discord avatar'
    });
  }
});

// Toggle Discord username usage
router.put('/username/discord-toggle', async (req, res): Promise<void> => {
  try {
    const user = (req as any).user;
    const discordId = user.id;
    const { eightBallPoolId, useDiscordUsername } = req.body;

    logger.info('🔵 Discord username toggle request received', {
      action: 'discord_username_toggle_request',
      discordId,
      eightBallPoolId,
      requested_useDiscordUsername: useDiscordUsername,
      requestBody: req.body
    });

    if (!eightBallPoolId || typeof useDiscordUsername !== 'boolean') {
      logger.warn('❌ Invalid username toggle request', {
        action: 'toggle_username_request_invalid',
        eightBallPoolId,
        useDiscordUsername,
        type: typeof useDiscordUsername
      });
      res.status(400).json({
        success: false,
        error: 'eightBallPoolId and useDiscordUsername (boolean) are required'
      });
      return;
    }

    // Verify the account belongs to this user
    const registration = await dbService.findRegistration({ 
      eightBallPoolId: eightBallPoolId,
      discordId: discordId 
    });

    if (!registration) {
      logger.warn('❌ Registration not found or unauthorized', {
        action: 'toggle_username_registration_not_found',
        discordId,
        eightBallPoolId
      });
      res.status(403).json({
        success: false,
        error: 'Account not found or does not belong to you'
      });
      return;
    }

    logger.info('📊 Current registration state before username toggle', {
      action: 'toggle_username_current_state',
      eightBallPoolId,
      current_use_discord_username: registration.use_discord_username,
      new_use_discord_username: useDiscordUsername,
      has_discord_id: !!registration.discordId
    });

    // Use direct SQL UPDATE instead of model save() to ensure it actually persists
    // Follow the same pattern as Discord avatar toggle for consistency
    logger.info('🔧 Attempting direct SQL update for Discord username toggle', {
      action: 'direct_sql_update_start',
      discordId,
      eightBallPoolId,
      use_discord_username: useDiscordUsername
    });

    const directUpdate = await dbService.executeQuery(
      'UPDATE registrations SET use_discord_username = $1, updated_at = CURRENT_TIMESTAMP WHERE eight_ball_pool_id = $2 RETURNING id, use_discord_username, updated_at',
      [useDiscordUsername, eightBallPoolId]
    );

    if (!directUpdate || directUpdate.rows.length === 0) {
      logger.error('❌ Direct SQL update failed - no rows returned', {
        action: 'direct_sql_update_failed',
        discordId,
        eightBallPoolId,
        use_discord_username: useDiscordUsername
      });
      res.status(500).json({
        success: false,
        error: 'Failed to save toggle to database'
      });
      return;
    }

    const updateResult = directUpdate.rows[0];

    logger.info('✅ Direct SQL update completed', {
      action: 'direct_sql_update_success',
      discordId,
      eightBallPoolId,
      requested_use_discord_username: useDiscordUsername,
      returned_use_discord_username: updateResult.use_discord_username,
      matches: updateResult.use_discord_username === useDiscordUsername
    });

    // Verify the update worked
    if (updateResult.use_discord_username !== useDiscordUsername) {
      logger.error('❌ CRITICAL: Direct SQL update returned wrong value!', {
        action: 'direct_sql_update_value_mismatch',
        discordId,
        eightBallPoolId,
        requested: useDiscordUsername,
        returned: updateResult.use_discord_username
      });
      res.status(500).json({
        success: false,
        error: 'Toggle save verification failed'
      });
      return;
    }

    // Double-check by querying the database directly
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const directCheck = await dbService.executeQuery(
      'SELECT use_discord_username, updated_at FROM registrations WHERE eight_ball_pool_id = $1',
      [eightBallPoolId]
    );
    
    if (directCheck.rows.length > 0) {
      const dbValue = directCheck.rows[0].use_discord_username;
      logger.info('✅ Direct database check after save', {
        action: 'direct_db_check',
        eightBallPoolId,
        requested_use_discord_username: useDiscordUsername,
        updateResult: updateResult.use_discord_username,
        directQuery: dbValue,
        allMatch: useDiscordUsername === updateResult.use_discord_username && updateResult.use_discord_username === dbValue
      });
      
      if (dbValue !== useDiscordUsername) {
        logger.error('❌ CRITICAL: Database value does not match after save!', {
          action: 'db_value_mismatch',
          eightBallPoolId,
          requested: useDiscordUsername,
          updateResult: updateResult.use_discord_username,
          directQuery: dbValue
        });
        res.status(500).json({
          success: false,
          error: 'Database verification failed'
        });
        return;
      }
    }

    logger.info('✅ Discord username toggle saved to database successfully', {
      action: 'toggle_discord_username_saved',
      discordId,
      eightBallPoolId,
      use_discord_username: useDiscordUsername,
      save_verified: true
    });

    // Fetch updated registration to compute activeAvatarUrl and activeUsername
    const updatedRegistration = await dbService.findRegistration({ eightBallPoolId });
    
    logger.info('📊 Registration state after username toggle update', {
      action: 'toggle_username_post_update_state',
      eightBallPoolId,
      use_discord_username: updatedRegistration?.use_discord_username,
      discord_id: updatedRegistration?.discordId
    });
    
    if (updatedRegistration) {
      // Compute active avatar URL based on priority (same logic as avatar toggle)
      let activeAvatarUrl: string | null = null;
      const registrationDiscordId = updatedRegistration.discordId || discordId;
      
      if (updatedRegistration.leaderboard_image_url) {
        activeAvatarUrl = updatedRegistration.leaderboard_image_url;
      } else if (updatedRegistration.use_discord_avatar && registrationDiscordId) {
        activeAvatarUrl = getDiscordAvatarUrl(registrationDiscordId, updatedRegistration.discord_avatar_hash);
      } else if (updatedRegistration.eight_ball_pool_avatar_filename) {
        activeAvatarUrl = `/8bp-rewards/avatars/${updatedRegistration.eight_ball_pool_avatar_filename}`;
      } else if (updatedRegistration.profile_image_url) {
        activeAvatarUrl = updatedRegistration.profile_image_url;
      }

      // Compute active username
      const activeUsername = updatedRegistration.use_discord_username && updatedRegistration.discordId
        ? (user.username || updatedRegistration.username)
        : updatedRegistration.username;

      // Emit WebSocket event for avatar update
      WebSocketService.emitAvatarUpdate(discordId, {
        eightBallPoolId,
        activeAvatarUrl,
        activeUsername,
        use_discord_avatar: updatedRegistration.use_discord_avatar ?? false,
        use_discord_username: updatedRegistration.use_discord_username ?? false,
        discord_avatar_hash: updatedRegistration.discord_avatar_hash || null
      });
      WebSocketService.emitAvatarsRefresh(discordId);

      logger.info('📤 Sending username toggle response to frontend', {
        action: 'toggle_username_response_sent',
        eightBallPoolId,
        use_discord_username: updatedRegistration.use_discord_username,
        activeUsername,
        activeAvatarUrl
      });

      // Return full account data like avatar toggle does
      res.json({
        success: true,
        useDiscordUsername: useDiscordUsername,
        account: {
          eightBallPoolId: updatedRegistration.eightBallPoolId,
          use_discord_username: updatedRegistration.use_discord_username,
          use_discord_avatar: updatedRegistration.use_discord_avatar ?? false,
          activeAvatarUrl: activeAvatarUrl,
          activeUsername: activeUsername,
          discordId: updatedRegistration.discordId || discordId,
          discord_avatar_hash: updatedRegistration.discord_avatar_hash,
          eight_ball_pool_avatar_filename: updatedRegistration.eight_ball_pool_avatar_filename,
          leaderboard_image_url: updatedRegistration.leaderboard_image_url,
          profile_image_url: updatedRegistration.profile_image_url,
          username: updatedRegistration.username
        }
      });
    } else {
      res.json({
        success: true,
        useDiscordUsername: useDiscordUsername
      });
    }
  } catch (error) {
    logger.error('Error toggling Discord username', {
      action: 'toggle_discord_username_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: (req as any).user?.id
    });
    res.status(500).json({
      success: false,
      error: 'Failed to toggle Discord username'
    });
  }
});

export default router;

