// @ts-check

export const APP_VERSION = "0.1.0";

export const STEP_ORDER = [
  {
    id: "start",
    name: "開始方法",
    description: "記録の始め方と、簡単に記録するかどうかを決めます",
    nextLabel: "基本情報へ進む",
  },
  {
    id: "basic",
    name: "基本情報",
    description: "釣行日、場所、水域、釣行種別などを入力します",
    nextLabel: "釣行条件へ進む",
  },
  {
    id: "conditions",
    name: "釣行条件",
    description: "天候、風、潮や濁りなど、その日の状況を記録します",
    nextLabel: "釣法・タックルへ進む",
  },
  {
    id: "tackle",
    name: "釣法・タックル",
    description: "釣り方や使った道具、ルアーやエサを入力します",
    nextLabel: "釣果へ進む",
  },
  {
    id: "result",
    name: "釣果",
    description: "釣れた魚、アタリのみ、チェイスのみ、反応なしを記録します",
    nextLabel: "写真・メモへ進む",
  },
  {
    id: "photos_memo",
    name: "写真・メモ",
    description: "写真、全体メモ、次回に試したいことを残します",
    nextLabel: "確認へ進む",
  },
  {
    id: "confirm",
    name: "確認",
    description: "保存前に内容を見直します",
    nextLabel: "この内容で保存する",
  },
];

export const START_METHODS = [
  {
    value: "blank",
    label: "空白から始める",
    description: "その日の内容を一から入力します",
  },
  {
    value: "reuse_last",
    label: "前回の内容を流用する",
    description: "前回の釣行内容を土台にして、違うところだけ直します",
  },
  {
    value: "template",
    label: "テンプレートから始める",
    description: "よくある釣り方の型を呼び出して始めます",
  },
];

export const RECORD_MODES = [
  {
    value: "quick",
    label: "今すぐ簡単に記録",
    description: "釣り場で最低限だけ残します",
  },
  {
    value: "detailed",
    label: "しっかり記録",
    description: "条件や反省点まで詳しく残します",
  },
  {
    value: "photo_first",
    label: "写真だけ先に保存",
    description: "写真だけ追加して、あとから追記します",
  },
];

export const TEMPLATE_OPTIONS = [
  {
    id: "shore-lure",
    name: "堤防ルアー",
    trip_type: "shore",
    water_type: "sea",
    tackle: {
      method_name: "ルアー",
      target_range: "middle",
      lure_weight_unit: "g",
    },
  },
  {
    id: "boat-tai",
    name: "船釣り",
    trip_type: "boat",
    water_type: "sea",
    tackle: {
      method_name: "タイラバ",
      target_range: "bottom",
      lure_weight_unit: "g",
    },
  },
];

export const OPTION_LABELS = {
  trip_type: {
    shore: "陸っぱり",
    boat: "船釣り",
    rock: "磯",
    raft: "いかだ",
    managed_pond: "管理釣り場",
    other: "その他",
  },
  water_type: {
    sea: "海",
    brackish: "汽水",
    river: "川",
    lake: "湖",
    pond: "池",
  },
  privacy_level: {
    private: "非公開",
    region_only: "地域まで",
    location_name: "釣り場名まで",
  },
  weather: {
    sunny: "晴れ",
    cloudy: "くもり",
    rainy: "雨",
    snowy: "雪",
    unknown: "不明",
  },
  time_band: {
    morning: "朝",
    daytime: "昼",
    evening: "夕方",
    night: "夜",
    unknown: "不明",
  },
  wind_level: {
    none: "なし",
    weak: "弱い",
    medium: "中くらい",
    strong: "強い",
    unknown: "不明",
  },
  tide_name: {
    spring: "大潮",
    middle: "中潮",
    neap: "小潮",
    long: "長潮",
    young: "若潮",
    unknown: "不明",
  },
  water_clarity: {
    clear: "澄み",
    normal: "普通",
    muddy: "濁り",
    unknown: "不明",
  },
  yesNoUnknown: {
    yes: "あり",
    no: "なし",
    unknown: "不明",
  },
  target_range: {
    surface: "表層",
    middle: "中層",
    bottom: "底",
    unknown: "不明",
  },
  result_type: {
    caught: "釣れた",
    bite_only: "アタリのみ",
    chase_only: "チェイスのみ",
    no_response: "反応なし",
  },
  keep_release: {
    keep: "持ち帰り",
    release: "リリース",
    unknown: "不明",
  },
  photo_role: {
    main: "代表写真",
    trip: "釣行写真",
    catch: "釣果写真",
    scenery: "風景",
    other: "その他",
  },
  validation_state: {
    incomplete: "未完了",
    needs_review: "確認が必要",
    complete: "入力済み",
  },
};

/**
 * @typedef {"draft" | "final" | "deleted"} TripStatus
 * @typedef {"sea" | "brackish" | "river" | "lake" | "pond"} WaterType
 * @typedef {"shore" | "boat" | "rock" | "raft" | "managed_pond" | "other"} TripType
 * @typedef {"private" | "region_only" | "location_name"} PrivacyLevel
 * @typedef {"sunny" | "cloudy" | "rainy" | "snowy" | "unknown"} Weather
 * @typedef {"none" | "weak" | "medium" | "strong" | "unknown"} WindLevel
 * @typedef {"spring" | "middle" | "neap" | "long" | "young" | "unknown"} TideName
 * @typedef {"clear" | "normal" | "muddy" | "unknown"} WaterClarity
 * @typedef {"morning" | "daytime" | "evening" | "night" | "unknown"} TimeBand
 * @typedef {"surface" | "middle" | "bottom" | "unknown"} RangeBand
 * @typedef {"caught" | "bite_only" | "chase_only" | "no_response"} ResultType
 * @typedef {"keep" | "release" | "unknown"} KeepRelease
 * @typedef {"main" | "trip" | "catch" | "scenery" | "other"} PhotoRole
 * @typedef {"answered" | "skipped" | "deferred"} AnswerState
 */

export function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function createEmptyCatch() {
  return {
    catch_id: createId("catch"),
    trip_id: "",
    species_name: "",
    length_cm: undefined,
    weight_g: undefined,
    count: 1,
    caught_at: "",
    lure_used: "",
    hit_range: "unknown",
    keep_release: "unknown",
    catch_note: "",
  };
}

export function createEmptyPhoto() {
  return {
    photo_id: createId("photo"),
    trip_id: "",
    catch_id: "",
    photo_role: "trip",
    thumb_blob_key: "",
    medium_blob_key: "",
    original_blob_key: "",
    source_mime_type: "",
    preview_status: "ready",
    caption: "",
    created_at: nowIso(),
  };
}

export function createEmptyTrip() {
  const currentTime = new Date();
  const roundedEnd = new Date(currentTime.getTime() + 60 * 60 * 1000);
  return {
    trip_id: createId("trip"),
    status: "draft",
    created_at: nowIso(),
    updated_at: nowIso(),
    started_at: toDateTimeLocal(currentTime),
    ended_at: toDateTimeLocal(roundedEnd),
    trip_type: "shore",
    water_type: "sea",
    location_region: "",
    location_name: "",
    point_name: "",
    standing_position_note: "",
    boat_name: "",
    companion_note: "",
    privacy_level: "private",
    conditions: {
      weather: "unknown",
      time_band: "unknown",
      wind_direction: "",
      wind_level: "unknown",
      wave_level: "",
      tide_name: "unknown",
      tide_note: "",
      flow_note: "",
      water_temp_c: undefined,
      air_temp_c: undefined,
      water_clarity: "unknown",
      bait_presence: "unknown",
      bird_activity: "unknown",
      condition_note: "",
    },
    tackle: {
      method_name: "",
      rod_name: "",
      reel_name: "",
      line_name: "",
      leader_name: "",
      lure_or_bait_name: "",
      lure_weight: undefined,
      lure_weight_unit: "g",
      color_name: "",
      target_range: "unknown",
      action_note: "",
    },
    result: {
      result_type: "no_response",
      catch_count_total: 0,
      result_note: "",
      event_time: "",
      event_lure: "",
      event_range: "unknown",
      event_note: "",
      reason_note: "",
    },
    catches: [],
    photos: [],
    trip_summary: "",
    reflection_note: "",
    next_try: "",
  };
}

export function createEmptyDraftBundle() {
  const trip = createEmptyTrip();
  return {
    draft_id: createId("draft"),
    trip,
    question_answers: {},
    meta: {
      draft_id: "",
      trip_id: trip.trip_id,
      current_step: "start",
      last_saved_at: "",
      validation_state: "incomplete",
      return_step_after_edit: "",
    },
    start_context: {
      start_method: "blank",
      record_mode: "quick",
      template_id: "",
      source_trip_id: "",
      editing_trip_id: "",
    },
  };
}

export function hydrateDraftBundle(bundle) {
  const fallback = createEmptyDraftBundle();
  const merged = {
    ...fallback,
    ...bundle,
    trip: {
      ...fallback.trip,
      ...(bundle?.trip ?? {}),
      conditions: {
        ...fallback.trip.conditions,
        ...(bundle?.trip?.conditions ?? {}),
      },
      tackle: {
        ...fallback.trip.tackle,
        ...(bundle?.trip?.tackle ?? {}),
      },
      result: {
        ...fallback.trip.result,
        ...(bundle?.trip?.result ?? {}),
      },
      catches: (bundle?.trip?.catches ?? []).map((item) => ({
        ...createEmptyCatch(),
        ...item,
      })),
      photos: (bundle?.trip?.photos ?? []).map((item) => ({
        ...createEmptyPhoto(),
        ...item,
      })),
    },
    meta: {
      ...fallback.meta,
      ...(bundle?.meta ?? {}),
    },
    question_answers: {
      ...(bundle?.question_answers ?? {}),
    },
    start_context: {
      ...fallback.start_context,
      ...(bundle?.start_context ?? {}),
    },
  };
  merged.meta.draft_id = merged.draft_id;
  merged.meta.trip_id = merged.trip.trip_id;
  return merged;
}

export function toDateInput(value) {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}

export function toDateTimeLocal(dateLike) {
  const date = new Date(dateLike);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isSeaLike(waterType) {
  return waterType === "sea" || waterType === "brackish";
}

export function isFreshwater(waterType) {
  return ["river", "lake", "pond"].includes(waterType);
}

export function isBoatLike(tripType) {
  return tripType === "boat";
}

export function isShoreLike(tripType) {
  return tripType === "shore";
}

export function computeTripValidationState(trip) {
  const errors = [];
  if (!trip.started_at) {
    errors.push("started_at");
  }
  if (!trip.location_region?.trim()) {
    errors.push("location_region");
  }
  if (!trip.trip_type) {
    errors.push("trip_type");
  }
  if (!trip.water_type) {
    errors.push("water_type");
  }
  if (trip.result?.result_type === "caught") {
    if (trip.catches.length === 0) {
      errors.push("catches");
    }
    if (trip.catches.some((item) => !item.species_name?.trim())) {
      errors.push("catch_species");
    }
  }
  return errors.length === 0 ? "complete" : "needs_review";
}

export function sanitizeTripForSave(trip, status = "final") {
  const copy = structuredClone(trip);
  copy.status = status;
  copy.updated_at = nowIso();
  copy.catches = (copy.catches ?? []).map((item) => ({
    ...item,
    trip_id: copy.trip_id,
    species_name: item.species_name?.trim() ?? "",
    lure_used: item.lure_used?.trim() ?? "",
    catch_note: item.catch_note?.trim() ?? "",
  }));
  copy.photos = (copy.photos ?? []).map((item) => ({
    ...item,
    trip_id: copy.trip_id,
    caption: item.caption?.trim() ?? "",
  }));
  copy.location_region = copy.location_region?.trim() ?? "";
  copy.location_name = copy.location_name?.trim() ?? "";
  copy.point_name = copy.point_name?.trim() ?? "";
  copy.boat_name = copy.boat_name?.trim() ?? "";
  copy.standing_position_note = copy.standing_position_note?.trim() ?? "";
  copy.companion_note = copy.companion_note?.trim() ?? "";
  copy.result.result_note = copy.result.result_note?.trim() ?? "";
  copy.result.event_lure = copy.result.event_lure?.trim() ?? "";
  copy.result.event_note = copy.result.event_note?.trim() ?? "";
  copy.result.reason_note = copy.result.reason_note?.trim() ?? "";
  copy.trip_summary = copy.trip_summary?.trim() ?? "";
  copy.reflection_note = copy.reflection_note?.trim() ?? "";
  copy.next_try = copy.next_try?.trim() ?? "";

  if (!isSeaLike(copy.water_type)) {
    delete copy.conditions.tide_name;
    delete copy.conditions.tide_note;
  }
  if (isFreshwater(copy.water_type)) {
    if (!copy.conditions.flow_note?.trim()) {
      delete copy.conditions.flow_note;
    }
  } else {
    delete copy.conditions.flow_note;
  }

  if (!isBoatLike(copy.trip_type)) {
    delete copy.boat_name;
  }
  if (!isShoreLike(copy.trip_type)) {
    delete copy.point_name;
    delete copy.standing_position_note;
  }

  if (copy.result.result_type === "caught") {
    copy.catches = copy.catches.filter((item) => item.species_name?.trim());
  }
  if (copy.result.result_type !== "caught") {
    copy.catches = [];
  }
  if (copy.result.result_type === "no_response") {
    delete copy.result.event_time;
    delete copy.result.event_lure;
    delete copy.result.event_range;
    delete copy.result.event_note;
  }
  if (copy.result.result_type === "caught") {
    delete copy.result.event_time;
    delete copy.result.event_lure;
    delete copy.result.event_range;
    delete copy.result.event_note;
    delete copy.result.reason_note;
  }
  if (copy.result.result_type === "bite_only" || copy.result.result_type === "chase_only") {
    delete copy.result.catch_count_total;
    delete copy.result.reason_note;
  }

  stripEmpty(copy);
  return copy;
}

export function stripEmpty(value) {
  if (Array.isArray(value)) {
    value.forEach(stripEmpty);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  Object.keys(value).forEach((key) => {
    const current = value[key];
    if (current === "" || current === null) {
      delete value[key];
      return;
    }
    if (typeof current === "object") {
      stripEmpty(current);
      if (!Array.isArray(current) && Object.keys(current).length === 0) {
        delete value[key];
      }
    }
  });
}

export function summarizeTrip(trip) {
  const species = collectSpeciesLabel(trip);
  const count = computeCatchCount(trip);
  const maxSize = computeMaxSize(trip);
  const method = trip.tackle?.method_name?.trim() || "未入力";
  return {
    date: formatDate(trip.started_at),
    place: trip.location_name || trip.location_region || "場所未入力",
    species,
    resultLabel: describeLabel("result_type", trip.result?.result_type),
    count: count > 0 ? `${count}匹` : "0匹",
    maxSize: maxSize ? `${maxSize}cm` : "未入力",
    method,
  };
}

export function computeCatchCount(trip) {
  if (typeof trip.result?.catch_count_total === "number") {
    return trip.result.catch_count_total;
  }
  return (trip.catches ?? []).reduce((sum, item) => sum + (Number(item.count) || 0), 0);
}

export function computeMaxSize(trip) {
  const values = (trip.catches ?? [])
    .map((item) => Number(item.length_cm))
    .filter((item) => Number.isFinite(item) && item > 0);
  return values.length ? Math.max(...values) : 0;
}

export function collectSpeciesLabel(trip) {
  if (trip.result?.result_type !== "caught") {
    return OPTION_LABELS.result_type[trip.result?.result_type ?? "no_response"];
  }
  const names = [...new Set((trip.catches ?? []).map((item) => item.species_name?.trim()).filter(Boolean))];
  return names.length ? names.join("、") : "魚種未入力";
}

export function primarySpeciesName(trip) {
  return (trip.catches ?? []).map((item) => item.species_name?.trim()).find(Boolean) ?? "";
}

export function formatDate(value) {
  if (!value) {
    return "未入力";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未入力";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) {
    return "未入力";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "未入力";
  }
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function describeLabel(group, value) {
  if (!value) {
    return "未入力";
  }
  return OPTION_LABELS[group]?.[value] ?? value;
}

export function mapStepToSection(stepId) {
  return STEP_ORDER.findIndex((item) => item.id === stepId);
}

export function nextStepId(stepId) {
  const index = mapStepToSection(stepId);
  return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)].id;
}

export function previousStepId(stepId) {
  const index = mapStepToSection(stepId);
  return STEP_ORDER[Math.max(index - 1, 0)].id;
}

export function extractCandidatesFromTrip(trip) {
  return {
    locationRegions: [trip.location_region],
    locationNames: [trip.location_name],
    pointNames: [trip.point_name],
    boatNames: [trip.boat_name],
    methods: [trip.tackle?.method_name],
    speciesNames: (trip.catches ?? []).map((item) => item.species_name),
    lures: [trip.tackle?.lure_or_bait_name, ...(trip.catches ?? []).map((item) => item.lure_used)],
    rods: [trip.tackle?.rod_name],
    reels: [trip.tackle?.reel_name],
    lines: [trip.tackle?.line_name],
    leaders: [trip.tackle?.leader_name],
  };
}

export function mergeCandidateData(base = {}, addition = {}) {
  const merged = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(addition)]);
  keys.forEach((key) => {
    const combined = [...(addition[key] ?? []), ...(base[key] ?? [])]
      .map((item) => item?.trim())
      .filter(Boolean);
    merged[key] = [...new Set(combined)].slice(0, 30);
  });
  return merged;
}

export function createBackupManifest({
  recordCount,
  tripCount = 0,
  draftCount = 0,
  includesPhotos,
  checksum = "",
}) {
  return {
    backup_version: "1",
    app_version: APP_VERSION,
    exported_at: nowIso(),
    record_count: recordCount,
    trip_count: tripCount,
    draft_count: draftCount,
    includes_photos: includesPhotos,
    checksum,
  };
}
