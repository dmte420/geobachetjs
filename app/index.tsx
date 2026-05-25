import 'react-native-url-polyfill/auto';
import { Text, View, StyleSheet, TouchableOpacity, StatusBar, ScrollView, Dimensions, Modal, TextInput, Alert, Share, Image, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { useState, useEffect, useCallback, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

const { height } = Dimensions.get('window');

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [reportes, setReportes] = useState([]);
  const [reportesFiltrados, setReportesFiltrados] = useState([]);
  const [modalAyuda, setModalAyuda] = useState(false);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [reporteSeleccionado, setReporteSeleccionado] = useState(null);
  const [busquedaFolio, setBusquedaFolio] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('todos');
  const [generandoPDF, setGenerandoPDF] = useState(false);
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  // CONTADORES CALCULADOS DIRECTO - SIN useState
  const contadorReportes = reportesFiltrados.length;
  const contadorReparados = reportesFiltrados.filter(r => r.estatus === 'reparado').length;

  useFocusEffect(
    useCallback(() => {
      cargarUbicacion();
      
      setTimeout(() => {
        mapRef.current?.animateToRegion({
          latitude: 32.4928,
          longitude: -116.9297,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }, 800);
      }, 500);

      cargarReportes();
    }, [])
  );

  useEffect(() => {
    aplicarFiltros();
  }, [reportes, filtroActivo]);

  useEffect(() => {
    const canal = supabase
      .channel('cambios-reportes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'reportes' }, 
        () => {
          cargarReportes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  const cargarUbicacion = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setLocation(loc);
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
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }, 1000);
    } else {
      cargarUbicacion();
    }
  };

  const cargarReportes = async () => {
    try {
      const { data, error } = await supabase
        .from('reportes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data) {
        setReportes(data);
      }
    } catch (error) {
      console.log('Error cargando reportes:', error.message);
    }
  };

  const aplicarFiltros = () => {
    let filtrados = [...reportes];
    
    if (filtroActivo === 'bache') {
      filtrados = filtrados.filter(r => r.tipo_reporte === 'bache');
    } else if (filtroActivo === 'alcantarilla') {
      filtrados = filtrados.filter(r => r.tipo_reporte === 'alcantarilla');
    } else if (filtroActivo === 'camellon') {
      filtrados = filtrados.filter(r => r.tipo_reporte === 'camellon');
    } else if (filtroActivo === 'pendiente') {
      filtrados = filtrados.filter(r => r.estatus === 'pendiente');
    } else if (filtroActivo === 'reparado') {
      filtrados = filtrados.filter(r => r.estatus === 'reparado');
    }
    
    setReportesFiltrados(filtrados);
  };

  const buscarPorFolio = () => {
    if (!busquedaFolio.trim()) {
      Alert.alert('Error', 'Ingresa un folio válido');
      return;
    }

    const reporte = reportes.find(r => r.folio.toLowerCase() === busquedaFolio.trim().toLowerCase());
    
    if (reporte && reporte.latitud && reporte.longitud && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: reporte.latitud,
        longitude: reporte.longitud,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
      
      setBusquedaFolio('');
      setReporteSeleccionado(reporte);
      setModalDetalle(true);
    } else {
      Alert.alert('No encontrado', `No existe el folio ${busquedaFolio}`);
    }
  };

  const compartirReporte = async (reporte) => {
    try {
      const costo = reporte.costo_reparacion ? `$${parseFloat(reporte.costo_reparacion).toLocaleString('es-MX', {minimumFractionDigits: 2})}` : 'N/A';
      const mensaje = `GeoBache TJ - ${reporte.folio}\n\nEstatus: ${reporte.estatus === 'reparado' ? 'Reparado ✅' : 'Pendiente'}\nTipo: ${reporte.tipo_reporte}\nColonia: ${reporte.colonia || 'Sin colonia'}\n${reporte.estatus === 'reparado' ? `Costo: ${costo}\n` : ''}\nConsulta en la app GeoBache TJ`;
      await Share.share({
        message: mensaje,
        title: `Reporte ${reporte.folio}`,
      });
    } catch (error) {
      console.log('Error al compartir:', error);
    }
  };

  const generarPDF = async (reporte) => {
    if (reporte.estatus !== 'reparado') {
      Alert.alert('Aviso', 'Solo se puede generar PDF de reportes reparados');
      return;
    }

    setGenerandoPDF(true);
    try {
      const costo = reporte.costo_reparacion ? `$${parseFloat(reporte.costo_reparacion).toLocaleString('es-MX', {minimumFractionDigits: 2})}` : 'N/A';
      const fechaReporte = new Date(reporte.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
      const fechaReparacion = reporte.fecha_reparacion ? new Date(reporte.fecha_reparacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
      
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
              h1 { color: #4A90E2; margin-bottom: 5px; }
              h2 { color: #00C9A7; font-size: 18px; margin-top: 0; }
              .header { border-bottom: 3px solid #4A90E2; padding-bottom: 15px; margin-bottom: 25px; }
              .seccion { margin-bottom: 20px; }
              .label { font-weight: bold; color: #666; font-size: 12px; text-transform: uppercase; }
              .valor { font-size: 16px; margin-top: 5px; }
              .costo { font-size: 24px; font-weight: bold; color: #00C9A7; }
              .fotos { display: flex; gap: 20px; margin-top: 20px; }
              .foto-box { flex: 1; }
              .foto-box img { width: 100%; border-radius: 8px; border: 2px solid #ddd; }
              .foto-titulo { font-weight: bold; margin-bottom: 10px; color: #4A90E2; }
              .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #999; text-align: center; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>GeoBache TJ</h1>
              <h2>Evidencia de Reparación - Folio ${reporte.folio}</h2>
            </div>

            <div class="seccion">
              <div class="label">Tipo de Reporte</div>
              <div class="valor">${reporte.tipo_reporte.charAt(0).toUpperCase() + reporte.tipo_reporte.slice(1)}</div>
            </div>

            <div class="seccion">
              <div class="label">Ubicación</div>
              <div class="valor">${reporte.colonia || 'Sin colonia'}, ${reporte.codigo_postal || 'N/A'}</div>
              <div class="valor" style="font-size: 14px; color: #666;">${reporte.direccion_texto || 'Sin dirección'}</div>
            </div>

            <div class="seccion">
              <div class="label">Fecha de Reporte</div>
              <div class="valor">${fechaReporte}</div>
            </div>

            <div class="seccion">
              <div class="label">Fecha de Reparación</div>
              <div class="valor">${fechaReparacion}</div>
            </div>

            <div class="seccion">
              <div class="label">Costo de Reparación</div>
              <div class="costo">${costo} MXN</div>
            </div>

            ${reporte.descripcion ? `
            <div class="seccion">
              <div class="label">Descripción</div>
              <div class="valor">${reporte.descripcion}</div>
            </div>
            ` : ''}

            <div class="fotos">
              ${reporte.foto_url ? `
              <div class="foto-box">
                <div class="foto-titulo">Foto del Reporte</div>
                <img src="${reporte.foto_url}" />
              </div>
              ` : ''}
              ${reporte.foto_reparacion_url ? `
              <div class="foto-box">
                <div class="foto-titulo">Foto de Reparación</div>
                <img src="${reporte.foto_reparacion_url}" />
              </div>
              ` : ''}
            </div>

            <div class="footer">
              Documento generado por GeoBache TJ - ${new Date().toLocaleDateString('es-MX')}<br>
              H. Ayuntamiento de Tijuana
            </div>
          </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { 
        UTI: '.pdf', 
        mimeType: 'application/pdf',
        dialogTitle: `Evidencia ${reporte.folio}`
      });
    } catch (error) {
      console.log('Error generando PDF:', error);
      Alert.alert('Error', 'No se pudo generar el PDF');
    } finally {
      setGenerandoPDF(false);
    }
  };

  const obtenerIcono = (tipo) => {
    if (tipo === 'bache') return '🕳️';
    if (tipo === 'alcantarilla') return '⚫';
    if (tipo === 'camellon') return '🚧';
    return '📍';
  };

  const formatearCosto = (costo) => {
    if (!costo) return 'N/A';
    return `$${parseFloat(costo).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return 'N/A';
    return new Date(fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <LinearGradient
      colors={['#00C9A7', '#4A90E2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ flex: 1 }}
    >
      <StatusBar barStyle="light-content" />
      
      {location ? (
  Platform.OS === 'web' ? (
    <View style={[styles.map, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }]}>
      <Text style={{ color: 'white', fontSize: 16, textAlign: 'center', padding: 20 }}>
        Mapa disponible solo en la app móvil{"\n"}Descarga GeoBache TJ en tu celular
      </Text>
    </View>
  ) : (
    <View style={styles.mapWrapper}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        showsUserLocation={true}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={{
          latitude: 32.4990,
          longitude: -116.9496,
          latitudeDelta: 0.15,
          longitudeDelta: 0.15,
        }}
      >
        {reportesFiltrados.map((reporte) => (
          reporte.latitud && reporte.longitud ? (
            <Marker
              key={reporte.id}
              coordinate={{ latitude: reporte.latitud, longitude: reporte.longitud }}
              onPress={() => {
                setReporteSeleccionado(reporte);
                setModalDetalle(true);
              }}
            >
              <View style={[
                styles.marcador,
                reporte.estatus === 'reparado' && styles.marcadorReparado,
                reporte.estatus === 'pendiente' && styles.marcadorPendiente,
                reporte.estatus === 'en_proceso' && styles.marcadorProceso
              ]}>
                <Text style={styles.marcadorTexto}>
                  {obtenerIcono(reporte.tipo_reporte)}
                </Text>
              </View>
            </Marker>
          ) : null
        ))}
      </MapView>

      <View style={styles.headerMapa}>
        <View style={styles.barraBusqueda}>
          <TextInput
            style={styles.inputBusqueda}
            placeholder="Buscar folio: GB-B-00001"
            placeholderTextColor="#999"
            value={busquedaFolio}
            onChangeText={setBusquedaFolio}
            autoCapitalize="characters"
            onSubmitEditing={buscarPorFolio}
          />
          <TouchableOpacity style={styles.botonBuscar} onPress={buscarPorFolio}>
            <Ionicons name="search" size={20} color="white" />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity style={styles.botonAyuda} onPress={() => setModalAyuda(true)}>
          <Ionicons name="help-circle" size={28} color="white" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.botonUbicacion} onPress={centrarEnUbicacion}>
        <Ionicons name="locate" size={28} color="white" />
      </TouchableOpacity>
    </View>
  )
) : (
  <View style={styles.loadingContainer}>
    <Text style={styles.loadingText}>Cargando mapa...</Text>
  </View>
)}

<View style={{ flex: 1 }}>      
  <TouchableOpacity 
    onLongPress={() => router.push('/dashboard')}
    delayLongPress={2000}
    activeOpacity={1}
  >
    <Text style={styles.titulo}>Hecho para la ciudadanía de TJ</Text>
  </TouchableOpacity>
  
  <View style={styles.contadoresMiniContainer}>
    <View style={styles.contadorMini}>
      <Text style={styles.numeroContadorMini}>{contadorReportes}</Text>
      <Text style={styles.textoContadorMini}>Reportes</Text>
    </View>
    <View style={styles.separadorContador} />
    <View style={styles.contadorMini}>
      <Text style={[styles.numeroContadorMini, {color: '#00C9A7'}]}>{contadorReparados}</Text>
      <Text style={styles.textoContadorMini}>Reparados</Text>
    </View>
  </View>

  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosContainer}>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'todos' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('todos')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'todos' && styles.textoFiltroActivo]}>Todos</Text>
    </TouchableOpacity>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'bache' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('bache')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'bache' && styles.textoFiltroActivo]}>🕳️ Baches</Text>
    </TouchableOpacity>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'alcantarilla' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('alcantarilla')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'alcantarilla' && styles.textoFiltroActivo]}>⚫ Alcantarillas</Text>
    </TouchableOpacity>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'camellon' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('camellon')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'camellon' && styles.textoFiltroActivo]}>🚧 Camellones</Text>
    </TouchableOpacity>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'pendiente' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('pendiente')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'pendiente' && styles.textoFiltroActivo]}>Pendientes</Text>
    </TouchableOpacity>
    <TouchableOpacity 
      style={[styles.botonFiltro, filtroActivo === 'reparado' && styles.botonFiltroActivo]}
      onPress={() => setFiltroActivo('reparado')}
    >
      <Text style={[styles.textoFiltro, filtroActivo === 'reparado' && styles.textoFiltroActivo]}>✅ Reparados</Text>
    </TouchableOpacity>
    <View style={{ height: 30 }} />
  </ScrollView>

  <Text style={styles.tituloApp}>GeoBache TJ</Text>
  <Text style={styles.subtitulo}>Reporta los imperfectos de Tijuana</Text>

  <Link href={{ pathname: "/reporte", params: { tipo: 'bache' } }} asChild>
    <TouchableOpacity>
      <LinearGradient
        colors={['#FF3B30', '#FF9500']}
        style={styles.botonReporte}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.iconoBoton}>🕳️</Text>
        <Text style={styles.textoBoton}>Reportar Bache</Text>
      </LinearGradient>
    </TouchableOpacity>
  </Link>

  <Link href={{ pathname: "/reporte", params: { tipo: 'alcantarilla' } }} asChild>
    <TouchableOpacity>
      <LinearGradient
        colors={['#00C9A7', '#00805E']}
        style={styles.botonSecundario}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={styles.iconoBoton}>🚧</Text>
        <Text style={styles.textoBoton}>Alcantarilla / Camellón</Text>
      </LinearGradient>
    </TouchableOpacity>
  </Link>
  
  <View style={{ height: 30 }} />
</View>

<Modal
  visible={modalAyuda}
  transparent={true}
  animationType="fade"
  onRequestClose={() => setModalAyuda(false)}
>
  <View style={styles.modalFondo}>
    <View style={styles.modalContenido}>
      <Text style={styles.modalTitulo}>¿Cómo usar GeoBache TJ?</Text>
      
      <Text style={styles.modalSubtitulo}>Leyenda del mapa:</Text>
      <View style={styles.leyendaItem}>
        <View style={[styles.marcador, styles.marcadorPendiente]}><Text>🕳️</Text></View>
        <Text style={styles.leyendaTexto}>Bache pendiente</Text>
      </View>
      <View style={styles.leyendaItem}>
        <View style={[styles.marcador, styles.marcadorPendiente]}><Text>⚫</Text></View>
        <Text style={styles.leyendaTexto}>Alcantarilla pendiente</Text>
      </View>
      <View style={styles.leyendaItem}>
        <View style={[styles.marcador, styles.marcadorPendiente]}><Text>🚧</Text></View>
        <Text style={styles.leyendaTexto}>Camellón pendiente</Text>
      </View>
      <View style={styles.leyendaItem}>
        <View style={[styles.marcador, styles.marcadorReparado]}><Text>✅</Text></View>
        <Text style={styles.leyendaTexto}>Reparado por Ayuntamiento</Text>
      </View>

            <Text style={styles.modalSubtitulo}>Pasos para reportar:</Text>
            <Text style={styles.modalTexto}>1. Pica "Reportar Bache" o "Alcantarilla/Camellón"</Text>
            <Text style={styles.modalTexto}>2. Toma foto y selecciona el tamaño/tipo</Text>
            <Text style={styles.modalTexto}>3. Envía. Guarda tu folio GB-X-00001</Text>
            <Text style={styles.modalTexto}>4. Busca tu folio arriba para ver el estatus</Text>
            <Text style={styles.modalTexto}>5. Pica el pin y comparte</Text>
    
            <TouchableOpacity style={styles.botonCerrarModal} onPress={() => setModalAyuda(false)}>
              <Text style={styles.textoCerrarModal}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalDetalle}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalDetalle(false)}
      >
        <View style={styles.modalFondo}>
          <View style={styles.modalDetalleContenido}>
            <TouchableOpacity style={styles.botonCerrarX} onPress={() => setModalDetalle(false)}>
              <Ionicons name="close" size={28} color="#666" />
            </TouchableOpacity>

            {reporteSeleccionado && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.detalleHeader}>
                  <Text style={styles.detalleFolio}>{reporteSeleccionado.folio}</Text>
                  <View style={[
                    styles.badgeEstatus,
                    reporteSeleccionado.estatus === 'reparado' ? styles.badgeReparado : styles.badgePendiente
                  ]}>
                    <Text style={styles.textoBadge}>
                      {reporteSeleccionado.estatus === 'reparado' ? '✅ Reparado' : '🕳️ Pendiente'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.detalleTipo}>
                  {obtenerIcono(reporteSeleccionado.tipo_reporte)} {reporteSeleccionado.tipo_reporte.charAt(0).toUpperCase() + reporteSeleccionado.tipo_reporte.slice(1)}
                </Text>

                <View style={styles.detalleSeccion}>
                  <Text style={styles.detalleLabel}>Ubicación</Text>
                  <Text style={styles.detalleValor}>{reporteSeleccionado.colonia || 'Sin colonia'}</Text>
                  <Text style={styles.detalleValorSecundario}>{reporteSeleccionado.direccion_texto || 'Sin dirección'}</Text>
                </View>

                {reporteSeleccionado.medida_aproximada && (
                  <View style={styles.detalleSeccion}>
                    <Text style={styles.detalleLabel}>Medida aproximada</Text>
                    <Text style={styles.detalleValor}>{reporteSeleccionado.medida_aproximada}</Text>
                  </View>
                )}

                {reporteSeleccionado.categoria_reporte && (
                  <View style={styles.detalleSeccion}>
                    <Text style={styles.detalleLabel}>Categoría</Text>
                    <Text style={styles.detalleValor}>{reporteSeleccionado.categoria_reporte}</Text>
                  </View>
                )}

                {reporteSeleccionado.descripcion && (
                  <View style={styles.detalleSeccion}>
                    <Text style={styles.detalleLabel}>Descripción</Text>
                    <Text style={styles.detalleValor}>{reporteSeleccionado.descripcion}</Text>
                  </View>
                )}

                <View style={styles.detalleSeccion}>
                  <Text style={styles.detalleLabel}>Foto del reporte</Text>
                  {reporteSeleccionado.foto_url ? (
                    <Image source={{ uri: reporteSeleccionado.foto_url }} style={styles.imagenDetalle} />
                  ) : (
                    <Text style={styles.detalleValorSecundario}>Sin foto</Text>
                  )}
                </View>

                {reporteSeleccionado.estatus === 'reparado' && (
                  <View>
                    <View style={styles.separador} />
                    <Text style={styles.detalleSeccionTitulo}>Trabajo realizado</Text>
                    
                    <View style={styles.detalleSeccion}>
                      <Text style={styles.detalleLabel}>Fecha de reparación</Text>
                      <Text style={styles.detalleValor}>{formatearFecha(reporteSeleccionado.fecha_reparacion)}</Text>
                    </View>

                    <View style={styles.detalleSeccion}>
                      <Text style={styles.detalleLabel}>Costo de reparación</Text>
                      <Text style={styles.detalleValorCosto}>{formatearCosto(reporteSeleccionado.costo_reparacion)}</Text>
                    </View>

                    <View style={styles.detalleSeccion}>
                      <Text style={styles.detalleLabel}>Foto evidencia</Text>
                      {reporteSeleccionado.foto_reparacion_url ? (
                        <Image source={{ uri: reporteSeleccionado.foto_reparacion_url }} style={styles.imagenDetalle} />
                      ) : (
                        <Text style={styles.detalleValorSecundario}>Sin foto de evidencia</Text>
                      )}
                    </View>

                    <TouchableOpacity 
                      style={[styles.botonCompartir, {backgroundColor: '#00C9A7', marginBottom: 10}]} 
                      onPress={() => generarPDF(reporteSeleccionado)}
                      disabled={generandoPDF}
                    >
                      <Ionicons name="download" size={20} color="white" />
                      <Text style={styles.textoCompartir}>
                        {generandoPDF ? 'Generando PDF...' : 'Descargar Evidencia PDF'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity 
                  style={styles.botonCompartir} 
                  onPress={() => compartirReporte(reporteSeleccionado)}
                >
                  <Ionicons name="share-social" size={20} color="white" />
                  <Text style={styles.textoCompartir}>Compartir Reporte</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#4A90E2' },
  mapContainer: { height: height * 0.55, backgroundColor: '#4A90E2' },
  mapWrapper: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#4A90E2' },
  loadingText: { color: 'white', fontSize: 18, fontWeight: 'bold' },

  // BARRA SUPERIOR: BUSCADOR + AYUDA
  headerMapa: {
    position: 'absolute',
    top: 40,
    left: 15,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  barraBusqueda: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.20,
    shadowRadius: 4,
    elevation: 5,
  },
  inputBusqueda: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    paddingVertical: 10,
  },
  botonBuscar: {
    backgroundColor: '#4A90E2',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonAyuda: {
    position: 'absolute',
    top: 50,
    right: 1,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#4A90E2',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

  // BOTÓN UBICAR ARRIBA DEL PANEL AZUL
  botonUbicacion: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#00C9A7',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },

  marcador: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#FF3B30',
  },
  marcadorPendiente: {
    borderColor: '#FF3B30',
  },
  marcadorReparado: {
    borderColor: '#00C9A7',
    backgroundColor: '#00C9A7',
  },
  marcadorProceso: {
    borderColor: '#FF9500',
  },
  marcadorTexto: {
    fontSize: 20,
  },
  scrollContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flex: 1,
    backgroundColor: '#4A90E2',
  },
  scrollContainer: {
    padding: 20,
  },
  titulo: {
    color: 'white',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 15,
    marginBottom: 10,
    fontWeight: '700',
    opacity: 10,
  },
  contadoresMiniContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  contadorMini: {
    alignItems: 'center',
    flex: 1,
  },
  numeroContadorMini: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  textoContadorMini: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  separadorContador: {
    width: 1,
    height: 30,
    backgroundColor: '#E0E0E0',
  },
  filtrosContainer: {
    marginBottom: 15,
    maxHeight: 45,
    paddingLeft: 20,
  },
  botonFiltro: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    elevation: 2,
  },
  botonFiltroActivo: {
    backgroundColor: '#4A90E2',
    borderColor: '#4A90E2',
  },
  textoFiltro: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  textoFiltroActivo: {
    color: 'white',
  },
  tituloApp: {
    color: '#333',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitulo: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  botonReporte: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  botonSecundario: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  iconoBoton: {
    fontSize: 24,
    marginRight: 10,
  },
  textoBoton: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContenido: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
  },
  modalTitulo: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalSubtitulo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  modalTexto: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  leyendaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  leyendaTexto: {
    fontSize: 14,
    color: '#666',
  },
  botonCerrarModal: {
    backgroundColor: '#4A90E2',
    padding: 15,
    borderRadius: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  textoCerrarModal: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalDetalleContenido: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  botonCerrarX: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 10,
    padding: 5,
  },
  detalleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingRight: 30,
  },
  detalleFolio: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A90E2',
  },
  badgeEstatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  badgePendiente: {
    backgroundColor: '#FF3B30',
  },
  badgeReparado: {
    backgroundColor: '#00C9A7',
  },
  textoBadge: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  detalleTipo: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  detalleSeccion: {
    marginBottom: 15,
  },
  detalleSeccionTitulo: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00C9A7',
    marginBottom: 15,
  },
  detalleLabel: {
    fontSize: 12,
    color: '#999',
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 5,
  },
  detalleValor: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  detalleValorSecundario: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
  },
  detalleValorCosto: {
    fontSize: 24,
    color: '#00C9A7',
    fontWeight: 'bold',
  },
  imagenDetalle: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginTop: 8,
  },
  separador: {
    height: 2,
    backgroundColor: '#eee',
    marginVertical: 20,
  },
  botonCompartir: {
    backgroundColor: '#4A90E2',
    flexDirection: 'row',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  textoCompartir: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});