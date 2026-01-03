import { Storage } from 'megajs';

const auth = {
    email: process.env.MEGA_EMAIL || 'ilomraphael@gmail.com',
    password: process.env.MEGA_PASSWORD || 'Isaiahilom@1234',
    userAgent: 'AmazingSessionPairing/2.0'
};

export const testMegaConnection = async () => {
    try {
        console.log('🔍 Testing MEGA connection...');
        
        const storage = await new Storage({
            email: auth.email,
            password: auth.password,
            userAgent: auth.userAgent,
            autologin: true,
            autoload: false,
            keepalive: false
        }).ready;

        console.log('✅ MEGA authentication successful!');
        console.log('👤 User:', storage.name);
        
        await storage.close();
        return true;
    } catch (err) {
        console.error('❌ MEGA authentication failed!');
        console.error('Error:', err.message);
        
        if (err.message.includes('EARGS')) {
            console.error('⚠️  Invalid email or password');
        } else if (err.message.includes('ETOOMANY')) {
            console.error('⚠️  Too many login attempts. Wait and try again.');
        } else if (err.message.includes('2FA')) {
            console.error('⚠️  Two-factor authentication is enabled.');
        }
        
        return false;
    }
};

export const upload = async (data, name) => {
    const maxRetries = 3;
    let attempt = 0;
    let lastError;

    while (attempt < maxRetries) {
        attempt++;
        try {
            console.log(`📤 Upload attempt ${attempt}/${maxRetries} for ${name}`);

            if (!auth.email || !auth.password || auth.email === 'your-mega-email@example.com') {
                throw new Error("MEGA credentials not configured");
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

            const storage = await new Storage({
                email: auth.email,
                password: auth.password,
                userAgent: auth.userAgent,
                autologin: true,
                autoload: true,
                keepalive: false
            }).ready;

            console.log('✅ MEGA authenticated for upload');

            const file = await storage.upload({ 
                name, 
                allowUploadBuffering: true 
            }, data).complete;

            console.log('✅ File uploaded successfully');

            const url = await file.link();
            console.log('✅ Share link generated');

            await storage.close();

            return url;

        } catch (err) {
            lastError = err;
            console.error(`❌ Upload attempt ${attempt} failed:`, err.message);

            if (err.message.includes('EARGS')) {
                throw new Error('MEGA authentication failed. Check credentials.');
            }

            if (err.message.includes('ETOOMANY')) {
                throw new Error('Too many requests to MEGA. Wait 5 minutes.');
            }

            if (attempt < maxRetries) {
                const waitTime = 2000 * attempt;
                console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
    }

    throw new Error(`Upload failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
};