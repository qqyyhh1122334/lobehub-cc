import { appEnv } from '@/envs/app';
import { authEnv } from '@/envs/auth';
import { getRedisConfig } from '@/envs/redis';
import { initializeRedis, isRedisEnabled } from '@/libs/redis';

/**
 * Normalize a URL-like string to an origin with https fallback.
 * Returns the original string if it's a custom scheme (e.g., com.lobehub.app://).
 */
export const normalizeOrigin = (url?: string) => {
  if (!url) return undefined;

  // Handle custom schemes (e.g., mobile app deep links)
  if (url.includes('://') && !url.startsWith('http')) {
    return url;
  }

  try {
    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;

    return new URL(normalizedUrl).origin;
  } catch {
    return undefined;
  }
};

/** Restrict sign-in callbacks to the single internal application origin. */
export const getTrustedOrigins = (_enabledSSOProviders: string[]) => {
  const origin = normalizeOrigin(appEnv.APP_URL);
  if (!origin) return undefined;
  if (authEnv.AUTH_TRUSTED_ORIGINS) {
    const configured = authEnv.AUTH_TRUSTED_ORIGINS.split(',').map((entry) =>
      normalizeOrigin(entry.trim()),
    );
    if (configured.some((value) => value !== origin)) {
      throw new Error('AUTH_TRUSTED_ORIGINS must match the internal APP_URL origin');
    }
  }
  return [origin];
};

/**
 * Build Better Auth secondaryStorage backed by Redis.
 * Uses the shared Redis manager to avoid duplicate connections and prefixes keys to prevent clashes.
 */
export const createSecondaryStorage = () => {
  const redisConfig = getRedisConfig();
  if (!isRedisEnabled(redisConfig)) return undefined;

  const secondaryStorageKeyPrefix = 'better-auth:';

  const buildKey = (key: string) => `${secondaryStorageKeyPrefix}${key}`;

  const getRedisClient = async () => {
    const redisClient = await initializeRedis(redisConfig);
    if (!redisClient) {
      throw new Error('Redis secondary storage is enabled but failed to initialize');
    }

    return redisClient;
  };

  return {
    delete: async (key: string) => {
      const redisClient = await getRedisClient();
      await redisClient.del(buildKey(key));
    },
    get: async (key: string) => {
      const redisClient = await getRedisClient();
      return (await redisClient.get(buildKey(key))) ?? null;
    },
    set: async (key: string, value: string, ttl?: number) => {
      const redisClient = await getRedisClient();
      if (typeof ttl === 'number') {
        await redisClient.set(buildKey(key), value, { ex: ttl });
        return;
      }

      await redisClient.set(buildKey(key), value);
    },
  };
};
