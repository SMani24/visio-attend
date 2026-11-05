import networkx as nx
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from backend.app.config import settings
from backend.app.models.schemas import (
    AttendanceSubmissionRequest,
    AttendanceVerificationResult,
    GraphNode,
    GraphEdge,
    ConsensusGraphResponse,
    SceneFeatures,
)
from backend.app.cv_engine.matcher import (
    decode_descriptors,
    parse_keypoints,
    compute_pairwise_matches,
)


class ConsensusGraphEngine:
    def __init__(
        self,
        min_inliers: int = settings.MIN_RANSAC_INLIERS,
        ratio_threshold: float = settings.LOWE_RATIO_THRESHOLD,
        ransac_threshold: float = settings.RANSAC_REPROJ_THRESHOLD,
    ):
        self.min_inliers = min_inliers
        self.ratio_threshold = ratio_threshold
        self.ransac_threshold = ransac_threshold

    def evaluate_session(
        self,
        submissions: List[AttendanceSubmissionRequest],
        anchor_features: Optional[SceneFeatures] = None,
        anchor_id: str = "PROF_ANCHOR",
    ) -> Tuple[List[AttendanceVerificationResult], ConsensusGraphResponse]:
        """
        Builds the consensus graph, performs pairwise RANSAC matching,
        identifies connected components, and determines attendance status.
        """
        G = nx.Graph()

        # Pre-decode descriptors and parse keypoints for all submissions
        processed = {}
        for sub in submissions:
            desc = decode_descriptors(
                sub.scene_features.descriptors_b64,
                sub.scene_features.keypoint_count
            )
            pts = parse_keypoints(sub.scene_features.keypoints)
            processed[sub.student_id] = {
                "sub": sub,
                "desc": desc,
                "pts": pts,
                "is_anchor": False,
                "label": sub.student_name,
            }
            G.add_node(sub.student_id, label=sub.student_name, is_anchor=False)

        # Include professor anchor if provided
        has_anchor = False
        if anchor_features is not None and anchor_features.keypoint_count > 0:
            anchor_desc = decode_descriptors(
                anchor_features.descriptors_b64,
                anchor_features.keypoint_count
            )
            anchor_pts = parse_keypoints(anchor_features.keypoints)
            processed[anchor_id] = {
                "desc": anchor_desc,
                "pts": anchor_pts,
                "is_anchor": True,
                "label": "Professor Target Anchor",
            }
            G.add_node(anchor_id, label="Professor Target Anchor", is_anchor=True)
            has_anchor = True

        all_ids = list(processed.keys())
        n = len(all_ids)

        edges_info = []
        max_inliers_per_node: Dict[str, int] = {k: 0 for k in all_ids}
        pairwise_replays = set()

        # Pairwise matching loop
        for i in range(n):
            id_i = all_ids[i]
            data_i = processed[id_i]

            for j in range(i + 1, n):
                id_j = all_ids[j]
                data_j = processed[id_j]

                match_res = compute_pairwise_matches(
                    data_i["desc"],
                    data_j["desc"],
                    data_i["pts"],
                    data_j["pts"],
                    ratio_threshold=self.ratio_threshold,
                    ransac_threshold=self.ransac_threshold,
                )

                inliers = match_res["inliers_count"]
                if inliers > max_inliers_per_node[id_i]:
                    max_inliers_per_node[id_i] = inliers
                if inliers > max_inliers_per_node[id_j]:
                    max_inliers_per_node[id_j] = inliers

                # Check replay attack
                if match_res["is_replay_duplicate"]:
                    pairwise_replays.add((id_i, id_j))

                # If geometric inliers >= threshold, add edge in the consensus graph
                if inliers >= self.min_inliers:
                    G.add_edge(id_i, id_j, weight=inliers, inliers=inliers)
                    edges_info.append(
                        GraphEdge(
                            source=id_i,
                            target=id_j,
                            inliers=inliers,
                            weight=float(inliers),
                        )
                    )

        # Connected component analysis
        connected_components = list(nx.connected_components(G))
        connected_components.sort(key=len, reverse=True)

        # Identify consensus / approved set
        approved_node_ids = set()
        consensus_cluster_id = 0
        node_cluster_map = {}

        for cluster_idx, comp in enumerate(connected_components):
            for node_id in comp:
                node_cluster_map[node_id] = cluster_idx

        if has_anchor:
            # Mode A: Professor Anchor Mode
            # All nodes in the same connected component as anchor_id are approved
            if anchor_id in G:
                anchor_component = nx.node_connected_component(G, anchor_id)
                # Component must have edges with the anchor
                approved_node_ids = set(anchor_component)
                approved_node_ids.discard(anchor_id)
                consensus_cluster_id = node_cluster_map.get(anchor_id, 0)
        else:
            # Mode B: Zero-Touch Peer Consensus Mode
            # Dominant connected component MUST have >= 2 students connected by >= 15 inliers!
            if connected_components:
                largest_comp = connected_components[0]
                if len(largest_comp) >= 2:
                    approved_node_ids = set(largest_comp)
                    consensus_cluster_id = 0

        # Construct verification results for all students
        results: List[AttendanceVerificationResult] = []
        graph_nodes: List[GraphNode] = []

        for sub in submissions:
            sid = sub.student_id
            reasons = []
            status = "PRESENT"

            # 1. Front-Cam Face Proof check
            face_ok = sub.face_proof.verified and sub.face_proof.cosine_similarity >= settings.FACE_SIMILARITY_THRESHOLD
            if not face_ok:
                reasons.append(f"Face verification failed (similarity: {sub.face_proof.cosine_similarity:.2f})")
                status = "REJECTED_LIVENESS"

            # 2. Motion Bridge Optical Flow check
            motion_ok = (
                sub.motion_bridge.direction_matched
                and sub.motion_bridge.camera_switch_ms <= settings.CAMERA_SWITCH_MAX_MS
                and settings.MIN_FLOW_COHERENCE <= sub.motion_bridge.flow_coherence <= settings.MAX_FLOW_COHERENCE
            )
            if not motion_ok:
                reasons.append(
                    f"Motion bridge optical flow check failed "
                    f"(matched={sub.motion_bridge.direction_matched}, switch={sub.motion_bridge.camera_switch_ms}ms, coherence={sub.motion_bridge.flow_coherence:.2f})"
                )
                if status == "PRESENT":
                    status = "REJECTED_MOTION_BRIDGE"

            # 3. Check replay attacks
            has_replay = any((sid == r1 or sid == r2) for (r1, r2) in pairwise_replays)
            if has_replay:
                reasons.append("Duplicate identical frame submission detected (anti-replay violation)")
                if status == "PRESENT":
                    status = "REJECTED_REPLAY"

            # 4. Consensus Graph Inlier check (Must have at least min_inliers geometric inliers!)
            max_inliers = max_inliers_per_node.get(sid, 0)
            in_consensus_cluster = (sid in approved_node_ids) and (max_inliers >= self.min_inliers)

            if not in_consensus_cluster:
                if has_anchor:
                    reasons.append(f"Target mismatch: {max_inliers} RANSAC inliers with classroom anchor (< {self.min_inliers} required)")
                elif len(submissions) <= 1:
                    reasons.append("Waiting for peer consensus: No other peers have submitted in this session (>= 15 inliers required)")
                else:
                    reasons.append(f"Scene geometric consensus failed: max inliers ({max_inliers}) < {self.min_inliers}")
                
                if status == "PRESENT":
                    status = "REJECTED_OUTLIER"

            is_present = (status == "PRESENT")
            matched_peers_count = len(list(G.neighbors(sid))) if sid in G else 0

            results.append(
                AttendanceVerificationResult(
                    student_id=sid,
                    student_name=sub.student_name,
                    verified=is_present,
                    status=status,
                    inlier_count_max=max_inliers,
                    matched_peers_count=matched_peers_count,
                    cluster_id=node_cluster_map.get(sid, -1),
                    reasons=reasons,
                    consensus_score=float(max_inliers),
                )
            )

            graph_nodes.append(
                GraphNode(
                    id=sid,
                    label=sub.student_name,
                    status=status,
                    is_anchor=False,
                    inliers_max=max_inliers,
                    cluster_id=node_cluster_map.get(sid, -1),
                    face_verified=face_ok,
                    motion_verified=motion_ok,
                )
            )

        if has_anchor and anchor_id in G:
            graph_nodes.append(
                GraphNode(
                    id=anchor_id,
                    label="Professor Target Anchor",
                    status="PROFESSOR_ANCHOR",
                    is_anchor=True,
                    inliers_max=max_inliers_per_node.get(anchor_id, 0),
                    cluster_id=node_cluster_map.get(anchor_id, 0),
                    face_verified=True,
                    motion_verified=True,
                )
            )

        consensus_count = sum(1 for r in results if r.verified)
        outliers_count = len(results) - consensus_count

        graph_response = ConsensusGraphResponse(
            session_id=submissions[0].session_id if submissions else "session_empty",
            nodes=graph_nodes,
            edges=edges_info,
            total_submissions=len(submissions),
            consensus_cluster_size=consensus_count,
            outliers_count=outliers_count,
            mode="ANCHOR" if has_anchor else "PEER_CONSENSUS",
            timestamp_ms=submissions[0].timestamp_ms if submissions else 0,
        )

        return results, graph_response
