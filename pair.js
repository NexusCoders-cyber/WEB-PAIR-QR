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
        return res.status(400).json({ code: 'Phone number required' });
    }

    num = num.replace(/[^0-9]/g, '');
    
    if (num.length < 10 || num.length > 15) {
        return res.status(400).json({ code: 'Invalid phone number' });
    }

    const phone = pn('+' + num);
    if (!phone.isValid()) {
        return res.status(400).json({ code: 'Invalid phone number format' });
    }

    num = phone.getNumber('e164').replace('+', '');

    if (activeSessions.has(num)) {
        const existingSession = activeSessions.get(num);
        const now = Date.now();
        if (now - existingSession.timestamp < 120000) {
            return res.status(429).json({ code: 'Wait 2 minutes before trying again' });
        }
        activeSessions.delete(num);
    }

    const sessionId = `pair_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const dirs = `./auth_sessions/${sessionId}`;

    try {
        await fs.ensureDir('./auth_sessions');
        await fs.ensureDir(dirs);
    } catch (err) {
        console.error('Directory error:', err);
        return res.status(500).json({ code: 'Server error. Try again.' });
    }

    activeSessions.set(num, { sessionId, timestamp: Date.now() });

    let codeSent = false;
    let isConnected = false;
    let reconnectAttempts = 0;

    async function runSession() {
        let sock;
        let sessionTimeout;

        try {
            const { state, saveCreds } = await useMultiFileAuthState(dirs);
            const { version } = await fetchLatestBaileysVersion();

            sock = makeWASocket({
                version,
                auth: { 
                    creds: state.creds, 
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) 
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }),
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 120000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 500,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                shouldIgnoreJid: () => false,
                getMessage: async () => undefined
            });

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, isNewLogin, qr } = update;

                if (connection === 'connecting') {
                    console.log(`🔄 ${num} - Connecting...`);
                }

                if (connection === 'open') {
                    isConnected = true;
                    reconnectAttempts = 0;
                    console.log(`✅ ${num} - Connected!`);
                    clearTimeout(sessionTimeout);
                    
                    await delay(8000);
                    
                    const credsFile = `${dirs}/creds.json`;
                    
                    if (fs.existsSync(credsFile)) {
                        try {
                            console.log(`📤 ${num} - Uploading session...`);
                            
                            const id = randomMegaId();
                            const credsData = await fs.readFile(credsFile);
                            const megaLink = await megaUpload(credsData, `${id}.json`);
                            const sessionCode = megaLink.replace('https://mega.nz/file/', '');

                            console.log(`✅ ${num} - Session uploaded: ${sessionCode}`);

                            const userJid = jidNormalizedUser(sock.user.id);
                            
                            await delay(3000);
                            const m1 = await sock.sendMessage(userJid, { 
                                text: `🔐 *Your Session ID*\n\n\`\`\`${sessionCode}\`\`\`\n\n_Keep this secure!_` 
                            });
                            
                            await delay(2000);
                            await sock.sendMessage(userJid, { 
                                text: MESSAGE,
                                quoted: m1 
                            });

                            console.log(`✅ ${num} - Session sent to WhatsApp!`);
                            
                            await delay(3000);
                            
                            if (sock?.end) {
                                sock.end(undefined);
                            }
                        } catch (err) {
                            console.error(`❌ ${num} - Upload error:`, err.message);
                        }
                    } else {
                        console.error(`❌ ${num} - Creds file not found`);
                    }
                    
                    setTimeout(async () => {
                        await removeFile(dirs);
                        activeSessions.delete(num);
                    }, 15000);
                }

                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    
                    console.log(`❌ ${num} - Closed: ${statusCode}`);
                    
                    if (statusCode === DisconnectReason.connectionReplaced || statusCode === DisconnectReason.multideviceMismatch) {
                        console.log(`🔄 ${num} - Reconnecting...`);
                        if (reconnectAttempts < 3 && !isConnected) {
                            reconnectAttempts++;
                            await delay(2000);
                            await runSession();
                            return;
                        }
                    }
                    
                    clearTimeout(sessionTimeout);
                    
                    setTimeout(async () => {
                        await removeFile(dirs);
                        activeSessions.delete(num);
                    }, 5000);
                }
            });

            if (!sock.authState.creds.registered) {
                await delay(2000);
                
                try {
                    const pairingCode = await sock.requestPairingCode(num);
                    const code = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
                    
                    if (!codeSent && !res.headersSent) {
                        codeSent = true;
                        res.json({ code });
                        console.log(`📱 ${num} - Code: ${code}`);
                    }

                    sessionTimeout = setTimeout(async () => {
                        if (!isConnected) {
                            console.log(`⏱️ ${num} - Timeout (code not used)`);
                            if (sock?.end) {
                                sock.end(undefined);
                            }
                            await removeFile(dirs);
                            activeSessions.delete(num);
                        }
                    }, 180000);

                } catch (err) {
                    console.error(`❌ ${num} - Code error:`, err.message);
                    if (!res.headersSent) {
                        res.status(503).json({ code: 'Failed to generate code' });
                    }
                    await removeFile(dirs);
                    activeSessions.delete(num);
                }
            }

        } catch (err) {
            console.error(`❌ ${num} - Session error:`, err.message);
            await removeFile(dirs);
            activeSessions.delete(num);
            if (!res.headersSent) {
                res.status(503).json({ code: 'Service error. Try again.' });
            }
        }
    }

    await runSession();
});

process.on('uncaughtException', err => {
    const ignore = ['ENOENT', 'ECONNRESET', 'conflict', 'not-authorized', 'Stream Errored', 'Connection Closed'];
    if (!ignore.some(x => String(err).includes(x))) {
        console.log('Exception:', err.message);
    }
});

export default router;