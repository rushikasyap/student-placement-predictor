"""
Database Module for Student Placement Prediction System
Supports Neon PostgreSQL with automatic fallback to SQLite.
"""

import os
from datetime import datetime
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, Integer, Float, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL', '')

# Normalize postgresql prefix for SQLAlchemy with psycopg2
sqlalchemy_url = DATABASE_URL
if sqlalchemy_url.startswith("postgres://"):
    sqlalchemy_url = sqlalchemy_url.replace("postgres://", "postgresql+psycopg2://", 1)
elif sqlalchemy_url.startswith("postgresql://") and not sqlalchemy_url.startswith("postgresql+"):
    sqlalchemy_url = sqlalchemy_url.replace("postgresql://", "postgresql+psycopg2://", 1)

# Clean extra params that psycopg2 handles via sslmode
if "channel_binding=" in sqlalchemy_url:
    sqlalchemy_url = sqlalchemy_url.split("&channel_binding=")[0]
    sqlalchemy_url = sqlalchemy_url.split("?channel_binding=")[0]

# If no DATABASE_URL provided, default to local SQLite for seamless offline testing
if not DATABASE_URL:
    import tempfile
    temp_db_path = os.path.join(tempfile.gettempdir(), "placement_records.db").replace("\\", "/")
    sqlalchemy_url = f"sqlite:///{temp_db_path}"
    IS_NEON = False
else:
    IS_NEON = "neon.tech" in DATABASE_URL or "postgresql" in DATABASE_URL

Base = declarative_base()

class PredictionRecord(Base):
    __tablename__ = 'student_predictions'

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_name = Column(String(120), nullable=False)
    branch = Column(String(100), nullable=False)
    cgpa = Column(Float, nullable=False)
    dsa_score = Column(Float, nullable=False)
    aptitude_score = Column(Float, nullable=False)
    communication_score = Column(Float, nullable=False)
    internships = Column(Integer, default=0)
    projects = Column(Integer, default=0)
    backlogs = Column(Integer, default=0)
    certifications = Column(Integer, default=0)
    work_exp_months = Column(Integer, default=0)
    
    # ML Prediction Outcomes
    probability = Column(Float, nullable=False)
    status = Column(String(60), nullable=False)
    ctc_range = Column(String(80), nullable=False)
    ctc_title = Column(String(120), nullable=False)
    top_role = Column(String(120), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'student_name': self.student_name,
            'branch': self.branch,
            'cgpa': self.cgpa,
            'dsa_score': self.dsa_score,
            'aptitude_score': self.aptitude_score,
            'communication_score': self.communication_score,
            'internships': self.internships,
            'projects': self.projects,
            'backlogs': self.backlogs,
            'probability': self.probability,
            'status': self.status,
            'ctc_range': self.ctc_range,
            'top_role': self.top_role,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else ''
        }

# Database engine & session management
try:
    if "sqlite" in sqlalchemy_url:
        engine = create_engine(sqlalchemy_url, connect_args={"check_same_thread": False})
    else:
        # Neon PostgreSQL connection settings
        engine = create_engine(
            sqlalchemy_url,
            pool_size=5,
            max_overflow=10,
            pool_recycle=300,
            pool_pre_ping=True
        )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
except Exception as e:
    print(f"Warning: Failed to connect with primary DATABASE_URL ({e}). Falling back to local SQLite.")
    engine = create_engine("sqlite:///placement_records.db", connect_args={"check_same_thread": False})
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    IS_NEON = False

def init_db():
    """Initializes tables in database."""
    try:
        Base.metadata.create_all(bind=engine)
        print(f"Database initialized successfully. Target: {'Neon PostgreSQL' if IS_NEON else 'Local SQLite'}")
        return True
    except Exception as e:
        print(f"Error initializing database: {e}")
        return False

def save_prediction_record(pred_data, raw_inputs):
    """Saves a student prediction record to the database."""
    session = SessionLocal()
    try:
        top_role = ''
        if pred_data.get('recommended_roles') and len(pred_data['recommended_roles']) > 0:
            top_role = pred_data['recommended_roles'][0]['role']

        rec = PredictionRecord(
            student_name=raw_inputs.get('student_name', 'Student Candidate'),
            branch=raw_inputs.get('branch', 'Computer Science'),
            cgpa=float(raw_inputs.get('cgpa', 7.0)),
            dsa_score=float(raw_inputs.get('dsa_score', 50)),
            aptitude_score=float(raw_inputs.get('aptitude_score', 50)),
            communication_score=float(raw_inputs.get('communication_score', 50)),
            internships=int(raw_inputs.get('internships', 0)),
            projects=int(raw_inputs.get('projects', 2)),
            backlogs=int(raw_inputs.get('backlogs', 0)),
            certifications=int(raw_inputs.get('certifications', 1)),
            work_exp_months=int(raw_inputs.get('work_exp_months', 0)),
            probability=float(pred_data.get('probability', 50.0)),
            status=pred_data.get('status', 'Moderate'),
            ctc_range=pred_data.get('ctc_tier', {}).get('range', 'INR 4-6 LPA'),
            ctc_title=pred_data.get('ctc_tier', {}).get('title', 'Standard Tier'),
            top_role=top_role,
            created_at=datetime.utcnow()
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        return rec.id
    except Exception as e:
        session.rollback()
        print(f"Error saving prediction to database: {e}")
        return None
    finally:
        session.close()

def get_recent_records(limit=15):
    """Retrieves recent saved predictions."""
    session = SessionLocal()
    try:
        records = session.query(PredictionRecord).order_by(PredictionRecord.id.desc()).limit(limit).all()
        return [r.to_dict() for r in records]
    except Exception as e:
        print(f"Error fetching records: {e}")
        return []
    finally:
        session.close()

def get_db_info():
    """Returns database connection status and summary counts."""
    session = SessionLocal()
    try:
        total = session.query(PredictionRecord).count()
        return {
            'connected': True,
            'is_neon': IS_NEON,
            'db_type': 'Neon PostgreSQL' if IS_NEON else 'Local SQLite (Fallback)',
            'total_saved_predictions': total
        }
    except Exception as e:
        return {
            'connected': False,
            'is_neon': False,
            'db_type': 'Disconnected',
            'error': str(e),
            'total_saved_predictions': 0
        }
    finally:
        session.close()
