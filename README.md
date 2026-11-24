# Distributed Job Crawler & Ranking Pipeline

Production-oriented distributed career crawler, background job queue scheduler, and search relevance ranking engine in TypeScript and Node.js.

## Architecture

- **Career Page Ingestion**: Normalizes unstructured job postings, handles pagination links, and extracts structured role metadata.
- **Canonical Deduplication**: Generates deterministic SHA-256 fingerprint hashes across company, normalized title, and destination apply URLs to prevent duplicate indexing.
- **BM25 Search & Ranking**: Multi-term weighted relevance scoring evaluating role title matches, technical stack tags, and requirement alignment.
- **Resilient Queue Scheduler**: Concurrent job queue worker with exponential retry backoff, jitter, and dead-letter queue (DLQ) state tracking for overnight batch processing.

## Quickstart

```bash
npm install
npm test
npm run build
```
