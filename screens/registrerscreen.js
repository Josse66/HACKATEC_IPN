import React, { useState } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../components/Input';
import Button from '../components/Button';
import ApiService from '../services/api';

const RegisterScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    phone: '',
    country: 'México'
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.full_name.trim()) {
      newErrors.full_name = 'Nombre completo es requerido';
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'Email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Email inválido';
    }
    
    if (!formData.password.trim()) {
      newErrors.password = 'Contraseña es requerida';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }
    
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Contraseñas no coinciden';
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'Teléfono es requerido';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    
    setLoading(true);
    try {
      const response = await ApiService.register(formData);
      
      // Guardar datos
      await AsyncStorage.setItem('authToken', response.token);
      await AsyncStorage.setItem('userData', JSON.stringify(response.user));
      
      Alert.alert(
        '¡Bienvenido a MiRemesa!', 
        'Cuenta creada exitosamente. ¡Comienza a ahorrar en tus envíos!',
        [{ text: 'Continuar', onPress: () => navigation.replace('Dashboard') }]
      );
      
    } catch (error) {
      Alert.alert('Error', error.message || 'Error al crear la cuenta');
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
              <Text style={styles.logo}>💸</Text>
              <Text style={styles.title}>Crear Cuenta</Text>
              <Text style={styles.subtitle}>Únete a miles que ya ahorran</Text>
            </View>

            <View style={styles.form}>
              <Input
                label="Nombre Completo"
                value={formData.full_name}
                onChangeText={(value) => updateField('full_name', value)}
                error={errors.full_name}
                placeholder="Tu nombre completo"
                autoCapitalize="words"
              />

              <Input
                label="Email"
                value={formData.email}
                onChangeText={(value) => updateField('email', value)}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="tu@email.com"
              />

              <Input
                label="Teléfono"
                value={formData.phone}
                onChangeText={(value) => updateField('phone', value)}
                error={errors.phone}
                keyboardType="phone-pad"
                placeholder="+52 55 1234 5678"
              />

              <Input
                label="País"
                value={formData.country}
                onChangeText={(value) => updateField('country', value)}
                placeholder="México"
              />

              <Input
                label="Contraseña"
                value={formData.password}
                onChangeText={(value) => updateField('password', value)}
                error={errors.password}
                secureTextEntry
                placeholder="Mínimo 6 caracteres"
              />

              <Input
                label="Confirmar Contraseña"
                value={formData.confirmPassword}
                onChangeText={(value) => updateField('confirmPassword', value)}
                error={errors.confirmPassword}
                secureTextEntry
                placeholder="Repite tu contraseña"
              />

              <Button
                title="Crear Cuenta"
                onPress={handleRegister}
                loading={loading}
                style={styles.registerButton}
              />

              <Text style={styles.termsText}>
                Al registrarte aceptas nuestros términos y condiciones
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
    marginTop: 20,
  },
  logo: {
    fontSize: 50,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  subtitle: {
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
  registerButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
  },
  termsText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    marginTop: 15,
    lineHeight: 16,
  },
});

export default RegisterScreen;
