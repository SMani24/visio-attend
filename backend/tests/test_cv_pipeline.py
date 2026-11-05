import pytest
import numpy as np
import cv2
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.cv_engine.matcher import (
    decode_descriptors,
    encode_descriptors,
    compute_pairwise_matches,
    parse_keypoints,
)
from backend.app.cv_engine.consensus_graph import ConsensusGraphEngine
from backend.app.cv_engine.simulator import (
    generate_synthetic_whiteboard,
    generate_unrelated_room,
    extract_features_from_image,
    generate_perspective_view,
    create_simulated_classroom_submissions,
)
from backend.app.models.schemas import AttendanceSubmissionRequest


@pytest.fixture
def test_client():
    return TestClient(app)


def test_descriptor_encoding_decoding():
    # 50 ORB descriptors (50 x 32 bytes)
    np.random.seed(42)
    original = np.random.randint(0, 256, (50, 32), dtype=np.uint8)
    b64 = encode_descriptors(original)
    decoded = decode_descriptors(b64, expected_count=50)

    assert decoded.shape == (50, 32)
    assert np.array_equal(original, decoded)


def test_matcher_homography_perspective_warp():
    # Generate whiteboard and simulate a realistic perspective shift
    whiteboard = generate_synthetic_whiteboard()
    view1 = generate_perspective_view(whiteboard, (10, 10), (10, 10), (10, 10), (10, 10))
    view2 = generate_perspective_view(whiteboard, (35, 15), (15, 20), (20, 20), (30, 15))

    kps1, descs1_b64 = extract_features_from_image(view1)
    kps2, descs2_b64 = extract_features_from_image(view2)

    desc1 = decode_descriptors(descs1_b64)
    desc2 = decode_descriptors(descs2_b64)
    pts1 = parse_keypoints(kps1)
    pts2 = parse_keypoints(kps2)

    result = compute_pairwise_matches(desc1, desc2, pts1, pts2)

    # Perspective shift between two views of same whiteboard should produce substantial RANSAC inliers
    assert result["inliers_count"] >= 15, f"Expected >= 15 inliers, got {result['inliers_count']}"
    assert result["homography"] is not None
    assert result["is_valid_homography"] is True
    assert not result["is_replay_duplicate"]


def test_matcher_outlier_rejection():
    # Whiteboard vs unrelated bedroom dorm room
    whiteboard = generate_synthetic_whiteboard()
    dorm_room = generate_unrelated_room()

    kps1, descs1_b64 = extract_features_from_image(whiteboard)
    kps2, descs2_b64 = extract_features_from_image(dorm_room)

    desc1 = decode_descriptors(descs1_b64)
    desc2 = decode_descriptors(descs2_b64)
    pts1 = parse_keypoints(kps1)
    pts2 = parse_keypoints(kps2)

    result = compute_pairwise_matches(desc1, desc2, pts1, pts2)

    # Unrelated scenes should yield very low or zero inliers, far below threshold 15
    assert result["inliers_count"] < 15, f"Expected < 15 inliers for unrelated scenes, got {result['inliers_count']}"


def test_anti_replay_identical_detection():
    # If two submissions have identical keypoints and descriptors
    whiteboard = generate_synthetic_whiteboard()
    kps, descs_b64 = extract_features_from_image(whiteboard)

    desc = decode_descriptors(descs_b64)
    pts = parse_keypoints(kps)

    result = compute_pairwise_matches(desc, desc, pts, pts)
    # Identical points have 0 pixel displacement
    assert result["is_replay_duplicate"] is True


def test_consensus_graph_clustering_5_students_1_spoofer():
    submissions = create_simulated_classroom_submissions("test_session_consensus")
    engine = ConsensusGraphEngine(min_inliers=15)

    results, graph = engine.evaluate_session(submissions)

    # 5 classroom students should be PRESENT
    # 1 spoofer should be REJECTED_OUTLIER
    present_students = [r for r in results if r.verified and r.status == "PRESENT"]
    rejected_students = [r for r in results if not r.verified]

    assert len(present_students) == 5, f"Expected 5 present students, got {len(present_students)}"
    assert len(rejected_students) == 1, f"Expected 1 rejected spoofer, got {len(rejected_students)}"
    assert rejected_students[0].student_id == "99109999"
    assert "REJECTED_OUTLIER" in rejected_students[0].status
    assert graph.consensus_cluster_size == 5
    assert graph.outliers_count == 1


def test_api_endpoints(test_client):
    # Health check
    res = test_client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # Create session
    session_payload = {
        "session_id": "test_api_session_01",
        "course_name": "Computer Vision 2026",
        "professor_id": "prof_dr_smith",
        "anchor_mode": False
    }
    res = test_client.post("/api/sessions", json=session_payload)
    assert res.status_code == 200
    assert res.json()["session_id"] == "test_api_session_01"

    # Simulate classroom
    res = test_client.post("/api/simulate/test_api_session_01")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total_simulated"] == 6

    # Verify graph endpoint
    res = test_client.get("/api/attendance/consensus-graph/test_api_session_01")
    assert res.status_code == 200
    graph = res.json()
    assert graph["consensus_cluster_size"] == 5
    assert graph["outliers_count"] == 1
    assert len(graph["nodes"]) == 6


def test_single_submission_anchor_mode_and_outlier():
    from backend.app.models.schemas import FaceProof, MotionBridge, SceneFeatures

    engine = ConsensusGraphEngine(min_inliers=15)
    wb = generate_synthetic_whiteboard()
    dorm = generate_unrelated_room()

    wb_kps, wb_descs = extract_features_from_image(wb)
    dorm_kps, dorm_descs = extract_features_from_image(dorm)

    anchor = SceneFeatures(
        frame_width=640,
        frame_height=480,
        redacted_faces_count=0,
        keypoint_count=len(wb_kps),
        keypoints=wb_kps,
        descriptors_b64=wb_descs,
    )

    valid_face = FaceProof(
        verified=True,
        cosine_similarity=0.88,
        liveness_action="BLINK_EAR_ACTIVE",
        ear_min=0.18,
        yaw_delta_deg=0.0,
        enrollment_commitment_hash="test_hash",
    )
    valid_motion = MotionBridge(
        camera_switch_ms=450,
        prompted_direction="RIGHT",
        observed_flow_direction="RIGHT",
        direction_matched=True,
        flow_coherence=0.85,
        mean_flow_magnitude_px=14.2,
        tracked_points_count=45,
    )

    # 1. Random / dorm room submission against whiteboard anchor -> MUST BE REJECTED_OUTLIER
    unrelated_sub = AttendanceSubmissionRequest(
        session_id="test_anchor_sess",
        student_id="student_dorm",
        student_name="Dorm Student",
        timestamp_ms=1000,
        face_proof=valid_face,
        motion_bridge=valid_motion,
        scene_features=SceneFeatures(
            frame_width=640,
            frame_height=480,
            redacted_faces_count=0,
            keypoint_count=len(dorm_kps),
            keypoints=dorm_kps,
            descriptors_b64=dorm_descs,
        ),
    )

    results_dorm, _ = engine.evaluate_session([unrelated_sub], anchor_features=anchor)
    assert results_dorm[0].status == "REJECTED_OUTLIER"
    assert results_dorm[0].verified is False
    assert results_dorm[0].inlier_count_max < 15

    # 2. Classroom whiteboard submission against whiteboard anchor -> MUST BE PRESENT
    wb_view = generate_perspective_view(wb, (12, 10), (10, 15), (14, 12), (15, 10))
    match_kps, match_descs = extract_features_from_image(wb_view)

    matching_sub = AttendanceSubmissionRequest(
        session_id="test_anchor_sess",
        student_id="student_classroom",
        student_name="Classroom Student",
        timestamp_ms=2000,
        face_proof=valid_face,
        motion_bridge=valid_motion,
        scene_features=SceneFeatures(
            frame_width=640,
            frame_height=480,
            redacted_faces_count=0,
            keypoint_count=len(match_kps),
            keypoints=match_kps,
            descriptors_b64=match_descs,
        ),
    )

    results_match, _ = engine.evaluate_session([matching_sub], anchor_features=anchor)
    assert results_match[0].status == "PRESENT"
    assert results_match[0].verified is True
    assert results_match[0].inlier_count_max >= 15

    # 3. Single submission WITHOUT anchor and WITHOUT peers -> MUST NOT BE PRESENT
    results_no_peer, _ = engine.evaluate_session([matching_sub], anchor_features=None)
    assert results_no_peer[0].status == "REJECTED_OUTLIER"
    assert results_no_peer[0].verified is False

