/**
 * Camera and Environment Detection Service
 * Safely handles camera permissions, secure contexts, and stream lifecycle across iOS & Android.
 */

export interface CameraCheckResult {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  isSecureContext: boolean;
  canAccessCamera: boolean;
  errorMessage?: string;
}

export function checkCameraCapabilities(): CameraCheckResult {
  const isSecure = typeof window !== 'undefined' ? (window.isSecureContext ?? false) : false;
  const hasMediaDevices = typeof navigator !== 'undefined' && !!navigator.mediaDevices;
  const hasGetUserMedia = hasMediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function';
  const canAccessCamera = hasGetUserMedia;

  let errorMessage: string | undefined;
  if (!isSecure && !canAccessCamera) {
    errorMessage = 'Camera blocked by browser: Access via HTTPS or localhost is required on mobile devices.';
  } else if (!hasGetUserMedia) {
    errorMessage = 'Camera API (getUserMedia) not supported in this browser context.';
  }

  return {
    hasMediaDevices,
    hasGetUserMedia,
    isSecureContext: isSecure,
    canAccessCamera,
    errorMessage,
  };
}

export async function safeRequestCameraStream(
  facingMode: 'user' | 'environment'
): Promise<{ stream: MediaStream | null; error?: string }> {
  const caps = checkCameraCapabilities();
  if (!caps.canAccessCamera) {
    return { stream: null, error: caps.errorMessage || 'Camera API unavailable' };
  }

  try {
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { stream };
  } catch (err: any) {
    let friendly = 'Camera permission denied or camera in use by another app.';
    if (err?.name === 'NotAllowedError') {
      friendly = 'Camera permission was denied. Please allow camera access in browser settings.';
    } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
      friendly = `No ${facingMode} camera found on this device.`;
    } else if (err?.name === 'NotReadableError') {
      friendly = 'Camera hardware is busy or in use by another application.';
    }
    return { stream: null, error: friendly };
  }
}
