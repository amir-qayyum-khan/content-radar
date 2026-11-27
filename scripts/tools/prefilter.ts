import { STAGES, type Stage } from '../lib/types.ts';

const STAGE_WORDS: Record<Exclude<Stage, 'other'>, string[]> = {
  'story-script': ['screenplay', 'script', 'story', 'storytelling', 'hook', 'beat', 'cliffhanger', 'dialogue', 'narrative', 'drama', 'plot', 'episode'],
  'pacing-edit': ['edit', 'editing', 'ffmpeg', 'remotion', 'cut', 'transition', 'b-roll', 'timeline', 'montage', 'pacing'],
  'voice-emotion': ['voice', 'tts', 'text-to-speech', 'speech', 'lip-sync', 'lipsync', 'dubbing', 'narration', 'elevenlabs'],
  'music-sfx': ['music', 'sfx', 'sound', 'audio', 'soundtrack', 'score', 'foley'],
  'review-qc': ['review', 'continuity', 'qc', 'quality check'],
  'visual-generation': ['video generation', 'kling', 'runway', 'veo', 'sora', 'storyboard', 'animation', 'animate', 'cinematic', 'character consistency'],
  'captions-publish': ['subtitle', 'caption', 'thumbnail', 'youtube', 'tiktok', 'shorts', 'reel', 'instagram'],
};

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cheap keyword pass before any LLM call: drop clearly unrelated items and guess a stage. */
export function prefilter(text: string): { keep: boolean; score: number; stageGuess: Stage } {
  let score = 0;
  let best: Stage = 'other';
  let bestHits = 0;
  for (const stage of STAGES) {
    if (stage === 'other') continue;
    const hits = STAGE_WORDS[stage].reduce((n, w) => n + (text.match(new RegExp(`\\b${esc(w)}\\w*`, 'gi'))?.length ?? 0), 0);
    score += hits;
    if (hits > bestHits) { best = stage; bestHits = hits; }
  }
  return { keep: score >= 1, score, stageGuess: best };
}
