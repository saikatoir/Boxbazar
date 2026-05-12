import { Queue, Worker, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import type { NormalizedMessengerEvent } from '@fcommerce/meta-sdk';
import { env } from '../env.js';
import { processInboundMessengerEvent } from './messenger-pipeline.js';

const QUEUE_NAME = 'messenger-inbound';
const JOB_NAME = 'inbound-event';

interface InboundJobData {
  event: NormalizedMessengerEvent;
}

let queueRef: Queue<InboundJobData> | null = null;
let workerRef: Worker<InboundJobData> | null = null;
let connectionRef: Redis | null = null;

const JOB_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 200,
};

function ensureConnection(): Redis {
  if (!connectionRef) connectionRef = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  return connectionRef;
}

function ensureQueue(): Queue<InboundJobData> {
  if (!queueRef) queueRef = new Queue<InboundJobData>(QUEUE_NAME, { connection: ensureConnection() });
  return queueRef;
}

/** Enqueue a normalized Messenger event for async processing. Returns fast. */
export async function enqueueMessengerEvent(event: NormalizedMessengerEvent): Promise<void> {
  await ensureQueue().add(JOB_NAME, { event }, JOB_OPTS);
}

/** Start the worker that drains the messenger-inbound queue. */
export function startMessengerWorker(): void {
  if (workerRef) return;
  workerRef = new Worker<InboundJobData>(
    QUEUE_NAME,
    async (job) => processInboundMessengerEvent(job.data.event),
    { connection: ensureConnection(), concurrency: 5 },
  );
  workerRef.on('failed', (job, err) => {
    console.warn('[messenger-worker] job failed', job?.id, err?.message);
  });
  workerRef.on('error', (err) => {
    console.warn('[messenger-worker] error', err?.message);
  });
  console.info('[messenger-worker] started');
}

export async function stopMessengerWorker(): Promise<void> {
  await workerRef?.close();
  await queueRef?.close();
  await connectionRef?.quit();
  workerRef = null;
  queueRef = null;
  connectionRef = null;
}
