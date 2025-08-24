import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule, Timeout } from '@nestjs/schedule';
import { GenerateArticleService } from './services/generate-article.service';

@Module({
  imports: [ConfigModule.forRoot(), CqrsModule, ScheduleModule.forRoot()],
  providers: [GenerateArticleService],
})
export class AppModule {
  constructor(private readonly ai: GenerateArticleService) {}

  @Timeout(2000)
  async execute() {
    await this.ai.generate('tecnologias emergentes');
  }
}
