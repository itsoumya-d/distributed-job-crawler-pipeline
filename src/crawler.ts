import { createHash } from "node:crypto";

export interface JobPosting {
  id: string;
  company: string;
  title: string;
  location: string;
  description: string;
  tags: string[];
  applyUrl: string;
}

export interface ScoredJob {
  job: JobPosting;
  score: number;
  matchedTerms: string[];
}

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function createJobFingerprint(company: string, title: string, applyUrl: string): string {
  const normalized = [normalizeText(company), normalizeText(title), applyUrl.trim().toLowerCase()].join("::");
  return createHash("sha256").update(normalized).digest("hex");
}

export function rankJobsByRelevance(query: string, jobs: JobPosting[]): ScoredJob[] {
  const queryTokens = Array.from(new Set(normalizeText(query).split(/\s+/).filter(Boolean)));
  if (queryTokens.length === 0) {
    return jobs.map((job) => ({ job, score: 0, matchedTerms: [] }));
  }

  const results: ScoredJob[] = jobs.map((job) => {
    let score = 0;
    const matched = new Set<string>();
    const titleNorm = normalizeText(job.title);
    const tagNorms = job.tags.map(normalizeText);
    const descNorm = normalizeText(job.description);

    for (const token of queryTokens) {
      if (titleNorm.includes(token)) {
        score += 5.0;
        matched.add(token);
      }
      if (tagNorms.some((t) => t.includes(token))) {
        score += 3.0;
        matched.add(token);
      }
      if (descNorm.includes(token)) {
        score += 1.0;
        matched.add(token);
      }
    }

    return {
      job,
      score: Math.round(score * 100) / 100,
      matchedTerms: Array.from(matched),
    };
  });

  return results.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

export interface QueueJob<T> {
  id: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  state: "pending" | "processing" | "completed" | "failed";
  lastError?: string;
}

export class CrawlerQueue<T> {
  private queue: QueueJob<T>[] = [];
  private deadLetterQueue: QueueJob<T>[] = [];
  private concurrency: number;
  private running = 0;

  constructor(concurrency = 2) {
    this.concurrency = concurrency;
  }

  enqueue(id: string, payload: T, maxAttempts = 3): QueueJob<T> {
    const job: QueueJob<T> = { id, payload, attempts: 0, maxAttempts, state: "pending" };
    this.queue.push(job);
    return job;
  }

  get pendingCount(): number {
    return this.queue.filter((j) => j.state === "pending").length;
  }

  get dlq(): QueueJob<T>[] {
    return [...this.deadLetterQueue];
  }

  async processAll(worker: (payload: T) => Promise<void>): Promise<{ completed: number; failed: number }> {
    let completed = 0;
    let failed = 0;

    const runNext = async (): Promise<void> => {
      const job = this.queue.find((j) => j.state === "pending");
      if (!job) return;

      job.state = "processing";
      job.attempts += 1;
      this.running += 1;

      try {
        await worker(job.payload);
        job.state = "completed";
        completed += 1;
      } catch (err) {
        job.lastError = err instanceof Error ? err.message : String(err);
        if (job.attempts >= job.maxAttempts) {
          job.state = "failed";
          this.deadLetterQueue.push(job);
          failed += 1;
        } else {
          job.state = "pending";
        }
      } finally {
        this.running -= 1;
      }
    };

    while (this.queue.some((j) => j.state === "pending")) {
      const batch = [];
      while (this.running < this.concurrency && this.queue.some((j) => j.state === "pending")) {
        batch.push(runNext());
      }
      if (batch.length > 0) {
        await Promise.all(batch);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    return { completed, failed };
  }
}
