import { Queue, Worker, JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { getCourierAdapter, OrderStatus } from '@fcommerce/courier-sdk';
import { prisma } from './prisma.js';
import { decryptCredentials } from './encryption.js';
import { ingestStatusEvent, isTerminalStatus } from './courier-status.js';
import { env } from '../env.js';

const QUEUE_NAME = 'courier-status-poll';
const REPEAT_JOB_NAME = 'poll-all-active';

let workerRef: Worker | null = null;
let queueRef: Queue | null = null;
let connectionRef: Redis | null = null;

async function pollAllActiveConsignments(): Promise<{ checked: number; updated: number; failed: number }> {
  // Active = consignment whose latest currentStatus does not map to a terminal state.
  const consignments = await prisma.consignment.findMany({
    include: {
      order: { include: { store: { include: { courierAccounts: true } } } },
    },
    where: { NOT: { currentStatus: { in: ['delivered', 'returned', 'cancelled', 'canceled'] } } },
    take: 500,
  });

  let updated = 0;
  let failed = 0;
  for (const c of consignments) {
    const acct = c.order.store.courierAccounts.find((a) => a.courier === c.courier);
    if (!acct) continue;

    try {
      const creds = decryptCredentials(acct.encryptedCredentials as string);
      const adapter = getCourierAdapter(c.courier as 'steadfast' | 'pathao' | 'redx', {
        courier: c.courier,
        ...creds,
      } as object);
      const tracking = await adapter.getTrackingStatus(c.consignmentId);
      const result = await ingestStatusEvent(c.id, tracking, 'poll');
      if (result.inserted) updated++;
      if (isTerminalStatus(tracking.normalizedStatus)) {
        // No further polling needed; the next pass will skip it because
        // currentStatus is now terminal.
      }
    } catch (err) {
      failed++;
      console.warn('[status-poller] failed for', c.id, (err as Error).message);
    }
  }
  return { checked: consignments.length, updated, failed };
}

export async function startStatusPoller(): Promise<void> {
  if (env.ENABLE_STATUS_POLLER !== 'true') {
    console.info('[status-poller] disabled by env');
    return;
  }
  connectionRef = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  queueRef = new Queue(QUEUE_NAME, { connection: connectionRef });
  workerRef = new Worker(
    QUEUE_NAME,
    async () => pollAllActiveConsignments(),
    { connection: connectionRef, concurrency: 1 }
  );

  workerRef.on('completed', (job, result) => {
    console.info('[status-poller] tick', result);
  });
  workerRef.on('failed', (job, err) => {
    console.warn('[status-poller] job failed', err?.message);
  });

  // Repeatable job: every STATUS_POLL_INTERVAL_MS milliseconds.
  const opts: JobsOptions = {
    repeat: { every: env.STATUS_POLL_INTERVAL_MS },
    removeOnComplete: 10,
    removeOnFail: 50,
  };
  // BullMQ dedups repeatable jobs by `name` + `repeat` opts.
  await queueRef.add(REPEAT_JOB_NAME, {}, opts);

  console.info(
    `[status-poller] scheduled every ${env.STATUS_POLL_INTERVAL_MS}ms`
  );
}

export async function stopStatusPoller(): Promise<void> {
  await workerRef?.close();
  await queueRef?.close();
  await connectionRef?.quit();
  workerRef = null;
  queueRef = null;
  connectionRef = null;
}
