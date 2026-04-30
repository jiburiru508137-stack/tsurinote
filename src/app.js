// @ts-check

import {
  QUESTION_DEFINITIONS,
  QUESTION_SECTION_LABELS,
} from "./questionDefinitions.js";
import {
  getCurrentSectionId,
  getFirstQuestionId,
  getNextQuestionId,
  getPreviousQuestionId,
  getQuestionById,
  getQuestionMode,
  isQuestionStep,
} from "./questionFlow.js";
import {
  OPTION_LABELS,
  STEP_ORDER,
  TEMPLATE_OPTIONS,
  collectSpeciesLabel,
  computeCatchCount,
  computeMaxSize,
  computeTripValidationState,
  createBackupManifest,
  createEmptyCatch,
  createEmptyDraftBundle,
  createEmptyPhoto,
  createId,
  describeLabel,
  escapeHtml,
  extractCandidatesFromTrip,
  formatDate,
  formatDateTime,
  hydrateDraftBundle,
  isBoatLike,
  isFreshwater,
  isSeaLike,
  isShoreLike,
  mergeCandidateData,
  nextStepId,
  nowIso,
  previousStepId,
  primarySpeciesName,
  sanitizeTripForSave,
  summarizeTrip,
  toDateInput,
} from "./models.js";
import {
  exportAllData,
  getBlob,
  getDraft,
  loadInitialData,
  restoreFromRestorePoint,
  restoreBackupData,
  saveBackupStatus,
  saveBlob,
  saveCandidateData,
  saveDraft,
  saveRestorePoint,
  saveTripAndDeleteDraft,
} from "./db.js";

globalThis.__TSURINOTE_BOOTED__ = true;

const DEFAULT_FILTERS = {
  date: "",
  location: "",
  species: "",
  method: "",
  result_type: "",
  weather: "",
  tide: "",
  wind: "",
  lure: "",
  size_min: "",
  size_max: "",
  result_presence: "",
};

const QUICK_CAPTURE_STEP = {
  id: "quick_capture",
  name: "かんたん記録",
  description: "結果、場所、使ったもの、写真、ひとことだけを先に残します",
  nextLabel: "確認へ進む",
};

const appState = {
  isReady: false,
  currentRoute: null,
  storageMode: "local",
  searchMode: "basic",
  trips: [],
  drafts: [],
  candidateData: {},
  backupStatus: {
    last_backup_at: "",
    message: "",
  },
  restorePoints: [],
  currentDraft: null,
  currentDraftLoadedId: "",
  saveStatus: {
    state: "idle",
    message: "",
  },
  wizardErrors: {
    summary: [],
    fields: {},
  },
  filters: {
    ...DEFAULT_FILTERS,
  },
  pendingRestore: null,
  globalNotice: null,
  activeDialog: null,
  mediaCache: new Map(),
  saveTimer: null,
  shouldFocusErrorSummary: false,
  latestSavedTripId: "",
  lastQuestionMotionKey: "",
};

const IMAGE_FILE_ACCEPT = "image/*,.heic,.heif,image/heic,image/heif";

const appRoot = document.querySelector("#app");

window.addEventListener("hashchange", handleRouteChange);
window.addEventListener("beforeunload", () => {
  appState.mediaCache.forEach((url) => URL.revokeObjectURL(url));
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && appState.currentDraft) {
    persistCurrentDraft({
      saveMessage: recordSavedMessage(),
    });
  }
});

init();

async function init() {
  try {
    await refreshFromStorage();
    appState.isReady = true;
    await handleRouteChange();
  } catch (error) {
    renderFatalError(error);
  }
}

async function refreshFromStorage() {
  const data = await loadInitialData();
  appState.storageMode = data.storageMode || "local";
  appState.trips = (data.trips ?? [])
    .filter((trip) => trip.status !== "deleted")
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  appState.drafts = (data.drafts ?? [])
    .map((draft) => hydrateDraftBundle(draft))
    .sort((a, b) => String(b.meta.last_saved_at).localeCompare(String(a.meta.last_saved_at)));
  appState.candidateData = data.candidateData ?? {};
  appState.backupStatus = data.backupStatus ?? {
    last_backup_at: "",
    message: "",
  };
  appState.restorePoints = Array.isArray(data.restorePoints) ? data.restorePoints : [];
}

function isRemoteStorageMode() {
  return appState.storageMode === "remote";
}

function recordStorageLabel() {
  return isRemoteStorageMode() ? "このサイト" : "この端末";
}

function recordSavedMessage() {
  return `下書き保存済み：${recordStorageLabel()}に保存されています`;
}

function recordSaveErrorMessage() {
  return isRemoteStorageMode()
    ? "保存できませんでしたサイトへの保存に失敗しました"
    : "保存できませんでした通信ではなく端末内保存に失敗しています";
}

function recordStorageIntroText() {
  if (isRemoteStorageMode()) {
    return "記録はこのサイトに保存します 写真を残したいときだけ控えを保存できます";
  }
  return "この端末に自動保存します 別の端末で使うときはバックアップしてください";
}

function draftResumeLeadText() {
  return `${recordStorageLabel()}に保存された下書きを再開できます`;
}

function draftEmptyText() {
  return isRemoteStorageMode()
    ? "いまは下書きがありません 入力を始めると このサイトに自動保存されます"
    : "いまは下書きがありません 入力を始めると この端末に自動保存されます";
}

function latestDraftSavedText(lastSavedAt) {
  return `最新の下書きは ${formatDateTime(lastSavedAt)} に${recordStorageLabel()}へ保存しました`;
}

function backupLeadText() {
  if (isRemoteStorageMode()) {
    return "記録はこのサイトに保存します 写真を残したいときだけ控えを保存できます";
  }
  return "入力中の内容はこの端末に残ります 必要なときだけバックアップできます";
}

function savedPageLeadText(trip) {
  const lead = trip ? savedOutcomeLead(trip) : "この記録は、次回の一手を考えるための材料になります";
  return `${lead} この内容は${recordStorageLabel()}に保存しています`;
}

function backupStepStorageText() {
  if (isRemoteStorageMode()) {
    return "記録本体はこのサイトで開けます 写真を移したいときだけ控えを使います";
  }
  return "このサイトでは自動同期しません 端末をまたぐときだけ控えを使います";
}

function backupCrossDeviceText() {
  if (isRemoteStorageMode()) {
    return "別端末でも記録本体は開けます 写真も移したいときだけ この控えを読み込みます";
  }
  return "このサイトを別端末で開いてから 控えファイルを読み込むと記録を移せます";
}

function savedBackupHintText() {
  if (isRemoteStorageMode()) {
    return "記録本体はこのサイトで開けます 写真本体を残したいときは バックアップも保存してください";
  }
  return "別の端末へ自動では移らないため、必要ならバックアップを保存してください";
}

function buildBackupPayload(data) {
  const manifest = createBackupManifest({
    recordCount: (data.trips?.length ?? 0) + (data.drafts?.length ?? 0),
    tripCount: data.trips?.length ?? 0,
    draftCount: data.drafts?.length ?? 0,
    includesPhotos: false,
  });
  return {
    manifest,
    records: {
      trips: (data.trips ?? []).map(stripPhotoBlobKeysForBackup),
      drafts: (data.drafts ?? []).map(stripDraftPhotoBlobKeysForBackup),
    },
    candidate_data: data.candidateData ?? {},
    zip_backup_status: {
      enabled: false,
      note: "写真込みバックアップは今後対応予定です",
    },
  };
}

function createRestorePointSummary(payload, label, createdAt) {
  return {
    label,
    created_at: createdAt,
    record_count: payload.manifest.record_count,
    trip_count: payload.manifest.trip_count,
    draft_count: payload.manifest.draft_count,
  };
}

function renderFatalError(error) {
  appRoot.innerHTML = `
    <div class="app-shell">
      <main class="page" id="app-main">
        <section class="backup-card" aria-labelledby="fatal-title">
          <h1 class="page-heading" id="fatal-title">画面を開けませんでした</h1>
          <p class="page-lead">${isRemoteStorageMode() ? "このサイトの保存準備に失敗しましたページを再読み込みしても直らない場合は、公開設定と D1 の接続を確認してください" : "この端末での保存準備に失敗しましたページを再読み込みしても直らない場合は、ブラウザの保存領域の設定を確認してください"}</p>
          <div class="error-summary" tabindex="-1">
            <h2>確認できた内容</h2>
            <p>${escapeHtml(error?.message ?? String(error))}</p>
          </div>
        </section>
      </main>
    </div>
  `;
}

function parseRoute() {
  const hash = location.hash.replace(/^#/, "");
  const path = hash || "/home";
  const [pathPart] = path.split("?");
  const segments = pathPart.split("/").filter(Boolean);
  const name = segments[0] ?? "home";
  return {
    name,
    draftId: name === "wizard" || name === "edit" ? segments[1] ?? "" : "",
    tripId: name === "detail" || name === "saved" ? segments[1] ?? "" : "",
  };
}

async function handleRouteChange() {
  appState.currentRoute = parseRoute();
  if (!appState.isReady) {
    return;
  }
  if (appState.currentRoute.name === "wizard" || appState.currentRoute.name === "edit") {
    await ensureWizardDraft(appState.currentRoute.draftId);
  } else {
    appState.currentDraft = null;
    appState.currentDraftLoadedId = "";
    appState.lastQuestionMotionKey = "";
    clearSaveTimer();
  }
  await render();
}

async function ensureWizardDraft(draftId) {
  if (draftId && appState.currentDraftLoadedId === draftId && appState.currentDraft) {
    return;
  }
  if (!draftId) {
    if (!appState.currentDraft) {
      const bundle = createEmptyDraftBundle();
      appState.currentDraft = hydrateDraftBundle(bundle);
      appState.currentDraftLoadedId = bundle.draft_id;
      location.replace(`#/wizard/${bundle.draft_id}`);
    }
    return;
  }

  const draft = appState.drafts.find((item) => item.draft_id === draftId) ?? (await getDraft(draftId));
  if (!draft) {
    setGlobalNotice(
      "error",
      "下書きが見つかりませんでした下書き一覧から選び直してください",
    );
    location.replace("#/drafts");
    return;
  }
  appState.currentDraft = hydrateDraftBundle(draft);
  normalizeEditDraftForRoute(appState.currentDraft, appState.currentRoute);
  appState.currentDraftLoadedId = draftId;
}

function isEditRoute(route = appState.currentRoute) {
  return route?.name === "edit";
}

function isEditingDraft(bundle = appState.currentDraft) {
  return Boolean(bundle?.start_context?.editing_trip_id);
}

function draftRoutePath(bundle) {
  if (!bundle?.draft_id) {
    return "#/wizard";
  }
  return isEditingDraft(bundle) ? `#/edit/${bundle.draft_id}` : `#/wizard/${bundle.draft_id}`;
}

function normalizeEditDraftForRoute(bundle, route = appState.currentRoute) {
  if (!bundle || !isEditRoute(route) || !isEditingDraft(bundle)) {
    return;
  }
  bundle.start_context.record_mode = "detailed";
  const nextStepId =
    !bundle.meta.current_step || bundle.meta.current_step === "start"
      ? "detailed_location"
      : bundle.meta.current_step;
  bundle.meta.current_step = normalizeWizardStepId(bundle, nextStepId);
}

function editDetailPath(bundle = appState.currentDraft) {
  const tripId = bundle?.start_context?.editing_trip_id;
  return tripId ? `#/detail/${tripId}` : "#/records";
}

function clearSaveTimer() {
  if (appState.saveTimer) {
    clearTimeout(appState.saveTimer);
    appState.saveTimer = null;
  }
}

function navigate(path) {
  if (location.hash === path) {
    handleRouteChange();
    return;
  }
  location.hash = path;
}

function setGlobalNotice(type, text) {
  appState.globalNotice = text ? { type, text } : null;
}

function setSaveStatus(state, message) {
  appState.saveStatus = { state, message };
  renderShellOnly();
}

async function render() {
  const route = appState.currentRoute ?? parseRoute();
  const pageHtml = await renderCurrentPage(route);
  appRoot.innerHTML = renderShell(pageHtml, route);
  bindShellEvents();
  bindRouteEvents(route);
  if ((route.name === "wizard" || route.name === "edit") && appState.currentDraft) {
    appState.lastQuestionMotionKey = normalizeWizardStepId(
      appState.currentDraft,
      appState.currentDraft.meta.current_step,
    );
  } else {
    appState.lastQuestionMotionKey = "";
  }
  focusErrorSummaryIfNeeded();
}

function renderShellOnly() {
  const statusElement = document.querySelector("[data-save-live]");
  if (statusElement) {
    statusElement.innerHTML = renderSavePill();
  }
}

function focusErrorSummaryIfNeeded() {
  if (!appState.shouldFocusErrorSummary) {
    return;
  }
  const summary = document.querySelector("#error-summary");
  if (summary) {
    summary.focus();
  }
  appState.shouldFocusErrorSummary = false;
}

function renderShell(pageHtml, route) {
  return `
    <div class="app-shell" data-route="${escapeHtml(route.name)}">
      <header class="site-header">
        <div class="site-header__inner">
        <div class="brand">
            <h1 class="brand__title">ツリノート</h1>
            <div class="brand__caption">釣りの記録を残す</div>
          </div>
          <nav class="site-nav" aria-label="主なメニュー">
            <a href="#/home" ${route.name === "home" ? 'aria-current="page"' : ""}>ホーム</a>
            <a href="#/wizard" ${route.name === "wizard" || route.name === "edit" ? 'aria-current="page"' : ""}>記録する</a>
            <a href="#/records" ${route.name === "records" ? 'aria-current="page"' : ""}>探す</a>
            <a class="site-nav__optional" href="#/drafts" ${route.name === "drafts" ? 'aria-current="page"' : ""}>下書き</a>
            <a class="site-nav__optional" href="#/backup" ${route.name === "backup" ? 'aria-current="page"' : ""}>バックアップ</a>
          </nav>
        </div>
      </header>
      <main class="page" id="app-main">
        ${renderGlobalNotice()}
        ${pageHtml}
      </main>
      ${renderDialog()}
    </div>
  `;
}

function renderGlobalNotice() {
  if (!appState.globalNotice) {
    return "";
  }
  const typeClass =
    appState.globalNotice.type === "error"
      ? "pill--error"
      : appState.globalNotice.type === "warning"
        ? "pill--backup-needed"
        : "pill--final";
  return `
    <section class="status-card" aria-live="polite">
      <div class="pill-row">
        <span class="pill ${typeClass}">${escapeHtml(appState.globalNotice.text)}</span>
      </div>
    </section>
  `;
}

function openDialog(type) {
  appState.activeDialog = { type };
  render();
}

function closeDialog() {
  appState.activeDialog = null;
  render();
}

function renderDialog() {
  if (!appState.activeDialog) {
    return "";
  }
  if (appState.activeDialog.type === "detail-guide") {
    return `
      <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-guide-title">
        <button class="app-dialog__backdrop" type="button" data-action="close-dialog" aria-label="閉じる"></button>
        <section class="app-dialog__panel">
          <div class="section-header">
            <div>
              <h2 class="section-title" id="detail-guide-title">あとから追加できる項目</h2>
              <p class="muted">最初は短く残して 必要なときだけ追記できます</p>
            </div>
            <button class="button-secondary" type="button" data-action="close-dialog">閉じる</button>
          </div>
          <div class="detail-lines">
            <div class="detail-line">
              <strong>釣行条件</strong>
              <span>天候 風 潮 濁りなどを追加できます</span>
            </div>
            <div class="detail-line">
              <strong>道具</strong>
              <span>ロッド リール 重さ カラーなどを追加できます</span>
            </div>
            <div class="detail-line">
              <strong>振り返り</strong>
              <span>反省点や次回試すことを あとで追記できます</span>
            </div>
          </div>
          <div class="app-dialog__actions">
            <button class="button" type="button" data-action="close-dialog">分かりました</button>
          </div>
        </section>
      </div>
    `;
  }
  return "";
}

async function renderCurrentPage(route) {
  switch (route.name) {
    case "home":
      return renderHomePage();
    case "drafts":
      return renderDraftPage();
    case "wizard":
    case "edit":
      return renderWizardPage();
    case "records":
      return renderRecordListPage();
    case "detail":
      return renderDetailPage(route.tripId);
    case "backup":
      return renderBackupPage();
    case "saved":
      return renderSavedPage(route.tripId);
    default:
      return renderHomePage();
  }
}

function sortTripsByStartedAtDesc(list) {
  return [...list].sort((a, b) => String(b.started_at || "").localeCompare(String(a.started_at || "")));
}

function latestNextTryTrip(excludeTripId = "") {
  return sortTripsByStartedAtDesc(appState.trips).find(
    (trip) => trip.trip_id !== excludeTripId && trip.next_try?.trim(),
  );
}

function normalizeTripText(value) {
  return String(value ?? "").trim();
}

function tripPlaceValue(trip) {
  return normalizeTripText(trip.location_name) || normalizeTripText(trip.location_region);
}

function reflectionReferenceFor(trip) {
  const candidates = sortTripsByStartedAtDesc(appState.trips).filter(
    (item) => item.trip_id !== trip.trip_id && item.started_at <= trip.started_at && item.next_try?.trim(),
  );
  if (!candidates.length) {
    return {
      label: "前回の「次回試すこと」",
      trip: null,
    };
  }

  const samePlaceValue = tripPlaceValue(trip);
  const sameSpeciesValue = primarySpeciesName(trip);
  const sameMethodValue = normalizeTripText(trip.tackle?.method_name);
  const sameLureValue = normalizeTripText(trip.tackle?.lure_or_bait_name);

  const groups = [
    {
      label: "同じ場所の前回の「次回試すこと」",
      match: (item) => samePlaceValue && tripPlaceValue(item) === samePlaceValue,
    },
    {
      label: "同じ魚種の前回の「次回試すこと」",
      match: (item) => sameSpeciesValue && primarySpeciesName(item) === sameSpeciesValue,
    },
    {
      label: "同じ釣法かルアーの前回の「次回試すこと」",
      match: (item) =>
        (sameMethodValue && normalizeTripText(item.tackle?.method_name) === sameMethodValue) ||
        (sameLureValue && normalizeTripText(item.tackle?.lure_or_bait_name) === sameLureValue),
    },
  ];

  for (const group of groups) {
    const matched = candidates.find(group.match);
    if (matched) {
      return {
        label: group.label,
        trip: matched,
      };
    }
  }

  return {
    label: "前回の「次回試すこと」",
    trip: candidates[0],
  };
}

function relatedTripSummary(trip) {
  const samePlaceValue = tripPlaceValue(trip);
  const sameSpeciesValue = primarySpeciesName(trip);
  const sameMethodValue = normalizeTripText(trip.tackle?.method_name);
  const sameLureValue = normalizeTripText(trip.tackle?.lure_or_bait_name);

  const samePlaceTrips = appState.trips.filter(
    (item) =>
      item.trip_id !== trip.trip_id &&
      samePlaceValue &&
      [item.location_name?.trim(), item.location_region?.trim()].includes(samePlaceValue),
  );
  const sameSpeciesTrips = appState.trips.filter(
    (item) =>
      item.trip_id !== trip.trip_id &&
      sameSpeciesValue &&
      primarySpeciesName(item) === sameSpeciesValue,
  );
  const sameMethodTrips = appState.trips.filter(
    (item) =>
      item.trip_id !== trip.trip_id &&
      ((sameMethodValue && item.tackle?.method_name?.trim() === sameMethodValue) ||
        (!sameMethodValue &&
          sameLureValue &&
          item.tackle?.lure_or_bait_name?.trim() === sameLureValue)),
  );

  return {
    samePlaceValue,
    sameSpeciesValue,
    sameMethodValue,
    sameLureValue,
    samePlaceTrips,
    sameSpeciesTrips,
    sameMethodTrips,
  };
}

function renderRelatedSearchButton({ label, kind, value, disabled = false }) {
  return `
    <button
      class="button-secondary"
      type="button"
      data-action="open-related-search"
      data-filter-kind="${escapeHtml(kind)}"
      data-filter-value="${escapeHtml(value || "")}"
      ${disabled ? "disabled" : ""}
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function resultPillClass(resultType) {
  switch (resultType) {
    case "caught":
      return "pill--result-caught";
    case "bite_only":
      return "pill--result-bite";
    case "chase_only":
      return "pill--result-chase";
    case "no_response":
    default:
      return "pill--result-none";
  }
}

function privacyPillClass(privacyLevel) {
  switch (privacyLevel) {
    case "region_only":
      return "pill--privacy-region";
    case "location_name":
      return "pill--privacy-place";
    case "private":
    default:
      return "pill--privacy-private";
  }
}

function renderRecordStatePill(status) {
  return `<span class="pill ${status === "draft" ? "pill--draft" : "pill--final"}">${status === "draft" ? "下書き" : "保存済み"}</span>`;
}

function renderResultPill(resultType) {
  const normalizedType = resultType || "no_response";
  return `<span class="pill ${resultPillClass(normalizedType)}">${escapeHtml(describeLabel("result_type", normalizedType))}</span>`;
}

function renderPrivacyPill(privacyLevel) {
  const normalizedLevel = privacyLevel || "private";
  return `<span class="pill ${privacyPillClass(normalizedLevel)}">${escapeHtml(describeLabel("privacy_level", normalizedLevel))}</span>`;
}

function savedOutcomeLead(trip) {
  const resultType = trip?.result?.result_type || "no_response";
  switch (resultType) {
    case "caught":
      return "釣れた条件を残すと、次も再現しやすくなります";
    case "bite_only":
      return "アタリだけの日も、次の一手を考える材料になります";
    case "chase_only":
      return "チェイスだけの日も、次の狙い方を考えるヒントになります";
    case "no_response":
    default:
      return "反応なしの日も、次の釣行のヒントになります";
  }
}

function isCardQuestionMode(bundle) {
  return ["quick", "photo_first", "detailed"].includes(getQuestionMode(bundle));
}

function normalizeWizardStepId(bundle, stepId) {
  if (!bundle || getQuestionMode(bundle) !== "detailed") {
    return stepId;
  }
  const stepMap = {
    basic: "detailed_location",
    conditions: "detailed_conditions",
    tackle: "detailed_tackle",
    result: "detailed_result",
    photos_memo: "detailed_photo",
  };
  return stepMap[stepId] || stepId;
}

function wizardStepsFor(bundle) {
  if (isCardQuestionMode(bundle)) {
    const steps = [];
    const seen = new Set();
    getVisibleQuestions(bundle).forEach((question) => {
      if (seen.has(question.section)) {
        return;
      }
      seen.add(question.section);
      steps.push({
        id: question.section,
        name: QUESTION_SECTION_LABELS[question.section] ?? question.section,
        description: "",
      });
    });
    steps.push({
      id: "confirm",
      name: QUESTION_SECTION_LABELS.confirm,
      description: "",
    });
    return steps;
  }
  return STEP_ORDER;
}

function findWizardStep(bundle, stepId) {
  const normalizedStepId = normalizeWizardStepId(bundle, stepId);
  if (isCardQuestionMode(bundle)) {
    if (normalizedStepId === "start") {
      return STEP_ORDER[0];
    }
    if (normalizedStepId === "confirm") {
      return STEP_ORDER.find((item) => item.id === "confirm") ?? STEP_ORDER[STEP_ORDER.length - 1];
    }
    const question = getQuestionById(bundle, normalizedStepId);
    if (question) {
      return {
        id: question.id,
        name: question.title,
        description: question.description || "",
        sectionId: question.section,
      };
    }
  }
  return wizardStepsFor(bundle).find((item) => item.id === normalizedStepId) ?? STEP_ORDER[0];
}

function nextWizardStepId(bundle, stepId) {
  const normalizedStepId = normalizeWizardStepId(bundle, stepId);
  if (isCardQuestionMode(bundle) && normalizedStepId !== "start" && normalizedStepId !== "confirm") {
    return getNextQuestionId(bundle, normalizedStepId);
  }
  if (isCardQuestionMode(bundle) && normalizedStepId === "start") {
    return getFirstQuestionId(bundle);
  }
  const steps = wizardStepsFor(bundle);
  const index = steps.findIndex((item) => item.id === normalizedStepId);
  if (index < 0) {
    return nextStepId(normalizedStepId);
  }
  return steps[Math.min(index + 1, steps.length - 1)].id;
}

function previousWizardStepId(bundle, stepId) {
  const normalizedStepId = normalizeWizardStepId(bundle, stepId);
  if (isCardQuestionMode(bundle) && normalizedStepId === "confirm") {
    const visibleQuestions = getVisibleQuestions(bundle);
    return visibleQuestions[visibleQuestions.length - 1]?.id ?? "start";
  }
  if (isCardQuestionMode(bundle) && normalizedStepId !== "start" && normalizedStepId !== "confirm") {
    return getPreviousQuestionId(bundle, normalizedStepId);
  }
  const steps = wizardStepsFor(bundle);
  const index = steps.findIndex((item) => item.id === normalizedStepId);
  if (index < 0) {
    return previousStepId(normalizedStepId);
  }
  return steps[Math.max(index - 1, 0)].id;
}

function getCurrentQuestionAnswer(bundle, questionId) {
  return bundle?.question_answers?.[questionId] ?? null;
}

function setQuestionAnswerState(bundle, questionId, state, value) {
  if (!bundle.question_answers) {
    bundle.question_answers = {};
  }
  bundle.question_answers[questionId] = {
    questionId,
    value,
    state,
    updatedAt: nowIso(),
  };
}

function markQuestionAnswered(bundle, questionId, value) {
  setQuestionAnswerState(bundle, questionId, "answered", value);
}

function summarizeQuestionState(bundle, questionId, fallback) {
  const answer = getCurrentQuestionAnswer(bundle, questionId);
  if (!answer) {
    return fallback || "未入力";
  }
  if (answer.state === "deferred") {
    return "あとで入力";
  }
  if (answer.state === "skipped") {
    return "この記録では入力しない";
  }
  return fallback || "入力済み";
}

function getQuestionChoice(bundle, questionId) {
  const answer = getCurrentQuestionAnswer(bundle, questionId);
  if (answer?.value && typeof answer.value === "object" && "choice" in answer.value) {
    return answer.value.choice || "";
  }
  return getByPath(bundle, `question_answers.${questionId}.value.choice`) || "";
}

function locationLabelFromTrip(trip) {
  return trip?.location_name?.trim() || trip?.location_region?.trim() || "";
}

function uniqueValues(values, limit = 3) {
  const cleaned = values.map((item) => String(item || "").trim()).filter(Boolean);
  return [...new Set(cleaned)].slice(0, limit);
}

function recentLocationOptions() {
  const previousTrip = appState.trips[0];
  const previousLabel = locationLabelFromTrip(previousTrip);
  const recent = uniqueValues(appState.trips.map((trip) => locationLabelFromTrip(trip)), 3);
  return {
    previousTrip,
    recent: recent.filter((item) => item !== previousLabel),
  };
}

function recentLureOptions() {
  const previousTrip = appState.trips[0];
  const previousLure = previousTrip?.tackle?.lure_or_bait_name || "";
  return {
    previousTrip,
    recent: uniqueValues(
      appState.trips.map((trip) => trip.tackle?.lure_or_bait_name || trip.result?.event_lure || ""),
      3,
    ).filter((item) => item !== previousLure),
  };
}

function reasonOptions() {
  const quickReasonQuestion = QUESTION_DEFINITIONS.quick.find((question) => question.id === "quick_reason");
  return (quickReasonQuestion?.options || [])
    .filter((option) => option.value !== "manual")
    .map((option) => option.label);
}

function fileNameExtension(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(".")
    .pop();
}

function isHeicMimeType(mimeType) {
  return ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"].includes(
    String(mimeType || "").toLowerCase(),
  );
}

function isHeicExtension(name) {
  return ["heic", "heif"].includes(fileNameExtension(name));
}

function detectPhotoMimeType(file) {
  const mimeType = String(file?.type || "").toLowerCase();
  if (mimeType) {
    return mimeType;
  }
  if (isHeicExtension(file?.name || "")) {
    return "image/heic";
  }
  return "";
}

function isHeicLikeFile(file) {
  return isHeicMimeType(detectPhotoMimeType(file)) || isHeicExtension(file?.name || "");
}

function isHeicPhotoRecord(photo) {
  return isHeicMimeType(photo?.source_mime_type) || isHeicExtension(photo?.caption || "");
}

function isPhotoPreviewUnavailable(photo) {
  return photo?.preview_status === "browser_unsupported";
}

function renderUnavailablePhotoPlaceholder(photo, message) {
  const heicBadge = isHeicPhotoRecord(photo) ? `<span class="pill">HEIC</span>` : "";
  return `
    <div class="record-card__media record-card__media--placeholder">
      <div class="record-card__placeholder">
        ${heicBadge}
        <strong>写真は保存しました</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    </div>
  `;
}

function renderQuestionChoiceCard(questionId, option, selectedChoice) {
  const optionPath = `question_answers.${questionId}.value.choice`;
  return `
    <div class="choice-card">
      <input
        id="${escapeHtml(questionId)}_${escapeHtml(option.value)}"
        type="radio"
        name="${escapeHtml(questionId)}"
        value="${escapeHtml(option.value)}"
        data-path="${escapeHtml(optionPath)}"
        data-focus-path="${escapeHtml(optionPath)}"
        data-rerender="true"
        data-save-immediate="true"
        ${selectedChoice === option.value ? "checked" : ""}
      />
      <label for="${escapeHtml(questionId)}_${escapeHtml(option.value)}">
        <strong>${escapeHtml(option.label)}</strong>
        ${option.description ? `<span>${escapeHtml(option.description)}</span>` : ""}
      </label>
    </div>
  `;
}

function renderQuestionChoiceFieldset(questionId, legend, description, options, selectedChoice, extraOptions = []) {
  return `
    <fieldset class="fieldset">
      <legend>${escapeHtml(legend)}</legend>
      ${description ? `<p class="help-text">${escapeHtml(description)}</p>` : ""}
      <div class="choice-grid">
        ${options.map((option) => renderQuestionChoiceCard(questionId, option, selectedChoice)).join("")}
      </div>
      ${
        extraOptions.length
          ? `
            <details class="helper-details">
              <summary>もっと見る</summary>
              <div class="choice-grid">
                ${extraOptions.map((option) => renderQuestionChoiceCard(questionId, option, selectedChoice)).join("")}
              </div>
            </details>
          `
          : ""
      }
    </fieldset>
  `;
}

function renderDraftSummaryAccordion(bundle) {
  const place = locationLabelFromTrip(bundle.trip) || summarizeQuestionState(bundle, "quick_location", "あとで入力");
  const tackle =
    bundle.trip.tackle?.lure_or_bait_name ||
    bundle.trip.tackle?.method_name ||
    summarizeQuestionState(bundle, "quick_tackle", "あとで入力");
  const result = describeLabel("result_type", bundle.trip.result?.result_type);
  return `
    <details class="helper-details">
      <summary>ここまでの記録</summary>
      <div class="detail-lines">
        <div class="detail-line">
          <strong>結果</strong>
          <span>${escapeHtml(result)}</span>
        </div>
        <div class="detail-line">
          <strong>場所</strong>
          <span>${escapeHtml(place || "未入力")}</span>
        </div>
        <div class="detail-line">
          <strong>使ったもの</strong>
          <span>${escapeHtml(tackle || "未入力")}</span>
        </div>
      </div>
    </details>
  `;
}

function compactPhotoSummaryLabel(photoCount) {
  if (!photoCount) {
    return "写真はまだありません";
  }
  return `${photoCount}枚の写真をこの端末に保存しています`;
}

function savedInsightSummary(trip, related) {
  if (!trip) {
    return {
      insight: "この記録を見返すと、次に試すことを残せます",
      related: "近い条件の記録は、保存後にここから見られます",
      nextTry: "まだ内容がありません",
    };
  }

  const resultType = trip.result?.result_type || "no_response";
  let insight = savedOutcomeLead(trip);
  if (resultType === "caught" && trip.tackle?.lure_or_bait_name) {
    insight = `釣れた条件に加えて、${trip.tackle.lure_or_bait_name}も残せました次回の再現に使えます`;
  }
  if (resultType === "no_response" && trip.result?.reason_note) {
    insight = `反応なしの理由を残せました${trip.result.reason_note}`;
  }

  let relatedText = "近い条件の過去記録はまだ見つかっていません";
  if (related?.samePlaceTrips?.length) {
    relatedText = `同じ場所の記録が ${related.samePlaceTrips.length} 件あります場所の傾向を見返せます`;
  } else if (related?.sameSpeciesTrips?.length) {
    relatedText = `同じ魚種の記録が ${related.sameSpeciesTrips.length} 件あります反応の違いを比べられます`;
  } else if (related?.sameMethodTrips?.length) {
    relatedText = `同じ釣法かルアーの記録が ${related.sameMethodTrips.length} 件あります次の一手を考えやすくなります`;
  }

  return {
    insight,
    related: relatedText,
    nextTry: trip.next_try || "次回に試すことは、あとから追記できます",
  };
}

function renderSavedPrimaryAction(trip, related) {
  if (!trip || !related) {
    return `<button class="button" type="button" data-action="goto-home">ホームへ戻る</button>`;
  }
  if (related.samePlaceTrips.length) {
    return `
      <button
        class="button"
        type="button"
        data-action="open-related-search"
        data-filter-kind="location"
        data-filter-value="${escapeHtml(related.samePlaceValue || "")}"
      >
        同じ場所の記録を見る
      </button>
    `;
  }
  if (related.sameSpeciesTrips.length) {
    return `
      <button
        class="button"
        type="button"
        data-action="open-related-search"
        data-filter-kind="species"
        data-filter-value="${escapeHtml(related.sameSpeciesValue || "")}"
      >
        同じ魚種の記録を見る
      </button>
    `;
  }
  if (related.sameMethodTrips.length) {
    const filterKind = related.sameMethodValue ? "method" : "lure";
    const filterValue = related.sameMethodValue || related.sameLureValue || "";
    return `
      <button
        class="button"
        type="button"
        data-action="open-related-search"
        data-filter-kind="${escapeHtml(filterKind)}"
        data-filter-value="${escapeHtml(filterValue)}"
      >
        同じ釣法/ルアーの記録を見る
      </button>
    `;
  }
  return `<button class="button" type="button" data-action="open-detail" data-trip-id="${escapeHtml(trip.trip_id)}">記録詳細を見る</button>`;
}

function renderPreviousNextTryCard(excludeTripId = "") {
  const previousNextTry = latestNextTryTrip(excludeTripId);
  return `
    <article class="status-card status-card--next-try reveal-card reveal-card--delay-4 ${previousNextTry ? "interactive-card" : ""}">
      <span class="status-card__accent-tag">次の一手</span>
      <strong>前回の「次回試すこと」</strong>
      <p class="muted">${
        previousNextTry
          ? `${escapeHtml(previousNextTry.next_try)}`
          : "前回書いたことを ここで見返せます"
      }</p>
      <p class="status-card__accent-note">釣れなかった日も、次の一手になる</p>
      <p class="status-card__support">反応なしの日も、場所や道具を残しておけば<br />次の釣行のヒントになります</p>
      ${
        previousNextTry
          ? `<div class="status-card__actions"><button class="button-secondary" type="button" data-action="open-detail" data-trip-id="${escapeHtml(previousNextTry.trip_id)}">この記録を見る</button></div>`
          : ""
      }
    </article>
  `;
}

function renderHomeHeroVisual() {
  return `
    <figure class="home-hero-image-card">
      <span class="home-hero-image-label">水辺のログ</span>
      <img class="home-hero-image" src="./assets/photos/home-hero-user.jpg" alt="水面に向けたロッドと、朝夕の空気を感じる水辺の景色" onerror="this.hidden=true;this.nextElementSibling.hidden=false;this.parentElement.classList.add('is-fallback')" />
      <div class="home-hero-image-fallback" hidden>
        <strong>釣りに向かう気分を残す場所</strong>
        <span>その日の様子を短く残して あとで見返せます</span>
      </div>
    </figure>
  `;
}

async function renderHomePage() {
  const recentTrips = await Promise.all(
    appState.trips.slice(0, 2).map((trip) => renderTripCard(trip, "final", { compact: true })),
  );
  const hasDraft = appState.drafts.length > 0;
  const latestDraft = appState.drafts[0];
  const draftCard = hasDraft ? await renderDraftCard(latestDraft, { compact: true }) : "";
  return `
    <section class="hero-card hero-card--home hero-card--minimal" aria-labelledby="home-title">
      <div class="home-hero-layout">
        <div class="reveal-card">
          ${renderHomeHeroVisual()}
        </div>
        <div class="hero-copy hero-copy--minimal home-hero-copy">
          <div class="reveal-card reveal-card--delay-1">
            <h2 class="page-heading home-hero-title" id="home-title">
              <span>次の一投は</span>
              <span>前回の記録から</span>
            </h2>
            <p class="page-lead home-hero-lead">釣れた日も 反応がなかった日も<br />あとで見返せるように残せます</p>
          </div>
          <div class="hero-primary reveal-card reveal-card--delay-2">
            <button class="hero-action hero-action--primary" type="button" data-home-action="new">
              <strong>新しく記録する</strong>
            </button>
          </div>
          <div class="pill-row home-trust-pills reveal-card reveal-card--delay-3">
            <span class="pill">非公開で保存</span>
            <span class="pill">あとから追記</span>
            <span class="pill">ブラウザで使える</span>
          </div>
        </div>
      </div>
    </section>
    <div class="home-story-stack">
      <section class="home-secondary-grid">
        ${renderPreviousNextTryCard()}
        ${
          hasDraft
            ? `
              <article class="status-card status-card--draft-home reveal-card reveal-card--delay-5 interactive-card">
                <div class="section-header">
                  <div>
                    <h3 class="section-title">下書き</h3>
                    <p class="muted">${escapeHtml(formatDateTime(latestDraft.meta.last_saved_at))} の下書きです</p>
                  </div>
                  <button class="button-secondary" type="button" data-home-action="resume">続きから開く</button>
                </div>
                ${draftCard}
              </article>
            `
            : ""
        }
      </section>
      <section class="notebook-card notebook-card--recent reveal-card reveal-card--delay-3" aria-labelledby="recent-title">
        <div class="section-header">
          <div>
            <h2 class="section-title" id="recent-title">最近の記録</h2>
          </div>
        </div>
        ${
          recentTrips.length
            ? `<div class="grid-cards grid-cards--recent">${recentTrips.join("")}</div>`
            : `<div class="empty-card"><p>まだ記録がありません まずは「新しく記録する」から始めてください</p></div>`
        }
      </section>
    </div>
  `;
}

async function renderDraftPage() {
  const cards = await Promise.all(appState.drafts.map((draft) => renderDraftCard(draft)));
  return `
    <section class="notebook-card" aria-labelledby="draft-title">
      <div class="section-header">
        <div>
          <h2 class="page-heading" id="draft-title">下書き一覧</h2>
          <p class="page-lead">${draftResumeLeadText()}</p>
        </div>
        <div class="button-row">
          <button class="button" type="button" data-home-action="new">新しく記録する</button>
        </div>
      </div>
      ${
        appState.drafts.length
          ? `<div class="grid-cards">${cards.join("")}</div>`
          : `<div class="empty-card"><p>再開できる下書きはありません 新しく記録を始めると ここに表示されます</p></div>`
      }
    </section>
  `;
}

async function renderWizardPage() {
  const bundle = appState.currentDraft;
  if (!bundle) {
    return `
      <section class="empty-card">
        <h2 class="page-heading">下書きが開けませんでした</h2>
        <p>ホームから下書きを選び直してください</p>
      </section>
    `;
  }
  await hydratePreviewUrls(bundle.trip.photos);
  normalizeEditDraftForRoute(bundle, appState.currentRoute);
  const activeStepId = normalizeWizardStepId(bundle, bundle.meta.current_step);
  const wizardSteps = wizardStepsFor(bundle);
  const step = findWizardStep(bundle, activeStepId);
  const editMode = isEditRoute() && isEditingDraft(bundle);
  const currentStepKey = isCardQuestionMode(bundle)
    ? getCurrentSectionId({ ...bundle, meta: { ...bundle.meta, current_step: activeStepId } })
    : step.id;
  const stepIndex = wizardSteps.findIndex((item) => item.id === currentStepKey);
  const currentQuestion =
    isCardQuestionMode(bundle) && isQuestionStep(bundle, step.id) ? getQuestionById(bundle, step.id) : null;
  const currentSectionLabel = isCardQuestionMode(bundle)
    ? QUESTION_SECTION_LABELS[currentStepKey] || step.name
    : step.name;
  const nextActionLabel = getWizardNextActionLabel(step, bundle);
  const returnToConfirmNote = renderReturnToConfirmNote(step.id, bundle);
  const pageHeading = editMode ? "記録を修正" : step.name;
  const pageDescription = editMode
    ? `${currentSectionLabel} だけ直せます 保存すると元の記録に戻ります`
    : step.description;
  const primaryAction = editMode || step.id === "confirm" ? "final-save" : "next-step";
  const storageButtonLabel = editMode ? "この修正を保存して戻る" : "下書き保存して閉じる";
  const backToDetailButton = editMode
    ? `<button class="button-secondary" type="button" data-action="goto-edit-detail">記録詳細へ戻る</button>`
    : "";
  const headerPills = editMode
    ? `
      <span class="pill pill--final">修正</span>
      <span class="pill">現在: ${escapeHtml(currentSectionLabel)}</span>
      <span data-save-live aria-live="polite" aria-atomic="true" role="status">${renderSavePill()}</span>
    `
    : `
      <span class="pill">現在: ${escapeHtml(currentSectionLabel)}</span>
      <span data-save-live aria-live="polite" aria-atomic="true" role="status">${renderSavePill()}</span>
    `;
  return `
    <section class="wizard-layout" data-view="${editMode ? "edit" : "wizard"}">
      ${
        editMode
          ? ""
          : `<div class="wizard-progressbar" aria-hidden="true">
        <div class="wizard-progressbar__meta">
          <strong>${stepIndex + 1} / ${wizardSteps.length}</strong>
          <span>${escapeHtml(currentSectionLabel)}</span>
        </div>
        <div class="wizard-progressbar__track">
          <span class="wizard-progressbar__value" style="width:${((stepIndex + 1) / wizardSteps.length) * 100}%"></span>
        </div>
      </div>`
      }
      ${
        editMode
          ? ""
          : `<div class="wizard-progress" aria-label="入力ステップ">
        ${wizardSteps.map(
          (item, index) => `
            <div class="wizard-step" data-current="${item.id === currentStepKey}">
              <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
              <span>${item.id === currentStepKey ? "入力中" : "準備済み"}</span>
            </div>
          `,
        ).join("")}
      </div>`
      }
      <header class="wizard-header">
        <div class="wizard-header__top">
          <div>
            <div class="pill-row">
              ${headerPills}
            </div>
            <h2 class="page-heading">${escapeHtml(pageHeading)}</h2>
            <p class="wizard-description">${escapeHtml(pageDescription)}</p>
          </div>
          <div class="top-actions">
            ${backToDetailButton}
            ${
              step.id !== "start"
                ? `<button class="button-secondary" type="button" data-action="prev-step">戻る</button>`
                : ""
            }
            ${editMode ? "" : renderQuestionHeaderAction(currentQuestion, step.id)}
            <button class="button-secondary" type="button" data-action="save-close">${storageButtonLabel}</button>
          </div>
        </div>
        ${editMode ? "" : `<p class="help-text">${recordStorageIntroText()}</p>`}
        ${editMode ? "" : returnToConfirmNote}
      </header>
      ${renderErrorSummary()}
      <section class="form-card">
        ${renderStepFields(activeStepId, bundle)}
      </section>
      <div class="step-actions">
        <button class="button" type="button" data-action="${primaryAction}">${escapeHtml(nextActionLabel)}</button>
      </div>
    </section>
  `;
}

function getWizardNextActionLabel(step, bundle) {
  if (isEditRoute() && isEditingDraft(bundle)) {
    return "これで保存する";
  }
  if (step.id === "start" && isCardQuestionMode(bundle)) {
    return bundle.start_context.record_mode === "photo_first" ? "写真の記録へ進む" : "質問へ進む";
  }
  if (step.id === "confirm") {
    return step.nextLabel;
  }
  if (isCardQuestionMode(bundle) && isQuestionStep(bundle, step.id)) {
    const nextQuestionId = getNextQuestionId(bundle, step.id);
    return nextQuestionId === "confirm" ? "確認へ進む" : "次へ進む";
  }
  if (bundle.meta.return_step_after_edit === "confirm") {
    return "確認へ戻る";
  }
  return step.nextLabel;
}

function renderReturnToConfirmNote(stepId, bundle) {
  if (stepId === "confirm" || bundle.meta.return_step_after_edit !== "confirm") {
    return "";
  }
  return `<p class="help-text">この修正が終わると 確認画面へ戻ります</p>`;
}

function hasActiveSearchFilters() {
  return Object.values(appState.filters).some((value) => value !== "");
}

async function renderRecordListPage() {
  const filteredTrips = filterTrips(appState.trips, appState.filters);
  const cards = await Promise.all(filteredTrips.map((trip) => renderTripCard(trip, "final")));
  const showDetailedSearch = appState.searchMode === "detailed";
  return `
    <section class="notebook-card" aria-labelledby="records-title">
      <div class="section-header">
        <div>
          <h2 class="page-heading" id="records-title">記録一覧</h2>
          <p class="page-lead">条件を入れて記録を探せます</p>
        </div>
      </div>
      <search class="search-form" aria-labelledby="search-title">
        <div class="search-panel">
          <h3 class="section-title" id="search-title">検索</h3>
          <div class="form-grid form-grid--two">
            ${renderTextField({
              id: "search_date",
              label: "日付",
              value: appState.filters.date,
              type: "date",
              path: "filters.date",
            })}
            ${renderTextField({
              id: "search_location",
              label: "場所",
              value: appState.filters.location,
              path: "filters.location",
              datalistKey: "locationNames",
            })}
            ${renderTextField({
              id: "search_species",
              label: "魚種",
              value: appState.filters.species,
              path: "filters.species",
              datalistKey: "speciesNames",
            })}
            ${renderTextField({
              id: "search_method",
              label: "釣法",
              value: appState.filters.method,
              path: "filters.method",
              datalistKey: "methods",
            })}
            ${renderSelectField({
              id: "search_result_type",
              label: "結果分類",
              value: appState.filters.result_type,
              path: "filters.result_type",
              options: [{ value: "", label: "指定しない" }, ...selectOptions("result_type")],
            })}
          </div>
          <details ${showDetailedSearch ? "open" : ""}>
            <summary>くわしく探す条件を開く</summary>
            <div class="form-grid form-grid--two">
              ${renderSelectField({
                id: "search_weather",
                label: "天候",
                value: appState.filters.weather,
                path: "filters.weather",
                options: selectOptions("weather", true),
              })}
              ${renderSelectField({
                id: "search_tide",
                label: "潮",
                value: appState.filters.tide,
                path: "filters.tide",
                options: selectOptions("tide_name", true),
              })}
              ${renderSelectField({
                id: "search_wind",
                label: "風",
                value: appState.filters.wind,
                path: "filters.wind",
                options: selectOptions("wind_level", true),
              })}
              ${renderTextField({
                id: "search_lure",
                label: "ルアー",
                value: appState.filters.lure,
                path: "filters.lure",
                datalistKey: "lures",
              })}
              ${renderNumberField({
                id: "search_size_min",
                label: "サイズ最小",
                value: appState.filters.size_min,
                path: "filters.size_min",
                unit: "cm",
              })}
              ${renderNumberField({
                id: "search_size_max",
                label: "サイズ最大",
                value: appState.filters.size_max,
                path: "filters.size_max",
                unit: "cm",
              })}
              ${renderSelectField({
                id: "search_result_presence",
                label: "釣果あり / なし",
                value: appState.filters.result_presence,
                path: "filters.result_presence",
                options: [
                  { value: "", label: "指定しない" },
                  { value: "yes", label: "釣果あり" },
                  { value: "no", label: "釣果なし" },
                ],
              })}
            </div>
          </details>
          <div class="button-row">
            <button class="button" type="button" data-action="search-records">この条件で探す</button>
            <button class="button-secondary" type="button" data-action="clear-search">条件を消す</button>
          </div>
        </div>
      </search>
      ${
        cards.length
          ? `<div class="grid-cards">${cards.join("")}</div>`
          : `<div class="empty-card"><p>この条件では記録が見つかりませんでした場所や魚種の条件をゆるめて試してください</p></div>`
      }
    </section>
  `;
}

async function renderDetailPage(tripId) {
  const trip = appState.trips.find((item) => item.trip_id === tripId);
  if (!trip) {
    return `
      <section class="empty-card">
        <h2 class="page-heading">記録が見つかりませんでした</h2>
        <p>一覧から選び直してください</p>
      </section>
    `;
  }
  const photoHtml = await renderDetailPhotos(trip);
  const related = relatedTripSummary(trip);
  const reflectionReference = reflectionReferenceFor(trip);
  const hasRelated =
    related.samePlaceTrips.length > 0 ||
    related.sameSpeciesTrips.length > 0 ||
    related.sameMethodTrips.length > 0;
  return `
    <section class="summary-card">
      <div class="section-header">
        <div>
          <h2 class="page-heading">${escapeHtml(formatDate(trip.started_at))} の記録</h2>
          <p class="page-lead">${escapeHtml(trip.location_name || trip.location_region || "場所未入力")} / ${escapeHtml(collectSpeciesLabel(trip))}</p>
        </div>
        <div class="button-row">
          <button class="button-secondary" type="button" data-action="duplicate-trip" data-trip-id="${escapeHtml(trip.trip_id)}">記録を複製する</button>
          <button class="button" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.trip_id)}" data-step="detailed_location">まとめて編集する</button>
        </div>
      </div>
      <div class="pill-row">
        ${renderRecordStatePill("final")}
        ${renderResultPill(trip.result?.result_type)}
        ${renderPrivacyPill(trip.privacy_level)}
        <span class="pill">釣果数 ${escapeHtml(String(computeCatchCount(trip)))}匹</span>
        <span class="pill">最大サイズ ${escapeHtml(computeMaxSize(trip) ? `${computeMaxSize(trip)}cm` : "未入力")}</span>
      </div>
    </section>
    ${renderDetailSection("基本情報", "detailed_location", [
      ["釣行日", formatDate(trip.started_at)],
      ["開始", formatDateTime(trip.started_at)],
      ["終了", formatDateTime(trip.ended_at)],
      ["釣行種別", describeLabel("trip_type", trip.trip_type)],
      ["水域", describeLabel("water_type", trip.water_type)],
      ["地域", trip.location_region],
      ["場所名", trip.location_name],
      ["ポイント名", trip.point_name],
      ["立ち位置メモ", trip.standing_position_note],
      ["船名", trip.boat_name],
      ["同行メモ", trip.companion_note],
      ["公開範囲", describeLabel("privacy_level", trip.privacy_level)],
    ])}
    ${renderDetailSection("釣行条件", "detailed_conditions", [
      ["天候", describeLabel("weather", trip.conditions?.weather)],
      ["時間帯", describeLabel("time_band", trip.conditions?.time_band)],
      ["風向き", trip.conditions?.wind_direction],
      ["風の強さ", describeLabel("wind_level", trip.conditions?.wind_level)],
      ["波・うねり", trip.conditions?.wave_level],
      ["潮", describeLabel("tide_name", trip.conditions?.tide_name)],
      ["潮メモ", trip.conditions?.tide_note],
      ["流れメモ", trip.conditions?.flow_note],
      ["水温", trip.conditions?.water_temp_c ? `${trip.conditions.water_temp_c}℃` : ""],
      ["気温", trip.conditions?.air_temp_c ? `${trip.conditions.air_temp_c}℃` : ""],
      ["濁り", describeLabel("water_clarity", trip.conditions?.water_clarity)],
      ["ベイト", describeLabel("yesNoUnknown", trip.conditions?.bait_presence)],
      ["鳥の動き", describeLabel("yesNoUnknown", trip.conditions?.bird_activity)],
      ["状況メモ", trip.conditions?.condition_note],
    ])}
    ${renderDetailSection("釣法・タックル", "detailed_tackle", [
      ["釣法", trip.tackle?.method_name],
      ["ロッド", trip.tackle?.rod_name],
      ["リール", trip.tackle?.reel_name],
      ["ライン", trip.tackle?.line_name],
      ["リーダー", trip.tackle?.leader_name],
      ["ルアー・エサ", trip.tackle?.lure_or_bait_name],
      [
        "重さ",
        trip.tackle?.lure_weight
          ? `${trip.tackle.lure_weight}${trip.tackle?.lure_weight_unit ?? ""}`
          : "",
      ],
      ["カラー", trip.tackle?.color_name],
      ["狙った層", describeLabel("target_range", trip.tackle?.target_range)],
      ["操作メモ", trip.tackle?.action_note],
    ])}
    ${renderDetailSection("釣果", "detailed_result", [
      ["結果", describeLabel("result_type", trip.result?.result_type)],
      ["釣果数", computeCatchCount(trip) ? `${computeCatchCount(trip)}匹` : "0匹"],
      ["釣果メモ", trip.result?.result_note],
      ["時刻", trip.result?.event_time ? formatDateTime(trip.result.event_time) : ""],
      ["使ったルアー", trip.result?.event_lure],
      ["レンジ", describeLabel("target_range", trip.result?.event_range)],
      ["イベントメモ", trip.result?.event_note],
      ["反応なしの理由", trip.result?.reason_note],
      ...(trip.catches ?? []).flatMap((item, index) => [
        [`釣果${index + 1} 魚種`, item.species_name],
        [`釣果${index + 1} サイズ`, item.length_cm ? `${item.length_cm}cm` : ""],
        [`釣果${index + 1} 重さ`, item.weight_g ? `${item.weight_g}g` : ""],
        [`釣果${index + 1} 数`, item.count ? `${item.count}匹` : ""],
        [`釣果${index + 1} 時刻`, item.caught_at ? formatDateTime(item.caught_at) : ""],
        [`釣果${index + 1} ルアー`, item.lure_used],
        [`釣果${index + 1} 層`, describeLabel("target_range", item.hit_range)],
        [`釣果${index + 1} 持ち帰り`, describeLabel("keep_release", item.keep_release)],
        [`釣果${index + 1} メモ`, item.catch_note],
      ]),
    ])}
    <section class="detail-section">
      <div class="section-header">
        <div>
          <h2>写真・メモ</h2>
          <p class="muted">写真はこの端末で保存したものを表示します別端末へ移した記録では、写真メモだけ残る場合があります</p>
        </div>
        <button class="button-secondary" type="button" data-action="edit-trip" data-trip-id="${escapeHtml(trip.trip_id)}" data-step="detailed_photo">この項目を修正する</button>
      </div>
      ${photoHtml}
      <div class="detail-lines">
        <div class="detail-line">
          <strong>今回のまとめ</strong>
          <span>${escapeHtml(trip.trip_summary || "未入力")}</span>
        </div>
        <div class="detail-line">
          <strong>反省点</strong>
          <span>${escapeHtml(trip.reflection_note || "未入力")}</span>
        </div>
        <div class="detail-line">
          <strong>次回に試すこと</strong>
          <span>${escapeHtml(trip.next_try || "未入力")}</span>
        </div>
      </div>
    </section>
    <section class="detail-section">
      <div class="section-header">
        <div>
          <h2>振り返り</h2>
          <p class="muted">共有ではなく、次回の判断材料として見返すための導線です</p>
        </div>
      </div>
      <div class="button-row">
        ${renderRelatedSearchButton({
          label: "同じ場所の記録を見る",
          kind: "location",
          value: related.samePlaceValue,
          disabled: !related.samePlaceTrips.length,
        })}
        ${renderRelatedSearchButton({
          label: "同じ魚種の記録を見る",
          kind: "species",
          value: related.sameSpeciesValue,
          disabled: !related.sameSpeciesTrips.length,
        })}
        ${renderRelatedSearchButton({
          label: "同じ釣法/ルアーの記録を見る",
          kind: related.sameMethodValue ? "method" : "lure",
          value: related.sameMethodValue || related.sameLureValue,
          disabled: !related.sameMethodTrips.length,
        })}
      </div>
      <div class="detail-lines">
        <div class="detail-line">
          <strong>${escapeHtml(reflectionReference.label)}</strong>
          <span>${escapeHtml(reflectionReference.trip?.next_try || "まだ表示できる内容がありません")}</span>
        </div>
        <div class="detail-line">
          <strong>今回の反省点</strong>
          <span>${escapeHtml(trip.reflection_note || "未入力")}</span>
        </div>
        <div class="detail-line">
          <strong>次回試すこと</strong>
          <span>${escapeHtml(trip.next_try || "未入力")}</span>
        </div>
      </div>
      ${
        !hasRelated
          ? `<p class="muted">いまは近い条件の過去記録が見つかっていません</p>`
          : ""
      }
    </section>
  `;
}

function renderBackupPage() {
  const canUseSavePicker = typeof window.showSaveFilePicker === "function";
  const restorePointItems = appState.restorePoints.length
    ? `
        <div class="restore-point-list">
          ${appState.restorePoints
            .map(
              (point) => `
                <article class="status-card">
                  <div class="section-header">
                    <div>
                      <strong>${escapeHtml(point.label || "控え")}</strong>
                      <p class="muted">${escapeHtml(formatDateTime(point.created_at))}</p>
                    </div>
                    <button class="button-secondary" type="button" data-action="restore-point" data-restore-point-id="${escapeHtml(point.id)}">この時点に戻す</button>
                  </div>
                  <p class="muted">保存済み ${escapeHtml(String(point.summary?.trip_count ?? 0))}件 下書き ${escapeHtml(String(point.summary?.draft_count ?? 0))}件</p>
                </article>
              `,
            )
            .join("")}
        </div>
      `
    : `<p class="muted">まだ控えはありません 必要なときだけ残せます</p>`;
  return `
    <section class="backup-card" aria-labelledby="backup-title">
      <div class="section-header">
        <div>
          <h2 class="page-heading" id="backup-title">バックアップ</h2>
          <p class="page-lead">${backupLeadText()}</p>
        </div>
      </div>
      <div class="backup-info">
        <div class="status-row">
          <article class="status-card">
            <strong>いまの保存先</strong>
            <p class="muted">${renderDraftStatusText()}</p>
          </article>
          <article class="status-card">
            <strong>控えの状態</strong>
            <p class="muted">${renderBackupStatusText()}</p>
          </article>
        </div>
        <article class="status-card">
          <strong>このサイトの控え</strong>
          <p class="muted">いまの記録を このサイトの中に控えとして残せます 最大 5 件まで残します</p>
          <div class="button-row">
            <button class="button" type="button" data-action="save-restore-point">この状態を控えとして残す</button>
          </div>
        </article>
        ${restorePointItems}
        <div class="backup-actions">
          <details class="helper-details">
            <summary>別の場所にも控えを置く</summary>
            <div class="button-row">
              <button class="button-secondary" type="button" data-action="export-backup">控えファイルを保存する</button>
            </div>
            <p class="help-text">${backupCrossDeviceText()}</p>
            <div class="backup-note">
              <strong>この控えでできること</strong>
              <p class="help-text">保存済み記録 下書き 最近使った候補を戻せます</p>
              <p class="help-text">写真本体は初版では含みません 写真メモだけ残ります</p>
            </div>
            <div class="backup-note">
              <strong>保存するとき</strong>
              <p class="help-text">${
                canUseSavePicker
                  ? "このブラウザでは保存先を選ぶ画面が開きます 保存先を選んで そのまま保存してください"
                  : "ブラウザや Mac の設定によっては 保存後に控えファイルが Xcode などで開くことがあります 保存自体は完了していることが多いため 開いたアプリは閉じて問題ありません"
              }</p>
            </div>
          </details>
        </div>
        <details class="helper-details restore-review">
          <summary>控えファイルから読み込む</summary>
          <p class="help-text">読み込みは上書きではなく追加で行います 同じ ID がある場合は 新しい ID に振り替えて保存します</p>
          <div class="field">
            <label for="backup_file">読み込む控えファイル</label>
            <input id="backup_file" name="backup_file" type="file" accept=".tsurinote,.json,application/json" />
          </div>
          ${
            appState.pendingRestore
              ? renderRestorePreview(appState.pendingRestore)
              : `<p class="muted">ファイルを選ぶと 読み込み前の確認をここに表示します</p>`
          }
        </details>
        <p class="muted">${backupStepStorageText()}</p>
      </div>
    </section>
  `;
}

function renderSavedPage(tripId) {
  const trip = appState.trips.find((item) => item.trip_id === tripId);
  const related = trip ? relatedTripSummary(trip) : null;
  const reflectionReference = trip ? reflectionReferenceFor(trip) : null;
  const insightSummary = savedInsightSummary(trip, related);
  const hasRelated =
    (related?.samePlaceTrips?.length ?? 0) > 0 ||
    (related?.sameSpeciesTrips?.length ?? 0) > 0 ||
    (related?.sameMethodTrips?.length ?? 0) > 0;
  return `
    <section class="hero-card" aria-labelledby="saved-title">
      <div>
        <h2 class="page-heading" id="saved-title">記録を残しました</h2>
        <p class="page-lead">${escapeHtml(savedPageLeadText(trip))}</p>
      </div>
      ${
        trip
          ? `<article class="summary-card">
              <div class="pill-row">
                ${renderRecordStatePill("final")}
                ${renderResultPill(trip.result?.result_type)}
                ${renderPrivacyPill(trip.privacy_level)}
              </div>
              <div class="detail-lines">
                <div class="detail-line">
                  <strong>釣行日</strong>
                  <span>${escapeHtml(formatDate(trip.started_at))}</span>
                </div>
                <div class="detail-line">
                  <strong>場所</strong>
                  <span>${escapeHtml(trip.location_name || trip.location_region || "未入力")}</span>
                </div>
                <div class="detail-line">
                  <strong>主な魚種</strong>
                  <span>${escapeHtml(collectSpeciesLabel(trip))}</span>
                </div>
                <div class="detail-line">
                  <strong>結果分類</strong>
                  <span>${escapeHtml(describeLabel("result_type", trip.result?.result_type))}</span>
                </div>
              </div>
            </article>`
          : ""
      }
      ${
        trip
          ? `<article class="summary-card">
              <div class="detail-lines">
                <div class="detail-line">
                  <strong>今回の学び</strong>
                  <span>${escapeHtml(insightSummary.insight)}</span>
                </div>
                <div class="detail-line">
                  <strong>次に見たい記録</strong>
                  <span>${escapeHtml(insightSummary.related)}</span>
                </div>
                <div class="detail-line">
                  <strong>次回に試すこと</strong>
                  <span>${escapeHtml(insightSummary.nextTry)}</span>
                </div>
              </div>
              <div class="button-row">
                <button class="button-secondary" type="button" data-action="goto-backup">控えを保存する</button>
              </div>
              <p class="muted">${savedBackupHintText()}</p>
            </article>`
          : ""
      }
      ${
        trip?.photos?.length
          ? `<article class="status-card">
              <strong>写真について</strong>
              <p class="muted">この記録の写真本体はいまの端末に保存しています 初版では 控えファイルだけで別端末へ移すことはできません</p>
            </article>`
          : ""
      }
      ${
        trip
          ? `<article class="summary-card">
              <details class="helper-details" ${hasRelated ? "open" : ""}>
                <summary>振り返りを見る</summary>
                <div class="detail-lines">
                  <div class="detail-line">
                    <strong>${escapeHtml(reflectionReference?.label || "前回の「次回試すこと」")}</strong>
                    <span>${escapeHtml(reflectionReference?.trip?.next_try || "まだ表示できる内容がありません")}</span>
                  </div>
                  <div class="detail-line">
                    <strong>今回の反省点</strong>
                    <span>${escapeHtml(trip.reflection_note || "未入力")}</span>
                  </div>
                  <div class="detail-line">
                    <strong>次回試すこと</strong>
                    <span>${escapeHtml(trip.next_try || "未入力")}</span>
                  </div>
                </div>
                ${
                  hasRelated
                    ? `<div class="button-row">
                        ${renderRelatedSearchButton({
                          label: "同じ場所の過去記録を見る",
                          kind: "location",
                          value: related?.samePlaceValue || "",
                          disabled: !related?.samePlaceTrips?.length,
                        })}
                        ${renderRelatedSearchButton({
                          label: "同じ魚種の過去記録を見る",
                          kind: "species",
                          value: related?.sameSpeciesValue || "",
                          disabled: !related?.sameSpeciesTrips?.length,
                        })}
                        ${renderRelatedSearchButton({
                          label: "同じ釣法/ルアーの過去記録を見る",
                          kind: related?.sameMethodValue ? "method" : "lure",
                          value: related?.sameMethodValue || related?.sameLureValue || "",
                          disabled: !related?.sameMethodTrips?.length,
                        })}
                      </div>`
                    : `<p class="muted">いまは近い条件の過去記録が見つかっていません</p>`
                }
              </details>
            </article>`
          : ""
      }
      <div class="button-row">
        ${renderSavedPrimaryAction(trip, related)}
        <button class="button-secondary" type="button" data-action="goto-home">ホームへ戻る</button>
        ${
          trip
            ? `<button class="button-secondary" type="button" data-action="open-detail" data-trip-id="${escapeHtml(trip.trip_id)}">記録詳細を見る</button>`
            : ""
        }
        <button class="button-secondary" type="button" data-home-action="new">続けて新しく記録する</button>
      </div>
    </section>
  `;
}

function renderStepFields(stepId, bundle) {
  if (isCardQuestionMode(bundle) && isQuestionStep(bundle, stepId)) {
    const question = getQuestionById(bundle, stepId);
    if (question) {
      return renderQuestionCardStep(question, bundle);
    }
  }
  switch (stepId) {
    case "start":
      return renderStartStep(bundle);
    case "quick_capture":
      return renderQuickCaptureStep(bundle);
    case "basic":
      return renderBasicStep(bundle);
    case "conditions":
      return renderConditionsStep(bundle);
    case "tackle":
      return renderTackleStep(bundle);
    case "result":
      return renderResultStep(bundle);
    case "photos_memo":
      return renderPhotosStep(bundle);
    case "confirm":
      return renderConfirmStep(bundle);
    default:
      return "";
  }
}

function renderQuestionMetaActions(question) {
  if (question.id === "quick_photo" || question.id === "photo_first_photo") {
    return "";
  }
  const actions = [];
  if (question.allowSkip) {
    actions.push(
      `<button class="button-secondary" type="button" data-action="question-skip" data-question-id="${escapeHtml(question.id)}">この記録では入力しない</button>`,
    );
  }
  if (!actions.length) {
    return "";
  }
  return `<div class="button-row">${actions.join("")}</div>`;
}

function renderQuestionHeaderAction(question, stepId) {
  if (!question || stepId === "start" || stepId === "confirm") {
    return "";
  }
  if (!question.allowDefer || question.id === "quick_photo" || question.id === "photo_first_photo") {
    return "";
  }
  return `<button class="button-secondary" type="button" data-action="question-defer" data-question-id="${escapeHtml(question.id)}">あとで入力</button>`;
}

function renderQuestionCardStep(question, bundle) {
  const shouldAnimate = appState.lastQuestionMotionKey !== question.id;
  return `
    <div class="${shouldAnimate ? "question-card-motion" : ""}" data-question-motion-key="${escapeHtml(question.id)}">
      <p class="question-section-label">${escapeHtml(QUESTION_SECTION_LABELS[question.section] || question.section)}</p>
      ${renderQuestionCardBody(question, bundle)}
      ${question.id.startsWith("detailed_") ? "" : renderDraftSummaryAccordion(bundle)}
      ${renderQuestionMetaActions(question)}
    </div>
  `;
}

function renderQuestionCardBody(question, bundle) {
  switch (question.id) {
    case "quick_result":
      return renderQuickResultQuestion(bundle);
    case "quick_location":
      return renderQuickLocationQuestion(bundle);
    case "quick_reason":
      return renderQuickReasonQuestion(bundle);
    case "quick_tackle":
      return renderQuickTackleQuestion(bundle);
    case "quick_photo":
      return renderQuickPhotoQuestion(bundle, { requirePhoto: false });
    case "quick_memo":
      return renderQuickMemoCard(bundle);
    case "quick_next":
      return renderQuickMemoQuestion(bundle, {
        label: "次回試すこと",
        path: "trip.next_try",
        hint: "思いついたことだけ短く残せます",
      });
    case "photo_first_photo":
      return renderQuickPhotoQuestion(bundle, { requirePhoto: true });
    case "photo_first_memo":
      return renderQuickMemoQuestion(bundle, {
        label: "写真のひとことメモ",
        path: "trip.trip_summary",
        hint: "場所や状況を短く残しておくと、あとで追記しやすくなります",
      });
    case "detailed_result":
      return renderResultStep(bundle);
    case "detailed_location":
      return `${renderBasicStep(bundle)}${renderDraftSummaryAccordion(bundle)}`;
    case "detailed_conditions":
      return `${renderConditionsStep(bundle)}${renderDraftSummaryAccordion(bundle)}`;
    case "detailed_tackle":
      return `${renderTackleStep(bundle)}${renderDraftSummaryAccordion(bundle)}`;
    case "detailed_photo":
      return `${renderPhotosStep(bundle)}${renderDraftSummaryAccordion(bundle)}`;
    case "detailed_memo":
      return `
        ${renderTextareaField({
          id: "detailed_summary",
          label: "ひとことメモ",
          value: bundle.trip.trip_summary || "",
          path: "trip.trip_summary",
        })}
        ${renderTextareaField({
          id: "detailed_reflection",
          label: "反省点",
          value: bundle.trip.reflection_note || "",
          path: "trip.reflection_note",
        })}
        ${renderDraftSummaryAccordion(bundle)}
      `;
    case "detailed_next":
      return `
        ${renderQuickMemoQuestion(bundle, {
          label: "次回試すこと",
          path: "trip.next_try",
          hint: "最後に一言だけでも残しておくと、次に見返しやすくなります",
        })}
        ${renderDraftSummaryAccordion(bundle)}
      `;
    default:
      return "";
  }
}

function renderQuickResultQuestion(bundle) {
  const selectedChoice = getQuestionChoice(bundle, "quick_result") || bundle.trip.result.result_type || "no_response";
  return `
    ${renderQuestionChoiceFieldset(
      "quick_result",
      "今日の結果は？",
      "まずはいちばん近いものを選んでください",
      [
        { value: "caught", label: "釣れた", description: "結果だけ先に残します" },
        { value: "bite_only", label: "アタリのみ", description: "反応があった日として残します" },
        { value: "chase_only", label: "チェイスのみ", description: "追ってきた反応を残します" },
        { value: "no_response", label: "反応なし", description: "次回のヒントとして残します" },
      ],
      selectedChoice,
    )}
    ${
      selectedChoice === "no_response"
        ? `<article class="status-card"><strong>反応なしの日も大切な記録です</strong><p class="muted">今日は釣れなかった条件として残しておくと、次の釣行で見返しやすくなります</p></article>`
        : ""
    }
  `;
}

function renderQuickLocationQuestion(bundle) {
  const { previousTrip, recent } = recentLocationOptions();
  const selectedChoice = getQuestionChoice(bundle, "quick_location");
  const primaryOptions = [];
  const extraOptions = [];
  if (previousTrip && locationLabelFromTrip(previousTrip)) {
    primaryOptions.push({
      value: "previous",
      label: `前回と同じ`,
      description: locationLabelFromTrip(previousTrip),
    });
  }
  recent.slice(0, 2).forEach((item, index) => {
    primaryOptions.push({
      value: `recent_${index}`,
      label: "最近使った場所",
      description: item,
    });
  });
  recent.slice(2).forEach((item, index) => {
    extraOptions.push({
      value: `recent_${index + 2}`,
      label: "最近使った場所",
      description: item,
    });
  });
  primaryOptions.push({ value: "manual", label: "新しく入力", description: "自分で場所を書く" });
  return `
    ${renderQuestionChoiceFieldset(
      "quick_location",
      "場所は？",
      "前回や最近の候補から選べます",
      primaryOptions,
      selectedChoice,
      extraOptions,
    )}
    ${
      selectedChoice === "manual"
        ? renderTextField({
            id: "quick_location_manual",
            label: "場所",
            value: bundle.trip.location_region || bundle.trip.location_name || "",
            path: "trip.location_region",
            errorPath: "trip.location_region",
            hint: "例: 大阪北港、南港、淀川",
          })
        : ""
    }
  `;
}

function renderQuickReasonQuestion(bundle) {
  const quickReasonQuestion = QUESTION_DEFINITIONS.quick.find((question) => question.id === "quick_reason");
  const selectedChoice = getQuestionChoice(bundle, "quick_reason");
  const allOptions = (quickReasonQuestion?.options || []).filter((option) => option.value !== "manual");
  return `
    ${renderQuestionChoiceFieldset(
      "quick_reason",
      "反応なしの理由は？",
      "反応なしの日も、次の釣行のヒントになります",
      allOptions.slice(0, 4).map((option) => ({ value: option.value, label: option.label })),
      selectedChoice,
      [
        ...allOptions.slice(4).map((option) => ({ value: option.value, label: option.label })),
        { value: "manual", label: "自由に書く", description: "理由を自分で書く" },
      ],
    )}
    ${
      selectedChoice === "manual"
        ? renderTextareaField({
            id: "quick_reason_manual",
            label: "理由メモ",
            value: bundle.trip.result.reason_note || "",
            path: "trip.result.reason_note",
          })
        : ""
    }
  `;
}

function renderQuickTackleQuestion(bundle) {
  const { previousTrip, recent } = recentLureOptions();
  const selectedChoice = getQuestionChoice(bundle, "quick_tackle");
  const primaryOptions = [];
  const extraOptions = [];
  if (previousTrip?.tackle?.lure_or_bait_name) {
    primaryOptions.push({
      value: "previous",
      label: "前回と同じ",
      description: previousTrip.tackle.lure_or_bait_name,
    });
  }
  recent.slice(0, 2).forEach((item, index) => {
    primaryOptions.push({
      value: `recent_${index}`,
      label: "最近使ったルアー/餌",
      description: item,
    });
  });
  recent.slice(2).forEach((item, index) => {
    extraOptions.push({
      value: `recent_${index + 2}`,
      label: "最近使ったルアー/餌",
      description: item,
    });
  });
  primaryOptions.push({ value: "manual", label: "新しく入力", description: "自分で書く" });
  return `
    ${renderQuestionChoiceFieldset(
      "quick_tackle",
      "使ったものは？",
      "前回や最近の候補から選べます",
      primaryOptions,
      selectedChoice,
      extraOptions,
    )}
    ${
      selectedChoice === "manual"
        ? renderTextField({
            id: "quick_lure_manual",
            label: "ルアー・エサ",
            value: bundle.trip.tackle.lure_or_bait_name || "",
            path: "trip.tackle.lure_or_bait_name",
            datalistKey: "lures",
          })
        : ""
    }
  `;
}

function renderQuickPhotoQuestion(bundle, options = {}) {
  const selectedChoice = getQuestionChoice(bundle, options.requirePhoto ? "photo_first_photo" : "quick_photo");
  const questionId = options.requirePhoto ? "photo_first_photo" : "quick_photo";
  return `
    ${renderQuestionChoiceFieldset(
      questionId,
      options.requirePhoto ? "写真だけ先に保存しますか？" : "写真は追加しますか？",
      options.requirePhoto ? "写真を追加すると、この端末に保存します" : "写真はあとで追加できます",
      [
        { value: "add", label: "写真を追加", description: "いま追加する" },
        { value: "defer", label: "あとで追加", description: "あとで追記する" },
        ...(options.requirePhoto ? [] : [{ value: "skip", label: "なし", description: "この記録では追加しない" }]),
      ],
      selectedChoice,
    )}
    ${
      selectedChoice === "add" || bundle.trip.photos.length
        ? `
          <div class="field">
            <label for="photo_upload">写真を追加する</label>
            <input id="photo_upload" type="file" accept="${escapeHtml(IMAGE_FILE_ACCEPT)}" multiple />
            <p class="field-hint">${escapeHtml(compactPhotoSummaryLabel(bundle.trip.photos.length))}</p>
            <p class="field-hint">iPhone の HEIC も選べますブラウザによっては表示用画像を作れないことがあります</p>
          </div>
          <div class="photo-list">
            ${
              bundle.trip.photos.length
                ? bundle.trip.photos.map((item, index) => renderQuickCapturePhotoCard(item, index)).join("")
                : `<article class="empty-card"><p>まだ写真はありません</p></article>`
            }
          </div>
        `
        : ""
    }
  `;
}

function renderQuickMemoQuestion(bundle, options) {
  return `
    ${renderTextareaField({
      id: `${escapeHtml(options.path)}_field`,
      label: options.label,
      value: getByPath(bundle, options.path) || "",
      path: options.path,
      hint: options.hint,
    })}
  `;
}

function renderQuickMemoCard(bundle) {
  return renderQuickMemoQuestion(bundle, {
    label: "ひとことメモ",
    path: "trip.trip_summary",
    hint: "思い出せる一言だけでも残せます",
  });
}

function renderQuickCapturePhotoCard(item, index) {
  const previewUrl =
    appState.mediaCache.get(item.thumb_blob_key || item.medium_blob_key || item.original_blob_key) ?? "";
  const previewBody = isPhotoPreviewUnavailable(item)
    ? renderUnavailablePhotoPlaceholder(
        item,
        "このブラウザでは HEIC の表示用画像を作れませんでした原本はこの端末に保存しています",
      )
    : previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="追加した写真のサムネイル" />`
      : `<div class="record-card__media"><div class="record-card__placeholder">写真の読み込み準備中です</div></div>`;
  return `
    <article class="photo-card">
      <div class="section-header">
        <div>
          <h3 class="section-title">写真 ${index + 1}</h3>
          <p class="muted">${item.photo_role === "main" ? "代表写真として使います" : "あとで種類や説明を追記できます"}</p>
        </div>
        <div class="button-row">
          <button class="button-danger" type="button" data-action="remove-photo" data-index="${index}">写真を削除する</button>
        </div>
      </div>
      <div class="photo-card__preview">
        ${previewBody}
      </div>
    </article>
  `;
}

function renderQuickCaptureStep(bundle) {
  const resultType = bundle.trip.result.result_type || "no_response";
  return `
    <article class="status-card">
      <strong>その場で先に残す内容</strong>
      <p class="muted">結果、場所、使ったもの、写真だけ先に残します細かいことはあとで追記できます</p>
    </article>
    <div class="field">
      <label for="photo_upload">写真を追加する</label>
      <input id="photo_upload" type="file" accept="${escapeHtml(IMAGE_FILE_ACCEPT)}" multiple />
      <p class="field-hint">${escapeHtml(compactPhotoSummaryLabel(bundle.trip.photos.length))}</p>
      <p class="field-hint">iPhone の HEIC も選べますブラウザによっては表示用画像を作れないことがあります</p>
    </div>
    ${
      bundle.trip.photos.length
        ? `<div class="photo-list">${bundle.trip.photos.map((item, index) => renderQuickCapturePhotoCard(item, index)).join("")}</div>`
        : ""
    }
    ${renderRadioCardFieldset({
      legend: "結果",
      path: "trip.result.result_type",
      value: resultType,
      options: groupOptions("result_type"),
      rerender: true,
      errorPath: "trip.result.result_type",
    })}
    ${
      resultType === "caught"
        ? `
          <div class="catch-list" data-focus-path="trip.catches" tabindex="-1">
            ${
              bundle.trip.catches.length
                ? bundle.trip.catches.map((item, index) => renderCatchCard(item, index, { compact: true })).join("")
                : `<article class="empty-card"><p>釣れた場合は「釣果を追加する」から魚種を残してください</p></article>`
            }
          </div>
          <div class="button-row">
            <button class="button-secondary" type="button" data-action="add-catch">釣果を追加する</button>
          </div>
        `
        : ""
    }
    ${
      resultType === "bite_only" || resultType === "chase_only"
        ? `
          <div class="form-grid form-grid--two">
            ${renderTextField({
              id: "event_time_quick",
              label: "反応があった時刻",
              value: bundle.trip.result.event_time || "",
              type: "datetime-local",
              path: "trip.result.event_time",
            })}
            ${renderSelectField({
              id: "event_range_quick",
              label: "レンジ",
              value: bundle.trip.result.event_range || "unknown",
              path: "trip.result.event_range",
              options: selectOptions("target_range"),
            })}
          </div>
          ${renderTextareaField({
            id: "event_note_quick",
            label: "反応メモ",
            value: bundle.trip.result.event_note || "",
            path: "trip.result.event_note",
          })}
        `
        : ""
    }
    ${
      resultType === "no_response"
        ? `
          ${renderTextareaField({
            id: "reason_note_quick",
            label: "反応なしの理由メモ",
            value: bundle.trip.result.reason_note || "",
            path: "trip.result.reason_note",
          })}
          ${renderTextareaField({
            id: "result_note_quick",
            label: "全体メモ",
            value: bundle.trip.result.result_note || "",
            path: "trip.result.result_note",
          })}
        `
        : ""
    }
    <div class="form-grid form-grid--two">
      ${renderTextField({
        id: "started_at_quick",
        label: "開始日時",
        value: bundle.trip.started_at || "",
        type: "datetime-local",
        path: "trip.started_at",
        errorPath: "trip.started_at",
      })}
      ${renderTextField({
        id: "location_region_quick",
        label: "地域",
        value: bundle.trip.location_region || "",
        path: "trip.location_region",
        errorPath: "trip.location_region",
        datalistKey: "locationRegions",
      })}
      ${renderTextField({
        id: "location_name_quick",
        label: "場所名",
        value: bundle.trip.location_name || "",
        path: "trip.location_name",
        datalistKey: "locationNames",
      })}
      ${renderTextField({
        id: "method_name_quick",
        label: "釣法",
        value: bundle.trip.tackle.method_name || "",
        path: "trip.tackle.method_name",
        datalistKey: "methods",
      })}
      ${renderTextField({
        id: "lure_or_bait_name_quick",
        label: "ルアー・エサ",
        value: bundle.trip.tackle.lure_or_bait_name || "",
        path: "trip.tackle.lure_or_bait_name",
        datalistKey: "lures",
      })}
    </div>
    <div class="form-grid form-grid--two">
      ${renderRadioCardFieldset({
        legend: "釣行種別",
        path: "trip.trip_type",
        value: bundle.trip.trip_type,
        options: groupOptions("trip_type"),
        rerender: true,
        errorPath: "trip.trip_type",
      })}
      ${renderRadioCardFieldset({
        legend: "水域",
        path: "trip.water_type",
        value: bundle.trip.water_type,
        options: groupOptions("water_type"),
        rerender: true,
        errorPath: "trip.water_type",
      })}
    </div>
    ${renderTextareaField({
      id: "trip_summary_quick",
      label: "ひとことメモ",
      value: bundle.trip.trip_summary || "",
      path: "trip.trip_summary",
    })}
    <article class="status-card">
      <strong>あとで追記できます</strong>
      <p class="muted">保存後に天候 潮 タックル 反省点を追記できます</p>
    </article>
  `;
}

function deriveStartEntryChoice(bundle) {
  if (bundle.start_context.record_mode === "photo_first") {
    return "photo_first";
  }
  if (bundle.start_context.start_method === "reuse_last") {
    return "reuse_last";
  }
  if (bundle.start_context.record_mode === "detailed") {
    return "detailed";
  }
  return "quick";
}

function renderStartStep(bundle) {
  return `
    ${renderRadioCardFieldset({
      legend: "最初の記録のしかた",
      path: "start_context.entry_choice",
      value: deriveStartEntryChoice(bundle),
      options: [
        {
          value: "quick",
          label: "今すぐ記録",
          description: "結果、場所、道具だけ先に残します",
        },
        {
          value: "photo_first",
          label: "写真だけ保存",
          description: "写真だけ先に追加して あとで追記します",
        },
        {
          value: "reuse_last",
          label: "前回を使う",
          description: appState.trips.length
            ? "前回の内容を土台にして 違うところだけ直します"
            : "前回の記録がないときは 空白から始めます",
        },
        {
          value: "detailed",
          label: "しっかり記録",
          description: "最初からくわしく入れたいときだけ使います",
        },
      ],
      rerender: true,
      immediateSave: true,
    })}
    <article class="status-card">
      <strong>最初は短く残して、あとで足せます</strong>
      <p class="muted">保存したあとに まとめて編集から必要な項目を足せます</p>
      <div class="button-row">
        <button class="button-secondary" type="button" data-action="open-detail-guide">あとで追加できる項目を見る</button>
      </div>
    </article>
    <p class="help-text">${recordStorageIntroText()}</p>
  `;
}

function renderBasicStep(bundle) {
  const quick = bundle.start_context.record_mode === "quick";
  const detailOnlyFields = `
    ${
      isShoreLike(bundle.trip.trip_type)
        ? `<div class="form-grid form-grid--two">
            ${renderTextField({
              id: "point_name",
              label: "ポイント名",
              value: bundle.trip.point_name || "",
              path: "trip.point_name",
              datalistKey: "pointNames",
            })}
            ${renderTextField({
              id: "standing_position_note",
              label: "立ち位置メモ",
              value: bundle.trip.standing_position_note || "",
              path: "trip.standing_position_note",
            })}
          </div>`
        : ""
    }
    ${
      isBoatLike(bundle.trip.trip_type)
        ? renderTextField({
            id: "boat_name",
            label: "船名",
            value: bundle.trip.boat_name || "",
            path: "trip.boat_name",
            datalistKey: "boatNames",
          })
        : ""
    }
    ${renderTextareaField({
      id: "companion_note",
      label: "同行メモ",
      value: bundle.trip.companion_note || "",
      path: "trip.companion_note",
      })}
  `;
  return `
    <div class="form-grid form-grid--two">
      ${renderTextField({
        id: "started_at",
        label: "開始日時",
        value: bundle.trip.started_at || "",
        type: "datetime-local",
        path: "trip.started_at",
        errorPath: "trip.started_at",
      })}
      ${
        !quick
          ? renderTextField({
              id: "ended_at",
              label: "終了日時",
              value: bundle.trip.ended_at || "",
              type: "datetime-local",
              path: "trip.ended_at",
              errorPath: "trip.ended_at",
            })
          : renderTextField({
              id: "location_region",
              label: "地域",
              value: bundle.trip.location_region || "",
              path: "trip.location_region",
              errorPath: "trip.location_region",
              datalistKey: "locationRegions",
              hint: "例: 大阪湾、瀬戸内海、淀川",
            })
      }
    </div>
    ${renderRadioCardFieldset({
      legend: "釣行種別",
      path: "trip.trip_type",
      value: bundle.trip.trip_type,
      options: groupOptions("trip_type"),
      rerender: true,
      errorPath: "trip.trip_type",
    })}
    ${renderRadioCardFieldset({
      legend: "水域",
      path: "trip.water_type",
      value: bundle.trip.water_type,
      options: groupOptions("water_type"),
      rerender: true,
      errorPath: "trip.water_type",
    })}
    <div class="form-grid form-grid--two">
      ${
        !quick
          ? renderTextField({
              id: "location_region",
              label: "地域",
              value: bundle.trip.location_region || "",
              path: "trip.location_region",
              errorPath: "trip.location_region",
              datalistKey: "locationRegions",
              hint: "例: 大阪湾、瀬戸内海、淀川",
            })
          : renderTextField({
              id: "location_name",
              label: "場所名",
              value: bundle.trip.location_name || "",
              path: "trip.location_name",
              datalistKey: "locationNames",
            })
      }
      ${
        !quick
          ? renderTextField({
              id: "location_name",
              label: "場所名",
              value: bundle.trip.location_name || "",
              path: "trip.location_name",
              datalistKey: "locationNames",
            })
          : ""
      }
    </div>
    ${
      quick
        ? `<details>
            <summary>終了時刻や場所の詳細を入れる</summary>
            <div class="form-grid">
              ${renderTextField({
                id: "ended_at",
                label: "終了日時",
                value: bundle.trip.ended_at || "",
                type: "datetime-local",
                path: "trip.ended_at",
                errorPath: "trip.ended_at",
              })}
              ${detailOnlyFields}
            </div>
          </details>`
        : detailOnlyFields
    }
    ${renderRadioCardFieldset({
      legend: "公開範囲",
      path: "trip.privacy_level",
      value: bundle.trip.privacy_level,
      options: groupOptions("privacy_level"),
      errorPath: "trip.privacy_level",
    })}
  `;
}

function renderConditionsStep(bundle) {
  const quick = bundle.start_context.record_mode === "quick";
  const seaLike = isSeaLike(bundle.trip.water_type);
  const showWaveField = seaLike || isBoatLike(bundle.trip.trip_type);
  const detailFields = `
    ${
      seaLike
        ? renderTextField({
            id: "tide_note",
            label: "潮メモ",
            value: bundle.trip.conditions.tide_note || "",
            path: "trip.conditions.tide_note",
          })
        : ""
    }
    <div class="form-grid form-grid--two">
      ${renderNumberField({
        id: "water_temp_c",
        label: "水温",
        value: bundle.trip.conditions.water_temp_c,
        path: "trip.conditions.water_temp_c",
        unit: "℃",
      })}
      ${renderNumberField({
        id: "air_temp_c",
        label: "気温",
        value: bundle.trip.conditions.air_temp_c,
        path: "trip.conditions.air_temp_c",
        unit: "℃",
      })}
      ${renderSelectField({
        id: "bait_presence",
        label: "ベイト",
        value: bundle.trip.conditions.bait_presence || "unknown",
        path: "trip.conditions.bait_presence",
        options: selectOptions("yesNoUnknown"),
      })}
      ${renderSelectField({
        id: "bird_activity",
        label: "鳥の動き",
        value: bundle.trip.conditions.bird_activity || "unknown",
        path: "trip.conditions.bird_activity",
        options: selectOptions("yesNoUnknown"),
      })}
    </div>
  `;
  return `
    <div class="form-grid form-grid--two">
      ${renderSelectField({
        id: "weather",
        label: "天候",
        value: bundle.trip.conditions.weather || "unknown",
        path: "trip.conditions.weather",
        options: selectOptions("weather"),
      })}
      ${renderSelectField({
        id: "time_band",
        label: "時間帯",
        value: bundle.trip.conditions.time_band || "unknown",
        path: "trip.conditions.time_band",
        options: selectOptions("time_band"),
      })}
      ${renderTextField({
        id: "wind_direction",
        label: "風向き",
        value: bundle.trip.conditions.wind_direction || "",
        path: "trip.conditions.wind_direction",
      })}
      ${renderSelectField({
        id: "wind_level",
        label: "風の強さ",
        value: bundle.trip.conditions.wind_level || "unknown",
        path: "trip.conditions.wind_level",
        options: selectOptions("wind_level"),
      })}
    </div>
    <div class="form-grid form-grid--two">
      ${
        seaLike
          ? renderSelectField({
              id: "tide_name",
              label: "潮",
              value: bundle.trip.conditions.tide_name || "unknown",
              path: "trip.conditions.tide_name",
              options: selectOptions("tide_name"),
            })
          : ""
      }
      ${
        showWaveField
          ? renderTextField({
              id: "wave_level",
              label: isBoatLike(bundle.trip.trip_type) ? "波・うねり" : "波の様子",
              value: bundle.trip.conditions.wave_level || "",
              path: "trip.conditions.wave_level",
            })
          : ""
      }
      ${renderSelectField({
        id: "water_clarity",
        label: "濁り",
        value: bundle.trip.conditions.water_clarity || "unknown",
        path: "trip.conditions.water_clarity",
        options: selectOptions("water_clarity"),
      })}
      ${
        isFreshwater(bundle.trip.water_type)
          ? renderTextField({
              id: "flow_note",
              label: "流れメモ",
              value: bundle.trip.conditions.flow_note || "",
              path: "trip.conditions.flow_note",
            })
          : ""
      }
    </div>
    ${renderTextareaField({
      id: "condition_note",
      label: "状況メモ",
      value: bundle.trip.conditions.condition_note || "",
      path: "trip.conditions.condition_note",
    })}
    ${
      quick
        ? `<details>
            <summary>水温やベイトをくわしく入れる</summary>
            <div class="form-grid">${detailFields}</div>
          </details>`
        : detailFields
    }
  `;
}

function renderTackleStep(bundle) {
  const quick = bundle.start_context.record_mode === "quick";
  const detailContent = `
    <div class="form-grid form-grid--two">
      ${renderTextField({
        id: "rod_name",
        label: "ロッド",
        value: bundle.trip.tackle.rod_name || "",
        path: "trip.tackle.rod_name",
        datalistKey: "rods",
      })}
      ${renderTextField({
        id: "reel_name",
        label: "リール",
        value: bundle.trip.tackle.reel_name || "",
        path: "trip.tackle.reel_name",
        datalistKey: "reels",
      })}
      ${renderTextField({
        id: "line_name",
        label: "ライン",
        value: bundle.trip.tackle.line_name || "",
        path: "trip.tackle.line_name",
        datalistKey: "lines",
      })}
      ${renderTextField({
        id: "leader_name",
        label: "リーダー",
        value: bundle.trip.tackle.leader_name || "",
        path: "trip.tackle.leader_name",
        datalistKey: "leaders",
      })}
      ${renderTextField({
        id: "color_name",
        label: "カラー",
        value: bundle.trip.tackle.color_name || "",
        path: "trip.tackle.color_name",
      })}
    </div>
    ${renderTextareaField({
      id: "action_note",
      label: "操作メモ",
      value: bundle.trip.tackle.action_note || "",
      path: "trip.tackle.action_note",
    })}
  `;
  return `
    <div class="form-grid form-grid--two">
      ${renderTextField({
        id: "method_name",
        label: "釣法",
        value: bundle.trip.tackle.method_name || "",
        path: "trip.tackle.method_name",
        datalistKey: "methods",
      })}
      ${renderTextField({
        id: "lure_or_bait_name",
        label: "ルアー・エサ",
        value: bundle.trip.tackle.lure_or_bait_name || "",
        path: "trip.tackle.lure_or_bait_name",
        datalistKey: "lures",
      })}
    </div>
    <div class="button-row">
      <button class="button-secondary" type="button" data-action="reuse-last-tackle">前回と同じタックルを使う</button>
    </div>
    <div class="form-grid form-grid--two">
      ${renderSelectField({
        id: "target_range",
        label: "狙った層",
        value: bundle.trip.tackle.target_range || "unknown",
        path: "trip.tackle.target_range",
        options: selectOptions("target_range"),
      })}
      ${
        !quick
          ? renderNumberField({
              id: "lure_weight",
              label: "重さ",
              value: bundle.trip.tackle.lure_weight,
              path: "trip.tackle.lure_weight",
              unit: bundle.trip.tackle.lure_weight_unit || "g",
            })
          : ""
      }
      ${
        !quick
          ? renderSelectField({
              id: "lure_weight_unit",
              label: "重さの単位",
              value: bundle.trip.tackle.lure_weight_unit || "g",
              path: "trip.tackle.lure_weight_unit",
              options: [
                { value: "g", label: "g" },
                { value: "oz", label: "oz" },
                { value: "号", label: "号" },
                { value: "other", label: "その他" },
              ],
            })
          : ""
      }
    </div>
    ${
      quick
        ? `<details>
            <summary>重さや道具をくわしく入れる</summary>
            <div class="form-grid form-grid--two">
              ${renderNumberField({
                id: "lure_weight",
                label: "重さ",
                value: bundle.trip.tackle.lure_weight,
                path: "trip.tackle.lure_weight",
                unit: bundle.trip.tackle.lure_weight_unit || "g",
              })}
              ${renderSelectField({
                id: "lure_weight_unit",
                label: "重さの単位",
                value: bundle.trip.tackle.lure_weight_unit || "g",
                path: "trip.tackle.lure_weight_unit",
                options: [
                  { value: "g", label: "g" },
                  { value: "oz", label: "oz" },
                  { value: "号", label: "号" },
                  { value: "other", label: "その他" },
                ],
              })}
            </div>
            ${detailContent}
          </details>`
        : detailContent
    }
  `;
}

function renderResultStep(bundle) {
  const quick = bundle.start_context.record_mode === "quick";
  const resultType = bundle.trip.result.result_type || "no_response";
  return `
    ${renderRadioCardFieldset({
      legend: "結果",
      path: "trip.result.result_type",
      value: resultType,
      options: groupOptions("result_type"),
      rerender: true,
      errorPath: "trip.result.result_type",
    })}
    ${
      resultType === "caught"
        ? `
          <div class="form-grid form-grid--two">
            ${renderNumberField({
              id: "catch_count_total",
              label: "釣果数",
              value: bundle.trip.result.catch_count_total,
              path: "trip.result.catch_count_total",
              unit: "匹",
            })}
          </div>
          <div class="catch-list" data-focus-path="trip.catches" tabindex="-1">
            ${
              bundle.trip.catches.length
                ? bundle.trip.catches.map((item, index) => renderCatchCard(item, index, { compact: quick })).join("")
                : `<article class="empty-card"><p>釣果がある場合は「釣果を追加」から入力してください</p></article>`
            }
          </div>
          <p class="help-text">写真は次の「写真・メモ」で追加できます</p>
          <div class="button-row">
            <button class="button-secondary" type="button" data-action="add-catch">釣果を追加する</button>
          </div>
        `
        : ""
    }
    ${
      resultType === "bite_only" || resultType === "chase_only"
        ? `
          <div class="form-grid form-grid--two">
            ${renderTextField({
              id: "event_time",
              label: "時刻",
              value: bundle.trip.result.event_time || "",
              type: "datetime-local",
              path: "trip.result.event_time",
            })}
            ${renderTextField({
              id: "event_lure",
              label: "ルアー",
              value: bundle.trip.result.event_lure || "",
              path: "trip.result.event_lure",
              datalistKey: "lures",
            })}
            ${renderSelectField({
              id: "event_range",
              label: "レンジ",
              value: bundle.trip.result.event_range || "unknown",
              path: "trip.result.event_range",
              options: selectOptions("target_range"),
            })}
          </div>
          ${renderTextareaField({
            id: "event_note",
            label: "メモ",
            value: bundle.trip.result.event_note || "",
            path: "trip.result.event_note",
          })}
        `
        : ""
    }
    ${
      resultType === "no_response"
        ? `
          ${renderTextareaField({
            id: "result_note",
            label: "全体メモ",
            value: bundle.trip.result.result_note || "",
            path: "trip.result.result_note",
          })}
          ${renderTextareaField({
            id: "reason_note",
            label: "反応なしの理由メモ",
            value: bundle.trip.result.reason_note || "",
            path: "trip.result.reason_note",
          })}
          ${renderTextareaField({
            id: "next_try_result",
            label: "次回試すこと",
            value: bundle.trip.next_try || "",
            path: "trip.next_try",
          })}
        `
        : ""
    }
    ${
      resultType === "caught"
        ? renderTextareaField({
            id: "result_note_caught",
            label: "釣果メモ",
            value: bundle.trip.result.result_note || "",
            path: "trip.result.result_note",
          })
        : ""
    }
  `;
}

function renderPhotosStep(bundle) {
  return `
    <div class="field">
      <label for="photo_upload">写真を追加する</label>
      <input id="photo_upload" type="file" accept="${escapeHtml(IMAGE_FILE_ACCEPT)}" multiple />
      <p class="field-hint">写真はこの端末に保存します</p>
      <p class="field-hint">iPhone の HEIC も選べますブラウザによっては表示用画像を作れないことがあります</p>
    </div>
    <div class="photo-list">
      ${
        bundle.trip.photos.length
          ? bundle.trip.photos.map((item, index) => renderPhotoCard(item, index)).join("")
          : `<article class="empty-card"><p>まだ写真はありません必要な場合だけ追加してください</p></article>`
      }
    </div>
    ${renderTextareaField({
      id: "trip_summary",
      label: "ひとことメモ",
      value: bundle.trip.trip_summary || "",
      path: "trip.trip_summary",
    })}
    <details class="helper-details">
      <summary>反省点や次回に試すことを書く</summary>
      <div class="form-grid">
        ${renderTextareaField({
          id: "reflection_note",
          label: "反省点",
          value: bundle.trip.reflection_note || "",
          path: "trip.reflection_note",
        })}
        ${renderTextareaField({
          id: "next_try",
          label: "次回に試すこと",
          value: bundle.trip.next_try || "",
          path: "trip.next_try",
        })}
      </div>
    </details>
  `;
}

function renderConfirmStep(bundle) {
  if (isCardQuestionMode(bundle)) {
    return renderQuestionModeConfirmStep(bundle);
  }
  const trip = bundle.trip;
  return `
    <article class="summary-card">
      <div class="section-header">
        <div>
          <h3 class="section-title">保存前の確認</h3>
          <p class="muted">いま表示されている条件に合う内容だけを確認します非表示になった値は保存直前まで保持し、不要な値だけ最後に整理します</p>
        </div>
      </div>
      ${renderConfirmSection("基本情報", "basic", buildConfirmBasicRows(trip))}
      ${renderConfirmSection("釣行条件", "conditions", buildConfirmConditionRows(trip))}
      ${renderConfirmSection("釣法・タックル", "tackle", buildConfirmTackleRows(trip))}
      ${renderConfirmSection("釣果", "result", buildConfirmResultRows(trip))}
      ${renderConfirmSection("写真・メモ", "photos_memo", buildConfirmPhotoRows(trip))}
    </article>
  `;
}

function renderQuestionModeConfirmStep(bundle) {
  const trip = bundle.trip;
  const mode = getQuestionMode(bundle);
  if (mode === "detailed") {
    return `
      <article class="summary-card">
        <div class="section-header">
          <div>
            <h3 class="section-title">保存前の確認</h3>
            <p class="muted">必要な項目だけ戻って直せます</p>
          </div>
        </div>
        ${renderConfirmSection("結果", "detailed_result", buildConfirmResultRows(trip))}
        ${renderConfirmSection("基本情報", "detailed_location", buildConfirmBasicRows(trip))}
        ${renderConfirmSection("釣行条件", "detailed_conditions", buildConfirmConditionRows(trip))}
        ${renderConfirmSection("釣法・タックル", "detailed_tackle", buildConfirmTackleRows(trip))}
        ${renderConfirmSection("写真・メモ", "detailed_photo", buildConfirmPhotoRows(trip))}
        ${renderConfirmSection("次回試すこと", "detailed_next", [["次回に試すこと", trip.next_try || "未入力"]])}
      </article>
    `;
  }
  const questionMap = {
    result: mode === "photo_first" ? "photo_first_photo" : "quick_result",
    location: "quick_location",
    target: "quick_reason",
    tackle: "quick_tackle",
    photo: mode === "photo_first" ? "photo_first_photo" : "quick_photo",
    memo: mode === "photo_first" ? "photo_first_memo" : "quick_memo",
    next: "quick_next",
  };
  const quickLocationRows = buildConfirmBasicRows(trip).filter(([label]) =>
    ["地域", "場所名"].includes(label),
  );
  const quickTargetRows = [["反応なしの理由", trip.result?.reason_note || summarizeQuestionState(bundle, "quick_reason", "")]];
  const quickTackleRows = buildConfirmTackleRows(trip).filter(([label]) =>
    ["釣法", "ルアー・エサ"].includes(label),
  );
  return `
    <article class="summary-card">
      <div class="section-header">
        <div>
          <h3 class="section-title">保存前の確認</h3>
          <p class="muted">短く見直して、必要な項目だけ直します</p>
        </div>
      </div>
      ${renderConfirmSection("結果", questionMap.result, [["結果", describeLabel("result_type", trip.result?.result_type || "no_response")]])}
      ${
        mode === "photo_first"
          ? ""
          : renderConfirmSection("場所", questionMap.location, quickLocationRows)
      }
      ${
        mode === "photo_first" || trip.result?.result_type !== "no_response"
          ? ""
          : renderConfirmSection(
              "反応なしの理由",
              questionMap.target,
              quickTargetRows,
            )
      }
      ${
        mode === "photo_first"
          ? ""
          : renderConfirmSection("使ったもの", questionMap.tackle, quickTackleRows)
      }
      ${renderConfirmSection("写真", questionMap.photo, [["写真枚数", `${trip.photos.length}枚`] ])}
      ${renderConfirmSection("メモ", questionMap.memo, [["ひとことメモ", trip.trip_summary || summarizeQuestionState(bundle, "quick_memo", "")]])}
      ${
        mode === "photo_first"
          ? ""
          : renderConfirmSection("次回試すこと", questionMap.next, [["次回試すこと", trip.next_try || summarizeQuestionState(bundle, "quick_next", "")]])
      }
    </article>
  `;
}

function renderConfirmSection(title, stepId, rows) {
  return `
    <section class="detail-section">
      <div class="section-header">
        <div><h4 class="section-title">${escapeHtml(title)}</h4></div>
        <button class="button-secondary" type="button" data-action="jump-step" data-step="${escapeHtml(stepId)}">この項目を修正する</button>
      </div>
      <div class="detail-lines">
        ${rows
          .map(
            ([label, value]) => `
              <div class="detail-line">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(value || "未入力")}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function addConfirmRow(rows, label, value, options = {}) {
  const text = String(value ?? "").trim();
  if (!options.showIfEmpty && !text) {
    return;
  }
  rows.push([label, text || "未入力"]);
}

function buildConfirmBasicRows(trip) {
  const rows = [];
  const bundle = appState.currentDraft;
  addConfirmRow(rows, "釣行日", formatDate(trip.started_at), { showIfEmpty: true });
  addConfirmRow(rows, "開始", formatDateTime(trip.started_at), { showIfEmpty: true });
  addConfirmRow(rows, "終了", trip.ended_at ? formatDateTime(trip.ended_at) : "");
  addConfirmRow(rows, "釣行種別", describeLabel("trip_type", trip.trip_type), { showIfEmpty: true });
  addConfirmRow(rows, "水域", describeLabel("water_type", trip.water_type), { showIfEmpty: true });
  addConfirmRow(rows, "地域", trip.location_region || (bundle ? summarizeQuestionState(bundle, "quick_location", "") : ""), { showIfEmpty: true });
  addConfirmRow(rows, "場所名", trip.location_name || (bundle ? summarizeQuestionState(bundle, "quick_location", "") : ""));
  if (isShoreLike(trip.trip_type)) {
    addConfirmRow(rows, "ポイント名", trip.point_name);
    addConfirmRow(rows, "立ち位置メモ", trip.standing_position_note);
  }
  if (isBoatLike(trip.trip_type)) {
    addConfirmRow(rows, "船名", trip.boat_name);
  }
  addConfirmRow(rows, "同行メモ", trip.companion_note);
  addConfirmRow(rows, "公開範囲", describeLabel("privacy_level", trip.privacy_level), { showIfEmpty: true });
  return rows;
}

function buildConfirmConditionRows(trip) {
  const rows = [];
  addConfirmRow(rows, "天候", describeLabel("weather", trip.conditions?.weather), { showIfEmpty: true });
  addConfirmRow(rows, "時間帯", describeLabel("time_band", trip.conditions?.time_band), { showIfEmpty: true });
  addConfirmRow(rows, "風向き", trip.conditions?.wind_direction);
  addConfirmRow(rows, "風の強さ", describeLabel("wind_level", trip.conditions?.wind_level), { showIfEmpty: true });
  if (isSeaLike(trip.water_type)) {
    addConfirmRow(rows, "潮", describeLabel("tide_name", trip.conditions?.tide_name), { showIfEmpty: true });
    addConfirmRow(rows, "潮メモ", trip.conditions?.tide_note);
  }
  if (isSeaLike(trip.water_type) || isBoatLike(trip.trip_type)) {
    addConfirmRow(rows, "波・うねり", trip.conditions?.wave_level);
  }
  addConfirmRow(rows, "濁り", describeLabel("water_clarity", trip.conditions?.water_clarity), { showIfEmpty: true });
  if (isFreshwater(trip.water_type)) {
    addConfirmRow(rows, "流れメモ", trip.conditions?.flow_note);
  }
  addConfirmRow(rows, "水温", trip.conditions?.water_temp_c ? `${trip.conditions.water_temp_c}℃` : "");
  addConfirmRow(rows, "気温", trip.conditions?.air_temp_c ? `${trip.conditions.air_temp_c}℃` : "");
  if (trip.conditions?.bait_presence && trip.conditions.bait_presence !== "unknown") {
    addConfirmRow(rows, "ベイト", describeLabel("yesNoUnknown", trip.conditions.bait_presence));
  }
  if (trip.conditions?.bird_activity && trip.conditions.bird_activity !== "unknown") {
    addConfirmRow(rows, "鳥の動き", describeLabel("yesNoUnknown", trip.conditions.bird_activity));
  }
  addConfirmRow(rows, "状況メモ", trip.conditions?.condition_note);
  return rows;
}

function buildConfirmTackleRows(trip) {
  const rows = [];
  addConfirmRow(rows, "釣法", trip.tackle?.method_name, { showIfEmpty: true });
  addConfirmRow(rows, "ルアー・エサ", trip.tackle?.lure_or_bait_name, { showIfEmpty: true });
  addConfirmRow(rows, "狙った層", describeLabel("target_range", trip.tackle?.target_range), { showIfEmpty: true });
  addConfirmRow(
    rows,
    "重さ",
    trip.tackle?.lure_weight ? `${trip.tackle.lure_weight}${trip.tackle?.lure_weight_unit ?? ""}` : "",
  );
  addConfirmRow(rows, "ロッド", trip.tackle?.rod_name);
  addConfirmRow(rows, "リール", trip.tackle?.reel_name);
  addConfirmRow(rows, "ライン", trip.tackle?.line_name);
  addConfirmRow(rows, "リーダー", trip.tackle?.leader_name);
  addConfirmRow(rows, "カラー", trip.tackle?.color_name);
  addConfirmRow(rows, "操作メモ", trip.tackle?.action_note);
  return rows;
}

function buildConfirmResultRows(trip) {
  const rows = [];
  const bundle = appState.currentDraft;
  const resultType = trip.result?.result_type || "no_response";
  addConfirmRow(rows, "結果", describeLabel("result_type", resultType), { showIfEmpty: true });
  if (resultType === "caught") {
    addConfirmRow(rows, "釣果数", computeCatchCount(trip) ? `${computeCatchCount(trip)}匹` : "");
    addConfirmRow(rows, "主な魚種", trip.catches.length ? collectSpeciesLabel(trip) : "");
    addConfirmRow(rows, "最大サイズ", computeMaxSize(trip) ? `${computeMaxSize(trip)}cm` : "");
    addConfirmRow(rows, "釣果メモ", trip.result?.result_note);
  }
  if (resultType === "bite_only" || resultType === "chase_only") {
    addConfirmRow(rows, "時刻", trip.result?.event_time ? formatDateTime(trip.result.event_time) : "");
    addConfirmRow(rows, "使ったルアー", trip.result?.event_lure);
    addConfirmRow(rows, "レンジ", describeLabel("target_range", trip.result?.event_range));
    addConfirmRow(rows, "メモ", trip.result?.event_note);
  }
  if (resultType === "no_response") {
    addConfirmRow(rows, "釣果数", "0匹", { showIfEmpty: true });
    addConfirmRow(rows, "全体メモ", trip.result?.result_note);
    addConfirmRow(rows, "反応なしの理由", trip.result?.reason_note || summarizeQuestionState(bundle, "quick_reason", ""));
  }
  return rows;
}

function buildConfirmPhotoRows(trip) {
  const rows = [];
  const bundle = appState.currentDraft;
  addConfirmRow(rows, "写真枚数", `${trip.photos.length}枚`, { showIfEmpty: true });
  addConfirmRow(rows, "今回のまとめ", trip.trip_summary || summarizeQuestionState(bundle, "quick_memo", ""), { showIfEmpty: true });
  addConfirmRow(rows, "反省点", trip.reflection_note, { showIfEmpty: true });
  addConfirmRow(rows, "次回に試すこと", trip.next_try || summarizeQuestionState(bundle, "quick_next", ""), { showIfEmpty: true });
  return rows;
}

function renderCatchCard(item, index, options = {}) {
  const compact = options.compact === true;
  const detailFields = `
    <div class="form-grid form-grid--two">
      ${renderNumberField({
        id: `weight_g_${index}`,
        label: "重さ",
        value: item.weight_g,
        path: `trip.catches.${index}.weight_g`,
        unit: "g",
      })}
      ${renderTextField({
        id: `caught_at_${index}`,
        label: "時刻",
        value: item.caught_at || "",
        type: "datetime-local",
        path: `trip.catches.${index}.caught_at`,
      })}
      ${renderTextField({
        id: `lure_used_${index}`,
        label: "使ったルアー",
        value: item.lure_used || "",
        path: `trip.catches.${index}.lure_used`,
        datalistKey: "lures",
      })}
      ${renderSelectField({
        id: `hit_range_${index}`,
        label: "ヒットした層",
        value: item.hit_range || "unknown",
        path: `trip.catches.${index}.hit_range`,
        options: selectOptions("target_range"),
      })}
      ${renderSelectField({
        id: `keep_release_${index}`,
        label: "持ち帰り / リリース",
        value: item.keep_release || "unknown",
        path: `trip.catches.${index}.keep_release`,
        options: selectOptions("keep_release"),
      })}
    </div>
    ${renderTextareaField({
      id: `catch_note_${index}`,
      label: "釣果メモ",
      value: item.catch_note || "",
      path: `trip.catches.${index}.catch_note`,
    })}
  `;
  return `
    <article class="catch-card">
      <div class="section-header">
        <div>
          <h3 class="section-title">釣果 ${index + 1}</h3>
          <p class="muted">${compact ? "まずは魚種と数を記録し、必要なら詳細を開いてください" : "魚種、サイズ、時刻などを記録します"}</p>
        </div>
        <button class="button-danger" type="button" data-action="remove-catch" data-index="${index}">この釣果を削除する</button>
      </div>
      <div class="form-grid form-grid--two">
        ${renderTextField({
          id: `species_name_${index}`,
          label: "魚種",
          value: item.species_name || "",
          path: `trip.catches.${index}.species_name`,
          datalistKey: "speciesNames",
          errorPath: `trip.catches.${index}.species_name`,
        })}
        ${renderNumberField({
          id: `count_${index}`,
          label: "数",
          value: item.count,
          path: `trip.catches.${index}.count`,
          unit: "匹",
        })}
        ${renderNumberField({
          id: `length_cm_${index}`,
          label: "サイズ",
          value: item.length_cm,
          path: `trip.catches.${index}.length_cm`,
          unit: "cm",
        })}
      </div>
      ${
        compact
          ? `<details>
              <summary>時刻やルアーなどをくわしく入れる</summary>
              <div class="form-grid">${detailFields}</div>
            </details>`
          : detailFields
      }
    </article>
  `;
}

function renderPhotoCard(item, index) {
  const previewUrl = appState.mediaCache.get(item.thumb_blob_key || item.medium_blob_key || item.original_blob_key) ?? "";
  const previewBody = isPhotoPreviewUnavailable(item)
    ? renderUnavailablePhotoPlaceholder(
        item,
        "このブラウザでは HEIC の表示用画像を作れませんでした原本はこの端末に保存しています",
      )
    : previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="追加した写真のサムネイル" />`
      : `<div class="record-card__media"><div class="record-card__placeholder">写真の読み込み準備中です</div></div>`;
  return `
    <article class="photo-card">
      <div class="section-header">
        <div>
          <h3 class="section-title">写真 ${index + 1}</h3>
          <p class="muted">${item.photo_role === "main" ? "代表写真として表示されます" : "一覧や詳細で使えます"}</p>
        </div>
        <div class="button-row">
          <button class="button-secondary" type="button" data-action="move-photo-up" data-index="${index}" ${index === 0 ? "disabled" : ""}>前へ移動</button>
          <button class="button-secondary" type="button" data-action="move-photo-down" data-index="${index}" ${index === appState.currentDraft?.trip.photos.length - 1 ? "disabled" : ""}>後ろへ移動</button>
          <button class="button-secondary" type="button" data-action="set-main-photo" data-index="${index}">代表写真にする</button>
          <button class="button-danger" type="button" data-action="remove-photo" data-index="${index}">写真を削除する</button>
        </div>
      </div>
      <div class="photo-card__preview">
        ${previewBody}
      </div>
      <div class="form-grid form-grid--two">
        ${renderSelectField({
          id: `photo_role_${index}`,
          label: "写真の種類",
          value: item.photo_role || "trip",
          path: `trip.photos.${index}.photo_role`,
          options: selectOptions("photo_role"),
        })}
        ${renderTextField({
          id: `photo_caption_${index}`,
          label: "説明",
          value: item.caption || "",
          path: `trip.photos.${index}.caption`,
        })}
      </div>
    </article>
  `;
}

async function renderDraftCard(bundle, options = {}) {
  const summary = summarizeTrip(bundle.trip);
  const media = await renderCardMedia(bundle.trip);
  const cardClass = options.compact
    ? "record-card record-card--recent interactive-card"
    : "record-card record-card--draft interactive-card";
  const buttonClass = options.compact ? "button-secondary" : "button";
  const buttonLabel = options.compact ? "下書きを開く" : "下書きを再開する";
  const isPhotoFirstDraft = bundle.start_context?.record_mode === "photo_first";
  const compactStats = `
    <dl class="record-card__stats record-card__stats--compact">
      <div class="stat-line">
        <dt>釣行日</dt>
        <dd>${escapeHtml(summary.date)}</dd>
      </div>
      <div class="stat-line">
        <dt>現在</dt>
        <dd>${escapeHtml(stepName(bundle.meta.current_step))}</dd>
      </div>
    </dl>
  `;
  const fullStats = `
    <dl class="record-card__stats">
      <div class="stat-line">
        <dt>釣行日</dt>
        <dd>${escapeHtml(summary.date)}</dd>
      </div>
      <div class="stat-line">
        <dt>主な魚種</dt>
        <dd>${escapeHtml(summary.species)}</dd>
      </div>
      <div class="stat-line">
        <dt>釣果数</dt>
        <dd>${escapeHtml(summary.count)}</dd>
      </div>
      <div class="stat-line">
        <dt>最大サイズ</dt>
        <dd>${escapeHtml(summary.maxSize)}</dd>
      </div>
      <div class="stat-line">
        <dt>現在のステップ</dt>
        <dd>${escapeHtml(stepName(bundle.meta.current_step))}</dd>
      </div>
    </dl>
  `;
  return `
    <article class="${cardClass}">
      <div class="record-card__media">${media}</div>
      <div class="record-card__body">
        <div class="pill-row">
          ${renderRecordStatePill("draft")}
          ${renderResultPill(bundle.trip.result?.result_type)}
          ${isPhotoFirstDraft ? `<span class="pill">写真だけの下書き</span>` : ""}
          <span class="pill">${escapeHtml(formatDateTime(bundle.meta.last_saved_at))}</span>
        </div>
        <h3 class="record-card__title">${escapeHtml(summary.place)}</h3>
        ${options.compact ? compactStats : fullStats}
        <div class="button-row">
          <button class="${buttonClass}" type="button" data-action="resume-draft" data-draft-id="${escapeHtml(bundle.draft_id)}">${buttonLabel}</button>
        </div>
      </div>
    </article>
  `;
}

async function renderTripCard(trip, status = "final", options = {}) {
  const summary = summarizeTrip(trip);
  const media = await renderCardMedia(trip);
  const cardClass = options.compact
    ? "record-card record-card--recent interactive-card"
    : "record-card interactive-card";
  const compactStats = `
    <dl class="record-card__stats record-card__stats--compact">
      <div class="stat-line">
        <dt>釣行日</dt>
        <dd>${escapeHtml(summary.date)}</dd>
      </div>
      <div class="stat-line">
        <dt>主な魚種</dt>
        <dd>${escapeHtml(summary.species)}</dd>
      </div>
      <div class="stat-line">
        <dt>釣果数</dt>
        <dd>${escapeHtml(summary.count)}</dd>
      </div>
    </dl>
  `;
  const fullStats = `
    <dl class="record-card__stats">
      <div class="stat-line">
        <dt>釣行日</dt>
        <dd>${escapeHtml(summary.date)}</dd>
      </div>
      <div class="stat-line">
        <dt>主な魚種</dt>
        <dd>${escapeHtml(summary.species)}</dd>
      </div>
      <div class="stat-line">
        <dt>釣果数</dt>
        <dd>${escapeHtml(summary.count)}</dd>
      </div>
      <div class="stat-line">
        <dt>最大サイズ</dt>
        <dd>${escapeHtml(summary.maxSize)}</dd>
      </div>
      <div class="stat-line">
        <dt>釣法</dt>
        <dd>${escapeHtml(summary.method)}</dd>
      </div>
    </dl>
  `;
  const actionButtons = options.compact
    ? `<button class="button-secondary" type="button" data-action="open-detail" data-trip-id="${escapeHtml(trip.trip_id)}">記録を見る</button>`
    : `
        <button class="button-secondary" type="button" data-action="open-detail" data-trip-id="${escapeHtml(trip.trip_id)}">記録詳細を見る</button>
        <button class="button-secondary" type="button" data-action="duplicate-trip" data-trip-id="${escapeHtml(trip.trip_id)}">記録を複製する</button>
      `;
  return `
    <article class="${cardClass}">
      <div class="record-card__media">${media}</div>
      <div class="record-card__body">
        <div class="pill-row">
          ${renderRecordStatePill(status)}
          ${renderResultPill(trip.result?.result_type)}
        </div>
        <h3 class="record-card__title">${escapeHtml(summary.place)}</h3>
        ${options.compact ? compactStats : fullStats}
        <div class="button-row">
          ${actionButtons}
        </div>
      </div>
    </article>
  `;
}

async function renderCardMedia(trip) {
  const photo = chooseRepresentativePhoto(trip);
  if (photo && isPhotoPreviewUnavailable(photo)) {
    return `<div class="record-card__placeholder">HEIC 写真を保存していますこのブラウザでは一覧表示できません</div>`;
  }
  const url = await getImageUrl(photo?.thumb_blob_key || photo?.medium_blob_key || photo?.original_blob_key);
  if (!url) {
    return `<div class="record-card__placeholder">写真がない記録です</div>`;
  }
  return `<img src="${escapeHtml(url)}" alt="代表写真のサムネイル" />`;
}

async function renderDetailPhotos(trip) {
  const photoEntries = await Promise.all(
    (trip.photos ?? []).map(async (photo) => ({
      photo,
      url: await getImageUrl(photo.medium_blob_key || photo.original_blob_key || photo.thumb_blob_key),
    })),
  );
  if (!photoEntries.length) {
    return `<div class="empty-card"><p>写真はありません</p></div>`;
  }
  const visiblePhotos = photoEntries.filter((item) => item.url && !isPhotoPreviewUnavailable(item.photo));
  const unsupportedPhotos = photoEntries.filter(({ photo }) => isPhotoPreviewUnavailable(photo));
  const missingPhotoCount = photoEntries.length - visiblePhotos.length - unsupportedPhotos.length;
  const cards = visiblePhotos.map(
    ({ photo, url }) => `
      <article class="photo-card photo-card--detail">
        <div class="photo-card__preview">
          <img src="${escapeHtml(url)}" alt="${escapeHtml(photo.caption || "保存された写真")}" />
        </div>
        <div class="detail-lines">
          <div class="detail-line">
            <strong>種類</strong>
            <span>${escapeHtml(describeLabel("photo_role", photo.photo_role))}</span>
          </div>
          <div class="detail-line">
            <strong>説明</strong>
            <span>${escapeHtml(photo.caption || "未入力")}</span>
          </div>
        </div>
      </article>
    `,
  );
  const unsupportedCards = unsupportedPhotos.map(
    ({ photo }) => `
      <article class="photo-card photo-card--detail">
        <div class="photo-card__preview">
          ${renderUnavailablePhotoPlaceholder(
            photo,
            "このブラウザでは HEIC 写真を表示できません原本はこの端末に保存しています",
          )}
        </div>
        <div class="detail-lines">
          <div class="detail-line">
            <strong>種類</strong>
            <span>${escapeHtml(describeLabel("photo_role", photo.photo_role))}</span>
          </div>
          <div class="detail-line">
            <strong>説明</strong>
            <span>${escapeHtml(photo.caption || "未入力")}</span>
          </div>
        </div>
      </article>
    `,
  );
  const missingNote =
    missingPhotoCount > 0
      ? `<article class="status-card">
          <strong>写真本体について</strong>
          <p class="muted">この記録には写真メモが ${escapeHtml(String(missingPhotoCount))} 件ありますが、写真本体はバックアップに含まれていません別端末へ移した記録では、写真だけ見えないことがあります</p>
        </article>`
      : "";
  if (!cards.length && !unsupportedCards.length) {
    return missingNote;
  }
  return `${missingNote}<div class="grid-cards">${cards.join("")}${unsupportedCards.join("")}</div>`;
}

function renderDetailSection(title, stepId, rows) {
  const visibleRows = rows.filter(([, value]) => value);
  return `
    <section class="detail-section">
      <div class="section-header">
        <div>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <button class="button-secondary" type="button" data-action="edit-trip" data-step="${escapeHtml(stepId)}" data-trip-id="${escapeHtml(appState.currentRoute?.tripId ?? "")}">この項目を修正する</button>
      </div>
      <div class="detail-lines">
        ${
          visibleRows.length
            ? visibleRows
                .map(
                  ([label, value]) => `
                    <div class="detail-line">
                      <strong>${escapeHtml(label)}</strong>
                      <span>${escapeHtml(value || "未入力")}</span>
                    </div>
                  `,
                )
                .join("")
            : `<div class="detail-line"><strong>未入力</strong><span>まだ内容がありません</span></div>`
        }
      </div>
    </section>
  `;
}

function renderRestorePreview(pendingRestore) {
  return `
    <div class="restore-review">
      <h4 class="section-title">復元前の確認</h4>
      ${
        pendingRestore.errors.length
          ? `
            <div class="error-summary" tabindex="-1">
              <h2>このファイルはそのまま復元できません</h2>
              <ul>${pendingRestore.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
          `
          : `
            <div class="detail-lines">
              <div class="detail-line">
                <strong>控え版</strong>
                <span>${escapeHtml(pendingRestore.manifest.backup_version)}</span>
              </div>
              <div class="detail-line">
                <strong>アプリ版</strong>
                <span>${escapeHtml(pendingRestore.manifest.app_version || "不明")}</span>
              </div>
              <div class="detail-line">
                <strong>書き出し日時</strong>
                <span>${escapeHtml(formatDateTime(pendingRestore.manifest.exported_at))}</span>
              </div>
              <div class="detail-line">
                <strong>記録数</strong>
                <span>${escapeHtml(String(pendingRestore.manifest.record_count))}</span>
              </div>
              <div class="detail-line">
                <strong>保存済み記録</strong>
                <span>${escapeHtml(String(pendingRestore.tripCount))} 件</span>
              </div>
              <div class="detail-line">
                <strong>下書き</strong>
                <span>${escapeHtml(String(pendingRestore.draftCount))} 件</span>
              </div>
              <div class="detail-line">
                <strong>写真本体を含むか</strong>
                <span>${pendingRestore.manifest.includes_photos ? "含む" : "含まない"}</span>
              </div>
              <div class="detail-line">
                <strong>重複した ID</strong>
                <span>${escapeHtml(String(pendingRestore.duplicateCount))} 件</span>
              </div>
            </div>
            ${
              pendingRestore.manifest.includes_photos
                ? ""
                : `<article class="status-card">
                    <strong>写真について</strong>
                    <p class="muted">このバックアップでは、記録と写真メモは戻せますが、写真本体は戻りません別端末へ移すと、写真欄にメモだけ残ることがあります</p>
                  </article>`
            }
            <div class="button-row">
              <button class="button" type="button" data-action="confirm-restore">この内容を読み込む</button>
            </div>
          `
      }
    </div>
  `;
}

function renderErrorSummary() {
  if (!appState.wizardErrors.summary.length) {
    return "";
  }
  return `
    <section class="error-summary" id="error-summary" tabindex="-1" aria-labelledby="error-summary-title">
      <h2 id="error-summary-title">入力内容を確認してください</h2>
      <ul>
        ${appState.wizardErrors.summary
          .map(
            (item) => `
              <li>
                <button
                  class="error-summary__link"
                  type="button"
                  data-action="focus-error-field"
                  data-error-path="${escapeHtml(item.path || "")}"
                >
                  ${escapeHtml(item.message)}
                </button>
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
}

function renderSavePill() {
  const status = appState.saveStatus;
  if (!status.message) {
    return `<span class="pill pill--backup-needed">控えはあとで保存できます</span>`;
  }
  if (status.state === "saving") {
    return `<span class="pill pill--saving">${escapeHtml(status.message)}</span>`;
  }
  if (status.state === "error") {
    return `<span class="pill pill--error">${escapeHtml(status.message)}</span>`;
  }
  if (status.state === "saved") {
    return `<span class="pill pill--final">${escapeHtml(status.message)}</span>`;
  }
  return `<span class="pill pill--backup-needed">${escapeHtml(status.message)}</span>`;
}

function renderDraftStatusText() {
  if (!appState.drafts.length) {
    return draftEmptyText();
  }
  const latest = appState.drafts[0];
  return latestDraftSavedText(latest.meta.last_saved_at);
}

function renderBackupStatusText() {
  if (!appState.backupStatus?.last_backup_at) {
    return "控えはまだありません 必要なときだけ保存してください";
  }
  return `${formatDateTime(appState.backupStatus.last_backup_at)} に控えを保存しました`;
}

function renderTextField({
  id,
  label,
  value,
  path,
  type = "text",
  hint = "",
  errorPath = path,
  datalistKey = "",
  rerender = false,
  immediateSave = false,
}) {
  const error = appState.wizardErrors.fields[errorPath];
  const describedBy = [hint ? `${id}_hint` : "", error ? `${id}_error` : ""].filter(Boolean).join(" ");
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <input
        id="${escapeHtml(id)}"
        name="${escapeHtml(id)}"
        type="${escapeHtml(type)}"
        value="${escapeHtml(value ?? "")}"
        data-path="${escapeHtml(path)}"
        data-focus-path="${escapeHtml(errorPath)}"
        ${datalistKey ? `list="${escapeHtml(id)}_list"` : ""}
        ${rerender ? 'data-rerender="true"' : ""}
        ${immediateSave ? 'data-save-immediate="true"' : ""}
        ${describedBy ? `aria-describedby="${escapeHtml(describedBy)}"` : ""}
        ${error ? 'aria-invalid="true"' : ""}
      />
      ${datalistKey ? renderDatalist(`${id}_list`, datalistKey) : ""}
      ${hint ? `<p class="field-hint" id="${escapeHtml(id)}_hint">${escapeHtml(hint)}</p>` : ""}
      ${error ? `<p class="field-error" id="${escapeHtml(id)}_error">${escapeHtml(error)}</p>` : ""}
    </div>
  `;
}

function renderNumberField({
  id,
  label,
  value,
  path,
  hint = "",
  errorPath = path,
  unit = "",
}) {
  const error = appState.wizardErrors.fields[errorPath];
  const describedBy = [hint ? `${id}_hint` : "", error ? `${id}_error` : ""].filter(Boolean).join(" ");
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <div class="inline-group">
        <input
          id="${escapeHtml(id)}"
          name="${escapeHtml(id)}"
          type="number"
          inputmode="decimal"
          value="${escapeHtml(value ?? "")}"
          data-path="${escapeHtml(path)}"
          data-focus-path="${escapeHtml(errorPath)}"
          data-value-type="number"
          ${describedBy ? `aria-describedby="${escapeHtml(describedBy)}"` : ""}
          ${error ? 'aria-invalid="true"' : ""}
        />
        ${unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ""}
      </div>
      ${hint ? `<p class="field-hint" id="${escapeHtml(id)}_hint">${escapeHtml(hint)}</p>` : ""}
      ${error ? `<p class="field-error" id="${escapeHtml(id)}_error">${escapeHtml(error)}</p>` : ""}
    </div>
  `;
}

function renderTextareaField({
  id,
  label,
  value,
  path,
  hint = "",
  errorPath = path,
}) {
  const error = appState.wizardErrors.fields[errorPath];
  const describedBy = [hint ? `${id}_hint` : "", error ? `${id}_error` : ""].filter(Boolean).join(" ");
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <textarea id="${escapeHtml(id)}" name="${escapeHtml(id)}" data-path="${escapeHtml(path)}" data-focus-path="${escapeHtml(errorPath)}" ${describedBy ? `aria-describedby="${escapeHtml(describedBy)}"` : ""} ${error ? 'aria-invalid="true"' : ""}>${escapeHtml(value ?? "")}</textarea>
      ${hint ? `<p class="field-hint" id="${escapeHtml(id)}_hint">${escapeHtml(hint)}</p>` : ""}
      ${error ? `<p class="field-error" id="${escapeHtml(id)}_error">${escapeHtml(error)}</p>` : ""}
    </div>
  `;
}

function renderSelectField({
  id,
  label,
  value,
  path,
  options,
  hint = "",
  errorPath = path,
  rerender = false,
  immediateSave = false,
}) {
  const error = appState.wizardErrors.fields[errorPath];
  const describedBy = [hint ? `${id}_hint` : "", error ? `${id}_error` : ""].filter(Boolean).join(" ");
  return `
    <div class="field">
      <label for="${escapeHtml(id)}">${escapeHtml(label)}</label>
      <select
        id="${escapeHtml(id)}"
        name="${escapeHtml(id)}"
        data-path="${escapeHtml(path)}"
        data-focus-path="${escapeHtml(errorPath)}"
        ${rerender ? 'data-rerender="true"' : ""}
        ${immediateSave ? 'data-save-immediate="true"' : ""}
        ${describedBy ? `aria-describedby="${escapeHtml(describedBy)}"` : ""}
        ${error ? 'aria-invalid="true"' : ""}
      >
        ${options
          .map(
            (option) => `
              <option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? "selected" : ""}>
                ${escapeHtml(option.label)}
              </option>
            `,
          )
          .join("")}
      </select>
      ${hint ? `<p class="field-hint" id="${escapeHtml(id)}_hint">${escapeHtml(hint)}</p>` : ""}
      ${error ? `<p class="field-error" id="${escapeHtml(id)}_error">${escapeHtml(error)}</p>` : ""}
    </div>
  `;
}

function renderRadioCardFieldset({
  legend,
  path,
  value,
  options,
  rerender = false,
  immediateSave = false,
  errorPath = path,
}) {
  const error = appState.wizardErrors.fields[errorPath];
  const errorId = `${fieldIdForPath(errorPath)}_error`;
  return `
    <fieldset class="fieldset fieldset" ${error ? `aria-describedby="${escapeHtml(errorId)}"` : ""}>
      <legend>${escapeHtml(legend)}</legend>
      <div class="choice-grid">
        ${options
          .map(
            (option, index) => `
              <div class="choice-card">
                <input
                  id="${escapeHtml(path)}_${index}"
                  type="radio"
                  name="${escapeHtml(path)}"
                  value="${escapeHtml(option.value)}"
                  ${String(option.value) === String(value) ? "checked" : ""}
                  data-path="${escapeHtml(path)}"
                  data-focus-path="${escapeHtml(errorPath)}"
                  ${rerender ? 'data-rerender="true"' : ""}
                  ${immediateSave ? 'data-save-immediate="true"' : ""}
                />
                <label for="${escapeHtml(path)}_${index}">
                  <strong>${escapeHtml(option.label)}</strong>
                  <span>${escapeHtml(option.description || "")}</span>
                </label>
              </div>
            `,
          )
          .join("")}
      </div>
      ${error ? `<p class="field-error" id="${escapeHtml(errorId)}">${escapeHtml(error)}</p>` : ""}
    </fieldset>
  `;
}

function renderDatalist(id, key) {
  const items = appState.candidateData[key] ?? [];
  if (!items.length) {
    return "";
  }
  return `
    <datalist id="${escapeHtml(id)}">
      ${items.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("")}
    </datalist>
  `;
}

function groupOptions(group) {
  return Object.entries(OPTION_LABELS[group] ?? {}).map(([value, label]) => ({
    value,
    label,
    description: "",
  }));
}

function selectOptions(group, includeBlank = false) {
  const base = includeBlank ? [{ value: "", label: "指定しない" }] : [];
  return base.concat(
    Object.entries(OPTION_LABELS[group] ?? {}).map(([value, label]) => ({
      value,
      label,
    })),
  );
}

function stepName(stepId) {
  if (stepId === "quick_capture") {
    return QUICK_CAPTURE_STEP.name;
  }
  const currentDraftQuestion = appState.currentDraft ? getQuestionById(appState.currentDraft, stepId) : null;
  if (currentDraftQuestion) {
    return currentDraftQuestion.title;
  }
  for (const definitions of Object.values(QUESTION_DEFINITIONS)) {
    const found = definitions.find((question) => question.id === stepId);
    if (found) {
      return found.title;
    }
  }
  return STEP_ORDER.find((item) => item.id === stepId)?.name ?? stepId;
}

function bindShellEvents() {
  const noticeLinks = document.querySelectorAll("a[href^='#']");
  noticeLinks.forEach((link) => {
    link.addEventListener("click", () => {
      setGlobalNotice("", "");
    });
  });
}

function bindRouteEvents(route) {
  if (route.name === "home" || route.name === "drafts" || route.name === "saved" || route.name === "detail" || route.name === "records" || route.name === "backup") {
    document.querySelectorAll("[data-home-action]").forEach((button) => {
      button.addEventListener("click", handleHomeAction);
    });
    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", handleGenericAction);
    });
  }
  if (route.name === "wizard" || route.name === "edit") {
    bindWizardEvents();
  }
  if (route.name === "records") {
    bindFilterInputs();
  }
  if (route.name === "backup") {
    bindBackupEvents();
  }
}

function bindFilterInputs() {
  document.querySelectorAll("[data-path^='filters.']").forEach((field) => {
    field.addEventListener("input", handleNonWizardFieldChange);
    field.addEventListener("change", handleNonWizardFieldChange);
  });
}

function bindBackupEvents() {
  const fileInput = document.querySelector("#backup_file");
  if (fileInput) {
    fileInput.addEventListener("change", handleBackupFileChange);
  }
}

function bindWizardEvents() {
  document.querySelectorAll("[data-path]").forEach((field) => {
    if (field.id === "backup_file") {
      return;
    }
    field.addEventListener("input", handleWizardFieldChange);
    field.addEventListener("change", handleWizardFieldChange);
  });
  const photoUpload = document.querySelector("#photo_upload");
  if (photoUpload) {
    photoUpload.addEventListener("change", handlePhotoUpload);
  }
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleWizardAction);
  });
}

function handleHomeAction(event) {
  const action = event.currentTarget.dataset.homeAction;
  if (action === "new") {
    startNewRecord();
    return;
  }
  if (action === "resume") {
    if (!appState.drafts.length) {
      return;
    }
    if (appState.drafts.length === 1) {
      navigate(draftRoutePath(appState.drafts[0]));
      return;
    }
    navigate("#/drafts");
    return;
  }
  if (action === "records") {
    navigate("#/records");
    return;
  }
  if (action === "backup") {
    navigate("#/backup");
  }
}

function handleGenericAction(event) {
  const action = event.currentTarget.dataset.action;
  const tripId = event.currentTarget.dataset.tripId;
  const draftId = event.currentTarget.dataset.draftId;
  const step = event.currentTarget.dataset.step;
  if (action === "close-dialog") {
    closeDialog();
    return;
  }
  if (action === "open-detail-guide") {
    openDialog("detail-guide");
    return;
  }
  if (action === "resume-draft" && draftId) {
    const draft = appState.drafts.find((item) => item.draft_id === draftId);
    navigate(draftRoutePath(draft || { draft_id: draftId, start_context: {} }));
    return;
  }
  if (action === "open-detail" && tripId) {
    navigate(`#/detail/${tripId}`);
    return;
  }
  if (action === "goto-home") {
    navigate("#/home");
    return;
  }
  if (action === "goto-backup") {
    navigate("#/backup");
    return;
  }
  if (action === "goto-edit-detail") {
    navigate(editDetailPath());
    return;
  }
  if (action === "search-records") {
    appState.searchMode = "basic";
    render();
    return;
  }
  if (action === "open-related-search") {
    applyRelatedSearch(
      event.currentTarget.dataset.filterKind,
      event.currentTarget.dataset.filterValue,
    );
    return;
  }
  if (action === "clear-search") {
    appState.filters = { ...DEFAULT_FILTERS };
    appState.searchMode = "basic";
    render();
    return;
  }
  if (action === "export-backup") {
    exportBackupJson();
    return;
  }
  if (action === "save-restore-point") {
    saveCurrentRestorePoint();
    return;
  }
  if (action === "restore-point") {
    restorePointById(event.currentTarget.dataset.restorePointId || "");
    return;
  }
  if (action === "confirm-restore") {
    applyPendingRestore();
    return;
  }
  if (action === "duplicate-trip" && tripId) {
    createDuplicateDraft(tripId);
    return;
  }
  if (action === "edit-trip" && tripId) {
    createEditDraft(tripId, step || "basic");
    return;
  }
}

function applyRelatedSearch(kind, value) {
  if (!kind || !value) {
    appState.searchMode = "basic";
    navigate("#/records");
    return;
  }
  appState.filters = { ...DEFAULT_FILTERS };
  appState.searchMode = "basic";
  if (kind === "location") {
    appState.filters.location = value;
  }
  if (kind === "species") {
    appState.filters.species = value;
  }
  if (kind === "method") {
    appState.filters.method = value;
  }
  if (kind === "lure") {
    appState.filters.lure = value;
  }
  navigate("#/records");
}

function handleNonWizardFieldChange(event) {
  const { path, value } = readFieldValue(event.currentTarget);
  setByPath(appState, path, value);
}

function handleWizardFieldChange(event) {
  const field = event.currentTarget;
  if (!appState.currentDraft) {
    return;
  }
  const { path, value } = readFieldValue(field);
  clearWizardError(path);
  setByPath(appState.currentDraft, path, value);

  if (path === "start_context.entry_choice") {
    appState.currentDraft.start_context.template_id = "";
    const entryChoiceMap = {
      quick: { start_method: "blank", record_mode: "quick" },
      photo_first: { start_method: "blank", record_mode: "photo_first" },
      reuse_last: { start_method: "reuse_last", record_mode: "quick" },
      detailed: { start_method: "blank", record_mode: "detailed" },
    };
    const nextContext = entryChoiceMap[value] || entryChoiceMap.quick;
    appState.currentDraft.start_context.start_method = nextContext.start_method;
    appState.currentDraft.start_context.record_mode = nextContext.record_mode;
    appState.currentDraft.start_context.setup_signature = "";
  }
  if (path === "start_context.start_method") {
    if (value !== "template") {
      appState.currentDraft.start_context.template_id = "";
    } else if (!appState.currentDraft.start_context.template_id) {
      appState.currentDraft.start_context.template_id = TEMPLATE_OPTIONS[0]?.id || "";
    }
    appState.currentDraft.start_context.setup_signature = "";
  }
  if (path === "start_context.template_id") {
    appState.currentDraft.start_context.setup_signature = "";
  }
  if (path === "trip.result.result_type" && value === "caught" && appState.currentDraft.trip.catches.length === 0) {
    const catchRecord = createEmptyCatch();
    catchRecord.trip_id = appState.currentDraft.trip.trip_id;
    appState.currentDraft.trip.catches = [catchRecord];
  }
  appState.currentDraft.trip.updated_at = nowIso();

  if (field.dataset.rerender === "true") {
    render();
  }
  if (field.dataset.saveImmediate === "true") {
    persistCurrentDraft({
      saveMessage: recordSavedMessage(),
    });
    return;
  }
  scheduleDraftSave();
}

function readFieldValue(field) {
  const path = field.dataset.path;
  if (field.type === "radio") {
    return { path, value: field.checked ? field.value : getByPath(appState.currentDraft, path) };
  }
  if (field.dataset.valueType === "number") {
    return { path, value: field.value === "" ? undefined : Number(field.value) };
  }
  return { path, value: field.value };
}

function ensurePrimaryCatch(bundle) {
  if (!bundle.trip.catches.length) {
    const catchRecord = createEmptyCatch();
    catchRecord.trip_id = bundle.trip.trip_id;
    bundle.trip.catches = [catchRecord];
  }
  return bundle.trip.catches[0];
}

function applyLocationChoice(bundle, choice) {
  const { previousTrip, recent } = recentLocationOptions();
  if (choice === "previous" && previousTrip) {
    const label = locationLabelFromTrip(previousTrip);
    bundle.trip.location_region = previousTrip.location_region || label;
    bundle.trip.location_name = previousTrip.location_name || label;
    return label;
  }
  if (choice.startsWith("recent_")) {
    const label = recent[Number(choice.split("_")[1])] || "";
    bundle.trip.location_region = label;
    bundle.trip.location_name = label;
    return label;
  }
  if (choice === "manual") {
    bundle.trip.location_name = bundle.trip.location_region || bundle.trip.location_name;
    return bundle.trip.location_region || bundle.trip.location_name;
  }
  if (choice === "defer") {
    bundle.trip.location_region = "";
    bundle.trip.location_name = "";
    return "";
  }
  return "";
}

function applyReasonChoice(bundle, choice) {
  if (choice.startsWith("reason_")) {
    bundle.trip.result.reason_note = reasonOptions()[Number(choice.split("_")[1])] || "";
    return bundle.trip.result.reason_note;
  }
  if (choice === "manual") {
    bundle.trip.result.reason_note = bundle.trip.result.reason_note || "";
    return bundle.trip.result.reason_note;
  }
  if (choice === "defer") {
    bundle.trip.result.reason_note = "";
    return "";
  }
  return "";
}

function applyLureChoice(bundle, choice) {
  const { previousTrip, recent } = recentLureOptions();
  if (choice === "previous" && previousTrip?.tackle?.lure_or_bait_name) {
    bundle.trip.tackle.lure_or_bait_name = previousTrip.tackle.lure_or_bait_name;
    bundle.trip.tackle.method_name = previousTrip.tackle.method_name || bundle.trip.tackle.method_name;
    return bundle.trip.tackle.lure_or_bait_name;
  }
  if (choice.startsWith("recent_")) {
    bundle.trip.tackle.lure_or_bait_name = recent[Number(choice.split("_")[1])] || "";
    return bundle.trip.tackle.lure_or_bait_name;
  }
  if (choice === "manual") {
    return bundle.trip.tackle.lure_or_bait_name || "";
  }
  if (choice === "defer") {
    bundle.trip.tackle.lure_or_bait_name = "";
    return "";
  }
  return "";
}

function questionAnswerValue(bundle, questionId) {
  switch (questionId) {
    case "quick_result":
      return bundle.trip.result.result_type;
    case "quick_location":
      return locationLabelFromTrip(bundle.trip);
    case "quick_reason":
      return bundle.trip.result.reason_note || "";
    case "quick_tackle":
      return bundle.trip.tackle.lure_or_bait_name || "";
    case "quick_photo":
    case "photo_first_photo":
      return `${bundle.trip.photos.length}枚`;
    case "quick_memo":
      return bundle.trip.trip_summary || "";
    case "quick_next":
      return bundle.trip.next_try || "";
    case "photo_first_memo":
      return bundle.trip.trip_summary || "";
    case "detailed_result":
      return describeLabel("result_type", bundle.trip.result.result_type);
    case "detailed_location":
      return locationLabelFromTrip(bundle.trip);
    case "detailed_conditions":
      return bundle.trip.conditions?.condition_note || "入力済み";
    case "detailed_tackle":
      return bundle.trip.tackle?.lure_or_bait_name || bundle.trip.tackle?.method_name || "入力済み";
    case "detailed_photo":
      return `${bundle.trip.photos.length}枚`;
    case "detailed_memo":
      return bundle.trip.trip_summary || bundle.trip.reflection_note || "入力済み";
    case "detailed_next":
      return bundle.trip.next_try || "";
    default:
      return "";
  }
}

function validateQuestionStep(question, bundle) {
  const fields = {};
  const summary = [];
  const add = (path, message) => {
    fields[path] = message;
    summary.push({ id: fieldIdForPath(path), path, message });
  };
  if (question.id === "detailed_result") {
    return validateStep("result", bundle);
  }
  if (question.id === "detailed_location") {
    return validateStep("basic", bundle);
  }
  const choice = getQuestionChoice(bundle, question.id);
  if (question.id === "quick_result" && !bundle.trip.result.result_type) {
    add("trip.result.result_type", "結果を選んでください");
  }
  if (question.id === "quick_location" && choice === "manual" && !bundle.trip.location_region?.trim()) {
    add("trip.location_region", "場所を入力してください");
  }
  if (question.id === "quick_tackle" && choice === "manual" && !bundle.trip.tackle.lure_or_bait_name?.trim()) {
    add("trip.tackle.lure_or_bait_name", "使ったものを入力してください");
  }
  if (question.id === "quick_photo" && choice === "add" && bundle.trip.photos.length === 0) {
    add("trip.photos", "写真を追加するか、「あとで追加」または「なし」を選んでください");
  }
  if (question.id === "photo_first_photo" && bundle.trip.photos.length === 0) {
    add("trip.photos", "写真を 1 枚以上追加してください");
  }
  return { summary, fields };
}

function commitQuestionStep(question, bundle) {
  const choice = getQuestionChoice(bundle, question.id);
  if (question.id.startsWith("detailed_")) {
    markQuestionAnswered(bundle, question.id, questionAnswerValue(bundle, question.id) || "入力済み");
    return;
  }
  if (question.id === "quick_result") {
    bundle.trip.result.result_type = choice || bundle.trip.result.result_type || "no_response";
    if (bundle.trip.result.result_type !== "caught") {
      bundle.trip.catches = [];
    }
    markQuestionAnswered(bundle, question.id, {
      choice,
      display: bundle.trip.result.result_type,
    });
    return;
  }
  if (question.id === "quick_location") {
    const display = applyLocationChoice(bundle, choice);
    markQuestionAnswered(bundle, question.id, { choice, display });
    return;
  }
  if (question.id === "quick_reason") {
    const display = applyReasonChoice(bundle, choice);
    markQuestionAnswered(bundle, question.id, { choice, display });
    return;
  }
  if (question.id === "quick_tackle") {
    const display = applyLureChoice(bundle, choice);
    markQuestionAnswered(bundle, question.id, { choice, display });
    return;
  }
  if (question.id === "quick_photo" || question.id === "photo_first_photo") {
    markQuestionAnswered(bundle, question.id, { choice, display: `${bundle.trip.photos.length}枚` });
    return;
  }
  markQuestionAnswered(bundle, question.id, questionAnswerValue(bundle, question.id));
}

function clearQuestionValues(bundle, questionId) {
  if (questionId === "quick_location") {
    bundle.trip.location_region = "";
    bundle.trip.location_name = "";
  }
  if (questionId === "quick_tackle") {
    bundle.trip.tackle.lure_or_bait_name = "";
  }
  if (questionId === "quick_reason") {
    bundle.trip.result.reason_note = "";
  }
  if (questionId === "quick_memo" || questionId === "photo_first_memo") {
    bundle.trip.trip_summary = "";
  }
  if (questionId === "quick_next") {
    bundle.trip.next_try = "";
  }
}

function handleWizardAction(event) {
  event.preventDefault();
  const action = event.currentTarget.dataset.action;
  if (action === "close-dialog") {
    closeDialog();
    return;
  }
  if (action === "open-detail-guide") {
    openDialog("detail-guide");
    return;
  }
  if (action === "focus-error-field") {
    focusFieldForErrorPath(event.currentTarget.dataset.errorPath || "");
    return;
  }
  if (action === "question-defer") {
    completeQuestionWithState(event.currentTarget.dataset.questionId, "deferred");
    return;
  }
  if (action === "question-skip") {
    completeQuestionWithState(event.currentTarget.dataset.questionId, "skipped");
    return;
  }
  if (action === "prev-step") {
    moveStep(previousWizardStepId(appState.currentDraft, appState.currentDraft.meta.current_step));
    return;
  }
  if (action === "next-step") {
    advanceWizard();
    return;
  }
  if (action === "final-save") {
    finalizeCurrentTrip();
    return;
  }
  if (action === "save-close") {
    saveAndCloseDraft();
    return;
  }
  if (action === "reuse-last-tackle") {
    reuseLastTackle();
    return;
  }
  if (action === "add-catch") {
    addCatch();
    return;
  }
  if (action === "remove-catch") {
    removeCatch(Number(event.currentTarget.dataset.index));
    return;
  }
  if (action === "remove-photo") {
    removePhoto(Number(event.currentTarget.dataset.index));
    return;
  }
  if (action === "move-photo-up") {
    movePhoto(Number(event.currentTarget.dataset.index), -1);
    return;
  }
  if (action === "move-photo-down") {
    movePhoto(Number(event.currentTarget.dataset.index), 1);
    return;
  }
  if (action === "set-main-photo") {
    setMainPhoto(Number(event.currentTarget.dataset.index));
    return;
  }
  if (action === "jump-step") {
    if (appState.currentDraft?.meta.current_step === "confirm") {
      appState.currentDraft.meta.return_step_after_edit = "confirm";
    }
    moveStep(event.currentTarget.dataset.step);
  }
}

async function completeQuestionWithState(questionId, state) {
  const bundle = appState.currentDraft;
  if (!bundle || !questionId) {
    return;
  }
  clearQuestionValues(bundle, questionId);
  setQuestionAnswerState(bundle, questionId, state, "");
  bundle.trip.updated_at = nowIso();
  bundle.meta.current_step = getNextQuestionId(bundle, questionId);
  await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  render();
}

function clearWizardError(path) {
  delete appState.wizardErrors.fields[path];
  appState.wizardErrors.summary = appState.wizardErrors.summary.filter((item) => item.id !== fieldIdForPath(path));
}

function fieldIdForPath(path) {
  return path.replaceAll(".", "_");
}

function focusFieldForErrorPath(path) {
  if (!path) {
    return;
  }
  const candidates = Array.from(document.querySelectorAll("[data-focus-path]"));
  const target = candidates.find((item) => item.dataset.focusPath === path);
  if (!target) {
    return;
  }
  const focusTarget =
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLButtonElement
      ? target
      : target.querySelector("input, select, textarea, button");
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  if (focusTarget instanceof HTMLElement) {
    focusTarget.focus();
    return;
  }
  if (target instanceof HTMLElement) {
    target.focus();
  }
}

function setByPath(target, path, value) {
  const parts = path.split(".");
  let cursor = target;
  while (parts.length > 1) {
    const key = parts.shift();
    if (!(key in cursor)) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[parts[0]] = value;
}

function getByPath(target, path) {
  return path.split(".").reduce((cursor, key) => cursor?.[key], target);
}

function scheduleDraftSave() {
  clearSaveTimer();
  appState.saveTimer = setTimeout(() => {
    persistCurrentDraft({
      saveMessage: recordSavedMessage(),
    });
  }, 2500);
}

async function persistCurrentDraft({ saveMessage } = {}) {
  if (!appState.currentDraft) {
    return false;
  }
  clearSaveTimer();
  try {
    setSaveStatus("saving", "下書き保存中");
    const bundle = hydrateDraftBundle(appState.currentDraft);
    bundle.meta.last_saved_at = nowIso();
    bundle.meta.validation_state = computeTripValidationState(bundle.trip);
    bundle.trip.status = "draft";
    bundle.trip.updated_at = nowIso();
    await saveDraft(bundle);
    upsertDraftInState(bundle);
    appState.currentDraft = bundle;
    appState.currentDraftLoadedId = bundle.draft_id;
    setSaveStatus("saved", saveMessage || recordSavedMessage());
    return true;
  } catch (error) {
    setSaveStatus("error", recordSaveErrorMessage());
    setGlobalNotice("error", error?.message ?? "下書き保存に失敗しました");
    await render();
    return false;
  }
}

function upsertDraftInState(bundle) {
  const index = appState.drafts.findIndex((item) => item.draft_id === bundle.draft_id);
  if (index >= 0) {
    appState.drafts[index] = hydrateDraftBundle(bundle);
  } else {
    appState.drafts.unshift(hydrateDraftBundle(bundle));
  }
  appState.drafts.sort((a, b) => String(b.meta.last_saved_at).localeCompare(String(a.meta.last_saved_at)));
}

function startNewRecord() {
  clearSaveTimer();
  appState.wizardErrors = { summary: [], fields: {} };
  setGlobalNotice("", "");
  const bundle = hydrateDraftBundle(createEmptyDraftBundle());
  appState.currentDraft = bundle;
  appState.currentDraftLoadedId = bundle.draft_id;
  setSaveStatus("idle", "");
  navigate(`#/wizard/${bundle.draft_id}`);
}

async function saveAndCloseDraft() {
  const saved = await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  if (!saved) {
    return;
  }
  if (isEditRoute() && isEditingDraft(appState.currentDraft)) {
    navigate(`#/detail/${appState.currentDraft.start_context.editing_trip_id}`);
    return;
  }
  navigate("#/home");
}

async function moveStep(stepId) {
  if (!appState.currentDraft) {
    return;
  }
  const normalizedStepId = normalizeWizardStepId(appState.currentDraft, stepId);
  appState.currentDraft.meta.current_step = normalizedStepId;
  if (normalizedStepId === "confirm") {
    appState.currentDraft.meta.return_step_after_edit = "";
  }
  await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  appState.wizardErrors = { summary: [], fields: {} };
  render();
}

async function advanceWizard() {
  const bundle = appState.currentDraft;
  if (!bundle) {
    return;
  }
  const currentStep = normalizeWizardStepId(bundle, bundle.meta.current_step);
  bundle.meta.current_step = currentStep;
  if (isCardQuestionMode(bundle) && currentStep !== "start" && currentStep !== "confirm") {
    const question = getQuestionById(bundle, currentStep);
    if (!question) {
      bundle.meta.current_step = "confirm";
      render();
      return;
    }
    const validation = validateQuestionStep(question, bundle);
    if (validation.summary.length) {
      appState.wizardErrors = validation;
      appState.shouldFocusErrorSummary = true;
      render();
      return;
    }
    commitQuestionStep(question, bundle);
    bundle.meta.current_step = getNextQuestionId(bundle, currentStep);
    appState.wizardErrors = { summary: [], fields: {} };
    await persistCurrentDraft({
      saveMessage: recordSavedMessage(),
    });
    render();
    return;
  }
  const validation = validateStep(currentStep, bundle);
  if (validation.summary.length) {
    appState.wizardErrors = validation;
    appState.shouldFocusErrorSummary = true;
    render();
    return;
  }
  if (currentStep === "start") {
    applyStartContext(bundle);
    if (isCardQuestionMode(bundle)) {
      bundle.meta.current_step = getFirstQuestionId(bundle);
      appState.wizardErrors = { summary: [], fields: {} };
      await persistCurrentDraft({
        saveMessage: recordSavedMessage(),
      });
      render();
      return;
    }
  }
  const shouldReturnToConfirm =
    bundle.meta.return_step_after_edit === "confirm" && currentStep !== "confirm";
  bundle.meta.current_step = shouldReturnToConfirm ? "confirm" : nextWizardStepId(bundle, currentStep);
  if (shouldReturnToConfirm) {
    bundle.meta.return_step_after_edit = "";
  }
  appState.wizardErrors = { summary: [], fields: {} };
  await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  render();
}

function validateStep(stepId, bundle) {
  const normalizedStepId = normalizeWizardStepId(bundle, stepId);
  const fields = {};
  const summary = [];
  const questionMode = isCardQuestionMode(bundle);
  const questionModeType = questionMode ? getQuestionMode(bundle) : "";
  const locationDeferred = getCurrentQuestionAnswer(bundle, "quick_location")?.state === "deferred";
  const add = (path, message) => {
    fields[path] = message;
    summary.push({
      id: fieldIdForPath(path),
      path,
      message,
    });
  };
  if (normalizedStepId === "start") {
    if (!bundle.start_context.start_method) {
      add("start_context.entry_choice", "記録のしかたを選んでください");
    }
    if (bundle.start_context.start_method === "template" && !bundle.start_context.template_id) {
      add("start_context.template_id", "テンプレートを選んでください");
    }
  }
  const isCompactQuestionConfirm =
    questionMode && ["quick", "photo_first"].includes(questionModeType) && normalizedStepId === "confirm";
  if (normalizedStepId === "basic" || normalizedStepId === "quick_capture" || (normalizedStepId === "confirm" && !isCompactQuestionConfirm)) {
    if (!bundle.trip.started_at) {
      add("trip.started_at", "開始日時を入力してください");
    }
    if (bundle.trip.ended_at && bundle.trip.started_at && bundle.trip.ended_at < bundle.trip.started_at) {
      add("trip.ended_at", "終了日時は開始日時よりあとにしてください");
    }
    if (!bundle.trip.location_region?.trim() && !(questionMode && (locationDeferred || questionModeType === "photo_first"))) {
      add("trip.location_region", "地域を入力してください");
    }
    if (!bundle.trip.trip_type) {
      add("trip.trip_type", "釣行種別を選んでください");
    }
    if (!bundle.trip.water_type) {
      add("trip.water_type", "水域を選んでください");
    }
    if (!bundle.trip.privacy_level) {
      add("trip.privacy_level", "公開範囲を選んでください");
    }
  }
  if (normalizedStepId === "result" || normalizedStepId === "quick_capture" || normalizedStepId === "confirm") {
    if (!bundle.trip.result?.result_type) {
      add("trip.result.result_type", "結果を選んでください");
    }
    if (bundle.trip.result.result_type === "caught" && !questionMode) {
      if (bundle.trip.catches.length === 0) {
        add("trip.catches", "釣れた場合は釣果を 1 件以上入力してください");
      }
      bundle.trip.catches.forEach((item, index) => {
        if (!item.species_name?.trim()) {
          add(`trip.catches.${index}.species_name`, `釣果 ${index + 1} の魚種を入力してください`);
        }
      });
    }
  }
  return { summary, fields };
}

function applyStartContext(bundle) {
  const context = bundle.start_context;
  const signature = `${context.start_method}:${context.template_id}:${context.record_mode}`;
  if (context.setup_signature === signature && context.editing_trip_id) {
    return;
  }
  if (context.editing_trip_id) {
    context.setup_signature = signature;
    return;
  }

  const baseTrip = createEmptyDraftBundle().trip;
  let nextTrip = structuredClone(baseTrip);
  nextTrip.trip_id = bundle.trip.trip_id;
  nextTrip.created_at = bundle.trip.created_at;
  nextTrip.updated_at = nowIso();
  nextTrip.status = "draft";

  if (context.start_method === "reuse_last") {
    const lastTrip = appState.trips[0];
    if (lastTrip) {
      nextTrip = reuseTripAsTemplate(lastTrip, nextTrip.trip_id, nextTrip.created_at);
    } else {
      setGlobalNotice("warning", "前回の保存済み記録がないため、空白から始めます");
    }
  }
  if (context.start_method === "template") {
    const template = TEMPLATE_OPTIONS.find((item) => item.id === context.template_id);
    if (template) {
      nextTrip.trip_type = template.trip_type;
      nextTrip.water_type = template.water_type;
      nextTrip.tackle = {
        ...nextTrip.tackle,
        ...template.tackle,
      };
    }
  }
  if (context.record_mode === "quick") {
    nextTrip.ended_at = "";
  }
  if (context.record_mode === "photo_first") {
    nextTrip.ended_at = "";
    nextTrip.result.result_type = "no_response";
  }
  bundle.trip = nextTrip;
  bundle.question_answers = {};
  bundle.meta.trip_id = nextTrip.trip_id;
  context.setup_signature = signature;
}

function reuseTripAsTemplate(sourceTrip, tripId, createdAt) {
  const base = sanitizeTripForSave(sourceTrip, "draft");
  const next = structuredClone(base);
  next.trip_id = tripId;
  next.created_at = createdAt;
  next.updated_at = nowIso();
  next.status = "draft";
  next.started_at = createEmptyDraftBundle().trip.started_at;
  next.ended_at = createEmptyDraftBundle().trip.ended_at;
  next.result = {
    result_type: "no_response",
    catch_count_total: 0,
    result_note: "",
    event_time: "",
    event_lure: "",
    event_note: "",
  };
  next.catches = [];
  next.photos = [];
  next.trip_summary = "";
  next.next_try = "";
  return next;
}

function addCatch() {
  if (!appState.currentDraft) {
    return;
  }
  const catchRecord = createEmptyCatch();
  catchRecord.trip_id = appState.currentDraft.trip.trip_id;
  appState.currentDraft.trip.catches.push(catchRecord);
  scheduleDraftSave();
  render();
}

function reuseLastTackle() {
  if (!appState.currentDraft) {
    return;
  }
  const lastTrip = sortTripsByStartedAtDesc(appState.trips).find((trip) => trip.tackle);
  if (!lastTrip?.tackle) {
    setGlobalNotice("warning", "前回のタックル記録がないため、流用できません");
    render();
    return;
  }
  appState.currentDraft.trip.tackle = structuredClone(lastTrip.tackle);
  scheduleDraftSave();
  render();
}

function removeCatch(index) {
  if (!appState.currentDraft) {
    return;
  }
  appState.currentDraft.trip.catches.splice(index, 1);
  scheduleDraftSave();
  render();
}

async function handlePhotoUpload(event) {
  const files = Array.from(event.currentTarget.files ?? []);
  if (!files.length || !appState.currentDraft) {
    return;
  }
  try {
    setSaveStatus("saving", "下書き保存中");
    let unsupportedHeicCount = 0;
    for (const file of files) {
      const photo = await createPhotoRecord(file, appState.currentDraft.trip.trip_id, appState.currentDraft.trip.photos.length === 0);
      if (isPhotoPreviewUnavailable(photo)) {
        unsupportedHeicCount += 1;
      }
      appState.currentDraft.trip.photos.push(photo);
    }
    await hydratePreviewUrls(appState.currentDraft.trip.photos);
    await persistCurrentDraft({
      saveMessage: recordSavedMessage(),
    });
    if (unsupportedHeicCount > 0) {
      setGlobalNotice(
        "warning",
        `${unsupportedHeicCount}枚の HEIC 写真を保存しましたこのブラウザでは表示用画像を作れなかったため、一覧や詳細では代わりの案内を表示します`,
      );
    }
    render();
  } catch (error) {
    setSaveStatus("error", recordSaveErrorMessage());
    setGlobalNotice("error", error?.message ?? "写真の保存に失敗しました");
    render();
  } finally {
    event.currentTarget.value = "";
  }
}

async function createPhotoRecord(file, tripId, makeMain) {
  const originalKey = createId("blob");
  const thumbKey = createId("blob");
  const mediumKey = createId("blob");
  const sourceMimeType = detectPhotoMimeType(file);
  await saveBlob(originalKey, file);
  const photo = createEmptyPhoto();
  photo.trip_id = tripId;
  photo.photo_role = makeMain ? "main" : "trip";
  photo.original_blob_key = originalKey;
  photo.source_mime_type = sourceMimeType;
  photo.preview_status = "ready";
  photo.caption = file.name;
  try {
    const thumbBlob = await resizeImageBlob(file, 360, 360, 0.82);
    const mediumBlob = await resizeImageBlob(file, 1280, 1280, 0.88);
    await saveBlob(thumbKey, thumbBlob);
    await saveBlob(mediumKey, mediumBlob);
    photo.thumb_blob_key = thumbKey;
    photo.medium_blob_key = mediumKey;
  } catch (error) {
    if (!isHeicLikeFile(file)) {
      throw error;
    }
    photo.preview_status = "browser_unsupported";
  }
  return photo;
}

function resizeImageBlob(file, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("画像を縮小できませんでした"));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (!blob) {
            reject(new Error("画像の保存形式を作れませんでした"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        quality,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("画像を読み込めませんでした"));
    };
    image.src = objectUrl;
  });
}

function removePhoto(index) {
  if (!appState.currentDraft) {
    return;
  }
  appState.currentDraft.trip.photos.splice(index, 1);
  if (appState.currentDraft.trip.photos.length && !appState.currentDraft.trip.photos.some((item) => item.photo_role === "main")) {
    appState.currentDraft.trip.photos[0].photo_role = "main";
  }
  scheduleDraftSave();
  render();
}

function movePhoto(index, direction) {
  if (!appState.currentDraft) {
    return;
  }
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= appState.currentDraft.trip.photos.length) {
    return;
  }
  const list = appState.currentDraft.trip.photos;
  const [moved] = list.splice(index, 1);
  list.splice(nextIndex, 0, moved);
  scheduleDraftSave();
  render();
}

function setMainPhoto(index) {
  if (!appState.currentDraft) {
    return;
  }
  appState.currentDraft.trip.photos.forEach((item, itemIndex) => {
    item.photo_role = itemIndex === index ? "main" : item.photo_role === "main" ? "trip" : item.photo_role;
  });
  scheduleDraftSave();
  render();
}

async function finalizeCurrentTrip() {
  const bundle = appState.currentDraft;
  if (!bundle) {
    return;
  }
  const validation = validateStep("confirm", bundle);
  if (validation.summary.length) {
    appState.wizardErrors = validation;
    appState.shouldFocusErrorSummary = true;
    render();
    return;
  }
  try {
    setSaveStatus("saving", "下書き保存中");
    const finalTrip = sanitizeTripForSave(bundle.trip, "final");
    finalTrip.updated_at = nowIso();
    await saveTripAndDeleteDraft(finalTrip, bundle.draft_id);
    const mergedCandidates = mergeCandidateData(
      appState.candidateData,
      extractCandidatesFromTrip(finalTrip),
    );
    await saveCandidateData(mergedCandidates);
    appState.candidateData = mergedCandidates;
    appState.trips = [finalTrip, ...appState.trips.filter((item) => item.trip_id !== finalTrip.trip_id)].sort((a, b) =>
      String(b.updated_at).localeCompare(String(a.updated_at)),
    );
    appState.drafts = appState.drafts.filter((item) => item.draft_id !== bundle.draft_id);
    appState.currentDraft = null;
    appState.currentDraftLoadedId = "";
    appState.wizardErrors = { summary: [], fields: {} };
    setSaveStatus("saved", recordSavedMessage());
    appState.latestSavedTripId = finalTrip.trip_id;
    if (isEditingDraft(bundle)) {
      navigate(`#/detail/${finalTrip.trip_id}`);
      return;
    }
    navigate(`#/saved/${finalTrip.trip_id}`);
  } catch (error) {
    setSaveStatus("error", recordSaveErrorMessage());
    setGlobalNotice("error", error?.message ?? "記録の保存に失敗しました");
    render();
  }
}

function filterTrips(trips, filters) {
  const normalized = Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, String(value ?? "").trim().toLowerCase()]),
  );
  return trips.filter((trip) => {
    const placeText = [trip.location_region, trip.location_name, trip.point_name, trip.boat_name]
      .join(" ")
      .toLowerCase();
    const speciesText = collectSpeciesLabel(trip).toLowerCase();
    const methodText = (trip.tackle?.method_name || "").toLowerCase();
    const lureText = [trip.tackle?.lure_or_bait_name, ...(trip.catches ?? []).map((item) => item.lure_used)]
      .join(" ")
      .toLowerCase();
    const maxSize = computeMaxSize(trip);

    if (normalized.date && toDateInput(trip.started_at) !== normalized.date) {
      return false;
    }
    if (normalized.location && !placeText.includes(normalized.location)) {
      return false;
    }
    if (normalized.species && !speciesText.includes(normalized.species)) {
      return false;
    }
    if (normalized.method && !methodText.includes(normalized.method)) {
      return false;
    }
    if (normalized.result_type && (trip.result?.result_type || "") !== normalized.result_type) {
      return false;
    }
    if (normalized.weather && (trip.conditions?.weather || "") !== normalized.weather) {
      return false;
    }
    if (normalized.tide && (trip.conditions?.tide_name || "") !== normalized.tide) {
      return false;
    }
    if (normalized.wind && (trip.conditions?.wind_level || "") !== normalized.wind) {
      return false;
    }
    if (normalized.lure && !lureText.includes(normalized.lure)) {
      return false;
    }
    if (normalized.size_min && maxSize < Number(normalized.size_min)) {
      return false;
    }
    if (normalized.size_max && maxSize > Number(normalized.size_max)) {
      return false;
    }
    if (normalized.result_presence === "yes" && trip.result?.result_type !== "caught") {
      return false;
    }
    if (normalized.result_presence === "no" && trip.result?.result_type === "caught") {
      return false;
    }
    return true;
  });
}

async function buildRecentItems() {
  const items = [
    ...appState.drafts.slice(0, 3).map((draft) => ({
      kind: "draft",
      updated_at: draft.meta.last_saved_at || draft.trip.updated_at,
      value: draft,
    })),
    ...appState.trips.slice(0, 6).map((trip) => ({
      kind: "trip",
      updated_at: trip.updated_at,
      value: trip,
    })),
  ]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, 6);

  return Promise.all(
    items.map((item) =>
      item.kind === "draft"
        ? renderDraftCard(item.value, { compact: true })
        : renderTripCard(item.value, "final", { compact: true }),
    ),
  );
}

function chooseRepresentativePhoto(trip) {
  return (trip.photos ?? []).find((item) => item.photo_role === "main") ?? trip.photos?.[0] ?? null;
}

async function hydratePreviewUrls(photos) {
  await Promise.all(
    photos.map(async (photo) => {
      await getImageUrl(photo.thumb_blob_key || photo.medium_blob_key || photo.original_blob_key);
    }),
  );
}

async function getImageUrl(blobKey) {
  if (!blobKey) {
    return "";
  }
  if (appState.mediaCache.has(blobKey)) {
    return appState.mediaCache.get(blobKey);
  }
  const blob = await getBlob(blobKey);
  if (!blob) {
    return "";
  }
  const url = URL.createObjectURL(blob);
  appState.mediaCache.set(blobKey, url);
  return url;
}

async function createEditDraft(tripId, step = "basic") {
  const trip = appState.trips.find((item) => item.trip_id === tripId);
  if (!trip) {
    return;
  }
  const bundle = hydrateDraftBundle(createEmptyDraftBundle());
  bundle.trip = structuredClone(trip);
  bundle.trip.status = "draft";
  bundle.trip.updated_at = nowIso();
  bundle.meta.trip_id = bundle.trip.trip_id;
  bundle.start_context.record_mode = "detailed";
  bundle.start_context.start_method = "blank";
  bundle.start_context.editing_trip_id = trip.trip_id;
  bundle.meta.current_step = normalizeWizardStepId(bundle, step);
  normalizeEditDraftForRoute(bundle, { name: "edit" });
  appState.currentDraft = bundle;
  appState.currentDraftLoadedId = bundle.draft_id;
  await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  navigate(`#/edit/${bundle.draft_id}`);
}

async function createDuplicateDraft(tripId) {
  const trip = appState.trips.find((item) => item.trip_id === tripId);
  if (!trip) {
    return;
  }
  const bundle = hydrateDraftBundle(createEmptyDraftBundle());
  const copy = structuredClone(trip);
  copy.trip_id = bundle.trip.trip_id;
  copy.status = "draft";
  copy.created_at = bundle.trip.created_at;
  copy.updated_at = nowIso();
  copy.catches = (copy.catches ?? []).map((item) => ({
    ...item,
    catch_id: createId("catch"),
    trip_id: copy.trip_id,
  }));
  copy.photos = (copy.photos ?? []).map((item) => ({
    ...item,
    photo_id: createId("photo"),
    trip_id: copy.trip_id,
  }));
  bundle.trip = copy;
  bundle.meta.trip_id = copy.trip_id;
  bundle.meta.current_step = "basic";
  bundle.start_context.record_mode = "detailed";
  bundle.start_context.start_method = "reuse_last";
  appState.currentDraft = bundle;
  appState.currentDraftLoadedId = bundle.draft_id;
  await persistCurrentDraft({
    saveMessage: recordSavedMessage(),
  });
  navigate(`#/wizard/${bundle.draft_id}`);
}

async function exportBackupJson() {
  try {
    const data = await exportAllData();
    const payload = buildBackupPayload(data);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const fileName = `tsurinote-backup-${backupTimestamp()}.tsurinote`;
    const saveMethod = await saveBackupFile(blob, fileName);
    if (!saveMethod) {
      return;
    }
    const backupStatus = {
      last_backup_at: nowIso(),
      message: "控えを保存しました",
    };
    await saveBackupStatus(backupStatus);
    appState.backupStatus = backupStatus;
    setGlobalNotice(
      "info",
      saveMethod === "picker"
        ? "控えを保存しました"
        : "控えを保存しました 保存後に控えファイルが開いた場合は そのまま閉じて問題ありません",
    );
    render();
  } catch (error) {
    setGlobalNotice("error", error?.message ?? "バックアップの保存に失敗しました");
    render();
  }
}

async function saveCurrentRestorePoint() {
  try {
    const data = await exportAllData();
    const payload = buildBackupPayload(data);
    const createdAt = nowIso();
    const label = `${formatDateTime(createdAt)} の控え`;
    const restorePoint = {
      id: createId("restore"),
      label,
      created_at: createdAt,
      summary: createRestorePointSummary(payload, label, createdAt),
      payload: {
        trips: payload.records.trips,
        drafts: payload.records.drafts,
        candidateData: payload.candidate_data,
      },
    };
    const result = await saveRestorePoint(restorePoint);
    appState.restorePoints = Array.isArray(result?.restorePoints)
      ? result.restorePoints
      : appState.restorePoints;
    setGlobalNotice("info", "この状態を控えとして残しました");
    render();
  } catch (error) {
    setGlobalNotice("error", error?.message ?? "控えの保存に失敗しました");
    render();
  }
}

async function restorePointById(restorePointId) {
  if (!restorePointId) {
    return;
  }
  const accepted = window.confirm("いまの記録を この控えの状態に入れ替えます");
  if (!accepted) {
    return;
  }
  try {
    await restoreFromRestorePoint(restorePointId);
    appState.pendingRestore = null;
    await refreshFromStorage();
    setGlobalNotice("info", "控えを読み込みました");
    navigate("#/backup");
  } catch (error) {
    setGlobalNotice("error", error?.message ?? "控えの読み込みに失敗しました");
    render();
  }
}

function stripPhotoBlobKeysForBackup(trip) {
  return {
    ...structuredClone(trip),
    photos: (trip.photos ?? []).map((photo) => ({
      ...photo,
      thumb_blob_key: "",
      medium_blob_key: "",
      original_blob_key: "",
    })),
  };
}

function stripDraftPhotoBlobKeysForBackup(draft) {
  return {
    ...structuredClone(draft),
    trip: stripPhotoBlobKeysForBackup(draft.trip),
  };
}

function backupTimestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

async function saveBackupFile(blob, fileName) {
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "釣り記録バックアップ",
            accept: {
              "application/octet-stream": [".tsurinote"],
              "application/json": [".json"],
            },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "picker";
    } catch (error) {
      if (error?.name === "AbortError") {
        return false;
      }
      throw error;
    }
  }
  downloadBlob(blob, fileName);
  return "download";
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function handleBackupFileChange(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    appState.pendingRestore = inspectBackupPayload(payload);
    render();
  } catch (error) {
    appState.pendingRestore = {
      manifest: {
        backup_version: "?",
        exported_at: "",
        record_count: 0,
        includes_photos: false,
      },
      errors: [error?.message ?? "控えファイルの読み取りに失敗しました"],
      duplicateCount: 0,
      normalized: null,
    };
    render();
  } finally {
    event.currentTarget.value = "";
  }
}

function inspectBackupPayload(payload) {
  const errors = [];
  if (!payload?.manifest) {
    errors.push("manifest がありません");
  }
  if (!payload?.records) {
    errors.push("records がありません");
  }
  const manifest = payload?.manifest ?? {
    backup_version: "",
    exported_at: "",
    record_count: 0,
    includes_photos: false,
    app_version: "",
  };
  const trips = Array.isArray(payload?.records?.trips) ? payload.records.trips : [];
  const drafts = Array.isArray(payload?.records?.drafts) ? payload.records.drafts : [];
  if (manifest.backup_version !== "1") {
    errors.push("backup_version が対応外です");
  }
  if (Number(manifest.record_count) !== trips.length + drafts.length) {
    errors.push("record_count と実データ数が一致しません");
  }
  if (
    manifest.trip_count !== undefined &&
    Number(manifest.trip_count) !== trips.length
  ) {
    errors.push("trip_count と保存済み記録数が一致しません");
  }
  if (
    manifest.draft_count !== undefined &&
    Number(manifest.draft_count) !== drafts.length
  ) {
    errors.push("draft_count と下書き数が一致しません");
  }
  if (typeof manifest.includes_photos !== "boolean") {
    errors.push("includes_photos の値が不正です");
  }
  if (!manifest.app_version) {
    errors.push("app_version がありません");
  }
  const duplicateIds = countDuplicateIds(trips, drafts);
  return {
    manifest,
    tripCount: trips.length,
    draftCount: drafts.length,
    errors,
    duplicateCount: duplicateIds,
    normalized: errors.length
      ? null
      : {
          trips: trips.map((trip) => sanitizeTripForSave(trip, trip.status || "final")),
          drafts: drafts.map((draft) => hydrateDraftBundle(draft)),
          candidateData: payload.candidate_data ?? {},
        },
  };
}

function countDuplicateIds(trips, drafts) {
  const existingTripIds = new Set(appState.trips.map((item) => item.trip_id));
  const existingDraftIds = new Set(appState.drafts.map((item) => item.draft_id));
  let count = 0;
  trips.forEach((trip) => {
    if (existingTripIds.has(trip.trip_id)) {
      count += 1;
    }
  });
  drafts.forEach((draft) => {
    if (existingDraftIds.has(draft.draft_id)) {
      count += 1;
    }
  });
  return count;
}

async function applyPendingRestore() {
  if (!appState.pendingRestore?.normalized) {
    return;
  }
  try {
    const normalized = remapRestoreData(appState.pendingRestore.normalized);
    await restoreBackupData(normalized);
    await refreshFromStorage();
    appState.pendingRestore = null;
    setGlobalNotice("info", "バックアップから追加復元しました");
    navigate("#/backup");
  } catch (error) {
    setGlobalNotice("error", error?.message ?? "バックアップの復元に失敗しました");
    render();
  }
}

function remapRestoreData(data) {
  const existingTripIds = new Set(appState.trips.map((item) => item.trip_id));
  const existingDraftIds = new Set(appState.drafts.map((item) => item.draft_id));
  const tripIdMap = new Map();
  const catchIdMap = new Map();

  const trips = data.trips.map((trip) => {
    const nextTrip = structuredClone(trip);
    const newTripId = !nextTrip.trip_id || existingTripIds.has(nextTrip.trip_id) ? createId("trip") : nextTrip.trip_id;
    tripIdMap.set(nextTrip.trip_id, newTripId);
    nextTrip.trip_id = newTripId;
    nextTrip.photos = (nextTrip.photos ?? []).map((photo) => ({
      ...photo,
      trip_id: newTripId,
      thumb_blob_key: "",
      medium_blob_key: "",
      original_blob_key: "",
    }));
    nextTrip.catches = (nextTrip.catches ?? []).map((item) => {
      const newCatchId = !item.catch_id || catchIdMap.has(item.catch_id) ? createId("catch") : item.catch_id;
      catchIdMap.set(item.catch_id, newCatchId);
      return {
        ...item,
        catch_id: newCatchId,
        trip_id: newTripId,
      };
    });
    return nextTrip;
  });

  const drafts = data.drafts.map((draft) => {
    const nextDraft = hydrateDraftBundle(draft);
    const nextDraftId =
      !nextDraft.draft_id || existingDraftIds.has(nextDraft.draft_id) ? createId("draft") : nextDraft.draft_id;
    const oldTripId = nextDraft.trip.trip_id;
    const newTripId = tripIdMap.get(oldTripId) ?? createId("trip");
    nextDraft.draft_id = nextDraftId;
    nextDraft.trip.trip_id = newTripId;
    nextDraft.trip.status = "draft";
    nextDraft.trip.photos = (nextDraft.trip.photos ?? []).map((photo) => ({
      ...photo,
      trip_id: newTripId,
      thumb_blob_key: "",
      medium_blob_key: "",
      original_blob_key: "",
    }));
    nextDraft.trip.catches = (nextDraft.trip.catches ?? []).map((item) => ({
      ...item,
      catch_id: createId("catch"),
      trip_id: newTripId,
    }));
    nextDraft.meta.draft_id = nextDraftId;
    nextDraft.meta.trip_id = newTripId;
    return nextDraft;
  });

  return {
    trips,
    drafts,
    candidateData: mergeCandidateData(appState.candidateData, data.candidateData),
  };
}
