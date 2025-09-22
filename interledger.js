const axios = require('axios');

class InterledgerService {
  constructor() {
    this.testWalletUrl = 'https://ilp.interledger-test.dev';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  // Crear wallet address (simulado pero con formato real)
  async createWalletAddress(userId, email) {
    try {
      const walletAddress = `${this.testWalletUrl}/users/${userId}`;
      
      return {
        id: walletAddress,
        url: walletAddress,
        assetCode: 'USD',
        assetScale: 2,
        authServer: `${this.testWalletUrl}/auth`,
        created_at: new Date().toISOString()
      };
    } catch (error) {
      throw new Error('Error creando wallet: ' + error.message);
    }
  }

  // Simular el flujo completo Open Payments
  async processPayment(senderWallet, receiverWallet, amount) {
    console.log(`🚀 [ILP] Iniciando pago de $${amount} USD`);
    
    try {
      // 1. Crear incoming payment (receptor)
      const incomingPayment = await this.createIncomingPayment(receiverWallet, amount);
      console.log(`📥 [ILP] Incoming payment creado: ${incomingPayment.id}`);
      
      // 2. Crear quote (calculadora de costos)
      const quote = await this.createQuote(senderWallet, receiverWallet, amount);
      console.log(`💰 [ILP] Quote generado: ${quote.id}`);
      
      // 3. Solicitar grant interactivo (simulado)
      const grant = await this.requestGrant(senderWallet, amount);
      console.log(`🔐 [ILP] Grant autorizado: ${grant.id}`);
      
      // 4. Crear outgoing payment
      const outgoingPayment = await this.createOutgoingPayment(
        senderWallet, incomingPayment.id, quote.id
      );
      console.log(`📤 [ILP] Outgoing payment procesado: ${outgoingPayment.id}`);
      
      // 5. Simular confirmación después de 3-5 segundos
      setTimeout(() => {
        outgoingPayment.state = 'COMPLETED';
        console.log(`✅ [ILP] Pago completado exitosamente`);
      }, Math.random() * 2000 + 3000); // 3-5 segundos
      
      return {
        success: true,
        payment_id: outgoingPayment.id,
        incoming_payment_id: incomingPayment.id,
        quote_id: quote.id,
        grant_id: grant.id,
        network: 'Interledger Protocol',
        protocol_version: 'Open Payments v1.0',
        estimated_time: '2-5 minutes',
        status: 'SENDING'
      };
      
    } catch (error) {
      console.error(`❌ [ILP] Error en pago:`, error.message);
      throw error;
    }
  }

  async createIncomingPayment(receiverWallet, amount) {
    return {
      id: `incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: receiverWallet,
      incomingAmount: {
        value: (amount * 100).toString(), // centavos
        assetCode: 'USD',
        assetScale: 2
      },
      completed: false,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hora
      createdAt: new Date().toISOString(),
      metadata: {
        description: 'MiRemesa transfer via Interledger'
      }
    };
  }

  async createQuote(senderWallet, receiverWallet, amount) {
    const fees = this.calculateFees(amount);
    
    return {
      id: `quote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: senderWallet,
      receiver: receiverWallet,
      sendAmount: {
        value: (amount * 100).toString(),
        assetCode: 'USD',
        assetScale: 2
      },
      receiveAmount: {
        value: (fees.recipientReceives * 100).toString(),
        assetCode: 'USD',
        assetScale: 2
      },
      maxPacketAmount: '1000',
      minExchangeRate: '1.0',
      lowEstimatedExchangeRate: '1.0',
      highEstimatedExchangeRate: '1.0',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString() // 5 minutos
    };
  }

  async requestGrant(senderWallet, amount) {
    // Simular el proceso GNAP
    return {
      id: `grant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      access_token: {
        value: `ilp_access_token_${Math.random().toString(36).substr(2, 20)}`,
        type: 'bearer'
      },
      continue: {
        access_token: {
          value: `continue_${Math.random().toString(36).substr(2, 15)}`
        },
        uri: `${this.testWalletUrl}/continue`, // En demo real, el usuario abre esto
        wait: 30
      },
      authorized: true, // Para hackathon, auto-autorizar
      createdAt: new Date().toISOString()
    };
  }

  async createOutgoingPayment(senderWallet, incomingPaymentId, quoteId) {
    return {
      id: `outgoing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      walletAddress: senderWallet,
      receiver: incomingPaymentId,
      quoteId: quoteId,
      state: 'SENDING', // PENDING -> SENDING -> COMPLETED
      sentAmount: {
        value: '0', // Se actualiza progresivamente
        assetCode: 'USD',
        assetScale: 2
      },
      createdAt: new Date().toISOString()
    };
  }

  calculateFees(amount) {
    const traditionalFee = amount * 0.07; // 7% Western Union
    const interledgerFee = amount * 0.005; // 0.5% real Interledger
    const ourFee = amount * 0.008; // 0.8% MiRemesa (incluye nuestro margen)
    const savings = traditionalFee - ourFee;
    
    return {
      amount: parseFloat(amount),
      traditionalFee: parseFloat(traditionalFee.toFixed(2)),
      interledgerFee: parseFloat(interledgerFee.toFixed(2)),
      ourFee: parseFloat(ourFee.toFixed(2)),
      savings: parseFloat(savings.toFixed(2)),
      savingsPercentage: parseFloat(((savings / traditionalFee) * 100).toFixed(1)),
      recipientReceives: parseFloat((amount - ourFee).toFixed(2))
    };
  }

  // Para demo: obtener estado de un pago
  async getPaymentStatus(paymentId) {
    // En producción, consultarías el estado real
    const isCompleted = Math.random() > 0.3; // 70% completado
    
    return {
      id: paymentId,
      state: isCompleted ? 'COMPLETED' : 'SENDING',
      completedAt: isCompleted ? new Date().toISOString() : null
    };
  }
}

module.exports = new InterledgerService();
