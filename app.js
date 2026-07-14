const STORAGE_KEY = "ujianku_state_v2";

const emptyState = {
  school: { name: "", year: "" },
  accounts: [
    {
      id: "admin_default",
      role: "admin",
      username: "admin",
      password: "admin123",
      name: "Admin Sekolah"
    }
  ],
  teachers: [],
  students: [],
  teacher: {
    name: "",
    nip: "",
    email: "",
    phone: "",
    subject: "",
    classes: "",
    verified: false
  },
  student: {
    name: "",
    nisn: "",
    className: "",
    email: ""
  },
  exams: [],
  results: [],
  violations: [],
  activeSession: null
};

let state = loadState();
let currentQuestion = 0;
let timerId = null;
let currentRole = "";
let currentUser = null;

const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const views = document.querySelectorAll(".view");
const viewButtons = document.querySelectorAll("[data-view]");
const navItems = document.querySelectorAll(".nav-item");

const teacherProfileForm = document.getElementById("teacher-profile-form");
const studentProfileForm = document.getElementById("student-profile-form");
const schoolForm = document.getElementById("school-form");
const adminTeacherForm = document.getElementById("admin-teacher-form");
const adminStudentForm = document.getElementById("admin-student-form");
const examForm = document.getElementById("exam-form");
const questionForm = document.getElementById("question-form");

const questionMap = document.getElementById("question-map");
const questionNumber = document.getElementById("question-number");
const questionText = document.getElementById("question-text");
const optionsList = document.getElementById("options-list");
const saveStateLabel = document.getElementById("save-state");
const timer = document.getElementById("timer");
const violationCount = document.getElementById("violation-count");
const examLog = document.getElementById("exam-log");
const resultModal = document.getElementById("result-modal");

function loadState() {
  try {
    return migrateState({ ...structuredClone(emptyState), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") });
  } catch {
    return migrateState(structuredClone(emptyState));
  }
}

function migrateState(nextState) {
  nextState.accounts ||= structuredClone(emptyState.accounts);
  nextState.teachers ||= [];
  nextState.students ||= [];
  if (!nextState.accounts.some((account) => account.username === "admin")) {
    nextState.accounts.unshift(structuredClone(emptyState.accounts[0]));
  }
  nextState.exams = (nextState.exams || []).map((exam) => ({
    ...exam,
    questions: exam.questions || [],
    pdf: exam.pdf || null
  }));
  return cleanupInvalidImportedData(nextState);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const rest = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

function getActiveExam() {
  return state.exams.find((exam) => exam.id === state.activeSession?.examId) || null;
}

function getCurrentTeacher() {
  return state.teachers.find((teacher) => teacher.accountId === currentUser?.id) || null;
}

function getCurrentStudent() {
  return state.students.find((student) => student.accountId === currentUser?.id) || null;
}

function getAvailableExams() {
  const student = getCurrentStudent();
  const studentClass = (student?.className || "").trim().toLowerCase();
  return state.exams.filter((exam) => {
    const hasQuestions = exam.questions.length > 0;
    if (!studentClass) return hasQuestions;
    return hasQuestions && exam.className.trim().toLowerCase() === studentClass;
  });
}

function defaultViewForRole(role) {
  return {
    admin: "admin",
    teacher: "teacher",
    student: "student"
  }[role] || "student";
}

function canOpenView(name) {
  if (!currentRole) return false;
  if (name === "exam") return currentRole === "student";
  return name === defaultViewForRole(currentRole);
}

function showLogin() {
  currentRole = "";
  currentUser = null;
  window.clearInterval(timerId);
  document.body.classList.add("logged-out");
  document.body.classList.remove("logged-in");
  loginScreen.classList.add("active");
  loginScreen.style.display = "";
  loginScreen.hidden = false;
  appShell.classList.add("hidden");
  appShell.classList.add("boot-hidden");
  appShell.style.display = "none";
  appShell.hidden = true;
  document.body.classList.remove("exam-mode");
}

function showApp(role) {
  currentRole = role;
  document.body.classList.add("logged-in");
  document.body.classList.remove("logged-out");
  loginScreen.classList.remove("active");
  loginScreen.style.display = "none";
  loginScreen.hidden = true;
  appShell.classList.remove("hidden");
  appShell.classList.remove("boot-hidden");
  appShell.style.display = "";
  appShell.hidden = false;
  updateRoleNavigation();
  showView(defaultViewForRole(role));
}

function updateRoleNavigation() {
  navItems.forEach((item) => {
    const roles = item.dataset.roles.split(",");
    item.hidden = !roles.includes(currentRole);
  });
}

function showView(name) {
  if (!canOpenView(name)) {
    name = defaultViewForRole(currentRole);
  }
  views.forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  document.body.classList.toggle("exam-mode", name === "exam");
  if (name === "exam") renderExamRoom();
}

function fillForm(form, values) {
  Array.from(form.elements).forEach((element) => {
    if (!element.name) return;
    element.value = values[element.name] || "";
  });
}

function statusForExam(exam) {
  const now = Date.now();
  const startsAt = new Date(exam.startsAt).getTime();
  const endsAt = new Date(exam.endsAt).getTime();
  if (now < startsAt) return ["Terjadwal", "scheduled"];
  if (now > endsAt) return ["Selesai", "done"];
  return ["Aktif", "live"];
}

function renderAll() {
  document.getElementById("today-label").textContent = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date());

  document.getElementById("school-name-label").textContent = state.school.name || "Belum diatur";
  document.getElementById("login-school-label").textContent = state.school.name || "Sistem ujian sekolah";
  renderSidebarUser();

  fillForm(teacherProfileForm, getCurrentTeacher() || {});
  fillForm(studentProfileForm, getCurrentStudent() || {});
  fillForm(schoolForm, state.school);
  renderTeacher();
  renderStudent();
  renderAdmin();
  renderQuestionExamOptions();
  renderExamRoom();
}

function renderSidebarUser() {
  const nameTarget = document.getElementById("sidebar-user-name");
  const metaTarget = document.getElementById("sidebar-user-meta");
  if (currentRole === "admin") {
    nameTarget.textContent = currentUser?.name || "Admin Sekolah";
    metaTarget.textContent = state.school.name || "Kelola sistem";
    return;
  }
  if (currentRole === "teacher") {
    const teacher = getCurrentTeacher();
    nameTarget.textContent = teacher?.name || "Akun guru";
    metaTarget.textContent = teacher?.subject ? `${teacher.subject} • ${teacher.classes}` : "Data dari admin";
    return;
  }
  if (currentRole === "student") {
    const student = getCurrentStudent();
    nameTarget.textContent = student?.name || "Akun murid";
    metaTarget.textContent = student?.className ? `Kelas ${student.className}` : "Data dari admin";
    return;
  }
  nameTarget.textContent = "Belum masuk";
  metaTarget.textContent = "Pilih role login";
}

function renderTeacher() {
  const teacher = getCurrentTeacher();
  const teacherExams = state.exams.filter((exam) => !teacher || !exam.teacherAccountId || exam.teacherAccountId === teacher.accountId);
  const completedResults = state.results.filter((result) => typeof result.score === "number");
  const average = completedResults.length
    ? Math.round(completedResults.reduce((sum, result) => sum + result.score, 0) / completedResults.length)
    : 0;

  document.getElementById("teacher-status-label").textContent = "Dibuat admin";
  document.getElementById("teacher-status-label").className = "status live";
  document.getElementById("metric-exams").textContent = String(teacherExams.length);
  document.getElementById("metric-exams-note").textContent = teacherExams.length ? "Ujian tersimpan" : "Belum ada ujian";
  document.getElementById("metric-participants").textContent = String(state.students.length);
  document.getElementById("metric-participants-note").textContent = state.students.length ? "Murid dari admin" : "Admin belum menambah murid";
  document.getElementById("metric-average").textContent = String(average);
  document.getElementById("metric-average-note").textContent = completedResults.length ? `${completedResults.length} hasil masuk` : "Belum ada hasil";
  document.getElementById("metric-violations").textContent = String(state.violations.length);
  document.getElementById("metric-violations-note").textContent = state.violations.length ? "Terekam otomatis" : "Belum ada log";

  const table = document.getElementById("teacher-exams-table");
  table.innerHTML = "";
  if (!teacherExams.length) {
    table.append(emptyTableRow("Belum ada ujian. Buat ujian lalu unggah file soal untuk dibaca menjadi pilihan ganda.", 6));
  } else {
    teacherExams.forEach((exam) => {
      const [label, className] = statusForExam(exam);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${escapeHtml(exam.title)}</td>
        <td>${escapeHtml(exam.className)}</td>
        <td>${formatDateTime(exam.startsAt)} - ${formatDateTime(exam.endsAt)}</td>
        <td>${exam.questions.length ? `${exam.questions.length} soal` : "Belum terbaca"}</td>
        <td>${state.results.filter((result) => result.examId === exam.id).length}</td>
        <td><span class="status ${className}">${label}</span></td>
      `;
      table.append(row);
    });
  }

  renderActivityList(
    document.getElementById("teacher-violations"),
    state.violations.slice().reverse().map((item) => ({
      title: findStudentName(item.studentAccountId),
      text: `${item.text} • ${findExamTitle(item.examId)}`,
      meta: formatDateTime(item.createdAt)
    })),
    "Belum ada pelanggaran."
  );

  renderTeacherResults(teacherExams.map((exam) => exam.id));
}

function renderStudent() {
  const student = getCurrentStudent();
  const available = getAvailableExams();
  const latest = state.results.filter((result) => result.studentAccountId === currentUser?.id).at(-1);

  document.getElementById("student-class-label").textContent = student?.className
    ? `Murid • Kelas ${student.className}`
    : "Murid";
  document.getElementById("student-profile-label").textContent = student
    ? `${student.name} • ${student.nisn || "-"}`
    : "Data murid belum ada";
  document.getElementById("next-exam-title").textContent = available[0]?.title || "Belum ada ujian tersedia";
  document.getElementById("next-exam-token").textContent = available[0]?.token || "-";
  document.getElementById("student-latest-score").textContent = latest
    ? (typeof latest.score === "number" ? String(latest.score) : "-")
    : "0";
  document.getElementById("student-latest-note").textContent = latest
    ? (typeof latest.score === "number" ? findExamTitle(latest.examId) : "Menunggu penilaian")
    : "Belum ada hasil";
  document.getElementById("student-history-count").textContent = String(state.results.filter((result) => result.studentAccountId === currentUser?.id).length);
  document.getElementById("student-available-count").textContent = String(available.length);

  const list = document.getElementById("student-exam-list");
  list.innerHTML = "";
  if (!available.length) {
    list.append(emptyBlock("Belum ada ujian untuk kelas murid ini. Admin perlu menambah murid, guru membuat ujian, lalu guru mengunggah file soal."));
    return;
  }

  available.forEach((exam) => {
    const article = document.createElement("article");
    const button = document.createElement("button");
    button.className = "primary-button";
    button.type = "button";
    button.textContent = "Mulai";
    button.addEventListener("click", () => startExam(exam.id));

    const info = document.createElement("div");
    info.innerHTML = `
      <strong>${escapeHtml(exam.title)}</strong>
      <span>${escapeHtml(exam.subject)} • ${escapeHtml(exam.className)} • ${exam.questions.length} soal • ${exam.duration} menit</span>
    `;
    article.append(info, button);
    list.append(article);
  });
}

function renderAdmin() {
  state = cleanupInvalidImportedData(state);
  saveState();

  const teachersTable = document.getElementById("admin-teachers-table");
  const studentsTable = document.getElementById("admin-students-table");
  teachersTable.innerHTML = "";
  studentsTable.innerHTML = "";

  const teachers = state.teachers
    .filter((teacher) => isValidImportedTeacher({ ...teacher, username: findAccount(teacher.accountId)?.username, password: findAccount(teacher.accountId)?.password }))
    .map((teacher) => [teacher.name, findAccount(teacher.accountId)?.username || "-", `${teacher.subject} • ${teacher.classes}`]);

  const students = state.students
    .filter((student) => isValidImportedStudent({ ...student, username: findAccount(student.accountId)?.username, password: findAccount(student.accountId)?.password }))
    .map((student) => [student.name, findAccount(student.accountId)?.username || "-", student.className]);

  document.getElementById("teacher-count").textContent = `${teachers.length} akun`;
  document.getElementById("student-count").textContent = `${students.length} akun`;

  if (!teachers.length) {
    teachersTable.append(emptyTableRow("Belum ada akun guru.", 3));
  }
  if (!students.length) {
    studentsTable.append(emptyTableRow("Belum ada akun murid.", 3));
  }

  teachers.forEach(([name, username, meta]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(name)}</td><td>${escapeHtml(username)}</td><td>${escapeHtml(meta)}</td>`;
    teachersTable.append(row);
  });

  students.forEach(([name, username, meta]) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${escapeHtml(name)}</td><td>${escapeHtml(username)}</td><td>${escapeHtml(meta)}</td>`;
    studentsTable.append(row);
  });
}

function renderQuestionExamOptions() {
  const select = questionForm.elements.examId;
  const fileInput = questionForm.elements.pdfFile;
  const submitButton = questionForm.querySelector("button[type='submit']");
  select.innerHTML = "";
  const teacher = getCurrentTeacher();
  const teacherExams = state.exams.filter((exam) => !teacher || !exam.teacherAccountId || exam.teacherAccountId === teacher.accountId);

  if (!teacherExams.length) {
    const option = new Option("Otomatis buat ujian dari file soal", "", true, true);
    select.append(option);
    select.disabled = false;
    fileInput.disabled = false;
    submitButton.disabled = false;
    return;
  }

  select.disabled = false;
  fileInput.disabled = false;
  submitButton.disabled = false;
  teacherExams.forEach((exam) => {
    select.append(new Option(`${exam.title} (${exam.className})`, exam.id));
  });
}

function createDraftExamFromPdf(file) {
  const teacher = getCurrentTeacher();
  if (!teacher) return null;
  const id = makeId("exam");
  const now = new Date();
  const endsAt = new Date(now.getTime() + 60 * 60 * 1000);
  const title = file.name.replace(/\.(pdf|txt|csv)$/i, "").replace(/[_-]+/g, " ").trim() || "Ujian Soal";
  const className = (teacher.classes || "").split(",")[0].trim() || "-";
  const exam = {
    id,
    title,
    subject: teacher.subject || "Umum",
    className,
    duration: 60,
    startsAt: now.toISOString().slice(0, 16),
    endsAt: endsAt.toISOString().slice(0, 16),
    violationLimit: 3,
    teacherAccountId: teacher.accountId,
    token: id.slice(-6).toUpperCase(),
    questions: [],
    pdf: null,
    createdAt: new Date().toISOString()
  };
  state.exams.push(exam);
  return exam;
}

function startExam(examId) {
  const exam = state.exams.find((item) => item.id === examId);
  if (!exam || !exam.questions.length) return;
  state.activeSession = {
    id: makeId("session"),
    examId,
    answers: {},
    remainingSeconds: exam.duration * 60,
    violations: 0,
    startedAt: new Date().toISOString(),
    submitted: false
  };
  currentQuestion = 0;
  saveState();
  showView("exam");
  startTimer();
}

function renderExamRoom() {
  const exam = getActiveExam();
  const session = state.activeSession;

  if (!exam || !session) {
    document.getElementById("exam-meta").textContent = "Pilih ujian dari dashboard murid";
    document.getElementById("exam-heading").textContent = "Ruang Ujian";
    questionText.textContent = "Belum ada ujian yang dipilih.";
    questionNumber.textContent = "";
    questionMap.innerHTML = "";
    optionsList.innerHTML = "";
    examLog.innerHTML = "";
    timer.textContent = "00:00";
    violationCount.textContent = "Pelanggaran 0/0";
    saveStateLabel.textContent = "Belum mulai";
    return;
  }

  document.getElementById("exam-meta").textContent = `${exam.subject} • ${exam.className} • Token ${exam.token}`;
  document.getElementById("exam-heading").textContent = exam.title;
  timer.textContent = formatTime(session.remainingSeconds);
  saveStateLabel.textContent = session.submitted ? "Sudah dikumpulkan" : "Tersimpan";
  violationCount.textContent = `Pelanggaran ${session.violations}/${exam.violationLimit}`;

  const question = exam.questions[currentQuestion] || exam.questions[0];
  questionMap.innerHTML = "";
  exam.questions.forEach((_, index) => {
    const button = document.createElement("button");
    button.className = "question-dot";
    button.type = "button";
    button.textContent = String(index + 1);
    button.classList.toggle("active", index === currentQuestion);
    button.classList.toggle("answered", session.answers[index] !== undefined);
    button.addEventListener("click", () => {
      currentQuestion = index;
      renderExamRoom();
    });
    questionMap.append(button);
  });
  questionNumber.textContent = `Soal ${currentQuestion + 1} dari ${exam.questions.length}`;
  questionText.textContent = question.text;
  optionsList.innerHTML = "";
  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option-row";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = String(index);
    input.checked = session.answers[currentQuestion] === index;
    input.disabled = session.submitted;
    input.addEventListener("change", () => {
      session.answers[currentQuestion] = index;
      saveStateLabel.textContent = "Menyimpan...";
      saveState();
      window.setTimeout(() => {
        saveStateLabel.textContent = "Tersimpan";
        renderExamRoom();
      }, 250);
    });
    const span = document.createElement("span");
    span.textContent = `${String.fromCharCode(65 + index)}. ${option}`;
    label.append(input, span);
    optionsList.append(label);
  });

  renderActivityList(
    examLog,
    state.violations
      .filter((item) => item.sessionId === session.id)
      .slice()
      .reverse()
      .map((item) => ({ title: item.text, text: findStudentName(item.studentAccountId), meta: formatDateTime(item.createdAt) })),
    "Belum ada pelanggaran."
  );
}

function startTimer() {
  window.clearInterval(timerId);
  timerId = window.setInterval(() => {
    const session = state.activeSession;
    if (!session || session.submitted) return;
    session.remainingSeconds -= 1;
    if (session.remainingSeconds <= 0) {
      session.remainingSeconds = 0;
      submitExam();
    }
    saveState();
    renderExamRoom();
  }, 1000);
}

function addViolation(text) {
  const exam = getActiveExam();
  const session = state.activeSession;
  if (!exam || !session || session.submitted || !document.body.classList.contains("exam-mode")) return;

  session.violations += 1;
  state.violations.push({
    id: makeId("violation"),
    examId: exam.id,
    sessionId: session.id,
    studentAccountId: currentUser?.id,
    text,
    createdAt: new Date().toISOString()
  });
  saveState();
  renderAll();
  if (session.violations >= exam.violationLimit) submitExam();
}

function submitExam() {
  const exam = getActiveExam();
  const session = state.activeSession;
  if (!exam || !session || session.submitted) return;

  session.submitted = true;
  let correct = 0;
  exam.questions.forEach((question, index) => {
    if (session.answers[index] === question.answer) correct += 1;
  });
  const wrong = exam.questions.length - correct;
  const score = exam.questions.length ? Math.round((correct / exam.questions.length) * 100) : 0;
  const questionReview = exam.questions.map((question, index) => {
    const studentAnswer = session.answers[index];
    return {
      number: index + 1,
      question: question.text,
      options: question.options,
      studentAnswer,
      correctAnswer: question.answer,
      isCorrect: studentAnswer === question.answer
    };
  });
  state.results.push({
    id: makeId("result"),
    examId: exam.id,
    sessionId: session.id,
    studentAccountId: currentUser?.id,
    studentName: getCurrentStudent()?.name || "",
    answers: { ...session.answers },
    questionReview,
    totalQuestions: exam.questions.length,
    correct,
    wrong,
    score,
    submittedAt: new Date().toISOString()
  });
  saveState();

  document.getElementById("correct-count").textContent = String(correct);
  document.getElementById("wrong-count").textContent = String(wrong);
  document.getElementById("score-count").textContent = String(score);
  document.getElementById("pass-state").textContent = score >= 75 ? "Lulus" : "Belum lulus";
  resultModal.classList.add("active");
  renderAll();
}

function findExamTitle(id) {
  return state.exams.find((exam) => exam.id === id)?.title || "Ujian sudah dihapus";
}

function findAccount(id) {
  return state.accounts.find((account) => account.id === id) || null;
}

function findStudentName(accountId) {
  return state.students.find((student) => student.accountId === accountId)?.name || "Murid";
}

function answerLetter(value) {
  return Number.isInteger(Number(value)) ? String.fromCharCode(65 + Number(value)) : "-";
}

function getResultReview(result) {
  if (Array.isArray(result.questionReview) && result.questionReview.length) {
    return result.questionReview;
  }
  const exam = state.exams.find((item) => item.id === result.examId);
  const storedAnswers = result.answers
    || (state.activeSession?.id === result.sessionId ? state.activeSession.answers : null);
  if (!exam || !exam.questions?.length || !storedAnswers) return [];
  return exam.questions.map((question, index) => {
    const studentAnswer = storedAnswers[index] ?? storedAnswers[String(index)];
    return {
      number: index + 1,
      question: question.text,
      options: question.options,
      studentAnswer,
      correctAnswer: question.answer,
      isCorrect: studentAnswer === question.answer
    };
  });
}

function renderTeacherResults(teacherExamIds) {
  const container = document.getElementById("teacher-results");
  const allowedExamIds = new Set(teacherExamIds);
  const results = state.results
    .filter((result) => !allowedExamIds.size || allowedExamIds.has(result.examId))
    .slice()
    .reverse();

  container.innerHTML = "";
  if (!results.length) {
    container.append(emptyBlock("Belum ada hasil ujian."));
    return;
  }

  results.forEach((result) => {
    const review = getResultReview(result);
    const details = document.createElement("details");
    details.className = "result-detail";
    const correct = typeof result.correct === "number" ? result.correct : review.filter((item) => item.isCorrect).length;
    const total = result.totalQuestions || review.length || correct + (result.wrong || 0);
    const scoreText = typeof result.score === "number" ? `Nilai ${result.score}` : "Menunggu penilaian";
    const rowsHtml = review.map((item) => {
      const studentLetter = answerLetter(item.studentAnswer);
      const correctLetter = answerLetter(item.correctAnswer);
      const studentOption = Number.isInteger(Number(item.studentAnswer)) ? item.options?.[Number(item.studentAnswer)] : "Tidak dijawab";
      const correctOption = Number.isInteger(Number(item.correctAnswer)) ? item.options?.[Number(item.correctAnswer)] : "-";
      return `
        <tr>
          <td>${item.number}</td>
          <td>
            <strong>${escapeHtml(item.question)}</strong>
            <small>Kunci: ${escapeHtml(correctLetter)}. ${escapeHtml(correctOption || "-")}</small>
          </td>
          <td>
            <strong>Jawaban murid: ${escapeHtml(studentLetter)}</strong>
            <small>${escapeHtml(studentOption || "Tidak dijawab")}</small>
          </td>
          <td><span class="status ${item.isCorrect ? "live" : "done"}">${item.isCorrect ? "Benar" : "Salah"}</span></td>
        </tr>
      `;
    }).join("");

    details.innerHTML = `
      <summary>
        <span>
          <strong>${escapeHtml(findStudentName(result.studentAccountId))}</strong>
          <small>${escapeHtml(findExamTitle(result.examId))} • ${formatDateTime(result.submittedAt)}</small>
        </span>
        <span class="result-score">
          <strong>${escapeHtml(scoreText)}</strong>
          <small>${correct}/${total || 0} benar</small>
        </span>
      </summary>
      ${review.length ? `
        <div class="result-answer-wrap">
          <table class="answer-table">
            <thead>
              <tr>
                <th>No</th>
                <th>Soal dan Kunci</th>
                <th>Jawaban Murid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      ` : `
        <div class="result-empty-note">Detail jawaban belum tersedia untuk hasil ini karena dibuat sebelum fitur simpan jawaban aktif dan sesi jawabannya sudah tidak tersimpan. Mulai ujian berikutnya, guru bisa melihat nomor 1 murid memilih A/B/C/D beserta teks jawabannya.</div>
      `}
    `;
    container.append(details);
  });
}

function getPrintableAccounts(kind) {
  const teacherRows = state.teachers
    .map((teacher) => ({ profile: teacher, account: findAccount(teacher.accountId) }))
    .filter((item) => item.account && isValidImportedTeacher({ ...item.profile, username: item.account.username, password: item.account.password }))
    .map((item) => ({
      role: "Guru",
      name: item.profile.name,
      username: item.account.username,
      password: item.account.password,
      metaLabel: "Mapel/Kelas",
      meta: `${item.profile.subject} - ${item.profile.classes}`
    }));

  const studentRows = state.students
    .map((student) => ({ profile: student, account: findAccount(student.accountId) }))
    .filter((item) => item.account && isValidImportedStudent({ ...item.profile, username: item.account.username, password: item.account.password }))
    .map((item) => ({
      role: "Murid",
      name: item.profile.name,
      username: item.account.username,
      password: item.account.password,
      metaLabel: "Kelas",
      meta: item.profile.className
    }));

  if (kind === "teacher") return teacherRows;
  if (kind === "student") return studentRows;
  return [...teacherRows, ...studentRows];
}

function printAccountPdf(kind) {
  const rows = getPrintableAccounts(kind);
  if (!rows.length) {
    alert("Belum ada akun untuk dicetak.");
    return;
  }

  const title = kind === "teacher" ? "Daftar Akun Guru" : kind === "student" ? "Daftar Akun Murid" : "Daftar Akun Guru dan Murid";
  const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" }).format(new Date());
  const schoolName = state.school.name || "Sekolah";
  const schoolYear = state.school.year || "-";
  const rowsHtml = rows.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(row.role)}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><strong>${escapeHtml(row.username)}</strong></td>
      <td><strong>${escapeHtml(row.password)}</strong></td>
      <td>${escapeHtml(row.meta)}</td>
    </tr>
  `).join("");

  const printWindow = window.open("", "_blank", "width=1100,height=800");
  if (!printWindow) {
    alert("Popup cetak diblokir browser. Izinkan popup untuk mencetak PDF.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(title)} - ${escapeHtml(schoolName)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          html {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            margin: 0;
            color: #1e2733;
            font-family: Arial, sans-serif;
            font-size: 11px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            gap: 18px;
            align-items: flex-start;
            padding-bottom: 14px;
            border-bottom: 3px solid #156c71;
            margin-bottom: 16px;
          }
          .brand { display: flex; gap: 12px; align-items: center; }
          .mark {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            background: #e5a33f;
            display: grid;
            place-items: center;
            font-weight: 800;
            font-size: 18px;
          }
          h1 { margin: 0; font-size: 22px; }
          .meta, .note { color: #647282; }
          .summary {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 14px;
          }
          .summary div {
            border: 1px solid #dce4ed;
            border-radius: 8px;
            padding: 9px;
          }
          .summary strong { display: block; font-size: 16px; margin-top: 3px; }
          table {
            width: 100%;
            border-collapse: collapse;
            page-break-inside: auto;
          }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th {
            background: #156c71;
            color: white;
            text-align: left;
            padding: 8px 7px;
            font-size: 10px;
          }
          td {
            border-bottom: 1px solid #dce4ed;
            padding: 7px;
            vertical-align: top;
          }
          tbody tr:nth-child(even) td { background: #f5f7fb; }
          .footer {
            margin-top: 14px;
            padding-top: 10px;
            border-top: 1px solid #dce4ed;
            display: flex;
            justify-content: space-between;
            gap: 12px;
          }
        </style>
      </head>
      <body>
        <header class="header">
          <div class="brand">
            <div class="mark">UK</div>
            <div>
              <h1>${escapeHtml(title)}</h1>
              <div class="meta">${escapeHtml(schoolName)} - Tahun Ajaran ${escapeHtml(schoolYear)}</div>
            </div>
          </div>
          <div class="meta">Dicetak: ${escapeHtml(printedAt)}</div>
        </header>
        <section class="summary">
          <div>Total Akun<strong>${rows.length}</strong></div>
          <div>Guru<strong>${rows.filter((row) => row.role === "Guru").length}</strong></div>
          <div>Murid<strong>${rows.filter((row) => row.role === "Murid").length}</strong></div>
        </section>
        <table>
          <thead>
            <tr>
              <th style="width: 34px;">No</th>
              <th style="width: 58px;">Role</th>
              <th>Nama</th>
              <th style="width: 120px;">Username</th>
              <th style="width: 120px;">Password</th>
              <th>Mapel/Kelas</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <footer class="footer">
          <span class="note">Bagikan kredensial hanya kepada pemilik akun terkait.</span>
          <span class="note">UjianKu</span>
        </footer>
        <script>
          window.addEventListener("load", () => {
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function getCurrentCardData(role) {
  if (!currentUser || currentUser.role !== role) return null;
  const account = findAccount(currentUser.id);
  if (role === "teacher") {
    const teacher = getCurrentTeacher();
    if (!teacher || !account) return null;
    return {
      roleLabel: "Kartu Guru",
      badge: "GURU",
      name: teacher.name,
      username: account.username,
      password: account.password,
      primaryLabel: "Mata Pelajaran",
      primaryValue: teacher.subject || "-",
      secondaryLabel: "Kelas Ajar",
      secondaryValue: teacher.classes || "-",
      idLabel: "NIP",
      idValue: teacher.nip || "-",
      contactLabel: "Kontak",
      contactValue: teacher.phone || teacher.email || "-"
    };
  }

  const student = getCurrentStudent();
  if (!student || !account) return null;
  return {
    roleLabel: "Kartu Murid",
    badge: "MURID",
    name: student.name,
    username: account.username,
    password: account.password,
    primaryLabel: "Kelas",
    primaryValue: student.className || "-",
    secondaryLabel: "NISN",
    secondaryValue: student.nisn || "-",
    idLabel: "Email",
    idValue: student.email || "-",
    contactLabel: "Akses",
    contactValue: "UjianKu"
  };
}

function printProfileCard(role) {
  const card = getCurrentCardData(role);
  if (!card) {
    alert(role === "teacher" ? "Data guru belum lengkap untuk dicetak." : "Data murid belum lengkap untuk dicetak.");
    return;
  }

  const schoolName = state.school.name || "Sekolah";
  const schoolYear = state.school.year || "-";
  const printedAt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date());
  const theme = role === "teacher"
    ? {
      primary: "#0f766e",
      primaryDark: "#0b4f4a",
      accent: "#f59e0b",
      accentSoft: "rgba(245, 158, 11, 0.22)",
      pop: "#ef4444",
      panel: "#ecfeff"
    }
    : {
      primary: "#4338ca",
      primaryDark: "#312e81",
      accent: "#f97316",
      accentSoft: "rgba(249, 115, 22, 0.22)",
      pop: "#14b8a6",
      panel: "#eef2ff"
    };
  const printWindow = window.open("", "_blank", "width=920,height=720");
  if (!printWindow) {
    alert("Popup cetak diblokir browser. Izinkan popup untuk mencetak kartu.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="id">
      <head>
        <meta charset="utf-8">
        <title>${escapeHtml(card.roleLabel)} - ${escapeHtml(card.name)}</title>
        <style>
          @page { size: 94mm 62mm; margin: 2mm; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            color: #1e2733;
            font-family: Arial, sans-serif;
            background: #f3f6fa;
          }
          .sheet {
            width: 100%;
            display: grid;
            gap: 14px;
            justify-items: center;
            padding: 16px;
          }
          .card {
            --primary: ${theme.primary};
            --primary-dark: ${theme.primaryDark};
            --accent: ${theme.accent};
            --accent-soft: ${theme.accentSoft};
            --pop: ${theme.pop};
            --panel: ${theme.panel};
            width: 90mm;
            height: 56mm;
            position: relative;
            overflow: hidden;
            border-radius: 16px;
            border: 1px solid #dbe5ee;
            background:
              linear-gradient(90deg, var(--primary) 0 22mm, transparent 22mm),
              linear-gradient(180deg, #ffffff 0 100%);
            box-shadow: 0 14px 28px rgba(30, 39, 51, 0.12);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .card::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 22mm;
            background: var(--primary);
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .card::after {
            content: "";
            position: absolute;
            right: 0;
            top: 0;
            width: 68mm;
            height: 100%;
            background:
              linear-gradient(180deg, var(--panel) 0 13mm, #ffffff 13mm 100%);
          }
          .content {
            position: relative;
            z-index: 1;
            padding: 5mm 5mm 4.5mm 5.5mm;
            display: grid;
            grid-template-columns: 14mm 1fr;
            gap: 5mm;
            height: 56mm;
          }
          .brand-rail {
            color: white;
            display: grid;
            align-content: space-between;
            justify-items: center;
            height: 46mm;
            padding: 2mm 0 1mm;
          }
          .mark {
            width: 12mm;
            height: 12mm;
            border-radius: 8px;
            display: grid;
            place-items: center;
            background: var(--accent);
            color: #1e2733;
            font-weight: 900;
            font-size: 11px;
            box-shadow: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .vertical {
            writing-mode: vertical-rl;
            transform: rotate(180deg);
            letter-spacing: 1.5px;
            font-weight: 800;
            font-size: 7.5px;
          }
          .details {
            position: relative;
            display: grid;
            grid-template-rows: auto auto auto auto 1fr;
            gap: 3px;
            align-content: start;
            padding: 2mm 2mm 1.5mm 1mm;
          }
          .details::before {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            top: 0;
            height: 1.2mm;
            border-radius: 999px;
            background: var(--accent);
          }
          .topline {
            display: flex;
            justify-content: space-between;
            gap: 6px;
            align-items: center;
            padding-top: 2mm;
          }
          .school {
            font-size: 7.5px;
            color: #647282;
            font-weight: 700;
            text-transform: uppercase;
          }
          .badge {
            background: var(--accent);
            color: #ffffff;
            border-radius: 999px;
            padding: 3px 6px;
            font-size: 7.2px;
            font-weight: 900;
            letter-spacing: 0.8px;
            box-shadow: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          h1 {
            margin: 0;
            font-size: 13.5px;
            line-height: 1.05;
            color: #1e2733;
          }
          .role {
            color: var(--primary);
            font-size: 8.8px;
            font-weight: 800;
          }
          .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            margin-top: 2px;
          }
          .info {
            border: 1px solid #dce4ed;
            border-radius: 7px;
            background: #ffffff;
            padding: 4px 5px;
            min-height: 15mm;
            box-shadow: none;
            border-left: 2px solid var(--accent);
          }
          .info span,
          .credential span {
            display: block;
            color: #647282;
            font-size: 6.2px;
            font-weight: 800;
            text-transform: uppercase;
          }
          .info strong {
            display: block;
            margin-top: 1px;
            font-size: 8.5px;
            line-height: 1.1;
          }
          .credential {
            margin-top: 2px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px;
            border-radius: 8px;
            background: var(--primary);
            color: white;
            padding: 5px;
            box-shadow: none;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .credential span {
            color: rgba(255, 255, 255, 0.72);
          }
          .credential strong {
            display: block;
            margin-top: 2px;
            font-size: 10.5px;
            letter-spacing: 0.4px;
          }
          .foot {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            align-self: end;
            margin-top: 0;
            color: #647282;
            font-size: 6.5px;
          }
          .hint {
            width: 90mm;
            color: #647282;
            font-size: 11px;
            text-align: center;
          }
          @media print {
            body {
              min-height: auto;
              background: white;
            }
            .sheet {
              padding: 0;
            }
            .card {
              border: 0.4mm solid var(--primary);
              box-shadow: none;
              break-inside: avoid;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .credential,
            .badge,
            .mark,
            .card::before,
            .card::after {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .hint { display: none; }
          }
        </style>
      </head>
      <body>
        <main class="sheet">
          <article class="card">
            <div class="content">
              <aside class="brand-rail">
                <div class="mark">UK</div>
                <div class="vertical">UJIAN KU</div>
              </aside>
              <section class="details">
                <div class="topline">
                  <div>
                    <div class="school">${escapeHtml(schoolName)}</div>
                    <div class="role">${escapeHtml(card.roleLabel)}</div>
                  </div>
                  <div class="badge">${escapeHtml(card.badge)}</div>
                </div>
                <div>
                  <h1>${escapeHtml(card.name)}</h1>
                </div>
                <div class="info-grid">
                  <div class="info">
                    <span>${escapeHtml(card.primaryLabel)}</span>
                    <strong>${escapeHtml(card.primaryValue)}</strong>
                  </div>
                  <div class="info">
                    <span>${escapeHtml(card.secondaryLabel)}</span>
                    <strong>${escapeHtml(card.secondaryValue)}</strong>
                  </div>
                  <div class="info">
                    <span>${escapeHtml(card.idLabel)}</span>
                    <strong>${escapeHtml(card.idValue)}</strong>
                  </div>
                  <div class="info">
                    <span>${escapeHtml(card.contactLabel)}</span>
                    <strong>${escapeHtml(card.contactValue)}</strong>
                  </div>
                </div>
                <div class="credential">
                  <div>
                    <span>Username</span>
                    <strong>${escapeHtml(card.username)}</strong>
                  </div>
                  <div>
                    <span>Password</span>
                    <strong>${escapeHtml(card.password)}</strong>
                  </div>
                </div>
                <div class="foot">
                  <span>Tahun Ajaran ${escapeHtml(schoolYear)}</span>
                  <span>Dicetak ${escapeHtml(printedAt)}</span>
                </div>
              </section>
            </div>
          </article>
          <p class="hint">Pilih Print atau Save as PDF. Jika warna tidak muncul, aktifkan Background graphics di dialog print.</p>
        </main>
        <script>
          window.addEventListener("load", () => {
            window.print();
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function findAccountByLogin(username, password) {
  return state.accounts.find((account) => (
    account.username.trim().toLowerCase() === username.trim().toLowerCase()
    && account.password === password
  )) || null;
}

function usernameExists(username) {
  return state.accounts.some((account) => account.username.trim().toLowerCase() === username.trim().toLowerCase());
}

function extractAnswerKeyMap(text) {
  const keyMatch = text.match(/(?:^|\n)\s*(?:KUNCI\s+JAWABAN|KUNCI|ANSWER\s+KEY)\b[\s\S]*$/i);
  const keyText = keyMatch ? keyMatch[0] : "";
  const answers = {};
  keyText.replace(/(?:^|\n|,|;)\s*(\d{1,3})\s*[\).:\-]?\s*(?:jawaban\s*[:\-]\s*)?([A-D])\b/gi, (_, number, answer) => {
    answers[number] = answer.toUpperCase();
    return "";
  });
  return answers;
}

function parseQuestionsFromPdfText(rawText) {
  const text = rawText
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
  const answerKey = extractAnswerKeyMap(text);
  const questionText = text.replace(/(?:^|\n)\s*(?:KUNCI\s+JAWABAN|ANSWER\s+KEY)\b[\s\S]*$/i, "");
  const blocks = questionText
    .split(/\n(?=\s*\d+[\).]\s+)/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const numberMatch = block.match(/^\s*(\d+)[\).]/);
    const answerMatch = block.match(/KUNCI\s*[:\-]\s*([A-D])/i);
    const a = block.match(/\bA[\).]\s*([\s\S]*?)(?=\n\s*B[\).])/i);
    const b = block.match(/\bB[\).]\s*([\s\S]*?)(?=\n\s*C[\).])/i);
    const c = block.match(/\bC[\).]\s*([\s\S]*?)(?=\n\s*D[\).])/i);
    const d = block.match(/\bD[\).]\s*([\s\S]*?)(?=\n\s*KUNCI|\n\s*PEMBAHASAN|$)/i);
    const questionMatch = block.match(/^\s*\d+[\).]\s*([\s\S]*?)(?=\n\s*A[\).])/i);
    const answer = answerMatch ? answerMatch[1].toUpperCase() : answerKey[numberMatch?.[1]];
    if (!answer || !a || !b || !c || !d || !questionMatch) return null;

    return {
      id: makeId("question"),
      text: questionMatch[1].trim(),
      options: [a[1], b[1], c[1], d[1]].map((value) => value.trim()),
      answer: "ABCD".indexOf(answer)
    };
  }).filter(Boolean);
}

function isSupportedQuestionFile(file) {
  if (!file) return false;
  const name = file.name.toLowerCase();
  return file.type === "application/pdf"
    || name.endsWith(".pdf")
    || file.type.startsWith("text/")
    || name.endsWith(".txt")
    || name.endsWith(".csv");
}

function normalizePdfText(rawText) {
  return rawText
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseDelimitedRows(rawText, expectedColumns) {
  return normalizePdfText(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(role\s+)?nama\s*[|,;\t ]/i.test(line) && !/^role\s*[|,;\t ]/i.test(line))
    .map((line) => {
      const separator = line.includes("|") ? "|" : line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
      return line.split(separator).map((part) => part.trim());
    })
    .filter((parts) => parts.length >= expectedColumns);
}

function parseTeachersFromPdfText(rawText) {
  const rows = parseDelimitedRows(rawText, 4);
  const delimitedTeachers = rows.map((parts) => {
    const hasRole = /^guru$/i.test(parts[0]);
    if (hasRole) {
      return {
        name: parts[1],
        username: parts[2],
        password: parts[2],
        nip: "-",
        email: `${parts[2]}@local`,
        phone: "-",
        subject: parts[3],
        classes: parts.slice(4).join(", ") || "-"
      };
    }
    return {
      name: parts[0],
      username: parts[1],
      password: parts[2],
      nip: parts[3],
      email: parts[4],
      phone: parts[5],
      subject: parts[6],
      classes: parts.slice(7).join(", ")
    };
  }).filter(isValidImportedTeacher);

  if (delimitedTeachers.length) return delimitedTeachers;

  const cells = extractCleanCells(rawText);
  const headerIndex = findHeaderIndex(cells, ["No.", "Nama", "Username", "Password", "NIP", "Email", "Telepon", "Mapel", "Kelas"]);
  if (headerIndex < 0) return [];
  const dataCells = cells.slice(headerIndex + 9);
  const teachers = [];
  for (let index = 0; index + 8 < dataCells.length; index += 9) {
    if (!/^\d+$/.test(dataCells[index])) {
      index -= 8;
      continue;
    }
    teachers.push({
      name: dataCells[index + 1],
      username: dataCells[index + 2],
      password: dataCells[index + 3],
      nip: dataCells[index + 4],
      email: dataCells[index + 5],
      phone: dataCells[index + 6],
      subject: dataCells[index + 7],
      classes: dataCells[index + 8]
    });
  }
  return teachers.filter(isValidImportedTeacher);
}

function parseStudentsFromPdfText(rawText) {
  const rows = parseDelimitedRows(rawText, 4);
  const delimitedStudents = rows.map((parts) => {
    const hasRole = /^mur(id|it)$/i.test(parts[0]);
    if (hasRole) {
      return {
        name: parts[1],
        username: parts[2],
        password: parts[2],
        nisn: "-",
        className: parts[3],
        email: `${parts[2]}@local`
      };
    }
    return {
      name: parts[0],
      username: parts[1],
      password: parts[2],
      nisn: parts[3],
      className: parts[4],
      email: parts.slice(5).join(", ")
    };
  }).filter(isValidImportedStudent);

  if (delimitedStudents.length) return delimitedStudents;

  const cells = extractCleanCells(rawText);
  const headerIndex = findHeaderIndex(cells, ["No.", "Nama", "Username", "Password", "NISN", "Kelas", "Email"]);
  if (headerIndex < 0) return [];
  const dataCells = cells.slice(headerIndex + 7);
  const students = [];
  for (let index = 0; index + 6 < dataCells.length; index += 7) {
    if (!/^\d+$/.test(dataCells[index])) {
      index -= 6;
      continue;
    }
    students.push({
      name: dataCells[index + 1],
      username: dataCells[index + 2],
      password: dataCells[index + 3],
      nisn: dataCells[index + 4],
      className: dataCells[index + 5],
      email: dataCells[index + 6]
    });
  }
  return students.filter(isValidImportedStudent);
}

function extractCleanCells(rawText) {
  return normalizePdfText(rawText)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => (
      line
      && !/^data\s+\d+/i.test(line)
      && !/^format:/i.test(line)
      && !/^DATA\s+/i.test(line)
    ));
}

function findHeaderIndex(cells, header) {
  for (let index = 0; index <= cells.length - header.length; index += 1) {
    const slice = cells.slice(index, index + header.length);
    if (slice.every((value, offset) => value.toLowerCase() === header[offset].toLowerCase())) {
      return index;
    }
  }
  return -1;
}

function hasTooMuchNoise(value) {
  const text = String(value || "");
  if (text.length > 90) return true;
  const symbols = (text.match(/[^a-zA-Z0-9@\s._,'/-]/g) || []).length;
  return text.length > 0 && symbols / text.length > 0.18;
}

function isValidUsername(value) {
  return /^[a-z0-9._-]{3,32}$/i.test(String(value || ""));
}

function isValidPersonName(value) {
  return /^[a-zA-ZÀ-ÿ\s'.-]{3,70}$/.test(String(value || "")) && !hasTooMuchNoise(value);
}

function isValidClassName(value) {
  const text = String(value || "").trim();
  return text.length >= 1 && text.length <= 40 && !hasTooMuchNoise(text);
}

function isValidPassword(value) {
  return String(value || "").length >= 3 && String(value || "").length <= 40 && !/\s/.test(String(value || ""));
}

function isValidImportedTeacher(teacher) {
  return Boolean(
    teacher
    && isValidPersonName(teacher.name)
    && isValidUsername(teacher.username)
    && isValidPassword(teacher.password)
    && !hasTooMuchNoise(teacher.nip)
    && !hasTooMuchNoise(teacher.email)
    && !hasTooMuchNoise(teacher.phone)
    && !hasTooMuchNoise(teacher.subject)
    && !hasTooMuchNoise(teacher.classes)
  );
}

function isValidImportedStudent(student) {
  return Boolean(
    student
    && isValidPersonName(student.name)
    && isValidUsername(student.username)
    && isValidPassword(student.password)
    && !hasTooMuchNoise(student.nisn)
    && isValidClassName(student.className)
    && !hasTooMuchNoise(student.email)
  );
}

function cleanupInvalidImportedData(nextState) {
  const validTeacherIds = new Set();
  nextState.teachers = nextState.teachers.filter((teacher) => {
    const account = nextState.accounts.find((item) => item.id === teacher.accountId);
    const valid = isValidImportedTeacher({ ...teacher, username: account?.username, password: account?.password });
    if (valid) validTeacherIds.add(teacher.accountId);
    return valid;
  });

  const validStudentIds = new Set();
  nextState.students = nextState.students.filter((student) => {
    const account = nextState.accounts.find((item) => item.id === student.accountId);
    const valid = isValidImportedStudent({ ...student, username: account?.username, password: account?.password });
    if (valid) validStudentIds.add(student.accountId);
    return valid;
  });

  nextState.accounts = nextState.accounts.filter((account) => (
    account.role === "admin"
    || (account.role === "teacher" && validTeacherIds.has(account.id))
    || (account.role === "student" && validStudentIds.has(account.id))
  ));

  return nextState;
}

function decodePdfEscapes(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function ascii85Decode(value) {
  const clean = value.replace(/^<~|~>$/g, "").replace(/\s/g, "");
  const bytes = [];
  let group = [];
  for (const char of clean) {
    if (char === "z" && group.length === 0) {
      bytes.push(0, 0, 0, 0);
      continue;
    }
    const code = char.charCodeAt(0);
    if (code < 33 || code > 117) continue;
    group.push(code - 33);
    if (group.length === 5) {
      let value32 = 0;
      group.forEach((digit) => {
        value32 = value32 * 85 + digit;
      });
      bytes.push((value32 >>> 24) & 255, (value32 >>> 16) & 255, (value32 >>> 8) & 255, value32 & 255);
      group = [];
    }
  }
  if (group.length) {
    const padding = 5 - group.length;
    while (group.length < 5) group.push(84);
    let value32 = 0;
    group.forEach((digit) => {
      value32 = value32 * 85 + digit;
    });
    const tail = [(value32 >>> 24) & 255, (value32 >>> 16) & 255, (value32 >>> 8) & 255, value32 & 255];
    bytes.push(...tail.slice(0, 4 - padding));
  }
  return new Uint8Array(bytes);
}

async function inflateBytes(bytes) {
  if (!("DecompressionStream" in window)) return "";
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    return await new Response(stream).text();
  } catch {
    return "";
  }
}

function extractTextOperators(binary) {
  const textParts = [];
  for (const match of binary.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)) {
    textParts.push(decodePdfEscapes(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  }
  for (const match of binary.matchAll(/\[(.*?)\]\s*TJ/gs)) {
    const segment = match[1];
    const parts = [...segment.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((part) => decodePdfEscapes(part[0].slice(1, -1)));
    if (parts.length) textParts.push(parts.join(""));
  }
  return textParts.join("\n");
}

async function extractLoosePdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }

  const textParts = [extractTextOperators(binary)];
  for (const streamMatch of binary.matchAll(/<<(.*?)>>\s*stream\r?\n?([\s\S]*?)\r?\n?endstream/gs)) {
    const dictionary = streamMatch[1];
    let streamData = streamMatch[2].replace(/\r?\n$/, "");
    if (/ASCII85Decode/i.test(dictionary)) {
      streamData = ascii85Decode(streamData);
    } else {
      streamData = Uint8Array.from(streamData, (char) => char.charCodeAt(0) & 255);
    }
    if (/FlateDecode/i.test(dictionary)) {
      const inflated = await inflateBytes(streamData);
      if (inflated) textParts.push(extractTextOperators(inflated), inflated);
    }
  }

  const fallback = binary
    .replace(/[^\x09\x0A\x0D\x20-\x7E|,;@.:-]/g, " ")
    .split(/\s{2,}/)
    .filter((part) => part.includes("|") || part.includes(";"))
    .join("\n");

  return [...textParts, fallback].join("\n");
}

function readDataFileText(file, onLoad) {
  if (!file) {
    alert("Pilih file data terlebih dahulu.");
    return;
  }
  const name = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isText = file.type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv");

  if (!isPdf && !isText) {
    alert("File harus PDF teks, TXT, atau CSV.");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    if (isPdf) {
      onLoad(await extractLoosePdfText(reader.result));
    } else {
      onLoad(String(reader.result || ""));
    }
  });
  if (isPdf) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }
}

function importTeachers(teachers) {
  let imported = 0;
  let skipped = 0;
  teachers.forEach((teacher) => {
    if (!isValidImportedTeacher(teacher)) {
      skipped += 1;
      return;
    }
    if (usernameExists(teacher.username)) {
      skipped += 1;
      return;
    }
    const accountId = makeId("teacher_account");
    state.accounts.push({
      id: accountId,
      role: "teacher",
      username: teacher.username,
      password: teacher.password,
      name: teacher.name
    });
    state.teachers.push({
      accountId,
      name: teacher.name,
      nip: teacher.nip,
      email: teacher.email,
      phone: teacher.phone,
      subject: teacher.subject,
      classes: teacher.classes
    });
    imported += 1;
  });
  return { imported, skipped };
}

function importStudents(students) {
  let imported = 0;
  let skipped = 0;
  students.forEach((student) => {
    if (!isValidImportedStudent(student)) {
      skipped += 1;
      return;
    }
    if (usernameExists(student.username)) {
      skipped += 1;
      return;
    }
    const accountId = makeId("student_account");
    state.accounts.push({
      id: accountId,
      role: "student",
      username: student.username,
      password: student.password,
      name: student.name
    });
    state.students.push({
      accountId,
      name: student.name,
      nisn: student.nisn,
      className: student.className,
      email: student.email
    });
    imported += 1;
  });
  return { imported, skipped };
}

function renderActivityList(target, items, emptyText) {
  target.innerHTML = "";
  if (!items.length) {
    target.append(emptyBlock(emptyText));
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "activity-item";
    const left = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.title;
    const detail = document.createElement("small");
    detail.textContent = item.text;
    left.append(title, document.createElement("br"), detail);
    const meta = document.createElement("small");
    meta.textContent = item.meta;
    row.append(left, meta);
    target.append(row);
  });
}

function emptyBlock(text) {
  const block = document.createElement("div");
  block.className = "empty-state";
  block.textContent = text;
  return block;
}

function emptyTableRow(text, colspan) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = colspan;
  cell.append(emptyBlock(text));
  row.append(cell);
  return row;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[match]);
}

teacherProfileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(teacherProfileForm);
  const teacher = getCurrentTeacher();
  if (!teacher) return;
  Object.assign(teacher, {
    name: data.get("name").trim(),
    nip: data.get("nip").trim(),
    email: data.get("email").trim(),
    phone: data.get("phone").trim(),
    subject: data.get("subject").trim(),
    classes: data.get("classes").trim()
  });
  if (currentUser) currentUser.name = teacher.name;
  saveState();
  renderAll();
});

studentProfileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(studentProfileForm);
  const student = getCurrentStudent();
  if (!student) return;
  Object.assign(student, {
    name: data.get("name").trim(),
    nisn: data.get("nisn").trim(),
    className: data.get("className").trim(),
    email: data.get("email").trim()
  });
  if (currentUser) currentUser.name = student.name;
  saveState();
  renderAll();
});

schoolForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(schoolForm);
  state.school = {
    name: data.get("name").trim(),
    year: data.get("year").trim()
  };
  saveState();
  renderAll();
});

adminTeacherForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(adminTeacherForm);
  readDataFileText(data.get("teacherPdf"), (text) => {
    const teachers = parseTeachersFromPdfText(text);
    if (!teachers.length) {
      alert("Data guru belum bisa dibaca. Gunakan PDF teks/TXT/CSV dengan format: Nama | Username | Password | NIP | Email | Telepon | Mapel | Kelas");
      return;
    }
    const result = importTeachers(teachers);
    adminTeacherForm.reset();
    saveState();
    renderAll();
    alert(`${result.imported} guru berhasil diimpor. ${result.skipped} dilewati karena username sudah ada.`);
  });
});

adminStudentForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(adminStudentForm);
  readDataFileText(data.get("studentPdf"), (text) => {
    const students = parseStudentsFromPdfText(text);
    if (!students.length) {
      alert("Data murid belum bisa dibaca. Gunakan tabel PDF/TXT/CSV dengan kolom: No, Nama, Username, Password, NISN, Kelas, Email.");
      return;
    }
    const result = importStudents(students);
    adminStudentForm.reset();
    saveState();
    renderAll();
    alert(`${result.imported} murid berhasil diimpor. ${result.skipped} dilewati karena username sudah ada.`);
  });
});

examForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const teacher = getCurrentTeacher();
  if (!teacher) return;
  const data = new FormData(examForm);
  const id = makeId("exam");
  state.exams.push({
    id,
    title: data.get("title").trim(),
    subject: data.get("subject").trim(),
    className: data.get("className").trim(),
    duration: Number(data.get("duration")),
    startsAt: data.get("startsAt"),
    endsAt: data.get("endsAt"),
    violationLimit: Number(data.get("violationLimit")),
    teacherAccountId: teacher.accountId,
    token: id.slice(-6).toUpperCase(),
    questions: [],
    pdf: null,
    createdAt: new Date().toISOString()
  });
  examForm.reset();
  examForm.elements.duration.value = "60";
  examForm.elements.violationLimit.value = "3";
  saveState();
  renderAll();
});

questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(questionForm);
  const file = data.get("pdfFile");
  if (!isSupportedQuestionFile(file)) {
    alert("File soal harus PDF teks, TXT, atau CSV.");
    return;
  }
  let exam = state.exams.find((item) => item.id === data.get("examId"));
  if (!exam) {
    exam = createDraftExamFromPdf(file);
  }
  if (!exam) {
    alert("Akun guru tidak ditemukan. Login ulang sebagai guru.");
    return;
  }
  const selectedExam = exam.id;

  readDataFileText(file, (text) => {
    const parsedQuestions = parseQuestionsFromPdfText(String(text || ""));
    if (!parsedQuestions.length) {
      alert("Soal belum bisa dibaca. PDF seperti ini biasanya memakai font/kode yang tidak bisa diekstrak browser. Gunakan PDF teks biasa, TXT, atau CSV dengan format: 1. pertanyaan, A-D, lalu KUNCI: A/B/C/D atau daftar KUNCI JAWABAN di akhir.");
      return;
    }
    exam.pdf = {
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: new Date().toISOString()
    };
    exam.questions = parsedQuestions;
    questionForm.reset();
    questionForm.elements.examId.value = selectedExam;
    saveState();
    renderAll();
  });
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(loginForm);
  const account = findAccountByLogin(data.get("identifier"), data.get("password"));
  if (!account) {
    loginError.textContent = "Username atau password salah.";
    return;
  }
  loginError.textContent = "";
  currentUser = account;
  showApp(account.role);
  renderAll();
});

document.getElementById("logout-button").addEventListener("click", showLogin);

document.querySelectorAll("[data-scroll-target]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: "smooth" }));
});

document.getElementById("prev-question").addEventListener("click", () => {
  const exam = getActiveExam();
  if (!exam) return;
  currentQuestion = Math.max(0, currentQuestion - 1);
  renderExamRoom();
});

document.getElementById("next-question").addEventListener("click", () => {
  const exam = getActiveExam();
  if (!exam) return;
  currentQuestion = Math.min(exam.questions.length - 1, currentQuestion + 1);
  renderExamRoom();
});

document.getElementById("submit-exam").addEventListener("click", submitExam);

document.getElementById("close-result").addEventListener("click", () => {
  resultModal.classList.remove("active");
  showView("student");
});

document.getElementById("fullscreen-button").addEventListener("click", () => {
  document.documentElement.requestFullscreen?.();
});

document.getElementById("download-template").addEventListener("click", () => {
  const template = [
    "MATA PELAJARAN:",
    "KELAS:",
    "DURASI:",
    "",
    "[PDF SOAL]",
    "1. Tulis pertanyaan di sini",
    "A. Pilihan A",
    "B. Pilihan B",
    "C. Pilihan C",
    "D. Pilihan D",
    "KUNCI: A"
  ].join("\n");
  const blob = new Blob([template], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "format-pdf-soal-ujianku.txt";
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("reset-data").addEventListener("click", () => {
  if (!confirm("Hapus semua data lokal UjianKu di browser ini?")) return;
  state = structuredClone(emptyState);
  currentQuestion = 0;
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
});

document.getElementById("print-all-accounts").addEventListener("click", () => printAccountPdf("all"));
document.getElementById("print-teacher-accounts").addEventListener("click", () => printAccountPdf("teacher"));
document.getElementById("print-student-accounts").addEventListener("click", () => printAccountPdf("student"));
document.getElementById("print-teacher-card").addEventListener("click", () => printProfileCard("teacher"));
document.getElementById("print-student-card").addEventListener("click", () => printProfileCard("student"));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) addViolation("Berpindah tab atau aplikasi");
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) addViolation("Keluar dari fullscreen");
});

window.addEventListener("blur", () => addViolation("Jendela kehilangan fokus"));

window.addEventListener("beforeunload", (event) => {
  if (document.body.classList.contains("exam-mode") && !state.activeSession?.submitted) {
    event.preventDefault();
    event.returnValue = "";
  }
});

document.addEventListener("contextmenu", (event) => {
  if (document.body.classList.contains("exam-mode")) event.preventDefault();
});

document.addEventListener("copy", (event) => {
  if (document.body.classList.contains("exam-mode")) event.preventDefault();
});

document.addEventListener("paste", (event) => {
  if (document.body.classList.contains("exam-mode")) event.preventDefault();
});

window.addEventListener("online", () => {
  document.getElementById("connection-state").textContent = "Online";
});

window.addEventListener("offline", () => {
  document.getElementById("connection-state").textContent = "Offline";
});

renderAll();
saveState();
showLogin();
if (state.activeSession && !state.activeSession.submitted) startTimer();
