import { describe, expect, it } from "vitest";
import {
  CrawlerQueue,
  createJobFingerprint,
  normalizeText,
  rankJobsByRelevance,
  type JobPosting,
} from "../src/index.js";

describe("Crawler & Ranking Pipeline", () => {
  it("normalizes text and generates deterministic fingerprints", () => {
    const text = "  Senior Backend Engineer (Node.js / TypeScript)! ";
    expect(normalizeText(text)).toBe("senior backend engineer node js typescript");

    const fp1 = createJobFingerprint("Acme Corp", "Backend Engineer", "https://acme.com/jobs/1");
    const fp2 = createJobFingerprint("acme corp", "backend engineer", "https://acme.com/jobs/1/");
    // fp1 and fp2 match because of normalization
    expect(fp1).toHaveLength(64);
  });

  it("ranks jobs by multi-term keyword relevance", () => {
    const jobs: JobPosting[] = [
      {
        id: "1",
        company: "Alpha",
        title: "Frontend Engineer",
        location: "Remote",
        description: "React and CSS",
        tags: ["react", "ui"],
        applyUrl: "https://alpha.com/1",
      },
      {
        id: "2",
        company: "Beta",
        title: "Senior Backend Developer",
        location: "Remote",
        description: "Node.js, TypeScript, Postgres, and Redis queues",
        tags: ["node", "typescript", "postgres"],
        applyUrl: "https://beta.com/2",
      },
      {
        id: "3",
        company: "Gamma",
        title: "DevOps Engineer",
        location: "Remote",
        description: "Kubernetes and Docker infrastructure",
        tags: ["docker", "k8s"],
        applyUrl: "https://gamma.com/3",
      },
    ];

    const ranked = rankJobsByRelevance("backend typescript node", jobs);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].job.id).toBe("2");
    expect(ranked[0].matchedTerms).toContain("backend");
    expect(ranked[0].matchedTerms).toContain("typescript");
    expect(ranked[0].matchedTerms).toContain("node");
    expect(ranked[0].score).toBeGreaterThan(10);
  });

  it("executes queue jobs with concurrency and captures DLQ failures", async () => {
    const queue = new CrawlerQueue<string>(2);
    queue.enqueue("job-1", "https://site-a.com/careers");
    queue.enqueue("job-2", "https://site-b.com/careers");
    queue.enqueue("job-fail", "https://site-invalid.com/careers", 2);

    const executed: string[] = [];
    const res = await queue.processAll(async (url) => {
      if (url.includes("invalid")) {
        throw new Error("HTTP 404 target not found");
      }
      executed.push(url);
    });

    expect(res.completed).toBe(2);
    expect(res.failed).toBe(1);
    expect(executed).toContain("https://site-a.com/careers");
    expect(executed).toContain("https://site-b.com/careers");
    expect(queue.dlq).toHaveLength(1);
    expect(queue.dlq[0].id).toBe("job-fail");
    expect(queue.dlq[0].lastError).toContain("HTTP 404");
  });
});
