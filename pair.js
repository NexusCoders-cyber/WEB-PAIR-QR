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
    let sessionState = {
        isConnected: false,
        credsSaved: false,
        sessionDelivered: false
    };

    async function runSession() {
        let sock;
        let sessionTimeout;
        let connectionTimeout;

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
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 0,
                keepAliveIntervalMs: 10000,
                emitOwnEvents: false,
                getMessage: async () => undefined
            });

            if (!sock.authState.creds.registered) {
                await delay(1500);
                
                try {
                    const pairingCode = await sock.requestPairingCode(num);
                    const code = pairingCode?.match(/.{1,4}/g)?.join('-') || pairingCode;
                    
                    if (!codeSent && !res.headersSent) {
                        codeSent = true;
                        res.json({ code });
                        console.log(`📱 ${num} - Code sent: ${code}`);

                        connectionTimeout = setTimeout(() => {
                            if (!sessionState.isConnected) {
                                console.log(`⏱️ ${num} - Connection timeout`);
                                if (sock?.end) sock.end(undefined);
                                setTimeout(() => {
                                    removeFile(dirs);
                                    activeSessions.delete(num);
                                }, 3000);
                            }
                        }, 300000);
                    }
                } catch (err) {
                    console.error(`❌ ${num} - Code error:`, err.message);
                    if (!res.headersSent) {
                        res.status(503).json({ code: 'Failed to generate code' });
                    }
                    await removeFile(dirs);
                    activeSessions.delete(num);
                    return;
                }
            }

            sock.ev.on('creds.update', async () => {
                await saveCreds();
                sessionState.credsSaved = true;
            });

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === 'connecting') {
                    console.log(`🔄 ${num} - Connecting...`);
                }

                if (connection === 'open') {
                    sessionState.isConnected = true;
                    clearTimeout(connectionTimeout);
                    console.log(`✅ ${num} - Connected successfully!`);
                    
                    await delay(5000);
                    
                    const credsFile = `${dirs}/creds.json`;
                    
                    if (fs.existsSync(credsFile) && !sessionState.sessionDelivered) {
                        try {
                            console.log(`📤 ${num} - Processing session...`);
                            
                            const id = randomMegaId();
                            const credsData = await fs.readFile(credsFile);
                            const megaLink = await megaUpload(credsData, `${id}.json`);
                            const sessionCode = megaLink.replace('https://mega.nz/file/', '');

                            console.log(`✅ ${num} - Session uploaded successfully`);

                            const userJid = jidNormalizedUser(sock.user.id);
                            
                            await delay(2000);
                            const m1 = await sock.sendMessage(userJid, { 
                                text: `🔐 *Your Session ID*\n\n\`\`\`${sessionCode}\`\`\`\n\n_Keep this secure!_` 
                            });
                            
                            await delay(2000);
                            await sock.sendMessage(userJid, { 
                                text: MESSAGE,
                                quoted: m1 
                            });

                            sessionState.sessionDelivered = true;
                            console.log(`✅ ${num} - Session delivered to WhatsApp`);
                            
                            await delay(5000);
                            
                        } catch (err) {
                            console.error(`❌ ${num} - Delivery error:`, err.message);
                        } finally {
                            if (sock?.end) {
                                sock.end(undefined);
                            }
                            
                            setTimeout(async () => {
                                await removeFile(dirs);
                                activeSessions.delete(num);
                                console.log(`🧹 ${num} - Cleanup completed`);
                            }, 10000);
                        }
                    }
                }

                if (connection === 'close') {
                    clearTimeout(connectionTimeout);
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                    
                    console.log(`❌ ${num} - Connection closed: ${statusCode}`);
                    
                    if (!sessionState.isConnected && shouldReconnect && statusCode !== DisconnectReason.badSession) {
                        console.log(`🔄 ${num} - Attempting reconnect...`);
                        await delay(3000);
                        await runSession();
                        return;
                    }
                    
                    setTimeout(async () => {
                        await removeFile(dirs);
                        activeSessions.delete(num);
                    }, 5000);
                }
            });

        } catch (err) {
            console.error(`❌ ${num} - Session error:`, err.message);
            clearTimeout(connectionTimeout);
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
    const ignore = ['ENOENT', 'ECONNRESET', 'conflict', 'not-authorized', 'Stream Errored', 'Connection Closed', 'Timed Out'];
    if (!ignore.some(x => String(err).includes(x))) {
        console.log('Exception:', err.message);
    }
});

export default router;