import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as dgram from 'dgram';
import { ButtonCallService } from '../buttonCall/buttonCall.service';

@Injectable()
export class UdpService implements OnModuleInit, OnModuleDestroy {
  private udpServer: dgram.Socket;
  private deviceUdpHost: string = process.env.NODEMCU_UDP_HOST;
  private deviceUdpPort: number = parseInt(process.env.NODEMCU_UDP_PORT);
  constructor(
    private readonly buttonCallService: ButtonCallService,
  ) {
    if (!this.deviceUdpHost || !this.deviceUdpPort) {
      console.error(
        'Error: NODEMCU_UDP_HOST and/or NODEMCU_UDP_PORT are not configured properly.',
      );
    }
  }
  onModuleInit() {
    this.startUdpServer();
  }
  onModuleDestroy() {
    this.stopUdpServer();
  }
  private startUdpServer() {
    this.udpServer = dgram.createSocket('udp4'); // Using IPv4 UDP

    this.udpServer.on('message', (msg, rInfo) => {
      if(rInfo.address != this.deviceUdpHost) {
        console.log(`Rejected packet from unauthorized IP: ${rInfo.address}`);
        return;
      }
      const packet = msg.toString();
      const [packetId, location, time, code] = packet.split(';');

      // Say NODEMCU that packet is successfully received
      this.sendUdpPacket(0, parseInt(packetId));
      if (packetId && location && code) {
        console.log(rInfo.address, packetId, location, time, code);
        this.buttonCallService.handleButtonAction(parseInt(location), time, parseInt(code));
      }
    });

    this.udpServer.bind(1234, () => {
      console.log('UDP server listening on port 1234');
    });
  }
  private stopUdpServer() {
    this.udpServer.close(() => {
      console.log('UDP server stopped');
    });
  }
  sendUdpPacket(messageCode: number, message: number) {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32BE(messageCode, 0); // 0 for notifying nodemcu that the packet received, 1 for making nodemcu to send RF signals
    buffer.writeUInt32BE(message, 4);     // packetId if messageCode is 0, RF signal code as integer if messageCode is 1
    this.udpServer.send(buffer, this.deviceUdpPort, this.deviceUdpHost);
  }
}
