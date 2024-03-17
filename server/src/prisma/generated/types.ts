import type { ColumnType } from 'kysely';
export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U> ? ColumnType<S, I | undefined, U> : ColumnType<T, T | undefined, T>;
export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export type Activity = {
  id: Generated<string>;
  albumId: string;
  assetId: string | null;
  comment: string | null;
  createdAt: Generated<Timestamp>;
  isLiked: Generated<boolean>;
  updatedAt: Generated<Timestamp>;
  userId: string;
};
export type Albums = {
  id: Generated<string>;
  albumName: Generated<string>;
  albumThumbnailAssetId: string | null;
  createdAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
  description: Generated<string>;
  isActivityEnabled: Generated<boolean>;
  order: Generated<string>;
  ownerId: string;
  updatedAt: Generated<Timestamp>;
};
export type AlbumsAssetsAssets = {
  albumsId: string;
  assetsId: string;
};
export type AlbumsSharedUsersUsers = {
  albumsId: string;
  usersId: string;
};
export type ApiKeys = {
  id: Generated<string>;
  createdAt: Generated<Timestamp>;
  key: string;
  name: string;
  updatedAt: Generated<Timestamp>;
  userId: string;
};
export type AssetFaces = {
  id: Generated<string>;
  assetId: string;
  boundingBoxX1: Generated<number>;
  boundingBoxY1: Generated<number>;
  boundingBoxX2: Generated<number>;
  boundingBoxY2: Generated<number>;
  imageWidth: Generated<number>;
  imageHeight: Generated<number>;
  personId: string | null;
};
export type AssetJobStatus = {
  assetId: string;
  duplicatesDetectedAt: Timestamp | null;
  facesRecognizedAt: Timestamp | null;
  metadataExtractedAt: Timestamp | null;
};
export type Assets = {
  id: Generated<string>;
  checksum: Buffer;
  createdAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
  deviceAssetId: string;
  deviceId: string;
  duplicateId: string | null;
  duration: string | null;
  encodedVideoPath: Generated<string | null>;
  fileCreatedAt: Timestamp;
  fileModifiedAt: Timestamp;
  isArchived: Generated<boolean>;
  isFavorite: Generated<boolean>;
  isExternal: Generated<boolean>;
  isOffline: Generated<boolean>;
  isVisible: Generated<boolean>;
  libraryId: string | null;
  livePhotoVideoId: string | null;
  localDateTime: Timestamp;
  originalFileName: string;
  originalPath: string;
  ownerId: string;
  previewPath: string | null;
  sidecarPath: string | null;
  stackId: string | null;
  thumbhash: Buffer | null;
  thumbnailPath: Generated<string | null>;
  type: string;
  updatedAt: Generated<Timestamp>;
};
export type AssetStack = {
  id: Generated<string>;
  primaryAssetId: string;
};
export type Audit = {
  id: Generated<number>;
  action: string;
  createdAt: Generated<Timestamp>;
  entityId: string;
  entityType: string;
  ownerId: string;
};
export type Exif = {
  assetId: string;
  autoStackId: string | null;
  bitsPerSample: number | null;
  city: string | null;
  colorspace: string | null;
  country: string | null;
  dateTimeOriginal: Timestamp | null;
  description: Generated<string>;
  exifImageHeight: number | null;
  exifImageWidth: number | null;
  exposureTime: string | null;
  fileSizeInByte: string | null;
  fps: number | null;
  fNumber: number | null;
  focalLength: number | null;
  iso: number | null;
  latitude: number | null;
  lensModel: string | null;
  livePhotoCID: string | null;
  longitude: number | null;
  make: string | null;
  model: string | null;
  modifyDate: Timestamp | null;
  orientation: string | null;
  profileDescription: string | null;
  projectionType: string | null;
  state: string | null;
  timeZone: string | null;
};
export type GeodataPlaces = {
  id: number;
  admin1Code: string | null;
  admin2Code: string | null;
  admin1Name: string | null;
  admin2Name: string | null;
  alternateNames: string | null;
  countryCode: string;
  longitude: number;
  latitude: number;
  modificationDate: Timestamp;
  name: string;
};
export type Libraries = {
  id: Generated<string>;
  createdAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
  exclusionPatterns: string[];
  importPaths: string[];
  isVisible: Generated<boolean>;
  name: string;
  ownerId: string;
  refreshedAt: Timestamp | null;
  type: string;
  updatedAt: Generated<Timestamp>;
};
export type MoveHistory = {
  id: Generated<string>;
  entityId: string;
  newPath: string;
  oldPath: string;
  pathType: string;
};
export type Partners = {
  sharedById: string;
  sharedWithId: string;
  createdAt: Generated<Timestamp>;
  inTimeline: Generated<boolean>;
  updatedAt: Generated<Timestamp>;
};
export type Person = {
  id: Generated<string>;
  birthDate: Timestamp | null;
  createdAt: Generated<Timestamp>;
  faceAssetId: string | null;
  isHidden: Generated<boolean>;
  name: Generated<string>;
  ownerId: string;
  thumbnailPath: Generated<string>;
  updatedAt: Generated<Timestamp>;
};
export type SharedLinkAsset = {
  assetsId: string;
  sharedLinksId: string;
};
export type SharedLinks = {
  id: Generated<string>;
  albumId: string | null;
  allowDownload: Generated<boolean>;
  allowUpload: Generated<boolean>;
  createdAt: Generated<Timestamp>;
  description: string | null;
  expiresAt: Timestamp | null;
  key: Buffer;
  password: string | null;
  showExif: Generated<boolean>;
  type: string;
  userId: string;
};
export type SmartInfo = {
  assetId: string;
  objects: string[];
  tags: string[];
};
export type SmartSearch = {
  assetId: string;
};
export type SocketIoAttachments = {
  id: Generated<string>;
  created_at: Generated<Timestamp | null>;
  payload: Buffer | null;
};
export type SystemMetadata = {
  key: string;
  value: Generated<unknown>;
};
export type TagAsset = {
  assetsId: string;
  tagsId: string;
};
export type Tags = {
  id: Generated<string>;
  name: string;
  renameTagId: string | null;
  type: string;
  userId: string;
};
export type Users = {
  id: Generated<string>;
  avatarColor: string | null;
  createdAt: Generated<Timestamp>;
  deletedAt: Timestamp | null;
  email: string;
  isAdmin: Generated<boolean>;
  memoriesEnabled: Generated<boolean>;
  name: Generated<string>;
  oauthId: Generated<string>;
  password: Generated<string>;
  profileImagePath: Generated<string>;
  quotaSizeInBytes: string | null;
  quotaUsageInBytes: Generated<string>;
  shouldChangePassword: Generated<boolean>;
  status: Generated<string>;
  storageLabel: string | null;
  updatedAt: Generated<Timestamp>;
};
export type UserToken = {
  id: Generated<string>;
  createdAt: Generated<Timestamp>;
  deviceOS: Generated<string>;
  deviceType: Generated<string>;
  token: string;
  updatedAt: Generated<Timestamp>;
  userId: string;
};
export type DB = {
  activity: Activity;
  albums: Albums;
  albums_assets_assets: AlbumsAssetsAssets;
  albums_shared_users_users: AlbumsSharedUsersUsers;
  api_keys: ApiKeys;
  asset_faces: AssetFaces;
  asset_job_status: AssetJobStatus;
  asset_stack: AssetStack;
  assets: Assets;
  audit: Audit;
  exif: Exif;
  geodata_places: GeodataPlaces;
  libraries: Libraries;
  move_history: MoveHistory;
  partners: Partners;
  person: Person;
  shared_link__asset: SharedLinkAsset;
  shared_links: SharedLinks;
  smart_info: SmartInfo;
  smart_search: SmartSearch;
  socket_io_attachments: SocketIoAttachments;
  system_metadata: SystemMetadata;
  tag_asset: TagAsset;
  tags: Tags;
  user_token: UserToken;
  users: Users;
};
