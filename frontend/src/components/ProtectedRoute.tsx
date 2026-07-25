import React from 'react';
import { useAuth } from '../context/AuthContext';
import LoginView from '../views/LoginView';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200">
        <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-slate-900/50 border border-slate-800 shadow-xl backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <p className="text-sm font-medium tracking-wide text-slate-400">Verifying session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
