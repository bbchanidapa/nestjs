import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomBytes, scryptSync } from 'node:crypto';
import { DataSource } from 'typeorm';
import { DB_SCHEMA } from '../database/database.constants.js';
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

@Injectable()
export class AuthService {
  private readonly usersTable: string;
  private schemaPrepared = false;

  constructor(private readonly dataSource: DataSource) {
    this.usersTable = `${this.quoteIdentifier(DB_SCHEMA)}.${this.quoteIdentifier('users')}`;
  }

  private quoteIdentifier(identifier: string): string {
    const isValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier);
    if (!isValid) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier}"`;
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

  private hashPassword(plainPassword: string): string {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(plainPassword, salt, 64).toString('hex');
    return `${salt}:${hash}`;
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
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON ${this.usersTable} (LOWER(email))`,
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
      const rows = Array.isArray(result) ? (result as SignupResult[]) : [];

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
}
