import "dotenv/config";
import { app } from "@/app";
import { xmDailyScheduler } from "@/services/xm-daily-scheduler.service";

const rawPort = process.env.PORT;
const port = rawPort === undefined ? 3000 : Number(rawPort);

if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.');
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    if (process.env.XM_AUTO_SYNC_ENABLED !== 'false') {
        xmDailyScheduler.start();
    } else {
        console.log('Automatic XM scheduler disabled; XM functionality and manual synchronization endpoints remain enabled.');
    }
})
