# ⚡ Amazing Session Pairing

> Lightning-Fast WhatsApp Session Generator with Cloud Storage

[![GitHub Stars](https://img.shields.io/github/stars/NexusCoders-cyber/Amazing-Bot-?style=social)](https://github.com/NexusCoders-cyber/Amazing-Bot-)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org)

## 🌟 Features

✨ **Dual Pairing Methods**
- 📱 QR Code Scanning
- 🔢 Pair Code Entry

🚀 **Lightning Fast**
- Ultra-fast session generation
- Instant delivery to WhatsApp
- Optimized performance

🔒 **Secure & Reliable**
- MEGA cloud storage integration
- Automatic session cleanup
- Error handling & recovery

🎨 **Beautiful UI**
- Modern gradient design
- Smooth animations
- Responsive layout
- Mobile-friendly

## 📋 Prerequisites

- Node.js 20.0.0 or higher
- MEGA account (for session storage)
- WhatsApp account

## 🚀 Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/NexusCoders-cyber/Amazing-Bot-.git
cd Amazing-Bot-
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure MEGA

Edit `mega.js` and add your MEGA credentials:

```javascript
const auth = {
    email: 'your-email@example.com',
    password: 'your-password',
    userAgent: '...'
};
```

### 4. Start Server

```bash
npm start
```

Visit `http://localhost:8000` in your browser!

## 🌐 Deployment

### Deploy to Render

1. Fork this repository
2. Create new Web Service on [Render](https://render.com)
3. Connect your forked repository
4. Add environment variables (if needed)
5. Deploy!

### Deploy to Heroku

```bash
heroku create amazing-session-pairing
git push heroku main
```

### Deploy to Railway

1. Import repository to [Railway](https://railway.app)
2. Configure build settings
3. Deploy

## 📱 Usage

### QR Code Method

1. Click "QR Code Pairing"
2. Scan QR with WhatsApp
3. Receive session ID instantly

### Pair Code Method

1. Click "Pair Code Method"
2. Enter phone number with country code
3. Enter code in WhatsApp
4. Receive session ID

## 🔧 Configuration

### Port Configuration

Set custom port via environment variable:

```bash
PORT=3000 npm start
```

### Session Storage

Sessions are automatically:
- Uploaded to MEGA
- Sent to user's WhatsApp
- Cleaned up after delivery

## 🛠️ Technical Details

### Built With

- **Express.js** - Web framework
- **Baileys** - WhatsApp Web API
- **MEGA.js** - Cloud storage
- **QRCode** - QR generation
- **Pino** - Logging

### Project Structure

```
├── index.js          # Main server
├── pair.js           # Pair code logic
├── qr.js             # QR code logic
├── mega.js           # MEGA upload handler
├── main.html         # Landing page
├── pair.html         # Pair code page
├── qr.html           # QR code page
└── package.json      # Dependencies
```

## 🐛 Troubleshooting

### "ENOENT: no such file or directory"

**Fixed!** The application now automatically creates required directories.

### Session not delivered

1. Check MEGA credentials
2. Verify phone number format
3. Check internet connection
4. Review server logs

### Connection timeout

1. Restart server
2. Clear browser cache
3. Try different pairing method

## 📞 Support

Need help? Contact us:

- 📱 WhatsApp: [+2347075663318](https://wa.me/2347075663318)
- 🐙 GitHub: [@NexusCoders-cyber](https://github.com/NexusCoders-cyber)
- ⭐ Star the repo for support!

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 💖 Credits

**Crafted with 💜 by [NexusCoders](https://github.com/NexusCoders-cyber)**

Special thanks to:
- Baileys library developers
- MEGA.js contributors
- The WhatsApp bot community

## ⚠️ Disclaimer

This tool is for educational purposes. Use responsibly and comply with WhatsApp Terms of Service.

---

<div align="center">

**[⭐ Star this repository](https://github.com/NexusCoders-cyber/Amazing-Bot-)** if you found it helpful!

Made with ❤️ by NexusCoders

</div>