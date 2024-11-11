import { Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WhatsappService } from './whatsapp.service';

@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  cors: {
    origin: true,
    credentials: true,
  },
})
export class WhatsappGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server: Server;
  private readonly logger = new Logger(WhatsappGateway.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`WhatsApp client connected: ${client.id}`);
    this.server.emit('connected', `WhatsApp client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`WhatsApp client disconnected: ${client.id}`);
    this.server.emit(
      'disconnected',
      `WhatsApp client disconnected: ${client.id}`,
    );
  }

  /**
   * Handle WhatsApp-related messages sent from the client.
   * @param client - The client sending the message.
   * @param payload - WhatsApp message payload containing recipient and message content.
   */
  @SubscribeMessage('whatsappMessage')
  async handleWhatsappMessage(
    client: Socket,
    payload: { recipient: string; message: string },
  ) {
    try {
      await this.whatsappService.sendMessage(
        payload.recipient,
        payload.message,
      );
      this.server.to(client.id).emit('messageStatus', {
        recipient: payload.recipient,
        status: 'sent',
      });
      this.logger.log(`Message sent to ${payload.recipient}`);
    } catch (error) {
      this.server.to(client.id).emit('messageStatus', {
        recipient: payload.recipient,
        status: 'failed',
        error,
      });
      this.logger.error(
        `Failed to send message to ${payload.recipient}: ${error.message}`,
      );
    }
  }

  @OnEvent('whatsapp.qr')
  handleQrCode(qr: string) {
    this.server.emit('qr', qr);
    this.logger.log('QR code sent to WhatsApp clients');
  }
}
