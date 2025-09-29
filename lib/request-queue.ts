'use client';

interface QueuedRequest {
  id: string;
  url: string;
  options: RequestInit;
  retryCount: number;
  maxRetries: number;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

class RequestQueue {
  private static instance: RequestQueue;
  private queue: QueuedRequest[] = [];
  private processing = false;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second base delay
  private readonly MAX_CONCURRENT = 3;
  private activeRequests = 0;

  private constructor() {}

  static getInstance(): RequestQueue {
    if (!RequestQueue.instance) {
      RequestQueue.instance = new RequestQueue();
    }
    return RequestQueue.instance;
  }

  // Add request to queue
  async enqueue(
    url: string,
    options: RequestInit,
    maxRetries = this.MAX_RETRIES
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: this.generateId(),
        url,
        options,
        retryCount: 0,
        maxRetries,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.push(request);
      this.processQueue();
    });
  }

  // Process queued requests
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    if (this.activeRequests >= this.MAX_CONCURRENT) return;

    this.processing = true;

    while (this.queue.length > 0 && this.activeRequests < this.MAX_CONCURRENT) {
      const request = this.queue.shift();
      if (!request) continue;

      this.activeRequests++;
      this.processRequest(request).finally(() => {
        this.activeRequests--;
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }

    this.processing = false;
  }

  // Process individual request
  private async processRequest(request: QueuedRequest): Promise<void> {
    try {

      const response = await fetch(request.url, request.options);

      // Check if we should retry
      if (!response.ok && this.shouldRetry(response.status) && request.retryCount < request.maxRetries) {
        request.retryCount++;
        const delay = this.calculateRetryDelay(request.retryCount);


        setTimeout(() => {
          this.queue.unshift(request); // Add back to front of queue
          this.processQueue();
        }, delay);
      } else {
        // Success or max retries reached
        request.resolve(response);
      }
    } catch (error) {
      // Network error
      if (request.retryCount < request.maxRetries) {
        request.retryCount++;
        const delay = this.calculateRetryDelay(request.retryCount);


        setTimeout(() => {
          this.queue.unshift(request);
          this.processQueue();
        }, delay);
      } else {
        // Max retries reached
        request.reject(error as Error);
      }
    }
  }

  // Determine if status code is retryable
  private shouldRetry(status: number): boolean {
    // Retry on server errors and rate limiting
    return status === 429 || status === 503 || status === 502 || status === 504;
  }

  // Calculate exponential backoff delay
  private calculateRetryDelay(retryCount: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.RETRY_DELAY * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 1000;
    return Math.min(baseDelay + jitter, 30000); // Max 30 seconds
  }

  // Generate unique request ID
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Clear all queued requests
  clearQueue(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  // Get queue status
  getStatus(): {
    queued: number;
    active: number;
    total: number;
  } {
    return {
      queued: this.queue.length,
      active: this.activeRequests,
      total: this.queue.length + this.activeRequests
    };
  }

  // Priority enqueue (add to front of queue)
  async enqueuePriority(
    url: string,
    options: RequestInit,
    maxRetries = this.MAX_RETRIES
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        id: this.generateId(),
        url,
        options,
        retryCount: 0,
        maxRetries,
        resolve,
        reject,
        timestamp: Date.now()
      };

      this.queue.unshift(request);
      this.processQueue();
    });
  }
}

export default RequestQueue;