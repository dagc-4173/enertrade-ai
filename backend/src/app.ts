import express from 'express'
import {router as authRouter} from "@/controllers/auth.controller";
const app = express()

app.use(express.json())
app.use('/auth', authRouter)

export { app }