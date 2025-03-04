import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: process.env.PORT || 4000,
    mainServerUrl: process.env.MAIN_SERVER_URL || 'http://localhost:4001',
    trongridApiKey: process.env.TRONGRID_API_KEY,
    bscscanApiKey: process.env.BSCSCAN_API_KEY
};