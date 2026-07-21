import { Module } from '@nestjs/common';
import { LaborEngineService } from './labor-engine.service';

@Module({
  providers: [LaborEngineService],
  exports: [LaborEngineService],
})
export class LaborEngineModule {}
