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
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
            ],
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
