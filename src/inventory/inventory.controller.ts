import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthTokenGuard } from '../auth/auth-token.guard.js';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { StockMovementDto } from './dto/stock-movement.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InventoryService } from './inventory.service.js';

type AuthenticatedRequest = Request & {
  user?: { sub?: string };
};

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @UseGuards(AuthTokenGuard)
  @Post('products')
  createProduct(@Body() body: CreateProductDto) {
    return this.inventoryService.createProduct(body);
  }

  @Get('products')
  listProducts() {
    return this.inventoryService.listProducts();
  }

  @UseGuards(AuthTokenGuard)
  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() body: UpdateProductDto) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.inventoryService.updateProductById(id, body);
  }

  @UseGuards(AuthTokenGuard)
  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return this.inventoryService.deleteProductById(id);
  }

  @UseGuards(AuthTokenGuard)
  @Post('warehouses')
  createWarehouse(@Body() body: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(body);
  }

  @Get('warehouses')
  listWarehouses() {
    return this.inventoryService.listWarehouses();
  }

  @Get('stock')
  getStock(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryService.getStock(productId, warehouseId);
  }

  @UseGuards(AuthTokenGuard)
  @Post('transactions/receive')
  receiveStock(
    @Body() body: StockMovementDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.inventoryService.receiveStock(body, req.user?.sub ?? null);
  }

  @UseGuards(AuthTokenGuard)
  @Post('transactions/issue')
  issueStock(@Body() body: StockMovementDto, @Req() req: AuthenticatedRequest) {
    return this.inventoryService.issueStock(body, req.user?.sub ?? null);
  }

  @Get('transactions')
  listMovements(
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventoryService.listMovements(productId, warehouseId, limit);
  }
}
