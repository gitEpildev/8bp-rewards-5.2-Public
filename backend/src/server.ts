import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import passport from 'passport';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import heartbeatRoutes from './routes/heartbeat';
import { initModuleHeartbeat } from './utils/heartbeat-client';
import WebSocketService from './services/WebSocketService';

// Load environment variables
dotenv.config();

// Import services
import { logger } from './services/LoggerService';
import { DatabaseService } from './services/DatabaseService';
import SchedulerService from './services/SchedulerService';

// Import routes
import authRoutes from './routes/auth';
import registrationRoutes from './routes/registration';
import adminRoutes from './routes/admin';
import adminTicketsRoutes from './routes/admin-tickets';
import contactRoutes from './routes/contact';
import statusRoutes from './routes/status';
import leaderboardRoutes from './routes/leaderboard';
import vpsMonitorRoutes from './routes/vps-monitor';
import screenshotsRoutes from './routes/screenshots';
import adminTerminalRoutes from './routes/admin-terminal';
import tiktokProfilesRoutes from './routes/tiktok-profiles';
import postgresqlDbRoutes from './routes/postgresql-db';
import validationRoutes from './routes/validation';
import userDashboardRoutes from './routes/user-dashboard';
import verificationRoutes from './routes/verification';
import deregisterRoutes from './routes/deregister';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { timeoutMiddleware } from './middleware/timeout';
import { TIMEOUTS } from './constants';

class Server {
  private app: express.Application;
  private httpServer: http.Server | null = null;
  private port: number;
  private databaseService: DatabaseService;
  private schedulerService: SchedulerService | null = null;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.BACKEND_PORT || '2600', 10);
    this.databaseService = DatabaseService.getInstance();
    
    // Report this module's heartbeat
    initModuleHeartbeat(module, { service: 'backend' });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Trust proxy (needed for Cloudflare tunnel)
    this.app.set('trust proxy', 1);
    
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'", "https://8ballpool.website"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://8ballpool.website"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "https://8ballpool.website"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://8ballpool.website"],
          imgSrc: ["'self'", "data:", "https:", "https://8ballpool.website"],
          connectSrc: ["'self'", "https://8ballpool.website", "https://*.8ballpool.website", "wss://8ballpool.website", "https://api.ipify.org"]
        }
      }
    }));

    // CORS configuration
    const frontendPort = process.env.FRONTEND_PORT || '2500';
    const allowedOrigins = [
      `http://localhost:${frontendPort}`,
      'https://8ballpool.website',
      process.env.PUBLIC_URL
    ].filter(Boolean);

    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.some(allowed => origin.startsWith(allowed as string))) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Request timeout middleware (30 seconds default)
    this.app.use(timeoutMiddleware(TIMEOUTS.REQUEST_TIMEOUT));

    // Request logging
    this.app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim())
      }
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10000, // limit each IP to 10000 requests per windowMs (increased for dashboard and admin operations)
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => {
        // Skip rate limiting for admin routes and dashboard
        return req.path.startsWith('/api/admin/') || req.path.startsWith('/8bp-rewards/admin-dashboard');
      }
    });
    this.app.use('/api/', limiter);

    // Disable ETags globally to prevent caching issues
    this.app.set('etag', false);
    
    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Session configuration
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production', // true for HTTPS in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-site redirects
        path: '/',
        domain: undefined // Allow cookies to work across subdomains if needed
      },
      name: 'connect.sid' // Explicit session cookie name
    }));

    // Passport initialization
    this.app.use(passport.initialize());
    this.app.use(passport.session());

    // Custom request logger middleware
    this.app.use(requestLogger);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // API routes (both at /api and /8bp-rewards/api for compatibility)
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/registration', registrationRoutes);
    this.app.use('/api/admin', adminRoutes);
    this.app.use('/api/admin/tickets', adminTicketsRoutes);
    this.app.use('/api/contact', contactRoutes);
    this.app.use('/api/status', statusRoutes);
    this.app.use('/api/leaderboard', leaderboardRoutes);
    this.app.use('/api/vps-monitor', vpsMonitorRoutes);
    this.app.use('/api/admin/screenshots', screenshotsRoutes);
    this.app.use('/api/admin/terminal', adminTerminalRoutes);
    this.app.use('/api/tiktok-profiles', tiktokProfilesRoutes);
    this.app.use('/api/postgresql-db', postgresqlDbRoutes);
    this.app.use('/api/validation', validationRoutes);
    this.app.use('/api/heartbeat', heartbeatRoutes);
    this.app.use('/api/user-dashboard', userDashboardRoutes);
    
    // Also register API routes under /8bp-rewards prefix for frontend
    this.app.use('/8bp-rewards/api/auth', authRoutes);
    this.app.use('/8bp-rewards/api/registration', registrationRoutes);
    this.app.use('/8bp-rewards/api/admin', adminRoutes);
    this.app.use('/8bp-rewards/api/admin/tickets', adminTicketsRoutes);
    this.app.use('/8bp-rewards/api/contact', contactRoutes);
    this.app.use('/8bp-rewards/api/status', statusRoutes);
    this.app.use('/8bp-rewards/api/leaderboard', leaderboardRoutes);
    this.app.use('/8bp-rewards/api/vps-monitor', vpsMonitorRoutes);
    this.app.use('/8bp-rewards/api/admin/screenshots', screenshotsRoutes);
    this.app.use('/8bp-rewards/api/admin/terminal', adminTerminalRoutes);
    this.app.use('/8bp-rewards/api/tiktok-profiles', tiktokProfilesRoutes);
    this.app.use('/8bp-rewards/api/postgresql-db', postgresqlDbRoutes);
    this.app.use('/8bp-rewards/api/validation', validationRoutes);
    this.app.use('/8bp-rewards/api/heartbeat', heartbeatRoutes);
    this.app.use('/8bp-rewards/api/user-dashboard', userDashboardRoutes);
    this.app.use('/api/internal/verification', verificationRoutes);
    this.app.use('/8bp-rewards/api', deregisterRoutes);
    this.app.use('/api', deregisterRoutes);

    // Serve static files from React build (consolidated Docker setup)
    // Always serve frontend in production mode or if build exists
    if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === undefined) {
      // Try multiple possible frontend build locations (dev vs Docker)
      const possibleFrontendPaths = [
        path.join(process.cwd(), 'frontend/build'),
        path.join(process.cwd(), '../frontend/build'),
        path.join(__dirname, '../../../../frontend/build'),
        path.join(__dirname, '../../../frontend/build'),
        '/app/frontend-build' // Docker path
      ];
      
      let frontendBuildPath: string | null = null;
      const fs = require('fs');
      for (const buildPath of possibleFrontendPaths) {
        try {
          if (fs.existsSync(buildPath) && fs.existsSync(path.join(buildPath, 'index.html'))) {
            frontendBuildPath = buildPath;
            logger.info(`Frontend build found at: ${buildPath}`);
            break;
          }
        } catch (e) {
          // Continue to next path
        }
      }
      
      if (frontendBuildPath) {
        // Serve static assets from frontend build (including assets folder)
        this.app.use('/8bp-rewards', express.static(frontendBuildPath, {
          maxAge: '0', // Disable caching to prevent stale content
          etag: true,
          lastModified: true,
          setHeaders: (res, path) => {
            // Disable caching for HTML files
            if (path.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
            }
          }
        }));
        
        // Also serve assets directly for paths like /8bp-rewards/assets/logos/8logo.png
        // This handles assets from the public folder that are served under /8bp-rewards
        const assetsPath = path.join(frontendBuildPath, 'assets');
        if (require('fs').existsSync(assetsPath)) {
          this.app.use('/8bp-rewards/assets', express.static(assetsPath, {
            maxAge: '1y',
            etag: true,
            lastModified: true
          }));
        }
        
        // Also serve assets from public folder root (for compatibility)
        const publicAssetsPath = path.join(process.cwd(), 'frontend', 'public', 'assets');
        if (require('fs').existsSync(publicAssetsPath)) {
          this.app.use('/8bp-rewards/assets', express.static(publicAssetsPath, {
            maxAge: '1y',
            etag: true,
            lastModified: true
          }));
        }
        
        // Serve uploaded profile and leaderboard images
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (require('fs').existsSync(uploadsDir)) {
          this.app.use('/uploads', express.static(uploadsDir, {
            maxAge: '1y',
            etag: true,
            lastModified: true
          }));
        }
        
        // Serve 8 Ball Pool avatars
        const avatarsDir = path.join(process.cwd(), 'frontend', '8 Ball Pool Avatars');
        if (require('fs').existsSync(avatarsDir)) {
          this.app.use('/8bp-rewards/avatars', express.static(avatarsDir, {
            maxAge: '1y',
            etag: true,
            lastModified: true
          }));
        }
        
        // Redirect root to /8bp-rewards
        this.app.get('/', (req, res) => {
          res.redirect('/8bp-rewards');
        });
        
        // Handle React routing - serve index.html for all non-API routes under /8bp-rewards
        // This needs to be a GET handler, not use(), and must come before error handlers
        this.app.get('/8bp-rewards/*', (req, res, next) => {
          // Don't handle API routes - let them pass through
          if (req.path.startsWith('/8bp-rewards/api/') || req.path.startsWith('/api/')) {
            return next();
          }
          // Don't handle static file requests (already handled by static middleware)
          if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot)$/)) {
            return next();
          }
          // Serve index.html for React Router with no-cache headers
          const indexPath = path.join(frontendBuildPath!, 'index.html');
          if (require('fs').existsSync(indexPath)) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
            res.sendFile(indexPath);
          } else {
            next();
          }
        });
      } else {
        logger.warn('Frontend build not found - serving API only. Tried paths:', possibleFrontendPaths);
      }
    }
  }

  private setupErrorHandling(): void {
    // React Router fallback - serve index.html for any /8bp-rewards route that's not API
    const fs = require('fs');
    const frontendBuildPath = path.join(process.cwd(), 'frontend/build');
    if (fs.existsSync(frontendBuildPath) && fs.existsSync(path.join(frontendBuildPath, 'index.html'))) {
      this.app.get('/8bp-rewards/*', (req, res, next) => {
        // Don't handle API routes
        if (req.path.startsWith('/8bp-rewards/api/') || req.path.startsWith('/api/')) {
          return next();
        }
        // Don't handle static files
        if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot)$/)) {
          return next();
        }
        // Serve index.html for React Router with no-cache headers
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, private');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
      });
    }
    
    // 404 handler for API routes only
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        error: 'API route not found',
        path: req.originalUrl,
        method: req.method
      });
    });
    
    // Handle missing static files gracefully (especially manifest.json and other common files)
    this.app.get('/8bp-rewards/manifest.json', (req, res) => {
      const manifestPath = path.join(process.cwd(), 'frontend/build/manifest.json');
      const fs = require('fs');
      if (fs.existsSync(manifestPath)) {
        res.sendFile(manifestPath);
      } else {
        // Return a default manifest.json if it doesn't exist
        res.json({
          short_name: "8BP Rewards",
          name: "8 Ball Pool Rewards",
          icons: [],
          start_url: "/8bp-rewards/",
          display: "standalone",
          theme_color: "#f2760a",
          background_color: "#ffffff"
        });
      }
    });
    
    // Final 404 handler (must be last) - but don't show JSON errors for static file requests
    this.app.use('*', (req, res) => {
      // If it's a static file request that doesn't exist, return 404 without JSON
      if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|json|woff|woff2|ttf|eot|map)$/)) {
        res.status(404).end();
        return;
      }
      // Only show JSON errors for API-like routes
      if (req.path.startsWith('/api/')) {
      res.status(404).json({
          error: 'API route not found',
        path: req.originalUrl,
        method: req.method
      });
        return;
      }
      // For other routes, return empty 404 (React Router will handle it)
      res.status(404).end();
    });

    // Global error handler
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      logger.info('Connecting to PostgreSQL...');
      const dbConnected = await this.databaseService.connect();
      
      if (!dbConnected) {
        throw new Error('Failed to connect to database');
      }

      // Create HTTP server from Express app
      this.httpServer = http.createServer(this.app);
      
      // Initialize WebSocket service with HTTP server
      WebSocketService.initialize(this.httpServer);
      
      // Start HTTP server - bind to all interfaces (0.0.0.0) to accept connections
      this.httpServer.listen(this.port, '0.0.0.0', () => {
        logger.info(`🚀 Backend server running on port ${this.port}`);
        logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        const frontendPort = process.env.FRONTEND_PORT || '2500';
        logger.info(`🔗 Public URL: ${process.env.PUBLIC_URL || `http://localhost:${frontendPort}`}`);
        logger.info(`🔌 WebSocket server initialized`);
      });

      // Initialize scheduler service
      this.schedulerService = new SchedulerService();
      logger.info('⏰ Scheduler service initialized');
      logger.info('📅 Next scheduled run: ' + (this.schedulerService.getStatus().nextRun || 'Not scheduled'));

      // Graceful shutdown
      process.on('SIGTERM', this.shutdown.bind(this));
      process.on('SIGINT', this.shutdown.bind(this));

    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
          ? error 
          : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to start server', { 
        error: errorMessage,
        stack: errorStack
      });
      console.error('Server startup error:', error);
      process.exit(1);
    }
  }

  private async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down server...');
    
    try {
      // Close HTTP server (which will close WebSocket connections)
      if (this.httpServer) {
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });
      }
      
      await this.databaseService.disconnect();
      logger.info('✅ Server shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown', { error: error instanceof Error ? error.message : 'Unknown error' });
      process.exit(1);
    }
  }
}

// Start server if this file is run directly
if (require.main === module) {
  const server = new Server();
  server.start();
}

export default Server;



