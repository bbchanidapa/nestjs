import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DB_SCHEMA } from '../database/database.constants';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { UpdateProductDto } from './dto/update-product.dto';

type InventoryRow = Record<string, unknown>;

@Injectable()
export class InventoryService {
  private readonly productsTable: string;
  private readonly warehousesTable: string;
  private readonly balancesTable: string;
  private readonly movementsTable: string;
  private schemaPrepared = false;

  constructor(private readonly dataSource: DataSource) {
    const schema = this.quoteIdentifier(DB_SCHEMA);
    this.productsTable = `${schema}.${this.quoteIdentifier('inventory_products')}`;
    this.warehousesTable = `${schema}.${this.quoteIdentifier('inventory_warehouses')}`;
    this.balancesTable = `${schema}.${this.quoteIdentifier('inventory_balances')}`;
    this.movementsTable = `${schema}.${this.quoteIdentifier('inventory_movements')}`;
  }

  private quoteIdentifier(identifier: string): string {
    const isValid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier);
    if (!isValid) {
      throw new Error(`Invalid SQL identifier: ${identifier}`);
    }

    return `"${identifier}"`;
  }

  private extractRows(result: unknown): InventoryRow[] {
    if (Array.isArray(result)) {
      if (Array.isArray(result[0])) {
        return result[0] as InventoryRow[];
      }

      return result as InventoryRow[];
    }

    if (typeof result === 'object' && result !== null && 'rows' in result) {
      const rows = (result as { rows?: unknown }).rows;
      if (Array.isArray(rows)) {
        return rows as InventoryRow[];
      }
    }

    return [];
  }

  private async runQuery(
    query: string,
    params: unknown[],
    manager?: EntityManager,
  ): Promise<InventoryRow[]> {
    const result: unknown = manager
      ? await manager.query(query, params)
      : await this.dataSource.query(query, params);
    return this.extractRows(result);
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

  private normalizeNonEmptyText(
    value: unknown,
    fieldName: string,
    upperCase = false,
  ): string {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const normalized = value.trim();
    return upperCase ? normalized.toUpperCase() : normalized;
  }

  private normalizeOptionalText(value: unknown): string | null {
    if (value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('Optional fields must be a string');
    }

    const normalized = value.trim();
    return normalized === '' ? null : normalized;
  }

  private normalizeOptionalImageUrl(value: unknown): string | null {
    if (value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('imageUrl must be a string');
    }

    const normalized = value.trim();
    if (normalized === '') {
      return null;
    }

    const hasValidProtocol =
      normalized.startsWith('http://') || normalized.startsWith('https://');
    if (!hasValidProtocol) {
      throw new BadRequestException(
        'imageUrl must start with http:// or https://',
      );
    }

    return normalized;
  }

  private normalizePrice(value: unknown, fieldName = 'price'): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new BadRequestException(
        `${fieldName} must be a non-negative number`,
      );
    }

    return Math.round(numeric * 100) / 100;
  }

  private parsePositiveQuantity(value: unknown): number {
    const quantity = Number(value);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    return quantity;
  }

  private toNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  }

  private parseListLimit(limit?: string): number {
    if (limit === undefined) {
      return 100;
    }

    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 500',
      );
    }

    return parsed;
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaPrepared) {
      return;
    }

    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${this.productsTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        image_url TEXT NULL,
        price NUMERIC(12,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.productsTable} ADD COLUMN IF NOT EXISTS image_url TEXT`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.productsTable} ADD COLUMN IF NOT EXISTS price NUMERIC(12,2) NOT NULL DEFAULT 0`,
    );

    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${this.warehousesTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );

    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${this.balancesTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES ${this.productsTable}(id) ON DELETE CASCADE,
        warehouse_id UUID NOT NULL REFERENCES ${this.warehousesTable}(id) ON DELETE CASCADE,
        quantity BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(product_id, warehouse_id)
      )`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.balancesTable}
       ALTER COLUMN quantity TYPE BIGINT
       USING ROUND(quantity)::BIGINT`,
    );

    await this.dataSource.query(
      `CREATE TABLE IF NOT EXISTS ${this.movementsTable} (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES ${this.productsTable}(id),
        warehouse_id UUID NOT NULL REFERENCES ${this.warehousesTable}(id),
        movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIVE', 'ISSUE')),
        quantity BIGINT NOT NULL CHECK (quantity > 0),
        before_qty BIGINT NOT NULL,
        after_qty BIGINT NOT NULL,
        reference_no TEXT NULL,
        note TEXT NULL,
        created_by UUID NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.movementsTable}
       ALTER COLUMN quantity TYPE BIGINT
       USING ROUND(quantity)::BIGINT`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.movementsTable}
       ALTER COLUMN before_qty TYPE BIGINT
       USING ROUND(before_qty)::BIGINT`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${this.movementsTable}
       ALTER COLUMN after_qty TYPE BIGINT
       USING ROUND(after_qty)::BIGINT`,
    );

    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS inventory_balances_product_idx ON ${this.balancesTable} (product_id)`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS inventory_balances_warehouse_idx ON ${this.balancesTable} (warehouse_id)`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON ${this.movementsTable} (product_id)`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS inventory_movements_warehouse_idx ON ${this.movementsTable} (warehouse_id)`,
    );
    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS inventory_movements_created_at_idx ON ${this.movementsTable} (created_at DESC)`,
    );

    this.schemaPrepared = true;
  }

  async createProduct(body: CreateProductDto): Promise<InventoryRow> {
    await this.ensureSchema();
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'sku',
      'name',
      'unit',
      'imageUrl',
      'price',
    ]);

    const sku = this.normalizeNonEmptyText(body.sku, 'sku', true);
    const name = this.normalizeNonEmptyText(body.name, 'name');
    const unit =
      body.unit === undefined
        ? 'pcs'
        : this.normalizeNonEmptyText(body.unit, 'unit');
    const imageUrl = this.normalizeOptionalImageUrl(body.imageUrl);
    const price =
      body.price === undefined ? 0 : this.normalizePrice(body.price);

    try {
      const rows = await this.runQuery(
        `INSERT INTO ${this.productsTable} ("sku", "name", "unit", "image_url", "price")
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [sku, name, unit, imageUrl, price],
      );
      const created = rows[0];
      if (!created) {
        throw new BadRequestException('Unable to create product');
      }

      return created;
    } catch (error) {
      const dbCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (dbCode === '23505') {
        throw new ConflictException(`Product SKU "${sku}" already exists`);
      }

      throw error;
    }
  }

  async listProducts(): Promise<InventoryRow[]> {
    await this.ensureSchema();
    return this.runQuery(
      `SELECT
         p.id,
         p.sku,
         p.name,
         p.unit,
         p.image_url,
         p.price,
         p.is_active,
         p.created_at,
         p.updated_at,
         COALESCE((
           SELECT SUM(b.quantity)::BIGINT
           FROM ${this.balancesTable} b
           WHERE b.product_id = p.id
         ), 0)::BIGINT AS quantity
       FROM ${this.productsTable} p
       ORDER BY p.created_at DESC`,
      [],
    );
  }

  async updateProductById(
    id: string,
    body: UpdateProductDto,
  ): Promise<InventoryRow> {
    await this.ensureSchema();
    const productId = this.normalizeNonEmptyText(id, 'id');
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'sku',
      'name',
      'unit',
      'imageUrl',
      'price',
      'isActive',
    ]);

    const sets: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    if (body.sku !== undefined) {
      sets.push(`"sku" = $${index}`);
      values.push(this.normalizeNonEmptyText(body.sku, 'sku', true));
      index += 1;
    }

    if (body.name !== undefined) {
      sets.push(`"name" = $${index}`);
      values.push(this.normalizeNonEmptyText(body.name, 'name'));
      index += 1;
    }

    if (body.unit !== undefined) {
      sets.push(`"unit" = $${index}`);
      values.push(this.normalizeNonEmptyText(body.unit, 'unit'));
      index += 1;
    }

    if (body.imageUrl !== undefined) {
      sets.push(`"image_url" = $${index}`);
      values.push(this.normalizeOptionalImageUrl(body.imageUrl));
      index += 1;
    }

    if (body.price !== undefined) {
      sets.push(`"price" = $${index}`);
      values.push(this.normalizePrice(body.price));
      index += 1;
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        throw new BadRequestException('isActive must be a boolean');
      }
      sets.push(`"is_active" = $${index}`);
      values.push(body.isActive);
      index += 1;
    }

    if (sets.length === 0) {
      throw new BadRequestException(
        'At least one field is required: sku, name, unit, imageUrl, price, isActive',
      );
    }

    sets.push('"updated_at" = NOW()');
    values.push(productId);
    const idPosition = values.length;

    try {
      const rows = await this.runQuery(
        `UPDATE ${this.productsTable}
         SET ${sets.join(', ')}
         WHERE id = $${idPosition}
         RETURNING *`,
        values,
      );

      const updated = rows[0];
      if (!updated) {
        throw new NotFoundException(`Product with id "${productId}" not found`);
      }

      return updated;
    } catch (error) {
      const dbCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (dbCode === '23505') {
        throw new ConflictException(
          `Product SKU "${String(body.sku ?? '')
            .trim()
            .toUpperCase()}" already exists`,
        );
      }

      throw error;
    }
  }

  async deleteProductById(
    id: string,
  ): Promise<{ message: string; id: string }> {
    await this.ensureSchema();
    const productId = this.normalizeNonEmptyText(id, 'id');

    try {
      const rows = await this.runQuery(
        `DELETE FROM ${this.productsTable}
         WHERE id = $1
         RETURNING id`,
        [productId],
      );

      if (!rows[0]) {
        throw new NotFoundException(`Product with id "${productId}" not found`);
      }

      return {
        message: 'Product deleted successfully',
        id: productId,
      };
    } catch (error) {
      const dbCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (dbCode === '23503') {
        throw new ConflictException(
          'Cannot delete product because it is referenced by movement history',
        );
      }

      throw error;
    }
  }

  async createWarehouse(body: CreateWarehouseDto): Promise<InventoryRow> {
    await this.ensureSchema();
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'code',
      'name',
    ]);

    const code = this.normalizeNonEmptyText(body.code, 'code', true);
    const name = this.normalizeNonEmptyText(body.name, 'name');

    try {
      const rows = await this.runQuery(
        `INSERT INTO ${this.warehousesTable} ("code", "name")
         VALUES ($1, $2)
         RETURNING *`,
        [code, name],
      );
      const created = rows[0];
      if (!created) {
        throw new BadRequestException('Unable to create warehouse');
      }

      return created;
    } catch (error) {
      const dbCode =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code: unknown }).code === 'string'
          ? (error as { code: string }).code
          : '';

      if (dbCode === '23505') {
        throw new ConflictException(`Warehouse code "${code}" already exists`);
      }

      throw error;
    }
  }

  async listWarehouses(): Promise<InventoryRow[]> {
    await this.ensureSchema();
    return this.runQuery(
      `SELECT id, code, name, is_active, created_at, updated_at
       FROM ${this.warehousesTable}
       ORDER BY created_at DESC`,
      [],
    );
  }

  async getStock(
    productId?: string,
    warehouseId?: string,
  ): Promise<InventoryRow[]> {
    await this.ensureSchema();

    const filters: string[] = [];
    const values: unknown[] = [];

    if (productId) {
      values.push(productId);
      filters.push(`b.product_id = $${values.length}`);
    }

    if (warehouseId) {
      values.push(warehouseId);
      filters.push(`b.warehouse_id = $${values.length}`);
    }

    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
    return this.runQuery(
      `SELECT
         b.product_id,
         p.sku,
         p.name AS product_name,
         p.unit,
         b.warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         b.quantity::BIGINT AS quantity,
         b.updated_at
       FROM ${this.balancesTable} b
       INNER JOIN ${this.productsTable} p ON p.id = b.product_id
       INNER JOIN ${this.warehousesTable} w ON w.id = b.warehouse_id
       ${whereClause}
       ORDER BY p.sku ASC, w.code ASC`,
      values,
    );
  }

  private async validateMasterDataExists(
    manager: EntityManager,
    productIdentifier: string,
    warehouseIdentifier: string,
  ): Promise<{ productId: string; warehouseId: string }> {
    const productId = await this.resolveProductId(manager, productIdentifier);
    const warehouseId = await this.resolveWarehouseId(
      manager,
      warehouseIdentifier,
    );
    return { productId, warehouseId };
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  }

  private async resolveProductId(
    manager: EntityManager,
    productIdentifier: string,
  ): Promise<string> {
    const identifier = productIdentifier.trim();
    const rows = this.isUuid(identifier)
      ? await this.runQuery(
          `SELECT id FROM ${this.productsTable} WHERE id = $1 LIMIT 1`,
          [identifier],
          manager,
        )
      : await this.runQuery(
          `SELECT id FROM ${this.productsTable} WHERE UPPER(sku) = UPPER($1) LIMIT 1`,
          [identifier],
          manager,
        );

    const product = rows[0] as { id?: string } | undefined;
    if (!product?.id) {
      throw new NotFoundException(
        `Product "${productIdentifier}" was not found (use product id or sku)`,
      );
    }

    return product.id;
  }

  private async resolveWarehouseId(
    manager: EntityManager,
    warehouseIdentifier: string,
  ): Promise<string> {
    const identifier = warehouseIdentifier.trim();
    const rows = this.isUuid(identifier)
      ? await this.runQuery(
          `SELECT id FROM ${this.warehousesTable} WHERE id = $1 LIMIT 1`,
          [identifier],
          manager,
        )
      : await this.runQuery(
          `SELECT id FROM ${this.warehousesTable} WHERE UPPER(code) = UPPER($1) LIMIT 1`,
          [identifier],
          manager,
        );

    const warehouse = rows[0] as { id?: string } | undefined;
    if (!warehouse?.id) {
      throw new NotFoundException(
        `Warehouse "${warehouseIdentifier}" was not found (use warehouse id or code)`,
      );
    }

    return warehouse.id;
  }

  private async applyMovement(
    body: StockMovementDto,
    movementType: 'RECEIVE' | 'ISSUE',
    createdBy: string | null,
  ): Promise<InventoryRow> {
    await this.ensureSchema();
    this.validateAllowedFields(body as unknown as Record<string, unknown>, [
      'productId',
      'warehouseId',
      'quantity',
      'referenceNo',
      'note',
    ]);

    const productIdentifier = this.normalizeNonEmptyText(
      body.productId,
      'productId',
    );
    const warehouseIdentifier = this.normalizeNonEmptyText(
      body.warehouseId,
      'warehouseId',
    );
    const quantity = this.parsePositiveQuantity(body.quantity);
    const referenceNo = this.normalizeOptionalText(body.referenceNo);
    const note = this.normalizeOptionalText(body.note);

    return this.dataSource.transaction(async (manager) => {
      const { productId, warehouseId } = await this.validateMasterDataExists(
        manager,
        productIdentifier,
        warehouseIdentifier,
      );

      await this.runQuery(
        `INSERT INTO ${this.balancesTable} ("product_id", "warehouse_id", "quantity")
         VALUES ($1, $2, 0)
         ON CONFLICT ("product_id", "warehouse_id") DO NOTHING`,
        [productId, warehouseId],
        manager,
      );

      const balanceRows = await this.runQuery(
        `SELECT id, quantity
         FROM ${this.balancesTable}
         WHERE product_id = $1 AND warehouse_id = $2
         FOR UPDATE`,
        [productId, warehouseId],
        manager,
      );
      const balance = balanceRows[0];

      if (!balance) {
        throw new BadRequestException('Unable to lock stock balance');
      }

      const beforeQty = this.toNumber(balance.quantity);
      if (movementType === 'ISSUE' && beforeQty < quantity) {
        throw new BadRequestException(
          `Insufficient stock: available ${beforeQty}, requested ${quantity}`,
        );
      }

      const afterQty =
        movementType === 'RECEIVE'
          ? beforeQty + quantity
          : beforeQty - quantity;

      await this.runQuery(
        `UPDATE ${this.balancesTable}
         SET quantity = $3, updated_at = NOW()
         WHERE product_id = $1 AND warehouse_id = $2`,
        [productId, warehouseId, afterQty],
        manager,
      );

      const movementRows = await this.runQuery(
        `INSERT INTO ${this.movementsTable} (
           "product_id",
           "warehouse_id",
           "movement_type",
           "quantity",
           "before_qty",
           "after_qty",
           "reference_no",
           "note",
           "created_by"
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          productId,
          warehouseId,
          movementType,
          quantity,
          beforeQty,
          afterQty,
          referenceNo,
          note,
          createdBy,
        ],
        manager,
      );

      const movement = movementRows[0];
      if (!movement) {
        throw new BadRequestException('Unable to record movement');
      }

      return movement;
    });
  }

  async receiveStock(
    body: StockMovementDto,
    createdBy: string | null,
  ): Promise<InventoryRow> {
    return this.applyMovement(body, 'RECEIVE', createdBy);
  }

  async issueStock(
    body: StockMovementDto,
    createdBy: string | null,
  ): Promise<InventoryRow> {
    return this.applyMovement(body, 'ISSUE', createdBy);
  }

  async listMovements(
    productId?: string,
    warehouseId?: string,
    limit?: string,
  ): Promise<InventoryRow[]> {
    await this.ensureSchema();

    const filters: string[] = [];
    const values: unknown[] = [];

    if (productId) {
      values.push(productId);
      filters.push(`m.product_id = $${values.length}`);
    }

    if (warehouseId) {
      values.push(warehouseId);
      filters.push(`m.warehouse_id = $${values.length}`);
    }

    const parsedLimit = this.parseListLimit(limit);
    values.push(parsedLimit);
    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    return this.runQuery(
      `SELECT
         m.id,
         m.product_id,
         p.sku,
         p.name AS product_name,
         m.warehouse_id,
         w.code AS warehouse_code,
         w.name AS warehouse_name,
         m.movement_type,
         m.quantity::BIGINT AS quantity,
         m.before_qty::BIGINT AS before_qty,
         m.after_qty::BIGINT AS after_qty,
         m.reference_no,
         m.note,
         m.created_by,
         m.created_at
       FROM ${this.movementsTable} m
       INNER JOIN ${this.productsTable} p ON p.id = m.product_id
       INNER JOIN ${this.warehousesTable} w ON w.id = m.warehouse_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${values.length}`,
      values,
    );
  }
}
