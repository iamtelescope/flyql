import js from '@eslint/js'

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
            },
        },
        rules: {
            // Existing codebase predates enforcement; downgrade to warn so CI
            // doesn't block on the initial lint wire-up. Follow-up to clean up.
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-control-regex': 'warn',
            'no-useless-escape': 'warn',
        },
    },
    {
        files: ['bench/**/*.js'],
        rules: { 'no-unused-expressions': 'off' },
    },
    {
        ignores: ['node_modules/', 'snippets/'],
    },
]
