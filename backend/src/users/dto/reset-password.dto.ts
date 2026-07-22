import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Nueva contraseña (mínimo 6 caracteres)',
    example: 'nuevaContraseña123',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(100)
  newPassword: string;
}
