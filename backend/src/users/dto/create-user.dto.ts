import { IsEmail, IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateUserDto {
  @ApiProperty({ description: 'Correo electrónico del usuario', example: 'nuevo@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Nombre completo del usuario', example: 'Juan Pérez' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Contraseña (mínimo 6 caracteres)', example: 'miContraseña123' })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  password: string;

  @ApiProperty({ enum: Role, description: 'Rol del usuario', example: Role.GESTION_HUMANA })
  @IsEnum(Role)
  role: Role;
}
