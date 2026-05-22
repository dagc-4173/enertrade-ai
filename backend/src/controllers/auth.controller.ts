import { registerUser } from "@/services/auth.service";
import { Router, type Request, type Response } from "express";

export const router = Router();

router.post('/register', (req: Request, res: Response) => {
    return registerUser(req, res);
})