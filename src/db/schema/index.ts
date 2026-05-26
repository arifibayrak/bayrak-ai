// Barrel export of all Drizzle tables for the bayrak-ai schema.
// Import from '@/db/schema' to get any table without specifying the individual file.

export * from './tenants';
export * from './auth';
export * from './projects';
export * from './boq-items';
export * from './routes';
export * from './people';
export * from './pending-people';
export * from './assignments';
export * from './conversation-state';  // references tenants, people
export * from './processed-updates';   // no FK references
export * from './submissions';         // references tenants, people, projects, boq-items
export * from './audit-notifications'; // references tenants, submissions, people (D-34)
export * from './office-activity-log'; // references tenants, users, projects
export * from './hakedis-periods';     // references tenants, projects, users
export * from './hakedis-period-lines'; // references tenants, hakedis-periods, boq-items
