import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from './entities/user.entity';

type JwtPayload = {
  sub: string;
  email?: string;
  name?: string;
  profile?: string | null;
  responsibilities?: string[];
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'dev-secret',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      email: user.email,
      name: user.displayName ?? user.email,
      profile: user.profile ?? null,
      responsibilities: Array.isArray(user.responsibilities) ? user.responsibilities : []
    };
  }
}
