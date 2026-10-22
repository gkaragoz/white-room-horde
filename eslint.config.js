import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const forbiddenMath = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'pow', 'exp', 'log', 'log2', 'log10', 'random', 'cbrt', 'hypot'];

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', 'mixamo/**', '.claude/**', 'assets-src/**', 'tools/**', 'docs/**', 'packages/client/public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The simulation must be bit-identical on every engine (docs/DESIGN.md section 8).
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...forbiddenMath.map((property) => ({
          object: 'Math',
          property,
          message: 'Math.' + property + ' is not deterministic across engines; use packages/sim/src/detmath.ts or the seeded Rng.',
        })),
        { object: 'Date', property: 'now', message: 'No wall-clock time in the simulation.' },
        { object: 'performance', property: 'now', message: 'No wall-clock time in the simulation.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'Date', message: 'No wall-clock time in the simulation.' },
        { name: 'performance', message: 'No wall-clock time in the simulation.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ForOfStatement > CallExpression > Identifier[name=/^(Map|Set)$/]', message: 'Iterate arrays in fixed order, not Map/Set.' },
      ],
    },
  },
);
