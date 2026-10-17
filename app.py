"""
Flask Web Application for Student Placement Prediction System (PlacePredict.AI)
Integrated with Neon Database (PostgreSQL) / Local Storage
"""

import os
import io
import json
import pandas as pd
from flask import Flask, render_template, request, jsonify, send_file, redirect
from predictor import PlacementPredictor
from database import init_db, save_prediction_record, get_recent_records, get_db_info, PredictionRecord

app = Flask(__name__, static_folder='static', template_folder='templates')
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16 MB max upload

# Initialize Predictor & Database
predictor = PlacementPredictor()
init_db()

@app.route('/predict')
@app.route('/results')
@app.route('/about')
def handle_redirects():
    return redirect('/', code=302)

PRESETS = {
    "cs_topper": {
        "title": "🌟 CS All-Rounder (Dream Tier)",
        "student_name": "Aarav Sharma",
        "branch": "Computer Science",
        "cgpa": 8.9,
        "internships": 2,
        "projects": 4,
        "dsa_score": 88,
        "aptitude_score": 85,
        "communication_score": 82,
        "backlogs": 0,
        "certifications": 3,
        "work_exp_months": 6
    },
    "coding_wizard": {
        "title": "💻 Competitive Programmer (High DSA)",
        "student_name": "Sneha Patil",
        "branch": "Information Technology",
        "cgpa": 7.6,
        "internships": 1,
        "projects": 5,
        "dsa_score": 92,
        "aptitude_score": 75,
        "communication_score": 70,
        "backlogs": 0,
        "certifications": 2,
        "work_exp_months": 0
    },
    "academic_scholar": {
        "title": "📚 Academic High Flyer (Needs Industry Prep)",
        "student_name": "Priya Nair",
        "branch": "Electronics & Comm",
        "cgpa": 9.3,
        "internships": 0,
        "projects": 1,
        "dsa_score": 52,
        "aptitude_score": 84,
        "communication_score": 76,
        "backlogs": 0,
        "certifications": 1,
        "work_exp_months": 0
    },
    "comeback_student": {
        "title": "⚠️ Backlog Recovery Profile",
        "student_name": "Rohan Verma",
        "branch": "Mechanical Engineering",
        "cgpa": 6.2,
        "internships": 0,
        "projects": 2,
        "dsa_score": 42,
        "aptitude_score": 55,
        "communication_score": 58,
        "backlogs": 2,
        "certifications": 1,
        "work_exp_months": 0
    },
    "ai_innovator": {
        "title": "🤖 AI / ML Specialist",
        "student_name": "Ananya Iyer",
        "branch": "Artificial Intelligence",
        "cgpa": 8.7,
        "internships": 2,
        "projects": 4,
        "dsa_score": 84,
        "aptitude_score": 82,
        "communication_score": 88,
        "backlogs": 0,
        "certifications": 4,
        "work_exp_months": 3
    }
}

@app.route('/')
def index():
    return render_template('index.html', branches=predictor.branch_list, presets=PRESETS)

@app.route('/api/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json(force=True)
        result = predictor.predict_single(data)
        
        # Save prediction record to database (Neon DB / Local)
        rec_id = save_prediction_record(result, data)
        result['database_record_id'] = rec_id
        
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/what-if', methods=['POST'])
def what_if():
    try:
        data = request.get_json(force=True)
        result = predictor.predict_single(data)
        return jsonify({
            'success': True, 
            'probability': result['probability'],
            'status': result['status'],
            'ctc_range': result['ctc_tier']['range'],
            'ctc_title': result['ctc_tier']['title']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/presets', methods=['GET'])
def get_presets():
    return jsonify({'success': True, 'presets': PRESETS})

@app.route('/api/model-info', methods=['GET'])
def model_info():
    return jsonify({
        'success': True,
        'metrics': predictor.metrics,
        'branches': predictor.branch_list,
        'benchmark': predictor.benchmark
    })

@app.route('/api/history', methods=['GET'])
def history():
    """Returns past prediction records saved in database."""
    records = get_recent_records(limit=20)
    db_info = get_db_info()
    return jsonify({'success': True, 'records': records, 'db_info': db_info})

@app.route('/api/db-status', methods=['GET'])
def db_status():
    """Returns database connection status."""
    return jsonify(get_db_info())

@app.route('/api/set-database', methods=['POST'])
def set_database():
    """Allows configuring Neon DATABASE_URL."""
    try:
        body = request.get_json(force=True)
        db_url = body.get('database_url', '').strip()
        if not db_url:
            return jsonify({'success': False, 'error': 'Database URL cannot be empty'}), 400
        
        # Write to .env
        with open('.env', 'w') as f:
            f.write(f"DATABASE_URL={db_url}\n")
            
        return jsonify({'success': True, 'message': 'DATABASE_URL updated in .env. Server will reload.'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/batch-predict', methods=['POST'])
def batch_predict():
    try:
        if 'file' not in request.files:
            req_json = request.get_json(silent=True)
            if req_json and 'records' in req_json:
                df = pd.DataFrame(req_json['records'])
            else:
                sample_path = 'data/sample_batch.csv'
                if os.path.exists(sample_path):
                    df = pd.read_csv(sample_path)
                else:
                    return jsonify({'success': False, 'error': 'No file uploaded and sample batch not found.'}), 400
        else:
            file = request.files['file']
            if file.filename == '':
                return jsonify({'success': False, 'error': 'Empty filename uploaded.'}), 400
            df = pd.read_csv(file)

        df.columns = [c.strip().lower() for c in df.columns]
        
        if 'cgpa' not in df.columns:
            return jsonify({'success': False, 'error': 'Missing required column: "cgpa" in CSV'}), 400
            
        if 'student_name' not in df.columns:
            df['student_name'] = [f"Student #{i+1}" for i in range(len(df))]
        if 'branch' not in df.columns:
            df['branch'] = 'Computer Science'
        if 'internships' not in df.columns:
            df['internships'] = 0
        if 'projects' not in df.columns:
            df['projects'] = 2
        if 'dsa_score' not in df.columns:
            df['dsa_score'] = 50
        if 'aptitude_score' not in df.columns:
            df['aptitude_score'] = 50
        if 'communication_score' not in df.columns:
            df['communication_score'] = 50
        if 'backlogs' not in df.columns:
            df['backlogs'] = 0
            
        batch_results = predictor.batch_predict(df)
        return jsonify({'success': True, 'data': batch_results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@app.route('/api/download-sample', methods=['GET'])
def download_sample():
    sample_path = os.path.abspath('data/sample_batch.csv')
    if os.path.exists(sample_path):
        return send_file(sample_path, as_attachment=True, download_name='student_placement_sample_batch.csv', mimetype='text/csv')
    return jsonify({'error': 'Sample file not found'}), 404

if __name__ == '__main__':
    print("Serving PlacePredict.AI on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
