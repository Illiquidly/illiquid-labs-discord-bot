// Doing double import/require because reconnecting-websocket has bad TypeScript definition
import RWS, { ErrorEvent } from "reconnecting-websocket";
const ReconnectingWebSocket = require("reconnecting-websocket");
const WebSocket = require("ws");

type RPCWatcherConfig = {
  url: string;
  maxRetries?: number; // Maxmimum number of reconnect attempts
};

export type RpcResponse = {
  jsonrpc: string;
  id: number | string;
  result: {
    query?: string;
    data?: {
      type: string;
      value: any;
    };
    events: {
      [name: string]: string[];
    };
  };
};

type Callback = (response: RpcResponse) => void;
type SubscriptionEntity = { query: string; callback: Callback };

export default class RPCWatcher {
  private client: RWS;
  private subscribers: SubscriptionEntity[] = [];
  private connected = false;
  private url: string;

  constructor(config: RPCWatcherConfig) {
    this.url = config.url;

    // startClosed true for registering Tendermint subscription
    this.client = new ReconnectingWebSocket(config.url, [], {
      maxRetries: config.maxRetries || Infinity,
      startClosed: true,
      WebSocket: WebSocket,
    });

    this.client.onerror = this.onError.bind(this);
    this.client.onopen = this.onOpen.bind(this);
    this.client.onmessage = this.onMessage.bind(this);
    this.client.onclose = this.onClose.bind(this);
  }

  /**
   * Register the subscriber to the watcher
   * @param query
   * @param callback
   */
  registerSubscriber(query: string, callback: Callback) {
    this.subscribers.push({
      query,
      callback,
    });
  }

  /**
   * Subscribe query
   */
  private sendSubscriptions() {
    this.subscribers.forEach((data: SubscriptionEntity, index: number) => {
      console.log(`RPCWatcher: registering ${data.query}`);

      this.client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          id: index,
          params: {
            query: data.query,
          },
        })
      );
    });
  }

  /**
   * start listening to socket for data
   */
  async start() {
    console.log("RPCWatcher: start");
    this.client.reconnect();
  }

  /**
   * force restart
   */
  restart() {
    this.client.reconnect();
  }

  /**
   * close connection
   */
  close(): boolean {
    if (this.connected) {
      this.client.close();
      this.connected = false;
      return true;
    }

    return false;
  }

  /**
   * Called when connection is established
   */
  private onOpen() {
    console.log("RPCWatcher: connection established");
    this.connected = true;
    this.sendSubscriptions();
  }

  /**
   * Process response message
   * @param data Response data from socket
   */
  private onMessage(ev: any) {
    try {
      const resp: RpcResponse = JSON.parse(ev.data);

      if (typeof resp.jsonrpc === "undefined" || typeof resp.id === "undefined") {
        // Skip invalid response
        return;
      }

      if (resp.result) {
        const subscriber = this.subscribers.find((s) => s.query === resp.result.query);

        if (subscriber) {
          subscriber.callback(resp);
        }
      }
    } catch (error) {
      console.error("Error in response data parsing");
      console.error(error);
    }
  }

  /**
   * Handle socket error event
   * @param error
   */
  private onError(ev: ErrorEvent) {
    console.error(`RPCWatcher: error: ${ev.message}`);
  }

  /**
   * Handle socket closing event
   */
  private onClose() {
    console.log("RPCWatcher: connection lost");
    this.connected = false;
  }
}
