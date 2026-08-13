import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData } from 'jspdf-autotable';
import type { Locomotora } from '../types';
import { PHASES } from '../types';

const NAVY: [number, number, number] = [30, 58, 95];
const DONE_GREEN: [number, number, number] = [22, 163, 74];
const ORANGE: [number, number, number] = [249, 115, 22];
const ORANGE_TINT: [number, number, number] = [255, 237, 213];
const MARGIN = 14;
const PAGE_WIDTH = 210;
const PAGE_BOTTOM = 280;

function fmtDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = dataUrl;
  });
}

// Lays out a grid of (already-embedded-friendly JPEG) images, fitting each proportionally
// inside a square cell so photos don't get stretched. Adds pages on its own as needed and
// returns the y position right after the grid.
function drawImageGrid(
  doc: jsPDF,
  images: string[],
  sizes: Map<string, { width: number; height: number }>,
  x: number,
  yStart: number,
  maxWidth: number,
  cell: number,
  gap: number
): number {
  let y = yStart;
  let col = 0;
  const perRow = Math.max(1, Math.floor((maxWidth + gap) / (cell + gap)));
  for (const src of images) {
    if (col === 0 && y + cell > PAGE_BOTTOM) { doc.addPage(); y = 20; }
    const cx = x + col * (cell + gap);
    const size = sizes.get(src) ?? { width: 1, height: 1 };
    const ratio = size.width / size.height;
    let w = cell, h = cell;
    if (ratio > 1) h = cell / ratio; else w = cell * ratio;
    try {
      doc.addImage(src, 'JPEG', cx + (cell - w) / 2, y + (cell - h) / 2, w, h, undefined, 'FAST');
    } catch {}
    col++;
    if (col >= perRow) { col = 0; y += cell + gap; }
  }
  if (col !== 0) y += cell + gap;
  return y;
}

export async function downloadLocomotoraStatusPdf(loco: Locomotora): Promise<void> {
  const now = new Date();
  const today = now.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const currentIdx = PHASES.findIndex(p => p.id === loco.phase);
  const currentLabel = PHASES.find(p => p.id === loco.phase)?.label ?? loco.phase;

  // Preload natural sizes for every photo we might embed, so the grids below can fit them
  // proportionally instead of stretching them into squares.
  const allImages = new Set<string>();
  for (const p of PHASES) {
    (loco.photosByPhase[p.id] ?? []).forEach(src => allImages.add(src));
    (loco.servicesByPhase[p.id] ?? []).forEach(s => (s.images ?? []).forEach(src => allImages.add(src)));
  }
  const sizeEntries = await Promise.all(
    Array.from(allImages).map(async src => [src, await getImageSize(src)] as const)
  );
  const sizes = new Map(sizeEntries);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { MONTSERRAT_REGULAR_BASE64, MONTSERRAT_BOLD_BASE64 } = await import('./montserrat-fonts');
  doc.addFileToVFS('Montserrat-Regular.ttf', MONTSERRAT_REGULAR_BASE64);
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal');
  doc.addFileToVFS('Montserrat-Bold.ttf', MONTSERRAT_BOLD_BASE64);
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold');

  let y = 20;
  const finalY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const ensureSpace = (needed: number) => { if (y + needed > PAGE_BOTTOM) { doc.addPage(); y = 20; } };

  // --- Header ---
  doc.setFont('Montserrat', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...NAVY);
  doc.text('FERROVALLE', MARGIN, y);
  doc.setFont('Montserrat', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Estatus de Locomotora #${loco.serialNumber || '—'}`, MARGIN, y + 6);
  doc.setFontSize(9);
  doc.setTextColor(150);
  doc.text(`Generado el ${today} · ${time}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.7);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 8;

  // --- Info block ---
  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { font: 'Montserrat', fontSize: 9, textColor: [30, 41, 59] },
    body: [
      ['Número de serie', loco.serialNumber || '—', 'Marca', loco.brand || '—'],
      ['Modelo', loco.model || '—', 'Fase actual', currentLabel],
      ['Fecha compromiso', loco.commitmentDate ? fmtDate(loco.commitmentDate) : '—', 'Fecha de entrega', loco.deliveryDate ? fmtDate(loco.deliveryDate) : '—'],
      ['Solicitado por', loco.requestedBy || '—', 'Prioridad', loco.priority ? 'Sí' : '—'],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 38 },
      1: { cellWidth: 54 },
      2: { fontStyle: 'bold', textColor: [100, 116, 139], cellWidth: 38 },
      3: { cellWidth: 52 },
    },
    margin: { left: MARGIN, right: MARGIN },
  });
  y = finalY() + 4;

  if (loco.notes) {
    ensureSpace(16);
    doc.setFont('Montserrat', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text('NOTAS', MARGIN, y);
    y += 4;
    doc.setFont('Montserrat', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(loco.notes, PAGE_WIDTH - MARGIN * 2);
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.2 + 4;
  }
  y += 4;

  // --- Resumen por fase ---
  autoTable(doc, {
    startY: y,
    head: [['Fase', 'Estado', 'Fotos', 'Servicios']],
    body: PHASES.map((p, i) => {
      const photos = loco.photosByPhase[p.id]?.length ?? 0;
      const services = loco.servicesByPhase[p.id] ?? [];
      const doneCount = services.filter(s => s.done).length;
      const estado = i < currentIdx ? 'Completada' : i === currentIdx ? 'Actual' : 'Pendiente';
      return [p.label, estado, String(photos), services.length ? `${doneCount}/${services.length}` : '—'];
    }),
    theme: 'grid',
    styles: { font: 'Montserrat' },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'center' } },
    margin: { left: MARGIN, right: MARGIN },
    // Green for completed phases; the current phase gets its whole row highlighted so
    // it's unmistakable at a glance which one it's in.
    didParseCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      const estado = (data.row.raw as string[])[1];
      if (estado === 'Completada') {
        if (data.column.index === 1) {
          data.cell.styles.textColor = DONE_GREEN;
          data.cell.styles.fontStyle = 'bold';
        }
      } else if (estado === 'Actual') {
        data.cell.styles.fillColor = ORANGE_TINT;
        data.cell.styles.fontStyle = 'bold';
        if (data.column.index === 1) data.cell.styles.textColor = ORANGE;
      }
    },
  });
  y = finalY() + 10;

  // --- Detalle por fase (solo las que ya tienen fotos o servicios) ---
  const phasesWithContent = PHASES.filter(p =>
    (loco.photosByPhase[p.id]?.length ?? 0) > 0 || (loco.servicesByPhase[p.id]?.length ?? 0) > 0
  );

  if (phasesWithContent.length > 0) {
    ensureSpace(10);
    doc.setFont('Montserrat', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text('Detalle por fase', MARGIN, y);
    y += 7;

    for (const phase of phasesWithContent) {
      const photos = loco.photosByPhase[phase.id] ?? [];
      const services = loco.servicesByPhase[phase.id] ?? [];

      ensureSpace(12);
      doc.setFillColor(...NAVY);
      doc.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, 7, 'F');
      doc.setFont('Montserrat', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text(phase.label.toUpperCase(), MARGIN + 3, y + 5);
      y += 11;

      if (photos.length > 0) {
        ensureSpace(6);
        doc.setFont('Montserrat', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('FOTOS DE LA FASE', MARGIN, y);
        y += 4;
        y = drawImageGrid(doc, photos, sizes, MARGIN, y, PAGE_WIDTH - MARGIN * 2, 32, 4);
        y += 4;
      }

      if (services.length > 0) {
        ensureSpace(6);
        doc.setFont('Montserrat', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text('SERVICIOS', MARGIN, y);
        y += 5;

        for (const s of services) {
          ensureSpace(6);
          // Draw the done/pending indicator as a small vector circle rather than a ✓/○
          // glyph — those symbols aren't in the embedded Montserrat Latin subset and
          // render blank.
          const dotX = MARGIN + 1.4;
          const dotY = y - 1.3;
          if (s.done) {
            doc.setFillColor(...DONE_GREEN);
            doc.circle(dotX, dotY, 1.4, 'F');
          } else {
            doc.setDrawColor(160, 160, 160);
            doc.setLineWidth(0.3);
            doc.circle(dotX, dotY, 1.4, 'S');
          }
          doc.setFont('Montserrat', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(...(s.done ? DONE_GREEN : ([30, 41, 59] as [number, number, number])));
          doc.text(s.name, MARGIN + 5, y);
          y += 4.5;

          if (s.description) {
            doc.setFont('Montserrat', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            const descLines = doc.splitTextToSize(s.description, PAGE_WIDTH - MARGIN * 2 - 4);
            ensureSpace(descLines.length * 4 + 2);
            doc.text(descLines, MARGIN + 4, y);
            y += descLines.length * 4 + 1;
          }

          const simgs = s.images ?? [];
          if (simgs.length > 0) {
            y = drawImageGrid(doc, simgs, sizes, MARGIN + 4, y, PAGE_WIDTH - MARGIN * 2 - 4, 24, 3);
          }
          y += 4;
        }
      }
      y += 3;
    }
  }

  doc.save(`estatus-${(loco.serialNumber || 'locomotora').replace(/[^a-z0-9-]+/gi, '-')}-${now.toISOString().split('T')[0]}.pdf`);
}
