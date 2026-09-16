/**
 * Shared button style utilities following GitHub/Primer design patterns.
 * Use these class strings to maintain consistent button appearances across the application.
 */

export const buttonStyles = {
  primary:
    'rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500',

  primaryLarge:
    'rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500',

  secondary:
    'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400',

  danger:
    'rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400',

  dangerFilled:
    'rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500',

  link: 'text-sm font-medium text-slate-700 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400',

  linkSmall:
    'text-xs font-medium text-slate-700 hover:text-slate-900 disabled:cursor-not-allowed disabled:text-slate-400',

  linkPrimary:
    'text-sm font-medium text-slate-900 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400',

  linkSmallPrimary:
    'text-xs font-medium text-slate-900 hover:text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400',

  /**
   * Focus ring for text inputs, matching the slate palette used in buttons.
   */
  inputFocus:
    'focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500',

  /**
   * Segmented control button (inactive state).
   * Use with active state classes for toggle groups.
   */
  segmentedInactive:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',

  /**
   * Segmented control button (active state).
   */
  segmentedActive: 'bg-slate-900 text-white',
} as const;
