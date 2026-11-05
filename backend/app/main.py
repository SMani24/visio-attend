import json
import asyncio
from typing import Dict, List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from backend.app.config import settings
from backend.app.database import engine, get_db, Base
from backend.app.models.db_models import StudentEnrollment, AttendanceSession, AttendanceRecord
from backend.app.models.schemas import (
    AttendanceSubmissionRequest,
    AttendanceVerificationResult,
    SessionCreateRequest,
    SessionInfo,
    StudentEnrollmentRequest,
    ConsensusGraphResponse,
    SceneFeatures,
)
from backend.app.cv_engine.consensus_graph import ConsensusGraphEngine
from backend.app.cv_engine.simulator import create_simulated_classroom_submissions

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VisioAttend Backend CV Engine",
    description="Privacy-Preserving Classroom Attendance via Dual-Camera Computer Vision and Peer RANSAC Consensus",
    version="1.0.0",
)

# Enable CORS for local and network frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage of live session submissions
# session_id -> List[AttendanceSubmissionRequest]
session_submissions_store: Dict[str, List[AttendanceSubmissionRequest]] = {}
# session_id -> Optional[SceneFeatures] (anchor)
session_anchor_store: Dict[str, SceneFeatures] = {}

# Active WebSocket connections per session
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()
        self.active_connections[session_id].add(websocket)

    def disconnect(self, session_id: str, websocket: WebSocket):
        if session_id in self.active_connections:
            self.active_connections[session_id].discard(websocket)
            if not self.active_connections[session_id]:
                del self.active_connections[session_id]

    async def broadcast(self, session_id: str, message: dict):
        if session_id in self.active_connections:
            for connection in list(self.active_connections[session_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    self.disconnect(session_id, connection)


manager = ConnectionManager()
cv_engine = ConsensusGraphEngine()


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "VisioAttend CV Engine",
        "privacy_mode": "Zero-Raw-Images-On-Device",
        "ransac_threshold": settings.RANSAC_REPROJ_THRESHOLD,
        "min_inliers": settings.MIN_RANSAC_INLIERS,
    }


@app.post("/api/sessions", response_model=SessionInfo)
def create_or_get_session(req: SessionCreateRequest, db: Session = Depends(get_db)):
    db_session = db.query(AttendanceSession).filter(AttendanceSession.session_id == req.session_id).first()
    anchor_json = None
    if req.anchor_features:
        anchor_json = req.anchor_features.model_dump_json()
        session_anchor_store[req.session_id] = req.anchor_features

    if not db_session:
        db_session = AttendanceSession(
            session_id=req.session_id,
            course_name=req.course_name,
            professor_id=req.professor_id,
            is_active=True,
            anchor_mode=req.anchor_mode,
            anchor_features_json=anchor_json,
        )
        db.add(db_session)
        db.commit()
        db.refresh(db_session)
    else:
        db_session.is_active = True
        db_session.anchor_mode = req.anchor_mode
        if anchor_json:
            db_session.anchor_features_json = anchor_json
        db.commit()

    if req.session_id not in session_submissions_store:
        session_submissions_store[req.session_id] = []

    submissions = session_submissions_store[req.session_id]
    verified_count = sum(1 for s in submissions)

    return SessionInfo(
        session_id=db_session.session_id,
        course_name=db_session.course_name,
        professor_id=db_session.professor_id,
        is_active=db_session.is_active,
        created_at_ms=int(db_session.created_at.timestamp() * 1000) if db_session.created_at else 0,
        anchor_mode=db_session.anchor_mode,
        submissions_count=len(submissions),
        verified_count=verified_count,
    )


@app.get("/api/sessions/{session_id}", response_model=SessionInfo)
def get_session_info(session_id: str, db: Session = Depends(get_db)):
    db_session = db.query(AttendanceSession).filter(AttendanceSession.session_id == session_id).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    submissions = session_submissions_store.get(session_id, [])
    return SessionInfo(
        session_id=db_session.session_id,
        course_name=db_session.course_name,
        professor_id=db_session.professor_id,
        is_active=db_session.is_active,
        created_at_ms=int(db_session.created_at.timestamp() * 1000) if db_session.created_at else 0,
        anchor_mode=db_session.anchor_mode,
        submissions_count=len(submissions),
        verified_count=len(submissions),
    )


@app.post("/api/students/enroll")
def enroll_student(req: StudentEnrollmentRequest, db: Session = Depends(get_db)):
    existing = db.query(StudentEnrollment).filter(StudentEnrollment.student_id == req.student_id).first()
    if existing:
        existing.full_name = req.full_name
        existing.commitment_hash = req.commitment_hash
        db.commit()
        return {"status": "updated", "student_id": req.student_id}

    enrollment = StudentEnrollment(
        student_id=req.student_id,
        full_name=req.full_name,
        commitment_hash=req.commitment_hash,
    )
    db.add(enrollment)
    db.commit()
    return {"status": "enrolled", "student_id": req.student_id}


@app.get("/api/students/commitment/{student_id}")
def get_student_commitment(student_id: str, db: Session = Depends(get_db)):
    enrollment = db.query(StudentEnrollment).filter(StudentEnrollment.student_id == student_id).first()
    if not enrollment:
        return {"enrolled": False, "student_id": student_id}
    return {
        "enrolled": True,
        "student_id": enrollment.student_id,
        "full_name": enrollment.full_name,
        "commitment_hash": enrollment.commitment_hash,
    }


@app.post("/api/attendance/submit", response_model=AttendanceVerificationResult)
async def submit_attendance(submission: AttendanceSubmissionRequest, db: Session = Depends(get_db)):
    """
    Core attendance submission endpoint.
    Guarantees: Zero raw images received. Only sparse ORB keypoints + descriptors + flow stats.
    """
    session_id = submission.session_id
    if session_id not in session_submissions_store:
        session_submissions_store[session_id] = []

    # Update or add submission for student
    subs = session_submissions_store[session_id]
    existing_idx = next((i for i, s in enumerate(subs) if s.student_id == submission.student_id), None)
    if existing_idx is not None:
        subs[existing_idx] = submission
    else:
        subs.append(submission)

    # Check anchor if available
    anchor_features = session_anchor_store.get(session_id, None)

    # Run Consensus Graph Verification
    results, graph_response = cv_engine.evaluate_session(subs, anchor_features=anchor_features)

    # Find this student's result
    student_res = next((r for r in results if r.student_id == submission.student_id), None)
    if not student_res:
        raise HTTPException(status_code=500, detail="Evaluation failed for submission")

    # Record in database
    db_rec = AttendanceRecord(
        session_id=session_id,
        student_id=submission.student_id,
        student_name=submission.student_name,
        status=student_res.status,
        inlier_count_max=student_res.inlier_count_max,
        matched_peers_count=student_res.matched_peers_count,
        rejection_reasons="; ".join(student_res.reasons),
        face_similarity=submission.face_proof.cosine_similarity,
        flow_coherence=submission.motion_bridge.flow_coherence,
        submission_timestamp_ms=submission.timestamp_ms,
    )
    db.add(db_rec)
    db.commit()

    # Broadcast updated graph to connected Professor Dashboards
    await manager.broadcast(
        session_id,
        {
            "type": "CONSENSUS_GRAPH_UPDATE",
            "session_id": session_id,
            "graph": graph_response.model_dump(),
            "latest_submission": {
                "student_id": submission.student_id,
                "student_name": submission.student_name,
                "status": student_res.status,
                "inliers": student_res.inlier_count_max,
            },
        },
    )

    return student_res


@app.get("/api/attendance/consensus-graph/{session_id}", response_model=ConsensusGraphResponse)
def get_consensus_graph(session_id: str):
    subs = session_submissions_store.get(session_id, [])
    anchor = session_anchor_store.get(session_id, None)
    _, graph_response = cv_engine.evaluate_session(subs, anchor_features=anchor)
    return graph_response


@app.post("/api/simulate/{session_id}")
async def simulate_classroom(session_id: str):
    """
    Simulation mode: Generates 5 students with realistic perspective-warped views
    of a classroom whiteboard + 1 spoofer pointing at a dorm room.
    Runs full RANSAC consensus and broadcasts graph to live dashboard.
    """
    simulated_subs = create_simulated_classroom_submissions(session_id)
    session_submissions_store[session_id] = simulated_subs

    # Evaluate consensus
    results, graph_response = cv_engine.evaluate_session(simulated_subs)

    # Broadcast to websocket
    await manager.broadcast(
        session_id,
        {
            "type": "SIMULATION_COMPLETE",
            "session_id": session_id,
            "graph": graph_response.model_dump(),
            "results": [r.model_dump() for r in results],
        },
    )

    return {
        "status": "success",
        "session_id": session_id,
        "total_simulated": len(simulated_subs),
        "results": results,
        "graph": graph_response,
    }


@app.post("/api/sessions/{session_id}/reset")
async def reset_session(session_id: str):
    session_submissions_store[session_id] = []
    if session_id in session_anchor_store:
        del session_anchor_store[session_id]
    
    empty_graph = ConsensusGraphResponse(
        session_id=session_id,
        nodes=[],
        edges=[],
        total_submissions=0,
        consensus_cluster_size=0,
        outliers_count=0,
        mode="PEER_CONSENSUS",
        timestamp_ms=0,
    )
    await manager.broadcast(session_id, {
        "type": "SESSION_RESET",
        "session_id": session_id,
        "graph": empty_graph.model_dump(),
    })
    return {"status": "reset", "session_id": session_id}


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)
    try:
        # Send current graph state immediately upon connection
        subs = session_submissions_store.get(session_id, [])
        anchor = session_anchor_store.get(session_id, None)
        _, graph_response = cv_engine.evaluate_session(subs, anchor_features=anchor)
        await websocket.send_json({
            "type": "INITIAL_STATE",
            "session_id": session_id,
            "graph": graph_response.model_dump(),
        })

        while True:
            # Keep connection alive and accept client pings
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("type") == "PING":
                    await websocket.send_json({"type": "PONG"})
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
