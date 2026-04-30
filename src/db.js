// @ts-check

const DB_NAME = "fishing-log-web-v1";
const DB_VERSION = 1;
const STORE_TRIPS = "trips";
const STORE_DRAFTS = "drafts";
const STORE_BLOBS = "blobs";
const STORE_META = "meta";

const STORAGE_MODE_LOCAL = "local";
const STORAGE_MODE_REMOTE = "remote";
const REMOTE_API_BASE = "/api";
const ENABLE_REMOTE_STORAGE = false;

let databasePromise;
let activeStorageMode = STORAGE_MODE_LOCAL;

function canUseRemoteStorage() {
  return (
    ENABLE_REMOTE_STORAGE &&
    typeof window !== "undefined" &&
    typeof fetch === "function" &&
    /^https?:$/.test(window.location.protocol)
  );
}

export function getActiveStorageMode() {
  return activeStorageMode;
}

async function fetchRemoteJson(path, options = {}) {
  const response = await fetch(`${REMOTE_API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error("サイト保存の応答を読み取れませんでした");
    }
  }

  if (!response.ok) {
    const message =
      payload?.error ||
      payload?.message ||
      `サイト保存に失敗しました (${response.status})`;
    throw new Error(message);
  }

  return payload ?? {};
}

function openDatabase() {
  if (databasePromise) {
    return databasePromise;
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_TRIPS)) {
        const trips = db.createObjectStore(STORE_TRIPS, { keyPath: "trip_id" });
        trips.createIndex("updated_at", "updated_at");
        trips.createIndex("status", "status");
      }
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        const drafts = db.createObjectStore(STORE_DRAFTS, { keyPath: "draft_id" });
        drafts.createIndex("last_saved_at", "meta.last_saved_at");
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: "blob_key" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction(storeNames, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve(result);
    Promise.resolve(callback(tx))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        reject(error);
      });
  });
}

async function loadInitialDataLocal() {
  return runTransaction([STORE_TRIPS, STORE_DRAFTS, STORE_META], "readonly", async (tx) => {
    const tripsStore = tx.objectStore(STORE_TRIPS);
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const metaStore = tx.objectStore(STORE_META);
    const [trips, drafts, candidateDataRecord, backupStatusRecord, restorePointsRecord] = await Promise.all([
      promisify(tripsStore.getAll()),
      promisify(draftsStore.getAll()),
      promisify(metaStore.get("candidate_data")),
      promisify(metaStore.get("backup_status")),
      promisify(metaStore.get("restore_points")),
    ]);
    return {
      trips: (trips ?? []).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
      drafts: (drafts ?? []).sort((a, b) =>
        String(b?.meta?.last_saved_at ?? "").localeCompare(String(a?.meta?.last_saved_at ?? "")),
      ),
      candidateData: candidateDataRecord?.value ?? {},
      backupStatus: backupStatusRecord?.value ?? { last_backup_at: "", message: "" },
      restorePoints: Array.isArray(restorePointsRecord?.value)
        ? restorePointsRecord.value.map((item) => ({
            id: item.id,
            label: item.label,
            created_at: item.created_at,
            summary: item.summary ?? null,
          }))
        : [],
    };
  });
}

async function getDraftLocal(draftId) {
  return runTransaction([STORE_DRAFTS], "readonly", async (tx) =>
    promisify(tx.objectStore(STORE_DRAFTS).get(draftId)),
  );
}

async function saveDraftLocal(bundle) {
  return runTransaction([STORE_DRAFTS], "readwrite", async (tx) => {
    tx.objectStore(STORE_DRAFTS).put(bundle);
    return bundle;
  });
}

async function deleteDraftLocal(draftId) {
  return runTransaction([STORE_DRAFTS], "readwrite", async (tx) => {
    tx.objectStore(STORE_DRAFTS).delete(draftId);
  });
}

async function saveTripLocal(trip) {
  return runTransaction([STORE_TRIPS], "readwrite", async (tx) => {
    tx.objectStore(STORE_TRIPS).put(trip);
    return trip;
  });
}

async function saveTripAndDeleteDraftLocal(trip, draftId) {
  return runTransaction([STORE_TRIPS, STORE_DRAFTS], "readwrite", async (tx) => {
    tx.objectStore(STORE_TRIPS).put(trip);
    if (draftId) {
      tx.objectStore(STORE_DRAFTS).delete(draftId);
    }
    return trip;
  });
}

async function putMetaLocal(key, value) {
  return runTransaction([STORE_META], "readwrite", async (tx) => {
    tx.objectStore(STORE_META).put({ key, value });
  });
}

async function exportAllDataLocal() {
  return runTransaction([STORE_TRIPS, STORE_DRAFTS, STORE_META], "readonly", async (tx) => {
    const tripsStore = tx.objectStore(STORE_TRIPS);
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    const metaStore = tx.objectStore(STORE_META);
    const [trips, drafts, candidateData] = await Promise.all([
      promisify(tripsStore.getAll()),
      promisify(draftsStore.getAll()),
      promisify(metaStore.get("candidate_data")),
    ]);
    return {
      trips: trips ?? [],
      drafts: drafts ?? [],
      candidateData: candidateData?.value ?? {},
    };
  });
}

async function restoreBackupDataLocal({ trips, drafts, candidateData }) {
  return runTransaction([STORE_TRIPS, STORE_DRAFTS, STORE_META], "readwrite", async (tx) => {
    const tripsStore = tx.objectStore(STORE_TRIPS);
    const draftsStore = tx.objectStore(STORE_DRAFTS);
    (trips ?? []).forEach((trip) => tripsStore.put(trip));
    (drafts ?? []).forEach((draft) => draftsStore.put(draft));
    tx.objectStore(STORE_META).put({ key: "candidate_data", value: candidateData ?? {} });
  });
}

async function saveRestorePointLocal(restorePoint) {
  return runTransaction([STORE_META], "readwrite", async (tx) => {
    const store = tx.objectStore(STORE_META);
    const currentRecord = await promisify(store.get("restore_points"));
    const currentPoints = Array.isArray(currentRecord?.value) ? currentRecord.value : [];
    const nextPoints = [restorePoint, ...currentPoints].slice(0, 5);
    store.put({ key: "restore_points", value: nextPoints });
    return {
      restorePoints: nextPoints.map((item) => item.summary),
    };
  });
}

async function restoreFromRestorePointLocal(restorePointId) {
  return runTransaction([STORE_META, STORE_TRIPS, STORE_DRAFTS], "readwrite", async (tx) => {
    const metaStore = tx.objectStore(STORE_META);
    const restorePointsRecord = await promisify(metaStore.get("restore_points"));
    const restorePoints = Array.isArray(restorePointsRecord?.value) ? restorePointsRecord.value : [];
    const targetPoint = restorePoints.find((item) => item.id === restorePointId);
    if (!targetPoint?.payload) {
      throw new Error("戻したい控えが見つかりません");
    }

    tx.objectStore(STORE_TRIPS).clear();
    tx.objectStore(STORE_DRAFTS).clear();
    (targetPoint.payload.trips ?? []).forEach((trip) => tx.objectStore(STORE_TRIPS).put(trip));
    (targetPoint.payload.drafts ?? []).forEach((draft) => tx.objectStore(STORE_DRAFTS).put(draft));
    metaStore.put({ key: "candidate_data", value: targetPoint.payload.candidateData ?? {} });
  });
}

async function loadInitialDataRemote() {
  const payload = await fetchRemoteJson("/state");
  return {
    trips: Array.isArray(payload.trips) ? payload.trips : [],
    drafts: Array.isArray(payload.drafts) ? payload.drafts : [],
    candidateData: payload.candidateData ?? {},
    backupStatus: payload.backupStatus ?? { last_backup_at: "", message: "" },
    restorePoints: Array.isArray(payload.restorePoints) ? payload.restorePoints : [],
  };
}

async function getDraftRemote(draftId) {
  const payload = await fetchRemoteJson(`/drafts/${encodeURIComponent(draftId)}`);
  return payload.draft ?? null;
}

async function postRemoteCommand(action, body = {}) {
  return fetchRemoteJson("/command", {
    method: "POST",
    body: JSON.stringify({
      action,
      ...body,
    }),
  });
}

async function saveDraftRemote(bundle) {
  const payload = await postRemoteCommand("saveDraft", { bundle });
  return payload.bundle ?? bundle;
}

async function deleteDraftRemote(draftId) {
  await postRemoteCommand("deleteDraft", { draftId });
}

async function saveTripRemote(trip) {
  const payload = await postRemoteCommand("saveTrip", { trip });
  return payload.trip ?? trip;
}

async function saveTripAndDeleteDraftRemote(trip, draftId) {
  const payload = await postRemoteCommand("saveTripAndDeleteDraft", { trip, draftId });
  return payload.trip ?? trip;
}

async function putMetaRemote(key, value) {
  await postRemoteCommand("putMeta", { key, value });
}

async function exportAllDataRemote() {
  const payload = await fetchRemoteJson("/export");
  return {
    trips: Array.isArray(payload.trips) ? payload.trips : [],
    drafts: Array.isArray(payload.drafts) ? payload.drafts : [],
    candidateData: payload.candidateData ?? {},
  };
}

async function restoreBackupDataRemote({ trips, drafts, candidateData }) {
  await postRemoteCommand("restoreBackupData", { trips, drafts, candidateData });
}

async function saveRestorePointRemote(restorePoint) {
  const payload = await postRemoteCommand("saveRestorePoint", { restorePoint });
  return {
    restorePoints: Array.isArray(payload.restorePoints) ? payload.restorePoints : [],
  };
}

async function restoreFromRestorePointRemote(restorePointId) {
  await postRemoteCommand("restoreRestorePoint", { restorePointId });
}

export async function loadInitialData() {
  if (canUseRemoteStorage()) {
    try {
      const remoteData = await loadInitialDataRemote();
      activeStorageMode = STORAGE_MODE_REMOTE;
      return {
        ...remoteData,
        storageMode: STORAGE_MODE_REMOTE,
      };
    } catch (error) {
      activeStorageMode = STORAGE_MODE_LOCAL;
    }
  }

  const localData = await loadInitialDataLocal();
  activeStorageMode = STORAGE_MODE_LOCAL;
  return {
    ...localData,
    storageMode: STORAGE_MODE_LOCAL,
  };
}

export async function getDraft(draftId) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return getDraftRemote(draftId);
  }
  return getDraftLocal(draftId);
}

export async function saveDraft(bundle) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return saveDraftRemote(bundle);
  }
  return saveDraftLocal(bundle);
}

export async function deleteDraft(draftId) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return deleteDraftRemote(draftId);
  }
  return deleteDraftLocal(draftId);
}

export async function saveTrip(trip) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return saveTripRemote(trip);
  }
  return saveTripLocal(trip);
}

export async function saveTripAndDeleteDraft(trip, draftId) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return saveTripAndDeleteDraftRemote(trip, draftId);
  }
  return saveTripAndDeleteDraftLocal(trip, draftId);
}

export async function putMeta(key, value) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return putMetaRemote(key, value);
  }
  return putMetaLocal(key, value);
}

export async function saveBlob(blobKey, blob) {
  return runTransaction([STORE_BLOBS], "readwrite", async (tx) => {
    tx.objectStore(STORE_BLOBS).put({
      blob_key: blobKey,
      blob,
      created_at: new Date().toISOString(),
    });
  });
}

export async function getBlob(blobKey) {
  if (!blobKey) {
    return null;
  }
  return runTransaction([STORE_BLOBS], "readonly", async (tx) => {
    const record = await promisify(tx.objectStore(STORE_BLOBS).get(blobKey));
    return record?.blob ?? null;
  });
}

export async function saveCandidateData(candidateData) {
  return putMeta("candidate_data", candidateData);
}

export async function saveBackupStatus(backupStatus) {
  return putMeta("backup_status", backupStatus);
}

export async function exportAllData() {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return exportAllDataRemote();
  }
  return exportAllDataLocal();
}

export async function restoreBackupData({ trips, drafts, candidateData }) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return restoreBackupDataRemote({ trips, drafts, candidateData });
  }
  return restoreBackupDataLocal({ trips, drafts, candidateData });
}

export async function saveRestorePoint(restorePoint) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return saveRestorePointRemote(restorePoint);
  }
  return saveRestorePointLocal(restorePoint);
}

export async function restoreFromRestorePoint(restorePointId) {
  if (activeStorageMode === STORAGE_MODE_REMOTE) {
    return restoreFromRestorePointRemote(restorePointId);
  }
  return restoreFromRestorePointLocal(restorePointId);
}
