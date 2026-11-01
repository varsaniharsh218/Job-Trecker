
<?php
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");

require_once "db.php";

try {
    $stmt = $pdo->query(
        "SELECT id, work_date, work_type, start_time,
                end_time, duration_seconds, created_at
         FROM work_records
         ORDER BY work_date DESC, start_time DESC"
    );

    echo json_encode([
        "success" => true,
        "records" => $stmt->fetchAll()
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Could not load work records."
    ]);
}
