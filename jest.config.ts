import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    verbose: true,
    roots: ['./test'],
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleFileExtensions: ['js', 'ts'],
    setupFilesAfterEnv: ['./jest.setup.redis-mock.js'],
};

export default config;
