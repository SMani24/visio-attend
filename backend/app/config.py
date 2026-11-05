import os
from pydantic import BaseModel


class Settings(BaseModel):
    PROJECT_NAME: str = "VisioAttend"
    API_V1_STR: str = "/api"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./backend/data/visio_attend.db")
    
    # Computer Vision Consensus Thresholds
    MIN_RANSAC_INLIERS: int = 15
    LOWE_RATIO_THRESHOLD: float = 0.75
    RANSAC_REPROJ_THRESHOLD: float = 5.0
    MIN_KEYPOINTS_FOR_HOMOGRAPHY: int = 10
    
    # Anti-Spoofing & Liveness Thresholds
    FACE_SIMILARITY_THRESHOLD: float = 0.65
    CAMERA_SWITCH_MAX_MS: int = 2500
    MIN_FLOW_COHERENCE: float = 0.65
    MAX_FLOW_COHERENCE: float = 0.995
    MIN_FLOW_MAGNITUDE_PX: float = 4.0
    
    # Anti-Replay
    MIN_PERSPECTIVE_DIVERSITY_ERROR: float = 1.0  # Identical frames will have error ~ 0.0


settings = Settings()
