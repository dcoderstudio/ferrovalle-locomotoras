export type Phase =
  | 'arribo'
  | 'desmontaje'
  | 'reparacion'
  | 'limpieza'
  | 'ensamble-electrico'
  | 'ensamble-estructural'
  | 'pintura'
  | 'pruebas'
  | 'despacho';

export const PHASES: Array<{ id: Phase; label: string }> = [
  { id: 'arribo', label: 'Arribo a Taller' },
  { id: 'desmontaje', label: 'Desmontaje de Partes y Componentes' },
  { id: 'reparacion', label: 'Reparación' },
  { id: 'limpieza', label: 'Limpieza' },
  { id: 'ensamble-electrico', label: 'Ensamble Eléctrico' },
  { id: 'ensamble-estructural', label: 'Ensamble Estructural' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'pruebas', label: 'Pruebas' },
  { id: 'despacho', label: 'Despacho' },
];

export function emptyPhotosByPhase(): Record<Phase, string[]> {
  return PHASES.reduce((acc, p) => {
    acc[p.id] = [];
    return acc;
  }, {} as Record<Phase, string[]>);
}

export type PhaseService = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  done: boolean;
};

export function emptyServicesByPhase(): Record<Phase, PhaseService[]> {
  return PHASES.reduce((acc, p) => {
    acc[p.id] = [];
    return acc;
  }, {} as Record<Phase, PhaseService[]>);
}

export type Locomotora = {
  id: string;
  serialNumber: string;
  model: string;
  brand: string;
  phase: Phase;
  photosByPhase: Record<Phase, string[]>;
  servicesByPhase: Record<Phase, PhaseService[]>;
  commitmentDate: string;
  deliveryDate: string;
  notes: string;
  requestedBy: string;
  createdAt: string;
  priority: boolean;
};
