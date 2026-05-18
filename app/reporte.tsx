import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, TextInput, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { supabase } from '../lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

MapLibreGL.setAccessToken(null);

export default function ReporteScreen() {
  const [foto, setFoto] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [location, setLocation] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [colonia, setColonia] = useState('');
  const [direccionTexto, setDireccionTexto] = useState('');
  const [medidaAprox, setMedidaAprox] = useState('');
  const [subTipo, setSubTipo] = useState('camellon');
  const [categoria, setCategoria] = useState('');
  const mapRef = useRef(null);

  const params = useLocalSearchParams();
  const tipo = params.tipo || 'bache';
  const router = useRouter();

  const esBache = tipo === 'bache';
  const colorPrimario = esBache? '#FF3B30' : '#00C9A7';
  const tituloReporte = esBache? 'Bache' : 'Camellón/Alcantarilla';
  const iconoReporte = esBache? '🕳️' : '🚧';

  const medidasBache = [
    'Chico (< 1m)',
    'Mediano (1-3m)',
    'Grande (> 3m)'
  ];

  const categoriasCamellon = [
    'Limpieza general',
    'Retiro de escombros',
    'Poda de maleza',
    'Basura acumulada',
    'Falta de alumbrado',
  ];

  const categoriasAlcantarilla = [
    'Alcantarilla tapada',
    'Estanque de agua',
    'Mal olor/fuga',
    'Rejilla dañada',
    'Falta de tapa',
  ];

  const categoriasActuales = subTipo === 'camellon'? categoriasCamellon : categoriasAlcantarilla;

  useEffect(() => {
    pedirUbicacion();
  }, []);

  useEffect(() => {
    setCategoria('');
  }, [subTipo]);

  const pedirUbicacion = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        setLocation(loc);

        Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }).then((reverse) => {
          if (reverse.length > 0) {
            setCodigoPostal(reverse[0].postalCode || '');
            setColonia(reverse[0].subregion || reverse[0].district || '');
            setDireccionTexto(`${reverse[0].street || ''} ${reverse[0].name || ''}`);
          }
        });
      }
    } catch (error) {
      console.log('Error GPS:', error);
    }
  };

  const centrarEnUbicacion = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.002,
        longitudeDelta: 0.002,
      }, 1000);
    } else {
      pedirUbicacion();
    }
  };

  const tomarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status!== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
    });

    if (!result.canceled) {
      setFoto(result.assets[0].uri);
    }
  };

  const subirReporte = async () => {
    if (!location) {
      Alert.alert('Error', 'Espera a que cargue el mapa con tu ubicación');
      return;
    }

    if (!esBache &&!categoria) {
      Alert.alert('Error', 'Selecciona el tipo de problema');
      return;
    }

    if (esBache &&!medidaAprox) {
      Alert.alert('Error', 'Selecciona el tamaño aproximado del bache');
      return;
    }

    setSubiendo(true);
    try {
      let publicUrl = null;

      if (foto) {
        const response = await fetch(foto);
        const arrayBuffer = await response.arrayBuffer();
        const fileExt = foto.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
         .from('foto-reportes')
         .upload(fileName, arrayBuffer, {
            contentType: `image/${fileExt}`,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
         .from('foto-reportes')
         .getPublicUrl(fileName);

        publicUrl = data.publicUrl;
      }

      const tipoFinal = esBache? 'bache' : subTipo;

      const { data: folioData, error: folioError } = await supabase
       .rpc('generar_folio', { tipo_reporte: tipoFinal });

      if (folioError) throw folioError;

      const nuevoFolio = folioData;

      const { error: insertError } = await supabase
       .from('reportes')
       .insert({
          folio: nuevoFolio,
          foto_url: publicUrl,
          latitud: location.coords.latitude,
          longitud: location.coords.longitude,
          descripcion: descripcion || null,
          tipo_reporte: tipoFinal,
          categoria_reporte: categoria || null,
          codigo_postal: codigoPostal || null,
          colonia: colonia || null,
          direccion_texto: direccionTexto || null,
          medida_aproximada: medidaAprox || null,
          estatus: 'pendiente',
        });

      if (insertError) throw insertError;

      Alert.alert(
        'Reporte Enviado ✅',
        `Tu folio es: ${nuevoFolio}\n\nGuárdalo para dar seguimiento.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );

    } catch (error) {
      console.log('ERROR COMPLETO:', JSON.stringify(error, null, 2));
      Alert.alert('Error', error.message || 'Ocurrió un error al subir el reporte');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <LinearGradient
      colors={['#00C9A7', '#4A90E2']}
      style={styles.container}
    >
      <TouchableOpacity style={styles.botonRegresar} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="white" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.iconoHeader}>{iconoReporte}</Text>
          <Text style={styles.titulo}>Reportar {tituloReporte}</Text>
        </View>

        {!esBache && (
          <View style={styles.selectorRow}>
                <TouchableOpacity
              style={[styles.botonSelector, subTipo === 'camellon' && styles.botonSelectorActivo]}
              onPress={() => setSubTipo('camellon')}
            >
              <Text style={styles.textoSelector}>🚧 Camellón</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.botonSelector, subTipo === 'alcantarilla' && styles.botonSelectorActivo]}
              onPress={() => setSubTipo('alcantarilla')}
            >
              <Text style={styles.textoSelector}>⚫ Alcantarilla</Text>
            </TouchableOpacity>
          </View>
        )}

        {location? (
  <View style={styles.mapaContainer}>
    {Platform.OS === 'web' ? (
      <View style={[styles.mapa, {justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)'}]}>
        <Text style={{ color: 'white', fontSize: 16, textAlign: 'center', padding: 20 }}>
          Mapa disponible solo en la app móvil{"\n"}Usa tu celular para marcar la ubicación exacta
        </Text>
      </View>
    ) : (
     <MapLibreGL.MapView
  ref={mapRef}
  style={styles.mapa}
  styleURL="https://demotiles.maplibre.org/style.json"
>
  <MapLibreGL.Camera
    zoomLevel={17}
    centerCoordinate={[
      location.coords.longitude,
      location.coords.latitude
    ]}
    animationDuration={0}
  />
  <MapLibreGL.UserLocation visible={true} />
  <MapLibreGL.PointAnnotation
    id="ubicacionReporte"
    coordinate={[
      location.coords.longitude,
      location.coords.latitude
    ]}
    title="Ubicación del reporte"
  >
    <View style={[styles.markerPin, { backgroundColor: colorPrimario }]} />
  </MapLibreGL.PointAnnotation>
</MapLibreGL.MapView>
)}
            <TouchableOpacity style={styles.botonUbicacion} onPress={centrarEnUbicacion}>
              <Ionicons name="locate" size={24} color="white" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.mapaContainer}>
            <View style={[styles.mapa, styles.mapaLoading]}>
              <Text style={{ color: 'white' }}>Obteniendo ubicación...</Text>
            </View>
          </View>
        )}
    
        <TextInput      
          style={styles.input}
          placeholder="Código Postal"
          placeholderTextColor="#999"
          value={codigoPostal}
          onChangeText={setCodigoPostal}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Colonia"
          placeholderTextColor="#999"
          value={colonia}
          onChangeText={setColonia}
        />
        <TextInput
          style={styles.input}
          placeholder="Dirección / Referencia"
          placeholderTextColor="#999"
          value={direccionTexto}
          onChangeText={setDireccionTexto}
        />

        {esBache && (
          <>
            <Text style={styles.label}>Tamaño aproximado del bache:</Text>
            <View style={styles.medidasContainer}>
              {medidasBache.map((med) => (
                <TouchableOpacity
                  key={med}
                  style={[styles.botonMedida, medidaAprox === med && { backgroundColor: colorPrimario }]}
                  onPress={() => setMedidaAprox(med)}
                >
                  <Text style={styles.textoMedida}>{med}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {!esBache && (
          <>
            <Text style={styles.label}>Tipo de problema:</Text>
            <View style={styles.categoriasContainer}>
              {categoriasActuales.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.botonCategoria, categoria === cat && { backgroundColor: colorPrimario }]}
                  onPress={() => setCategoria(cat)}
                >
                  <Text style={styles.textoCategoria}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TextInput
          style={styles.input}
          placeholder="Descripción breve del problema"
          placeholderTextColor="#999"
          value={descripcion}
          onChangeText={setDescripcion}
          multiline
        />

        {foto? (
          <Image source={{ uri: foto }} style={styles.imagen} />
        ) : (
          <TouchableOpacity style={styles.botonCamara} onPress={tomarFoto}>
            <Ionicons name="camera" size={40} color="white" />
            <Text style={styles.textoBotonCamara}>Tomar Foto (Opcional)</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.botonSubir, { backgroundColor: colorPrimario }, subiendo && styles.botonDeshabilitado]}
          onPress={subirReporte}
          disabled={subiendo}
        >
          <Text style={styles.textoSubir}>
            {subiendo? 'Subiendo...' : 'Enviar Reporte'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/privacidad')}>
          <Text style={styles.textoLegal}>
            Al enviar aceptas el <Text style={styles.linkLegal}>Aviso de Privacidad</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  botonRegresar: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    padding: 8,
  },
  scroll: { padding: 20, paddingTop: 100 },
  header: { alignItems: 'center', marginBottom: 15 },
  iconoHeader: { fontSize: 40, marginBottom: 5 },
  titulo: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    gap: 10,
  },
  botonSelector: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 14,
    borderRadius: 12,
    flex: 1,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  botonSelectorActivo: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'white',
  },
  textoSelector: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  mapaContainer: {
    height: 200,
    borderRadius: 15,
    overflow: 'hidden',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  mapa: { flex: 1 },
  botonUbicacion: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: '#4A90E2',
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  mapaLoading: { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  input: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  label: {
    color: 'white',
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2
  },
  medidasContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  botonMedida: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 8,
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  textoMedida: { color: 'white', textAlign: 'center', fontSize: 13, fontWeight: '600' },
  categoriasContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  botonCategoria: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 8,
    width: '48%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 8,
  },
  textoCategoria: { color: 'white', textAlign: 'center', fontSize: 13, fontWeight: '600' },
  botonCamara: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    height: 200,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  textoBotonCamara: { color: 'white', marginTop: 10, fontSize: 16, fontWeight: '600' },
  imagen: {
    width: '100%',
    height: 200,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)'
  },
  botonSubir: {
    padding: 18,
    borderRadius: 15,
    alignItems: 'center',
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  botonDeshabilitado: { backgroundColor: '#666' },
  textoSubir: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  textoLegal: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  linkLegal: {
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});