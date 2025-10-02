import { Injectable, ForbiddenException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    await this.ensureTurnstileValidated(dto.turnstileToken);

    const user = await this.usersRepo.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.displayName ?? user.email,
      profile: user.profile ?? null,
      responsibilities: Array.isArray(user.responsibilities) ? user.responsibilities : []
    };
    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.displayName ?? user.email,
        profile: user.profile ?? null,
        responsibilities: Array.isArray(user.responsibilities) ? user.responsibilities : []
      }
    };
  }

  private async ensureTurnstileValidated(token: string) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
      throw new InternalServerErrorException('Turnstile não configurado');
    }
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });

    if (!response.ok) {
      throw new ForbiddenException('Falha na verificação anti-robô');
    }

    const result = await response.json();
    if (!result.success) {
      throw new ForbiddenException('Falha na verificação anti-robô');
    }
  }
}