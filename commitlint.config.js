module.exports = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'scope-enum': [
            2,
            'always',
            [
                'extension',
                'api',
                'panels',
                'views',
                'skills',
                'agents',
                'flows',
                'diagnostics',
                'deps',
                'infra',
                'docs',
            ],
        ],
        'scope-empty': [1, 'never'],
    },
};
