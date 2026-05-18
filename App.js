import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';

// Va afuera del componente para que se ejecute antes de renderizar
MapLibreGL.setAccessToken(null);

export default function App() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);
  const [mapError, setMapError] = useState(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasPermission(status === 'granted');
      
      if (status !== 'granted') {
        setErrorMsg('Permiso de ubicación denegado');
        setLocation([-117.0382, 32.5149]); // Fallback: Tijuana Centro
        return;
      }
      
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced
        });
        setLocation([loc.coords.longitude, loc.coords.latitude]);
      } catch (e) {
        setErrorMsg('GPS desactivado. Usando ubicación por defecto');
        setLocation([-117.0382, 32.5149]); // Fallback: Tijuana Centro
      }
    })();
  }, []);

  if (!location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0B1E3D" />
        <Text style={styles.loadingText}>Obteniendo ubicación...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <MapLibreGL.MapView
        style={styles.map}
        styleURL="https://demotiles.maplibre.org/style.json"
        logoEnabled={false}
        onDidFailLoadingMap={() => setMapError('Error al cargar el mapa')}
      >
        <MapLibreGL.Camera
          zoomLevel={14}
          centerCoordinate={location}
          animationMode="flyTo"
          animationDuration={1000}
        />
        {/* {hasPermission && <MapLibreGL.UserLocation visible={true} />} */}
      </MapLibreGL.MapView>?=)
      
      {(errorMsg || mapError) && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{errorMsg || mapError}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B1E3D',
  },
  loadingText: {
    color: 'white',
    marginTop: 10,
    fontSize: 16,
  },
  errorBanner: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#FF6B6B',
    padding: 12,
    borderRadius: 8,
    elevation: 5,
  },
  errorText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
});