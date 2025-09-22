import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView,
  Alert,
  SafeAreaView,
  RefreshControl,
  TouchableOpacity
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ApiService from '../services/api';

const TransferDetailsScreen = ({ navigation, route }) => {
  const { transferId } = route.params;
  const [transfer, setTransfer] = useState(null);
  const [interledgerInfo, setInterledgerInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadTransferDetails();
  }, []);

  const loadTransferDetails = async () => {
    try {
      const response = await ApiService.getTransfer(transferId);
      setTransfer(response.transfer);
      setInterledgerInfo(response.interledger_info);
    } catch (error) {
      Alert.alert('Error', 'No se pudieron cargar los detalles');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTransferDetails();
    setRefreshing(false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('es-MX', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#28a745';
      case 'processing': return '#ffc107';
      case 'failed': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'completed': return '✅ Completada';
      case 'processing': return '⏳ Procesando';
      case 'failed': return '❌ Fallida';
      case 'pending': return '⏸️ Pendiente';
      default: return 'Desconocido';
    }
  };

  const getStatusDescription = (status) => {
    switch (status) {
      case 'completed': return 'El dinero ha sido enviado exitosamente al destinatario.';
      case 'processing': return 'Tu transferencia está siendo procesada a través del protocolo Interledger.';
      case 'failed': return 'La transferencia ha fallado. Contacta soporte.';
      case 'pending': return 'La transferencia está en cola para ser procesada.';
      default: return '';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Cargando detalles...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header de estado */}
        <LinearGradient
          colors={[getStatusColor(transfer.status), getStatusColor(transfer.status) + '80']}
          style={styles.statusHeader}
        >
          <Text style={styles.statusTitle}>{getStatusText(transfer.status)}</Text>
          <Text style={styles.statusDescription}>
            {getStatusDescription(transfer.status)}
          </Text>
        </LinearGradient>

        {/* Información principal */}
        <View style={styles.mainInfoContainer}>
          <View style={styles.amountSection}>
            <Text style={styles.amountLabel}>Cantidad Enviada</Text>
            <Text style={styles.amountValue}>{formatCurrency(transfer.amount)}</Text>
          </View>

          <View style={styles.recipientSection}>
            <Text style={styles.sectionTitle}>👤 Destinatario</Text>
            <Text style={styles.recipientName}>{transfer.recipient_name}</Text>
            <Text style={styles.recipientEmail}>{transfer.recipient_email}</Text>
          </View>
        </View>

        {/* Detalles de comisiones */}
        <View style={styles.feesContainer}>
          <Text style={styles.sectionTitle}>💰 Desglose de Costos</Text>
          
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Cantidad original:</Text>
            <Text style={styles.feeValue}>{formatCurrency(transfer.amount)}</Text>
          </View>
          
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Comisión MiRemesa:</Text>
            <Text style={styles.feeValue}>{formatCurrency(transfer.our_fee)}</Text>
          </View>
          
          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Comisión Western Union:</Text>
            <Text style={styles.feeValueStrike}>
              {formatCurrency(transfer.traditional_fee)}
            </Text>
          </View>
          
          <View style={[styles.feeRow, styles.savingsRow]}>
            <Text style={styles.savingsLabel}>🎉 Tu ahorro:</Text>
            <Text style={styles.savingsValue}>
              {formatCurrency(transfer.savings)}
            </Text>
          </View>
          
          <View style={[styles.feeRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Destinatario recibe:</Text>
            <Text style={styles.totalValue}>
              {formatCurrency(transfer.amount - transfer.our_fee)}
            </Text>
          </View>
        </View>

        {/* Información técnica de Interledger */}
        {interledgerInfo && (
          <View style={styles.techContainer}>
            <Text style={styles.sectionTitle}>🔧 Información Técnica</Text>
            
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Red:</Text>
              <Text style={styles.techValue}>{interledgerInfo.network}</Text>
            </View>
            
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Protocolo:</Text>
              <Text style={styles.techValue}>{interledgerInfo.protocol}</Text>
            </View>
            
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>ID de Pago:</Text>
              <Text style={styles.techValue} numberOfLines={1}>
                {transfer.interledger_payment_id}
              </Text>
            </View>
            
            <View style={styles.techRow}>
              <Text style={styles.techLabel}>Tiempo estimado:</Text>
              <Text style={styles.techValue}>{interledgerInfo.estimated_time}</Text>
            </View>
          </View>
        )}

        {/* Timeline */}
        <View style={styles.timelineContainer}>
          <Text style={styles.sectionTitle}>📅 Timeline</Text>
          
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Transferencia creada</Text>
              <Text style={styles.timelineDate}>
                {formatDate(transfer.created_at)}
              </Text>
            </View>
          </View>
          
          {transfer.completed_at && (
            <View style={styles.timelineItem}>
              <View style={[styles.timelineDot, styles.timelineDotCompleted]} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>Transferencia completada</Text>
                <Text style={styles.timelineDate}>
                  {formatDate(transfer.completed_at)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Acciones */}
        <View style={styles.actionsContainer}>
          {transfer.status === 'completed' && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => navigation.navigate('SendMoney')}
            >
              <Text style={styles.actionButtonText}>
                💸 Enviar Más Dinero
              </Text>
            </TouchableOpacity>
          )}
          
          <TouchableOpacity 
            style={[styles.actionButton, styles.actionButtonSecondary]}
            onPress={() => navigation.navigate('Dashboard')}
          >
            <Text style={styles.actionButtonTextSecondary}>
              🏠 Volver al Inicio
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  statusHeader: {
    padding: 30,
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  statusDescription: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
  },
  mainInfoContainer: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  amountLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  recipientSection: {
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  recipientName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  recipientEmail: {
    fontSize: 16,
    color: '#666',
  },
  feesContainer: {
    backgroundColor: 'white',
    margin: 20,
    marginTop: 0,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  feeLabel: {
    fontSize: 16,
    color: '#333',
  },
  feeValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  feeValueStrike: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc3545',
    textDecorationLine: 'line-through',
  },
  savingsRow: {
    backgroundColor: '#fff3cd',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 15,
  },
  savingsLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  savingsValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
  },
  totalRow: {
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
  },
  techContainer: {
    backgroundColor: 'white',
    margin: 20,
    marginTop: 0,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  techLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  techValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  timelineContainer: {
    backgroundColor: 'white',
    margin: 20,
    marginTop: 0,
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
    marginRight: 15,
  },
  timelineDotCompleted: {
    backgroundColor: '#28a745',
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 14,
    color: '#666',
  },
  actionsContainer: {
    padding: 20,
    paddingTop: 0,
  },
  actionButton: {
    backgroundColor: '#28a745',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  actionButtonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default TransferDetailsScreen;
