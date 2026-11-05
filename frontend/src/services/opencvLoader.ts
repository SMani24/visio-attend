declare global {
  interface Window {
    cv: any;
  }
}

let opencvPromise: Promise<any> | null = null;

export function waitForOpenCV(): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('OpenCV is only available in browser'));
  }

  if (window.cv && window.cv.Mat && window.cv.ORB) {
    return Promise.resolve(window.cv);
  }

  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = new Promise((resolve, reject) => {
    // If cv is already defined but runtime not ready yet
    if (window.cv) {
      if (window.cv.onRuntimeInitialized !== undefined) {
        const prev = window.cv.onRuntimeInitialized;
        window.cv.onRuntimeInitialized = () => {
          if (prev) prev();
          resolve(window.cv);
        };
      } else {
        resolve(window.cv);
      }
      return;
    }

    // Check periodically for cv object
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.cv && window.cv.Mat) {
        clearInterval(interval);
        resolve(window.cv);
      } else if (attempts > 120) {
        clearInterval(interval);
        // Fall back gracefully
        reject(new Error('OpenCV.js loading timed out after 30 seconds'));
      }
    }, 250);
  });

  return opencvPromise;
}

export function isOpenCVReady(): boolean {
  return typeof window !== 'undefined' && !!window.cv && !!window.cv.Mat;
}
