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

// Configuración de base de datos para HACKATEC_IPN
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
      error: 'Token de acceso requerido',
      message: 'Debe incluir Authorization: Bearer <token>'
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'miremesa_super_secret_key_2025');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Error validando token:', error.message);
    res.status(403).json({ 
      error: 'Token inválido o expirado',
      message: 'Por favor inicia sesión nuevamente'
    });
  }
};

// Test de conexión a base de datos
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL - Base de datos: remittance_db');
    connection.release();
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
  }
};

// ============ RUTAS DE LA API ============

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
    project: 'HACKATEC_IPN',
    version: '1.0.0'
  });
});

// Registro de usuario
app.post('/api/register', async (req, res) => {
  let connection;
  try {
    const { email, password, full_name, phone, country } = req.body;
    
    // Validaciones básicas
    if (!email || !password || !full_name || !country) {
      return res.status(400).json({ 
        error: 'Datos requeridos faltantes',
        required: ['email', 'password', 'full_name', 'country']
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'La contraseña debe tener al menos 6 caracteres'
      });
    }
    
    connection = await pool.getConnection();
    
    // Verificar si el usuario ya existe
    const [existingUsers] = await connection.execute(
      'SELECT id, email FROM users WHERE email = ?', 
      [email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        error: 'El usuario ya existe',
        message: 'Ya existe una cuenta con este email'
      });
    }
    
    // Encriptar contraseña
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Crear usuario
    const [result] = await connection.execute(
      'INSERT INTO users (email, password, full_name, phone, country) VALUES (?, ?, ?, ?, ?)',
      [email, hashedPassword, full_name, phone || null, country]
    );
    
    // Crear wallet address con Interledger
    const walletAddress = await InterledgerService.createWalletAddress(result.insertId, email);
    
    // Actualizar usuario con wallet address
    await connection.execute(
      'UPDATE users SET wallet_address = ? WHERE id = ?',
      [walletAddress.url, result.insertId]
    );
    
    // Generar JWT token
    const token = jwt.sign(
      { 
        id: result.insertId, 
        email: email,
        full_name: full_name 
      },
      process.env.JWT_SECRET || 'miremesa_super_secret_key_2025',
      { expiresIn: '24h' }
    );
    
    console.log(`✅ Usuario registrado: ${email} (ID: ${result.insertId})`);
    
    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      token: token,
      user: { 
        id: result.insertId, 
        email, 
        full_name,
        phone,
        country,
        wallet_address: walletAddress.url,
        created_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo crear la cuenta. Intenta nuevamente.'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Login de usuario
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
    
    // Buscar usuario
    const [users] = await connection.execute(
      'SELECT id, email, password, full_name, phone, country, wallet_address, created_at FROM users WHERE email = ?', 
      [email]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ 
        error: 'Credenciales incorrectas',
        message: 'Usuario no encontrado'
      });
    }
    
    const user = users[0];
    
    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ 
        error: 'Credenciales incorrectas',
        message: 'Contraseña incorrecta'
      });
    }
    
    // Generar token
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
        phone: user.phone,
        country: user.country,
        wallet_address: user.wallet_address,
        member_since: user.created_at
      }
    });
    
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      message: 'No se pudo procesar el login'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Crear nueva transferencia
app.post('/api/transfers', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { recipient_email, recipient_name, amount } = req.body;
    const sender_id = req.user.id;
    
    // Validaciones
    if (!recipient_email || !recipient_name || !amount) {
      return res.status(400).json({ 
        error: 'Datos requeridos faltantes',
        required: ['recipient_email', 'recipient_name', 'amount']
      });
    }

    const transferAmount = parseFloat(amount);
    if (transferAmount < 1 || transferAmount > 10000) {
      return res.status(400).json({ 
        error: 'Monto inválido',
        message: 'El monto debe estar entre $1 y $10,000 USD'
      });
    }
    
    connection = await pool.getConnection();
    
    // Obtener información del remitente
    const [senders] = await connection.execute(
      'SELECT * FROM users WHERE id = ?', 
      [sender_id]
    );
    
    if (senders.length === 0) {
      return res.status(404).json({ error: 'Usuario remitente no encontrado' });
    }
    
    const sender = senders[0];
    
    // Calcular fees usando Interledger Service
    const fees = InterledgerService.calculateFees(transferAmount);
    
    console.log(`💰 Calculando fees para $${transferAmount}:`, fees);
    
    // Verificar/crear wallet del remitente
    let senderWallet = sender.wallet_address;
    if (!senderWallet) {
      const walletData = await InterledgerService.createWalletAddress(sender_id, sender.email);
      senderWallet = walletData.url;
      
      await connection.execute(
        'UPDATE users SET wallet_address = ? WHERE id = ?',
        [senderWallet, sender_id]
      );
    }
    
    // Crear wallet para el destinatario
    const receiverWallet = await InterledgerService.createWalletAddress(
      `recipient_${Date.now()}`, 
      recipient_email
    );
    
    // Simular proceso Interledger
    console.log(`🚀 Iniciando transferencia Interledger: $${transferAmount} USD`);
    
    const incomingPayment = await InterledgerService.createIncomingPayment(
      receiverWallet.url, 
      fees.recipientReceives
    );
    
    const outgoingPayment = await InterledgerService.createOutgoingPayment(
      senderWallet, 
      receiverWallet.url, 
      transferAmount
    );
    
    // Guardar transferencia en base de datos
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
    
    // Simular completación de transferencia después de 5 segundos
    setTimeout(async () => {
      try {
        const conn = await pool.getConnection();
        await conn.execute(
          'UPDATE transfers SET status = ?, completed_at = NOW() WHERE id = ?',
          ['completed', result.insertId]
        );
        conn.release();
        console.log(`✅ Transferencia ${result.insertId} completada automáticamente`);
      } catch (err) {
        console.error('Error actualizando transferencia:', err);
      }
    }, 5000);
    
    res.status(201).json({
      success: true,
      message: 'Transferencia iniciada exitosamente',
      transfer: {
        id: result.insertId,
        status: 'processing',
        amount: transferAmount,
        currency: 'USD',
        recipient_name: recipient_name,
        recipient_email: recipient_email,
        fees: fees,
        interledger_payment_id: outgoingPayment.id,
        estimated_completion: '2-5 minutos',
        created_at: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error creando transferencia:', error);
    res.status(500).json({ 
      error: 'Error procesando transferencia',
      message: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener historial de transferencias del usuario
app.get('/api/transfers', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    // Obtener todas las transferencias del usuario
    const [transfers] = await connection.execute(
      `SELECT id, recipient_email, recipient_name, amount, currency, status, 
              traditional_fee, our_fee, savings, interledger_payment_id,
              created_at, completed_at
       FROM transfers 
       WHERE sender_id = ? 
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    
    // Calcular resumen
    const completedTransfers = transfers.filter(t => t.status === 'completed');
    const summary = {
      total_transfers: transfers.length,
      completed_transfers: completedTransfers.length,
      total_sent: completedTransfers.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
      total_saved: completedTransfers.reduce((sum, t) => sum + parseFloat(t.savings || 0), 0),
      total_fees_paid: completedTransfers.reduce((sum, t) => sum + parseFloat(t.our_fee || 0), 0)
    };
    
    res.json({ 
      success: true,
      transfers: transfers,
      summary: summary,
      user_id: req.user.id
    });
    
  } catch (error) {
    console.error('Error obteniendo transferencias:', error);
    res.status(500).json({ 
      error: 'Error obteniendo historial',
      message: 'No se pudo cargar el historial de transferencias'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Obtener detalles de una transferencia específica
app.get('/api/transfers/:id', authenticateToken, async (req, res) => {
  let connection;
  try {
    const transferId = parseInt(req.params.id);
    
    if (!transferId || transferId < 1) {
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
        error: 'Transferencia no encontrada',
        message: 'La transferencia no existe o no tienes permisos para verla'
      });
    }
    
    const transfer = transfers[0];
    
    res.json({ 
      success: true,
      transfer: transfer,
      interledger_info: {
        network: 'Interledger Protocol',
        protocol: 'Open Payments v1.0',
        estimated_time: '2-5 minutos',
        wallet_sender: transfer.wallet_address_sender,
        wallet_recipient: transfer.wallet_address_recipient
      }
    });
    
  } catch (error) {
    console.error('Error obteniendo transferencia:', error);
    res.status(500).json({ 
      error: 'Error obteniendo detalles',
      message: 'No se pudieron cargar los detalles de la transferencia'
    });
  } finally {
    if (connection) connection.release();
  }
});

// Ruta para obtener perfil del usuario
app.get('/api/profile', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    
    const [users] = await connection.execute(
      'SELECT id, email, full_name, phone, country, wallet_address, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json({
      success: true,
      user: users[0]
    });
    
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error obteniendo perfil' });
  } finally {
    if (connection) connection.release();
  }
});

// Manejador de rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint no encontrado',
    message: `La ruta ${req.method} ${req.baseUrl} no existe`,
    available_endpoints: {
      'GET': ['/api/health', '/api/transfers', '/api/transfers/:id', '/api/profile'],
      'POST': ['/api/register', '/api/login', '/api/transfers']
    }
  });
});

// Manejador global de errores
app.use((error, req, res, next) => {
  console.error('Error no manejado:', error);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: 'Algo salió mal. Por favor intenta nuevamente.'
  });
});

// Iniciar servidor
const startServer = async () => {
  try {
    await testConnection();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 MiRemesa API - HACKATEC_IPN`);
      console.log(`📍 Servidor corriendo en: http://localhost:${PORT}`);
      console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
      console.log(`💾 Base de datos: remittance_db`);
      console.log(`🕒 Iniciado: ${new Date().toISOString()}`);
      console.log(`\n📋 Endpoints disponibles:`);
      console.log(`   POST /api/register   - Registro de usuarios`);
      console.log(`   POST /api/login      - Login de usuarios`);
      console.log(`   POST /api/transfers  - Crear transferencia`);
      console.log(`   GET  /api/transfers  - Historial de transferencias`);
      console.log(`   GET  /api/transfers/:id - Detalles de transferencia`);
      console.log(`   GET  /api/profile    - Perfil de usuario`);
      console.log(`   GET  /api/health     - Estado del servidor\n`);
    });
    
  } catch (error) {
    console.error('❌ Error iniciando servidor:', error);
    process.exit(1);
  }
};

startServer();
