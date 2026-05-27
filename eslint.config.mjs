import nx from '@nx/eslint-plugin';

  export default [
    ...nx.configs['flat/base'],
    ...nx.configs['flat/typescript'],
    ...nx.configs['flat/javascript'],
    {
      ignores: ['**/dist', '**/out-tsc'],
    },
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
      rules: {
        '@nx/enforce-module-boundaries': [
          'error',
          {
            enforceBuildableLibDependency: true,
            allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
            depConstraints: [   
              {
                sourceTag: 'scope:app',
                onlyDependOnLibsWithTags: ['scope:app', 'scope:feature', 'scope:data',
  'scope:ui-kit'],
              },
              {
                sourceTag: 'scope:feature',
                onlyDependOnLibsWithTags: ['scope:feature', 'scope:data',
  'scope:ui-kit'],
              },
              {
                sourceTag: 'scope:data',
                onlyDependOnLibsWithTags: ['scope:data', 'scope:ui-kit'],
              },
              {
                sourceTag: 'scope:ui-kit',
                onlyDependOnLibsWithTags: ['scope:ui-kit'],
              },
            ],
          },
        ],
      },
    },
    {
      files: ['libs/**/*.ts'],
      rules: {
        '@angular-eslint/component-selector': [
          'error',
          { type: 'element', prefix: ['ui', 'chat', 'pdf'], style: 'kebab-case' },
        ],
        '@angular-eslint/directive-selector': [
          'error',
          { type: 'attribute', prefix: ['ui', 'chat', 'pdf'], style: 'camelCase' },
        ],
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx', '**/*.cts', '**/*.mts', '**/*.js', '**/*.jsx',
  '**/*.cjs', '**/*.mjs'],
      rules: {},
    },
  ];