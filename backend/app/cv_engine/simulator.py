import time
import base64
import numpy as np
import cv2
from typing import List, Tuple
from backend.app.models.schemas import (
    AttendanceSubmissionRequest,
    FaceProof,
    MotionBridge,
    SceneFeatures,
)
from backend.app.cv_engine.matcher import encode_descriptors


def generate_synthetic_whiteboard() -> np.ndarray:
    """
    Generates a synthetic high-contrast classroom whiteboard image (640x480)
    with math formulas, diagrams, grid lines, and handwritten-style markers.
    Rich in sharp corners and texture for ORB keypoint detection.
    """
    img = np.ones((480, 640), dtype=np.uint8) * 245  # Whiteboard background

    # Border frame
    cv2.rectangle(img, (10, 10), (630, 470), 80, 4)

    # Grid lines / table
    for y in range(80, 450, 60):
        cv2.line(img, (30, y), (610, y), 200, 1)
    for x in range(50, 620, 90):
        cv2.line(img, (x, 70), (x, 430), 200, 1)

    # Classroom diagram: Neural network / Graph nodes & connections
    points = [
        (120, 160), (120, 240), (120, 320),
        (260, 200), (260, 280),
        (400, 240), (520, 180), (520, 300)
    ]
    for pt in points:
        cv2.circle(img, pt, 14, 40, -1)
        cv2.circle(img, pt, 18, 120, 2)

    # Connect nodes
    connections = [
        (0, 3), (1, 3), (2, 3),
        (0, 4), (1, 4), (2, 4),
        (3, 5), (4, 5),
        (5, 6), (5, 7)
    ]
    for i, j in connections:
        cv2.line(img, points[i], points[j], 70, 3)

    # Text / Math equations
    cv2.putText(img, "EE685: Computer Vision - Homography & RANSAC", (30, 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, 30, 2, cv2.LINE_AA)
    cv2.putText(img, "p' = H * p, where H in SL(3)", (140, 110),
                cv2.FONT_HERSHEY_DUPLEX, 0.6, 50, 2, cv2.LINE_AA)
    cv2.putText(img, "Lowe Ratio: dist(m1) < 0.75 * dist(m2)", (180, 380),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, 40, 2, cv2.LINE_AA)
    cv2.putText(img, "Consensus Inliers >= 15 -> PRESENT", (200, 420),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, 20, 2, cv2.LINE_AA)

    return img


def generate_unrelated_room() -> np.ndarray:
    """
    Generates an unrelated bedroom/dorm room image (640x480) with completely
    different visual features (curtains, brick wall, poster patterns) for the spoofer.
    """
    img = np.zeros((480, 640), dtype=np.uint8)

    # Brick pattern
    for y in range(0, 480, 40):
        offset = 30 if (y // 40) % 2 == 1 else 0
        cv2.line(img, (0, y), (640, y), 140, 2)
        for x in range(offset, 640, 80):
            cv2.line(img, (x, y), (x, y + 40), 140, 2)

    # High frequency textured circles
    for r in range(20, 180, 25):
        cv2.circle(img, (320, 240), r, 90, 2)
    cv2.putText(img, "DORM ROOM WALL - UNRELATED SCENE", (80, 250),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, 210, 2, cv2.LINE_AA)

    return img


def extract_features_from_image(img: np.ndarray, max_features: int = 500) -> Tuple[List[List[float]], str]:
    """
    Extracts up to 500 ORB keypoints and base64-encoded binary descriptors.
    """
    orb = cv2.ORB_create(
        nfeatures=max_features,
        scaleFactor=1.2,
        nlevels=8,
        edgeThreshold=15,
        patchSize=31
    )
    kps, descs = orb.detectAndCompute(img, None)

    if kps is None or len(kps) == 0:
        return [], ""

    kps_serialized = [[float(kp.pt[0]), float(kp.pt[1]), float(kp.size), float(kp.angle)] for kp in kps]
    descs_b64 = encode_descriptors(descs)

    return kps_serialized, descs_b64


def generate_perspective_view(
    img: np.ndarray,
    tl_offset: Tuple[float, float] = (10, 10),
    tr_offset: Tuple[float, float] = (10, 10),
    br_offset: Tuple[float, float] = (10, 10),
    bl_offset: Tuple[float, float] = (10, 10),
) -> np.ndarray:
    """
    Simulates a student's smartphone viewing the whiteboard from a specific seat
    using a 4-point projective homography warp.
    """
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [tl_offset[0], tl_offset[1]],
        [w - tr_offset[0], tr_offset[1]],
        [w - br_offset[0], h - br_offset[1]],
        [bl_offset[0], h - bl_offset[1]],
    ])

    H = cv2.getPerspectiveTransform(src, dst)
    warped = cv2.warpPerspective(img, H, (w, h), borderValue=245)

    # Add subtle sensor noise
    noise = np.random.normal(0, 1.5, (h, w)).astype(np.int16)
    noisy_img = np.clip(warped.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    return noisy_img


def create_simulated_classroom_submissions(session_id: str = "sess_demo_cv_01") -> List[AttendanceSubmissionRequest]:
    """
    Creates 5 realistic student submissions with varying perspective views of the classroom whiteboard
    plus 1 malicious/spoofer submission pointing at an unrelated dorm room.
    """
    whiteboard = generate_synthetic_whiteboard()
    dorm_room = generate_unrelated_room()
    now_ms = int(time.time() * 1000)

    # 5 Classroom Students from different seats with realistic perspectives
    student_perspectives = [
        ("99102345", "Sara Ahmadi", ((8, 10), (8, 10), (8, 10), (8, 10))),        # Front Center
        ("99101234", "Ali Rezaei", ((38, 12), (10, 18), (14, 18), (34, 14))),     # Front Left
        ("99104567", "Mohammad Karimi", ((10, 16), (36, 14), (38, 16), (12, 18))),# Front Right
        ("99107890", "Zahra Hosseini", ((24, 22), (24, 22), (24, 22), (24, 22))), # Middle Center
        ("99103412", "Nima Moradi", ((48, 14), (18, 22), (22, 22), (44, 16))),    # Back Left
    ]

    submissions: List[AttendanceSubmissionRequest] = []

    # Generate 5 valid students
    for idx, (sid, sname, corners) in enumerate(student_perspectives):
        view = generate_perspective_view(whiteboard, corners[0], corners[1], corners[2], corners[3])
        kps, descs_b64 = extract_features_from_image(view)

        sub = AttendanceSubmissionRequest(
            session_id=session_id,
            student_id=sid,
            student_name=sname,
            timestamp_ms=now_ms + idx * 500,
            face_proof=FaceProof(
                verified=True,
                cosine_similarity=float(0.82 + 0.03 * (idx % 3)),
                liveness_action="BLINK_AND_YAW",
                ear_min=0.16,
                yaw_delta_deg=14.5 + idx,
                enrollment_commitment_hash=f"hash_commit_{sid}_valid"
            ),
            motion_bridge=MotionBridge(
                camera_switch_ms=620 + idx * 40,
                prompted_direction="RIGHT",
                observed_flow_direction="LEFT_IMAGE_COORDS",
                direction_matched=True,
                flow_coherence=0.88 + 0.02 * (idx % 4),
                mean_flow_magnitude_px=14.0 + idx,
                tracked_points_count=65 + idx * 3
            ),
            scene_features=SceneFeatures(
                frame_width=640,
                frame_height=480,
                redacted_faces_count=0,
                keypoint_count=len(kps),
                keypoints=kps,
                descriptors_b64=descs_b64
            )
        )
        submissions.append(sub)

    # Generate 1 Spoofer (Dorm student pointing at bedroom wall)
    dorm_kps, dorm_descs_b64 = extract_features_from_image(dorm_room)
    spoofer = AttendanceSubmissionRequest(
        session_id=session_id,
        student_id="99109999",
        student_name="Dorm Spoofer (Remote Cheater)",
        timestamp_ms=now_ms + 3000,
        face_proof=FaceProof(
            verified=True,
            cosine_similarity=0.79,
            liveness_action="BLINK_AND_YAW",
            ear_min=0.18,
            yaw_delta_deg=13.0,
            enrollment_commitment_hash="hash_commit_spoofer"
        ),
        motion_bridge=MotionBridge(
            camera_switch_ms=750,
            prompted_direction="RIGHT",
            observed_flow_direction="LEFT_IMAGE_COORDS",
            direction_matched=True,
            flow_coherence=0.85,
            mean_flow_magnitude_px=12.5,
            tracked_points_count=58
        ),
        scene_features=SceneFeatures(
            frame_width=640,
            frame_height=480,
            redacted_faces_count=0,
            keypoint_count=len(dorm_kps),
            keypoints=dorm_kps,
            descriptors_b64=dorm_descs_b64
        )
    )
    submissions.append(spoofer)

    return submissions
