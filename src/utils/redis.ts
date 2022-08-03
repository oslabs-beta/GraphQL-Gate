import Redis, { RedisOptions } from 'ioredis';

const clients: Redis[] = [];

/**
 * Connects to a client returning the client and a spe
 * @param options
 */
export function connect(options: RedisOptions): Redis {
    // TODO: Figure out what other options we should set (timeouts, etc)
    const client: Redis = new Redis(options); // Default port is 6379 automatically
    clients.push(client);
    return client;
}

/**
 * Shutsdown all redis client connections
 */
export async function shutdown(): Promise<'OK'[]> {
    // TODO: Add functinoality to shutdown a client by an id
    // TODO: Error handling
    return Promise.all(clients.map((client: Redis) => client.quit()));
}
