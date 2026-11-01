
"use strict";

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "jobTimerRecordsV1";
const ACTIVE_KEY = "jobTimerActiveV1";
const MAX_REGULAR_MS = 11 * 60 * 60 * 1000;
const API_BASE = "api/";

let records = [];
let active = loadActive();
let tickHandle = null;
let alarmContext = null;
let isSaving = false;

function loadActive() {
  try {
    const value = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "null");
    if (!value || !["regular", "overtime"].includes(value.mode)) return null;
    if (!Number.isFinite(value.startMs) || !Number.isFinite(value.durationMs)) return null;
    if (value.durationMs <= 0) return null;
    return value;
  } catch {
    return null;
  }
}

function saveActive() {
  if (active) {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatHours(ms) {
  const minutes = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function dateKey(value) {
  const d = new Date(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function toSqlDateTime(milliseconds) {
  const d = new Date(milliseconds);
  const pad = (n) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fromServerRecord(r) {
  const startMs = new Date(r.start_time.replace(" ", "T")).getTime();
  const endMs = new Date(r.end_time.replace(" ", "T")).getTime();

  return {
    id: String(r.id),
    mode: r.work_type,
    startMs,
    endMs,
    durationMs: Number(r.duration_seconds) * 1000,
    stopReason: "saved"
  };
}

async function loadRecordsFromServer() {
  try {
    const response = await fetch(API_BASE + "get_records.php", {
      cache: "no-store"
    });

    const result = await response.json();

    if (!response.ok || !result.success || !Array.isArray(result.records)) {
      throw new Error("Could not load records.");
    }

    records = result.records.map(fromServerRecord)
      .filter((r) =>
        ["regular", "overtime"].includes(r.mode) &&
        Number.isFinite(r.startMs) &&
        Number.isFinite(r.endMs) &&
        Number.isFinite(r.durationMs)
      );

    renderAll();
  } catch (error) {
    console.error(error);
    $("timerStatus").textContent =
      "Could not load database records. Check your connection.";
  }
}

async function saveRecordToServer(record) {
  const durationSeconds = Math.floor(record.durationMs / 1000);

  const response = await fetch(API_BASE + "save_record.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      work_date: dateKey(record.startMs),
      work_type: record.mode,
      start_time: toSqlDateTime(record.startMs),
      end_time: toSqlDateTime(record.endMs),
      duration_seconds: durationSeconds
    })
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Could not save record.");
  }

  return result;
}

function updateDate() {
  $("todayDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getElapsed(now = Date.now()) {
  if (!active) return 0;
  return Math.min(Math.max(0, now - active.startMs), active.durationMs);
}

function getTodayTotals() {
  const today = dateKey(Date.now());
  const totals = { regular: 0, overtime: 0 };

  for (const record of records) {
    if (dateKey(record.startMs) !== today) continue;
    totals[record.mode] += record.durationMs;
  }

  if (active && dateKey(active.startMs) === today) {
    totals[active.mode] += getElapsed();
  }

  return totals;
}

function renderStats() {
  const totals = getTodayTotals();
  $("todayRegular").textContent = formatHours(totals.regular);
  $("todayOvertime").textContent = formatHours(totals.overtime);
  $("todayTotal").textContent = formatHours(totals.regular + totals.overtime);
}

function renderTimer() {
  if (active) {
    const elapsed = getElapsed();

    $("timerMode").textContent =
      active.mode === "regular" ? "Regular Work" : "Overtime Work";

    $("timerDisplay").textContent = formatDuration(elapsed);

    $("timerStatus").textContent =
      active.mode === "overtime"
        ? `Overtime • Ends at ${formatTime(active.startMs + active.durationMs)}`
        : `Working • Started ${formatTime(active.startMs)}`;

    $("timerStatus").classList.add("running");
    $("startBtn").disabled = true;
    $("stopBtn").disabled = false;
    $("workMode").disabled = true;
    $("overtimeHours").disabled = true;
  } else {
    $("timerMode").textContent =
      $("workMode").value === "regular" ? "Regular Work" : "Overtime Work";

    $("timerDisplay").textContent = "00:00:00";
    $("timerStatus").classList.remove("running");
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("workMode").disabled = false;
    $("overtimeHours").disabled = false;
  }

  renderStats();
}

function renderHistory() {
  const filter = $("reportType").value;
  const now = new Date();

  const startOfWeek = new Date(now);
  const weekday = (now.getDay() + 6) % 7;
  startOfWeek.setDate(now.getDate() - weekday);
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let visible = [...records].sort((a, b) => b.startMs - a.startMs);

  if (filter === "week") {
    visible = visible.filter((r) => r.startMs >= startOfWeek.getTime());
  } else if (filter === "month") {
    visible = visible.filter((r) => r.startMs >= startOfMonth.getTime());
  }

  const totals = visible.reduce((sum, r) => {
    sum[r.mode] += r.durationMs;
    return sum;
  }, { regular: 0, overtime: 0 });

  if (active) {
    const inRange =
      filter === "all" ||
      (filter === "week" && active.startMs >= startOfWeek.getTime()) ||
      (filter === "month" && active.startMs >= startOfMonth.getTime());

    if (inRange) totals[active.mode] += getElapsed();
  }

  $("reportSummary").innerHTML = `
    <div><strong>Regular:</strong> ${formatHours(totals.regular)}</div>
    <div><strong>Overtime:</strong> ${formatHours(totals.overtime)}</div>
    <div><strong>Total:</strong> ${formatHours(totals.regular + totals.overtime)}</div>
  `;

  if (visible.length === 0) {
    $("historyList").innerHTML =
      '<div class="empty-state">No completed work records for this period yet.</div>';
    return;
  }

  $("historyList").innerHTML = visible.map((r) => `
    <article class="history-item">
      <h3>${escapeHTML(formatDate(r.startMs))}</h3>
      <p>${r.mode === "overtime"
        ? '<span class="overtime-label">OVERTIME</span>'
        : "Regular Work"}</p>
      <p>Start: ${escapeHTML(formatTime(r.startMs))} ·
         Stop: ${escapeHTML(formatTime(r.endMs))}</p>
      <p>Total: <strong>${escapeHTML(formatHours(r.durationMs))}</strong></p>
    </article>
  `).join("");
}

function renderAll() {
  updateDate();
  renderTimer();
  renderHistory();
}

function playAlarm() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    alarmContext = new AudioContextClass();

    alarmContext.resume().then(() => {
      const start = alarmContext.currentTime;

      for (let i = 0; i < 6; i++) {
        const oscillator = alarmContext.createOscillator();
        const gain = alarmContext.createGain();
        const time = start + i * 0.45;

        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.exponentialRampToValueAtTime(0.18, time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25);

        oscillator.connect(gain);
        gain.connect(alarmContext.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.27);
      }
    }).catch(() => {});
  } catch (error) {
    console.warn("Audio alarm unavailable", error);
  }
}

function showNotice(message) {
  $("timerStatus").textContent = message;
  $("timerStatus").classList.remove("running");
}

async function stopTimer(reason = "manual") {
  if (!active || isSaving) return;

  isSaving = true;
  const session = active;
  const endMs = Math.min(Date.now(), session.startMs + session.durationMs);
  const durationMs = Math.max(0, endMs - session.startMs);

  if (durationMs <= 0) {
    active = null;
    saveActive();
    isSaving = false;
    renderAll();
    return;
  }

  const record = {
    mode: session.mode,
    startMs: session.startMs,
    endMs,
    durationMs,
    stopReason: reason
  };

  $("stopBtn").disabled = true;
  showNotice("Saving work record...");

  try {
    await saveRecordToServer(record);
    records.push(record);

    active = null;
    saveActive();

    if (tickHandle !== null) {
      clearInterval(tickHandle);
      tickHandle = null;
    }

    renderAll();

    if (reason === "auto") {
      showNotice("Time completed! Work timer stopped and saved.");
      playAlarm();
    } else {
      showNotice("Work stopped and saved to database.");
    }
  } catch (error) {
    console.error(error);
    showNotice("Could not save record. Please try Stop again.");
    $("stopBtn").disabled = false;
  } finally {
    isSaving = false;
  }
}

function startTimer() {
  if (active) return;

  const mode = $("workMode").value;
  let durationMs = MAX_REGULAR_MS;

  if (mode === "overtime") {
    const hours = Number($("overtimeHours").value);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
      alert("Enter an overtime duration greater than 0 and up to 24 hours.");
      return;
    }

    durationMs = Math.round(hours * 60 * 60 * 1000);
  }

  active = { mode, startMs: Date.now(), durationMs };

  saveActive();
  renderAll();
  runTick();
  tickHandle = setInterval(runTick, 1000);
}

function runTick() {
  if (!active) return;

  if (Date.now() >= active.startMs + active.durationMs) {
    void stopTimer("auto");
    return;
  }

  renderTimer();
}

function exportCSV() {
  const rows = [
    ["Date", "Type", "Start Time", "Stop Time", "Total Hours", "Stop Reason"]
  ];

  for (const r of [...records].sort((a, b) => a.startMs - b.startMs)) {
    rows.push([
      dateKey(r.startMs),
      r.mode === "overtime" ? "Overtime" : "Regular",
      formatTime(r.startMs),
      formatTime(r.endMs),
      (r.durationMs / 3600000).toFixed(2),
      r.stopReason || "saved"
    ]);
  }

  const csv = rows.map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `job-report-${dateKey(Date.now())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

$("workMode").addEventListener("change", () => {
  $("overtimeSettings").hidden = $("workMode").value !== "overtime";
  renderTimer();
});

$("startBtn").addEventListener("click", startTimer);
$("stopBtn").addEventListener("click", () => void stopTimer("manual"));
$("reportType").addEventListener("change", renderHistory);
$("exportBtn").addEventListener("click", exportCSV);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    runTick();
    renderHistory();
  }
});

$("overtimeSettings").hidden = $("workMode").value !== "overtime";

if (active) {
  if (Date.now() >= active.startMs + active.durationMs) {
    void stopTimer("auto");
  } else {
    tickHandle = setInterval(runTick, 1000);
  }
}

renderAll();
void loadRecordsFromServer();
