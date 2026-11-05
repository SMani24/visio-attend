import base64
import numpy as np
import cv2
from typing import List, Tuple, Optional, Dict, Any
from backend.app.config import settings


def decode_descriptors(descriptors_b64: str, expected_count: Optional[int] = None) -> np.ndarray:
    """
    Decodes base64-encoded binary ORB descriptors into a uint8 NumPy matrix of shape [N, 32].
    Each ORB descriptor is 256 bits = 32 bytes.
    """
    if not descriptors_b64:
        return np.empty((0, 32), dtype=np.uint8)
    
    raw_bytes = base64.b64decode(descriptors_b64)
    if len(raw_bytes) % 32 != 0:
        raise ValueError(f"Descriptor byte length ({len(raw_bytes)}) is not a multiple of 32 bytes.")
    
    matrix = np.frombuffer(raw_bytes, dtype=np.uint8).reshape(-1, 32)
    
    if expected_count is not None and matrix.shape[0] != expected_count:
        # If count mismatches, slice or take min to avoid index errors
        matrix = matrix[:expected_count]
        
    return matrix


def encode_descriptors(desc_matrix: np.ndarray) -> str:
    """
    Encodes a uint8 NumPy matrix of shape [N, 32] into a base64 string.
    """
    if desc_matrix is None or desc_matrix.size == 0:
        return ""
    return base64.b64encode(desc_matrix.astype(np.uint8).tobytes()).decode("utf-8")


def parse_keypoints(kps_list: List[List[float]]) -> np.ndarray:
    """
    Extracts (x, y) coordinates from a list of keypoints [[x, y, size, angle], ...].
    Returns shape [N, 2] float32 array.
    """
    if not kps_list:
        return np.empty((0, 2), dtype=np.float32)
    return np.float32([[kp[0], kp[1]] for kp in kps_list])


def compute_pairwise_matches(
    desc1: np.ndarray,
    desc2: np.ndarray,
    pts1: np.ndarray,
    pts2: np.ndarray,
    ratio_threshold: float = settings.LOWE_RATIO_THRESHOLD,
    ransac_threshold: float = settings.RANSAC_REPROJ_THRESHOLD,
) -> Dict[str, Any]:
    """
    Executes pairwise matching between two ORB feature sets:
    1. cv2.BFMatcher(NORM_HAMMING, crossCheck=False)
    2. knnMatch(k=2)
    3. Lowe's Ratio Test (distance < ratio_threshold * second_distance)
    4. RANSAC Projective Homography Estimation (cv2.findHomography)
    
    Returns a dictionary containing inlier count, homography matrix H, and verification flags.
    """
    result = {
        "good_matches_count": 0,
        "inliers_count": 0,
        "homography": None,
        "is_replay_duplicate": False,
        "is_valid_homography": False,
        "perspective_error": 0.0,
    }

    if desc1 is None or desc2 is None or len(desc1) < 4 or len(desc2) < 4:
        return result

    # 1. BFMatcher with Hamming distance
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
    try:
        raw_matches = bf.knnMatch(desc1, desc2, k=2)
    except cv2.error:
        return result

    # 2. Lowe's Ratio Test
    good_matches = []
    for pair in raw_matches:
        if len(pair) == 2:
            m, n = pair
            if m.distance < ratio_threshold * n.distance:
                good_matches.append(m)

    result["good_matches_count"] = len(good_matches)

    if len(good_matches) < settings.MIN_KEYPOINTS_FOR_HOMOGRAPHY:
        return result

    # 3. Extract coordinates of matching points
    src_pts = np.float32([pts1[m.queryIdx] for m in good_matches]).reshape(-1, 1, 2)
    dst_pts = np.float32([pts2[m.trainIdx] for m in good_matches]).reshape(-1, 1, 2)

    # 4. RANSAC Homography Estimation
    H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, ransac_threshold)

    if H is None or mask is None:
        return result

    inliers_count = int(np.sum(mask))
    result["inliers_count"] = inliers_count
    result["homography"] = H.tolist()

    # 5. Perspective and Replay Checks
    # Check if this is a duplicated identical submission (zero displacement across all matching points)
    inlier_indices = np.where(mask.ravel() == 1)[0]
    if len(inlier_indices) >= 4:
        matched_src = src_pts[inlier_indices].reshape(-1, 2)
        matched_dst = dst_pts[inlier_indices].reshape(-1, 2)
        displacements = np.linalg.norm(matched_src - matched_dst, axis=1)
        mean_disp = float(np.mean(displacements))
        result["perspective_error"] = mean_disp

        # Check for replay attack:
        # If 95%+ of points are inliers AND the mean displacement is essentially 0 (< 0.2 pixels),
        # this means the exact same image was submitted by two different students.
        if inliers_count >= 0.90 * len(good_matches) and mean_disp < 0.2:
            result["is_replay_duplicate"] = True

        # Sanity check on Homography determinant and condition
        det = np.linalg.det(H)
        if det > 0.01 and det < 100.0:
            result["is_valid_homography"] = True

    return result
