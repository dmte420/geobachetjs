import { Text, View, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function PrivacidadScreen() {
  const router = useRouter();

  return (
    <LinearGradient colors={['#4A90E2', '#00C9A7']} style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.botonAtras}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.tituloHeader}>Aviso de Privacidad</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.titulo}>Aviso de Privacidad - GeoBache TJ</Text>
        <Text style={styles.actualizado}>Última actualización: Octubre 2026</Text>

        <Text style={styles.seccion}>1. Responsable del Tratamiento</Text>
        <Text style={styles.texto}>
          GeoBache TJ es una herramienta ciudadana para el reporte de imperfectos viales en Tijuana, B.C. 
          El responsable del tratamiento de sus datos personales es el equipo desarrollador de GeoBache TJ.
        </Text>

        <Text style={styles.seccion}>2. Datos Personales Recabados</Text>
        <Text style={styles.texto}>
          Para cumplir con las finalidades señaladas, recabamos los siguientes datos:{'\n\n'}
          - <Text style={styles.bold}>Ubicación GPS:</Text> Coordenadas de latitud y longitud del reporte.{'\n'}
          - <Text style={styles.bold}>Fotografía:</Text> Imagen del bache, alcantarilla o camellón reportado.{'\n'}
          - <Text style={styles.bold}>Datos de ubicación:</Text> Código postal, colonia y dirección/referencia que usted proporcione.{'\n'}
          - <Text style={styles.bold}>Descripción:</Text> Texto descriptivo del problema reportado.{'\n\n'}
          No recabamos nombre, teléfono, correo electrónico ni datos sensibles.
        </Text>

        <Text style={styles.seccion}>3. Finalidades del Tratamiento</Text>
        <Text style={styles.texto}>
          Sus datos serán utilizados para:{'\n\n'}
          a) Geolocalizar y documentar reportes ciudadanos de infraestructura vial.{'\n'}
          b) Generar un folio de seguimiento público para su consulta.{'\n'}
          c) Mostrar los reportes en un mapa público para transparencia.{'\n'}
          d) Permitir al H. Ayuntamiento de Tijuana dar seguimiento y evidencia de reparación.{'\n'}
          e) Generar estadísticas generales de reportes por zona.
        </Text>

        <Text style={styles.seccion}>4. Transferencia de Datos</Text>
        <Text style={styles.texto}>
          Los datos de ubicación, fotografía y descripción son públicos y se muestran en la aplicación para fines de transparencia ciudadana. 
          Podrán ser compartidos con el H. Ayuntamiento de Tijuana para su atención. 
          No vendemos ni cedemos sus datos a terceros con fines comerciales.
        </Text>

        <Text style={styles.seccion}>5. Derechos ARCO</Text>
        <Text style={styles.texto}>
          Usted tiene derecho a conocer qué datos tenemos, para qué los usamos y las condiciones de uso. 
          Para ejercer sus derechos de Acceso, Rectificación, Cancelación u Oposición, o para solicitar la eliminación 
          de un reporte, puede contactarnos al correo: privacidad@geobachetj.com
        </Text>

        <Text style={styles.seccion}>6. Uso de Cookies y Tecnologías</Text>
        <Text style={styles.texto}>
          La aplicación utiliza servicios de geolocalización de su dispositivo y almacenamiento en Supabase 
          para guardar los reportes. No utilizamos cookies de rastreo publicitario.
        </Text>

        <Text style={styles.seccion}>7. Cambios al Aviso</Text>
        <Text style={styles.texto}>
          Nos reservamos el derecho de efectuar cambios al presente aviso. Cualquier modificación será publicada en esta sección.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  botonAtras: {
    padding: 5,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
  },
  tituloHeader: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'white',
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
  },
  scrollContent: {
    padding: 25,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 5,
  },
  actualizado: {
    fontSize: 12,
    color: '#999',
    marginBottom: 25,
  },
  seccion: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  texto: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '600',
    color: '#333',
  },
});