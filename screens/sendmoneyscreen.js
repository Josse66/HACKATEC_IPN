import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Alert, 
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../components/Input';
import Button from '../components/Button';
import ApiService from '../services/api';

const SendMoneyScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    recipient_name: '',
    recipient_email: '',
    amount: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [feeCalculation, setFeeCalculation] = useState(null);

  // Calcular fees cuando cambia el monto
  useEffect(() => {
    if (formData.amount && parseFloat(formData.amount) > 0) {
      calculateFees(parseFloat(formData.amount));
    } else {
      setFeeCalculation(null);
    }
  }, [formData.amount]);

  const calculateFees = (amount) => {
    const traditionalFee = amount * 0.07; // 7% Western Union
    const ourFee = amount * 0.008; // 0.8% MiRemesa
    const savings = traditionalFee - ourFee;
    
    setFeeCalculation({
      amount: amount,
      traditionalFee: parseFloat(traditionalFee.toFixed(2)),
      ourFee: parseFloat(ourFee.toFixed(2)),
      savings: parseFloat(savings.toFixed(2)),
      recipientReceives: parseFloat((amount - ourFee).toFixed(2)),
      savingsPercentage: parseFloat(((savings / traditionalFee) * 100).toFixed(1))
    });
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.recipient_name.trim()) {
      newErrors.recipient_name = 'Nombre del destinatario es requerido';
    }
    
    if (!formData.recipient_email.trim()) {
      newErrors.recipient_email = 'Email del destinatario es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.recipient_email)) {
      newErrors.recipient_email = 'Email inválido';
    }
    
    if (!formData.amount.trim()) {
      newErrors.amount = 'Cantidad es requerida';
    } else if (parseFloat(formData.amount) < 1) {
      newErrors.amount = 'Cantidad mínima $1 USD';
    } else if (parseFloat(formData.amount) > 10000) {
      newErrors.amount = 'Cantidad máxima $10,000 USD';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSendMoney = async () => {
    if (!validateForm()) return;
    
    Alert.alert(
      'Confirmar Envío',
      `¿Enviar ${formData.amount} USD a ${formData.recipient_name}?\n\nComisión: ${feeCalculation.ourFee}\nEl destinatario recibirá: ${feeCalculation.recipientReceives}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: confirmSend }
      ]
    );
  };

  const confirmSend = async () => {
    setLoading(true);
    try {
      const response = await ApiService.createTransfer(formData);
      
      Alert.alert(
        '¡Transferencia Iniciada!',
        `Transferencia creada exitosamente.\n\nID: ${response.transfer_id}\nEstado: Procesando con Interledger\nTiempo estimado: ${response.estimated_completion}`,
        [
          { 
            text: 'Ver Detalles', 
            onPress: () => navigation.navigate('TransferDetails', { 
              transferId: response.transfer_id 
            })
          }
        ]
      );
      
    } catch (error) {
      Alert.alert('Error', error.message || 'Error al procesar la transferencia');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Limpiar error del campo
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#28a745', '#20c997']}
        style={styles.gradient}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.content}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Enviar Dinero 💸</Text>
              <Text style={styles.headerSubtitle}>Rápido, seguro y barato</Text>
            </View>

            <View style={styles.form}>
              <Input
                label="Nombre del Destinatario"
                value={formData.recipient_name}
                onChangeText={(value) => updateField('recipient_name', value)}
                error={errors.recipient_name}
                placeholder="María González"
                autoCapitalize="words"
              />

              <Input
                label="Email del Destinatario"
                value={formData.recipient_email}
                onChangeText={(value) => updateField('recipient_email', value)}
                error={errors.recipient_email}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="maria@email.com"
              />

              <Input
                label="Cantidad (USD)"
                value={formData.amount}
                onChangeText={(value) => updateField('amount', value)}
                error={errors.amount}
                keyboardType="numeric"
                placeholder="500"
              />

              {/* Comparación de fees */}
              {feeCalculation && (
                <View style={styles.feeComparison}>
                  <Text style={styles.comparisonTitle}>💰 Comparación de Costos</Text>
                  
                  <View style={styles.comparisonRow}>
                    <View style={styles.traditionalColumn}>
                      <Text style={styles.providerName}>Western Union</Text>
                      <Text style={styles.feeAmount}>
                        {formatCurrency(feeCalculation.traditionalFee)}
                      </Text>
                      <Text style={styles.feeLabel}>Comisión (7%)</Text>
                      <Text style={styles.receivesAmount}>
                        Recibe: {formatCurrency(formData.amount - feeCalculation.traditionalFee)}
                      </Text>
                    </View>
                    
                    <View style={styles.vsText}>
                      <Text style={styles.vs}>VS</Text>
                    </View>
                    
                    <View style={styles.ourColumn}>
                      <Text style={styles.providerNameOurs}>MiRemesa</Text>
                      <Text style={styles.feeAmountOurs}>
                        {formatCurrency(feeCalculation.ourFee)}
                      </Text>
                      <Text style={styles.feeLabelOurs}>Comisión (0.8%)</Text>
                      <Text style={styles.receivesAmountOurs}>
                        Recibe: {formatCurrency(feeCalculation.recipientReceives)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.savingsHighlight}>
                    <Text style={styles.savingsText}>
                      🎉 ¡Ahorras {formatCurrency(feeCalculation.savings)} ({feeCalculation.savingsPercentage}%)!
                    </Text>
                  </View>
                </View>
              )}

              <Button
                title={loading ? "Procesando..." : "Enviar Dinero"}
                onPress={handleSendMoney}
                loading={loading}
                disabled={!feeCalculation}
                style={styles.sendButton}
              />

              <Text style={styles.disclaimerText}>
                ✅ Transferencia vía Interledger Protocol{'\n'}
                ⏱️ Tiempo estimado: 2-5 minutos{'\n'}
                🔒 Totalmente seguro y cifrado
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 10,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#E6FFE6',
    textAlign: 'center',
  },
  form: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  feeComparison: {
    backgroundColor: '#f8f9fa',
    borderRadius: 15,
    padding: 20,
    marginVertical: 20,
    borderWidth: 2,
    borderColor: '#e9ecef',
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  traditionalColumn: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#ff6b6b',
    borderRadius: 10,
  },
  ourColumn: {
    flex: 1,
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#28a745',
    borderRadius: 10,
  },
  vsText: {
    paddingHorizontal: 15,
  },
  vs: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  providerName: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 5,
  },
  providerNameOurs: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 5,
  },
  feeAmount: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  feeAmountOurs: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  feeLabel: {
    color: '#ffcccc',
    fontSize: 12,
    marginBottom: 10,
  },
  feeLabelOurs: {
    color: '#ccffcc',
    fontSize: 12,
    marginBottom: 10,
  },
  receivesAmount: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  receivesAmountOurs: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  savingsHighlight: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 2,
    borderRadius: 10,
    padding: 15,
    alignItems: 'center',
  },
  savingsText: {
    color: '#856404',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  sendButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 18,
  },
  disclaimerText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginTop: 20,
    lineHeight: 20,
  },
});

export default SendMoneyScreen;
