const { chromium } = require('playwright');
const fs = require('fs');
const dotenv = require('dotenv');
const cron = require('node-cron');
const DiscordService = require('./services/discord-service');
const DatabaseService = require('./services/database-service');
const { validateClaimResult, shouldSkipButtonForCounting, shouldClickButton, isButtonAlreadyClaimed } = require('./claimer-utils');
const BrowserPool = require('./browser-pool');

// ImageGenerator is optional
let ImageGenerator;
try {
  ImageGenerator = require('./services/image-generator');
} catch (error) {
  console.log('ℹ️ ImageGenerator not available - screenshots will be used instead');
  ImageGenerator = null;
}

// Load environment variables
dotenv.config();

const dbService = DatabaseService.getInstance();

class EightBallPoolClaimer {
  constructor() {
    this.discordService = new DiscordService();
    this.imageGenerator = ImageGenerator ? new ImageGenerator() : null;
    this.shopUrl = process.env.SHOP_URL || 'https://8ballpool.com/en/shop';
    this.dailyRewardUrl = 'https://8ballpool.com/en/shop#daily_reward';
    this.freeDailyCueUrl = 'https://8ballpool.com/en/shop#free_daily_cue_piece';
    this.userIds = []; // Will be populated in initialize()
    this.delayBetweenUsers = parseInt(process.env.DELAY_BETWEEN_USERS || '5000', 10);
    this.timeout = parseInt(process.env.TIMEOUT || '20000', 10);
    this.headless = process.env.HEADLESS !== 'false';
    this.dbConnected = false;
    this.browserPool = new BrowserPool(10); // Max 10 concurrent browsers
    
    // Check and create screenshot directories with proper permissions
    this.initializeScreenshotDirectories();
  }

  // Initialize screenshot directories with proper permissions
  initializeScreenshotDirectories() {
    const directories = [
      'screenshots',
      'screenshots/shop-page',
      'screenshots/login',
      'screenshots/final-page',
      'screenshots/id-entry',
      'screenshots/go-click',
      'screenshots/confirmation'
    ];

    directories.forEach(dir => {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
          console.log(`📁 Created screenshot directory: ${dir}`);
        } else {
          // Check if we can write to the directory
          try {
            const testFile = `${dir}/test-write.tmp`;
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`✅ Screenshot directory ${dir} is writable`);
          } catch (error) {
            console.warn(`⚠️ Screenshot directory ${dir} may have permission issues: ${error.message}`);
          }
        }
      } catch (error) {
        console.warn(`⚠️ Failed to initialize screenshot directory ${dir}: ${error.message}`);
      }
    });
  }

  async connectToDatabase() {
    if (this.dbConnected) return true;
    
    try {
      await dbService.connect();
      this.dbConnected = true;
      console.log('✅ Connected to database for claim records');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      return false;
    }
  }

  // Helper function to safely take screenshots with error handling
  async takeScreenshot(page, path, description) {
    try {
      // Ensure directory exists
      const dir = path.substring(0, path.lastIndexOf('/'));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
      
      await page.screenshot({ path });
      console.log(`📸 ${description}: ${path}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Screenshot failed for ${description}: ${error.message}`);
      console.warn(`⚠️ This won't affect the claim process - continuing without screenshot`);
      return false;
    }
  }

  async saveClaimRecord(userId, claimedItems, success, error = null, screenshotPath = null) {
    if (!this.dbConnected) {
      console.log('⚠️ Database not connected - skipping claim record save');
      return { saved: false, reason: 'no_db' };
    }

    try {
      // LAYER 1: Check if this user already has a successful claim today
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      
      console.log(`🔍 Checking for duplicates - user: ${userId}, today: ${today.toISOString()}`);
      
      const existingClaims = await dbService.findClaimRecords({
        eightBallPoolId: userId,
        status: 'success',
        claimedAt: { $gte: today }
      });

      console.log(`🔍 Found ${existingClaims.length} existing claims for user ${userId} today`);

      // If already claimed successfully today, skip saving
      if (existingClaims.length > 0 && success) {
        console.log(`⏭️ Duplicate prevented (DB check) - user ${userId} already claimed today at ${existingClaims[0].claimedAt.toLocaleTimeString()}`);
        return { saved: false, reason: 'duplicate', existingClaim: existingClaims[0] };
      }

      // If user already has a successful claim today, don't save failed claims (they already claimed, not a real failure)
      if (existingClaims.length > 0 && !success) {
        console.log(`⏭️ Skipping failed claim save - user ${userId} already has successful claim today at ${existingClaims[0].claimedAt.toLocaleTimeString()} (not a real failure)`);
        return { saved: false, reason: 'already_claimed_today', existingClaim: existingClaims[0] };
      }

      // Create claim record using DatabaseService with screenshot path in metadata
      const claimData = {
        eightBallPoolId: userId,
        websiteUserId: userId, // Use the same ID for both fields
        status: success ? 'success' : 'failed',
        itemsClaimed: claimedItems || [],
        error: error,
        claimedAt: new Date(),
        schedulerRun: new Date(),
        metadata: {
          screenshotPath: screenshotPath || null,
          confirmationImagePath: screenshotPath || null, // Also store as confirmationImagePath for compatibility
          timestamp: new Date().toISOString()
        }
      };
      
      console.log(`💾 Saving claim record for user ${userId}:`, {
        status: claimData.status,
        itemsCount: claimData.itemsClaimed.length,
        success: success,
        hasScreenshot: !!screenshotPath
      });
      
      await dbService.createClaimRecord(claimData);

      console.log(`💾 Saved claim record to database for user ${userId} with status: ${claimData.status}`);
      return { saved: true };
    } catch (error) {
      console.error(`❌ Failed to save claim record for ${userId}:`, error.message);
      return { saved: false, reason: 'error', error: error.message };
    }
  }

  async ensureScreenshotDirectories() {
    try {
      const fs = require('fs');
      const path = require('path');

      const directories = [
        'screenshots',
        'screenshots/shop-page',
        'screenshots/login',
        'screenshots/id-entry',
        'screenshots/go-click',
        'screenshots/final-page'
      ];

      for (const dir of directories) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`📁 Created directory: ${dir}`);
        }
      }
    } catch (error) {
      console.error('❌ Error creating screenshot directories:', error.message);
    }
  }

  async cleanupOldScreenshots() {
    try {
      const fs = require('fs');
      const path = require('path');
      const projectRoot = path.join(__dirname);
      
      console.log('🧹 Cleaning up old screenshot files...');
      
      // Get all PNG files in the project root
      const files = fs.readdirSync(projectRoot);
      const pngFiles = files.filter(file => file.endsWith('.png'));
      
      const oneHourAgo = Date.now() - (60 * 60 * 1000); // 1 hour in milliseconds
      let deletedCount = 0;
      
      for (const file of pngFiles) {
        const filePath = path.join(projectRoot, file);
        try {
          const stats = fs.statSync(filePath);
          
          // Delete if older than 1 hour
          if (stats.mtimeMs < oneHourAgo) {
            fs.unlinkSync(filePath);
            deletedCount++;
          }
        } catch (err) {
          // Skip files we can't access
        }
      }
      
      console.log(`🧹 Cleaned up ${deletedCount} old screenshot files (older than 1 hour)`);
    } catch (error) {
      console.error('❌ Error cleaning up screenshots:', error.message);
    }
  }

  async getUserIdList() {
    try {
      // Check if specific users are targeted via environment variable
      const targetUserIds = process.env.TARGET_USER_IDS;
      if (targetUserIds) {
        const userIds = targetUserIds.split(',').map(id => id.trim()).filter(id => id);
        console.log(`🎯 Running targeted claim for ${userIds.length} specific users`);
        console.log(`👥 Target Users: ${userIds.join(', ')}`);
        return userIds;
      }

      // First try to get users from database
      const registrations = await dbService.findRegistrations();
      if (registrations && registrations.length > 0) {
        const userIds = registrations.map(reg => reg.eightBallPoolId).filter(id => id);
        console.log(`📊 Found ${userIds.length} users in database`);
        return userIds;
      }
    } catch (error) {
      console.log('⚠️ Could not fetch users from database, falling back to env vars');
    }
    
    // Fallback to environment variables
    const userIds = process.env.USER_IDS;
    const singleUserId = process.env.USER_ID;
    
    if (userIds) {
      return userIds.split(',').map(id => id.trim()).filter(id => id.length > 0);
    } else if (singleUserId) {
      return [singleUserId.trim()];
    } else {
      return ['1826254746']; // Default fallback
    }
  }

  async initializeDiscord() {
    console.log('🤖 Initializing Discord service...');
    const discordReady = await this.discordService.login();
    if (discordReady) {
      console.log('✅ Discord service ready');
    } else {
      console.log('⚠️ Discord service unavailable - confirmations will be skipped');
    }
    return discordReady;
  }

  async claimRewardsForUser(userId) {
    console.log(`🚀 Starting claim process for User ID: ${userId}`);
    
    // Wait for browser pool slot
    console.log(`⏳ Waiting for browser slot... (${this.browserPool.getStatus().activeBrowsers}/${this.browserPool.getStatus().maxConcurrent} active)`);
    await this.browserPool.acquire();
    console.log(`✅ Browser slot acquired for user ${userId}`);
    
    // Ensure screenshot directories exist
    await this.ensureScreenshotDirectories();
    
    // Ensure database connection
    if (!this.dbConnected) {
      await this.connectToDatabase();
    }
    
    let browser = null;
    let page = null;
    let claimedItems = [];
    let screenshotPath = null;

    try {
      // Launch browser
      console.log('🌐 Launching browser...');
      
      // Set executable path for Playwright Chromium
      // Prefer regular chromium over headless_shell for better compatibility
      const chromiumPath = process.env.CHROMIUM_PATH || '/ms-playwright/chromium-1193/chrome-linux/chrome';
      
      const launchOptions = {
        headless: this.headless,
        executablePath: chromiumPath, // Explicitly set chromium path
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ]
      };

      // Add slowMo for non-headless mode (development)
      if (!this.headless) {
        launchOptions.slowMo = 1000;
      }

      browser = await chromium.launch(launchOptions);
      page = await browser.newPage();
      console.log('📄 Created new page');

      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'sec-ch-ua': '"Google Chrome";v="119", "Chromium";v="119", "Not?A_Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
      });

      // Navigate to Daily Reward section FIRST
      console.log(`🌐 Navigating to Daily Reward section: ${this.dailyRewardUrl}`);
      await page.goto(this.dailyRewardUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: this.timeout 
      });
      console.log('✅ Successfully loaded Daily Reward page');

      // Take initial screenshot
      await this.takeScreenshot(page, `screenshots/shop-page/shop-page-${userId}.png`, 'Initial shop page');

      // Look for login modal
      console.log('🔍 Looking for login modal...');
      await this.handleLogin(page, userId);

      // Wait for login to complete
      await page.waitForTimeout(1000);

      // Take screenshot after login
      await this.takeScreenshot(page, `screenshots/login/after-login-${userId}.png`, 'After login');

      // Check for FREE buttons in Daily Reward section
      console.log('🎁 Checking Daily Reward section for FREE items...');
      let dailyItems = await this.claimFreeItems(page, userId);
      
      // Check if all items were already claimed
      if (dailyItems && typeof dailyItems === 'object' && dailyItems.alreadyClaimed) {
        console.log(`⏭️ All items already claimed in Daily Reward section`);
        dailyItems = [];
      } else {
        const itemsArray = Array.isArray(dailyItems) ? dailyItems : (dailyItems?.claimedItems || []);
        claimedItems = claimedItems.concat(itemsArray);
        console.log(`✅ Claimed ${itemsArray.length} items from Daily Reward section`);
      }

      // Wait between sections
      await page.waitForTimeout(1000);

      // Navigate to Free Daily Cue Piece section
      console.log(`🌐 Navigating to Free Daily Cue Piece section: ${this.freeDailyCueUrl}`);
      await page.goto(this.freeDailyCueUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: this.timeout 
      });
      console.log('✅ Successfully loaded Free Daily Cue Piece page');

      // Wait for page to settle
      await page.waitForTimeout(1000);

      // Check for FREE buttons in Free Daily Cue Piece section
      console.log('🎁 Checking Free Daily Cue Piece section for FREE items...');
      let cueItems = await this.claimFreeItems(page, userId);
      
      // Check if all items were already claimed
      if (cueItems && typeof cueItems === 'object' && cueItems.alreadyClaimed) {
        console.log(`⏭️ All items already claimed in Free Daily Cue Piece section`);
        cueItems = [];
      } else {
        const itemsArray = Array.isArray(cueItems) ? cueItems : (cueItems?.claimedItems || []);
        // Filter out duplicate items that were already claimed
        const uniqueCueItems = itemsArray.filter(item => !claimedItems.includes(item));
        claimedItems = claimedItems.concat(uniqueCueItems);
        console.log(`✅ Claimed ${uniqueCueItems.length} unique items from Free Daily Cue Piece section`);
      }

      // Take final screenshot
      screenshotPath = `screenshots/final-page/final-page-${userId}.png`;
      await this.takeScreenshot(page, screenshotPath, 'Final page');

      // Logout
      console.log('🚪 Logging out...');
      await this.logout(page);

      console.log(`✅ Claim process completed for user: ${userId}`);
      
      // Check if all items were already claimed
      if (claimedItems && typeof claimedItems === 'object' && claimedItems.alreadyClaimed) {
        console.log(`⏭️ All items already claimed for user ${userId} - not saving failed record`);
        return { success: true, claimedItems: [], screenshotPath, alreadyClaimed: true };
      }
      
      // Extract claimedItems array if it's an object with alreadyClaimed flag
      const itemsArray = Array.isArray(claimedItems) ? claimedItems : (claimedItems?.claimedItems || []);
      
      // LAYER 3: Pre-save validation - check if any items were actually claimed
      if (itemsArray.length === 0) {
        console.log(`⚠️ No items detected in claimedItems array for user ${userId} - this may indicate a counting issue`);
        console.log(`🔍 However, we'll still save the claim record as 'success' since the process completed without errors`);
        console.log(`🔍 This could mean: 1) Items already claimed today, 2) No free items available, 3) Website structure changed`);
        
        // Cleanup old screenshots
        await this.cleanupOldScreenshots();
        
        // Still save a record with empty items but success status (include screenshot path)
        const saveResult = await this.saveClaimRecord(userId, [], true, null, screenshotPath);
        return { success: true, claimedItems: [], screenshotPath, alreadyClaimed: false };
      }
      
      // Update claimedItems to use the array
      claimedItems = itemsArray;
      
      console.log(`🎉 SUCCESS: User ${userId} claimed ${claimedItems.length} items: ${claimedItems.join(', ')}`);

      // Try to create confirmation image before saving (so we can store its path)
      let confirmationImagePath = screenshotPath;
      if (this.imageGenerator) {
        try {
          const users = await dbService.getAllUsers();
          const user = users.find(u => u.eightBallPoolId === userId);
          const username = user?.username || 'Unknown User';
          
          const generatedPath = await this.imageGenerator.createConfirmationImage(
            userId, 
            username, 
            claimedItems, 
            screenshotPath
          );
          if (generatedPath) {
            confirmationImagePath = generatedPath;
            console.log(`✅ Confirmation image created for user ${userId}`);
          }
        } catch (imageError) {
          console.log(`⚠️ Could not create confirmation image, using screenshot: ${imageError.message}`);
        }
      } else {
        // ImageGenerator not available - copy final-page screenshot to confirmation directory
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const confirmationDir = 'screenshots/confirmation';
            
            // Ensure confirmation directory exists
            if (!fs.existsSync(confirmationDir)) {
              fs.mkdirSync(confirmationDir, { recursive: true });
            }
            
            const confirmationPath = `${confirmationDir}/confirmation-${userId}-${timestamp}.png`;
            fs.copyFileSync(screenshotPath, confirmationPath);
            confirmationImagePath = confirmationPath;
            console.log(`✅ Copied screenshot to confirmation directory: ${confirmationPath}`);
          } catch (copyError) {
            console.log(`⚠️ Could not copy screenshot to confirmation directory: ${copyError.message}`);
            // Fallback to original screenshot path
            confirmationImagePath = screenshotPath;
          }
        }
      }

      // Save claim record to database (with Layer 1 duplicate check) - include confirmation image path if available
      const saveResult = await this.saveClaimRecord(userId, claimedItems, true, null, confirmationImagePath || screenshotPath);

      // Handle duplicate detection from Layer 1
      const isDuplicate = saveResult && !saveResult.saved && saveResult.reason === 'duplicate';
      if (isDuplicate) {
        console.log(`⏭️ Duplicate detected by database layer - claim already recorded today`);
        console.log('💡 Note: User already has a claim record today, but will still attempt Discord notification');
        console.log('💡 Discord service will handle its own duplicate check (within 2 minutes)');
      }
      
      // Cleanup old screenshots
      await this.cleanupOldScreenshots();
      
      // Send Discord confirmation - even if database save was duplicate, attempt Discord
      // The Discord service has its own duplicate check (within 2 minutes) that will prevent
      // duplicate messages from the same claim attempt, but allow new claims later in the day
      if (this.discordService && this.discordService.isReady) {
        console.log('📤 Sending Discord confirmation...');
        await this.sendDiscordConfirmation(userId, screenshotPath, claimedItems);
      } else {
        console.log('⚠️ Discord service not ready, skipping confirmation');
      }

      // Return result - include alreadyClaimed flag if duplicate was detected
      if (isDuplicate) {
        return { success: true, claimedItems: [], screenshotPath, alreadyClaimed: true };
      }

      return { success: true, claimedItems, screenshotPath };

    } catch (error) {
      console.error(`❌ Error during claim process for ${userId}:`, error.message);
      
      // Check if error is due to already claimed items (not a real failure)
      const errorMessage = error.message || '';
      const isAlreadyClaimedError = errorMessage.toLowerCase().includes('already claimed') ||
                                    errorMessage.toLowerCase().includes('already collected') ||
                                    errorMessage.toLowerCase().includes('items already claimed');
      
      if (isAlreadyClaimedError) {
        console.log(`⏭️ Error indicates items already claimed - not saving failed record`);
        return { success: true, claimedItems: [], screenshotPath, alreadyClaimed: true };
      }
      
      // Check if it's a screenshot-related error
      if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
        console.warn(`⚠️ Permission error detected for ${userId} - this may be related to screenshot saving`);
        console.warn(`⚠️ Consider checking screenshot directory permissions`);
      }
      
      // Save failed claim record to database only for actual errors (network, page errors, etc.)
      const saveResult = await this.saveClaimRecord(userId, [], false, error.message, screenshotPath);
      
      // If save was skipped due to user already having success today, treat as success
      if (saveResult && !saveResult.saved && saveResult.reason === 'already_claimed_today') {
        console.log(`⏭️ User ${userId} already has successful claim today - not a real failure`);
        return { success: true, claimedItems: [], screenshotPath, alreadyClaimed: true };
      }
      
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('🔒 Browser closed');
        } catch (closeError) {
          console.error('⚠️ Error closing browser:', closeError.message);
          // Force kill browser process if normal close fails
          try {
            await browser.close({ force: true });
            console.log('🔒 Browser force-closed');
          } catch (forceCloseError) {
            console.error('❌ Failed to force-close browser:', forceCloseError.message);
          }
        }
      }
      
      // Release browser pool slot
      this.browserPool.release();
      console.log(`🔄 Browser slot released for user ${userId}`);
    }
  }

  async handleLogin(page, userId) {
    try {
      // Wait for page to fully load
      await page.waitForTimeout(1000);
      
      // Look for login triggers
      const loginTriggers = await page.locator('button, a, div').filter({ hasText: /login|sign.?in|enter|join/i }).all();
      console.log(`Found ${loginTriggers.length} potential login triggers`);

      // Try hovering over elements to reveal login modal
      for (let i = 0; i < Math.min(5, loginTriggers.length); i++) {
        try {
          const trigger = loginTriggers[i];
          console.log(`🖱️ Hovering over potential trigger ${i + 1}...`);
          await trigger.hover();
          await page.waitForTimeout(1000);
          
          // Check if login modal appeared after hover
          const modal = await page.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
          const modalVisible = await modal.isVisible().catch(() => false);
          
          if (modalVisible) {
            console.log('✅ Login modal appeared after hover!');
            await this.fillLoginForm(page, userId);
            return;
          }
        } catch (error) {
          console.log(`⚠️ Error hovering over trigger ${i + 1}`);
        }
      }

      // Look for login buttons and click them
      const loginButtons = await page.locator('button').filter({ hasText: /login|sign.?in|enter/i }).all();
      console.log(`Found ${loginButtons.length} login buttons`);

      let loginModalAppeared = false;
      for (let i = 0; i < loginButtons.length; i++) {
        try {
          const button = loginButtons[i];
          console.log(`🖱️ Clicking login button ${i + 1}...`);
          await button.click();
          await page.waitForTimeout(1000);
          
          // Check if login modal appeared
          const modal = await page.locator('input[type="text"], input[placeholder*="ID"], input[placeholder*="id"]').first();
          const modalVisible = await modal.isVisible().catch(() => false);
          
          if (modalVisible) {
            console.log('✅ Login modal appeared after clicking!');
            loginModalAppeared = true;
            break;
          }
        } catch (error) {
          console.log(`⚠️ Error clicking login button ${i + 1}`);
        }
      }

      if (!loginModalAppeared) {
        console.log('⚠️ No login modal found, trying direct input search...');
      }

      // Fill login form
      console.log('📝 Filling login form...');
      await this.fillLoginForm(page, userId);

    } catch (error) {
      console.error('❌ Error during login process:', error.message);
    }
  }

  async fillLoginForm(page, userId) {
    try {
      // Wait a bit for any modals to appear
      await page.waitForTimeout(1000);
      
      // Look for input field with more comprehensive selectors
      const inputSelectors = [
        'input[type="text"]',
        'input[type="number"]',
        'input[placeholder*="ID"]',
        'input[placeholder*="id"]',
        'input[placeholder*="User"]',
        'input[placeholder*="user"]',
        'input[name*="id"]',
        'input[name*="user"]',
        'input[class*="id"]',
        'input[class*="user"]',
        'input[class*="login"]',
        'input[class*="input"]',
        'input[data-testid*="id"]',
        'input[data-testid*="user"]',
        'input[data-testid*="login"]'
      ];

      let input = null;
      for (const selector of inputSelectors) {
        try {
          const elements = await page.locator(selector).all();
          if (elements.length > 0) {
            // Check if any of these elements are visible
            for (let i = 0; i < elements.length; i++) {
              const element = elements[i];
              const isVisible = await element.isVisible().catch(() => false);
              if (isVisible) {
                input = element;
                console.log(`Found visible ${selector} input field at index ${i}`);
                break;
              }
            }
            if (input) break;
          }
        } catch (error) {
          // Continue to next selector
        }
      }

      if (!input) {
        console.log('❌ No visible input field found');
        // Try to find any input in a modal or dialog
        const modalInputs = await page.locator('[role="dialog"] input, .modal input, .popup input, [class*="modal"] input').all();
        if (modalInputs.length > 0) {
          for (let i = 0; i < modalInputs.length; i++) {
            const element = modalInputs[i];
            const isVisible = await element.isVisible().catch(() => false);
            if (isVisible) {
              input = element;
              console.log(`Found input field in modal at index ${i}`);
              break;
            }
          }
        }
      }

      if (!input) {
        console.log('❌ No input field found anywhere');
        return;
      }

      // Focus and fill input
      console.log('🖱️ Hovering over input field...');
      await input.hover();
      console.log('🖱️ Clicking input field to focus...');
      await input.click();
      
      console.log('📝 Clearing and filling input...');
      await input.fill('');
      await input.fill(userId);
      console.log(`✅ Entered User ID: ${userId}`);

      // Take screenshot after entering ID
      await this.takeScreenshot(page, `screenshots/id-entry/after-id-entry-${userId}.png`, 'After ID entry');

      // Click Go button
      await this.clickGoButton(page, input);
      
      // Wait for login to complete and take another screenshot
      await page.waitForTimeout(1000);
      await this.takeScreenshot(page, `screenshots/go-click/after-go-click-${userId}.png`, 'After Go click');

    } catch (error) {
      console.error('❌ Error filling login form:', error.message);
    }
  }

  async clickGoButton(page, input) {
    try {
      console.log('🔍 Looking for Go button by position and attributes...');
      
      let goButtonFound = false;

      // Method 1: Look for button that's immediately after the input field in the DOM
      try {
        const nextElement = await input.locator('xpath=following-sibling::*[1]').first();
        const nextElementTag = await nextElement.evaluate(el => el.tagName);
        const nextElementText = await nextElement.textContent();
        
        console.log(`Next element after input: ${nextElementTag}, text: "${nextElementText}"`);
        
        if (nextElementTag === 'BUTTON' && nextElementText.includes('Go')) {
          console.log('✅ Found Go button as immediate next sibling');
          await nextElement.click();
          console.log('✅ Clicked immediate next sibling Go button');
          goButtonFound = true;
        }
      } catch (error) {
        console.log('⚠️ Immediate next sibling not a Go button');
      }

      // Method 2: Look for button with specific styling that indicates it's the login button
      if (!goButtonFound) {
        try {
          const styledButtons = await page.locator('button[style*="background"], button[class*="primary"], button[class*="submit"], button[class*="login"]').all();
          
          for (let i = 0; i < styledButtons.length; i++) {
            const button = styledButtons[i];
            const buttonText = await button.textContent();
            const buttonClass = await button.getAttribute('class') || '';
            
            if (buttonText.includes('Go') && !buttonClass.includes('google')) {
              const isVisible = await button.isVisible();
              if (isVisible) {
                console.log(`✅ Found styled Go button: "${buttonText}"`);
                await button.click();
                console.log('✅ Clicked styled Go button');
                goButtonFound = true;
                break;
              }
            }
          }
        } catch (error) {
          console.log('⚠️ No styled Go button found');
        }
      }

      // Method 3: Look for button that's in a form with the input
      if (!goButtonFound) {
        try {
          const form = await input.locator('xpath=ancestor::form').first();
          const formButtons = await form.locator('button').all();
          
          for (let i = 0; i < formButtons.length; i++) {
            const button = formButtons[i];
            const buttonText = await button.textContent();
            
            if (buttonText.includes('Go')) {
              const isVisible = await button.isVisible();
              if (isVisible) {
                console.log(`✅ Found Go button in form: "${buttonText}"`);
                await button.click();
                console.log('✅ Clicked form Go button');
                goButtonFound = true;
                break;
              }
            }
          }
        } catch (error) {
          console.log('⚠️ No form Go button found');
        }
      }

      if (!goButtonFound) {
        console.log('❌ No suitable Go button found');
      }

      // Wait for login to complete and check for redirects
      await page.waitForTimeout(1000);
      
      // Check if we got redirected to Google or another site
      const currentUrl = page.url();
      console.log(`🌐 Current URL after login attempt: ${currentUrl}`);
      
      if (currentUrl.includes('google.com') || currentUrl.includes('accounts.google.com')) {
        console.log('❌ Got redirected to Google - login failed');
        console.log('🔄 Trying to go back to shop page...');
        await page.goto(this.shopUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
      } else if (currentUrl.includes('8ballpool.com')) {
        console.log('✅ Still on 8ball pool site - login may have succeeded');
      } else {
        console.log(`⚠️ Unexpected redirect to: ${currentUrl}`);
      }

    } catch (error) {
      console.error('❌ Error clicking Go button:', error.message);
    }
  }

  async claimFreeItems(page, userId) {
    try {
      const claimedItems = [];
      
      console.log('🎁 Looking for all FREE and CLAIM buttons...');
      
      // Specific target keywords to identify rewards we care about
      // ORDER MATTERS! Check more specific items first
      const targetKeywords = [
        // Free Daily Cue Piece FIRST (most specific - check before individual cue names)
        'Free Daily Cue Piece', 'FREE DAILY CUE PIECE', 'DAILY CUE PIECE', 'Daily Cue Piece',
        'Free Cue Piece', 'FREE CUE PIECE',
        // Black Diamond (special item)
        'Black Diamond', 'BLACK DIAMOND',
        // Daily Rewards
        'Daily Reward', 'DAILY REWARD', 'WEBSHOP EXCLUSIVE',
        // 7 Random Cues (check AFTER Free Daily Cue Piece)
        'Opti Shot', 'Spin Wizard', 'Power Break', 'Strike Zone', 
        'Trickster', 'Gamechanger', 'Legacy Strike',
        // Other items
        'Cash', 'Coins', 'Box', 'Boxes', 'FREE CASH', 'FREE COINS'
      ];
      
      // Find all FREE/CLAIM buttons first
      console.log('🔍 Scanning for all FREE and CLAIM buttons...');
      const freeButtonSelectors = [
        'button:has-text("FREE")',
        'button:has-text("free")',
        'a:has-text("FREE")',
        'a:has-text("free")',
        '[class*="free"]:has-text("FREE")',
        '[class*="free"]:has-text("free")'
      ];

      let allFreeButtons = [];
      for (const selector of freeButtonSelectors) {
        try {
          const buttons = await page.locator(selector).all();
          allFreeButtons = allFreeButtons.concat(buttons);
        } catch (error) {
          // Continue with next selector
        }
      }

      // Remove duplicates
      const uniqueButtons = [];
      for (const button of allFreeButtons) {
        try {
          const isVisible = await button.isVisible();
          if (isVisible) {
            const buttonText = await button.textContent();
            const buttonId = await button.evaluate(el => el.id || el.className || el.textContent);
            
            // Check if we already have this button
            const alreadyExists = uniqueButtons.some(existing => {
              return existing.id === buttonId;
            });
            
            if (!alreadyExists) {
              uniqueButtons.push({
                element: button,
                text: buttonText,
                id: buttonId
              });
            }
          }
        } catch (error) {
          // Skip this button
        }
      }

      console.log(`Found ${uniqueButtons.length} unique FREE buttons`);

      // Check if all buttons are already claimed before attempting to claim
      let allButtonsClaimed = true;
      let claimableButtonsCount = 0;
      
      if (uniqueButtons.length > 0) {
        for (const buttonInfo of uniqueButtons) {
          try {
            const buttonText = buttonInfo.text || '';
            const isDisabled = await buttonInfo.element.isDisabled().catch(() => false);
            const isAlreadyClaimed = isButtonAlreadyClaimed(buttonText);
            
            if (!isDisabled && !isAlreadyClaimed) {
              allButtonsClaimed = false;
              claimableButtonsCount++;
            }
          } catch (error) {
            // If we can't check, assume it's claimable
            allButtonsClaimed = false;
            claimableButtonsCount++;
          }
        }
        
        // If all buttons are already claimed, return early with success flag
        if (allButtonsClaimed && uniqueButtons.length > 0) {
          console.log('✅ All items are already claimed - no new items to claim');
          console.log('⏭️ Skipping claim attempt (items already claimed, not a failure)');
          return { claimedItems: [], alreadyClaimed: true };
        }
        
        console.log(`🎯 Found ${claimableButtonsCount} claimable buttons out of ${uniqueButtons.length} total`);
      }

      if (uniqueButtons.length === 0) {
        console.log('❌ No FREE buttons found - may already be claimed or not available');
        
        // Count total buttons for debugging
        const allButtons = await page.locator('button').all();
        console.log(`Found ${allButtons.length} total buttons on page`);
        return { claimedItems: [], alreadyClaimed: true };
      }

      // Click each FREE button (after checking if it's claimable)
      for (let i = 0; i < uniqueButtons.length; i++) {
        const buttonInfo = uniqueButtons[i];
        try {
          // Check if button should be clicked (for actual claiming)
          const shouldClick = await shouldClickButton(buttonInfo.element, buttonInfo.text, console);
          if (!shouldClick) {
            continue;
          }
          
          // Check if button should be skipped for counting (already claimed indicators)
          const shouldSkipForCounting = shouldSkipButtonForCounting(buttonInfo.text, console);
          
          // Check if button is disabled
          const isDisabled = await buttonInfo.element.isDisabled().catch(() => false);
          if (isDisabled) {
            console.log(`⏭️ Skipping button ${i + 1} - disabled/greyed out`);
            continue;
          }
          
          // Check if button is actually clickable
          const isClickable = await buttonInfo.element.evaluate(el => !el.disabled && el.offsetParent !== null).catch(() => false);
          if (!isClickable) {
            console.log(`⏭️ Skipping button ${i + 1} - not clickable`);
            continue;
          }
          
          // Try to identify what item this button is for
          let itemName = 'Unknown Item';
          try {
            // Look for text in multiple parent levels
            let parentText = '';
            
            // Try to get text from several ancestor levels
            for (let level = 1; level <= 5; level++) {
              try {
                const parent = await buttonInfo.element.locator(`xpath=ancestor::div[${level}]`).first();
                const text = await parent.textContent().catch(() => '');
                parentText += ' ' + text;
              } catch (e) {
                // Continue with next level
              }
            }
            
            console.log(`📝 Parent text snippet: ${parentText.substring(0, 200)}...`);
            
            // Check if it matches any of our target keywords
            for (const keyword of targetKeywords) {
              if (parentText.includes(keyword)) {
                itemName = keyword;
                console.log(`🎯 Identified item: ${keyword}`);
                break;
              }
            }
          } catch (error) {
            // Use button text if we can't find parent
            itemName = buttonInfo.text || 'Unknown';
          }
          
          console.log(`🎁 Clicking FREE button ${i + 1} for "${itemName}" (button text: "${buttonInfo.text}")`);
          
          // Scroll button into view
          await buttonInfo.element.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          
          // Store original button text for validation
          const originalButtonText = await buttonInfo.element.evaluate(el => el.textContent || '');
          buttonInfo.element._originalText = originalButtonText;
          
          // Try to dismiss Privacy Settings modal by clicking outside or using aggressive dismissal
          try {
            // Check if Privacy Settings modal is present
            const privacyModal = await page.$('text="Privacy Settings"');
            if (privacyModal) {
              console.log('🍪 Privacy Settings modal detected - attempting aggressive dismissal');
              
              // Try multiple dismissal strategies with timeout
              const dismissalSuccess = await Promise.race([
                page.evaluate(() => {
                  try {
                    // Strategy 1: Click outside the modal (on backdrop)
                    const modal = document.querySelector('[class*="modal"], [role="dialog"]');
                    if (modal) {
                      const backdrop = modal.parentElement;
                      if (backdrop && backdrop !== modal) {
                        backdrop.click();
                        return true;
                      }
                    }
                    
                    // Strategy 2: Press Escape key
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
                    return true;
                  
                    // Strategy 3: Try to find and click any close button
                    const closeButtons = document.querySelectorAll('button, [role="button"]');
                    for (const btn of closeButtons) {
                      const text = btn.textContent || '';
                      if (text.toLowerCase().includes('save') || 
                          text.toLowerCase().includes('exit') || 
                          text.toLowerCase().includes('close') ||
                          text.toLowerCase().includes('dismiss')) {
                        btn.click();
                        return true;
                      }
                    }
                    
                    return false;
                  } catch (error) {
                    return false;
                  }
                }),
                new Promise(resolve => setTimeout(() => resolve(false), 5000)) // 5 second timeout
              ]);
              
              if (dismissalSuccess) {
                console.log('✅ Modal dismissal successful');
                await page.waitForTimeout(2000);
                // Now try normal click
                await buttonInfo.element.click({ timeout: 10000 });
              } else {
                console.log('⚠️ Modal dismissal failed, trying force click');
                // Fallback to force click
                try {
                  await buttonInfo.element.click({ force: true, timeout: 10000 });
                  console.log('✅ Force click successful');
                } catch (forceError) {
                  console.log(`⚠️ Force click failed: ${forceError.message}`);
                }
              }
            } else {
              // No modal detected, proceed with normal click
              await buttonInfo.element.click({ timeout: 10000 });
            }
          } catch (error) {
            console.log(`⚠️ Error with modal bypass: ${error.message}`);
            // Fallback to normal click
            try {
              await buttonInfo.element.click({ timeout: 10000 });
            } catch (clickError) {
              console.log(`⚠️ Normal click failed: ${clickError.message}`);
            }
          }
          
          // Use standardized claim validation logic
          const isValidNewClaim = await validateClaimResult(buttonInfo.element, itemName, console);
          
          // Count items that were successfully claimed
          // Only count if it's a valid new claim AND the button wasn't already in a "claimed" state
          if (isValidNewClaim && !shouldSkipForCounting) {
            claimedItems.push(itemName);
          }
          
          // Wait between clicks
          await page.waitForTimeout(1000);
          
        } catch (error) {
          console.log(`⚠️ Error clicking FREE button ${i + 1}: ${error.message}`);
        }
      }

      console.log(`🎉 Claimed ${claimedItems.length} items: ${claimedItems.join(', ')}`);
      return claimedItems;

    } catch (error) {
      console.error('❌ Error claiming free items:', error.message);
      return [];
    }
  }

  async logout(page) {
    try {
      console.log('🔍 Looking for logout button...');
      
      // Look for logout buttons
      const logoutButtons = await page.locator('button:has-text("Logout"), button:has-text("Sign Out"), button:has-text("Log Out"), a:has-text("Logout"), a:has-text("Sign Out")').all();
      
      if (logoutButtons.length > 0) {
        for (let i = 0; i < logoutButtons.length; i++) {
          try {
            const logoutButton = logoutButtons[i];
            const isVisible = await logoutButton.isVisible();
            
            if (isVisible) {
              const buttonText = await logoutButton.textContent();
              console.log(`🚪 Found logout button: "${buttonText}"`);
              await logoutButton.click();
              console.log('✅ Clicked logout button');
              await page.waitForTimeout(1000);
              return true;
            }
          } catch (error) {
            console.log(`⚠️ Error with logout button ${i + 1}: ${error.message}`);
          }
        }
      }
      
      // Alternative: Look for user menu/profile that might contain logout
      const profileButtons = await page.locator('button[class*="profile"], button[class*="user"], button[class*="account"], a[class*="profile"], a[class*="user"]').all();
      
      for (let i = 0; i < profileButtons.length; i++) {
        try {
          const profileButton = profileButtons[i];
          const isVisible = await profileButton.isVisible();
          
          if (isVisible) {
            console.log(`👤 Clicking profile button ${i + 1} to find logout...`);
            await profileButton.click();
            await page.waitForTimeout(500);
            
            // Look for logout in dropdown
            const dropdownLogout = await page.locator('button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout")').first();
            const dropdownVisible = await dropdownLogout.isVisible().catch(() => false);
            
            if (dropdownVisible) {
              await dropdownLogout.click();
              console.log('✅ Clicked logout from dropdown');
              await page.waitForTimeout(1000);
              return true;
            }
          }
        } catch (error) {
          console.log(`⚠️ Error with profile button ${i + 1}: ${error.message}`);
        }
      }
      
      console.log('⚠️ No logout button found - user may already be logged out');
      return false;
      
    } catch (error) {
      console.log(`⚠️ Error during logout: ${error.message}`);
      return false;
    }
  }

  async sendDiscordConfirmation(userId, screenshotPath, claimedItems) {
    try {
      // Find username from database
      let username = 'Unknown User';
      
      try {
        // Try to get username from database
        const users = await dbService.getAllUsers();
        const user = users.find(u => u.eightBallPoolId === userId);
        if (user) {
          username = user.username || 'Unknown User';
        }
      } catch (error) {
        console.log('⚠️ Could not load username from database, trying user-mapping.json');
        try {
          // Fallback to user-mapping.json if database fails
          const fs = require('fs');
          const mappingData = fs.readFileSync('user-mapping.json', 'utf8');
          const mappings = JSON.parse(mappingData).userMappings;
          const userMapping = mappings.find(mapping => mapping.bpAccountId === userId);
          if (userMapping) {
            username = userMapping.username;
          }
        } catch (mappingError) {
          console.log('⚠️ Could not load user mapping for username');
        }
      }

      // Try to create confirmation image if ImageGenerator is available
      let confirmationImagePath = screenshotPath; // Default to screenshot
      
      if (this.imageGenerator) {
        try {
          const generatedPath = await this.imageGenerator.createConfirmationImage(
            userId, 
            username, 
            claimedItems, 
            screenshotPath
          );
          if (generatedPath) {
            confirmationImagePath = generatedPath;
            console.log(`✅ Confirmation image created for user ${userId}`);
          }
        } catch (imageError) {
          console.log(`⚠️ Could not create confirmation image, using screenshot: ${imageError.message}`);
          // Fallback to screenshot if image generation fails
        }
      } else {
        // ImageGenerator not available - copy final-page screenshot to confirmation directory
        if (screenshotPath && fs.existsSync(screenshotPath)) {
          try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const confirmationDir = 'screenshots/confirmation';
            
            // Ensure confirmation directory exists
            if (!fs.existsSync(confirmationDir)) {
              fs.mkdirSync(confirmationDir, { recursive: true });
            }
            
            const confirmationPath = `${confirmationDir}/confirmation-${userId}-${timestamp}.png`;
            fs.copyFileSync(screenshotPath, confirmationPath);
            confirmationImagePath = confirmationPath;
            console.log(`✅ Copied screenshot to confirmation directory: ${confirmationPath}`);
          } catch (copyError) {
            console.log(`⚠️ Could not copy screenshot to confirmation directory: ${copyError.message}`);
            console.log('ℹ️ Using original screenshot path for Discord confirmation');
            // Fallback to original screenshot path
            confirmationImagePath = screenshotPath;
          }
        } else {
          console.log('ℹ️ ImageGenerator not available and no screenshot found');
        }
      }

      // Send Discord confirmation (will use screenshot if confirmation image not available)
      if (confirmationImagePath) {
        const success = await this.discordService.sendConfirmation(
          userId, 
          confirmationImagePath, 
          claimedItems
        );

        if (success) {
          console.log(`✅ Discord confirmation sent for user ${userId}`);
        } else {
          console.log(`⚠️ Failed to send Discord confirmation for user ${userId}`);
        }
      } else {
        console.log(`⚠️ No screenshot or confirmation image available for user ${userId}`);
      }

    } catch (error) {
      console.error(`❌ Error sending Discord confirmation for ${userId}:`, error.message);
    }
  }

  async claimRewards() {
    // Connect to database first
    await this.connectToDatabase();
    
    // Initialize user list from database
    this.userIds = await this.getUserIdList();
    
    console.log(`🚀 Starting 8ball pool reward claimer for ${this.userIds.length} users...`);
    console.log(`👥 Users: ${this.userIds.join(', ')}`);
    
    console.log(`\n🚀 Running ${this.userIds.length} claims with BROWSER POOL (max 10 concurrent browsers)!`);
    console.log(`📊 Browser Pool Status: ${this.browserPool.getStatus().activeBrowsers}/${this.browserPool.getStatus().maxConcurrent} active, ${this.browserPool.getStatus().queued} queued`);

    // Process all users with browser pool limiting! 🚀
    const claimPromises = this.userIds.map(async (userId, index) => {
      console.log(`\n📋 Starting user ${index + 1}/${this.userIds.length}: ${userId}`);
      
      const result = await this.claimRewardsForUser(userId);
      return { userId, ...result };
    });
    
    // Wait for all claims to complete
    const results = await Promise.all(claimPromises);

    // Summary
    const successes = results.filter(r => r.success).length;
    const failures = results.filter(r => !r.success).length;
    
    console.log('\n🎉 Claim process completed!');
    console.log(`✅ Success: ${successes}`);
    console.log(`❌ Failures: ${failures}`);

    return results;
  }

  async runDailyClaim() {
    console.log('🕐 Running daily claim process...');
    
    // Initialize Discord
    await this.initializeDiscord();
    
    // Run claims
    const results = await this.claimRewards();
    
    // Cleanup old files
    if (this.imageGenerator) {
      this.imageGenerator.cleanupOldFiles();
    } else {
      await this.cleanupOldScreenshots();
    }
    
    // Logout Discord
    await this.discordService.logout();
    
    return results;
  }

  startScheduler() {
    console.log('📅 Starting automated scheduler...');
    console.log('🕛 Will run 4 times daily (every 6 hours):');
    console.log('   - 00:00 (12:00 AM midnight) UTC');
    console.log('   - 06:00 (6:00 AM) UTC');
    console.log('   - 12:00 (12:00 PM noon) UTC');
    console.log('   - 18:00 (6:00 PM) UTC');
    console.log('🧹 Channel cleanup will run 2 minutes before each claim');
    
    // Schedule channel cleanup 2 minutes before each claim (23:58, 05:58, 11:58, 17:58 UTC)
    cron.schedule('58 23 * * *', async () => {
      console.log('\n🧹 23:58 UTC - Cleaning up old bot messages from rewards channel...');
      if (this.discordService && this.discordService.isReady) {
        await this.discordService.clearOldRewardsChannelMessages();
      }
    });

    cron.schedule('58 5 * * *', async () => {
      console.log('\n🧹 05:58 UTC - Cleaning up old bot messages from rewards channel...');
      if (this.discordService && this.discordService.isReady) {
        await this.discordService.clearOldRewardsChannelMessages();
      }
    });

    cron.schedule('58 11 * * *', async () => {
      console.log('\n🧹 11:58 UTC - Cleaning up old bot messages from rewards channel...');
      if (this.discordService && this.discordService.isReady) {
        await this.discordService.clearOldRewardsChannelMessages();
      }
    });

    cron.schedule('58 17 * * *', async () => {
      console.log('\n🧹 17:58 UTC - Cleaning up old bot messages from rewards channel...');
      if (this.discordService && this.discordService.isReady) {
        await this.discordService.clearOldRewardsChannelMessages();
      }
    });
    
    // Schedule at 00:00 (midnight) UTC
    cron.schedule('0 0 * * *', async () => {
      console.log('\n🕐 00:00 UTC - Running scheduled claim...');
      await this.runDailyClaim();
    });

    // Schedule at 06:00 (6 AM) UTC
    cron.schedule('0 6 * * *', async () => {
      console.log('\n🕐 06:00 UTC - Running scheduled claim...');
      await this.runDailyClaim();
    });

    // Schedule at 12:00 (noon) UTC
    cron.schedule('0 12 * * *', async () => {
      console.log('\n🕐 12:00 UTC - Running scheduled claim...');
      await this.runDailyClaim();
    });

    // Schedule at 18:00 (6 PM) UTC
    cron.schedule('0 18 * * *', async () => {
      console.log('\n🕐 18:00 UTC - Running scheduled claim...');
      await this.runDailyClaim();
    });

    console.log('✅ Scheduler started successfully');
    console.log('💡 Press Ctrl+C to stop the scheduler');
    
    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down scheduler...');
      await this.discordService.logout();
      process.exit(0);
    });
  }
}

// LAYER 2: Helper functions are imported from claimer-utils.js
// See: const { validateClaimResult, shouldSkipButtonForCounting, shouldClickButton } = require('./claimer-utils');

// Initialize heartbeat for service tracking
let heartbeatInitialized = false;
try {
  const heartbeatUrl = process.env.HEARTBEAT_URL || `${process.env.PUBLIC_URL || 'http://localhost:2600'}/8bp-rewards/api/heartbeat/beat`;
  const axios = require('axios');
  const intervalMs = Math.max(5000, parseInt(process.env.HEARTBEAT_INTERVAL_MS || '5000', 10));
  
  const sendHeartbeat = () => {
    axios.post(heartbeatUrl, {
      moduleId: __filename,
      filePath: __filename,
      processId: process.pid,
      service: 'claimer'
    }, { timeout: 2000 }).catch(() => {});
  };
  
  sendHeartbeat();
  setInterval(sendHeartbeat, intervalMs);
  heartbeatInitialized = true;
  console.log('✅ Heartbeat initialized for claimer service');
} catch (error) {
  console.log('⚠️ Could not initialize heartbeat:', error.message);
}

// Main execution
async function main() {
  const claimer = new EightBallPoolClaimer();
  
  if (process.argv.includes('--schedule')) {
    claimer.startScheduler();
  } else {
    await claimer.runDailyClaim();
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = EightBallPoolClaimer;
