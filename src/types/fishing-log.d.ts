export type TripStatus = "draft" | "final" | "deleted";

export type WaterType = "sea" | "brackish" | "river" | "lake" | "pond";

export type TripType =
  | "shore"
  | "boat"
  | "rock"
  | "raft"
  | "managed_pond"
  | "other";

export type PrivacyLevel = "private" | "region_only" | "location_name";

export type ResultType =
  | "caught"
  | "bite_only"
  | "chase_only"
  | "no_response";

export type RangeBand = "surface" | "middle" | "bottom" | "unknown";

export type TripConditions = {
  weather?: "sunny" | "cloudy" | "rainy" | "snowy" | "unknown";
  time_band?: "morning" | "daytime" | "evening" | "night" | "unknown";
  wind_direction?: string;
  wind_level?: "none" | "weak" | "medium" | "strong" | "unknown";
  wave_level?: string;
  tide_name?: "spring" | "middle" | "neap" | "long" | "young" | "unknown";
  tide_note?: string;
  flow_note?: string;
  water_temp_c?: number;
  air_temp_c?: number;
  water_clarity?: "clear" | "normal" | "muddy" | "unknown";
  bait_presence?: "yes" | "no" | "unknown";
  bird_activity?: "yes" | "no" | "unknown";
  condition_note?: string;
};

export type TripTackle = {
  method_name?: string;
  rod_name?: string;
  reel_name?: string;
  line_name?: string;
  leader_name?: string;
  lure_or_bait_name?: string;
  lure_weight?: number;
  lure_weight_unit?: "g" | "oz" | "号" | "other";
  color_name?: string;
  target_range?: RangeBand;
  action_note?: string;
};

export type TripResult = {
  result_type: ResultType;
  catch_count_total?: number;
  result_note?: string;
  event_time?: string;
  event_lure?: string;
  event_range?: RangeBand;
  event_note?: string;
  reason_note?: string;
};

export type CatchRecord = {
  catch_id: string;
  trip_id: string;
  species_name: string;
  length_cm?: number;
  weight_g?: number;
  count?: number;
  caught_at?: string;
  lure_used?: string;
  hit_range?: RangeBand;
  keep_release?: "keep" | "release" | "unknown";
  catch_note?: string;
};

export type PhotoRole = "main" | "trip" | "catch" | "scenery" | "other";

export type PhotoRecord = {
  photo_id: string;
  trip_id: string;
  catch_id?: string;
  photo_role: PhotoRole;
  thumb_blob_key?: string;
  medium_blob_key?: string;
  original_blob_key?: string;
  caption?: string;
  created_at: string;
};

export type Trip = {
  trip_id: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;
  started_at: string;
  ended_at?: string;
  trip_type: TripType;
  water_type: WaterType;
  location_region: string;
  location_name?: string;
  point_name?: string;
  standing_position_note?: string;
  boat_name?: string;
  companion_note?: string;
  privacy_level: PrivacyLevel;
  conditions?: TripConditions;
  tackle?: TripTackle;
  result?: TripResult;
  catches: CatchRecord[];
  photos: PhotoRecord[];
  trip_summary?: string;
  reflection_note?: string;
  next_try?: string;
};

export type DraftMeta = {
  draft_id: string;
  trip_id: string;
  current_step:
    | "start"
    | "basic"
    | "conditions"
    | "tackle"
    | "result"
    | "photos_memo"
    | "confirm";
  last_saved_at: string;
  validation_state: "incomplete" | "needs_review" | "complete";
};

export type BackupManifest = {
  backup_version: string;
  app_version: string;
  exported_at: string;
  record_count: number;
  includes_photos: boolean;
  checksum?: string;
};
