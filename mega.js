import { Storage } from 'megajs';

const auth = {
    email: process.env.MEGA_EMAIL || 'your-mega-email@example.com',
    password: process.env.MEGA_PASSWORD || 'your-mega-password',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

export const upload = async (data, name) => {
    try {
        if (!auth.email || !auth.password || auth.email === 'your-mega-email@example.com') {
            throw new Error("⚠️  MEGA credentials not configured! Please update mega.js with your MEGA email and password.");
        }

        if (typeof data === 'string') {
            data = Buffer.from(data);
        } else if (Buffer.isBuffer(data)) {
            data = data;
        } else if (data.read) {
            const chunks = [];
            for await (const chunk of data) {
                chunks.push(chunk);
            }
            data = Buffer.concat(chunks);
        }

        const storage = await new Storage(auth).ready;

        const file = await storage.upload({ 
            name, 
            allowUploadBuffering: true 
        }, data).complete;

        const url = await file.link();

        await storage.close();

        return url;

    } catch (err) {
        console.error("MEGA upload error:", err.message);
        throw new Error(`Failed to upload to MEGA: ${err.message}`);
    }
};