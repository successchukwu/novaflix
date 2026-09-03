import { cronScheduler } from './cronScheduler.js';
import { tmdbSyncService } from './tmdbSyncService.js';
import { refreshBaselineVPM } from './ppmService.js';

export async function initializeCronJobs() {
  console.log('[Cron] Initializing scheduled jobs...');

  // Hourly: Refresh baseline VPM for PPM calculations
  cronScheduler.schedule('hourly-vpm', '0', '*', '*', '*', '*', async () => {
    console.log('[Cron] Running hourly baseline VPM refresh...');
    await refreshBaselineVPM();
  });

  // Daily at 3 AM: TMDB incremental sync (new popular people)
  cronScheduler.schedule('tmdb-incremental', '0', '3', '*', '*', '*', async () => {
    console.log('[Cron] Running TMDB incremental sync...');
    await tmdbSyncService.incrementalSync();
  });

  // Weekly on Sunday at 4 AM: Full TMDB sync (optional, can be triggered manually)
  cronScheduler.schedule('tmdb-full', '0', '4', '*', '*', '0', async () => {
    console.log('[Cron] Running weekly TMDB full sync...');
    await tmdbSyncService.syncAllPeople(20); // 20 pages = 400 people
  });

  // Every 10 minutes: Check pending withdrawal statuses
  cronScheduler.schedule('payout-status', '*/10', '*', '*', '*', '*', async () => {
    // Implementation in watchService
  });

  console.log('[Cron] All jobs scheduled successfully');
}

export { cronScheduler };