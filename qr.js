import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import QRCode from 'qrcode';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion, delay, DisconnectReason } from '@whiskeysockets/baileys';
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
        return res.status(500).json({ code: 'Failed to initialize session' });
    }

    let responseSent = false;
    let sessionState = {
        qrGenerated: false,
        isConnected: false,
        sessionDelivered: false
    };

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);
        let connectionTimeout;

        try {
            const { version } = await fetchLatestBaileysVersion();

            let sock = makeWASocket({
                version,
                logger: pino({ level: 'silent' }),
                browser: Browsers.windows('Chrome'),
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
                },
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: false,
                getMessage: async () => undefined
            });

            const handleQRCode = async (qr) => {
                if (sessionState.qrGenerated || responseSent) return;
                sessionState.qrGenerated = true;

                try {
                    const qrDataURL = await QRCode.toDataURL(qr, { 
                        errorCorrectionLevel: 'H',
                        width: 300,
                        margin: 2
                    });
                    
                    if (!responseSent) {
                        responseSent = true;
                        res.json({
                            qr: qrDataURL,
                            message: '🎯 QR Code Ready! Scan Now',
                            instructions: [
                                'Open WhatsApp on your phone',
                                'Go to Settings > Linked Devices',
                                'Tap "Link a Device"',
                                'Scan the QR code above',
                                'Wait for session delivery'
                            ]
                        });
                        console.log('✅ QR Code generated and sent');

                        connectionTimeout = setTimeout(() => {
                            if (!sessionState.isConnected) {
                                console.log('⏱️ QR scan timeout');
                                if (sock?.end) sock.end(undefined);
                                setTimeout(() => removeFile(dirs), 3000);
                            }
                        }, 300000);
                    }
                } catch (err) {
                    console.error('QR generation error:', err);
                    if (!responseSent) {
                        res.status(500).json({ code: 'QR generation failed' });
                    }
                }
            };

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr && !sessionState.qrGenerated) {
                    await handleQRCode(qr);
                }

                if (connection === 'connecting') {
                    console.log('🔄 QR - Connecting...');
                }

                if (connection === 'open') {
                    sessionState.isConnected = true;
                    clearTimeout(connectionTimeout);
                    console.log('✅ QR - Connected successfully!');
                    
                    await delay(5000);
                    
                    if (!sessionState.sessionDelivered) {
                        try {
                            const credsFile = `${dirs}/creds.json`;
                            
                            if (fs.existsSync(credsFile)) {
                                console.log('📤 QR - Processing session...');
                                
                                const credsData = await fs.readFile(credsFile);
                                const timestamp = Date.now();
                                const megaUrl = await upload(credsData, `session_${timestamp}.json`);
                                const sessionCode = megaUrl.replace('https://mega.nz/file/', '');

                                console.log('✅ QR - Session uploaded successfully');

                                const userJid = jidNormalizedUser(sock.user.id);
                                
                                await delay(2000);
                                const msg = await sock.sendMessage(userJid, { 
                                    text: `🔐 *Your Session ID*\n\n\`\`\`${sessionCode}\`\`\`\n\n_Keep this secure!_` 
                                });
                                
                                await delay(2000);
                                await sock.sendMessage(userJid, { 
                                    text: MESSAGE, 
                                    quoted: msg 
                                });

                                sessionState.sessionDelivered = true;
                                console.log('✅ QR - Session delivered to WhatsApp');
                                
                                await delay(5000);
                            }
                        } catch (err) {
                            console.error('❌ QR - Delivery error:', err.message);
                        } finally {
                            if (sock?.end) {
                                sock.end(undefined);
                            }
                            
                            setTimeout(async () => {
                                await removeFile(dirs);
                                console.log('🧹 QR - Cleanup completed');
                            }, 10000);
                        }
                    }
                }

                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`❌ QR - Connection closed: ${statusCode}`);
                    
                    if (!sessionState.isConnected && shouldReconnect && statusCode !== DisconnectReason.badSession) {
                        console.log('🔄 QR - Attempting reconnect...');
                        await delay(3000);
                        await initiateSession();
                        return;
                    }
                    
                    setTimeout(() => removeFile(dirs), 5000);
                }
            });

        } catch (err) {
            console.error('❌ QR - Session error:', err.message);
            clearTimeout(connectionTimeout);
            if (!res.headersSent) {
                res.status(503).json({ code: 'Service unavailable' });
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