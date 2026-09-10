import "dotenv/config";
import { AuthServiceSdk } from "energy-community-auth-sdk";
import type { Request, Response } from "express";
import { prisma } from "@/lib/prisma"

const authSdkAppId = process.env.AUTH_SDK_APP_ID?.trim();
const authSdkApiKey = process.env.AUTH_SDK_API_KEY?.trim();

if (!authSdkAppId || !authSdkApiKey) {
    throw new Error("AUTH_SDK_APP_ID and AUTH_SDK_API_KEY must be configured");
}

const sdk = new AuthServiceSdk({
    appId: authSdkAppId,
    apiKey: authSdkApiKey
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
