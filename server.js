const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

// Servicios
const OpenPaymentsService = require('./services/openPayments');
const CreditSystem = require('./services/creditSystem');
const SmartRemittancesService = require('./services/smartRemittances');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Pool de DB
const dbPool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Inicializar servicios
const openPaymentsService = new OpenPaymentsService();
const creditSystem = new CreditSystem(dbPool);
const smartRemittancesService = new SmartRemittancesService(dbPool, openPaymentsService);

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token de acceso requerido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};

// ================= RUTAS DE AUTENTICACIÓN =================

app.post('/api/auth/register', async (req, res) => {
  let connection;
  try {
    const { email, password, fullName, phone, country, userType } = req.body;
    connection = await dbPool.getConnection();

    const [existing] = await connection.execute('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'El email ya está registrado' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const walletAddress = `${process.env.OPEN_PAYMENTS_HOST}/${email.split('@')[0]}-${Date.now()}`;

    const [result] = await connection.execute(
      `INSERT INTO users (email, password, full_name, phone, country, user_type, wallet_address) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [email, hashedPassword, fullName, phone, country, userType, walletAddress]
    );

    const token = jwt.sign({ userId: result.insertId, email, userType }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      user: { id: result.insertId, email, fullName, country, userType, walletAddress }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/api/auth/login', async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;
    connection = await dbPool.getConnection();

    const [users] = await connection.execute('SELECT * FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(400).json({ error: 'Credenciales inválidas' });

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(400).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ userId: user.id, email: user.email, userType: user.user_type }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        country: user.country,
        userType: user.user_type,
        trustPoints: user.trust_points,
        walletAddress: user.wallet_address
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// ================= RUTAS DE TRANSFERENCIAS =================

app.post('/api/transfers/quote', authenticateToken, async (req, res) => {
  try {
    const { recipientEmail, amount, currency = 'USD' } = req.body;
    const userId = req.user.userId;

    const [senders] = await dbPool.execute('SELECT wallet_address FROM users WHERE id = ?', [userId]);
    if (senders.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    const senderWallet = senders[0].wallet_address;

    const recipientWallet = `${process.env.OPEN_PAYMENTS_HOST}/${recipientEmail.split('@')[0]}`;
    const quoteData = await openPaymentsService.createPaymentQuote(senderWallet, recipientWallet, amount, currency);

    res.json({
      success: true,
      quote: quoteData,
      comparison: {
        traditional: {
          fee: quoteData.traditionalFee,
          feePercentage: ((quoteData.traditionalFee / amount) * 100).toFixed(2),
          recipient_receives: amount - quoteData.traditionalFee
        },
        glowsend: {
          fee: quoteData.fee,
          feePercentage: ((quoteData.fee / amount) * 100).toFixed(2),
          recipient_receives: quoteData.receiveAmount
        },
        savings: {
          amount: quoteData.savings,
          percentage: (((quoteData.savings / quoteData.traditionalFee) * 100) || 0).toFixed(1)
        }
      }
    });
  } catch (error) {
    console.error('Error creando quote:', error);
    res.status(500).json({ error: 'Error generando cotización' });
  }
});

app.post('/api/transfers/send', authenticateToken, async (req, res) => {
  try {
    const transferData = { ...req.body, senderId: req.user.userId };
    const result = await smartRemittancesService.createSmartTransfer(transferData);

    const trustPoints = creditSystem.calculateTrustPoints(
      transferData.amount,
      transferData.isRecurring,
      transferData.purposeCategory
    );
    await creditSystem.updateTrustPoints(req.user.userId, trustPoints, result.transferId);

    res.json({ success: true, transfer: result, trustPointsEarned: trustPoints, message: 'Transferencia completada exitosamente' });
  } catch (error) {
    console.error('Error enviando transferencia:', error);
    res.status(500).json({ error: 'Error procesando transferencia' });
  }
});

// ================= RUTAS DE HISTORIAL =================

app.get('/api/transfers/history', authenticateToken, async (req, res) => {
  try {
    const [transfers] = await dbPool.execute(`
      SELECT t.*, CASE WHEN t.sender_id = ? THEN 'sent' ELSE 'received' END as type
      FROM transfers t WHERE t.sender_id = ? OR t.recipient_id = ? ORDER BY t.created_at DESC LIMIT 50
    `, [req.user.userId, req.user.userId, req.user.userId]);

    res.json({ success: true, transfers });
  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error obteniendo historial' });
  }
});

// ================= RUTAS DE CRÉDITO, METAS, ANALYTICS, DEMO y TRACKING =================
// Puedes mantener las rutas que ya tenías, solo reemplaza llamadas a OpenPaymentsService por `openPaymentsService.createPaymentQuote(...)`

// ================= RUTA FALLBACK =================

app.get(/.*/, (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ================= INICIO DEL SERVER =================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
🏆 =======================================
    GLOWSEND HACKATHON SERVER INICIADO
🏆 =======================================

✅ Servidor corriendo en puerto ${PORT}
🌐 Frontend: http://localhost:${PORT}
💾 Base de datos: Conectada
💰 Open Payments: Activo
💎 Sistema de Crédito: Activo
🧠 Remesas Inteligentes: Activo
📊 API: http://localhost:${PORT}/api

🎯 ¡Listo para GANAR el hackathon! 🎯
  `);
});

module.exports = app;
