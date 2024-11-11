import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';

@Injectable()
export class WhatsappService {
  private client: Client;
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private eventEmitter: EventEmitter2) {
    // Initialize the client with session persistence
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'user-session', // Can be unique for each WhatsApp connection if needed
      }),
    });

    // Listen for QR code and ready events
    this.client.on('qr', (qr) => {
      this.logger.log('WhatsApp QR Code received');
      this.eventEmitter.emit('whatsapp.qr', qr);
    });

    this.client.on('ready', () => {
      this.logger.log('WhatsApp Client is ready!');
    });

    this.client.on('message', (msg: Message) => {
      // Optionally process incoming messages
    });

    // Initialize the client to connect or reconnect with saved session
    this.client.initialize();
  }

  async sendMessage(recipient: string, message: string) {
    return await this.client.sendMessage(recipient, message);
  }
}
