'use client';

import { useState, useEffect, useRef } from 'react';

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
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
import { PHASES } from '../types';
import { DatePicker } from './FormControls';

type Tab = 'info' | 'fotos';

const inp =
  'w-full bg-[#1a2235] border border-white/[0.08] rounded-xl px-3 py-2.5 text-base text-white placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/40 transition-all [color-scheme:dark]';

export default function LocomotoraModal({
  loco,
  onUpdate,
  onDelete,
  onClose,
  userRole = 'admin',
}: {
  loco: Locomotora;
  onUpdate: (l: Locomotora) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  userRole?: 'admin' | 'diagnostico';
}) {
  const isTecnico = userRole === 'diagnostico';
  const [notice, setNotice] = useState<string>('');
  const [data, setData] = useState<Locomotora>(loco);
  const [activeTab, setActiveTab] = useState<Tab>(isTecnico ? 'fotos' : 'info');
  const currentIdx = PHASES.findIndex(p => p.id === data.phase);
  const [viewedPhase, setViewedPhase] = useState<Phase>(loco.phase);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const mounted = useRef(false);

  const update = (fields: Partial<Locomotora>) => {
    setData(prev => ({ ...prev, ...fields }));
  };

  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const t = setTimeout(() => onUpdateRef.current(data), 600);
    return () => clearTimeout(t);
  }, [data]);

  const handleClose = () => {
    onUpdateRef.current(data);
    onClose();
  };

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, phase: Phase) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    const MAX = 6;
    const current = data.photosByPhase[phase]?.length ?? 0;
    const available = MAX - current;
    if (available <= 0) {
      showNotice('Ya tienes 6 fotos en esta fase. Elimina alguna para agregar más.');
      e.target.value = '';
      return;
    }
    const selected = Array.from(files);
    const toProcess = selected.slice(0, available);
    if (selected.length > available) {
      showNotice(`Solo se agregarán ${available} foto${available !== 1 ? 's' : ''} (límite de 6 por fase).`);
    }
    Promise.all(toProcess.map(f => compressImage(f).catch(() => null)))
      .then(results => {
        const valid = results.filter(Boolean) as string[];
        const failed = results.length - valid.length;
        if (failed > 0) showNotice(`${failed} foto${failed !== 1 ? 's' : ''} no se pudo${failed !== 1 ? 'ieron' : ''} procesar.`);
        if (valid.length > 0) {
          update({
            photosByPhase: {
              ...data.photosByPhase,
              [phase]: [...(data.photosByPhase[phase] ?? []), ...valid],
            },
          });
        }
      });
    e.target.value = '';
  };

  const removePhoto = (phase: Phase, idx: number) => {
    update({
      photosByPhase: {
        ...data.photosByPhase,
        [phase]: (data.photosByPhase[phase] ?? []).filter((_, i) => i !== idx),
      },
    });
  };

  const TABS: Array<{ id: Tab; label: string }> = isTecnico
    ? [{ id: 'fotos', label: 'Fotos' }]
    : [{ id: 'info', label: 'Información' }, { id: 'fotos', label: 'Fotos' }];

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col border border-white/[0.08] overflow-hidden"
        style={{ background: '#0e1420' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 py-5 shrink-0 border-b border-white/[0.06]"
          style={{ background: 'linear-gradient(135deg, #1e0a3c 0%, #0c1e4a 100%)' }}
        >
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-white font-bold text-xl tracking-tight">
                Locomotora #{data.serialNumber || '—'}
              </h2>
              <p className="text-purple-300/60 text-sm mt-0.5">
                {[data.brand, data.model].filter(Boolean).join(' · ') || 'Sin marca/modelo asignado'}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="text-white/30 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center shrink-0"
            >
              ×
            </button>
          </div>
        </div>

        {/* Phase navigator */}
        <PhaseNav currentIdx={currentIdx} viewedPhase={viewedPhase} onSelect={setViewedPhase} />

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06] px-6 shrink-0 bg-[#0a0f1a]">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-slate-600 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {notice && (
            <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-400/30 text-amber-300 text-xs font-medium"
              style={{ background: 'rgba(251,191,36,0.08)' }}>
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
              </svg>
              {notice}
            </div>
          )}
          {activeTab === 'info' && <InfoTab data={data} update={update} />}
          {activeTab === 'fotos' && (
            <FotosTab
              phase={viewedPhase}
              photos={data.photosByPhase[viewedPhase] ?? []}
              onPhotoUpload={e => handlePhotoUpload(e, viewedPhase)}
              onRemovePhoto={i => removePhoto(viewedPhase, i)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] shrink-0 bg-[#0a0f1a]">
          {!isTecnico ? (
            <button
              onClick={() => onDelete(loco.id)}
              className="text-red-500/70 hover:text-red-400 text-sm font-medium transition-colors"
            >
              Eliminar locomotora
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={handleClose}
            className="px-6 py-2.5 text-white text-sm font-semibold rounded-xl transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'linear-gradient(135deg, #f97316, #c2410c)' }}
          >
            Guardar y cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Info Tab ─────────────────────────────────────────────────────────────────

function InfoTab({ data, update }: { data: Locomotora; update: (f: Partial<Locomotora>) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <Field label="Número de Serie">
        <input
          className={inp}
          value={data.serialNumber}
          onChange={e => update({ serialNumber: e.target.value })}
          placeholder="ej. LOC-2024-001"
        />
      </Field>
      <Field label="Modelo">
        <input
          className={inp}
          value={data.model}
          onChange={e => update({ model: e.target.value })}
          placeholder="ej. GE Dash 9"
        />
      </Field>
      <Field label="Marca">
        <input
          className={inp}
          value={data.brand}
          onChange={e => update({ brand: e.target.value })}
          placeholder="ej. General Electric"
        />
      </Field>
      <Field label="Solicitado / Autorizado por">
        <input
          className={inp}
          value={data.requestedBy ?? ''}
          onChange={e => update({ requestedBy: e.target.value })}
          placeholder="Nombre del responsable o solicitante"
        />
      </Field>
      <Field label="Fecha Compromiso de Entrega">
        <DatePicker
          value={data.commitmentDate}
          onChange={v => update({ commitmentDate: v })}
          placeholder="Seleccionar fecha límite"
        />
      </Field>
      <Field label="Fecha de Entrega Real">
        <DatePicker
          value={data.deliveryDate}
          onChange={v => update({ deliveryDate: v })}
          placeholder="Fecha en que se despachó"
        />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Notas y Observaciones">
          <textarea
            className={`${inp} resize-none`}
            rows={4}
            value={data.notes}
            onChange={e => update({ notes: e.target.value })}
            placeholder="Detalles del estado, observaciones, instrucciones especiales..."
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Phase Navigator ──────────────────────────────────────────────────────────

function PhaseNav({
  currentIdx,
  viewedPhase,
  onSelect,
}: {
  currentIdx: number;
  viewedPhase: Phase;
  onSelect: (p: Phase) => void;
}) {
  return (
    <div className="flex items-start px-6 py-3 border-b border-white/[0.06] bg-[#0a0f1a] overflow-x-auto shrink-0 gap-0">
      {PHASES.map((step, i) => {
        const isPast = i < currentIdx;
        const isCurrent = i === currentIdx;
        const isViewed = step.id === viewedPhase;
        const isReachable = i <= currentIdx;
        const color = isCurrent ? '#c084fc' : isPast ? '#8b5cf6' : 'rgba(255,255,255,0.15)';
        return (
          <div key={step.id} className="flex items-start shrink-0">
            <button
              type="button"
              disabled={!isReachable}
              onClick={() => onSelect(step.id)}
              style={{ width: 84 }}
              className={`flex flex-col items-center gap-1 shrink-0 ${isReachable ? 'cursor-pointer' : 'cursor-not-allowed'}`}
            >
              <div
                className="rounded-full transition-all flex items-center justify-center"
                style={{
                  width: isCurrent ? 20 : 12,
                  height: isCurrent ? 20 : 12,
                  background: isCurrent ? color : isPast ? color + '70' : 'rgba(255,255,255,0.08)',
                  boxShadow: isCurrent ? `0 0 12px ${color}60` : undefined,
                  outline: isViewed && !isCurrent ? '2px solid rgba(192,132,252,0.6)' : undefined,
                  outlineOffset: isViewed && !isCurrent ? 2 : undefined,
                }}
              >
                {isPast && (
                  <svg viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="2" style={{ width: 7, height: 7 }}>
                    <polyline points="1 4 3.5 6.5 7 1.5" />
                  </svg>
                )}
              </div>
              <span style={{
                fontSize: 9,
                lineHeight: 1.25,
                fontWeight: isCurrent || isViewed ? 700 : 400,
                color: isCurrent ? 'white' : isViewed ? '#c084fc' : isPast ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
                textAlign: 'center',
                whiteSpace: 'normal',
              }}>
                {step.label}
              </span>
            </button>
            {i < PHASES.length - 1 && (
              <div className="w-4 h-px mt-1.5 shrink-0" style={{
                background: i < currentIdx ? '#8b5cf650' : 'rgba(255,255,255,0.06)',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Fotos Tab ────────────────────────────────────────────────────────────────

function FotosTab({
  phase,
  photos,
  onPhotoUpload,
  onRemovePhoto,
}: {
  phase: Phase;
  photos: string[];
  onPhotoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: (i: number) => void;
}) {
  const label = PHASES.find(p => p.id === phase)?.label ?? phase;
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white text-sm">Fotos — {label}</h3>
          <p className="text-xs text-slate-600 mt-0.5">Evidencia fotográfica de esta fase</p>
        </div>
        {photos.length > 0 && (
          <label className="cursor-pointer flex items-center gap-1.5 text-xs bg-white/[0.05] border border-white/[0.08] hover:border-white/20 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg transition-all">
            <span>+</span> Agregar fotos
            <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotoUpload} />
          </label>
        )}
      </div>

      {photos.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
          {photos.map((src, i) => (
            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-white/[0.08]">
              <img
                src={src}
                alt={`${label} ${i + 1}`}
                className="w-full h-full object-cover cursor-zoom-in"
                onClick={() => setPreviewIdx(i)}
              />
              <button
                onClick={() => onRemovePhoto(i)}
                className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full text-sm flex items-center justify-center shadow-lg"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-violet-400/30 rounded-xl py-10 cursor-pointer hover:opacity-75 transition-opacity"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <span className="text-3xl mb-2 opacity-40">📷</span>
          <p className="text-sm text-violet-400 opacity-60">Click para subir fotos</p>
          <p className="text-xs text-slate-700 mt-0.5">PNG, JPG — máx 6 fotos</p>
          <input type="file" accept="image/*" multiple className="hidden" onChange={onPhotoUpload} />
        </label>
      )}

      {previewIdx !== null && (
        <ImageLightbox
          src={photos[previewIdx]}
          alt={`${label} ${previewIdx + 1}`}
          onClose={() => setPreviewIdx(null)}
        />
      )}
    </div>
  );
}

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition-colors"
      >
        ×
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full rounded-lg shadow-2xl object-contain"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}
