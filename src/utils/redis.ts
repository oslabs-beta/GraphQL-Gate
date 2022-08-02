import Redis, { RedisOptions } from 'ioredis';

const clients: Redis[] = [];

/**
 * Connects to a client returning the client and a spe
 * @param options
 */
export function connect(options: RedisOptions): Redis {
    // TODO: Figure out what other options we should set (timeouts, etc)
    // TODO: pass on connection error
    try {
        const client: Redis = new Redis(options);
        clients.push(client);
        return client;
    } catch (err) {
        throw new Error(`Error in expressGraphQLRateLimiter when connecting to redis: ${err}`);
    }
}

/**
 * Shutsdown all redis client connections
 */
export async function shutdown(): Promise<'OK'[]> {
    // TODO: Add functinoality to shutdown a client by an id
    // TODO: Error handling
    return Promise.all(clients.map((client: Redis) => client.quit()));
}
