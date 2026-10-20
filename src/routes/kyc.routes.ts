import { Router } from 'express';
import {
  uploadKycDocument,
  getUserKycDocuments,
  adminGetAllKyc,
  approveKyc,
  rejectKyc,
  serveKycFile,
} from '../controllers/kyc.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';
import { uploadKycFile } from '../services/upload.service';

const router = Router();

// User routes
router.post('/upload', authenticate, uploadKycFile, uploadKycDocument);
router.get('/', authenticate, getUserKycDocuments);

// Admin routes
router.get('/admin', authenticate, requireAdmin, adminGetAllKyc);
router.get('/admin/:id/file', authenticate, requireAdmin, serveKycFile);
router.put('/admin/:id/approve', authenticate, requireAdmin, approveKyc);
router.put('/admin/:id/reject', authenticate, requireAdmin, rejectKyc);

export default router;
