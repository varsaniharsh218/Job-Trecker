
<?php
header("Content-Type: application/json; charset=UTF-8");
header("Cache-Control: no-store");

require_once "db.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "message" => "POST method required."
    ]);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);

if (!is_array($data)) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid JSON."
    ]);
    exit;
}

$date = $data["work_date"] ?? "";
$type = $data["work_type"] ?? "";
$start = $data["start_time"] ?? "";
$end = $data["end_time"] ?? "";
$duration = $data["duration_seconds"] ?? null;

$dateObj = DateTime::createFromFormat("!Y-m-d", $date);
$startObj = DateTime::createFromFormat("!Y-m-d H:i:s", $start);
$endObj = DateTime::createFromFormat("!Y-m-d H:i:s", $end);

if (
    !$dateObj || $dateObj->format("Y-m-d") !== $date ||
    !in_array($type, ["regular", "overtime"], true) ||
    !$startObj || $startObj->format("Y-m-d H:i:s") !== $start ||
    !$endObj || $endObj->format("Y-m-d H:i:s") !== $end ||
    $endObj <= $startObj ||
    !is_int($duration) || $duration < 1 ||
    $duration > 86400 ||
    $endObj->diff($startObj)->days !== 0 ||
    $date !== $startObj->format("Y-m-d") ||
    $duration !== ($endObj->getTimestamp() - $startObj->getTimestamp())
) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid work record."
    ]);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "INSERT INTO work_records
        (work_date, work_type, start_time, end_time, duration_seconds)
        VALUES (?, ?, ?, ?, ?)"
    );

    $stmt->execute([
        $date,
        $type,
        $start,
        $end,
        $duration
    ]);

    echo json_encode([
        "success" => true,
        "message" => "Work record saved.",
        "id" => $pdo->lastInsertId()
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        "success" => false,
        "message" => "Could not save work record."
    ]);
}
