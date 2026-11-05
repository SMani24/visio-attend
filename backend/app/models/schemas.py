from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class FaceProof(BaseModel):
    verified: bool
    cosine_similarity: float
    liveness_action: str
    ear_min: float
    yaw_delta_deg: float
    enrollment_commitment_hash: str


class MotionBridge(BaseModel):
    camera_switch_ms: int
    prompted_direction: str
    observed_flow_direction: str
    direction_matched: bool
    flow_coherence: float
    mean_flow_magnitude_px: float
    tracked_points_count: int


class SceneFeatures(BaseModel):
    frame_width: int
    frame_height: int
    redacted_faces_count: int
    keypoint_count: int
    keypoints: List[List[float]]  # [[x, y, size, angle], ...]
    descriptors_b64: str


class AttendanceSubmissionRequest(BaseModel):
    session_id: str
    student_id: str
    student_name: str
    timestamp_ms: int
    face_proof: FaceProof
    motion_bridge: MotionBridge
    scene_features: SceneFeatures


class AttendanceVerificationResult(BaseModel):
    student_id: str
    student_name: str
    verified: bool
    status: str  # "PRESENT", "REJECTED_OUTLIER", "REJECTED_LIVENESS", "REJECTED_MOTION_BRIDGE", "REJECTED_REPLAY"
    inlier_count_max: int
    matched_peers_count: int
    cluster_id: Optional[int] = None
    reasons: List[str] = Field(default_factory=list)
    consensus_score: float = 0.0


class SessionCreateRequest(BaseModel):
    session_id: str
    course_name: str
    professor_id: str
    anchor_mode: bool = False
    anchor_features: Optional[SceneFeatures] = None


class SessionInfo(BaseModel):
    session_id: str
    course_name: str
    professor_id: str
    is_active: bool
    created_at_ms: int
    anchor_mode: bool
    submissions_count: int
    verified_count: int


class StudentEnrollmentRequest(BaseModel):
    student_id: str
    full_name: str
    commitment_hash: str
    created_at_ms: int


class GraphEdge(BaseModel):
    source: str
    target: str
    inliers: int
    weight: float


class GraphNode(BaseModel):
    id: str
    label: str
    status: str  # "PRESENT", "REJECTED", "PROFESSOR_ANCHOR"
    is_anchor: bool = False
    inliers_max: int = 0
    cluster_id: int = -1
    face_verified: bool = True
    motion_verified: bool = True


class ConsensusGraphResponse(BaseModel):
    session_id: str
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    total_submissions: int
    consensus_cluster_size: int
    outliers_count: int
    mode: str  # "ANCHOR" or "PEER_CONSENSUS"
    timestamp_ms: int
