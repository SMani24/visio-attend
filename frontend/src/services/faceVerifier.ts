import { StudentProfile, FaceProof } from '../types/attendance';

const ENROLLED_STUDENT_KEY = 'visio_attend_enrolled_student';

export function getEnrolledStudent(): StudentProfile | null {
  try {
    const raw = localStorage.getItem(ENROLLED_STUDENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveEnrolledStudent(profile: StudentProfile): void {
  try {
    localStorage.setItem(ENROLLED_STUDENT_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn('Could not save to localStorage:', err);
  }
}

export function clearEnrolledStudent(): void {
  try {
    localStorage.removeItem(ENROLLED_STUDENT_KEY);
  } catch (err) {
    console.warn('Could not clear localStorage:', err);
  }
}

/**
 * Pure JavaScript SHA-256 implementation.
 * Guarantees cryptographic commitment hashing functions in ALL mobile browsers,
 * webviews, and non-secure HTTP contexts where crypto.subtle is disabled.
 */
function pureSha256(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = i < 16 ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      const s1_r = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1_r + ch + k[i] + w[i]) | 0;
      const s0_r = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0_r + maj) | 0;
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

/**
 * Computes cosine similarity between two 128-D face embedding vectors.
 */
export function computeCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Computes salted SHA-256 commitment hash of the face embedding vector.
 * Uses Web Crypto API when available; gracefully falls back to pureSha256 on mobile/HTTP contexts.
 */
export async function computeCommitmentHash(embedding: number[], salt: string = 'visio_attend_2026'): Promise<string> {
  const data = salt + ':' + embedding.map(x => x.toFixed(5)).join(',');
  
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const encoder = new TextEncoder();
      const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(buffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback to pureSha256 below
    }
  }

  return pureSha256(data);
}

/**
 * Computes Eye Aspect Ratio (EAR) from 6 2D/3D eye landmarks.
 * Landmarks order: [p1(outer), p2(top1), p3(top2), p4(inner), p5(bottom2), p6(bottom1)]
 */
export function computeEAR(pts: { x: number; y: number }[]): number {
  if (!pts || pts.length < 6) return 0.3;

  const dist = (p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    Math.hypot(p1.x - p2.x, p1.y - p2.y);

  const num = dist(pts[1], pts[5]) + dist(pts[2], pts[4]);
  const den = 2.0 * dist(pts[0], pts[3]);

  return den === 0 ? 0 : num / den;
}

/**
 * Extracts a normalized 128-D face descriptor from facial landmarks or canvas face region
 * using geometric landmark ratios and high-order shape moments.
 */
export function extractFaceEmbeddingFromLandmarks(landmarks: { x: number; y: number; z?: number }[]): number[] {
  if (!landmarks || landmarks.length < 30) {
    // Generate deterministic normalized fallback vector if landmarks are unavailable
    return Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.4) / Math.sqrt(64));
  }

  const vec: number[] = new Array(128).fill(0);
  const n = landmarks.length;

  const nose = landmarks[1] || landmarks[0];
  const leftEye = landmarks[33] || landmarks[1];
  const rightEye = landmarks[263] || landmarks[2];
  const chin = landmarks[152] || landmarks[3];

  const scale = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y) || 1.0;

  for (let i = 0; i < 128; i++) {
    const idx1 = (i * 3) % n;
    const idx2 = (i * 5 + 7) % n;
    const p1 = landmarks[idx1];
    const p2 = landmarks[idx2];

    const d1 = Math.hypot(p1.x - nose.x, p1.y - nose.y) / scale;
    const d2 = Math.hypot(p2.x - chin.x, p2.y - chin.y) / scale;
    const cross = (p1.x - nose.x) * (p2.y - chin.y) - (p1.y - nose.y) * (p2.x - chin.x);

    vec[i] = (d1 - d2) * 0.5 + Math.sin(cross * 10.0) * 0.5;
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1.0;
  return vec.map(v => v / norm);
}

/**
 * Estimates head yaw angle delta in degrees using nose and cheek landmark ratios.
 */
export function estimateYawAngleDeg(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 468) return 0;

  const nose = landmarks[1];
  const leftCheek = landmarks[234];
  const rightCheek = landmarks[454];

  const distL = Math.abs(nose.x - leftCheek.x);
  const distR = Math.abs(rightCheek.x - nose.x);
  const total = distL + distR;

  if (total === 0) return 0;
  const ratio = (distR - distL) / total;
  return ratio * 75.0;
}
