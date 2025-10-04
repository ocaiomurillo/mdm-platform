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
    const payload = new URLSearchParams({ secret, response: token });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: payload,
    });

    const result = await this.parseTurnstileResponse(response);
    if (!response.ok || !result.success) {
      const errors = result['error-codes'] ?? [];
      const errorMessage = errors.length
        ? `Falha na verificação anti-robô (${errors.join(', ')})`
        : 'Falha na verificação anti-robô';
      throw new ForbiddenException(errorMessage);
    }
  }

  private async parseTurnstileResponse(response: Response): Promise<TurnstileVerifyResponse> {
    try {
      const json = await response.json();
      if (typeof json === 'object' && json !== null) {
        const data = json as Record<string, unknown>;
        const success = data.success === true;
        const rawErrors = Array.isArray(data['error-codes']) ? data['error-codes'] : [];
        const errors = rawErrors.filter((code): code is string => typeof code === 'string' && code.length > 0);
        return { success, 'error-codes': errors.length ? errors : undefined };
      }
    } catch (error) {
      // ignore JSON parsing errors; handled by caller as unsuccessful validation
    }
    return { success: false };
  }
}

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};
