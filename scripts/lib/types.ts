export const STAGES = ['story-script', 'pacing-edit', 'voice-emotion', 'music-sfx', 'review-qc', 'visual-generation', 'captions-publish', 'other'] as const;
export type Stage = typeof STAGES[number];

export const STAGE_LABELS: Record<Stage, string> = {
  'story-script': 'Story & Script',
  'pacing-edit': 'Pacing & Edit',
  'voice-emotion': 'Voice & Emotion',
  'music-sfx': 'Music & SFX',
  'review-qc': 'Review & QC',
  'visual-generation': 'Visual Generation',
  'captions-publish': 'Captions & Publish',
  'other': 'Other video/audio',
};

export const CONTENT_TYPES = ['micro-drama', 'cinematic', 'reels-shorts', 'documentary', 'animation', 'podcast-audio'] as const;
export type ContentType = typeof CONTENT_TYPES[number];

export const COST_LABELS = ['free', 'needs-paid-service', 'freemium', 'paid', 'unknown'] as const;
export type CostLabel = typeof COST_LABELS[number];

export const CAPS = { write: 60, classify: 200, classifyBatch: 10, digestChars: 6000, maybeBelow: 0.6, staleDays: 365 };

/** `hint`: name/description text from the source, used to skip unrelated tools before any GitHub call. */
export interface Candidate { repo: string; kind: 'skill' | 'plugin'; path: string; sourceName: string; hint?: string }

export interface RepoStats {
  repo: string; stars: number; forks: number; pushedAt: string; license: string | null;
  archived: boolean; topics: string[]; readme: string;
}

export interface Classification {
  relevant: boolean; confidence: number; stages: Stage[]; contentTypes: ContentType[];
  oneLiner: string; maybe: boolean; hash: string;
}

export interface Detail {
  summary: string; install: string[]; usage: { prompt: string; expect: string }; pipelineFit: string;
  cost: { label: CostLabel; services: string[]; evidence: string }; flowchart: string | null; hash: string;
}

export interface Entry {
  id: string; repo: string; kind: 'skill' | 'plugin'; path: string; name: string; slug: string;
  skills: string[]; hasCode: boolean; repoEntryCount: number; firstSeen: string; stale: boolean;
  stars: number; license: string | null; pushedAt: string; inputHash: string; digest: string;
  installCandidates: string[]; costEvidence: string[];
  /** README + SKILL.md text, used to check install commands appear verbatim. */
  readmeText: string;
  classification?: Classification; detail?: Detail;
}
