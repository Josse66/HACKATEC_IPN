import AsyncStorage from '@react-native-async-storage/async-storage';

// ⚠️ IMPORTANTE: Cambiar por la IP de tu computadora
const BASE_URL = 'http://192.168.1.100:3000';

class ApiService {
  async makeRequest(endpoint, options = {}) {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        ...options,
      };

      const response = await fetch(`${BASE_URL}${endpoint}`, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la solicitud');
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  // Auth
  async login(email, password) {
    return this.makeRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async register(userData) {
    return this.makeRequest('/api/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  // Transfers
  async createTransfer(transferData) {
    return this.makeRequest('/api/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData),
    });
  }

  async getTransfers() {
    return this.makeRequest('/api/transfers');
  }

  async getTransfer(id) {
    return this.makeRequest(`/api/transfers/${id}`);
  }

  async healthCheck() {
    return this.makeRequest('/api/health');
  }
}

export default new ApiService();
