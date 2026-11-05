from sqlalchemy import Column, Integer, String, Boolean, Float, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from backend.app.database import Base


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String(64), unique=True, index=True, nullable=False)
    full_name = Column(String(128), nullable=False)
    commitment_hash = Column(String(128), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AttendanceSession(Base):
    __tablename__ = "attendance_sessions"

    session_id = Column(String(64), primary_key=True, index=True)
    course_name = Column(String(128), nullable=False)
    professor_id = Column(String(64), nullable=False)
    is_active = Column(Boolean, default=True)
    anchor_mode = Column(Boolean, default=False)
    anchor_features_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(64), ForeignKey("attendance_sessions.session_id"), index=True)
    student_id = Column(String(64), index=True)
    student_name = Column(String(128))
    status = Column(String(32))  # "PRESENT", "REJECTED_OUTLIER", "REJECTED_LIVENESS", etc.
    inlier_count_max = Column(Integer, default=0)
    matched_peers_count = Column(Integer, default=0)
    rejection_reasons = Column(Text, default="")
    face_similarity = Column(Float, default=0.0)
    flow_coherence = Column(Float, default=0.0)
    submission_timestamp_ms = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
