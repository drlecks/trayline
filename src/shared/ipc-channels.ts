// Single source of truth for all IPC channel names.
// Import this in both preload and renderer to keep types in sync.

export const IPC = {
  settings: {
    get: 'settings:get',
    set: 'settings:set',
  },
  audit: {
    query: 'audit:query',
  },
  window: {
    minimize: 'window:minimize',
    maximize: 'window:maximize',
    close: 'window:close',
    isMaximized: 'window:isMaximized',
  },
  app: {
    bootstrapInfo: 'app:bootstrapInfo',
  },
  project: {
    list: 'project:list',
    get: 'project:get',
    create: 'project:create',
    delete: 'project:delete',
    listWorkflows: 'project:listWorkflows',
    listSteps: 'project:listSteps',
    listSkills: 'project:listSkills',
  },
  usage: {
    get: 'usage:get',
  },
  adapters: {
    list: 'adapters:list',
    detect: 'adapters:detect',
  },
} as const
