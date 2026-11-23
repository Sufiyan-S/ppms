import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const PALETTE_CLASS = '(^|[\\s:])-?(bg|text|border|ring|divide|outline|fill|stroke|from|via|to|accent|caret|decoration|placeholder|shadow)-(slate|gray|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-[0-9]'
const PIXEL_TEXT_CLASS = 'text-\\[[0-9.]+px\\]'
const HEX_CLASS = '-\\[#[0-9a-fA-F]{3,8}\\]'

const rawStyleMessage = 'Use the design tokens (text-ink, bg-surface, ok/warn/bad/info/neutral, text-xs…) instead of raw palette colours, pixel font sizes or hex values.'

const rawStyleRule = ['error', ...[PALETTE_CLASS, PIXEL_TEXT_CLASS, HEX_CLASS].flatMap((pattern) => [
  { selector: `Literal[value=/${pattern}/]`, message: rawStyleMessage },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message: rawStyleMessage },
])]

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    rules: {
      // Checkbox labels wrap the control and put the text a few spans deep.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3, controlComponents: ['NumericInput'] }],
      // Scrollable table regions must take focus so keyboard users can scroll them.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true }],
      'no-restricted-syntax': rawStyleRule,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
