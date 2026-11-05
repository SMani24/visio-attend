export interface FaceProof {
  verified: boolean;
  cosine_similarity: float;
  liveness_action: string;
  ear_min: number;
  yaw_delta_deg: number;
  enrollment_commitment_hash: string;
}

export type float = number;

export interface MotionBridge {
  camera_switch_ms: number;
  prompted_direction: 'LEFT' | 'RIGHT' | 'UP' | 'DOWN';
  observed_flow_direction: string;
  direction_matched: boolean;
  flow_coherence: number;
  mean_flow_magnitude_px: number;
  tracked_points_count: number;
}

export interface SceneFeatures {
  frame_width: number;
  frame_height: number;
  redacted_faces_count: number;
  keypoint_count: number;
  keypoints: [number, number, number, number][]; // [x, y, size, angle]
  descriptors_b64: string;
}

export interface AttendanceSubmissionPayload {
  session_id: string;
  student_id: string;
  student_name: string;
  timestamp_ms: number;
  face_proof: FaceProof;
  motion_bridge: MotionBridge;
  scene_features: SceneFeatures;
}

export interface VerificationResult {
  student_id: string;
  student_name: string;
  verified: boolean;
  status: string;
  inlier_count_max: number;
  matched_peers_count: number;
  cluster_id?: number;
  reasons: string[];
  consensus_score: number;
}

export interface GraphNode {
  id: string;
  label: string;
  status: string;
  is_anchor: boolean;
  inliers_max: number;
  cluster_id: number;
  face_verified: boolean;
  motion_verified: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  inliers: number;
  weight: number;
}

export interface ConsensusGraphData {
  session_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_submissions: number;
  consensus_cluster_size: number;
  outliers_count: number;
  mode: 'ANCHOR' | 'PEER_CONSENSUS';
  timestamp_ms: number;
}

export interface StudentProfile {
  student_id: string;
  full_name: string;
  enrolled: boolean;
  commitment_hash: string;
  enrolled_embedding: number[];
}
