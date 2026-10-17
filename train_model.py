"""
Machine Learning Pipeline for Student Placement Prediction
Trains:
1. Placement Classifier (RandomForest + GradientBoosting Ensemble)
2. Salary Package Tier Classifier
3. Saves models, encoders, feature names, and evaluation metrics.
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix
from sklearn.preprocessing import StandardScaler

def generate_synthetic_data(n_samples=2500, random_state=42):
    np.random.seed(random_state)
    
    branches = ['Computer Science', 'Information Technology', 'Electronics & Comm', 
                'Artificial Intelligence', 'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering']
    branch_weights = [0.28, 0.22, 0.18, 0.12, 0.08, 0.07, 0.05]
    
    branch = np.random.choice(branches, size=n_samples, p=branch_weights)
    
    # CGPA typically normally distributed around 7.4, bounded [5.0, 10.0]
    cgpa = np.clip(np.random.normal(7.4, 1.1, size=n_samples), 5.0, 10.0)
    cgpa = np.round(cgpa, 2)
    
    # Internships: 0 to 4
    # Tech branches tend to do slightly more internships
    is_tech = np.isin(branch, ['Computer Science', 'Information Technology', 'Artificial Intelligence'])
    internship_lambda = np.where(is_tech, 1.3, 0.8)
    internships = np.clip(np.random.poisson(internship_lambda), 0, 4)
    
    # Projects: 1 to 8
    project_lambda = np.where(is_tech, 3.8, 2.5)
    projects = np.clip(np.random.poisson(project_lambda), 0, 8)
    
    # DSA / Coding Score (0 to 100)
    dsa_mean = np.where(is_tech, 68, 48) + (cgpa - 7.0) * 8
    dsa_score = np.clip(np.random.normal(dsa_mean, 14), 10, 100).astype(int)
    
    # Aptitude Score (0 to 100)
    aptitude_mean = 55 + (cgpa - 7.0) * 10
    aptitude_score = np.clip(np.random.normal(aptitude_mean, 12), 15, 100).astype(int)
    
    # Communication / Soft Skills (0 to 100)
    comm_score = np.clip(np.random.normal(65, 15), 20, 100).astype(int)
    
    # Backlogs (0 to 5) - inversely correlated with CGPA
    backlog_prob = np.clip((8.5 - cgpa) * 0.18, 0.02, 0.75)
    backlogs = np.where(np.random.rand(n_samples) < backlog_prob, 
                        np.random.choice([1, 2, 3, 4], size=n_samples, p=[0.55, 0.25, 0.15, 0.05]), 0)
    
    # Certifications (0 to 5)
    certifications = np.clip(np.random.poisson(1.4), 0, 5)
    
    # Work Experience / Part-time / Freelance in months (0 to 24)
    work_exp_months = np.where(np.random.rand(n_samples) < 0.35, 
                               np.random.choice([3, 6, 9, 12, 18], size=n_samples, p=[0.4, 0.3, 0.15, 0.1, 0.05]), 0)
    
    # Target 1: Placement Logic (Ground Truth with realistic noise)
    # Weighted latent placement score
    latent_score = (
        (cgpa - 5.0) * 8.5 +
        internships * 7.5 +
        projects * 3.5 +
        (dsa_score / 100.0) * 25.0 +
        (aptitude_score / 100.0) * 18.0 +
        (comm_score / 100.0) * 14.0 +
        certifications * 2.5 +
        (work_exp_months / 12.0) * 5.0 -
        backlogs * 12.0 +
        np.where(is_tech, 5.0, 0.0)
    )
    
    # Add random noise
    latent_score += np.random.normal(0, 5.5, size=n_samples)
    
    # Hard cutoff or penalty if severe backlogs
    latent_score = np.where(backlogs >= 3, latent_score - 18, latent_score)
    
    # Threshold for placement (typical placement rate ~ 70-75%)
    placed_prob = 1.0 / (1.0 + np.exp(-(latent_score - 52.0) / 10.0))
    placed = (np.random.rand(n_samples) < placed_prob).astype(int)
    
    # Target 2: Salary Package Tier (CTC in LPA) for Placed students
    # Tiers:
    # 0: Tier 3 (3.5 - 5.5 LPA) - Mass Recruiters
    # 1: Tier 2 (6.0 - 9.5 LPA) - Mid-scale Tech / Core
    # 2: Tier 1 (10.0 - 17.5 LPA) - Product / High Tech
    # 3: Super Dream (18.0 - 35.0+ LPA) - Top Tier MNCs / Unicorns
    ctc_tier = np.zeros(n_samples, dtype=int)
    for i in range(n_samples):
        if placed[i] == 0:
            ctc_tier[i] = 0 # Baseline
        else:
            s = latent_score[i]
            if s >= 85 and dsa_score[i] >= 80 and cgpa[i] >= 8.0:
                ctc_tier[i] = 3 # Super Dream
            elif s >= 72 and dsa_score[i] >= 65:
                ctc_tier[i] = 2 # Tier 1
            elif s >= 58:
                ctc_tier[i] = 1 # Tier 2
            else:
                ctc_tier[i] = 0 # Tier 3
                
    df = pd.DataFrame({
        'cgpa': cgpa,
        'internships': internships,
        'projects': projects,
        'dsa_score': dsa_score,
        'aptitude_score': aptitude_score,
        'communication_score': comm_score,
        'backlogs': backlogs,
        'certifications': certifications,
        'work_exp_months': work_exp_months,
        'branch': branch,
        'placed': placed,
        'ctc_tier': ctc_tier
    })
    
    return df

def train_and_save_pipeline():
    print("Generating dataset...")
    df = generate_synthetic_data(n_samples=3000, random_state=42)
    
    os.makedirs('models', exist_ok=True)
    os.makedirs('data', exist_ok=True)
    df.to_csv('data/student_placement_data.csv', index=False)
    print(f"Dataset generated with {len(df)} records. Placement rate: {df['placed'].mean()*100:.1f}%")
    
    # Features
    feature_cols = ['cgpa', 'internships', 'projects', 'dsa_score', 'aptitude_score', 
                    'communication_score', 'backlogs', 'certifications', 'work_exp_months']
    
    # Branch one-hot encoding
    branch_dummies = pd.get_dummies(df['branch'], prefix='branch', dtype=float)
    X = pd.concat([df[feature_cols], branch_dummies], axis=1)
    y_placed = df['placed']
    y_ctc = df['ctc_tier']
    
    all_feature_names = list(X.columns)
    
    X_train, X_test, y_train, y_test, y_ctc_train, y_ctc_test = train_test_split(
        X, y_placed, y_ctc, test_size=0.2, random_state=42, stratify=y_placed
    )
    
    # 1. Placement Classifier: Random Forest
    rf_clf = RandomForestClassifier(
        n_estimators=150, max_depth=10, min_samples_split=4, random_state=42, n_jobs=-1
    )
    rf_clf.fit(X_train, y_train)
    
    # Placement Classifier: Gradient Boosting for ensemble
    gb_clf = GradientBoostingClassifier(
        n_estimators=100, learning_rate=0.08, max_depth=4, random_state=42
    )
    gb_clf.fit(X_train, y_train)
    
    # 2. CTC Tier Classifier (Trained on placed subset or all)
    ctc_model = RandomForestClassifier(
        n_estimators=120, max_depth=8, random_state=42, n_jobs=-1
    )
    ctc_model.fit(X_train[y_train == 1], y_ctc_train[y_train == 1])
    
    # Evaluation
    # Weighted ensemble prediction
    rf_preds_prob = rf_clf.predict_proba(X_test)[:, 1]
    gb_preds_prob = gb_clf.predict_proba(X_test)[:, 1]
    ensemble_prob = 0.55 * rf_preds_prob + 0.45 * gb_preds_prob
    y_pred = (ensemble_prob >= 0.5).astype(int)
    
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    roc_auc = roc_auc_score(y_test, ensemble_prob)
    cm = confusion_matrix(y_test, y_pred).tolist()
    
    # Feature Importances (from RF)
    importances = dict(zip(all_feature_names, rf_clf.feature_importances_))
    # Sort descending
    sorted_importances = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    
    print(f"Model Results:\n - Accuracy: {acc*100:.2f}%\n - Precision: {prec*100:.2f}%\n - Recall: {rec*100:.2f}%\n - ROC-AUC: {roc_auc:.4f}")
    
    model_payload = {
        'rf_clf': rf_clf,
        'gb_clf': gb_clf,
        'ctc_model': ctc_model,
        'feature_cols': feature_cols,
        'branch_list': sorted(df['branch'].unique().tolist()),
        'all_feature_names': all_feature_names,
        'metrics': {
            'accuracy': round(acc, 4),
            'precision': round(prec, 4),
            'recall': round(rec, 4),
            'f1_score': round(f1, 4),
            'roc_auc': round(roc_auc, 4),
            'confusion_matrix': cm,
            'total_samples': len(df),
            'feature_importances': sorted_importances[:10]
        }
    }
    
    joblib.dump(model_payload, 'models/placement_model.joblib')
    print("Saved pipeline model to models/placement_model.joblib")

if __name__ == '__main__':
    train_and_save_pipeline()
