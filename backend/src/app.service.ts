import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private prisma: PrismaService) {}

  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        estado: 'OK',
        baseDeDatos: 'conectada',
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        estado: 'ERROR',
        baseDeDatos: 'desconectada',
        timestamp: new Date().toISOString(),
      };
    }
  }
}
