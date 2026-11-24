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
const REMOVED_ALERT_CLASS = '(^|\\s)ui-alert-error(\\s|$)'
const UPPERCASE_CLASS = '(^|[\\s:])uppercase(\\s|$)'

const rawStyleMessage = 'Use the design tokens (text-ink, bg-surface, ok/warn/bad/info/neutral, text-xs…) instead of raw palette colours, pixel font sizes or hex values.'

/** Flags the pattern in plain strings and in the fixed parts of template literals. */
function stringSelectors(pattern, message) {
  return [
    { selector: `Literal[value=/${pattern}/]`, message },
    { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
  ]
}

const rawStyleSelectors = [PALETTE_CLASS, PIXEL_TEXT_CLASS, HEX_CLASS].flatMap((pattern) => stringSelectors(pattern, rawStyleMessage))
const removedAlertSelectors = stringSelectors(REMOVED_ALERT_CLASS, 'ui-alert-error was removed: use ui-alert-danger.')
const rupeeTemplateSelectors = [{
  selector: 'TemplateElement[tail=false][value.raw=/₹$/]',
  message: 'Show money with formatCurrency() or <MoneyText>, not a `₹${…}` template literal.',
}]
const uppercaseSelectors = stringSelectors(UPPERCASE_CLASS, 'Labels are sentence case: use ui-kpi-label for figure labels or ui-section-heading for section titles instead of uppercase.')
const toFixedSelectors = [{
  selector: "CallExpression[callee.property.name='toFixed']:not(Property[key.name='value'] CallExpression)",
  message: 'Show numbers with formatDecimal(), formatNumberIn(), <MoneyText> or <LitresText>; toFixed() is only for CSV column values and input values (see TO_FIXED_INPUT_FILES).',
}]

// These write a number back into a text input, where the value must stay unformatted.
const TO_FIXED_INPUT_FILES = [
  'src/pages/inventory/record-delivery/RecordDeliveryModal.tsx',
  'src/pages/shifts/CloseShiftModal.tsx',
  'src/pages/shifts/backfill/PaymentSection.tsx',
  'src/pages/shifts/close/PaymentSection.tsx',
  'src/pages/shifts/components/CreditEntryForm.tsx',
  'src/pages/shifts/modals/AddCreditEntryModal.tsx',
]
const TEST_FILES = ['**/*.test.tsx']

const restrictedSyntax = (...selectorGroups) => ['error', ...selectorGroups.flat()]

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
      'no-restricted-syntax': restrictedSyntax(rawStyleSelectors, removedAlertSelectors),
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  // Each block repeats the selectors above it: a later no-restricted-syntax replaces the earlier list instead of adding to it.
  {
    files: ['src/**/*.tsx'],
    ignores: TEST_FILES,
    rules: { 'no-restricted-syntax': restrictedSyntax(rawStyleSelectors, removedAlertSelectors, rupeeTemplateSelectors) },
  },
  {
    files: ['src/pages/**/*.tsx'],
    ignores: [...TEST_FILES, ...TO_FIXED_INPUT_FILES],
    rules: { 'no-restricted-syntax': restrictedSyntax(rawStyleSelectors, removedAlertSelectors, rupeeTemplateSelectors, uppercaseSelectors, toFixedSelectors) },
  },
  {
    files: TO_FIXED_INPUT_FILES,
    rules: { 'no-restricted-syntax': restrictedSyntax(rawStyleSelectors, removedAlertSelectors, rupeeTemplateSelectors, uppercaseSelectors) },
  },
])
