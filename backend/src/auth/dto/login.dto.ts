import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: 'Correo electrónico del usuario',
    example: 'admin@empresa.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Contraseña', example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string;
}
