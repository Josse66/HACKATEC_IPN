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
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Configuración de base de datos
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'remittance_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.header('Authorization');
  const token = authHeader && authHeader.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Token de acceso requerido'
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'miremesa_super_secret_key_2025');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Error validando token:', error.message);
    res.status(403).json({ 
      error: 'Token inválido o expirado'
    });
  }
};

// Test de conexión
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL - Base de datos: remittance_db');
    connection.release();
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
  }
};

// RUTAS

// Health check
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const connection = await pool.getConnection();
    connection.release();
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'error: ' + error.message;
  }

  res.json({
    status: 'OK',
    message: 'MiRemesa API funcionando',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    interledger_ready: true,
    project: 'HACKATEC_IPN'
  });
});

// Registro
app.post('/api/register', async (req, res) => {
  let connection;
  try {
    const { email, password, full_name, phone, country } = req.body;
    
    if (!email || !password || !full_name || !country) {
      return res.status(400).json({ 
        error: 'Datos requeridos faltantes'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    connection = await pool.getConnection();
    
    const [existingUsers] = await connection.execute(
      'SELECT id FROM users WHERE email = ?', 
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        error: 'El usuario ya existe'
      });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await connection.execute(
      'INSERT INTO users (email, password, full_name, phone, country) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, full_name, phone || null, country]
    );
    
    // Crear wallet
    const walletAddress = await InterledgerService.createWalletAddress(result.insertId, email);
    
    await connection.execute(
      'UPDATE users SET wallet_address = ? WHERE id = ?',
      [walletAddress.url, result.insertId]
    );
    
    const token = jwt.sign(
      { 
        id: result.insertId, 
        email: email,
        full_name: full_name 
      },
      process.env.JWT_SECRET || 'miremesa_super_secret_key_2025',
      { expiresIn: '24h' }
    );
    
    console.log(`✅ Usuario registrado: ${email}`);
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      token: token,
      user: { 
        id: result.insertId, 
        email, 
        full_name,
        wallet_address: walletAddress.url
      }
    });
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Login
app.post('/api/login', async (req, res) => {
  let connection;
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email y contraseña son requeridos'
      });
    }
    
    connection = await pool.getConnection();
    
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE email = ?', 
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ 
        error: 'Usuario no encontrado'
      });
    }
    
    const user = users[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Contraseña incorrecta'
      });
    }
    
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email,
        full_name: user.full_name
      },
      process.env.JWT_SECRET || 'miremesa_super_secret_key_2025',
      { expiresIn: '24h' }
    );
    
    console.log(`✅ Login exitoso: ${email}`);
    
    res.json({
      success: true,
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
    console.error('Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor'
    });
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
    
    if (!recipient_email || !recipient_name || !amount) {
      return res.status(400).json({ 
        error: 'Datos requeridos faltantes'
      });
    }

    const transferAmount = parseFloat(amount);
    if (transferAmount < 1 || transferAmount > 10000) {
      return res.status(400).json({ 
        error: 'Monto debe estar entre $1 y $10,000 USD'
      });
    }
    
    connection = await pool.getConnection();
    
    const [senders] = await connection.execute(
      'SELECT * FROM users WHERE id = ?', 
      [sender_id]
    );
    
    const sender = senders[0];
    const fees = InterledgerService.calculateFees(transferAmount);
    
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
      `recipient_${Date.now()}`, 
      recipient_email
    );
    
    const incomingPayment = await InterledgerService.createIncomingPayment(
      receiverWallet.url, 
      fees.recipientReceives
    );
    
    const outgoingPayment = await InterledgerService.createOutgoingPayment(
      senderWallet, 
      receiverWallet.url, 
      transferAmount
    );
    
    const [result] = await connection.execute(
      `INSERT INTO transfers 
       (sender_id, recipient_email, recipient_name, amount, currency, status, 
        traditional_fee, our_fee, savings, interledger_payment_id,
        wallet_address_sender, wallet_address_recipient) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender_id, 
        recipient_email, 
        recipient_name, 
        transferAmount,
        'USD',
        'processing',
        fees.traditionalFee, 
        fees.ourFee, 
        fees.savings, 
        outgoingPayment.id,
        senderWallet, 
        receiverWallet.url
      ]
    );
    
    console.log(`✅ Transferencia creada con ID: ${result.insertId}`);
    
    // Auto-completar después de 5 segundos
    setTimeout(async () => {
      try {
        const conn = await pool.getConnection();
        await conn.execute(
          'UPDATE transfers SET status = ?, completed_at = NOW() WHERE id = ?',
          ['completed', result.insertId]
        );
        conn.release();
        console.log(`✅ Transferencia ${result.insertId} completada`);
      } catch (err) {
        console.error('Error actualizando transferencia:', err);
      }
    }, 5000);
    
    res.status(201).json({
      success: true,
      message: 'Transferencia iniciada exitosamente',
      transfer_id: result.insertId,
      status: 'processing',
      fees: fees,
      interledger_payment_id: outgoingPayment.id,
      estimated_completion: '2-5 minutos'
    });
    
  } catch (error) {
    console.error('Error creando transferencia:', error);
    res.status(500).json({ 
      error: 'Error procesando transferencia'
    });
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
      `SELECT * FROM transfers WHERE sender_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    
    const completedTransfers = transfers.filter(t => t.status === 'completed');
    const summary = {
      total_transfers: transfers.length,
      total_sent: completedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
      total_saved: completedTransfers.reduce((sum, t) => sum + parseFloat(t.savings || 0), 0)
    };
    
    res.json({ 
      success: true,
      transfers: transfers,
      summary: summary
    });
    
  } catch (error) {
    console.error('Error obteniendo transferencias:', error);
    res.status(500).json({ 
      error: 'Error obteniendo historial'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener transferencia específica
app.get('/api/transfers/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const transferId = parseInt(req.params.id);
    
    if (!transferId) {
      return res.status(400).json({ 
        error: 'ID de transferencia inválido'
      });
    }
    
    connection = await pool.getConnection();
    
    const [transfers] = await connection.execute(
      'SELECT * FROM transfers WHERE id = ? AND sender_id = ?',
      [transferId, req.user.id]
    );
    
    if (transfers.length === 0) {
      return res.status(404).json({ 
        error: 'Transferencia no encontrada'
      });
    }
    
    res.json({ 
      success: true,
      transfer: transfers[0],
      interledger_info: {
        network: 'Interledger Protocol',
        protocol: 'Open Payments',
        estimated_time: '2-5 minutes'
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo transferencia:', error);
    res.status(500).json({ 
      error: 'Error obteniendo detalles'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Iniciar servidor
const startServer = async () => {
  try {
    await testConnection();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 MiRemesa API - HACKATEC_IPN`);
      console.log(`📍 Servidor: http://localhost:${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
      console.log(`💾 Database: remittance_db`);
      console.log(`🕒 Started: ${new Date().toISOString()}\n`);
    });
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

startServer();
