import React from 'react';
import { useAuth } from './context/AuthContext';
import { useLocation, matchPath } from './lib/router';
import Shell from './components/Shell';
import AuthGateway from './components/AuthGateway';
import ListsPage from './pages/ListsPage';
import ListDetailPage from './pages/ListDetailPage';
import FamilyPage from './pages/FamilyPage';
import SecretSantaPage from './pages/SecretSantaPage';
import SantaRevealPage from './pages/SantaRevealPage';
import SharedGuestPage from './pages/SharedGuestPage';
import SettingsPage from './pages/SettingsPage';
import { Spinner } from './components/ui';

export default function App() {
  const { user, loading } = useAuth();
  const { path } = useLocation();

  // 1. Frictionless Public / Guest Routes (No login required)
  let params;
  if ((params = matchPath('/shared/:token', path))) {
    return <SharedGuestPage token={params.token} />;
  }

  if ((params = matchPath('/santa/view/:token', path))) {
    return <SantaRevealPage token={params.token} />;
  }

  // 2. Authentication Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <Spinner className="w-8 h-8 text-tomato-600" />
      </div>
    );
  }

  // 3. Unauthenticated Gateway
  if (!user) {
    return <AuthGateway />;
  }

  // 4. Authenticated Application Routes
  let content = <ListsPage />;

  if ((params = matchPath('/lists/:id', path))) {
    content = <ListDetailPage wishlistId={parseInt(params.id, 10)} />;
  } else if (path === '/family') {
    content = <FamilyPage />;
  } else if (path === '/santa') {
    content = <SecretSantaPage />;
  } else if (path === '/settings') {
    content = <SettingsPage />;
  }

  return <Shell>{content}</Shell>;
}
