import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { DataSource } from 'typeorm';
import { DB_SCHEMA } from '../database/database.constants.js';
import { LoginDto } from './dto/login.dto.js';
import { SignupDto } from './dto/signup.dto.js';

type SignupResult = {
  id: string;
  email: string;
  firstname: string;
  lastname: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type LoginResult = Omit<SignupResult, 'created_at' | 'updated_at'> & {
  last_login_at: Date | null;
};

type UserAuthRow = LoginResult & { password_hash: string };
type LoginResponse = {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: LoginResult;
};
type AccessTokenRow = {
  user_id: string;
  expires_at: Date;
};

@Injectable()
export class AuthService {
  private readonly usersTable: string;
  private readonly accessTokensTable: string;
  private schemaPrepared = false;
  private readonly accessTokenTtlSeconds = 120;

  constructor(
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
  ) {
    const schema = this.quoteIdentifier(DB_SCHEMA);
    this.usersTable = `${schema}.${this.quoteIdentifier('users')}`;
    this.accessTokensTable = `${schema}.${this.quoteIdentifier('auth_access_tokens')}`;
  }

  private quoteIdentifier(identifier: string): string {
    const isValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier);
    if (!isValid) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier}"`;
  }

  private extractRows<T>(result: unknown): T[] {
    if (Array.isArray(result)) {
      if (Array.isArray(result[0])) {
        return result[0] as T[];
      }

      return result as T[];
    }

    if (
      typeof result === 'object' &&
      result !== null &&
      'rows' in result &&
      Array.isArray((result as { rows?: unknown }).rows)
    ) {
      return (result as { rows: T[] }).rows;
    }

    return [];
  }

  private validateAllowedFields(payload: Record<string, unknown>): void {
    const allowedFields = new Set([
      'email',
      'password',
      'firstname',
      'lastname',
      'role',
    ]);
    const invalidField = Object.keys(payload).find(
      (key) => !allowedFields.has(key),
    );

    if (invalidField) {
      throw new BadRequestException(`Field "${invalidField}" does not exist`);
    }
  }

  private validatePayload(body: SignupDto): void {
    this.validateAllowedFields(body as unknown as Record<string, unknown>);

    if (typeof body.email !== 'string' || body.email.trim() === '') {
      throw new BadRequestException('Email is required');
    }

    if (typeof body.password !== 'string' || body.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    if (typeof body.firstname !== 'string' || body.firstname.trim() === '') {
      throw new BadRequestException('Firstname is required');
    }

    if (typeof body.lastname !== 'string' || body.lastname.trim() === '') {
      throw new BadRequestException('Lastname is required');
    }

    if (body.role !== undefined && typeof body.role !== 'string') {
      throw new BadRequestException('Role must be a string');
    }
  }

  private validateLoginPayload(body: LoginDto): void {
    const allowedFields = new Set(['email', 'password']);
    const invalidField = Object.keys(
      body as unknown as Record<string, unknown>,
    ).find((key) => !allowedFields.has(key));

    if (invalidField) {
      throw new BadRequestException(`Field "${invalidField}" does not exist`);
    }

    if (typeof body.email !== 'string' || body.email.trim() === '') {
      throw new BadRequestException('Email is required');
    }

    if (typeof body.password !== 'string' || body.password === '') {
      throw new BadRequestException('Password is required');
    }
  }

  private hashPassword(plainPassword: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plainPassword, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private hashAccessToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private verifyPassword(
    plainPassword: string,
    storedPasswordHash: string,
  ): boolean {
    const [salt, storedHash] = storedPasswordHash.split(':');
    if (!salt || !storedHash) {
      return false;
    }

    const incomingHash = scryptSync(plainPassword, salt, 64).toString('hex');
    return timingSafeEqual(Buffer.from(incomingHash), Buffer.from(storedHash));
  }

  private async ensureSignupSchema(): Promise<void> {
    if (this.schemaPrepared) {
      return;
    }

    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS email TEXT`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS password_hash TEXT`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.usersTable} ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
    );
    await this.dataSource.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON ${this.usersTable} (LOWER(email))`,
    );
    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${this.accessTokensTable} (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id UUID NOT NULL REFERENCES ${this.usersTable}(id) ON DELETE CASCADE,
         token_hash TEXT NOT NULL UNIQUE,
         expires_at TIMESTAMPTZ NOT NULL,
         revoked_at TIMESTAMPTZ NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
       )`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS auth_access_tokens_user_id_idx ON ${this.accessTokensTable} (user_id)`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS auth_access_tokens_expires_at_idx ON ${this.accessTokensTable} (expires_at)`,
    );

    this.schemaPrepared = true;
  }

  async signup(body: SignupDto): Promise<SignupResult> {
    this.validatePayload(body);
    await this.ensureSignupSchema();

    const email = body.email.trim().toLowerCase();
    const firstname = body.firstname.trim();
    const lastname = body.lastname.trim();
    const role = body.role?.trim() || 'user';
    const passwordHash = this.hashPassword(body.password);

    try {
      const result: unknown = await this.dataSource.query(
        `INSERT INTO ${this.usersTable}
          ("email", "password_hash", "firstname", "lastname", "role", "is_active")
         VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING "id", "email", "firstname", "lastname", "role", "is_active", "created_at", "updated_at"`,
        [email, passwordHash, firstname, lastname, role],
      );
      const rows = this.extractRows<SignupResult>(result);

      const createdUser = rows[0];
      if (!createdUser) {
        throw new BadRequestException('Unable to create account');
      }

      return createdUser;
    } catch (error) {
      const dbCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (dbCode === '23505') {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  async login(body: LoginDto): Promise<LoginResponse> {
    this.validateLoginPayload(body);
    await this.ensureSignupSchema();

    const email = body.email.trim().toLowerCase();
    const result: unknown = await this.dataSource.query(
      `SELECT "id", "email", "password_hash", "firstname", "lastname", "role", "is_active", "last_login_at"
       FROM ${this.usersTable}
       WHERE LOWER("email") = $1
       LIMIT 1`,
      [email],
    );
    const rows = this.extractRows<UserAuthRow>(result);
    const user = rows[0];
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User is inactive');
    }

    if (!this.verifyPassword(body.password, user.password_hash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const updateResult: unknown = await this.dataSource.query(
      `UPDATE ${this.usersTable}
       SET "last_login_at" = NOW(), "updated_at" = NOW()
       WHERE "id" = $1
       RETURNING "id", "email", "firstname", "lastname", "role", "is_active", "last_login_at"`,
      [user.id],
    );
    const updatedRows = this.extractRows<LoginResult>(updateResult);
    const loggedInUser = updatedRows[0];

    if (!loggedInUser) {
      throw new UnauthorizedException('Unable to complete login');
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: loggedInUser.id,
        email: loggedInUser.email,
        role: loggedInUser.role,
      },
      { expiresIn: `${this.accessTokenTtlSeconds}s` },
    );
    const tokenHash = this.hashAccessToken(accessToken);

    await this.dataSource.query(
      `INSERT INTO ${this.accessTokensTable} ("user_id", "token_hash", "expires_at")
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 second'))`,
      [loggedInUser.id, tokenHash, this.accessTokenTtlSeconds],
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.accessTokenTtlSeconds,
      user: loggedInUser,
    };
  }

  async validateAccessToken(token: string, userId: string): Promise<boolean> {
    await this.ensureSignupSchema();

    const tokenHash = this.hashAccessToken(token);
    const result: unknown = await this.dataSource.query(
      `SELECT "user_id", "expires_at"
       FROM ${this.accessTokensTable}
       WHERE "token_hash" = $1
         AND "revoked_at" IS NULL
       LIMIT 1`,
      [tokenHash],
    );
    const rows = this.extractRows<AccessTokenRow>(result);
    const tokenRow = rows[0];

    if (!tokenRow) {
      return false;
    }

    if (tokenRow.user_id !== userId) {
      return false;
    }

    if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
      return false;
    }

    return true;
  }
}
