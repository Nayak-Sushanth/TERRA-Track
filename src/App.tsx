import React from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PotholeDetailSheet } from './components/PotholeDetailSheet';
import { AppDataProvider, useAppData } from './context/AppDataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { firebaseInitError, isFirebaseConfigured } from './firebase/config';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { MapPage } from './pages/MapPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { RideModePage } from './pages/RideModePage';
import { ConfigMissingScreen, SplashScreen } from './pages/SplashScreen';
import { RoutePage } from './pages/RoutePage';

const AuthenticatedShell: React.FC = () => {
  const location = useLocation();
  const { selectedPothole, setSelectedPothole } = useAppData();
  const isRideMode = location.pathname === '/ride';

  return (
    <div className="min-h-screen bg-[#E6EBF2] text-[#111827]">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/route" element={<RoutePage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/ride" element={<RideModePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!isRideMode && <BottomNav />}
      <PotholeDetailSheet pothole={selectedPothole} onClose={() => setSelectedPothole(null)} />
    </div>
  );
};

const AuthGate: React.FC = () => {
  const { user, isInitializing } = useAuth();

  if (isInitializing) {
    return <SplashScreen />;
  }

  if (user) {
    return (
      <AppDataProvider>
        <AuthenticatedShell />
      </AppDataProvider>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
};

export default function App() {
  if (!isFirebaseConfigured || firebaseInitError) {
    return <ConfigMissingScreen />;
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <HashRouter>
          <AuthGate />
        </HashRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
