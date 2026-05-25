import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, TextInput, ScrollView } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import MapView, { Circle } from 'react-native-maps';
import { supabase } from '../lib/supabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getDistance } from 'geolib';

export default function ReporteScreen() {
  const [fotos, setFotos] = useState([]);
  const MAX_FOTOS = 2;
  const [subiendo, setSubiendo] = useState(false);
  const [location, setLocation] = useState(null);
  const [ubicacionOriginal, setUbicacionOriginal] = useState(null);
  const [regionActual, setRegionActual] = useState(null);
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

  const textosAyuda = {
    bache: 'Para reportar un bache:\n\n1. Coloca el pin rojo justo encima del bache\n2. Solo puedes moverlo 100m a la redonda\n3. Selecciona el tamaño más cercano\n4. La foto es opcional pero ayuda mucho',
    camellon: 'Para reportar un camellón:\n\n1. Ubica el pin en el tramo afectado\n2. Selecciona el tipo de problema principal\n3. Describe si hay riesgo para peatones o autos\n4. Agrega foto del área completa',
    alcantarilla: 'Para reportar una alcantarilla:\n\n1. Pon el pin justo sobre la alcantarilla dañada\n2. Si falta la tapa marca "Falta de tapa" - es urgente\n3. Indica si hay agua estancada o mal olor\n4. Toma foto donde se vea el daño'
  };

  const tipoParaAyuda = esBache? 'bache' : subTipo;

  useEffect(() => {
    pedirUbicacion();
  }, []);

  useEffect(() => {
    setCategoria('');
  }, [subTipo]);

  const tomarFoto = async () => {
    if (fotos.length >= MAX_FOTOS) {
      Alert.alert('Límite alcanzado', 'Solo puedes subir 2 fotos máximo');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status!== 'granted') {
      Alert.alert('Permiso denegado', 'Necesitas dar acceso a la cámara');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });

    if (!result.canceled) {
      setFotos([...fotos, result.assets[0].uri]);
    }
  };

  const eliminarFoto = (index) => {
    const nuevasFotos = fotos.filter((_, i) => i!== index);
    setFotos(nuevasFotos);
  };

  const mostrarAyudaAlert = () => {
    Alert.alert(
      `¿Cómo reportar ${tituloReporte}?`,
      textosAyuda[tipoParaAyuda],
      [{ text: 'Entendido' }]
    );
  };

  const pedirUbicacion = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        setLocation(loc);

        setUbicacionOriginal({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        }).then((reverse) => {
          if (reverse.length > 0) {
            const addr = reverse[0];
            setCodigoPostal(addr.postalCode || '');
            setColonia(addr.subregion || addr.district || addr.city || '');

            const calle = addr.street || '';
            const numero = addr.streetNumber || '';
            let direccionFinal = `${calle} ${numero}`.trim();

            if (!direccionFinal) {
              const esPlusCode = addr.name && addr.name.includes('+');
              direccionFinal =!esPlusCode && addr.name? addr.name : 'Calle sin nombre';
            }

            setDireccionTexto(direccionFinal);
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
      let urlsFotos = [null, null];

      // SUBIR LAS 2 FOTOS A STORAGE
      if (fotos.length > 0) {
        for (let i = 0; i < fotos.length; i++) {
          const response = await fetch(fotos[i]);
          const arrayBuffer = await response.arrayBuffer();
          const fileExt = fotos[i].split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `${Date.now()}_${i}.${fileExt}`;

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

          urlsFotos[i] = data.publicUrl;
        }
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
          foto_url: urlsFotos[0], // ← Foto 1
          foto_url_2: urlsFotos[1], // ← Foto 2
          latitud: regionActual?.latitude || location.coords.latitude,
          longitud: regionActual?.longitude || location.coords.longitude,
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
        <Ionicons
          name="arrow-back"
          size={30}
          color="#0066FF"
          style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 3 }}
        />
      </TouchableOpacity>

      <TouchableOpacity style={styles.botonAyuda} onPress={mostrarAyudaAlert}>
        <Ionicons
          name="help-circle"
          size={30}
          color="#0066FF"
          style={{ textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 3 }}
        />
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
            {Platform.OS === 'web'? (
              <View style={[styles.mapa, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
                <Text style={{ color: 'white', fontSize: 16, textAlign: 'center', padding: 20 }}>
                  Mapa disponible solo en la app móvil{"\n"}Usa tu celular para marcar la ubicación exacta
                </Text>
              </View>
            ) : (
              <View style={StyleSheet.absoluteFill}>
                <MapView
                  ref={mapRef}
                  style={StyleSheet.absoluteFill}
                  initialRegion={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    latitudeDelta: 0.005,
                    longitudeDelta: 0.005,
                  }}
                  showsUserLocation={true}
                  showsMyLocationButton={false}
                  scrollEnabled={true}
                  zoomEnabled={true}
                  onMapReady={() => {
                    setUbicacionOriginal({
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                    });
                    setRegionActual({
                      latitude: location.coords.latitude,
                      longitude: location.coords.longitude,
                      latitudeDelta: 0.005,
                      longitudeDelta: 0.005,
                    });
                  }}
                  onRegionChangeComplete={(region) => {
                    if (!ubicacionOriginal) return;

                    const distancia = getDistance(ubicacionOriginal, region);

                    if (distancia > 100) {
                      mapRef.current?.animateToRegion({
                       ...ubicacionOriginal,
                        latitudeDelta: 0.005,
                        longitudeDelta: 0.005,
                      }, 300);
                      Alert.alert('Límite alcanzado', 'Solo puedes mover el pin 100m desde tu ubicación');
                    } else {
                      setRegionActual(region);
                    }
                  }}
                >
                  {ubicacionOriginal && (
                    <Circle
                      center={ubicacionOriginal}
                      radius={100}
                      strokeColor="rgba(0, 122, 255, 0.8)"
                      fillColor="rgba(0, 122, 255, 0.2)"
                      strokeWidth={2}
                    />
                  )}
                </MapView>

                <View style={styles.pinCentro} pointerEvents="none">
                  <Text style={{ fontSize: 40 }}>📍</Text>
                </View>

                <TouchableOpacity style={styles.botonUbicacion} onPress={centrarEnUbicacion}>
                  <Ionicons name="locate" size={24} color="white" />
                </TouchableOpacity>
              </View>
            )}
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
          placeholder="Calle y número"
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

        <Text style={styles.labelFotos}>Fotos del problema ({fotos.length}/2)</Text>
<View style={styles.contenedorFotos}>
  {fotos[0]? (
    <View style={styles.previewFoto}>
      <Image source={{ uri: fotos[0] }} style={styles.imagenPreview} />
      <TouchableOpacity
        style={styles.botonEliminar}
        onPress={() => eliminarFoto(0)}
      >
        <Ionicons name="close-circle" size={24} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity style={styles.botonTomarFoto} onPress={tomarFoto}>
      <Ionicons name="camera" size={32} color="white" />
      <Text style={styles.textoBotonFoto}>Foto 1</Text>
    </TouchableOpacity>
  )}

  {fotos[1]? (
    <View style={styles.previewFoto}>
      <Image source={{ uri: fotos[1] }} style={styles.imagenPreview} />
      <TouchableOpacity
        style={styles.botonEliminar}
        onPress={() => eliminarFoto(1)}
      >
        <Ionicons name="close-circle" size={24} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  ) : (
    <TouchableOpacity
      style={[styles.botonTomarFoto, fotos.length === 0 && styles.deshabilitado]}
      onPress={tomarFoto}
      disabled={fotos.length === 0}
    >
      <Ionicons name="camera" size={32} color="white" />
      <Text style={styles.textoBotonFoto}>Foto 2</Text>
    </TouchableOpacity>
  )}
</View>

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
    backgroundColor: 'transparent',
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAyuda: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'transparent',
    padding: 8,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 20,
    paddingTop: 50,
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  iconoHeader: {
    fontSize: 50,
  },
  titulo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 4,
  },
  selectorRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  botonSelector: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  botonSelectorActivo: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  textoSelector: {
    color: 'white',
    fontWeight: '600',
  },
  mapaContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 15,
    backgroundColor: '#ccc',
  },
  mapa: {
   ...StyleSheet.absoluteFillObject,
  },
  mapaLoading: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinCentro: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -40,
  },
  botonUbicacion: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 25,
    padding: 10,
  },
  input: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  label: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  medidasContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  botonMedida: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
    alignItems: 'center',
  },
  textoMedida: {
    color: 'white',
    fontSize: 12,
  },
  categoriasContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
  },
  botonCategoria: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    margin: 4,
  },
  textoCategoria: {
    color: 'white',
    fontSize: 12,
  },
  labelFotos: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  contenedorFotos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 15,
  },
  previewFoto: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  imagenPreview: {
    width: '100%',
    height: '100%',
  },
  botonTomarFoto: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  deshabilitado: {
    opacity: 0.4,
  },
  textoBotonFoto: {
    color: 'white',
    fontWeight: '600',
  },
  botonEliminar: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'white',
    borderRadius: 12,
  },
  botonSubir: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  botonDeshabilitado: {
    opacity: 0.6,
  },
  textoSubir: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  textoLegal: {
    color: 'white',
    textAlign: 'center',
    marginTop: 15,
    fontSize: 12,
  },
  linkLegal: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});