import { getRepositories } from '../repositories/index.js';
import { ApiError } from '../utils/ApiError.js';
import type {
    CareLogEntity,
    CareLogType,
    CreateCareLogInput,
    PaginatedResult,
    PlantEntity,
} from '../types';

interface ListCareLogsParams {
    type?: CareLogType;
    page?: number;
    limit?: number;
}

const getOwnedPlant = async (ownerId: string, plantId: string): Promise<PlantEntity> => {
    const plant = await getRepositories().plants.findById(plantId);
    if (!plant || plant.ownerId !== ownerId) throw ApiError.notFound('Plant not found');
    return plant;
};

// Дата последнего полива = дата самого свежего полива в логах (или null)
const syncLastWateredAt = async (plantId: string): Promise<void> => {
    const repos = getRepositories();
    const latest = await repos.careLogs.findAll({
        filter: { plantId, type: 'watering' },
        sort: '-occurredAt',
        limit: 1,
    });
    await repos.plants.update(plantId, {
        lastWateredAt: latest.data[0]?.occurredAt ?? null,
    });
};

export const careLogsService = {
    async list(
        ownerId: string,
        plantId: string,
        params: ListCareLogsParams,
    ): Promise<PaginatedResult<CareLogEntity>> {
        await getOwnedPlant(ownerId, plantId);

        const filter: Partial<CareLogEntity> = { plantId };
        if (params.type) filter.type = params.type;

        return getRepositories().careLogs.findAll({
            filter,
            page: params.page ?? 1,
            limit: params.limit ?? 20,
            sort: '-occurredAt',
        });
    },

    async create(
        ownerId: string,
        plantId: string,
        input: CreateCareLogInput,
    ): Promise<CareLogEntity> {
        await getOwnedPlant(ownerId, plantId);

        const occurredAt = new Date(input.occurredAt ?? Date.now()).toISOString();
        const log = await getRepositories().careLogs.create({
            plantId,
            ownerId,
            type: input.type,
            note: input.note ?? '',
            occurredAt,
        });

        if (input.type === 'watering') await syncLastWateredAt(plantId);
        return log;
    },

    async remove(ownerId: string, plantId: string, logId: string): Promise<void> {
        await getOwnedPlant(ownerId, plantId);

        const repos = getRepositories();
        const log = await repos.careLogs.findById(logId);
        if (!log || log.plantId !== plantId) throw ApiError.notFound('Care log not found');

        await repos.careLogs.delete(logId);
        if (log.type === 'watering') await syncLastWateredAt(plantId);
    },
};