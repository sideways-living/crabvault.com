import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import CrabVaultLayout from './components/CrabVaultLayout';
import CrabVaultDashboard from './pages/CrabVaultDashboard';
import CrabsPage from './pages/CrabsPage';
import CrabDetail from './pages/CrabDetail';
import CrabDocumentsPage from './pages/CrabDocumentsPage';
import MarketsPage from './pages/MarketsPage';
import CrabIngressPage from './pages/CrabIngressPage';
import CrabDocumentDetail from './pages/CrabDocumentDetail';
import CrabCheatSheet from './pages/CrabCheatSheet';
import NeedsAttentionPage from './pages/NeedsAttentionPage';
import WatcherStatus from './pages/WatcherStatus';
import DocumentSearchPage from './pages/DocumentSearchPage';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return (
        <div className="fixed inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      );
    }
  }

  return (
    <Routes>
      <Route element={<CrabVaultLayout />}>
        <Route path="/" element={<CrabVaultDashboard />} />
        <Route path="/crabs" element={<CrabsPage />} />
        <Route path="/crabs/:id" element={<CrabDetail />} />
        <Route path="/crab-documents" element={<CrabDocumentsPage />} />
        <Route path="/crab-documents/:id" element={<CrabDocumentDetail />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/ingress" element={<CrabIngressPage />} />
        <Route path="/cheat-sheet" element={<CrabCheatSheet />} />
        <Route path="/watcher-status" element={<WatcherStatus />} />
        <Route path="/needs-attention" element={<NeedsAttentionPage />} />
        <Route path="/search" element={<DocumentSearchPage />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App