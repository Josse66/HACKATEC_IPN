const axios = require('axios');

class InterledgerService {
  constructor() {
    this.testWalletUrl = 'https://ilp.interledger-test.dev';
  }

  async createWalletAddress(userId, email) {
    try {
      const walletAddress = `${this.testWalletUrl}/users/${userId}`;
      return {
        id: walletAddress,
        url: walletAddress,
        assetCode: 'USD',
        assetScale: 2
      };
    } catch (error) {
      throw new Error('Error creando wallet: ' + error.message);
    }
  }

  async createIncomingPayment(receiverWallet, amount) {
    try {
      return {
        id: `incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        walletAddress: receiverWallet,
        incomingAmount: {
          value: (amount * 100).toString(),
          assetCode: 'USD',
          assetScale: 2
        },
        completed: false,
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error('Error creando incoming payment: ' + error.message);
    }
  }

  async createOutgoingPayment(senderWallet, receiverWallet, amount) {
    try {
      console.log(`🚀 Iniciando pago de $${amount}`);
      
      const outgoingPayment = {
        id: `outgoing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        walletAddress: senderWallet,
        receiver: receiverWallet,
        debitAmount: {
          value: (amount * 100).toString(),
          assetCode: 'USD',
          assetScale: 2
        },
        state: 'SENDING',
        createdAt: new Date().toISOString()
      };

      // Simular completar después de 3 segundos
      setTimeout(() => {
        outgoingPayment.state = 'COMPLETED';
        console.log(`✅ Pago completado: ${outgoingPayment.id}`);
      }, 3000);

      return outgoingPayment;
    } catch (error) {
      throw new Error('Error procesando pago: ' + error.message);
    }
  }

  calculateFees(amount) {
    const traditionalFee = amount * 0.07; // 7% Western Union
    const ourFee = amount * 0.008; // 0.8% Interledger
    const savings = traditionalFee - ourFee;
    
    return {
      amount: parseFloat(amount),
      traditionalFee: parseFloat(traditionalFee.toFixed(2)),
      ourFee: parseFloat(ourFee.toFixed(2)),
      savings: parseFloat(savings.toFixed(2)),
      savingsPercentage: parseFloat(((savings / traditionalFee) * 100).toFixed(1)),
      recipientReceives: parseFloat((amount - ourFee).toFixed(2))
    };
  }
}

module.exports = new InterledgerService();
