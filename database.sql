USE job_timer;

CREATE TABLE IF NOT EXISTS work_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    work_date DATE NOT NULL,
    work_type ENUM('regular', 'overtime') NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);