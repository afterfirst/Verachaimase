import React, { useState } from 'react';
import { auth } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { LogIn, User as UserIcon, Languages, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginProps {
  onGuest: () => void;
}

export default function Login({ onGuest }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800">
      <div className="flex flex-col items-center mb-10">
        <div className="w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
          <Languages className="w-10 h-10 text-indigo-600 dark:text-indigo-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Kotoba Study</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-center text-sm px-4">
          Master Japanese vocabulary with pitch accent data and visual scan technology.
        </p>
      </div>

      <div className="space-y-4">
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-2xl flex items-center justify-center gap-3 transition-all border border-slate-200 dark:border-slate-700 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="animate-spin w-5 h-5 text-indigo-500" />
          ) : (
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          )}
          Sign in with Google
        </button>

        <div className="flex items-center gap-4 py-4">
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">OR</span>
          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
        </div>

        <button
          onClick={onGuest}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
        >
          <UserIcon className="w-5 h-5" />
          Continue as Guest
        </button>

        {error && (
          <p className="mt-4 text-red-500 text-xs bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-200 dark:border-red-900/30">
            {error}
          </p>
        )}
      </div>

      <p className="mt-10 text-center text-[11px] text-slate-400 font-medium">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
