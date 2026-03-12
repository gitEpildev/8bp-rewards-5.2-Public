import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './LoggerService';

const execAsync = promisify(exec);
import { DatabaseService } from './DatabaseService';
import ValidationService from './ValidationService';
const DiscordService = require('../../../../services/discord-service');
const dbService = DatabaseService.getInstance();

// TypeScript interface for the claimer module
interface ClaimerResult {
  success: boolean;
  claimedItems?: string[];
  error?: string;
  screenshotPath?: string;
  alreadyClaimed?: boolean;
}

interface ClaimerModule {
  new (): {
    claimRewardsForUser(userId: string): Promise<ClaimerResult>;
  };
}

interface ClaimResult {
  eightBallPoolId: string;
  websiteUserId: string;
  status: 'success' | 'failed' | 'duplicate' | 'module_error';
  itemsClaimed?: string[];
  error?: string;
  errorType?: 'module_load' | 'claim_execution' | 'duplicate' | 'unknown';
}

interface SchedulerSummary {
  timestampUTC: string;
  totalAttempted: number;
  totalSucceeded: number;
  totalFailed: number;
  totalDuplicates: number;
  totalModuleErrors: number;
  perUser: ClaimResult[];
}

class SchedulerService {
  private discordService: any;
  private validationService: ValidationService;
  private isRunning: boolean = false;
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;
  private claimerModule: ClaimerModule | null = null;
  private moduleLoadErrorCount: number = 0;
  private lastModuleErrorAlert: Date | null = null;

  constructor() {
    this.discordService = new DiscordService();
    this.validationService = new ValidationService();
    this.setupScheduler();
  }

  private setupScheduler(): void {
    // Schedule runs at 00:00, 06:00, 12:00, 18:00 UTC
    const cronExpression = '0 0,6,12,18 * * *';
    
    cron.schedule(cronExpression, async () => {
      await this.runScheduledClaim();
    }, {
      timezone: 'UTC'
    });

    // Daily screenshot cleanup at 02:00 UTC (proof screenshots and verification-bot dir)
    cron.schedule('0 2 * * *', async () => {
      await this.runScreenshotCleanup();
    }, {
      timezone: 'UTC'
    });

    // Calculate next run time
    this.calculateNextRun();
    
    logger.info('Scheduler initialized', {
      action: 'scheduler_init',
      schedule: '00:00, 06:00, 12:00, 18:00 UTC',
      screenshotCleanup: '02:00 UTC daily',
      nextRun: this.nextRun?.toISOString()
    });
  }

  /**
   * Run daily screenshot cleanup script (backend + verification-bot proof screenshots).
   * Uses scripts/cleanup-old-screenshots.sh; RETENTION_DAYS and VERIFICATION_SCREENSHOT_RETENTION_DAYS from env.
   */
  private async runScreenshotCleanup(): Promise<void> {
    const scriptName = 'cleanup-old-screenshots.sh';
    const possiblePaths = [
      path.join(process.cwd(), 'scripts', scriptName),
      path.join(process.cwd(), '..', 'scripts', scriptName),
      path.resolve(__dirname, '../../../../scripts', scriptName)
    ];
    let scriptPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        scriptPath = p;
        break;
      }
    }
    if (!scriptPath) {
      logger.warn('Screenshot cleanup script not found, skipping', {
        action: 'screenshot_cleanup_skip',
        tried: possiblePaths,
        cwd: process.cwd()
      });
      return;
    }
    try {
      const { stdout, stderr } = await execAsync(`bash "${scriptPath}"`, {
        timeout: 300000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          RETENTION_DAYS: process.env.RETENTION_DAYS || '30',
          VERIFICATION_SCREENSHOT_RETENTION_DAYS: process.env.VERIFICATION_SCREENSHOT_RETENTION_DAYS || '7'
        }
      });
      if (stdout) logger.info('Screenshot cleanup stdout', { action: 'screenshot_cleanup_stdout', stdout: stdout.slice(0, 500) });
      if (stderr) logger.warn('Screenshot cleanup stderr', { action: 'screenshot_cleanup_stderr', stderr: stderr.slice(0, 500) });
      logger.info('Screenshot cleanup completed', { action: 'screenshot_cleanup_done', scriptPath });
    } catch (err: any) {
      logger.error('Screenshot cleanup failed', {
        action: 'screenshot_cleanup_error',
        error: err?.message ?? String(err),
        scriptPath
      });
    }
  }

  private calculateNextRun(): void {
    const now = new Date();
    const utcHours = [0, 6, 12, 18]; // Scheduled hours in UTC
    
    let nextRun = new Date(now);
    nextRun.setUTCHours(0, 0, 0, 0); // Start from midnight UTC
    
    // Find next scheduled hour
    for (const hour of utcHours) {
      const scheduledTime = new Date(now);
      scheduledTime.setUTCHours(hour, 0, 0, 0);
      
      if (scheduledTime > now) {
        nextRun = scheduledTime;
        break;
      }
    }
    
    // If no time found today, set to midnight tomorrow
    if (nextRun <= now) {
      nextRun = new Date(now);
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      nextRun.setUTCHours(0, 0, 0, 0);
    }
    
    this.nextRun = nextRun;
  }

  public async runScheduledClaim(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Scheduler run already in progress, skipping', {
        action: 'scheduler_skip'
      });
      return;
    }

    this.isRunning = true;
    this.lastRun = new Date();
    
    logger.info('Starting scheduled claim run', {
      action: 'scheduler_start',
      timestamp: this.lastRun.toISOString()
    });

    try {
      // Get all registered users
      const registrations = await dbService.findRegistrations();
      
      if (registrations.length === 0) {
        logger.info('No registered users found for scheduled claim', {
          action: 'scheduler_no_users'
        });
        return;
      }

      const results: ClaimResult[] = [];
      
      // Process each user
      for (const registration of registrations) {
        try {
          // VALIDATION CHECK: Validate user before processing
          logger.info(`Validating user ${registration.eightBallPoolId} before scheduled claim`, {
            action: 'scheduler_validation',
            eightBallPoolId: registration.eightBallPoolId
          });
          
          const validationResult = await this.validationService.validateUser(
            registration.eightBallPoolId, 
            'scheduler-service', 
            {
              operation: 'scheduled_claim',
              timestamp: new Date().toISOString()
            }
          );
          
          if (!validationResult.isValid) {
            logger.warn(`User ${registration.eightBallPoolId} failed validation, skipping scheduled claim`, {
              action: 'scheduler_validation_failed',
              eightBallPoolId: registration.eightBallPoolId,
              websiteUserId: registration.username,
              reason: validationResult.reason,
              error: validationResult.error,
              correlationId: validationResult.correlationId
            });
            
            // Don't add validation failures to results - validation failures shouldn't count as failed claims
            // Invalid users are already handled by ValidationService (deregistered, logged, moved to invalid_users table)
            // Validation failures are tracked in validation_logs, not as claim failures
            // Continue to next user without attempting claim
            continue;
          }
          
          logger.info(`User ${registration.eightBallPoolId} validation passed, proceeding with claim`, {
            action: 'scheduler_validation_success',
            eightBallPoolId: registration.eightBallPoolId
          });
          
          const result = await this.claimRewardsForUser(registration);
          results.push(result);
          
          // Log the claim record (only for actual claim attempts, not validation failures)
          await this.logClaimRecord(registration, result);
          
        } catch (error: any) {
          logger.error('Failed to claim rewards for user', {
            action: 'scheduler_user_error',
            eightBallPoolId: registration.eightBallPoolId,
            error: error.message
          });
          
          // Create failed result and log it as a claim record
          const failedResult: ClaimResult = {
            eightBallPoolId: registration.eightBallPoolId,
            websiteUserId: registration.username,
            status: 'failed',
            error: error.message
          };
          
          results.push(failedResult);
          
          // Log the failed claim record
          await this.logClaimRecord(registration, failedResult);
        }
      }

      // Create summary with enhanced error context
      // Only count legitimate successes and failures (exclude duplicates and module errors)
      const legitimateResults = results.filter(r => r.status === 'success' || r.status === 'failed');
      const summary: SchedulerSummary = {
        timestampUTC: this.lastRun.toISOString(),
        totalAttempted: legitimateResults.length,
        totalSucceeded: legitimateResults.filter(r => r.status === 'success').length,
        totalFailed: legitimateResults.filter(r => r.status === 'failed').length,
        totalDuplicates: results.filter(r => r.status === 'duplicate').length,
        totalModuleErrors: results.filter(r => r.status === 'module_error').length,
        perUser: results
      };

      // Log summary with enhanced context
      logger.logSchedulerRun(summary.totalAttempted, summary.totalSucceeded, summary.totalFailed);
      
      logger.info('Scheduler run summary with error breakdown', {
        action: 'scheduler_summary_detailed',
        ...summary
      });

      // Send Discord notification
      await this.discordService.sendSchedulerSummary(summary);

      // Send failure notifications if there were failures
      if (summary.totalFailed > 0) {
        const failureMessage = `Scheduler run completed with ${summary.totalFailed} failures out of ${summary.totalAttempted} attempts`;
        await this.discordService.sendFailureNotification(failureMessage);
      }

      // Alert on module errors (infrastructure issue)
      if (summary.totalModuleErrors > 0) {
        await this.handleModuleErrors(summary.totalModuleErrors, results.filter(r => r.status === 'module_error'));
      }

      logger.info('Scheduled claim run completed', {
        action: 'scheduler_complete',
        summary
      });

    } catch (error: any) {
      logger.error('Scheduled claim run failed', {
        action: 'scheduler_error',
        error: error.message
      });

      // Send failure notification
      await this.discordService.sendFailureNotification(
        `Scheduler run failed: ${error.message}`
      );
    } finally {
      this.isRunning = false;
      this.calculateNextRun();
    }
  }

  /**
   * Get the claimer module path with fallback options
   */
  private getClaimerModulePath(): string | null {
    // Try environment variable first
    const envPath = process.env.CLAIMER_MODULE_PATH;
    if (envPath) {
      const resolvedPath = path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath);
      if (fs.existsSync(resolvedPath) || fs.existsSync(`${resolvedPath}.js`)) {
        return resolvedPath;
      }
    }

    // Try multiple fallback paths
    const possiblePaths = [
      path.resolve(process.cwd(), 'playwright-claimer-discord'),
      path.resolve(process.cwd(), 'playwright-claimer-discord.js'),
      // For compiled code in dist folder
      path.resolve(__dirname, '../../../../playwright-claimer-discord'),
      path.resolve(__dirname, '../../../../playwright-claimer-discord.js'),
      // Fallback for different deployment structures
      path.resolve(process.cwd(), '../playwright-claimer-discord'),
      path.resolve(process.cwd(), '../playwright-claimer-discord.js'),
    ];

    for (const modulePath of possiblePaths) {
      if (fs.existsSync(modulePath) || fs.existsSync(`${modulePath}.js`)) {
        return fs.existsSync(modulePath) ? modulePath : `${modulePath}.js`;
      }
    }

    return null;
  }

  /**
   * Load the claimer module with caching and fallback paths
   */
  private async loadClaimerModule(): Promise<ClaimerModule> {
    // Return cached module if available
    if (this.claimerModule) {
      return this.claimerModule;
    }

    const modulePath = this.getClaimerModulePath();
    
    if (!modulePath) {
      const errorMessage = 'Could not find playwright-claimer-discord module in any expected location';
      logger.error('Failed to locate claimer module', {
        action: 'scheduler_module_path_not_found',
        attemptedPaths: [
          path.resolve(process.cwd(), 'playwright-claimer-discord'),
          path.resolve(__dirname, '../../../../playwright-claimer-discord'),
        ],
        cwd: process.cwd(),
        __dirname: __dirname
      });
      throw new Error(errorMessage);
    }

    // Verify file exists before requiring
    if (!fs.existsSync(modulePath) && !fs.existsSync(`${modulePath}.js`)) {
      const errorMessage = `Claimer module file not found at: ${modulePath}`;
      logger.error('Claimer module file does not exist', {
        action: 'scheduler_module_file_not_found',
        path: modulePath,
        cwd: process.cwd()
      });
      throw new Error(errorMessage);
    }

    try {
      const resolvedPath = fs.existsSync(modulePath) ? modulePath : `${modulePath}.js`;
      const EightBallPoolClaimer = require(resolvedPath);
      
      // Cache the module for future use
      this.claimerModule = EightBallPoolClaimer;
      
      logger.info('Claimer module loaded successfully', {
        action: 'scheduler_module_loaded',
        path: resolvedPath
      });
      
      return EightBallPoolClaimer;
    } catch (moduleError: any) {
      // Clear cache on error to allow retry
      this.claimerModule = null;
      
      logger.error('Failed to load playwright-claimer-discord module', {
        action: 'scheduler_module_load_error',
        error: moduleError.message,
        attemptedPath: modulePath,
        cwd: process.cwd(),
        stack: moduleError.stack
      });
      
      throw moduleError;
    }
  }

  private async claimRewardsForUser(registration: any): Promise<ClaimResult> {
    try {
      // STEP 1: Check for duplicate claims BEFORE attempting module load
      // This prevents unnecessary module loads and false failure logging
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      const existingClaims = await dbService.findClaimRecords({
        eightBallPoolId: registration.eightBallPoolId,
        status: 'success',
        claimedAt: { $gte: today }
      });

      // If user already has successful claim today, return early as duplicate (not failure)
      if (existingClaims.length > 0) {
        logger.info('Scheduler skipping duplicate claim - user already claimed successfully today', {
          action: 'scheduler_skip_duplicate_pre_check',
          eightBallPoolId: registration.eightBallPoolId,
          existingClaimTime: existingClaims[0].claimedAt
        });
        
        return {
          eightBallPoolId: registration.eightBallPoolId,
          websiteUserId: registration.username,
          status: 'duplicate',
          errorType: 'duplicate',
          error: `User already has successful claim today at ${existingClaims[0].claimedAt}`
        };
      }

      // STEP 2: Load the claimer module using cached loader with fallback paths
      let EightBallPoolClaimer: ClaimerModule;
      try {
        EightBallPoolClaimer = await this.loadClaimerModule();
      } catch (moduleError: any) {
        // Increment module error count for alerting
        this.moduleLoadErrorCount++;
        
        return {
          eightBallPoolId: registration.eightBallPoolId,
          websiteUserId: registration.username,
          status: 'module_error',
          errorType: 'module_load',
          error: `Module load error: ${moduleError.message}`
        };
      }

      // STEP 3: Execute the claim
      const claimer = new EightBallPoolClaimer();
      const result = await claimer.claimRewardsForUser(registration.eightBallPoolId);
      
      return {
        eightBallPoolId: registration.eightBallPoolId,
        websiteUserId: registration.username,
        status: result.success ? 'success' : 'failed',
        itemsClaimed: result.success ? result.claimedItems : undefined,
        error: result.success ? undefined : result.error,
        errorType: result.success ? undefined : 'claim_execution'
      };

    } catch (error: any) {
      // Catch-all for any unexpected errors during claim execution
      logger.error('Unexpected error during claim execution', {
        action: 'scheduler_claim_execution_error',
        eightBallPoolId: registration.eightBallPoolId,
        error: error.message,
        stack: error.stack
      });
      
      return {
        eightBallPoolId: registration.eightBallPoolId,
        websiteUserId: registration.username,
        status: 'failed',
        errorType: 'claim_execution',
        error: error.message
      };
    }
  }

  /**
   * Handle module errors and send alerts if threshold exceeded
   */
  private async handleModuleErrors(errorCount: number, errorResults: ClaimResult[]): Promise<void> {
    // Alert if module errors occurred (infrastructure issue)
    const now = new Date();
    const shouldAlert = !this.lastModuleErrorAlert || 
      (now.getTime() - this.lastModuleErrorAlert.getTime()) > 10 * 60 * 1000; // 10 minute cooldown

    if (shouldAlert && errorCount > 0) {
      const uniqueErrors = new Set(errorResults.map(r => r.error).filter(Boolean));
      const errorDetails = Array.from(uniqueErrors).slice(0, 3).join('; ');
      
      const alertMessage = `🚨 Scheduler Module Error Alert\n\n` +
        `Module load errors detected: ${errorCount}\n` +
        `This indicates an infrastructure issue (module not found or cannot be loaded).\n` +
        `Errors: ${errorDetails}${uniqueErrors.size > 3 ? '...' : ''}\n\n` +
        `Please check:\n` +
        `- Module file exists at expected location\n` +
        `- File permissions are correct\n` +
        `- Build/deployment process completed successfully`;

      await this.discordService.sendFailureNotification(alertMessage);
      
      this.lastModuleErrorAlert = now;
      
      logger.error('Module errors detected - alert sent', {
        action: 'scheduler_module_error_alert',
        errorCount,
        uniqueErrorCount: uniqueErrors.size
      });
    }

    // Log module errors for monitoring
    logger.warn('Module errors in scheduler run', {
      action: 'scheduler_module_errors_summary',
      errorCount,
      totalModuleErrors: this.moduleLoadErrorCount
    });
  }

  private async logClaimRecord(registration: any, result: ClaimResult): Promise<void> {
    try {
      // Never log duplicate status - these are detected before claim attempt
      if (result.status === 'duplicate') {
        logger.info('Scheduler skipping duplicate claim record (detected pre-check)', {
          action: 'scheduler_skip_duplicate_logged',
          eightBallPoolId: registration.eightBallPoolId
        });
        return;
      }

      // Check if this user already has a successful claim today
      // This is a safety check in case duplicate detection was missed
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      const existingClaims = await dbService.findClaimRecords({
        eightBallPoolId: registration.eightBallPoolId,
        status: 'success',
        claimedAt: { $gte: today }
      });

      // If already claimed successfully today, skip saving duplicates
      if (existingClaims.length > 0 && result.status === 'success') {
        logger.info('Scheduler skipping duplicate claim record', {
          action: 'scheduler_skip_duplicate',
          eightBallPoolId: registration.eightBallPoolId,
          existingClaimTime: existingClaims[0].claimedAt
        });
        return;
      }

      // If user already has a successful claim today, don't save failed claims or module errors
      // (they already claimed, not a real failure)
      if (existingClaims.length > 0 && (result.status === 'failed' || result.status === 'module_error')) {
        logger.info('Scheduler skipping failed/module error claim - user already has successful claim today', {
          action: 'scheduler_skip_failed_already_claimed',
          eightBallPoolId: registration.eightBallPoolId,
          status: result.status,
          errorType: result.errorType,
          existingClaimTime: existingClaims[0].claimedAt
        });
        return;
      }

      // Don't log module errors as failed claims - these are infrastructure issues, not claim failures
      // Only log them for debugging purposes, but don't count them in leaderboard stats
      if (result.status === 'module_error') {
        logger.warn('Scheduler skipping module error - not logging as failed claim', {
          action: 'scheduler_skip_module_error',
          eightBallPoolId: registration.eightBallPoolId,
          error: result.error,
          errorType: result.errorType
        });
        return;
      }

      // Only log legitimate success or failure claims (not duplicates, not module errors)
      // Map status to database-compatible status ('success' or 'failed')
      const dbStatus = result.status === 'success' ? 'success' : 'failed';
      
      const claimData = {
        eightBallPoolId: registration.eightBallPoolId,
        websiteUserId: registration.username,
        status: dbStatus,
        itemsClaimed: result.itemsClaimed || [],
        error: result.error,
        claimedAt: new Date(),
        schedulerRun: this.lastRun!
      };
      
      logger.info('Scheduler saving claim record', {
        action: 'scheduler_save_claim_record',
        eightBallPoolId: registration.eightBallPoolId,
        status: claimData.status,
        itemsCount: claimData.itemsClaimed.length,
        success: result.status === 'success',
        errorType: result.errorType
      });
      
      await dbService.createClaimRecord(claimData);
      
      logger.info('Scheduler claim record saved', {
        action: 'scheduler_claim_record_saved',
        eightBallPoolId: registration.eightBallPoolId,
        status: claimData.status
      });
    } catch (error: any) {
      logger.error('Failed to log claim record', {
        action: 'log_claim_record_error',
        eightBallPoolId: registration.eightBallPoolId,
        error: error.message
      });
    }
  }

  public getStatus(): any {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun?.toISOString(),
      nextRun: this.nextRun?.toISOString(),
      schedule: '00:00, 06:00, 12:00, 18:00 UTC',
      timezone: 'UTC',
      moduleLoaded: this.claimerModule !== null,
      moduleLoadErrors: this.moduleLoadErrorCount
    };
  }

  /**
   * Clear module cache (useful for testing or after module updates)
   */
  public clearModuleCache(): void {
    this.claimerModule = null;
    logger.info('Claimer module cache cleared', {
      action: 'scheduler_module_cache_cleared'
    });
  }

  public async triggerManualRun(): Promise<void> {
    logger.info('Manual scheduler run triggered', {
      action: 'manual_scheduler_trigger'
    });
    
    await this.runScheduledClaim();
  }
}

export default SchedulerService;


