import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DB_SCHEMA } from '../database/database.constants';
import { CreateUserDto } from './dto/create-user.dto';
import { ReplaceUserDto } from './dto/replace-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type UserRow = Record<string, unknown>;

@Injectable()
export class UsersService {
  private readonly usersTable: string;

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

  private extractRows(result: unknown): UserRow[] {
    if (Array.isArray(result)) {
      if (Array.isArray(result[0])) {
        return result[0] as UserRow[];
      }

      return result as UserRow[];
    }

    if (typeof result === 'object' && result !== null && 'rows' in result) {
      const rows = (result as { rows?: unknown }).rows;

      if (Array.isArray(rows)) {
        return rows as UserRow[];
      }
    }

    return [];
  }

  private async runQuery(query: string, params: unknown[]): Promise<UserRow[]> {
    const result: unknown = await this.dataSource.query(query, params);
    return this.extractRows(result);
  }

  private getFirstRowOrThrowNotFound(rows: UserRow[], id: string): UserRow {
    const user = rows[0];

    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`);
    }

    return user;
  }

  private validateFullNamePayload(
    payload: CreateUserDto | ReplaceUserDto,
    method: 'POST' | 'PUT',
  ): void {
    if (
      typeof payload.firstname !== 'string' ||
      typeof payload.lastname !== 'string'
    ) {
      throw new BadRequestException(
        `Both firstname and lastname are required for ${method}`,
      );
    }
  }

  private validateOptionalRolePayload(
    payload: { role?: unknown },
    method: 'POST' | 'PATCH' | 'PUT',
  ): void {
    if (payload.role !== undefined && typeof payload.role !== 'string') {
      throw new BadRequestException(`Role must be a string for ${method}`);
    }
  }

  private validateAllowedFields(
    payload: Record<string, unknown>,
    allowedFields: string[],
  ): void {
    const allowedSet = new Set(allowedFields);
    const invalidField = Object.keys(payload).find(
      (key) => !allowedSet.has(key),
    );

    if (invalidField) {
      throw new BadRequestException(`Field "${invalidField}" does not exist`);
    }
  }

  async findAll(): Promise<UserRow[]> {
    return this.runQuery(`SELECT * FROM ${this.usersTable}`, []);
  }

  async createUser(body: CreateUserDto): Promise<UserRow> {
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'firstname',
      'lastname',
      'role',
    ]);
    this.validateFullNamePayload(body, 'POST');
    this.validateOptionalRolePayload(body, 'POST');

    const columns = ['"firstname"', '"lastname"'];
    const values: unknown[] = [body.firstname, body.lastname];

    if (typeof body.role === 'string') {
      columns.push('"role"');
      values.push(body.role);
    }

    const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

    const rows = await this.runQuery(
      `INSERT INTO ${this.usersTable} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values,
    );
    const createdUser = rows[0];

    if (!createdUser) {
      throw new BadRequestException('Unable to create user');
    }

    return createdUser;
  }

  async findById(id: string): Promise<UserRow> {
    const rows = await this.runQuery(
      `SELECT * FROM ${this.usersTable} WHERE id = $1 LIMIT 1`,
      [id],
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async updateById(id: string, body: UpdateUserDto): Promise<UserRow> {
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'firstname',
      'lastname',
      'role',
    ]);
    this.validateOptionalRolePayload(body, 'PATCH');

    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (typeof body.firstname === 'string') {
      sets.push(`"firstname" = $${index}`);
      values.push(body.firstname);
      index += 1;
    }

    if (typeof body.lastname === 'string') {
      sets.push(`"lastname" = $${index}`);
      values.push(body.lastname);
      index += 1;
    }

    if (typeof body.role === 'string') {
      sets.push(`"role" = $${index}`);
      values.push(body.role);
      index += 1;
    }

    if (sets.length === 0) {
      throw new BadRequestException(
        'At least one field is required: firstname, lastname, role',
      );
    }

    values.push(id);
    const idParamPosition = values.length;
    const updateQuery = `UPDATE ${this.usersTable} SET ${sets.join(', ')} WHERE id = $${idParamPosition} RETURNING *`;

    const rows = await this.runQuery(updateQuery, values);
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async replaceUserById(id: string, body: ReplaceUserDto): Promise<UserRow> {
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'firstname',
      'lastname',
      'role',
    ]);
    this.validateFullNamePayload(body, 'PUT');
    this.validateOptionalRolePayload(body, 'PUT');

    const sets = ['"firstname" = $1', '"lastname" = $2'];
    const values: unknown[] = [body.firstname, body.lastname];
    let idParamPosition = 3;

    if (typeof body.role === 'string') {
      sets.push('"role" = $3');
      values.push(body.role);
      idParamPosition = 4;
    }

    values.push(id);

    const rows = await this.runQuery(
      `UPDATE ${this.usersTable} SET ${sets.join(', ')} WHERE id = $${idParamPosition} RETURNING *`,
      values,
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async deleteById(id: string): Promise<UserRow> {
    const rows = await this.runQuery(
      `DELETE FROM ${this.usersTable} WHERE id = $1 RETURNING *`,
      [id],
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }
}
