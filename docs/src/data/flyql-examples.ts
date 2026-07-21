export const flyqlVersion = '1.0.2'

export const landingIntroQuery = "status >= 400 and host like 'prod%' and not debug"

export const landingQuickExampleQuery =
  'service != api and (status >= 400 or level = error) and message ~ "timeout.*"'

export const landingQuickExampleParts = {
  service: 'service != api',
  status: 'status >= 400',
  level: 'level = error',
  message: 'message ~ "timeout.*"',
  andToken: 'and',
  orToken: 'or',
  grouping: '( )',
} as const
