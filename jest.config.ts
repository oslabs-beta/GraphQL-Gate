import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
    verbose: true,
    roots: ['./test'],
    preset: 'ts-jest',
    testEnvironment: 'node',
    // moduleFileExtensions: ['js', 'ts'],
    // Bellow is needed to resolve imports with .js extensions
    transform: {
        '\\.[jt]s?$': 'ts-jest',
    },
    globals: {
        'ts-jest': {
            useESM: true,
        },
    },
    moduleNameMapper: {
        '(.+)\\.js': '$1',
    },
    extensionsToTreatAsEsm: ['.ts'],
};

export default config;
