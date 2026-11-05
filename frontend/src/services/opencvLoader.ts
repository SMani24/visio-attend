declare global {
  interface Window {
    cv: any;
  }
}

/**
 * Checks and safely resolves OpenCV runtime.
 * Never hangs or blocks UI execution if OpenCV.js is omitted.
 */
export function waitForOpenCV(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }

  return Promise.resolve(null);
}

export function isOpenCVReady(): boolean {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat;
}
