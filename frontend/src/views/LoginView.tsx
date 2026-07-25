import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, User, KeyRound, AlertCircle, ArrowRight, Loader2, ShieldCheck, Cpu } from 'lucide-react';

const LoginView: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100 relative overflow-hidden">
      {/* Background ambient glowing spheres */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse" />
      <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none -z-10 animate-pulse delay-700" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/20">
            <Cpu className="w-7 h-7 text-white animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-blue-200">
            Smart Invoice Processor
          </h1>
        </div>
        <p className="mt-3 text-center text-sm text-slate-400 font-medium">
          Authorized personnel only. Please sign in to access the system.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-slate-900/80 border border-slate-800/80 py-8 px-6 shadow-2xl shadow-black/50 rounded-2xl sm:px-10 backdrop-blur-xl relative group">
          {/* Subtle top glowing accent line */}
          <div className="absolute top-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />

          <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-800/60 text-slate-300">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Secure Access Gateway</span>
          </div>

          {error && (
            <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3 animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-200 leading-relaxed font-medium">
                {error}
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Username
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="h-5 w-5" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Enter your admin username"
                  className="block w-full pl-11 pr-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="••••••••••••"
                  className="block w-full pl-11 pr-4 py-3 bg-slate-950/70 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-blue-500 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group-hover:shadow-blue-500/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800/60 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5" />
              <span>Protected by 256-bit encrypted JWT token rotation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
