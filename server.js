require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const InterledgerService = require('./services/interledger');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// DB Config
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'remittance_db'
};

const pool = mysql.createPool(dbConfig);

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'tu_secret_key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// ============ RUTAS ============

// Registro
app.post('/api/register', async (req, res) => {
  let connection;
  try {
    const { email, password, full_name, phone, country } = req.body;
    
    connection = await pool.getConnection();
    
    const [existing] = await connection.execute(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Usuario ya existe' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await connection.execute(
      'INSERT INTO users (email, password, full_name, phone, country) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, full_name, phone, country]
    );
    
    // Crear wallet con Interledger
    const walletAddress = await InterledgerService.createWalletAddress(result.insertId, email);
    
    await connection.execute(
      'UPDATE users SET wallet_address = ? WHERE id = ?',
      [walletAddress.url, result.insertId]
    );
    
    const token = jwt.sign(
      { id: result.insertId, email: email },
      process.env.JWT_SECRET || 'tu_secret_key',
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'Usuario creado exitosamente',
      token: token,
      user: { 
        id: result.insertId, 
        email, 
        full_name,
        wallet_address: walletAddress.url
      }
    });
    
  } catch (error) {
    console.error('Error registro:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// Login
app.post('/api/login', async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;
    
    connection = await pool.getConnection();
    
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?', [email]
    );
    
    if (users.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }
    
    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'tu_secret_key',
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login exitoso',
      token: token,
      user: { 
        id: user.id, 
        email: user.email, 
        full_name: user.full_name,
        wallet_address: user.wallet_address
      }
    });
    
  } catch (error) {
    console.error('Error login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// Crear transferencia
app.post('/api/transfers', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { recipient_email, recipient_name, amount } = req.body;
    const sender_id = req.user.id;
    
    connection = await pool.getConnection();
    
    const [senders] = await connection.execute(
      'SELECT * FROM users WHERE id = ?', [sender_id]
    );
    
    const sender = senders[0];
    const fees = InterledgerService.calculateFees(amount);
    
    let senderWallet = sender.wallet_address;
    if (!senderWallet) {
      const walletData = await InterledgerService.createWalletAddress(sender_id, sender.email);
      senderWallet = walletData.url;
      
      await connection.execute(
        'UPDATE users SET wallet_address = ? WHERE id = ?',
        [senderWallet, sender_id]
      );
    }
    
    const receiverWallet = await InterledgerService.createWalletAddress(
      `recipient_${Date.now()}`, recipient_email
    );
    
    const incomingPayment = await InterledgerService.createIncomingPayment(
      receiverWallet.url, fees.recipientReceives
    );
    
    const outgoingPayment = await InterledgerService.createOutgoingPayment(
      senderWallet, receiverWallet.url, amount
    );
    
    const [result] = await connection.execute(
      `INSERT INTO transfers 
       (sender_id, recipient_email, recipient_name, amount, status, 
        traditional_fee, our_fee, savings, interledger_payment_id,
        wallet_address_sender, wallet_address_recipient) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender_id, recipient_email, recipient_name, amount, 'processing',
        fees.traditionalFee, fees.ourFee, fees.savings, outgoingPayment.id,
        senderWallet, receiverWallet.url
      ]
    );
    
    // Completar después de 5 segundos
    setTimeout(async () => {
      try {
        const conn = await pool.getConnection();
        await conn.execute(
          'UPDATE transfers SET status = ?, completed_at = NOW() WHERE id = ?',
          ['completed', result.insertId]
        );
        conn.release();
      } catch (err) {
        console.error('Error actualizando:', err);
      }
    }, 5000);
    
    res.status(201).json({
      message: 'Transferencia iniciada con Interledger',
      transfer_id: result.insertId,
      status: 'processing',
      fees: fees,
      interledger_payment_id: outgoingPayment.id,
      estimated_completion: '2-5 minutos'
    });
    
  } catch (error) {
    console.error('Error transferencia:', error);
    res.status(500).json({ error: 'Error del servidor: ' + error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener transferencias
app.get('/api/transfers', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    const [transfers] = await connection.execute(
      'SELECT * FROM transfers WHERE sender_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    
    res.json({ 
      transfers,
      summary: {
        total_transfers: transfers.length,
        total_sent: transfers.reduce((sum, t) => t.status === 'completed' ? sum + parseFloat(t.amount) : sum, 0),
        total_saved: transfers.reduce((sum, t) => t.status === 'completed' ? sum + parseFloat(t.savings || 0) : sum, 0)
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener transferencia específica
app.get('/api/transfers/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const transferId = req.params.id;
    
    connection = await pool.getConnection();
    
    const [transfers] = await connection.execute(
      'SELECT * FROM transfers WHERE id = ? AND sender_id = ?',
      [transferId, req.user.id]
    );
    
    if (transfers.length === 0) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }
    
    res.json({ 
      transfer: transfers[0],
      interledger_info: {
        network: 'Interledger Protocol',
        protocol: 'Open Payments',
        estimated_time: '2-5 minutes'
      }
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Error del servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'MiRemesa API funcionando',
    timestamp: new Date().toISOString(),
    interledger_ready: true
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 MiRemesa API en puerto ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`💡 Test: http://localhost:${PORT}/api/health`);
});
