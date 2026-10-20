import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const kycDir = path.join(uploadDir, 'kyc');
if (!fs.existsSync(kycDir)) {
  fs.mkdirSync(kycDir, { recursive: true });
}

const proofsDir = path.join(uploadDir, 'proofs');
if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Allowed: JPEG, PNG, WebP, PDF'));
  }
};

// Storage for deposit proofs
const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, proofsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `proof-${uniqueSuffix}${ext}`);
  },
});

// Storage for KYC documents
const kycStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, kycDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `kyc-${uniqueSuffix}${ext}`);
  },
});

export const uploadProof = multer({
  storage: proofStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('proof');

export const uploadKycFile = multer({
  storage: kycStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('document');

// Convert local disk path to a served URL path
export const getFileUrl = (filePath: string): string => {
  const relative = path.relative(uploadDir, filePath);
  return `/uploads/${relative.replace(/\\/g, '/')}`;
};
