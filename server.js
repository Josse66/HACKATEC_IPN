// Importar el servicio real también
const RealInterledgerService = require('./services/interledger-real');

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
    
    // 1. Intentar demo real (opcional)
    let interledgerDemo = null;
    try {
      interledgerDemo = await RealInterledgerService.demoRealPayment();
      console.log('🌐 Demo real Interledger:', interledgerDemo.message);
    } catch (error) {
      console.log('📱 Usando simulación local');
    }
    
    // 2. Procesar con simulación local
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
    
    // 3. Procesar el pago con ILP
    const paymentResult = await InterledgerService.processPayment(
      senderWallet, receiverWallet.url, amount
    );
    
    const fees = InterledgerService.calculateFees(amount);
    
    // 4. Guardar en DB
    const [result] = await connection.execute(
      `INSERT INTO transfers 
       (sender_id, recipient_email, recipient_name, amount, status, 
        traditional_fee, our_fee, savings, interledger_payment_id,
        wallet_address_sender, wallet_address_recipient) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sender_id, recipient_email, recipient_name, amount, 'processing',
        fees.traditionalFee, fees.ourFee, fees.savings, paymentResult.payment_id,
        senderWallet, receiverWallet.url
      ]
    );
    
    // 5. Auto-completar después de 5 segundos
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
        console.error('Error actualizando:', err);
      }
    }, 5000);
    
    res.status(201).json({
      message: 'Transferencia procesada con Interledger Protocol',
      transfer_id: result.insertId,
      status: 'processing',
      fees: fees,
      interledger: {
        payment_id: paymentResult.payment_id,
        network: paymentResult.network,
        protocol: paymentResult.protocol_version,
        real_demo: interledgerDemo?.success || false
      },
      estimated_completion: '2-5 minutos'
    });
    
  } catch (error) {
    console.error('Error transferencia:', error);
    res.status(500).json({ error: 'Error del servidor: ' + error.message });
  } finally {
    if (connection) connection.release();
  }
});
