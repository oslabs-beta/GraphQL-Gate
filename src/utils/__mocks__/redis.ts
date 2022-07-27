import Redis from 'ioredis';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisMock = require('ioredis-mock');

const clients: Redis[] = [];

/**
 * Connects to a client returning the client and a spe
 * @param options
 */
export function connect(): Redis {
    const client = new RedisMock();
    clients.push(client);
    return client;
}

/**
 * Shutsdown all redis client connections
 */
export async function shutdown(): Promise<'OK'[]> {
    return Promise.all(clients.map((client: Redis) => client.quit()));
}
