import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middlewares/auth';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';

const prisma = new PrismaClient();

const ALLOWED_DOC_TYPES = [
  'PASSPORT',
  'DRIVERS_LICENSE',
  'NATIONAL_ID',
  'PROOF_OF_ADDRESS',
  'SELFIE',
];

// ─── User ─────────────────────────────────────────────────────────────────────

/** POST /api/kyc/upload */
export const uploadKycDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const { docType } = req.body;
    const file = (req as any).file;

    if (!docType || !ALLOWED_DOC_TYPES.includes(docType)) {
      res.status(400).json({
        error: `docType must be one of: ${ALLOWED_DOC_TYPES.join(', ')}`,
      });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'Document file is required' });
      return;
    }

    const fileUrl = `/uploads/kyc/${file.filename}`;

    // If a doc of this type was already uploaded and rejected, allow re-upload
    // Otherwise create a new record (user can have multiple types)
    const existing = await prisma.kycDocument.findFirst({
      where: { userId, docType, status: 'PENDING' },
    });

    if (existing) {
      res.status(400).json({
        error: `A ${docType} document is already pending review. Please wait for admin review before re-submitting.`,
      });
      return;
    }

    const doc = await prisma.kycDocument.create({
      data: {
        userId,
        docType,
        fileUrl,
        fileName: file.originalname,
        status: 'PENDING',
      },
    });

    res.status(201).json({ data: doc, message: 'Document submitted for review' });
  } catch (error) {
    logger.error('uploadKycDocument error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

/** GET /api/kyc — user's own KYC documents */
export const getUserKycDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const docs = await prisma.kycDocument.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        docType: true,
        fileName: true,
        status: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        // DO NOT expose fileUrl to user (security)
      },
    });
    res.status(200).json({ data: docs });
  } catch (error) {
    logger.error('getUserKycDocuments error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

/** GET /api/admin/kyc */
export const adminGetAllKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;
    const { status, docType } = req.query;

    const where: any = {};
    if (status) where.status = status;
    if (docType) where.docType = docType;

    const [docs, total] = await Promise.all([
      prisma.kycDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: { select: { id: true, email: true, fullName: true, kycStatus: true } },
        },
      }),
      prisma.kycDocument.count({ where }),
    ]);

    res.status(200).json({
      data: docs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('adminGetAllKyc error:', error);
    res.status(500).json({ error: 'Failed to fetch KYC documents' });
  }
};

/** PUT /api/admin/kyc/:id/approve */
export const approveKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;

    const doc = await prisma.kycDocument.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!doc) {
      res.status(404).json({ error: 'KYC document not found' });
      return;
    }
    if (doc.status !== 'PENDING') {
      res.status(400).json({ error: `Document is already ${doc.status}` });
      return;
    }

    await prisma.$transaction([
      prisma.kycDocument.update({
        where: { id },
        data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: doc.userId },
        data: { kycStatus: 'VERIFIED' },
      }),
    ]);

    await EmailService.sendKycStatusEmail(doc.user.email, 'APPROVED', doc.docType);

    res.status(200).json({ message: 'KYC document approved and user verified' });
  } catch (error) {
    logger.error('approveKyc error:', error);
    res.status(500).json({ error: 'Failed to approve KYC document' });
  }
};

/** PUT /api/admin/kyc/:id/reject */
export const rejectKyc = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const adminId = req.userId!;
    const { reason } = req.body;

    const doc = await prisma.kycDocument.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!doc) {
      res.status(404).json({ error: 'KYC document not found' });
      return;
    }
    if (doc.status !== 'PENDING') {
      res.status(400).json({ error: `Document is already ${doc.status}` });
      return;
    }

    await prisma.$transaction([
      prisma.kycDocument.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: reason || null,
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      }),
      prisma.user.update({
        where: { id: doc.userId },
        data: { kycStatus: 'REJECTED' },
      }),
    ]);

    await EmailService.sendKycStatusEmail(doc.user.email, 'REJECTED', doc.docType, reason);

    res.status(200).json({ message: 'KYC document rejected' });
  } catch (error) {
    logger.error('rejectKyc error:', error);
    res.status(500).json({ error: 'Failed to reject KYC document' });
  }
};

/** GET /api/admin/kyc/:id/file — serve the document file to admin */
export const serveKycFile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const doc = await prisma.kycDocument.findUnique({ where: { id } });

    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const absolutePath = `${process.cwd()}${doc.fileUrl}`;
    res.sendFile(absolutePath);
  } catch (error) {
    logger.error('serveKycFile error:', error);
    res.status(500).json({ error: 'Failed to serve document' });
  }
};
