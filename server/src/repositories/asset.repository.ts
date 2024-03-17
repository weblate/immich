import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Prisma } from '@prisma/client';
import { sql } from 'kysely';
import { Chunked, ChunkedArray, DummyValue, GenerateSql } from 'src/decorators';
import { AssetOrder } from 'src/entities/album.entity';
import { AssetJobStatusEntity } from 'src/entities/asset-job-status.entity';
import { AssetEntity, AssetType } from 'src/entities/asset.entity';
import { ExifEntity } from 'src/entities/exif.entity';
import { LibraryType } from 'src/entities/library.entity';
import {
  AssetCreate,
  AssetDeltaSyncOptions,
  AssetDuplicateGroup,
  AssetExploreFieldOptions,
  AssetFullSyncOptions,
  AssetPathEntity,
  AssetStats,
  AssetStatsOptions,
  AssetUpdateAllOptions,
  AssetUpdateDuplicateOptions,
  AssetUpdateOptions,
  IAssetRepository,
  LivePhotoSearchOptions,
  MapMarker,
  MapMarkerSearchOptions,
  MonthDay,
  TimeBucketItem,
  TimeBucketOptions,
  TimeBucketSize,
  WithProperty,
  WithoutProperty,
} from 'src/interfaces/asset.interface';
import { AssetSearchOptions, SearchExploreItem } from 'src/interfaces/search.interface';
import { PrismaRepository } from 'src/repositories/prisma.repository';
import { searchAssetBuilder, withExif, withTimeBucket } from 'src/utils/database';
import { Instrumentation } from 'src/utils/instrumentation';
import { Paginated, PaginationMode, PaginationOptions, paginatedBuilder, paginationHelper } from 'src/utils/pagination';
import { Repository } from 'typeorm';

@Instrumentation()
@Injectable()
export class AssetRepository implements IAssetRepository {
  constructor(
    @InjectRepository(AssetEntity) private repository: Repository<AssetEntity>,
    private prismaRepository: PrismaRepository,
  ) {}

  async upsertExif(exif: Partial<ExifEntity> & { assetId: string }): Promise<void> {
    await this.prismaRepository.exif.upsert({ update: exif, create: exif, where: { assetId: exif.assetId } });
  }

  async upsertJobStatus(...jobStatus: (Partial<AssetJobStatusEntity> & { assetId: string })[]): Promise<void> {
    await this.prismaRepository.$kysely
      .insertInto('asset_job_status')
      .values(jobStatus.map((status) => ({ ...status, assetId: sql`${status.assetId}::uuid` })))
      .onConflict((oc) =>
        oc.column('assetId').doUpdateSet({
          duplicatesDetectedAt: (eb) => eb.ref('excluded.duplicatesDetectedAt'),
          facesRecognizedAt: (eb) => eb.ref('excluded.facesRecognizedAt'),
          metadataExtractedAt: (eb) => eb.ref('excluded.metadataExtractedAt'),
        }),
      )
      .execute();
  }

  create(asset: AssetCreate): Promise<AssetEntity> {
    const { ownerId, libraryId, livePhotoVideoId, stackId, ...assetData } = asset;
    return this.prismaRepository.assets.create({
      data: {
        ...assetData,
        livePhotoVideo: livePhotoVideoId ? { connect: { id: livePhotoVideoId } } : undefined,
        stack: stackId ? { connect: { id: stackId } } : undefined,
        library: libraryId ? { connect: { id: libraryId } } : undefined,
        owner: { connect: { id: ownerId } },
      },
    }) as any as Promise<AssetEntity>;
  }

  @GenerateSql({ params: [DummyValue.UUID, { day: 1, month: 1 }] })
  getByDayOfYear(ownerIds: string[], { day, month }: MonthDay): Promise<AssetEntity[]> {
    return this.prismaRepository.$kysely
      .selectFrom('assets')
      .selectAll()
      .select((qb) => withExif(qb))
      .where('ownerId', '=', sql<string>`any(array[${ownerIds}]::uuid[])`)
      .where('isVisible', '=', true)
      .where('isArchived', '=', false)
      .where('previewPath', 'is not', null)
      .where('deletedAt', 'is', null)
      .where(sql`extract(day from "localDateTime" at time zone 'utc')`, '=', day)
      .where(sql`extract(month from "localDateTime" at time zone 'utc')`, '=', month)
      .orderBy('localDateTime', 'desc')
      .execute() as any as Promise<AssetEntity[]>;
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  @ChunkedArray()
  getByIds(ids: string[], relations?: Prisma.AssetsInclude): Promise<AssetEntity[]> {
    return this.prismaRepository.assets.findMany({
      where: { id: { in: ids } },
      include: {
        ...relations,
        library: relations?.library ? { include: { assets: true, owner: true } } : undefined,
      },
    }) as any as Promise<AssetEntity[]>; // typeorm type assumes arbitrary level of recursion
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  @ChunkedArray()
  getByIdsWithAllRelations(ids: string[]): Promise<AssetEntity[]> {
    return this.prismaRepository.assets.findMany({
      where: { id: { in: ids } },
      include: {
        exifInfo: true,
        smartInfo: true,
        tags: true,
        faces: {
          include: {
            person: true,
          },
        },
        stack: { include: { assets: true } },
      },
    }) as any as Promise<AssetEntity[]>;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async deleteAll(ownerId: string): Promise<void> {
    await this.prismaRepository.assets.deleteMany({ where: { ownerId } });
  }

  async getByAlbumId(pagination: PaginationOptions, albumId: string): Paginated<AssetEntity> {
    const items = await this.prismaRepository.assets.findMany({
      where: {
        albums: {
          some: {
            id: albumId,
          },
        },
      },
      orderBy: {
        fileCreatedAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take + 1,
    });

    return paginationHelper(items as any as AssetEntity[], pagination.take);
  }

  getByUserId(
    pagination: PaginationOptions,
    userId: string,
    options: Omit<AssetSearchOptions, 'userIds'> = {},
  ): Paginated<AssetEntity> {
    return this.getAll(pagination, { ...options, userIds: [userId] });
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  async getExternalLibraryAssetPaths(pagination: PaginationOptions, libraryId: string): Paginated<AssetPathEntity> {
    const items = await this.prismaRepository.assets.findMany({
      where: { libraryId },
      select: { id: true, originalPath: true, isOffline: true },
      orderBy: { fileCreatedAt: 'desc' },
      skip: pagination.skip,
      take: pagination.take + 1,
    });

    return paginationHelper(items as any as AssetPathEntity[], pagination.take);
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async getByLibraryIdAndOriginalPath(libraryId: string, originalPath: string): Promise<AssetEntity | null> {
    const res = await this.prismaRepository.assets.findFirst({ where: { libraryId, originalPath } });
    return res as AssetEntity | null;
  }

  getAll(
    pagination: PaginationOptions,
    { orderDirection, ...options }: AssetSearchOptions = {},
  ): Paginated<AssetEntity> {
    let builder = this.repository.createQueryBuilder('asset');
    builder = searchAssetBuilder(builder, options);
    builder.orderBy('asset.createdAt', orderDirection ?? 'ASC');
    return paginatedBuilder<AssetEntity>(builder, {
      mode: PaginationMode.SKIP_TAKE,
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  /**
   * Get assets by device's Id on the database
   * @param ownerId
   * @param deviceId
   *
   * @returns Promise<string[]> - Array of assetIds belong to the device
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async getAllByDeviceId(ownerId: string, deviceId: string): Promise<string[]> {
    const items = await this.prismaRepository.assets.findMany({
      where: {
        ownerId,
        deviceId,
        isVisible: true,
      },
      select: {
        deviceAssetId: true,
      },
    });

    return items.map((asset) => asset.deviceAssetId);
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async getById(id: string, relations: Prisma.AssetsInclude): Promise<AssetEntity | null> {
    return this.prismaRepository.assets.findFirst({ where: { id }, include: relations }) as Promise<AssetEntity | null>;
  }

  @GenerateSql({ params: [[DummyValue.UUID], { deviceId: DummyValue.STRING }] })
  @Chunked()
  async updateAll(ids: string[], options: AssetUpdateAllOptions): Promise<void> {
    await this.prismaRepository.assets.updateMany({ where: { id: { in: ids } }, data: options });
  }

  @GenerateSql({
    params: [{ targetDuplicateId: DummyValue.UUID, duplicateIds: [DummyValue.UUID], assetIds: [DummyValue.UUID] }],
  })
  async updateDuplicates(options: AssetUpdateDuplicateOptions): Promise<void> {
    await this.prismaRepository.assets.updateMany({
      where: { OR: [{ id: { in: options.assetIds } }, { duplicateId: { in: options.duplicateIds } }] },
      data: { duplicateId: options.targetDuplicateId },
    });
  }

  @Chunked()
  async softDeleteAll(ids: string[]): Promise<void> {
    await this.prismaRepository.assets.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
  }

  @Chunked()
  async restoreAll(ids: string[]): Promise<void> {
    await this.prismaRepository.assets.updateMany({ where: { id: { in: ids } }, data: { deletedAt: null } });
  }

  update(asset: AssetUpdateOptions): Promise<AssetEntity> {
    const { ownerId, libraryId, livePhotoVideoId, stackId, ...assetData } = asset;

    return this.prismaRepository.assets.update({
      data: {
        ...assetData,
        livePhotoVideo: livePhotoVideoId ? { connect: { id: livePhotoVideoId } } : undefined,
        stack: stackId ? { connect: { id: stackId } } : undefined,
        library: libraryId ? { connect: { id: libraryId } } : undefined,
        owner: ownerId ? { connect: { id: ownerId } } : undefined,
      },
      where: { id: asset.id },
      include: {
        exifInfo: true,
        smartInfo: true,
        tags: true,
        faces: {
          include: {
            person: true,
          },
        },
      },
    }) as any as Promise<AssetEntity>; // typeorm type assumes all relations are included
  }

  async remove(asset: AssetEntity): Promise<void> {
    await this.prismaRepository.assets.delete({ where: { id: asset.id } });
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.BUFFER] })
  getByChecksum(libraryId: string, checksum: Buffer): Promise<AssetEntity | null> {
    return this.prismaRepository.assets.findFirst({
      where: { libraryId, checksum: checksum },
    }) as Promise<AssetEntity | null>;
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.BUFFER] })
  async getUploadAssetIdByChecksum(ownerId: string, checksum: Buffer): Promise<string | undefined> {
    const asset = await this.repository.findOne({
      select: { id: true },
      where: {
        ownerId,
        checksum,
        library: {
          type: LibraryType.UPLOAD,
        },
      },
      withDeleted: true,
    });

    return asset?.id;
  }

  findLivePhotoMatch(options: LivePhotoSearchOptions): Promise<AssetEntity | null> {
    const { ownerId, otherAssetId, livePhotoCID, type } = options;

    return this.prismaRepository.assets.findFirst({
      where: {
        id: { not: otherAssetId },
        ownerId,
        type,
        exifInfo: {
          livePhotoCID,
        },
      },
      include: {
        exifInfo: true,
      },
    }) as Promise<AssetEntity | null>;
  }

  @GenerateSql(
    ...Object.values(WithProperty)
      .filter((property) => property !== WithProperty.IS_OFFLINE)
      .map((property) => ({
        name: property,
        params: [DummyValue.PAGINATION, property],
      })),
  )
  async getWithout(pagination: PaginationOptions, property: WithoutProperty): Paginated<AssetEntity> {
    let relations: Prisma.AssetsInclude = {};
    let where: Prisma.AssetsWhereInput = {};

    switch (property) {
      case WithoutProperty.THUMBNAIL: {
        where = {
          OR: [
            { previewPath: null, isVisible: true },
            { previewPath: '', isVisible: true },
            { thumbnailPath: null, isVisible: true },
            { thumbnailPath: '', isVisible: true },
            { thumbhash: null, isVisible: true },
          ],
        };
        break;
      }

      case WithoutProperty.ENCODED_VIDEO: {
        where = {
          OR: [
            { type: AssetType.VIDEO, encodedVideoPath: null },
            { type: AssetType.VIDEO, encodedVideoPath: '' },
          ],
        };
        break;
      }

      case WithoutProperty.EXIF: {
        relations = {
          exifInfo: true,
          assetJobStatus: true,
        };
        where = {
          isVisible: true,
          assetJobStatus: {
            metadataExtractedAt: null,
          },
        };
        break;
      }

      case WithoutProperty.SMART_SEARCH: {
        where = {
          isVisible: true,
          previewPath: { not: null },
          smartSearch: null,
        };
        break;
      }

      case WithoutProperty.DUPLICATE: {
        where = {
          isVisible: true,
          previewPath: { not: null },
          smartSearch: { isNot: null },
          assetJobStatus: {
            duplicatesDetectedAt: null,
          },
        };
        break;
      }

      case WithoutProperty.FACES: {
        relations = {
          faces: true,
          assetJobStatus: true,
        };
        where = {
          previewPath: { not: null },
          isVisible: true,
          faces: {
            some: {
              person: null,
            },
          },
          assetJobStatus: {
            facesRecognizedAt: null,
          },
        };
        break;
      }

      case WithoutProperty.PERSON: {
        relations = {
          faces: true,
        };
        where = {
          previewPath: { not: null },
          isVisible: true,
          faces: {
            some: {
              person: null,
            },
          },
        };
        break;
      }

      case WithoutProperty.SIDECAR: {
        where = {
          OR: [
            { sidecarPath: null, isVisible: true },
            { sidecarPath: '', isVisible: true },
          ],
        };
        break;
      }

      default: {
        throw new Error(`Invalid getWithout property: ${property}`);
      }
    }

    const items = await this.prismaRepository.assets.findMany({
      where,
      orderBy: {
        // Ensures correct order when paginating
        createdAt: 'asc',
      },
      skip: pagination.skip,
      take: pagination.take + 1,
      include: relations,
    });

    return paginationHelper(items as any as AssetEntity[], pagination.take);
  }

  async getWith(pagination: PaginationOptions, property: WithProperty, libraryId?: string): Paginated<AssetEntity> {
    let where: Prisma.AssetsWhereInput = {};

    switch (property) {
      case WithProperty.SIDECAR: {
        where = { sidecarPath: { not: null }, isVisible: true };
        break;
      }
      case WithProperty.IS_OFFLINE: {
        if (!libraryId) {
          throw new Error('Library id is required when finding offline assets');
        }
        where = { isOffline: true, libraryId: libraryId };
        break;
      }

      default: {
        throw new Error(`Invalid getWith property: ${property}`);
      }
    }

    const items = await this.prismaRepository.assets.findMany({
      where,
      orderBy: {
        // Ensures correct order when paginating
        createdAt: 'asc',
      },
      skip: pagination.skip,
      take: pagination.take + 1,
    });

    return paginationHelper(items as any as AssetEntity[], pagination.take);
  }

  getFirstAssetForAlbumId(albumId: string): Promise<AssetEntity | null> {
    return this.prismaRepository.assets.findFirst({
      where: {
        albums: {
          some: {
            id: albumId,
          },
        },
      },
      orderBy: {
        fileCreatedAt: 'desc',
      },
    }) as Promise<AssetEntity | null>;
  }

  getLastUpdatedAssetForAlbumId(albumId: string): Promise<AssetEntity | null> {
    return this.prismaRepository.assets.findFirst({
      where: {
        albums: {
          some: {
            id: albumId,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    }) as Promise<AssetEntity | null>;
  }

  async getMapMarkers(
    ownerIds: string[],
    albumIds: string[],
    options: MapMarkerSearchOptions = {},
  ): Promise<MapMarker[]> {
    const { isArchived, isFavorite, fileCreatedAfter, fileCreatedBefore } = options;

    const assets = await this.prismaRepository.assets.findMany({
      select: {
        id: true,
        exifInfo: {
          select: {
            city: true,
            state: true,
            country: true,
            latitude: true,
            longitude: true,
          },
        },
      },
      where: {
        OR: [{ ownerId: { in: ownerIds } }, { albums: { some: { id: { in: albumIds } } } }],
        isVisible: true,
        isArchived,
        exifInfo: {
          latitude: { not: null },
          longitude: { not: null },
        },
        isFavorite,
        fileCreatedAt: { gte: fileCreatedAfter, lte: fileCreatedBefore },
      },
      orderBy: {
        fileCreatedAt: 'desc',
      },
    });

    return assets.map((asset) => ({
      id: asset.id,
      lat: asset.exifInfo!.latitude!,
      lon: asset.exifInfo!.longitude!,
      city: asset.exifInfo!.city,
      state: asset.exifInfo!.state,
      country: asset.exifInfo!.country,
    }));
  }

  async getStatistics(ownerId: string, { isArchived, isFavorite, isTrashed }: AssetStatsOptions): Promise<AssetStats> {
    const items = await this.prismaRepository.assets.groupBy({
      by: 'type',
      where: {
        ownerId,
        isVisible: true,
        isArchived,
        isFavorite,
        deletedAt: isTrashed ? { not: null } : null,
      },
      _count: {
        id: true,
      },
    });

    const result: AssetStats = {
      [AssetType.AUDIO]: 0,
      [AssetType.IMAGE]: 0,
      [AssetType.VIDEO]: 0,
      [AssetType.OTHER]: 0,
    };

    for (const item of items) {
      result[item.type as AssetType] = item._count.id;
    }

    return result;
  }

  getRandom(ownerId: string, take: number): Promise<AssetEntity[]> {
    return this.prismaRepository.$kysely
      .selectFrom('assets')
      .selectAll()
      .select((eb) => withExif(eb))
      .where('ownerId', '=', sql<string>`${ownerId}::uuid`)
      .where('isVisible', '=', true)
      .where('deletedAt', 'is', null)
      .orderBy((eb) => eb.fn('random'))
      .limit(take)
      .execute() as any as Promise<AssetEntity[]>;
  }

  @GenerateSql({ params: [{ size: TimeBucketSize.MONTH }] })
  async getTimeBuckets(options: TimeBucketOptions): Promise<TimeBucketItem[]> {
    return this.prismaRepository.$kysely
      .selectFrom('assets')
      .select((eb) => withTimeBucket(eb, options.size).as('timeBucket'))
      .select((eb) => eb.fn.count('id').as('count'))
      .groupBy('timeBucket')
      .where('isVisible', '=', true)
      .where('deletedAt', options.isTrashed ? 'is not' : 'is', null)
      .$if(!!options.userIds, (qb) => qb.where('ownerId', '=', sql<string>`any(array[${options.userIds}]::uuid[])`))
      .$if(options.isArchived != null, (qb) => qb.where('isArchived', '=', options.isArchived as boolean))
      .$if(options.isFavorite != null, (qb) => qb.where('isFavorite', '=', options.isFavorite as boolean))
      .$if(!!options.assetType, (qb) => qb.where('type', '=', options.assetType as AssetType))
      .$if(!!options.personId, (qb) =>
        qb
          .innerJoin('asset_faces as faces', 'faces.assetId', 'assets.id')
          .where('faces.personId', '=', sql<string>`${options.personId}::uuid`),
      )
      .$if(!!options.albumId, (qb) =>
        qb
          .innerJoin('albums_assets_assets as albums', 'albums.assetsId', 'assets.id')
          .where('albums.albumsId', '=', sql<string>`${options.albumId}::uuid`),
      )
      .orderBy('timeBucket', 'desc')
      .execute() as any as Promise<TimeBucketItem[]>;
  }

  @GenerateSql({ params: [DummyValue.TIME_BUCKET, { size: TimeBucketSize.MONTH }] })
  getTimeBucket(timeBucket: string, options: TimeBucketOptions): Promise<AssetEntity[]> {
    return this.prismaRepository.$kysely
      .selectFrom('assets')
      .selectAll()
      .where((eb) => eb(withTimeBucket(eb, options.size), '=', sql`${timeBucket.replace(/^[+-]/, '')}::timestamp`))
      .where('ownerId', '=', sql<string>`any(array[${options.userIds}]::uuid[])`)
      .where('isVisible', '=', true)
      .where('deletedAt', options.isTrashed ? 'is not' : 'is', null)
      .$if(options.isArchived != null, (qb) => qb.where('isArchived', '=', options.isArchived as boolean))
      .$if(options.isFavorite != null, (qb) => qb.where('isFavorite', '=', options.isFavorite as boolean))
      .$if(!!options.assetType, (qb) => qb.where('type', '=', options.assetType as AssetType))
      .$if(!!options.exifInfo, (qb) => qb.select((eb) => withExif(eb)))
      .orderBy('fileCreatedAt', options.order === AssetOrder.ASC ? 'asc' : 'desc')
      .execute() as any as Promise<AssetEntity[]>;
  }

  @GenerateSql({ params: [{ userIds: [DummyValue.UUID, DummyValue.UUID] }] })
  getDuplicates(userIds: string[]): Promise<AssetDuplicateGroup[]> {
    return this.prismaRepository.$kysely
      .selectFrom('assets')
      .leftJoinLateral(
        (qb) =>
          qb
            .selectFrom('exif')
            .select((eb) => eb.fn.toJson('exif').as('exifInfo'))
            .whereRef('assets.id', '=', 'exif.assetId')
            .limit(1)
            .as('lat'),
        (join) => join.onTrue(),
      )
      .select((eb) => [
        'duplicateId',
        eb.fn
          .jsonAgg(
            eb.fn('jsonb_insert', [
              eb.fn('to_jsonb', [eb.table('assets'), sql`ARRAY['exifInfo']`, eb.ref('exifInfo')]),
            ]),
          )
          .as('assets'),
      ])
      .where('ownerId', '=', sql<string>`any(array[${userIds}]::uuid[])`)
      .where('isVisible', '=', true)
      .where('duplicateId', 'is not', null)
      .groupBy('duplicateId')
      .execute() as any as Promise<AssetDuplicateGroup[]>;
  }

  @GenerateSql({ params: [DummyValue.UUID, { minAssetsPerField: 5, maxFields: 12 }] })
  async getAssetIdByCity(
    ownerId: string,
    { minAssetsPerField, maxFields }: AssetExploreFieldOptions,
  ): Promise<SearchExploreItem<string>> {
    const res = await this.prismaRepository.exif.groupBy({
      by: 'city',
      where: {
        assets: { ownerId, isVisible: true, isArchived: false, type: AssetType.IMAGE },
        city: { not: null },
      },
      having: {
        assetId: {
          _count: {
            gte: minAssetsPerField,
          },
        },
      },
      take: maxFields,
      orderBy: {
        city: 'desc',
      },
    });

    const cities = res.map((item) => item.city!);

    const items = await this.prismaRepository.exif.findMany({
      where: {
        city: {
          in: cities,
        },
      },
      select: {
        city: true,
        assetId: true,
      },
      distinct: ['city'],
    });

    return {
      fieldName: 'exifInfo.city',
      items: items.map((item) => ({ value: item.city!, data: item.assetId })),
    };
  }

  @GenerateSql({ params: [DummyValue.UUID, { minAssetsPerField: 5, maxFields: 12 }] })
  async getAssetIdByTag(
    ownerId: string,
    { minAssetsPerField, maxFields }: AssetExploreFieldOptions,
  ): Promise<SearchExploreItem<string>> {
    const res = await this.prismaRepository.smartInfo.groupBy({
      by: 'tags',
      where: {
        assets: { ownerId, isVisible: true, isArchived: false, type: AssetType.IMAGE },
      },
      having: {
        assetId: {
          _count: {
            gte: minAssetsPerField,
          },
        },
      },
      take: maxFields,
      orderBy: {
        tags: 'desc',
      },
    });

    const tags = res.flatMap((item) => item.tags!);

    const items = await this.prismaRepository.smartInfo.findMany({
      where: {
        tags: {
          hasSome: tags,
        },
      },
      select: {
        tags: true,
        assetId: true,
      },
    });

    return {
      fieldName: 'smartInfo.tags',
      items: items.map((item) => ({ value: item.tags![0], data: item.assetId })),
    };
  }

  @GenerateSql({
    params: [
      {
        ownerId: DummyValue.UUID,
        lastCreationDate: DummyValue.DATE,
        lastId: DummyValue.STRING,
        updatedUntil: DummyValue.DATE,
        limit: 10,
      },
    ],
  })
  getAllForUserFullSync(options: AssetFullSyncOptions): Promise<AssetEntity[]> {
    const { ownerId, lastCreationDate, lastId, updatedUntil, limit } = options;
    return this.prismaRepository.assets.findMany({
      where: {
        ownerId,
        isVisible: true,
        updatedAt: { lte: updatedUntil },
        AND: [{ fileCreatedAt: { lt: lastCreationDate } }, { id: { lt: lastId } }],
        OR: [{ deletedAt: null }, { deletedAt: { not: null } }],
      },
      include: { exifInfo: true },
      orderBy: {
        fileCreatedAt: 'desc',
        id: 'desc',
      },
      take: limit,
    }) as any as Promise<AssetEntity[]>;
  }

  @GenerateSql({ params: [{ userIds: [DummyValue.UUID], updatedAfter: DummyValue.DATE }] })
  getChangedDeltaSync(options: AssetDeltaSyncOptions): Promise<AssetEntity[]> {
    return this.prismaRepository.assets.findMany({
      where: {
        ownerId: { in: options.userIds },
        isVisible: true,
        updatedAt: { gt: options.updatedAfter },
        OR: [{ deletedAt: null }, { deletedAt: { not: null } }],
      },
      include: {
        exifInfo: true,
        stack: true,
      },
      take: options.limit,
    }) as any as Promise<AssetEntity[]>;
  }
}
