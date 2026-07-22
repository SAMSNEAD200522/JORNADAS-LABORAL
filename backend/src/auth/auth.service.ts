import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { config } from '../config/env';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Credenciales inválidas',
        code: 'CREDENCIALES_INVALIDAS',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Usuario inactivo',
        code: 'USUARIO_INACTIVO',
      });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordValid) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Credenciales inválidas',
        code: 'CREDENCIALES_INVALIDAS',
      });
    }

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.jwt.expiresIn,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refresh(refreshToken: string) {
    if (await this.isTokenBlacklisted(refreshToken)) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Token de refresco inválido',
        code: 'TOKEN_INVALIDO',
      });
    }

    try {
      const payload = this.jwtService.verify(refreshToken);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException({
          statusCode: 401,
          message: 'Usuario no encontrado o inactivo',
          code: 'USUARIO_INVALIDO',
        });
      }

      await this.blacklistToken(refreshToken);

      const newPayload = { sub: user.id, email: user.email, role: user.role };
      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
        expiresIn: '7d',
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: config.jwt.expiresIn,
        tokenType: 'Bearer',
      };
    } catch {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Token de refresco inválido o expirado',
        code: 'TOKEN_INVALIDO',
      });
    }
  }

  async logout(token: string) {
    if (!token) {
      return { message: 'Sesión cerrada exitosamente' };
    }
    try {
      this.jwtService.verify(token);
    } catch {
      return { message: 'Sesión cerrada exitosamente' };
    }
    await this.blacklistToken(token);
    return { message: 'Sesión cerrada exitosamente' };
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const found = await this.prisma.blacklistedToken.findUnique({
      where: { token },
      select: { id: true },
    });
    return found !== null;
  }

  private async blacklistToken(token: string): Promise<void> {
    const existing = await this.prisma.blacklistedToken.findUnique({
      where: { token },
      select: { id: true },
    });
    if (existing) return;

    let expiresAt: Date;
    try {
      const payload = this.jwtService.verify(token);
      expiresAt = new Date(payload.exp * 1000);
    } catch {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await this.prisma.blacklistedToken.create({
      data: { token, expiresAt },
    });
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.blacklistedToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
