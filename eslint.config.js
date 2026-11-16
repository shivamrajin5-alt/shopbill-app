import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'src/**/*', 'admin-panel/**/*']
  },
  firebaseRulesPlugin.configs['flat/recommended']
];
