'use client';

import { useState, useEffect, useRef } from 'react';

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img') as HTMLImageElement;
    const url = URL.createObjectURL(file);
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error('timeout'));
    }, 15000);
    img.onload = () => {
      clearTimeout(timeout);
      const MAX = 900;
      let { width, height } = img;
      if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.70));
    };
    img.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('load error')); };
    img.src = url;
  });
}
import type { Locomotora, Phase } from '../types';
import { PHASES, emptyPhotosByPhase, emptyServicesByPhase } from '../types';
import Image from 'next/image';
import { loadLocomotoras, saveLocomotoras, flushLocomotoras, isConfigured } from '../lib/supabase';
import LocomotoraModal from './LocomotoraModal';
import { getSession, clearSession, hashPassword, type Session } from '../lib/auth';
import LoginScreen from './LoginScreen';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { downloadLocomotoraStatusPdf } from '../lib/locomotoraReport';

type ColumnConfig = {
  id: Phase;
  label: string;
  border: string;
  borderOver: string;
  headerBg: string;
  headerText: string;
  badge: string;
  dot: string;
  bar: string;
  emptyBorder: string;
};

// Tailwind's scanner needs full literal class names in source — cannot build
// these dynamically from a color-name variable, so each phase is spelled out.
const COLUMNS: ColumnConfig[] = [
  {
    id: 'arribo', label: PHASES[0].label,
    border: 'border-cyan-400/20', borderOver: 'border-cyan-400/60',
    headerBg: 'bg-cyan-400/10', headerText: 'text-cyan-300',
    badge: 'bg-cyan-400/20 text-cyan-300', dot: 'bg-cyan-400',
    bar: 'bg-cyan-400', emptyBorder: 'border-cyan-400/20',
  },
  {
    id: 'desmontaje', label: PHASES[1].label,
    border: 'border-sky-400/20', borderOver: 'border-sky-400/60',
    headerBg: 'bg-sky-400/10', headerText: 'text-sky-300',
    badge: 'bg-sky-400/20 text-sky-300', dot: 'bg-sky-400',
    bar: 'bg-sky-400', emptyBorder: 'border-sky-400/20',
  },
  {
    id: 'reparacion', label: PHASES[2].label,
    border: 'border-blue-400/20', borderOver: 'border-blue-400/60',
    headerBg: 'bg-blue-400/10', headerText: 'text-blue-300',
    badge: 'bg-blue-400/20 text-blue-300', dot: 'bg-blue-400',
    bar: 'bg-blue-400', emptyBorder: 'border-blue-400/20',
  },
  {
    id: 'limpieza', label: PHASES[3].label,
    border: 'border-teal-400/20', borderOver: 'border-teal-400/60',
    headerBg: 'bg-teal-400/10', headerText: 'text-teal-300',
    badge: 'bg-teal-400/20 text-teal-300', dot: 'bg-teal-400',
    bar: 'bg-teal-400', emptyBorder: 'border-teal-400/20',
  },
  {
    id: 'ensamble-electrico', label: PHASES[4].label,
    border: 'border-amber-400/20', borderOver: 'border-amber-400/60',
    headerBg: 'bg-amber-400/10', headerText: 'text-amber-300',
    badge: 'bg-amber-400/20 text-amber-300', dot: 'bg-amber-400',
    bar: 'bg-amber-400', emptyBorder: 'border-amber-400/20',
  },
  {
    id: 'ensamble-estructural', label: PHASES[5].label,
    border: 'border-indigo-400/20', borderOver: 'border-indigo-400/60',
    headerBg: 'bg-indigo-400/10', headerText: 'text-indigo-300',
    badge: 'bg-indigo-400/20 text-indigo-300', dot: 'bg-indigo-400',
    bar: 'bg-indigo-400', emptyBorder: 'border-indigo-400/20',
  },
  {
    id: 'pintura', label: PHASES[6].label,
    border: 'border-purple-400/20', borderOver: 'border-purple-400/60',
    headerBg: 'bg-purple-400/10', headerText: 'text-purple-300',
    badge: 'bg-purple-400/20 text-purple-300', dot: 'bg-purple-400',
    bar: 'bg-purple-400', emptyBorder: 'border-purple-400/20',
  },
  {
    id: 'pruebas', label: PHASES[7].label,
    border: 'border-pink-400/20', borderOver: 'border-pink-400/60',
    headerBg: 'bg-pink-400/10', headerText: 'text-pink-300',
    badge: 'bg-pink-400/20 text-pink-300', dot: 'bg-pink-400',
    bar: 'bg-pink-400', emptyBorder: 'border-pink-400/20',
  },
  {
    id: 'despacho', label: PHASES[8].label,
    border: 'border-emerald-400/20', borderOver: 'border-emerald-400/60',
    headerBg: 'bg-emerald-400/10', headerText: 'text-emerald-300',
    badge: 'bg-emerald-400/20 text-emerald-300', dot: 'bg-emerald-400',
    bar: 'bg-emerald-400', emptyBorder: 'border-emerald-400/20',
  },
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export default function KanbanApp() {
  const [locomotoraList, setLocomotoraList] = useState<Locomotora[]>([]);
  const [selectedLocomotora, setSelectedLocomotora] = useState<Locomotora | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Phase | null>(null);
  const [syncStatus, setSyncStatus] = useState<'local' | 'syncing' | 'synced' | 'error'>('local');
  const [dataLoaded, setDataLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const s = getSession();
    setSession(s);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    const init = async () => {
      if (!isConfigured()) {
        setSyncStatus('local');
        try {
          const stored = localStorage.getItem('ferrovalle-locomotoras');
          if (stored) setLocomotoraList(JSON.parse(stored));
        } catch {}
        setDataLoaded(true);
        return;
      }
      setSyncStatus('syncing');
      const cloud = await loadLocomotoras();
      if (cloud !== null) {
        setLocomotoraList(cloud);
        try { localStorage.setItem('ferrovalle-locomotoras', JSON.stringify(cloud)); } catch {}
        setSyncStatus('synced');
      } else {
        setSyncStatus('error');
        try {
          const stored = localStorage.getItem('ferrovalle-locomotoras');
          if (stored) setLocomotoraList(JSON.parse(stored));
        } catch {}
      }
      setDataLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!dataLoaded) return;
    // localStorage: guardar inmediatamente (rápido y local)
    try { localStorage.setItem('ferrovalle-locomotoras', JSON.stringify(locomotoraList)); } catch {}
    if (!isConfigured()) return;
    // Supabase: debounce corto para no enviar en cada tecla
    setSyncStatus('syncing');
    const timer = setTimeout(() => {
      saveLocomotoras(locomotoraList).then(ok => setSyncStatus(ok ? 'synced' : 'error'));
    }, 500);
    return () => clearTimeout(timer);
  }, [locomotoraList, dataLoaded]);

  // Si el usuario recarga, cierra la pestaña o la manda a segundo plano justo después de
  // editar, el debounce de arriba puede quedarse a medias (la navegación cancela el
  // fetch). sendBeacon sí sobrevive a eso, así que lo usamos como respaldo inmediato.
  useEffect(() => {
    if (!dataLoaded || !isConfigured()) return;
    const flush = () => flushLocomotoras(locomotoraList);
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
    };
  }, [locomotoraList, dataLoaded]);

  const handleAddLocomotora = (data: Omit<Locomotora, 'id' | 'createdAt'>) => {
    setLocomotoraList(prev => [
      ...prev,
      { ...data, id: generateId(), createdAt: new Date().toISOString() },
    ]);
    setShowAddModal(false);
  };

  const handleUpdateLocomotora = (updated: Locomotora) => {
    setLocomotoraList(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    setSelectedLocomotora(updated);
  };

  const handleDeleteLocomotora = (id: string) => {
    if (!confirm('¿Eliminar esta locomotora? Esta acción no se puede deshacer.')) return;
    setLocomotoraList(prev => prev.filter(l => l.id !== id));
    setSelectedLocomotora(null);
  };

  const handleTogglePriority = (id: string) => {
    setLocomotoraList(prev =>
      prev.map(l => l.id === id ? { ...l, priority: !l.priority } : l)
    );
  };

  const handleDrop = (col: Phase) => {
    if (!draggedId) return;
    setLocomotoraList(prev =>
      prev.map(l => {
        if (l.id !== draggedId) return l;
        const updated = { ...l, phase: col };
        if (col === 'despacho' && !l.deliveryDate) {
          updated.deliveryDate = new Date().toISOString().split('T')[0];
        }
        return updated;
      })
    );
    setDraggedId(null);
    setDragOverCol(null);
  };

  const active = locomotoraList.filter(l => l.phase !== 'despacho').length;
  const delivered = locomotoraList.filter(l => l.phase === 'despacho').length;

  const handleDownloadSummary = async () => {
    const now = new Date();
    const today = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
    const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

    const NAVY: [number, number, number] = [30, 58, 95];
    const ORANGE: [number, number, number] = [249, 115, 22];
    const marginX = 14;
    const pageWidth = 210;
    const pageBottom = 280;
    let y = 20;

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

    // Embed the brand's Montserrat font instead of the PDF-standard Helvetica.
    const { MONTSERRAT_REGULAR_BASE64, MONTSERRAT_BOLD_BASE64 } = await import('../lib/montserrat-fonts');
    doc.addFileToVFS('Montserrat-Regular.ttf', MONTSERRAT_REGULAR_BASE64);
    doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
    doc.addFileToVFS('Montserrat-Bold.ttf', MONTSERRAT_BOLD_BASE64);
    doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');

    doc.setFont('Montserrat', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...NAVY);
    doc.text('FERROVALLE', marginX, y);

    doc.setFont('Montserrat', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Resumen General de Locomotoras', marginX, y + 6);

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Generado el ${today} · ${time}`, pageWidth - marginX, y, { align: 'right' });

    y += 10;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.7);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 10;

    doc.setFont('Montserrat', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...NAVY);
    doc.text(String(locomotoraList.length), marginX, y);
    doc.text(String(active), marginX + 35, y);
    doc.text(String(delivered), marginX + 70, y);
    doc.setFont('Montserrat', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140);
    doc.text('TOTAL', marginX, y + 4.5);
    doc.text('ACTIVAS', marginX + 35, y + 4.5);
    doc.text('DESPACHADAS', marginX + 70, y + 4.5);
    y += 12;

    // Resumen por fase: cuántas locomotoras hay en cada una, de un vistazo.
    autoTable(doc, {
      startY: y,
      head: [['Fase', 'Locomotoras']],
      body: PHASES.map(p => [p.label, String(locomotoraList.filter(l => l.phase === p.id).length)]),
      theme: 'grid',
      styles: { font: 'Montserrat' },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
      columnStyles: { 1: { halign: 'center', cellWidth: 32 } },
      margin: { left: marginX, right: marginX },
    });
    y = finalY() + 10;

    const phasesWithItems = PHASES.filter(p => locomotoraList.some(l => l.phase === p.id));

    if (phasesWithItems.length === 0) {
      doc.setFont('Montserrat', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(140);
      doc.text('Todavía no hay locomotoras registradas.', marginX, y);
    } else {
      doc.setFont('Montserrat', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY);
      doc.text('Detalle por fase', marginX, y);
      y += 6;

      for (const phase of phasesWithItems) {
        const items = locomotoraList.filter(l => l.phase === phase.id);
        if (y > pageBottom - 20) { doc.addPage(); y = 20; }

        doc.setFillColor(...NAVY);
        doc.rect(marginX, y, pageWidth - marginX * 2, 7, 'F');
        doc.setFont('Montserrat', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(255, 255, 255);
        doc.text(phase.label.toUpperCase(), marginX + 3, y + 5);
        doc.setFillColor(...ORANGE);
        doc.circle(pageWidth - marginX - 5, y + 3.5, 3.2, 'F');
        doc.setFontSize(8);
        doc.text(String(items.length), pageWidth - marginX - 5, y + 4.6, { align: 'center' });
        y += 7;

        autoTable(doc, {
          startY: y,
          head: [['N° de Serie', 'Marca / Modelo', 'Fecha Compromiso de Entrega', 'Prioridad']],
          body: items.map(l => [
            `#${l.serialNumber || '—'}`,
            [l.brand, l.model].filter(Boolean).join(' · ') || '—',
            l.commitmentDate
              ? new Date(l.commitmentDate + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
              : '— (no asignada)',
            l.priority ? 'Sí' : '—',
          ]),
          theme: 'striped',
          styles: { font: 'Montserrat' },
          headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: 'bold', fontSize: 7.5 },
          bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
          margin: { left: marginX, right: marginX },
        });
        y = finalY() + 10;
      }
    }

    doc.save(`resumen-locomotoras-${now.toISOString().split('T')[0]}.pdf`);
  };

  if (!authChecked) return null;
  if (!session) return <LoginScreen onLogin={() => setSession(getSession())} />;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#080c14]">
      {/* Header */}
      <header
        className="flex items-center justify-between px-6 py-4 shrink-0 z-10 border-b border-white/[0.06]"
        style={{
          background: 'linear-gradient(135deg, #1e0a3c 0%, #0c1e4a 60%, #080c14 100%)',
          boxShadow: '0 1px 30px rgba(139,92,246,0.12)',
        }}
      >
        <div className="flex items-center gap-4">
          <Image
            src="/ferrovalle-logo.svg"
            alt="Ferrovalle"
            width={180}
            height={20}
            priority
            className="shrink-0"
          />
          <div className="w-px h-6 bg-white/10 shrink-0" />
          <p className="text-purple-300/50 text-xs hidden sm:block">Gestión de Locomotoras</p>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden sm:flex items-center gap-5 text-xs">
            <Stat dot="bg-slate-500" label="total" value={locomotoraList.length} valueColor="text-white" />
            <Stat dot="bg-orange-400" label="activas" value={active} valueColor="text-orange-300" />
            <Stat dot="bg-emerald-400" label="despachadas" value={delivered} valueColor="text-emerald-300" />
            {syncStatus !== 'local' && (
              <span className={`flex items-center gap-1.5 text-xs ${
                syncStatus === 'synced' ? 'text-emerald-400' :
                syncStatus === 'syncing' ? 'text-blue-300' :
                'text-red-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus === 'synced' ? 'bg-emerald-400' :
                  syncStatus === 'syncing' ? 'bg-blue-400 animate-pulse' :
                  'bg-red-400'
                }`} />
                {syncStatus === 'synced' ? 'Guardado ✓' :
                 syncStatus === 'syncing' ? 'Guardando...' :
                 'No se pudo guardar'}
              </span>
            )}
          </div>
          <button
            onClick={handleDownloadSummary}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-sm font-semibold transition-all border border-white/[0.10] hover:border-white/25 hover:bg-white/[0.05] active:scale-95"
            title="Descarga un resumen del estatus de todas las locomotoras por fase"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span className="hidden sm:inline">Descargar Resumen</span>
          </button>

          {session?.userRole !== 'diagnostico' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}
            >
              <span className="text-base leading-none font-light">+</span>
              <span>Agregar Locomotora</span>
            </button>
          )}

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(v => !v)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm transition-all hover:scale-105 select-none"
              style={{
                background: `linear-gradient(135deg, ${session.userColor}, ${session.userColor}99)`,
                boxShadow: `0 2px 12px ${session.userColor}40`,
              }}
            >
              {session.userInitials}
            </button>
            {showUserMenu && (
              <div
                className="absolute right-0 top-11 w-52 rounded-xl border border-white/[0.08] shadow-2xl z-20 overflow-hidden"
                style={{ background: '#0e1420' }}
              >
                <div className="px-4 py-3 border-b border-white/[0.06]">
                  <p className="text-white text-sm font-semibold">{session.userName}</p>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: session.userRole === 'diagnostico' ? '#0ea5e9' : '#8b5cf6' }}>
                    {session.userRole === 'diagnostico' ? 'Personal de Revisión' : 'Administrador'}
                  </p>
                </div>
                <button
                  onClick={() => { setShowUserMenu(false); setShowChangePassword(true); }}
                  className="w-full px-4 py-2.5 text-left text-sm text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors"
                >
                  Cambiar contraseña
                </button>
                <button
                  onClick={() => { clearSession(); setSession(null); setShowUserMenu(false); }}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-400 hover:text-red-300 hover:bg-white/[0.04] transition-colors"
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Search bar */}
      <div className="shrink-0 px-5 pt-4 pb-2 relative">
        <div className="relative max-w-md">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 pointer-events-none">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className="w-full bg-[#0e1420] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40"
            placeholder="Buscar por número de serie, modelo o marca..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white text-sm">✕</button>
          )}
        </div>

        {/* Search results dropdown */}
        {searchOpen && searchQuery.trim() && (() => {
          const q = searchQuery.toLowerCase();
          const results = locomotoraList.filter(l =>
            l.serialNumber.toLowerCase().includes(q) ||
            l.model.toLowerCase().includes(q) ||
            l.brand.toLowerCase().includes(q)
          );
          const colLabel = (phase: Phase) =>
            COLUMNS.find(c => c.id === phase)?.label ?? phase;
          const colBadge = (phase: Phase) =>
            COLUMNS.find(c => c.id === phase);
          return (
            <div className="absolute left-0 right-0 top-full mt-1 max-w-md rounded-xl border border-white/[0.10] shadow-2xl shadow-black/60 z-30 overflow-hidden"
              style={{ background: '#0e1420' }}>
              {results.length === 0 ? (
                <div className="px-4 py-4 text-sm text-slate-500 text-center">
                  No se encontró ninguna locomotora
                </div>
              ) : (
                results.slice(0, 8).map(loco => {
                  const col = colBadge(loco.phase);
                  return (
                    <button
                      key={loco.id}
                      onMouseDown={() => { setSelectedLocomotora(loco); setSearchQuery(''); setSearchOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-white font-semibold text-sm">#{loco.serialNumber}</p>
                          {loco.priority && (
                            <span className="text-orange-400 text-xs">🚩</span>
                          )}
                        </div>
                        {(loco.brand || loco.model) && (
                          <p className="text-slate-600 text-xs mt-0.5">{[loco.brand, loco.model].filter(Boolean).join(' · ')}</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${col?.badge}`}>
                        {colLabel(loco.phase)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          );
        })()}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-5 pt-2">
        <div className="flex gap-4 h-full" style={{ minWidth: 'max-content' }}>
          {COLUMNS.map(col => {
            const items = locomotoraList.filter(l => l.phase === col.id);
            const isOver = dragOverCol === col.id;
            return (
              <div
                key={col.id}
                data-col-id={col.id}
                className={`flex flex-col w-72 rounded-2xl border-2 transition-all duration-150 ${
                  isOver ? col.borderOver : col.border
                }`}
                style={{ background: '#0e1420' }}
                onDragOver={e => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDrop={() => handleDrop(col.id)}
                onDragLeave={e => {
                  if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverCol(null);
                  }
                }}
              >
                {/* Column header */}
                <div
                  className={`flex items-center justify-between px-4 py-3 rounded-t-2xl border-b-2 ${col.border} ${col.headerBg} shrink-0`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className={`font-bold text-sm ${col.headerText}`}>{col.label}</span>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${col.badge}`}>
                    {items.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
                  {[...items].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0)).map(loco => (
                    <LocomotoraCard
                      key={loco.id}
                      loco={loco}
                      isDragging={draggedId === loco.id}
                      bar={col.bar}
                      canInteract={session?.userRole !== 'diagnostico'}
                      onDragStart={() => setDraggedId(loco.id)}
                      onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                      onClick={() => setSelectedLocomotora(loco)}
                      onTogglePriority={() => handleTogglePriority(loco.id)}
                      onTouchDragOver={c => { setDraggedId(loco.id); setDragOverCol(c); }}
                      onTouchDrop={c => { handleDrop(c); }}
                    />
                  ))}
                  {items.length === 0 && (
                    <div
                      className={`flex-1 flex items-center justify-center py-10 rounded-xl border-2 border-dashed ${col.emptyBorder} mt-1`}
                    >
                      <p className={`text-xs ${col.headerText} opacity-30`}>Sin locomotoras</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {selectedLocomotora && (
        <LocomotoraModal
          loco={selectedLocomotora}
          onUpdate={handleUpdateLocomotora}
          onDelete={handleDeleteLocomotora}
          onClose={() => setSelectedLocomotora(null)}
          userRole={session?.userRole ?? 'admin'}
        />
      )}
      {showAddModal && (
        <AddLocomotoraModal onAdd={handleAddLocomotora} onClose={() => setShowAddModal(false)} />
      )}
      {showChangePassword && (
        <ChangePasswordModal
          session={session}
          onClose={() => setShowChangePassword(false)}
        />
      )}
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function Stat({
  dot,
  label,
  value,
  valueColor,
}: {
  dot: string;
  label: string;
  value: number;
  valueColor: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-slate-500">
        <strong className={`${valueColor} font-bold`}>{value}</strong> {label}
      </span>
    </span>
  );
}

// ─── Locomotora Card ──────────────────────────────────────────────────────────

function LocomotoraCard({
  loco,
  isDragging,
  bar,
  canInteract = true,
  onDragStart,
  onDragEnd,
  onClick,
  onTogglePriority,
  onTouchDragOver,
  onTouchDrop,
}: {
  loco: Locomotora;
  isDragging: boolean;
  bar: string;
  canInteract?: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
  onTogglePriority: () => void;
  onTouchDragOver: (col: Phase | null) => void;
  onTouchDrop: (col: Phase) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cbs = useRef({ onDragStart, onDragEnd, onTouchDragOver, onTouchDrop, onClick });
  useEffect(() => { cbs.current = { onDragStart, onDragEnd, onTouchDragOver, onTouchDrop, onClick }; });

  useEffect(() => {
    if (!canInteract || !cardRef.current) return;
    const el = cardRef.current;
    const pressTimer = { id: null as ReturnType<typeof setTimeout> | null };
    const state = { active: false, startX: 0, startY: 0, currentCol: null as Phase | null };
    let clone: HTMLDivElement | null = null;

    const cleanup = () => {
      if (clone) { clone.remove(); clone = null; }
      state.active = false;
      state.currentCol = null;
      cbs.current.onTouchDragOver(null);
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      state.startX = t.clientX; state.startY = t.clientY;
      pressTimer.id = setTimeout(() => {
        state.active = true;
        cbs.current.onDragStart();
        if (navigator.vibrate) navigator.vibrate(50);
        const rect = el.getBoundingClientRect();
        clone = el.cloneNode(true) as HTMLDivElement;
        Object.assign(clone.style, {
          position: 'fixed', top: rect.top + 'px', left: rect.left + 'px',
          width: rect.width + 'px', pointerEvents: 'none', zIndex: '9999',
          opacity: '0.92', transform: 'scale(1.06) rotate(1.5deg)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)', borderRadius: '12px',
          transition: 'transform 0.15s',
        });
        document.body.appendChild(clone);
      }, 400);
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (pressTimer.id && !state.active) {
        if (Math.abs(t.clientX - state.startX) > 8 || Math.abs(t.clientY - state.startY) > 8) {
          clearTimeout(pressTimer.id); pressTimer.id = null;
        }
        return;
      }
      if (!state.active || !clone) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      clone.style.top = (t.clientY - rect.height / 2) + 'px';
      clone.style.left = (t.clientX - rect.width / 2) + 'px';
      clone.style.display = 'none';
      const target = document.elementFromPoint(t.clientX, t.clientY);
      clone.style.display = '';
      const colEl = target?.closest('[data-col-id]') as HTMLElement | null;
      const colId = (colEl?.dataset.colId ?? null) as Phase | null;
      if (colId !== state.currentCol) {
        state.currentCol = colId;
        cbs.current.onTouchDragOver(colId);
      }
    };

    const onEnd = () => {
      if (pressTimer.id) { clearTimeout(pressTimer.id); pressTimer.id = null; }
      if (!state.active) return;
      if (state.currentCol) cbs.current.onTouchDrop(state.currentCol);
      cbs.current.onDragEnd();
      cleanup();
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      cleanup();
    };
  }, [canInteract]);
  const isOverdue =
    loco.commitmentDate &&
    loco.phase !== 'despacho' &&
    new Date(loco.commitmentDate + 'T12:00:00') < new Date();

  const formatDate = (d: string) => {
    if (!d) return null;
    return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
    });
  };

  const photoCount = loco.photosByPhase[loco.phase]?.length ?? 0;

  return (
    <div
      ref={cardRef}
      draggable={canInteract}
      onDragStart={canInteract ? onDragStart : undefined}
      onDragEnd={canInteract ? onDragEnd : undefined}
      onClick={onClick}
      className={`rounded-xl border overflow-hidden cursor-pointer select-none transition-all ${
        isDragging
          ? 'border-white/[0.20] scale-95'
          : 'border-white/[0.07] hover:border-white/[0.15] hover:bg-[#1a2235]'
      }`}
      style={{ background: '#141b2d' }}
    >
      <div className={`h-[3px] ${bar}`} />
      <div className="p-3.5">
        {/* Number + flag */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="font-bold text-white text-sm leading-tight">
              #{loco.serialNumber || '—'}
            </p>
            {(loco.brand || loco.model) && (
              <span className="text-xs bg-white/[0.06] text-slate-500 px-1.5 py-0.5 rounded-md mt-0.5 inline-block truncate max-w-[160px]">
                {[loco.brand, loco.model].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); downloadLocomotoraStatusPdf(loco); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all text-slate-700 hover:text-violet-400 hover:bg-white/[0.05]"
              title="Descargar estatus"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            {canInteract && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onTogglePriority(); }}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                loco.priority
                  ? 'bg-orange-400/20 text-orange-400'
                  : 'text-slate-700 hover:text-slate-400 hover:bg-white/[0.05]'
              }`}
              title={loco.priority ? 'Quitar prioridad' : 'Marcar como prioridad'}
            >
              <svg viewBox="0 0 14 14" className="w-3.5 h-3.5" fill="currentColor">
                <path d="M1 1v12M1 1h9l-2.5 4L10 9H1V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill={loco.priority ? 'currentColor' : 'none'} />
              </svg>
            </button>
            )}
          </div>
        </div>

        {/* Date */}
        {loco.commitmentDate && (
          <div
            className={`flex items-center gap-1 text-xs mb-2 ${
              isOverdue ? 'text-red-400 font-medium' : 'text-slate-600'
            }`}
          >
            <span>{isOverdue ? '⚠️' : '📅'}</span>
            <span>
              {isOverdue ? 'Vencía ' : 'Entrega '}
              {formatDate(loco.commitmentDate)}
            </span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.05]">
          <span className="text-xs text-slate-700">
            {photoCount > 0 ? `📷 ${photoCount}` : 'Sin fotos en esta fase'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Add Locomotora Modal ─────────────────────────────────────────────────────

const inp =
  'w-full bg-[#1a2235] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all [color-scheme:dark]';

function AddLocomotoraModal({
  onAdd,
  onClose,
}: {
  onAdd: (data: Omit<Locomotora, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}) {
  const [serialNumber, setSerialNumber] = useState('');
  const [model, setModel] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [photoArribo, setPhotoArribo] = useState<string>('');

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressImage(file).then(setPhotoArribo);
    e.target.value = '';
  };

  const save = () => {
    if (!serialNumber.trim()) return false;
    const photosByPhase = emptyPhotosByPhase();
    if (photoArribo) photosByPhase.arribo = [photoArribo];
    onAdd({
      serialNumber,
      model,
      brand,
      notes,
      phase: 'arribo',
      photosByPhase,
      servicesByPhase: emptyServicesByPhase(),
      commitmentDate: '',
      deliveryDate: '',
      requestedBy: '',
      priority: false,
    });
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); save(); };
  const handleBackdrop = () => { if (!save()) onClose(); };

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleBackdrop}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col border border-white/[0.08] overflow-hidden"
        style={{ background: '#0e1420' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="px-5 py-4 border-b border-white/[0.06] shrink-0"
          style={{ background: 'linear-gradient(135deg, #1e0a3c 0%, #0c1e4a 100%)' }}
        >
          <h2 className="text-white font-bold text-base tracking-tight">Registrar nueva locomotora</h2>
          <p className="text-purple-300/50 text-xs mt-0.5">Información inicial de la locomotora</p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <Label text="Número de Serie" required />
            <input
              className={inp}
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder="ej. LOC-2024-001"
              required
              autoFocus
            />
          </div>

          <div>
            <Label text="Modelo" />
            <input
              className={inp}
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="ej. GE Dash 9"
            />
          </div>

          <div>
            <Label text="Marca" />
            <input
              className={inp}
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="ej. General Electric"
            />
          </div>

          <div>
            <Label text="Notas" />
            <textarea
              className={`${inp} resize-none`}
              rows={1}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones iniciales..."
            />
          </div>

          <div>
            <Label text="Foto de arribo" />
            {photoArribo ? (
              <div className="relative group rounded-xl overflow-hidden border border-white/[0.08]" style={{ aspectRatio: '16/7' }}>
                <img src={photoArribo} alt="Foto de arribo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                  <button
                    type="button"
                    onClick={() => setPhotoArribo('')}
                    className="opacity-0 group-hover:opacity-100 bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg transition-opacity font-semibold"
                  >
                    Eliminar foto
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-3 border border-dashed border-cyan-400/25 rounded-xl p-3 cursor-pointer hover:border-cyan-400/40 hover:bg-cyan-400/[0.03] transition-all">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7 text-cyan-400/40 shrink-0">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Click para subir foto de arribo</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">JPG, PNG</p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-500 hover:text-white font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-white text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}
            >
              Guardar y cerrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
      {text} {required && <span className="text-red-400 normal-case">*</span>}
    </label>
  );
}

// ─── Change Password Modal ────────────────────────────────────────────────────

function ChangePasswordModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next !== confirm) { setError('Las contraseñas nuevas no coinciden'); return; }
    if (next.length < 4) { setError('La contraseña debe tener al menos 4 caracteres'); return; }
    setLoading(true);

    // Verify current password against DB
    const users = await fetch('/api/users').then(r => r.json());
    const me = users.find((u: { id: string; password_hash: string }) => u.id === session.userId);
    if (!me) { setError('Usuario no encontrado'); setLoading(false); return; }

    const currentHash = await hashPassword(current);
    if (currentHash !== me.password_hash) { setError('Contraseña actual incorrecta'); setLoading(false); return; }

    const newHash = await hashPassword(next);
    const res = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.userId, newHash }),
    });
    const json = await res.json();
    if (!json.ok) { setError('Error al guardar. Intenta de nuevo.'); setLoading(false); return; }

    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm p-6 border border-white/[0.08] shadow-2xl" style={{ background: '#0e1420' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm select-none"
            style={{ background: `linear-gradient(135deg, ${session.userColor}, ${session.userColor}99)` }}>
            {session.userInitials}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{session.userName}</p>
            <p className="text-slate-500 text-xs">Cambiar contraseña</p>
          </div>
        </div>
        {success ? (
          <p className="text-emerald-400 text-sm text-center py-4 font-medium">¡Contraseña actualizada! ✓</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="password" className={inp} placeholder="Contraseña actual" value={current} onChange={e => setCurrent(e.target.value)} autoFocus />
            <input type="password" className={inp} placeholder="Nueva contraseña" value={next} onChange={e => setNext(e.target.value)} />
            <input type="password" className={inp} placeholder="Confirmar nueva contraseña" value={confirm} onChange={e => setConfirm(e.target.value)} />
            {error && <p className="text-red-400 text-xs text-center">{error}</p>}
            <button type="submit" disabled={!current || !next || !confirm || loading}
              className="w-full py-2.5 text-white text-sm font-semibold rounded-xl transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
