import express from 'express';
import fs from 'fs-extra';
import pino from 'pino';
import pn from 'awesome-phonenumber';
import {
    makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
    DisconnectReason
} from '@whiskeysockets/baileys';
import { upload as megaUpload } from './mega.js';

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
• Ultra-Fast Pairing
• Secure MEGA Storage
• Auto Session Delivery

⚡ *Powered by NexusCoders*
`;

const activeSessions = new Map();

async function removeFile(path) {
    try {
        if (fs.existsSync(path)) {
            await fs.remove(path);
            return true;
        }
        return false;
    } catch (err) {
        console.error('Remove file error:', err);
        return false;
    }
}

function randomMegaId(len = 8, numLen = 4) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const number = Math.floor(Math.random() * Math.pow(10, numLen));
    return `${out}${number}`;
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    
    if (!num) {
        return res.status(400).json({ code: 'Phone number is required' });
    }

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const dirs = `./auth_sessions/${sessionId}`;

    try {
        await fs.ensureDir('./auth_sessions');
        await fs.ensureDir(dirs);
    } catch (err) {
        console.error('Directory creation error:', err);
        return res.status(500).json({ code: 'Failed to initialize session' });
    }

    num = num.replace(/[^0-9]/g, '');
    const phone = pn('+' + num);

    if (!phone.isValid()) {
        await removeFile(dirs);
        return res.status(400).json({ code: 'Invalid phone number format' });
    }

    num = phone.getNumber('e164').replace('+', '');

    if (activeSessions.has(num)) {
        return res.status(429).json({ code: 'Session already in progress' });
    }

    activeSessions.set(num, sessionId);

    let sessionTimeout;
    let codeSent = false;

    async function runSession() {
        let sock;
        try {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);
            const { version } = await fetchLatestBaileysVersion();

            sock = makeWASocket({
                version,
                auth: { 
                    creds: state.creds, 
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" })) 
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false,
                generateHighQualityLinkPreview: true,
                syncFullHistory: false,
                getMessage: async () => ({ conversation: 'Hi' })
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'open') {
                    clearTimeout(sessionTimeout);
                    await delay(3000);
                    
                    const credsFile = `${dirs}/creds.json`;
                    
                    if (fs.existsSync(credsFile)) {
                        try {
                            const id = randomMegaId();
                            const credsData = await fs.readFile(credsFile);
                            const megaLink = await megaUpload(credsData, `${id}.json`);
                            const sessionCode = megaLink.replace('https://mega.nz/file/', '');

                            const userJid = jidNormalizedUser(sock.user.id);
                            
                            await delay(2000);
                            const m1 = await sock.sendMessage(userJid, { 
                                text: `🔐 *Your Session ID*\n\n\`\`\`${sessionCode}\`\`\`\n\n_Keep this secure!_` 
                            });
                            
                            await delay(1000);
                            await sock.sendMessage(userJid, { 
                                text: MESSAGE,
                                quoted: m1 
                            });

                            console.log(`✅ Session sent to ${num}`);
                            
                            await delay(3000);
                            
                            if (sock && sock.end) {
                                sock.end({ reason: 'Session delivered' });
                            }
                        } catch (err) {
                            console.error('Session upload error:', err);
                        }
                    }
                    
                    setTimeout(async () => {
                        await removeFile(dirs);
                        activeSessions.delete(num);
                    }, 10000);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const reason = lastDisconnect?.error?.output?.payload?.error;
                    
                    console.log(`Connection closed: ${statusCode} - ${reason || 'unknown'}`);
                    
                    setTimeout(async () => {
                        await removeFile(dirs);
                        activeSessions.delete(num);
                    }, 5000);
                    
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        console.log('Logged out or unauthorized');
                    } else if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
                        console.log('Restart required');
                    }
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(2000);
                try {
                    const pairingCode = await sock.requestPairingCode(num);
                    let code = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
                    
                    if (!codeSent && !res.headersSent) {
                        codeSent = true;
                        res.json({ code });
                        console.log(`📱 Pairing code sent for ${num}: ${code}`);
                    }
                } catch (err) {
                    console.error('Pairing code error:', err);
                    if (!res.headersSent) {
                        res.status(503).json({ code: 'Failed to generate pairing code' });
                    }
                    await removeFile(dirs);
                    activeSessions.delete(num);
                    return;
                }
            }

            sessionTimeout = setTimeout(async () => {
                console.log(`⏱️ Session timeout for ${num}`);
                if (sock && sock.end) {
                    sock.end({ reason: 'Timeout' });
                }
                await removeFile(dirs);
                activeSessions.delete(num);
            }, 180000);

        } catch (err) {
            console.error('Session error:', err);
            await removeFile(dirs);
            activeSessions.delete(num);
            if (!res.headersSent) {
                res.status(503).json({ code: 'Service temporarily unavailable' });
            }
        }
    }

    await runSession();
});

process.on('uncaughtException', err => {
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