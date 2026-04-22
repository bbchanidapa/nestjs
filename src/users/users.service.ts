import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { ReplaceUserDto } from './dto/replace-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

export type UserRow = Record<string, unknown>;

@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

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

  async findAll(): Promise<UserRow[]> {
    return this.runQuery('SELECT * FROM "users"', []);
  }

  async createUser(body: CreateUserDto): Promise<UserRow> {
    this.validateFullNamePayload(body, 'POST');

    const rows = await this.runQuery(
      'INSERT INTO "users" ("firstname", "lastname") VALUES ($1, $2) RETURNING *',
      [body.firstname, body.lastname],
    );
    const createdUser = rows[0];

    if (!createdUser) {
      throw new BadRequestException('Unable to create user');
    }

    return createdUser;
  }

  async findById(id: string): Promise<UserRow> {
    const rows = await this.runQuery(
      'SELECT * FROM "users" WHERE id = $1 LIMIT 1',
      [id],
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async updateById(id: string, body: UpdateUserDto): Promise<UserRow> {
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

    if (sets.length === 0) {
      throw new BadRequestException(
        'At least one field is required: firstname, lastname',
      );
    }

    values.push(id);
    const idParamPosition = values.length;
    const updateQuery = `UPDATE "users" SET ${sets.join(', ')} WHERE id = $${idParamPosition} RETURNING *`;

    const rows = await this.runQuery(updateQuery, values);
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async replaceUserById(id: string, body: ReplaceUserDto): Promise<UserRow> {
    this.validateFullNamePayload(body, 'PUT');

    const rows = await this.runQuery(
      'UPDATE "users" SET "firstname" = $1, "lastname" = $2 WHERE id = $3 RETURNING *',
      [body.firstname, body.lastname, id],
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }

  async deleteById(id: string): Promise<UserRow> {
    const rows = await this.runQuery(
      'DELETE FROM "users" WHERE id = $1 RETURNING *',
      [id],
    );
    return this.getFirstRowOrThrowNotFound(rows, id);
  }
}
