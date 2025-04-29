// order-confirmation.processor.ts
import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { OrderService } from './order.service';

@Processor('order-confirmation')
export class OrderConfirmationProcessor {
  constructor(private readonly orderService: OrderService) {}

  @Process('check-confirmation')
  async handleCheck(job: Job<{ orderId: string }>) {
    await this.orderService.checkConfirmationTimeout(job.data.orderId);
  }
}
