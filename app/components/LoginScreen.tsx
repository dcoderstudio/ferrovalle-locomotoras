'use client';

import Image from 'next/image';
import { setSession } from '../lib/auth';

// Single hardcoded profile for now — no password step, no técnico role.
// TODO: reintroduce multiple users + password verification against /api/auth later.
const USER = {
  id: 'ferrovalle',
  name: 'FERROVALLE',
  initials: 'FV',
  color: '#f97316',
};

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const handleEnter = () => {
    setSession({
      userId: USER.id,
      userName: USER.name,
      userColor: USER.color,
      userInitials: USER.initials,
      userRole: 'admin',
    });
    onLogin();
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: '#080c14' }}
    >
      <Image src="/ferrovalle-logo.svg" alt="Ferrovalle" width={220} height={25} priority className="mb-3 opacity-90" />
      <p className="text-purple-300/40 text-xs mb-12 tracking-wider uppercase">Sistema de Gestión de Locomotoras</p>

      <button
        onClick={handleEnter}
        className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-white/[0.04] transition-all group"
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform select-none"
          style={{
            background: `linear-gradient(135deg, ${USER.color}, ${USER.color}99)`,
            boxShadow: `0 4px 24px ${USER.color}50`,
          }}
        >
          <span className="text-white font-bold text-2xl">{USER.initials}</span>
        </div>
        <span className="text-slate-300 text-sm font-semibold group-hover:text-white transition-colors">
          {USER.name}
        </span>
      </button>

      {/* Manual link */}
      <a
        href="/manual.html"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-14 flex items-center gap-2 text-slate-600 hover:text-slate-300 text-xs transition-colors group"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity">
          <path d="M4 4h12v12H4V4z M4 8h12 M8 4v12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="tracking-wide uppercase" style={{ fontSize: '10px', letterSpacing: '0.1em' }}>Manual de usuario</span>
      </a>
    </div>
  );
}
