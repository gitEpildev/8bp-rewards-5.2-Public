import express from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { EmailNotificationService } from '../services/EmailNotificationService';
import { logger } from '../services/LoggerService';
import { authenticateAdmin } from '../middleware/auth';
import { AdminRequest } from '../types/auth';
import rateLimit from 'express-rate-limit';

const router = express.Router();
const dbService = DatabaseService.getInstance();
const emailService = new EmailNotificationService();

const deregisterLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many deregistration requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/deregister', deregisterLimiter, async (req, res): Promise<void> => {
  try {
    const { full_name, eight_ball_pool_id, email } = req.body;

    if (!full_name || !full_name.trim()) {
      res.status(400).json({ error: 'Full name is required' });
      return;
    }

    if (!eight_ball_pool_id || !/^\d+$/.test(eight_ball_pool_id)) {
      res.status(400).json({ error: 'A valid numeric 8 Ball Pool ID is required' });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'A valid email address is required' });
      return;
    }

    const sanitizedName = full_name.trim().replace(/<[^>]*>/g, '');

    await dbService.connect();

    const existing = await dbService.executeQuery(
      `SELECT id FROM public_deregistration_requests WHERE eight_ball_pool_id = $1 AND status = 'pending'`,
      [eight_ball_pool_id]
    );

    if (existing.rows && existing.rows.length > 0) {
      res.status(409).json({ error: 'A pending deregistration request already exists for this ID' });
      return;
    }

    const seqResult = await dbService.executeQuery(`SELECT nextval('deregistration_request_seq') AS seq`);
    const seqNum = parseInt(seqResult.rows[0].seq, 10);
    const requestNumber = `DR-${String(seqNum).padStart(6, '0')}`;

    await dbService.executeQuery(
      `INSERT INTO public_deregistration_requests (request_number, full_name, eight_ball_pool_id, email, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [requestNumber, sanitizedName, eight_ball_pool_id, email.trim().toLowerCase()]
    );

    emailService.sendDeregistrationConfirmation(email.trim().toLowerCase(), requestNumber).catch(err => {
      logger.error('Failed to send deregistration confirmation email', { error: err.message, requestNumber });
    });

    logger.info('Public deregistration request created', {
      action: 'public_deregistration_request_created',
      requestNumber,
      eightBallPoolId: eight_ball_pool_id
    });

    res.status(201).json({
      requestNumber,
      message: 'Deregistration request submitted successfully. You will receive a confirmation email shortly.'
    });
  } catch (error) {
    logger.error('Failed to create public deregistration request', {
      action: 'public_deregistration_request_error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ error: 'Failed to submit deregistration request' });
  }
});

router.get('/admin/public-deregistration-requests', authenticateAdmin, async (req, res): Promise<void> => {
  try {
    await dbService.connect();
    const result = await dbService.executeQuery(
      `SELECT * FROM public_deregistration_requests ORDER BY requested_at DESC`
    );
    res.json({ requests: result.rows });
  } catch (error) {
    logger.error('Failed to fetch public deregistration requests', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ error: 'Failed to fetch deregistration requests' });
  }
});

router.post('/admin/public-deregistration-requests/:id/approve', authenticateAdmin, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as AdminRequest).user?.id || 'unknown';

    await dbService.connect();

    const requestResult = await dbService.executeQuery(
      `SELECT * FROM public_deregistration_requests WHERE id = $1`,
      [id]
    );

    if (!requestResult.rows || requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Deregistration request not found' });
      return;
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      res.status(400).json({ error: `Request has already been ${request.status}` });
      return;
    }

    await dbService.executeQuery(
      `UPDATE public_deregistration_requests SET status = 'approved', reviewed_at = now(), reviewed_by = $1 WHERE id = $2`,
      [adminId, id]
    );

    const removalResults = { registrations: 0, invalidUsers: 0, claimRecords: 0, validationLogs: 0 };
    const eightBallPoolId = request.eight_ball_pool_id;

    try {
      await dbService.deleteRegistration(eightBallPoolId);
      removalResults.registrations = 1;
    } catch (e) {
      logger.debug('No registration found during public deregistration approval', { eightBallPoolId });
    }

    try {
      const r = await dbService.executeQuery('DELETE FROM invalid_users WHERE eight_ball_pool_id = $1', [eightBallPoolId]);
      removalResults.invalidUsers = r.rowCount || 0;
    } catch (e) {
      logger.debug('No invalid_users record during public deregistration approval', { eightBallPoolId });
    }

    try {
      const r = await dbService.executeQuery('DELETE FROM claim_records WHERE eight_ball_pool_id = $1', [eightBallPoolId]);
      removalResults.claimRecords = r.rowCount || 0;
    } catch (e) {
      logger.debug('No claim_records during public deregistration approval', { eightBallPoolId });
    }

    try {
      const r = await dbService.executeQuery('DELETE FROM validation_logs WHERE unique_id = $1', [eightBallPoolId]);
      removalResults.validationLogs = r.rowCount || 0;
    } catch (e) {
      logger.debug('No validation_logs during public deregistration approval', { eightBallPoolId });
    }

    emailService.sendDeregistrationApproved(request.email, request.request_number).catch(err => {
      logger.error('Failed to send deregistration approval email', { error: err.message, requestNumber: request.request_number });
    });

    logger.info('Public deregistration request approved', {
      action: 'public_deregistration_approved',
      requestId: id,
      requestNumber: request.request_number,
      eightBallPoolId,
      adminId,
      removalResults
    });

    res.json({
      success: true,
      message: 'Deregistration request approved and user removed from all tables',
      requestNumber: request.request_number,
      removed: removalResults
    });
  } catch (error) {
    logger.error('Failed to approve public deregistration request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.params.id
    });
    res.status(500).json({ error: 'Failed to approve deregistration request' });
  }
});

router.post('/admin/public-deregistration-requests/:id/deny', authenticateAdmin, async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = (req as AdminRequest).user?.id || 'unknown';

    await dbService.connect();

    const requestResult = await dbService.executeQuery(
      `SELECT * FROM public_deregistration_requests WHERE id = $1`,
      [id]
    );

    if (!requestResult.rows || requestResult.rows.length === 0) {
      res.status(404).json({ error: 'Deregistration request not found' });
      return;
    }

    const request = requestResult.rows[0];

    if (request.status !== 'pending') {
      res.status(400).json({ error: `Request has already been ${request.status}` });
      return;
    }

    await dbService.executeQuery(
      `UPDATE public_deregistration_requests SET status = 'denied', reviewed_at = now(), reviewed_by = $1 WHERE id = $2`,
      [adminId, id]
    );

    emailService.sendDeregistrationDenied(request.email, request.request_number).catch(err => {
      logger.error('Failed to send deregistration denial email', { error: err.message, requestNumber: request.request_number });
    });

    logger.info('Public deregistration request denied', {
      action: 'public_deregistration_denied',
      requestId: id,
      requestNumber: request.request_number,
      eightBallPoolId: request.eight_ball_pool_id,
      adminId
    });

    res.json({
      success: true,
      message: 'Deregistration request denied',
      requestNumber: request.request_number
    });
  } catch (error) {
    logger.error('Failed to deny public deregistration request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.params.id
    });
    res.status(500).json({ error: 'Failed to deny deregistration request' });
  }
});

export default router;
