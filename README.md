# VisioAttend: Privacy-Preserving Classroom Attendance via Dual-Camera Computer Vision

VisioAttend is an attendance verification system built for Computer Vision coursework that guarantees **zero raw images leave student devices**.

## Core Architecture
- **On-Device Front Camera:** Local 3D landmark verification (MediaPipe) & active micro-challenge liveness (blink EAR + head yaw delta).
- **On-Device Motion Bridge:** Pyramidal Lucas-Kanade Optical Flow (`cv.calcOpticalFlowPyrLK`) verifying continuous hand rotation and anti-spoofing micro-pan.
- **On-Device Rear Camera:** Automatic bystander face-redaction mask followed by sparse ORB keypoint & 256-bit binary descriptor extraction (`cv.ORB`).
- **Backend Geometric Consensus:** Pairwise BFMatcher (Hamming distance) + Lowe's ratio test + RANSAC homography estimation (`cv2.findHomography`) on a peer-to-peer consensus graph (`NetworkX`).

## Privacy Guarantees
1. **Zero Raw Images Exported:** Video streams and image buffers are strictly processed in device RAM and immediately discarded.
2. **Compact Mathematical Signatures:** Only normalized keypoint coordinates `[(x/W, y/H, size, angle)]` and binary ORB descriptors (32 bytes each) are transmitted to the server (~18 KB total payload).
3. **Face Privacy Redaction:** Any bystander faces in the rear-camera view are automatically masked before feature extraction.
4. **Local Enrollment:** Student face embeddings (128-D) remain in browser `IndexedDB`. Only salted SHA-256 commitments are registered.

## Technology Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, MediaPipe Tasks Vision, OpenCV.js (WASM)
- **Backend:** Python 3.10+, FastAPI, Uvicorn, WebSockets, OpenCV (`opencv-python-headless`), NumPy, SciPy, NetworkX, SQLAlchemy, SQLite
