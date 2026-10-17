/**
 * PlacePredict.AI - Interactive Application & Visualization Engine
 */

document.addEventListener('DOMContentLoaded', () => {
    // State Store
    const state = {
        presets: {},
        currentPrediction: null,
        radarChart: null,
        fiChart: null,
        batchDonutChart: null,
        batchBarChart: null,
        currentBatchResults: null,
        modelInfo: null
    };

    // ==========================================
    // 1. Navigation & Theme Management
    // ==========================================
    const navLinks = document.querySelectorAll('.nav-link');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetTab = link.getAttribute('data-tab');
            navLinks.forEach(l => l.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            link.classList.add('active');
            const activePane = document.getElementById(targetTab);
            if (activePane) activePane.classList.add('active');

            // Trigger chart resize if needed
            if (targetTab === 'tab-model' && !state.fiChart) {
                initFeatureImportanceChart();
            }
            if (targetTab === 'tab-database') {
                loadDatabaseRecords();
            }
        });
    });

    // Theme Switcher
    const themeToggleBtn = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('placepredict_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }

    themeToggleBtn.addEventListener('click', () => {
        if (document.body.classList.contains('dark-theme')) {
            document.body.classList.remove('dark-theme');
            document.body.classList.add('light-theme');
            localStorage.setItem('placepredict_theme', 'light');
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
            localStorage.setItem('placepredict_theme', 'dark');
        }
        // Update charts with theme colors
        updateChartsTheme();
    });

    // ==========================================
    // 2. Form Sliders & Counter Controls
    // ==========================================
    const setupSlider = (sliderId, displayId) => {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                display.textContent = e.target.value;
            });
        }
    };

    setupSlider('cgpaInput', 'cgpaVal');
    setupSlider('dsaInput', 'dsaVal');
    setupSlider('aptitudeInput', 'aptitudeVal');
    setupSlider('commInput', 'commVal');

    // Stepper Counters (+ / -)
    document.querySelectorAll('.btn-counter').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.getAttribute('data-action');
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (!input) return;

            let val = parseInt(input.value) || 0;
            const min = parseInt(input.getAttribute('min')) || 0;
            const max = parseInt(input.getAttribute('max')) || 10;

            if (action === 'inc' && val < max) {
                input.value = val + 1;
            } else if (action === 'dec' && val > min) {
                input.value = val - 1;
            }
        });
    });

    // Work Experience Chip Selector
    const workExpChips = document.querySelectorAll('#workExpChips .chip-btn');
    const workExpHidden = document.getElementById('workExpInput');
    workExpChips.forEach(chip => {
        chip.addEventListener('click', () => {
            workExpChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            workExpHidden.value = chip.getAttribute('data-val');
        });
    });

    // Reset Form Button
    const resetBtn = document.getElementById('resetFormBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            loadPreset('cs_topper');
            showToast('Form reset to default profile.');
        });
    }

    // ==========================================
    // 3. Load Presets
    // ==========================================
    const loadPreset = (presetKey) => {
        fetch('/api/presets')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.presets[presetKey]) {
                    const p = data.presets[presetKey];
                    document.getElementById('studentName').value = p.student_name;
                    document.getElementById('branchSelect').value = p.branch;
                    
                    document.getElementById('cgpaInput').value = p.cgpa;
                    document.getElementById('cgpaVal').textContent = p.cgpa;
                    
                    document.getElementById('dsaInput').value = p.dsa_score;
                    document.getElementById('dsaVal').textContent = p.dsa_score;
                    
                    document.getElementById('aptitudeInput').value = p.aptitude_score;
                    document.getElementById('aptitudeVal').textContent = p.aptitude_score;
                    
                    document.getElementById('commInput').value = p.communication_score;
                    document.getElementById('commVal').textContent = p.communication_score;
                    
                    document.getElementById('internshipsInput').value = p.internships;
                    document.getElementById('projectsInput').value = p.projects;
                    document.getElementById('backlogsInput').value = p.backlogs;
                    document.getElementById('certificationsInput').value = p.certifications;
                    
                    // Work exp chip
                    workExpHidden.value = p.work_exp_months;
                    workExpChips.forEach(chip => {
                        const val = parseInt(chip.getAttribute('data-val'));
                        chip.classList.toggle('active', val === p.work_exp_months);
                    });

                    // Highlight preset button
                    document.querySelectorAll('.preset-btn').forEach(b => {
                        b.classList.toggle('active-preset', b.getAttribute('data-preset') === presetKey);
                    });

                    // Auto-run prediction for presets
                    submitPrediction(false);
                }
            })
            .catch(err => console.error('Preset loading error:', err));
    };

    // Attach preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-preset');
            loadPreset(key);
        });
    });

    // ==========================================
    // 4. Submit Single Prediction
    // ==========================================
    const predictionForm = document.getElementById('predictionForm');
    const predictBtn = document.getElementById('predictBtn');

    const getFormData = () => {
        return {
            student_name: document.getElementById('studentName').value.trim() || 'Student Candidate',
            branch: document.getElementById('branchSelect').value,
            cgpa: parseFloat(document.getElementById('cgpaInput').value) || 7.0,
            dsa_score: parseFloat(document.getElementById('dsaInput').value) || 50,
            aptitude_score: parseFloat(document.getElementById('aptitudeInput').value) || 50,
            communication_score: parseFloat(document.getElementById('commInput').value) || 50,
            internships: parseInt(document.getElementById('internshipsInput').value) || 0,
            projects: parseInt(document.getElementById('projectsInput').value) || 2,
            backlogs: parseInt(document.getElementById('backlogsInput').value) || 0,
            certifications: parseInt(document.getElementById('certificationsInput').value) || 1,
            work_exp_months: parseInt(document.getElementById('workExpInput').value) || 0
        };
    };

    const submitPrediction = (showSuccessToast = true) => {
        const payload = getFormData();
        
        // Button loading state
        const btnText = predictBtn.querySelector('.btn-text');
        const spinner = predictBtn.querySelector('.btn-loader-spinner');
        if (btnText && spinner) {
            btnText.textContent = 'Analyzing ML Pipeline...';
            spinner.style.display = 'inline-block';
        }
        predictBtn.disabled = true;

        fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                state.currentPrediction = result.data;
                renderPredictionResults(result.data);
                loadDatabaseRecords();
                loadDbStatus();
                if (showSuccessToast) {
                    showToast(`Prediction generated & saved to database!`);
                }
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        })
        .catch(err => {
            console.error('Prediction API Error:', err);
            showToast('Failed to connect to machine learning server.', 'error');
        })
        .finally(() => {
            if (btnText && spinner) {
                btnText.textContent = 'Generate Placement Prediction';
                spinner.style.display = 'none';
            }
            predictBtn.disabled = false;
        });
    };

    if (predictionForm) {
        predictionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitPrediction(true);
        });
    }

    // ==========================================
    // 5. Render Prediction Results
    // ==========================================
    const renderPredictionResults = (data) => {
        // Heading & Meta
        document.getElementById('resStudentTitle').textContent = `${data.student_name}'s Placement Analysis`;
        document.getElementById('resProb').textContent = `${data.probability}%`;
        document.getElementById('resBranchPill').textContent = data.branch;

        // Gauge Arc Animation
        // Circle circumference for r=50 is 2 * PI * 50 = 314.15
        const maxOffset = 314.15;
        const targetOffset = maxOffset - (maxOffset * (data.probability / 100));
        const gaugeFill = document.getElementById('gaugeFill');
        gaugeFill.style.strokeDashoffset = targetOffset;

        // Color coding based on status
        const statusBadge = document.getElementById('resStatusBadge');
        statusBadge.className = 'badge-status';
        
        if (data.probability >= 75) {
            statusBadge.classList.add('badge-success');
            statusBadge.textContent = 'High Placement Chance';
            gaugeFill.style.stroke = '#10b981';
            document.getElementById('resHeading').textContent = 'Strong Candidate For Campus Placement';
        } else if (data.probability >= 48) {
            statusBadge.classList.add('badge-warning');
            statusBadge.textContent = 'Moderate / In Scope';
            gaugeFill.style.stroke = '#f59e0b';
            document.getElementById('resHeading').textContent = 'Competitive Profile with Growth Areas';
        } else {
            statusBadge.classList.add('badge-danger');
            statusBadge.textContent = 'Placement At Risk';
            gaugeFill.style.stroke = '#ef4444';
            document.getElementById('resHeading').textContent = 'Targeted Intervention Required';
        }

        document.getElementById('resDesc').textContent = data.status_desc;

        // CTC Package Tier
        const ctc = data.ctc_tier;
        document.getElementById('resCtcRange').textContent = ctc.range;
        document.getElementById('resCtcTitle').textContent = ctc.title;
        document.getElementById('resTierTag').textContent = ctc.tag;

        const companiesContainer = document.getElementById('resCompaniesList');
        companiesContainer.innerHTML = '';
        if (ctc.companies && ctc.companies.length) {
            ctc.companies.forEach(comp => {
                const chip = document.createElement('span');
                chip.className = 'company-chip';
                chip.textContent = comp;
                companiesContainer.appendChild(chip);
            });
        }

        // Radar Chart
        renderRadarChart(data.radar_scores);

        // Recommended Roles
        const rolesContainer = document.getElementById('resRolesContainer');
        rolesContainer.innerHTML = '';
        if (data.recommended_roles && data.recommended_roles.length) {
            data.recommended_roles.forEach(role => {
                const card = document.createElement('div');
                card.className = 'role-card';
                card.innerHTML = `
                    <div class="role-header">
                        <span class="role-name">${role.role}</span>
                        <span class="role-match">${role.score}% Match</span>
                    </div>
                    <div class="role-skills">
                        ${role.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
                    </div>
                `;
                rolesContainer.appendChild(card);
            });
        }

        // Feature Drivers (Explainable AI)
        const driversContainer = document.getElementById('resDriversContainer');
        driversContainer.innerHTML = '';
        if (data.feature_drivers && data.feature_drivers.length) {
            data.feature_drivers.forEach(d => {
                const item = document.createElement('div');
                item.className = `driver-item ${d.type}`;
                item.innerHTML = `
                    <div class="driver-top">
                        <span class="driver-name">${d.name} (${d.val})</span>
                        <span class="driver-impact">${d.impact}</span>
                    </div>
                    <span class="driver-desc">${d.desc}</span>
                `;
                driversContainer.appendChild(item);
            });
        }

        // Action Roadmap
        const roadmapContainer = document.getElementById('resRoadmapContainer');
        roadmapContainer.innerHTML = '';
        if (data.action_roadmap && data.action_roadmap.length) {
            data.action_roadmap.forEach(step => {
                const isCritical = step.priority.toLowerCase().includes('critical');
                const card = document.createElement('div');
                card.className = `roadmap-card ${isCritical ? 'priority-critical' : ''}`;
                card.innerHTML = `
                    <div class="roadmap-badge">${step.priority}</div>
                    <div class="roadmap-content">
                        <div class="roadmap-title">${step.title}</div>
                        <div class="roadmap-text">${step.action}</div>
                        <div class="roadmap-gain">Expected Gain: ${step.potential_gain}</div>
                    </div>
                `;
                roadmapContainer.appendChild(card);
            });
        }
    };

    // ==========================================
    // 6. Chart.js Competency Radar
    // ==========================================
    const renderRadarChart = (radarData) => {
        const ctx = document.getElementById('competencyRadarChart');
        if (!ctx) return;

        const isLight = document.body.classList.contains('light-theme');
        const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        const textColor = isLight ? '#475569' : '#94a3b8';

        if (state.radarChart) {
            state.radarChart.destroy();
        }

        state.radarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: radarData.labels,
                datasets: [
                    {
                        label: 'Candidate',
                        data: radarData.student,
                        backgroundColor: 'rgba(99, 102, 241, 0.3)',
                        borderColor: '#6366f1',
                        borderWidth: 2,
                        pointBackgroundColor: '#8b5cf6',
                        pointBorderColor: '#ffffff',
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Placed Benchmark',
                        data: radarData.benchmark,
                        backgroundColor: 'rgba(148, 163, 184, 0.12)',
                        borderColor: '#94a3b8',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointBackgroundColor: '#94a3b8',
                        pointRadius: 3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: {
                            font: { family: 'Plus Jakarta Sans', size: 10, weight: 600 },
                            color: textColor
                        },
                        ticks: { display: false, min: 0, max: 100 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (context) => ` ${context.dataset.label}: ${context.raw}/100`
                        }
                    }
                }
            }
        });
    };

    // ==========================================
    // 7. Real-Time What-If Simulator
    // ==========================================
    const wiCgpa = document.getElementById('wiCgpa');
    const wiDsa = document.getElementById('wiDsa');
    const wiInternships = document.getElementById('wiInternships');
    const wiBacklogs = document.getElementById('wiBacklogs');
    const wiComm = document.getElementById('wiComm');

    let debounceTimer = null;
    const runWhatIfSimulation = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const payload = {
                student_name: 'Simulator Candidate',
                branch: document.getElementById('branchSelect') ? document.getElementById('branchSelect').value : 'Computer Science',
                cgpa: parseFloat(wiCgpa.value),
                dsa_score: parseFloat(wiDsa.value),
                internships: parseInt(wiInternships.value),
                backlogs: parseInt(wiBacklogs.value),
                communication_score: parseFloat(wiComm.value),
                aptitude_score: 75,
                projects: 3,
                certifications: 2,
                work_exp_months: 0
            };

            fetch('/api/what-if', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    const probEl = document.getElementById('wiProbNum');
                    probEl.textContent = `${result.probability}%`;
                    
                    const pillEl = document.getElementById('wiStatusPill');
                    pillEl.textContent = result.status;
                    if (result.probability >= 75) {
                        pillEl.style.background = 'rgba(16, 185, 129, 0.15)';
                        pillEl.style.color = '#10b981';
                    } else if (result.probability >= 48) {
                        pillEl.style.background = 'rgba(245, 158, 11, 0.15)';
                        pillEl.style.color = '#f59e0b';
                    } else {
                        pillEl.style.background = 'rgba(239, 68, 68, 0.15)';
                        pillEl.style.color = '#ef4444';
                    }

                    document.getElementById('wiCtcVal').textContent = result.ctc_range;
                    document.getElementById('wiTierLabel').textContent = result.ctc_title;

                    // Dynamic Tip
                    const tipText = document.getElementById('wiInsightText');
                    if (payload.backlogs > 0) {
                        tipText.textContent = `Clearing your ${payload.backlogs} backlog(s) would immediately remove recruiter cutoffs and add approx +15-20% to your odds.`;
                    } else if (payload.dsa_score >= 85 && payload.cgpa >= 8.2) {
                        tipText.textContent = 'Outstanding stats! You qualify for Super Dream & Tier-1 recruitment brackets (Amazon, Microsoft, Google cohorts).';
                    } else if (payload.internships === 0) {
                        tipText.textContent = 'Adding even 1 internship boosts your profile from theory to practical proof, pushing placement odds higher.';
                    } else {
                        tipText.textContent = 'Consistent profile. Keep practicing system design and coding mock interviews to reach higher compensation tiers.';
                    }
                }
            })
            .catch(err => console.error('What-If error:', err));
        }, 120);
    };

    [wiCgpa, wiDsa, wiInternships, wiBacklogs, wiComm].forEach(slider => {
        if (!slider) return;
        slider.addEventListener('input', (e) => {
            const displayId = slider.id + 'Display';
            const disp = document.getElementById(displayId);
            if (disp) disp.textContent = e.target.value;
            runWhatIfSimulation();
        });
    });

    // ==========================================
    // 8. Batch Placement Analyzer (CSV / Sample)
    // ==========================================
    const uploadZone = document.getElementById('uploadZone');
    const batchFileInput = document.getElementById('batchFileInput');
    const btnRunSampleBatch = document.getElementById('btnRunSampleBatch');
    const btnDownloadTemplate = document.getElementById('btnDownloadTemplate');

    if (uploadZone && batchFileInput) {
        uploadZone.addEventListener('click', () => batchFileInput.click());

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleBatchFileUpload(e.dataTransfer.files[0]);
            }
        });

        batchFileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleBatchFileUpload(e.target.files[0]);
            }
        });
    }

    if (btnRunSampleBatch) {
        btnRunSampleBatch.addEventListener('click', () => {
            showToast('Processing demo cohort of 20 student profiles...');
            fetch('/api/batch-predict', { method: 'POST' })
                .then(res => res.json())
                .then(result => {
                    if (result.success) {
                        renderBatchAnalytics(result.data);
                        showToast('Batch evaluation completed!');
                    } else {
                        showToast(result.error, 'error');
                    }
                })
                .catch(err => {
                    console.error('Batch error:', err);
                    showToast('Failed to evaluate demo batch.', 'error');
                });
        });
    }

    if (btnDownloadTemplate) {
        btnDownloadTemplate.addEventListener('click', () => {
            window.location.href = '/api/download-sample';
        });
    }

    const handleBatchFileUpload = (file) => {
        const formData = new FormData();
        formData.append('file', file);

        showToast(`Uploading ${file.name} for ML batch inference...`);
        fetch('/api/batch-predict', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                renderBatchAnalytics(result.data);
                showToast(`Batch of ${result.data.students.length} students processed!`);
            } else {
                showToast(`Error: ${result.error}`, 'error');
            }
        })
        .catch(err => {
            console.error('Batch upload error:', err);
            showToast('Failed to process batch CSV file.', 'error');
        });
    };

    const renderBatchAnalytics = (batchData) => {
        state.currentBatchResults = batchData;
        document.getElementById('batchResultsContainer').style.display = 'block';

        const summary = batchData.summary;
        document.getElementById('kpiTotal').textContent = summary.total_students;
        document.getElementById('kpiRate').textContent = `${summary.batch_placement_rate}%`;
        document.getElementById('kpiHigh').textContent = summary.high_chance_count;
        document.getElementById('kpiModerate').textContent = summary.moderate_count;
        document.getElementById('kpiAtRisk').textContent = summary.at_risk_count;

        // Render Donut Chart
        renderBatchDonutChart(summary);

        // Render Branch Bar Chart
        renderBatchBranchChart(summary.branch_stats);

        // Render Students Table
        renderBatchTable(batchData.students);

        // Scroll to results
        document.getElementById('batchResultsContainer').scrollIntoView({ behavior: 'smooth' });
    };

    const renderBatchDonutChart = (summary) => {
        const ctx = document.getElementById('batchDoughnutChart');
        if (!ctx) return;

        if (state.batchDonutChart) state.batchDonutChart.destroy();

        state.batchDonutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['High Chance (>=75%)', 'Moderate (48-74%)', 'At Risk (<48%)'],
                datasets: [{
                    data: [summary.high_chance_count, summary.moderate_count, summary.at_risk_count],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: 600 },
                            color: document.body.classList.contains('light-theme') ? '#475569' : '#94a3b8'
                        }
                    }
                },
                cutout: '68%'
            }
        });
    };

    const renderBatchBranchChart = (branchStats) => {
        const ctx = document.getElementById('batchBranchChart');
        if (!ctx) return;

        if (state.batchBarChart) state.batchBarChart.destroy();

        const labels = Object.keys(branchStats);
        const data = labels.map(b => branchStats[b].placed_rate);

        const isLight = document.body.classList.contains('light-theme');
        const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        const textColor = isLight ? '#475569' : '#94a3b8';

        state.batchBarChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Placement Success Rate (%)',
                    data: data,
                    backgroundColor: '#6366f1',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor }
                    },
                    y: {
                        grid: { color: gridColor },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor },
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => ` Success Rate: ${c.raw}%`
                        }
                    }
                }
            }
        });
    };

    const renderBatchTable = (students) => {
        const tbody = document.getElementById('batchTableBody');
        tbody.innerHTML = '';

        students.forEach(st => {
            const tr = document.createElement('tr');
            let badgeClass = 'badge-success';
            if (st.probability < 48) badgeClass = 'badge-danger';
            else if (st.probability < 75) badgeClass = 'badge-warning';

            tr.innerHTML = `
                <td><strong>${st.student_name}</strong></td>
                <td>${st.branch}</td>
                <td>${st.cgpa}</td>
                <td>${st.dsa_score}</td>
                <td>${st.internships}</td>
                <td>${st.backlogs}</td>
                <td><strong>${st.probability}%</strong></td>
                <td><span class="badge-status ${badgeClass}">${st.status}</span></td>
                <td><small>${st.salary_range}</small></td>
            `;
            tbody.appendChild(tr);
        });
    };

    // Export Batch Results to CSV
    const btnExport = document.getElementById('btnExportBatchResults');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (!state.currentBatchResults || !state.currentBatchResults.students.length) {
                showToast('No batch results available to export.', 'warning');
                return;
            }

            const rows = [
                ['Student Name', 'Branch', 'CGPA', 'DSA Score', 'Internships', 'Backlogs', 'Probability (%)', 'Status', 'Salary Range']
            ];

            state.currentBatchResults.students.forEach(st => {
                rows.push([
                    `"${st.student_name}"`,
                    `"${st.branch}"`,
                    st.cgpa,
                    st.dsa_score,
                    st.internships,
                    st.backlogs,
                    st.probability,
                    `"${st.status}"`,
                    `"${st.salary_range}"`
                ]);
            });

            const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', 'placepredict_batch_results.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            showToast('Batch results downloaded as CSV.');
        });
    }

    // ==========================================
    // 9. Model Intelligence Tab
    // ==========================================
    const loadModelInfo = () => {
        fetch('/api/model-info')
            .then(res => res.json())
            .then(result => {
                if (result.success) {
                    state.modelInfo = result;
                    const m = result.metrics;
                    document.getElementById('modelAcc').textContent = `${(m.accuracy * 100).toFixed(1)}%`;
                    document.getElementById('modelPrec').textContent = `${(m.precision * 100).toFixed(1)}%`;
                    document.getElementById('modelRec').textContent = `${(m.recall * 100).toFixed(1)}%`;
                    document.getElementById('modelRoc').textContent = m.roc_auc.toFixed(3);

                    // Hero stats update
                    const hAcc = document.getElementById('heroAcc');
                    const hRoc = document.getElementById('heroRoc');
                    if (hAcc) hAcc.textContent = `${(m.accuracy * 100).toFixed(1)}%`;
                    if (hRoc) hRoc.textContent = m.roc_auc.toFixed(3);

                    initFeatureImportanceChart();
                }
            })
            .catch(err => console.error('Model info error:', err));
    };

    const initFeatureImportanceChart = () => {
        const ctx = document.getElementById('featureImportanceChart');
        if (!ctx || !state.modelInfo) return;

        if (state.fiChart) state.fiChart.destroy();

        const fiData = state.modelInfo.metrics.feature_importances;
        const labels = fiData.map(item => {
            // Clean up name
            return item[0].replace('branch_', 'Branch: ').replace('_', ' ').toUpperCase();
        });
        const values = fiData.map(item => (item[1] * 100).toFixed(1));

        const isLight = document.body.classList.contains('light-theme');
        const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        const textColor = isLight ? '#475569' : '#94a3b8';

        state.fiChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Relative Feature Weight (%)',
                    data: values,
                    backgroundColor: 'rgba(139, 92, 246, 0.85)',
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10 }, color: textColor }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { family: 'Plus Jakarta Sans', size: 10, weight: 600 }, color: textColor }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => ` Importance: ${c.raw}%`
                        }
                    }
                }
            }
        });
    };

    // ==========================================
    // 10. Printable Placement Scorecard Modal
    // ==========================================
    const scorecardModal = document.getElementById('scorecardModal');
    const printScorecardBtn = document.getElementById('printScorecardBtn');
    const closeScorecardBtn = document.getElementById('closeScorecardBtn');
    const triggerPrintBtn = document.getElementById('triggerPrintBtn');

    if (printScorecardBtn) {
        printScorecardBtn.addEventListener('click', () => {
            if (!state.currentPrediction) {
                showToast('Please run a prediction first.', 'warning');
                return;
            }

            const p = state.currentPrediction;
            document.getElementById('scName').textContent = p.student_name;
            document.getElementById('scBranch').textContent = p.branch;
            document.getElementById('scProb').textContent = `${p.probability}% (${p.status})`;
            document.getElementById('scCtc').textContent = `${p.ctc_tier.range} - ${p.ctc_tier.title}`;

            // Competency table
            const tbody = document.getElementById('scTableBody');
            tbody.innerHTML = '';
            
            const params = [
                { name: 'Cumulative GPA (CGPA)', val: `${p.raw_inputs.cgpa} / 10`, status: p.raw_inputs.cgpa >= 7.5 ? 'Strong Academic Benchmark' : 'Average Cutoff' },
                { name: 'DSA & Coding Assessment', val: `${p.raw_inputs.dsa_score} / 100`, status: p.raw_inputs.dsa_score >= 70 ? 'Advanced Competitive Tier' : 'Needs Algorithm Practice' },
                { name: 'Aptitude & Quantitative Logic', val: `${p.raw_inputs.aptitude_score} / 100`, status: p.raw_inputs.aptitude_score >= 65 ? 'Clears Round 1 Cutoff' : 'Target Speed Math' },
                { name: 'Communication & Soft Skills', val: `${p.raw_inputs.communication_score} / 100`, status: p.raw_inputs.communication_score >= 70 ? 'Executive Articulation' : 'Practice Mock GDs' },
                { name: 'Verified Internships', val: `${p.raw_inputs.internships} Internships`, status: p.raw_inputs.internships >= 1 ? 'Industrial Exposure Verified' : 'No Internship Found' },
                { name: 'Academic Backlogs', val: `${p.raw_inputs.backlogs} Backlogs`, status: p.raw_inputs.backlogs === 0 ? 'Clean Record (No Penalty)' : 'Disqualifier for Day-1 Drives' }
            ];

            params.forEach(row => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><strong>${row.name}</strong></td><td>${row.val}</td><td>${row.status}</td>`;
                tbody.appendChild(tr);
            });

            // Roles
            const rolesList = document.getElementById('scRolesList');
            rolesList.innerHTML = p.recommended_roles.map(r => `
                <div style="margin-bottom: 6px; font-size: 0.85rem;">
                    <strong>${r.role}</strong> (${r.score}% Match) • Skills: ${r.skills.join(', ')}
                </div>
            `).join('');

            scorecardModal.classList.add('active');
        });
    }

    if (closeScorecardBtn) {
        closeScorecardBtn.addEventListener('click', () => {
            scorecardModal.classList.remove('active');
        });
    }

    if (triggerPrintBtn) {
        triggerPrintBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // Close on outside modal click
    if (scorecardModal) {
        scorecardModal.addEventListener('click', (e) => {
            if (e.target === scorecardModal) {
                scorecardModal.classList.remove('active');
            }
        });
    }

    // ==========================================
    // 11. Toast Notifications
    // ==========================================
    const showToast = (message, type = 'info') => {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'error') {
            toast.style.borderColor = '#ef4444';
            toast.style.color = '#ef4444';
        } else if (type === 'warning') {
            toast.style.borderColor = '#f59e0b';
            toast.style.color = '#f59e0b';
        }

        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    };

    const updateChartsTheme = () => {
        if (state.radarChart) renderRadarChart(state.currentPrediction ? state.currentPrediction.radar_scores : {
            labels: ['Academic (CGPA)', 'DSA & Coding', 'Aptitude & Logic', 'Projects & Portfolio', 'Soft Skills & Comm'],
            student: [85, 82, 78, 80, 80],
            benchmark: [78, 68, 65, 70, 68]
        });
        if (state.fiChart) initFeatureImportanceChart();
        if (state.batchBarChart && state.currentBatchResults) renderBatchBranchChart(state.currentBatchResults.summary.branch_stats);
    };

    // ==========================================
    // 12. Database Records & Neon Integration
    // ==========================================
    const loadDbStatus = () => {
        fetch('/api/db-status')
            .then(res => res.json())
            .then(status => {
                const headerText = document.getElementById('headerDbText');
                const bannerType = document.getElementById('dbBannerType');
                const bannerBadge = document.getElementById('dbBannerBadge');
                const bannerDesc = document.getElementById('dbBannerDesc');

                if (status.connected) {
                    if (headerText) headerText.textContent = status.is_neon ? 'Neon DB Online' : 'Local DB Online';
                    if (bannerType) bannerType.textContent = `Active Database: ${status.db_type}`;
                    if (bannerBadge) {
                        bannerBadge.textContent = 'Active & Connected';
                        bannerBadge.className = 'badge-status badge-success';
                    }
                    if (bannerDesc) bannerDesc.textContent = status.is_neon 
                        ? 'Connected directly to Neon PostgreSQL Cloud. All evaluations are persisted.'
                        : 'Using high-speed local database. Connect your Neon DATABASE_URL anytime for cloud sync.';
                } else {
                    if (headerText) headerText.textContent = 'DB Offline';
                    if (bannerType) bannerType.textContent = 'Database Disconnected';
                    if (bannerBadge) {
                        bannerBadge.textContent = 'Offline';
                        bannerBadge.className = 'badge-status badge-danger';
                    }
                }
            })
            .catch(err => console.error('DB Status error:', err));
    };

    const loadDatabaseRecords = () => {
        fetch('/api/history')
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    const tbody = document.getElementById('dbTableBody');
                    const countEl = document.getElementById('dbRecordCount');
                    if (countEl) countEl.textContent = res.records.length;
                    if (!tbody) return;

                    tbody.innerHTML = '';
                    if (!res.records.length) {
                        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 20px;">No predictions recorded yet. Run a prediction to see it stored here!</td></tr>`;
                        return;
                    }

                    res.records.forEach(r => {
                        const tr = document.createElement('tr');
                        let badgeClass = 'badge-success';
                        if (r.probability < 48) badgeClass = 'badge-danger';
                        else if (r.probability < 75) badgeClass = 'badge-warning';

                        tr.innerHTML = `
                            <td>#${r.id}</td>
                            <td><strong>${r.student_name}</strong></td>
                            <td>${r.branch}</td>
                            <td>${r.cgpa}</td>
                            <td>${r.dsa_score}</td>
                            <td><strong>${r.probability}%</strong></td>
                            <td><span class="badge-status ${badgeClass}">${r.status}</span></td>
                            <td><small>${r.ctc_range}</small></td>
                            <td><small style="color: var(--primary);">${r.top_role || 'SDE'}</small></td>
                            <td><small style="color: var(--text-muted);">${r.created_at}</small></td>
                        `;
                        tbody.appendChild(tr);
                    });
                }
            })
            .catch(err => console.error('Database fetch error:', err));
    };

    // Neon Modal Management
    const neonModal = document.getElementById('neonModal');
    const btnConfigureNeon = document.getElementById('btnConfigureNeonModal');
    const headerDbStatus = document.getElementById('headerDbStatus');
    const closeNeonBtn = document.getElementById('closeNeonModalBtn');
    const cancelNeonBtn = document.getElementById('cancelNeonBtn');
    const saveNeonBtn = document.getElementById('saveNeonBtn');
    const neonUrlInput = document.getElementById('neonUrlInput');
    const btnRefreshHistory = document.getElementById('btnRefreshHistory');

    if (btnRefreshHistory) {
        btnRefreshHistory.addEventListener('click', () => {
            loadDatabaseRecords();
            loadDbStatus();
            showToast('Database records refreshed!');
        });
    }

    const openNeonModal = () => {
        if (neonModal) neonModal.classList.add('active');
    };
    const closeNeonModal = () => {
        if (neonModal) neonModal.classList.remove('active');
    };

    if (btnConfigureNeon) btnConfigureNeon.addEventListener('click', openNeonModal);
    if (headerDbStatus) headerDbStatus.addEventListener('click', openNeonModal);
    if (closeNeonBtn) closeNeonBtn.addEventListener('click', closeNeonModal);
    if (cancelNeonBtn) cancelNeonBtn.addEventListener('click', closeNeonModal);

    if (saveNeonBtn) {
        saveNeonBtn.addEventListener('click', () => {
            const url = neonUrlInput.value.trim();
            if (!url) {
                showToast('Please enter a valid Neon connection string', 'warning');
                return;
            }

            saveNeonBtn.textContent = 'Connecting...';
            saveNeonBtn.disabled = true;

            fetch('/api/set-database', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ database_url: url })
            })
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    showToast('Neon DATABASE_URL saved! Reloading status...');
                    closeNeonModal();
                    setTimeout(() => {
                        loadDbStatus();
                        loadDatabaseRecords();
                    }, 1200);
                } else {
                    showToast(res.error, 'error');
                }
            })
            .catch(err => {
                console.error('Neon save error:', err);
                showToast('Failed to save Neon connection string', 'error');
            })
            .finally(() => {
                saveNeonBtn.textContent = 'Save & Connect Neon DB';
                saveNeonBtn.disabled = false;
            });
        });
    }

    // ==========================================
    // 13. App Initialization
    // ==========================================
    loadModelInfo();
    loadDbStatus();
    loadDatabaseRecords();
    // Preload top student profile
    loadPreset('cs_topper');
});
