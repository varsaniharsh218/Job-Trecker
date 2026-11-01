
<?php
header("Content-Type: application/json; charset=UTF-8");

require_once "db.php";

try {
    $stmt = $pdo->query("SELECT DATABASE() AS db_name");
    $result = $stmt->fetch();

    echo json_encode([
        "success" => true,
        "message" => "Job Tracker database connected!",
        "database" => $result["db_name"]
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Database query failed."
    ]);
}
