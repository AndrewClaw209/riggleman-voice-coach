/**
 * Realtime API Client for Server-Side Relay
 * 
 * This handles WebSocket connection to OpenAI's Realtime API from the backend,
 * which solves the browser authentication issue (missing custom headers).
 * 
 * The browser connects to /api/realtime-relay which internally maintains
 * the authenticated connection to OpenAI.
 */

import { WebSocket as NodeWebSocket } from 'ws';

export interface RealtimeSession {
  token: string;
  sessionId: string;
  expiresAt: number;
}

export class RealtimeClient {
  private ws: NodeWebSocket | null = null;
  private url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26';

  /**
   * Connect to OpenAI's Realtime API with proper Authorization header
   */
  async connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Use 'ws' library which supports custom headers
        const headers = {
          'Authorization': `Bearer ${token}`,
        };

        console.log('[Realtime] Connecting with Authorization header...');
        
        this.ws = new NodeWebSocket(this.url, {
          headers,
          // @ts-ignore
          perMessageDeflate: false,
        });

        this.ws.on('open', () => {
          console.log('[Realtime] Connected to OpenAI');
          resolve();
        });

        this.ws.on('error', (error) => {
          console.error('[Realtime] Connection error:', error);
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('[Realtime] Disconnected');
          this.ws = null;
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a message to OpenAI Realtime API
   */
  send(message: string | object): void {
    if (!this.ws || this.ws.readyState !== NodeWebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    this.ws.send(payload);
  }

  /**
   * Listen for messages (for streaming to browser)
   */
  on(event: 'message' | 'error' | 'close', callback: (data: any) => void): void {
    if (!this.ws) throw new Error('Not connected');
    
    if (event === 'message') {
      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          callback(message);
        } catch (err) {
          console.error('[Realtime] Parse error:', err);
        }
      });
    } else {
      this.ws.on(event, callback);
    }
  }

  /**
   * Close connection
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === NodeWebSocket.OPEN;
  }
}
