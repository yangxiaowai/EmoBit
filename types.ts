
export enum SystemStatus {
  NORMAL = 'NORMAL',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum SimulationType {
  NONE = 'NONE',
  WANDERING = 'WANDERING',
  FALL = 'FALL',
  MEDICATION = 'MEDICATION',
  // New Voice Command Scenarios
  VOICE_NAV_START = 'VOICE_NAV_START',
  VOICE_MEMORY_START = 'VOICE_MEMORY_START',
  VOICE_MEDS_START = 'VOICE_MEDS_START',
}

export interface LogEntry {
  id: string;
  timestamp: string;
  module: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface VitalSign {
  time: string;
  bpm: number;
}

export interface MemoryPhoto {
  id: string;
  url: string;
  date: string;
  location: string;
  story: string; // The AI generated story behind the photo
  tags: string[];
}

export type DashboardTab = 'overview' | 'health' | 'location' | 'medication' | 'logs';

// --- API Types ---

export interface VoiceProfile {
  id: string;
  name: string;
  previewUrl?: string;
  status: 'processing' | 'ready' | 'failed';
}

export interface AvatarModel {
  id: string;
  meshUrl: string; // URL to .glb file
  thumbnailUrl: string;
  status: 'processing' | 'ready' | 'failed';
}
