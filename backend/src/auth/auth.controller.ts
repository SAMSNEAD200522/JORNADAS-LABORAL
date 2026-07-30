import { Controller, Post, Body, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión y obtener token JWT' })
  @ApiOkResponse({
    description: 'Login exitoso, retorna access token y refresh token',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refrescar access token usando refresh token' })
  @ApiOkResponse({ description: 'Tokens renovados' })
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @ApiBearerAuth()
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Post('logout')
  @ApiOperation({ summary: 'Cerrar sesión y revocar token actual' })
  @ApiOkResponse({ description: 'Sesión cerrada' })
  logout(@Body('token') token: string) {
    return this.authService.logout(token);
  }
}
