import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion, delay } from '@whiskeysockets/baileys';
import { upload } from './mega.js';

const router = express.Router();

const MESSAGE = `
*✨ SESSION GENERATED SUCCESSFULLY ✨*

╔══════════════════════╗
║  AMAZING SESSION     ║
║  PAIRING SYSTEM      ║
╚══════════════════════╝

🌟 *Star The Repository*
https://github.com/NexusCoders-cyber/Amazing-Bot-

💬 *Support & Updates*
Contact: +2347075663318

🎯 *Features*
• Lightning Fast QR Scan
• Secure MEGA Storage
• Instant Session Delivery

⚡ *Powered by NexusCoders*
`;

async function removeFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            await fs.remove(filePath);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Remove error:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    const sessionId = `qr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const dirs = `./qr_sessions/${sessionId}`;
    
    try {
        await fs.ensureDir('./qr_sessions');
        await fs.ensureDir(dirs);
    } catch (err) {
        console.error('Directory error:', err);
        return res.status(500).send({ code: 'Failed to initialize session' });
    }

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        let responseSent = false;
        let qrGenerated = false;

        try {
            const { version } = await fetchLatestBaileysVersion();

            let sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })),
                },
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async () => ({ conversation: 'Hi' })
            });

            const handleQRCode = async (qr) => {
                if (qrGenerated || responseSent) return;
                qrGenerated = true;

                try {
                    const qrDataURL = await QRCode.toDataURL(qr, { 
                        errorCorrectionLevel: 'H',
                        width: 300,
                        margin: 2
                    });
                    
                    if (!responseSent) {
                        responseSent = true;
                        res.send({
                            qr: qrDataURL,
                            message: '🎯 QR Code Ready! Scan Now',
                            instructions: [
                                '1. Open WhatsApp on your phone',
                                '2. Go to Settings > Linked Devices',
                                '3. Tap "Link a Device"',
                                '4. Scan the QR code above',
                                '5. Wait for session delivery'
                            ]
                        });
                    }
                } catch (err) {
                    console.error('QR generation error:', err);
                    if (!responseSent) {
                        res.status(500).send({ code: 'QR generation failed' });
                    }
                }
            };

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !qrGenerated) {
                    await handleQRCode(qr);
                }

                if (connection === 'open') {
                    await delay(2000);
                    
                    try {
                        const credsFile = `${dirs}/creds.json`;
                        
                        if (fs.existsSync(credsFile)) {
                            const credsData = await fs.readFile(credsFile);
                            const timestamp = Date.now();
                            const megaUrl = await upload(credsData, `session_${timestamp}.json`);
                            const sessionId = megaUrl.replace('https://mega.nz/file/', '');

                            console.log('✅ Session uploaded:', sessionId);

                            const userJid = jidNormalizedUser(sock.user.id);
                            
                            await delay(1000);
                            const msg = await sock.sendMessage(userJid, { 
                                text: `🔐 *Your Session ID*\n\n\`\`\`${sessionId}\`\`\`\n\n_Keep this secure!_` 
                            });
                            
                            await delay(500);
                            await sock.sendMessage(userJid, { 
                                text: MESSAGE, 
                                quoted: msg 
                            });

                            await delay(3000);
                            await sock.logout();
                        }
                        
                        setTimeout(() => removeFile(dirs), 5000);
                    } catch (err) {
                        console.error('Session send error:', err);
                        await removeFile(dirs);
                    }
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    if (statusCode === 401 || statusCode === 403) {
                        await removeFile(dirs);
                    } else {
                        await delay(2000);
                        await removeFile(dirs);
                    }
                }
            });

            sock.ev.on('creds.update', saveCreds);

            setTimeout(async () => {
                if (!responseSent) {
                    res.status(408).send({ code: 'QR timeout - please try again' });
                }
                await removeFile(dirs);
            }, 60000);

        } catch (err) {
            console.error('Session initialization error:', err);
            if (!res.headersSent) {
                res.status(503).send({ code: 'Service unavailable' });
            }
            await removeFile(dirs);
        }
    }

    await initiateSession();
});

process.on('uncaughtException', (err) => {
    const e = String(err);
    const ignore = [
        "conflict", "not-authorized", "Socket connection timeout",
        "rate-overlimit", "Connection Closed", "Timed Out",
        "Value not found", "Stream Errored", "ENOENT"
    ];
    
    if (!ignore.some(x => e.includes(x))) {
        console.log('Exception:', err.message);
    }
});

export default router;