const { createUnauthenticatedClient } = require('@interledger/open-payments');

class RealInterledgerService {
  constructor() {
    this.testWallet1 = 'https://ilp.interledger-test.dev/alice';
    this.testWallet2 = 'https://ilp.interledger-test.dev/bob';
  }

  async demoRealPayment() {
    try {
      const client = await createUnauthenticatedClient();
      
      // Consultar wallet info real
      const walletInfo = await client.walletAddress.get({
        url: this.testWallet1
      });
      
      console.log('✅ Conectado a Interledger real:', walletInfo);
      
      return {
        success: true,
        network: 'Interledger Live Test Network',
        wallet_info: walletInfo,
        message: 'Conexión exitosa con protocolo real'
      };
    } catch (error) {
      console.log('⚠️ Fallback a simulación:', error.message);
      return {
        success: false,
        fallback: true,
        message: 'Usando simulación local'
      };
    }
  }
}

module.exports = new RealInterledgerService();
