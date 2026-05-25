import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Alert, Modal, TextInput, Image, Share } from 'react-native';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export default function DashboardScreen() {
  const [reportes, setReportes] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [stats, setStats] = useState({
    total: 0, baches: 0, camellones: 0, alcantarillas: 0,
    reparados: 0, costoTotal: 0, tiempoPromedio: 0, topColonias: []
  });
  const [modalReparar, setModalReparar] = useState(false);
  const [reporteActual, setReporteActual] = useState(null);
  const [fotoReparacion, setFotoReparacion] = useState(null);
  const [costoMateriales, setCostoMateriales] = useState('');
  const [costoManoObra, setCostoManoObra] = useState('');
  const [costoMaquinaria, setCostoMaquinaria] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [gpsReparacion, setGpsReparacion] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const router = useRouter();

  useEffect(() => {
    cargarReportes();
  }, [filtro]);

  const cargarReportes = async () => {
    let query = supabase
 .from('reportes')
 .select('*')
 .order('created_at', { ascending: false });

    if (filtro !== 'todos') {
      query = query.eq('tipo_reporte', filtro);
    }

    const { data, error } = await query;
    if (error) {
      Alert.alert('Error', 'No se pudieron cargar los reportes');
      return;
    }
    setReportes(data || []);
    calcularStats(data || []);
  };

  const calcularStats = (data) => {
    const total = data.length;
    const baches = data.filter(r => r.tipo_reporte === 'bache').length;
    const camellones = data.filter(r => r.tipo_reporte === 'camellon').length;
    const alcantarillas = data.filter(r => r.tipo_reporte === 'alcantarilla').length;
    const reparados = data.filter(r => r.estatus === 'reparado');
    const costoTotal = reparados.reduce((sum, r) => sum + (parseFloat(r.costo_reparacion) || 0), 0);

    // 4. Tiempo promedio de resolución en días
    const tiemposResolucion = reparados
   .filter(r => r.fecha_reparacion && r.created_at)
   .map(r => {
        const inicio = new Date(r.created_at);
        const fin = new Date(r.fecha_reparacion);
        return Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24));
      });
    const tiempoPromedio = tiemposResolucion.length > 0
   ? Math.round(tiemposResolucion.reduce((a, b) => a + b, 0) / tiemposResolucion.length)
      : 0;

    // 5. Top 3 colonias por gasto
    const gastoPorColonia = {};
    reparados.forEach(r => {
      const colonia = r.colonia || 'Sin colonia';
      gastoPorColonia[colonia] = (gastoPorColonia[colonia] || 0) + (parseFloat(r.costo_reparacion) || 0);
    });
    const topColonias = Object.entries(gastoPorColonia)
   .sort((a, b) => b[1] - a[1])
   .slice(0, 3)
   .map(([colonia, gasto]) => ({ colonia, gasto }));

    setStats({ total, baches, camellones, alcantarillas, reparados: reparados.length, costoTotal, tiempoPromedio, topColonias });
  };

  const abrirEnMapa = (lat, lng) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url);
  };

  const abrirModalReparar = async (reporte) => {
    setReporteActual(reporte);
    setFotoReparacion(null);
    setCostoMateriales('');
    setCostoManoObra('');
    setCostoMaquinaria('');
    setSupervisor(''); // Limpiar nombre al abrir

    // 3. Capturar GPS al abrir modal
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {                             
      const location = await Location.  getCurrentPositionAsync({});
      setGpsReparacion({ lat: location.coords.latitude, lng: location.coords.longitude });
    }
    setModalReparar(true);
  };

  const tomarFotoReparacion = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status!== 'granted') {
      Alert.alert('Error', 'Se necesita permiso de cámara');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.5,
    });

    if (!result.canceled) {
      setFotoReparacion(result.assets[0].uri);
    }
  };

  const guardarReparacion = async () => {
    const mat = parseFloat(costoMateriales) || 0;
    const mano = parseFloat(costoManoObra) || 0;
    const maq = parseFloat(costoMaquinaria) || 0;
    const total = mat + mano + maq;

    if (!supervisor.trim()) {
      Alert.alert('Error', 'Ingresa el nombre del supervisor');
      return;
    }

    if (total <= 0) {
      Alert.alert('Error', 'Ingresa al menos un costo mayor a 0');
      return;
    }

    if (!fotoReparacion) {
      Alert.alert('Error', 'Toma una foto de la reparación terminada');
      return;
    }

    if (!gpsReparacion) {
      Alert.alert('Error', 'No se pudo obtener ubicación GPS. Activa permisos.');
      return;
    }

    setSubiendo(true);
    try {
      let publicUrl = null;

      const response = await fetch(fotoReparacion);
      const arrayBuffer = await response.arrayBuffer();
      const fileExt = fotoReparacion.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `reparacion-${reporteActual.id}-${Date.now()}.${fileExt}`;

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

      // 2, 3: Desglose + Firma + GPS
      const { error: updateError } = await supabase
  .from('reportes')
  .update({
          estatus: 'reparado',
          fecha_reparacion: new Date().toISOString(),
          foto_reparacion_url: publicUrl,
          costo_materiales: mat,
          costo_mano_obra: mano,
          costo_maquinaria: maq,
          costo_reparacion: total,
          supervisor_nombre: supervisor.trim(),
          gps_reparacion_lat: gpsReparacion.lat,
          gps_reparacion_lng: gpsReparacion.lng,
          timestamp_reparacion: new Date().toISOString()
        })
  .eq('id', reporteActual.id);

      if (updateError) throw updateError;

      Alert.alert('Éxito', 'Reparación registrada con transparencia total');
      setModalReparar(false);
      cargarReportes();
    } catch (error) {
      Alert.alert('Error', error.message || 'No se pudo guardar la reparación');
    } finally {
      setSubiendo(false);
    }
  };

  // 6. Compartir folio público
  const compartirFolio = async (folio) => {
    try {
      await Share.share({
        message: `Consulta el estatus del reporte ${folio} en: https://geobachetj.com/folio/${folio}`,
        url: `https://geobachetj.com/folio/${folio}`
      });
    } catch (error) {
      Alert.alert('Error', 'No se pudo compartir');
    }
  };

  // 7. Exportar CSV para auditoría - FIX UTF8
  const exportarCSV = async () => {
    try {
      let csv = 'Folio,Tipo,Categoria,Colonia,CP,Fecha Reporte,Fecha Reparacion,Dias Resolucion,Estatus,Materiales,Mano Obra,Maquinaria,Total,Supervisor,GPS Lat,GPS Lng\n';

      reportes.forEach(r => {
        const diasRes = r.fecha_reparacion && r.created_at
       ? Math.ceil((new Date(r.fecha_reparacion) - new Date(r.created_at)) / (1000 * 60 * 60 * 24))
          : '';
        csv += `${r.folio},${r.tipo_reporte},${r.categoria_reporte || ''},${r.colonia || ''},${r.codigo_postal || ''},${r.created_at},${r.fecha_reparacion || ''},${diasRes},${r.estatus},${r.costo_materiales || 0},${r.costo_mano_obra || 0},${r.costo_maquinaria || 0},${r.costo_reparacion || 0},${r.supervisor_nombre || ''},${r.gps_reparacion_lat || ''},${r.gps_reparacion_lng || ''}\n`;
      });

      const fileUri = FileSystem.documentDirectory + `reportes-geobache-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: 'utf8' });
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar reportes GeoBacheTJ'
      });
    } catch (error) {
      Alert.alert('Error', 'No se pudo exportar: ' + error.message);
    }
  };

  const colorPorTipo = (tipo, estatus) => {
    if (estatus === 'reparado') return '#00C9A7';
    if (tipo === 'bache') return '#FF3B30';
    if (tipo === 'camellon') return '#00C9A7';
    if (tipo === 'alcantarilla') return '#4A90E2';
    return '#666';
  };

  const formatearCosto = (costo) => {
    if (!costo) return '$0.00';
    return `$${parseFloat(costo).toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  };

  const calcularDiasResolucion = (inicio, fin) => {
    if (!inicio || !fin) return null;
    return Math.ceil((new Date(fin) - new Date(inicio)) / (1000 * 60 * 60 * 24));
  };
  return (
    <LinearGradient colors={['#1C1C1E', '#2C2C2E']} style={styles.container}>
      <TouchableOpacity style={styles.botonRegresar} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.botonExportar} onPress={exportarCSV}>
        <Ionicons name="download" size={24} color="white" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.titulo}>Dashboard Ayuntamiento</Text>
        <Text style={styles.subtitulo}>GeoBacheTJ - Transparencia Total</Text>

        {/* 5. Mapa de calor de gasto */}
        {stats.topColonias.length > 0 && (
          <View style={styles.mapaCalor}>
            <Text style={styles.tituloMapaCalor}>💰 Top Colonias por Inversión</Text>
            {stats.topColonias.map((item, idx) => (
              <View key={idx} style={styles.itemMapaCalor}>
                <Text style={styles.coloniaMapa}>{idx + 1}. {item.colonia}</Text>
                <Text style={styles.gastoMapa}>{formatearCosto(item.gasto)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumero}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#FF3B30' }]}>
            <Text style={styles.statNumero}>{stats.baches}</Text>
            <Text style={styles.statLabel}>Baches</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#00C9A7' }]}>
            <Text style={styles.statNumero}>{stats.camellones}</Text>
            <Text style={styles.statLabel}>Camellones</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#4A90E2' }]}>
            <Text style={styles.statNumero}>{stats.alcantarillas}</Text>
            <Text style={styles.statLabel}>Alcantarillas</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#00C9A7', width: '48%' }]}>
            <Text style={styles.statNumero}>{stats.reparados}</Text>
            <Text style={styles.statLabel}>Reparados ✅</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#FF9500', width: '48%' }]}>
            <Text style={[styles.statNumero, { fontSize: 20 }]}>{formatearCosto(stats.costoTotal)}</Text>
            <Text style={styles.statLabel}>Invertido</Text>
          </View>
          {/* 4. Tiempo promedio */}
          <View style={[styles.statCard, { borderLeftColor: '#9B59B6', width: '100%' }]}>
            <Text style={styles.statNumero}>{stats.tiempoPromedio} días</Text>
            <Text style={styles.statLabel}>Tiempo Promedio de Resolución</Text>
          </View>
        </View>

        <View style={styles.filtrosContainer}>
          {['todos', 'bache', 'camellon', 'alcantarilla'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.botonFiltro, filtro === f && styles.botonFiltroActivo]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[styles.textoFiltro, filtro === f && styles.textoFiltroActivo]}>
                {f.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {reportes.map((rep) => (
          <View key={rep.id} style={styles.cardReporte}>
            <View style={[styles.bandaColor, { backgroundColor: colorPorTipo(rep.tipo_reporte, rep.estatus) }]} />
            <View style={styles.contenidoReporte}>
              <View style={styles.headerReporte}>
                <Text style={styles.folioReporte}>Folio: {rep.folio}</Text>
                <Text style={styles.fechaReporte}>
                  {new Date(rep.created_at).toLocaleDateString('es-MX')}
                </Text>
              </View>

              <View style={styles.tipoContainer}>
                <Text style={styles.tipoReporte}>
                  {rep.tipo_reporte.toUpperCase()}
                  {rep.categoria_reporte && ` - ${rep.categoria_reporte}`}
                </Text>
                {rep.estatus === 'reparado' && (
                  <View style={styles.badgeReparado}>
                    <Ionicons name="checkmark-circle" size={14} color="white" />
                    <Text style={styles.textoBadge}>REPARADO</Text>
                  </View>
                )}
              </View>

              <Text style={styles.direccionReporte}>
                📍 {rep.colonia || 'Sin colonia'}, CP {rep.codigo_postal || 'S/CP'}
              </Text>
              {rep.descripcion && (
                <Text style={styles.descripcionReporte}>"{rep.descripcion}"</Text>
              )}

              {rep.estatus === 'reparado' && (
                <View style={styles.infoReparacion}>
                  <Text style={styles.textoInfoReparacion}>
                    💰 Total: {formatearCosto(rep.costo_reparacion)}
                  </Text>
                  {rep.costo_materiales > 0 && (
                    <Text style={styles.textoDesglose}>• Materiales: {formatearCosto(rep.costo_materiales)}</Text>
                  )}
                  {rep.costo_mano_obra > 0 && (
                    <Text style={styles.textoDesglose}>• Mano obra: {formatearCosto(rep.costo_mano_obra)}</Text>
                  )}
                  {rep.costo_maquinaria > 0 && (
                    <Text style={styles.textoDesglose}>• Maquinaria: {formatearCosto(rep.costo_maquinaria)}</Text>
                  )}
                  {rep.fecha_reparacion && (
                    <Text style={styles.textoInfoReparacion}>
                      📅 Reparado: {new Date(rep.fecha_reparacion).toLocaleDateString('es-MX')}
                    </Text>
                  )}
                  {rep.supervisor_nombre && (
                    <Text style={styles.textoInfoReparacion}>👷 {rep.supervisor_nombre}</Text>
                  )}
                  {/* 4. Días de resolución */}
                  {calcularDiasResolucion(rep.created_at, rep.fecha_reparacion) && (
                    <Text style={styles.textoInfoReparacion}>
                      ⏱️ Tardó: {calcularDiasResolucion(rep.created_at, rep.fecha_reparacion)} días
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.accionesReporte}>
                <TouchableOpacity
                  style={styles.botonMapa}
                  onPress={() => abrirEnMapa(rep.latitud, rep.longitud)}
                >
                  <Ionicons name="map" size={18} color="white" />
                  <Text style={styles.textoBotonAccion}>Mapa</Text>
                </TouchableOpacity>
                {/* 6. Botón compartir folio */}
                <TouchableOpacity
                  style={styles.botonCompartir}
                  onPress={() => compartirFolio(rep.folio)}
                >
                  <Ionicons name="share-social" size={18} color="white" />
                  <Text style={styles.textoBotonAccion}>Compartir</Text>
                </TouchableOpacity>
                {rep.estatus!== 'reparado' && (
                  <TouchableOpacity
                    style={styles.botonReparado}
                    onPress={() => abrirModalReparar(rep)}
                  >
                    <Ionicons name="construct" size={18} color="white" />
                    <Text style={styles.textoBotonAccion}>Reparar</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ))}

        {reportes.length === 0 && (
          <Text style={styles.sinReportes}>No hay reportes con este filtro</Text>
        )}
      </ScrollView>

      {/* Modal de Reparación */}
      <Modal
        visible={modalReparar}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalReparar(false)}
      >
        <View style={styles.modalFondo}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContenido}>
              <Text style={styles.modalTitulo}>Registrar Reparación</Text>
              <Text style={styles.modalFolio}>Folio: {reporteActual?.folio}</Text>

              {/* NUEVO: TextInput para nombre del supervisor */}
              <Text style={styles.label}>Nombre del supervisor *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Ing. Juan Pérez"
                placeholderTextColor="#999"
                value={supervisor}
                onChangeText={setSupervisor}
                autoCapitalize="words"
              />

              <Text style={styles.label}>Costo de materiales (MXN)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 8000.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={costoMateriales}
                onChangeText={setCostoMateriales}
              />

              <Text style={styles.label}>Costo mano de obra (MXN)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 5000.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={costoManoObra}
                onChangeText={setCostoManoObra}
              />

              <Text style={styles.label}>Costo maquinaria (MXN)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: 2000.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
                value={costoMaquinaria}
                onChangeText={setCostoMaquinaria}
              />

              <Text style={styles.totalCalculado}>
                Total: {formatearCosto((parseFloat(costoMateriales) || 0) + (parseFloat(costoManoObra) || 0) + (parseFloat(costoMaquinaria) || 0))}
              </Text>

              <Text style={styles.label}>Foto DESPUÉS - Trabajo terminado</Text>
              {fotoReparacion? (
                <>
                  <Image source={{ uri: fotoReparacion }} style={styles.imagenPreview} />
                  <TouchableOpacity style={styles.botonCambiarFoto} onPress={tomarFotoReparacion}>
                    <Text style={styles.textoCambiarFoto}>Cambiar Foto</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.botonCamara} onPress={tomarFotoReparacion}>
                  <Ionicons name="camera" size={50} color="white" />
                  <Text style={styles.textoBotonCamara}>Tomar Foto</Text>
                </TouchableOpacity>
              )}

              {/* 3. Firma + GPS */}
              <View style={styles.infoGPS}>
                <Text style={styles.textoGPS}>👷 Supervisor: {supervisor || 'Sin nombre'}</Text>
                <Text style={styles.textoGPS}>📅 {new Date().toLocaleString('es-MX')}</Text>
                {gpsReparacion && (
                  <Text style={styles.textoGPS}>
                    📍 GPS: {gpsReparacion.lat.toFixed(4)}, {gpsReparacion.lng.toFixed(4)}
                  </Text>
                )}
              </View>

              <View style={styles.botonesModal}>
                <TouchableOpacity
                  style={[styles.botonModal, styles.botonCancelar]}
                  onPress={() => setModalReparar(false)}
                  disabled={subiendo}
                >
                  <Text style={styles.textoBotonModal}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.botonModal, styles.botonGuardar]}
                  onPress={guardarReparacion}
                  disabled={subiendo}
                >
                  <Text style={styles.textoBotonModal}>
                    {subiendo? 'Guardando...' : 'Guardar y Publicar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
  },
  botonExportar: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    padding: 8,
  },
  scroll: { padding: 20, paddingTop: 100 },
  titulo: { color: 'white', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  subtitulo: { color: '#999', fontSize: 14, textAlign: 'center', marginBottom: 20 },
  mapaCalor: { backgroundColor: '#2C2C2E', padding: 15, borderRadius: 12, marginBottom: 20 },
  tituloMapaCalor: { color: 'white', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  itemMapaCalor: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  coloniaMapa: { color: '#CCC', fontSize: 14 },
  gastoMapa: { color: '#00C9A7', fontSize: 14, fontWeight: 'bold' },
  statsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statCard: { backgroundColor: '#2C2C2E', width: '48%', padding: 15, borderRadius: 12, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FFF' },
  statNumero: { color: 'white', fontSize: 28, fontWeight: 'bold' },
  statLabel: { color: '#999', fontSize: 11, marginTop: 4 },
  filtrosContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 6 },
  botonFiltro: { backgroundColor: '#2C2C2E', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, flex: 1 },
  botonFiltroActivo: { backgroundColor: '#00C9A7' },
  textoFiltro: { color: 'white', textAlign: 'center', fontSize: 10, fontWeight: '600' },
  textoFiltroActivo: { color: '#1C1C1E' },
  cardReporte: { backgroundColor: '#2C2C2E', borderRadius: 12, marginBottom: 15, flexDirection: 'row', overflow: 'hidden' },
  bandaColor: { width: 6 },
  contenidoReporte: { flex: 1, padding: 15 },
  headerReporte: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  folioReporte: { color: '#00C9A7', fontWeight: 'bold', fontSize: 13 },
  fechaReporte: { color: '#666', fontSize: 12 },
  tipoContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  tipoReporte: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  badgeReparado: { backgroundColor: '#00C9A7', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, gap: 4 },
  textoBadge: { color: 'white', fontSize: 10, fontWeight: 'bold' },
  direccionReporte: { color: '#CCC', fontSize: 14, marginBottom: 8 },
  descripcionReporte: { color: '#999', fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  infoReparacion: { backgroundColor: 'rgba(0,201,167,0.1)', padding: 10, borderRadius: 8, marginBottom: 12 },
  textoInfoReparacion: { color: '#00C9A7', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  textoDesglose: { color: '#999', fontSize: 12, marginLeft: 10, marginBottom: 2 },
  accionesReporte: { flexDirection: 'row', gap: 8 },
  botonMapa: { backgroundColor: '#4A90E2', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, gap: 6, flex: 1 },
  botonCompartir: { backgroundColor: '#9B59B6', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, gap: 6, flex: 1 },
  botonReparado: { backgroundColor: '#00C9A7', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, gap: 6, flex: 1 },
  textoBotonAccion: { color: 'white', fontSize: 11, fontWeight: '600' },
  sinReportes: { color: '#666', textAlign: 'center', marginTop: 40, fontSize: 16 },
  modalFondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalContenido: {
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 400,
  },
  modalTitulo: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
    color: 'white',
  },
  modalFolio: {
    fontSize: 14,
    color: '#00C9A7',
    textAlign: 'center',
    marginBottom: 20,
    fontWeight: '600',
  },
  label: {
    color: 'white',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1C1C1E',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: '#444',
  },
  totalCalculado: {
    color: '#00C9A7',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  botonCamara: {
    backgroundColor: '#1C1C1E',
    height: 200,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#444',
    borderStyle: 'dashed',
  },
  textoBotonCamara: { color: 'white', marginTop: 10, fontSize: 16, fontWeight: '600' },
  imagenPreview: {
    width: '100%',
    height: 200,
    borderRadius: 15,
    marginBottom: 10,
  },
  botonCambiarFoto: {
    backgroundColor: '#4A90E2',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  textoCambiarFoto: {
    color: 'white',
    fontWeight: '600',
  },
  infoGPS: {
    backgroundColor: 'rgba(74,144,226,0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  textoGPS: {
    color: '#4A90E2',
    fontSize: 12,
    marginBottom: 4,
  },
  botonesModal: {
    flexDirection: 'row',
    gap: 10,
  },
  botonModal: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  botonCancelar: {
    backgroundColor: '#666',
  },
  botonGuardar: {
    backgroundColor: '#00C9A7',
  },
  textoBotonModal: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});