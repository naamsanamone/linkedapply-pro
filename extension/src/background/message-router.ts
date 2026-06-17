/* ============================================================
   LinkedApply Pro — Message Router
   Centralized typed message passing between extension contexts
   ============================================================ */

import { createLogger } from '../shared/logger';
import type { ExtensionMessage, MessageType } from '../shared/types';

const log = createLogger('MessageRouter');

type MessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => boolean | void | Promise<void>;

/**
 * Registry-based message router.
 * Handlers are registered by message type, and dispatched automatically.
 */
class MessageRouter {
  private handlers: Map<MessageType, MessageHandler> = new Map();

  constructor() {
    chrome.runtime.onMessage.addListener(this.dispatch.bind(this));
    log.info('Message router initialized');
  }

  /**
   * Register a handler for a specific message type
   */
  register(type: MessageType, handler: MessageHandler): void {
    this.handlers.set(type, handler);
    log.debug(`Handler registered: ${type}`);
  }

  /**
   * Remove a handler
   */
  unregister(type: MessageType): void {
    this.handlers.delete(type);
  }

  /**
   * Internal dispatcher — called by chrome.runtime.onMessage
   */
  private dispatch(
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ): boolean {
    if (!message?.type) {
      log.warn('Received message without type', message);
      sendResponse({ error: 'Missing message type' });
      return false;
    }

    const handler = this.handlers.get(message.type);
    if (handler) {
      log.debug(`Dispatching: ${message.type}`);
      const result = handler(message, sender, sendResponse);
      // If handler returns true (or a promise), keep channel open for async response
      return result === true || result instanceof Promise;
    }

    log.debug(`No handler for: ${message.type}`);
    return false;
  }

  /**
   * Send a message to a specific tab's content script
   */
  async sendToTab(tabId: number, message: ExtensionMessage): Promise<any> {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      log.warn(`Failed to send to tab ${tabId}:`, error);
      return null;
    }
  }

  /**
   * Send a message to all LinkedIn tabs
   */
  async sendToLinkedInTabs(message: ExtensionMessage): Promise<void> {
    const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
    for (const tab of tabs) {
      if (tab.id) {
        this.sendToTab(tab.id, message);
      }
    }
  }

  /**
   * Broadcast a message to all extension contexts (popup, sidepanel)
   */
  broadcast(message: ExtensionMessage): void {
    chrome.runtime.sendMessage(message).catch(() => {
      // No listeners open — expected when popup/sidepanel are closed
    });
  }

  /**
   * Send + broadcast (to both content scripts and popup/sidepanel)
   */
  async broadcastAll(message: ExtensionMessage): Promise<void> {
    this.broadcast(message);
    await this.sendToLinkedInTabs(message);
  }
}

/** Singleton instance */
export const messageRouter = new MessageRouter();
