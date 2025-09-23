const axios = require('axios');

class OpenPaymentsService {
  constructor() {
    this.baseURL = process.env.OPEN_PAYMENTS_HOST; // URL de tu API HTTP
  }

  async createPaymentQuote(sender, recipient, amount, currency = 'USD') {
    try {
      // Aquí llamamos a la API real; si quieres, puedes ajustar los endpoints según tu API
      const response = await axios.post(`${this.baseURL}/api/1/datastore/query`, {
        sender,
        recipient,
        amount,
        currency
      });
      return response.data;
    } catch (error) {
      console.error('⚠️ Error OpenPayments API:', error.message);
      // Fallback MOCK
      return {
        fee: amount * 0.01,
        traditionalFee: amount * 0.05,
        receiveAmount: amount * 0.99,
        savings: amount * 0.04
      };
    }
  }
}

module.exports = OpenPaymentsService;
