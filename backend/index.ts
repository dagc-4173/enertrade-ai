import "dotenv/config";
import { app } from "@/app";

const rawPort = process.env.PORT;
const port = rawPort === undefined ? 3000 : Number(rawPort);

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})
