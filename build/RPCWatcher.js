"use strict";
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, "default", { enumerable: true, value: v });
      }
    : function (o, v) {
        o["default"] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null)
      for (var k in mod)
        if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
Object.defineProperty(exports, "__esModule", { value: true });
const ReconnectingWebSocket = require("reconnecting-websocket");
const WebSocket = __importStar(require("ws"));
class RPCWatcher {
  constructor(config) {
    this.subscribers = [];
    this.connected = false;
    this.url = config.url;
    this.logger = config.logger;
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
  registerSubscriber(query, callback) {
    this.subscribers.push({
      query,
      callback,
    });
  }
  /**
   * Subscribe query
   */
  sendSubscriptions() {
    this.subscribers.forEach((data, index) => {
      this.logger.info(`RPCWatcher: registering ${data.query}`);
      this.client.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "subscribe",
          id: index,
          params: {
            query: [data.query],
          },
        })
      );
    });
  }
  /**
   * start listening to socket for data
   */
  start() {
    return __awaiter(this, void 0, void 0, function* () {
      this.logger.info("RPCWatcher: start");
      this.client.reconnect();
    });
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
  close() {
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
  onOpen() {
    this.logger.info("RPCWatcher: connection established");
    this.connected = true;
    this.sendSubscriptions();
  }
  /**
   * Process response message
   * @param data Response data from socket
   */
  onMessage(ev) {
    try {
      const resp = JSON.parse(ev.data);
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
      this.logger.error("Error in response data parsing");
      this.logger.error(error);
    }
  }
  /**
   * Handle socket error event
   * @param error
   */
  onError(ev) {
    this.logger.error(`RPCWatcher: error: ${ev.message}`);
  }
  /**
   * Handle socket closing event
   */
  onClose() {
    this.logger.info("RPCWatcher: connection lost");
    this.connected = false;
  }
}
exports.default = RPCWatcher;
