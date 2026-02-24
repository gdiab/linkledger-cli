import { createServiceContext } from '../src/services/context.js';
import { RedditBackfillService } from '../src/services/reddit-backfill-service.js';

const dryRun = process.argv.includes('--dry-run');
const context = createServiceContext();

try {
  const service = new RedditBackfillService(context);
  const result = service.execute({ dryRun });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  context.db.close();
}
