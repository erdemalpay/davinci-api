import { NestFactory } from '@nestjs/core';
import { AppModule } from 'src/app.module';
import { MailSeeder } from 'src/modules/mail/mail.seeder';

async function seedMailTemplates() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const mailSeeder = app.get(MailSeeder);

  console.log('🌱 Starting mail template seeding...');

  try {
    await mailSeeder.seedTemplates();
    console.log('✅ Mail templates seeded successfully!');
  } catch (error) {
    console.error('❌ Failed to seed mail templates:', error);
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

seedMailTemplates();
