import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/',
      'node_modules/',
      '**/*.generated.*',
      '**/*.min.js',
      '**/assets/',
      '**/deps/',
      '**/dist/',
      '**/*.tsbuildinfo',
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      curly: 'error',
    },
  }
);
