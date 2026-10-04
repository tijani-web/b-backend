import { Router } from 'express';
import { adminGetAllUsers, adminGetUser, adminGetStats, adminDeleteUser } from '../controllers/admin.controller';
import { authenticate, requireAdmin } from '../middlewares/auth';

const router = Router();

router.get('/stats', authenticate, requireAdmin, adminGetStats);
router.get('/users', authenticate, requireAdmin, adminGetAllUsers);
router.get('/users/:id', authenticate, requireAdmin, adminGetUser);
router.delete('/users/:id', authenticate, requireAdmin, adminDeleteUser);


export default router;
