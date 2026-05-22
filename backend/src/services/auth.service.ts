import { AuthServiceSdk } from "energy-community-auth-sdk";
import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma"

const sdk = new AuthServiceSdk({
    appId: "gestion-inteligente-de-energia",
    apiKey: "f9e60c99b7597822968263fc3d2aded5e4465c6f812af64076e70733a1f4e880"
})

export async function registerUser(req: Request, res: Response) {
    try {
        const { email, password, firstName, lastName } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: "All fields are required" });
        }
        if (typeof email !== "string" || typeof password !== "string" || typeof firstName !== "string" || typeof lastName !== "string") {
            return res.status(400).json({ error: "All fields must be strings" });
        }
        if (email.match(/^\S+@\S+\.\S+$/) === null) {
            return res.status(400).json({ error: "Invalid email format" });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters long" });
        }
        if (password.match(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/) === null) {
            return res.status(400).json({ error: "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character" });
        }
        // devuelve: accessToken, refreshToken, y objeto user (id, email, firstName, lastName)
        const user = await sdk.auth.register({ email, password, firstName, lastName });
        
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: "Error registering user", details: err instanceof Error ? err.message : String(err) });
    }
}
